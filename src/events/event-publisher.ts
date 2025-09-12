/**
 * Event Publishing System for Plugin Integration
 *
 * Provides a comprehensive event system for bidirectional sync engine
 * to communicate with other Obsidian plugins and external systems.
 *
 * Features:
 * - Type-safe event publishing and subscription
 * - Plugin integration events (Tasks, Dataview, Calendar, etc.)
 * - Performance monitoring and metrics
 * - Error handling and resilience
 * - Event history and replay capabilities
 * - Filtering and transformation support
 */

import { EventEmitter } from 'events';
import { Plugin, TFile, Vault } from 'obsidian';
import { SyncResult, SyncConflict } from '../sync/sync-engine';
import { QueuedChange } from '../sync/change-queue';
import { JiraIssue } from '../types/jira-types';
import { EventTypes } from './event-types';

export interface EventMetadata {
  timestamp: number;
  source: string;
  correlationId?: string;
  version: string;
  retryCount?: number;
}

export interface EventPayload<T = any> {
  data: T;
  metadata: EventMetadata;
}

export interface EventFilter {
  eventType?: string[];
  source?: string[];
  correlationId?: string;
  since?: number;
  until?: number;
}

export interface EventTransform<T = any, R = any> {
  (payload: EventPayload<T>): EventPayload<R> | null;
}

export interface EventSubscription {
  id: string;
  eventType: string;
  handler: (payload: EventPayload) => void | Promise<void>;
  filter?: EventFilter;
  transform?: EventTransform;
  priority: number;
  once: boolean;
  active: boolean;
}

export interface EventMetrics {
  totalEvents: number;
  eventsByType: Record<string, number>;
  eventsBySource: Record<string, number>;
  averageProcessingTime: number;
  errorRate: number;
  lastEventTime: number;
}

export class EventPublisher extends EventEmitter {
  private readonly plugin: Plugin;
  private readonly vault: Vault;
  private readonly subscriptions: Map<string, EventSubscription> = new Map();
  private eventHistory: EventPayload[] = [];
  private readonly metrics: EventMetrics;
  private readonly maxHistorySize: number = 1000;
  private correlationCounter: number = 0;

  constructor(plugin: Plugin, options: { maxHistorySize?: number } = {}) {
    super();
    this.plugin = plugin;
    this.vault = plugin.app.vault;
    this.maxHistorySize = options.maxHistorySize || 1000;

    this.metrics = {
      totalEvents: 0,
      eventsByType: {},
      eventsBySource: {},
      averageProcessingTime: 0,
      errorRate: 0,
      lastEventTime: 0,
    };

    this.setupDefaultHandlers();
  }

  /**
   * Publish an event to all subscribers
   */
  async publish<T>(
    eventType: string,
    data: T,
    options: {
      source?: string;
      correlationId?: string;
      retryCount?: number;
    } = {}
  ): Promise<void> {
    const startTime = Date.now();

    const metadata: EventMetadata = {
      timestamp: startTime,
      source: options.source || 'sync-engine',
      correlationId: options.correlationId || this.generateCorrelationId(),
      version: '1.0.0',
      retryCount: options.retryCount || 0,
    };

    const payload: EventPayload<T> = {
      data,
      metadata,
    };

    try {
      // Add to history
      this.addToHistory(payload);

      // Update metrics
      this.updateMetrics(eventType, metadata.source, startTime);

      // Get matching subscriptions
      const matchingSubscriptions = this.getMatchingSubscriptions(
        eventType,
        payload
      );

      // Process subscriptions by priority
      const sortedSubscriptions = matchingSubscriptions.sort(
        (a, b) => b.priority - a.priority
      );

      // Execute handlers
      await this.executeHandlers(sortedSubscriptions, payload);

      // Emit standard Node.js event for compatibility
      this.emit(eventType, payload);

      const duration = Date.now() - startTime;
      console.debug(
        `Event published: ${eventType} in ${duration}ms to ${sortedSubscriptions.length} subscribers`
      );
    } catch (error) {
      this.metrics.errorRate =
        (this.metrics.errorRate * this.metrics.totalEvents + 1) /
        (this.metrics.totalEvents + 1);
      console.error('Error publishing event:', error);

      // Publish error event
      await this.publishError(eventType, error, metadata);
    }
  }

  /**
   * Subscribe to events with advanced filtering and transformation
   */
  subscribe<T>(
    eventType: string,
    handler: (payload: EventPayload<T>) => void | Promise<void>,
    options: {
      filter?: EventFilter;
      transform?: EventTransform<T>;
      priority?: number;
      once?: boolean;
    } = {}
  ): string {
    const subscriptionId = this.generateSubscriptionId();

    const subscription: EventSubscription = {
      id: subscriptionId,
      eventType,
      handler: handler as (payload: EventPayload) => void | Promise<void>,
      filter: options.filter,
      transform: options.transform,
      priority: options.priority || 0,
      once: options.once || false,
      active: true,
    };

    this.subscriptions.set(subscriptionId, subscription);

    console.debug(`Subscription created: ${subscriptionId} for ${eventType}`);
    return subscriptionId;
  }

  /**
   * Unsubscribe from events
   */
  unsubscribe(subscriptionId: string): boolean {
    const result = this.subscriptions.delete(subscriptionId);
    if (result) {
      console.debug(`Subscription removed: ${subscriptionId}`);
    }
    return result;
  }

  /**
   * Pause/resume a subscription
   */
  toggleSubscription(subscriptionId: string, active: boolean): boolean {
    const subscription = this.subscriptions.get(subscriptionId);
    if (subscription) {
      subscription.active = active;
      console.debug(
        `Subscription ${subscriptionId} ${active ? 'activated' : 'paused'}`
      );
      return true;
    }
    return false;
  }

  /**
   * Get event metrics and statistics
   */
  getMetrics(): EventMetrics {
    return { ...this.metrics };
  }

  /**
   * Get event history with optional filtering
   */
  getHistory(filter?: EventFilter): EventPayload[] {
    let history = [...this.eventHistory];

    if (filter) {
      history = history.filter(event => this.matchesFilter(event, filter));
    }

    return history;
  }

  /**
   * Replay events to a specific handler
   */
  async replayEvents(
    handler: (payload: EventPayload) => void | Promise<void>,
    filter?: EventFilter
  ): Promise<void> {
    const events = this.getHistory(filter);

    console.log(`Replaying ${events.length} events`);

    for (const event of events) {
      try {
        await handler(event);
      } catch (error) {
        console.error('Error during event replay:', error);
      }
    }
  }

  /**
   * Clear event history
   */
  clearHistory(): void {
    this.eventHistory = [];
    console.debug('Event history cleared');
  }

  /**
   * Sync Engine Integration Events
   */

  async publishSyncStarted(correlationId: string): Promise<void> {
    await this.publish(
      EventTypes.SYNC_STARTED,
      {
        timestamp: Date.now(),
        correlationId,
      },
      { correlationId }
    );
  }

  async publishSyncCompleted(
    result: SyncResult,
    correlationId: string
  ): Promise<void> {
    await this.publish(
      EventTypes.SYNC_COMPLETED,
      {
        result,
        timestamp: Date.now(),
        correlationId,
      },
      { correlationId }
    );
  }

  async publishSyncFailed(error: Error, correlationId: string): Promise<void> {
    await this.publish(
      EventTypes.SYNC_FAILED,
      {
        error: {
          message: error.message,
          stack: error.stack,
          name: error.name,
        },
        timestamp: Date.now(),
        correlationId,
      },
      { correlationId }
    );
  }

  async publishIssueCreated(issue: JiraIssue, file: TFile): Promise<void> {
    await this.publish(EventTypes.ISSUE_CREATED, {
      issue,
      file: {
        path: file.path,
        name: file.name,
        basename: file.basename,
        extension: file.extension,
      },
      timestamp: Date.now(),
    });
  }

  async publishIssueUpdated(
    issue: JiraIssue,
    file: TFile,
    changes: Record<string, any>
  ): Promise<void> {
    await this.publish(EventTypes.ISSUE_UPDATED, {
      issue,
      file: {
        path: file.path,
        name: file.name,
        basename: file.basename,
        extension: file.extension,
      },
      changes,
      timestamp: Date.now(),
    });
  }

  async publishIssueDeleted(issueKey: string, file: TFile): Promise<void> {
    await this.publish(EventTypes.ISSUE_DELETED, {
      issueKey,
      file: {
        path: file.path,
        name: file.name,
        basename: file.basename,
        extension: file.extension,
      },
      timestamp: Date.now(),
    });
  }

  async publishConflictDetected(conflicts: SyncConflict[]): Promise<void> {
    await this.publish(EventTypes.CONFLICT_DETECTED, {
      conflicts,
      timestamp: Date.now(),
    });
  }

  async publishConflictResolved(
    conflict: SyncConflict,
    resolution: string
  ): Promise<void> {
    await this.publish(EventTypes.CONFLICT_RESOLVED, {
      conflict,
      resolution,
      timestamp: Date.now(),
    });
  }

  async publishChangeQueued(change: QueuedChange): Promise<void> {
    await this.publish(EventTypes.CHANGE_QUEUED, {
      change,
      timestamp: Date.now(),
    });
  }

  async publishChangeProcessed(
    change: QueuedChange,
    success: boolean
  ): Promise<void> {
    await this.publish(EventTypes.CHANGE_PROCESSED, {
      change,
      success,
      timestamp: Date.now(),
    });
  }

  /**
   * Plugin Integration Events
   */

  async publishForTasksPlugin(issues: JiraIssue[]): Promise<void> {
    const tasks = issues.map(issue => ({
      id: issue.key,
      title: issue.fields.summary,
      description: issue.fields.description,
      status: issue.fields.status?.name,
      assignee: issue.fields.assignee?.displayName,
      priority: issue.fields.priority?.name,
      dueDate: issue.fields.duedate,
      labels: issue.fields.labels || [],
      project: issue.fields.project?.key,
      issueType: issue.fields.issuetype?.name,
      created: issue.fields.created,
      updated: issue.fields.updated,
    }));

    await this.publish(EventTypes.TASKS_UPDATED, {
      tasks,
      source: 'jira-sync',
      timestamp: Date.now(),
    });
  }

  async publishForDataviewPlugin(issues: JiraIssue[]): Promise<void> {
    const dataviewData = {
      jiraIssues: issues,
      metadata: {
        lastSync: Date.now(),
        totalIssues: issues.length,
        projects: [...new Set(issues.map(i => i.fields.project?.key))],
        statuses: [...new Set(issues.map(i => i.fields.status?.name))],
        assignees: [
          ...new Set(
            issues.map(i => i.fields.assignee?.displayName).filter(Boolean)
          ),
        ],
      },
    };

    await this.publish(EventTypes.DATAVIEW_UPDATED, {
      data: dataviewData,
      timestamp: Date.now(),
    });
  }

  async publishForCalendarPlugin(issues: JiraIssue[]): Promise<void> {
    const calendarEvents = issues
      .filter(issue => issue.fields.duedate || issue.fields.created)
      .map(issue => ({
        id: issue.key,
        title: `${issue.key}: ${issue.fields.summary}`,
        date: issue.fields.duedate || issue.fields.created,
        type: issue.fields.duedate ? 'due' : 'created',
        status: issue.fields.status?.name,
        priority: issue.fields.priority?.name,
        url: `${this.plugin.settings?.jiraInstanceUrl}/browse/${issue.key}`,
      }));

    await this.publish(EventTypes.CALENDAR_UPDATED, {
      events: calendarEvents,
      timestamp: Date.now(),
    });
  }

  async publishForKanbanPlugin(issues: JiraIssue[]): Promise<void> {
    const kanbanData = {
      boards: this.groupIssuesByProject(issues),
      lanes: this.groupIssuesByStatus(issues),
      cards: issues.map(issue => ({
        id: issue.key,
        title: issue.fields.summary,
        description: issue.fields.description,
        assignee: issue.fields.assignee?.displayName,
        priority: issue.fields.priority?.name,
        labels: issue.fields.labels || [],
        status: issue.fields.status?.name,
        project: issue.fields.project?.key,
      })),
    };

    await this.publish(EventTypes.KANBAN_UPDATED, {
      data: kanbanData,
      timestamp: Date.now(),
    });
  }

  /**
   * Private Methods
   */

  private setupDefaultHandlers(): void {
    // Set up default error handling
    this.on('error', error => {
      console.error('EventPublisher error:', error);
    });

    // Set up cleanup handler
    this.plugin.register(() => {
      this.cleanup();
    });
  }

  private generateCorrelationId(): string {
    return `sync-${Date.now()}-${++this.correlationCounter}`;
  }

  private generateSubscriptionId(): string {
    return `sub-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private addToHistory(payload: EventPayload): void {
    this.eventHistory.push(payload);

    // Trim history if it exceeds max size
    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory = this.eventHistory.slice(-this.maxHistorySize);
    }
  }

  private updateMetrics(
    eventType: string,
    source: string,
    startTime: number
  ): void {
    this.metrics.totalEvents++;
    this.metrics.eventsByType[eventType] =
      (this.metrics.eventsByType[eventType] || 0) + 1;
    this.metrics.eventsBySource[source] =
      (this.metrics.eventsBySource[source] || 0) + 1;
    this.metrics.lastEventTime = startTime;

    // Update average processing time (simple moving average)
    const duration = Date.now() - startTime;
    this.metrics.averageProcessingTime =
      (this.metrics.averageProcessingTime * (this.metrics.totalEvents - 1) +
        duration) /
      this.metrics.totalEvents;
  }

  private getMatchingSubscriptions(
    eventType: string,
    payload: EventPayload
  ): EventSubscription[] {
    return Array.from(this.subscriptions.values()).filter(subscription => {
      return (
        subscription.active &&
        subscription.eventType === eventType &&
        this.matchesFilter(payload, subscription.filter)
      );
    });
  }

  private matchesFilter(payload: EventPayload, filter?: EventFilter): boolean {
    if (!filter) return true;

    if (
      filter.eventType &&
      !filter.eventType.includes(payload.metadata.source)
    ) {
      return false;
    }

    if (filter.source && !filter.source.includes(payload.metadata.source)) {
      return false;
    }

    if (
      filter.correlationId &&
      payload.metadata.correlationId !== filter.correlationId
    ) {
      return false;
    }

    if (filter.since && payload.metadata.timestamp < filter.since) {
      return false;
    }

    if (filter.until && payload.metadata.timestamp > filter.until) {
      return false;
    }

    return true;
  }

  private async executeHandlers(
    subscriptions: EventSubscription[],
    payload: EventPayload
  ): Promise<void> {
    const promises = subscriptions.map(async subscription => {
      try {
        // Apply transformation if provided
        let transformedPayload = payload;
        if (subscription.transform) {
          const transformed = subscription.transform(payload);
          if (transformed === null) return; // Skip if transform filters out
          transformedPayload = transformed;
        }

        // Execute handler
        await subscription.handler(transformedPayload);

        // Remove one-time subscriptions
        if (subscription.once) {
          this.subscriptions.delete(subscription.id);
        }
      } catch (error) {
        console.error(`Error in event handler ${subscription.id}:`, error);

        // Disable subscription if it keeps failing
        subscription.retryCount = (subscription.retryCount || 0) + 1;
        if (subscription.retryCount > 3) {
          subscription.active = false;
          console.warn(`Disabled failing subscription: ${subscription.id}`);
        }
      }
    });

    await Promise.allSettled(promises);
  }

  private async publishError(
    eventType: string,
    error: Error,
    originalMetadata: EventMetadata
  ): Promise<void> {
    try {
      await this.publish(EventTypes.EVENT_ERROR, {
        originalEventType: eventType,
        error: {
          message: error.message,
          stack: error.stack,
          name: error.name,
        },
        originalMetadata,
        timestamp: Date.now(),
      });
    } catch (publishError) {
      console.error('Failed to publish error event:', publishError);
    }
  }

  private groupIssuesByProject(
    issues: JiraIssue[]
  ): Record<string, JiraIssue[]> {
    return issues.reduce(
      (groups, issue) => {
        const project = issue.fields.project?.key || 'Unknown';
        if (!groups[project]) {
          groups[project] = [];
        }
        groups[project].push(issue);
        return groups;
      },
      {} as Record<string, JiraIssue[]>
    );
  }

  private groupIssuesByStatus(
    issues: JiraIssue[]
  ): Record<string, JiraIssue[]> {
    return issues.reduce(
      (groups, issue) => {
        const status = issue.fields.status?.name || 'Unknown';
        if (!groups[status]) {
          groups[status] = [];
        }
        groups[status].push(issue);
        return groups;
      },
      {} as Record<string, JiraIssue[]>
    );
  }

  private cleanup(): void {
    // Clear all subscriptions
    this.subscriptions.clear();

    // Clear event history
    this.eventHistory = [];

    // Remove all listeners
    this.removeAllListeners();

    console.debug('EventPublisher cleaned up');
  }
}

/**
 * Factory function to create EventPublisher instance
 */
export function createEventPublisher(
  plugin: Plugin,
  options?: { maxHistorySize?: number }
): EventPublisher {
  return new EventPublisher(plugin, options);
}

/**
 * Utility function to create strongly-typed event handlers
 */
export function createTypedHandler<T>(
  handler: (data: T, metadata: EventMetadata) => void | Promise<void>
): (payload: EventPayload<T>) => void | Promise<void> {
  return async payload => handler(payload.data, payload.metadata);
}

/**
 * Utility function to create event filters
 */
export function createEventFilter(options: {
  eventTypes?: string[];
  sources?: string[];
  correlationId?: string;
  timeRange?: { start: number; end: number };
}): EventFilter {
  return {
    eventType: options.eventTypes,
    source: options.sources,
    correlationId: options.correlationId,
    since: options.timeRange?.start,
    until: options.timeRange?.end,
  };
}

/**
 * Utility function to create event transformations
 */
export function createEventTransform<T, R>(
  transform: (data: T) => R | null
): EventTransform<T, R> {
  return payload => {
    const transformedData = transform(payload.data);
    if (transformedData === null) return null;

    return {
      data: transformedData,
      metadata: payload.metadata,
    };
  };
}
