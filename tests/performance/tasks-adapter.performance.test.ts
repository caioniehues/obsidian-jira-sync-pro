/**
 * TasksAdapter Performance Tests
 * Verifies <10ms conversion time requirement and overall performance targets
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { TaskFormatConverter } from '../../src/utils/task-format-converter';
import { TasksAdapter } from '../../src/adapters/tasks-adapter';
import { TasksAdapterConfig, TaskStatus, TaskPriority } from '../../src/types/tasks-types';
import { EventBus } from '../../src/events/event-bus';
import { MockData } from '../fixtures/mock-data';
import { JiraIssue } from '../../src/types/jira-types';
import type { Mock, Mocked, MockedFunction } from 'vitest';
// Performance test configuration
const PERFORMANCE_TARGETS = {
  CONVERSION_TIME_MS: 10,
  BULK_SYNC_TIME_MS: 5000,
  THROUGHPUT_ITEMS_PER_SECOND: 100,
  MEMORY_LEAK_THRESHOLD_MB: 50
};
// Mock App interface for performance tests
const mockApp = {
  vault: {
    getAbstractFileByPath: vi.fn().mockReturnValue(null),
    read: vi.fn().mockResolvedValue(''),
    create: vi.fn().mockResolvedValue({ path: 'test.md' }),
    modify: vi.fn().mockResolvedValue(undefined),
    createFolder: vi.fn().mockResolvedValue(undefined),
    configDir: '/test/config',
    adapter: { write: vi.fn().mockResolvedValue(undefined) }
  },
  metadataCache: {},
  plugins: {
    plugins: {
      'obsidian-tasks-plugin': { enabled: true }
    }
  }
} as any;
describe('TasksAdapter Performance Tests', () => {
  let converter: TaskFormatConverter;
  let adapter: TasksAdapter;
  let eventBus: EventBus;
  beforeAll(async () => {
    converter = new TaskFormatConverter();
    eventBus = new EventBus();
    
    const config: TasksAdapterConfig = {
      enabled: true,
      pluginId: 'obsidian-tasks-plugin',
      syncDirection: 'jira-to-plugin',
      batchSize: 50,
      retryAttempts: 3,
      timeout: 5000,
      defaultFilePath: 'Tasks/Performance Test.md',
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
    adapter = new TasksAdapter(config, eventBus, mockApp);
    await adapter.initialize();
  });
  describe('Single Issue Conversion Performance', () => {
    it('should convert single issue within 10ms target', async () => {
      const issue = MockData.jira.issue;
      const iterations = 100;
      const times: number[] = [];
      // Warm up
      for (let i = 0; i < 10; i++) {
        await converter.convertJiraToTask(issue);
      }
      // Measure performance
      for (let i = 0; i < iterations; i++) {
        const startTime = performance.now();
        converter.convertJiraToTask(issue);
        const endTime = performance.now();
        times.push(endTime - startTime);
      const averageTime = times.reduce((sum, time) => sum + time, 0) / times.length;
      const maxTime = Math.max(...times);
      const minTime = Math.min(...times);
      console.log(`Conversion Performance:
        Average: ${averageTime.toFixed(2)}ms
        Min: ${minTime.toFixed(2)}ms
        Max: ${maxTime.toFixed(2)}ms
        Target: <${PERFORMANCE_TARGETS.CONVERSION_TIME_MS}ms`);
      expect(averageTime).toBeLessThan(PERFORMANCE_TARGETS.CONVERSION_TIME_MS);
      expect(maxTime).toBeLessThan(PERFORMANCE_TARGETS.CONVERSION_TIME_MS * 2); // Allow some variance
    });
    it('should maintain performance with complex issues', async () => {
      const complexIssue = {
        ...MockData.jira.issue,
        fields: {
          ...MockData.jira.issue.fields,
          description: 'A'.repeat(5000), // Large description
          labels: Array.from({ length: 20 }, (_, i) => `label-${i}`), // Many labels
          components: Array.from({ length: 10 }, (_, i) => ({ name: `component-${i}` })), // Many components
          customfield_10001: 13,
          customfield_10002: 'Epic Link',
          customfield_10003: { displayName: 'Complex User' },
          customfield_10004: [{ name: 'Version 1.0' }, { name: 'Version 2.0' }]
        }
      };
      const iterations = 50;
        converter.convertJiraToTask(complexIssue);
      console.log(`Complex Issue Conversion Average: ${averageTime.toFixed(2)}ms`);
      expect(averageTime).toBeLessThan(PERFORMANCE_TARGETS.CONVERSION_TIME_MS * 1.5); // Allow 50% more time for complex issues
  describe('Bulk Conversion Performance', () => {
    it('should achieve target throughput for bulk operations', async () => {
      const issueCount = 100;
      const issues = Array.from({ length: issueCount }, (_, i) => ({
        key: `PERF-${i + 1}`,
        id: `perf-${i + 1}`,
          summary: `Performance Test Issue ${i + 1}`
      }));
      const startTime = performance.now();
      
      const results = await Promise.all(
        issues.map(issue => converter.convertJiraToTask(issue))
      );
      const endTime = performance.now();
      const totalTime = endTime - startTime;
      const throughput = (issueCount / totalTime) * 1000; // Items per second
      console.log(`Bulk Conversion Performance:
        Total time: ${totalTime.toFixed(2)}ms
        Throughput: ${throughput.toFixed(2)} items/second
        Target: >${PERFORMANCE_TARGETS.THROUGHPUT_ITEMS_PER_SECOND} items/second`);
      expect(results).toHaveLength(issueCount);
      expect(results.every(r => r.task)).toBe(true);
      expect(throughput).toBeGreaterThan(PERFORMANCE_TARGETS.THROUGHPUT_ITEMS_PER_SECOND);
    it('should handle batch sync within time limit', async () => {
      const batchSize = 25;
      const issues = Array.from({ length: batchSize }, (_, i) => ({
        key: `BATCH-${i + 1}`,
        id: `batch-${i + 1}`
      // Mock successful operations
      vi.spyOn(adapter, 'syncIssueToPlugin').mockImplementation(async () => ({ success: true }));
      vi.spyOn(adapter, 'convertFromJira').mockImplementation(async (issue) => ({
        success: true,
        data: MockData.tasks.taskItem
      const result = await adapter.syncBulkIssues(issues);
      console.log(`Batch Sync Performance:
        Batch size: ${batchSize}
        Average per item: ${(totalTime / batchSize).toFixed(2)}ms
        Target: <${PERFORMANCE_TARGETS.BULK_SYNC_TIME_MS}ms total`);
      expect(result.successful.length).toBe(batchSize);
      expect(totalTime).toBeLessThan(PERFORMANCE_TARGETS.BULK_SYNC_TIME_MS);
  describe('Memory Usage Performance', () => {
    it('should not leak memory during repeated conversions', async () => {
      const iterations = 1000;
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      const initialMemory = process.memoryUsage().heapUsed;
      // Perform many conversions
        const result = converter.convertJiraToTask(issue);
        // Immediately discard result to allow GC
        void result;
        
        if (i % 100 === 0 && global.gc) {
          global.gc();
      // Force final garbage collection
      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = (finalMemory - initialMemory) / 1024 / 1024; // MB
      console.log(`Memory Usage Test:
        Initial: ${(initialMemory / 1024 / 1024).toFixed(2)} MB
        Final: ${(finalMemory / 1024 / 1024).toFixed(2)} MB
        Increase: ${memoryIncrease.toFixed(2)} MB
        Target: <${PERFORMANCE_TARGETS.MEMORY_LEAK_THRESHOLD_MB} MB`);
      expect(memoryIncrease).toBeLessThan(PERFORMANCE_TARGETS.MEMORY_LEAK_THRESHOLD_MB);
  describe('TaskFormatConverter Benchmark', () => {
    it('should meet benchmark performance requirements', async () => {
      const benchmarkIssues = [
        MockData.jira.issue,
        {
          ...MockData.jira.issue,
          key: 'BENCH-2',
          fields: { ...MockData.jira.issue.fields, priority: { name: 'High' } }
        },
          key: 'BENCH-3',
          fields: { ...MockData.jira.issue.fields, status: { name: 'Done' } }
      ];
      const result = await TaskFormatConverter.benchmark(benchmarkIssues, 100);
      console.log(`Benchmark Results:
        Average time: ${result.averageTime.toFixed(2)}ms
        Min time: ${result.minTime.toFixed(2)}ms
        Max time: ${result.maxTime.toFixed(2)}ms
        Total time: ${result.totalTime.toFixed(2)}ms
        Throughput: ${result.throughput.toFixed(2)} items/second`);
      expect(result.averageTime).toBeLessThan(PERFORMANCE_TARGETS.CONVERSION_TIME_MS);
      expect(result.throughput).toBeGreaterThan(PERFORMANCE_TARGETS.THROUGHPUT_ITEMS_PER_SECOND);
  describe('Edge Case Performance', () => {
    it('should handle large descriptions efficiently', () => {
      const largeDescriptionIssue = {
          description: 'Large description '.repeat(1000) // ~17KB description
      const result = converter.convertJiraToTask(largeDescriptionIssue);
      const conversionTime = endTime - startTime;
      console.log(`Large Description Performance: ${conversionTime.toFixed(2)}ms`);
      expect(result.task).toBeDefined();
      expect(conversionTime).toBeLessThan(PERFORMANCE_TARGETS.CONVERSION_TIME_MS * 2);
    it('should handle many tags efficiently', () => {
      const manyTagsIssue = {
          labels: Array.from({ length: 50 }, (_, i) => `tag-${i}`),
          components: Array.from({ length: 20 }, (_, i) => ({ name: `comp-${i}` }))
      const result = converter.convertJiraToTask(manyTagsIssue);
      console.log(`Many Tags Performance: ${conversionTime.toFixed(2)}ms`);
      expect(result.task.tags).toHaveLength(71); // 50 labels + 20 components + 1 Jira key
      expect(conversionTime).toBeLessThan(PERFORMANCE_TARGETS.CONVERSION_TIME_MS * 1.5);
    it('should handle complex Jira markup efficiently', () => {
      const complexMarkupDescription = `
        This is *bold* text and _italic_ text.
        {code:java}
        public class ComplexExample {
          private String field;
          
          public void method() {
            // Complex code with multiple lines
            System.out.println("Hello World");
          }
        {code}
        {quote}
        This is a quote block with multiple lines
        that should be converted properly
        Some more text with +underlined+ and -strikethrough- formatting.
        {noformat}
        Raw text that should not be formatted
        with special characters: *_+-^~
      `;
      const complexMarkupIssue = {
          description: complexMarkupDescription
      const result = converter.convertJiraToTask(complexMarkupIssue);
      console.log(`Complex Markup Performance: ${conversionTime.toFixed(2)}ms`);
      expect(result.task.description).toBeDefined();
      expect(result.task.description).toContain('**bold**');
      expect(result.task.description).toContain('*italic*');
  describe('Concurrent Processing Performance', () => {
    it('should handle concurrent conversions efficiently', async () => {
      const concurrentCount = 20;
      const issuesPerBatch = 10;
      const createBatch = (batchIndex: number) => 
        Array.from({ length: issuesPerBatch }, (_, i) => ({
          key: `CONC-${batchIndex}-${i + 1}`,
          id: `conc-${batchIndex}-${i + 1}`
        }));
      const concurrentPromises = Array.from({ length: concurrentCount }, (_, batchIndex) => {
        const batch = createBatch(batchIndex);
        return Promise.all(batch.map(issue => converter.convertJiraToTask(issue)));
      });
      const results = await Promise.all(concurrentPromises);
      const totalItems = concurrentCount * issuesPerBatch;
      const throughput = (totalItems / totalTime) * 1000;
      console.log(`Concurrent Processing Performance:
        Concurrent batches: ${concurrentCount}
        Items per batch: ${issuesPerBatch}
        Total items: ${totalItems}
        Throughput: ${throughput.toFixed(2)} items/second`);
      expect(results).toHaveLength(concurrentCount);
      expect(results.every(batch => batch.length === issuesPerBatch)).toBe(true);
      expect(results.every(batch => batch.every(result => result.task))).toBe(true);
});
