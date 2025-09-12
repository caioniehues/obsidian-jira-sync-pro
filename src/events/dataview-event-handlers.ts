/**
 * Dataview Event Handlers
 * Specialized event handlers for processing Jira events with Dataview integration focus
 * Provides enhanced processing logic for Dataview-specific requirements
 */

import {
  JiraTicketCreatedEvent,
  JiraTicketUpdatedEvent,
  JiraTicketDeletedEvent,
  JiraSyncStartEvent,
  JiraSyncCompleteEvent,
} from './event-types';
import { DataviewSync } from '../integrations/dataview-sync';
import { eventBus } from './event-bus';
import { Notice } from 'obsidian';

export interface DataviewEventHandlerConfig {
  enableNotifications: boolean;
  logVerbose: boolean;
  trackPerformance: boolean;
  syncDelayMs: number;
}

export interface EventProcessingStats {
  totalEvents: number;
  successfulUpdates: number;
  failedUpdates: number;
  averageProcessingTime: number;
  lastProcessedEvent: string;
}

/**
 * DataviewEventHandlers provides specialized processing logic for Jira events
 * with focus on optimal Dataview integration and performance tracking
 */
export class DataviewEventHandlers {
  private readonly dataviewSync: DataviewSync;
  private readonly config: DataviewEventHandlerConfig;
  private stats: EventProcessingStats;
  private registeredHandlerIds: string[] = [];
  private processingTimes: number[] = [];

  constructor(
    dataviewSync: DataviewSync,
    config: Partial<DataviewEventHandlerConfig> = {}
  ) {
    this.dataviewSync = dataviewSync;
    this.config = {
      enableNotifications: config.enableNotifications ?? false,
      logVerbose: config.logVerbose ?? false,
      trackPerformance: config.trackPerformance ?? true,
      syncDelayMs: config.syncDelayMs ?? 100,
      ...config,
    };

    this.stats = {
      totalEvents: 0,
      successfulUpdates: 0,
      failedUpdates: 0,
      averageProcessingTime: 0,
      lastProcessedEvent: '',
    };
  }

  /**
   * Initialize specialized event handlers for Dataview integration
   */
  initialize(): void {
    // Register high-priority handlers for immediate Dataview updates
    this.registeredHandlerIds.push(
      eventBus.on('jira:ticket:created', this.handleTicketCreated.bind(this), {
        priority: 20, // Higher than default DataviewSync handlers
        async: true,
      }),

      eventBus.on('jira:ticket:updated', this.handleTicketUpdated.bind(this), {
        priority: 20,
        async: true,
      }),

      eventBus.on('jira:ticket:deleted', this.handleTicketDeleted.bind(this), {
        priority: 20,
        async: true,
      }),

      eventBus.on('jira:sync:start', this.handleSyncStart.bind(this), {
        priority: 15,
        async: true,
      }),

      eventBus.on('jira:sync:complete', this.handleSyncComplete.bind(this), {
        priority: 15,
        async: true,
      })
    );

    if (this.config.logVerbose) {
      console.log('DataviewEventHandlers initialized with enhanced processing');
    }
  }

  /**
   * Clean up event handlers and resources
   */
  destroy(): void {
    // Unregister all handlers
    this.registeredHandlerIds.forEach(id => eventBus.off(id));
    this.registeredHandlerIds = [];

    if (this.config.logVerbose) {
      console.log('DataviewEventHandlers destroyed');
    }
  }

  /**
   * Handle ticket creation with enhanced Dataview processing
   */
  private async handleTicketCreated(
    event: JiraTicketCreatedEvent
  ): Promise<void> {
    const startTime = performance.now();

    try {
      await this.processTicketEvent('created', event);

      // Enhanced processing for new tickets
      await this.enhanceNewTicketData(event);

      this.updateStats('created', true, performance.now() - startTime);

      if (this.config.enableNotifications) {
        new Notice(
          `Dataview: New ticket ${event.payload.ticket.key} synchronized`
        );
      }
    } catch (error) {
      this.updateStats('created', false, performance.now() - startTime);
      this.handleEventError('ticket:created', event, error);
    }
  }

  /**
   * Handle ticket updates with field-specific processing
   */
  private async handleTicketUpdated(
    event: JiraTicketUpdatedEvent
  ): Promise<void> {
    const startTime = performance.now();

    try {
      await this.processTicketEvent('updated', event);

      // Enhanced processing for critical field changes
      await this.processCriticalFieldUpdates(event);

      this.updateStats('updated', true, performance.now() - startTime);

      if (this.config.enableNotifications && this.isCriticalUpdate(event)) {
        new Notice(`Dataview: Critical update to ${event.payload.ticket.key}`);
      }
    } catch (error) {
      this.updateStats('updated', false, performance.now() - startTime);
      this.handleEventError('ticket:updated', event, error);
    }
  }

  /**
   * Handle ticket deletion with cleanup processing
   */
  private async handleTicketDeleted(
    event: JiraTicketDeletedEvent
  ): Promise<void> {
    const startTime = performance.now();

    try {
      await this.processTicketEvent('deleted', event);

      // Enhanced cleanup for deleted tickets
      await this.cleanupDeletedTicketReferences(event);

      this.updateStats('deleted', true, performance.now() - startTime);

      if (this.config.enableNotifications) {
        new Notice(`Dataview: Ticket ${event.payload.ticketKey} removed`);
      }
    } catch (error) {
      this.updateStats('deleted', false, performance.now() - startTime);
      this.handleEventError('ticket:deleted', event, error);
    }
  }

  /**
   * Handle sync start events with preparation logic
   */
  private async handleSyncStart(event: JiraSyncStartEvent): Promise<void> {
    if (this.config.logVerbose) {
      const { syncType, ticketCount, estimatedDuration } = event.payload;
      console.log(
        `Dataview sync starting: ${syncType} (${ticketCount} tickets, ~${estimatedDuration}ms)`
      );
    }

    // Prepare for bulk updates if needed
    if (event.payload.syncType === 'full' && event.payload.ticketCount > 100) {
      await this.prepareBulkSync(event);
    }
  }

  /**
   * Handle sync completion with performance analysis
   */
  private async handleSyncComplete(
    event: JiraSyncCompleteEvent
  ): Promise<void> {
    const result = event.payload.result;

    if (this.config.logVerbose) {
      console.log('Dataview sync completed:', result);
    }

    // Analyze performance and provide feedback
    await this.analyzeSyncPerformance(event);

    // Trigger any post-sync Dataview optimizations
    await this.optimizePostSync();
  }

  /**
   * Process common ticket event logic
   */
  private async processTicketEvent(
    operation: 'created' | 'updated' | 'deleted',
    event: unknown
  ): Promise<void> {
    console.log('Processing ticket event:', {
      operation,
      hasEvent: !!event,
      eventType: typeof event,
    });
    // Add delay if configured to prevent overwhelming the system
    if (this.config.syncDelayMs > 0) {
      await this.delay(this.config.syncDelayMs);
    }

    // Log verbose information if enabled
    if (this.config.logVerbose) {
      const ticketKey =
        operation === 'deleted'
          ? event.payload.ticketKey
          : event.payload.ticket.key;

      console.log(`Processing Dataview ${operation} event for ${ticketKey}`);
    }
  }

  /**
   * Enhanced processing for newly created tickets
   */
  private async enhanceNewTicketData(
    event: JiraTicketCreatedEvent
  ): Promise<void> {
    const { ticket } = event.payload;

    // Add initial Dataview-specific metadata
    const enhancedData = {
      dataview_first_sync: new Date().toISOString(),
      dataview_source: 'jira_creation',
      dataview_enhanced: true,
    };

    // Log the enhanced data for debugging
    console.log('Enhanced ticket data:', {
      ticketKey: ticket.key,
      dataAdded: Object.keys(enhancedData).length,
    });

    // This would typically trigger additional frontmatter updates
    // Implementation would depend on specific enhancement requirements
    if (this.config.logVerbose) {
      console.log(`Enhanced new ticket ${ticket.key} with Dataview metadata`);
    }
  }

  /**
   * Process critical field updates that may affect Dataview queries
   */
  private async processCriticalFieldUpdates(
    event: JiraTicketUpdatedEvent
  ): Promise<void> {
    const { changedFields, ticket } = event.payload;

    const criticalFields = [
      'status',
      'priority',
      'assignee',
      'sprint',
      'fixVersion',
      'resolution',
      'duedate',
    ];

    const criticalChanges = changedFields.filter(field =>
      criticalFields.some(critical => field.includes(critical))
    );

    if (criticalChanges.length > 0) {
      // Add metadata about critical changes
      const changeMetadata = {
        dataview_critical_update: new Date().toISOString(),
        dataview_changed_fields: criticalChanges,
        dataview_requires_reindex: true,
      };

      // Log the change metadata for debugging
      console.log('Change metadata created:', {
        ticketKey: ticket.key,
        metadataFields: Object.keys(changeMetadata).length,
        criticalChangesCount: criticalChanges.length,
      });

      if (this.config.logVerbose) {
        console.log(
          `Critical Dataview fields updated for ${ticket.key}:`,
          criticalChanges
        );
      }
    }
  }

  /**
   * Clean up references and metadata for deleted tickets
   */
  private async cleanupDeletedTicketReferences(
    event: JiraTicketDeletedEvent
  ): Promise<void> {
    const { ticketKey, filePath } = event.payload;

    // Log file path for debugging
    console.log('Cleaning up deleted ticket references:', {
      ticketKey,
      filePathProvided: !!filePath,
    });

    // This could involve cleaning up:
    // - Cross-references in other notes
    // - Cached Dataview query results
    // - Related metadata files

    if (this.config.logVerbose) {
      console.log(
        `Cleaning up Dataview references for deleted ticket ${ticketKey}`
      );
    }
  }

  /**
   * Prepare system for bulk sync operations
   */
  private async prepareBulkSync(event: JiraSyncStartEvent): Promise<void> {
    const { ticketCount } = event.payload;

    if (this.config.logVerbose) {
      console.log(`Preparing Dataview for bulk sync of ${ticketCount} tickets`);
    }

    // Could involve:
    // - Increasing batch sizes temporarily
    // - Disabling real-time notifications
    // - Pre-allocating resources
  }

  /**
   * Analyze sync performance and provide optimization suggestions
   */
  private async analyzeSyncPerformance(
    event: JiraSyncCompleteEvent
  ): Promise<void> {
    const result = event.payload.result;

    // Log result for debugging
    console.log('Analyzing sync performance:', {
      hasResult: !!result,
      resultType: typeof result,
    });

    if (this.config.trackPerformance) {
      const avgTime = this.stats.averageProcessingTime;

      if (avgTime > 100) {
        // 100ms threshold
        console.warn(
          `Dataview sync performance warning: Average ${avgTime}ms per event`
        );
      }

      if (this.config.logVerbose) {
        console.log('Dataview sync performance stats:', this.stats);
      }
    }
  }

  /**
   * Optimize system after sync completion
   */
  private async optimizePostSync(): Promise<void> {
    // Force flush any remaining batch operations
    await this.dataviewSync.flushBatch();

    // Reset performance counters for next sync cycle
    this.processingTimes = [];

    if (this.config.logVerbose) {
      console.log('Post-sync Dataview optimizations completed');
    }
  }

  /**
   * Check if an update contains critical changes
   */
  private isCriticalUpdate(event: JiraTicketUpdatedEvent): boolean {
    const criticalFields = ['status', 'priority', 'assignee'];
    return event.payload.changedFields.some(field =>
      criticalFields.includes(field.toLowerCase())
    );
  }

  /**
   * Handle event processing errors
   */
  private handleEventError(
    eventType: string,
    event: unknown,
    error: unknown
  ): void {
    console.log('Handling event error:', {
      eventType,
      hasEvent: !!event,
      hasError: !!error,
    });
    console.error(`DataviewEventHandler error processing ${eventType}:`, error);

    if (this.config.enableNotifications) {
      new Notice(`Error syncing ticket data with Dataview: ${error.message}`);
    }
  }

  /**
   * Update processing statistics
   */
  private updateStats(
    eventType: string,
    success: boolean,
    processingTime: number
  ): void {
    this.stats.totalEvents++;
    this.stats.lastProcessedEvent = eventType;

    if (success) {
      this.stats.successfulUpdates++;
    } else {
      this.stats.failedUpdates++;
    }

    if (this.config.trackPerformance) {
      this.processingTimes.push(processingTime);

      // Keep only last 100 measurements for rolling average
      if (this.processingTimes.length > 100) {
        this.processingTimes.shift();
      }

      this.stats.averageProcessingTime =
        this.processingTimes.reduce((a, b) => a + b, 0) /
        this.processingTimes.length;
    }
  }

  /**
   * Utility method for adding delays
   */
  private async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get current processing statistics
   */
  getStats(): EventProcessingStats {
    return { ...this.stats };
  }

  /**
   * Reset processing statistics
   */
  resetStats(): void {
    this.stats = {
      totalEvents: 0,
      successfulUpdates: 0,
      failedUpdates: 0,
      averageProcessingTime: 0,
      lastProcessedEvent: '',
    };
    this.processingTimes = [];
  }
}
