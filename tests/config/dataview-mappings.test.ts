/**
 * Dataview Mappings Configuration Tests
 * Test suite for configuration management and validation
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  DEFAULT_DATAVIEW_CONFIG,
  PERFORMANCE_OPTIMIZED_CONFIG,
  COMPREHENSIVE_CONFIG,
  CORE_FIELD_MAPPINGS,
  CUSTOM_FIELD_MAPPINGS,
  COMPUTED_FIELDS,
  TAG_MAPPINGS,
  LINK_MAPPINGS,
  DataviewMappingConfig,
  DataviewFieldMapping,
  MappingPriority,
  getMappingsByPriority,
  getMappingsByGroup,
  createCustomConfig,
  validateMappingConfig,
  getMappingByJiraField,
  getMappingByDataviewProperty,
} from '../../src/config/dataview-mappings';
import { JiraFieldType } from '../../src/types/jira-types';
import { DataviewPropertyType } from '../../src/adapters/dataview-property-mapper';

describe('Dataview Mappings Configuration', () => {
  let testConfig: DataviewMappingConfig;

  beforeEach(() => {
    testConfig = JSON.parse(JSON.stringify(DEFAULT_DATAVIEW_CONFIG)); // Deep clone
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Default Configuration', () => {
    it('should have valid default configuration structure', () => {
      expect(DEFAULT_DATAVIEW_CONFIG.version).toBeDefined();
      expect(Array.isArray(DEFAULT_DATAVIEW_CONFIG.mappings)).toBe(true);
      expect(Array.isArray(DEFAULT_DATAVIEW_CONFIG.computedFields)).toBe(true);
      expect(Array.isArray(DEFAULT_DATAVIEW_CONFIG.tagMappings)).toBe(true);
      expect(Array.isArray(DEFAULT_DATAVIEW_CONFIG.linkMappings)).toBe(true);
      expect(DEFAULT_DATAVIEW_CONFIG.performanceSettings).toBeDefined();
      expect(DEFAULT_DATAVIEW_CONFIG.displaySettings).toBeDefined();
    });

    it('should include core field mappings', () => {
      const summaryMapping = DEFAULT_DATAVIEW_CONFIG.mappings.find(
        m => m.jiraFieldKey === 'summary'
      );

      expect(summaryMapping).toBeDefined();
      expect(summaryMapping!.dataviewProperty).toBe('title');
      expect(summaryMapping!.priority).toBe(MappingPriority.CRITICAL);
    });

    it('should include custom field mappings', () => {
      const storyPointsMapping = DEFAULT_DATAVIEW_CONFIG.mappings.find(
        m => m.jiraFieldKey === 'customfield_10020'
      );

      expect(storyPointsMapping).toBeDefined();
      expect(storyPointsMapping!.dataviewProperty).toBe('story_points');
      expect(storyPointsMapping!.dataviewType).toBe(
        DataviewPropertyType.NUMBER
      );
    });

    it('should have reasonable performance settings', () => {
      const perfSettings = DEFAULT_DATAVIEW_CONFIG.performanceSettings;

      expect(perfSettings.maxProcessingTimeMs).toBe(50);
      expect(perfSettings.batchSize).toBeGreaterThan(0);
      expect(perfSettings.enableCaching).toBe(true);
      expect(perfSettings.cacheExpiryMs).toBeGreaterThan(0);
    });

    it('should have sensible display settings', () => {
      const displaySettings = DEFAULT_DATAVIEW_CONFIG.displaySettings;

      expect(displaySettings.dateFormat).toBe('obsidian');
      expect(displaySettings.fieldGrouping).toBe(true);
      expect(Array.isArray(displaySettings.defaultSortOrder)).toBe(true);
    });
  });

  describe('Core Field Mappings', () => {
    it('should include all critical fields', () => {
      const criticalMappings = CORE_FIELD_MAPPINGS.filter(
        m => m.priority === MappingPriority.CRITICAL
      );

      const criticalFields = criticalMappings.map(m => m.jiraFieldKey);

      expect(criticalFields).toContain('key');
      expect(criticalFields).toContain('summary');
      expect(criticalFields).toContain('status');
      expect(criticalFields).toContain('issuetype');
      expect(criticalFields).toContain('priority');
    });

    it('should have proper validation rules for required fields', () => {
      const summaryMapping = CORE_FIELD_MAPPINGS.find(
        m => m.jiraFieldKey === 'summary'
      );

      expect(summaryMapping!.validation).toBeDefined();
      expect(summaryMapping!.validation!.required).toBe(true);
      expect(summaryMapping!.validation!.maxLength).toBe(255);
    });

    it('should have transformation rules for complex objects', () => {
      const statusMapping = CORE_FIELD_MAPPINGS.find(
        m => m.jiraFieldKey === 'status'
      );

      expect(statusMapping!.transformation).toBeDefined();
      expect(statusMapping!.transformation!.function).toBe('extractObjectName');
    });

    it('should group fields logically', () => {
      const coreGroup = CORE_FIELD_MAPPINGS.filter(m => m.group === 'core');
      const workflowGroup = CORE_FIELD_MAPPINGS.filter(
        m => m.group === 'workflow'
      );
      const peopleGroup = CORE_FIELD_MAPPINGS.filter(m => m.group === 'people');

      expect(coreGroup.length).toBeGreaterThan(0);
      expect(workflowGroup.length).toBeGreaterThan(0);
      expect(peopleGroup.length).toBeGreaterThan(0);
    });
  });

  describe('Custom Field Mappings', () => {
    it('should include common Agile fields', () => {
      const storyPointsMapping = CUSTOM_FIELD_MAPPINGS.find(
        m => m.jiraFieldKey === 'customfield_10020'
      );
      const epicLinkMapping = CUSTOM_FIELD_MAPPINGS.find(
        m => m.jiraFieldKey === 'customfield_10014'
      );

      expect(storyPointsMapping).toBeDefined();
      expect(storyPointsMapping!.dataviewProperty).toBe('story_points');
      expect(storyPointsMapping!.dataviewType).toBe(
        DataviewPropertyType.NUMBER
      );

      expect(epicLinkMapping).toBeDefined();
      expect(epicLinkMapping!.dataviewProperty).toBe('epic_link');
      expect(epicLinkMapping!.dataviewType).toBe(DataviewPropertyType.LINK);
    });

    it('should have appropriate priority levels', () => {
      const highPriorityCustomFields = CUSTOM_FIELD_MAPPINGS.filter(
        m => m.priority === MappingPriority.HIGH
      );

      expect(highPriorityCustomFields.length).toBeGreaterThan(0);
      expect(highPriorityCustomFields.map(m => m.jiraFieldKey)).toContain(
        'customfield_10020'
      ); // Story Points
    });
  });

  describe('Computed Fields', () => {
    it('should include essential computed fields', () => {
      const computedFieldNames = COMPUTED_FIELDS.map(f => f.property);

      expect(computedFieldNames).toContain('age_days');
      expect(computedFieldNames).toContain('days_since_update');
      expect(computedFieldNames).toContain('resolution_time_days');
      expect(computedFieldNames).toContain('is_overdue');
    });

    it('should have correct dependencies', () => {
      const ageDaysField = COMPUTED_FIELDS.find(f => f.property === 'age_days');
      const resolutionTimeField = COMPUTED_FIELDS.find(
        f => f.property === 'resolution_time_days'
      );

      expect(ageDaysField!.dependencies).toContain('created');
      expect(resolutionTimeField!.dependencies).toContain('created');
      expect(resolutionTimeField!.dependencies).toContain('resolved');
    });

    it('should have proper formulas', () => {
      const ageDaysField = COMPUTED_FIELDS.find(f => f.property === 'age_days');
      const overdueField = COMPUTED_FIELDS.find(
        f => f.property === 'is_overdue'
      );

      expect(ageDaysField!.formula).toBe('daysBetween(created, today())');
      expect(overdueField!.formula).toBe(
        'due_date AND due_date < today() AND !resolved'
      );
    });

    it('should have appropriate types', () => {
      const numericFields = COMPUTED_FIELDS.filter(
        f => f.type === DataviewPropertyType.NUMBER
      );
      const booleanFields = COMPUTED_FIELDS.filter(
        f => f.type === DataviewPropertyType.BOOLEAN
      );

      expect(numericFields.map(f => f.property)).toContain('age_days');
      expect(numericFields.map(f => f.property)).toContain(
        'resolution_time_days'
      );

      expect(booleanFields.map(f => f.property)).toContain('is_overdue');
      expect(booleanFields.map(f => f.property)).toContain('has_assignee');
    });
  });

  describe('Tag Mappings', () => {
    it('should include essential tag mappings', () => {
      const tagSourceFields = TAG_MAPPINGS.map(t => t.sourceField);

      expect(tagSourceFields).toContain('issue_type');
      expect(tagSourceFields).toContain('status');
      expect(tagSourceFields).toContain('priority');
      expect(tagSourceFields).toContain('project');
    });

    it('should have appropriate transformations', () => {
      const statusTagMapping = TAG_MAPPINGS.find(
        t => t.sourceField === 'status'
      );
      const priorityTagMapping = TAG_MAPPINGS.find(
        t => t.sourceField === 'priority'
      );

      expect(statusTagMapping!.transformation).toBe('kebabcase');
      expect(priorityTagMapping!.transformation).toBe('lowercase');
    });

    it('should have consistent tag prefixes', () => {
      const tagPrefixes = TAG_MAPPINGS.map(t => t.tagPrefix);

      tagPrefixes.forEach(prefix => {
        expect(prefix).toMatch(/^jira\//);
      });
    });
  });

  describe('Link Mappings', () => {
    it('should include essential link mappings', () => {
      const linkSourceFields = LINK_MAPPINGS.map(l => l.sourceField);

      expect(linkSourceFields).toContain('epic_link');
      expect(linkSourceFields).toContain('project');
      expect(linkSourceFields).toContain('jira_key');
    });

    it('should have appropriate link formats', () => {
      const epicLinkMapping = LINK_MAPPINGS.find(
        l => l.sourceField === 'epic_link'
      );
      const jiraKeyMapping = LINK_MAPPINGS.find(
        l => l.sourceField === 'jira_key'
      );

      expect(epicLinkMapping!.linkFormat).toBe('wikilink');
      expect(jiraKeyMapping!.linkFormat).toBe('url');
      expect(jiraKeyMapping!.urlTemplate).toContain('{value}');
    });
  });

  describe('Configuration Variants', () => {
    it('should have performance optimized config with fewer fields', () => {
      const defaultMappingCount = DEFAULT_DATAVIEW_CONFIG.mappings.length;
      const optimizedMappingCount =
        PERFORMANCE_OPTIMIZED_CONFIG.mappings.length;

      expect(optimizedMappingCount).toBeLessThan(defaultMappingCount);
      expect(
        PERFORMANCE_OPTIMIZED_CONFIG.performanceSettings.maxProcessingTimeMs
      ).toBeLessThan(
        DEFAULT_DATAVIEW_CONFIG.performanceSettings.maxProcessingTimeMs
      );
    });

    it('should have comprehensive config with all fields enabled', () => {
      expect(COMPREHENSIVE_CONFIG.displaySettings.showEmptyFields).toBe(true);
      expect(
        COMPREHENSIVE_CONFIG.performanceSettings.maxProcessingTimeMs
      ).toBeGreaterThan(
        DEFAULT_DATAVIEW_CONFIG.performanceSettings.maxProcessingTimeMs
      );
    });

    it('should maintain same structure across variants', () => {
      const configs = [
        DEFAULT_DATAVIEW_CONFIG,
        PERFORMANCE_OPTIMIZED_CONFIG,
        COMPREHENSIVE_CONFIG,
      ];

      configs.forEach(config => {
        expect(config.version).toBeDefined();
        expect(Array.isArray(config.mappings)).toBe(true);
        expect(Array.isArray(config.computedFields)).toBe(true);
        expect(config.performanceSettings).toBeDefined();
        expect(config.displaySettings).toBeDefined();
      });
    });
  });

  describe('Utility Functions', () => {
    describe('getMappingsByPriority', () => {
      it('should filter mappings by priority', () => {
        const criticalMappings = getMappingsByPriority(testConfig, [
          MappingPriority.CRITICAL,
        ]);
        const highPriorityMappings = getMappingsByPriority(testConfig, [
          MappingPriority.HIGH,
        ]);

        expect(
          criticalMappings.every(m => m.priority === MappingPriority.CRITICAL)
        ).toBe(true);
        expect(
          highPriorityMappings.every(m => m.priority === MappingPriority.HIGH)
        ).toBe(true);
      });

      it('should handle multiple priorities', () => {
        const criticalAndHigh = getMappingsByPriority(testConfig, [
          MappingPriority.CRITICAL,
          MappingPriority.HIGH,
        ]);

        expect(
          criticalAndHigh.every(
            m =>
              m.priority === MappingPriority.CRITICAL ||
              m.priority === MappingPriority.HIGH
          )
        ).toBe(true);
      });

      it('should return empty array for unknown priorities', () => {
        const unknownMappings = getMappingsByPriority(testConfig, [
          'unknown' as MappingPriority,
        ]);
        expect(unknownMappings).toHaveLength(0);
      });
    });

    describe('getMappingsByGroup', () => {
      it('should filter mappings by group', () => {
        const coreMappings = getMappingsByGroup(testConfig, 'core');
        const workflowMappings = getMappingsByGroup(testConfig, 'workflow');

        expect(coreMappings.every(m => m.group === 'core')).toBe(true);
        expect(workflowMappings.every(m => m.group === 'workflow')).toBe(true);
      });

      it('should return empty array for unknown groups', () => {
        const unknownMappings = getMappingsByGroup(testConfig, 'nonexistent');
        expect(unknownMappings).toHaveLength(0);
      });
    });

    describe('createCustomConfig', () => {
      it('should merge custom mappings with defaults', () => {
        const customMapping: DataviewFieldMapping = {
          jiraFieldKey: 'customfield_99999',
          jiraFieldType: JiraFieldType.STRING,
          dataviewProperty: 'custom_field',
          dataviewType: DataviewPropertyType.STRING,
          priority: MappingPriority.LOW,
          displayName: 'Custom Field',
          description: 'A custom field for testing',
        };

        const customConfig = createCustomConfig({
          mappings: [customMapping],
        });

        expect(customConfig.mappings).toContain(customMapping);
        expect(customConfig.mappings.length).toBe(
          DEFAULT_DATAVIEW_CONFIG.mappings.length + 1
        );
      });

      it('should override specific settings while preserving others', () => {
        const customConfig = createCustomConfig({
          performanceSettings: {
            ...DEFAULT_DATAVIEW_CONFIG.performanceSettings,
            maxProcessingTimeMs: 100,
          },
        });

        expect(customConfig.performanceSettings.maxProcessingTimeMs).toBe(100);
        expect(customConfig.performanceSettings.batchSize).toBe(
          DEFAULT_DATAVIEW_CONFIG.performanceSettings.batchSize
        );
      });
    });

    describe('getMappingByJiraField', () => {
      it('should find mapping by Jira field key', () => {
        const summaryMapping = getMappingByJiraField(testConfig, 'summary');

        expect(summaryMapping).toBeDefined();
        expect(summaryMapping!.dataviewProperty).toBe('title');
      });

      it('should return undefined for nonexistent fields', () => {
        const nonexistentMapping = getMappingByJiraField(
          testConfig,
          'nonexistent_field'
        );
        expect(nonexistentMapping).toBeUndefined();
      });
    });

    describe('getMappingByDataviewProperty', () => {
      it('should find mapping by Dataview property name', () => {
        const titleMapping = getMappingByDataviewProperty(testConfig, 'title');

        expect(titleMapping).toBeDefined();
        expect(titleMapping!.jiraFieldKey).toBe('summary');
      });

      it('should return undefined for nonexistent properties', () => {
        const nonexistentMapping = getMappingByDataviewProperty(
          testConfig,
          'nonexistent_property'
        );
        expect(nonexistentMapping).toBeUndefined();
      });
    });

    describe('validateMappingConfig', () => {
      it('should validate correct configuration', () => {
        const result = validateMappingConfig(testConfig);

        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it('should detect duplicate property names', () => {
        const configWithDuplicates: DataviewMappingConfig = {
          ...testConfig,
          mappings: [
            ...testConfig.mappings,
            {
              jiraFieldKey: 'duplicate_field',
              jiraFieldType: JiraFieldType.STRING,
              dataviewProperty: 'title', // Duplicate property
              dataviewType: DataviewPropertyType.STRING,
              priority: MappingPriority.LOW,
            },
          ],
        };

        const result = validateMappingConfig(configWithDuplicates);

        expect(result.valid).toBe(false);
        expect(
          result.errors.some(error =>
            error.includes('Duplicate property name: title')
          )
        ).toBe(true);
      });

      it('should warn about unmet computed field dependencies', () => {
        const configWithBadDependency: DataviewMappingConfig = {
          ...testConfig,
          computedFields: [
            ...testConfig.computedFields,
            {
              property: 'test_computed',
              type: DataviewPropertyType.NUMBER,
              formula: 'nonexistent_field * 2',
              dependencies: ['nonexistent_field'],
              priority: MappingPriority.LOW,
              description: 'Test computed field',
            },
          ],
        };

        const result = validateMappingConfig(configWithBadDependency);

        expect(
          result.warnings.some(warning =>
            warning.includes('depends on unmapped property: nonexistent_field')
          )
        ).toBe(true);
      });

      it('should warn about performance settings', () => {
        const configWithLowPerf: DataviewMappingConfig = {
          ...testConfig,
          performanceSettings: {
            ...testConfig.performanceSettings,
            maxProcessingTimeMs: 5, // Very low
          },
        };

        const result = validateMappingConfig(configWithLowPerf);

        expect(
          result.warnings.some(warning =>
            warning.includes('Very low processing time limit')
          )
        ).toBe(true);
      });

      it('should warn about large batch sizes', () => {
        const configWithLargeBatch: DataviewMappingConfig = {
          ...testConfig,
          performanceSettings: {
            ...testConfig.performanceSettings,
            batchSize: 2000, // Very large
          },
        };

        const result = validateMappingConfig(configWithLargeBatch);

        expect(
          result.warnings.some(warning =>
            warning.includes('Large batch size may impact performance')
          )
        ).toBe(true);
      });
    });
  });

  describe('Field Mapping Validation', () => {
    it('should have consistent Jira field types and Dataview types', () => {
      testConfig.mappings.forEach(mapping => {
        // Text fields should map to string types primarily
        if (mapping.jiraFieldType === JiraFieldType.STRING) {
          expect([
            DataviewPropertyType.STRING,
            DataviewPropertyType.TAG,
            DataviewPropertyType.LINK,
          ]).toContain(mapping.dataviewType);
        }

        // Number fields should map to number types
        if (mapping.jiraFieldType === JiraFieldType.NUMBER) {
          expect(mapping.dataviewType).toBe(DataviewPropertyType.NUMBER);
        }

        // Date fields should map to date types
        if (
          mapping.jiraFieldType === JiraFieldType.DATE ||
          mapping.jiraFieldType === JiraFieldType.DATETIME
        ) {
          expect(mapping.dataviewType).toBe(DataviewPropertyType.DATE);
        }

        // Array fields should map to array types
        if (mapping.jiraFieldType === JiraFieldType.ARRAY) {
          expect(mapping.dataviewType).toBe(DataviewPropertyType.ARRAY);
        }
      });
    });

    it('should have display names for all mappings', () => {
      testConfig.mappings.forEach(mapping => {
        expect(mapping.displayName).toBeDefined();
        expect(mapping.displayName!.length).toBeGreaterThan(0);
      });
    });

    it('should have descriptions for all mappings', () => {
      testConfig.mappings.forEach(mapping => {
        expect(mapping.description).toBeDefined();
        expect(mapping.description!.length).toBeGreaterThan(0);
      });
    });

    it('should have groups for all mappings', () => {
      testConfig.mappings.forEach(mapping => {
        expect(mapping.group).toBeDefined();
        expect(mapping.group!.length).toBeGreaterThan(0);
      });
    });
  });
});
