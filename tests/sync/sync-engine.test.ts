/**
 * BidirectionalSyncEngine Tests
 * Comprehensive tests for the bidirectional sync engine with real implementations
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { 
  BidirectionalSyncEngine, 
  SyncEngineConfig, 
  SyncResult, 
  SyncConflict 
} from '../../src/sync/sync-engine';
import { JiraApiClient } from '../../src/sync/jira-api-client';
import { ChangeQueue, QueuedChange } from '../../src/sync/change-queue';
import { ConflictDetector } from '../../src/sync/conflict-detector';
import { JiraFileWatcher } from '../../src/utils/file-watcher';
import { JiraIssue } from '../../src/types/jira-types';
import type { Mock, Mocked, MockedFunction } from 'vitest';
// Mock Obsidian modules
vi.mock('obsidian', () => ({
  Notice: vi.fn(),
  Plugin: vi.fn(),
  TFile: vi.fn(),
  TFolder: vi.fn(),
  Vault: vi.fn(),
  requestUrl: vi.fn()
}));
// Mock dependencies
vi.mock('../../src/sync/jira-api-client');
vi.mock('../../src/sync/change-queue');
vi.mock('../../src/sync/conflict-detector');
vi.mock('../../src/utils/file-watcher');
import { Notice } from 'obsidian';
describe('BidirectionalSyncEngine', () => {
  let syncEngine: BidirectionalSyncEngine;
  let mockPlugin: any;
  let mockConfig: SyncEngineConfig;
  let mockApiClient: Mocked<JiraApiClient>;
  let mockChangeQueue: Mocked<ChangeQueue>;
  let mockConflictDetector: Mocked<ConflictDetector>;
  let mockFileWatcher: Mocked<JiraFileWatcher>;
  beforeEach(() => {
    // Setup mock plugin
    mockPlugin = {
      app: {
        vault: {
          on: vi.fn(),
          getAbstractFileByPath: vi.fn(),
          read: vi.fn(),
          modify: vi.fn(),
          create: vi.fn(),
          createFolder: vi.fn()
        }
      },
      registerEvent: vi.fn(),
      loadData: vi.fn(),
      saveData: vi.fn()
    };
    // Setup mock config
    mockConfig = {
      jiraUrl: 'https://test.atlassian.net',
      apiToken: 'test-token',
      userEmail: 'test@example.com',
      syncInterval: 300000,
      outputPath: 'Areas/Work/Jira Tickets',
      jqlQuery: 'assignee = currentUser()',
      enableBidirectional: true,
      conflictResolution: 'manual',
      batchSize: 10,
      retryAttempts: 3
    // Setup mocks
    mockApiClient = new JiraApiClient(mockConfig) as Mocked<JiraApiClient>;
    mockChangeQueue = new ChangeQueue(mockPlugin) as Mocked<ChangeQueue>;
    mockConflictDetector = new ConflictDetector() as Mocked<ConflictDetector>;
    mockFileWatcher = new JiraFileWatcher(mockPlugin, mockConfig.outputPath) as Mocked<JiraFileWatcher>;
    // Setup mock implementations
    mockChangeQueue.load = vi.fn().mockResolvedValue(undefined);
    mockChangeQueue.hasPendingChanges = vi.fn().mockReturnValue(false);
    mockChangeQueue.save = vi.fn().mockResolvedValue(undefined);
    mockChangeQueue.getPendingChanges = vi.fn().mockReturnValue([]);
    mockChangeQueue.addChange = vi.fn().mockResolvedValue(undefined);
    mockChangeQueue.markAsProcessed = vi.fn();
    mockChangeQueue.incrementRetryCount = vi.fn().mockResolvedValue(undefined);
    mockFileWatcher.start = vi.fn();
    mockFileWatcher.stop = vi.fn();
    mockFileWatcher.addChangeHandler = vi.fn();
    mockFileWatcher.addBatchHandler = vi.fn();
    mockFileWatcher.flushPendingChanges = vi.fn().mockResolvedValue(undefined);
    mockFileWatcher.extractIssueKey = vi.fn();
    mockConflictDetector.detectConflict = vi.fn().mockReturnValue(null);
    mockApiClient.searchIssues = vi.fn().mockResolvedValue([]);
    mockApiClient.updateIssue = vi.fn().mockResolvedValue({ success: true });
    mockApiClient.getIssue = vi.fn();
    // Create sync engine instance
    syncEngine = new BidirectionalSyncEngine(mockPlugin, mockConfig);
    // Replace dependencies with mocks
    (syncEngine as any).apiClient = mockApiClient;
    (syncEngine as any).changeQueue = mockChangeQueue;
    (syncEngine as any).conflictDetector = mockConflictDetector;
    (syncEngine as any).fileWatcher = mockFileWatcher;
    // Mock console methods
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  describe('Constructor and Initialization', () => {
    it('should initialize with correct configuration', () => {
      expect(syncEngine).toBeInstanceOf(BidirectionalSyncEngine);
      expect((syncEngine as any).config).toEqual(mockConfig);
      expect((syncEngine as any).plugin).toBe(mockPlugin);
    });
    it('should initialize all required components', async () => {
      await syncEngine.initialize();
      expect(mockChangeQueue.load).toHaveBeenCalled();
      expect(mockFileWatcher.addChangeHandler).toHaveBeenCalled();
      expect(mockFileWatcher.addBatchHandler).toHaveBeenCalled();
      expect(mockFileWatcher.start).toHaveBeenCalled();
    it('should not setup file watchers when bidirectional is disabled', async () => {
      const unidirectionalConfig = {
        ...mockConfig,
        enableBidirectional: false
      };
      const unidirectionalEngine = new BidirectionalSyncEngine(mockPlugin, unidirectionalConfig);
      (unidirectionalEngine as any).changeQueue = mockChangeQueue;
      (unidirectionalEngine as any).fileWatcher = mockFileWatcher;
      await unidirectionalEngine.initialize();
      expect(mockFileWatcher.start).not.toHaveBeenCalled();
    it('should process pending changes on initialization', async () => {
      mockChangeQueue.hasPendingChanges.mockReturnValue(true);
      const processPendingChangesSpy = vi.spyOn(syncEngine as any, 'processPendingChanges')
        .mockResolvedValue(undefined);
      expect(processPendingChangesSpy).toHaveBeenCalled();
  describe('Main Sync Method', () => {
    it('should prevent concurrent sync operations', async () => {
      // Set engine as running
      (syncEngine as any).isRunning = true;
      const result = await syncEngine.sync();
      expect(result.success).toBe(false);
      expect(result.errors).toContain('Sync already in progress');
      expect(result.syncedCount).toBe(0);
    it('should perform complete bidirectional sync successfully', async () => {
      const mockIssue: JiraIssue = {
        id: '10001',
        key: 'TEST-1',
        fields: {
          summary: 'Test Issue',
          description: 'Test description',
          status: { name: 'To Do' },
          updated: '2024-01-01T10:00:00.000Z',
          created: '2024-01-01T09:00:00.000Z'
      mockApiClient.searchIssues.mockResolvedValue([mockIssue]);
      mockPlugin.app.vault.getAbstractFileByPath.mockReturnValue(null);
      
      const updateLocalFileSpy = vi.spyOn(syncEngine as any, 'updateLocalFile')
      const pushToJiraSpy = vi.spyOn(syncEngine as any, 'pushToJira')
        .mockResolvedValue({ syncedCount: 1, failedCount: 0, errors: [] });
      expect(result.success).toBe(true);
      expect(result.syncedCount).toBe(2); // 1 from pull + 1 from push
      expect(result.conflicts).toEqual([]);
      expect(updateLocalFileSpy).toHaveBeenCalledWith(mockIssue);
      expect(pushToJiraSpy).toHaveBeenCalled();
      expect(result.duration).toBeGreaterThan(0);
    it('should handle sync errors gracefully', async () => {
      mockApiClient.searchIssues.mockRejectedValue(new Error('API Error'));
      expect(result.errors).toContain('API Error');
      expect((syncEngine as any).isRunning).toBe(false);
    it('should handle conflicts during sync', async () => {
      const mockConflict: SyncConflict = {
        issueKey: 'TEST-1',
        field: 'summary',
        localValue: 'Local Summary',
        remoteValue: 'Remote Summary',
        localTimestamp: Date.now(),
        remoteTimestamp: Date.now() - 1000
      const pullFromJiraSpy = vi.spyOn(syncEngine as any, 'pullFromJira')
        .mockResolvedValue({ 
          syncedCount: 0, 
          conflicts: [mockConflict] 
        });
      const handleConflictsSpy = vi.spyOn(syncEngine as any, 'handleConflicts')
      expect(result.conflicts).toEqual([mockConflict]);
      expect(handleConflictsSpy).toHaveBeenCalledWith([mockConflict]);
    it('should skip push phase when bidirectional is disabled', async () => {
      const unidirectionalEngine = new BidirectionalSyncEngine(mockPlugin, {
      });
      (unidirectionalEngine as any).apiClient = mockApiClient;
      (unidirectionalEngine as any).conflictDetector = mockConflictDetector;
      mockApiClient.searchIssues.mockResolvedValue([]);
      const pushToJiraSpy = vi.spyOn(unidirectionalEngine as any, 'pushToJira');
      const result = await unidirectionalEngine.sync();
      expect(pushToJiraSpy).not.toHaveBeenCalled();
  describe('Pull from Jira', () => {
    it('should update local files with remote changes', async () => {
          updated: '2024-01-01T10:00:00.000Z'
      const result = await (syncEngine as any).pullFromJira();
      expect(result.syncedCount).toBe(1);
    it('should detect conflicts with existing local files', async () => {
          summary: 'Remote Summary',
      const mockFile = {
        path: 'Areas/Work/Jira Tickets/TEST/TEST-1.md'
      const localContent = `---
jiraKey: TEST-1
title: Local Summary
updated: 2024-01-01T09:00:00.000Z
---
# TEST-1: Local Summary`;
      mockPlugin.app.vault.getAbstractFileByPath.mockReturnValue(mockFile);
      mockPlugin.app.vault.read.mockResolvedValue(localContent);
        localTimestamp: new Date('2024-01-01T09:00:00.000Z').getTime(),
        remoteTimestamp: new Date('2024-01-01T10:00:00.000Z').getTime()
      mockConflictDetector.detectConflict.mockReturnValue(mockConflict);
      expect(result.syncedCount).toBe(0); // No sync due to conflict
    it('should handle API errors during pull', async () => {
      mockApiClient.searchIssues.mockRejectedValue(new Error('Search failed'));
      await expect((syncEngine as any).pullFromJira()).rejects.toThrow('Search failed');
      expect(console.error).toHaveBeenCalledWith('Error pulling from Jira:', expect.any(Error));
  describe('Push to Jira', () => {
    const mockPendingChange: QueuedChange = {
      id: 'TEST-1-123456789',
      issueKey: 'TEST-1',
      fields: { summary: 'Updated Summary' },
      timestamp: Date.now(),
      retryCount: 0
    it('should push local changes to Jira successfully', async () => {
      mockChangeQueue.getPendingChanges.mockReturnValue([mockPendingChange]);
      mockApiClient.updateIssue.mockResolvedValue({ success: true });
      const result = await (syncEngine as any).pushToJira();
      expect(result.failedCount).toBe(0);
      expect(mockApiClient.updateIssue).toHaveBeenCalledWith(
        'TEST-1',
        { fields: { summary: 'Updated Summary' } }
      );
      expect(mockChangeQueue.markAsProcessed).toHaveBeenCalledWith(mockPendingChange.id);
      expect(mockChangeQueue.save).toHaveBeenCalled();
    it('should handle push failures with retry logic', async () => {
      mockApiClient.updateIssue.mockResolvedValue({ 
        success: false, 
        error: 'Validation error' 
      expect(result.failedCount).toBe(1);
      expect(result.errors).toContain('Failed to update TEST-1: Validation error');
      expect(mockChangeQueue.incrementRetryCount).toHaveBeenCalledWith(mockPendingChange.id);
    it('should process changes in batches', async () => {
      const changes = Array.from({ length: 25 }, (_, i) => ({
        id: `TEST-${i}-123456789`,
        issueKey: `TEST-${i}`,
        fields: { summary: `Updated Summary ${i}` },
        timestamp: Date.now(),
        retryCount: 0
      }));
      mockChangeQueue.getPendingChanges.mockReturnValue(changes);
      // Mock rate limiter
      const rateLimiterSpy = vi.spyOn((syncEngine as any).rateLimiter, 'waitIfNeeded')
      await (syncEngine as any).pushToJira();
      // Should call API 25 times (all changes)
      expect(mockApiClient.updateIssue).toHaveBeenCalledTimes(25);
      // Rate limiter should be called for each batch (3 batches with batchSize 10)
      expect(rateLimiterSpy).toHaveBeenCalledTimes(3);
    it('should respect rate limits', async () => {
      expect(rateLimiterSpy).toHaveBeenCalled();
  describe('File Change Handling', () => {
    const mockFile = {
      path: 'Areas/Work/Jira Tickets/TEST/TEST-1.md',
      name: 'TEST-1.md',
      stat: { mtime: Date.now() }
    const mockFileEvent = {
      type: 'modify' as const,
      file: mockFile,
      timestamp: Date.now()
    it('should handle file modification events', async () => {
      mockFileWatcher.extractIssueKey.mockReturnValue('TEST-1');
      const fileContent = `---
title: Modified Summary
# TEST-1: Modified Summary`;
      mockPlugin.app.vault.read.mockResolvedValue(fileContent);
      await (syncEngine as any).handleFileChangeEvent(mockFileEvent);
      expect(mockChangeQueue.addChange).toHaveBeenCalledWith({
        id: expect.stringContaining('TEST-1'),
        fields: { summary: 'Modified Summary' },
        timestamp: expect.any(Number),
    it('should handle batch file changes efficiently', async () => {
      const batchChanges = {
        changes: [
          { ...mockFileEvent, file: { ...mockFile, path: 'Areas/Work/Jira Tickets/TEST/TEST-1.md' } },
          { ...mockFileEvent, file: { ...mockFile, path: 'Areas/Work/Jira Tickets/TEST/TEST-2.md' } },
          { ...mockFileEvent, file: { ...mockFile, path: 'Areas/Work/Jira Tickets/TEST/TEST-1.md' } } // Duplicate
        ],
        totalSize: 3
      mockFileWatcher.extractIssueKey
        .mockReturnValueOnce('TEST-1')
        .mockReturnValueOnce('TEST-2')
        .mockReturnValueOnce('TEST-1');
      const handleFileChangeEventSpy = vi.spyOn(syncEngine as any, 'handleFileChangeEvent')
      await (syncEngine as any).handleBatchChanges(batchChanges);
      // Should only process unique changes (TEST-1 and TEST-2)
      expect(handleFileChangeEventSpy).toHaveBeenCalledTimes(2);
    it('should ignore files without valid issue keys', async () => {
      mockFileWatcher.extractIssueKey.mockReturnValue(null);
      expect(mockChangeQueue.addChange).not.toHaveBeenCalled();
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('Could not extract issue key')
    it('should handle file deletion events safely', async () => {
      const deleteEvent = {
        ...mockFileEvent,
        type: 'delete' as const
      await (syncEngine as any).handleFileChangeEvent(deleteEvent);
      // Should not queue any changes for deletion
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('File deleted')
  describe('Conflict Resolution', () => {
    const mockConflict: SyncConflict = {
      field: 'summary',
      localValue: 'Local Summary',
      remoteValue: 'Remote Summary',
      localTimestamp: Date.now(),
      remoteTimestamp: Date.now() - 1000
    it('should handle local conflict resolution', async () => {
      const localResolutionEngine = new BidirectionalSyncEngine(mockPlugin, {
        conflictResolution: 'local'
      (localResolutionEngine as any).changeQueue = mockChangeQueue;
      await (localResolutionEngine as any).handleConflicts([mockConflict]);
      expect(mockChangeQueue.addChange).toHaveBeenCalledWith(
        expect.objectContaining({
          issueKey: 'TEST-1',
          fields: { summary: 'Local Summary' }
        })
    it('should handle remote conflict resolution', async () => {
      const remoteResolutionEngine = new BidirectionalSyncEngine(mockPlugin, {
        conflictResolution: 'remote'
      (remoteResolutionEngine as any).apiClient = mockApiClient;
        fields: { summary: 'Remote Summary' }
      mockApiClient.getIssue.mockResolvedValue(mockIssue);
      const updateLocalFileSpy = vi.spyOn(remoteResolutionEngine as any, 'updateLocalFile')
      await (remoteResolutionEngine as any).handleConflicts([mockConflict]);
      expect(mockApiClient.getIssue).toHaveBeenCalledWith('TEST-1');
    it('should queue manual conflicts for user resolution', async () => {
      const manualResolutionEngine = new BidirectionalSyncEngine(mockPlugin, {
        conflictResolution: 'manual'
      await (manualResolutionEngine as any).handleConflicts([mockConflict]);
      expect(Notice).toHaveBeenCalledWith(
        expect.stringContaining('Conflict detected in TEST-1')
  describe('Shutdown and Cleanup', () => {
    it('should properly shutdown all components', async () => {
      await syncEngine.shutdown();
      expect(mockFileWatcher.stop).toHaveBeenCalled();
      expect(mockFileWatcher.flushPendingChanges).toHaveBeenCalled();
      expect(console.log).toHaveBeenCalledWith('Sync engine shutdown completed');
  describe('Helper Methods', () => {
    it('should generate correct file paths for issues', () => {
        key: 'PROJECT-123',
        fields: { summary: 'Test Issue' }
      const filePath = (syncEngine as any).getFilePathForIssue(mockIssue);
      expect(filePath).toBe('Areas/Work/Jira Tickets/PROJECT/PROJECT-123.md');
    it('should extract metadata from markdown frontmatter', () => {
      const content = `---
title: Test Issue
status: In Progress
priority: High
updated: 2024-01-01T10:00:00.000Z
# TEST-1: Test Issue
Content here`;
      const metadata = (syncEngine as any).extractMetadata(content);
      expect(metadata).toEqual({
        jiraKey: 'TEST-1',
        title: 'Test Issue',
        status: 'In Progress',
        priority: 'High',
        updated: '2024-01-01T10:00:00.000Z'
    it('should map metadata to Jira fields correctly', () => {
      const metadata = {
        title: 'Updated Summary',
        description: 'Updated description',
        priority: 'Critical'
      const jiraFields = (syncEngine as any).mapMetadataToJiraFields(metadata);
      expect(jiraFields).toEqual({
        summary: 'Updated Summary',
        priority: { name: 'Critical' }
    it('should create proper batches from arrays', () => {
      const items = Array.from({ length: 25 }, (_, i) => `item-${i}`);
      const batches = (syncEngine as any).createBatches(items, 10);
      expect(batches).toHaveLength(3);
      expect(batches[0]).toHaveLength(10);
      expect(batches[1]).toHaveLength(10);
      expect(batches[2]).toHaveLength(5);
    it('should format issues as markdown correctly', async () => {
          assignee: { displayName: 'John Doe' },
          priority: { name: 'Medium' },
      const markdown = (syncEngine as any).formatIssueAsMarkdown(mockIssue);
      expect(markdown).toContain('---');
      expect(markdown).toContain('jiraKey: TEST-1');
      expect(markdown).toContain('title: Test Issue');
      expect(markdown).toContain('status: To Do');
      expect(markdown).toContain('assignee: John Doe');
      expect(markdown).toContain('priority: Medium');
      expect(markdown).toContain('# TEST-1: Test Issue');
      expect(markdown).toContain('## Description');
      expect(markdown).toContain('Test description');
  describe('Error Handling and Edge Cases', () => {
    it('should handle empty search results gracefully', async () => {
    it('should handle file read errors during change processing', async () => {
      const mockFileEvent = {
        type: 'modify' as const,
        file: { path: 'test.md', stat: { mtime: Date.now() } },
        timestamp: Date.now()
      mockPlugin.app.vault.read.mockRejectedValue(new Error('File not found'));
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('Error handling file change event'),
        expect.any(Error)
    it('should handle metadata extraction errors', () => {
      const invalidContent = 'No frontmatter here';
      const metadata = (syncEngine as any).extractMetadata(invalidContent);
      expect(metadata).toEqual({});
    it('should handle concurrent sync attempts correctly', async () => {
      const result1Promise = syncEngine.sync();
      const result2Promise = syncEngine.sync();
      const [result1, result2] = await Promise.all([result1Promise, result2Promise]);
      expect(result2.success).toBe(false);
      expect(result2.errors).toContain('Sync already in progress');
});
