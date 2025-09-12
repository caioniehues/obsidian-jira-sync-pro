/**
 * Field Mappings Unit Tests
 * Test suite for field mapping and transformation utilities
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  FieldMappingEngine,
  TransformationResult,
  createDefaultMappingConfig,
  loadMappingConfig,
  saveMappingConfig,
} from '../../src/utils/field-mappings';
import { BasePropertyType } from '../../src/types/base-types';
import { JiraFieldType } from '../../src/types/jira-types';
import { MockData } from '../fixtures/mock-data';

describe('FieldMappingEngine', () => {
  let mappingEngine: FieldMappingEngine;

  beforeEach(() => {
    mappingEngine = new FieldMappingEngine(MockData.mapping.config);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Constructor', () => {
    it('should initialize with valid configuration', () => {
      expect(mappingEngine).toBeInstanceOf(FieldMappingEngine);
    });

    it('should initialize default transformers', () => {
      // Test that some default transformers are available
      const transformers = (mappingEngine as any).transformers;
      expect(transformers.has('string_to_text')).toBe(true);
      expect(transformers.has('number_to_number')).toBe(true);
      expect(transformers.has('user_to_user')).toBe(true);
    });
  });

  describe('mapJiraFieldToBaseType', () => {
    it('should map string field to text type', () => {
      const jiraField = MockData.jira.fields.find(f => f.id === 'summary')!;
      const baseType = mappingEngine.mapJiraFieldToBaseType(jiraField);

      expect(baseType).toBe(BasePropertyType.TEXT);
    });

    it('should map number field to number type', () => {
      const jiraField = MockData.jira.fields.find(
        f => f.schema.type === JiraFieldType.NUMBER
      )!;
      const baseType = mappingEngine.mapJiraFieldToBaseType(jiraField);

      expect(baseType).toBe(BasePropertyType.NUMBER);
    });

    it('should map user field to user type', () => {
      const jiraField = MockData.jira.fields.find(f => f.id === 'assignee')!;
      const baseType = mappingEngine.mapJiraFieldToBaseType(jiraField);

      expect(baseType).toBe(BasePropertyType.USER);
    });

    it('should map array of options to multi-select', () => {
      const jiraField = {
        ...MockData.jira.fields[0],
        schema: {
          type: JiraFieldType.ARRAY,
          items: 'option',
        },
      };

      const baseType = mappingEngine.mapJiraFieldToBaseType(jiraField);
      expect(baseType).toBe(BasePropertyType.MULTI_SELECT);
    });

    it('should map option field to select', () => {
      const jiraField = {
        ...MockData.jira.fields[0],
        schema: {
          type: JiraFieldType.OPTION,
        },
      };

      const baseType = mappingEngine.mapJiraFieldToBaseType(jiraField);
      expect(baseType).toBe(BasePropertyType.SELECT);
    });

    it('should determine text subtype based on field name', () => {
      const emailField = {
        ...MockData.jira.fields[0],
        name: 'Email Address',
        key: 'emailaddress',
      };

      const baseType = mappingEngine.mapJiraFieldToBaseType(emailField);
      expect(baseType).toBe(BasePropertyType.EMAIL);
    });
  });

  describe('createBaseConstraints', () => {
    it('should create constraints for select field', () => {
      const jiraField = {
        ...MockData.jira.fields[0],
        schema: {
          type: JiraFieldType.OPTION,
          configuration: {
            options: [
              { id: '1', value: 'High' },
              { id: '2', value: 'Medium' },
              { id: '3', value: 'Low' },
            ],
          },
        },
      };

      const constraints = mappingEngine.createBaseConstraints(jiraField);

      expect(constraints.options).toHaveLength(3);
      expect(constraints.options![0]).toEqual({
        id: '1',
        name: 'High',
        color: undefined,
      });
    });

    it('should create constraints for text field with length limit', () => {
      const jiraField = {
        ...MockData.jira.fields[0],
        schema: {
          type: JiraFieldType.STRING,
          configuration: {
            maxLength: '255',
            pattern: '^[A-Z].*',
          },
        },
      };

      const constraints = mappingEngine.createBaseConstraints(jiraField);

      expect(constraints.maxLength).toBe(255);
      expect(constraints.pattern).toBe('^[A-Z].*');
    });

    it('should create constraints for number field with range', () => {
      const jiraField = {
        ...MockData.jira.fields[0],
        schema: {
          type: JiraFieldType.NUMBER,
          configuration: {
            min: '0',
            max: '100',
          },
        },
      };

      const constraints = mappingEngine.createBaseConstraints(jiraField);

      expect(constraints.min).toBe(0);
      expect(constraints.max).toBe(100);
    });

    it('should handle empty configuration', () => {
      const jiraField = {
        ...MockData.jira.fields[0],
        schema: {
          type: JiraFieldType.STRING,
          configuration: {},
        },
      };

      const constraints = mappingEngine.createBaseConstraints(jiraField);

      expect(Object.keys(constraints)).toHaveLength(0);
    });
  });

  describe('transformJiraToBase', () => {
    it('should transform string value to text', async () => {
      const jiraField = MockData.jira.fields.find(f => f.id === 'summary')!;
      const baseProperty = MockData.base.properties.find(
        p => p.id === 'title'
      )!;

      const result = await mappingEngine.transformJiraToBase(
        'Test Summary',
        jiraField,
        baseProperty
      );

      expect(result.success).toBe(true);
      expect(result.value).toBe('Test Summary');
    });

    it('should transform number value', async () => {
      const jiraField = MockData.jira.fields.find(
        f => f.schema.type === JiraFieldType.NUMBER
      )!;
      const baseProperty = MockData.base.properties.find(
        p => p.type === BasePropertyType.NUMBER
      )!;

      const result = await mappingEngine.transformJiraToBase(
        8.5,
        jiraField,
        baseProperty
      );

      expect(result.success).toBe(true);
      expect(result.value).toBe(8.5);
    });

    it('should transform user object', async () => {
      const jiraField = MockData.jira.fields.find(f => f.id === 'assignee')!;
      const baseProperty = MockData.base.properties.find(
        p => p.type === BasePropertyType.USER
      )!;

      const result = await mappingEngine.transformJiraToBase(
        MockData.jira.user,
        jiraField,
        baseProperty
      );

      expect(result.success).toBe(true);
      expect(result.value).toMatchObject({
        id: MockData.jira.user.accountId,
        name: MockData.jira.user.displayName,
        email: MockData.jira.user.emailAddress,
      });
    });

    it('should handle null values with default', async () => {
      const jiraField = MockData.jira.fields.find(f => f.id === 'summary')!;
      const baseProperty = {
        ...MockData.base.properties.find(p => p.id === 'title')!,
        defaultValue: 'Default Title',
      };

      const result = await mappingEngine.transformJiraToBase(
        null,
        jiraField,
        baseProperty
      );

      expect(result.success).toBe(true);
      expect(result.value).toBe('Default Title');
    });

    it('should handle transformation errors', async () => {
      const jiraField = {
        ...MockData.jira.fields[0],
        schema: { type: 'invalid_type' as JiraFieldType },
      };
      const baseProperty = MockData.base.properties[0];

      const result = await mappingEngine.transformJiraToBase(
        'test value',
        jiraField,
        baseProperty
      );

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors!.length).toBeGreaterThan(0);
    });

    it('should validate transformed value against constraints', async () => {
      const jiraField = MockData.jira.fields.find(f => f.id === 'summary')!;
      const baseProperty = {
        ...MockData.base.properties.find(p => p.id === 'title')!,
        required: true,
        constraints: { maxLength: 10 },
      };

      const result = await mappingEngine.transformJiraToBase(
        'This is a very long title that exceeds the limit',
        jiraField,
        baseProperty
      );

      expect(result.success).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          message: expect.stringContaining('exceed'),
        })
      );
    });
  });

  describe('transformBaseToJira', () => {
    it('should transform text to string', async () => {
      const baseProperty = MockData.base.properties.find(
        p => p.id === 'title'
      )!;
      const jiraField = MockData.jira.fields.find(f => f.id === 'summary')!;

      const result = await mappingEngine.transformBaseToJira(
        'Test Title',
        baseProperty,
        jiraField
      );

      expect(result.success).toBe(true);
      expect(result.value).toBe('Test Title');
    });

    it('should transform user object to Jira user format', async () => {
      const baseProperty = MockData.base.properties.find(
        p => p.type === BasePropertyType.USER
      )!;
      const jiraField = MockData.jira.fields.find(f => f.id === 'assignee')!;
      const baseUser = {
        id: 'user123',
        name: 'John Doe',
        email: 'john@example.com',
      };

      const result = await mappingEngine.transformBaseToJira(
        baseUser,
        baseProperty,
        jiraField
      );

      expect(result.success).toBe(true);
      expect(result.value).toMatchObject({
        accountId: 'user123',
        displayName: 'John Doe',
      });
    });

    it('should handle null values', async () => {
      const baseProperty = MockData.base.properties[0];
      const jiraField = MockData.jira.fields[0];

      const result = await mappingEngine.transformBaseToJira(
        null,
        baseProperty,
        jiraField
      );

      expect(result.success).toBe(true);
      expect(result.value).toBe(null);
    });

    it('should handle transformation errors in reverse direction', async () => {
      const baseProperty = {
        ...MockData.base.properties[0],
        type: 'invalid_type' as BasePropertyType,
      };
      const jiraField = MockData.jira.fields[0];

      const result = await mappingEngine.transformBaseToJira(
        'test value',
        baseProperty,
        jiraField
      );

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
    });
  });

  describe('getMappingByJiraField', () => {
    it('should find mapping by Jira field ID', () => {
      const mapping = mappingEngine.getMappingByJiraField('summary');

      expect(mapping).toBeDefined();
      expect(mapping!.basePropertyId).toBe('title');
    });

    it('should return undefined for non-existent field', () => {
      const mapping = mappingEngine.getMappingByJiraField('nonexistent');

      expect(mapping).toBeUndefined();
    });
  });

  describe('getMappingByBaseProperty', () => {
    it('should find mapping by Base property ID', () => {
      const mapping = mappingEngine.getMappingByBaseProperty('title');

      expect(mapping).toBeDefined();
      expect(mapping!.jiraFieldId).toBe('summary');
    });

    it('should return undefined for non-existent property', () => {
      const mapping = mappingEngine.getMappingByBaseProperty('nonexistent');

      expect(mapping).toBeUndefined();
    });
  });

  describe('validateConfig', () => {
    it('should validate correct configuration', () => {
      const result = mappingEngine.validateConfig();

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect duplicate Jira field mappings', () => {
      const duplicateConfig = {
        ...MockData.mapping.config,
        mappings: [
          ...MockData.mapping.config.mappings,
          {
            jiraFieldId: 'summary', // Duplicate
            jiraFieldName: 'Summary Duplicate',
            basePropertyId: 'duplicate_title',
            basePropertyName: 'Duplicate Title',
            bidirectional: true,
          },
        ],
      };

      const engine = new FieldMappingEngine(duplicateConfig);
      const result = engine.validateConfig();

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.stringContaining('Duplicate Jira field mapping: summary')
      );
    });

    it('should detect duplicate Base property mappings', () => {
      const duplicateConfig = {
        ...MockData.mapping.config,
        mappings: [
          ...MockData.mapping.config.mappings,
          {
            jiraFieldId: 'summary_duplicate',
            jiraFieldName: 'Summary Duplicate',
            basePropertyId: 'title', // Duplicate
            basePropertyName: 'Title Duplicate',
            bidirectional: true,
          },
        ],
      };

      const engine = new FieldMappingEngine(duplicateConfig);
      const result = engine.validateConfig();

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.stringContaining('Duplicate Base property mapping: title')
      );
    });

    it('should validate missing field IDs', () => {
      const invalidConfig = {
        ...MockData.mapping.config,
        mappings: [
          {
            jiraFieldId: '',
            jiraFieldName: 'Invalid Field',
            basePropertyId: 'invalid_prop',
            basePropertyName: 'Invalid Property',
            bidirectional: true,
          },
        ],
      };

      const engine = new FieldMappingEngine(invalidConfig);
      const result = engine.validateConfig();

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.stringContaining('missing field IDs')
      );
    });

    it('should validate transform function existence', () => {
      const configWithInvalidTransformer = {
        ...MockData.mapping.config,
        mappings: [
          {
            jiraFieldId: 'test_field',
            jiraFieldName: 'Test Field',
            basePropertyId: 'test_prop',
            basePropertyName: 'Test Property',
            transformFunction: 'nonexistent_transformer',
            bidirectional: true,
          },
        ],
      };

      const engine = new FieldMappingEngine(configWithInvalidTransformer);
      const result = engine.validateConfig();

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.stringContaining(
          'Transform function not found: nonexistent_transformer'
        )
      );
    });
  });

  describe('Default Transformers', () => {
    it('should transform string to text correctly', async () => {
      const transformer = (mappingEngine as any).transformers.get(
        'string_to_text'
      );
      const result = await transformer({ sourceValue: 'test string' });

      expect(result).toBe('test string');
    });

    it('should transform string to email correctly', async () => {
      const transformer = (mappingEngine as any).transformers.get(
        'string_to_email'
      );
      const result = await transformer({ sourceValue: 'TEST@EXAMPLE.COM' });

      expect(result).toBe('test@example.com');
    });

    it('should transform number correctly', async () => {
      const transformer = (mappingEngine as any).transformers.get(
        'number_to_number'
      );
      const result = await transformer({ sourceValue: '42.5' });

      expect(result).toBe(42.5);
    });

    it('should handle NaN in number transformation', async () => {
      const transformer = (mappingEngine as any).transformers.get(
        'string_to_number'
      );
      const result = await transformer({ sourceValue: 'not a number' });

      expect(result).toBe(0);
    });

    it('should transform date correctly', async () => {
      const transformer = (mappingEngine as any).transformers.get(
        'date_to_date'
      );
      const testDate = '2024-01-15T10:30:00Z';
      const result = await transformer({ sourceValue: testDate });

      expect(result).toBeInstanceOf(Date);
    });

    it('should transform option to select', async () => {
      const transformer = (mappingEngine as any).transformers.get(
        'option_to_select'
      );
      const option = { value: 'High Priority', id: 'high' };
      const result = await transformer({ sourceValue: option });

      expect(result).toBe('High Priority');
    });

    it('should transform array to multi-select', async () => {
      const transformer = (mappingEngine as any).transformers.get(
        'array_to_multi_select'
      );
      const options = [{ value: 'Backend' }, { value: 'Frontend' }, 'API'];
      const result = await transformer({ sourceValue: options });

      expect(result).toEqual(['Backend', 'Frontend', 'API']);
    });

    it('should transform user object correctly', async () => {
      const transformer = (mappingEngine as any).transformers.get(
        'user_to_user'
      );
      const result = await transformer({ sourceValue: MockData.jira.user });

      expect(result).toMatchObject({
        id: MockData.jira.user.accountId,
        name: MockData.jira.user.displayName,
        email: MockData.jira.user.emailAddress,
      });
    });
  });
});

describe('Utility Functions', () => {
  describe('createDefaultMappingConfig', () => {
    it('should create default configuration', () => {
      const config = createDefaultMappingConfig();

      expect(config.version).toBe('1.0.0');
      expect(config.mappings).toHaveLength(5);
      expect(config.customTransformers).toEqual({});
      expect(config.validationRules).toEqual({});
    });

    it('should include standard field mappings', () => {
      const config = createDefaultMappingConfig();
      const summaryMapping = config.mappings.find(
        m => m.jiraFieldId === 'summary'
      );

      expect(summaryMapping).toBeDefined();
      expect(summaryMapping!.basePropertyId).toBe('title');
      expect(summaryMapping!.required).toBe(true);
      expect(summaryMapping!.bidirectional).toBe(true);
    });
  });

  describe('loadMappingConfig', () => {
    it('should load valid JSON configuration', () => {
      const jsonConfig = JSON.stringify(MockData.mapping.config);
      const config = loadMappingConfig(jsonConfig);

      expect(config).toEqual(MockData.mapping.config);
    });

    it('should throw error for invalid JSON', () => {
      const invalidJson = '{ invalid json }';

      expect(() => loadMappingConfig(invalidJson)).toThrow(
        expect.stringContaining('Invalid mapping configuration JSON')
      );
    });
  });

  describe('saveMappingConfig', () => {
    it('should serialize configuration to JSON', () => {
      const jsonString = saveMappingConfig(MockData.mapping.config);
      const parsed = JSON.parse(jsonString);

      expect(parsed).toEqual(MockData.mapping.config);
    });

    it('should format JSON with proper indentation', () => {
      const jsonString = saveMappingConfig(MockData.mapping.config);

      expect(jsonString).toContain('  '); // Should contain indentation spaces
      expect(jsonString.split('\n').length).toBeGreaterThan(1); // Should be multi-line
    });
  });
});
