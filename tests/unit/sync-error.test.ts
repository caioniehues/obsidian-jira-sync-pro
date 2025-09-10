import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// Import the SyncError interface and related types
// NOTE: These imports will fail initially - this is expected for TDD
import { SyncError, SyncPhase } from '../../src/types/sync-types';
import { createSyncError, calculateNextRetryTime, categorizeError } from '../../src/utils/sync-error-utils';

describe('SyncError Data Model', () => {
  describe('SyncError Interface Structure', () => {
    it('should have all required properties with correct types', () => {
      const mockError: SyncError = {
        code: 'API_RATE_LIMIT',
        message: 'Rate limit exceeded',
        phase: SyncPhase.DOWNLOADING,
        timestamp: Date.now(),
        retryAttempt: 1,
        maxRetries: 3
      };

      // Test that all required properties exist and have correct types
      expect(typeof mockError.code).toBe('string');
      expect(typeof mockError.message).toBe('string');
      expect(typeof mockError.phase).toBe('string');
      expect(typeof mockError.timestamp).toBe('number');
      expect(typeof mockError.retryAttempt).toBe('number');
      expect(typeof mockError.maxRetries).toBe('number');
    });

    it('should support optional properties with correct types', () => {
      const mockError: SyncError = {
        code: 'API_AUTH_FAILED',
        message: 'Authentication failed',
        phase: SyncPhase.SEARCHING,
        timestamp: Date.now(),
        retryAttempt: 0,
        maxRetries: 2,
        originalError: new Error('Unauthorized'),
        apiResponse: {
          status: 401,
          statusText: 'Unauthorized',
          body: { error: 'Invalid token' }
        },
        nextRetryAt: Date.now() + 60000,
        ticketId: 'PROJ-123',
        userAction: 'manual_sync'
      };

      // Test optional properties
      expect(mockError.originalError).toBeInstanceOf(Error);
      expect(typeof mockError.apiResponse?.status).toBe('number');
      expect(typeof mockError.apiResponse?.statusText).toBe('string');
      expect(typeof mockError.apiResponse?.body).toBe('object');
      expect(typeof mockError.nextRetryAt).toBe('number');
      expect(typeof mockError.ticketId).toBe('string');
      expect(typeof mockError.userAction).toBe('string');
    });
  });

  describe('Error Code Categorization', () => {
    it('should categorize API errors correctly', () => {
      const apiErrorCodes = [
        'API_RATE_LIMIT',
        'API_AUTH_FAILED', 
        'API_INVALID_JQL',
        'API_SERVER_ERROR',
        'API_PERMISSION_DENIED'
      ];

      apiErrorCodes.forEach(code => {
        expect(categorizeError(code)).toBe('API_ERROR');
      });
    });

    it('should categorize network errors correctly', () => {
      const networkErrorCodes = [
        'NETWORK_TIMEOUT',
        'NETWORK_OFFLINE',
        'NETWORK_ERROR',
        'NETWORK_CONNECTION_RESET'
      ];

      networkErrorCodes.forEach(code => {
        expect(categorizeError(code)).toBe('NETWORK_ERROR');
      });
    });

    it('should categorize vault errors correctly', () => {
      const vaultErrorCodes = [
        'VAULT_WRITE_FAILED',
        'VAULT_READ_FAILED',
        'VAULT_PERMISSION',
        'VAULT_DISK_FULL'
      ];

      vaultErrorCodes.forEach(code => {
        expect(categorizeError(code)).toBe('VAULT_ERROR');
      });
    });

    it('should categorize logic errors correctly', () => {
      const logicErrorCodes = [
        'INVALID_CONFIG',
        'BATCH_SIZE_EXCEEDED',
        'PARSE_ERROR',
        'VALIDATION_FAILED'
      ];

      logicErrorCodes.forEach(code => {
        expect(categorizeError(code)).toBe('LOGIC_ERROR');
      });
    });

    it('should handle unknown error codes', () => {
      const unknownCode = 'UNKNOWN_ERROR_123';
      expect(categorizeError(unknownCode)).toBe('UNKNOWN_ERROR');
    });
  });

  describe('Retry Attempt Tracking', () => {
    it('should track retry attempts correctly', () => {
      const baseError: Omit<SyncError, 'retryAttempt'> = {
        code: 'NETWORK_TIMEOUT',
        message: 'Request timed out',
        phase: SyncPhase.DOWNLOADING,
        timestamp: Date.now(),
        maxRetries: 3
      };

      // First attempt (not a retry)
      const firstAttempt: SyncError = { ...baseError, retryAttempt: 0 };
      expect(firstAttempt.retryAttempt).toBe(0);

      // Second attempt (first retry)
      const firstRetry: SyncError = { ...baseError, retryAttempt: 1 };
      expect(firstRetry.retryAttempt).toBe(1);

      // Final attempt
      const finalRetry: SyncError = { ...baseError, retryAttempt: 3 };
      expect(finalRetry.retryAttempt).toBe(3);
      expect(finalRetry.retryAttempt).toBe(finalRetry.maxRetries);
    });

    it('should validate retry attempt is not greater than max retries', () => {
      const invalidError = {
        code: 'API_RATE_LIMIT',
        message: 'Rate limit exceeded',
        phase: SyncPhase.SEARCHING,
        timestamp: Date.now(),
        retryAttempt: 5,
        maxRetries: 3
      };

      // This should be caught by validation
      expect(() => createSyncError(invalidError)).toThrow('Retry attempt cannot exceed max retries');
    });
  });

  describe('Backoff Calculation', () => {
    beforeEach(() => {
      // Mock Date.now() for consistent testing
      jest.spyOn(Date, 'now').mockReturnValue(1000000000);
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should calculate exponential backoff for API rate limits', () => {
      const error: SyncError = {
        code: 'API_RATE_LIMIT',
        message: 'Rate limit exceeded',
        phase: SyncPhase.DOWNLOADING,
        timestamp: Date.now(),
        retryAttempt: 2,
        maxRetries: 5
      };

      const nextRetry = calculateNextRetryTime(error);
      
      // For rate limits, should use exponential backoff: 2^retryAttempt * base delay
      // Base delay for rate limits should be 60 seconds
      // So: 2^2 * 60 = 240 seconds
      const expectedDelay = 240 * 1000; // Convert to milliseconds
      expect(nextRetry).toBe(Date.now() + expectedDelay);
    });

    it('should calculate linear backoff for network errors', () => {
      const error: SyncError = {
        code: 'NETWORK_TIMEOUT',
        message: 'Connection timed out',
        phase: SyncPhase.SEARCHING,
        timestamp: Date.now(),
        retryAttempt: 2,
        maxRetries: 3
      };

      const nextRetry = calculateNextRetryTime(error);
      
      // For network errors, should use linear backoff: retryAttempt * base delay
      // Base delay for network should be 30 seconds
      // So: 2 * 30 = 60 seconds
      const expectedDelay = 60 * 1000; // Convert to milliseconds
      expect(nextRetry).toBe(Date.now() + expectedDelay);
    });

    it('should not calculate retry time when max retries exceeded', () => {
      const error: SyncError = {
        code: 'API_SERVER_ERROR',
        message: 'Internal server error',
        phase: SyncPhase.PROCESSING,
        timestamp: Date.now(),
        retryAttempt: 3,
        maxRetries: 3
      };

      const nextRetry = calculateNextRetryTime(error);
      expect(nextRetry).toBeUndefined();
    });

    it('should handle different error categories with appropriate backoff strategies', () => {
      const testCases = [
        { code: 'API_RATE_LIMIT', category: 'API_ERROR', strategy: 'exponential' },
        { code: 'NETWORK_TIMEOUT', category: 'NETWORK_ERROR', strategy: 'linear' },
        { code: 'VAULT_WRITE_FAILED', category: 'VAULT_ERROR', strategy: 'linear' },
        { code: 'PARSE_ERROR', category: 'LOGIC_ERROR', strategy: 'none' }
      ];

      testCases.forEach(({ code, strategy }) => {
        const error: SyncError = {
          code,
          message: 'Test error',
          phase: SyncPhase.PROCESSING,
          timestamp: Date.now(),
          retryAttempt: 1,
          maxRetries: 3
        };

        const nextRetry = calculateNextRetryTime(error);

        if (strategy === 'none') {
          expect(nextRetry).toBeUndefined();
        } else {
          expect(nextRetry).toBeGreaterThan(Date.now());
        }
      });
    });
  });

  describe('Error Context and User Action Correlation', () => {
    it('should correlate errors with user actions', () => {
      const userActions = [
        'manual_sync',
        'auto_sync', 
        'bulk_import',
        'config_update',
        'query_validation'
      ];

      userActions.forEach(action => {
        const error: SyncError = {
          code: 'API_AUTH_FAILED',
          message: 'Authentication failed',
          phase: SyncPhase.SEARCHING,
          timestamp: Date.now(),
          retryAttempt: 0,
          maxRetries: 2,
          userAction: action
        };

        expect(error.userAction).toBe(action);
      });
    });

    it('should correlate errors with specific ticket IDs when applicable', () => {
      const ticketId = 'PROJ-456';
      const error: SyncError = {
        code: 'VAULT_WRITE_FAILED',
        message: 'Failed to write ticket file',
        phase: SyncPhase.PROCESSING,
        timestamp: Date.now(),
        retryAttempt: 1,
        maxRetries: 3,
        ticketId,
        userAction: 'manual_sync'
      };

      expect(error.ticketId).toBe(ticketId);
    });

    it('should include API response details for debugging', () => {
      const apiResponse = {
        status: 429,
        statusText: 'Too Many Requests',
        body: {
          errorMessages: ['Rate limit exceeded'],
          errors: {}
        }
      };

      const error: SyncError = {
        code: 'API_RATE_LIMIT',
        message: 'Rate limit exceeded',
        phase: SyncPhase.DOWNLOADING,
        timestamp: Date.now(),
        retryAttempt: 0,
        maxRetries: 5,
        apiResponse
      };

      expect(error.apiResponse).toEqual(apiResponse);
      expect(error.apiResponse?.status).toBe(429);
      expect(error.apiResponse?.body.errorMessages).toContain('Rate limit exceeded');
    });

    it('should preserve original JavaScript errors', () => {
      const originalError = new TypeError('Cannot read property of undefined');
      const error: SyncError = {
        code: 'PARSE_ERROR',
        message: 'Failed to parse response',
        phase: SyncPhase.PROCESSING,
        timestamp: Date.now(),
        retryAttempt: 0,
        maxRetries: 1,
        originalError
      };

      expect(error.originalError).toBe(originalError);
      expect(error.originalError?.name).toBe('TypeError');
      expect(error.originalError?.message).toContain('Cannot read property');
    });
  });

  describe('Error Creation Utility', () => {
    it('should create valid SyncError objects', () => {
      const errorData = {
        code: 'API_INVALID_JQL',
        message: 'JQL query syntax error',
        phase: SyncPhase.SEARCHING,
        retryAttempt: 0,
        maxRetries: 1,
        userAction: 'query_validation'
      };

      const error = createSyncError(errorData);

      expect(error.code).toBe(errorData.code);
      expect(error.message).toBe(errorData.message);
      expect(error.phase).toBe(errorData.phase);
      expect(error.retryAttempt).toBe(errorData.retryAttempt);
      expect(error.maxRetries).toBe(errorData.maxRetries);
      expect(error.userAction).toBe(errorData.userAction);
      expect(typeof error.timestamp).toBe('number');
    });

    it('should auto-generate timestamp if not provided', () => {
      const beforeCreation = Date.now();
      
      const error = createSyncError({
        code: 'NETWORK_ERROR',
        message: 'Network error occurred',
        phase: SyncPhase.INITIALIZING,
        retryAttempt: 0,
        maxRetries: 3
      });

      const afterCreation = Date.now();

      expect(error.timestamp).toBeGreaterThanOrEqual(beforeCreation);
      expect(error.timestamp).toBeLessThanOrEqual(afterCreation);
    });

    it('should validate required properties', () => {
      const invalidData = {
        code: '', // Empty code should be invalid
        message: 'Test message',
        phase: SyncPhase.PROCESSING,
        retryAttempt: 0,
        maxRetries: 3
      };

      expect(() => createSyncError(invalidData)).toThrow('Error code cannot be empty');
    });
  });

  describe('Error Serialization', () => {
    it('should be JSON serializable', () => {
      const error: SyncError = {
        code: 'API_RATE_LIMIT',
        message: 'Rate limit exceeded',
        phase: SyncPhase.DOWNLOADING,
        timestamp: 1000000000,
        retryAttempt: 1,
        maxRetries: 3,
        nextRetryAt: 1000060000,
        ticketId: 'PROJ-789',
        userAction: 'bulk_import',
        apiResponse: {
          status: 429,
          statusText: 'Too Many Requests',
          body: { message: 'Rate limit exceeded' }
        }
        // Note: originalError is not included as Error objects don't serialize well
      };

      const serialized = JSON.stringify(error);
      const deserialized = JSON.parse(serialized) as SyncError;

      expect(deserialized.code).toBe(error.code);
      expect(deserialized.message).toBe(error.message);
      expect(deserialized.phase).toBe(error.phase);
      expect(deserialized.timestamp).toBe(error.timestamp);
      expect(deserialized.apiResponse).toEqual(error.apiResponse);
    });
  });
});