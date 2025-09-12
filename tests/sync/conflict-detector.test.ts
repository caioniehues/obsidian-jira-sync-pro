/**
 * Comprehensive Test Suite for ConflictDetector
 *
 * Tests all conflict detection functionality including:
 * - Timestamp-based conflict detection
 * - Field-level conflict analysis
 * - Different conflict types (concurrent edits, deleted items, etc.)
 * - Resolution strategies
 * - Performance under various scenarios
 *
 * RED-GREEN-Refactor: All tests written to fail first, then implemented
 * No mocks - using real implementations for reliable testing
 */

import { vi } from 'vitest';
import {
  ConflictDetector,
  ConflictInfo,
} from '../../src/sync/conflict-detector';
import { SyncConflict } from '../../src/sync/sync-engine';
import {
  MockData,
  createMockJiraIssue,
  createMockBaseRecord,
} from '../fixtures/mock-data';
import { JiraIssue } from '../../src/types/jira-types';
import { BaseRecord } from '../../src/types/base-types';

describe('ConflictDetector', () => {
  let conflictDetector: ConflictDetector;
  let testStartTime: number;

  beforeEach(() => {
    testStartTime = Date.now();
    conflictDetector = new ConflictDetector();
  });

  afterEach(() => {
    const testDuration = Date.now() - testStartTime;
    console.log(`Test completed in ${testDuration}ms`);
  });

  describe('Basic Conflict Detection', () => {
    test('should detect no conflict when timestamps are identical', () => {
      const localMeta = {
        jiraKey: 'TEST-123',
        title: 'Same Title',
        updated: '2024-01-15T10:00:00.000Z',
      };

      const remoteIssue = createMockJiraIssue({
        key: 'TEST-123',
        fields: {
          ...MockData.jira.issue.fields,
          summary: 'Same Title',
          updated: '2024-01-15T10:00:00.000Z',
        },
      });

      const localTimestamp = new Date('2024-01-15T10:00:00.000Z').getTime();
      const remoteTimestamp = new Date('2024-01-15T10:00:00.000Z').getTime();

      const conflict = conflictDetector.detectConflict(
        localMeta,
        remoteIssue,
        localTimestamp,
        remoteTimestamp
      );

      expect(conflict).toBeNull();
    });

    test('should detect no conflict when local is older than remote', () => {
      const localMeta = {
        jiraKey: 'TEST-123',
        title: 'Local Title',
        updated: '2024-01-15T09:00:00.000Z',
      };

      const remoteIssue = createMockJiraIssue({
        key: 'TEST-123',
        fields: {
          ...MockData.jira.issue.fields,
          summary: 'Remote Title',
          updated: '2024-01-15T10:00:00.000Z',
        },
      });

      const localTimestamp = new Date('2024-01-15T09:00:00.000Z').getTime();
      const remoteTimestamp = new Date('2024-01-15T10:00:00.000Z').getTime();

      const conflict = conflictDetector.detectConflict(
        localMeta,
        remoteIssue,
        localTimestamp,
        remoteTimestamp
      );

      expect(conflict).toBeNull();
    });

    test('should detect no conflict when remote is older than local', () => {
      const localMeta = {
        jiraKey: 'TEST-123',
        title: 'Local Title',
        updated: '2024-01-15T10:00:00.000Z',
      };

      const remoteIssue = createMockJiraIssue({
        key: 'TEST-123',
        fields: {
          ...MockData.jira.issue.fields,
          summary: 'Remote Title',
          updated: '2024-01-15T09:00:00.000Z',
        },
      });

      const localTimestamp = new Date('2024-01-15T10:00:00.000Z').getTime();
      const remoteTimestamp = new Date('2024-01-15T09:00:00.000Z').getTime();

      const conflict = conflictDetector.detectConflict(
        localMeta,
        remoteIssue,
        localTimestamp,
        remoteTimestamp
      );

      expect(conflict).toBeNull();
    });

    test('should detect concurrent edit conflict', () => {
      const now = Date.now();
      const conflictWindow = 5000; // 5 seconds

      const localMeta = {
        jiraKey: 'TEST-123',
        title: 'Local Title',
        updated: new Date(now).toISOString(),
      };

      const remoteIssue = createMockJiraIssue({
        key: 'TEST-123',
        fields: {
          ...MockData.jira.issue.fields,
          summary: 'Remote Title',
          updated: new Date(now + 2000).toISOString(), // 2 seconds later
        },
      });

      const conflict = conflictDetector.detectConflict(
        localMeta,
        remoteIssue,
        now,
        now + 2000
      );

      expect(conflict).not.toBeNull();
      expect(conflict!.conflictType).toBe('CONCURRENT_EDIT');
      expect(conflict!.issueKey).toBe('TEST-123');
      expect(conflict!.field).toBe('summary');
      expect(conflict!.localValue).toBe('Local Title');
      expect(conflict!.remoteValue).toBe('Remote Title');
    });

    test('should detect multiple field conflicts', () => {
      const now = Date.now();

      const localMeta = {
        jiraKey: 'TEST-123',
        title: 'Local Title',
        priority: 'High',
        assignee: 'Local User',
        updated: new Date(now).toISOString(),
      };

      const remoteIssue = createMockJiraIssue({
        key: 'TEST-123',
        fields: {
          ...MockData.jira.issue.fields,
          summary: 'Remote Title',
          priority: { name: 'Low' },
          assignee: { displayName: 'Remote User' },
          updated: new Date(now + 1000).toISOString(),
        },
      });

      const conflicts = conflictDetector.detectAllConflicts(
        localMeta,
        remoteIssue,
        now,
        now + 1000
      );

      expect(conflicts).toHaveLength(3);

      const summaryConflict = conflicts.find(c => c.field === 'summary');
      expect(summaryConflict).toBeDefined();
      expect(summaryConflict!.localValue).toBe('Local Title');
      expect(summaryConflict!.remoteValue).toBe('Remote Title');

      const priorityConflict = conflicts.find(c => c.field === 'priority');
      expect(priorityConflict).toBeDefined();
      expect(priorityConflict!.localValue).toBe('High');
      expect(priorityConflict!.remoteValue).toBe('Low');

      const assigneeConflict = conflicts.find(c => c.field === 'assignee');
      expect(assigneeConflict).toBeDefined();
      expect(assigneeConflict!.localValue).toBe('Local User');
      expect(assigneeConflict!.remoteValue).toBe('Remote User');
    });
  });

  describe('Conflict Types', () => {
    test('should detect concurrent edit conflicts within time window', () => {
      const baseTime = Date.now();
      const conflictWindow = conflictDetector.getConflictTimeWindow();

      const localMeta = { jiraKey: 'TEST-123', title: 'Local Version' };
      const remoteIssue = createMockJiraIssue({
        fields: { ...MockData.jira.issue.fields, summary: 'Remote Version' },
      });

      // Within conflict window
      const conflict = conflictDetector.detectConflict(
        localMeta,
        remoteIssue,
        baseTime,
        baseTime + conflictWindow - 1000 // 1 second before window expires
      );

      expect(conflict).not.toBeNull();
      expect(conflict!.conflictType).toBe('CONCURRENT_EDIT');
    });

    test('should not detect conflict outside time window', () => {
      const baseTime = Date.now();
      const conflictWindow = conflictDetector.getConflictTimeWindow();

      const localMeta = { jiraKey: 'TEST-123', title: 'Local Version' };
      const remoteIssue = createMockJiraIssue({
        fields: { ...MockData.jira.issue.fields, summary: 'Remote Version' },
      });

      // Outside conflict window
      const conflict = conflictDetector.detectConflict(
        localMeta,
        remoteIssue,
        baseTime,
        baseTime + conflictWindow + 1000 // 1 second after window expires
      );

      expect(conflict).toBeNull();
    });

    test('should detect deleted item conflicts', () => {
      const localMeta = {
        jiraKey: 'TEST-123',
        title: 'Existing Item',
        status: 'In Progress',
      };

      // Remote issue is null/undefined (deleted)
      const conflict = conflictDetector.detectDeletedItemConflict(
        localMeta,
        null,
        Date.now(),
        Date.now()
      );

      expect(conflict).not.toBeNull();
      expect(conflict!.conflictType).toBe('DELETED_REMOTE');
      expect(conflict!.issueKey).toBe('TEST-123');
    });

    test('should detect field type conflicts', () => {
      const localMeta = {
        jiraKey: 'TEST-123',
        priority: 'High', // String value
        storyPoints: '8', // String representation of number
      };

      const remoteIssue = createMockJiraIssue({
        fields: {
          ...MockData.jira.issue.fields,
          priority: { name: 'High', id: '1' }, // Object value
          customfield_10001: 8, // Numeric value
        },
      });

      const conflicts = conflictDetector.detectTypeConflicts(
        localMeta,
        remoteIssue
      );

      expect(conflicts).toHaveLength(2);

      const priorityConflict = conflicts.find(c => c.field === 'priority');
      expect(priorityConflict).toBeDefined();
      expect(priorityConflict!.conflictType).toBe('TYPE_MISMATCH');

      const storyPointsConflict = conflicts.find(
        c => c.field === 'storyPoints'
      );
      expect(storyPointsConflict).toBeDefined();
      expect(storyPointsConflict!.conflictType).toBe('TYPE_MISMATCH');
    });

    test('should detect schema version conflicts', () => {
      const localMeta = {
        jiraKey: 'TEST-123',
        schemaVersion: '1.0',
        newField: 'New Value', // Field that doesn't exist in remote
      };

      const remoteIssue = createMockJiraIssue({
        fields: {
          ...MockData.jira.issue.fields,
          deprecatedField: 'Old Value', // Field that doesn't exist in local
        },
      });

      const conflicts = conflictDetector.detectSchemaConflicts(
        localMeta,
        remoteIssue
      );

      expect(conflicts).toHaveLength(2);

      const newFieldConflict = conflicts.find(c => c.field === 'newField');
      expect(newFieldConflict).toBeDefined();
      expect(newFieldConflict!.conflictType).toBe('SCHEMA_MISMATCH');

      const deprecatedFieldConflict = conflicts.find(
        c => c.field === 'deprecatedField'
      );
      expect(deprecatedFieldConflict).toBeDefined();
      expect(deprecatedFieldConflict!.conflictType).toBe('SCHEMA_MISMATCH');
    });
  });

  describe('Field-Level Analysis', () => {
    test('should compare string fields accurately', () => {
      const result = conflictDetector.compareFieldValues(
        'Test Title',
        'Test Title'
      );
      expect(result.hasConflict).toBe(false);

      const conflict = conflictDetector.compareFieldValues(
        'Local Title',
        'Remote Title'
      );
      expect(conflict.hasConflict).toBe(true);
      expect(conflict.localValue).toBe('Local Title');
      expect(conflict.remoteValue).toBe('Remote Title');
    });

    test('should compare numeric fields with tolerance', () => {
      // Exact match
      const exact = conflictDetector.compareFieldValues(8, 8);
      expect(exact.hasConflict).toBe(false);

      // Within tolerance (default 0.01)
      const withinTolerance = conflictDetector.compareFieldValues(8.001, 8.002);
      expect(withinTolerance.hasConflict).toBe(false);

      // Outside tolerance
      const outsideTolerance = conflictDetector.compareFieldValues(8, 9);
      expect(outsideTolerance.hasConflict).toBe(true);
    });

    test('should compare date fields with precision', () => {
      const date1 = new Date('2024-01-15T10:00:00.000Z');
      const date2 = new Date('2024-01-15T10:00:00.000Z');
      const date3 = new Date('2024-01-15T11:00:00.000Z');

      const same = conflictDetector.compareFieldValues(date1, date2);
      expect(same.hasConflict).toBe(false);

      const different = conflictDetector.compareFieldValues(date1, date3);
      expect(different.hasConflict).toBe(true);
    });

    test('should compare array fields element-wise', () => {
      const array1 = ['backend', 'api', 'critical'];
      const array2 = ['backend', 'api', 'critical'];
      const array3 = ['frontend', 'ui', 'enhancement'];

      const same = conflictDetector.compareFieldValues(array1, array2);
      expect(same.hasConflict).toBe(false);

      const different = conflictDetector.compareFieldValues(array1, array3);
      expect(different.hasConflict).toBe(true);
    });

    test('should compare object fields recursively', () => {
      const obj1 = { name: 'High', id: '1' };
      const obj2 = { name: 'High', id: '1' };
      const obj3 = { name: 'Low', id: '2' };

      const same = conflictDetector.compareFieldValues(obj1, obj2);
      expect(same.hasConflict).toBe(false);

      const different = conflictDetector.compareFieldValues(obj1, obj3);
      expect(different.hasConflict).toBe(true);
    });

    test('should handle null and undefined values', () => {
      const nullVsUndefined = conflictDetector.compareFieldValues(
        null,
        undefined
      );
      expect(nullVsUndefined.hasConflict).toBe(false); // Both represent "empty"

      const nullVsValue = conflictDetector.compareFieldValues(null, 'value');
      expect(nullVsValue.hasConflict).toBe(true);

      const undefinedVsValue = conflictDetector.compareFieldValues(
        undefined,
        'value'
      );
      expect(undefinedVsValue.hasConflict).toBe(true);
    });
  });

  describe('Conflict Resolution Strategies', () => {
    test('should suggest resolution based on timestamp priority', () => {
      const now = Date.now();
      const conflict: SyncConflict = {
        issueKey: 'TEST-123',
        field: 'summary',
        localValue: 'Local Title',
        remoteValue: 'Remote Title',
        localTimestamp: now,
        remoteTimestamp: now + 1000, // Remote is newer
        conflictType: 'CONCURRENT_EDIT',
      };

      const resolution = conflictDetector.suggestResolution(conflict);

      expect(resolution.strategy).toBe('USE_REMOTE');
      expect(resolution.reason).toContain('Remote version is more recent');
      expect(resolution.confidence).toBeGreaterThan(0.7); // High confidence for clear timestamp difference
    });

    test('should suggest resolution based on content length', () => {
      const now = Date.now();
      const conflict: SyncConflict = {
        issueKey: 'TEST-123',
        field: 'description',
        localValue: 'Short local description',
        remoteValue:
          'This is a much longer and more detailed remote description with additional information',
        localTimestamp: now,
        remoteTimestamp: now + 100, // Very close timestamps
        conflictType: 'CONCURRENT_EDIT',
      };

      const resolution = conflictDetector.suggestResolution(conflict);

      expect(resolution.strategy).toBe('USE_REMOTE');
      expect(resolution.reason).toContain('more comprehensive');
    });

    test('should suggest manual resolution for complex conflicts', () => {
      const now = Date.now();
      const conflict: SyncConflict = {
        issueKey: 'TEST-123',
        field: 'customData',
        localValue: { type: 'local', data: [1, 2, 3] },
        remoteValue: { type: 'remote', data: [4, 5, 6] },
        localTimestamp: now,
        remoteTimestamp: now + 50, // Very close timestamps
        conflictType: 'CONCURRENT_EDIT',
      };

      const resolution = conflictDetector.suggestResolution(conflict);

      expect(resolution.strategy).toBe('MANUAL_REVIEW');
      expect(resolution.confidence).toBeLessThan(0.5); // Low confidence
    });

    test('should generate merge suggestions for compatible changes', () => {
      const now = Date.now();
      const conflict: SyncConflict = {
        issueKey: 'TEST-123',
        field: 'labels',
        localValue: ['backend', 'api'],
        remoteValue: ['api', 'critical'],
        localTimestamp: now,
        remoteTimestamp: now + 100,
        conflictType: 'CONCURRENT_EDIT',
      };

      const resolution = conflictDetector.suggestResolution(conflict);

      expect(resolution.strategy).toBe('MERGE');
      expect(resolution.mergedValue).toEqual(['backend', 'api', 'critical']); // Union of arrays
    });
  });

  describe('Conflict Metadata and Context', () => {
    test('should provide detailed conflict information', () => {
      const now = Date.now();
      const localMeta = {
        jiraKey: 'TEST-123',
        title: 'Local Title',
        lastModifiedBy: 'local-user',
        updated: new Date(now).toISOString(),
      };

      const remoteIssue = createMockJiraIssue({
        key: 'TEST-123',
        fields: {
          ...MockData.jira.issue.fields,
          summary: 'Remote Title',
          updated: new Date(now + 1000).toISOString(),
        },
      });

      const conflict = conflictDetector.detectConflict(
        localMeta,
        remoteIssue,
        now,
        now + 1000
      );

      expect(conflict).not.toBeNull();
      expect(conflict!.issueKey).toBe('TEST-123');
      expect(conflict!.field).toBe('summary');
      expect(conflict!.localTimestamp).toBe(now);
      expect(conflict!.remoteTimestamp).toBe(now + 1000);
      expect(conflict!.conflictType).toBe('CONCURRENT_EDIT');
    });

    test('should track conflict detection statistics', () => {
      const conflicts: SyncConflict[] = [];

      // Generate multiple conflicts
      for (let i = 1; i <= 10; i++) {
        const conflict = conflictDetector.detectConflict(
          { jiraKey: `TEST-${i}`, title: `Local ${i}` },
          createMockJiraIssue({
            key: `TEST-${i}`,
            fields: { ...MockData.jira.issue.fields, summary: `Remote ${i}` },
          }),
          Date.now(),
          Date.now() + 1000
        );

        if (conflict) conflicts.push(conflict);
      }

      const stats = conflictDetector.getConflictStatistics();

      expect(stats.totalConflictsDetected).toBeGreaterThanOrEqual(10);
      expect(stats.conflictsByType.CONCURRENT_EDIT).toBeGreaterThanOrEqual(10);
      expect(stats.conflictsByField.summary).toBeGreaterThanOrEqual(10);
    });

    test('should provide conflict history for issue', () => {
      const issueKey = 'TEST-HISTORY';

      // Create multiple conflicts for same issue over time
      const conflicts = [
        conflictDetector.detectConflict(
          { jiraKey: issueKey, title: 'Version 1' },
          createMockJiraIssue({
            key: issueKey,
            fields: {
              ...MockData.jira.issue.fields,
              summary: 'Version 1 Remote',
            },
          }),
          Date.now() - 3000,
          Date.now() - 2900
        ),
        conflictDetector.detectConflict(
          { jiraKey: issueKey, title: 'Version 2' },
          createMockJiraIssue({
            key: issueKey,
            fields: {
              ...MockData.jira.issue.fields,
              summary: 'Version 2 Remote',
            },
          }),
          Date.now() - 2000,
          Date.now() - 1900
        ),
      ];

      const history = conflictDetector.getConflictHistory(issueKey);

      expect(history).toHaveLength(2);
      expect(history[0].localValue).toBe('Version 1');
      expect(history[1].localValue).toBe('Version 2');
    });
  });

  describe('Performance and Edge Cases', () => {
    test('should handle large datasets efficiently', () => {
      const startTime = Date.now();
      const itemCount = 1000;

      // Test conflict detection on large dataset
      for (let i = 1; i <= itemCount; i++) {
        const localMeta = {
          jiraKey: `PERF-${i}`,
          title: `Local Title ${i}`,
          description: `Local description ${i}`.repeat(10),
          labels: [`local-${i}`, `test-${i}`],
        };

        const remoteIssue = createMockJiraIssue({
          key: `PERF-${i}`,
          fields: {
            ...MockData.jira.issue.fields,
            summary: `Remote Title ${i}`,
            description: `Remote description ${i}`.repeat(10),
            labels: [`remote-${i}`, `test-${i}`],
          },
        });

        conflictDetector.detectConflict(
          localMeta,
          remoteIssue,
          Date.now(),
          Date.now() + 1000
        );
      }

      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds

      console.log(
        `Performance test: Processed ${itemCount} conflict detections in ${duration}ms`
      );
    });

    test('should handle malformed data gracefully', () => {
      const malformedLocal = {
        jiraKey: null,
        title: undefined,
        corrupted: { circular: null },
      };

      // Create circular reference
      malformedLocal.corrupted.circular = malformedLocal.corrupted;

      const malformedRemote = createMockJiraIssue({
        key: null as any,
        fields: {
          summary: undefined as any,
          corrupted: { recursive: null } as any,
        },
      });

      // Should not throw error
      expect(() => {
        conflictDetector.detectConflict(
          malformedLocal,
          malformedRemote,
          Date.now(),
          Date.now() + 1000
        );
      }).not.toThrow();
    });

    test('should handle very large field values', () => {
      const largeValue = 'x'.repeat(1000000); // 1MB string

      const localMeta = {
        jiraKey: 'TEST-LARGE',
        description: largeValue,
      };

      const remoteIssue = createMockJiraIssue({
        key: 'TEST-LARGE',
        fields: {
          ...MockData.jira.issue.fields,
          description: largeValue + ' modified',
        },
      });

      const startTime = Date.now();
      const conflict = conflictDetector.detectConflict(
        localMeta,
        remoteIssue,
        Date.now(),
        Date.now() + 1000
      );
      const duration = Date.now() - startTime;

      expect(conflict).not.toBeNull();
      expect(duration).toBeLessThan(1000); // Should handle large strings efficiently
    });

    test('should handle deeply nested objects', () => {
      const createDeepObject = (depth: number): any => {
        if (depth === 0) return 'deep-value';
        return { nested: createDeepObject(depth - 1) };
      };

      const deepLocal = createDeepObject(100);
      const deepRemote = createDeepObject(100);
      deepRemote.nested.nested.differentValue = 'modified';

      const comparison = conflictDetector.compareFieldValues(
        deepLocal,
        deepRemote
      );

      expect(comparison.hasConflict).toBe(true);
    });

    test('should respect conflict detection timeout', () => {
      const startTime = Date.now();

      // Create extremely complex objects that would take long to compare
      const complexLocal = {
        jiraKey: 'TEST-TIMEOUT',
        data: Array.from({ length: 10000 }, (_, i) => ({
          id: i,
          data: Array.from({ length: 100 }, (_, j) => `item-${i}-${j}`),
        })),
      };

      const complexRemote = createMockJiraIssue({
        key: 'TEST-TIMEOUT',
        fields: {
          ...MockData.jira.issue.fields,
          customData: {
            ...complexLocal.data,
            modified: true,
          },
        },
      });

      const conflict = conflictDetector.detectConflict(
        complexLocal,
        complexRemote,
        Date.now(),
        Date.now() + 1000,
        { timeout: 500 } // 500ms timeout
      );

      const duration = Date.now() - startTime;

      // Should respect timeout
      expect(duration).toBeLessThan(1000);

      // May return null due to timeout, which is acceptable
      if (conflict === null) {
        console.log(
          'Conflict detection timed out as expected for complex data'
        );
      }
    });

    test('should maintain accuracy under concurrent detection', async () => {
      const conflictPromises: Promise<SyncConflict | null>[] = [];

      // Run multiple conflict detections concurrently
      for (let i = 1; i <= 50; i++) {
        const promise = Promise.resolve().then(() => {
          return conflictDetector.detectConflict(
            { jiraKey: `CONCURRENT-${i}`, title: `Local ${i}` },
            createMockJiraIssue({
              key: `CONCURRENT-${i}`,
              fields: { ...MockData.jira.issue.fields, summary: `Remote ${i}` },
            }),
            Date.now(),
            Date.now() + 1000
          );
        });

        conflictPromises.push(promise);
      }

      const results = await Promise.all(conflictPromises);
      const conflicts = results.filter(r => r !== null);

      // All should detect conflicts
      expect(conflicts).toHaveLength(50);

      // Each conflict should have correct issue key
      conflicts.forEach((conflict, index) => {
        expect(conflict!.issueKey).toBe(`CONCURRENT-${index + 1}`);
      });
    });
  });

  describe('Configuration and Customization', () => {
    test('should allow custom conflict time window', () => {
      const customDetector = new ConflictDetector({
        conflictTimeWindow: 10000, // 10 seconds
      });

      expect(customDetector.getConflictTimeWindow()).toBe(10000);

      const conflict = customDetector.detectConflict(
        { jiraKey: 'TEST-CUSTOM', title: 'Local' },
        createMockJiraIssue({
          fields: { ...MockData.jira.issue.fields, summary: 'Remote' },
        }),
        Date.now(),
        Date.now() + 8000 // 8 seconds difference
      );

      expect(conflict).not.toBeNull(); // Should detect within custom window
    });

    test('should allow custom field comparison rules', () => {
      const customDetector = new ConflictDetector({
        fieldComparisonRules: {
          storyPoints: {
            type: 'numeric',
            tolerance: 0.5, // Allow 0.5 difference
          },
          labels: {
            type: 'array',
            ignoreOrder: true,
          },
        },
      });

      // Test numeric tolerance
      const numericComparison = customDetector.compareFieldValues(8.0, 8.3);
      expect(numericComparison.hasConflict).toBe(false); // Within tolerance

      // Test array order ignore
      const arrayComparison = customDetector.compareFieldValues(
        ['a', 'b', 'c'],
        ['c', 'b', 'a']
      );
      expect(arrayComparison.hasConflict).toBe(false); // Order ignored
    });

    test('should allow custom conflict resolution strategies', () => {
      const customDetector = new ConflictDetector({
        resolutionStrategies: {
          priority: 'always_local', // Always prefer local priority
          assignee: 'always_remote', // Always prefer remote assignee
          description: 'manual', // Always require manual review for descriptions
        },
      });

      const priorityConflict: SyncConflict = {
        issueKey: 'TEST-CUSTOM',
        field: 'priority',
        localValue: 'High',
        remoteValue: 'Low',
        localTimestamp: Date.now(),
        remoteTimestamp: Date.now() + 1000,
        conflictType: 'CONCURRENT_EDIT',
      };

      const resolution = customDetector.suggestResolution(priorityConflict);
      expect(resolution.strategy).toBe('USE_LOCAL');
    });
  });
});
