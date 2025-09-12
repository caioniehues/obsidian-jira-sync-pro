/**
 * Property Flattener Unit Tests
 * Comprehensive test suite for object flattening functionality
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  PropertyFlattener,
  FlatteningOptions,
  FlatteningResult,
  quickFlatten,
  flattenWithTiming,
  createJiraFlattener,
  createMinimalFlattener,
  batchFlatten,
  validateDataviewKeys,
} from '../../src/utils/property-flattener';

describe('PropertyFlattener', () => {
  let flattener: PropertyFlattener;
  let testObject: any;
  let complexObject: any;
  let jiraLikeObject: any;

  beforeEach(() => {
    flattener = new PropertyFlattener();

    testObject = {
      name: 'Test Object',
      value: 42,
      active: true,
      created: '2024-01-15T10:30:00Z',
      metadata: {
        author: 'John Doe',
        version: '1.0.0',
        settings: {
          theme: 'dark',
          language: 'en',
        },
      },
      tags: ['frontend', 'urgent'],
      nullValue: null,
      undefinedValue: undefined,
    };

    complexObject = {
      id: 'complex-123',
      deeply: {
        nested: {
          structure: {
            with: {
              many: {
                levels: {
                  value: 'deep value',
                },
              },
            },
          },
        },
      },
      arrayOfObjects: [
        { id: 1, name: 'First' },
        { id: 2, name: 'Second' },
        { id: 3, name: 'Third' },
      ],
      arrayOfPrimitives: [1, 2, 3, 'four', true],
      emptyArray: [],
      dateObject: new Date('2024-01-15T10:30:00Z'),
      mixedTypes: {
        string: 'text',
        number: 123,
        boolean: false,
        date: '2024-01-15',
        array: ['a', 'b', 'c'],
      },
    };

    jiraLikeObject = {
      key: 'TEST-123',
      summary: 'Test Issue',
      status: {
        id: '3',
        name: 'In Progress',
        statusCategory: {
          key: 'indeterminate',
          name: 'In Progress',
        },
      },
      assignee: {
        accountId: 'user123',
        displayName: 'John Doe',
        emailAddress: 'john@example.com',
        avatarUrls: {
          '32x32': 'https://avatar.url',
        },
      },
      components: [
        { id: '100', name: 'Frontend' },
        { id: '101', name: 'Backend' },
      ],
      labels: ['urgent', 'customer-facing'],
      customfield_10020: 8,
      self: 'https://jira.example.com/issue/123',
      expand: 'operations,versionedRepresentations',
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Constructor', () => {
    it('should initialize with default options', () => {
      const defaultFlattener = new PropertyFlattener();
      expect(defaultFlattener).toBeInstanceOf(PropertyFlattener);
    });

    it('should initialize with custom options', () => {
      const customOptions: FlatteningOptions = {
        separator: '.',
        maxDepth: 3,
        preserveArrays: false,
        skipNullValues: false,
        camelCase: true,
        prefix: 'custom',
      };

      const customFlattener = new PropertyFlattener(customOptions);
      expect(customFlattener).toBeInstanceOf(PropertyFlattener);
    });

    it('should merge partial options with defaults', () => {
      const partialOptions: FlatteningOptions = {
        separator: '.',
        maxDepth: 2,
      };

      const customFlattener = new PropertyFlattener(partialOptions);
      expect(customFlattener).toBeInstanceOf(PropertyFlattener);
    });
  });

  describe('Basic Flattening', () => {
    it('should flatten simple object', () => {
      const simple = { name: 'test', value: 42 };
      const result = flattener.flatten(simple);

      expect(result.flattened).toEqual({
        name: 'test',
        value: 42,
      });
      expect(result.metadata.flattenedKeys).toBe(2);
    });

    it('should handle nested objects', () => {
      const result = flattener.flatten(testObject);

      expect(result.flattened.name).toBe('Test Object');
      expect(result.flattened.value).toBe(42);
      expect(result.flattened.active).toBe(true);
      expect(result.flattened.metadata_author).toBe('John Doe');
      expect(result.flattened.metadata_version).toBe('1.0.0');
      expect(result.flattened.metadata_settings_theme).toBe('dark');
      expect(result.flattened.metadata_settings_language).toBe('en');
    });

    it('should handle arrays when preserveArrays is true', () => {
      const result = flattener.flatten(testObject);

      expect(result.flattened.tags).toEqual(['frontend', 'urgent']);
      expect(result.flattened.tags_count).toBe(2);
      expect(result.flattened.tags_first).toBe('frontend');
    });

    it('should handle null values correctly', () => {
      const result = flattener.flatten(testObject);

      // Should skip null values by default
      expect(result.flattened.nullValue).toBeUndefined();
      expect(result.flattened.undefinedValue).toBeUndefined();
    });

    it('should include null values when skipNullValues is false', () => {
      const inclusiveFlattener = new PropertyFlattener({
        skipNullValues: false,
      });
      const result = inclusiveFlattener.flatten(testObject);

      expect(result.flattened.null_value).toBe(null);
    });
  });

  describe('Array Handling', () => {
    it('should flatten arrays of objects', () => {
      const result = flattener.flatten(complexObject);

      expect(result.flattened.array_of_objects_count).toBe(3);
      expect(result.flattened.array_of_objects_first_id).toBe(1);
      expect(result.flattened.array_of_objects_first_name).toBe('First');
      expect(result.flattened.array_of_objects_0_id).toBe(1);
      expect(result.flattened.array_of_objects_1_name).toBe('Second');
      expect(result.flattened.array_of_objects_last_name).toBe('Third');
    });

    it('should handle arrays of primitives', () => {
      const result = flattener.flatten(complexObject);

      expect(result.flattened.array_of_primitives).toEqual([
        1,
        2,
        3,
        'four',
        true,
      ]);
      expect(result.flattened.array_of_primitives_count).toBe(5);
      expect(result.flattened.array_of_primitives_first).toBe(1);
    });

    it('should handle empty arrays', () => {
      const result = flattener.flatten(complexObject);

      expect(result.flattened.empty_array).toEqual([]);
    });

    it('should not preserve arrays when preserveArrays is false', () => {
      const noArrayFlattener = new PropertyFlattener({ preserveArrays: false });
      const result = noArrayFlattener.flatten(complexObject);

      expect(result.flattened.array_of_primitives).toBeUndefined();
      expect(result.flattened.array_of_primitives_first).toBe(1);
      expect(result.flattened.array_of_primitives_count).toBe(5);
    });
  });

  describe('Depth Limiting', () => {
    it('should respect maxDepth setting', () => {
      const shallowFlattener = new PropertyFlattener({ maxDepth: 2 });
      const result = shallowFlattener.flatten(complexObject);

      // Should not flatten beyond 2 levels
      expect(result.flattened.deeply_nested_structure).toBeDefined();
      expect(
        result.flattened.deeply_nested_structure_with_many_levels_value
      ).toBeUndefined();
      expect(result.metadata.maxDepthReached).toBe(2);
    });

    it('should track skipped keys due to depth limit', () => {
      const shallowFlattener = new PropertyFlattener({ maxDepth: 1 });
      const result = shallowFlattener.flatten(complexObject);

      expect(result.metadata.skippedKeys.length).toBeGreaterThan(0);
      expect(
        result.metadata.skippedKeys.some(key =>
          key.includes('max depth exceeded')
        )
      ).toBe(true);
    });
  });

  describe('Naming Conventions', () => {
    it('should use snake_case by default', () => {
      const camelCaseObject = {
        firstName: 'John',
        lastName: 'Doe',
        personalInfo: {
          birthDate: '1990-01-01',
          homeAddress: '123 Main St',
        },
      };

      const result = flattener.flatten(camelCaseObject);

      expect(result.flattened.first_name).toBe('John');
      expect(result.flattened.last_name).toBe('Doe');
      expect(result.flattened.personal_info_birth_date).toBe('1990-01-01');
      expect(result.flattened.personal_info_home_address).toBe('123 Main St');
    });

    it('should use camelCase when specified', () => {
      const camelFlattener = new PropertyFlattener({
        camelCase: true,
        snakeCase: false,
      });
      const snake_case_object = {
        first_name: 'John',
        last_name: 'Doe',
        personal_info: {
          birth_date: '1990-01-01',
        },
      };

      const result = camelFlattener.flatten(snake_case_object);

      expect(result.flattened.firstName).toBe('John');
      expect(result.flattened.lastName).toBe('Doe');
      expect(result.flattened.personalInfoBirthDate).toBe('1990-01-01');
    });

    it('should use custom separator', () => {
      const dotFlattener = new PropertyFlattener({ separator: '.' });
      const result = dotFlattener.flatten(testObject);

      expect(result.flattened['metadata.author']).toBe('John Doe');
      expect(result.flattened['metadata.settings.theme']).toBe('dark');
    });

    it('should add prefix when specified', () => {
      const prefixFlattener = new PropertyFlattener({ prefix: 'jira' });
      const result = prefixFlattener.flatten({
        key: 'TEST-123',
        summary: 'Test',
      });

      expect(result.flattened.jira_key).toBe('TEST-123');
      expect(result.flattened.jira_summary).toBe('Test');
    });
  });

  describe('Key Filtering', () => {
    it('should exclude specified keys', () => {
      const filteringFlattener = new PropertyFlattener({
        excludeKeys: ['self', 'expand', 'avatarUrls'],
      });
      const result = filteringFlattener.flatten(jiraLikeObject);

      expect(result.flattened.self).toBeUndefined();
      expect(result.flattened.expand).toBeUndefined();
      expect(result.flattened.assignee_avatar_urls).toBeUndefined();
      expect(result.metadata.skippedKeys).toContain('self');
      expect(result.metadata.skippedKeys).toContain('expand');
    });

    it('should only include specified keys', () => {
      const selectiveFlattener = new PropertyFlattener({
        includeKeys: ['key', 'summary', 'status'],
      });
      const result = selectiveFlattener.flatten(jiraLikeObject);

      expect(result.flattened.key).toBe('TEST-123');
      expect(result.flattened.summary).toBe('Test Issue');
      expect(result.flattened.status_name).toBe('In Progress');
      expect(result.flattened.assignee_display_name).toBeUndefined();
      expect(result.flattened.components_count).toBeUndefined();
    });

    it('should skip private properties by default', () => {
      const objectWithPrivate = {
        publicProp: 'public',
        _privateProp: 'private',
        __internalProp: 'internal',
        constructor: 'constructor',
      };

      const result = flattener.flatten(objectWithPrivate);

      expect(result.flattened.public_prop).toBe('public');
      expect(result.flattened._private_prop).toBeUndefined();
      expect(result.flattened.__internal_prop).toBeUndefined();
      expect(result.flattened.constructor).toBeUndefined();
    });
  });

  describe('Type Conversion', () => {
    it('should convert date strings when typeConversion is enabled', () => {
      const typeFlattener = new PropertyFlattener({ typeConversion: true });
      const dateObject = {
        created_date: '2024-01-15T10:30:00Z',
        updated_time: '2024-01-16T15:45:00Z',
        regular_string: 'not a date',
      };

      const result = typeFlattener.flatten(dateObject);

      expect(result.metadata.typeConversions.length).toBeGreaterThan(0);
      const dateConversion = result.metadata.typeConversions.find(
        tc => tc.key === 'created_date' && tc.to === 'string'
      );
      expect(dateConversion).toBeDefined();
    });

    it('should convert string numbers when appropriate', () => {
      const typeFlattener = new PropertyFlattener({ typeConversion: true });
      const numberObject = {
        count_field: '42',
        id_number: '12345',
        regular_string: 'hello',
      };

      const result = typeFlattener.flatten(numberObject);

      expect(result.flattened.count_field).toBe(42);
      expect(result.flattened.id_number).toBe(12345);
      expect(result.flattened.regular_string).toBe('hello');
    });

    it('should convert string booleans', () => {
      const typeFlattener = new PropertyFlattener({ typeConversion: true });
      const boolObject = {
        is_true: 'true',
        is_false: 'FALSE',
        regular_string: 'maybe',
      };

      const result = typeFlattener.flatten(boolObject);

      expect(result.flattened.is_true).toBe(true);
      expect(result.flattened.is_false).toBe(false);
      expect(result.flattened.regular_string).toBe('maybe');
    });

    it('should handle Date objects correctly', () => {
      const result = flattener.flatten(complexObject);

      expect(typeof result.flattened.date_object).toBe('string');
      expect(result.flattened.date_object).toBe('2024-01-15T10:30:00.000Z');
    });

    it('should not perform type conversion when disabled', () => {
      const noTypeFlattener = new PropertyFlattener({ typeConversion: false });
      const dateObject = {
        created_date: '2024-01-15T10:30:00Z',
        count_field: '42',
      };

      const result = noTypeFlattener.flatten(dateObject);

      expect(result.metadata.typeConversions).toHaveLength(0);
      expect(result.flattened.created_date).toBe('2024-01-15T10:30:00Z');
      expect(result.flattened.count_field).toBe('42');
    });
  });

  describe('Performance Monitoring', () => {
    it('should track processing time', () => {
      const result = flattener.flattenWithMetrics(complexObject);

      expect(typeof result.processingTime).toBe('number');
      expect(result.processingTime).toBeGreaterThanOrEqual(0);
    });

    it('should provide metadata about flattening', () => {
      const result = flattener.flatten(complexObject);

      expect(result.metadata.originalKeys).toBeGreaterThan(0);
      expect(result.metadata.flattenedKeys).toBeGreaterThan(
        result.metadata.originalKeys
      );
      expect(result.metadata.maxDepthReached).toBeGreaterThan(0);
      expect(Array.isArray(result.metadata.skippedKeys)).toBe(true);
      expect(Array.isArray(result.metadata.typeConversions)).toBe(true);
    });
  });

  describe('Factory Functions', () => {
    it('should create Jira-optimized flattener', () => {
      const jiraFlattener = PropertyFlattener.createJiraFlattener();
      expect(jiraFlattener).toBeInstanceOf(PropertyFlattener);

      const result = jiraFlattener.flatten(jiraLikeObject);

      // Should exclude typical Jira noise fields
      expect(result.flattened.self).toBeUndefined();
      expect(result.flattened.expand).toBeUndefined();
      expect(result.flattened.key).toBe('TEST-123');
    });

    it('should create fast flattener with performance optimizations', () => {
      const fastFlattener = PropertyFlattener.createFastFlattener();
      expect(fastFlattener).toBeInstanceOf(PropertyFlattener);

      const result = fastFlattener.flatten(complexObject);

      // Should have shallow depth and no type conversion
      expect(result.metadata.maxDepthReached).toBeLessThanOrEqual(2);
      expect(result.metadata.typeConversions).toHaveLength(0);
    });
  });

  describe('Utility Functions', () => {
    it('should provide quick flatten function', () => {
      const result = quickFlatten(testObject);

      expect(result.name).toBe('Test Object');
      expect(result.metadata_author).toBe('John Doe');
    });

    it('should provide flatten with timing function', () => {
      const result = flattenWithTiming(testObject);

      expect(result.result.name).toBe('Test Object');
      expect(typeof result.time).toBe('number');
      expect(result.metadata.flattenedKeys).toBeGreaterThan(0);
    });

    it('should create Jira flattener function', () => {
      const jiraFlattener = createJiraFlattener();
      const result = jiraFlattener.flatten(jiraLikeObject);

      expect(result.flattened.key).toBe('TEST-123');
      expect(result.flattened.self).toBeUndefined();
    });

    it('should create minimal flattener function', () => {
      const minimalFlattener = createMinimalFlattener();
      const result = minimalFlattener.flatten(complexObject);

      expect(result.metadata.maxDepthReached).toBeLessThanOrEqual(2);
    });

    it('should provide batch flatten function', () => {
      const objects = [
        { name: 'First', value: 1 },
        { name: 'Second', value: 2 },
        { name: 'Third', value: 3 },
      ];

      const results = batchFlatten(objects);

      expect(results).toHaveLength(3);
      expect(results[0].flattened.name).toBe('First');
      expect(results[1].flattened.value).toBe(2);
      expect(results[2].flattened.name).toBe('Third');
    });
  });

  describe('Dataview Key Validation', () => {
    it('should validate correct Dataview keys', () => {
      const validKeys = {
        jira_key: 'TEST-123',
        issue_type: 'Story',
        created_date: '2024-01-15',
        story_points: 8,
      };

      const result = validateDataviewKeys(validKeys);

      expect(result.valid).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    it('should detect invalid key formats', () => {
      const invalidKeys = {
        '123invalid': 'starts with number',
        'has-spaces in-key': 'contains spaces',
        'has@special#chars': 'special characters',
      };

      const result = validateDataviewKeys(invalidKeys);

      expect(result.valid).toBe(false);
      expect(result.issues.length).toBeGreaterThan(0);
      expect(
        result.issues.some(issue => issue.includes('Invalid key format'))
      ).toBe(true);
    });

    it('should detect reserved Dataview properties', () => {
      const reservedKeys = {
        file: 'reserved',
        path: 'reserved',
        name: 'reserved',
        folder: 'reserved',
        extension: 'reserved',
      };

      const result = validateDataviewKeys(reservedKeys);

      expect(result.valid).toBe(false);
      expect(result.issues.length).toBe(5);
      expect(
        result.issues.every(issue =>
          issue.includes('Reserved Dataview property')
        )
      ).toBe(true);
    });

    it('should detect excessively long keys', () => {
      const longKey = 'a'.repeat(101); // 101 characters
      const keysWithLongKey = {
        [longKey]: 'value',
      };

      const result = validateDataviewKeys(keysWithLongKey);

      expect(result.valid).toBe(false);
      expect(result.issues.some(issue => issue.includes('Key too long'))).toBe(
        true
      );
    });
  });

  describe('Edge Cases', () => {
    it('should handle circular references gracefully', () => {
      const circular: any = { name: 'circular' };
      circular.self = circular;

      // Should not throw, but may skip the circular reference
      expect(() => flattener.flatten(circular)).not.toThrow();
    });

    it('should handle very deep nesting', () => {
      const deep: any = {};
      let current = deep;

      // Create 10 levels deep
      for (let i = 0; i < 10; i++) {
        current.level = i;
        current.next = {};
        current = current.next;
      }
      current.finalValue = 'deep';

      const result = flattener.flatten(deep);

      expect(result.flattened.level).toBe(0);
      expect(result.metadata.maxDepthReached).toBeGreaterThan(0);
    });

    it('should handle empty objects', () => {
      const result = flattener.flatten({});

      expect(result.flattened).toEqual({});
      expect(result.metadata.flattenedKeys).toBe(0);
    });

    it('should handle primitive values as root', () => {
      const stringResult = flattener.flatten('simple string', 'root');
      const numberResult = flattener.flatten(42, 'root');
      const boolResult = flattener.flatten(true, 'root');

      expect(stringResult.flattened.root).toBe('simple string');
      expect(numberResult.flattened.root).toBe(42);
      expect(boolResult.flattened.root).toBe(true);
    });

    it('should handle arrays as root', () => {
      const arrayResult = flattener.flatten([1, 2, 3], 'root');

      expect(arrayResult.flattened.root).toEqual([1, 2, 3]);
      expect(arrayResult.flattened.root_count).toBe(3);
    });
  });
});
