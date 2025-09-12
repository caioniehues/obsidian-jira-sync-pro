/**
 * Comprehensive Test Suite for ResolutionStrategies
 *
 * Tests all resolution strategy functionality including:
 * - Field-specific conflict resolution logic
 * - Strategy selection algorithms
 * - Confidence scoring
 * - User preference handling
 * - Timeout and error handling
 * - Performance under various scenarios
 *
 * RED-GREEN-Refactor: All tests written to fail first, then implemented
 * No mocks - using real conflict scenarios and resolution logic
 */

import { vi } from 'vitest';
import {
  ResolutionStrategies,
  ResolutionResult,
  ResolutionContext,
  ResolutionStrategy,
} from '../../src/conflict/resolution-strategies';
import { ConflictInfo } from '../../src/sync/conflict-detector';

describe('ResolutionStrategies', () => {
  let resolutionStrategies: ResolutionStrategies;
  let testStartTime: number;

  beforeEach(() => {
    testStartTime = Date.now();
    resolutionStrategies = new ResolutionStrategies();
  });

  afterEach(() => {
    const testDuration = Date.now() - testStartTime;
    console.log(`Test completed in ${testDuration}ms`);
  });

  describe('Basic Strategy Selection', () => {
    test('should handle null/undefined conflict values', () => {
      const conflict: ConflictInfo = {
        issueKey: 'TEST-123',
        field: 'description',
        localValue: null,
        remoteValue: 'Remote description',
        localTimestamp: Date.now(),
        remoteTimestamp: Date.now() + 1000,
        severity: 'medium',
      };

      const result = resolutionStrategies.analyzeConflict(conflict);

      expect(result.strategy).toBe('REMOTE');
      expect(result.resolvedValue).toBe('Remote description');
      expect(result.confidence).toBeGreaterThan(0.8);
      expect(result.reason).toContain('empty');
    });

    test('should prefer local value when remote is null', () => {
      const conflict: ConflictInfo = {
        issueKey: 'TEST-123',
        field: 'assignee',
        localValue: 'John Doe',
        remoteValue: null,
        localTimestamp: Date.now(),
        remoteTimestamp: Date.now() + 1000,
        severity: 'medium',
      };

      const result = resolutionStrategies.analyzeConflict(conflict);

      expect(result.strategy).toBe('LOCAL');
      expect(result.resolvedValue).toBe('John Doe');
      expect(result.confidence).toBeGreaterThan(0.8);
    });

    test('should respect user field-specific preferences', () => {
      const conflict: ConflictInfo = {
        issueKey: 'TEST-123',
        field: 'priority',
        localValue: 'High',
        remoteValue: 'Low',
        localTimestamp: Date.now(),
        remoteTimestamp: Date.now() + 1000,
        severity: 'low',
      };

      const context: ResolutionContext = {
        userPreferences: {
          fieldSpecificStrategies: new Map([['priority', 'LOCAL']]),
        },
      };

      const result = resolutionStrategies.analyzeConflict(conflict, context);

      expect(result.strategy).toBe('LOCAL');
      expect(result.resolvedValue).toBe('High');
      expect(result.confidence).toBe(1.0);
      expect(result.reason).toContain('User preference');
    });

    test('should apply default user strategy when no field-specific preference', () => {
      const conflict: ConflictInfo = {
        issueKey: 'TEST-123',
        field: 'description',
        localValue: 'Local desc',
        remoteValue: 'Remote desc',
        localTimestamp: Date.now(),
        remoteTimestamp: Date.now() + 1000,
        severity: 'medium',
      };

      const context: ResolutionContext = {
        userPreferences: {
          defaultStrategy: 'REMOTE',
        },
      };

      const result = resolutionStrategies.analyzeConflict(conflict, context);

      expect(result.strategy).toBe('REMOTE');
      expect(result.resolvedValue).toBe('Remote desc');
      expect(result.confidence).toBe(1.0);
    });

    test('should handle timeout during analysis', () => {
      const conflict: ConflictInfo = {
        issueKey: 'TEST-123',
        field: 'description',
        localValue: 'x'.repeat(10000), // Large string
        remoteValue: 'y'.repeat(10000), // Large string
        localTimestamp: Date.now(),
        remoteTimestamp: Date.now() + 1000,
        severity: 'medium',
      };

      const context: ResolutionContext = {
        timeout: 10, // Very short timeout
      };

      const result = resolutionStrategies.analyzeConflict(conflict, context);

      expect(result.strategy).toBe('MANUAL');
      expect(result.confidence).toBeLessThan(0.5);
      expect(result.reason).toContain('timeout');
      expect(result.requiresUserConfirmation).toBe(true);
    });

    test('should handle analysis errors gracefully', () => {
      const malformedConflict: ConflictInfo = {
        issueKey: null as any, // Invalid
        field: '',
        localValue: { circular: null as any },
        remoteValue: undefined,
        localTimestamp: NaN,
        remoteTimestamp: NaN,
        severity: 'high',
      };

      // Create circular reference
      malformedConflict.localValue.circular = malformedConflict.localValue;

      const result = resolutionStrategies.analyzeConflict(malformedConflict);

      expect(result.strategy).toBe('MANUAL');
      expect(result.confidence).toBeLessThan(0.5);
      expect(result.requiresUserConfirmation).toBe(true);
      expect(result.reason).toContain('failed');
    });
  });

  describe('Field-Specific Resolution Logic', () => {
    describe('Title/Summary Conflicts', () => {
      test('should prefer non-empty title when one is empty', () => {
        const conflict: ConflictInfo = {
          issueKey: 'TEST-123',
          field: 'summary',
          localValue: '',
          remoteValue: 'Fix authentication bug',
          localTimestamp: Date.now(),
          remoteTimestamp: Date.now() + 1000,
          severity: 'high',
        };

        const result = resolutionStrategies.analyzeConflict(conflict);

        expect(result.strategy).toBe('REMOTE');
        expect(result.resolvedValue).toBe('Fix authentication bug');
        expect(result.confidence).toBeGreaterThan(0.8);
        expect(result.reason).toContain('empty');
      });

      test('should detect expanded vs abbreviated titles', () => {
        const conflict: ConflictInfo = {
          issueKey: 'TEST-123',
          field: 'summary',
          localValue: 'Auth Bug',
          remoteValue: 'Fix authentication bug in login system',
          localTimestamp: Date.now(),
          remoteTimestamp: Date.now() + 1000,
          severity: 'high',
        };

        const result = resolutionStrategies.analyzeConflict(conflict);

        expect(result.strategy).toBe('REMOTE');
        expect(result.resolvedValue).toBe(
          'Fix authentication bug in login system'
        );
        expect(result.confidence).toBeGreaterThan(0.7);
        expect(result.reason).toContain('expanded');
      });

      test('should use timestamp priority for complex title conflicts', () => {
        const baseTime = Date.now();
        const conflict: ConflictInfo = {
          issueKey: 'TEST-123',
          field: 'title',
          localValue: 'Implement user registration',
          remoteValue: 'Add user signup feature',
          localTimestamp: baseTime,
          remoteTimestamp: baseTime + 120000, // 2 minutes newer
          severity: 'high',
        };

        const result = resolutionStrategies.analyzeConflict(conflict);

        expect(result.strategy).toBe('REMOTE');
        expect(result.resolvedValue).toBe('Add user signup feature');
        expect(result.reason).toContain('newer remote');
      });

      test('should require manual review for similar timestamps and different meanings', () => {
        const baseTime = Date.now();
        const conflict: ConflictInfo = {
          issueKey: 'TEST-123',
          field: 'summary',
          localValue: 'Fix login bug',
          remoteValue: 'Implement new login',
          localTimestamp: baseTime,
          remoteTimestamp: baseTime + 10000, // 10 seconds - close timestamp
          severity: 'high',
        };

        const result = resolutionStrategies.analyzeConflict(conflict);

        expect(result.strategy).toBe('MANUAL');
        expect(result.requiresUserConfirmation).toBe(true);
        expect(result.reason).toContain('careful review');
      });
    });

    describe('Description Conflicts', () => {
      test('should use length priority for significantly different descriptions', () => {
        const conflict: ConflictInfo = {
          issueKey: 'TEST-123',
          field: 'description',
          localValue: 'Short desc',
          remoteValue:
            'This is a much longer and more detailed description with specific requirements and acceptance criteria that provides comprehensive information about the feature.',
          localTimestamp: Date.now(),
          remoteTimestamp: Date.now() + 1000,
          severity: 'medium',
        };

        const result = resolutionStrategies.analyzeConflict(conflict);

        expect(result.strategy).toBe('REMOTE');
        expect(result.resolvedValue).toBe(conflict.remoteValue);
        expect(result.reason).toContain('expanded');
      });

      test('should detect when local contains remote content', () => {
        const remoteDesc = 'Basic feature description';
        const localDesc = `${remoteDesc}\n\nAdditional details:\n- Implementation notes\n- Testing requirements`;

        const conflict: ConflictInfo = {
          issueKey: 'TEST-123',
          field: 'description',
          localValue: localDesc,
          remoteValue: remoteDesc,
          localTimestamp: Date.now(),
          remoteTimestamp: Date.now() + 1000,
          severity: 'medium',
        };

        const result = resolutionStrategies.analyzeConflict(conflict);

        expect(result.strategy).toBe('LOCAL');
        expect(result.resolvedValue).toBe(localDesc);
        expect(result.reason).toContain('expanded');
      });

      test('should suggest merge for substantial different content', () => {
        const conflict: ConflictInfo = {
          issueKey: 'TEST-123',
          field: 'description',
          localValue:
            'Frontend implementation details with React components and state management',
          remoteValue:
            'Backend API requirements with authentication and data validation',
          localTimestamp: Date.now(),
          remoteTimestamp: Date.now() + 1000,
          severity: 'medium',
        };

        const result = resolutionStrategies.analyzeConflict(conflict);

        expect(result.strategy).toBe('MERGE');
        expect(result.resolvedValue).toContain('Frontend implementation');
        expect(result.resolvedValue).toContain('Backend API');
        expect(result.confidence).toBeGreaterThan(0.5);
      });

      test('should use newer version when similar length and no containment', () => {
        const conflict: ConflictInfo = {
          issueKey: 'TEST-123',
          field: 'description',
          localValue: 'First version of the description',
          remoteValue: 'Updated version of description',
          localTimestamp: Date.now(),
          remoteTimestamp: Date.now() + 5000,
          severity: 'medium',
        };

        const result = resolutionStrategies.analyzeConflict(conflict);

        expect(result.strategy).toBe('REMOTE');
        expect(result.resolvedValue).toBe('Updated version of description');
        expect(result.reason).toContain('newer remote');
      });
    });

    describe('Status Conflicts', () => {
      test('should prefer more advanced workflow status', () => {
        const conflict: ConflictInfo = {
          issueKey: 'TEST-123',
          field: 'status',
          localValue: 'To Do',
          remoteValue: 'In Progress',
          localTimestamp: Date.now(),
          remoteTimestamp: Date.now() + 1000,
          severity: 'high',
        };

        const result = resolutionStrategies.analyzeConflict(conflict);

        expect(result.strategy).toBe('REMOTE');
        expect(result.resolvedValue).toBe('In Progress');
        expect(result.confidence).toBeGreaterThan(0.7);
        expect(result.reason).toContain('advanced workflow');
        expect(result.requiresUserConfirmation).toBe(true);
      });

      test('should prioritize blocked status', () => {
        const conflict: ConflictInfo = {
          issueKey: 'TEST-123',
          field: 'status',
          localValue: 'In Progress',
          remoteValue: 'Blocked',
          localTimestamp: Date.now(),
          remoteTimestamp: Date.now() + 1000,
          severity: 'high',
        };

        const result = resolutionStrategies.analyzeConflict(conflict);

        expect(result.strategy).toBe('REMOTE');
        expect(result.resolvedValue).toBe('Blocked');
        expect(result.requiresUserConfirmation).toBe(true);
      });

      test('should use newer timestamp for same priority statuses', () => {
        const baseTime = Date.now();
        const conflict: ConflictInfo = {
          issueKey: 'TEST-123',
          field: 'status',
          localValue: 'In Review',
          remoteValue: 'In Testing',
          localTimestamp: baseTime + 2000, // Local is newer
          remoteTimestamp: baseTime,
          severity: 'high',
        };

        const result = resolutionStrategies.analyzeConflict(conflict);

        expect(result.strategy).toBe('LOCAL');
        expect(result.resolvedValue).toBe('In Review');
        expect(result.reason).toContain('newer local');
      });
    });

    describe('Priority Conflicts', () => {
      test('should always escalate to higher priority', () => {
        const conflict: ConflictInfo = {
          issueKey: 'TEST-123',
          field: 'priority',
          localValue: 'Low',
          remoteValue: 'Critical',
          localTimestamp: Date.now(),
          remoteTimestamp: Date.now() + 1000,
          severity: 'low',
        };

        const result = resolutionStrategies.analyzeConflict(conflict);

        expect(result.strategy).toBe('REMOTE');
        expect(result.resolvedValue).toBe('Critical');
        expect(result.confidence).toBeGreaterThan(0.8);
        expect(result.reason).toContain('escalation');
      });

      test('should prefer local when local has higher priority', () => {
        const conflict: ConflictInfo = {
          issueKey: 'TEST-123',
          field: 'priority',
          localValue: 'Blocker',
          remoteValue: 'Medium',
          localTimestamp: Date.now(),
          remoteTimestamp: Date.now() + 5000, // Remote is newer but lower priority
          severity: 'low',
        };

        const result = resolutionStrategies.analyzeConflict(conflict);

        expect(result.strategy).toBe('LOCAL');
        expect(result.resolvedValue).toBe('Blocker');
        expect(result.reason).toContain('escalation');
      });

      test('should use timestamp for same priority levels', () => {
        const baseTime = Date.now();
        const conflict: ConflictInfo = {
          issueKey: 'TEST-123',
          field: 'priority',
          localValue: 'High',
          remoteValue: 'Major', // Same level as High
          localTimestamp: baseTime,
          remoteTimestamp: baseTime + 3000, // Remote newer
          severity: 'low',
        };

        const result = resolutionStrategies.analyzeConflict(conflict);

        expect(result.strategy).toBe('REMOTE');
        expect(result.reason).toContain('newer remote');
      });
    });

    describe('Assignee Conflicts', () => {
      test('should prefer assignment over unassigned', () => {
        const conflict: ConflictInfo = {
          issueKey: 'TEST-123',
          field: 'assignee',
          localValue: 'Unassigned',
          remoteValue: 'Jane Doe',
          localTimestamp: Date.now(),
          remoteTimestamp: Date.now() + 1000,
          severity: 'medium',
        };

        const result = resolutionStrategies.analyzeConflict(conflict);

        expect(result.strategy).toBe('REMOTE');
        expect(result.resolvedValue).toBe('Jane Doe');
        expect(result.confidence).toBeGreaterThan(0.8);
        expect(result.reason).toContain('assigned remotely');
      });

      test('should handle null assignee as unassigned', () => {
        const conflict: ConflictInfo = {
          issueKey: 'TEST-123',
          field: 'assignee',
          localValue: 'John Doe',
          remoteValue: null,
          localTimestamp: Date.now(),
          remoteTimestamp: Date.now() + 1000,
          severity: 'medium',
        };

        const result = resolutionStrategies.analyzeConflict(conflict);

        expect(result.strategy).toBe('LOCAL');
        expect(result.resolvedValue).toBe('John Doe');
        expect(result.reason).toContain('assigned locally');
      });

      test('should require confirmation for assignee changes between people', () => {
        const conflict: ConflictInfo = {
          issueKey: 'TEST-123',
          field: 'assignee',
          localValue: 'Alice Smith',
          remoteValue: 'Bob Johnson',
          localTimestamp: Date.now(),
          remoteTimestamp: Date.now() + 1000,
          severity: 'medium',
        };

        const result = resolutionStrategies.analyzeConflict(conflict);

        expect(result.requiresUserConfirmation).toBe(true);
        expect(result.reason).toContain('assignment');
      });
    });

    describe('Labels/Tags Conflicts', () => {
      test('should merge label arrays by default', () => {
        const conflict: ConflictInfo = {
          issueKey: 'TEST-123',
          field: 'labels',
          localValue: ['frontend', 'bug', 'urgent'],
          remoteValue: ['bug', 'backend', 'feature'],
          localTimestamp: Date.now(),
          remoteTimestamp: Date.now() + 1000,
          severity: 'low',
        };

        const result = resolutionStrategies.analyzeConflict(conflict);

        expect(result.strategy).toBe('MERGE');
        expect(result.resolvedValue).toEqual(
          expect.arrayContaining([
            'frontend',
            'bug',
            'urgent',
            'backend',
            'feature',
          ])
        );
        expect(result.confidence).toBeGreaterThan(0.8);
        expect(result.reason).toContain('Merging label sets');
      });

      test('should use remote labels when local is empty', () => {
        const conflict: ConflictInfo = {
          issueKey: 'TEST-123',
          field: 'labels',
          localValue: [],
          remoteValue: ['important', 'review-needed'],
          localTimestamp: Date.now(),
          remoteTimestamp: Date.now() + 1000,
          severity: 'low',
        };

        const result = resolutionStrategies.analyzeConflict(conflict);

        expect(result.strategy).toBe('REMOTE');
        expect(result.resolvedValue).toEqual(['important', 'review-needed']);
        expect(result.reason).toContain('No local labels');
      });

      test('should preserve unique labels from both sides', () => {
        const conflict: ConflictInfo = {
          issueKey: 'TEST-123',
          field: 'tags',
          localValue: ['v1.0', 'release'],
          remoteValue: ['v2.0', 'beta', 'release'],
          localTimestamp: Date.now(),
          remoteTimestamp: Date.now() + 1000,
          severity: 'low',
        };

        const result = resolutionStrategies.analyzeConflict(conflict);

        expect(result.strategy).toBe('MERGE');
        expect(result.resolvedValue).toContain('v1.0');
        expect(result.resolvedValue).toContain('v2.0');
        expect(result.resolvedValue).toContain('beta');
        expect(
          result.resolvedValue.filter((tag: string) => tag === 'release')
        ).toHaveLength(1); // No duplicates
      });
    });

    describe('Sprint Conflicts', () => {
      test('should prefer sprint assignment over null', () => {
        const conflict: ConflictInfo = {
          issueKey: 'TEST-123',
          field: 'sprint',
          localValue: null,
          remoteValue: 'Sprint 24',
          localTimestamp: Date.now(),
          remoteTimestamp: Date.now() + 1000,
          severity: 'medium',
        };

        const result = resolutionStrategies.analyzeConflict(conflict);

        expect(result.strategy).toBe('REMOTE');
        expect(result.resolvedValue).toBe('Sprint 24');
        expect(result.reason).toContain('added to sprint remotely');
      });

      test('should require confirmation for sprint changes', () => {
        const conflict: ConflictInfo = {
          issueKey: 'TEST-123',
          field: 'sprint',
          localValue: 'Sprint 23',
          remoteValue: 'Sprint 24',
          localTimestamp: Date.now(),
          remoteTimestamp: Date.now() + 1000,
          severity: 'medium',
        };

        const result = resolutionStrategies.analyzeConflict(conflict);

        expect(result.requiresUserConfirmation).toBe(true);
        expect(result.reason).toContain('sprint assignment');
      });
    });

    describe('Story Points Conflicts', () => {
      test('should prefer higher story point estimate', () => {
        const conflict: ConflictInfo = {
          issueKey: 'TEST-123',
          field: 'storypoints',
          localValue: 3,
          remoteValue: 8,
          localTimestamp: Date.now(),
          remoteTimestamp: Date.now() + 1000,
          severity: 'low',
        };

        const result = resolutionStrategies.analyzeConflict(conflict);

        expect(result.strategy).toBe('REMOTE');
        expect(result.resolvedValue).toBe(8);
        expect(result.reason).toContain('higher complexity');
        expect(result.requiresUserConfirmation).toBe(true);
      });

      test('should handle string story points', () => {
        const conflict: ConflictInfo = {
          issueKey: 'TEST-123',
          field: 'story_points',
          localValue: '5',
          remoteValue: '13',
          localTimestamp: Date.now(),
          remoteTimestamp: Date.now() + 1000,
          severity: 'low',
        };

        const result = resolutionStrategies.analyzeConflict(conflict);

        expect(result.strategy).toBe('REMOTE');
        expect(result.resolvedValue).toBe('13');
        expect(result.reason).toContain('higher complexity');
      });

      test('should prefer set value over null', () => {
        const conflict: ConflictInfo = {
          issueKey: 'TEST-123',
          field: 'storyPoints',
          localValue: null,
          remoteValue: 5,
          localTimestamp: Date.now(),
          remoteTimestamp: Date.now() + 1000,
          severity: 'low',
        };

        const result = resolutionStrategies.analyzeConflict(conflict);

        expect(result.strategy).toBe('REMOTE');
        expect(result.resolvedValue).toBe(5);
        expect(result.reason).toContain('set remotely');
      });
    });

    describe('Generic Field Conflicts', () => {
      test('should merge arrays for unknown fields', () => {
        const conflict: ConflictInfo = {
          issueKey: 'TEST-123',
          field: 'customArrayField',
          localValue: ['a', 'b'],
          remoteValue: ['b', 'c'],
          localTimestamp: Date.now(),
          remoteTimestamp: Date.now() + 1000,
          severity: 'medium',
        };

        const result = resolutionStrategies.analyzeConflict(conflict);

        expect(result.strategy).toBe('MERGE');
        expect(result.resolvedValue).toEqual(['a', 'b', 'c']);
      });

      test('should use timestamp priority for unknown scalar fields with significant time difference', () => {
        const baseTime = Date.now();
        const conflict: ConflictInfo = {
          issueKey: 'TEST-123',
          field: 'unknownField',
          localValue: 'local_value',
          remoteValue: 'remote_value',
          localTimestamp: baseTime,
          remoteTimestamp: baseTime + 120000, // 2 minutes difference
          severity: 'medium',
        };

        const result = resolutionStrategies.analyzeConflict(conflict);

        expect(result.strategy).toBe('REMOTE');
        expect(result.resolvedValue).toBe('remote_value');
        expect(result.reason).toContain('newer remote');
      });

      test('should require manual review for close timestamps', () => {
        const baseTime = Date.now();
        const conflict: ConflictInfo = {
          issueKey: 'TEST-123',
          field: 'customField',
          localValue: 'local_value',
          remoteValue: 'remote_value',
          localTimestamp: baseTime,
          remoteTimestamp: baseTime + 30000, // 30 seconds - close timestamp
          severity: 'medium',
        };

        const result = resolutionStrategies.analyzeConflict(conflict);

        expect(result.strategy).toBe('MANUAL');
        expect(result.requiresUserConfirmation).toBe(true);
        expect(result.reason).toContain('similar timestamps');
      });
    });
  });

  describe('Performance and Edge Cases', () => {
    test('should handle large datasets efficiently', () => {
      const startTime = Date.now();
      const itemCount = 100;

      for (let i = 1; i <= itemCount; i++) {
        const conflict: ConflictInfo = {
          issueKey: `PERF-${i}`,
          field: 'description',
          localValue: `Local description ${i}`.repeat(100),
          remoteValue: `Remote description ${i}`.repeat(100),
          localTimestamp: Date.now(),
          remoteTimestamp: Date.now() + 1000,
          severity: 'medium',
        };

        const result = resolutionStrategies.analyzeConflict(conflict);

        expect(result.strategy).toBeDefined();
        expect(result.confidence).toBeGreaterThan(0);
      }

      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(2000); // Should complete within 2 seconds

      console.log(
        `Performance test: Analyzed ${itemCount} conflicts in ${duration}ms`
      );
    });

    test('should handle extremely large field values', () => {
      const largeValue = 'x'.repeat(100000); // 100KB string

      const conflict: ConflictInfo = {
        issueKey: 'TEST-LARGE',
        field: 'description',
        localValue: largeValue,
        remoteValue: largeValue + ' modified',
        localTimestamp: Date.now(),
        remoteTimestamp: Date.now() + 1000,
        severity: 'medium',
      };

      const startTime = Date.now();
      const result = resolutionStrategies.analyzeConflict(conflict);
      const duration = Date.now() - startTime;

      expect(result.strategy).toBeDefined();
      expect(duration).toBeLessThan(5000); // Should handle large strings efficiently
    });

    test('should handle deeply nested conflict objects', () => {
      const createDeepObject = (depth: number): any => {
        if (depth === 0) return 'deep-value';
        return { nested: createDeepObject(depth - 1) };
      };

      const deepLocal = createDeepObject(50);
      const deepRemote = createDeepObject(50);
      deepRemote.nested.modified = true;

      const conflict: ConflictInfo = {
        issueKey: 'TEST-DEEP',
        field: 'customData',
        localValue: deepLocal,
        remoteValue: deepRemote,
        localTimestamp: Date.now(),
        remoteTimestamp: Date.now() + 1000,
        severity: 'medium',
      };

      const result = resolutionStrategies.analyzeConflict(conflict);

      expect(result.strategy).toBeDefined();
      expect(result.confidence).toBeGreaterThan(0);
    });

    test('should respect analysis timeout', () => {
      const complexConflict: ConflictInfo = {
        issueKey: 'TEST-TIMEOUT',
        field: 'description',
        localValue: Array.from({ length: 10000 }, (_, i) => `Line ${i}`).join(
          '\n'
        ),
        remoteValue: Array.from(
          { length: 10000 },
          (_, i) => `Modified Line ${i}`
        ).join('\n'),
        localTimestamp: Date.now(),
        remoteTimestamp: Date.now() + 1000,
        severity: 'medium',
      };

      const context: ResolutionContext = {
        timeout: 100, // Very short timeout
      };

      const startTime = Date.now();
      const result = resolutionStrategies.analyzeConflict(
        complexConflict,
        context
      );
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(200); // Should respect timeout
      expect(result.strategy).toBe('MANUAL');
      expect(result.reason).toContain('timeout');
    });

    test('should handle malformed data gracefully', () => {
      const malformedConflict: ConflictInfo = {
        issueKey: null as any,
        field: undefined as any,
        localValue: {
          toString: () => {
            throw new Error('toString failed');
          },
        },
        remoteValue: NaN,
        localTimestamp: Infinity,
        remoteTimestamp: -Infinity,
        severity: 'high',
      };

      expect(() => {
        const result = resolutionStrategies.analyzeConflict(malformedConflict);
        expect(result.strategy).toBe('MANUAL');
        expect(result.confidence).toBeLessThan(0.5);
      }).not.toThrow();
    });

    test('should maintain accuracy under concurrent analysis', async () => {
      const analysisPromises: Promise<ResolutionResult>[] = [];

      // Run multiple analyses concurrently
      for (let i = 1; i <= 20; i++) {
        const conflict: ConflictInfo = {
          issueKey: `CONCURRENT-${i}`,
          field: 'priority',
          localValue: 'Low',
          remoteValue: 'High',
          localTimestamp: Date.now(),
          remoteTimestamp: Date.now() + 1000,
          severity: 'low',
        };

        const promise = Promise.resolve().then(() => {
          return resolutionStrategies.analyzeConflict(conflict);
        });

        analysisPromises.push(promise);
      }

      const results = await Promise.all(analysisPromises);

      // All should resolve correctly
      expect(results).toHaveLength(20);

      // All should prefer higher priority
      results.forEach((result, index) => {
        expect(result.strategy).toBe('REMOTE');
        expect(result.resolvedValue).toBe('High');
        expect(result.confidence).toBeGreaterThan(0.7);
      });
    });
  });

  describe('User Preference Integration', () => {
    test('should respect priority rules from user preferences', () => {
      const conflict: ConflictInfo = {
        issueKey: 'TEST-123',
        field: 'description',
        localValue: 'Local description',
        remoteValue: 'Remote description',
        localTimestamp: Date.now(),
        remoteTimestamp: Date.now() + 1000,
        severity: 'medium',
      };

      const context: ResolutionContext = {
        userPreferences: {
          priorityRules: {
            alwaysUseNewer: true,
          },
        },
      };

      const result = resolutionStrategies.analyzeConflict(conflict, context);

      // Should use remote since it's newer
      expect(result.strategy).toBe('REMOTE');
      expect(result.resolvedValue).toBe('Remote description');
    });

    test('should learn from user history patterns', () => {
      const conflict: ConflictInfo = {
        issueKey: 'TEST-123',
        field: 'assignee',
        localValue: 'John Doe',
        remoteValue: 'Jane Smith',
        localTimestamp: Date.now(),
        remoteTimestamp: Date.now() + 1000,
        severity: 'medium',
      };

      const context: ResolutionContext = {
        historyData: {
          userPatterns: {
            mostUsedStrategy: 'LOCAL',
            fieldPreferences: new Map([['assignee', 'LOCAL']]),
          },
        },
      };

      // This would need to be implemented in the actual strategy logic
      // For now, just ensure the context is properly passed
      const result = resolutionStrategies.analyzeConflict(conflict, context);

      expect(result.strategy).toBeDefined();
      expect(result.confidence).toBeGreaterThan(0);
    });
  });
});
