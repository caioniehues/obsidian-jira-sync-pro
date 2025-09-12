/**
 * Property Mapper Tests
 * Tests for bidirectional field mapping and transformation between Jira and Base
 */

import { PropertyMapper, FieldMapping, PropertyMappingResult } from '../../src/utils/property-mapper';
import { BaseProperty, BasePropertyType } from '../../src/types/base-types';
import { JiraField, JiraFieldType, JiraUser, JiraOption } from '../../src/types/jira-types';
import type { Mock, Mocked, MockedFunction } from 'vitest';
describe('PropertyMapper', () => {
  let propertyMapper: PropertyMapper;
  let testFieldMappings: FieldMapping[];
  let testCustomTransformers: Record<string, string>;
  beforeEach(() => {
    testFieldMappings = [
      {
        jiraFieldId: 'summary',
        jiraFieldName: 'Summary',
        basePropertyId: 'title',
        basePropertyName: 'Title',
        required: true,
        bidirectional: true
      },
        jiraFieldId: 'assignee',
        jiraFieldName: 'Assignee',
        basePropertyId: 'assignee',
        basePropertyName: 'Assignee',
        required: false,
        bidirectional: true,
        transformFunction: 'user_to_user'
        jiraFieldId: 'priority',
        jiraFieldName: 'Priority',
        basePropertyId: 'priority',
        basePropertyName: 'Priority',
        transformFunction: 'option_to_select'
        jiraFieldId: 'labels',
        jiraFieldName: 'Labels',
        basePropertyId: 'labels',
        basePropertyName: 'Labels',
        transformFunction: 'array_to_multi_select'
        jiraFieldId: 'created',
        jiraFieldName: 'Created',
        basePropertyId: 'created_date',
        basePropertyName: 'Created Date',
        bidirectional: false,
        transformFunction: 'datetime_to_date'
      }
    ];
    testCustomTransformers = {
      user_to_user: `
        function(ctx) {
          if (!ctx.sourceValue) return null;
          if (typeof ctx.sourceValue === 'string') return ctx.sourceValue;
          return ctx.sourceValue.displayName || ctx.sourceValue.accountId || String(ctx.sourceValue);
        }
      `,
      option_to_select: `
          return ctx.sourceValue.name || ctx.sourceValue.value || String(ctx.sourceValue);
      array_to_multi_select: `
          if (!ctx.sourceValue) return [];
          if (!Array.isArray(ctx.sourceValue)) return [String(ctx.sourceValue)];
          return ctx.sourceValue.map(item => {
            if (typeof item === 'string') return item;
            return item.name || item.value || String(item);
          });
      datetime_to_date: `
          const date = new Date(ctx.sourceValue);
          if (isNaN(date.getTime())) return null;
          return date.toISOString().split('T')[0];
      `
    };
    propertyMapper = new PropertyMapper(testFieldMappings, testCustomTransformers);
    // Set up test schema
    const testBaseProperties: BaseProperty[] = [
        id: 'title',
        name: 'Title',
        type: BasePropertyType.TEXT,
        required: true
        id: 'assignee',
        name: 'Assignee',
        type: BasePropertyType.USER,
        required: false
        id: 'priority',
        name: 'Priority',
        type: BasePropertyType.SELECT,
        id: 'labels',
        name: 'Labels',
        type: BasePropertyType.MULTI_SELECT,
        id: 'created_date',
        name: 'Created Date',
        type: BasePropertyType.DATE,
    const testJiraFields: JiraField[] = [
        id: 'summary',
        name: 'Summary',
        custom: false,
        orderable: true,
        navigable: true,
        searchable: true,
        clauseNames: ['summary'],
        schema: { type: JiraFieldType.STRING }
        clauseNames: ['assignee'],
        schema: { type: JiraFieldType.USER }
        clauseNames: ['priority'],
        schema: { type: JiraFieldType.OPTION }
        clauseNames: ['labels'],
        schema: { type: JiraFieldType.ARRAY }
        id: 'created',
        name: 'Created',
        clauseNames: ['created'],
        schema: { type: JiraFieldType.DATETIME }
    propertyMapper.setBaseProperties(testBaseProperties);
    propertyMapper.setJiraFields(testJiraFields);
  });
  describe('Constructor and Setup', () => {
    it('should create PropertyMapper with field mappings', () => {
      expect(propertyMapper).toBeInstanceOf(PropertyMapper);
      expect(propertyMapper.getFieldMappings()).toHaveLength(5);
    });
    it('should load custom transformers without errors', () => {
      // Test that the mapper was created successfully with custom transformers
      expect(() => {
        new PropertyMapper(testFieldMappings, testCustomTransformers);
      }).not.toThrow();
    it('should handle invalid custom transformer gracefully', () => {
      const invalidTransformers = {
        'invalid_transformer': 'invalid javascript code'
      };
      // Should not throw, but log warning
        new PropertyMapper(testFieldMappings, invalidTransformers);
  describe('Jira to Base Mapping', () => {
    it('should map simple string field correctly', async () => {
      const jiraFields = {
        summary: 'Test Issue Title'
      const result = await propertyMapper.mapJiraToBase(jiraFields);
      expect(result.success).toBe(true);
      expect(result.value).toEqual({
        title: 'Test Issue Title'
      });
      expect(result.errors).toHaveLength(0);
    it('should map user field with custom transformer', async () => {
        assignee: {
          accountId: 'user123',
          displayName: 'John Doe',
          emailAddress: 'john@example.com'
        } as JiraUser
      expect(result.value.assignee).toBe('John Doe');
    it('should map option field to select', async () => {
        priority: {
          name: 'High',
          id: '3'
        } as JiraOption
      expect(result.value.priority).toBe('High');
    it('should map array field to multi-select', async () => {
        labels: ['bug', 'frontend', 'urgent']
      expect(result.value.labels).toEqual(['bug', 'frontend', 'urgent']);
    it('should map datetime to date format', async () => {
        created: '2024-01-15T10:30:00.000Z'
      expect(result.value.created_date).toBe('2024-01-15');
    it('should handle null values correctly', async () => {
        summary: 'Test Issue',
        assignee: null,
        priority: null,
        labels: null
      expect(result.value.title).toBe('Test Issue');
      expect(result.value.assignee).toBeNull();
      expect(result.value.priority).toBeNull();
      expect(result.value.labels).toEqual([]);
    it('should add default values for required fields', async () => {
      const jiraFields = {}; // No summary provided
      expect(result.success).toBe(false); // Should fail due to missing required field
      expect(result.errors).toHaveLength(1);
      expect(result.errors![0].code).toBe('REQUIRED_FIELD_MISSING');
    it('should handle unmapped fields with warnings', async () => {
        unknownField: 'some value'
      expect(result.warnings).toContain('No mapping found for Jira field: unknownField');
    it('should handle transformation errors gracefully', async () => {
      // Mock a failing transformer by providing invalid data
        created: 'invalid-date-string'
      expect(result.success).toBe(true); // Should still succeed
      expect(result.value.created_date).toBeNull(); // Should handle invalid date gracefully
  describe('Base to Jira Mapping', () => {
    it('should map simple text field correctly', async () => {
      const baseProperties = {
      const result = await propertyMapper.mapBaseToJira(baseProperties);
    it('should map user field correctly', async () => {
        assignee: 'John Doe'
    it('should map select to option format', async () => {
        priority: 'High'
    it('should map multi-select to array', async () => {
        labels: ['bug', 'frontend']
      expect(result.value.labels).toEqual(['bug', 'frontend']);
    it('should skip non-bidirectional fields', async () => {
        title: 'Test Issue',
        created_date: '2024-01-15'
      expect(result.value).toHaveProperty('summary', 'Test Issue');
      expect(result.value).not.toHaveProperty('created'); // Not bidirectional
    it('should handle unmapped properties with warnings', async () => {
        unknownProperty: 'some value'
      expect(result.warnings).toContain('No reverse mapping found for Base property: unknownProperty');
  describe('Built-in Transformers', () => {
    let simpleMapper: PropertyMapper;
    beforeEach(() => {
      // Create mapper without custom transformers to test built-ins
      simpleMapper = new PropertyMapper([
        {
          jiraFieldId: 'testString',
          jiraFieldName: 'Test String',
          basePropertyId: 'test_text',
          basePropertyName: 'Test Text',
          required: false,
          bidirectional: true
        },
          jiraFieldId: 'testNumber',
          jiraFieldName: 'Test Number',
          basePropertyId: 'test_number',
          basePropertyName: 'Test Number',
          jiraFieldId: 'testDate',
          jiraFieldName: 'Test Date',
          basePropertyId: 'test_date',
          basePropertyName: 'Test Date',
      ]);
      const baseProperties: BaseProperty[] = [
        { id: 'test_text', name: 'Test Text', type: BasePropertyType.TEXT, required: false },
        { id: 'test_number', name: 'Test Number', type: BasePropertyType.NUMBER, required: false },
        { id: 'test_date', name: 'Test Date', type: BasePropertyType.DATE, required: false }
      ];
      simpleMapper.setBaseProperties(baseProperties);
    it('should transform to text correctly', async () => {
        testString: { displayName: 'Complex Object' }
      const result = await simpleMapper.mapJiraToBase(jiraFields);
      expect(result.value.test_text).toBe('Complex Object');
    it('should transform to number correctly', async () => {
        testNumber: '42.5'
      expect(result.value.test_number).toBe(42.5);
    it('should handle invalid number transformation', async () => {
        testNumber: 'not-a-number'
      expect(result.success).toBe(false);
      expect(result.errors![0].code).toBe('INVALID_NUMBER');
    it('should transform to date correctly', async () => {
        testDate: '2024-01-15T10:30:00.000Z'
      expect(result.value.test_date).toBe('2024-01-15');
    it('should handle invalid date transformation', async () => {
        testDate: 'not-a-date'
      expect(result.errors![0].code).toBe('INVALID_DATE');
  describe('Field Mapping Management', () => {
    it('should get all field mappings', () => {
      const mappings = propertyMapper.getFieldMappings();
      expect(mappings).toHaveLength(5);
      expect(mappings.map(m => m.jiraFieldId)).toContain('summary');
    it('should get specific Jira mapping', () => {
      const mapping = propertyMapper.getJiraMapping('summary');
      expect(mapping).toBeDefined();
      expect(mapping!.basePropertyId).toBe('title');
    it('should get specific Base mapping', () => {
      const mapping = propertyMapper.getBaseMapping('assignee');
      expect(mapping!.jiraFieldId).toBe('assignee');
    it('should add new field mapping', () => {
      const newMapping: FieldMapping = {
        jiraFieldId: 'customfield_12345',
        jiraFieldName: 'Story Points',
        basePropertyId: 'story_points',
        basePropertyName: 'Story Points',
      propertyMapper.setFieldMapping(newMapping);
      expect(mappings).toHaveLength(6);
      
      const addedMapping = propertyMapper.getJiraMapping('customfield_12345');
      expect(addedMapping).toEqual(newMapping);
    it('should remove field mapping', () => {
      const removed = propertyMapper.removeFieldMapping('labels');
      expect(removed).toBe(true);
      expect(mappings).toHaveLength(4);
      const removedMapping = propertyMapper.getJiraMapping('labels');
      expect(removedMapping).toBeUndefined();
    it('should return false when removing non-existent mapping', () => {
      const removed = propertyMapper.removeFieldMapping('nonexistent');
      expect(removed).toBe(false);
  describe('Error Handling and Edge Cases', () => {
    it('should handle empty input gracefully', async () => {
      const result = await propertyMapper.mapJiraToBase({});
      expect(result.success).toBe(false); // Due to missing required field
      expect(result.value).toEqual({});
    it('should handle complex nested objects', async () => {
          emailAddress: 'john@example.com',
          avatarUrls: {
            '16x16': 'url1',
            '24x24': 'url2'
          },
          active: true,
          timeZone: 'UTC'
    it('should handle circular references in objects', async () => {
      const circularObject: any = { name: 'Test' };
      circularObject.self = circularObject;
        priority: circularObject
      // Should not throw and handle gracefully
      expect(result.value.priority).toBe('Test');
    it('should handle very large arrays', async () => {
      const largeArray = Array.from({ length: 1000 }, (_, i) => `label-${i}`);
        labels: largeArray
      expect(result.value.labels).toHaveLength(1000);
      expect(result.value.labels[0]).toBe('label-0');
      expect(result.value.labels[999]).toBe('label-999');
    it('should handle special characters in field values', async () => {
        summary: 'Issue with special chars: àáâãäåæçèéêëìíîïñòóôõöøùúûüý 中文 🚀'
      expect(result.value.title).toBe('Issue with special chars: àáâãäåæçèéêëìíîïñòóôõöøùúûüý 中文 🚀');
    it('should handle transformation function errors gracefully', async () => {
      // Create mapper with a transformer that will throw
      const errorTransformers = {
        'error_transformer': 'function(ctx) { throw new Error("Test error"); }'
      const errorMapping: FieldMapping = {
        jiraFieldId: 'errorField',
        jiraFieldName: 'Error Field',
        basePropertyId: 'error_prop',
        basePropertyName: 'Error Property',
        transformFunction: 'error_transformer'
      const errorMapper = new PropertyMapper([errorMapping], errorTransformers);
        errorField: 'test value'
      const result = await errorMapper.mapJiraToBase(jiraFields);
      expect(result.errors![0].code).toBe('TRANSFORMER_ERROR');
});
