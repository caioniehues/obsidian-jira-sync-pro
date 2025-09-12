/**
 * Unit Tests for Settings Validators
 * Focused unit tests for validation logic
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { SettingsValidator } from '../../src/settings/validators';
import {
  DEFAULT_SETTINGS,
  ConflictResolutionStrategy,
  FieldMapping,
} from '../../src/settings/settings';
import { JiraFieldType } from '../../src/types/jira-types';
import { BasePropertyType } from '../../src/types/base-types';

describe('SettingsValidator', () => {
  let validator: SettingsValidator;

  beforeEach(() => {
    validator = new SettingsValidator();
  });

  describe('Jira Connection Validation', () => {
    test('should validate required Jira URL', () => {
      const jiraSettings = {
        ...DEFAULT_SETTINGS.jira,
        jiraUrl: '',
        jiraUsername: 'test@example.com',
        jiraApiToken: 'valid-token-1234567890',
        jqlQuery: 'assignee=currentUser()',
      };

      const result = validator.validateJiraConnection(jiraSettings);

      expect(result.isValid).toBe(false);
      const urlError = result.errors.find(e => e.field === 'jira.jiraUrl');
      expect(urlError).toBeDefined();
      expect(urlError?.message).toContain('required');
    });

    test('should validate Jira URL format', () => {
      const jiraSettings = {
        ...DEFAULT_SETTINGS.jira,
        jiraUrl: 'invalid-url',
        jiraUsername: 'test@example.com',
        jiraApiToken: 'valid-token-1234567890',
        jqlQuery: 'assignee=currentUser()',
      };

      const result = validator.validateJiraConnection(jiraSettings);

      expect(result.isValid).toBe(false);
      const urlError = result.errors.find(e => e.field === 'jira.jiraUrl');
      expect(urlError?.message).toContain('valid HTTP/HTTPS URL');
    });

    test('should warn about suspicious URLs', () => {
      const jiraSettings = {
        ...DEFAULT_SETTINGS.jira,
        jiraUrl: 'https://example.com',
      };

      const result = validator.validateJiraConnection(jiraSettings);

      expect(result.isValid).toBe(true);
      const urlWarning = result.warnings.find(w => w.field === 'jira.jiraUrl');
      expect(urlWarning?.message).toContain(
        'does not appear to be a Jira instance'
      );
    });

    test('should validate connection timeout ranges', () => {
      const jiraSettings = {
        ...DEFAULT_SETTINGS.jira,
        connectionTimeout: 500, // Too low
      };

      const result = validator.validateJiraConnection(jiraSettings);

      expect(result.isValid).toBe(false);
      const timeoutError = result.errors.find(
        e => e.field === 'jira.connectionTimeout'
      );
      expect(timeoutError?.message).toContain('at least 1000ms');
    });

    test('should warn about short timeouts', () => {
      const jiraSettings = {
        ...DEFAULT_SETTINGS.jira,
        connectionTimeout: 3000, // Valid but short
      };

      const result = validator.validateJiraConnection(jiraSettings);

      expect(result.isValid).toBe(true);
      const timeoutWarning = result.warnings.find(
        w => w.field === 'jira.connectionTimeout'
      );
      expect(timeoutWarning?.message).toContain(
        'Short timeout may cause connection failures'
      );
    });
  });

  describe('Sync Settings Validation', () => {
    test('should validate sync interval ranges', () => {
      const syncSettings = {
        ...DEFAULT_SETTINGS.sync,
        syncInterval: 0, // Invalid
      };

      const result = validator.validateSync(syncSettings);

      expect(result.isValid).toBe(false);
      const intervalError = result.errors.find(
        e => e.field === 'sync.syncInterval'
      );
      expect(intervalError?.message).toContain('at least 1 minute');
    });

    test('should warn about frequent sync', () => {
      const syncSettings = {
        ...DEFAULT_SETTINGS.sync,
        syncInterval: 2, // Valid but frequent
      };

      const result = validator.validateSync(syncSettings);

      expect(result.isValid).toBe(true);
      const intervalWarning = result.warnings.find(
        w => w.field === 'sync.syncInterval'
      );
      expect(intervalWarning?.message).toContain(
        'Frequent sync may impact performance'
      );
    });

    test('should validate batch size relative to max results', () => {
      const syncSettings = {
        ...DEFAULT_SETTINGS.sync,
        maxResults: 100,
        batchSize: 150, // Larger than max results
      };

      const result = validator.validateSync(syncSettings);

      expect(result.isValid).toBe(true); // Not an error, but should warn
      const batchWarning = result.warnings.find(
        w => w.field === 'sync.batchSize'
      );
      expect(batchWarning?.message).toContain('larger than max results');
    });

    test('should warn about bidirectional sync conflicts', () => {
      const syncSettings = {
        ...DEFAULT_SETTINGS.sync,
        bidirectionalSyncEnabled: true,
        enableRealTimeSync: true,
      };

      const result = validator.validateSync(syncSettings);

      expect(result.isValid).toBe(true);
      const conflictWarning = result.warnings.find(
        w => w.field === 'sync.enableRealTimeSync'
      );
      expect(conflictWarning?.message).toContain(
        'Real-time bidirectional sync may cause conflicts'
      );
    });
  });

  describe('Field Mappings Validation', () => {
    test('should validate empty field mappings', () => {
      const result = validator.validateFieldMappings([]);

      expect(result.isValid).toBe(true);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0].message).toContain(
        'No field mappings configured'
      );
    });

    test('should validate required fields in mappings', () => {
      const mappings: FieldMapping[] = [
        {
          jiraField: '', // Missing
          jiraFieldType: JiraFieldType.STRING,
          baseProperty: 'title',
          basePropertyType: BasePropertyType.TEXT,
          bidirectional: false,
          transformationRules: [],
          validationRules: [],
        },
      ];

      const result = validator.validateFieldMappings(mappings);

      expect(result.isValid).toBe(false);
      const jiraFieldError = result.errors.find(
        e => e.field === 'fieldMappings[0].jiraField'
      );
      expect(jiraFieldError?.message).toContain('Jira field name is required');
    });

    test('should detect duplicate field mappings', () => {
      const mappings: FieldMapping[] = [
        {
          jiraField: 'summary',
          jiraFieldType: JiraFieldType.STRING,
          baseProperty: 'title',
          basePropertyType: BasePropertyType.TEXT,
          bidirectional: false,
          transformationRules: [],
          validationRules: [],
        },
        {
          jiraField: 'summary', // Duplicate
          jiraFieldType: JiraFieldType.STRING,
          baseProperty: 'title2',
          basePropertyType: BasePropertyType.TEXT,
          bidirectional: false,
          transformationRules: [],
          validationRules: [],
        },
      ];

      const result = validator.validateFieldMappings(mappings);

      expect(result.isValid).toBe(false);
      const duplicateError = result.errors.find(e =>
        e.message.includes('Duplicate')
      );
      expect(duplicateError).toBeTruthy();
    });

    test('should warn about missing essential fields', () => {
      const mappings: FieldMapping[] = [
        {
          jiraField: 'customfield_123',
          jiraFieldType: JiraFieldType.STRING,
          baseProperty: 'custom',
          basePropertyType: BasePropertyType.TEXT,
          bidirectional: false,
          transformationRules: [],
          validationRules: [],
        },
      ];

      const result = validator.validateFieldMappings(mappings);

      expect(result.isValid).toBe(true);

      // Should warn about missing essential fields
      const summaryWarning = result.warnings.find(w =>
        w.message.includes('summary')
      );
      expect(summaryWarning).toBeTruthy();
    });

    test('should warn about bidirectional system fields', () => {
      const mappings: FieldMapping[] = [
        {
          jiraField: 'created',
          jiraFieldType: JiraFieldType.DATETIME,
          baseProperty: 'created_date',
          basePropertyType: BasePropertyType.DATE,
          bidirectional: true, // System field should not be bidirectional
          transformationRules: [],
          validationRules: [],
        },
      ];

      const result = validator.validateFieldMappings(mappings);

      expect(result.isValid).toBe(true);
      const bidirectionalWarning = result.warnings.find(
        w =>
          w.message.includes('system field') &&
          w.message.includes('bidirectional')
      );
      expect(bidirectionalWarning).toBeTruthy();
    });
  });

  describe('Performance Settings Validation', () => {
    test('should validate cache size ranges', () => {
      const performance = {
        ...DEFAULT_SETTINGS.performance,
        cacheSize: 0, // Invalid
      };

      const result = validator.validatePerformance(performance);

      expect(result.isValid).toBe(false);
      const cacheError = result.errors.find(
        e => e.field === 'performance.cacheSize'
      );
      expect(cacheError?.message).toContain('at least 1MB');
    });

    test('should warn about large cache sizes', () => {
      const performance = {
        ...DEFAULT_SETTINGS.performance,
        cacheSize: 600, // Large
      };

      const result = validator.validatePerformance(performance);

      expect(result.isValid).toBe(true);
      const cacheWarning = result.warnings.find(
        w => w.field === 'performance.cacheSize'
      );
      expect(cacheWarning?.message).toContain('may impact system memory');
    });

    test('should warn about rate limit risks', () => {
      const performance = {
        ...DEFAULT_SETTINGS.performance,
        requestThrottleMs: 50, // Low throttle
        maxConcurrentRequests: 15, // High concurrency
      };

      const result = validator.validatePerformance(performance);

      expect(result.isValid).toBe(true);
      const rateLimitWarning = result.warnings.find(
        w => w.code === 'RATE_LIMIT_WARNING'
      );
      expect(rateLimitWarning?.message).toContain('trigger rate limits');
    });
  });

  describe('Conflict Resolution Validation', () => {
    test('should validate strategy enum values', () => {
      const conflict = {
        ...DEFAULT_SETTINGS.conflictResolution,
        strategy: 'invalid_strategy' as ConflictResolutionStrategy,
      };

      const result = validator.validateConflictResolution(conflict);

      expect(result.isValid).toBe(false);
      const strategyError = result.errors.find(
        e => e.field === 'conflictResolution.strategy'
      );
      expect(strategyError?.message).toContain(
        'Invalid conflict resolution strategy'
      );
    });

    test('should warn about rule-based strategy without rules', () => {
      const conflict = {
        ...DEFAULT_SETTINGS.conflictResolution,
        strategy: ConflictResolutionStrategy.RULE_BASED,
        autoResolveRules: [],
      };

      const result = validator.validateConflictResolution(conflict);

      expect(result.isValid).toBe(true);
      const rulesWarning = result.warnings.find(
        w => w.field === 'conflictResolution.autoResolveRules'
      );
      expect(rulesWarning?.message).toContain('requires auto-resolve rules');
    });

    test('should warn about manual strategy without notifications', () => {
      const conflict = {
        ...DEFAULT_SETTINGS.conflictResolution,
        strategy: ConflictResolutionStrategy.MANUAL,
        notifyOnConflict: false,
      };

      const result = validator.validateConflictResolution(conflict);

      expect(result.isValid).toBe(true);
      const notifyWarning = result.warnings.find(
        w => w.field === 'conflictResolution.notifyOnConflict'
      );
      expect(notifyWarning?.message).toContain(
        'should have notifications enabled'
      );
    });
  });

  describe('Cross-field Validation', () => {
    test('should validate bidirectional sync configuration', () => {
      const settings = {
        ...DEFAULT_SETTINGS,
        sync: {
          ...DEFAULT_SETTINGS.sync,
          bidirectionalSyncEnabled: true,
        },
        conflictResolution: {
          ...DEFAULT_SETTINGS.conflictResolution,
          strategy: ConflictResolutionStrategy.MANUAL,
          notifyOnConflict: false,
        },
        fieldMappings: [], // No bidirectional mappings
      };

      const result = validator.validateSettings(settings);

      expect(result.isValid).toBe(true); // Warnings don't make it invalid

      // Should warn about conflict resolution
      const conflictWarning = result.warnings.find(
        w =>
          w.message.includes('notifications') && w.message.includes('enabled')
      );
      expect(conflictWarning).toBeTruthy();

      // Should warn about missing bidirectional mappings
      const mappingWarning = result.warnings.find(w =>
        w.message.includes('bidirectional mapping')
      );
      expect(mappingWarning).toBeTruthy();
    });

    test('should warn about performance implications', () => {
      const settings = {
        ...DEFAULT_SETTINGS,
        sync: {
          ...DEFAULT_SETTINGS.sync,
          syncInterval: 2, // Frequent
        },
        performance: {
          ...DEFAULT_SETTINGS.performance,
          maxConcurrentRequests: 10, // High
        },
      };

      const result = validator.validateSettings(settings);

      expect(result.isValid).toBe(true);
      const performanceWarning = result.warnings.find(w =>
        w.message.includes('overload server')
      );
      expect(performanceWarning).toBeTruthy();
    });
  });

  describe('Individual Field Validation', () => {
    test('should validate individual Jira fields', () => {
      const result = validator.validateField('jira.jiraUrl', '');

      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toContain('required');
    });

    test('should validate individual sync fields', () => {
      const result = validator.validateField('sync.syncInterval', 0);

      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toContain('between 1 and 1440');
    });

    test('should validate performance fields with warnings', () => {
      const result = validator.validateField('performance.cacheSize', 600);

      expect(result.isValid).toBe(true);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0].message).toContain('system memory');
    });

    test('should handle unknown field paths gracefully', () => {
      const result = validator.validateField('unknown.field', 'value');

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });
  });

  describe('JQL Query Validation', () => {
    test('should warn about potentially invalid JQL syntax', () => {
      const jiraSettings = {
        ...DEFAULT_SETTINGS.jira,
        jqlQuery: 'this is not valid jql',
      };

      const result = validator.validateJiraConnection(jiraSettings);

      expect(result.isValid).toBe(true);
      const jqlWarning = result.warnings.find(w => w.field === 'jira.jqlQuery');
      expect(jqlWarning?.message).toContain('may not have valid syntax');
    });

    test('should warn about performance issues with ORDER BY without limits', () => {
      const jiraSettings = {
        ...DEFAULT_SETTINGS.jira,
        jqlQuery: 'assignee = currentUser() ORDER BY created DESC',
      };

      const result = validator.validateJiraConnection(jiraSettings);

      expect(result.isValid).toBe(true);
      const performanceWarning = result.warnings.find(
        w => w.code === 'JQL_PERFORMANCE'
      );
      expect(performanceWarning?.message).toContain(
        'should consider adding limits'
      );
    });
  });
});
