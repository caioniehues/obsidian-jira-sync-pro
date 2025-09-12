/**
 * Schema Validator Tests
 * Tests for property validation against Base and Jira schemas
 */

import {
  SchemaValidator,
  ValidationRule,
  ValidationRules,
} from '../../src/utils/schema-validator';
import {
  BaseProperty,
  BasePropertyType,
  PropertyConstraints,
} from '../../src/types/base-types';
import { JiraField, JiraFieldType } from '../../src/types/jira-types';

describe('SchemaValidator', () => {
  let schemaValidator: SchemaValidator;
  let testValidationRules: ValidationRules;
  let testBaseProperties: BaseProperty[];
  let testJiraFields: JiraField[];

  beforeEach(() => {
    testValidationRules = {
      title: {
        required: true,
        minLength: 1,
        maxLength: 255,
      },
      description: {
        maxLength: 32767,
      },
      assignee: {
        pattern: /^[a-zA-Z0-9._-]+$/,
      },
      priority: {
        allowedValues: ['Highest', 'High', 'Medium', 'Low', 'Lowest'],
      },
      story_points: {
        min: 0,
        max: 100,
      },
      email: {
        pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
      },
      custom_field: {
        customValidator: (value: any, context) => {
          if (typeof value === 'string' && value.includes('forbidden')) {
            return {
              valid: false,
              errors: [
                {
                  property: context.propertyId,
                  message: 'Value contains forbidden word',
                  code: 'FORBIDDEN_VALUE',
                  value,
                },
              ],
              warnings: [],
            };
          }
          return { valid: true, errors: [], warnings: [] };
        },
      },
    };

    testBaseProperties = [
      {
        id: 'title',
        name: 'Title',
        type: BasePropertyType.TEXT,
        required: true,
        constraints: {
          maxLength: 255,
        },
      },
      {
        id: 'description',
        name: 'Description',
        type: BasePropertyType.RICH_TEXT,
        required: false,
        constraints: {
          maxLength: 32767,
        },
      },
      {
        id: 'assignee',
        name: 'Assignee',
        type: BasePropertyType.USER,
        required: false,
      },
      {
        id: 'priority',
        name: 'Priority',
        type: BasePropertyType.SELECT,
        required: false,
        constraints: {
          options: [
            { id: '1', name: 'Highest' },
            { id: '2', name: 'High' },
            { id: '3', name: 'Medium' },
            { id: '4', name: 'Low' },
            { id: '5', name: 'Lowest' },
          ],
        },
      },
      {
        id: 'story_points',
        name: 'Story Points',
        type: BasePropertyType.NUMBER,
        required: false,
        constraints: {
          min: 0,
          max: 100,
        },
      },
      {
        id: 'labels',
        name: 'Labels',
        type: BasePropertyType.MULTI_SELECT,
        required: false,
      },
      {
        id: 'due_date',
        name: 'Due Date',
        type: BasePropertyType.DATE,
        required: false,
      },
      {
        id: 'completed',
        name: 'Completed',
        type: BasePropertyType.BOOLEAN,
        required: false,
      },
      {
        id: 'website',
        name: 'Website',
        type: BasePropertyType.URL,
        required: false,
      },
      {
        id: 'email',
        name: 'Email',
        type: BasePropertyType.EMAIL,
        required: false,
      },
      {
        id: 'phone',
        name: 'Phone',
        type: BasePropertyType.PHONE,
        required: false,
      },
      {
        id: 'with_default',
        name: 'With Default',
        type: BasePropertyType.TEXT,
        required: true,
        defaultValue: 'default_value',
      },
    ];

    testJiraFields = [
      {
        id: 'summary',
        name: 'Summary',
        custom: false,
        orderable: true,
        navigable: true,
        searchable: true,
        clauseNames: ['summary'],
        schema: { type: JiraFieldType.STRING },
      },
      {
        id: 'storyPoints',
        name: 'Story Points',
        custom: true,
        orderable: true,
        navigable: true,
        searchable: true,
        clauseNames: ['cf[10001]'],
        schema: { type: JiraFieldType.NUMBER },
      },
      {
        id: 'duedate',
        name: 'Due Date',
        custom: false,
        orderable: true,
        navigable: true,
        searchable: true,
        clauseNames: ['duedate'],
        schema: { type: JiraFieldType.DATE },
      },
      {
        id: 'labels',
        name: 'Labels',
        custom: false,
        orderable: true,
        navigable: true,
        searchable: true,
        clauseNames: ['labels'],
        schema: { type: JiraFieldType.ARRAY },
      },
    ];

    schemaValidator = new SchemaValidator(testValidationRules);
    schemaValidator.setBaseProperties(testBaseProperties);
    schemaValidator.setJiraFields(testJiraFields);
  });

  describe('Constructor and Setup', () => {
    it('should create SchemaValidator with validation rules', () => {
      expect(schemaValidator).toBeInstanceOf(SchemaValidator);
    });

    it('should create SchemaValidator without validation rules', () => {
      const validator = new SchemaValidator();
      expect(validator).toBeInstanceOf(SchemaValidator);
    });

    it('should load validation rules correctly', () => {
      const newRules: ValidationRules = {
        test_field: { required: true },
      };

      schemaValidator.loadValidationRules(newRules);

      const rule = schemaValidator.getValidationRule('test_field');
      expect(rule).toEqual({ required: true });
    });
  });

  describe('Base Property Validation', () => {
    it('should validate valid properties successfully', () => {
      const properties = {
        title: 'Valid Title',
        description: 'Valid description content',
        assignee: 'john_doe',
        priority: 'High',
        story_points: 5,
        labels: ['bug', 'frontend'],
        due_date: '2024-12-31',
        completed: true,
        website: 'https://example.com',
        email: 'test@example.com',
        phone: '+1-555-123-4567',
      };

      const result = schemaValidator.validateBaseProperties(properties);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail validation for missing required field', () => {
      const properties = {
        description: 'Description without title',
      };

      const result = schemaValidator.validateBaseProperties(properties);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('REQUIRED_PROPERTY_MISSING');
      expect(result.errors[0].property).toBe('title');
    });

    it('should use default value for missing required field', () => {
      const properties = {
        title: 'Test Title',
        // with_default is missing but has default value
      };

      const result = schemaValidator.validateBaseProperties(properties, {
        normalizeValues: true,
      });

      expect(result.valid).toBe(true);
      expect(result.normalizedValue!.with_default).toBe('default_value');
      expect(result.warnings).toContain(
        'Using default value for required property: with_default'
      );
    });

    it('should skip required field validation when skipRequired is true', () => {
      const properties = {
        description: 'Only description',
      };

      const result = schemaValidator.validateBaseProperties(properties, {
        skipRequired: true,
      });

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate string length constraints', () => {
      const properties = {
        title: '', // Too short
        description: 'a'.repeat(40000), // Too long
      };

      const result = schemaValidator.validateBaseProperties(properties);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(2);

      const lengthErrors = result.errors.filter(
        e =>
          e.code === 'MIN_LENGTH_VIOLATION' || e.code === 'MAX_LENGTH_VIOLATION'
      );
      expect(lengthErrors).toHaveLength(2);
    });

    it('should validate numeric range constraints', () => {
      const properties = {
        title: 'Valid Title',
        story_points: -5, // Below minimum
      };

      const result = schemaValidator.validateBaseProperties(properties);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('MIN_VALUE_VIOLATION');
      expect(result.errors[0].property).toBe('story_points');
    });

    it('should validate pattern constraints', () => {
      const properties = {
        title: 'Valid Title',
        assignee: 'invalid user@name', // Contains invalid characters
        email: 'invalid-email', // Invalid email format
      };

      const result = schemaValidator.validateBaseProperties(properties);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);

      const patternErrors = result.errors.filter(
        e =>
          e.code === 'PATTERN_VIOLATION' || e.code === 'TYPE_VALIDATION_ERROR'
      );
      expect(patternErrors.length).toBeGreaterThan(0);
    });

    it('should validate allowed values constraints', () => {
      const properties = {
        title: 'Valid Title',
        priority: 'Invalid Priority',
      };

      const result = schemaValidator.validateBaseProperties(properties);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('INVALID_OPTION');
      expect(result.errors[0].property).toBe('priority');
    });

    it('should handle custom validator', () => {
      const properties = {
        title: 'Valid Title',
        custom_field: 'This contains forbidden word',
      };

      const result = schemaValidator.validateBaseProperties(properties);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('FORBIDDEN_VALUE');
      expect(result.errors[0].property).toBe('custom_field');
    });

    it('should handle custom validator errors gracefully', () => {
      const invalidValidator: ValidationRule = {
        customValidator: () => {
          throw new Error('Validator error');
        },
      };

      schemaValidator.setValidationRule('error_field', invalidValidator);

      const properties = {
        title: 'Valid Title',
        error_field: 'test',
      };

      const result = schemaValidator.validateBaseProperties(properties);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('CUSTOM_VALIDATOR_ERROR');
    });

    it('should handle unknown properties based on options', () => {
      const properties = {
        title: 'Valid Title',
        unknown_property: 'unknown value',
      };

      // Allow unknown properties
      const resultAllow = schemaValidator.validateBaseProperties(properties, {
        allowUnknownProperties: true,
      });

      expect(resultAllow.valid).toBe(true);
      expect(resultAllow.warnings).toContain(
        'Unknown property: unknown_property'
      );

      // Strict mode - reject unknown properties
      const resultStrict = schemaValidator.validateBaseProperties(properties, {
        allowUnknownProperties: false,
        strictMode: true,
      });

      expect(resultStrict.valid).toBe(false);
      expect(resultStrict.errors.some(e => e.code === 'UNKNOWN_PROPERTY')).toBe(
        true
      );
    });

    it('should normalize values when requested', () => {
      const properties = {
        title: 'Valid Title',
        story_points: '42', // String that can be converted to number
        completed: 'true', // String that can be converted to boolean
        due_date: '2024-12-31T10:30:00Z', // DateTime that should be converted to date
      };

      const result = schemaValidator.validateBaseProperties(properties, {
        normalizeValues: true,
      });

      expect(result.valid).toBe(true);
      expect(result.normalizedValue!.story_points).toBe(42);
      expect(result.normalizedValue!.completed).toBe(true);
      expect(result.normalizedValue!.due_date).toBe('2024-12-31');
    });
  });

  describe('Jira Field Validation', () => {
    it('should validate valid Jira fields', () => {
      const jiraFields = {
        summary: 'Valid summary',
        storyPoints: 5,
        duedate: '2024-12-31',
        labels: ['bug', 'frontend'],
      };

      const result = schemaValidator.validateJiraFields(jiraFields);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate string fields', () => {
      const jiraFields = {
        summary: 123, // Should be string
      };

      const result = schemaValidator.validateJiraFields(jiraFields);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('INVALID_STRING');
    });

    it('should validate number fields', () => {
      const jiraFields = {
        storyPoints: 'not-a-number',
      };

      const result = schemaValidator.validateJiraFields(jiraFields);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('INVALID_NUMBER');
    });

    it('should validate date fields', () => {
      const jiraFields = {
        duedate: 'invalid-date',
      };

      const result = schemaValidator.validateJiraFields(jiraFields);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('INVALID_DATE');
    });

    it('should validate array fields', () => {
      const jiraFields = {
        labels: 'should-be-array',
      };

      const result = schemaValidator.validateJiraFields(jiraFields);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('INVALID_ARRAY');
    });

    it('should handle unknown Jira fields', () => {
      const jiraFields = {
        unknownField: 'value',
      };

      const result = schemaValidator.validateJiraFields(jiraFields, {
        allowUnknownProperties: true,
      });

      expect(result.valid).toBe(true);
      expect(result.warnings).toContain('Unknown Jira field: unknownField');
    });
  });

  describe('Type-specific Validation', () => {
    it('should validate text type correctly', () => {
      const validator = new SchemaValidator();
      validator.setBaseProperties([
        {
          id: 'text_field',
          name: 'Text',
          type: BasePropertyType.TEXT,
          required: false,
        },
      ]);

      const result = validator.validateBaseProperties(
        {
          text_field: 123, // Will be converted to string
        },
        { normalizeValues: true }
      );

      expect(result.valid).toBe(true);
      expect(result.normalizedValue!.text_field).toBe('123');
    });

    it('should validate number type correctly', () => {
      const validator = new SchemaValidator();
      validator.setBaseProperties([
        {
          id: 'num_field',
          name: 'Number',
          type: BasePropertyType.NUMBER,
          required: false,
        },
      ]);

      const validResult = validator.validateBaseProperties(
        {
          num_field: '42.5',
        },
        { normalizeValues: true }
      );

      expect(validResult.valid).toBe(true);
      expect(validResult.normalizedValue!.num_field).toBe(42.5);

      const invalidResult = validator.validateBaseProperties({
        num_field: 'not-a-number',
      });

      expect(invalidResult.valid).toBe(false);
      expect(invalidResult.errors[0].code).toBe('TYPE_VALIDATION_ERROR');
    });

    it('should validate date type correctly', () => {
      const validator = new SchemaValidator();
      validator.setBaseProperties([
        {
          id: 'date_field',
          name: 'Date',
          type: BasePropertyType.DATE,
          required: false,
        },
      ]);

      const validResult = validator.validateBaseProperties(
        {
          date_field: '2024-01-15T10:30:00Z',
        },
        { normalizeValues: true }
      );

      expect(validResult.valid).toBe(true);
      expect(validResult.normalizedValue!.date_field).toBe('2024-01-15');

      const invalidResult = validator.validateBaseProperties({
        date_field: 'not-a-date',
      });

      expect(invalidResult.valid).toBe(false);
      expect(invalidResult.errors[0].code).toBe('TYPE_VALIDATION_ERROR');
    });

    it('should validate boolean type correctly', () => {
      const validator = new SchemaValidator();
      validator.setBaseProperties([
        {
          id: 'bool_field',
          name: 'Boolean',
          type: BasePropertyType.BOOLEAN,
          required: false,
        },
      ]);

      const testCases = [
        { input: 'true', expected: true },
        { input: 'false', expected: false },
        { input: 'yes', expected: true },
        { input: 'no', expected: false },
        { input: 1, expected: true },
        { input: 0, expected: false },
      ];

      for (const testCase of testCases) {
        const result = validator.validateBaseProperties(
          {
            bool_field: testCase.input,
          },
          { normalizeValues: true }
        );

        expect(result.valid).toBe(true);
        expect(result.normalizedValue!.bool_field).toBe(testCase.expected);
      }
    });

    it('should validate select type correctly', () => {
      const validator = new SchemaValidator();
      validator.setBaseProperties([
        {
          id: 'select_field',
          name: 'Select',
          type: BasePropertyType.SELECT,
          required: false,
        },
      ]);

      const result = validator.validateBaseProperties(
        {
          select_field: { name: 'Option 1', id: '1' },
        },
        { normalizeValues: true }
      );

      expect(result.valid).toBe(true);
      expect(result.normalizedValue!.select_field).toBe('Option 1');
    });

    it('should validate multi-select type correctly', () => {
      const validator = new SchemaValidator();
      validator.setBaseProperties([
        {
          id: 'multi_field',
          name: 'Multi-Select',
          type: BasePropertyType.MULTI_SELECT,
          required: false,
        },
      ]);

      const result = validator.validateBaseProperties(
        {
          multi_field: [{ name: 'Option 1' }, { name: 'Option 2' }],
        },
        { normalizeValues: true }
      );

      expect(result.valid).toBe(true);
      expect(result.normalizedValue!.multi_field).toEqual([
        'Option 1',
        'Option 2',
      ]);
    });

    it('should validate URL type correctly', () => {
      const validator = new SchemaValidator();
      validator.setBaseProperties([
        {
          id: 'url_field',
          name: 'URL',
          type: BasePropertyType.URL,
          required: false,
        },
      ]);

      const validResult = validator.validateBaseProperties(
        {
          url_field: 'https://example.com',
        },
        { normalizeValues: true }
      );

      expect(validResult.valid).toBe(true);
      expect(validResult.normalizedValue!.url_field).toBe(
        'https://example.com'
      );

      const invalidResult = validator.validateBaseProperties({
        url_field: 'not-a-url',
      });

      expect(invalidResult.valid).toBe(false);
      expect(invalidResult.errors[0].code).toBe('TYPE_VALIDATION_ERROR');
    });

    it('should validate email type correctly', () => {
      const validator = new SchemaValidator();
      validator.setBaseProperties([
        {
          id: 'email_field',
          name: 'Email',
          type: BasePropertyType.EMAIL,
          required: false,
        },
      ]);

      const validResult = validator.validateBaseProperties(
        {
          email_field: 'test@example.com',
        },
        { normalizeValues: true }
      );

      expect(validResult.valid).toBe(true);
      expect(validResult.normalizedValue!.email_field).toBe('test@example.com');

      const invalidResult = validator.validateBaseProperties({
        email_field: 'not-an-email',
      });

      expect(invalidResult.valid).toBe(false);
      expect(invalidResult.errors[0].code).toBe('TYPE_VALIDATION_ERROR');
    });

    it('should validate phone type correctly', () => {
      const validator = new SchemaValidator();
      validator.setBaseProperties([
        {
          id: 'phone_field',
          name: 'Phone',
          type: BasePropertyType.PHONE,
          required: false,
        },
      ]);

      const validResult = validator.validateBaseProperties(
        {
          phone_field: '+1-555-123-4567',
        },
        { normalizeValues: true }
      );

      expect(validResult.valid).toBe(true);
      expect(validResult.normalizedValue!.phone_field).toBe('+1-555-123-4567');

      const invalidResult = validator.validateBaseProperties({
        phone_field: 'not-a-phone',
      });

      expect(invalidResult.valid).toBe(false);
      expect(invalidResult.errors[0].code).toBe('TYPE_VALIDATION_ERROR');
    });
  });

  describe('Validation Rule Management', () => {
    it('should set and get validation rule', () => {
      const rule: ValidationRule = {
        required: true,
        minLength: 5,
      };

      schemaValidator.setValidationRule('test_prop', rule);
      const retrieved = schemaValidator.getValidationRule('test_prop');

      expect(retrieved).toEqual(rule);
    });

    it('should remove validation rule', () => {
      schemaValidator.setValidationRule('test_prop', { required: true });

      const removed = schemaValidator.removeValidationRule('test_prop');
      expect(removed).toBe(true);

      const retrieved = schemaValidator.getValidationRule('test_prop');
      expect(retrieved).toBeUndefined();
    });

    it('should return false when removing non-existent rule', () => {
      const removed = schemaValidator.removeValidationRule('nonexistent');
      expect(removed).toBe(false);
    });

    it('should clear all validation rules', () => {
      schemaValidator.setValidationRule('prop1', { required: true });
      schemaValidator.setValidationRule('prop2', { maxLength: 100 });

      schemaValidator.clearValidationRules();

      expect(schemaValidator.getValidationRule('prop1')).toBeUndefined();
      expect(schemaValidator.getValidationRule('prop2')).toBeUndefined();
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle null and undefined values', () => {
      const properties = {
        title: 'Valid Title',
        description: null,
        assignee: undefined,
      };

      const result = schemaValidator.validateBaseProperties(properties);

      expect(result.valid).toBe(true);
      // Should not error on optional null/undefined fields
    });

    it('should handle empty objects', () => {
      const result = schemaValidator.validateBaseProperties({});

      expect(result.valid).toBe(false); // Due to missing required fields
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should handle properties with circular references', () => {
      const circular: any = { name: 'test' };
      circular.self = circular;

      const properties = {
        title: 'Valid Title',
        complex_object: circular,
      };

      // Should not throw
      expect(() => {
        schemaValidator.validateBaseProperties(properties, {
          allowUnknownProperties: true,
        });
      }).not.toThrow();
    });

    it('should handle very long property values', () => {
      const properties = {
        title: 'Valid Title',
        description: 'a'.repeat(100000), // Very long description
      };

      const result = schemaValidator.validateBaseProperties(properties);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'MAX_LENGTH_VIOLATION')).toBe(
        true
      );
    });
  });
});
