/**
 * Sync Error Utilities for Obsidian Jira Sync Pro
 * 
 * This file provides utilities for creating, categorizing, and managing
 * sync errors, including retry logic and exponential backoff calculations.
 */

import { SyncError, ErrorCategory, ERROR_CODES } from '../types/sync-types';

/**
 * Partial SyncError type for creation - timestamp is optional as it can be auto-generated
 */
type SyncErrorInput = Omit<SyncError, 'timestamp'> & {
  timestamp?: number;
};

/**
 * Creates a SyncError object with validation and auto-generated timestamp
 * 
 * @param errorData - Error data to create SyncError from
 * @returns Validated SyncError object
 * @throws Error if validation fails
 */
export function createSyncError(errorData: SyncErrorInput): SyncError {
  // Validate required properties
  if (errorData.code === undefined || errorData.code === null || errorData.code === '' || errorData.code.trim() === '') {
    throw new Error('Error code cannot be empty');
  }
  
  if (errorData.message === undefined || errorData.message === null || errorData.message === '' || errorData.message.trim() === '') {
    throw new Error('Error message cannot be empty');
  }
  
  if (errorData.retryAttempt < 0) {
    throw new Error('Retry attempt cannot be negative');
  }
  
  if (errorData.maxRetries < 0) {
    throw new Error('Max retries cannot be negative');
  }
  
  if (errorData.retryAttempt > errorData.maxRetries) {
    throw new Error('Retry attempt cannot exceed max retries');
  }
  
  // Create the error object with auto-generated timestamp if not provided
  const syncError: SyncError = {
    ...errorData,
    timestamp: errorData.timestamp ?? Date.now()
  };
  
  return syncError;
}

/**
 * Categorizes an error code into predefined error categories
 * 
 * @param errorCode - The error code to categorize
 * @returns The error category
 */
export function categorizeError(errorCode: string): ErrorCategory {
  // API Errors
  if (errorCode.startsWith('API_')) {
    return ErrorCategory.API_ERROR;
  }
  
  // Network Errors
  if (errorCode.startsWith('NETWORK_')) {
    return ErrorCategory.NETWORK_ERROR;
  }
  
  // Vault Errors
  if (errorCode.startsWith('VAULT_')) {
    return ErrorCategory.VAULT_ERROR;
  }
  
  // Logic Errors - check specific codes
  const logicErrorCodes = [
    ERROR_CODES.INVALID_CONFIG,
    ERROR_CODES.BATCH_SIZE_EXCEEDED,
    ERROR_CODES.PARSE_ERROR,
    ERROR_CODES.VALIDATION_FAILED
  ];
  
  if (logicErrorCodes.includes(errorCode as any)) {
    return ErrorCategory.LOGIC_ERROR;
  }
  
  // Default to unknown
  return ErrorCategory.UNKNOWN_ERROR;
}

/**
 * Base delays in seconds for different error categories
 */
const BASE_DELAYS = {
  [ErrorCategory.API_ERROR]: 60,        // 1 minute for API errors (rate limits)
  [ErrorCategory.NETWORK_ERROR]: 30,    // 30 seconds for network errors
  [ErrorCategory.VAULT_ERROR]: 30,      // 30 seconds for vault errors
  [ErrorCategory.LOGIC_ERROR]: 0,       // No retry for logic errors
  [ErrorCategory.UNKNOWN_ERROR]: 60     // 1 minute for unknown errors
};

/**
 * Calculates the next retry time based on error category and attempt count
 * 
 * @param error - The SyncError to calculate retry time for
 * @returns The timestamp for next retry, or undefined if no retry should occur
 */
export function calculateNextRetryTime(error: SyncError): number | undefined {
  // Don't retry if max retries reached
  if (error.retryAttempt >= error.maxRetries) {
    return undefined;
  }
  
  const category = categorizeError(error.code);
  const baseDelay = BASE_DELAYS[category];
  
  // Logic errors don't get retried
  if (baseDelay === 0) {
    return undefined;
  }
  
  let delaySeconds: number;
  
  // Use exponential backoff for API errors (especially rate limits)
  if (category === ErrorCategory.API_ERROR) {
    // Exponential backoff: 2^retryAttempt * baseDelay
    delaySeconds = Math.pow(2, error.retryAttempt) * baseDelay;
  } else {
    // Linear backoff for network and vault errors: retryAttempt * baseDelay
    delaySeconds = error.retryAttempt * baseDelay;
  }
  
  // Convert to milliseconds and add to current time
  return Date.now() + (delaySeconds * 1000);
}

/**
 * Determines if an error should be retried based on its category and attempt count
 * 
 * @param error - The SyncError to check
 * @returns True if the error should be retried
 */
export function shouldRetryError(error: SyncError): boolean {
  // Don't retry if max retries reached
  if (error.retryAttempt >= error.maxRetries) {
    return false;
  }
  
  const category = categorizeError(error.code);
  
  // Logic errors should not be retried
  return category !== ErrorCategory.LOGIC_ERROR;
}

/**
 * Creates a user-friendly error message based on the error code and context
 * 
 * @param error - The SyncError to create a message for
 * @returns A user-friendly error message
 */
export function createUserFriendlyMessage(error: SyncError): string {
  const category = categorizeError(error.code);
  
  switch (category) {
    case ErrorCategory.API_ERROR:
      if (error.code === ERROR_CODES.API_RATE_LIMIT) {
        return `Jira API rate limit exceeded. Automatic retry in ${formatRetryTime(error.nextRetryAt)}.`;
      }
      if (error.code === ERROR_CODES.API_AUTH_FAILED) {
        return 'Jira authentication failed. Please check your API credentials in settings.';
      }
      if (error.code === ERROR_CODES.API_INVALID_JQL) {
        return 'Invalid JQL query syntax. Please check your query in the sync configuration.';
      }
      return `Jira API error: ${error.message}`;
      
    case ErrorCategory.NETWORK_ERROR:
      if (error.code === ERROR_CODES.NETWORK_OFFLINE) {
        return 'No internet connection. Sync will retry automatically when connection is restored.';
      }
      if (error.code === ERROR_CODES.NETWORK_TIMEOUT) {
        return `Request timed out. Retrying in ${formatRetryTime(error.nextRetryAt)}.`;
      }
      return `Network error: ${error.message}`;
      
    case ErrorCategory.VAULT_ERROR:
      if (error.code === ERROR_CODES.VAULT_PERMISSION) {
        return 'Permission denied writing to vault. Please check file permissions.';
      }
      if (error.code === ERROR_CODES.VAULT_DISK_FULL) {
        return 'Disk full. Please free up space and try again.';
      }
      return `Vault error: ${error.message}`;
      
    case ErrorCategory.LOGIC_ERROR:
      return `Configuration error: ${error.message}. Please review your settings.`;
      
    default:
      return error.message;
  }
}

/**
 * Formats a retry time timestamp into a human-readable string
 * 
 * @param nextRetryAt - Timestamp for next retry, or undefined
 * @returns Formatted time string
 */
function formatRetryTime(nextRetryAt: number | undefined): string {
  if (nextRetryAt === undefined || nextRetryAt === null || nextRetryAt === 0) {
    return 'unknown';
  }
  
  const secondsUntilRetry = Math.ceil((nextRetryAt - Date.now()) / 1000);
  
  if (secondsUntilRetry < 60) {
    return `${secondsUntilRetry} seconds`;
  }
  
  const minutesUntilRetry = Math.ceil(secondsUntilRetry / 60);
  return `${minutesUntilRetry} minutes`;
}

/**
 * Serializes a SyncError for storage, handling non-serializable properties
 * 
 * @param error - The SyncError to serialize
 * @returns Serializable error object
 */
export function serializeSyncError(error: SyncError): Omit<SyncError, 'originalError'> & { originalError?: string } {
  const { originalError, ...serializable } = error;
  
  return {
    ...serializable,
    // Convert Error object to string for serialization
    originalError: (originalError !== undefined && originalError !== null) ? `${originalError.name}: ${originalError.message}` : undefined
  };
}

/**
 * Deserializes a stored error back into a SyncError
 * Note: originalError will be a string rather than Error object after deserialization
 * 
 * @param serializedError - The serialized error data
 * @returns SyncError object (with originalError as string if present)
 */
export function deserializeSyncError(serializedError: unknown): SyncError {
  return serializedError as SyncError;
}