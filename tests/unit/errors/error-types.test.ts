/**
 * Tests for Error Types Infrastructure
 * Following RED-GREEN-Refactor approach with comprehensive error scenarios
 */

import {
  JiraPluginError,
  NetworkError,
  ApiError,
  AuthenticationError,
  ValidationError,
  FileSystemError,
  ConflictError,
  RateLimitError,
  SyncError,
  ConfigurationError,
  PluginError,
  ErrorCategory,
  ErrorSeverity,
  ErrorRecoveryStrategy,
  ErrorContext,
  isJiraPluginError,
  isNetworkError,
  isApiError,
  isAuthenticationError,
  isRateLimitError,
  isConflictError,
  wrapError,
} from '../../../src/errors/error-types';

describe('Error Types Infrastructure', () => {
  describe('NetworkError', () => {
    it('should create network error with correct properties', () => {
      const context: ErrorContext = {
        httpStatus: 0,
        operation: 'fetchIssues',
      };
      const error = new NetworkError('Connection failed', context);

      expect(error).toBeInstanceOf(JiraPluginError);
      expect(error.category).toBe(ErrorCategory.NETWORK);
      expect(error.severity).toBe(ErrorSeverity.MEDIUM);
      expect(error.recoveryStrategy).toBe(ErrorRecoveryStrategy.RETRY);
      expect(error.context.httpStatus).toBe(0);
      expect(error.context.operation).toBe('fetchIssues');
      expect(error.errorCode).toMatch(/^JP_NET_[A-Z0-9]{6}$/);
    });

    it('should generate appropriate user message for connection issues', () => {
      const connectionError = new NetworkError('Connection failed', {
        httpStatus: 0,
      });
      expect(connectionError.userMessage).toBe(
        'Unable to connect to Jira. Please check your internet connection.'
      );

      const networkError = new NetworkError('Timeout', { httpStatus: 408 });
      expect(networkError.userMessage).toBe(
        'Network error occurred while connecting to Jira. Retrying automatically.'
      );
    });

    it('should include original error in context', () => {
      const originalError = new Error('ECONNREFUSED');
      const networkError = new NetworkError(
        'Connection refused',
        {},
        originalError
      );

      expect(networkError.originalError).toBe(originalError);
      expect(networkError.debugInfo.originalError?.message).toBe(
        'ECONNREFUSED'
      );
    });
  });

  describe('ApiError', () => {
    it('should create API error with HTTP status context', () => {
      const context: ErrorContext = {
        httpStatus: 400,
        issueKey: 'TEST-123',
        operation: 'updateIssue',
      };
      const error = new ApiError('Bad request', context);

      expect(error.category).toBe(ErrorCategory.API);
      expect(error.severity).toBe(ErrorSeverity.MEDIUM);
      expect(error.context.httpStatus).toBe(400);
      expect(error.context.issueKey).toBe('TEST-123');
    });

    it('should use retry strategy for rate limiting', () => {
      const rateLimitError = new ApiError('Rate limited', { httpStatus: 429 });
      expect(rateLimitError.recoveryStrategy).toBe(ErrorRecoveryStrategy.RETRY);

      const badRequestError = new ApiError('Bad request', { httpStatus: 400 });
      expect(badRequestError.recoveryStrategy).toBe(
        ErrorRecoveryStrategy.QUEUE
      );
    });

    it('should generate context-aware user messages', () => {
      const testCases = [
        {
          status: 400,
          expected:
            'Invalid request for TEST-123. Please check the ticket data and try again.',
        },
        {
          status: 401,
          expected:
            'Authentication failed. Please check your Jira credentials.',
        },
        {
          status: 403,
          expected:
            'Access denied for TEST-123. You may not have permission for this operation.',
        },
        {
          status: 404,
          expected:
            'Ticket for TEST-123 not found. It may have been deleted or moved.',
        },
        {
          status: 429,
          expected: 'Jira API rate limit exceeded. Waiting before retrying.',
        },
        {
          status: 500,
          expected: 'Jira server error. This will be retried automatically.',
        },
        {
          status: 502,
          expected:
            'API error occurred for TEST-123. Operation will be retried.',
        },
      ];

      testCases.forEach(({ status, expected }) => {
        const error = new ApiError('Test error', {
          httpStatus: status,
          issueKey: 'TEST-123',
        });
        expect(error.userMessage).toBe(expected);
      });
    });
  });

  describe('AuthenticationError', () => {
    it('should create auth error with high severity', () => {
      const error = new AuthenticationError('Invalid credentials');

      expect(error.category).toBe(ErrorCategory.AUTH);
      expect(error.severity).toBe(ErrorSeverity.HIGH);
      expect(error.recoveryStrategy).toBe(
        ErrorRecoveryStrategy.USER_INTERVENTION
      );
      expect(error.userMessage).toBe(
        'Authentication with Jira failed. Please check your API token and email in settings.'
      );
    });

    it('should include authentication context', () => {
      const context: ErrorContext = {
        jiraInstance: 'company.atlassian.net',
        operation: 'validateCredentials',
      };
      const error = new AuthenticationError('Token expired', context);

      expect(error.context.jiraInstance).toBe('company.atlassian.net');
      expect(error.context.operation).toBe('validateCredentials');
    });
  });

  describe('ValidationError', () => {
    it('should create validation error with field context', () => {
      const context: ErrorContext = {
        metadata: { field: 'priority' },
      };
      const error = new ValidationError('Invalid priority value', context);

      expect(error.category).toBe(ErrorCategory.VALIDATION);
      expect(error.severity).toBe(ErrorSeverity.MEDIUM);
      expect(error.recoveryStrategy).toBe(
        ErrorRecoveryStrategy.USER_INTERVENTION
      );
      expect(error.userMessage).toBe(
        'Invalid priority value. Please check the ticket data and try again.'
      );
    });

    it('should handle generic validation messages', () => {
      const error = new ValidationError('Invalid data format');
      expect(error.userMessage).toBe(
        'Invalid data format. Please check the ticket content and try again.'
      );
    });
  });

  describe('FileSystemError', () => {
    it('should create file system error with path context', () => {
      const context: ErrorContext = {
        filePath: '/path/to/ticket.md',
        operation: 'writeFile',
      };
      const error = new FileSystemError('Permission denied', context);

      expect(error.category).toBe(ErrorCategory.FILE_SYSTEM);
      expect(error.severity).toBe(ErrorSeverity.MEDIUM);
      expect(error.recoveryStrategy).toBe(ErrorRecoveryStrategy.RETRY);
      expect(error.context.filePath).toBe('/path/to/ticket.md');
    });

    it('should generate path-specific user messages', () => {
      const errorWithPath = new FileSystemError('Access denied', {
        filePath: '/test/file.md',
      });
      expect(errorWithPath.userMessage).toBe(
        'Unable to access file: /test/file.md. Please check file permissions.'
      );

      const genericError = new FileSystemError('Disk full');
      expect(genericError.userMessage).toBe(
        'File system error occurred. This will be retried automatically.'
      );
    });
  });

  describe('ConflictError', () => {
    it('should create conflict error for sync conflicts', () => {
      const context: ErrorContext = {
        issueKey: 'PROJ-456',
        operation: 'bidirectionalSync',
        metadata: {
          field: 'status',
          localValue: 'In Progress',
          remoteValue: 'Done',
        },
      };
      const error = new ConflictError('Status conflict detected', context);

      expect(error.category).toBe(ErrorCategory.CONFLICT);
      expect(error.severity).toBe(ErrorSeverity.MEDIUM);
      expect(error.recoveryStrategy).toBe(
        ErrorRecoveryStrategy.USER_INTERVENTION
      );
      expect(error.userMessage).toBe(
        'Sync conflict detected in PROJ-456. Please resolve manually in the conflict resolution dialog.'
      );
    });
  });

  describe('RateLimitError', () => {
    it('should create rate limit error with low severity', () => {
      const error = new RateLimitError('API rate limit exceeded');

      expect(error.category).toBe(ErrorCategory.RATE_LIMIT);
      expect(error.severity).toBe(ErrorSeverity.LOW);
      expect(error.recoveryStrategy).toBe(ErrorRecoveryStrategy.RETRY);
      expect(error.userMessage).toBe(
        'Jira API rate limit reached. Waiting before retrying operations.'
      );
    });
  });

  describe('SyncError', () => {
    it('should create sync error with direction context', () => {
      const context: ErrorContext = {
        syncDirection: 'push',
        issueKey: 'SYNC-789',
        operation: 'pushToJira',
      };
      const error = new SyncError('Push operation failed', context);

      expect(error.category).toBe(ErrorCategory.SYNC);
      expect(error.severity).toBe(ErrorSeverity.MEDIUM);
      expect(error.recoveryStrategy).toBe(ErrorRecoveryStrategy.RETRY);
      expect(error.userMessage).toBe(
        'Sync operation failed (push) for SYNC-789. This will be retried automatically.'
      );
    });

    it('should allow custom severity', () => {
      const criticalError = new SyncError(
        'Critical sync failure',
        {},
        undefined,
        ErrorSeverity.CRITICAL
      );
      expect(criticalError.severity).toBe(ErrorSeverity.CRITICAL);
    });
  });

  describe('ConfigurationError', () => {
    it('should create config error with high severity', () => {
      const error = new ConfigurationError('Invalid Jira URL');

      expect(error.category).toBe(ErrorCategory.CONFIG);
      expect(error.severity).toBe(ErrorSeverity.HIGH);
      expect(error.recoveryStrategy).toBe(
        ErrorRecoveryStrategy.USER_INTERVENTION
      );
      expect(error.userMessage).toBe(
        'Configuration error. Please check your plugin settings and try again.'
      );
    });
  });

  describe('PluginError', () => {
    it('should create plugin error with configurable severity', () => {
      const mediumError = new PluginError('Plugin initialization failed');
      expect(mediumError.severity).toBe(ErrorSeverity.MEDIUM);
      expect(mediumError.recoveryStrategy).toBe(ErrorRecoveryStrategy.RETRY);

      const criticalError = new PluginError(
        'Core plugin failure',
        {},
        undefined,
        ErrorSeverity.CRITICAL
      );
      expect(criticalError.severity).toBe(ErrorSeverity.CRITICAL);
      expect(criticalError.recoveryStrategy).toBe(
        ErrorRecoveryStrategy.GRACEFUL_DEGRADATION
      );
    });

    it('should generate operation-specific user messages', () => {
      const operationError = new PluginError('Failed', {
        operation: 'initialization',
      });
      expect(operationError.userMessage).toBe(
        'Plugin error occurred during initialization. Operation will be retried.'
      );

      const criticalError = new PluginError(
        'Critical failure',
        { operation: 'startup' },
        undefined,
        ErrorSeverity.CRITICAL
      );
      expect(criticalError.userMessage).toBe(
        'Critical plugin error during startup. Some features may be unavailable.'
      );
    });
  });

  describe('Error Context and Metadata', () => {
    it('should automatically add timestamp to context', () => {
      const beforeTime = Date.now();
      const error = new NetworkError('Test error');
      const afterTime = Date.now();

      expect(error.context.timestamp).toBeGreaterThanOrEqual(beforeTime);
      expect(error.context.timestamp).toBeLessThanOrEqual(afterTime);
    });

    it('should preserve existing context while adding timestamp', () => {
      const existingContext: ErrorContext = {
        issueKey: 'TEST-001',
        operation: 'test',
        metadata: { custom: 'data' },
      };

      const error = new ApiError('Test error', existingContext);

      expect(error.context.issueKey).toBe('TEST-001');
      expect(error.context.operation).toBe('test');
      expect(error.context.metadata?.custom).toBe('data');
      expect(error.context.timestamp).toBeDefined();
    });

    it('should generate unique error codes', () => {
      const error1 = new NetworkError('Error 1');
      const error2 = new NetworkError('Error 2');
      const error3 = new ApiError('Error 3');

      expect(error1.errorCode).toMatch(/^JP_NET_[A-Z0-9]{6}$/);
      expect(error2.errorCode).toMatch(/^JP_NET_[A-Z0-9]{6}$/);
      expect(error3.errorCode).toMatch(/^JP_API_[A-Z0-9]{6}$/);
      expect(error1.errorCode).not.toBe(error2.errorCode);
      expect(error1.errorCode).not.toBe(error3.errorCode);
    });
  });

  describe('Error Serialization', () => {
    it('should serialize error to JSON with all properties', () => {
      const originalError = new Error('Original failure');
      const context: ErrorContext = {
        issueKey: 'JSON-123',
        operation: 'serialize',
        metadata: { test: true },
      };

      const error = new SyncError('Serialization test', context, originalError);
      const json = error.toJSON();

      expect(json.name).toBe('SyncError');
      expect(json.message).toBe('Serialization test');
      expect(json.userMessage).toBeDefined();
      expect(json.errorCode).toBeDefined();
      expect(json.category).toBe(ErrorCategory.SYNC);
      expect(json.severity).toBe(ErrorSeverity.MEDIUM);
      expect(json.recoveryStrategy).toBe(ErrorRecoveryStrategy.RETRY);
      expect(json.context.issueKey).toBe('JSON-123');
      expect(json.context.operation).toBe('serialize');
      expect(json.debugInfo).toBeDefined();
      expect(json.timestamp).toBeDefined();
    });

    it('should include debug information in serialization', () => {
      const error = new NetworkError('Debug test');
      const json = error.toJSON();

      expect(json.debugInfo.errorCode).toBe(error.errorCode);
      expect(json.debugInfo.category).toBe(ErrorCategory.NETWORK);
      expect(json.debugInfo.severity).toBe(ErrorSeverity.MEDIUM);
      expect(json.debugInfo.context).toBeDefined();
      expect(json.debugInfo.timestamp).toBeDefined();
    });
  });

  describe('Type Guards', () => {
    it('should correctly identify error types', () => {
      const networkError = new NetworkError('Network test');
      const apiError = new ApiError('API test');
      const authError = new AuthenticationError('Auth test');
      const rateLimitError = new RateLimitError('Rate limit test');
      const conflictError = new ConflictError('Conflict test');
      const regularError = new Error('Regular error');

      expect(isJiraPluginError(networkError)).toBe(true);
      expect(isJiraPluginError(apiError)).toBe(true);
      expect(isJiraPluginError(regularError)).toBe(false);

      expect(isNetworkError(networkError)).toBe(true);
      expect(isNetworkError(apiError)).toBe(false);

      expect(isApiError(apiError)).toBe(true);
      expect(isApiError(networkError)).toBe(false);

      expect(isAuthenticationError(authError)).toBe(true);
      expect(isAuthenticationError(apiError)).toBe(false);

      expect(isRateLimitError(rateLimitError)).toBe(true);
      expect(isRateLimitError(networkError)).toBe(false);

      expect(isConflictError(conflictError)).toBe(true);
      expect(isConflictError(rateLimitError)).toBe(false);
    });
  });

  describe('Error Wrapping', () => {
    it('should wrap regular errors as plugin errors', () => {
      const regularError = new Error('Regular error message');
      const wrappedError = wrapError(regularError, ErrorCategory.NETWORK);

      expect(wrappedError).toBeInstanceOf(NetworkError);
      expect(wrappedError.message).toBe('Regular error message');
      expect(wrappedError.originalError).toBe(regularError);
      expect(wrappedError.category).toBe(ErrorCategory.NETWORK);
    });

    it('should return existing plugin errors unchanged', () => {
      const pluginError = new ApiError('Already a plugin error');
      const wrappedError = wrapError(pluginError);

      expect(wrappedError).toBe(pluginError);
    });

    it('should wrap different error types based on category', () => {
      const testCases = [
        { category: ErrorCategory.NETWORK, expectedType: NetworkError },
        { category: ErrorCategory.API, expectedType: ApiError },
        { category: ErrorCategory.AUTH, expectedType: AuthenticationError },
        { category: ErrorCategory.VALIDATION, expectedType: ValidationError },
        { category: ErrorCategory.FILE_SYSTEM, expectedType: FileSystemError },
        { category: ErrorCategory.CONFLICT, expectedType: ConflictError },
        { category: ErrorCategory.RATE_LIMIT, expectedType: RateLimitError },
        { category: ErrorCategory.SYNC, expectedType: SyncError },
        { category: ErrorCategory.CONFIG, expectedType: ConfigurationError },
        { category: ErrorCategory.PLUGIN, expectedType: PluginError },
      ];

      testCases.forEach(({ category, expectedType }) => {
        const error = new Error('Test error');
        const wrapped = wrapError(error, category);
        expect(wrapped).toBeInstanceOf(expectedType);
        expect(wrapped.category).toBe(category);
      });
    });

    it('should include context when wrapping errors', () => {
      const error = new Error('Test error');
      const context: ErrorContext = {
        issueKey: 'WRAP-123',
        operation: 'wrapTest',
      };

      const wrapped = wrapError(error, ErrorCategory.SYNC, context);

      expect(wrapped.context.issueKey).toBe('WRAP-123');
      expect(wrapped.context.operation).toBe('wrapTest');
    });

    it('should handle undefined and null errors', () => {
      const wrappedUndefined = wrapError(undefined);
      expect(wrappedUndefined).toBeInstanceOf(PluginError);
      expect(wrappedUndefined.message).toBe('Unknown error occurred');

      const wrappedNull = wrapError(null);
      expect(wrappedNull).toBeInstanceOf(PluginError);
      expect(wrappedNull.message).toBe('Unknown error occurred');
    });

    it('should handle non-Error objects', () => {
      const stringError = 'String error message';
      const objectError = { message: 'Object error', code: 500 };

      const wrappedString = wrapError(stringError);
      expect(wrappedString).toBeInstanceOf(PluginError);
      expect(wrappedString.message).toBe('Unknown error occurred');

      const wrappedObject = wrapError(objectError);
      expect(wrappedObject).toBeInstanceOf(PluginError);
      expect(wrappedObject.message).toBe('Object error');
    });
  });

  describe('User Notifications', () => {
    // Note: These tests would need to mock the Obsidian Notice API
    // For now, we test that the method exists and doesn't throw
    it('should have showNotification method', () => {
      const error = new NetworkError('Test notification');
      expect(typeof error.showNotification).toBe('function');

      // In real implementation, this would show a Notice
      // For testing, we just ensure it doesn't throw
      expect(() => error.showNotification()).not.toThrow();
    });

    it('should not show notifications for low severity errors', () => {
      const lowSeverityError = new RateLimitError('Low severity test');
      expect(lowSeverityError.severity).toBe(ErrorSeverity.LOW);

      // In real implementation, we'd mock Notice to verify it's not called
      expect(() => lowSeverityError.showNotification()).not.toThrow();
    });
  });

  describe('Stack Traces', () => {
    it('should maintain proper stack traces', () => {
      const error = new NetworkError('Stack trace test');
      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('NetworkError');
      expect(error.stack).toContain('Stack trace test');
    });

    it('should preserve original error stack traces', () => {
      const originalError = new Error('Original stack');
      const wrapped = new SyncError('Wrapper error', {}, originalError);

      expect(wrapped.originalError).toBe(originalError);
      expect(wrapped.debugInfo.originalError?.stack).toBe(originalError.stack);
    });
  });
});
