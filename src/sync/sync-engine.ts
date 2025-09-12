/**
 * Bidirectional Sync Engine for Jira Plugin Bridge
 * Extends existing sync capabilities with write-back and conflict detection
 */

import { Notice, Plugin, TFile, TFolder, Vault } from 'obsidian';
import {
  JiraIssue,
  JiraUpdateIssueRequest,
  JiraApiResponse,
} from '../types/jira-types';
import { ChangeQueue } from './change-queue';
import { ConflictDetector } from './conflict-detector';
import { JiraApiClient } from './jira-api-client';
import { RateLimiter } from './rate-limiter';
import { EventManager, eventManager } from '../events/event-manager';
import { EventTypeMap } from '../events/event-types';
import { ErrorHandler, ErrorHandlerConfig } from '../errors/error-handler';
import {
  NetworkError,
  ApiError,
  SyncError,
  FileSystemError,
  ConflictError,
  ErrorCategory,
  ErrorContext,
  wrapError,
} from '../errors/error-types';

export interface SyncEngineConfig {
  jiraUrl: string;
  apiToken: string;
  userEmail: string;
  syncInterval: number;
  outputPath: string;
  jqlQuery: string;
  enableBidirectional: boolean;
  conflictResolution: 'local' | 'remote' | 'manual';
  batchSize: number;
  retryAttempts: number;
  // Status-based organization
  enableStatusOrganization?: boolean;
  activeTicketsFolder?: string;
  archivedTicketsFolder?: string;
  archiveByYear?: boolean;
  keepRecentArchive?: boolean;
  recentArchiveDays?: number;
  statusMapping?: {
    active: string[];
    archived: string[];
    ignore?: string[];
  };
  preserveProjectFolders?: boolean;
}

export interface SyncResult {
  success: boolean;
  syncedCount: number;
  failedCount: number;
  conflicts: SyncConflict[];
  errors: string[];
  duration: number;
}

export interface SyncConflict {
  issueKey: string;
  field: string;
  localValue: any;
  remoteValue: any;
  localTimestamp: number;
  remoteTimestamp: number;
}

export class BidirectionalSyncEngine {
  private config: SyncEngineConfig;
  private plugin: Plugin;
  private vault: Vault;
  private apiClient: JiraApiClient;
  private changeQueue: ChangeQueue;
  private conflictDetector: ConflictDetector;
  private rateLimiter: RateLimiter;
  private eventManager: EventManager;
  private errorHandler: ErrorHandler;
  private isRunning: boolean = false;
  private lastSyncTime: number = 0;
  private fileWatcher: Map<string, number> = new Map();

  constructor(
    plugin: Plugin,
    config: SyncEngineConfig,
    eventManagerInstance?: EventManager
  ) {
    this.plugin = plugin;
    this.vault = plugin.app.vault;
    this.config = config;
    this.eventManager = eventManagerInstance || eventManager;
    this.apiClient = new JiraApiClient(config);
    this.changeQueue = new ChangeQueue(plugin, this.eventManager);
    this.conflictDetector = new ConflictDetector(this.eventManager);
    this.rateLimiter = new RateLimiter(100, 60000); // 100 requests per minute

    // Initialize error handler
    const errorConfig: ErrorHandlerConfig = {
      logLevel: 'warn',
      enableNotifications: true,
      enableRetries: true,
      maxRetryAttempts: config.retryAttempts || 3,
      enableErrorReporting: false,
    };
    this.errorHandler = new ErrorHandler(plugin, errorConfig);
  }

  /**
   * Set the event manager for publishing sync events
   */
  setEventManager(eventManager: EventManager): void {
    this.eventManager = eventManager;
  }

  /**
   * Initialize the sync engine and set up file watchers
   */
  async initialize(): Promise<void> {
    try {
      // Load persisted queue from disk
      await this.changeQueue.load();

      // Set up file modification watchers if bidirectional is enabled
      if (this.config.enableBidirectional) {
        this.setupFileWatchers();
      }

      // Process any pending changes from previous session
      if (this.changeQueue.hasPendingChanges()) {
        await this.processPendingChanges();
      }
    } catch (error) {
      const syncError = wrapError(error, ErrorCategory.SYNC, {
        operation: 'initialize',
        syncDirection: 'bidirectional',
      });
      await this.errorHandler.handleError(syncError);
      throw syncError;
    }
  }

  /**
   * Main sync method - performs bidirectional synchronization
   */
  async sync(): Promise<SyncResult> {
    if (this.isRunning) {
      return {
        success: false,
        syncedCount: 0,
        failedCount: 0,
        conflicts: [],
        errors: ['Sync already in progress'],
        duration: 0,
      };
    }

    const startTime = Date.now();
    this.isRunning = true;
    const result: SyncResult = {
      success: true,
      syncedCount: 0,
      failedCount: 0,
      conflicts: [],
      errors: [],
      duration: 0,
    };

    // Publish sync start event
    const syncType = this.determineSyncType();
    await this.publishSyncStartEvent(syncType);

    try {
      // Phase 1: Pull changes from Jira
      const pullResult = await this.pullFromJira();
      result.syncedCount += pullResult.syncedCount;
      result.conflicts.push(...pullResult.conflicts);

      // Phase 2: Push local changes to Jira (if bidirectional)
      if (this.config.enableBidirectional) {
        const pushResult = await this.pushToJira();
        result.syncedCount += pushResult.syncedCount;
        result.failedCount += pushResult.failedCount;
        result.errors.push(...pushResult.errors);
      }

      // Phase 3: Process any conflicts
      if (result.conflicts.length > 0) {
        await this.handleConflicts(result.conflicts);
      }

      this.lastSyncTime = Date.now();
    } catch (error) {
      result.success = false;

      const syncError = wrapError(error, ErrorCategory.SYNC, {
        operation: 'sync',
        syncDirection: this.config.enableBidirectional
          ? 'bidirectional'
          : 'pull',
      });

      // Handle error with recovery
      const recovered = await this.errorHandler.handleError(syncError);
      if (!recovered) {
        result.errors.push(syncError.userMessage);
      }
    } finally {
      this.isRunning = false;
      result.duration = Date.now() - startTime;

      // Publish sync complete event
      await this.publishSyncCompleteEvent(result, syncType);
    }

    return result;
  }

  /**
   * Pull changes from Jira and update local files
   */
  private async pullFromJira(): Promise<Partial<SyncResult>> {
    const result: Partial<SyncResult> = {
      syncedCount: 0,
      conflicts: [],
    };

    try {
      // Fetch issues from Jira
      const issues = await this.apiClient.searchIssues(this.config.jqlQuery);

      for (const issue of issues) {
        try {
          const filePath = this.getFilePathForIssue(issue);
          const file = this.vault.getAbstractFileByPath(filePath);

          if (file instanceof TFile) {
            // Check for conflicts
            const localContent = await this.vault.read(file);
            const localMeta = this.extractMetadata(localContent);

            if (localMeta.updated && issue.fields.updated) {
              const conflict = this.conflictDetector.detectConflict(
                localMeta,
                issue,
                new Date(localMeta.updated).getTime(),
                new Date(issue.fields.updated).getTime()
              );

              if (conflict) {
                const conflictError = new ConflictError(
                  'Sync conflict detected',
                  {
                    issueKey: issue.key,
                    operation: 'pullFromJira',
                    metadata: { field: conflict.field },
                  }
                );

                // Handle conflict through error system
                await this.errorHandler.handleError(conflictError);
                result.conflicts!.push(conflict);
                continue;
              }
            }
          }

          // Update or create file
          await this.updateLocalFile(issue);
          result.syncedCount!++;
        } catch (issueError) {
          const context: ErrorContext = {
            issueKey: issue.key,
            operation: 'pullSingleIssue',
            syncDirection: 'pull',
          };

          const wrappedError = wrapError(
            issueError,
            ErrorCategory.SYNC,
            context
          );
          await this.errorHandler.handleError(wrappedError);
          // Continue with other issues
        }
      }
    } catch (error) {
      const networkError = wrapError(error, ErrorCategory.NETWORK, {
        operation: 'searchIssues',
        syncDirection: 'pull',
        metadata: { jqlQuery: this.config.jqlQuery },
      });

      await this.errorHandler.handleError(networkError);
      throw networkError;
    }

    return result;
  }

  /**
   * Push local changes to Jira
   */
  private async pushToJira(): Promise<Partial<SyncResult>> {
    const result: Partial<SyncResult> = {
      syncedCount: 0,
      failedCount: 0,
      errors: [],
    };

    // Get pending changes from queue
    const pendingChanges = this.changeQueue.getPendingChanges();

    // Batch process changes
    const batches = this.createBatches(pendingChanges, this.config.batchSize);

    for (const batch of batches) {
      // Check rate limit
      await this.rateLimiter.waitIfNeeded();

      try {
        const promises = batch.map(change => this.pushSingleChange(change));

        const results = await Promise.allSettled(promises);

        for (const [index, promiseResult] of results.entries()) {
          if (promiseResult.status === 'fulfilled') {
            result.syncedCount!++;
            this.changeQueue.markAsProcessed(batch[index].id);
          } else {
            result.failedCount!++;
            result.errors!.push(promiseResult.reason.message);
            await this.changeQueue.incrementRetryCount(batch[index].id);
          }
        }
      } catch (error) {
        result.errors!.push(error.message);
      }
    }

    // Persist queue state
    await this.changeQueue.save();

    return result;
  }

  /**
   * Push a single change to Jira
   */
  private async pushSingleChange(change: any): Promise<void> {
    const updateRequest: JiraUpdateIssueRequest = {
      fields: change.fields,
    };

    const response = await this.apiClient.updateIssue(
      change.issueKey,
      updateRequest
    );

    if (!response.success) {
      throw new Error(`Failed to update ${change.issueKey}: ${response.error}`);
    }
  }

  /**
   * Set up file watchers for detecting local changes
   */
  private setupFileWatchers(): void {
    // Watch for file modifications
    this.plugin.registerEvent(
      this.vault.on('modify', async (file: TFile) => {
        if (this.isJiraFile(file)) {
          await this.handleFileChange(file);
        }
      })
    );

    // Watch for file renames
    this.plugin.registerEvent(
      this.vault.on('rename', async (file: TFile, oldPath: string) => {
        if (this.isJiraFile(file)) {
          await this.handleFileRename(file, oldPath);
        }
      })
    );

    // Watch for file deletions
    this.plugin.registerEvent(
      this.vault.on('delete', async (file: TFile) => {
        if (this.isJiraFile(file)) {
          await this.handleFileDelete(file);
        }
      })
    );
  }

  /**
   * Handle local file changes
   */
  private async handleFileChange(file: TFile): Promise<void> {
    const lastModified = file.stat.mtime;
    const lastKnown = this.fileWatcher.get(file.path);

    // Debounce rapid changes
    if (lastKnown && lastModified - lastKnown < 1000) {
      return;
    }

    this.fileWatcher.set(file.path, lastModified);

    try {
      const content = await this.vault.read(file);
      const metadata = this.extractMetadata(content);

      if (metadata.jiraKey) {
        const change = {
          id: `${metadata.jiraKey}-${Date.now()}`,
          issueKey: metadata.jiraKey,
          fields: this.mapMetadataToJiraFields(metadata),
          timestamp: lastModified,
          retryCount: 0,
        };

        await this.changeQueue.addChange(change);

        // If not currently syncing, trigger a push
        if (!this.isRunning) {
          await this.pushToJira();
        }
      }
    } catch (error) {
      console.error('Error handling file change:', error);
    }
  }

  /**
   * Handle file rename
   */
  private async handleFileRename(file: TFile, oldPath: string): Promise<void> {
    // Update internal tracking
    const lastModified = this.fileWatcher.get(oldPath);
    if (lastModified) {
      this.fileWatcher.delete(oldPath);
      this.fileWatcher.set(file.path, lastModified);
    }
  }

  /**
   * Handle file deletion
   */
  private async handleFileDelete(file: TFile): Promise<void> {
    // Remove from tracking
    this.fileWatcher.delete(file.path);
    // Note: We don't delete from Jira - this is a safety measure
    // User must explicitly delete from Jira if needed
  }

  /**
   * Process pending changes from queue
   */
  private async processPendingChanges(): Promise<void> {
    const pendingChanges = this.changeQueue.getPendingChanges();

    if (pendingChanges.length > 0) {
      new Notice(`Processing ${pendingChanges.length} pending changes...`);
      await this.pushToJira();
    }
  }

  /**
   * Helper methods
   */

  private isJiraFile(file: TFile): boolean {
    return file.path.startsWith(this.config.outputPath);
  }

  private getFilePathForIssue(issue: JiraIssue): string {
    const targetFolder = this.determineTargetFolder(issue);
    if (!targetFolder) {
      // Issue should be ignored
      return '';
    }
    return `${targetFolder}/${issue.key}.md`;
  }

  private determineTargetFolder(issue: JiraIssue): string | null {
    const project = issue.key.split('-')[0];
    const status = issue.fields.status?.name || 'Unknown';
    
    // Check if status-based organization is disabled
    if (!this.config.enableStatusOrganization) {
      if (this.config.preserveProjectFolders) {
        return `${this.config.outputPath}/${project}`;
      }
      return this.config.outputPath;
    }
    
    // Check if status should be ignored
    if (this.config.statusMapping?.ignore?.includes(status)) {
      return null; // Skip this ticket
    }
    
    // Determine if ticket is active or archived
    const isArchived = this.config.statusMapping?.archived?.includes(status) || false;
    
    if (isArchived) {
      return this.buildArchivePath(issue);
    } else {
      // Active ticket
      const activeFolder = this.config.activeTicketsFolder || 'Active Tickets';
      const basePath = `${this.config.outputPath}/${activeFolder}`;
      
      if (this.config.preserveProjectFolders) {
        return `${basePath}/${project}`;
      }
      return basePath;
    }
  }

  private buildArchivePath(issue: JiraIssue): string {
    const project = issue.key.split('-')[0];
    const archiveFolder = this.config.archivedTicketsFolder || 'Archived Tickets';
    const basePath = `${this.config.outputPath}/${archiveFolder}`;
    
    // Check if recently resolved (for _Recent folder)
    const resolvedDate = issue.fields.resolutiondate;
    if (this.config.keepRecentArchive && resolvedDate) {
      const daysSinceResolved = this.daysSinceDate(resolvedDate);
      const recentDays = this.config.recentArchiveDays || 30;
      
      if (daysSinceResolved <= recentDays) {
        const recentPath = `${basePath}/_Recent`;
        if (this.config.preserveProjectFolders) {
          return `${recentPath}/${project}`;
        }
        return recentPath;
      }
    }
    
    // Archive by year if enabled
    if (this.config.archiveByYear && resolvedDate) {
      const year = new Date(resolvedDate).getFullYear();
      const yearPath = `${basePath}/${year}`;
      
      if (this.config.preserveProjectFolders) {
        return `${yearPath}/${project}`;
      }
      return yearPath;
    }
    
    // Default archive location
    if (this.config.preserveProjectFolders) {
      return `${basePath}/${project}`;
    }
    return basePath;
  }

  private daysSinceDate(dateString: string): number {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    return Math.floor(diffMs / (1000 * 60 * 60 * 24));
  }

  private formatIssueAsMarkdown(issue: JiraIssue): string {
    // Format issue as markdown with frontmatter
    const frontmatter = `---
jiraKey: ${issue.key}
title: ${issue.fields.summary}
status: ${issue.fields.status?.name}
assignee: ${issue.fields.assignee?.displayName || 'Unassigned'}
priority: ${issue.fields.priority?.name}
updated: ${issue.fields.updated}
created: ${issue.fields.created}
---

# ${issue.key}: ${issue.fields.summary}

## Description
${issue.fields.description || 'No description'}

## Status
${issue.fields.status?.name}

## Assignee
${issue.fields.assignee?.displayName || 'Unassigned'}

## Priority
${issue.fields.priority?.name}
`;
    return frontmatter;
  }

  private extractMetadata(content: string): any {
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (!frontmatterMatch) return {};

    const metadata: any = {};
    const lines = frontmatterMatch[1].split('\n');

    for (const line of lines) {
      const [key, ...valueParts] = line.split(':');
      if (key && valueParts.length > 0) {
        metadata[key.trim()] = valueParts.join(':').trim();
      }
    }

    return metadata;
  }

  private mapMetadataToJiraFields(metadata: any): any {
    const fields: any = {};

    if (metadata.title) fields.summary = metadata.title;
    if (metadata.description) fields.description = metadata.description;
    if (metadata.priority) {
      fields.priority = { name: metadata.priority };
    }

    return fields;
  }

  private createBatches<T>(items: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    return batches;
  }

  private async forceLocalVersion(conflict: SyncConflict): Promise<void> {
    // Push local version to Jira
    const change = {
      id: `conflict-${conflict.issueKey}-${Date.now()}`,
      issueKey: conflict.issueKey,
      fields: { [conflict.field]: conflict.localValue },
      timestamp: Date.now(),
      retryCount: 0,
    };

    await this.changeQueue.addChange(change);
  }

  private async forceRemoteVersion(conflict: SyncConflict): Promise<void> {
    // Update local file with remote version
    const issue = await this.apiClient.getIssue(conflict.issueKey);
    await this.updateLocalFile(issue);
  }

  private async queueForManualResolution(
    conflict: SyncConflict
  ): Promise<void> {
    // Store conflict for user resolution
    new Notice(
      `Conflict detected in ${conflict.issueKey} - Manual resolution required`
    );
    // This will be handled by the conflict resolution UI (Task #30)
  }

  /**
   * Cleanup and shutdown
   */
  async shutdown(): Promise<void> {
    // Save pending changes
    await this.changeQueue.save();

    // Clear watchers
    this.fileWatcher.clear();

    // Cancel any running sync
    this.isRunning = false;
  }

  /**
   * Helper methods for event publishing
   */

  private async publishSyncStartEvent(
    syncType: 'full' | 'incremental' | 'push-only'
  ): Promise<void> {
    try {
      const event = this.eventManager.createEvent('jira:sync:start', {
        syncType,
        estimatedDuration: this.estimateSyncDuration(),
        ticketCount: undefined, // Will be determined during sync
      });
      await this.eventManager.emit('jira:sync:start', event);
    } catch (error) {
      console.error('Failed to publish sync start event:', error);
    }
  }

  private async publishSyncCompleteEvent(
    result: SyncResult,
    syncType: 'full' | 'incremental' | 'push-only'
  ): Promise<void> {
    try {
      const event = this.eventManager.createEvent('jira:sync:complete', {
        result,
        syncType,
      });
      await this.eventManager.emit('jira:sync:complete', event);
    } catch (error) {
      console.error('Failed to publish sync complete event:', error);
    }
  }

  private async publishTicketCreatedEvent(
    ticket: JiraIssue,
    filePath: string,
    source: 'jira' | 'local'
  ): Promise<void> {
    try {
      const event = this.eventManager.createEvent('jira:ticket:created', {
        ticket,
        filePath,
        source,
      });
      await this.eventManager.emit('jira:ticket:created', event);
    } catch (error) {
      console.error('Failed to publish ticket created event:', error);
    }
  }

  private async publishTicketUpdatedEvent(
    ticket: JiraIssue,
    filePath: string,
    previousData: Partial<JiraIssue>,
    changedFields: string[],
    source: 'jira' | 'local'
  ): Promise<void> {
    try {
      const event = this.eventManager.createEvent('jira:ticket:updated', {
        ticket,
        filePath,
        previousData,
        changedFields,
        source,
      });
      await this.eventManager.emit('jira:ticket:updated', event);
    } catch (error) {
      console.error('Failed to publish ticket updated event:', error);
    }
  }

  private async publishTicketDeletedEvent(
    ticketKey: string,
    filePath: string,
    lastKnownData: JiraIssue,
    source: 'jira' | 'local'
  ): Promise<void> {
    try {
      const event = this.eventManager.createEvent('jira:ticket:deleted', {
        ticketKey,
        filePath,
        lastKnownData,
        source,
      });
      await this.eventManager.emit('jira:ticket:deleted', event);
    } catch (error) {
      console.error('Failed to publish ticket deleted event:', error);
    }
  }

  private async publishConflictDetectedEvent(
    conflict: SyncConflict,
    resolution: 'pending' | 'auto-resolved',
    autoResolutionStrategy?: 'local' | 'remote'
  ): Promise<void> {
    try {
      const event = this.eventManager.createEvent('jira:conflict:detected', {
        conflict,
        resolution,
        autoResolutionStrategy,
      });
      await this.eventManager.emit('jira:conflict:detected', event);
    } catch (error) {
      console.error('Failed to publish conflict detected event:', error);
    }
  }

  private determineSyncType(): 'full' | 'incremental' | 'push-only' {
    const timeSinceLastSync = Date.now() - this.lastSyncTime;
    const FULL_SYNC_THRESHOLD = 24 * 60 * 60 * 1000; // 24 hours

    if (this.lastSyncTime === 0 || timeSinceLastSync > FULL_SYNC_THRESHOLD) {
      return 'full';
    }

    if (!this.config.enableBidirectional) {
      return 'incremental';
    }

    return this.changeQueue.hasPendingChanges() ? 'incremental' : 'incremental';
  }

  private estimateSyncDuration(): number {
    // Estimate based on historical data and queue size
    const baseTime = 5000; // 5 seconds base time
    const pendingChanges = this.changeQueue.getPendingChanges().length;
    const timePerChange = 500; // 500ms per change

    return baseTime + pendingChanges * timePerChange;
  }

  /**
   * Enhanced file update with event publishing and ticket movement
   */
  private async updateLocalFile(
    issue: JiraIssue,
    isNew: boolean = false
  ): Promise<void> {
    const targetFilePath = this.getFilePathForIssue(issue);
    
    // Skip if issue should be ignored
    if (!targetFilePath) {
      console.log(`Skipping ignored issue: ${issue.key} with status: ${issue.fields.status?.name}`);
      return;
    }
    
    const content = this.formatIssueAsMarkdown(issue);

    // Find existing file (might be in different location due to status change)
    const existingFile = await this.findExistingTicket(issue.key);
    let previousData: Partial<JiraIssue> = {};
    let needsMove = false;

    if (existingFile instanceof TFile && !isNew) {
      try {
        const existingContent = await this.vault.read(existingFile);
        const existingMetadata = this.extractMetadata(existingContent);
        previousData = { fields: existingMetadata };
        
        // Check if file needs to be moved to new location
        if (existingFile.path !== targetFilePath) {
          needsMove = true;
          await this.moveTicket(existingFile.path, targetFilePath, content);
        } else {
          await this.vault.modify(existingFile, content);
        }
      } catch (error) {
        console.error(`Error updating file ${targetFilePath}:`, error);
        return;
      }
    } else {
      // Create parent folders if needed
      const folder = targetFilePath.substring(0, targetFilePath.lastIndexOf('/'));
      if (!this.vault.getAbstractFileByPath(folder)) {
        await this.vault.createFolder(folder);
      }
      await this.vault.create(targetFilePath, content);
    }

    // Publish appropriate event
    if (isNew) {
      await this.publishTicketCreatedEvent(issue, targetFilePath, 'jira');
    } else {
      const changedFields = this.detectChangedFields(previousData, issue);
      await this.publishTicketUpdatedEvent(
        issue,
        targetFilePath,
        previousData,
        changedFields,
        'jira'
      );
    }
  }

  /**
   * Find existing ticket file by key, searching all possible locations
   */
  private async findExistingTicket(issueKey: string): Promise<TFile | null> {
    // Search in all possible locations
    const possiblePaths = [
      // Active locations
      `${this.config.outputPath}/${this.config.activeTicketsFolder || 'Active Tickets'}`,
      // Archive locations
      `${this.config.outputPath}/${this.config.archivedTicketsFolder || 'Archived Tickets'}`,
      // Legacy location (before status organization)
      this.config.outputPath
    ];
    
    for (const basePath of possiblePaths) {
      const files = this.vault.getFiles();
      for (const file of files) {
        if (file.path.includes(basePath) && file.name === `${issueKey}.md`) {
          return file;
        }
      }
    }
    
    return null;
  }

  /**
   * Move ticket file to new location (e.g., from active to archived)
   */
  private async moveTicket(
    oldPath: string,
    newPath: string,
    content: string
  ): Promise<void> {
    try {
      // Ensure target folder exists
      const targetFolder = newPath.substring(0, newPath.lastIndexOf('/'));
      if (!this.vault.getAbstractFileByPath(targetFolder)) {
        await this.vault.createFolder(targetFolder);
      }
      
      // Create new file with updated content
      await this.vault.create(newPath, content);
      
      // Delete old file
      const oldFile = this.vault.getAbstractFileByPath(oldPath);
      if (oldFile) {
        await this.vault.delete(oldFile);
      }
      
      // Log the move
      const issueKey = oldPath.substring(oldPath.lastIndexOf('/') + 1, oldPath.length - 3);
      const oldStatus = this.extractStatusFromPath(oldPath);
      const newStatus = this.extractStatusFromPath(newPath);
      
      console.log(`Moved ticket ${issueKey}: ${oldStatus} → ${newStatus}`);
      new Notice(`Moved ${issueKey} to ${newStatus}`);
    } catch (error) {
      console.error(`Error moving ticket from ${oldPath} to ${newPath}:`, error);
      throw error;
    }
  }

  /**
   * Extract status category from file path (Active/Archived/etc)
   */
  private extractStatusFromPath(path: string): string {
    if (path.includes('Active Tickets')) {
      return 'Active';
    } else if (path.includes('Archived Tickets')) {
      if (path.includes('_Recent')) {
        return 'Recently Archived';
      }
      return 'Archived';
    }
    return 'Unknown';
  }

  private detectChangedFields(
    previousData: Partial<JiraIssue>,
    currentIssue: JiraIssue
  ): string[] {
    const changedFields: string[] = [];

    if (!previousData.fields) return ['all'];

    const fieldsToCheck = [
      'summary',
      'status',
      'assignee',
      'priority',
      'description',
    ];

    for (const field of fieldsToCheck) {
      const oldValue = JSON.stringify(previousData.fields[field]);
      const newValue = JSON.stringify(currentIssue.fields[field]);

      if (oldValue !== newValue) {
        changedFields.push(field);
      }
    }

    return changedFields;
  }

  /**
   * Enhanced conflict handling with event publishing
   */
  private async handleConflicts(conflicts: SyncConflict[]): Promise<void> {
    for (const conflict of conflicts) {
      // Publish conflict detected event
      const autoResolutionStrategy =
        this.config.conflictResolution === 'manual'
          ? undefined
          : this.config.conflictResolution;
      await this.publishConflictDetectedEvent(
        conflict,
        'pending',
        autoResolutionStrategy
      );

      switch (this.config.conflictResolution) {
        case 'local':
          // Keep local version
          await this.forceLocalVersion(conflict);
          break;
        case 'remote':
          // Keep remote version
          await this.forceRemoteVersion(conflict);
          break;
        case 'manual':
          // Queue for manual resolution
          await this.queueForManualResolution(conflict);
          break;
      }
    }
  }
}
