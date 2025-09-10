/**
 * JQL-based Auto-Sync Data Model
 * 
 * Core data structures and validation logic for JQL-based automatic synchronization
 * as specified in specs/001-jql-auto-sync/data-model.md
 * 
 * Features:
 * - Type-safe configuration with validation
 * - State transition management
 * - JSON serialization for plugin settings
 * - Progress tracking for sync operations
 * - Comprehensive error handling
 */

// ============================================================================
// ENUMS
// ============================================================================

/**
 * Phases of sync operations for progress tracking
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

// ============================================================================
// CORE INTERFACES
// ============================================================================

/**
 * Configuration settings for automatic synchronization
 */
export interface JQLAutoSyncConfig {
  // Feature enablement
  enabled: boolean;
  
  // JQL query configuration
  jqlQuery: string;
  validateQuery: boolean;    // Whether to validate before execution
  
  // Sync timing
  syncInterval: number;      // Minutes between syncs (1-60)
  lastSyncTime: string | null; // ISO timestamp of last successful sync
  
  // Batch processing
  maxResults: number;        // Maximum results per sync (default: 1000)
  batchSize: number;         // Tickets per batch (default: 50)
  
  // State tracking
  syncInProgress: boolean;
  failedSyncCount: number;
  lastError: string | null;
  
  // Bulk import state
  bulkImportInProgress: boolean;
  bulkImportProgress: BulkImportProgress | null;
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

// ============================================================================
// VALIDATION FUNCTIONS
// ============================================================================

/**
 * Validates a complete JQLAutoSyncConfig object
 * @param config Configuration to validate
 * @throws Error if validation fails
 */
export function validateJQLAutoSyncConfig(config: any): void {
  if (!config || typeof config !== 'object') {
    throw new Error('Configuration must be an object');
  }

  // Validate enabled
  if (typeof config.enabled !== 'boolean') {
    throw new Error('enabled must be a boolean');
  }

  // Validate jqlQuery
  if (typeof config.jqlQuery !== 'string') {
    throw new Error('jqlQuery must be a string');
  }
  if (config.jqlQuery.trim() === '') {
    throw new Error('jqlQuery cannot be empty');
  }

  // Validate validateQuery
  if (typeof config.validateQuery !== 'boolean') {
    throw new Error('validateQuery must be a boolean');
  }

  // Validate syncInterval
  if (!Number.isInteger(config.syncInterval) || config.syncInterval < 1 || config.syncInterval > 60) {
    throw new Error('syncInterval must be between 1 and 60 minutes');
  }

  // Validate lastSyncTime
  if (config.lastSyncTime !== null) {
    if (typeof config.lastSyncTime !== 'string') {
      throw new Error('lastSyncTime must be a valid ISO 8601 date string or null');
    }
    
    // Validate ISO 8601 format more strictly
    // Supports formats like: 2025-09-10T14:30:00.000Z, 2025-09-10T14:30:00.000+0000, 2025-09-10T14:30:00.000+05:30
    const iso8601Regex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}([+-]\d{2}:?\d{2}|Z)$/;
    if (!iso8601Regex.test(config.lastSyncTime)) {
      throw new Error('lastSyncTime must be a valid ISO 8601 date string or null');
    }
    
    const date = new Date(config.lastSyncTime);
    if (isNaN(date.getTime())) {
      throw new Error('lastSyncTime must be a valid ISO 8601 date string or null');
    }
    
    // Additional validation to catch edge cases like invalid months/days
    // Convert back to ISO string and compare to detect invalid dates that get normalized
    const normalizedISOString = date.toISOString();
    const inputDateParts = config.lastSyncTime.replace(/[+-]\d{4}$|Z$/, '').split('T');
    const normalizedParts = normalizedISOString.replace('Z', '').split('T');
    
    if (inputDateParts[0] !== normalizedParts[0]) { // Date parts don't match after normalization
      throw new Error('lastSyncTime must be a valid ISO 8601 date string or null');
    }
  }

  // Validate maxResults
  if (!Number.isInteger(config.maxResults) || config.maxResults < 1 || config.maxResults > 1000) {
    throw new Error('maxResults must be between 1 and 1000');
  }

  // Validate batchSize
  if (!Number.isInteger(config.batchSize) || config.batchSize < 10 || config.batchSize > 100) {
    throw new Error('batchSize must be between 10 and 100');
  }

  // Validate syncInProgress
  if (typeof config.syncInProgress !== 'boolean') {
    throw new Error('syncInProgress must be a boolean');
  }

  // Validate failedSyncCount
  if (!Number.isInteger(config.failedSyncCount) || config.failedSyncCount < 0) {
    throw new Error('failedSyncCount must be a non-negative integer');
  }

  // Validate lastError
  if (config.lastError !== null && typeof config.lastError !== 'string') {
    throw new Error('lastError must be a string or null');
  }

  // Validate bulkImportInProgress
  if (typeof config.bulkImportInProgress !== 'boolean') {
    throw new Error('bulkImportInProgress must be a boolean');
  }

  // Validate bulkImportProgress (optional complex validation could be added)
  if (config.bulkImportProgress !== null && typeof config.bulkImportProgress !== 'object') {
    throw new Error('bulkImportProgress must be an object or null');
  }
}

// ============================================================================
// STATE TRANSITION FUNCTIONS
// ============================================================================

/**
 * Transitions the enabled state and triggers sync if enabled
 * @param config Current configuration
 * @param enabled New enabled state
 * @returns Updated configuration
 */
export function transitionEnabled(config: JQLAutoSyncConfig, enabled: boolean): JQLAutoSyncConfig {
  const updatedConfig = { ...config, enabled };
  
  // If enabling sync, trigger immediate sync
  if (enabled && !config.enabled) {
    updatedConfig.syncInProgress = true;
  }
  
  return updatedConfig;
}

/**
 * Transitions the syncInProgress state with validation
 * @param config Current configuration
 * @param inProgress New sync in progress state
 * @returns Updated configuration
 * @throws Error if invalid state transition
 */
export function transitionSyncInProgress(config: JQLAutoSyncConfig, inProgress: boolean): JQLAutoSyncConfig {
  // Prevent sync if bulk import is in progress
  if (inProgress && config.bulkImportInProgress) {
    throw new Error('Cannot start sync while bulk import is in progress');
  }
  
  return { ...config, syncInProgress: inProgress };
}

/**
 * Completes a sync operation with success/failure handling
 * @param config Current configuration
 * @param success Whether the sync succeeded
 * @param errorMessage Optional error message if sync failed
 * @returns Updated configuration
 */
export function transitionSyncCompleted(config: JQLAutoSyncConfig, success: boolean, errorMessage?: string): JQLAutoSyncConfig {
  const updatedConfig = { ...config };
  
  // Always clear sync in progress
  updatedConfig.syncInProgress = false;
  
  if (success) {
    // Reset failure count and error on success
    updatedConfig.failedSyncCount = 0;
    updatedConfig.lastError = null;
    updatedConfig.lastSyncTime = new Date().toISOString();
  } else {
    // Increment failure count and set error on failure
    updatedConfig.failedSyncCount = config.failedSyncCount + 1;
    updatedConfig.lastError = errorMessage || 'Sync failed';
    // Don't update lastSyncTime on failure
  }
  
  return updatedConfig;
}

// ============================================================================
// SERIALIZATION FUNCTIONS
// ============================================================================

/**
 * Serializes configuration to JSON string for plugin settings storage
 * @param config Configuration to serialize
 * @returns JSON string representation
 */
export function serializeJQLAutoSyncConfig(config: JQLAutoSyncConfig): string {
  return JSON.stringify(config, null, 2);
}

/**
 * Creates a default configuration object
 * @returns Default JQLAutoSyncConfig
 */
export function createDefaultJQLAutoSyncConfig(): JQLAutoSyncConfig {
  return {
    enabled: false,
    jqlQuery: '',
    validateQuery: true,
    syncInterval: 15,
    lastSyncTime: null,
    maxResults: 1000,
    batchSize: 50,
    syncInProgress: false,
    failedSyncCount: 0,
    lastError: null,
    bulkImportInProgress: false,
    bulkImportProgress: null
  };
}

/**
 * Deserializes configuration from JSON string with validation and defaults
 * @param json JSON string to deserialize
 * @returns Validated JQLAutoSyncConfig
 * @throws Error if JSON is invalid or validation fails
 */
export function deserializeJQLAutoSyncConfig(json: string): JQLAutoSyncConfig {
  let parsed: any;
  
  try {
    parsed = JSON.parse(json);
  } catch (error) {
    throw new Error(`Invalid JSON: ${error.message}`);
  }
  
  // Start with defaults and override with parsed values
  const defaultConfig = createDefaultJQLAutoSyncConfig();
  const config = { ...defaultConfig };
  
  // Apply parsed values, ensuring type safety
  if (parsed.enabled !== undefined) config.enabled = parsed.enabled;
  if (parsed.jqlQuery !== undefined) config.jqlQuery = parsed.jqlQuery;
  if (parsed.validateQuery !== undefined) config.validateQuery = parsed.validateQuery;
  if (parsed.syncInterval !== undefined) config.syncInterval = parsed.syncInterval;
  if (parsed.lastSyncTime !== undefined) config.lastSyncTime = parsed.lastSyncTime;
  if (parsed.maxResults !== undefined) config.maxResults = parsed.maxResults;
  if (parsed.batchSize !== undefined) config.batchSize = parsed.batchSize;
  if (parsed.syncInProgress !== undefined) config.syncInProgress = parsed.syncInProgress;
  if (parsed.failedSyncCount !== undefined) config.failedSyncCount = parsed.failedSyncCount;
  if (parsed.lastError !== undefined) config.lastError = parsed.lastError;
  if (parsed.bulkImportInProgress !== undefined) config.bulkImportInProgress = parsed.bulkImportInProgress;
  if (parsed.bulkImportProgress !== undefined) config.bulkImportProgress = parsed.bulkImportProgress;
  
  // Validate the final configuration
  validateJQLAutoSyncConfig(config);
  
  return config;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Checks if a configuration is in a state where sync operations are allowed
 * @param config Configuration to check
 * @returns true if sync operations are allowed
 */
export function isSyncOperationAllowed(config: JQLAutoSyncConfig): boolean {
  return config.enabled && 
         !config.syncInProgress && 
         !config.bulkImportInProgress &&
         config.jqlQuery.trim() !== '';
}

/**
 * Calculates if it's time for the next scheduled sync
 * @param config Configuration containing sync settings
 * @returns true if sync should be triggered
 */
export function shouldTriggerSync(config: JQLAutoSyncConfig): boolean {
  if (!isSyncOperationAllowed(config)) {
    return false;
  }
  
  if (!config.lastSyncTime) {
    return true; // Never synced before
  }
  
  const lastSync = new Date(config.lastSyncTime);
  const now = new Date();
  const timeSinceLastSync = now.getTime() - lastSync.getTime();
  const syncIntervalMs = config.syncInterval * 60 * 1000; // Convert minutes to milliseconds
  
  return timeSinceLastSync >= syncIntervalMs;
}