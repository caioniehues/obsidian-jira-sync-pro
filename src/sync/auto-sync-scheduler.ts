/**
 * Auto-Sync Scheduler for Obsidian Jira Sync Pro
 * 
 * This module provides automatic synchronization scheduling with configurable intervals,
 * failure recovery, retry logic, and integration with the JQL query engine.
 * 
 * Key features:
 * - Configurable sync intervals (1-60 minutes)
 * - Exponential backoff retry logic with maximum attempts
 * - Memory-efficient operation (<50MB for 500 tickets)
 * - Integration with Obsidian plugin lifecycle
 * - Status reporting and error handling
 * - Timer-based scheduling with proper cleanup
 */

import { JQLQueryEngine, JQLQueryOptions, JQLQueryResult, JiraIssue } from '../enhanced-sync/jql-query-engine';
import { JiraClient } from '../jira-bases-adapter/jira-client';
import { SyncPhase, SyncError, ERROR_CODES, USER_ACTIONS, UserAction } from '../types/sync-types';
import { 
  SyncProgress, 
  createSyncProgress, 
  updateSyncProgress, 
  collectSyncError,
  requestCancellation
} from '../enhanced-sync/sync-progress-model';

// ============================================================================
// Configuration and Types
// ============================================================================

/**
 * Auto-sync scheduler configuration
 */
export interface AutoSyncConfig {
  // Timing configuration
  intervalMinutes: number;          // Sync interval (1-60 minutes)
  enableAutoSync: boolean;          // Master enable/disable
  
  // JQL Configuration
  jql: string;                      // JQL query to execute
  maxResults: number;               // Maximum results per sync (memory management)
  batchSize: number;                // Batch size for processing (memory management)
  fields?: string[];                // Fields to retrieve
  
  // Retry configuration
  maxRetries: number;               // Maximum retry attempts (0-5)
  retryBackoffMultiplier: number;   // Exponential backoff multiplier
  maxRetryDelayMinutes: number;     // Maximum delay between retries
  
  // Resource management
  memoryLimitMB: number;            // Memory limit for sync operations
  timeoutMinutes: number;           // Maximum sync operation duration
}

/**
 * Auto-sync operation status
 */
export interface AutoSyncStatus {
  isEnabled: boolean;
  isRunning: boolean;
  nextSyncTime: number | null;      // Timestamp of next scheduled sync
  lastSyncTime: number | null;      // Timestamp of last completed sync
  lastSyncResult: 'success' | 'error' | 'cancelled' | null;
  
  // Current operation
  currentProgress: SyncProgress | null;
  
  // Statistics
  totalSyncsCompleted: number;
  totalTicketsProcessed: number;
  totalErrors: number;
  
  // Recent activity
  recentErrors: SyncError[];        // Last 10 errors
  averageSyncDuration: number;      // Average sync duration in milliseconds
}

/**
 * Sync completion callback
 */
export type SyncCompletionCallback = (result: AutoSyncResult) => void;

/**
 * Progress callback
 */
export type ProgressCallback = (progress: SyncProgress) => void;

/**
 * Auto-sync operation result
 */
export interface AutoSyncResult {
  success: boolean;
  ticketsProcessed: number;
  duration: number;                 // Duration in milliseconds
  error?: SyncError;
  issues?: JiraIssue[];
  wasManualTrigger?: boolean;
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: AutoSyncConfig = {
  intervalMinutes: 15,
  enableAutoSync: true,
  jql: '',
  maxResults: 500,                  // Memory limit consideration
  batchSize: 25,                    // Optimal batch size for Obsidian
  maxRetries: 3,
  retryBackoffMultiplier: 2.0,
  maxRetryDelayMinutes: 15,
  memoryLimitMB: 50,
  timeoutMinutes: 10
};

const MAX_RECENT_ERRORS = 10;
const MIN_INTERVAL_MINUTES = 1;
const MAX_INTERVAL_MINUTES = 60;
const MEMORY_CHECK_INTERVAL_MS = 5000; // Check memory every 5 seconds during sync

// ============================================================================
// Auto-Sync Scheduler Implementation
// ============================================================================

/**
 * Auto-sync scheduler with failure recovery and retry logic
 */
export class AutoSyncScheduler {
  private config: AutoSyncConfig;
  private jqlQueryEngine: JQLQueryEngine;
  private jiraClient: JiraClient;
  
  // Timer management
  private syncTimer: NodeJS.Timeout | null = null;
  private retryTimer: NodeJS.Timeout | null = null;
  private memoryMonitorTimer: NodeJS.Timeout | null = null;
  
  // State tracking
  private status: AutoSyncStatus;
  private currentSyncAbortController: AbortController | null = null;
  private isShuttingDown: boolean = false;
  
  // Callbacks
  private onProgress: ProgressCallback | null = null;
  private onCompletion: SyncCompletionCallback | null = null;
  
  // Performance tracking
  private syncDurations: number[] = []; // Last 10 sync durations for averaging
  
  constructor(jiraClient: JiraClient, config?: Partial<AutoSyncConfig>) {
    this.jiraClient = jiraClient;
    this.jqlQueryEngine = new JQLQueryEngine(jiraClient);
    this.config = { ...DEFAULT_CONFIG, ...config };
    
    this.status = this.createInitialStatus();
    
    // Validate configuration
    this.validateConfig();
  }
  
  // ============================================================================
  // Public API
  // ============================================================================
  
  /**
   * Starts the auto-sync scheduler
   */
  async start(): Promise<void> {
    if (this.isShuttingDown) {
      throw new Error('Cannot start scheduler during shutdown');
    }
    
    if (!this.config.enableAutoSync) {
      console.log('Auto-sync is disabled');
      return;
    }
    
    if (this.syncTimer !== null) {
      console.log('Auto-sync scheduler already running');
      return;
    }
    
    console.log(`Starting auto-sync scheduler with ${this.config.intervalMinutes} minute intervals`);
    
    this.status.isEnabled = true;
    this.scheduleNextSync();
  }
  
  /**
   * Stops the auto-sync scheduler
   */
  async stop(): Promise<void> {
    console.log('Stopping auto-sync scheduler');
    
    this.isShuttingDown = true;
    this.status.isEnabled = false;
    
    // Clear all timers
    this.clearAllTimers();
    
    // Cancel current sync operation
    if (this.status.isRunning && this.currentSyncAbortController) {
      console.log('Cancelling current sync operation');
      this.currentSyncAbortController.abort();
      
      // Wait briefly for cancellation to complete
      await this.sleep(1000);
    }
    
    this.isShuttingDown = false;
    console.log('Auto-sync scheduler stopped');
  }
  
  /**
   * Manually triggers a sync operation (bypasses schedule)
   */
  async triggerManualSync(): Promise<AutoSyncResult> {
    if (this.status.isRunning) {
      throw new Error('Sync operation already in progress');
    }
    
    console.log('Manual sync triggered');
    return await this.executeSyncOperation(true);
  }
  
  /**
   * Updates scheduler configuration
   */
  updateConfig(newConfig: Partial<AutoSyncConfig>): void {
    const wasEnabled = this.status.isEnabled;
    
    // Update configuration
    this.config = { ...this.config, ...newConfig };
    this.validateConfig();
    
    // Restart scheduler if interval changed and was running
    if (wasEnabled && this.syncTimer !== null) {
      this.clearAllTimers();
      if (this.config.enableAutoSync) {
        this.scheduleNextSync();
      } else {
        this.status.isEnabled = false;
      }
    }
    
    console.log(`Auto-sync config updated: ${JSON.stringify(newConfig)}`);
  }
  
  /**
   * Gets current scheduler status
   */
  getStatus(): AutoSyncStatus {
    return { ...this.status }; // Return copy to prevent modification
  }

  /**
   * Getters for compatibility with tests
   */
  get isRunning(): boolean {
    return this.status.isRunning;
  }

  get lastSync(): Date | undefined {
    return this.status.lastSyncTime ? new Date(this.status.lastSyncTime) : undefined;
  }

  get nextSync(): Date | undefined {
    return this.status.nextSyncTime ? new Date(this.status.nextSyncTime) : undefined;
  }

  get syncCount(): number {
    return this.status.totalSyncsCompleted;
  }

  get errorCount(): number {
    return this.status.totalErrors;
  }
  
  /**
   * Sets progress callback
   */
  setProgressCallback(callback: ProgressCallback | null): void {
    this.onProgress = callback;
  }
  
  /**
   * Sets completion callback
   */
  setCompletionCallback(callback: SyncCompletionCallback | null): void {
    this.onCompletion = callback;
  }
  
  /**
   * Cancels current sync operation
   */
  async cancelCurrentSync(): Promise<void> {
    if (!this.status.isRunning) {
      return;
    }
    
    console.log('Cancelling current sync operation');
    
    if (this.currentSyncAbortController) {
      this.currentSyncAbortController.abort();
    }
    
    // Update progress to reflect cancellation
    if (this.status.currentProgress) {
      this.status.currentProgress = requestCancellation(
        this.status.currentProgress,
        Date.now().toString()
      );
      this.reportProgress(this.status.currentProgress);
    }
  }
  
  // ============================================================================
  // Core Sync Logic
  // ============================================================================
  
  /**
   * Schedules the next sync operation
   */
  private scheduleNextSync(): void {
    if (!this.config.enableAutoSync || this.isShuttingDown) {
      return;
    }
    
    const intervalMs = this.config.intervalMinutes * 60 * 1000;
    this.status.nextSyncTime = Date.now() + intervalMs;
    
    this.syncTimer = setTimeout(() => {
      this.executeSyncOperation(false).catch(error => {
        console.error('Scheduled sync operation failed:', error);
      });
    }, intervalMs);
    
    console.log(`Next sync scheduled for ${new Date(this.status.nextSyncTime).toLocaleString()}`);
  }
  
  /**
   * Executes a sync operation with error handling and retry logic
   */
  private async executeSyncOperation(isManual: boolean): Promise<AutoSyncResult> {
    if (this.status.isRunning) {
      throw new Error('Sync operation already in progress');
    }
    
    const startTime = Date.now();
    let retryAttempt = 0;
    let lastError: SyncError | null = null;
    
    // Initialize operation state
    this.status.isRunning = true;
    this.status.currentProgress = createSyncProgress(0); // Will be updated once we know total
    this.currentSyncAbortController = new AbortController();
    
    try {
      while (retryAttempt <= this.config.maxRetries) {
        try {
          // Check if operation was cancelled
          if (this.currentSyncAbortController.signal.aborted) {
            throw new Error('Operation cancelled');
          }
          
          // Execute the sync
          const result = await this.performSyncOperation(isManual, retryAttempt);
          
          // Success - update statistics and schedule next sync
          this.recordSuccessfulSync(Date.now() - startTime, result.ticketsProcessed);
          
          if (!isManual) {
            this.scheduleNextSync();
          }
          
          return result;
          
        } catch (error: any) {
          retryAttempt++;
          lastError = this.createSyncError(error, retryAttempt - 1);
          
          // Add error to status
          this.status.recentErrors.unshift(lastError);
          if (this.status.recentErrors.length > MAX_RECENT_ERRORS) {
            this.status.recentErrors = this.status.recentErrors.slice(0, MAX_RECENT_ERRORS);
          }
          
          // Check if we should retry
          if (retryAttempt <= this.config.maxRetries && this.isRetryableError(error)) {
            const delay = this.calculateRetryDelay(retryAttempt);
            console.log(`Sync failed, retrying in ${delay}ms (attempt ${retryAttempt}/${this.config.maxRetries})`);
            
            await this.sleep(delay);
            continue;
          } else {
            // Max retries reached or non-retryable error
            break;
          }
        }
      }
      
      // All retries failed
      const result: AutoSyncResult = {
        success: false,
        ticketsProcessed: 0,
        duration: Date.now() - startTime,
        error: lastError!,
        wasManualTrigger: isManual
      };
      
      this.recordFailedSync();
      
      if (!isManual) {
        this.scheduleNextSync();
      }
      
      return result;
      
    } finally {
      // Cleanup operation state
      this.status.isRunning = false;
      this.status.currentProgress = null;
      this.currentSyncAbortController = null;
      
      if (this.memoryMonitorTimer) {
        clearInterval(this.memoryMonitorTimer);
        this.memoryMonitorTimer = null;
      }
    }
  }
  
  /**
   * Performs the actual sync operation
   */
  private async performSyncOperation(isManual: boolean, retryAttempt: number): Promise<AutoSyncResult> {
    const startTime = Date.now();
    
    console.log(`${isManual ? 'Manual' : 'Auto'} sync starting (attempt ${retryAttempt + 1})`);
    
    // Start memory monitoring
    this.startMemoryMonitoring();
    
    // Set up query options
    const queryOptions: JQLQueryOptions = {
      jql: this.config.jql,
      maxResults: this.config.maxResults,
      batchSize: this.config.batchSize,
      fields: this.config.fields,
      enableRetry: true,
      signal: this.currentSyncAbortController!.signal,
      onProgress: (current: number, total: number, phase: any) => {
        this.updateSyncProgress(current, total, phase);
      }
    };
    
    // Execute the query
    const result: JQLQueryResult = await this.jqlQueryEngine.executeQuery(queryOptions);
    
    // Process results (simulate processing phase)
    await this.processResults(result);
    
    const duration = Date.now() - startTime;
    
    console.log(`Sync completed successfully: ${result.issues.length} tickets processed in ${duration}ms`);
    
    const syncResult: AutoSyncResult = {
      success: true,
      ticketsProcessed: result.issues.length,
      duration,
      issues: result.issues,
      wasManualTrigger: isManual
    };
    
    // Notify completion callback
    if (this.onCompletion) {
      try {
        this.onCompletion(syncResult);
      } catch (error) {
        console.error('Completion callback error:', error);
      }
    }
    
    return syncResult;
  }
  
  /**
   * Processes sync results (placeholder for actual processing logic)
   */
  private async processResults(result: JQLQueryResult): Promise<void> {
    if (this.status.currentProgress) {
      this.status.currentProgress = updateSyncProgress(this.status.currentProgress, {
        phase: SyncPhase.PROCESSING
      });
      this.reportProgress(this.status.currentProgress);
    }
    
    // Simulate processing time (would be actual Obsidian vault updates)
    const processingDelay = Math.min(result.issues.length * 10, 5000); // Max 5 seconds
    await this.sleep(processingDelay);
    
    if (this.status.currentProgress) {
      this.status.currentProgress = updateSyncProgress(this.status.currentProgress, {
        phase: SyncPhase.COMPLETE,
        processed: result.issues.length
      });
      this.reportProgress(this.status.currentProgress);
    }
  }
  
  // ============================================================================
  // Progress and Status Management
  // ============================================================================
  
  /**
   * Updates sync progress and reports to callback
   */
  private updateSyncProgress(current: number, total: number, phase: string): void {
    if (!this.status.currentProgress) {
      this.status.currentProgress = createSyncProgress(total);
    }
    
    // Map query phase to sync phase
    const syncPhase = this.mapQueryPhaseToSyncPhase(phase);
    
    this.status.currentProgress = updateSyncProgress(this.status.currentProgress, {
      current,
      total,
      phase: syncPhase
    });
    
    this.reportProgress(this.status.currentProgress);
  }
  
  /**
   * Reports progress to callback
   */
  private reportProgress(progress: SyncProgress): void {
    if (this.onProgress) {
      try {
        this.onProgress(progress);
      } catch (error) {
        console.error('Progress callback error:', error);
      }
    }
  }
  
  /**
   * Maps JQL query phase to sync phase
   */
  private mapQueryPhaseToSyncPhase(queryPhase: string): SyncPhase {
    switch (queryPhase) {
      case 'searching':
        return SyncPhase.SEARCHING;
      case 'downloading':
        return SyncPhase.DOWNLOADING;
      case 'processing':
        return SyncPhase.PROCESSING;
      case 'complete':
        return SyncPhase.COMPLETE;
      default:
        return SyncPhase.DOWNLOADING; // Default fallback
    }
  }
  
  // ============================================================================
  // Memory Management
  // ============================================================================
  
  /**
   * Starts memory monitoring during sync operations
   */
  private startMemoryMonitoring(): void {
    this.memoryMonitorTimer = setInterval(() => {
      this.checkMemoryUsage();
    }, MEMORY_CHECK_INTERVAL_MS);
  }
  
  /**
   * Checks memory usage and aborts if limit exceeded
   */
  private checkMemoryUsage(): void {
    try {
      if (typeof process !== 'undefined' && process.memoryUsage) {
        const usage = process.memoryUsage();
        const heapUsedMB = usage.heapUsed / 1024 / 1024;
        
        if (heapUsedMB > this.config.memoryLimitMB) {
          console.warn(`Memory limit exceeded: ${heapUsedMB.toFixed(1)}MB > ${this.config.memoryLimitMB}MB`);
          
          if (this.currentSyncAbortController) {
            this.currentSyncAbortController.abort();
          }
        }
      }
    } catch (error) {
      // Memory monitoring is best-effort, don't fail sync if monitoring fails
      console.warn('Memory monitoring error:', error);
    }
  }
  
  // ============================================================================
  // Error Handling and Retry Logic
  // ============================================================================
  
  /**
   * Creates a structured sync error
   */
  private createSyncError(error: any, retryAttempt: number): SyncError {
    return {
      code: this.getErrorCode(error),
      message: error.message || 'Unknown error occurred',
      phase: this.status.currentProgress?.phase || SyncPhase.ERROR,
      timestamp: Date.now(),
      originalError: error instanceof Error ? error : new Error(error?.toString()),
      retryAttempt,
      maxRetries: this.config.maxRetries,
      userAction: USER_ACTIONS.AUTO_SYNC as UserAction
    };
  }
  
  /**
   * Determines error code based on error type
   */
  private getErrorCode(error: any): string {
    if (error?.status === 429) return ERROR_CODES.API_RATE_LIMIT;
    if (error?.status === 401) return ERROR_CODES.API_AUTH_FAILED;
    if (error?.status === 400) return ERROR_CODES.API_INVALID_JQL;
    if (error?.status >= 500) return ERROR_CODES.API_SERVER_ERROR;
    if (error?.message?.includes('Network')) return ERROR_CODES.NETWORK_ERROR;
    if (error?.message?.includes('aborted')) return ERROR_CODES.NETWORK_TIMEOUT;
    
    return ERROR_CODES.NETWORK_ERROR; // Default fallback
  }
  
  /**
   * Determines if an error is retryable
   */
  private isRetryableError(error: any): boolean {
    // Rate limiting - always retryable
    if (error?.status === 429) return true;
    
    // Server errors - retryable
    if (error?.status >= 500 && error?.status < 600) return true;
    
    // Network errors - retryable
    if (error?.message?.includes('Network')) return true;
    if (error?.message?.includes('timeout')) return true;
    if (error?.message?.includes('ECONNRESET')) return true;
    
    // Authentication and permission errors - not retryable
    if (error?.status === 401 || error?.status === 403) return false;
    
    // Invalid JQL - not retryable
    if (error?.status === 400) return false;
    
    // Cancellation - not retryable
    if (error?.message?.includes('aborted') || error?.message?.includes('cancelled')) return false;
    
    // Default to retryable for unknown errors
    return true;
  }
  
  /**
   * Calculates retry delay with exponential backoff
   */
  private calculateRetryDelay(attempt: number): number {
    const baseDelay = 1000; // 1 second base
    const maxDelay = this.config.maxRetryDelayMinutes * 60 * 1000;
    
    const exponentialDelay = baseDelay * Math.pow(this.config.retryBackoffMultiplier, attempt - 1);
    const jitter = Math.random() * 1000; // 0-1 second jitter
    
    return Math.min(exponentialDelay + jitter, maxDelay);
  }
  
  // ============================================================================
  // Statistics and Tracking
  // ============================================================================
  
  /**
   * Records a successful sync operation
   */
  private recordSuccessfulSync(duration: number, ticketsProcessed: number): void {
    this.status.lastSyncTime = Date.now();
    this.status.lastSyncResult = 'success';
    this.status.totalSyncsCompleted++;
    this.status.totalTicketsProcessed += ticketsProcessed;
    
    // Update average duration
    this.syncDurations.push(duration);
    if (this.syncDurations.length > 10) {
      this.syncDurations = this.syncDurations.slice(-10);
    }
    
    this.status.averageSyncDuration = this.syncDurations.reduce((a, b) => a + b, 0) / this.syncDurations.length;
    
    console.log(`Successful sync recorded: ${ticketsProcessed} tickets, ${duration}ms duration`);
  }
  
  /**
   * Records a failed sync operation
   */
  private recordFailedSync(): void {
    this.status.lastSyncTime = Date.now();
    this.status.lastSyncResult = 'error';
    this.status.totalErrors++;
    
    console.log('Failed sync recorded');
  }
  
  // ============================================================================
  // Utility Functions
  // ============================================================================
  
  /**
   * Creates initial status object
   */
  private createInitialStatus(): AutoSyncStatus {
    return {
      isEnabled: false,
      isRunning: false,
      nextSyncTime: null,
      lastSyncTime: null,
      lastSyncResult: null,
      currentProgress: null,
      totalSyncsCompleted: 0,
      totalTicketsProcessed: 0,
      totalErrors: 0,
      recentErrors: [],
      averageSyncDuration: 0
    };
  }
  
  /**
   * Validates scheduler configuration
   */
  private validateConfig(): void {
    if (this.config.intervalMinutes < MIN_INTERVAL_MINUTES || this.config.intervalMinutes > MAX_INTERVAL_MINUTES) {
      throw new Error(`Interval must be between ${MIN_INTERVAL_MINUTES} and ${MAX_INTERVAL_MINUTES} minutes`);
    }
    
    if (!this.config.jql || this.config.jql.trim().length === 0) {
      throw new Error('JQL query is required');
    }
    
    if (this.config.maxResults < 1 || this.config.maxResults > 1000) {
      throw new Error('Max results must be between 1 and 1000');
    }
    
    if (this.config.batchSize < 1 || this.config.batchSize > 100) {
      throw new Error('Batch size must be between 1 and 100');
    }
    
    if (this.config.maxRetries < 0 || this.config.maxRetries > 10) {
      throw new Error('Max retries must be between 0 and 10');
    }
  }
  
  /**
   * Clears all active timers
   */
  private clearAllTimers(): void {
    if (this.syncTimer) {
      clearTimeout(this.syncTimer);
      this.syncTimer = null;
    }
    
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    
    if (this.memoryMonitorTimer) {
      clearInterval(this.memoryMonitorTimer);
      this.memoryMonitorTimer = null;
    }
    
    this.status.nextSyncTime = null;
  }
  
  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}