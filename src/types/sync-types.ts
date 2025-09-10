/**
 * Sync Types for Obsidian Jira Sync Pro
 * 
 * This file defines the core types for synchronization operations,
 * error handling, and progress tracking.
 */

/**
 * Phases of a sync operation
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
  timestamp: number;         // When error occurred (Unix timestamp)
  
  // Technical details (optional)
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
  
  // User context (optional)
  ticketId?: string;         // Ticket ID related to error (if applicable)
  userAction?: string;       // User action that triggered the error
}

/**
 * Error categories for categorization and retry logic
 */
export enum ErrorCategory {
  API_ERROR = 'API_ERROR',
  NETWORK_ERROR = 'NETWORK_ERROR',
  VAULT_ERROR = 'VAULT_ERROR',
  LOGIC_ERROR = 'LOGIC_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR'
}

/**
 * Error codes organized by category
 */
export const ERROR_CODES = {
  // API Errors
  API_RATE_LIMIT: 'API_RATE_LIMIT',
  API_AUTH_FAILED: 'API_AUTH_FAILED',
  API_INVALID_JQL: 'API_INVALID_JQL',
  API_SERVER_ERROR: 'API_SERVER_ERROR',
  API_PERMISSION_DENIED: 'API_PERMISSION_DENIED',
  
  // Network Errors
  NETWORK_TIMEOUT: 'NETWORK_TIMEOUT',
  NETWORK_OFFLINE: 'NETWORK_OFFLINE',
  NETWORK_ERROR: 'NETWORK_ERROR',
  NETWORK_CONNECTION_RESET: 'NETWORK_CONNECTION_RESET',
  
  // Vault Errors
  VAULT_WRITE_FAILED: 'VAULT_WRITE_FAILED',
  VAULT_READ_FAILED: 'VAULT_READ_FAILED',
  VAULT_PERMISSION: 'VAULT_PERMISSION',
  VAULT_DISK_FULL: 'VAULT_DISK_FULL',
  
  // Logic Errors
  INVALID_CONFIG: 'INVALID_CONFIG',
  BATCH_SIZE_EXCEEDED: 'BATCH_SIZE_EXCEEDED',
  PARSE_ERROR: 'PARSE_ERROR',
  VALIDATION_FAILED: 'VALIDATION_FAILED'
} as const;

/**
 * User actions that can trigger sync operations
 */
export const USER_ACTIONS = {
  MANUAL_SYNC: 'manual_sync',
  AUTO_SYNC: 'auto_sync',
  BULK_IMPORT: 'bulk_import',
  CONFIG_UPDATE: 'config_update',
  QUERY_VALIDATION: 'query_validation'
} as const;

/**
 * Type for user action values
 */
export type UserAction = typeof USER_ACTIONS[keyof typeof USER_ACTIONS];

/**
 * Type for error code values
 */
export type ErrorCode = typeof ERROR_CODES[keyof typeof ERROR_CODES];