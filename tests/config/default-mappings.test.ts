/**
 * Default Mappings Configuration Tests
 * Tests for default field mappings, transformers, and validation rules
 */

import {
  DEFAULT_FIELD_MAPPINGS,
  CUSTOM_TRANSFORMERS,
  VALIDATION_RULES,
  FIELD_TYPE_MAPPINGS,
  REVERSE_FIELD_TYPE_MAPPINGS,
  CUSTOM_FIELD_PATTERNS,
  DEFAULT_BASE_PROPERTIES,
  SYNC_CONFIGURATION,
  getDefaultMappingConfig,
  createCustomFieldMapping,
  detectCustomFieldType,
} from '../../src/config/default-mappings';

import { BasePropertyType } from '../../src/types/base-types';
import { JiraFieldType } from '../../src/types/jira-types';

describe('Default Mappings Configuration', () => {
  describe('DEFAULT_FIELD_MAPPINGS', () => {
    it('should contain all essential Jira fields', () => {
      const essentialFields = [
        'summary',
        'description',
        'key',
        'assignee',
        'reporter',
        'status',
        'priority',
        'resolution',
        'issuetype',
        'project',
        'labels',
        'components',
        'created',
        'updated',
      ];

      const mappedFields = DEFAULT_FIELD_MAPPINGS.map(m => m.jiraFieldId);

      for (const field of essentialFields) {
        expect(mappedFields).toContain(field);
      }
    });

    it('should have consistent bidirectional mapping flags', () => {
      for (const mapping of DEFAULT_FIELD_MAPPINGS) {
        // Read-only fields should not be bidirectional
        const readOnlyFields = [
          'key',
          'created',
          'updated',
          'resolutiondate',
          'votes',
          'watches',
          'timespent',
        ];

        if (readOnlyFields.includes(mapping.jiraFieldId)) {
          expect(mapping.bidirectional).toBe(false);
        }
      }
    });

    it('should have valid property IDs (snake_case)', () => {
      for (const mapping of DEFAULT_FIELD_MAPPINGS) {
        expect(mapping.basePropertyId).toMatch(/^[a-z][a-z0-9_]*$/);
      }
    });

    it('should have required fields properly marked', () => {
      const requiredMappings = DEFAULT_FIELD_MAPPINGS.filter(m => m.required);
      const requiredIds = requiredMappings.map(m => m.jiraFieldId);

      expect(requiredIds).toContain('summary');
      expect(requiredIds).toContain('key');
      expect(requiredIds).toContain('status');
      expect(requiredIds).toContain('issuetype');
      expect(requiredIds).toContain('project');
    });

    it('should have appropriate transform functions assigned', () => {
      const mappingsWithTransformers = DEFAULT_FIELD_MAPPINGS.filter(
        m => m.transformFunction
      );

      // Check that user fields have user transformer
      const userMappings = mappingsWithTransformers.filter(
        m => m.jiraFieldId === 'assignee' || m.jiraFieldId === 'reporter'
      );
      for (const mapping of userMappings) {
        expect(mapping.transformFunction).toBe('user_to_user');
      }

      // Check that option fields have option transformer
      const optionMappings = mappingsWithTransformers.filter(
        m => m.jiraFieldId === 'priority' || m.jiraFieldId === 'status'
      );
      for (const mapping of optionMappings) {
        expect(mapping.transformFunction).toBe('option_to_select');
      }
    });
  });

  describe('CUSTOM_TRANSFORMERS', () => {
    it('should contain all referenced transformers', () => {
      const referencedTransformers = DEFAULT_FIELD_MAPPINGS.filter(
        m => m.transformFunction
      ).map(m => m.transformFunction!);

      for (const transformer of referencedTransformers) {
        expect(CUSTOM_TRANSFORMERS).toHaveProperty(transformer);
      }
    });

    it('should have valid JavaScript function strings', () => {
      for (const [name, funcString] of Object.entries(CUSTOM_TRANSFORMERS)) {
        expect(() => {
          new Function('ctx', `return (${funcString})(ctx);`);
        }).not.toThrow();
      }
    });

    it('should have reverse transformers for bidirectional mappings', () => {
      const bidirectionalTransformers = DEFAULT_FIELD_MAPPINGS.filter(
        m => m.bidirectional && m.transformFunction
      ).map(m => m.transformFunction!);

      const reverseTransformers = Object.keys(CUSTOM_TRANSFORMERS).filter(
        name => name.startsWith('reverse_')
      );

      // Check that main transformers that need reverse exist
      const expectedReverseTransformers = [
        'reverse_user_to_user',
        'reverse_option_to_select',
        'reverse_array_to_multi_select',
        'reverse_seconds_to_hours',
      ];

      for (const reverseTransformer of expectedReverseTransformers) {
        expect(CUSTOM_TRANSFORMERS).toHaveProperty(reverseTransformer);
      }
    });

    it('should execute transformers without errors on valid input', () => {
      const testContexts = {
        user_to_user: {
          sourceValue: { displayName: 'John Doe', accountId: 'user123' },
        },
        option_to_select: {
          sourceValue: { name: 'High', id: '3' },
        },
        array_to_multi_select: {
          sourceValue: ['bug', 'frontend', 'urgent'],
        },
        datetime_to_date: {
          sourceValue: '2024-01-15T10:30:00.000Z',
        },
        votes_to_number: {
          sourceValue: { votes: 5 },
        },
      };

      for (const [transformerName, context] of Object.entries(testContexts)) {
        const transformer = CUSTOM_TRANSFORMERS[transformerName];
        expect(() => {
          const func = new Function('ctx', `return (${transformer})(ctx);`);
          func(context);
        }).not.toThrow();
      }
    });
  });

  describe('VALIDATION_RULES', () => {
    it('should have rules for required fields', () => {
      const requiredFields = DEFAULT_FIELD_MAPPINGS.filter(m => m.required).map(
        m => m.basePropertyId
      );

      for (const field of requiredFields) {
        if (field === 'jira_key') {
          expect(VALIDATION_RULES).toHaveProperty(field);
        } else if (field === 'title') {
          expect(VALIDATION_RULES).toHaveProperty(field);
          expect(VALIDATION_RULES[field].required).toBe(true);
        }
      }
    });

    it('should have reasonable length limits', () => {
      expect(VALIDATION_RULES.title.maxLength).toBeGreaterThan(0);
      expect(VALIDATION_RULES.title.maxLength).toBeLessThanOrEqual(255);

      if (VALIDATION_RULES.description?.maxLength) {
        expect(VALIDATION_RULES.description.maxLength).toBeGreaterThan(1000);
      }
    });

    it('should have valid patterns', () => {
      for (const [field, rule] of Object.entries(VALIDATION_RULES)) {
        if (rule.pattern) {
          expect(rule.pattern).toBeInstanceOf(RegExp);
        }
      }
    });

    it('should have valid allowed values for select fields', () => {
      if (VALIDATION_RULES.priority?.allowedValues) {
        expect(VALIDATION_RULES.priority.allowedValues).toContain('High');
        expect(VALIDATION_RULES.priority.allowedValues).toContain('Medium');
        expect(VALIDATION_RULES.priority.allowedValues).toContain('Low');
      }
    });
  });

  describe('Field Type Mappings', () => {
    it('should have complete Jira to Base type mappings', () => {
      const jiraTypes = Object.values(JiraFieldType);
      const mappedTypes = Object.keys(FIELD_TYPE_MAPPINGS);

      // Should have mappings for most common Jira types
      const commonTypes = [
        JiraFieldType.STRING,
        JiraFieldType.NUMBER,
        JiraFieldType.DATE,
        JiraFieldType.DATETIME,
        JiraFieldType.ARRAY,
        JiraFieldType.OPTION,
        JiraFieldType.USER,
      ];

      for (const type of commonTypes) {
        expect(FIELD_TYPE_MAPPINGS).toHaveProperty(type);
      }
    });

    it('should have valid Base property types in mappings', () => {
      const baseTypes = Object.values(BasePropertyType);

      for (const mappedType of Object.values(FIELD_TYPE_MAPPINGS)) {
        expect(baseTypes).toContain(mappedType);
      }
    });

    it('should have reverse mappings for Base to Jira', () => {
      const baseTypes = Object.values(BasePropertyType);
      const reverseMappedTypes = Object.keys(REVERSE_FIELD_TYPE_MAPPINGS);

      for (const baseType of baseTypes) {
        expect(reverseMappedTypes).toContain(baseType);
      }
    });

    it('should have valid Jira field types in reverse mappings', () => {
      const jiraTypes = Object.values(JiraFieldType);

      for (const mappedType of Object.values(REVERSE_FIELD_TYPE_MAPPINGS)) {
        expect(jiraTypes).toContain(mappedType);
      }
    });
  });

  describe('Custom Field Patterns', () => {
    it('should have patterns for common custom fields', () => {
      const patterns = CUSTOM_FIELD_PATTERNS.map(p => p.name.toLowerCase());

      expect(patterns).toContain('story points');
      expect(patterns).toContain('epic link');
      expect(patterns).toContain('epic name');
      expect(patterns).toContain('sprint');
      expect(patterns).toContain('team');
    });

    it('should have valid regex patterns', () => {
      for (const pattern of CUSTOM_FIELD_PATTERNS) {
        expect(pattern.pattern).toBeInstanceOf(RegExp);
        // Test that pattern doesn't throw on common strings
        expect(() => {
          pattern.pattern.test('story points');
          pattern.pattern.test('customfield_12345');
        }).not.toThrow();
      }
    });

    it('should have appropriate base property types', () => {
      const validTypes = Object.values(BasePropertyType);

      for (const pattern of CUSTOM_FIELD_PATTERNS) {
        expect(validTypes).toContain(pattern.basePropertyType);
      }
    });

    it('should match expected field names', () => {
      const testCases = [
        { fieldName: 'Story Points', expectedType: BasePropertyType.NUMBER },
        { fieldName: 'Epic Link', expectedType: BasePropertyType.TEXT },
        { fieldName: 'Team', expectedType: BasePropertyType.SELECT },
        { fieldName: 'Sprint', expectedType: BasePropertyType.MULTI_SELECT },
      ];

      for (const testCase of testCases) {
        const matchedPattern = CUSTOM_FIELD_PATTERNS.find(p =>
          p.pattern.test(testCase.fieldName)
        );

        expect(matchedPattern).toBeDefined();
        expect(matchedPattern!.basePropertyType).toBe(testCase.expectedType);
      }
    });
  });

  describe('Default Base Properties', () => {
    it('should have all essential properties', () => {
      const propertyIds = DEFAULT_BASE_PROPERTIES.map(p => p.id);

      const essentialProperties = [
        'title',
        'description',
        'jira_key',
        'status',
        'priority',
        'assignee',
        'reporter',
        'issue_type',
        'project',
        'created_date',
      ];

      for (const prop of essentialProperties) {
        expect(propertyIds).toContain(prop);
      }
    });

    it('should have valid property types', () => {
      const validTypes = Object.values(BasePropertyType);

      for (const property of DEFAULT_BASE_PROPERTIES) {
        expect(validTypes).toContain(property.type);
      }
    });

    it('should have consistent required flags with field mappings', () => {
      for (const property of DEFAULT_BASE_PROPERTIES) {
        const correspondingMapping = DEFAULT_FIELD_MAPPINGS.find(
          m => m.basePropertyId === property.id
        );

        if (correspondingMapping && correspondingMapping.required) {
          expect(property.required).toBe(true);
        }
      }
    });
  });

  describe('Sync Configuration', () => {
    it('should have valid configuration values', () => {
      expect(SYNC_CONFIGURATION.batchSize).toBeGreaterThan(0);
      expect(SYNC_CONFIGURATION.retryAttempts).toBeGreaterThan(0);
      expect(SYNC_CONFIGURATION.retryDelay).toBeGreaterThan(0);
      expect(SYNC_CONFIGURATION.cacheTTL).toBeGreaterThan(0);
    });

    it('should have valid enum values', () => {
      const validConflictResolutions = [
        'jira-wins',
        'base-wins',
        'merge',
        'prompt',
      ];
      const validSyncDirections = [
        'jira-to-base',
        'base-to-jira',
        'bidirectional',
      ];

      expect(validConflictResolutions).toContain(
        SYNC_CONFIGURATION.conflictResolution
      );
      expect(validSyncDirections).toContain(
        SYNC_CONFIGURATION.defaultSyncDirection
      );
    });
  });

  describe('Helper Functions', () => {
    describe('getDefaultMappingConfig', () => {
      it('should return complete configuration object', () => {
        const config = getDefaultMappingConfig();

        expect(config).toHaveProperty('fieldMappings');
        expect(config).toHaveProperty('customTransformers');
        expect(config).toHaveProperty('validationRules');
        expect(config).toHaveProperty('fieldTypeMappings');
        expect(config).toHaveProperty('reverseFieldTypeMappings');
        expect(config).toHaveProperty('customFieldPatterns');
        expect(config).toHaveProperty('baseProperties');
        expect(config).toHaveProperty('syncConfiguration');
      });

      it('should return arrays and objects by reference', () => {
        const config = getDefaultMappingConfig();

        expect(config.fieldMappings).toBe(DEFAULT_FIELD_MAPPINGS);
        expect(config.customTransformers).toBe(CUSTOM_TRANSFORMERS);
        expect(config.validationRules).toBe(VALIDATION_RULES);
      });
    });

    describe('createCustomFieldMapping', () => {
      it('should create valid field mapping with minimal parameters', () => {
        const mapping = createCustomFieldMapping(
          'customfield_12345',
          'Story Points',
          'story_points',
          'Story Points'
        );

        expect(mapping.jiraFieldId).toBe('customfield_12345');
        expect(mapping.jiraFieldName).toBe('Story Points');
        expect(mapping.basePropertyId).toBe('story_points');
        expect(mapping.basePropertyName).toBe('Story Points');
        expect(mapping.required).toBe(false);
        expect(mapping.bidirectional).toBe(true);
      });

      it('should apply custom options', () => {
        const mapping = createCustomFieldMapping(
          'customfield_12345',
          'Story Points',
          'story_points',
          'Story Points',
          {
            required: true,
            bidirectional: false,
            transformFunction: 'custom_transformer',
            defaultValue: 0,
          }
        );

        expect(mapping.required).toBe(true);
        expect(mapping.bidirectional).toBe(false);
        expect(mapping.transformFunction).toBe('custom_transformer');
        expect(mapping.defaultValue).toBe(0);
      });
    });

    describe('detectCustomFieldType', () => {
      it('should detect story points field', () => {
        const result = detectCustomFieldType(
          'Story Points',
          'customfield_12345'
        );

        expect(result.basePropertyType).toBe(BasePropertyType.NUMBER);
      });

      it('should detect epic link field', () => {
        const result = detectCustomFieldType('Epic Link', 'customfield_67890');

        expect(result.basePropertyType).toBe(BasePropertyType.TEXT);
      });

      it('should detect sprint field', () => {
        const result = detectCustomFieldType('Sprint', 'customfield_11111');

        expect(result.basePropertyType).toBe(BasePropertyType.MULTI_SELECT);
        expect(result.transformFunction).toBe('array_to_multi_select');
      });

      it('should detect team field', () => {
        const result = detectCustomFieldType('Team', 'customfield_22222');

        expect(result.basePropertyType).toBe(BasePropertyType.SELECT);
      });

      it('should detect reviewer field', () => {
        const result = detectCustomFieldType(
          'Code Reviewer',
          'customfield_33333'
        );

        expect(result.basePropertyType).toBe(BasePropertyType.USER);
        expect(result.transformFunction).toBe('user_to_user');
      });

      it('should default to text for unknown fields', () => {
        const result = detectCustomFieldType(
          'Unknown Field',
          'customfield_99999'
        );

        expect(result.basePropertyType).toBe(BasePropertyType.TEXT);
        expect(result.transformFunction).toBeUndefined();
      });

      it('should match field ID patterns', () => {
        const result = detectCustomFieldType(
          'Some Field',
          'story_points_field'
        );

        expect(result.basePropertyType).toBe(BasePropertyType.NUMBER);
      });

      it('should be case insensitive', () => {
        const result1 = detectCustomFieldType(
          'STORY POINTS',
          'customfield_12345'
        );
        const result2 = detectCustomFieldType(
          'story points',
          'customfield_12345'
        );

        expect(result1.basePropertyType).toBe(result2.basePropertyType);
      });
    });
  });

  describe('Configuration Validation', () => {
    it('should have no duplicate field mappings', () => {
      const jiraFieldIds = DEFAULT_FIELD_MAPPINGS.map(m => m.jiraFieldId);
      const basePropertyIds = DEFAULT_FIELD_MAPPINGS.map(m => m.basePropertyId);

      const uniqueJiraIds = [...new Set(jiraFieldIds)];
      const uniqueBaseIds = [...new Set(basePropertyIds)];

      expect(jiraFieldIds).toHaveLength(uniqueJiraIds.length);
      expect(basePropertyIds).toHaveLength(uniqueBaseIds.length);
    });

    it('should have consistent transformer references', () => {
      const referencedTransformers = new Set<string>();

      // Collect all referenced transformers
      for (const mapping of DEFAULT_FIELD_MAPPINGS) {
        if (mapping.transformFunction) {
          referencedTransformers.add(mapping.transformFunction);

          // If bidirectional, should also have reverse transformer
          if (mapping.bidirectional) {
            referencedTransformers.add(`reverse_${mapping.transformFunction}`);
          }
        }
      }

      // Check that all referenced transformers exist
      for (const transformer of referencedTransformers) {
        if (!CUSTOM_TRANSFORMERS[transformer]) {
          // Skip check for some that may be optional
          const optionalTransformers = [
            'reverse_string_to_rich_text',
            'reverse_datetime_to_date',
          ];
          if (!optionalTransformers.includes(transformer)) {
            fail(`Missing transformer: ${transformer}`);
          }
        }
      }
    });

    it('should have validation rules for complex constraints', () => {
      // Fields with patterns should have validation rules
      const fieldsWithPatterns = DEFAULT_FIELD_MAPPINGS.filter(
        m => m.basePropertyId === 'jira_key'
      );

      for (const field of fieldsWithPatterns) {
        expect(VALIDATION_RULES).toHaveProperty(field.basePropertyId);
      }
    });
  });
});
