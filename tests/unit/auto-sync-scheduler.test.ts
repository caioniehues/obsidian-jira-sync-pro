/**
 * Auto-Sync Scheduler Tests
 * 
 * Comprehensive test suite for the AutoSyncScheduler class, covering:
 * - Configuration validation
 * - Timer-based scheduling
 * - Failure recovery and retry logic
 * - Memory management
 * - Integration with JQL query engine
 * - Status reporting and error handling
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { AutoSyncScheduler, AutoSyncConfig, AutoSyncStatus, AutoSyncResult } from '../../src/sync/auto-sync-scheduler';
import { JiraClient } from '../../src/jira-bases-adapter/jira-client';
import { JQLQueryEngine, JQLQueryResult } from '../../src/enhanced-sync/jql-query-engine';
import { SyncPhase } from '../../src/enhanced-sync/sync-progress-model';

// ============================================================================
// Test Setup and Mocking
// ============================================================================

// Mock dependencies
jest.mock('../../src/jira-bases-adapter/jira-client');
jest.mock('../../src/enhanced-sync/jql-query-engine');

// Mock timers
jest.useFakeTimers();

describe('AutoSyncScheduler', () => {
  let scheduler: AutoSyncScheduler;
  let mockJiraClient: jest.Mocked<JiraClient>;
  let mockQueryEngine: jest.Mocked<JQLQueryEngine>;
  let testConfig: AutoSyncConfig;
  
  // Callback spies
  let progressCallback: jest.Mock;
  let completionCallback: jest.Mock;
  
  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    jest.clearAllTimers();
    
    // Create mock instances
    mockJiraClient = new JiraClient() as jest.Mocked<JiraClient>;
    
    // Mock the JQLQueryEngine constructor to return our mock
    (JQLQueryEngine as jest.MockedClass<typeof JQLQueryEngine>).mockImplementation(() => mockQueryEngine);
    
    mockQueryEngine = {
      executeQuery: jest.fn(),
      validateQuery: jest.fn()
    } as any;
    
    // Create test configuration
    testConfig = {
      intervalMinutes: 5,
      enableAutoSync: true,
      jql: 'assignee = currentUser()',
      maxResults: 100,
      batchSize: 25,
      maxRetries: 2,
      retryBackoffMultiplier: 2.0,
      maxRetryDelayMinutes: 5,
      memoryLimitMB: 50,
      timeoutMinutes: 10
    };
    
    // Create scheduler instance
    scheduler = new AutoSyncScheduler(mockJiraClient, testConfig);
    
    // Set up callback spies
    progressCallback = jest.fn();
    completionCallback = jest.fn();
    scheduler.setProgressCallback(progressCallback);
    scheduler.setCompletionCallback(completionCallback);
    
    // Mock successful query result
    const mockQueryResult: JQLQueryResult = {
      issues: [
        { key: 'TEST-1', fields: { summary: 'Test Issue 1' } },
        { key: 'TEST-2', fields: { summary: 'Test Issue 2' } }
      ],
      total: 2,
      truncated: false,
      executionTime: 1000
    };
    
    mockQueryEngine.executeQuery.mockResolvedValue(mockQueryResult);
  });
  
  afterEach(async () => {
    // Clean up scheduler
    await scheduler.stop();
    jest.clearAllTimers();
  });
  
  // ============================================================================
  // Configuration Tests
  // ============================================================================
  
  describe('Configuration', () => {
    it('should accept valid configuration', () => {
      expect(() => {
        new AutoSyncScheduler(mockJiraClient, testConfig);
      }).not.toThrow();
    });
    
    it('should reject invalid interval minutes', () => {
      expect(() => {
        new AutoSyncScheduler(mockJiraClient, { ...testConfig, intervalMinutes: 0 });
      }).toThrow('Interval must be between 1 and 60 minutes');
      
      expect(() => {
        new AutoSyncScheduler(mockJiraClient, { ...testConfig, intervalMinutes: 61 });
      }).toThrow('Interval must be between 1 and 60 minutes');
    });
    
    it('should reject empty JQL query', () => {
      expect(() => {
        new AutoSyncScheduler(mockJiraClient, { ...testConfig, jql: '' });
      }).toThrow('JQL query is required');
    });
    
    it('should reject invalid max results', () => {
      expect(() => {
        new AutoSyncScheduler(mockJiraClient, { ...testConfig, maxResults: 0 });
      }).toThrow('Max results must be between 1 and 1000');
      
      expect(() => {
        new AutoSyncScheduler(mockJiraClient, { ...testConfig, maxResults: 1001 });
      }).toThrow('Max results must be between 1 and 1000');
    });
    
    it('should update configuration correctly', async () => {
      const newConfig = { intervalMinutes: 10, maxResults: 200 };
      
      scheduler.updateConfig(newConfig);
      
      const status = scheduler.getStatus();
      expect(status.isEnabled).toBe(true);
    });
  });
  
  // ============================================================================
  // Scheduler Lifecycle Tests
  // ============================================================================
  
  describe('Scheduler Lifecycle', () => {
    it('should start and schedule first sync', async () => {
      await scheduler.start();
      
      const status = scheduler.getStatus();
      expect(status.isEnabled).toBe(true);
      expect(status.nextSyncTime).toBeDefined();
      expect(status.nextSyncTime).toBeGreaterThan(Date.now());
    });
    
    it('should not start if auto-sync is disabled', async () => {
      scheduler.updateConfig({ enableAutoSync: false });
      
      await scheduler.start();
      
      const status = scheduler.getStatus();
      expect(status.isEnabled).toBe(false);
      expect(status.nextSyncTime).toBeNull();
    });
    
    it('should stop and clear timers', async () => {
      await scheduler.start();
      expect(scheduler.getStatus().isEnabled).toBe(true);
      
      await scheduler.stop();
      
      const status = scheduler.getStatus();
      expect(status.isEnabled).toBe(false);
      expect(status.nextSyncTime).toBeNull();
    });
  });
  
  // ============================================================================
  // Manual Sync Tests
  // ============================================================================
  
  describe('Manual Sync', () => {
    it('should execute manual sync successfully', async () => {
      const result = await scheduler.triggerManualSync();
      
      expect(result.success).toBe(true);
      expect(result.ticketsProcessed).toBe(2);
      expect(result.wasManualTrigger).toBe(true);
      expect(result.duration).toBeGreaterThan(0);
      
      // Verify query engine was called
      expect(mockQueryEngine.executeQuery).toHaveBeenCalledWith({
        jql: testConfig.jql,
        maxResults: testConfig.maxResults,
        batchSize: testConfig.batchSize,
        fields: undefined,
        enableRetry: true,
        signal: expect.any(AbortSignal),
        onProgress: expect.any(Function)
      });
    });
    
    it('should prevent concurrent manual syncs', async () => {
      // Mock long-running operation
      mockQueryEngine.executeQuery.mockImplementation(() => {
        return new Promise((resolve) => {
          setTimeout(() => resolve({
            issues: [],
            total: 0,
            truncated: false,
            executionTime: 1000
          }), 1000);
        });
      });
      
      // Start first sync
      const firstSyncPromise = scheduler.triggerManualSync();
      
      // Try to start second sync immediately
      await expect(scheduler.triggerManualSync()).rejects.toThrow('Sync operation already in progress');
      
      // Wait for first sync to complete
      await firstSyncPromise;
      
      // Now second sync should work
      const result = await scheduler.triggerManualSync();
      expect(result.success).toBe(true);
    });
  });
  
  // ============================================================================
  // Error Handling and Retry Tests
  // ============================================================================
  
  describe('Error Handling and Retry', () => {
    it('should retry on retryable errors', async () => {
      // Mock first call to fail, second to succeed
      mockQueryEngine.executeQuery
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          issues: [{ key: 'TEST-1', fields: { summary: 'Test Issue 1' } }],
          total: 1,
          truncated: false,
          executionTime: 1000
        });
      
      const result = await scheduler.triggerManualSync();
      
      expect(result.success).toBe(true);
      expect(mockQueryEngine.executeQuery).toHaveBeenCalledTimes(2);
    });
    
    it('should fail after max retries', async () => {
      // Mock all calls to fail
      mockQueryEngine.executeQuery.mockRejectedValue(new Error('Persistent error'));
      
      const result = await scheduler.triggerManualSync();
      
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error!.message).toBe('Persistent error');
      
      // Should have tried maxRetries + 1 times (initial + retries)
      expect(mockQueryEngine.executeQuery).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
    });
    
    it('should not retry on non-retryable errors', async () => {
      // Mock authentication error (non-retryable)
      const authError = new Error('Authentication failed');
      (authError as any).status = 401;
      
      mockQueryEngine.executeQuery.mockRejectedValue(authError);
      
      const result = await scheduler.triggerManualSync();
      
      expect(result.success).toBe(false);
      expect(mockQueryEngine.executeQuery).toHaveBeenCalledTimes(1); // No retries
    });
  });
  
  // ============================================================================
  // Status Reporting Tests
  // ============================================================================
  
  describe('Status Reporting', () => {
    it('should provide correct initial status', () => {
      const status = scheduler.getStatus();
      
      expect(status).toEqual({
        isEnabled: false,
        isRunning: false,
        nextSyncTime: null,
        lastSyncTime: null,
        lastSyncResult: null,
        currentProgress: null,
        totalSyncsCompleted: 0,
        totalTicketsProcessed: 0,
        totalErrors: 0,
        recentErrors: [],
        averageSyncDuration: 0
      });
    });
    
    it('should update status during sync operation', async () => {
      // Start sync but don't let it complete immediately
      let resolveQuery: (value: any) => void;
      mockQueryEngine.executeQuery.mockImplementation(() => {
        return new Promise((resolve) => {
          resolveQuery = resolve;
        });
      });
      
      const syncPromise = scheduler.triggerManualSync();
      
      // Check status while running (need to wait a moment for state to update)
      await new Promise(resolve => setTimeout(resolve, 10));
      const runningStatus = scheduler.getStatus();
      expect(runningStatus.isRunning).toBe(true);
      expect(runningStatus.currentProgress).not.toBeNull();
      
      // Complete the sync
      resolveQuery!({
        issues: [],
        total: 0,
        truncated: false,
        executionTime: 1000
      });
      
      await syncPromise;
      
      // Check final status
      const finalStatus = scheduler.getStatus();
      expect(finalStatus.isRunning).toBe(false);
      expect(finalStatus.currentProgress).toBeNull();
      expect(finalStatus.totalSyncsCompleted).toBe(1);
    });
  });
});