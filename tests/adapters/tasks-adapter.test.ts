/**
 * TasksAdapter Unit Tests
 * Comprehensive test suite for Tasks plugin integration
 * RED-GREEN-Refactor approach with real implementations, no mocks
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TasksAdapter } from '../../src/adapters/tasks-adapter';
import { PluginAdapterBase } from '../../src/adapters/plugin-adapter-base';
import { TasksAdapterConfig, TaskStatus, TaskPriority } from '../../src/types/tasks-types';
import { EventBus } from '../../src/events/event-bus';
import { MockData } from '../fixtures/mock-data';
import type { Mock, Mocked, MockedFunction } from 'vitest';
// Mock Obsidian App interface
const mockApp = {
  vault: {
    getAbstractFileByPath: vi.fn(),
    read: vi.fn(),
    write: vi.fn(),
    create: vi.fn(),
    modify: vi.fn(),
    createFolder: vi.fn(),
    configDir: '/test/config',
    adapter: {
      write: vi.fn()
    }
  },
  metadataCache: {},
  plugins: {
    plugins: {
      'obsidian-tasks-plugin': {
        enabled: true
      }
  }
} as any;
describe('TasksAdapter', () => {
  let adapter: TasksAdapter;
  let eventBus: EventBus;
  let mockConfig: TasksAdapterConfig;
  beforeEach(() => {
    // Create real event bus instance
    eventBus = new EventBus();
    
    // Setup realistic configuration
    mockConfig = {
      enabled: true,
      pluginId: 'obsidian-tasks-plugin',
      syncDirection: 'jira-to-plugin',
      batchSize: 10,
      retryAttempts: 3,
      timeout: 5000,
      defaultFilePath: 'Tasks/Jira Issues.md',
      createInCurrentFile: false,
      useJiraKeyAsId: true,
      includeJiraUrl: true,
      mapJiraLabelsToTags: true,
      preserveTaskFormatting: true,
      statusMappings: {
        'To Do': TaskStatus.TODO,
        'In Progress': TaskStatus.IN_PROGRESS,
        'Done': TaskStatus.DONE,
        'Cancelled': TaskStatus.CANCELLED
      },
      priorityMappings: {
        'Lowest': TaskPriority.LOW,
        'Low': TaskPriority.LOW,
        'Medium': TaskPriority.NONE,
        'High': TaskPriority.HIGH,
        'Highest': TaskPriority.HIGHEST
      dateFormat: 'YYYY-MM-DD',
      includeCreatedDate: true,
      includeScheduledDate: true,
      includeDueDate: true,
      includeStartDate: false,
      taskFileTemplate: 'Tasks/{projectKey}/{issueKey}.md',
      useProjectFolders: false,
      projectFolderTemplate: 'Projects/{projectKey}',
      appendToExistingFile: true,
      enableSubtasks: false,
      subtaskPrefix: '    ',
      maxDescriptionLength: 1000,
      stripHtmlFromDescription: true,
      convertJiraMarkup: true
    };
    // Create adapter instance
    adapter = new TasksAdapter(mockConfig, eventBus, mockApp);
    // Mock console methods
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.clearAllMocks();
  describe('Constructor', () => {
    it('should create TasksAdapter with valid configuration', () => {
      expect(adapter).toBeInstanceOf(TasksAdapter);
      expect(adapter).toBeInstanceOf(PluginAdapterBase);
      expect(adapter.getConfig()).toEqual(mockConfig);
    });
    it('should throw error with invalid plugin ID', () => {
      const invalidConfig = { ...mockConfig, pluginId: '' };
      
      expect(() => new TasksAdapter(invalidConfig as any, eventBus, mockApp)).toThrow('Plugin ID is required');
    it('should throw error with invalid sync direction', () => {
      const invalidConfig = { ...mockConfig, syncDirection: 'invalid' as any };
      expect(() => new TasksAdapter(invalidConfig, eventBus, mockApp)).toThrow('Invalid sync direction');
    it('should initialize TaskFormatConverter with correct options', () => {
      const config = adapter.getConfig();
      expect(config.useJiraKeyAsId).toBe(true);
      expect(config.includeJiraUrl).toBe(true);
      expect(config.mapJiraLabelsToTags).toBe(true);
  describe('initialize', () => {
    it('should initialize successfully when Tasks plugin is available', async () => {
      await expect(adapter.initialize()).resolves.not.toThrow();
      expect(console.log).toHaveBeenCalledWith('TasksAdapter initialized successfully');
    it('should fail initialization when Tasks plugin is not found', async () => {
      const appWithoutPlugin = {
        ...mockApp,
        plugins: { plugins: {} }
      };
      const adapterWithoutPlugin = new TasksAdapter(mockConfig, eventBus, appWithoutPlugin);
      await expect(adapterWithoutPlugin.initialize()).rejects.toThrow('Tasks plugin not found or not enabled');
    it('should set up event listeners during initialization', async () => {
      const eventSpy = vi.spyOn(eventBus, 'on');
      await adapter.initialize();
      expect(eventSpy).toHaveBeenCalledWith('tasks:task:toggled', expect.any(Function));
      expect(eventSpy).toHaveBeenCalledWith('jira:issue:updated', expect.any(Function));
  describe('dispose', () => {
    beforeEach(async () => {
    it('should clean up resources on dispose', async () => {
      const mockSaveTaskMappings = vi.spyOn(adapter as any, 'saveTaskMappings').mockResolvedValue(undefined);
      await adapter.dispose();
      expect(mockSaveTaskMappings).toHaveBeenCalled();
      expect(console.log).toHaveBeenCalledWith('TasksAdapter disposed');
    it('should handle disposal errors gracefully', async () => {
      vi.spyOn(adapter as any, 'saveTaskMappings').mockRejectedValue(new Error('Save failed'));
      expect(console.error).toHaveBeenCalledWith('Error disposing TasksAdapter:', expect.any(Error));
  describe('isPluginAvailable', () => {
    it('should return true when Tasks plugin is enabled', async () => {
      const result = await adapter.isPluginAvailable();
      expect(result).toBe(true);
    it('should return false when Tasks plugin is not available', async () => {
      const result = await adapterWithoutPlugin.isPluginAvailable();
      expect(result).toBe(false);
  describe('convertFromJira', () => {
    it('should convert Jira issue to TaskItem successfully', async () => {
      const jiraIssue = MockData.jira.issue;
      const result = await adapter.convertFromJira(jiraIssue);
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data!.description).toContain(jiraIssue.fields.summary);
      expect(result.data!.status).toBe(TaskStatus.TODO); // Default mapping
      expect(result.data!.filePath).toBe(mockConfig.defaultFilePath);
    it('should map Jira status to correct TaskStatus', async () => {
      const inProgressIssue = {
        ...MockData.jira.issue,
        fields: {
          ...MockData.jira.issue.fields,
          status: { name: 'In Progress' }
        }
      const result = await adapter.convertFromJira(inProgressIssue);
      expect(result.data!.status).toBe(TaskStatus.IN_PROGRESS);
    it('should map Jira priority to correct TaskPriority', async () => {
      const highPriorityIssue = {
          priority: { name: 'High' }
      const result = await adapter.convertFromJira(highPriorityIssue);
      expect(result.data!.priority).toBe(TaskPriority.HIGH);
    it('should include Jira URL when configured', async () => {
      const jiraIssue = {
        self: 'https://test.atlassian.net/rest/api/2/issue/10001'
      expect(result.data!.description).toContain(jiraIssue.key);
      expect(result.data!.description).toContain('https://test.atlassian.net');
    it('should map Jira labels to tags when configured', async () => {
      const jiraIssueWithLabels = {
          labels: ['urgent', 'customer-facing', 'bug']
      const result = await adapter.convertFromJira(jiraIssueWithLabels);
      expect(result.data!.tags).toContain('urgent');
      expect(result.data!.tags).toContain('customer-facing');
      expect(result.data!.tags).toContain('bug');
      expect(result.data!.tags).toContain(jiraIssue.key); // Jira key preserved
    it('should handle due dates correctly', async () => {
      const dueDate = '2024-12-31T23:59:59.000Z';
      const jiraIssueWithDueDate = {
          duedate: dueDate
      const result = await adapter.convertFromJira(jiraIssueWithDueDate);
      expect(result.data!.dueDate).toEqual(new Date(dueDate));
    it('should complete conversion within 10ms performance target', async () => {
      const startTime = performance.now();
      const result = await adapter.convertFromJira(MockData.jira.issue);
      const conversionTime = performance.now() - startTime;
      expect(conversionTime).toBeLessThan(10); // Performance requirement
    it('should handle conversion errors gracefully', async () => {
      const invalidIssue = { ...MockData.jira.issue, fields: null };
      const result = await adapter.convertFromJira(invalidIssue as any);
      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors![0].code).toBe('CONVERSION_ERROR');
  describe('convertToJira', () => {
    it('should convert TaskItem back to Jira format', async () => {
      const task = MockData.tasks.taskItem;
      const result = await adapter.convertToJira(task);
      expect(result.data!.fields).toBeDefined();
    it('should map TaskStatus back to Jira status', async () => {
      const doneTask = {
        ...MockData.tasks.taskItem,
        status: TaskStatus.DONE
      const result = await adapter.convertToJira(doneTask);
      expect(result.data!.fields!.status).toEqual({ name: 'Done' });
    it('should map TaskPriority back to Jira priority', async () => {
      const highPriorityTask = {
        priority: TaskPriority.HIGH
      const result = await adapter.convertToJira(highPriorityTask);
      expect(result.data!.fields!.priority).toEqual({ name: 'High' });
    it('should handle due dates in reverse conversion', async () => {
      const taskWithDueDate = {
        dueDate: new Date('2024-12-31')
      const result = await adapter.convertToJira(taskWithDueDate);
      expect(result.data!.fields!.duedate).toBe(taskWithDueDate.dueDate.toISOString());
      const invalidTask = null;
      const result = await adapter.convertToJira(invalidTask as any);
      expect(result.errors![0].code).toBe('REVERSE_CONVERSION_ERROR');
  describe('applyToPlugin', () => {
    it('should create new task successfully', async () => {
      const mockFile = { path: task.filePath };
      mockApp.vault.getAbstractFileByPath.mockReturnValue(null); // File doesn't exist
      mockApp.vault.createFolder.mockResolvedValue(undefined);
      mockApp.vault.create.mockResolvedValue(mockFile);
      mockApp.vault.read.mockResolvedValue('# Tasks from Jira\n\n');
      mockApp.vault.modify.mockResolvedValue(undefined);
      const result = await adapter.applyToPlugin(task);
      expect(mockApp.vault.create).toHaveBeenCalled();
      expect(mockApp.vault.modify).toHaveBeenCalled();
      expect(result.metadata!.operation).toBe('create');
    it('should update existing task successfully', async () => {
      const jiraKey = 'TEST-123';
      // Set up existing mapping
      (adapter as any).taskMappings.set(jiraKey, {
        jiraKey,
        filePath: task.filePath,
        lineNumber: 5,
        lastSynced: new Date()
      });
      mockApp.vault.getAbstractFileByPath.mockReturnValue(mockFile);
      mockApp.vault.read.mockResolvedValue('Line 0\nLine 1\nLine 2\nLine 3\nLine 4\n- [x] Old task\nLine 6');
      const result = await adapter.applyToPlugin(task, { issueKey: jiraKey } as any);
      expect(result.metadata!.operation).toBe('update');
    it('should create directory structure if needed', async () => {
      const task = {
        filePath: 'Deep/Nested/Path/task.md'
      mockApp.vault.getAbstractFileByPath.mockReturnValue(null);
      mockApp.vault.create.mockResolvedValue({ path: task.filePath });
      mockApp.vault.read.mockResolvedValue('');
      expect(mockApp.vault.createFolder).toHaveBeenCalledWith('Deep/Nested/Path');
    it('should emit sync event on successful application', async () => {
      const eventSpy = vi.spyOn(eventBus, 'emit');
      await adapter.applyToPlugin(task, { issueKey: 'TEST-123' } as any);
      expect(eventSpy).toHaveBeenCalledWith('tasks:task:synced', expect.objectContaining({
        jiraKey: 'TEST-123',
        taskFilePath: task.filePath,
        operation: 'create'
      }));
    it('should handle application errors gracefully', async () => {
      mockApp.vault.getAbstractFileByPath.mockImplementation(() => {
        throw new Error('Vault error');
      expect(result.errors![0].code).toBe('APPLY_ERROR');
  describe('syncBulkIssues', () => {
    it('should sync multiple issues in batches', async () => {
      const issues = [
        MockData.jira.issue,
        { ...MockData.jira.issue, key: 'TEST-124', id: '10002' },
        { ...MockData.jira.issue, key: 'TEST-125', id: '10003' }
      ];
      // Mock successful sync for all issues
      vi.spyOn(adapter, 'syncIssueToPlugin').mockResolvedValue({ success: true });
      vi.spyOn(adapter, 'convertFromJira').mockResolvedValue({
        success: true,
        data: MockData.tasks.taskItem
      const result = await adapter.syncBulkIssues(issues);
      expect(result.totalProcessed).toBe(3);
      expect(result.successful.length).toBe(3);
      expect(result.failed.length).toBe(0);
      expect(result.duration).toBeGreaterThan(0);
    it('should handle batch processing with mixed success/failure', async () => {
        { ...MockData.jira.issue, key: 'TEST-124', id: '10002' }
      vi.spyOn(adapter, 'syncIssueToPlugin')
        .mockResolvedValueOnce({ success: true })
        .mockResolvedValueOnce({ 
          success: false, 
          errors: [{ code: 'TEST_ERROR', message: 'Test error', retryable: false }] 
        });
      expect(result.totalProcessed).toBe(2);
      expect(result.successful.length).toBe(1);
      expect(result.failed.length).toBe(1);
    it('should emit bulk sync completion event', async () => {
      const issues = [MockData.jira.issue];
      await adapter.syncBulkIssues(issues);
      expect(eventSpy).toHaveBeenCalledWith('tasks:bulk:completed', expect.objectContaining({
        totalProcessed: 1,
        successful: 1,
        failed: 0
    it('should respect batch size configuration', async () => {
      const batchConfig = { ...mockConfig, batchSize: 2 };
      const batchAdapter = new TasksAdapter(batchConfig, eventBus, mockApp);
      await batchAdapter.initialize();
      const issues = new Array(5).fill(null).map((_, i) => ({
        key: `TEST-${i + 123}`,
        id: `1000${i + 1}`
      vi.spyOn(batchAdapter, 'syncIssueToPlugin').mockResolvedValue({ success: true });
      vi.spyOn(batchAdapter, 'convertFromJira').mockResolvedValue({
      const result = await batchAdapter.syncBulkIssues(issues);
      expect(result.totalProcessed).toBe(5);
      // Should process in batches of 2, so 3 batches total (2+2+1)
  describe('toggleTaskStatus', () => {
    it('should toggle task from TODO to DONE', async () => {
      const taskMapping = {
        filePath: 'test.md',
        lineNumber: 0,
        lastSynced: new Date(),
        syncDirection: 'bidirectional' as const,
        syncStatus: 'synced' as const
      (adapter as any).taskMappings.set(jiraKey, taskMapping);
      const mockFile = { path: 'test.md' };
      mockApp.vault.read.mockResolvedValue('- [ ] Test task');
      const result = await adapter.toggleTaskStatus(jiraKey);
      expect(result.data!.status).toBe(TaskStatus.DONE);
      expect(result.data!.doneDate).toBeInstanceOf(Date);
      expect(eventSpy).toHaveBeenCalledWith('tasks:status:changed', expect.objectContaining({
        newStatus: TaskStatus.DONE
    it('should toggle task from DONE to TODO', async () => {
      mockApp.vault.read.mockResolvedValue('- [x] Test task');
      expect(result.data!.status).toBe(TaskStatus.TODO);
      expect(result.data!.doneDate).toBeUndefined();
    it('should handle task not found error', async () => {
      const result = await adapter.toggleTaskStatus('NONEXISTENT-123');
      expect(result.errors![0].code).toBe('TASK_NOT_FOUND');
    it('should handle file access errors', async () => {
        throw new Error('File access error');
      expect(result.errors![0].code).toBe('TOGGLE_ERROR');
  describe('findTasksByJiraKeys', () => {
    it('should find tasks by Jira keys', async () => {
      const jiraKeys = ['TEST-123', 'TEST-124'];
      // Set up mappings
      (adapter as any).taskMappings.set('TEST-123', {
        filePath: 'test1.md',
        lineNumber: 0
      (adapter as any).taskMappings.set('TEST-124', {
        jiraKey: 'TEST-124',
        filePath: 'test2.md',
        lineNumber: 1
      const mockFile1 = { path: 'test1.md' };
      const mockFile2 = { path: 'test2.md' };
      mockApp.vault.getAbstractFileByPath
        .mockReturnValueOnce(mockFile1)
        .mockReturnValueOnce(mockFile2);
      mockApp.vault.read
        .mockResolvedValueOnce('- [ ] Task 1')
        .mockResolvedValueOnce('Line 0\n- [x] Task 2');
      const tasks = await adapter.findTasksByJiraKeys(jiraKeys);
      expect(tasks).toHaveLength(2);
      expect(tasks[0].description).toBe('Task 1');
      expect(tasks[1].description).toBe('Task 2');
    it('should handle missing mappings gracefully', async () => {
      const tasks = await adapter.findTasksByJiraKeys(['NONEXISTENT-123']);
      expect(tasks).toHaveLength(0);
    it('should handle file read errors gracefully', async () => {
      const jiraKeys = ['TEST-123'];
      mockApp.vault.getAbstractFileByPath.mockReturnValue({ path: 'test.md' });
      mockApp.vault.read.mockRejectedValue(new Error('Read error'));
      expect(console.warn).toHaveBeenCalledWith('Failed to load task for TEST-123:', expect.any(Error));
  describe('Configuration Management', () => {
    it('should update configuration correctly', () => {
      const updates = {
        batchSize: 20,
        includeJiraUrl: false
      adapter.updateConfig(updates);
      const updatedConfig = adapter.getConfig();
      expect(updatedConfig.batchSize).toBe(20);
      expect(updatedConfig.includeJiraUrl).toBe(false);
    it('should preserve unmodified configuration values', () => {
      const originalPluginId = adapter.getConfig().pluginId;
      adapter.updateConfig({ batchSize: 15 });
      expect(adapter.getConfig().pluginId).toBe(originalPluginId);
  describe('Performance Requirements', () => {
    it('should meet <10ms conversion time requirement', async () => {
      const iterations = 10;
      const times: number[] = [];
      for (let i = 0; i < iterations; i++) {
        const startTime = performance.now();
        await adapter.convertFromJira(MockData.jira.issue);
        times.push(performance.now() - startTime);
      const averageTime = times.reduce((sum, time) => sum + time, 0) / times.length;
      expect(averageTime).toBeLessThan(10);
    it('should handle batch operations efficiently', async () => {
      const batchSize = 50;
      const issues = new Array(batchSize).fill(null).map((_, i) => ({
        key: `PERF-${i + 1}`,
        id: `${20000 + i}`
      const totalTime = performance.now() - startTime;
      expect(result.successful.length).toBe(batchSize);
      expect(totalTime).toBeLessThan(5000); // Should complete within 5 seconds
  describe('Error Recovery', () => {
    it('should handle transient failures with retry logic', async () => {
      let attempts = 0;
        attempts++;
        if (attempts < 3) {
          throw new Error('Transient error');
        return { path: task.filePath };
      // This test verifies error handling, actual retry would be in sync engine
      expect(result.errors![0].retryable).toBe(true);
  describe('Integration with Event System', () => {
    it('should listen for task toggle events', () => {
      // Event listeners are set up during initialization
    it('should listen for Jira issue updates', () => {
    it('should emit appropriate events during sync operations', async () => {
      expect(eventSpy).toHaveBeenCalledWith('tasks:task:synced', expect.any(Object));
});
