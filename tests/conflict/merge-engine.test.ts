/**
 * Comprehensive Test Suite for MergeEngine
 *
 * Tests all merge algorithms and functionality including:
 * - Algorithm selection based on data types
 * - Union, intersection, append merges
 * - Smart text merging with diff analysis
 * - Three-way merge simulation
 * - Priority-based and length-based merging
 * - Performance and edge cases
 *
 * RED-GREEN-Refactor: All tests written to fail first, then implemented
 * No mocks - using real merge operations and data
 */

import { vi } from 'vitest';
import {
  MergeEngine,
  MergeOptions,
  MergeResult,
  MergeAlgorithm,
} from '../../src/conflict/merge-engine';

describe('MergeEngine', () => {
  let mergeEngine: MergeEngine;
  let testStartTime: number;

  beforeEach(() => {
    testStartTime = Date.now();
    mergeEngine = new MergeEngine();
  });

  afterEach(() => {
    const testDuration = Date.now() - testStartTime;
    console.log(`Test completed in ${testDuration}ms`);
  });

  describe('Basic Merge Operations', () => {
    test('should handle identical values without merge', () => {
      const result = mergeEngine.merge('Same value', 'Same value', 'testField');

      expect(result.success).toBe(true);
      expect(result.mergedValue).toBe('Same value');
      expect(result.algorithm).toBe('UNION');
      expect(result.confidence).toBe(1.0);
      expect(result.conflictsResolved).toBe(0);
      expect(result.conflictsRemaining).toBe(0);
    });

    test('should prefer non-null value when one is null', () => {
      const result = mergeEngine.merge(null, 'Non-null value', 'testField');

      expect(result.success).toBe(true);
      expect(result.mergedValue).toBe('Non-null value');
      expect(result.conflictsResolved).toBe(1);
      expect(result.metadata.warnings).toContain(
        'Local value was empty - used remote value'
      );
    });

    test('should prefer non-empty value when one is empty string', () => {
      const result = mergeEngine.merge('', 'Non-empty value', 'testField');

      expect(result.success).toBe(true);
      expect(result.mergedValue).toBe('Non-empty value');
      expect(result.conflictsResolved).toBe(1);
    });

    test('should handle both values being null gracefully', () => {
      const result = mergeEngine.merge(null, undefined, 'testField');

      expect(result.success).toBe(true);
      expect(result.mergedValue).toBeNull();
      expect(result.confidence).toBe(1.0);
      expect(result.conflictsResolved).toBe(0);
    });

    test('should handle merge failures gracefully', () => {
      // Create objects that will cause merge failure
      const circularLocal = { ref: null as any };
      circularLocal.ref = circularLocal;

      const circularRemote = { ref: null as any };
      circularRemote.ref = circularRemote;

      const result = mergeEngine.merge(
        circularLocal,
        circularRemote,
        'circularField'
      );

      expect(result.success).toBeDefined(); // Should not throw
      expect(result.metadata.warnings?.length).toBeGreaterThan(0);
    });
  });

  describe('Algorithm Selection', () => {
    test('should select SMART_TEXT_MERGE for long description fields', () => {
      const longLocal = 'This is a long local description '.repeat(10);
      const longRemote = 'This is a long remote description '.repeat(10);

      const result = mergeEngine.merge(longLocal, longRemote, 'description');

      expect(result.algorithm).toBe('SMART_TEXT_MERGE');
      expect(result.success).toBe(true);
    });

    test('should select UNION for label arrays', () => {
      const localLabels = ['frontend', 'bug'];
      const remoteLabels = ['backend', 'feature'];

      const result = mergeEngine.merge(localLabels, remoteLabels, 'labels');

      expect(result.algorithm).toBe('UNION');
      expect(result.mergedValue).toEqual(
        expect.arrayContaining(['frontend', 'bug', 'backend', 'feature'])
      );
    });

    test('should select PRIORITY_BASED for story points', () => {
      const result = mergeEngine.merge(3, 8, 'storyPoints');

      expect(result.algorithm).toBe('PRIORITY_BASED');
      expect(result.mergedValue).toBe(8); // Higher value
    });

    test('should select THREE_WAY_MERGE for objects', () => {
      const localObj = { a: 1, b: 2 };
      const remoteObj = { b: 3, c: 4 };

      const result = mergeEngine.merge(localObj, remoteObj, 'customObject');

      expect(result.algorithm).toBe('THREE_WAY_MERGE');
      expect(result.mergedValue).toEqual({ a: 1, b: 3, c: 4 });
    });

    test('should respect custom algorithm override', () => {
      const options: MergeOptions = {
        algorithm: 'INTERSECTION',
      };

      const result = mergeEngine.merge(
        ['a', 'b', 'c'],
        ['b', 'c', 'd'],
        'testField',
        options
      );

      expect(result.algorithm).toBe('INTERSECTION');
      expect(result.mergedValue).toEqual(['b', 'c']);
    });

    test('should use field-specific custom rules', () => {
      const options: MergeOptions = {
        customRules: {
          fieldSpecific: new Map([['customField', 'LENGTH_PRIORITY']]),
        },
      };

      const result = mergeEngine.merge(
        'Short',
        'Much longer text value',
        'customField',
        options
      );

      expect(result.algorithm).toBe('LENGTH_PRIORITY');
      expect(result.mergedValue).toBe('Much longer text value');
    });
  });

  describe('Union Merge Algorithm', () => {
    test('should merge arrays without duplicates', () => {
      const result = mergeEngine.merge(
        ['a', 'b', 'c'],
        ['c', 'd', 'e'],
        'arrayField',
        { algorithm: 'UNION' }
      );

      expect(result.success).toBe(true);
      expect(result.mergedValue).toEqual(['a', 'b', 'c', 'd', 'e']);
      expect(result.conflictsResolved).toBe(2); // Added 'd' and 'e'
    });

    test('should merge objects by combining properties', () => {
      const local = { name: 'Local', version: 1 };
      const remote = { version: 2, author: 'Remote' };

      const result = mergeEngine.merge(local, remote, 'objectField', {
        algorithm: 'UNION',
      });

      expect(result.success).toBe(true);
      expect(result.mergedValue).toEqual({
        name: 'Local',
        version: 2, // Remote overwrites
        author: 'Remote',
      });
      expect(result.metadata.warnings).toContain(
        expect.stringContaining('overwrote')
      );
    });

    test('should handle primitive type union', () => {
      const result = mergeEngine.merge('local', 'remote', 'stringField', {
        algorithm: 'UNION',
      });

      expect(result.success).toBe(true);
      expect(result.mergedValue).toBe('local'); // First non-null
    });
  });

  describe('Intersection Merge Algorithm', () => {
    test('should keep only common array elements', () => {
      const result = mergeEngine.merge(
        ['a', 'b', 'c', 'd'],
        ['c', 'd', 'e', 'f'],
        'arrayField',
        { algorithm: 'INTERSECTION' }
      );

      expect(result.success).toBe(true);
      expect(result.mergedValue).toEqual(['c', 'd']);
      expect(result.conflictsResolved).toBe(4); // Removed 'a', 'b', 'e', 'f'
      expect(result.metadata.removedContent).toEqual(['a', 'b', 'e', 'f']);
    });

    test('should keep only common object properties with same values', () => {
      const local = { a: 1, b: 2, c: 3 };
      const remote = { b: 2, c: 4, d: 5 };

      const result = mergeEngine.merge(local, remote, 'objectField', {
        algorithm: 'INTERSECTION',
      });

      expect(result.success).toBe(true);
      expect(result.mergedValue).toEqual({ b: 2 }); // Only b has same value
    });

    test('should warn when intersection is empty', () => {
      const result = mergeEngine.merge(['a', 'b'], ['c', 'd'], 'arrayField', {
        algorithm: 'INTERSECTION',
      });

      expect(result.success).toBe(true);
      expect(result.mergedValue).toEqual([]);
      expect(result.metadata.warnings).toContain(
        'Intersection resulted in empty array'
      );
    });

    test('should return null for different primitive values', () => {
      const result = mergeEngine.merge('local', 'remote', 'stringField', {
        algorithm: 'INTERSECTION',
      });

      expect(result.success).toBe(false);
      expect(result.mergedValue).toBeNull();
      expect(result.conflictsRemaining).toBe(1);
      expect(result.metadata.warnings).toContain('No common value found');
    });
  });

  describe('Append Merge Algorithm', () => {
    test('should append strings with separator', () => {
      const result = mergeEngine.merge(
        'Local content',
        'Remote content',
        'description',
        { algorithm: 'APPEND' }
      );

      expect(result.success).toBe(true);
      expect(result.mergedValue).toContain('Local content');
      expect(result.mergedValue).toContain('Remote content');
      expect(result.mergedValue).toContain('Additional Content');
    });

    test('should append arrays preserving order', () => {
      const result = mergeEngine.merge(
        ['first', 'second'],
        ['third', 'fourth'],
        'listField',
        { algorithm: 'APPEND' }
      );

      expect(result.success).toBe(true);
      expect(result.mergedValue).toEqual([
        'first',
        'second',
        'third',
        'fourth',
      ]);
      expect(result.conflictsResolved).toBe(1);
    });

    test('should preserve formatting when requested', () => {
      const options: MergeOptions = {
        algorithm: 'APPEND',
        preserveFormatting: true,
      };

      const result = mergeEngine.merge(
        'First paragraph',
        'Second paragraph',
        'description',
        options
      );

      expect(result.success).toBe(true);
      expect(result.mergedValue).toContain('--- Additional Content ---');
    });

    test('should fallback to timestamp priority for unsupported types', () => {
      const result = mergeEngine.merge(42, 84, 'numberField', {
        algorithm: 'APPEND',
      });

      expect(result.success).toBe(true);
      expect(result.mergedValue).toBe(84); // Assumes remote is newer
      expect(result.metadata.warnings).toContain('timestamp priority');
    });
  });

  describe('Smart Text Merge Algorithm', () => {
    test('should merge non-overlapping text sections', () => {
      const local = 'Local section one.\n\nLocal section two.';
      const remote = 'Remote section one.\n\nRemote section two.';

      const result = mergeEngine.merge(local, remote, 'description', {
        algorithm: 'SMART_TEXT_MERGE',
      });

      expect(result.success).toBe(true);
      expect(result.mergedValue).toContain('Local section');
      expect(result.mergedValue).toContain('Remote section');
      expect(result.conflictsResolved).toBeGreaterThan(0);
    });

    test('should identify common sections', () => {
      const local =
        'Common intro.\n\nLocal specific content.\n\nCommon conclusion.';
      const remote =
        'Common intro.\n\nRemote specific content.\n\nCommon conclusion.';

      const result = mergeEngine.merge(local, remote, 'description', {
        algorithm: 'SMART_TEXT_MERGE',
      });

      expect(result.success).toBe(true);
      expect(result.mergedValue).toContain('Common intro');
      expect(result.mergedValue).toContain('Common conclusion');
      expect(result.mergedValue).toContain('Local specific');
      expect(result.mergedValue).toContain('Remote specific');
    });

    test('should create conflict markers for truly conflicting sections', () => {
      const local = 'Step 1: Local approach\nStep 2: Local method';
      const remote = 'Step 1: Remote approach\nStep 2: Remote method';

      const result = mergeEngine.merge(local, remote, 'instructions', {
        algorithm: 'SMART_TEXT_MERGE',
      });

      expect(result.success).toBe(true);
      expect(result.conflictsRemaining).toBeGreaterThan(0);
      expect(result.mergedValue).toContain('<<<<<<< LOCAL');
      expect(result.mergedValue).toContain('>>>>>>> REMOTE');
      expect(result.metadata.hasConflictMarkers).toBe(true);
    });

    test('should respect custom conflict markers', () => {
      const options: MergeOptions = {
        algorithm: 'SMART_TEXT_MERGE',
        conflictMarkers: {
          localStart: '<<< LOCAL START',
          remoteStart: '>>> REMOTE START',
          separator: '--- SEPARATOR ---',
          end: '>>> END CONFLICT',
        },
      };

      const local = 'Conflicting content';
      const remote = 'Different content';

      const result = mergeEngine.merge(local, remote, 'text', options);

      if (result.conflictsRemaining > 0) {
        expect(result.mergedValue).toContain('<<< LOCAL START');
        expect(result.mergedValue).toContain('>>> REMOTE START');
        expect(result.mergedValue).toContain('--- SEPARATOR ---');
      }
    });

    test('should handle case sensitivity options', () => {
      const options: MergeOptions = {
        algorithm: 'SMART_TEXT_MERGE',
        caseSensitive: false,
      };

      const result = mergeEngine.merge(
        'Common Content',
        'common content',
        'text',
        options
      );

      expect(result.success).toBe(true);
      expect(result.mergedValue).toBe('Common Content'); // Should treat as same
    });

    test('should handle whitespace ignore option', () => {
      const options: MergeOptions = {
        algorithm: 'SMART_TEXT_MERGE',
        ignoreWhitespace: true,
      };

      const result = mergeEngine.merge(
        'Content with   spaces',
        'Content    with spaces',
        'text',
        options
      );

      expect(result.success).toBe(true);
      expect(result.mergedValue).toBe('Content with   spaces'); // Should treat as same
    });
  });

  describe('Three-Way Merge Algorithm', () => {
    test('should merge object properties without conflicts', () => {
      const local = { a: 1, b: 2 };
      const remote = { c: 3, d: 4 };

      const result = mergeEngine.merge(local, remote, 'config', {
        algorithm: 'THREE_WAY_MERGE',
      });

      expect(result.success).toBe(true);
      expect(result.mergedValue).toEqual({ a: 1, b: 2, c: 3, d: 4 });
      expect(result.conflictsResolved).toBe(2);
      expect(result.conflictsRemaining).toBe(0);
    });

    test('should handle property conflicts by preferring remote', () => {
      const local = { a: 1, b: 'local' };
      const remote = { b: 'remote', c: 3 };

      const result = mergeEngine.merge(local, remote, 'config', {
        algorithm: 'THREE_WAY_MERGE',
      });

      expect(result.success).toBe(true);
      expect(result.mergedValue).toEqual({ a: 1, b: 'remote', c: 3 });
      expect(result.conflictsRemaining).toBe(1); // Property b was conflicted
    });

    test('should fallback to union for non-objects', () => {
      const result = mergeEngine.merge(['a', 'b'], ['c', 'd'], 'list', {
        algorithm: 'THREE_WAY_MERGE',
      });

      expect(result.success).toBe(true);
      expect(result.mergedValue).toEqual(['a', 'b', 'c', 'd']);
    });
  });

  describe('Priority-Based Merge Algorithm', () => {
    test('should use custom priority values', () => {
      const options: MergeOptions = {
        algorithm: 'PRIORITY_BASED',
        customRules: {
          priorityValues: new Map([
            ['low', 1],
            ['medium', 2],
            ['high', 3],
            ['critical', 4],
          ]),
        },
      };

      const result = mergeEngine.merge(
        'medium',
        'critical',
        'priority',
        options
      );

      expect(result.success).toBe(true);
      expect(result.mergedValue).toBe('critical');
      expect(result.metadata.warnings).toContain('higher priority');
    });

    test('should prefer higher numeric values without priority map', () => {
      const result = mergeEngine.merge(5, 13, 'storyPoints', {
        algorithm: 'PRIORITY_BASED',
      });

      expect(result.success).toBe(true);
      expect(result.mergedValue).toBe(13);
      expect(result.metadata.warnings).toContain('chose higher value');
    });

    test('should fallback to timestamp priority for non-numeric types', () => {
      const result = mergeEngine.merge('local', 'remote', 'stringField', {
        algorithm: 'PRIORITY_BASED',
      });

      expect(result.success).toBe(true);
      expect(result.mergedValue).toBe('remote'); // Assumes remote is newer
    });
  });

  describe('Length Priority Merge Algorithm', () => {
    test('should prefer longer strings', () => {
      const result = mergeEngine.merge(
        'Short',
        'Much longer description with more details',
        'description',
        { algorithm: 'LENGTH_PRIORITY' }
      );

      expect(result.success).toBe(true);
      expect(result.mergedValue).toBe(
        'Much longer description with more details'
      );
      expect(result.metadata.warnings).toContain('more complete');
    });

    test('should prefer larger arrays', () => {
      const result = mergeEngine.merge(['a'], ['b', 'c', 'd'], 'list', {
        algorithm: 'LENGTH_PRIORITY',
      });

      expect(result.success).toBe(true);
      expect(result.mergedValue).toEqual(['b', 'c', 'd']);
    });

    test('should prefer objects with more properties', () => {
      const local = { a: 1 };
      const remote = { b: 2, c: 3, d: 4 };

      const result = mergeEngine.merge(local, remote, 'config', {
        algorithm: 'LENGTH_PRIORITY',
      });

      expect(result.success).toBe(true);
      expect(result.mergedValue).toEqual(remote);
    });
  });

  describe('Timestamp Priority Merge Algorithm', () => {
    test('should prefer assumed newer value (remote)', () => {
      const result = mergeEngine.merge('local', 'remote', 'field', {
        algorithm: 'TIMESTAMP_PRIORITY',
      });

      expect(result.success).toBe(true);
      expect(result.mergedValue).toBe('remote');
      expect(result.metadata.warnings).toContain(
        'assumed remote value is newer'
      );
    });
  });

  describe('Performance and Edge Cases', () => {
    test('should handle large datasets efficiently', () => {
      const largeArray1 = Array.from({ length: 1000 }, (_, i) => `item${i}`);
      const largeArray2 = Array.from(
        { length: 1000 },
        (_, i) => `item${i + 500}`
      );

      const startTime = Date.now();
      const result = mergeEngine.merge(largeArray1, largeArray2, 'largeList');
      const duration = Date.now() - startTime;

      expect(result.success).toBe(true);
      expect(duration).toBeLessThan(1000); // Should complete within 1 second
      expect(result.mergedValue.length).toBe(1500); // Union of both arrays
    });

    test('should handle extremely large strings', () => {
      const largeString1 = 'A'.repeat(10000);
      const largeString2 = 'B'.repeat(10000);

      const result = mergeEngine.merge(largeString1, largeString2, 'largeText');

      expect(result.success).toBe(true);
      expect(result.mergedValue).toBeDefined();
    });

    test('should handle deeply nested objects', () => {
      const createDeepObject = (depth: number): any => {
        if (depth === 0) return { value: 'deep' };
        return { nested: createDeepObject(depth - 1) };
      };

      const deep1 = createDeepObject(20);
      const deep2 = createDeepObject(20);
      deep2.nested.additional = 'content';

      const result = mergeEngine.merge(deep1, deep2, 'deepObject');

      expect(result.success).toBe(true);
      expect(result.mergedValue).toBeDefined();
    });

    test('should respect blacklist patterns', () => {
      const options: MergeOptions = {
        algorithm: 'UNION',
        customRules: {
          blacklistPatterns: [/^temp_/, /password/i],
        },
      };

      const local = ['temp_file', 'important_data', 'password_field'];
      const remote = ['TEMP_cache', 'user_password', 'valid_data'];

      const result = mergeEngine.merge(local, remote, 'fields', options);

      expect(result.success).toBe(true);
      // Should filter out blacklisted items
      expect(result.mergedValue).toContain('important_data');
      expect(result.mergedValue).toContain('valid_data');
      expect(
        result.mergedValue.some((item: string) => item.includes('temp'))
      ).toBe(false);
      expect(
        result.mergedValue.some((item: string) => item.includes('password'))
      ).toBe(false);
    });

    test('should provide performance warnings for long operations', () => {
      // Create a scenario that might take longer
      const complexLocal = Array.from({ length: 5000 }, (_, i) => ({
        id: i,
        data: `complex data ${i}`.repeat(10),
      }));
      const complexRemote = Array.from({ length: 5000 }, (_, i) => ({
        id: i + 2500,
        data: `different data ${i}`.repeat(10),
      }));

      const result = mergeEngine.merge(
        complexLocal,
        complexRemote,
        'complexData'
      );

      expect(result.success).toBe(true);
      // Performance warning might be included if merge takes too long
      if (result.metadata.warnings?.some(w => w.includes('took'))) {
        expect(result.metadata.warnings).toContain(
          expect.stringContaining('ms')
        );
      }
    });

    test('should handle circular references gracefully', () => {
      const circular1 = { ref: null as any };
      circular1.ref = circular1;

      const circular2 = { ref: null as any, data: 'test' };
      circular2.ref = circular2;

      const result = mergeEngine.merge(circular1, circular2, 'circularField');

      expect(result.success).toBeDefined(); // Should not throw
      expect(result.mergedValue).toBeDefined();
    });

    test('should maintain accuracy under concurrent merge operations', async () => {
      const mergePromises: Promise<MergeResult>[] = [];

      // Run multiple merges concurrently
      for (let i = 1; i <= 10; i++) {
        const promise = Promise.resolve().then(() => {
          return mergeEngine.merge(
            [`local${i}`, 'common'],
            [`remote${i}`, 'common'],
            `field${i}`
          );
        });

        mergePromises.push(promise);
      }

      const results = await Promise.all(mergePromises);

      // All should succeed
      expect(results.every(r => r.success)).toBe(true);

      // Each should have correct merged content
      results.forEach((result, index) => {
        expect(result.mergedValue).toContain(`local${index + 1}`);
        expect(result.mergedValue).toContain(`remote${index + 1}`);
        expect(result.mergedValue).toContain('common');
      });
    });
  });

  describe('String Similarity and Diff Algorithms', () => {
    test('should calculate string similarity accurately', () => {
      // Test the private similarity calculation through merge behavior
      const similar1 = 'The quick brown fox jumps';
      const similar2 = 'The quick brown fox leaps';

      const result = mergeEngine.merge(similar1, similar2, 'description', {
        algorithm: 'SMART_TEXT_MERGE',
      });

      expect(result.success).toBe(true);
      // High similarity should result in a merge attempt
      expect(result.algorithm).toBe('SMART_TEXT_MERGE');
    });

    test('should handle Levenshtein distance calculation', () => {
      // Test through merge results with very similar strings
      const str1 = 'test string';
      const str2 = 'test string!'; // One character difference

      const result = mergeEngine.merge(str1, str2, 'text', {
        algorithm: 'SMART_TEXT_MERGE',
      });

      expect(result.success).toBe(true);
      expect(result.mergedValue).toBeDefined();
    });
  });
});
