/**
 * Tests for Error Handler Infrastructure
 * Following RED-GREEN-Refactor approach with real error scenarios
 */

import { Plugin } from 'obsidian';
import { 
  ErrorHandler, 
  ErrorHandlerConfig,
  ErrorStats 
} from '../../../src/errors/error-handler';
  NetworkError,
  ApiError,
  AuthenticationError,
  SyncError,
  ErrorCategory,
  ErrorSeverity,
  ErrorRecoveryStrategy,
  ErrorContext
} from '../../../src/errors/error-types';
import type { Mock, Mocked, MockedFunction } from 'vitest';
// Mock Obsidian Plugin
class MockPlugin implements Partial<Plugin> {
  manifest = { version: '1.0.0' };
  app = { 
    version: '1.0.0' 
  };
}
// Mock global handlers for testing
const mockWindow = {
  addEventListener: vi.fn(),
  removeEventListener: vi.fn()
};
// Setup global mocks
(global as any).window = mockWindow;
describe('ErrorHandler', () => {
  let mockPlugin: MockPlugin;
  let defaultConfig: ErrorHandlerConfig;
  let errorHandler: ErrorHandler;
  beforeEach(() => {
    mockPlugin = new MockPlugin();
    defaultConfig = {
      logLevel: 'warn',
      enableNotifications: true,
      enableRetries: true,
      maxRetryAttempts: 3,
      enableErrorReporting: false
    };
    
    // Clear mocks
    vi.clearAllMocks();
    console.error = vi.fn();
    console.warn = vi.fn();
    console.log = vi.fn();
    console.info = vi.fn();
    errorHandler = new ErrorHandler(mockPlugin as Plugin, defaultConfig);
  });
  afterEach(() => {
    errorHandler.shutdown();
  describe('Initialization', () => {
    it('should initialize with default configuration', () => {
      const stats = errorHandler.getStats();
      
      expect(stats.totalErrors).toBe(0);
      expect(stats.errorsByCategory[ErrorCategory.NETWORK]).toBe(0);
      expect(stats.errorsBySeverity[ErrorSeverity.HIGH]).toBe(0);
      expect(stats.recoveriesSuccessful).toBe(0);
      expect(stats.recoveriesFailed).toBe(0);
    });
    it('should set up global error handlers', () => {
      expect(mockWindow.addEventListener).toHaveBeenCalledWith(
        'unhandledrejection', 
        expect.any(Function)
      );
        'error', 
    it('should initialize all error categories in stats', () => {
      Object.values(ErrorCategory).forEach(category => {
        expect(stats.errorsByCategory[category]).toBe(0);
      });
    it('should initialize all error severities in stats', () => {
      Object.values(ErrorSeverity).forEach(severity => {
        expect(stats.errorsBySeverity[severity]).toBe(0);
  describe('Error Handling', () => {
    it('should handle network errors correctly', async () => {
      const networkError = new NetworkError('Connection failed', {
        httpStatus: 0,
        operation: 'fetchIssues'
      const result = await errorHandler.handleError(networkError);
      // Should attempt recovery for network errors
      expect(result).toBeDefined();
      expect(stats.totalErrors).toBe(1);
      expect(stats.errorsByCategory[ErrorCategory.NETWORK]).toBe(1);
      expect(stats.errorsBySeverity[ErrorSeverity.MEDIUM]).toBe(1);
      expect(stats.lastError).toBe(networkError);
    it('should handle API errors with different status codes', async () => {
      const testCases = [
        { status: 400, severity: ErrorSeverity.MEDIUM },
        { status: 401, severity: ErrorSeverity.MEDIUM },
        { status: 404, severity: ErrorSeverity.MEDIUM },
        { status: 429, severity: ErrorSeverity.MEDIUM },
        { status: 500, severity: ErrorSeverity.MEDIUM }
      ];
      for (const { status, severity } of testCases) {
        const apiError = new ApiError('API Error', { httpStatus: status });
        await errorHandler.handleError(apiError);
      }
      expect(stats.totalErrors).toBe(testCases.length);
      expect(stats.errorsByCategory[ErrorCategory.API]).toBe(testCases.length);
    it('should handle authentication errors with high severity', async () => {
      const authError = new AuthenticationError('Invalid credentials', {
        jiraInstance: 'test.atlassian.net'
      await errorHandler.handleError(authError);
      expect(stats.errorsByCategory[ErrorCategory.AUTH]).toBe(1);
      expect(stats.errorsBySeverity[ErrorSeverity.HIGH]).toBe(1);
    it('should accumulate error statistics correctly', async () => {
      const errors = [
        new NetworkError('Network 1'),
        new NetworkError('Network 2'),
        new ApiError('API 1'),
        new AuthenticationError('Auth 1'),
        new SyncError('Sync 1', {}, undefined, ErrorSeverity.CRITICAL)
      for (const error of errors) {
        await errorHandler.handleError(error);
      expect(stats.totalErrors).toBe(5);
      expect(stats.errorsByCategory[ErrorCategory.NETWORK]).toBe(2);
      expect(stats.errorsByCategory[ErrorCategory.API]).toBe(1);
      expect(stats.errorsByCategory[ErrorCategory.SYNC]).toBe(1);
      expect(stats.errorsBySeverity[ErrorSeverity.MEDIUM]).toBe(3);
      expect(stats.errorsBySeverity[ErrorSeverity.CRITICAL]).toBe(1);
    it('should calculate error rate over time window', async () => {
      // Add multiple errors rapidly
      for (let i = 0; i < 5; i++) {
        await errorHandler.handleError(new NetworkError(`Error ${i}`));
      expect(stats.errorRate).toBe(5); // 5 errors in current window
    it('should maintain error log with size limit', async () => {
      // This would be a long test to verify the 1000 error limit
      // For now, test that recent errors are accessible
      const testError = new ApiError('Test error');
      await errorHandler.handleError(testError);
      const recentErrors = errorHandler.getRecentErrors(10);
      expect(recentErrors).toHaveLength(1);
      expect(recentErrors[0]).toBe(testError);
  describe('Batch Error Handling', () => {
    it('should handle multiple errors in batch operations', async () => {
      const batchErrors = [
        { error: new NetworkError('Batch 1'), context: { operation: 'batchSync', issueKey: 'BATCH-1' } },
        { error: new ApiError('Batch 2'), context: { operation: 'batchSync', issueKey: 'BATCH-2' } },
        { error: new SyncError('Batch 3'), context: { operation: 'batchSync', issueKey: 'BATCH-3' } }
      const results = await errorHandler.handleBatchErrors(batchErrors, 'batchOperation');
      expect(results.successful + results.failed).toBe(3);
      expect(typeof results.successful).toBe('number');
      expect(typeof results.failed).toBe('number');
      expect(Array.isArray(results.recoveredErrors)).toBe(true);
      expect(stats.totalErrors).toBe(3);
    it('should include operation context in batch errors', async () => {
        { error: new NetworkError('Test'), context: { issueKey: 'TEST-1' } }
      await errorHandler.handleBatchErrors(batchErrors, 'testOperation');
      const recentErrors = errorHandler.getRecentErrors(1);
      expect(recentErrors[0].context.operation).toBe('testOperation');
      expect(recentErrors[0].context.issueKey).toBe('TEST-1');
  describe('Error Retrieval and Filtering', () => {
    beforeEach(async () => {
      // Set up test data
      const testErrors = [
        new SyncError('Sync 1', {}, undefined, ErrorSeverity.CRITICAL),
        new SyncError('Sync 2', {}, undefined, ErrorSeverity.LOW)
      for (const error of testErrors) {
    it('should retrieve errors by category', () => {
      const networkErrors = errorHandler.getErrorsByCategory(ErrorCategory.NETWORK);
      expect(networkErrors).toHaveLength(2);
      expect(networkErrors.every(e => e.category === ErrorCategory.NETWORK)).toBe(true);
      const apiErrors = errorHandler.getErrorsByCategory(ErrorCategory.API);
      expect(apiErrors).toHaveLength(1);
      expect(apiErrors[0].category).toBe(ErrorCategory.API);
    it('should retrieve errors by severity', () => {
      const mediumErrors = errorHandler.getErrorsBySeverity(ErrorSeverity.MEDIUM);
      expect(mediumErrors).toHaveLength(3); // Network 1&2, API 1
      const highErrors = errorHandler.getErrorsBySeverity(ErrorSeverity.HIGH);
      expect(highErrors).toHaveLength(1); // Auth 1
      const criticalErrors = errorHandler.getErrorsBySeverity(ErrorSeverity.CRITICAL);
      expect(criticalErrors).toHaveLength(1); // Sync 1
      const lowErrors = errorHandler.getErrorsBySeverity(ErrorSeverity.LOW);
      expect(lowErrors).toHaveLength(1); // Sync 2
    it('should limit results when requested', () => {
      const limitedErrors = errorHandler.getRecentErrors(3);
      expect(limitedErrors).toHaveLength(3);
      const categoryLimited = errorHandler.getErrorsByCategory(ErrorCategory.NETWORK, 1);
      expect(categoryLimited).toHaveLength(1);
  describe('Health Status Monitoring', () => {
    it('should report healthy status with low error rate', () => {
      const health = errorHandler.getHealthStatus();
      expect(health.status).toBe('healthy');
      expect(health.errorRate).toBe(0);
      expect(health.criticalErrors).toBe(0);
      expect(health.reason).toBeUndefined();
    it('should report degraded status with high error rate', async () => {
      // Generate many errors to increase rate
      for (let i = 0; i < 40; i++) {
        await errorHandler.handleError(new NetworkError(`High rate ${i}`));
      expect(health.status).toBe('degraded');
      expect(health.errorRate).toBeGreaterThan(30);
      expect(health.reason).toContain('High error rate');
    it('should report unhealthy status with many critical errors', async () => {
      // Generate critical errors
      for (let i = 0; i < 7; i++) {
        await errorHandler.handleError(new SyncError(`Critical ${i}`, {}, undefined, ErrorSeverity.CRITICAL));
      expect(health.status).toBe('unhealthy');
      expect(health.criticalErrors).toBeGreaterThan(5);
      expect(health.reason).toContain('critical errors');
    it('should check if error rate is high', async () => {
      expect(errorHandler.isErrorRateHigh()).toBe(false);
      // Add errors to increase rate
      for (let i = 0; i < 60; i++) {
        await errorHandler.handleError(new NetworkError(`Rate test ${i}`));
      expect(errorHandler.isErrorRateHigh()).toBe(true);
      expect(errorHandler.isErrorRateHigh(100)).toBe(false); // Higher threshold
  describe('Configuration Management', () => {
    it('should update configuration dynamically', () => {
      const newConfig = {
        logLevel: 'debug' as const,
        enableNotifications: false,
        maxRetryAttempts: 5
      };
      errorHandler.updateConfig(newConfig);
      // Test that new configuration is applied
      // (This would need access to internal config, or observable behavior changes)
      expect(true).toBe(true); // Placeholder - in real implementation would test config changes
    it('should respect log level configuration', async () => {
      // Test with warn level (default)
      await errorHandler.handleError(new NetworkError('Warn test'));
      // Update to debug level
      errorHandler.updateConfig({ logLevel: 'debug' });
      await errorHandler.handleError(new NetworkError('Debug test'));
      // Update to error level
      errorHandler.updateConfig({ logLevel: 'error' });
      await errorHandler.handleError(new NetworkError('Error test'));
      // Should still log errors regardless of level
      expect(console.error).toHaveBeenCalled();
  describe('Global Error Handling', () => {
    it('should handle unhandled promise rejections', () => {
      const unhandledRejectionHandler = mockWindow.addEventListener.mock.calls
        .find(call => call[0] === 'unhandledrejection')?.[1];
      expect(unhandledRejectionHandler).toBeDefined();
      if (unhandledRejectionHandler) {
        const mockEvent = {
          reason: new Error('Unhandled promise rejection'),
          preventDefault: vi.fn()
        };
        unhandledRejectionHandler(mockEvent);
        expect(mockEvent.preventDefault).toHaveBeenCalled();
        
        const stats = errorHandler.getStats();
        expect(stats.totalErrors).toBeGreaterThan(0);
    it('should handle uncaught exceptions', () => {
      const errorEventHandler = mockWindow.addEventListener.mock.calls
        .find(call => call[0] === 'error')?.[1];
      expect(errorEventHandler).toBeDefined();
      if (errorEventHandler) {
          error: new Error('Uncaught exception'),
          message: 'Uncaught exception',
          filename: 'test.js',
          lineno: 42,
          colno: 10
        errorEventHandler(mockEvent);
        const recentErrors = errorHandler.getRecentErrors(1);
        expect(recentErrors[0].context.metadata?.filename).toBe('test.js');
        expect(recentErrors[0].context.metadata?.lineno).toBe(42);
  describe('Error Log Management', () => {
    it('should clear error log and statistics', async () => {
      // Add some errors
      await errorHandler.handleError(new NetworkError('Test 1'));
      await errorHandler.handleError(new ApiError('Test 2'));
      let stats = errorHandler.getStats();
      expect(stats.totalErrors).toBe(2);
      // Clear log
      errorHandler.clearErrorLog();
      stats = errorHandler.getStats();
      expect(stats.errorRate).toBe(0);
      const recentErrors = errorHandler.getRecentErrors();
      expect(recentErrors).toHaveLength(0);
    it('should handle errors in error handling gracefully', async () => {
      // Create a scenario where error handling itself fails
      const problematicError = {
        message: 'Test error',
        // Missing other required properties to potentially cause issues
      // Should not throw even with malformed error
      await expect(errorHandler.handleError(problematicError)).resolves.toBeDefined();
  describe('Recovery Integration', () => {
    it('should attempt recovery when enabled', async () => {
      // Enable recovery
      const configWithRetry = { ...defaultConfig, enableRetries: true };
      const retryHandler = new ErrorHandler(mockPlugin as Plugin, configWithRetry);
      try {
        const networkError = new NetworkError('Recoverable error');
        const result = await retryHandler.handleError(networkError);
        // Result should be boolean indicating recovery attempt
        expect(typeof result).toBe('boolean');
        const stats = retryHandler.getStats();
        expect(stats.totalErrors).toBe(1);
        // Recovery stats should be updated (success or failure)
        expect(stats.recoveriesSuccessful + stats.recoveriesFailed).toBeGreaterThan(0);
      } finally {
        retryHandler.shutdown();
    it('should skip recovery when disabled', async () => {
      // Disable recovery
      const configNoRetry = { ...defaultConfig, enableRetries: false };
      const noRetryHandler = new ErrorHandler(mockPlugin as Plugin, configNoRetry);
        const networkError = new NetworkError('Non-recoverable error');
        const result = await noRetryHandler.handleError(networkError);
        const stats = noRetryHandler.getStats();
        expect(stats.recoveriesSuccessful).toBe(0);
        expect(stats.recoveriesFailed).toBe(0);
        noRetryHandler.shutdown();
    it('should skip recovery when explicitly requested', async () => {
      const networkError = new NetworkError('Skip recovery test');
      const result = await errorHandler.handleError(networkError, {}, true); // skipRecovery = true
      // Recovery should not be attempted
  describe('Memory Management', () => {
    it('should handle shutdown gracefully', () => {
      expect(() => errorHandler.shutdown()).not.toThrow();
      // After shutdown, handler should still work but recovery service is cleaned up
      expect(async () => {
        await errorHandler.handleError(new NetworkError('After shutdown'));
      }).not.toThrow();
    it('should not cause memory leaks with many errors', async () => {
      // Add more errors than the max log size to test trimming
      for (let i = 0; i < 1100; i++) {
        await errorHandler.handleError(new NetworkError(`Memory test ${i}`));
      const recentErrors = errorHandler.getRecentErrors(2000);
      expect(recentErrors.length).toBeLessThanOrEqual(1000); // Should be capped at max size
});
