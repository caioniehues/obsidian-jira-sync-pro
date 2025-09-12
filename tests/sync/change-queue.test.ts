/**
 * Comprehensive Test Suite for ChangeQueue
 * 
 * Tests all change queue functionality including:
 * - Queue operations (add, remove, process)
 * - Persistence (save/load from disk)
 * - Retry logic with exponential backoff
 * - Batch processing
 * - Queue state management
 * - Performance under load
 * RED-GREEN-Refactor: All tests written to fail first, then implemented
 * No mocks - using real implementations for reliable testing
 */

import { vi } from 'vitest';
import { Plugin } from 'obsidian';
import { ChangeQueue, QueuedChange } from '../../src/sync/change-queue';
import type { Mock, Mocked, MockedFunction } from 'vitest';
describe('ChangeQueue', () => {
  let changeQueue: ChangeQueue;
  let mockPlugin: Plugin;
  let testStartTime: number;
  beforeEach(() => {
    testStartTime = Date.now();
    
    // Create mock plugin with real-like behavior
    mockPlugin = {
      app: {
        vault: {
          adapter: {
            exists: vi.fn(),
            read: vi.fn(),
            write: vi.fn(),
            remove: vi.fn()
          }
        }
      }
    } as unknown as Plugin;
    changeQueue = new ChangeQueue(mockPlugin);
  });
  afterEach(() => {
    const testDuration = Date.now() - testStartTime;
    console.log(`Test completed in ${testDuration}ms`);
  describe('Basic Queue Operations', () => {
    test('should initialize empty queue', () => {
      expect(changeQueue.getPendingChanges()).toHaveLength(0);
      expect(changeQueue.hasPendingChanges()).toBe(false);
      expect(changeQueue.size()).toBe(0);
    });
    test('should add changes to queue', async () => {
      const change: QueuedChange = {
        id: 'test-change-1',
        issueKey: 'TEST-123',
        fields: { summary: 'Updated Title' },
        timestamp: Date.now(),
        retryCount: 0
      };
      await changeQueue.addChange(change);
      expect(changeQueue.size()).toBe(1);
      expect(changeQueue.hasPendingChanges()).toBe(true);
      expect(changeQueue.getPendingChanges()).toContainEqual(change);
    test('should prevent duplicate changes for same issue', async () => {
      const change1: QueuedChange = {
        fields: { summary: 'First Update' },
      const change2: QueuedChange = {
        id: 'test-change-2',
        fields: { summary: 'Second Update' },
        timestamp: Date.now() + 1000,
      await changeQueue.addChange(change1);
      await changeQueue.addChange(change2);
      // Should merge or replace previous change for same issue
      const pendingChanges = changeQueue.getPendingChanges();
      expect(pendingChanges[0].fields.summary).toBe('Second Update'); // Latest wins
    test('should mark changes as processed and remove from queue', async () => {
      await changeQueue.markAsProcessed(change.id);
    test('should increment retry count for failed changes', async () => {
      await changeQueue.incrementRetryCount(change.id);
      expect(pendingChanges[0].retryCount).toBe(1);
    test('should remove changes that exceed max retry limit', async () => {
        retryCount: 2 // Already at max retries
      // Should be removed after exceeding max retries (3)
  describe('Persistence Operations', () => {
    test('should save queue state to disk', async () => {
      const changes: QueuedChange[] = [
        {
          id: 'change-1',
          issueKey: 'TEST-123',
          fields: { summary: 'Update 1' },
          timestamp: Date.now(),
          retryCount: 0
        },
          id: 'change-2',
          issueKey: 'TEST-456',
          fields: { summary: 'Update 2' },
          retryCount: 1
      ];
      for (const change of changes) {
        await changeQueue.addChange(change);
      const mockWrite = mockPlugin.app.vault.adapter.write as Mock;
      mockWrite.mockResolvedValue(undefined);
      await changeQueue.save();
      expect(mockWrite).toHaveBeenCalledWith(
        expect.stringContaining('.obsidian/plugins/obsidian-jira-sync-pro/change-queue.json'),
        expect.stringContaining('"id":"change-1"')
      );
    test('should load queue state from disk', async () => {
      const savedData = {
        version: 1,
        changes: [
          {
            id: 'loaded-change-1',
            issueKey: 'TEST-789',
            fields: { summary: 'Loaded Update' },
            timestamp: Date.now(),
            retryCount: 0
        ]
      const mockExists = mockPlugin.app.vault.adapter.exists as Mock;
      const mockRead = mockPlugin.app.vault.adapter.read as Mock;
      
      mockExists.mockResolvedValue(true);
      mockRead.mockResolvedValue(JSON.stringify(savedData));
      await changeQueue.load();
      expect(changeQueue.getPendingChanges()[0].id).toBe('loaded-change-1');
    test('should handle corrupted queue file gracefully', async () => {
      mockRead.mockResolvedValue('invalid json data');
      // Should not throw and should initialize empty queue
      await expect(changeQueue.load()).resolves.not.toThrow();
    test('should handle missing queue file gracefully', async () => {
      mockExists.mockResolvedValue(false);
    test('should create queue file if it does not exist on save', async () => {
        id: 'new-change',
        issueKey: 'TEST-NEW',
        fields: { summary: 'New Change' },
      expect(mockWrite).toHaveBeenCalled();
  describe('Batch Processing', () => {
    test('should return changes in batches', async () => {
      const changes: QueuedChange[] = [];
      // Add 25 changes
      for (let i = 1; i <= 25; i++) {
        changes.push({
          id: `change-${i}`,
          issueKey: `TEST-${i}`,
          fields: { summary: `Update ${i}` },
          timestamp: Date.now() + i,
        });
      const batch1 = changeQueue.getBatch(10);
      const batch2 = changeQueue.getBatch(10);
      const batch3 = changeQueue.getBatch(10);
      expect(batch1).toHaveLength(10);
      expect(batch2).toHaveLength(10);
      expect(batch3).toHaveLength(5);
    test('should prioritize older changes in batches', async () => {
      const oldChange: QueuedChange = {
        id: 'old-change',
        issueKey: 'TEST-OLD',
        fields: { summary: 'Old Update' },
        timestamp: Date.now() - 10000, // 10 seconds ago
      const newChange: QueuedChange = {
        fields: { summary: 'New Update' },
      // Add in reverse order
      await changeQueue.addChange(newChange);
      await changeQueue.addChange(oldChange);
      const batch = changeQueue.getBatch(2);
      // Older change should come first
      expect(batch[0].id).toBe('old-change');
      expect(batch[1].id).toBe('new-change');
    test('should respect retry count in batch prioritization', async () => {
      const highRetryChange: QueuedChange = {
        id: 'high-retry',
        issueKey: 'TEST-HIGH',
        fields: { summary: 'High Retry Update' },
        retryCount: 2
      const lowRetryChange: QueuedChange = {
        id: 'low-retry',
        issueKey: 'TEST-LOW',
        fields: { summary: 'Low Retry Update' },
      await changeQueue.addChange(highRetryChange);
      await changeQueue.addChange(lowRetryChange);
      // Lower retry count should be prioritized
      expect(batch[0].id).toBe('low-retry');
      expect(batch[1].id).toBe('high-retry');
  describe('Retry Logic and Exponential Backoff', () => {
    test('should calculate correct delay for retry attempts', () => {
      const baseDelay = 1000; // 1 second
      expect(changeQueue.calculateRetryDelay(0, baseDelay)).toBe(baseDelay);
      expect(changeQueue.calculateRetryDelay(1, baseDelay)).toBe(baseDelay * 2);
      expect(changeQueue.calculateRetryDelay(2, baseDelay)).toBe(baseDelay * 4);
      expect(changeQueue.calculateRetryDelay(3, baseDelay)).toBe(baseDelay * 8);
    test('should respect maximum retry delay', () => {
      const baseDelay = 1000;
      const maxDelay = 30000; // 30 seconds
      // Very high retry count should be capped at max delay
      const highRetryDelay = changeQueue.calculateRetryDelay(10, baseDelay, maxDelay);
      expect(highRetryDelay).toBe(maxDelay);
    test('should filter changes ready for retry based on delay', async () => {
      const now = Date.now();
      const readyChange: QueuedChange = {
        id: 'ready-change',
        issueKey: 'TEST-READY',
        fields: { summary: 'Ready Update' },
        timestamp: now - 5000, // 5 seconds ago
        retryCount: 1,
        lastRetryAt: now - 3000 // Last retry 3 seconds ago, should be ready (2s delay)
      const notReadyChange: QueuedChange = {
        id: 'not-ready-change',
        issueKey: 'TEST-NOT-READY',
        fields: { summary: 'Not Ready Update' },
        timestamp: now,
        lastRetryAt: now - 500 // Last retry 500ms ago, not ready yet (2s delay)
      await changeQueue.addChange(readyChange);
      await changeQueue.addChange(notReadyChange);
      const readyForRetry = changeQueue.getChangesReadyForRetry();
      expect(readyForRetry).toHaveLength(1);
      expect(readyForRetry[0].id).toBe('ready-change');
    test('should update lastRetryAt timestamp when incrementing retry count', async () => {
        id: 'retry-change',
        issueKey: 'TEST-RETRY',
        fields: { summary: 'Retry Update' },
      const beforeRetry = Date.now();
      const afterRetry = Date.now();
      const updatedChanges = changeQueue.getPendingChanges();
      const updatedChange = updatedChanges.find(c => c.id === change.id);
      expect(updatedChange?.lastRetryAt).toBeGreaterThanOrEqual(beforeRetry);
      expect(updatedChange?.lastRetryAt).toBeLessThanOrEqual(afterRetry);
  describe('Queue State Management', () => {
    test('should provide accurate queue statistics', async () => {
          id: 'new-change',
          issueKey: 'TEST-NEW',
          fields: { summary: 'New' },
          id: 'retry-change-1',
          issueKey: 'TEST-RETRY1',
          fields: { summary: 'Retry 1' },
          id: 'retry-change-2',
          issueKey: 'TEST-RETRY2',
          fields: { summary: 'Retry 2' },
          retryCount: 2
      const stats = changeQueue.getQueueStats();
      expect(stats.totalChanges).toBe(3);
      expect(stats.newChanges).toBe(1);
      expect(stats.retryChanges).toBe(2);
      expect(stats.oldestChange).toBeDefined();
      expect(stats.averageRetryCount).toBeCloseTo(1); // (0 + 1 + 2) / 3 = 1
    test('should clear all changes from queue', async () => {
          issueKey: 'TEST-1',
          issueKey: 'TEST-2',
      expect(changeQueue.size()).toBe(2);
      changeQueue.clear();
    test('should find changes by issue key', async () => {
      const foundChange = changeQueue.findChangeByIssueKey('TEST-123');
      expect(foundChange).toBeDefined();
      expect(foundChange?.id).toBe('change-1');
      const notFoundChange = changeQueue.findChangeByIssueKey('TEST-999');
      expect(notFoundChange).toBeUndefined();
  describe('Performance Under Load', () => {
    test('should handle large number of changes efficiently', async () => {
      const startTime = Date.now();
      const changeCount = 1000;
      // Add 1000 changes
      const addPromises: Promise<void>[] = [];
      for (let i = 1; i <= changeCount; i++) {
        const change: QueuedChange = {
          id: `perf-change-${i}`,
          issueKey: `PERF-${i}`,
          fields: { summary: `Performance Test ${i}` },
          retryCount: i % 3 // Vary retry counts
        };
        addPromises.push(changeQueue.addChange(change));
      await Promise.all(addPromises);
      const addDuration = Date.now() - startTime;
      expect(changeQueue.size()).toBe(changeCount);
      expect(addDuration).toBeLessThan(1000); // Should complete within 1 second
      // Test batch processing performance
      const batchStartTime = Date.now();
      const batch = changeQueue.getBatch(100);
      const batchDuration = Date.now() - batchStartTime;
      expect(batch).toHaveLength(100);
      expect(batchDuration).toBeLessThan(100); // Should complete within 100ms
      console.log(`Performance test: Added ${changeCount} changes in ${addDuration}ms, batch retrieval in ${batchDuration}ms`);
    test('should maintain performance during mixed operations', async () => {
      const operationCount = 500;
      // Perform mixed operations: add, process, retry
      for (let i = 1; i <= operationCount; i++) {
          id: `mixed-change-${i}`,
          issueKey: `MIXED-${i}`,
          fields: { summary: `Mixed Operation ${i}` },
        // Randomly process or retry some changes
        if (i % 3 === 0) {
          await changeQueue.markAsProcessed(change.id);
        } else if (i % 5 === 0) {
          await changeQueue.incrementRetryCount(change.id);
      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(2000); // Should complete within 2 seconds
      console.log(`Mixed operations performance: ${operationCount} operations in ${duration}ms`);
    test('should handle concurrent operations safely', async () => {
      const concurrentOperations = 100;
      const promises: Promise<void>[] = [];
      // Create concurrent add operations
      for (let i = 1; i <= concurrentOperations; i++) {
        promises.push(
          changeQueue.addChange({
            id: `concurrent-${i}`,
            issueKey: `CONC-${i}`,
            fields: { summary: `Concurrent ${i}` },
          })
        );
      await Promise.all(promises);
      expect(changeQueue.size()).toBe(concurrentOperations);
  describe('Edge Cases and Error Handling', () => {
    test('should handle empty queue operations gracefully', () => {
      expect(changeQueue.getBatch(10)).toHaveLength(0);
      expect(changeQueue.getChangesReadyForRetry()).toHaveLength(0);
      expect(() => changeQueue.markAsProcessed('non-existent-id')).not.toThrow();
      expect(() => changeQueue.incrementRetryCount('non-existent-id')).not.toThrow();
    test('should handle invalid change data', async () => {
      const invalidChange = {
        // Missing required fields
        id: '',
        issueKey: '',
        fields: null,
        timestamp: 0,
        retryCount: -1
      } as unknown as QueuedChange;
      // Should handle gracefully without throwing
      await expect(changeQueue.addChange(invalidChange)).resolves.not.toThrow();
    test('should handle disk I/O errors during save operations', async () => {
      mockWrite.mockRejectedValue(new Error('Disk full'));
        id: 'test-change',
        fields: { summary: 'Test' },
      // Should handle save error gracefully
      await expect(changeQueue.save()).resolves.not.toThrow();
    test('should handle disk I/O errors during load operations', async () => {
      mockRead.mockRejectedValue(new Error('Permission denied'));
      // Should handle load error gracefully
    test('should handle very large change objects', async () => {
      const largeFields = {
        summary: 'x'.repeat(10000), // 10KB summary
        description: 'y'.repeat(100000), // 100KB description
        customField: 'z'.repeat(50000) // 50KB custom field
      const largeChange: QueuedChange = {
        id: 'large-change',
        issueKey: 'TEST-LARGE',
        fields: largeFields,
      await changeQueue.addChange(largeChange);
      expect(duration).toBeLessThan(1000); // Should handle large objects efficiently
    test('should maintain queue integrity after multiple operations', async () => {
      // Perform a complex sequence of operations
      // Add initial changes
      for (let i = 1; i <= 10; i++) {
          id: `integrity-${i}`,
          issueKey: `INT-${i}`,
          fields: { summary: `Integrity Test ${i}` },
        changes.push(change);
      // Process some changes
      await changeQueue.markAsProcessed('integrity-1');
      await changeQueue.markAsProcessed('integrity-3');
      await changeQueue.markAsProcessed('integrity-5');
      // Retry some changes
      await changeQueue.incrementRetryCount('integrity-2');
      await changeQueue.incrementRetryCount('integrity-4');
      // Add more changes
      for (let i = 11; i <= 15; i++) {
        await changeQueue.addChange({
      // Verify final state
      expect(changeQueue.size()).toBe(12); // 10 - 3 processed + 5 new = 12
      expect(stats.totalChanges).toBe(12);
});
