import { Plugin, Notice, TFile, normalizePath } from 'obsidian';
import { JQLQueryEngine, JiraIssue } from '../enhanced-sync/jql-query-engine';
import { 
  BulkImportProgress, 
  SyncPhase, 
  SyncError,
  BULK_IMPORT_DEFAULTS
} from '../models/bulk-import-progress';
import { SimpleNoteService } from '../services/simple-note-service';

/**
 * Options for bulk import operation
 */
export interface BulkImportOptions {
  jqlQuery: string;
  batchSize?: number;
  skipExisting?: boolean;
  organizeByProject?: boolean;
  enableResume?: boolean;
  onProgress?: (progress: BulkImportProgress) => void;
  onError?: (ticketKey: string, error: string, category: string) => void;
  onBatchComplete?: (batchNumber: number, results: { processed: number; failed: number }) => void;
}

/**
 * Result of bulk import operation
 */
export interface BulkImportResult {
  totalImported: number;
  failedImports: number;
  skipped: number;
  updated: number;
  batches: number;
  errors: SyncError[];
  duration: number;
  averageTimePerTicket: number;
  cancelled?: boolean;
  resumedFrom?: string;
  performanceMetrics: {
    averageBatchTime: number;
    ticketsPerSecond: number;
    memoryEfficiency: number;
  };
  memoryPeak: number;
}

/**
 * Simplified Progressive Bulk Import Manager
 * 
 * This is a streamlined version focused on reliability and testability.
 * Key features:
 * - Batch processing (25 tickets per batch by default)
 * - Progress UI feedback during import  
 * - Non-blocking operations to keep UI responsive
 * - Integration with JQL query engine
 * - Error handling and recovery for failed batches
 * - Memory management for large imports
 */
export class BulkImportManager {
  private plugin: Plugin;
  private queryEngine: JQLQueryEngine;
  private syncFolder: string;
  private isImporting: boolean = false;
  private shouldCancel: boolean = false;
  private shouldPause: boolean = false;
  private currentProgress: BulkImportProgress | null = null;
  private errors: SyncError[] = [];
  private startTime: number = 0;

  constructor(plugin: Plugin, queryEngine: JQLQueryEngine, syncFolder: string) {
    this.plugin = plugin;
    this.queryEngine = queryEngine;
    this.syncFolder = syncFolder;
  }

  /**
   * Starts a bulk import operation
   */
  async startImport(options: BulkImportOptions): Promise<BulkImportResult | null> {
    // Prevent concurrent imports
    if (this.isImporting) {
      new Notice('Import already in progress');
      return null;
    }

    this.isImporting = true;
    this.shouldCancel = false;
    this.shouldPause = false;
    this.errors = [];
    this.startTime = Date.now();

    try {
      // Initialize progress
      this.initializeProgress(options);
      this.reportProgress(options.onProgress);

      // Ensure sync folder exists
      await this.ensureSyncFolder();

      // Phase 1: Search for tickets
      this.updatePhase(SyncPhase.SEARCHING);
      this.reportProgress(options.onProgress);
      const queryResult = await this.queryEngine.executeQuery({
        jql: options.jqlQuery,
        maxResults: 1000,
        batchSize: 50,
        addPermissionFilter: true // Enable permission filter in production
      });

      const tickets = queryResult.issues;
      if (tickets.length === 0) {
        this.updatePhase(SyncPhase.COMPLETE);
        return this.createResult();
      }

      // Phase 2: Process tickets in batches
      this.updatePhase(SyncPhase.PROCESSING);
      this.reportProgress(options.onProgress);
      await this.processBatches(tickets, options);

      // Phase 3: Complete or handle cancellation/pause
      if (this.shouldCancel) {
        this.updatePhase(SyncPhase.CANCELLED);
      } else if (this.shouldPause) {
        // Already handled in processBatches
      } else {
        this.updatePhase(SyncPhase.COMPLETE);
      }
      this.reportProgress(options.onProgress);

      return this.createResult();

    } catch (error) {
      const syncError: SyncError = {
        code: 'BULK_IMPORT_FAILED',
        message: error instanceof Error ? error.message : String(error),
        phase: this.currentProgress?.phase || SyncPhase.ERROR,
        timestamp: Date.now(),
        retryAttempt: 0,
        maxRetries: 3
      };
      
      this.errors.push(syncError);
      this.updatePhase(SyncPhase.ERROR);
      throw error;
    } finally {
      this.isImporting = false;
      this.shouldCancel = false;
      this.shouldPause = false;
    }
  }

  /**
   * Pauses the current import operation
   */
  async pauseImport(): Promise<void> {
    if (!this.isImporting) {
      return;
    }

    this.shouldPause = true;
    if (this.currentProgress) {
      this.currentProgress.isPaused = true;
      this.currentProgress.resumeToken = `resume_batch_${this.currentProgress.currentBatch}_offset_${this.currentProgress.current}`;
    }
    
    await this.saveImportState();
    new Notice('Import paused - can be resumed later');
  }

  /**
   * Resumes a previously paused import
   */
  async resumeImport(): Promise<BulkImportResult | null> {
    const savedState = await this.loadImportState();
    if (!savedState) {
      new Notice('No import to resume');
      return null;
    }

    // Create modified query to skip processed tickets
    const processedIds = savedState.processedTicketIds || [];
    let resumeQuery = savedState.jqlQuery || '';
    
    if (processedIds.length > 0) {
      const excludeClause = `AND key NOT IN (${processedIds.map((id: string) => `"${id}"`).join(', ')})`;
      resumeQuery += ` ${excludeClause}`;
    }

    const result = await this.startImport({
      jqlQuery: resumeQuery,
      batchSize: savedState.batchSize,
      enableResume: true
    });

    if (result) {
      result.resumedFrom = savedState.resumeToken;
    }

    return result;
  }

  /**
   * Cancels the current import operation
   */
  cancelImport(): void {
    if (!this.isImporting) {
      return;
    }

    this.shouldCancel = true;
    if (this.currentProgress) {
      this.currentProgress.cancellationRequested = true;
      this.currentProgress.cancellationToken = `cancel_${Date.now()}`;
    }
    
    this.updatePhase(SyncPhase.CANCELLED);
    new Notice('Import cancellation requested');
  }

  /**
   * Gets current import progress
   */
  getCurrentProgress(): BulkImportProgress | null {
    return this.currentProgress;
  }

  /**
   * Gets total imported count
   */
  get totalImported(): number {
    return this.currentProgress?.processed || 0;
  }

  /**
   * Initialize progress tracking
   */
  private initializeProgress(options: BulkImportOptions): void {
    const now = Date.now();
    const batchSize = options.batchSize || BULK_IMPORT_DEFAULTS.BATCH_SIZE;

    this.currentProgress = {
      // Basic progress tracking
      current: 0,
      total: 0,
      processed: 0,
      failed: 0,

      // Phase tracking
      phase: SyncPhase.INITIALIZING,
      phaseStartTime: now,
      startTime: now,
      estimatedTimeRemaining: null,

      // Error handling
      errors: [],
      warnings: [],

      // Cancellation
      cancellationRequested: false,
      cancellationToken: null,

      // Batch processing
      currentBatch: 1,
      totalBatches: 1,
      batchSize: batchSize,

      // Resume capability
      resumeToken: null,
      processedTicketIds: [],

      // Import statistics
      duplicatesFound: 0,
      newTicketsCreated: 0,
      ticketsUpdated: 0,

      // User interaction controls
      allowCancel: true,
      allowPause: true,
      isPaused: false
    };
  }

  /**
   * Process tickets in batches
   */
  private async processBatches(tickets: JiraIssue[], options: BulkImportOptions): Promise<void> {
    if (!this.currentProgress) return;

    const batchSize = this.currentProgress.batchSize;
    const totalBatches = Math.ceil(tickets.length / batchSize);
    
    this.currentProgress.totalBatches = totalBatches;
    this.currentProgress.total = tickets.length;

    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
      // Check for cancellation or pause
      if (this.shouldCancel) {
        break;
      }

      if (this.shouldPause) {
        await this.saveImportState();
        break;
      }

      // Update batch progress
      this.currentProgress.currentBatch = batchIndex + 1;
      this.reportProgress(options.onProgress);

      // Get tickets for this batch
      const start = batchIndex * batchSize;
      const end = Math.min(start + batchSize, tickets.length);
      const batchTickets = tickets.slice(start, end);

      // Process batch
      let batchProcessed = 0;
      let batchFailed = 0;

      for (const ticket of batchTickets) {
        if (this.shouldCancel || this.shouldPause) {
          break;
        }

        try {
          const result = await this.processTicket(ticket, options);
          
          switch (result) {
            case 'created':
              this.currentProgress.newTicketsCreated++;
              this.currentProgress.processedTicketIds.push(ticket.key);
              batchProcessed++;
              break;
            case 'updated':
              this.currentProgress.ticketsUpdated++;
              this.currentProgress.processedTicketIds.push(ticket.key);
              batchProcessed++;
              break;
            case 'skipped':
              this.currentProgress.duplicatesFound++;
              break;
          }
          
          this.currentProgress.processed++;
          this.currentProgress.current++;

        } catch (error) {
          this.currentProgress.failed++;
          batchFailed++;
          
          const syncError: SyncError = {
            code: 'TICKET_PROCESSING_ERROR',
            message: error instanceof Error ? error.message : String(error),
            phase: SyncPhase.PROCESSING,
            timestamp: Date.now(),
            retryAttempt: 0,
            maxRetries: 3,
            ticketId: ticket.key
          };

          this.errors.push(syncError);
          this.currentProgress.errors.push(syncError);

          if (options.onError) {
            try {
              options.onError(ticket.key, syncError.message, 'processing');
            } catch (callbackError) {
              console.error('Error callback failed:', callbackError);
            }
          }
        }

        // Yield control to UI every 5 tickets
        if ((this.currentProgress.processed + this.currentProgress.failed) % 5 === 0) {
          await this.yieldToUI();
        }
      }

      // Report batch completion
      if (options.onBatchComplete) {
        try {
          options.onBatchComplete(batchIndex + 1, {
            processed: batchProcessed,
            failed: batchFailed
          });
        } catch (callbackError) {
          console.error('Batch completion callback failed:', callbackError);
        }
      }

      // Update progress after batch
      this.updateTimeEstimate();
      this.reportProgress(options.onProgress);
      
      // Save state periodically for resume capability
      if (options.enableResume && (batchIndex + 1) % 5 === 0) {
        await this.saveImportState();
      }

      // Add 100ms delay between batches (except for the last batch)
      if (batchIndex < totalBatches - 1 && !this.shouldCancel && !this.shouldPause) {
        await this.sleep(100);
      }
    }
  }

  /**
   * Process a single ticket
   */
  private async processTicket(
    ticket: JiraIssue,
    options: BulkImportOptions
  ): Promise<'created' | 'updated' | 'skipped'> {
    // Validate ticket data
    if (!ticket.fields || !ticket.fields.summary) {
      throw new Error('Invalid ticket data: missing fields or summary');
    }

    // Create note service
    const noteService = new SimpleNoteService(
      this.plugin.app.vault,
      this.syncFolder
    );
    
    // Process the ticket using the note service
    const result = await noteService.processTicket(ticket, {
      overwriteExisting: !options.skipExisting,
      organizationStrategy: options.organizeByProject ? 'by-project' : 'flat',
      preserveLocalNotes: true
    });
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to process ticket');
    }
    
    return result.action as 'created' | 'updated' | 'skipped';
  }

  /**
   * Create note content from Jira ticket
   */
  private createNoteContent(ticket: JiraIssue): string {
    const fields = ticket.fields;
    const now = new Date();
    
    const frontmatter = [
      '---',
      `jira-key: ${ticket.key}`,
      `jira-id: ${ticket.id || ''}`,
      `status: ${fields.status?.name || 'Unknown'}`,
      `assignee: ${fields.assignee?.displayName || 'Unassigned'}`,
      `priority: ${fields.priority?.name || 'None'}`,
      `created: ${fields.created || ''}`,
      `updated: ${fields.updated || ''}`,
      `type: ${fields.issuetype?.name || 'Unknown'}`,
      `project: ${fields.project?.key || 'Unknown'}`,
      `project-name: ${fields.project?.name || 'Unknown'}`,
      `reporter: ${fields.reporter?.displayName || 'Unknown'}`,
      `import-date: ${now.toISOString()}`,
      `sync-version: 2.0`,
      '---',
      ''
    ].join('\n');

    const content = [
      `# ${ticket.key}: ${fields.summary}`,
      '',
      '## Description',
      fields.description || '*No description provided*',
      '',
      '## Details',
      `- **Status**: ${fields.status?.name || 'Unknown'}`,
      `- **Assignee**: ${fields.assignee?.displayName || 'Unassigned'}`,
      `- **Priority**: ${fields.priority?.name || 'None'}`,
      `- **Type**: ${fields.issuetype?.name || 'Unknown'}`,
      `- **Project**: ${fields.project?.name || 'Unknown'} (${fields.project?.key || 'Unknown'})`,
      `- **Reporter**: ${fields.reporter?.displayName || 'Unknown'}`,
      `- **Created**: ${this.formatDate(fields.created)}`,
      `- **Updated**: ${this.formatDate(fields.updated)}`,
      '',
      '## Links',
      `- [View in Jira](${ticket.self || '#'})`,
      '',
      '## Notes',
      '',
      '*Add your notes here*',
      '',
      '---',
      `*Imported from Jira on ${now.toLocaleDateString()} via Obsidian Jira Sync Pro v2.0*`
    ].join('\n');

    return frontmatter + content;
  }

  /**
   * Update phase and capabilities
   */
  private updatePhase(phase: SyncPhase): void {
    if (!this.currentProgress) return;

    this.currentProgress.phase = phase;
    this.currentProgress.phaseStartTime = Date.now();
    
    // Update capabilities based on phase
    switch (phase) {
      case SyncPhase.INITIALIZING:
      case SyncPhase.SEARCHING:
        this.currentProgress.allowPause = false;
        this.currentProgress.allowCancel = true;
        break;
      case SyncPhase.DOWNLOADING:
      case SyncPhase.PROCESSING:
        this.currentProgress.allowPause = true;
        this.currentProgress.allowCancel = true;
        break;
      case SyncPhase.FINALIZING:
        this.currentProgress.allowPause = false;
        this.currentProgress.allowCancel = false;
        break;
      case SyncPhase.COMPLETE:
      case SyncPhase.CANCELLED:
      case SyncPhase.ERROR:
        this.currentProgress.allowPause = false;
        this.currentProgress.allowCancel = false;
        break;
    }

    this.updateTimeEstimate();
  }

  /**
   * Update estimated time remaining
   */
  private updateTimeEstimate(): void {
    if (!this.currentProgress || this.currentProgress.processed === 0) {
      if (this.currentProgress) {
        this.currentProgress.estimatedTimeRemaining = null;
      }
      return;
    }

    const elapsed = Date.now() - this.startTime;
    const avgTimePerTicket = elapsed / this.currentProgress.processed;
    const remaining = this.currentProgress.total - this.currentProgress.processed;
    
    this.currentProgress.estimatedTimeRemaining = Math.ceil((avgTimePerTicket * remaining) / 1000);
  }

  /**
   * Report progress to callback
   */
  private reportProgress(callback?: (progress: BulkImportProgress) => void): void {
    if (!callback || !this.currentProgress) return;

    try {
      // Create a deep copy to avoid reference issues in tests
      const progressCopy = JSON.parse(JSON.stringify(this.currentProgress));
      callback(progressCopy);
    } catch (error) {
      console.error('Progress callback error:', error);
    }
  }

  /**
   * Non-blocking yield to UI thread
   */
  private async yieldToUI(): Promise<void> {
    return new Promise(resolve => {
      setTimeout(resolve, 1);
    });
  }

  /**
   * Sleep utility for controlled delays
   */
  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => {
      setTimeout(resolve, ms);
    });
  }

  /**
   * Create final import result
   */
  private createResult(): BulkImportResult {
    if (!this.currentProgress) {
      throw new Error('No import progress available');
    }

    const duration = Date.now() - this.startTime;
    const total = this.currentProgress.processed + this.currentProgress.failed;
    const averageTime = total > 0 ? duration / total : 0;
    const ticketsPerSecond = duration > 0 ? (this.currentProgress.processed / (duration / 1000)) : 0;

    return {
      totalImported: this.currentProgress.processed,
      failedImports: this.currentProgress.failed,
      skipped: this.currentProgress.duplicatesFound,
      updated: this.currentProgress.ticketsUpdated,
      batches: this.currentProgress.currentBatch,
      errors: [...this.errors],
      duration,
      averageTimePerTicket: averageTime,
      memoryPeak: 0, // Simplified version doesn't track memory
      cancelled: this.shouldCancel,
      performanceMetrics: {
        averageBatchTime: duration / this.currentProgress.currentBatch,
        ticketsPerSecond,
        memoryEfficiency: 1.0
      }
    };
  }

  /**
   * Utility methods
   */
  private async ensureSyncFolder(): Promise<void> {
    await this.ensureFolder(this.syncFolder);
  }

  private async ensureFolder(folderPath: string): Promise<void> {
    const folder = this.plugin.app.vault.getAbstractFileByPath(folderPath);
    if (!folder) {
      await this.plugin.app.vault.createFolder(folderPath);
    }
  }

  private formatDate(dateString?: string): string {
    if (!dateString) return 'Unknown';
    
    try {
      return new Date(dateString).toLocaleDateString();
    } catch {
      return dateString;
    }
  }

  /**
   * State persistence for resume capability
   */
  private async saveImportState(): Promise<void> {
    if (!this.currentProgress) return;

    const stateData = {
      resumeToken: this.currentProgress.resumeToken,
      jqlQuery: '',
      batchSize: this.currentProgress.batchSize,
      processedTicketIds: this.currentProgress.processedTicketIds,
      timestamp: new Date().toISOString()
    };

    const data = await this.plugin.loadData() || {};
    data.bulkImportState = stateData;
    await this.plugin.saveData(data);
  }

  private async loadImportState(): Promise<any> {
    const data = await this.plugin.loadData() || {};
    return data.bulkImportState || null;
  }
}