/**
 * Bulk Import Progress Model
 * 
 * Extended progress tracking for bulk import operations with resume capabilities,
 * batch processing, and comprehensive statistics tracking.
 * 
 * This file contains the core BulkImportProgress interface and related utilities
 * as specified in the data model specification.
 */

// =============================================================================
// DEPENDENCIES
// =============================================================================

// Note: These would typically be imported from separate files in a full implementation
// For now, we'll define the dependencies here to match the test expectations

/**
 * Phases of a sync operation lifecycle
 */
export enum SyncPhase {
  INITIALIZING = 'initializing',
  SEARCHING = 'searching',      // Executing JQL query
  DOWNLOADING = 'downloading',  // Fetching issue details
  PROCESSING = 'processing',    // Creating/updating vault files
  FINALIZING = 'finalizing',    // Cleanup and state updates
  COMPLETE = 'complete',
  CANCELLED = 'cancelled',
  ERROR = 'error'
}

/**
 * Structured error information for operation failures
 */
export interface SyncError {
  // Error identification
  code: string;              // Error code (e.g., "API_RATE_LIMIT", "NETWORK_ERROR")
  message: string;           // Human-readable error message
  
  // Context
  phase: SyncPhase;          // Phase where error occurred
  timestamp: number;         // When error occurred
  
  // Technical details
  originalError?: Error;     // Underlying JavaScript error
  apiResponse?: {            // Jira API error response
    status: number;
    statusText: string;
    body: any;
  };
  
  // Retry information
  retryAttempt: number;      // Which retry attempt failed (0 = first attempt)
  maxRetries: number;        // Maximum retry attempts allowed
  nextRetryAt?: number;      // Timestamp when next retry will occur
  
  // User context
  ticketId?: string;         // Ticket ID related to error (if applicable)
  userAction?: string;       // User action that triggered the error
}

/**
 * Real-time progress tracking for sync operations
 */
export interface SyncProgress {
  // Progress metrics
  current: number;           // Current item being processed
  total: number;             // Total items to process
  processed: number;         // Successfully processed items
  failed: number;            // Failed items
  
  // Phase tracking
  phase: SyncPhase;
  phaseStartTime: number;    // Timestamp when current phase started
  
  // Overall operation
  startTime: number;         // Sync operation start timestamp
  estimatedTimeRemaining: number | null; // Seconds (calculated)
  
  // Error collection
  errors: SyncError[];
  warnings: string[];
  
  // Cancellation
  cancellationRequested: boolean;
  cancellationToken: string | null;
}

// =============================================================================
// BULK IMPORT PROGRESS INTERFACE
// =============================================================================

/**
 * Extended progress tracking for initial bulk import operations
 * 
 * This interface extends SyncProgress with additional capabilities specific
 * to bulk import operations, including batch processing, resume tokens,
 * and import-specific statistics.
 * 
 * Business Rules:
 * - resumeToken: Set when import is paused/interrupted, cleared on completion
 * - duplicatesFound + newTicketsCreated + ticketsUpdated = processed
 * - allowCancel typically true during download/processing phases
 * - allowPause depends on current phase (disabled during finalizing)
 * - currentBatch must be > 0 and <= totalBatches
 * - batchSize must be > 0
 * - processedTicketIds.length should equal processed count
 */
export interface BulkImportProgress extends SyncProgress {
  // Batch processing
  currentBatch: number;      // Current batch being processed (1-based)
  totalBatches: number;      // Total batches to process
  batchSize: number;         // Items per batch
  
  // Resume capability
  resumeToken: string | null; // Token to resume from interruption
  processedTicketIds: string[]; // IDs of successfully processed tickets
  
  // Import-specific state tracking
  duplicatesFound: number;    // Existing tickets skipped
  newTicketsCreated: number;  // New tickets created in vault
  ticketsUpdated: number;     // Existing tickets updated
  
  // User interaction controls
  allowCancel: boolean;       // Whether cancellation is allowed
  allowPause: boolean;        // Whether pausing is allowed
  isPaused: boolean;         // Current pause state
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Type guard to check if progress is BulkImportProgress
 */
export function isBulkImportProgress(progress: SyncProgress): progress is BulkImportProgress {
  return (progress as BulkImportProgress).currentBatch !== undefined &&
         (progress as BulkImportProgress).totalBatches !== undefined &&
         (progress as BulkImportProgress).batchSize !== undefined;
}

/**
 * Validates that bulk import progress statistics are consistent
 * 
 * Business rule: duplicatesFound + newTicketsCreated + ticketsUpdated = processed
 * 
 * @param progress - The bulk import progress to validate
 * @returns true if statistics are consistent, false otherwise
 */
export function validateBulkImportStatistics(progress: BulkImportProgress): boolean {
  const statsSum = progress.duplicatesFound + progress.newTicketsCreated + progress.ticketsUpdated;
  return statsSum === progress.processed;
}

/**
 * Validates that general progress metrics are consistent
 * 
 * @param progress - The sync progress to validate
 * @returns true if progress metrics are valid, false otherwise
 */
export function validateSyncProgress(progress: SyncProgress): boolean {
  return progress.current <= progress.total &&
         progress.processed <= progress.current &&
         progress.processed >= 0 &&
         progress.failed >= 0 &&
         progress.current >= 0 &&
         progress.total > 0;
}

/**
 * Validates that batch information is consistent
 * 
 * @param progress - The bulk import progress to validate
 * @returns true if batch information is valid, false otherwise
 */
export function validateBatchProgress(progress: BulkImportProgress): boolean {
  return progress.currentBatch > 0 &&
         progress.currentBatch <= progress.totalBatches &&
         progress.totalBatches > 0 &&
         progress.batchSize > 0;
}

/**
 * Creates a resume token for the current import state
 * 
 * @param progress - Current bulk import progress
 * @returns Resume token string
 */
export function createResumeToken(progress: BulkImportProgress): string {
  return `resume_batch_${progress.currentBatch}_offset_${progress.current}`;
}

/**
 * Parses a resume token to extract batch and offset information
 * 
 * @param token - Resume token to parse
 * @returns Object with batch and offset, or null if invalid
 */
export function parseResumeToken(token: string): { batch: number; offset: number } | null {
  const match = token.match(/^resume_batch_(\d+)_offset_(\d+)$/);
  if (!match) return null;
  
  return {
    batch: parseInt(match[1], 10),
    offset: parseInt(match[2], 10)
  };
}

/**
 * Calculates progress percentage for bulk import
 * 
 * @param progress - Bulk import progress
 * @returns Progress percentage (0-100)
 */
export function calculateProgressPercentage(progress: BulkImportProgress): number {
  if (progress.total === 0) return 0;
  return Math.round((progress.current / progress.total) * 100);
}

/**
 * Determines if pause is allowed for the current phase
 * 
 * @param phase - Current sync phase
 * @returns true if pause is allowed, false otherwise
 */
export function isPauseAllowedForPhase(phase: SyncPhase): boolean {
  return phase === SyncPhase.DOWNLOADING || phase === SyncPhase.PROCESSING;
}

/**
 * Determines if cancellation is allowed for the current phase
 * 
 * @param phase - Current sync phase
 * @returns true if cancellation is allowed, false otherwise
 */
export function isCancellationAllowedForPhase(phase: SyncPhase): boolean {
  return phase !== SyncPhase.FINALIZING && 
         phase !== SyncPhase.COMPLETE && 
         phase !== SyncPhase.CANCELLED;
}

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * Default values for bulk import operations
 */
export const BULK_IMPORT_DEFAULTS = {
  BATCH_SIZE: 50,
  MAX_RESULTS: 1000,
  ALLOW_CANCEL: true,
  ALLOW_PAUSE: true,
  IS_PAUSED: false,
  SYNC_INTERVAL_MINUTES: 15,
  MAX_RETRIES: 3
} as const;

/**
 * Pause/resume capability matrix by phase
 */
export const PHASE_CAPABILITIES = {
  [SyncPhase.INITIALIZING]: { allowPause: false, allowCancel: true },
  [SyncPhase.SEARCHING]: { allowPause: false, allowCancel: true },
  [SyncPhase.DOWNLOADING]: { allowPause: true, allowCancel: true },
  [SyncPhase.PROCESSING]: { allowPause: true, allowCancel: true },
  [SyncPhase.FINALIZING]: { allowPause: false, allowCancel: false },
  [SyncPhase.COMPLETE]: { allowPause: false, allowCancel: false },
  [SyncPhase.CANCELLED]: { allowPause: false, allowCancel: false },
  [SyncPhase.ERROR]: { allowPause: false, allowCancel: true }
} as const;