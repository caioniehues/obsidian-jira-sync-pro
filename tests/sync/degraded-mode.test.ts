/**
 * Tests for Degraded Mode Manager
 * Comprehensive test suite covering offline capabilities,
 * degraded mode functionality, and graceful recovery
 */

import { DegradedModeManager, DegradedModeUtils } from '../../src/sync/degraded-mode';
import { ConnectivityMonitor } from '../../src/utils/connectivity-monitor';
import { EventManager } from '../../src/events/event-manager';
import { JiraIssue } from '../../src/types/jira-types';
import type { Mock, Mocked, MockedFunction } from 'vitest';
// Mock Obsidian dependencies
vi.mock('obsidian', () => ({
  Plugin: class MockPlugin {
    app = { vault: {} };
    async loadData() { return {}; }
    async saveData(data: any) { /* mock save */ }
  },
  Notice: vi.fn(),
  TFile: class MockTFile {},
  Vault: class MockVault {}
}));
import { Plugin, Notice } from 'obsidian';
describe('DegradedModeManager', () => {
  let manager: DegradedModeManager;
  let mockPlugin: Mocked<Plugin>;
  let mockEventManager: Mocked<EventManager>;
  let mockConnectivityMonitor: Mocked<ConnectivityMonitor>;
  const createMockIssue = (key: string, summary: string): JiraIssue => ({
    id: `${key}-id`,
    key,
    fields: {
      summary,
      description: 'Test description',
      status: { name: 'In Progress' },
      assignee: { displayName: 'Test User' },
      priority: { name: 'Medium' },
      created: '2024-01-01T00:00:00.000Z',
      updated: '2024-01-01T00:00:00.000Z'
    }
  });
  beforeEach(() => {
    vi.clearAllMocks();
    
    mockPlugin = {
      app: { vault: {} },
      loadData: vi.fn().mockResolvedValue({}),
      saveData: vi.fn().mockResolvedValue(undefined)
    } as any;
    mockEventManager = {
      createEvent: vi.fn(),
      emit: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
      once: vi.fn(),
      removeAllListeners: vi.fn()
    mockConnectivityMonitor = {
      getStatus: vi.fn().mockReturnValue({ jiraReachable: true, isOnline: true }),
      startMonitoring: vi.fn(),
      stopMonitoring: vi.fn(),
      checkConnectivity: vi.fn(),
      isReadyForSync: vi.fn().mockReturnValue(true),
      waitForConnectivity: vi.fn(),
      getStatistics: vi.fn(),
      isDegraded: vi.fn().mockReturnValue(false),
      getCircuitBreakerStats: vi.fn(),
      resetCircuitBreakerManually: vi.fn(),
      getAllCircuitBreakerStates: vi.fn()
    manager = new DegradedModeManager(
      mockPlugin,
      { enableOfflineMode: true },
      mockEventManager,
      mockConnectivityMonitor
    );
  describe('Initialization', () => {
    it('should initialize with default online mode', async () => {
      await manager.initialize();
      
      const status = manager.getStatus();
      expect(status.mode).toBe('online');
      expect(status.isEnabled).toBe(false);
    });
    it('should load existing offline data on initialization', async () => {
      const existingData = {
        'jira-sync-offline-data': {
          issues: [['TEST-1', { key: 'TEST-1', cached: true, cacheTime: Date.now() }]],
          lastSync: Date.now() - 3600000, // 1 hour ago
          offlineChanges: [],
          metadata: { totalIssues: 1, lastFullSync: Date.now(), syncVersion: '1.0.0', mode: 'degraded' }
        }
      };
      mockPlugin.loadData.mockResolvedValue(existingData);
      expect(status.cachedIssuesCount).toBe(1);
      expect(status.mode).toBe('degraded');
  describe('Mode Transitions', () => {
    beforeEach(async () => {
    it('should enable degraded mode with proper state updates', async () => {
      await manager.enableDegradedMode('Network issues');
      expect(status.isEnabled).toBe(true);
      expect(mockPlugin.saveData).toHaveBeenCalled();
      expect(mockEventManager.emit).toHaveBeenCalled();
      expect(Notice).toHaveBeenCalledWith(expect.stringContaining('Degraded mode enabled'));
    it('should enable offline mode with proper state updates', async () => {
      await manager.enableOfflineMode('No connectivity');
      expect(status.mode).toBe('offline');
      expect(Notice).toHaveBeenCalledWith(expect.stringContaining('Offline mode enabled'));
    it('should restore online mode from degraded state', async () => {
      await manager.enableDegradedMode('Test degraded mode');
      await manager.restoreOnlineMode();
      expect(Notice).toHaveBeenCalledWith(expect.stringContaining('Online mode restored'));
    it('should not enable degraded mode when already enabled', async () => {
      await manager.enableDegradedMode('First enable');
      const firstSaveCallCount = mockPlugin.saveData.mock.calls.length;
      await manager.enableDegradedMode('Second enable attempt');
      const secondSaveCallCount = mockPlugin.saveData.mock.calls.length;
      expect(secondSaveCallCount).toBe(firstSaveCallCount); // No additional save
  describe('Issue Caching', () => {
    it('should cache issues with proper metadata', async () => {
      const issue = createMockIssue('TEST-1', 'Test Issue');
      await manager.cacheIssue(issue);
      const cachedIssue = manager.getCachedIssue('TEST-1');
      expect(cachedIssue).toBeTruthy();
      expect(cachedIssue!.cached).toBe(true);
      expect(cachedIssue!.cacheTime).toBeGreaterThan(0);
      expect(cachedIssue!.key).toBe('TEST-1');
    it('should retrieve all cached issues', async () => {
      const issue1 = createMockIssue('TEST-1', 'Issue 1');
      const issue2 = createMockIssue('TEST-2', 'Issue 2');
      await manager.cacheIssue(issue1);
      await manager.cacheIssue(issue2);
      const allCached = manager.getAllCachedIssues();
      expect(allCached).toHaveLength(2);
      expect(allCached.map(i => i.key).sort()).toEqual(['TEST-1', 'TEST-2']);
    it('should return null for non-existent cached issue', () => {
      const cachedIssue = manager.getCachedIssue('NON-EXISTENT');
      expect(cachedIssue).toBeNull();
    it('should handle cache expiry correctly', async () => {
      const customManager = new DegradedModeManager(
        mockPlugin,
        { cacheExpiryHours: 0.01 }, // 0.6 minutes = 36 seconds
        mockEventManager
      );
      await customManager.initialize();
      await customManager.cacheIssue(issue);
      // Wait for cache to expire
      await new Promise(resolve => setTimeout(resolve, 50));
      const cachedIssue = customManager.getCachedIssue('TEST-1');
      // In online mode, expired cache should be removed
    it('should return expired data in offline mode', async () => {
        { cacheExpiryHours: 0.01 },
      await customManager.enableOfflineMode('Testing expired cache');
      expect(cachedIssue!.cached).toBe(false); // Marked as stale
  describe('Offline Change Queue', () => {
      await manager.enableOfflineMode('Testing offline changes');
    it('should queue offline changes', async () => {
      const change = {
        issueKey: 'TEST-1',
        fields: { summary: 'Updated summary' },
        timestamp: Date.now(),
        retryCount: 0
      await manager.queueOfflineChange(change);
      const pendingChanges = manager.getPendingOfflineChanges();
      expect(pendingChanges).toHaveLength(1);
      expect(pendingChanges[0].issueKey).toBe('TEST-1');
      expect(pendingChanges[0].id).toContain('offline-TEST-1');
    it('should respect maximum queue size', async () => {
        { maxOfflineQueueSize: 2 },
      await customManager.enableOfflineMode('Testing queue limit');
      // Add 3 changes when limit is 2
      for (let i = 1; i <= 3; i++) {
        await customManager.queueOfflineChange({
          issueKey: `TEST-${i}`,
          fields: { summary: `Change ${i}` },
          timestamp: Date.now(),
          retryCount: 0
        });
      }
      const pendingChanges = customManager.getPendingOfflineChanges();
      expect(pendingChanges).toHaveLength(2);
      // Should contain the last 2 changes (oldest removed)
      expect(pendingChanges.map(c => c.issueKey)).toEqual(['TEST-2', 'TEST-3']);
    it('should clear processed offline changes', async () => {
      const change1 = {
        fields: { summary: 'Change 1' },
      const change2 = {
        issueKey: 'TEST-2',
        fields: { summary: 'Change 2' },
      await manager.queueOfflineChange(change1);
      await manager.queueOfflineChange(change2);
      let pendingChanges = manager.getPendingOfflineChanges();
      const processedId = pendingChanges[0].id;
      await manager.clearProcessedOfflineChanges([processedId]);
      pendingChanges = manager.getPendingOfflineChanges();
      expect(pendingChanges[0].issueKey).toBe('TEST-2');
  describe('Conflict Resolution', () => {
    it('should handle sync conflicts', async () => {
      await manager.handleSyncConflict(
        'TEST-1',
        'summary',
        'Local value',
        'Remote value'
      expect(cachedIssue!.conflictMarkers).toHaveLength(1);
      const conflict = cachedIssue!.conflictMarkers![0];
      expect(conflict.field).toBe('summary');
      expect(conflict.localValue).toBe('Local value');
      expect(conflict.remoteValue).toBe('Remote value');
      expect(conflict.resolved).toBe(false);
      expect(Notice).toHaveBeenCalledWith(expect.stringContaining('Conflict detected'));
    it('should resolve conflicts manually', async () => {
      await manager.handleSyncConflict('TEST-1', 'summary', 'Local', 'Remote');
      // Resolve with local value
      await manager.resolveConflict('TEST-1', 0, true);
      expect(conflict.resolved).toBe(true);
      expect(cachedIssue!.fields.summary).toBe('Local');
      expect(Notice).toHaveBeenCalledWith(expect.stringContaining('Conflict resolved'));
    it('should resolve conflicts with remote value', async () => {
      await manager.handleSyncConflict('TEST-1', 'description', 'Local desc', 'Remote desc');
      // Resolve with remote value
      await manager.resolveConflict('TEST-1', 0, false);
      expect(cachedIssue!.fields.description).toBe('Remote desc');
    it('should handle non-existent conflicts gracefully', async () => {
      await manager.resolveConflict('NON-EXISTENT', 0, true);
      await manager.resolveConflict('TEST-1', 999, true);
      // Should not throw errors
      expect(true).toBe(true);
  describe('Status and Statistics', () => {
    it('should provide accurate status information', async () => {
      await manager.queueOfflineChange({
        fields: { summary: 'Updated' },
      });
      expect(status.offlineQueueSize).toBe(1);
      expect(status.canRead).toBe(true);
      expect(status.canWrite).toBe(true);
    it('should assess data freshness correctly', async () => {
      // Fresh data
      let status = manager.getStatus();
      expect(status.dataFreshness).toBe('fresh');
      // Simulate old data
        { cacheExpiryHours: 1 },
      const oldData = {
          issues: [],
          lastSync: Date.now() - 7200000, // 2 hours ago
          metadata: { totalIssues: 0, lastFullSync: 0, syncVersion: '1.0.0', mode: 'online' }
      mockPlugin.loadData.mockResolvedValue(oldData);
      status = customManager.getStatus();
      expect(status.dataFreshness).toBe('expired');
    it('should handle read/write permissions based on mode', async () => {
      // Online mode
      // Degraded mode
      await manager.enableDegradedMode('Testing permissions');
      status = manager.getStatus();
      // Offline mode
      await manager.enableOfflineMode('Testing permissions');
      expect(status.canWrite).toBe(true); // Enabled in config
  describe('Data Import/Export', () => {
    it('should export offline data as JSON', async () => {
      const issue = createMockIssue('TEST-1', 'Export Test');
        fields: { summary: 'Export Change' },
      const exportData = await manager.exportOfflineData();
      const parsed = JSON.parse(exportData);
      expect(parsed.issues).toHaveLength(1);
      expect(parsed.offlineChanges).toHaveLength(1);
      expect(parsed.exportTime).toBeGreaterThan(0);
    it('should import offline data from JSON', async () => {
      const importData = {
        issues: [['TEST-IMPORT', { key: 'TEST-IMPORT', cached: true, cacheTime: Date.now() }]],
        lastSync: Date.now(),
        offlineChanges: [{
          id: 'import-change',
          issueKey: 'TEST-IMPORT',
          fields: { summary: 'Imported change' },
        }],
        metadata: { totalIssues: 1, lastFullSync: Date.now(), syncVersion: '1.0.0', mode: 'offline' },
        exportTime: Date.now()
      await manager.importOfflineData(JSON.stringify(importData));
      const cachedIssue = manager.getCachedIssue('TEST-IMPORT');
      expect(Notice).toHaveBeenCalledWith(expect.stringContaining('imported successfully'));
    it('should handle invalid import data gracefully', async () => {
      await manager.importOfflineData('invalid json');
      expect(Notice).toHaveBeenCalledWith(expect.stringContaining('Failed to import'));
  describe('Connectivity Integration', () => {
    it('should respond to connectivity status changes', async () => {
      // Simulate connectivity monitor detecting Jira unreachable
      mockConnectivityMonitor.getStatus.mockReturnValue({
        isOnline: true,
        jiraReachable: false,
        consecutiveFailures: 1,
        lastSuccessfulCheck: 0,
        lastFailedCheck: Date.now(),
        latency: 0,
        error: 'Jira unreachable'
      // Trigger connectivity monitoring (simulated)
      await manager.enableDegradedMode('Connectivity monitor detected Jira issues');
    it('should restore online mode when connectivity is restored', async () => {
      await manager.enableDegradedMode('Connection issues');
      // Simulate connectivity restored
        jiraReachable: true,
        consecutiveFailures: 0,
        lastSuccessfulCheck: Date.now(),
        lastFailedCheck: 0,
        latency: 100
  describe('Data Cleanup', () => {
    it('should clean up expired data on initialization', async () => {
        { offlineDataRetentionDays: 0.001 }, // Very short retention
      // Mock old data
          issues: [['OLD-1', { key: 'OLD-1', cached: true, cacheTime: Date.now() - 86400000 }]], // 1 day old
          lastSync: Date.now() - 86400000,
          offlineChanges: [{
            id: 'old-change',
            issueKey: 'OLD-1',
            fields: {},
            timestamp: Date.now() - 86400000,
            retryCount: 0
          }],
          metadata: { totalIssues: 1, lastFullSync: 0, syncVersion: '1.0.0', mode: 'online' }
      const status = customManager.getStatus();
      expect(status.cachedIssuesCount).toBe(0);
      expect(status.offlineQueueSize).toBe(0);
  describe('Error Handling', () => {
    it('should handle save errors gracefully', async () => {
      mockPlugin.saveData.mockRejectedValue(new Error('Save failed'));
      const issue = createMockIssue('TEST-1', 'Save Error Test');
      // Should not throw despite save error
      await expect(manager.cacheIssue(issue)).resolves.not.toThrow();
    it('should handle load errors gracefully', async () => {
      mockPlugin.loadData.mockRejectedValue(new Error('Load failed'));
      const errorManager = new DegradedModeManager(mockPlugin, {}, mockEventManager);
      // Should initialize with defaults despite load error
      await expect(errorManager.initialize()).resolves.not.toThrow();
      const status = errorManager.getStatus();
    it('should handle event emission errors gracefully', async () => {
      mockEventManager.emit.mockRejectedValue(new Error('Event emission failed'));
      // Should not throw despite event emission errors
      await expect(manager.enableDegradedMode('Test')).resolves.not.toThrow();
});
describe('DegradedModeUtils', () => {
  describe('Operation Permission Checks', () => {
    it('should correctly assess operation permissions', () => {
      const onlineStatus = {
        isEnabled: false,
        mode: 'online' as const,
        offlineQueueSize: 0,
        cachedIssuesCount: 10,
        lastSyncTime: Date.now(),
        dataFreshness: 'fresh' as const,
        canWrite: true,
        canRead: true
      expect(DegradedModeUtils.isOperationAllowed('read', onlineStatus)).toBe(true);
      expect(DegradedModeUtils.isOperationAllowed('write', onlineStatus)).toBe(true);
      expect(DegradedModeUtils.isOperationAllowed('delete', onlineStatus)).toBe(true);
      expect(DegradedModeUtils.isOperationAllowed('sync', onlineStatus)).toBe(true);
      const offlineStatus = {
        ...onlineStatus,
        isEnabled: true,
        mode: 'offline' as const,
      expect(DegradedModeUtils.isOperationAllowed('read', offlineStatus)).toBe(true);
      expect(DegradedModeUtils.isOperationAllowed('write', offlineStatus)).toBe(true);
      expect(DegradedModeUtils.isOperationAllowed('delete', offlineStatus)).toBe(false);
      expect(DegradedModeUtils.isOperationAllowed('sync', offlineStatus)).toBe(false);
  describe('Status Messages', () => {
    it('should generate appropriate status messages', () => {
        cachedIssuesCount: 5,
      const message = DegradedModeUtils.getStatusMessage(onlineStatus);
      expect(message).toContain('Online');
      expect(message).toContain('5 issues cached');
      expect(message).toContain('fresh');
      const degradedStatus = {
        mode: 'degraded' as const,
        offlineQueueSize: 3
      const degradedMessage = DegradedModeUtils.getStatusMessage(degradedStatus);
      expect(degradedMessage).toContain('Degraded mode');
      expect(degradedMessage).toContain('3 pending changes');
        offlineQueueSize: 7
      const offlineMessage = DegradedModeUtils.getStatusMessage(offlineStatus);
      expect(offlineMessage).toContain('Offline mode');
      expect(offlineMessage).toContain('7 queued changes');
  describe('User Notifications', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    it('should create appropriate notices for different modes', () => {
      DegradedModeUtils.createReadOnlyNotice('degraded');
      expect(Notice).toHaveBeenCalledWith(
        expect.stringContaining('degraded mode'),
        5000
      DegradedModeUtils.createReadOnlyNotice('offline');
        expect.stringContaining('offline mode'),
describe('Real-world Degraded Mode Scenarios', () => {
  
    manager = new DegradedModeManager(mockPlugin, {
      enableOfflineMode: true,
      maxOfflineQueueSize: 100,
      offlineDataRetentionDays: 7,
      cacheExpiryHours: 24
  describe('Extended Offline Sessions', () => {
    it('should handle long offline periods with many changes', async () => {
      await manager.enableOfflineMode('Extended outage');
      // Simulate many cached issues
      for (let i = 1; i <= 50; i++) {
        const issue = createMockIssue(`PROJ-${i}`, `Issue ${i}`);
        await manager.cacheIssue(issue);
      // Simulate many offline changes
      for (let i = 1; i <= 30; i++) {
        await manager.queueOfflineChange({
          issueKey: `PROJ-${i}`,
          fields: { summary: `Updated summary ${i}` },
      expect(status.cachedIssuesCount).toBe(50);
      expect(status.offlineQueueSize).toBe(30);
  describe('Partial Connectivity Recovery', () => {
    it('should handle transition from offline to degraded to online', async () => {
      // Start offline
      await manager.enableOfflineMode('Complete outage');
      expect(manager.getStatus().mode).toBe('offline');
      // Partial recovery - degraded mode
      await manager.enableDegradedMode('Partial connectivity');
      expect(manager.getStatus().mode).toBe('degraded');
      // Full recovery - online mode
      expect(manager.getStatus().mode).toBe('online');
  describe('Data Consistency During Mode Changes', () => {
    it('should maintain data integrity across mode transitions', async () => {
      // Add data while online
      const issue = createMockIssue('TEST-1', 'Original');
      // Go offline and modify
      await manager.enableOfflineMode('Testing consistency');
        fields: { summary: 'Modified offline' },
      // Check data is preserved
      const offlineChanges = manager.getPendingOfflineChanges();
      expect(offlineChanges).toHaveLength(1);
      // Go back online
      // Data should still be there
      expect(manager.getCachedIssue('TEST-1')).toBeTruthy();
      expect(manager.getPendingOfflineChanges()).toHaveLength(1);
  describe('Memory and Storage Efficiency', () => {
    it('should handle large datasets efficiently', async () => {
      const startTime = Date.now();
      // Add many issues quickly
      const promises = [];
      for (let i = 1; i <= 1000; i++) {
        const issue = createMockIssue(`PERF-${i}`, `Performance test ${i}`);
        promises.push(manager.cacheIssue(issue));
      await Promise.all(promises);
      const endTime = Date.now();
      const duration = endTime - startTime;
      expect(manager.getStatus().cachedIssuesCount).toBe(1000);
      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
