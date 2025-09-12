import { Plugin, Notice, TFile, normalizePath } from 'obsidian';
import { JQLQueryEngine, JiraIssue } from '../enhanced-sync/jql-query-engine';
import { 
  BulkImportProgress, 
  SyncPhase, 
  SyncError,
  BULK_IMPORT_DEFAULTS,
  PHASE_CAPABILITIES,
  createResumeToken,
  parseResumeToken,
  calculateProgressPercentage
} from '../models/bulk-import-progress';

/**
 * Options for bulk import operation
 */
export interface BulkImportOptions {
  jqlQuery: string;
  batchSize?: number;
  skipExisting?: boolean;
  organizeByProject?: boolean;
  enableResume?: boolean;
  maxConcurrency?: number;
  memoryLimit?: number; // MB
  onProgress?: (progress: BulkImportProgress) => void;
  onError?: (ticketKey: string, error: string, category: string) => void;
  onBatchComplete?: (batchNumber: number, batchResults: BatchResult) => void;
}

/**
 * Result of a single batch processing
 */
export interface BatchResult {
  processed: number;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  errors: SyncError[];
  memoryUsage: number; // MB
  processingTime: number; // ms
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
  memoryPeak: number; // MB
  cancelled?: boolean;
  resumedFrom?: string;
  performanceMetrics: {
    averageBatchTime: number;
    ticketsPerSecond: number;
    memoryEfficiency: number;
  };
}

/**
 * Internal state for managing bulk import progress
 */
interface ImportState {
  startTime: number;
  progress: BulkImportProgress;
  currentBatchTickets: JiraIssue[];
  failedBatches: number[];
  memoryUsage: number;
  isRunning: boolean;
  shouldCancel: boolean;
  shouldPause: boolean;
  abortController: AbortController;
}

/**
 * Progressive Bulk Import Manager
 * 
 * Manages large-scale Jira ticket imports with:
 * - Batch processing (25 tickets per batch by default)
 * - Progress UI feedback during import
 * - Non-blocking operations to keep UI responsive
 * - Integration with JQL query engine
 * - Error handling and recovery for failed batches
 * - Memory management for large imports
 * - Resume capability for interrupted imports
 */
export class BulkImportManager {
  private readonly plugin: Plugin;
  private readonly queryEngine: JQLQueryEngine;
  private readonly syncFolder: string;
  private state: ImportState | null = null;
  private batchResults: BatchResult[] = [];
  private memoryWatcher: NodeJS.Timeout | null = null;

  constructor(plugin: Plugin, queryEngine: JQLQueryEngine, syncFolder: string) {
    this.plugin = plugin;
    this.queryEngine = queryEngine;
    this.syncFolder = syncFolder;
  }

  /**
   * Starts a bulk import operation with enhanced progress tracking
   */
  async startImport(options: BulkImportOptions): Promise<BulkImportResult | null> {
    // Prevent concurrent imports
    if (this.state?.isRunning) {
      new Notice('Import already in progress');
      return null;
    }

    // Initialize import state
    this.state = await this.initializeImportState(options);
    this.batchResults = [];
    
    // Start memory monitoring
    this.startMemoryMonitoring();

    try {
      // Ensure sync folder exists
      await this.ensureSyncFolder();

      // Phase 1: Initialize and validate
      this.updatePhase(SyncPhase.INITIALIZING);
      this.reportProgress(options.onProgress);

      // Phase 2: Search for tickets
      this.updatePhase(SyncPhase.SEARCHING);
      const queryResult = await this.executeSearchQuery(options);
      
      if (queryResult.issues.length === 0) {
        this.updatePhase(SyncPhase.COMPLETE);
        return this.createResult();
      }

      // Phase 3: Process tickets in batches
      this.updatePhase(SyncPhase.DOWNLOADING);
      await this.processBatches(queryResult.issues, options);

      // Phase 4: Finalize
      if (!this.state.shouldCancel && !this.state.shouldPause) {
        this.updatePhase(SyncPhase.FINALIZING);
        await this.finalizeBulkImport(options);
        this.updatePhase(SyncPhase.COMPLETE);
      }

      return this.createResult();

    } catch (error) {
      const syncError = this.createSyncError(
        'BULK_IMPORT_FAILED',
        error instanceof Error ? error.message : String(error),
        this.state.progress.phase
      );
      
      this.state.progress.errors.push(syncError);
      this.updatePhase(SyncPhase.ERROR);
      throw error;
    } finally {
      this.cleanup();
    }
  }

  /**
   * Pauses the current import operation
   */
  async pauseImport(): Promise<void> {
    if (!this.state?.isRunning) {
      return;
    }

    if (!this.state.progress.allowPause) {
      new Notice('Cannot pause import in current phase');
      return;
    }

    this.state.shouldPause = true;
    this.state.progress.isPaused = true;
    this.state.progress.resumeToken = createResumeToken(this.state.progress);
    
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

    // Parse resume token to determine where to continue
    const resumeInfo = parseResumeToken(savedState.resumeToken || '');
    if (!resumeInfo) {
      new Notice('Invalid resume token - cannot continue');
      return null;
    }

    // Recreate options and continue from where we left off
    const options: BulkImportOptions = {
      jqlQuery: savedState.jqlQuery || '',
      batchSize: savedState.batchSize,
      enableResume: true
    };

    // Modify query to skip already processed tickets
    const processedIds = savedState.processedTicketIds;
    if (processedIds.length > 0) {
      const excludeClause = `AND key NOT IN (${processedIds.map(id => `"${id}"`).join(', ')})`;
      options.jqlQuery += ` ${excludeClause}`;
    }

    const result = await this.startImport(options);
    if (result) {
      result.resumedFrom = savedState.resumeToken;
    }

    return result;
  }

  /**
   * Cancels the current import operation
   */
  cancelImport(): void {
    if (!this.state?.isRunning) {
      return;
    }

    this.state.shouldCancel = true;
    this.state.progress.cancellationRequested = true;
    this.state.progress.cancellationToken = `cancel_${Date.now()}`;
    this.state.abortController.abort('User cancelled import');
    
    this.updatePhase(SyncPhase.CANCELLED);
    new Notice('Import cancellation requested');
  }

  /**
   * Gets current import progress
   */
  getCurrentProgress(): BulkImportProgress | null {
    return this.state?.progress || null;
  }

  /**
   * Initializes import state and progress tracking
   */
  private async initializeImportState(options: BulkImportOptions): Promise<ImportState> {
    const now = Date.now();
    const batchSize = options.batchSize || BULK_IMPORT_DEFAULTS.BATCH_SIZE;

    const progress: BulkImportProgress = {
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
      totalBatches: 1, // Will be updated when we know total
      batchSize: batchSize,

      // Resume capability
      resumeToken: null,
      processedTicketIds: [],

      // Import statistics
      duplicatesFound: 0,
      newTicketsCreated: 0,
      ticketsUpdated: 0,

      // User interaction controls
      allowCancel: PHASE_CAPABILITIES[SyncPhase.INITIALIZING].allowCancel,
      allowPause: PHASE_CAPABILITIES[SyncPhase.INITIALIZING].allowPause,
      isPaused: false
    };

    return {
      startTime: now,
      progress,
      currentBatchTickets: [],
      failedBatches: [],
      memoryUsage: this.getCurrentMemoryUsage(),
      isRunning: true,
      shouldCancel: false,
      shouldPause: false,
      abortController: new AbortController()
    };
  }

  /**
   * Executes the JQL search query to get tickets
   */
  private async executeSearchQuery(options: BulkImportOptions) {
    const queryResult = await this.queryEngine.executeQuery({
      jql: options.jqlQuery,
      maxResults: options.maxConcurrency || BULK_IMPORT_DEFAULTS.MAX_RESULTS,
      batchSize: Math.min(options.batchSize || BULK_IMPORT_DEFAULTS.BATCH_SIZE, 100),
      onProgress: (current, total, phase) => {
        if (this.state) {
          this.state.progress.current = current;
          this.state.progress.total = total;
          this.state.progress.totalBatches = Math.ceil(total / this.state.progress.batchSize);
          this.reportProgress(options.onProgress);
        }
      },
      signal: this.state!.abortController.signal
    });

    return queryResult;
  }

  /**
   * Processes tickets in batches with non-blocking operations
   */
  private async processBatches(tickets: JiraIssue[], options: BulkImportOptions): Promise<void> {
    if (!this.state) return;

    const batchSize = this.state.progress.batchSize;
    const totalBatches = Math.ceil(tickets.length / batchSize);
    
    this.state.progress.totalBatches = totalBatches;
    this.updatePhase(SyncPhase.PROCESSING);

    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
      // Check for cancellation or pause
      if (this.state.shouldCancel) {
        break;
      }

      if (this.state.shouldPause) {
        await this.saveImportState();
        break;
      }

      // Update batch progress
      this.state.progress.currentBatch = batchIndex + 1;
      this.reportProgress(options.onProgress);

      // Get tickets for this batch
      const start = batchIndex * batchSize;
      const end = Math.min(start + batchSize, tickets.length);
      const batchTickets = tickets.slice(start, end);

      // Process batch
      const batchResult = await this.processBatch(batchTickets, options, batchIndex + 1);
      this.batchResults.push(batchResult);

      // Update overall progress
      this.updateProgressFromBatch(batchResult);

      // Yield control to UI (non-blocking operation)
      await this.yieldToUI();

      // Memory management
      await this.manageMemory(options);

      // Report batch completion
      if (options.onBatchComplete) {
        try {
          options.onBatchComplete(batchIndex + 1, batchResult);
        } catch (error) {
          console.error('Batch completion callback error:', error);
        }
      }
    }
  }

  /**
   * Processes a single batch of tickets with retry and error recovery
   */
  private async processBatch(
    tickets: JiraIssue[], 
    options: BulkImportOptions, 
    batchNumber: number
  ): Promise<BatchResult> {
    const batchStartTime = Date.now();
    const batchResult: BatchResult = {
      processed: 0,
      created: 0,
      updated: 0,
      skipped: 0,
      failed: 0,
      errors: [],
      memoryUsage: this.getCurrentMemoryUsage(),
      processingTime: 0
    };

    // Track failed tickets for retry
    const failedTickets: Array<{ ticket: JiraIssue; attempts: number; lastError?: Error }> = [];
    const maxRetries = 3;

    // First pass: process all tickets (with optional concurrency)
    const concurrency = this.calculateOptimalConcurrency(options);
    
    if (concurrency > 1) {
      // Concurrent processing for better performance
      await this.processBatchConcurrently(tickets, options, maxRetries, batchResult, failedTickets);
    } else {
      // Sequential processing for memory-constrained environments
      await this.processBatchSequentially(tickets, options, maxRetries, batchResult, failedTickets);
    }

    // Second pass: retry failed tickets with batch-level recovery
    if (failedTickets.length > 0 && !this.state?.shouldCancel && !this.state?.shouldPause) {
      await this.retryFailedTicketsInBatch(failedTickets, options, batchResult, maxRetries);
    }

    batchResult.processingTime = Date.now() - batchStartTime;
    
    // Check if entire batch failed and should be retried
    const failureRate = batchResult.failed / tickets.length;
    if (failureRate > 0.5 && !this.state?.shouldCancel) {
      await this.handleBatchFailure(batchNumber, batchResult, tickets, options);
    }

    return batchResult;
  }

  /**
   * Process a single ticket with retry logic
   */
  private async processTicketWithRetry(
    ticket: JiraIssue, 
    options: BulkImportOptions, 
    maxRetries: number
  ): Promise<{
    success: boolean;
    result?: 'created' | 'updated' | 'skipped';
    attempts: number;
    error?: Error;
  }> {
    let attempts = 0;
    let lastError: Error | undefined;

    while (attempts < maxRetries) {
      attempts++;
      
      try {
        const result = await this.processTicket(ticket, options);
        return { success: true, result, attempts };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        // Check if error is retryable
        if (!this.isRetryableError(lastError) || attempts >= maxRetries) {
          break;
        }

        // Wait before retry with exponential backoff
        const delay = Math.min(1000 * Math.pow(2, attempts - 1), 5000);
        await this.sleep(delay);
      }
    }

    return { success: false, attempts, error: lastError };
  }

  /**
   * Retry failed tickets within a batch using different strategies
   */
  private async retryFailedTicketsInBatch(
    failedTickets: Array<{ ticket: JiraIssue; attempts: number; lastError?: Error }>,
    options: BulkImportOptions,
    batchResult: BatchResult,
    maxRetries: number
  ): Promise<void> {
    // Group failures by error type for targeted retry strategies
    const errorGroups = this.groupFailuresByError(failedTickets);
    
    for (const [errorType, ticketGroup] of errorGroups) {
      if (this.state?.shouldCancel || this.state?.shouldPause) {
        break;
      }

      // Apply error-specific retry strategy
      const retryStrategy = this.getRetryStrategy(errorType);
      
      if (retryStrategy.shouldRetry) {
        await this.sleep(retryStrategy.delay);
        
        for (const failedTicket of ticketGroup) {
          try {
            // Use alternative processing method if available
            const result = retryStrategy.useAlternativeMethod 
              ? await this.processTicketAlternative(failedTicket.ticket, options)
              : await this.processTicket(failedTicket.ticket, options);

            // Update results (remove from failed, add to successful)
            this.updateBatchResultFromTicketResult(
              batchResult, 
              { success: true, result, attempts: failedTicket.attempts + 1 },
              failedTicket.ticket
            );

          } catch (retryError) {
            // Still failed after batch retry - this is final
            const syncError = this.createSyncError(
              'BATCH_RETRY_FAILED',
              `Final retry failed: ${retryError instanceof Error ? retryError.message : String(retryError)}`,
              SyncPhase.PROCESSING,
              failedTicket.ticket.key
            );
            syncError.retryAttempt = failedTicket.attempts + 1;
            
            batchResult.errors.push(syncError);
            if (this.state) {
              this.state.progress.errors.push(syncError);
            }
          }
        }
      }
    }
  }

  /**
   * Handle catastrophic batch failure with recovery strategies
   */
  private async handleBatchFailure(
    batchNumber: number,
    batchResult: BatchResult,
    tickets: JiraIssue[],
    options: BulkImportOptions
  ): Promise<void> {
    if (!this.state) return;

    // Add to failed batches for later retry
    this.state.failedBatches.push(batchNumber);
    
    // Add warning about batch failure
    this.state.progress.warnings.push(
      `Batch ${batchNumber} had high failure rate (${Math.round((batchResult.failed / tickets.length) * 100)}%)`
    );

    // If we have too many failed batches, pause and let user decide
    const failedBatchRate = this.state.failedBatches.length / this.state.progress.currentBatch;
    if (failedBatchRate > 0.3) { // More than 30% of batches failing
      this.state.progress.warnings.push(
        'High batch failure rate detected. Consider pausing import to investigate.'
      );
      
      // Auto-pause if failure rate is very high
      if (failedBatchRate > 0.5) {
        await this.pauseImport();
        new Notice('Import auto-paused due to high failure rate. Check logs and resume when ready.');
      }
    }
  }

  /**
   * Group failed tickets by error type for targeted recovery
   */
  private groupFailuresByError(
    failedTickets: Array<{ ticket: JiraIssue; attempts: number; lastError?: Error }>
  ): Map<string, typeof failedTickets> {
    const groups = new Map<string, typeof failedTickets>();
    
    for (const failedTicket of failedTickets) {
      const errorType = this.classifyError(failedTicket.lastError);
      
      if (!groups.has(errorType)) {
        groups.set(errorType, []);
      }
      groups.get(errorType)!.push(failedTicket);
    }
    
    return groups;
  }

  /**
   * Get retry strategy based on error type
   */
  private getRetryStrategy(errorType: string): {
    shouldRetry: boolean;
    delay: number;
    useAlternativeMethod: boolean;
  } {
    const strategies = {
      'network': { shouldRetry: true, delay: 2000, useAlternativeMethod: false },
      'rate_limit': { shouldRetry: true, delay: 5000, useAlternativeMethod: false },
      'filesystem': { shouldRetry: true, delay: 1000, useAlternativeMethod: true },
      'validation': { shouldRetry: false, delay: 0, useAlternativeMethod: false },
      'permissions': { shouldRetry: true, delay: 1000, useAlternativeMethod: true },
      'unknown': { shouldRetry: true, delay: 2000, useAlternativeMethod: false }
    };

    return strategies[errorType as keyof typeof strategies] || strategies.unknown;
  }

  /**
   * Alternative ticket processing method for error recovery
   */
  private async processTicketAlternative(
    ticket: JiraIssue,
    options: BulkImportOptions
  ): Promise<'created' | 'updated' | 'skipped'> {
    // Try with minimal content first
    const minimalContent = this.createMinimalNoteContent(ticket);
    
    const folder = this.syncFolder; // Don't organize by project on retry
    await this.ensureFolder(folder);
    
    const fileName = `${ticket.key}.md`;
    const filePath = normalizePath(`${folder}/${fileName}`);

    // Always create new file on alternative method (don't check for existing)
    try {
      await this.plugin.app.vault.create(filePath, minimalContent);
      return 'created';
    } catch (error) {
      // If creation fails, try updating
      const existingFile = this.plugin.app.vault.getAbstractFileByPath(filePath);
      if (existingFile instanceof TFile) {
        await this.plugin.app.vault.modify(existingFile, minimalContent);
        return 'updated';
      }
      throw error;
    }
  }

  /**
   * Create minimal note content for error recovery
   */
  private createMinimalNoteContent(ticket: JiraIssue): string {
    return [
      '---',
      `jira-key: ${ticket.key}`,
      `status: ${ticket.fields.status?.name || 'Unknown'}`,
      `import-date: ${new Date().toISOString()}`,
      `import-mode: recovery`,
      '---',
      '',
      `# ${ticket.key}: ${ticket.fields.summary || 'No Summary'}`,
      '',
      '*This ticket was imported in recovery mode due to processing errors.*',
      '',
      '## Notes',
      '',
      '*Add your notes here*'
    ].join('\n');
  }

  /**
   * Update batch result from ticket processing result
   */
  private updateBatchResultFromTicketResult(
    batchResult: BatchResult,
    ticketResult: { success: boolean; result?: 'created' | 'updated' | 'skipped'; attempts: number; error?: Error },
    ticket: JiraIssue
  ): void {
    if (ticketResult.success && ticketResult.result) {
      switch (ticketResult.result) {
        case 'created':
          batchResult.created++;
          if (this.state) {
            this.state.progress.newTicketsCreated++;
            this.state.progress.processedTicketIds.push(ticket.key);
          }
          break;
        case 'updated':
          batchResult.updated++;
          if (this.state) {
            this.state.progress.ticketsUpdated++;
            this.state.progress.processedTicketIds.push(ticket.key);
          }
          break;
        case 'skipped':
          batchResult.skipped++;
          if (this.state) {
            this.state.progress.duplicatesFound++;
          }
          break;
      }
      
      batchResult.processed++;
      if (this.state) {
        this.state.progress.processed++;
        this.state.progress.current++;
      }
    } else {
      batchResult.failed++;
      if (this.state) {
        this.state.progress.failed++;
      }

      if (ticketResult.error) {
        const syncError = this.createSyncError(
          'TICKET_PROCESSING_ERROR',
          ticketResult.error.message,
          SyncPhase.PROCESSING,
          ticket.key
        );
        syncError.retryAttempt = ticketResult.attempts;

        batchResult.errors.push(syncError);
        if (this.state) {
          this.state.progress.errors.push(syncError);
        }
      }
    }
  }

  /**
   * Classify error for targeted recovery
   */
  private classifyError(error?: Error): string {
    if (!error) return 'unknown';
    
    const message = error.message.toLowerCase();
    
    if (message.includes('network') || message.includes('timeout')) {
      return 'network';
    }
    if (message.includes('rate limit') || message.includes('too many requests')) {
      return 'rate_limit';
    }
    if (message.includes('file') || message.includes('vault') || message.includes('path')) {
      return 'filesystem';
    }
    if (message.includes('permission') || message.includes('access')) {
      return 'permissions';
    }
    if (message.includes('validation') || message.includes('invalid')) {
      return 'validation';
    }
    
    return 'unknown';
  }

  /**
   * Check if error is retryable
   */
  private isRetryableError(error: Error): boolean {
    const errorType = this.classifyError(error);
    const retryableTypes = ['network', 'rate_limit', 'filesystem', 'permissions', 'unknown'];
    return retryableTypes.includes(errorType);
  }

  /**
   * Calculate optimal concurrency based on system resources and options
   */
  private calculateOptimalConcurrency(options: BulkImportOptions): number {
    const maxConcurrency = options.maxConcurrency || 3;
    const currentMemory = this.getCurrentMemoryUsage();
    const memoryLimit = options.memoryLimit || 100;
    
    // Reduce concurrency based on memory pressure
    const memoryUsageRatio = currentMemory / memoryLimit;
    
    if (memoryUsageRatio > 0.8) {
      return 1; // Sequential processing under memory pressure
    } else if (memoryUsageRatio > 0.6) {
      return Math.max(1, Math.floor(maxConcurrency / 2));
    } else {
      return maxConcurrency;
    }
  }

  /**
   * Process batch sequentially (memory-safe)
   */
  private async processBatchSequentially(
    tickets: JiraIssue[],
    options: BulkImportOptions,
    maxRetries: number,
    batchResult: BatchResult,
    failedTickets: Array<{ ticket: JiraIssue; attempts: number; lastError?: Error }>
  ): Promise<void> {
    for (const ticket of tickets) {
      if (this.state?.shouldCancel || this.state?.shouldPause) {
        break;
      }

      const processed = await this.processTicketWithRetry(ticket, options, maxRetries);
      this.updateBatchResultFromTicketResult(batchResult, processed, ticket);

      // Track failed tickets for batch retry
      if (!processed.success) {
        failedTickets.push({
          ticket,
          attempts: processed.attempts,
          lastError: processed.error
        });
      }

      // Yield periodically within batch
      if (batchResult.processed % 5 === 0) {
        await this.yieldToUI();
      }
    }
  }

  /**
   * Process batch concurrently (performance-optimized)
   */
  private async processBatchConcurrently(
    tickets: JiraIssue[],
    options: BulkImportOptions,
    maxRetries: number,
    batchResult: BatchResult,
    failedTickets: Array<{ ticket: JiraIssue; attempts: number; lastError?: Error }>
  ): Promise<void> {
    const concurrency = this.calculateOptimalConcurrency(options);
    const chunks = this.chunkArray(tickets, concurrency);
    
    for (const chunk of chunks) {
      if (this.state?.shouldCancel || this.state?.shouldPause) {
        break;
      }

      // Process chunk concurrently
      const chunkPromises = chunk.map(async (ticket) => {
        const processed = await this.processTicketWithRetry(ticket, options, maxRetries);
        
        // Thread-safe update of batch result
        this.updateBatchResultFromTicketResult(batchResult, processed, ticket);

        // Track failed tickets
        if (!processed.success) {
          failedTickets.push({
            ticket,
            attempts: processed.attempts,
            lastError: processed.error
          });
        }

        return processed;
      });

      // Wait for chunk to complete
      await Promise.all(chunkPromises);
      
      // Memory management after each concurrent chunk
      await this.manageMemory(options);
      
      // Yield to UI
      await this.yieldToUI();
    }
  }

  /**
   * Chunk array into smaller arrays for concurrent processing
   */
  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  /**
   * Sleep utility for delays
   */
  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Processes a single ticket (same logic as original but with better error handling)
   */
  private async processTicket(
    ticket: JiraIssue,
    options: BulkImportOptions
  ): Promise<'created' | 'updated' | 'skipped'> {
    // Validate ticket data
    if (!ticket.fields?.summary) {
      throw new Error('Invalid ticket data: missing fields or summary');
    }

    // Determine file path
    const folder = options.organizeByProject && ticket.fields.project
      ? `${this.syncFolder}/${ticket.fields.project.key}`
      : this.syncFolder;
    
    await this.ensureFolder(folder);
    
    const fileName = `${ticket.key}.md`;
    const filePath = normalizePath(`${folder}/${fileName}`);

    // Check if file exists
    const existingFile = this.plugin.app.vault.getAbstractFileByPath(filePath);
    
    if (existingFile && options.skipExisting) {
      return 'skipped';
    }

    // Create note content with enhanced metadata
    const content = this.createNoteContent(ticket);

    if (existingFile instanceof TFile) {
      // Update existing file
      await this.plugin.app.vault.modify(existingFile, content);
      return 'updated';
    } else {
      // Create new file
      await this.plugin.app.vault.create(filePath, content);
      return 'created';
    }
  }

  /**
   * Creates enhanced note content from Jira ticket
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
   * Updates phase and recalculates capabilities
   */
  private updatePhase(phase: SyncPhase): void {
    if (!this.state) return;

    this.state.progress.phase = phase;
    this.state.progress.phaseStartTime = Date.now();
    
    const capabilities = PHASE_CAPABILITIES[phase];
    this.state.progress.allowCancel = capabilities.allowCancel;
    this.state.progress.allowPause = capabilities.allowPause;

    // Calculate estimated time remaining
    this.updateTimeEstimate();
  }

  /**
   * Updates progress from batch results
   */
  private updateProgressFromBatch(batchResult: BatchResult): void {
    if (!this.state) return;

    // Memory usage tracking
    this.state.memoryUsage = Math.max(this.state.memoryUsage, batchResult.memoryUsage);
  }

  /**
   * Updates estimated time remaining
   */
  private updateTimeEstimate(): void {
    if (!this.state || this.state.progress.processed === 0) {
      this.state!.progress.estimatedTimeRemaining = null;
      return;
    }

    const elapsed = Date.now() - this.state.startTime;
    const avgTimePerTicket = elapsed / this.state.progress.processed;
    const remaining = this.state.progress.total - this.state.progress.processed;
    
    this.state.progress.estimatedTimeRemaining = Math.ceil((avgTimePerTicket * remaining) / 1000);
  }

  /**
   * Reports progress to callback with error handling
   */
  private reportProgress(callback?: (progress: BulkImportProgress) => void): void {
    if (!callback || !this.state) return;

    try {
      callback(this.state.progress);
    } catch (error) {
      console.error('Progress callback error:', error);
    }
  }

  /**
   * Non-blocking yield to UI thread
   */
  private async yieldToUI(): Promise<void> {
    return new Promise(resolve => {
      if (typeof setImmediate !== 'undefined') {
        setImmediate(resolve);
      } else {
        setTimeout(resolve, 0);
      }
    });
  }

  /**
   * Memory management with automatic garbage collection and optimization
   */
  private async manageMemory(options: BulkImportOptions): Promise<void> {
    const currentMemory = this.getCurrentMemoryUsage();
    const memoryLimit = options.memoryLimit || 100; // 100MB default
    const warningThreshold = memoryLimit * 0.8; // 80% of limit
    const criticalThreshold = memoryLimit * 0.95; // 95% of limit

    // Progressive memory management based on usage
    if (currentMemory > criticalThreshold) {
      // Critical memory usage - aggressive cleanup
      await this.performAggressiveCleanup();
      
      if (this.state) {
        this.state.progress.warnings.push(`Critical memory usage: ${currentMemory}MB - performed cleanup`);
      }
    } else if (currentMemory > warningThreshold) {
      // High memory usage - gentle cleanup
      await this.performGentleCleanup();
    }

    // Update memory tracking
    if (this.state) {
      this.state.memoryUsage = Math.max(this.state.memoryUsage, currentMemory);
    }

    // Adaptive batch size based on memory pressure
    if (this.state && currentMemory > warningThreshold) {
      const originalBatchSize = options.batchSize || BULK_IMPORT_DEFAULTS.BATCH_SIZE;
      const reductionFactor = Math.max(0.5, (memoryLimit - currentMemory) / memoryLimit);
      const adaptiveBatchSize = Math.max(5, Math.floor(originalBatchSize * reductionFactor));
      
      if (adaptiveBatchSize < this.state.progress.batchSize) {
        this.state.progress.batchSize = adaptiveBatchSize;
        this.state.progress.warnings.push(
          `Reduced batch size to ${adaptiveBatchSize} due to memory pressure`
        );
      }
    }
  }

  /**
   * Perform gentle memory cleanup
   */
  private async performGentleCleanup(): Promise<void> {
    // Clear old batch results (keep only last 5 batches)
    if (this.batchResults.length > 5) {
      this.batchResults = this.batchResults.slice(-5);
    }

    // Force minor garbage collection if available
    if (global.gc) {
      global.gc();
    }

    // Yield to allow cleanup
    await this.yieldToUI();
  }

  /**
   * Perform aggressive memory cleanup
   */
  private async performAggressiveCleanup(): Promise<void> {
    // Clear most batch results (keep only last 2 batches)
    if (this.batchResults.length > 2) {
      this.batchResults = this.batchResults.slice(-2);
    }

    // Clear old processed ticket IDs (keep only last 100)
    if (this.state && this.state.progress.processedTicketIds.length > 100) {
      this.state.progress.processedTicketIds = this.state.progress.processedTicketIds.slice(-100);
    }

    // Clear old errors (keep only last 20)
    if (this.state && this.state.progress.errors.length > 20) {
      this.state.progress.errors = this.state.progress.errors.slice(-20);
    }

    // Clear old warnings (keep only last 10)
    if (this.state && this.state.progress.warnings.length > 10) {
      this.state.progress.warnings = this.state.progress.warnings.slice(-10);
    }

    // Force major garbage collection if available
    if (global.gc) {
      global.gc();
    }

    // Multiple yields to allow thorough cleanup
    await this.yieldToUI();
    await this.yieldToUI();
    await this.yieldToUI();
  }

  /**
   * Gets current memory usage in MB
   */
  private getCurrentMemoryUsage(): number {
    if (typeof process !== 'undefined' && process.memoryUsage) {
      return Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
    }
    return 0;
  }

  /**
   * Starts memory monitoring
   */
  private startMemoryMonitoring(): void {
    this.memoryWatcher = setInterval(() => {
      if (this.state?.isRunning) {
        const currentMemory = this.getCurrentMemoryUsage();
        this.state.memoryUsage = Math.max(this.state.memoryUsage, currentMemory);
      }
    }, 5000); // Check every 5 seconds
  }

  /**
   * Finalizes bulk import operation
   */
  private async finalizeBulkImport(options: BulkImportOptions): Promise<void> {
    if (!this.state) return;

    // Clear resume state on successful completion
    if (options.enableResume) {
      await this.clearImportState();
    }

    // Final progress update
    this.state.progress.estimatedTimeRemaining = 0;
  }

  /**
   * Creates final import result
   */
  private createResult(): BulkImportResult {
    if (!this.state) {
      throw new Error('No import state available');
    }

    const duration = Date.now() - this.state.startTime;
    const total = this.state.progress.processed + this.state.progress.failed;
    const averageTime = total > 0 ? duration / total : 0;

    // Calculate performance metrics
    const totalBatchTime = this.batchResults.reduce((sum, batch) => sum + batch.processingTime, 0);
    const averageBatchTime = this.batchResults.length > 0 ? totalBatchTime / this.batchResults.length : 0;
    const ticketsPerSecond = duration > 0 ? (this.state.progress.processed / (duration / 1000)) : 0;
    const memoryEfficiency = this.state.progress.processed > 0 ? this.state.progress.processed / this.state.memoryUsage : 0;

    return {
      totalImported: this.state.progress.processed,
      failedImports: this.state.progress.failed,
      skipped: this.state.progress.duplicatesFound,
      updated: this.state.progress.ticketsUpdated,
      batches: this.state.progress.currentBatch,
      errors: [...this.state.progress.errors],
      duration,
      averageTimePerTicket: averageTime,
      memoryPeak: this.state.memoryUsage,
      cancelled: this.state.shouldCancel,
      performanceMetrics: {
        averageBatchTime,
        ticketsPerSecond,
        memoryEfficiency
      }
    };
  }

  /**
   * Creates structured sync error
   */
  private createSyncError(
    code: string, 
    message: string, 
    phase: SyncPhase, 
    ticketId?: string
  ): SyncError {
    return {
      code,
      message,
      phase,
      timestamp: Date.now(),
      retryAttempt: 0,
      maxRetries: 3,
      ticketId,
      userAction: 'bulk_import'
    };
  }

  /**
   * Utility methods for folder management
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

  /**
   * Formats date for display
   */
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
    if (!this.state) return;

    const stateData = {
      resumeToken: this.state.progress.resumeToken,
      jqlQuery: '', // Would be passed from options
      batchSize: this.state.progress.batchSize,
      processedTicketIds: this.state.progress.processedTicketIds,
      progress: this.state.progress,
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

  private async clearImportState(): Promise<void> {
    const data = await this.plugin.loadData() || {};
    delete data.bulkImportState;
    await this.plugin.saveData(data);
  }

  /**
   * Cleanup resources
   */
  private cleanup(): void {
    if (this.memoryWatcher) {
      clearInterval(this.memoryWatcher);
      this.memoryWatcher = null;
    }

    if (this.state) {
      this.state.isRunning = false;
      this.state.abortController.abort('Import completed');
    }

    // Clear batch results to free memory
    this.batchResults = [];
  }
}