/**
 * Conflict Detector for Bidirectional Sync
 * Detects and analyzes conflicts between local and remote changes
 */

import { JiraIssue } from '../types/jira-types';
import { EventManager } from '../events/event-manager';
import { SyncConflict } from './sync-engine';

export interface ConflictInfo {
  issueKey: string;
  field: string;
  localValue: any;
  remoteValue: any;
  localTimestamp: number;
  remoteTimestamp: number;
  severity: 'low' | 'medium' | 'high';
  resolutionStrategy?: 'local' | 'remote' | 'merge';
}

export class ConflictDetector {
  private readonly TIMESTAMP_TOLERANCE = 5000; // 5 seconds tolerance for timestamp comparison
  private readonly eventManager?: EventManager;

  constructor(eventManager?: EventManager) {
    this.eventManager = eventManager;
  }

  /**
   * Detect if there's a conflict between local and remote versions
   */
  detectConflict(
    localData: any,
    remoteIssue: JiraIssue,
    localTimestamp: number,
    remoteTimestamp: number
  ): ConflictInfo | null {
    // No conflict if timestamps are close enough (likely same change)
    if (Math.abs(localTimestamp - remoteTimestamp) < this.TIMESTAMP_TOLERANCE) {
      return null;
    }

    // Check each field for differences
    const conflicts: ConflictInfo[] = [];

    // Check summary/title
    if (localData.title && remoteIssue.fields.summary) {
      if (localData.title !== remoteIssue.fields.summary) {
        conflicts.push({
          issueKey: remoteIssue.key,
          field: 'summary',
          localValue: localData.title,
          remoteValue: remoteIssue.fields.summary,
          localTimestamp,
          remoteTimestamp,
          severity: 'high',
        });
      }
    }

    // Check description
    if (
      localData.description !== undefined &&
      remoteIssue.fields.description !== undefined
    ) {
      if (
        this.normalizeText(localData.description) !==
        this.normalizeText(remoteIssue.fields.description)
      ) {
        conflicts.push({
          issueKey: remoteIssue.key,
          field: 'description',
          localValue: localData.description,
          remoteValue: remoteIssue.fields.description,
          localTimestamp,
          remoteTimestamp,
          severity: 'medium',
        });
      }
    }

    // Check status
    if (localData.status && remoteIssue.fields.status) {
      if (localData.status !== remoteIssue.fields.status.name) {
        conflicts.push({
          issueKey: remoteIssue.key,
          field: 'status',
          localValue: localData.status,
          remoteValue: remoteIssue.fields.status.name,
          localTimestamp,
          remoteTimestamp,
          severity: 'high',
        });
      }
    }

    // Check priority
    if (localData.priority && remoteIssue.fields.priority) {
      if (localData.priority !== remoteIssue.fields.priority.name) {
        conflicts.push({
          issueKey: remoteIssue.key,
          field: 'priority',
          localValue: localData.priority,
          remoteValue: remoteIssue.fields.priority.name,
          localTimestamp,
          remoteTimestamp,
          severity: 'low',
        });
      }
    }

    // Check assignee
    if (localData.assignee && remoteIssue.fields.assignee) {
      const localAssignee =
        localData.assignee === 'Unassigned' ? null : localData.assignee;
      const remoteAssignee = remoteIssue.fields.assignee?.displayName || null;

      if (localAssignee !== remoteAssignee) {
        conflicts.push({
          issueKey: remoteIssue.key,
          field: 'assignee',
          localValue: localAssignee,
          remoteValue: remoteAssignee,
          localTimestamp,
          remoteTimestamp,
          severity: 'medium',
        });
      }
    }

    // Return the most severe conflict or null if no conflicts
    if (conflicts.length === 0) {
      return null;
    }

    // Sort by severity and return the most severe
    const severityOrder = { high: 3, medium: 2, low: 1 };
    conflicts.sort(
      (a, b) => severityOrder[b.severity] - severityOrder[a.severity]
    );

    const mostSevereConflict = conflicts[0];

    // Emit conflict detected event
    this.emitConflictDetectedEvent(mostSevereConflict);

    return mostSevereConflict;
  }

  /**
   * Analyze multiple conflicts and suggest resolution strategies
   */
  analyzeConflicts(conflicts: ConflictInfo[]): {
    autoResolvable: ConflictInfo[];
    requiresManual: ConflictInfo[];
    suggestions: Map<string, string>;
  } {
    const autoResolvable: ConflictInfo[] = [];
    const requiresManual: ConflictInfo[] = [];
    const suggestions = new Map<string, string>();

    for (const conflict of conflicts) {
      const suggestion = this.suggestResolution(conflict);
      suggestions.set(`${conflict.issueKey}-${conflict.field}`, suggestion);

      // Determine if conflict can be auto-resolved
      if (this.canAutoResolve(conflict)) {
        autoResolvable.push(conflict);
      } else {
        requiresManual.push(conflict);
      }

      // Emit event for each conflict analyzed
      this.emitConflictDetectedEvent(conflict);
    }

    return {
      autoResolvable,
      requiresManual,
      suggestions,
    };
  }

  /**
   * Determine if a conflict can be automatically resolved
   */
  private canAutoResolve(conflict: ConflictInfo): boolean {
    // Low severity conflicts can often be auto-resolved
    if (conflict.severity === 'low') {
      return true;
    }

    // Some medium severity conflicts can be auto-resolved based on rules
    if (conflict.severity === 'medium') {
      // Description conflicts where one is empty
      if (conflict.field === 'description') {
        if (!conflict.localValue || !conflict.remoteValue) {
          return true;
        }
      }

      // Priority conflicts with clear precedence
      if (conflict.field === 'priority') {
        return true; // Can use timestamp to determine winner
      }
    }

    // High severity conflicts always need manual resolution
    return false;
  }

  /**
   * Suggest resolution strategy for a conflict
   */
  private suggestResolution(conflict: ConflictInfo): string {
    // Use newer timestamp as default suggestion
    const useLocal = conflict.localTimestamp > conflict.remoteTimestamp;

    switch (conflict.field) {
      case 'status':
        // Status changes are important - suggest newer but warn
        return useLocal
          ? `Use local status '${conflict.localValue}' (newer) - Verify workflow compliance`
          : `Use remote status '${conflict.remoteValue}' (newer) - Update local to match`;

      case 'description':
        // For descriptions, might want to merge
        if (conflict.localValue && conflict.remoteValue) {
          const localLength = conflict.localValue.length;
          const remoteLength = conflict.remoteValue.length;

          if (Math.abs(localLength - remoteLength) > 100) {
            return 'Consider merging both descriptions - significant differences detected';
          }
        }
        return useLocal
          ? `Use local description (${conflict.localTimestamp > conflict.remoteTimestamp ? 'newer' : 'older'})`
          : `Use remote description (${conflict.remoteTimestamp > conflict.localTimestamp ? 'newer' : 'older'})`;

      case 'assignee':
        // Assignee changes might indicate work handoff
        return `Review assignee change: ${conflict.localValue || 'Unassigned'} (local) vs ${conflict.remoteValue || 'Unassigned'} (remote)`;

      case 'priority': {
        // Priority escalation should typically win
        const priorities = ['Trivial', 'Minor', 'Major', 'Critical', 'Blocker'];
        const localPriority = priorities.indexOf(conflict.localValue);
        const remotePriority = priorities.indexOf(conflict.remoteValue);

        if (localPriority > remotePriority) {
          return `Use local priority '${conflict.localValue}' (higher severity)`;
        } else if (remotePriority > localPriority) {
          return `Use remote priority '${conflict.remoteValue}' (higher severity)`;
        }
        return useLocal
          ? `Use local priority (newer)`
          : `Use remote priority (newer)`;
      }

      default:
        return useLocal
          ? `Use local value (${conflict.localTimestamp > conflict.remoteTimestamp ? 'newer' : 'older'})`
          : `Use remote value (${conflict.remoteTimestamp > conflict.localTimestamp ? 'newer' : 'older'})`;
    }
  }

  /**
   * Merge two text values intelligently
   */
  mergeTextFields(local: string, remote: string, field: string): string {
    // If one is empty, use the other
    if (!local || local.trim() === '') return remote;
    if (!remote || remote.trim() === '') return local;

    // If they're the same after normalization, no conflict
    if (this.normalizeText(local) === this.normalizeText(remote)) {
      return local; // Prefer local formatting
    }

    // For descriptions, attempt to merge
    if (field === 'description') {
      return this.mergeDescriptions(local, remote);
    }

    // For other fields, use the longer one (likely more complete)
    return local.length > remote.length ? local : remote;
  }

  /**
   * Merge two description texts
   */
  private mergeDescriptions(local: string, remote: string): string {
    // Simple merge strategy: combine both with markers
    const merged = `${local}

--- Merged from Remote ---
${remote}`;

    return merged;
  }

  /**
   * Normalize text for comparison
   */
  private normalizeText(text: string | null | undefined): string {
    if (!text) return '';

    return text
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/[^\w\s]/g, '')
      .trim();
  }

  /**
   * Calculate conflict severity based on field importance
   */
  calculateSeverity(field: string): 'low' | 'medium' | 'high' {
    const highSeverityFields = ['summary', 'status', 'issue_type'];
    const mediumSeverityFields = ['description', 'assignee', 'sprint'];
    const lowSeverityFields = ['priority', 'labels', 'components'];

    if (highSeverityFields.includes(field)) return 'high';
    if (mediumSeverityFields.includes(field)) return 'medium';
    if (lowSeverityFields.includes(field)) return 'low';

    return 'medium'; // Default for unknown fields
  }

  /**
   * Emit conflict detected event
   */
  private async emitConflictDetectedEvent(
    conflict: ConflictInfo
  ): Promise<void> {
    if (!this.eventManager) {
      return; // No event manager configured
    }

    try {
      // Convert ConflictInfo to SyncConflict format
      const syncConflict: SyncConflict = {
        issueKey: conflict.issueKey,
        field: conflict.field,
        localValue: conflict.localValue,
        remoteValue: conflict.remoteValue,
        localTimestamp: conflict.localTimestamp,
        remoteTimestamp: conflict.remoteTimestamp,
      };

      const event = this.eventManager.createEvent('jira:conflict:detected', {
        conflict: syncConflict,
        resolution: 'pending',
        autoResolutionStrategy:
          conflict.resolutionStrategy === 'merge'
            ? undefined
            : conflict.resolutionStrategy,
      });

      await this.eventManager.emit('jira:conflict:detected', event);
    } catch (error) {
      console.error('Failed to emit conflict detected event:', error);
    }
  }
}
