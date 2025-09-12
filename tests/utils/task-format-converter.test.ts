/**
 * TaskFormatConverter Unit Tests
 * Comprehensive test suite for Jira to Tasks format conversion
 * RED-GREEN-Refactor approach with performance validation
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TaskFormatConverter } from '../../src/utils/task-format-converter';
import { TaskStatus, TaskPriority, TaskConversionOptions } from '../../src/types/tasks-types';
import { JiraIssue } from '../../src/types/jira-types';
import { MockData } from '../fixtures/mock-data';
import type { Mock, Mocked, MockedFunction } from 'vitest';
describe('TaskFormatConverter', () => {
  let converter: TaskFormatConverter;
  let defaultOptions: TaskConversionOptions;
  beforeEach(() => {
    defaultOptions = {
      preserveJiraKey: true,
      includeJiraUrl: true,
      defaultFilePath: 'Tasks/Test.md',
      useJiraDescription: true,
      mapJiraLabelsToTags: true,
      dateFormat: 'YYYY-MM-DD',
      createSubtasks: false,
      subtaskPrefix: '    '
    };
    
    converter = new TaskFormatConverter(defaultOptions);
  });
  describe('Constructor', () => {
    it('should create converter with default options', () => {
      const defaultConverter = new TaskFormatConverter();
      const options = defaultConverter.getOptions();
      
      expect(options.preserveJiraKey).toBe(true);
      expect(options.includeJiraUrl).toBe(true);
      expect(options.defaultFilePath).toBe('Tasks/Jira Issues.md');
      expect(options.useJiraDescription).toBe(true);
      expect(options.mapJiraLabelsToTags).toBe(true);
      expect(options.dateFormat).toBe('YYYY-MM-DD');
    });
    it('should override defaults with provided options', () => {
      const customOptions: TaskConversionOptions = {
        preserveJiraKey: false,
        includeJiraUrl: false,
        defaultFilePath: 'Custom/Path.md'
      };
      const customConverter = new TaskFormatConverter(customOptions);
      const options = customConverter.getOptions();
      expect(options.preserveJiraKey).toBe(false);
      expect(options.includeJiraUrl).toBe(false);
      expect(options.defaultFilePath).toBe('Custom/Path.md');
      // Should still have defaults for unspecified options
    it('should initialize with default status mappings', () => {
      const options = converter.getOptions();
      expect(options.statusMappings.get('To Do')).toBe(TaskStatus.TODO);
      expect(options.statusMappings.get('In Progress')).toBe(TaskStatus.IN_PROGRESS);
      expect(options.statusMappings.get('Done')).toBe(TaskStatus.DONE);
      expect(options.statusMappings.get('Cancelled')).toBe(TaskStatus.CANCELLED);
    it('should initialize with default priority mappings', () => {
      expect(options.priorityMappings.get('High')).toBe(TaskPriority.HIGH);
      expect(options.priorityMappings.get('Medium')).toBe(TaskPriority.NONE);
      expect(options.priorityMappings.get('Low')).toBe(TaskPriority.LOW);
      expect(options.priorityMappings.get('Highest')).toBe(TaskPriority.HIGHEST);
  describe('convertJiraToTask', () => {
    it('should convert basic Jira issue to TaskItem', () => {
      const jiraIssue = MockData.jira.issue;
      const result = converter.convertJiraToTask(jiraIssue);
      expect(result.task).toBeDefined();
      expect(result.task.description).toContain(jiraIssue.fields.summary);
      expect(result.task.status).toBe(TaskStatus.TODO);
      expect(result.task.priority).toBe(TaskPriority.NONE);
      expect(result.task.filePath).toBe(defaultOptions.defaultFilePath);
      expect(result.warnings).toEqual([]);
      expect(result.mappedFields).toContain('status');
      expect(result.mappedFields).toContain('priority');
      expect(result.requiresManualReview).toBe(false);
    it('should map Jira status to correct TaskStatus', () => {
      const testCases = [
        { jiraStatus: 'To Do', expected: TaskStatus.TODO },
        { jiraStatus: 'In Progress', expected: TaskStatus.IN_PROGRESS },
        { jiraStatus: 'Done', expected: TaskStatus.DONE },
        { jiraStatus: 'Cancelled', expected: TaskStatus.CANCELLED },
        { jiraStatus: 'Open', expected: TaskStatus.TODO },
        { jiraStatus: 'Closed', expected: TaskStatus.DONE }
      ];
      testCases.forEach(({ jiraStatus, expected }) => {
        const issue = {
          ...MockData.jira.issue,
          fields: {
            ...MockData.jira.issue.fields,
            status: { name: jiraStatus }
          }
        };
        const result = converter.convertJiraToTask(issue);
        
        expect(result.task.status).toBe(expected);
      });
    it('should map Jira priority to correct TaskPriority', () => {
      const testCases = [
        { jiraPriority: 'Lowest', expected: TaskPriority.LOW },
        { jiraPriority: 'Low', expected: TaskPriority.LOW },
        { jiraPriority: 'Medium', expected: TaskPriority.NONE },
        { jiraPriority: 'High', expected: TaskPriority.HIGH },
        { jiraPriority: 'Highest', expected: TaskPriority.HIGHEST }
      ];
      testCases.forEach(({ jiraPriority, expected }) => {
        const issue = createMockIssue({
          fields: {
            priority: { name: jiraPriority }
          }
        });
        const result = converter.convertJiraToTask(issue);
        expect(result.task.priority).toBe(expected);
      });
    });
    it('should handle due dates correctly', () => {
      const dueDate = '2024-12-31T23:59:59.000Z';
      const issue = {
        ...MockData.jira.issue,
        fields: {
          ...MockData.jira.issue.fields,
          duedate: dueDate
        }
      const result = converter.convertJiraToTask(issue);
      expect(result.task.dueDate).toEqual(new Date(dueDate));
      expect(result.mappedFields).toContain('dueDate');
    it('should handle created dates correctly', () => {
      const createdDate = '2024-01-01T00:00:00.000Z';
          created: createdDate
      expect(result.task.created).toEqual(new Date(createdDate));
      expect(result.mappedFields).toContain('created');
    it('should include Jira URL when configured', () => {
        self: 'https://test.atlassian.net/rest/api/2/issue/10001'
      expect(result.task.description).toContain(`[${issue.key}](https://test.atlassian.net/browse/${issue.key})`);
    it('should exclude Jira URL when configured', () => {
      const converterNoUrl = new TaskFormatConverter({
        ...defaultOptions,
        includeJiraUrl: false
      const result = converterNoUrl.convertJiraToTask(issue);
      expect(result.task.description).not.toContain('https://');
    it('should map Jira labels to tags when configured', () => {
          labels: ['urgent', 'customer-facing', 'bug']
      expect(result.task.tags).toContain('urgent');
      expect(result.task.tags).toContain('customer-facing');
      expect(result.task.tags).toContain('bug');
      expect(result.task.tags).toContain(issue.key); // Jira key should be preserved
      expect(result.mappedFields).toContain('labels');
    it('should map components to tags', () => {
          components: [
            { name: 'Frontend' },
            { name: 'Backend' },
            { name: 'Database' }
          ]
      expect(result.task.tags).toContain('Frontend');
      expect(result.task.tags).toContain('Backend');
      expect(result.task.tags).toContain('Database');
      expect(result.mappedFields).toContain('components');
    it('should convert Jira markup to markdown', () => {
      const description = `This is *bold* text and _italic_ text.
{code:java}
public class Test {
  // code here
}
{code}
{quote}
This is a quote
{quote}`;
          description
      expect(result.task.description).toContain('**bold**');
      expect(result.task.description).toContain('*italic*');
      expect(result.task.description).toContain('```java');
      expect(result.task.description).toContain('> This is a quote');
    it('should handle missing fields gracefully', () => {
      const issueWithMissingFields = {
          summary: 'Test Issue'
          // Missing status, priority, description, etc.
      const result = converter.convertJiraToTask(issueWithMissingFields);
      expect(result.task.description).toBe('Test Issue');
      expect(result.task.status).toBe(TaskStatus.TODO); // Default
      expect(result.task.priority).toBe(TaskPriority.NONE); // Default
    it('should track unmapped fields', () => {
      const issueWithCustomFields = {
          customfield_10001: 'Custom value',
          customfield_10002: 'Another custom',
          assignee: { displayName: 'John Doe' },
          fixVersions: [{ name: '1.0' }]
      const result = converter.convertJiraToTask(issueWithCustomFields);
      expect(result.unmappedFields).toContain('customfield_10001');
      expect(result.unmappedFields).toContain('customfield_10002');
      expect(result.unmappedFields).toContain('assignee');
      expect(result.unmappedFields).toContain('fixVersions');
    it('should flag manual review when critical fields are unmapped', () => {
      const issueWithCriticalFields = {
          parent: { key: 'PARENT-123' },
          epic: { key: 'EPIC-456' }
      };
      const result = converter.convertJiraToTask(issueWithCriticalFields);
      expect(result.requiresManualReview).toBe(true);
    });
    it('should generate markdown originalMarkdown field', () => {
      const result = converter.convertJiraToTask(MockData.jira.issue);
      expect(result.task.originalMarkdown).toMatch(/^- \[ \]/); // Should start with task format
      expect(result.task.originalMarkdown).toContain(result.task.description);
    });
    it('should extract heading from project name', () => {
      const issueWithProject = {
        ...MockData.jira.issue,
        fields: {
          ...MockData.jira.issue.fields,
          project: { name: 'My Project', key: 'MP' }
        }
      };
      const result = converter.convertJiraToTask(issueWithProject);
      expect(result.task.heading).toBe('## My Project');
    it('should meet <10ms performance requirement', () => {
      const iterations = 100;
      const times: number[] = [];
      for (let i = 0; i < iterations; i++) {
        const startTime = performance.now();
        converter.convertJiraToTask(MockData.jira.issue);
        const endTime = performance.now();
        times.push(endTime - startTime);
      }
      const averageTime = times.reduce((sum, time) => sum + time, 0) / times.length;
      expect(averageTime).toBeLessThan(10);
    it('should warn about slow conversions', () => {
      // Mock performance.now to simulate slow conversion
      const originalNow = performance.now;
      let callCount = 0;
      performance.now = vi.fn().mockImplementation(() => {
        callCount++;
        return callCount === 1 ? 0 : 15; // 15ms conversion time
      expect(result.warnings).toContain(expect.stringMatching(/Conversion took \d+\.\d+ms \(target: <10ms\)/));
      performance.now = originalNow;
    it('should handle conversion errors gracefully', () => {
      const invalidIssue = {
        fields: null
      };
      expect(() => converter.convertJiraToTask(invalidIssue as any)).toThrow();
    });
  describe('convertTaskToJira', () => {
    it('should convert TaskItem back to Jira format', () => {
      const task = MockData.tasks.taskItem;
      const result = converter.convertTaskToJira(task);
      expect(result.fields).toBeDefined();
    });
    it('should reverse map TaskStatus to Jira status', () => {
      const testCases = [
        { taskStatus: TaskStatus.TODO, expected: 'To Do' },
        { taskStatus: TaskStatus.IN_PROGRESS, expected: 'In Progress' },
        { taskStatus: TaskStatus.DONE, expected: 'Done' },
        { taskStatus: TaskStatus.CANCELLED, expected: 'Cancelled' }
      ];
      testCases.forEach(({ taskStatus, expected }) => {
        const task = {
          ...MockData.tasks.taskItem,
          status: taskStatus
        };
        const result = converter.convertTaskToJira(task);
        expect(result.fields!.status).toEqual({ name: expected });
      });
    });
    it('should reverse map TaskPriority to Jira priority', () => {
      const testCases = [
        { taskPriority: TaskPriority.LOW, expected: 'Low' },
        { taskPriority: TaskPriority.NONE, expected: 'Medium' },
        { taskPriority: TaskPriority.HIGH, expected: 'High' },
        { taskPriority: TaskPriority.HIGHEST, expected: 'Highest' }
      ];
      testCases.forEach(({ taskPriority, expected }) => {
        const task = {
          ...MockData.tasks.taskItem,
          priority: taskPriority
        };
        const result = converter.convertTaskToJira(task);
        expect(result.fields!.priority).toEqual({ name: expected });
      });
    });
    it('should convert due dates to Jira format', () => {
      const dueDate = new Date('2024-12-31T23:59:59.000Z');
      const task = {
        ...MockData.tasks.taskItem,
        dueDate
      };
      const result = converter.convertTaskToJira(task);
      expect(result.fields!.duedate).toBe(dueDate.toISOString());
    });
    it('should extract labels from tags', () => {
      const task = {
        ...MockData.tasks.taskItem,
        tags: ['urgent', 'bug', 'TEST-123', 'frontend']
      };
      const result = converter.convertTaskToJira(task);
      expect(result.fields!.labels).toEqual(['urgent', 'bug', 'frontend']);
      // Should exclude Jira key (TEST-123)
      expect(result.fields!.labels).not.toContain('TEST-123');
    });
    it('should handle tasks without optional fields', () => {
      const minimalTask = {
        ...MockData.tasks.taskItem,
        dueDate: undefined,
        tags: undefined,
        priority: TaskPriority.NONE
      };
      const result = converter.convertTaskToJira(minimalTask);
      expect(result.fields!.duedate).toBeUndefined();
      expect(result.fields!.labels).toBeUndefined();
    });
  });
  describe('formatTaskAsMarkdown', () => {
    it('should format basic task correctly', () => {
      const markdown = converter.formatTaskAsMarkdown(task);
      expect(markdown).toMatch(/^- \[[ x\/\-]\]/);
      expect(markdown).toContain(task.description);
    it('should include priority when present', () => {
        priority: TaskPriority.HIGH
      const markdown = converter.formatTaskAsMarkdown(task, { includePriority: true });
      expect(markdown).toContain('⏫');
    it('should exclude priority when configured', () => {
      const markdown = converter.formatTaskAsMarkdown(task, { includePriority: false });
      expect(markdown).not.toContain('⏫');
    it('should include due date with correct emoji', () => {
        dueDate: new Date('2024-12-31')
      expect(markdown).toContain('📅 2024-12-31');
    it('should include created date when configured', () => {
        created: new Date('2024-01-01')
      const markdown = converter.formatTaskAsMarkdown(task, { includeCreated: true });
      expect(markdown).toContain('➕ 2024-01-01');
    it('should include scheduled date when present', () => {
        scheduledDate: new Date('2024-06-15')
      const markdown = converter.formatTaskAsMarkdown(task, { includeScheduled: true });
      expect(markdown).toContain('⏰ 2024-06-15');
    it('should include start date when present', () => {
        startDate: new Date('2024-06-01')
      const markdown = converter.formatTaskAsMarkdown(task, { includeStart: true });
      expect(markdown).toContain('🛫 2024-06-01');
    it('should include done date when present', () => {
        doneDate: new Date('2024-06-30')
      const markdown = converter.formatTaskAsMarkdown(task, { includeDone: true });
      expect(markdown).toContain('✅ 2024-06-30');
    it('should include cancelled date when present', () => {
        cancelledDate: new Date('2024-06-30')
      const markdown = converter.formatTaskAsMarkdown(task, { includeCancelled: true });
      expect(markdown).toContain('❌ 2024-06-30');
    it('should include tags with hash prefix', () => {
        tags: ['urgent', 'bug', 'frontend']
      expect(markdown).toContain('#urgent');
      expect(markdown).toContain('#bug');
      expect(markdown).toContain('#frontend');
    it('should format different task statuses correctly', () => {
      const statuses = [
        { status: TaskStatus.TODO, expected: '[ ]' },
        { status: TaskStatus.IN_PROGRESS, expected: '[/]' },
        { status: TaskStatus.DONE, expected: '[x]' },
        { status: TaskStatus.CANCELLED, expected: '[-]' }
      statuses.forEach(({ status, expected }) => {
          status
        const markdown = converter.formatTaskAsMarkdown(task);
        expect(markdown).toContain(expected);
  describe('parseTaskLine', () => {
    it('should parse basic task line correctly', () => {
      const line = '- [ ] Test task';
      const result = converter.parseTaskLine(line);
      expect(result).not.toBeNull();
      expect(result!.status).toBe(' ');
      expect(result!.description).toBe('Test task');
      expect(result!.tags).toEqual([]);
    it('should parse task with priority', () => {
      const line = '- [ ] ⏫ High priority task';
      expect(result!.priority).toBe('⏫');
      expect(result!.description).toBe('High priority task');
    it('should parse task with due date', () => {
      const line = '- [ ] Task with due date 📅 2024-12-31';
      expect(result!.due).toBe('2024-12-31');
      expect(result!.description).toBe('Task with due date');
    it('should parse task with multiple tags', () => {
      const line = '- [ ] Tagged task #urgent #bug #frontend';
      expect(result!.tags).toEqual(['urgent', 'bug', 'frontend']);
      expect(result!.description).toBe('Tagged task');
    it('should parse task with all date types', () => {
      const line = '- [x] Complex task ➕ 2024-01-01 ⏰ 2024-06-01 🛫 2024-06-01 📅 2024-06-30 ✅ 2024-06-30';
      expect(result!.created).toBe('2024-01-01');
      expect(result!.scheduled).toBe('2024-06-01');
      expect(result!.start).toBe('2024-06-01');
      expect(result!.due).toBe('2024-06-30');
      expect(result!.done).toBe('2024-06-30');
      expect(result!.description).toBe('Complex task');
    it('should handle indented tasks', () => {
      const line = '    - [ ] Indented task';
      const result = converter.parseTaskLine(line);
      expect(result!.prefix).toBe('    ');
      expect(result!.description).toBe('Indented task');
    });
    it('should return null for non-task lines', () => {
      const nonTaskLines = [
        'This is just text',
        '# This is a heading',
        '- This is a regular list item',
        '1. This is a numbered list'
      ];
      nonTaskLines.forEach(line => {
        const result = converter.parseTaskLine(line);
        expect(result).toBeNull();
    it('should handle malformed task lines gracefully', () => {
      const malformedLines = [
        '- []',  // Missing space after ]
        '- [ ]', // Missing description
        '-[ ] Task', // Missing space after -
        '- [?] Invalid status'
      malformedLines.forEach(line => {
        expect(() => converter.parseTaskLine(line)).not.toThrow();
  describe('updateOptions', () => {
    it('should update conversion options', () => {
      const updates: Partial<TaskConversionOptions> = {
        defaultFilePath: 'New/Path.md',
        dateFormat: 'MM/DD/YYYY'
      converter.updateOptions(updates);
      expect(options.defaultFilePath).toBe('New/Path.md');
      expect(options.dateFormat).toBe('MM/DD/YYYY');
      // Should preserve unchanged options
    it('should update status mappings', () => {
      const newStatusMappings = new Map([
        ['Custom Status', TaskStatus.IN_PROGRESS]
      ]);
      converter.updateOptions({ statusMappings: newStatusMappings });
      expect(options.statusMappings.get('Custom Status')).toBe(TaskStatus.IN_PROGRESS);
  describe('Performance Benchmarking', () => {
    it('should have benchmark method available', () => {
      expect(TaskFormatConverter.benchmark).toBeDefined();
      expect(typeof TaskFormatConverter.benchmark).toBe('function');
    it('should run benchmark and return performance metrics', async () => {
      const issues = [MockData.jira.issue];
      const iterations = 10;
      const result = await TaskFormatConverter.benchmark(issues, iterations);
      expect(result).toHaveProperty('averageTime');
      expect(result).toHaveProperty('minTime');
      expect(result).toHaveProperty('maxTime');
      expect(result).toHaveProperty('totalTime');
      expect(result).toHaveProperty('throughput');
      expect(result.averageTime).toBeGreaterThan(0);
      expect(result.minTime).toBeLessThanOrEqual(result.averageTime);
      expect(result.maxTime).toBeGreaterThanOrEqual(result.averageTime);
      expect(result.throughput).toBeGreaterThan(0);
    it('should meet performance targets in benchmark', async () => {
      const issues = Array(10).fill(MockData.jira.issue);
      const iterations = 5;
      // Should convert at least 1000 items per second
      expect(result.throughput).toBeGreaterThan(1000);
      // Average time should be well under 10ms
      expect(result.averageTime).toBeLessThan(10);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle issues with null/undefined fields', () => {
      const issueWithNulls = {
        ...createMockIssue(),
        fields: {
          summary: 'Test',
          status: null,
          priority: null,
          duedate: null,
          labels: null,
          components: null
        }
      };
      expect(() => converter.convertJiraToTask(issueWithNulls as any)).not.toThrow();
      const result = converter.convertJiraToTask(issueWithNulls as any);
      expect(result.task).toBeDefined();
    });

    it('should handle empty strings in fields', () => {
      const issueWithEmptyStrings = {
        ...createMockIssue(),
        fields: {
          summary: '',
          description: '',
          status: { name: '' },
          priority: { name: '' }
        }
      };
      const result = converter.convertJiraToTask(issueWithEmptyStrings);
      expect(result.task.description).toBe(MockData.jira.issue.key); // Falls back to key
      expect(result.task.status).toBe(TaskStatus.TODO); // Default mapping
    });

    it('should handle very long descriptions', () => {
      const longDescription = 'A'.repeat(10000);
      const issueWithLongDescription = {
        ...MockData.jira.issue,
        fields: {
          ...MockData.jira.issue.fields,
          description: longDescription
        }
      };
      expect(() => converter.convertJiraToTask(issueWithLongDescription)).not.toThrow();
      const result = converter.convertJiraToTask(issueWithLongDescription);
      expect(result.task.description.length).toBeGreaterThan(1000);
    });

    it('should handle invalid date formats gracefully', () => {
      const issueWithInvalidDates = {
        ...createMockIssue(),
        fields: {
          ...createMockIssue().fields,
          duedate: 'invalid-date',
          created: 'not-a-date'
        }
      };
      const result = converter.convertJiraToTask(issueWithInvalidDates as any);
      expect(result.task.dueDate).toBeUndefined();
      expect(result.task.created).toBeUndefined();
    });
    it('should preserve data integrity through round-trip conversion', () => {
      const originalIssue = MockData.jira.issue;
      // Convert to task
      const taskResult = converter.convertJiraToTask(originalIssue);
      expect(taskResult.success).toBe(true);
      // Convert back to Jira
      const jiraResult = converter.convertTaskToJira(taskResult.task);
      // Verify key data is preserved
      expect(jiraResult.fields!.status?.name).toBe('To Do');
      expect(jiraResult.fields!.priority?.name).toBe('Medium');
    });
  });
});
