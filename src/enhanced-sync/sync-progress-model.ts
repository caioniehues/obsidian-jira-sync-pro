/**
 * SyncProgress Data Model Implementation
 * 
 * This module provides interfaces and utility functions for tracking sync operation progress,
 * including phase transitions, time estimation, error collection, and cancellation handling.
 * 
 * Key features:
 * - Phase-based progress tracking with validation
 * - Time estimation algorithms
 * - Error collection with retry tracking
 * - Cancellation token management
 * - Extended bulk import progress tracking
 */

// ============================================================================
// Core Interfaces and Types
// ============================================================================

/**
 * Enumeration of sync operation phases
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

/**
 * Extended progress tracking for initial bulk import operations
 */
export interface BulkImportProgress extends SyncProgress {
  // Batch processing
  currentBatch: number;      // Current batch being processed (1-based)
  totalBatches: number;      // Total batches to process
  batchSize: number;         // Items per batch
  
  // Resume capability
  resumeToken: string | null; // Token to resume from interruption
  processedTicketIds: string[]; // IDs of successfully processed tickets
  
  // Import-specific state
  duplicatesFound: number;    // Existing tickets skipped
  newTicketsCreated: number;  // New tickets created in vault
  ticketsUpdated: number;     // Existing tickets updated
  
  // User interaction
  allowCancel: boolean;       // Whether cancellation is allowed
  allowPause: boolean;        // Whether pausing is allowed
  isPaused: boolean;         // Current pause state
}

// ============================================================================
// Constants and Configuration
// ============================================================================

/**
 * Maximum number of errors to keep in memory to prevent memory issues
 */
const MAX_ERROR_HISTORY = 100;

/**
 * Phase progression order for validation
 */
const PHASE_ORDER: SyncPhase[] = [
  SyncPhase.INITIALIZING,
  SyncPhase.SEARCHING,
  SyncPhase.DOWNLOADING,
  SyncPhase.PROCESSING,
  SyncPhase.FINALIZING,
  SyncPhase.COMPLETE
];

/**
 * Terminal phases that cannot transition to other phases
 */
const TERMINAL_PHASES: SyncPhase[] = [
  SyncPhase.COMPLETE,
  SyncPhase.CANCELLED,
  SyncPhase.ERROR
];

/**
 * Phase-specific time weighting for estimation
 * Higher values indicate phases that typically take longer
 */
const PHASE_TIME_WEIGHTS: Record<SyncPhase, number> = {
  [SyncPhase.INITIALIZING]: 0.1,
  [SyncPhase.SEARCHING]: 0.2,
  [SyncPhase.DOWNLOADING]: 1.5,  // Usually the longest phase
  [SyncPhase.PROCESSING]: 1.2,   // Second longest
  [SyncPhase.FINALIZING]: 0.1,
  [SyncPhase.COMPLETE]: 0,
  [SyncPhase.CANCELLED]: 0,
  [SyncPhase.ERROR]: 0
};

// ============================================================================
// Core Factory Functions
// ============================================================================

/**
 * Creates a new SyncProgress object with default values
 */
export function createSyncProgress(total: number): SyncProgress {
  const now = Date.now();
  
  return {
    current: 0,
    total: Math.max(total, 0), // Ensure non-negative
    processed: 0,
    failed: 0,
    phase: SyncPhase.INITIALIZING,
    phaseStartTime: now,
    startTime: now,
    estimatedTimeRemaining: null,
    errors: [],
    warnings: [],
    cancellationRequested: false,
    cancellationToken: null
  };
}

// ============================================================================
// Progress Update Functions
// ============================================================================

/**
 * Updates sync progress with new values
 * Ensures data consistency and handles phase transitions
 */
export function updateSyncProgress<T extends SyncProgress>(
  progress: T,
  updates: Partial<T>
): T {
  const updatedProgress = { ...progress };
  
  // Handle numeric fields with validation
  if (updates.current !== undefined) {
    updatedProgress.current = Math.max(0, updates.current);
  }
  if (updates.total !== undefined) {
    updatedProgress.total = Math.max(0, updates.total);
  }
  if (updates.processed !== undefined) {
    updatedProgress.processed = Math.max(0, updates.processed);
  }
  if (updates.failed !== undefined) {
    updatedProgress.failed = Math.max(0, updates.failed);
  }
  
  // Handle phase transitions
  if (updates.phase !== undefined && updates.phase !== progress.phase) {
    updatedProgress.phase = updates.phase;
    updatedProgress.phaseStartTime = Date.now();
  }
  
  // Handle other fields
  if (updates.estimatedTimeRemaining !== undefined) {
    updatedProgress.estimatedTimeRemaining = updates.estimatedTimeRemaining;
  }
  if (updates.startTime !== undefined) {
    updatedProgress.startTime = updates.startTime;
  }
  if (updates.warnings !== undefined) {
    updatedProgress.warnings = updates.warnings;
  }
  if (updates.errors !== undefined) {
    updatedProgress.errors = updates.errors;
  }
  if (updates.cancellationRequested !== undefined) {
    updatedProgress.cancellationRequested = updates.cancellationRequested;
  }
  if (updates.cancellationToken !== undefined) {
    updatedProgress.cancellationToken = updates.cancellationToken;
  }
  
  // Handle BulkImportProgress-specific fields (if applicable)
  const bulkUpdates = updates as any;
  const bulkProgress = updatedProgress as any;
  
  if (bulkUpdates.currentBatch !== undefined) {
    bulkProgress.currentBatch = Math.max(1, bulkUpdates.currentBatch);
  }
  if (bulkUpdates.totalBatches !== undefined) {
    bulkProgress.totalBatches = Math.max(1, bulkUpdates.totalBatches);
  }
  if (bulkUpdates.batchSize !== undefined) {
    bulkProgress.batchSize = Math.max(1, bulkUpdates.batchSize);
  }
  if (bulkUpdates.resumeToken !== undefined) {
    bulkProgress.resumeToken = bulkUpdates.resumeToken;
  }
  if (bulkUpdates.processedTicketIds !== undefined) {
    bulkProgress.processedTicketIds = bulkUpdates.processedTicketIds;
  }
  if (bulkUpdates.duplicatesFound !== undefined) {
    bulkProgress.duplicatesFound = Math.max(0, bulkUpdates.duplicatesFound);
  }
  if (bulkUpdates.newTicketsCreated !== undefined) {
    bulkProgress.newTicketsCreated = Math.max(0, bulkUpdates.newTicketsCreated);
  }
  if (bulkUpdates.ticketsUpdated !== undefined) {
    bulkProgress.ticketsUpdated = Math.max(0, bulkUpdates.ticketsUpdated);
  }
  if (bulkUpdates.allowCancel !== undefined) {
    bulkProgress.allowCancel = bulkUpdates.allowCancel;
  }
  if (bulkUpdates.allowPause !== undefined) {
    bulkProgress.allowPause = bulkUpdates.allowPause;
  }
  if (bulkUpdates.isPaused !== undefined) {
    bulkProgress.isPaused = bulkUpdates.isPaused;
  }
  
  return updatedProgress;
}

// ============================================================================
// Phase Transition Logic
// ============================================================================

/**
 * Validates if a phase transition is allowed
 */
export function isValidPhaseTransition(from: SyncPhase, to: SyncPhase): boolean {
  // Allow transitions to error and cancelled phases from any phase (except terminal phases)
  if (to === SyncPhase.ERROR || to === SyncPhase.CANCELLED) {
    return !TERMINAL_PHASES.includes(from);
  }
  
  // Cannot transition from terminal phases
  if (TERMINAL_PHASES.includes(from)) {
    return false;
  }
  
  // Cannot transition to the same phase
  if (from === to) {
    return false;
  }
  
  const fromIndex = PHASE_ORDER.indexOf(from);
  const toIndex = PHASE_ORDER.indexOf(to);
  
  // Unknown phases
  if (fromIndex === -1 || toIndex === -1) {
    return false;
  }
  
  // Only allow forward progression (no going backwards)
  return toIndex === fromIndex + 1;
}

// ============================================================================
// Time Estimation Algorithms
// ============================================================================

/**
 * Calculates estimated time remaining based on current progress
 * Uses phase-specific weighting and historical performance data
 */
export function calculateEstimatedTime(progress: SyncProgress): number | null {
  // Cannot estimate if no progress made
  if (progress.current === 0) {
    return null;
  }
  
  // Already complete
  if (progress.current >= progress.total) {
    return 0;
  }
  
  const now = Date.now();
  const elapsed = now - progress.startTime;
  
  // Avoid division by zero or negative time
  if (elapsed <= 0) {
    return null;
  }
  
  // Handle extremely large numbers to prevent overflow/infinity
  if (progress.total > Number.MAX_SAFE_INTEGER / 1000 || elapsed > Number.MAX_SAFE_INTEGER) {
    // For very large numbers, use simplified estimation
    const progressRatio = progress.current / progress.total;
    const remaining = (1 - progressRatio) * elapsed;
    return Math.max(0, Math.round(remaining / 1000));
  }
  
  // Calculate basic linear estimation: time_per_item * remaining_items
  const timePerItem = elapsed / progress.current;
  const remainingItems = progress.total - progress.current;
  let baseEstimate = timePerItem * remainingItems;
  
  // Apply phase-specific adjustments for heavier phases
  const phaseWeight = PHASE_TIME_WEIGHTS[progress.phase] || 1;
  if (progress.phase === SyncPhase.DOWNLOADING || progress.phase === SyncPhase.PROCESSING) {
    baseEstimate *= phaseWeight;
  }
  
  // Convert to seconds, ensure it's finite and positive
  const result = Math.round(baseEstimate / 1000);
  
  // Safety checks for edge cases
  if (!isFinite(result) || result < 0) {
    return null;
  }
  
  return result;
}

// ============================================================================
// Error Collection and Management
// ============================================================================

/**
 * Adds an error to the progress tracking
 * Maintains error limit to prevent memory issues
 */
export function collectSyncError<T extends SyncProgress>(progress: T, error: SyncError): T {
  const updatedErrors = [...progress.errors];
  
  // Normalize error object to prevent malformed errors
  const normalizedError: SyncError = {
    code: error.code || 'UNKNOWN_ERROR',
    message: error.message || 'An unknown error occurred',
    phase: error.phase || progress.phase,
    timestamp: error.timestamp || Date.now(),
    retryAttempt: error.retryAttempt || 0,
    maxRetries: error.maxRetries || 0,
    ...error // Preserve any additional fields
  };
  
  updatedErrors.push(normalizedError);
  
  // Keep only the most recent errors to prevent memory issues
  if (updatedErrors.length > MAX_ERROR_HISTORY) {
    updatedErrors.splice(0, updatedErrors.length - MAX_ERROR_HISTORY);
  }
  
  return {
    ...progress,
    errors: updatedErrors
  };
}

// ============================================================================
// Cancellation Handling
// ============================================================================

/**
 * Requests cancellation of the sync operation
 */
export function requestCancellation<T extends SyncProgress>(progress: T, cancellationToken: string): T {
  // Only update if not already cancelled
  if (!progress.cancellationRequested) {
    return {
      ...progress,
      cancellationRequested: true,
      cancellationToken
    };
  }
  
  // Keep original cancellation request
  return progress;
}

// ============================================================================
// Progress Reset and Cleanup
// ============================================================================

interface ResetOptions {
  preserveErrors?: boolean;
  preserveStartTime?: boolean;
}

/**
 * Resets progress to initial state with optional preservation of certain fields
 */
export function resetSyncProgress(
  progress: SyncProgress,
  newTotal: number,
  options: ResetOptions = {}
): SyncProgress {
  const now = Date.now();
  
  return {
    current: 0,
    total: Math.max(0, newTotal),
    processed: 0,
    failed: 0,
    phase: SyncPhase.INITIALIZING,
    phaseStartTime: now,
    startTime: options.preserveStartTime ? progress.startTime : now,
    estimatedTimeRemaining: null,
    errors: options.preserveErrors ? progress.errors : [],
    warnings: [],
    cancellationRequested: false,
    cancellationToken: null
  };
}

// ============================================================================
// Utility Functions for BulkImportProgress
// ============================================================================

/**
 * Creates a new BulkImportProgress object
 */
export function createBulkImportProgress(
  total: number,
  batchSize: number = 50
): BulkImportProgress {
  const baseProgress = createSyncProgress(total);
  const totalBatches = Math.ceil(total / batchSize);
  
  return {
    ...baseProgress,
    currentBatch: 1,
    totalBatches,
    batchSize,
    resumeToken: null,
    processedTicketIds: [],
    duplicatesFound: 0,
    newTicketsCreated: 0,
    ticketsUpdated: 0,
    allowCancel: true,
    allowPause: true,
    isPaused: false
  };
}

/**
 * Validates business rule: duplicates + created + updated = processed
 */
export function validateBulkImportConsistency(progress: BulkImportProgress): boolean {
  const accountedFor = progress.duplicatesFound + 
                      progress.newTicketsCreated + 
                      progress.ticketsUpdated;
  return accountedFor === progress.processed;
}

// ============================================================================
// Development and Testing Utilities
// ============================================================================

/**
 * Creates a human-readable summary of progress state
 * Useful for debugging and development
 */
export function summarizeProgress(progress: SyncProgress): string {
  const percentage = progress.total > 0 ? 
    Math.round((progress.current / progress.total) * 100) : 0;
  
  const duration = Date.now() - progress.startTime;
  const durationSeconds = Math.round(duration / 1000);
  
  const estimatedRemaining = calculateEstimatedTime(progress);
  const estimatedText = estimatedRemaining !== null ? 
    `${estimatedRemaining}s remaining` : 'unknown time remaining';
  
  return [
    `Progress: ${progress.current}/${progress.total} (${percentage}%)`,
    `Phase: ${progress.phase}`,
    `Processed: ${progress.processed}, Failed: ${progress.failed}`,
    `Duration: ${durationSeconds}s, ${estimatedText}`,
    `Errors: ${progress.errors.length}, Warnings: ${progress.warnings.length}`,
    progress.cancellationRequested ? 'CANCELLATION REQUESTED' : ''
  ].filter(Boolean).join(' | ');
}

/**
 * Validates progress object integrity
 * Returns array of validation errors, empty if valid
 */
export function validateProgress(progress: SyncProgress): string[] {
  const errors: string[] = [];
  
  // Basic numeric validations
  if (progress.current < 0) errors.push('current cannot be negative');
  if (progress.total < 0) errors.push('total cannot be negative');
  if (progress.processed < 0) errors.push('processed cannot be negative');
  if (progress.failed < 0) errors.push('failed cannot be negative');
  
  // Consistency validations
  if (progress.current > progress.total) {
    errors.push('current cannot exceed total');
  }
  if (progress.processed + progress.failed > progress.current) {
    errors.push('processed + failed cannot exceed current');
  }
  
  // Phase validation
  if (!Object.values(SyncPhase).includes(progress.phase)) {
    errors.push(`invalid phase: ${progress.phase}`);
  }
  
  // Timestamp validations
  if (progress.startTime > Date.now()) {
    errors.push('startTime cannot be in the future');
  }
  if (progress.phaseStartTime < progress.startTime) {
    errors.push('phaseStartTime cannot be before startTime');
  }
  
  return errors;
}