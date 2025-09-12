/**
 * Tests for Enhanced Retry Mechanism
 * Comprehensive test suite covering retry logic, exponential backoff,
 * circuit breaker patterns, and failure scenarios
 */

// Mock Obsidian modules
vi.mock('obsidian', () => ({
  Notice: vi.fn(),
  Plugin: vi.fn(),
  TFile: vi.fn(),
  TFolder: vi.fn(),
  Vault: vi.fn(),
  requestUrl: vi.fn()
}));
import { EnhancedRetryManager, RetryPatterns, RetryConfig, RetryResult } from '../../src/sync/enhanced-retry';
import { EventManager } from '../../src/events/event-manager';
import { Notice } from 'obsidian';
import type { Mock, Mocked, MockedFunction } from 'vitest';
describe('EnhancedRetryManager', () => {
  let retryManager: EnhancedRetryManager;
  let mockEventManager: Mocked<EventManager>;
  beforeEach(() => {
    mockEventManager = {
      createEvent: vi.fn(),
      emit: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
      once: vi.fn(),
      removeAllListeners: vi.fn()
    } as any;
    retryManager = new EnhancedRetryManager(undefined, mockEventManager);
  });
  describe('Basic Retry Functionality', () => {
    it('should succeed on first attempt when operation succeeds', async () => {
      const successOperation = vi.fn().mockResolvedValue('success');
      
      const result = await retryManager.executeWithRetry(successOperation, 'test-operation');
      expect(result.success).toBe(true);
      expect(result.data).toBe('success');
      expect(result.attempts).toHaveLength(1);
      expect(result.attempts[0].attempt).toBe(0);
      expect(result.attempts[0].delay).toBe(0);
      expect(successOperation).toHaveBeenCalledTimes(1);
    });
    it('should retry on failure and eventually succeed', async () => {
      let callCount = 0;
      const flakyOperation = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount <= 2) {
          return Promise.reject(new Error(`Attempt ${callCount} failed`));
        }
        return Promise.resolve('success');
      });
      const result = await retryManager.executeWithRetry(flakyOperation, 'flaky-operation');
      expect(result.attempts).toHaveLength(3);
      expect(flakyOperation).toHaveBeenCalledTimes(3);
      // Verify retry delays are applied
      expect(result.attempts[1].delay).toBeGreaterThan(0);
      expect(result.attempts[2].delay).toBeGreaterThan(result.attempts[1].delay);
    it('should fail after exhausting all retries', async () => {
      const failingOperation = vi.fn().mockRejectedValue(new Error('Persistent failure'));
      const result = await retryManager.executeWithRetry(
        failingOperation, 
        'failing-operation',
        { maxRetries: 3 }
      );
      expect(result.success).toBe(false);
      expect(result.error?.message).toBe('Persistent failure');
      expect(result.attempts).toHaveLength(4); // Initial attempt + 3 retries
      expect(failingOperation).toHaveBeenCalledTimes(4);
  describe('Exponential Backoff', () => {
    it('should implement exponential backoff with default multiplier', async () => {
      const failingOperation = vi.fn().mockRejectedValue(new Error('Test error'));
      const config: Partial<RetryConfig> = {
        maxRetries: 3,
        baseDelay: 1000,
        backoffMultiplier: 2.0,
        jitter: false
      };
        failingOperation,
        'backoff-test',
        config
      expect(result.attempts).toHaveLength(4);
      expect(result.attempts[1].delay).toBe(1000);  // 1000 * 2^0
      expect(result.attempts[2].delay).toBe(2000);  // 1000 * 2^1
      expect(result.attempts[3].delay).toBe(4000);  // 1000 * 2^2
    it('should respect maximum delay limit', async () => {
        maxRetries: 5,
        maxDelay: 3000,
        'max-delay-test',
      // Should cap at maxDelay
      expect(result.attempts[3].delay).toBe(3000);
      expect(result.attempts[4].delay).toBe(3000);
      expect(result.attempts[5].delay).toBe(3000);
    it('should add jitter when enabled', async () => {
        maxRetries: 2,
        jitter: true
      // Run multiple times to test jitter randomness
      const results = [];
      for (let i = 0; i < 5; i++) {
        const result = await retryManager.executeWithRetry(
          () => Promise.reject(new Error('Test')),
          `jitter-test-${i}`,
          config
        );
        results.push(result.attempts[1].delay);
      }
      // With jitter, delays should not all be identical
      const uniqueDelays = new Set(results);
      expect(uniqueDelays.size).toBeGreaterThan(1);
  describe('Circuit Breaker Pattern', () => {
    it('should open circuit breaker after threshold failures', async () => {
        maxRetries: 1,
        circuitBreakerThreshold: 3,
        baseDelay: 100
      // First failure - circuit should remain closed
      let result1 = await retryManager.executeWithRetry(
        'circuit-test',
      expect(result1.circuitBreakerOpen).toBe(false);
      // Second failure - circuit should remain closed
      let result2 = await retryManager.executeWithRetry(
      expect(result2.circuitBreakerOpen).toBe(false);
      // Third failure - circuit should open
      let result3 = await retryManager.executeWithRetry(
      expect(result3.circuitBreakerOpen).toBe(true);
      // Fourth attempt should be blocked by circuit breaker
      let result4 = await retryManager.executeWithRetry(
      expect(result4.circuitBreakerOpen).toBe(true);
      expect(result4.attempts).toHaveLength(0); // No attempts made
      expect(result4.error?.message).toContain('Circuit breaker open');
    it('should reset circuit breaker on successful operation', async () => {
        circuitBreakerThreshold: 2,
      // First two failures to open circuit
      await retryManager.executeWithRetry(
        () => Promise.reject(new Error('Failure 1')),
        'reset-test',
        () => Promise.reject(new Error('Failure 2')),
      // Verify circuit is open
      const stats = retryManager.getCircuitBreakerStats('reset-test');
      expect(stats.isOpen).toBe(true);
      // Wait for circuit breaker timeout (simulate timeout)
      const shortTimeoutConfig = { ...config, circuitBreakerTimeout: 100 };
      retryManager = new EnhancedRetryManager(shortTimeoutConfig, mockEventManager);
      await new Promise(resolve => setTimeout(resolve, 150));
      // Successful operation should reset circuit
      const successResult = await retryManager.executeWithRetry(
        () => Promise.resolve('success'),
      expect(successResult.success).toBe(true);
      expect(successResult.circuitBreakerOpen).toBe(false);
    it('should provide circuit breaker statistics', () => {
      const stats = retryManager.getCircuitBreakerStats('non-existent');
      expect(stats).toEqual({
        isOpen: false,
        failureCount: 0
    it('should allow manual circuit breaker reset', async () => {
        maxRetries: 0,
        circuitBreakerThreshold: 1,
      // Trigger circuit breaker
        () => Promise.reject(new Error('Test failure')),
        'manual-reset-test',
      let stats = retryManager.getCircuitBreakerStats('manual-reset-test');
      // Manually reset
      retryManager.resetCircuitBreakerManually('manual-reset-test');
      stats = retryManager.getCircuitBreakerStats('manual-reset-test');
      expect(stats.isOpen).toBe(false);
      expect(stats.failureCount).toBe(0);
  describe('Timeout Functionality', () => {
    it('should timeout long-running operations', async () => {
      const longRunningOperation = () => new Promise(resolve => {
        setTimeout(() => resolve('too-late'), 2000);
      const result = await retryManager.executeWithTimeoutAndRetry(
        longRunningOperation,
        'timeout-test',
        500, // 500ms timeout
        { maxRetries: 1 }
      expect(result.error?.message).toContain('timed out');
    it('should succeed if operation completes within timeout', async () => {
      const quickOperation = () => new Promise(resolve => {
        setTimeout(() => resolve('success'), 100);
        quickOperation,
        'quick-test',
  describe('Event Emission', () => {
    it('should emit retry attempt events', async () => {
      const failingOperation = vi.fn()
        .mockRejectedValueOnce(new Error('Attempt 1 failed'))
        .mockResolvedValueOnce('success');
      await retryManager.executeWithRetry(failingOperation, 'event-test');
      // Should emit events for retry attempts
      expect(mockEventManager.createEvent).toHaveBeenCalled();
      expect(mockEventManager.emit).toHaveBeenCalled();
    it('should emit success event after retries', async () => {
      const flakyOperation = vi.fn()
        .mockRejectedValueOnce(new Error('Temporary failure'))
      await retryManager.executeWithRetry(flakyOperation, 'success-event-test');
      // Verify success event emission
      const emitCalls = mockEventManager.emit.mock.calls;
      expect(emitCalls.length).toBeGreaterThan(0);
    it('should emit failure event after exhausting retries', async () => {
        'failure-event-test',
      // Verify failure event emission
  describe('Configuration Validation', () => {
    it('should use default configuration when none provided', () => {
      const defaultManager = new EnhancedRetryManager();
      // This is tested implicitly through other tests using default behavior
      expect(defaultManager).toBeDefined();
    it('should override default configuration with custom values', async () => {
      const customConfig: Partial<RetryConfig> = {
        baseDelay: 500,
        backoffMultiplier: 3.0
      const customManager = new EnhancedRetryManager(customConfig, mockEventManager);
      const result = await customManager.executeWithRetry(
        'custom-config-test'
      expect(result.attempts).toHaveLength(3); // Initial + 2 retries
      expect(result.attempts[1].delay).toBe(500);  // Custom base delay
      expect(result.attempts[2].delay).toBe(1500); // 500 * 3^1
  describe('Error Handling Edge Cases', () => {
    it('should handle undefined errors gracefully', async () => {
      const undefinedErrorOperation = vi.fn().mockRejectedValue(undefined);
        undefinedErrorOperation,
        'undefined-error-test',
      expect(result.attempts).toHaveLength(2);
    it('should handle non-Error objects as errors', async () => {
      const stringErrorOperation = vi.fn().mockRejectedValue('String error');
        stringErrorOperation,
        'string-error-test',
    it('should handle synchronous exceptions', async () => {
      const throwingOperation = vi.fn().mockImplementation(() => {
        throw new Error('Synchronous error');
        throwingOperation,
        'sync-error-test',
      expect(result.error?.message).toBe('Synchronous error');
  describe('Performance Characteristics', () => {
    it('should complete retries within reasonable time bounds', async () => {
      const startTime = Date.now();
        () => Promise.reject(new Error('Quick failure')),
        'performance-test',
        {
          maxRetries: 3,
          baseDelay: 100,
          backoffMultiplier: 1.5,
          jitter: false
      const duration = Date.now() - startTime;
      // Should complete within expected time bounds
      // Expected: ~100 + ~150 + ~225 = ~475ms + overhead
      expect(duration).toBeLessThan(1000); // Allow some overhead
      expect(duration).toBeGreaterThan(400); // Should take at least the delays
    it('should track total duration accurately', async () => {
        () => Promise.reject(new Error('Duration test')),
        'duration-test',
          maxRetries: 2,
          baseDelay: 50,
      expect(result.totalDuration).toBeGreaterThan(100); // At least 50 + 50 delays
      expect(result.totalDuration).toBeLessThan(500); // Reasonable upper bound
});
describe('RetryPatterns', () => {
  describe('Predefined Patterns', () => {
    it('should create API retry manager with appropriate settings', () => {
      const apiManager = RetryPatterns.createApiRetryManager();
      expect(apiManager).toBeInstanceOf(EnhancedRetryManager);
    it('should create file retry manager with conservative settings', () => {
      const fileManager = RetryPatterns.createFileRetryManager();
      expect(fileManager).toBeInstanceOf(EnhancedRetryManager);
    it('should create network retry manager with aggressive settings', () => {
      const networkManager = RetryPatterns.createNetworkRetryManager();
      expect(networkManager).toBeInstanceOf(EnhancedRetryManager);
  describe('Pattern Behavior Differences', () => {
    it('should have different retry characteristics for different patterns', async () => {
      const failingOperation = () => Promise.reject(new Error('Test failure'));
      const [apiResult, fileResult, networkResult] = await Promise.all([
        apiManager.executeWithRetry(failingOperation, 'api-test'),
        fileManager.executeWithRetry(failingOperation, 'file-test'),
        networkManager.executeWithRetry(failingOperation, 'network-test')
      ]);
      // Network should have the most retries
      expect(networkResult.attempts.length).toBeGreaterThan(apiResult.attempts.length);
      expect(apiResult.attempts.length).toBeGreaterThan(fileResult.attempts.length);
describe('Real-world Integration Scenarios', () => {
  describe('Network Failure Simulation', () => {
    it('should handle intermittent network failures', async () => {
      const intermittentNetworkOperation = vi.fn().mockImplementation(() => {
        // Simulate network being down for first 3 calls
        if (callCount <= 3) {
          const error = new Error('Network unavailable');
          error.name = 'NetworkError';
          return Promise.reject(error);
        return Promise.resolve('Network restored');
      const result = await networkManager.executeWithRetry(
        intermittentNetworkOperation,
        'network-failure-simulation'
      expect(result.data).toBe('Network restored');
      expect(result.attempts.length).toBe(4);
  describe('API Rate Limiting Simulation', () => {
    it('should handle API rate limiting with appropriate backoff', async () => {
      const rateLimitedOperation = vi.fn().mockImplementation(() => {
          const error = new Error('Rate limit exceeded');
          error.name = 'RateLimitError';
        return Promise.resolve('Request succeeded');
      const result = await apiManager.executeWithRetry(
        rateLimitedOperation,
        'rate-limit-simulation'
      expect(result.data).toBe('Request succeeded');
      expect(result.attempts.length).toBe(3);
  describe('Service Outage Simulation', () => {
    it('should handle complete service outage with circuit breaker', async () => {
      const serviceOutageOperation = vi.fn().mockRejectedValue(new Error('Service unavailable'));
      const manager = new EnhancedRetryManager({
      // First outage - should exhaust retries
      const result1 = await manager.executeWithRetry(
        serviceOutageOperation,
        'service-outage'
      expect(result1.success).toBe(false);
      // Second outage - should also exhaust retries and open circuit
      const result2 = await manager.executeWithRetry(
      expect(result2.success).toBe(false);
      expect(result2.circuitBreakerOpen).toBe(true);
      // Third attempt - should be blocked by circuit breaker
      const result3 = await manager.executeWithRetry(
      expect(result3.attempts).toHaveLength(0);
      expect(result3.error?.message).toContain('Circuit breaker open');
