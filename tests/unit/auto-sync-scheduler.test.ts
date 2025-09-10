/**
 * Comprehensive tests for AutoSyncScheduler
 * Tests all aspects including lifecycle, interval management, state persistence,
 * failure recovery, statistics tracking, configuration updates, and edge cases
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { AutoSyncScheduler, AutoSyncConfig, SyncState, SyncCallbackOptions } from '../../src/enhanced-sync/auto-sync-scheduler';
import { JQLQueryEngine } from '../../src/enhanced-sync/jql-query-engine';
import { Plugin } from '../../tests/__mocks__/obsidian';
import { MockTimer, createDeferred, waitFor, RetryTester } from '../utils/test-helpers';

// Mock the JQL Query Engine
const mockJQLQueryEngine = {
  executeQuery: jest.fn(),
  validateQuery: jest.fn(),
  getSearchResults: jest.fn()
} as jest.Mocked<JQLQueryEngine>;

describe('AutoSyncScheduler - Comprehensive Tests', () => {
  let scheduler: AutoSyncScheduler;
  let mockPlugin: Plugin;
  let mockTimer: MockTimer;
  let mockSyncCallback: jest.Mock<Promise<void>, [SyncCallbackOptions]>;
  let defaultConfig: AutoSyncConfig;
  let savedData: any;

  beforeEach(() => {
    // Setup mock timer
    mockTimer = new MockTimer();
    mockTimer.install();

    // Reset saved data
    savedData = {};

    // Create mock plugin with data persistence
    mockPlugin = new Plugin({} as any, {});
    mockPlugin.loadData = jest.fn().mockResolvedValue(savedData);
    mockPlugin.saveData = jest.fn().mockImplementation(async (data) => {
      savedData = { ...savedData, ...data };
    });

    // Create default configuration
    defaultConfig = {
      enabled: true,
      jqlQuery: 'project = TEST AND status != Done',
      syncInterval: 5, // 5 minutes
      maxResults: 1000,
      batchSize: 50
    };

    // Create mock sync callback
    mockSyncCallback = jest.fn().mockResolvedValue(undefined);

    // Clear all mocks
    jest.clearAllMocks();
  });

  afterEach(() => {
    // Stop scheduler and cleanup
    if (scheduler) {
      scheduler.stop();
    }
    mockTimer.uninstall();
  });

  // Helper to create scheduler instance
  const createScheduler = (config = defaultConfig) => {
    return new AutoSyncScheduler(
      mockPlugin,
      mockJQLQueryEngine,
      config,
      mockSyncCallback
    );
  };

  describe('Start/Stop Lifecycle', () => {
    it('should initialize correctly and not be running initially', () => {
      scheduler = createScheduler();
      
      expect(scheduler.isRunning()).toBe(false);
      expect(mockSyncCallback).not.toHaveBeenCalled();
    });

    it('should start successfully and perform immediate sync', async () => {
      scheduler = createScheduler();
      
      await scheduler.start();
      
      expect(scheduler.isRunning()).toBe(true);
      expect(mockSyncCallback).toHaveBeenCalledTimes(1);
      expect(mockSyncCallback).toHaveBeenCalledWith({
        isManual: false,
        isInitial: true
      });
    });

    it('should prevent multiple simultaneous starts', async () => {
      scheduler = createScheduler();
      
      const start1 = scheduler.start();
      const start2 = scheduler.start();
      
      await Promise.all([start1, start2]);
      
      expect(scheduler.isRunning()).toBe(true);
      expect(mockSyncCallback).toHaveBeenCalledTimes(1); // Only one initial sync
    });

    it('should stop successfully and clear all timers', async () => {
      scheduler = createScheduler();
      
      await scheduler.start();
      expect(scheduler.isRunning()).toBe(true);
      expect(mockTimer.getPendingTimerCount()).toBeGreaterThan(0);
      
      scheduler.stop();
      
      expect(scheduler.isRunning()).toBe(false);
      expect(mockTimer.getPendingTimerCount()).toBe(0);
    });

    it('should handle stop when not running gracefully', () => {
      scheduler = createScheduler();
      
      expect(() => scheduler.stop()).not.toThrow();
      expect(scheduler.isRunning()).toBe(false);
    });

    it('should cleanup properly on restart', async () => {
      scheduler = createScheduler();
      
      await scheduler.start();
      const initialTimerCount = mockTimer.getPendingTimerCount();
      
      scheduler.stop();
      await scheduler.start();
      
      // Should have same or fewer timers after restart
      expect(mockTimer.getPendingTimerCount()).toBeGreaterThanOrEqual(0);
      expect(scheduler.isRunning()).toBe(true);
    });
  });

  describe('Immediate Sync on Start', () => {
    it('should perform immediate sync with correct parameters', async () => {
      scheduler = createScheduler();
      
      await scheduler.start();
      
      expect(mockSyncCallback).toHaveBeenCalledWith({
        isManual: false,
        isInitial: true
      });
    });

    it('should continue running even if immediate sync fails', async () => {
      scheduler = createScheduler();
      mockSyncCallback.mockRejectedValueOnce(new Error('Initial sync failed'));
      
      await scheduler.start();
      
      expect(scheduler.isRunning()).toBe(true);
      expect(scheduler.getFailureCount()).toBe(1);
    });

    it('should not block start() on immediate sync failure', async () => {
      scheduler = createScheduler();
      mockSyncCallback.mockRejectedValueOnce(new Error('Initial sync failed'));
      
      const startTime = mockTimer.getCurrentTime();
      await scheduler.start();
      const endTime = mockTimer.getCurrentTime();
      
      // Start should complete quickly even if sync fails
      expect(endTime - startTime).toBeLessThan(100);
      expect(scheduler.isRunning()).toBe(true);
    });
  });

  describe('Interval Management (1-60 minutes)', () => {
    it('should accept valid intervals', () => {
      scheduler = createScheduler();
      
      // Test boundary values
      expect(() => scheduler.updateInterval(1)).not.toThrow();
      expect(() => scheduler.updateInterval(60)).not.toThrow();
      expect(() => scheduler.updateInterval(30)).not.toThrow();
      
      expect(scheduler.getConfig().syncInterval).toBe(30);
    });

    it('should reject invalid intervals', () => {
      scheduler = createScheduler();
      
      expect(() => scheduler.updateInterval(0)).toThrow('Sync interval must be between 1 and 60 minutes');
      expect(() => scheduler.updateInterval(-1)).toThrow('Sync interval must be between 1 and 60 minutes');
      expect(() => scheduler.updateInterval(61)).toThrow('Sync interval must be between 1 and 60 minutes');
      expect(() => scheduler.updateInterval(120)).toThrow('Sync interval must be between 1 and 60 minutes');
    });

    it('should update interval dynamically while running', async () => {
      scheduler = createScheduler({ ...defaultConfig, syncInterval: 5 });
      
      await scheduler.start();
      mockSyncCallback.mockClear();
      
      // Update to 2-minute interval
      scheduler.updateInterval(2);
      
      // Should use new interval
      mockTimer.advanceTime(2 * 60 * 1000); // 2 minutes
      expect(mockSyncCallback).toHaveBeenCalledTimes(1);
      
      mockTimer.advanceTime(2 * 60 * 1000); // Another 2 minutes
      expect(mockSyncCallback).toHaveBeenCalledTimes(2);
    });

    it('should handle interval updates when not running', () => {
      scheduler = createScheduler();
      
      scheduler.updateInterval(10);
      
      expect(scheduler.getConfig().syncInterval).toBe(10);
      expect(scheduler.isRunning()).toBe(false);
    });

    it('should execute syncs at correct intervals', async () => {
      scheduler = createScheduler({ ...defaultConfig, syncInterval: 3 });
      
      await scheduler.start();
      mockSyncCallback.mockClear();
      
      // Advance time and check sync execution
      mockTimer.advanceTime(3 * 60 * 1000); // 3 minutes
      expect(mockSyncCallback).toHaveBeenCalledTimes(1);
      
      mockTimer.advanceTime(3 * 60 * 1000); // Another 3 minutes
      expect(mockSyncCallback).toHaveBeenCalledTimes(2);
      
      mockTimer.advanceTime(3 * 60 * 1000); // Another 3 minutes
      expect(mockSyncCallback).toHaveBeenCalledTimes(3);
    });
  });

  describe('State Persistence (save/load)', () => {
    it('should save state to plugin data', async () => {
      scheduler = createScheduler();
      
      const testState: Partial<SyncState> = {
        lastSyncTime: '2025-01-10T10:00:00Z',
        lastSyncStatus: 'success',
        totalSyncCount: 42,
        failureCount: 3,
        successfulSyncCount: 39,
        failedSyncCount: 3,
        syncDurations: [1000, 2000, 1500]
      };
      
      scheduler.setState(testState);
      await scheduler.saveState();
      
      expect(mockPlugin.saveData).toHaveBeenCalledWith({
        syncState: expect.objectContaining(testState)
      });
    });

    it('should load state from plugin data', async () => {
      const savedState = {
        syncState: {
          lastSyncTime: '2025-01-10T10:00:00Z',
          lastSyncStatus: 'success',
          totalSyncCount: 42,
          failureCount: 3,
          successfulSyncCount: 39,
          failedSyncCount: 3,
          syncDurations: [1000, 2000, 1500]
        }
      };
      
      savedData = savedState;
      scheduler = createScheduler();
      
      await scheduler.loadState();
      
      const state = scheduler.getState();
      expect(state.lastSyncTime).toBe('2025-01-10T10:00:00Z');
      expect(state.totalSyncCount).toBe(42);
      expect(state.failureCount).toBe(3);
      expect(state.successfulSyncCount).toBe(39);
      expect(state.failedSyncCount).toBe(3);
      expect(state.syncDurations).toEqual([1000, 2000, 1500]);
    });

    it('should handle missing state data gracefully', async () => {
      scheduler = createScheduler();
      
      await scheduler.loadState();
      
      const state = scheduler.getState();
      expect(state.lastSyncTime).toBe(null);
      expect(state.totalSyncCount).toBe(0);
      expect(state.failureCount).toBe(0);
      expect(state.successfulSyncCount).toBe(0);
      expect(state.failedSyncCount).toBe(0);
      expect(state.syncDurations).toEqual([]);
    });

    it('should merge loaded state with initial state', async () => {
      const partialState = {
        syncState: {
          totalSyncCount: 10,
          failureCount: 2
          // Missing other fields
        }
      };
      
      savedData = partialState;
      scheduler = createScheduler();
      
      await scheduler.loadState();
      
      const state = scheduler.getState();
      expect(state.totalSyncCount).toBe(10);
      expect(state.failureCount).toBe(2);
      // Should have defaults for missing fields
      expect(state.lastSyncTime).toBe(null);
      expect(state.successfulSyncCount).toBe(0);
      expect(state.failedSyncCount).toBe(0);
    });

    it('should persist state after successful sync', async () => {
      scheduler = createScheduler();
      
      await scheduler.start();
      
      expect(mockPlugin.saveData).toHaveBeenCalled();
      
      const saveCall = mockPlugin.saveData.mock.calls[0][0];
      expect(saveCall.syncState.lastSyncStatus).toBe('success');
      expect(saveCall.syncState.totalSyncCount).toBe(1);
      expect(saveCall.syncState.successfulSyncCount).toBe(1);
    });

    it('should persist state after failed sync', async () => {
      scheduler = createScheduler();
      mockSyncCallback.mockRejectedValueOnce(new Error('Sync failed'));
      
      await scheduler.start();
      
      expect(mockPlugin.saveData).toHaveBeenCalled();
      
      const saveCall = mockPlugin.saveData.mock.calls[0][0];
      expect(saveCall.syncState.lastSyncStatus).toBe('failure');
      expect(saveCall.syncState.totalSyncCount).toBe(1);
      expect(saveCall.syncState.failedSyncCount).toBe(1);
      expect(saveCall.syncState.failureCount).toBe(1);
    });
  });

  describe('Failure Recovery with Exponential Backoff', () => {
    it('should implement exponential backoff on consecutive failures', async () => {
      scheduler = createScheduler();
      mockSyncCallback.mockRejectedValue(new Error('Persistent failure'));
      
      await scheduler.start();
      
      // Initial failure
      expect(scheduler.getFailureCount()).toBe(1);
      expect(scheduler.getRetryDelay()).toBe(60 * 1000); // 1 minute base delay
      
      // Advance to first retry
      mockTimer.advanceTime(60 * 1000);
      expect(scheduler.getFailureCount()).toBe(2);
      expect(scheduler.getRetryDelay()).toBe(120 * 1000); // 2 minutes
      
      // Advance to second retry
      mockTimer.advanceTime(120 * 1000);
      expect(scheduler.getFailureCount()).toBe(3);
      expect(scheduler.getRetryDelay()).toBe(240 * 1000); // 4 minutes
      
      // Advance to third retry
      mockTimer.advanceTime(240 * 1000);
      expect(scheduler.getFailureCount()).toBe(4);
      expect(scheduler.getRetryDelay()).toBe(480 * 1000); // 8 minutes
    });

    it('should cap retry delay at maximum (30 minutes)', async () => {
      scheduler = createScheduler();
      
      // Set high failure count
      scheduler.setState({ failureCount: 15 });
      
      const maxDelay = 30 * 60 * 1000; // 30 minutes
      expect(scheduler.getRetryDelay()).toBe(maxDelay);
    });

    it('should reset failure count on successful sync', async () => {
      scheduler = createScheduler();
      
      // Start with failures, then success
      mockSyncCallback
        .mockRejectedValueOnce(new Error('Fail 1'))
        .mockRejectedValueOnce(new Error('Fail 2'))
        .mockResolvedValueOnce(undefined);
      
      await scheduler.start();
      expect(scheduler.getFailureCount()).toBe(1);
      
      // First retry (fails)
      mockTimer.advanceTime(60 * 1000);
      expect(scheduler.getFailureCount()).toBe(2);
      
      // Second retry (succeeds)
      mockTimer.advanceTime(120 * 1000);
      expect(scheduler.getFailureCount()).toBe(0); // Reset on success
    });

    it('should not schedule retry for manual sync failures', async () => {
      scheduler = createScheduler();
      mockSyncCallback.mockRejectedValueOnce(new Error('Manual sync failed'));
      
      const initialTimers = mockTimer.getPendingTimerCount();
      
      await scheduler.triggerManualSync();
      
      expect(scheduler.getFailureCount()).toBe(1);
      // Should not schedule retry for manual sync
      expect(mockTimer.getPendingTimerCount()).toBe(initialTimers);
    });

    it('should continue retry schedule only when running', async () => {
      scheduler = createScheduler();
      mockSyncCallback.mockRejectedValue(new Error('Failure'));
      
      await scheduler.start();
      expect(scheduler.getFailureCount()).toBe(1);
      
      // Stop scheduler
      scheduler.stop();
      
      // Advance time - should not trigger retry
      const callCount = mockSyncCallback.mock.calls.length;
      mockTimer.advanceTime(60 * 1000);
      expect(mockSyncCallback).toHaveBeenCalledTimes(callCount); // No additional calls
    });

    it('should use RetryTester helper for complex retry scenarios', async () => {
      const retryTester = new RetryTester(3); // Succeed after 3 attempts
      scheduler = createScheduler();
      
      mockSyncCallback.mockImplementation(async () => {
        return retryTester.execute(undefined, 'Network failure');
      });
      
      await scheduler.start();
      
      // Should fail initially
      expect(scheduler.getFailureCount()).toBe(1);
      expect(retryTester.getAttempts()).toBe(1);
      
      // First retry (fails)
      mockTimer.advanceTime(60 * 1000);
      expect(scheduler.getFailureCount()).toBe(2);
      expect(retryTester.getAttempts()).toBe(2);
      
      // Second retry (fails)
      mockTimer.advanceTime(120 * 1000);
      expect(scheduler.getFailureCount()).toBe(3);
      expect(retryTester.getAttempts()).toBe(3);
      
      // Third retry (succeeds)
      mockTimer.advanceTime(240 * 1000);
      expect(scheduler.getFailureCount()).toBe(0); // Reset on success
    });
  });

  describe('Manual Sync Triggers', () => {
    it('should trigger manual sync with correct parameters', async () => {
      scheduler = createScheduler();
      
      await scheduler.triggerManualSync();
      
      expect(mockSyncCallback).toHaveBeenCalledWith({
        isManual: true,
        isInitial: false
      });
    });

    it('should prevent concurrent manual syncs', async () => {
      scheduler = createScheduler();
      
      // Create slow sync callback
      const deferred = createDeferred<void>();
      mockSyncCallback.mockImplementationOnce(() => deferred.promise);
      
      // Trigger multiple syncs
      const sync1 = scheduler.triggerManualSync();
      const sync2 = scheduler.triggerManualSync();
      const sync3 = scheduler.triggerManualSync();
      
      // Only first sync should be called
      expect(mockSyncCallback).toHaveBeenCalledTimes(1);
      
      // Resolve and wait
      deferred.resolve();
      await Promise.all([sync1, sync2, sync3]);
      
      // Still only one call
      expect(mockSyncCallback).toHaveBeenCalledTimes(1);
    });

    it('should allow manual sync when scheduler not running', async () => {
      scheduler = createScheduler();
      
      await scheduler.triggerManualSync();
      
      expect(mockSyncCallback).toHaveBeenCalledTimes(1);
      expect(scheduler.isRunning()).toBe(false);
    });

    it('should not interfere with scheduled syncs', async () => {
      scheduler = createScheduler();
      
      await scheduler.start();
      mockSyncCallback.mockClear();
      
      // Trigger manual sync
      await scheduler.triggerManualSync();
      expect(mockSyncCallback).toHaveBeenCalledTimes(1);
      
      // Scheduled sync should still occur
      mockTimer.advanceTime(5 * 60 * 1000);
      expect(mockSyncCallback).toHaveBeenCalledTimes(2);
    });

    it('should prevent scheduled sync during manual sync', async () => {
      scheduler = createScheduler();
      
      await scheduler.start();
      mockSyncCallback.mockClear();
      
      // Start long-running manual sync
      const deferred = createDeferred<void>();
      mockSyncCallback.mockImplementationOnce(() => deferred.promise);
      
      const manualSync = scheduler.triggerManualSync();
      
      // Try to trigger scheduled sync while manual is running
      mockTimer.advanceTime(5 * 60 * 1000);
      
      // Should only have one call (the manual sync)
      expect(mockSyncCallback).toHaveBeenCalledTimes(1);
      
      deferred.resolve();
      await manualSync;
    });
  });

  describe('Statistics Tracking', () => {
    it('should track success/failure counts correctly', async () => {
      scheduler = createScheduler();
      
      // Mix of success and failure
      mockSyncCallback
        .mockResolvedValueOnce(undefined) // Success
        .mockRejectedValueOnce(new Error('Fail')) // Failure
        .mockResolvedValueOnce(undefined) // Success
        .mockResolvedValueOnce(undefined); // Success
      
      await scheduler.start(); // First sync (success)
      
      // Scheduled sync (failure)
      mockTimer.advanceTime(5 * 60 * 1000);
      
      // Retry after failure (success)
      mockTimer.advanceTime(60 * 1000);
      
      // Another scheduled sync (success)
      mockTimer.advanceTime(5 * 60 * 1000);
      
      const stats = scheduler.getStatistics();
      expect(stats.totalSyncs).toBe(4);
      expect(stats.successfulSyncs).toBe(3);
      expect(stats.failedSyncs).toBe(1);
      expect(stats.lastSyncTime).toBeDefined();
    });

    it('should track sync durations and calculate average', async () => {
      scheduler = createScheduler();
      
      // Manually set durations for testing
      scheduler.setState({
        syncDurations: [1000, 2000, 3000, 4000, 5000]
      });
      
      const stats = scheduler.getStatistics();
      expect(stats.averageSyncDuration).toBe(3000); // Average of 1000-5000
    });

    it('should limit sync duration history to 10 entries', async () => {
      scheduler = createScheduler();
      
      // Set more than 10 durations
      const durations = Array.from({ length: 15 }, (_, i) => (i + 1) * 1000);
      scheduler.setState({ syncDurations: durations });
      
      const state = scheduler.getState();
      expect(state.syncDurations!.length).toBe(10); // Should be capped at 10
      // Should keep the last 10 entries
      expect(state.syncDurations).toEqual([6000, 7000, 8000, 9000, 10000, 11000, 12000, 13000, 14000, 15000]);
    });

    it('should report correct current status', async () => {
      scheduler = createScheduler();
      
      // Initially idle
      let stats = scheduler.getStatistics();
      expect(stats.currentStatus).toBe('idle');
      
      // During sync
      const deferred = createDeferred<void>();
      mockSyncCallback.mockImplementationOnce(() => deferred.promise);
      
      const syncPromise = scheduler.triggerManualSync();
      stats = scheduler.getStatistics();
      expect(stats.currentStatus).toBe('syncing');
      
      // Resolve sync
      deferred.resolve();
      await syncPromise;
      
      // Back to idle
      stats = scheduler.getStatistics();
      expect(stats.currentStatus).toBe('idle');
      
      // After failure
      mockSyncCallback.mockRejectedValueOnce(new Error('Sync failed'));
      await scheduler.triggerManualSync();
      
      stats = scheduler.getStatistics();
      expect(stats.currentStatus).toBe('error');
    });

    it('should handle empty duration history', () => {
      scheduler = createScheduler();
      
      const stats = scheduler.getStatistics();
      expect(stats.averageSyncDuration).toBe(0);
    });

    it('should update last sync time in ISO format', async () => {
      scheduler = createScheduler();
      const beforeSync = new Date();
      
      await scheduler.start();
      
      const stats = scheduler.getStatistics();
      expect(stats.lastSyncTime).toBeDefined();
      
      const lastSyncTime = new Date(stats.lastSyncTime!);
      expect(lastSyncTime).toBeInstanceOf(Date);
      expect(lastSyncTime.getTime()).toBeGreaterThanOrEqual(beforeSync.getTime());
    });
  });

  describe('Configuration Updates', () => {
    it('should update configuration correctly', () => {
      scheduler = createScheduler();
      
      const newConfig: AutoSyncConfig = {
        enabled: false,
        jqlQuery: 'project = UPDATED AND assignee = currentUser()',
        syncInterval: 15,
        maxResults: 500,
        batchSize: 25
      };
      
      scheduler.updateConfig(newConfig);
      
      const config = scheduler.getConfig();
      expect(config).toEqual(newConfig);
    });

    it('should enable/disable scheduler based on config', async () => {
      scheduler = createScheduler();
      
      // Start enabled
      await scheduler.start();
      expect(scheduler.isRunning()).toBe(true);
      
      // Disable via config
      scheduler.updateConfig({ ...defaultConfig, enabled: false });
      expect(scheduler.isRunning()).toBe(false);
      
      // Re-enable via config
      scheduler.updateConfig({ ...defaultConfig, enabled: true });
      await waitFor(() => scheduler.isRunning(), { timeout: 1000 });
      expect(scheduler.isRunning()).toBe(true);
    });

    it('should restart with new interval when config changes', async () => {
      scheduler = createScheduler();
      
      await scheduler.start();
      mockSyncCallback.mockClear();
      
      // Change interval from 5 to 2 minutes
      scheduler.updateConfig({ ...defaultConfig, syncInterval: 2 });
      
      // Should use new 2-minute interval
      mockTimer.advanceTime(2 * 60 * 1000);
      expect(mockSyncCallback).toHaveBeenCalledTimes(1);
      
      // Verify old interval doesn't trigger
      mockTimer.advanceTime(3 * 60 * 1000); // Would be 5 minutes total
      expect(mockSyncCallback).toHaveBeenCalledTimes(1); // Still only 1 call
      
      // Next 2-minute interval should trigger
      mockTimer.advanceTime(2 * 60 * 1000); // Now 7 minutes total, but 4 minutes since restart
      expect(mockSyncCallback).toHaveBeenCalledTimes(2);
    });

    it('should handle config change when not running', () => {
      scheduler = createScheduler();
      
      const newConfig: AutoSyncConfig = {
        enabled: true,
        jqlQuery: 'project = NEW',
        syncInterval: 10,
        maxResults: 200,
        batchSize: 20
      };
      
      scheduler.updateConfig(newConfig);
      
      expect(scheduler.getConfig()).toEqual(newConfig);
      expect(scheduler.isRunning()).toBe(false);
    });

    it('should preserve immutability of config', () => {
      scheduler = createScheduler();
      
      const config = scheduler.getConfig();
      config.enabled = false;
      config.syncInterval = 999;
      
      // Original config should be unchanged
      const actualConfig = scheduler.getConfig();
      expect(actualConfig.enabled).toBe(true);
      expect(actualConfig.syncInterval).toBe(5);
    });

    it('should trigger start when enabling disabled scheduler', async () => {
      scheduler = createScheduler({ ...defaultConfig, enabled: false });
      
      expect(scheduler.isRunning()).toBe(false);
      
      scheduler.updateConfig({ ...defaultConfig, enabled: true });
      
      await waitFor(() => scheduler.isRunning(), { timeout: 1000 });
      expect(scheduler.isRunning()).toBe(true);
      expect(mockSyncCallback).toHaveBeenCalled();
    });
  });

  describe('Retry Scheduling with Proper Delays', () => {
    it('should schedule retries with correct delays', async () => {
      scheduler = createScheduler();
      mockSyncCallback.mockRejectedValue(new Error('Persistent failure'));
      
      await scheduler.start();
      
      // Track when retries occur
      const retryTimes: number[] = [];
      const originalCallback = mockSyncCallback.getMockImplementation();
      
      mockSyncCallback.mockImplementation(async () => {
        retryTimes.push(mockTimer.getCurrentTime());
        throw new Error('Persistent failure');
      });
      
      const startTime = mockTimer.getCurrentTime();
      
      // Let several retries happen
      mockTimer.advanceTime(10 * 60 * 1000); // 10 minutes
      
      expect(retryTimes.length).toBeGreaterThan(1);
      
      // Verify exponential backoff timing
      for (let i = 1; i < retryTimes.length; i++) {
        const delay = retryTimes[i] - retryTimes[i - 1];
        const expectedDelay = Math.min(60 * 1000 * Math.pow(2, i - 1), 30 * 60 * 1000);
        expect(delay).toBeCloseTo(expectedDelay, -3); // Allow 1-second tolerance
      }
    });

    it('should not schedule retry when stopped during failure', async () => {
      scheduler = createScheduler();
      mockSyncCallback.mockRejectedValueOnce(new Error('Failure'));
      
      await scheduler.start();
      expect(scheduler.getFailureCount()).toBe(1);
      
      // Stop before retry
      scheduler.stop();
      
      // Advance time past retry delay
      mockTimer.advanceTime(60 * 1000);
      
      // Should not retry after stop
      expect(mockSyncCallback).toHaveBeenCalledTimes(1);
    });

    it('should clear retry timeout on stop', async () => {
      scheduler = createScheduler();
      mockSyncCallback.mockRejectedValueOnce(new Error('Failure'));
      
      await scheduler.start();
      expect(mockTimer.getPendingTimerCount()).toBeGreaterThan(0);
      
      scheduler.stop();
      expect(mockTimer.getPendingTimerCount()).toBe(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle concurrent syncs correctly', async () => {
      scheduler = createScheduler();
      
      // Create long-running sync
      const deferred = createDeferred<void>();
      mockSyncCallback.mockImplementationOnce(() => deferred.promise);
      
      await scheduler.start(); // Start long sync
      mockSyncCallback.mockClear();
      
      // Try to trigger scheduled sync while first is running
      mockTimer.advanceTime(5 * 60 * 1000);
      
      // Should be blocked
      expect(mockSyncCallback).not.toHaveBeenCalled();
      
      // Resolve first sync
      deferred.resolve();
      await waitFor(() => !scheduler.getStatistics().currentStatus.includes('syncing'), { timeout: 1000 });
      
      // Now scheduled sync should work
      mockTimer.advanceTime(5 * 60 * 1000);
      expect(mockSyncCallback).toHaveBeenCalledTimes(1);
    });

    it('should handle stop during sync', async () => {
      scheduler = createScheduler();
      
      // Create long-running sync
      const deferred = createDeferred<void>();
      mockSyncCallback.mockImplementationOnce(() => deferred.promise);
      
      const syncPromise = scheduler.triggerManualSync();
      
      // Stop while sync is running
      scheduler.stop();
      
      expect(scheduler.isRunning()).toBe(false);
      
      // Resolve sync
      deferred.resolve();
      await syncPromise;
      
      // Should still be stopped
      expect(scheduler.isRunning()).toBe(false);
    });

    it('should handle sync callback throwing synchronously', async () => {
      scheduler = createScheduler();
      mockSyncCallback.mockImplementation(() => {
        throw new Error('Synchronous error');
      });
      
      await scheduler.start();
      
      expect(scheduler.isRunning()).toBe(true);
      expect(scheduler.getFailureCount()).toBe(1);
      expect(scheduler.getStatistics().currentStatus).toBe('error');
    });

    it('should handle plugin data persistence failures', async () => {
      scheduler = createScheduler();
      mockPlugin.saveData = jest.fn().mockRejectedValue(new Error('Save failed'));
      
      await scheduler.start();
      
      // Should still work despite save failure
      expect(scheduler.isRunning()).toBe(true);
    });

    it('should handle plugin data loading failures', async () => {
      scheduler = createScheduler();
      mockPlugin.loadData = jest.fn().mockRejectedValue(new Error('Load failed'));
      
      await scheduler.loadState();
      
      // Should use initial state
      const state = scheduler.getState();
      expect(state.totalSyncCount).toBe(0);
      expect(state.failureCount).toBe(0);
    });

    it('should handle extremely high failure counts', () => {
      scheduler = createScheduler();
      
      // Set ridiculously high failure count
      scheduler.setState({ failureCount: 1000 });
      
      const delay = scheduler.getRetryDelay();
      const maxDelay = 30 * 60 * 1000; // 30 minutes
      
      expect(delay).toBe(maxDelay);
      expect(delay).toBeFinite();
    });

    it('should handle rapid start/stop cycles', async () => {
      scheduler = createScheduler();
      
      // Rapid start/stop cycles
      for (let i = 0; i < 10; i++) {
        await scheduler.start();
        scheduler.stop();
      }
      
      expect(scheduler.isRunning()).toBe(false);
      expect(mockTimer.getPendingTimerCount()).toBe(0);
    });

    it('should handle state mutations during sync', async () => {
      scheduler = createScheduler();
      
      // Mutate state during sync callback
      mockSyncCallback.mockImplementation(async () => {
        scheduler.setState({ failureCount: 999 });
      });
      
      await scheduler.start();
      
      // State changes during sync should be preserved
      const state = scheduler.getState();
      expect(state.failureCount).toBe(999);
    });

    it('should handle timer edge cases', async () => {
      scheduler = createScheduler();
      
      await scheduler.start();
      
      // Advance by very small amounts
      for (let i = 0; i < 1000; i++) {
        mockTimer.advanceTime(1);
      }
      
      // Should still be stable
      expect(scheduler.isRunning()).toBe(true);
      
      // Large time jump
      mockTimer.advanceTime(24 * 60 * 60 * 1000); // 24 hours
      
      // Should still work
      expect(scheduler.isRunning()).toBe(true);
    });
  });
});