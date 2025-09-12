/**
 * FileWatcher Tests
 * Tests for the advanced file watching capabilities
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { 
  FileWatcher, 
  JiraFileWatcher,
  FileWatcherConfig,
  FileChangeEvent,
  FileChangeHandler,
  BatchChangeHandler
} from '../../src/utils/file-watcher';
import { TFile } from 'obsidian';
import type { Mock, Mocked, MockedFunction } from 'vitest';
// Mock Obsidian modules
vi.mock('obsidian', () => ({
  Plugin: vi.fn(),
  TFile: vi.fn(),
  TFolder: vi.fn(),
  Vault: vi.fn(),
  EventRef: vi.fn()
}));
describe('FileWatcher', () => {
  let fileWatcher: FileWatcher;
  let mockPlugin: any;
  let mockConfig: FileWatcherConfig;
  beforeEach(() => {
    // Setup mock plugin
    mockPlugin = {
      app: {
        vault: {
          on: vi.fn((event, handler) => ({ event, handler })), // Return mock EventRef
        }
      },
      registerEvent: vi.fn()
    };
    // Setup mock config
    mockConfig = {
      debounceDelay: 1000,
      batchProcessingDelay: 2000,
      maxBatchSize: 10,
      watchPatterns: ['**/*.md'],
      ignorePatterns: ['.obsidian/**', '.trash/**'],
      enableBatching: true
    fileWatcher = new FileWatcher(mockPlugin, mockConfig);
    // Mock console methods
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    // Mock timers
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    fileWatcher.stop();
  describe('Constructor and Configuration', () => {
    it('should initialize with default configuration', () => {
      const defaultWatcher = new FileWatcher(mockPlugin);
      
      expect(defaultWatcher).toBeInstanceOf(FileWatcher);
      expect((defaultWatcher as any).config.debounceDelay).toBe(1000);
      expect((defaultWatcher as any).config.watchPatterns).toEqual(['**/*.md']);
    });
    it('should merge custom configuration with defaults', () => {
      const customConfig: Partial<FileWatcherConfig> = {
        debounceDelay: 500,
        watchPatterns: ['*.txt']
      };
      const customWatcher = new FileWatcher(mockPlugin, customConfig);
      const config = (customWatcher as any).config;
      expect(config.debounceDelay).toBe(500);
      expect(config.watchPatterns).toEqual(['*.txt']);
      expect(config.batchProcessingDelay).toBe(2000); // Default value
  describe('Start and Stop', () => {
    it('should start watching and setup event listeners', () => {
      fileWatcher.start();
      expect((fileWatcher as any).isActive).toBe(true);
      expect(mockPlugin.app.vault.on).toHaveBeenCalledTimes(4); // create, modify, delete, rename
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('FileWatcher started'));
    it('should not start if already active', () => {
      expect(mockPlugin.app.vault.on).toHaveBeenCalledTimes(4); // Should only be called once
    it('should stop watching and cleanup', () => {
      fileWatcher.stop();
      expect((fileWatcher as any).isActive).toBe(false);
      expect(console.log).toHaveBeenCalledWith('FileWatcher stopped');
    it('should not stop if already inactive', () => {
      const cleanupSpy = vi.spyOn(fileWatcher as any, 'cleanup');
      expect(cleanupSpy).not.toHaveBeenCalled();
  describe('Handler Management', () => {
    let mockChangeHandler: MockedFunction<FileChangeHandler>;
    let mockBatchHandler: MockedFunction<BatchChangeHandler>;
    beforeEach(() => {
      mockChangeHandler = vi.fn();
      mockBatchHandler = vi.fn();
    it('should add and remove change handlers', () => {
      fileWatcher.addChangeHandler(mockChangeHandler);
      expect((fileWatcher as any).changeHandlers.size).toBe(1);
      fileWatcher.removeChangeHandler(mockChangeHandler);
      expect((fileWatcher as any).changeHandlers.size).toBe(0);
    it('should add and remove batch handlers', () => {
      fileWatcher.addBatchHandler(mockBatchHandler);
      expect((fileWatcher as any).batchHandlers.size).toBe(1);
      fileWatcher.removeBatchHandler(mockBatchHandler);
      expect((fileWatcher as any).batchHandlers.size).toBe(0);
  describe('File Pattern Matching', () => {
    const testCases = [
      { file: 'test.md', pattern: '**/*.md', shouldMatch: true },
      { file: 'folder/test.md', pattern: '**/*.md', shouldMatch: true },
      { file: 'test.txt', pattern: '**/*.md', shouldMatch: false },
      { file: '.obsidian/config.json', pattern: '.obsidian/**', shouldMatch: true },
      { file: 'notes/test.md', pattern: '.obsidian/**', shouldMatch: false },
      { file: 'single.md', pattern: '*.md', shouldMatch: true },
      { file: 'folder/single.md', pattern: '*.md', shouldMatch: false }
    ];
    testCases.forEach(({ file, pattern, shouldMatch }) => {
      it(`should ${shouldMatch ? 'match' : 'not match'} '${file}' with pattern '${pattern}'`, () => {
        const result = (fileWatcher as any).matchesPattern(file, pattern);
        expect(result).toBe(shouldMatch);
      });
  describe('File Watching Logic', () => {
    let mockFile: Partial<TFile>;
      mockFile = {
        path: 'test.md',
        name: 'test.md',
        extension: 'md',
        stat: { 
          size: 1024, 
          mtime: Date.now(), 
          ctime: Date.now() 
      } as Partial<TFile>;
    it('should determine if file should be watched', () => {
      const shouldWatchSpy = vi.spyOn(fileWatcher as any, 'shouldWatchFile');
      (fileWatcher as any).shouldWatchFile(mockFile);
      expect(shouldWatchSpy).toHaveBeenCalledWith(mockFile);
    it('should ignore files matching ignore patterns', () => {
      const obsidianFile = {
        ...mockFile,
        path: '.obsidian/config.json'
      const result = (fileWatcher as any).shouldWatchFile(obsidianFile);
      expect(result).toBe(false);
    it('should watch files matching watch patterns', () => {
      const result = (fileWatcher as any).shouldWatchFile(mockFile);
      expect(result).toBe(true);
    it('should extract file metadata correctly', () => {
      const metadata = (fileWatcher as any).extractFileMetadata(mockFile);
      expect(metadata).toEqual({
        size: 1024,
        mtime: mockFile.stat?.mtime,
        ctime: mockFile.stat?.ctime
  describe('Debouncing', () => {
        stat: { mtime: Date.now(), ctime: Date.now(), size: 1024 }
    it('should debounce rapid file changes', async () => {
      const handleFileEventSpy = vi.spyOn(fileWatcher as any, 'handleFileEvent');
      // Simulate rapid file changes
      (fileWatcher as any).handleFileEvent('modify', mockFile);
      expect(handleFileEventSpy).toHaveBeenCalledTimes(3);
      expect((fileWatcher as any).pendingChanges.size).toBe(1);
      // Fast-forward time to trigger debounce
      vi.advanceTimersByTime(1000);
      await Promise.resolve(); // Allow promises to resolve
      expect(mockChangeHandler).toHaveBeenCalledTimes(1);
    it('should process changes after debounce delay', async () => {
      expect(mockChangeHandler).not.toHaveBeenCalled();
      await Promise.resolve();
  describe('Batching', () => {
      mockBatchHandler = vi.fn().mockResolvedValue(undefined);
    it('should batch changes when enabled', async () => {
      const mockFile = {
        path: 'test1.md',
        name: 'test1.md',
        stat: { mtime: Date.now() }
      const event: FileChangeEvent = {
        type: 'modify',
        file: mockFile as TFile,
        timestamp: Date.now()
      (fileWatcher as any).addToBatch(event);
      expect((fileWatcher as any).currentBatch).toHaveLength(1);
      vi.advanceTimersByTime(2000);
      expect(mockBatchHandler).toHaveBeenCalledWith({
        changes: [event],
        timestamp: expect.any(Number),
        totalSize: 1
    it('should process batch when max size reached', async () => {
      const events = Array.from({ length: 15 }, (_, i) => ({
        type: 'modify' as const,
        file: {
          path: `test${i}.md`,
          name: `test${i}.md`,
          stat: { mtime: Date.now() }
        } as TFile,
      }));
      events.forEach(event => (fileWatcher as any).addToBatch(event));
      // Should process first batch of 10, then second batch after timer
      expect(mockBatchHandler).toHaveBeenCalledTimes(1);
        changes: expect.arrayContaining([expect.any(Object)]),
        totalSize: 10
    it('should disable batching when configured', async () => {
      const noBatchWatcher = new FileWatcher(mockPlugin, {
        ...mockConfig,
        enableBatching: false
      const mockHandler = vi.fn();
      noBatchWatcher.addBatchHandler(mockHandler);
        file: { path: 'test.md' } as TFile,
      (noBatchWatcher as any).addToBatch(event);
      expect(mockHandler).not.toHaveBeenCalled();
  describe('Statistics and Monitoring', () => {
    it('should provide accurate statistics', () => {
      const mockHandler1 = vi.fn().mockResolvedValue(undefined);
      const mockHandler2 = vi.fn().mockResolvedValue(undefined);
      const mockBatchHandler = vi.fn().mockResolvedValue(undefined);
      fileWatcher.addChangeHandler(mockHandler1);
      fileWatcher.addChangeHandler(mockHandler2);
      // Add some tracking data
      (fileWatcher as any).lastModifiedTimes.set('file1.md', Date.now());
      (fileWatcher as any).lastModifiedTimes.set('file2.md', Date.now());
      (fileWatcher as any).pendingChanges.set('file1.md', {} as any);
      const stats = fileWatcher.getStatistics();
      expect(stats).toEqual({
        isActive: false,
        trackedFiles: 2,
        pendingChanges: 1,
        currentBatchSize: 0,
        handlerCounts: {
          changeHandlers: 2,
          batchHandlers: 1
  describe('Flush Pending Changes', () => {
      mockChangeHandler = vi.fn().mockResolvedValue(undefined);
    it('should flush all pending changes immediately', async () => {
      // Add pending changes
      (fileWatcher as any).addToBatch({
        file: mockFile,
      expect((fileWatcher as any).currentBatch.length).toBe(1);
      await fileWatcher.flushPendingChanges();
      expect((fileWatcher as any).pendingChanges.size).toBe(0);
      expect((fileWatcher as any).currentBatch.length).toBe(0);
      expect(mockChangeHandler).toHaveBeenCalled();
});
describe('JiraFileWatcher', () => {
  let jiraWatcher: JiraFileWatcher;
      app: { vault: { on: vi.fn() } },
    jiraWatcher = new JiraFileWatcher(mockPlugin, 'Areas/Work/Jira Tickets');
    
  describe('Jira-specific Configuration', () => {
    it('should initialize with Jira-specific patterns', () => {
      const config = (jiraWatcher as any).config;
      expect(config.watchPatterns).toEqual(['Areas/Work/Jira Tickets/**/*.md']);
      expect(config.debounceDelay).toBe(2000); // Longer debounce for Jira files
      expect(config.batchProcessingDelay).toBe(5000);
      expect(config.maxBatchSize).toBe(20);
    it('should merge custom config with Jira defaults', () => {
      const customJiraWatcher = new JiraFileWatcher(mockPlugin, 'Custom/Path', {
        debounceDelay: 3000,
        maxBatchSize: 5
      const config = (customJiraWatcher as any).config;
      expect(config.watchPatterns).toEqual(['Custom/Path/**/*.md']);
      expect(config.debounceDelay).toBe(3000);
      expect(config.maxBatchSize).toBe(5);
      expect(config.batchProcessingDelay).toBe(5000); // Default Jira value
  describe('Jira File Detection', () => {
      {
        file: { path: 'Areas/Work/Jira Tickets/TEST/TEST-1.md', extension: 'md' },
        expected: true,
        description: 'should identify Jira files in correct path'
        file: { path: 'Areas/Work/Jira Tickets/PROJECT/PROJECT-123.md', extension: 'md' },
        description: 'should identify Jira files with different project keys'
        file: { path: 'Other/Path/TEST-1.md', extension: 'md' },
        expected: false,
        description: 'should not identify files outside Jira path'
        file: { path: 'Areas/Work/Jira Tickets/TEST/TEST-1.txt', extension: 'txt' },
        description: 'should not identify non-markdown files'
      }
    testCases.forEach(({ file, expected, description }) => {
      it(description, () => {
        const result = jiraWatcher.isJiraFile(file as any);
        expect(result).toBe(expected);
  describe('Issue Key Extraction', () => {
        file: { path: 'Areas/Work/Jira Tickets/TEST/TEST-1.md', basename: 'TEST-1' },
        expected: 'TEST-1',
        description: 'should extract issue key from filename'
        file: { path: 'Areas/Work/Jira Tickets/PROJECT/PROJECT-999.md', basename: 'PROJECT-999' },
        expected: 'PROJECT-999',
        description: 'should extract different project keys'
        file: { path: 'Areas/Work/Jira Tickets/ABC/ABC-12345.md', basename: 'ABC-12345' },
        expected: 'ABC-12345',
        description: 'should handle large issue numbers'
        file: { path: 'Areas/Work/Jira Tickets/TEST/invalid-name.md', basename: 'invalid-name' },
        expected: null,
        description: 'should return null for invalid filenames'
        file: { path: 'Other/Path/TEST-1.md', basename: 'TEST-1' },
        description: 'should return null for files outside Jira path'
        const result = jiraWatcher.extractIssueKey(file as any);
  describe('Project Extraction', () => {
      { issueKey: 'TEST-1', expected: 'TEST' },
      { issueKey: 'PROJECT-999', expected: 'PROJECT' },
      { issueKey: 'ABC-12345', expected: 'ABC' },
      { issueKey: 'invalid-key', expected: null },
      { issueKey: 'TEST1', expected: null },
      { issueKey: '', expected: null }
    testCases.forEach(({ issueKey, expected }) => {
      it(`should extract '${expected}' from '${issueKey}'`, () => {
        const result = jiraWatcher.getProject(issueKey);
  describe('Integration with Base FileWatcher', () => {
    it('should inherit all base FileWatcher functionality', () => {
      expect(jiraWatcher).toBeInstanceOf(FileWatcher);
      expect(typeof jiraWatcher.start).toBe('function');
      expect(typeof jiraWatcher.stop).toBe('function');
      expect(typeof jiraWatcher.addChangeHandler).toBe('function');
      expect(typeof jiraWatcher.addBatchHandler).toBe('function');
    it('should use Jira-specific configuration', () => {
      const jiraPath = (jiraWatcher as any).jiraOutputPath;
      expect(jiraPath).toBe('Areas/Work/Jira Tickets');
      expect(config.watchPatterns).toContain('Areas/Work/Jira Tickets/**/*.md');
