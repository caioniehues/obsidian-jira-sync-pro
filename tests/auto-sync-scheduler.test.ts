import { describe, it, expect, vi, beforeEach, afterEach } from '@vitest/globals';
import { AutoSyncScheduler } from '../src/enhanced-sync/auto-sync-scheduler';
import { JQLQueryEngine } from '../src/enhanced-sync/jql-query-engine';
import { Plugin } from 'obsidian';

// Mock Obsidian Plugin
vi.mock('obsidian', () => ({
  Plugin: vi.fn(),
  Notice: vi.fn()
}));

// Mock JQLQueryEngine
vi.mock('../src/enhanced-sync/jql-query-engine');

// Mock timers
vi.useFakeTimers();

describe('AutoSyncScheduler', () => {
  let scheduler: AutoSyncScheduler;
  let mockPlugin: vi.Mocked<Plugin>;
  let mockQueryEngine: vi.Mocked<JQLQueryEngine>;
  let mockSyncCallback: vi.Mock;
  let mockConfig: any;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();
    vi.clearAllTimers();
    
    // Create mock plugin
    mockPlugin = {
      loadData: vi.fn().mockResolvedValue({}),
      saveData: vi.fn().mockResolvedValue(undefined)
    } as any;
    
    // Create mock query engine
    mockQueryEngine = new JQLQueryEngine(null as any) as vi.Mocked<JQLQueryEngine>;
    
    // Create mock config
    mockConfig = {
      enabled: true,
      jqlQuery: 'project = TEST',
      syncInterval: 5, // 5 minutes
      maxResults: 1000,
      batchSize: 50
    };
    
    // Create mock sync callback
    mockSyncCallback = vi.fn().mockResolvedValue(undefined);
    
    // Initialize scheduler
    scheduler = new AutoSyncScheduler(
      mockPlugin,
      mockQueryEngine,
      mockConfig,
      mockSyncCallback
    );
  });

  afterEach(() => {
    // Stop scheduler if running
    scheduler?.stop();
    vi.restoreAllMocks();
  });

  describe('Scheduler Lifecycle', () => {
    it('should start scheduler with configured interval', async () => {
      // Act
      await scheduler.start();

      // Assert
      expect(scheduler.isRunning()).toBe(true);
      expect(mockSyncCallback).toHaveBeenCalledTimes(1); // Immediate sync on start
      
      // Advance timer and check periodic sync
      vi.advanceTimersByTime(5 * 60 * 1000); // 5 minutes
      expect(mockSyncCallback).toHaveBeenCalledTimes(2);
    });

    it('should stop scheduler and clear interval', async () => {
      // Arrange
      await scheduler.start();
      expect(scheduler.isRunning()).toBe(true);

      // Act
      scheduler.stop();

      // Assert
      expect(scheduler.isRunning()).toBe(false);
      
      // Advance timer and verify no more syncs
      const callCount = mockSyncCallback.mock.calls.length;
      vi.advanceTimersByTime(10 * 60 * 1000); // 10 minutes
      expect(mockSyncCallback).toHaveBeenCalledTimes(callCount); // No additional calls
    });

    it('should prevent multiple simultaneous starts', async () => {
      // Act
      await scheduler.start();
      await scheduler.start(); // Second start should be ignored

      // Assert
      expect(scheduler.isRunning()).toBe(true);
      expect(mockSyncCallback).toHaveBeenCalledTimes(1); // Only one immediate sync
    });

    it('should handle stop when not running', () => {
      // Act & Assert - Should not throw
      expect(() => scheduler.stop()).not.toThrow();
      expect(scheduler.isRunning()).toBe(false);
    });
  });

  describe('Interval Configuration', () => {
    it('should accept interval between 1-60 minutes', async () => {
      // Test minimum interval (1 minute)
      scheduler.updateInterval(1);
      await scheduler.start();
      await Promise.resolve(); // Let async operations settle
      expect(mockSyncCallback).toHaveBeenCalledTimes(1); // Initial sync
      
      vi.advanceTimersByTime(1 * 60 * 1000);
      expect(mockSyncCallback).toHaveBeenCalledTimes(2);
      scheduler.stop();
      
      // Reset mock
      mockSyncCallback.mockClear();
      
      // Test maximum interval (60 minutes)
      scheduler.updateInterval(60);
      await scheduler.start();
      await Promise.resolve(); // Let async operations settle
      expect(mockSyncCallback).toHaveBeenCalledTimes(1); // Initial sync
      
      vi.advanceTimersByTime(60 * 60 * 1000);
      expect(mockSyncCallback).toHaveBeenCalledTimes(2);
    });

    it('should reject invalid intervals', () => {
      // Test below minimum
      expect(() => scheduler.updateInterval(0)).toThrow('Sync interval must be between 1 and 60 minutes');
      expect(() => scheduler.updateInterval(-5)).toThrow('Sync interval must be between 1 and 60 minutes');
      
      // Test above maximum
      expect(() => scheduler.updateInterval(61)).toThrow('Sync interval must be between 1 and 60 minutes');
      expect(() => scheduler.updateInterval(120)).toThrow('Sync interval must be between 1 and 60 minutes');
    });

    it('should update interval while running', async () => {
      // Start with 5 minute interval
      await scheduler.start();
      await Promise.resolve();
      expect(mockSyncCallback).toHaveBeenCalledTimes(1);
      
      // Change to 2 minute interval
      scheduler.updateInterval(2);
      
      // Verify new interval is active
      vi.advanceTimersByTime(2 * 60 * 1000);
      expect(mockSyncCallback).toHaveBeenCalledTimes(2);
      
      vi.advanceTimersByTime(2 * 60 * 1000);
      expect(mockSyncCallback).toHaveBeenCalledTimes(3);
    });
  });

  describe('Immediate Sync on Start', () => {
    it('should perform immediate sync when starting', async () => {
      // Act
      await scheduler.start();

      // Assert
      expect(mockSyncCallback).toHaveBeenCalledTimes(1);
      expect(mockSyncCallback).toHaveBeenCalledWith({
        isManual: false,
        isInitial: true
      });
    });

    it('should handle immediate sync failure gracefully', async () => {
      // Arrange
      mockSyncCallback.mockRejectedValueOnce(new Error('Sync failed'));

      // Act
      await scheduler.start();

      // Assert - Scheduler should still be running
      expect(scheduler.isRunning()).toBe(true);
      expect(mockSyncCallback).toHaveBeenCalledTimes(1);
      
      // Next sync should still occur
      vi.advanceTimersByTime(5 * 60 * 1000);
      expect(mockSyncCallback).toHaveBeenCalledTimes(2);
    });
  });

  describe('Manual Sync Trigger', () => {
    it('should support manual sync trigger', async () => {
      // Arrange
      await scheduler.start();
      mockSyncCallback.mockClear();

      // Act
      await scheduler.triggerManualSync();

      // Assert
      expect(mockSyncCallback).toHaveBeenCalledTimes(1);
      expect(mockSyncCallback).toHaveBeenCalledWith({
        isManual: true,
        isInitial: false
      });
    });

    it('should prevent concurrent manual syncs', async () => {
      // Arrange
      await scheduler.start();
      await Promise.resolve();
      mockSyncCallback.mockClear();
      
      // Make sync callback slow but don't use setTimeout with fake timers
      let syncResolve: any;
      mockSyncCallback.mockImplementationOnce(() => 
        new Promise(resolve => { syncResolve = resolve; })
      );

      // Act - Trigger multiple manual syncs
      const sync1 = scheduler.triggerManualSync();
      const sync2 = scheduler.triggerManualSync();
      
      // Resolve the first sync
      syncResolve();
      await sync1;
      await sync2;

      // Assert - Only one sync should have occurred
      expect(mockSyncCallback).toHaveBeenCalledTimes(1);
    });

    it('should work when scheduler is not running', async () => {
      // Act
      await scheduler.triggerManualSync();

      // Assert
      expect(mockSyncCallback).toHaveBeenCalledTimes(1);
      expect(scheduler.isRunning()).toBe(false);
    });
  });

  describe('Failure Recovery', () => {
    it('should implement exponential backoff on failures', async () => {
      // Arrange
      await scheduler.start();
      await Promise.resolve();
      mockSyncCallback.mockClear();
      
      let failCount = 0;
      mockSyncCallback.mockImplementation(() => {
        if (failCount++ < 3) {
          return Promise.reject(new Error('Sync failed'));
        }
        return Promise.resolve();
      });

      // Act - Trigger sync that will fail
      vi.advanceTimersByTime(5 * 60 * 1000);
      await Promise.resolve();

      // Assert - Check exponential backoff delays
      expect(scheduler.getFailureCount()).toBe(1);
      
      // First retry after 1 minute (base delay)
      vi.advanceTimersByTime(1 * 60 * 1000);
      await Promise.resolve();
      expect(scheduler.getFailureCount()).toBe(2);
      
      // Second retry after 2 minutes (exponential)
      vi.advanceTimersByTime(2 * 60 * 1000);
      await Promise.resolve();
      expect(scheduler.getFailureCount()).toBe(3);
      
      // Third retry after 4 minutes (exponential)
      vi.advanceTimersByTime(4 * 60 * 1000);
      await Promise.resolve();
      expect(scheduler.getFailureCount()).toBe(0); // Reset on success
    });

    it('should cap maximum retry delay', async () => {
      // Arrange - Make all syncs fail
      mockSyncCallback.mockRejectedValue(new Error('Persistent failure'));
      await scheduler.start();

      // Act - Simulate many failures
      for (let i = 0; i < 10; i++) {
        vi.advanceTimersByTime(30 * 60 * 1000); // Max delay is 30 minutes
      }

      // Assert - Verify max delay is respected
      expect(scheduler.getRetryDelay()).toBeLessThanOrEqual(30 * 60 * 1000);
    });

    it('should reset failure count on successful sync', async () => {
      // Arrange - Start succeeds first
      mockSyncCallback.mockResolvedValueOnce(undefined);
      await scheduler.start();
      await Promise.resolve();
      expect(scheduler.getFailureCount()).toBe(0);
      
      // Now set up failures then success
      mockSyncCallback
        .mockRejectedValueOnce(new Error('Fail 1'))
        .mockRejectedValueOnce(new Error('Fail 2'))
        .mockResolvedValueOnce(undefined); // Success

      // Act - Trigger failures then success
      vi.advanceTimersByTime(5 * 60 * 1000); // First failure
      await Promise.resolve();
      expect(scheduler.getFailureCount()).toBe(1);
      
      vi.advanceTimersByTime(1 * 60 * 1000); // Retry - Second failure
      await Promise.resolve();
      expect(scheduler.getFailureCount()).toBe(2);
      
      vi.advanceTimersByTime(2 * 60 * 1000); // Retry - Success
      await Promise.resolve();
      
      // Assert
      expect(scheduler.getFailureCount()).toBe(0);
    });
  });

  describe('State Persistence', () => {
    it('should persist sync state across reloads', async () => {
      // Arrange
      const syncState = {
        lastSyncTime: '2025-01-10T10:00:00Z',
        lastSyncStatus: 'success' as const,
        totalSyncCount: 42,
        failureCount: 0,
        successfulSyncCount: 40,
        failedSyncCount: 2,
        syncDurations: [1000, 2000]
      };
      
      await scheduler.start();
      await Promise.resolve();
      scheduler.setState(syncState);

      // Act
      await scheduler.saveState();

      // Assert
      expect(mockPlugin.saveData).toHaveBeenCalledWith(
        expect.objectContaining({
          syncState: expect.objectContaining({
            lastSyncTime: '2025-01-10T10:00:00Z',
            lastSyncStatus: 'success',
            totalSyncCount: 42,
            failureCount: 0
          })
        })
      );
    });

    it('should restore sync state on initialization', async () => {
      // Arrange
      const savedState = {
        syncState: {
          lastSyncTime: '2025-01-10T10:00:00Z',
          lastSyncStatus: 'success',
          totalSyncCount: 42,
          failureCount: 2
        }
      };
      mockPlugin.loadData.mockResolvedValue(savedState);

      // Act
      await scheduler.loadState();

      // Assert
      const state = scheduler.getState();
      expect(state.lastSyncTime).toBe('2025-01-10T10:00:00Z');
      expect(state.totalSyncCount).toBe(42);
      expect(state.failureCount).toBe(2);
    });

    it('should update state after each sync', async () => {
      // Arrange
      await scheduler.start();
      const initialState = scheduler.getState();

      // Act
      vi.advanceTimersByTime(5 * 60 * 1000);
      await Promise.resolve(); // Let async operations complete

      // Assert
      const updatedState = scheduler.getState();
      expect(updatedState.totalSyncCount).toBe(initialState.totalSyncCount + 1);
      expect(updatedState.lastSyncTime).not.toBe(initialState.lastSyncTime);
      expect(updatedState.lastSyncStatus).toBe('success');
    });
  });

  describe('Configuration Updates', () => {
    it('should handle configuration changes', () => {
      // Act
      scheduler.updateConfig({
        enabled: false,
        jqlQuery: 'project = UPDATED',
        syncInterval: 10,
        maxResults: 500,
        batchSize: 25
      });

      // Assert
      const config = scheduler.getConfig();
      expect(config.enabled).toBe(false);
      expect(config.jqlQuery).toBe('project = UPDATED');
      expect(config.syncInterval).toBe(10);
    });

    it('should stop scheduler when disabled via config', async () => {
      // Arrange
      await scheduler.start();
      expect(scheduler.isRunning()).toBe(true);

      // Act
      scheduler.updateConfig({ ...mockConfig, enabled: false });

      // Assert
      expect(scheduler.isRunning()).toBe(false);
    });

    it('should restart scheduler with new interval on config change', async () => {
      // Arrange
      await scheduler.start();
      mockSyncCallback.mockClear();

      // Act - Update interval from 5 to 2 minutes
      scheduler.updateConfig({ ...mockConfig, syncInterval: 2 });

      // Assert - Should use new interval
      vi.advanceTimersByTime(2 * 60 * 1000);
      expect(mockSyncCallback).toHaveBeenCalledTimes(1);
    });
  });

  describe('Sync Status Tracking', () => {
    it('should track sync statistics', async () => {
      // Arrange
      await scheduler.start();
      await Promise.resolve();

      // Act - Perform multiple syncs
      vi.advanceTimersByTime(5 * 60 * 1000);
      await Promise.resolve();
      vi.advanceTimersByTime(5 * 60 * 1000);
      await Promise.resolve();
      
      // Assert
      const stats = scheduler.getStatistics();
      expect(stats.totalSyncs).toBe(3); // 1 initial + 2 periodic
      expect(stats.successfulSyncs).toBe(3);
      expect(stats.failedSyncs).toBe(0);
      expect(stats.lastSyncTime).toBeDefined();
    });

    it('should track failed sync attempts', async () => {
      // Arrange
      mockSyncCallback
        .mockResolvedValueOnce(undefined) // Initial success
        .mockRejectedValueOnce(new Error('Fail'))
        .mockResolvedValueOnce(undefined);

      await scheduler.start();
      await Promise.resolve();
      
      // Act
      vi.advanceTimersByTime(5 * 60 * 1000); // Failure
      await Promise.resolve();
      vi.advanceTimersByTime(1 * 60 * 1000); // Retry success
      await Promise.resolve();

      // Assert
      const stats = scheduler.getStatistics();
      expect(stats.totalSyncs).toBe(3);
      expect(stats.successfulSyncs).toBe(2);
      expect(stats.failedSyncs).toBe(1);
    });

    it('should calculate average sync duration', async () => {
      // Arrange - Use immediate resolution instead of timers
      let syncDelay = 0;
      mockSyncCallback.mockImplementation(async () => {
        // Simulate duration by tracking it in the test
        await Promise.resolve();
      });

      await scheduler.start();
      await Promise.resolve();
      
      // Manually set durations in state for testing
      scheduler.setState({ syncDurations: [1000, 2000, 3000] });

      // Assert
      const stats = scheduler.getStatistics();
      expect(stats.averageSyncDuration).toBeCloseTo(2000, -2); // Average of 1000, 2000, 3000
    });
  });

  describe('Edge Cases', () => {
    it('should handle sync callback throwing synchronously', async () => {
      // Arrange
      mockSyncCallback.mockImplementation(() => {
        throw new Error('Synchronous error');
      });

      // Act
      await scheduler.start();

      // Assert - Should still be running
      expect(scheduler.isRunning()).toBe(true);
      expect(scheduler.getFailureCount()).toBe(1);
    });

    it('should handle very long running syncs', async () => {
      // Arrange
      let syncResolve: any;
      let syncCount = 0;
      mockSyncCallback.mockImplementation(async () => {
        syncCount++;
        if (syncCount === 1) {
          // First sync will be long-running
          return new Promise(resolve => { syncResolve = resolve; });
        }
        return Promise.resolve();
      });

      await scheduler.start();
      await Promise.resolve();
      
      // Act - Next sync triggers while first is still running
      vi.advanceTimersByTime(5 * 60 * 1000);
      await Promise.resolve();

      // Assert - Should skip the overlapping sync
      expect(mockSyncCallback).toHaveBeenCalledTimes(1);
      
      // Resolve the long-running sync
      syncResolve();
    });
  });
});