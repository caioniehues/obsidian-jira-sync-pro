/**
 * Data Model: JQL-based Auto-Sync
 * 
 * Core data structures for Obsidian Jira Sync Pro plugin.
 * This file serves as the main export point for all data model interfaces.
 */

// Re-export bulk import progress interfaces and utilities
export {
  SyncPhase,
  SyncError,
  SyncProgress,
  BulkImportProgress,
  isBulkImportProgress,
  validateBulkImportStatistics,
  validateSyncProgress,
  validateBatchProgress,
  createResumeToken,
  parseResumeToken,
  calculateProgressPercentage,
  isPauseAllowedForPhase,
  isCancellationAllowedForPhase,
  BULK_IMPORT_DEFAULTS,
  PHASE_CAPABILITIES
} from './bulk-import-progress';

// =============================================================================
// JIRA API DATA STRUCTURES
// =============================================================================

/**
 * Response from Jira API search endpoint
 */
export interface JQLSearchResult {
  // API response metadata
  maxResults: number;
  startAt: number;           // Always 0 for new token-based API
  total: number;             // Approximate total (may change)
  
  // Pagination
  nextPageToken?: string;    // Token for next page (undefined when last page)
  
  // Results
  issues: JiraIssueResponse[];
  
  // Query context
  jql: string;               // Query that generated these results
  executionTime: number;     // Query execution time in milliseconds
}

/**
 * Individual Jira issue response from API
 */
export interface JiraIssueResponse {
  // Core identification
  id: string;                // Jira internal ID
  key: string;               // Human-readable key (e.g., "PROJ-123")
  self: string;              // REST API URL for this issue
  
  // Field data (only requested fields returned)
  fields: {
    summary?: string;
    status?: {
      name: string;
      statusCategory: {
        key: string;           // "new", "indeterminate", "done"
        colorName: string;
      };
    };
    assignee?: {
      accountId: string;
      displayName: string;
      emailAddress?: string;
    };
    priority?: {
      name: string;
      iconUrl: string;
    };
    created?: string;          // ISO timestamp
    updated?: string;          // ISO timestamp
    description?: any;         // Atlassian Document Format
    project?: {
      key: string;
      name: string;
    };
  };
  
  // Expanded data (if requested)
  changelog?: {
    histories: ChangelogEntry[];
  };
}

/**
 * Jira issue changelog entry
 */
export interface ChangelogEntry {
  id: string;
  author: {
    accountId: string;
    displayName: string;
  };
  created: string;           // ISO timestamp
  items: Array<{
    field: string;
    fieldtype: string;
    from: string | null;
    fromString: string | null;
    to: string | null;
    toString: string | null;
  }>;
}

// =============================================================================
// CONFIGURATION
// =============================================================================

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

// =============================================================================
// STATISTICS AND MONITORING
// =============================================================================

/**
 * Aggregated metrics for sync operations monitoring
 */
export interface SyncStatistics {
  // Overall metrics
  totalSyncOperations: number;
  successfulSyncs: number;
  failedSyncs: number;
  
  // Timing metrics
  averageSyncDuration: number;    // Seconds
  lastSyncDuration: number;       // Seconds
  longestSyncDuration: number;    // Seconds
  
  // Volume metrics
  totalTicketsProcessed: number;
  ticketsCreated: number;
  ticketsUpdated: number;
  ticketsSkipped: number;         // Duplicates or filtered out
  
  // Error tracking
  errorsByCategory: Record<string, number>; // Error code → count
  consecutiveFailures: number;
  
  // Performance metrics
  averageTicketsPerSecond: number;
  apiCallsThisHour: number;       // Rate limiting tracking
  
  // Time series data (last 24 hours)
  hourlyStats: Array<{
    hour: number;                 // Unix timestamp rounded to hour
    syncs: number;
    tickets: number;
    errors: number;
  }>;
}

// =============================================================================
// ERROR CODE CONSTANTS
// =============================================================================

/**
 * Standard error codes used throughout the application
 */
export const ERROR_CODES = {
  // API Errors
  API_RATE_LIMIT: 'API_RATE_LIMIT',
  API_AUTH_FAILED: 'API_AUTH_FAILED',
  API_INVALID_JQL: 'API_INVALID_JQL',
  API_SERVER_ERROR: 'API_SERVER_ERROR',
  API_NOT_FOUND: 'API_NOT_FOUND',
  
  // Network Errors
  NETWORK_TIMEOUT: 'NETWORK_TIMEOUT',
  NETWORK_OFFLINE: 'NETWORK_OFFLINE',
  NETWORK_ERROR: 'NETWORK_ERROR',
  
  // Vault Errors
  VAULT_WRITE_FAILED: 'VAULT_WRITE_FAILED',
  VAULT_READ_FAILED: 'VAULT_READ_FAILED',
  VAULT_PERMISSION: 'VAULT_PERMISSION',
  VAULT_NOT_FOUND: 'VAULT_NOT_FOUND',
  
  // Logic Errors
  INVALID_CONFIG: 'INVALID_CONFIG',
  BATCH_SIZE_EXCEEDED: 'BATCH_SIZE_EXCEEDED',
  PARSE_ERROR: 'PARSE_ERROR',
  VALIDATION_ERROR: 'VALIDATION_ERROR'
} as const;

export type ErrorCode = typeof ERROR_CODES[keyof typeof ERROR_CODES];