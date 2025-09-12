/**
 * Resolution Validator
 * Validates resolution choices and ensures data integrity
 * Checks field constraints, business rules, and data consistency
 */

import { ConflictInfo } from '../sync/conflict-detector';
import { ResolutionResult } from './resolution-strategies';
import { MergeResult } from './merge-engine';

export interface ValidationRule {
  name: string;
  description: string;
  fieldPattern?: RegExp; // Apply to fields matching this pattern
  validator: (
    value: unknown,
    field: string,
    context?: ValidationContext
  ) => ValidationResult;
  severity: 'error' | 'warning' | 'info';
  autoFix?: (
    value: unknown,
    field: string,
    context?: ValidationContext
  ) => unknown;
}

export interface ValidationContext {
  originalConflict: ConflictInfo;
  resolution: ResolutionResult;
  issueType?: string;
  fieldConstraints?: Map<string, FieldConstraint>;
  businessRules?: BusinessRule[];
  relatedFields?: Map<string, unknown>; // Other field values for cross-field validation
}

export interface FieldConstraint {
  required?: boolean;
  type?: 'string' | 'number' | 'boolean' | 'array' | 'object';
  minLength?: number;
  maxLength?: number;
  pattern?: RegExp;
  allowedValues?: unknown[];
  customValidator?: (value: unknown) => boolean;
}

export interface BusinessRule {
  name: string;
  description: string;
  validator: (value: unknown, allFields: Map<string, unknown>) => boolean;
  errorMessage: string;
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  suggestions: ValidationSuggestion[];
  autoFixApplied?: boolean;
  correctedValue?: unknown;
}

export interface ValidationError {
  field: string;
  rule: string;
  message: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  suggestedFix?: string;
}

export interface ValidationWarning {
  field: string;
  rule: string;
  message: string;
  impact: string;
}

export interface ValidationSuggestion {
  field: string;
  suggestion: string;
  reason: string;
  confidence: number;
}

export class ResolutionValidator {
  private readonly validationRules: ValidationRule[] = [];
  private readonly fieldConstraints: Map<string, FieldConstraint> = new Map();
  private readonly businessRules: BusinessRule[] = [];

  constructor() {
    this.initializeDefaultRules();
    this.initializeFieldConstraints();
    this.initializeBusinessRules();
  }

  /**
   * Validate a resolution result
   */
  validateResolution(
    resolution: ResolutionResult,
    conflict: ConflictInfo,
    context?: Partial<ValidationContext>
  ): ValidationResult {
    const validationContext: ValidationContext = {
      originalConflict: conflict,
      resolution,
      fieldConstraints: this.fieldConstraints,
      businessRules: this.businessRules,
      ...context,
    };

    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    const suggestions: ValidationSuggestion[] = [];
    let autoFixApplied = false;
    let correctedValue = resolution.resolvedValue;

    // Apply validation rules
    for (const rule of this.validationRules) {
      // Check if rule applies to this field
      if (rule.fieldPattern && !rule.fieldPattern.test(conflict.field)) {
        continue;
      }

      try {
        const ruleResult = rule.validator(
          resolution.resolvedValue,
          conflict.field,
          validationContext
        );

        // Merge results
        errors.push(...ruleResult.errors);
        warnings.push(...ruleResult.warnings);
        suggestions.push(...ruleResult.suggestions);

        // Apply auto-fix if available and needed
        if (!ruleResult.isValid && rule.autoFix && rule.severity !== 'error') {
          try {
            const fixedValue = rule.autoFix(
              correctedValue,
              conflict.field,
              validationContext
            );
            if (fixedValue !== correctedValue) {
              correctedValue = fixedValue;
              autoFixApplied = true;
              warnings.push({
                field: conflict.field,
                rule: rule.name,
                message: `Auto-fix applied: ${rule.description}`,
                impact:
                  'Value was automatically corrected to meet validation rules',
              });
            }
          } catch (fixError) {
            errors.push({
              field: conflict.field,
              rule: rule.name,
              message: `Auto-fix failed: ${fixError instanceof Error ? fixError.message : 'Unknown error'}`,
              severity: 'medium',
              suggestedFix: 'Manual correction required',
            });
          }
        }
      } catch (error) {
        errors.push({
          field: conflict.field,
          rule: rule.name,
          message: `Validation rule failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          severity: 'low',
        });
      }
    }

    // Validate field constraints
    const constraintResult = this.validateFieldConstraints(
      correctedValue,
      conflict.field,
      validationContext
    );
    errors.push(...constraintResult.errors);
    warnings.push(...constraintResult.warnings);
    suggestions.push(...constraintResult.suggestions);

    // Validate business rules
    const businessRuleResult = this.validateBusinessRules(
      correctedValue,
      conflict.field,
      validationContext
    );
    errors.push(...businessRuleResult.errors);
    warnings.push(...businessRuleResult.warnings);

    // Check for critical validation failures
    const hasCriticalErrors = errors.some(
      error => error.severity === 'critical'
    );
    const isValid = errors.length === 0 || !hasCriticalErrors;

    return {
      isValid,
      errors: errors.sort(
        (a, b) =>
          this.getSeverityWeight(b.severity) -
          this.getSeverityWeight(a.severity)
      ),
      warnings,
      suggestions,
      autoFixApplied,
      correctedValue: autoFixApplied ? correctedValue : undefined,
    };
  }

  /**
   * Validate a merge result
   */
  validateMergeResult(
    mergeResult: MergeResult,
    field: string,
    originalConflict: ConflictInfo
  ): ValidationResult {
    const mockResolution: ResolutionResult = {
      strategy: 'MERGE',
      resolvedValue: mergeResult.mergedValue,
      confidence: mergeResult.confidence,
      reason: `Merged using ${mergeResult.algorithm} algorithm`,
    };

    const result = this.validateResolution(mockResolution, originalConflict);

    // Add merge-specific warnings
    if (mergeResult.conflictsRemaining > 0) {
      result.warnings.push({
        field,
        rule: 'merge_conflicts',
        message: `Merge contains ${mergeResult.conflictsRemaining} unresolved conflicts`,
        impact: 'Manual resolution required for conflict markers',
      });
    }

    if (mergeResult.metadata.hasConflictMarkers) {
      result.warnings.push({
        field,
        rule: 'conflict_markers',
        message: 'Merged value contains conflict markers',
        impact: 'Content may be malformed until conflicts are resolved',
      });
    }

    return result;
  }

  /**
   * Add custom validation rule
   */
  addValidationRule(rule: ValidationRule): void {
    this.validationRules.push(rule);
  }

  /**
   * Add field constraint
   */
  addFieldConstraint(field: string, constraint: FieldConstraint): void {
    this.fieldConstraints.set(field, constraint);
  }

  /**
   * Add business rule
   */
  addBusinessRule(rule: BusinessRule): void {
    this.businessRules.push(rule);
  }

  /**
   * Initialize default validation rules
   */
  private initializeDefaultRules(): void {
    // Required fields validation
    this.validationRules.push({
      name: 'required_fields',
      description: 'Ensure required fields are not empty',
      validator: (value, field) => {
        const constraint = context?.fieldConstraints?.get(field);
        if (constraint?.required && this.isEmptyValue(value)) {
          return {
            isValid: false,
            errors: [
              {
                field,
                rule: 'required_fields',
                message: `Field '${field}' is required but resolved to empty value`,
                severity: 'critical' as const,
                suggestedFix: `Use ${context?.originalConflict.localValue ? 'local' : 'remote'} value instead`,
              },
            ],
            warnings: [],
            suggestions: [],
          };
        }
        return { isValid: true, errors: [], warnings: [], suggestions: [] };
      },
      severity: 'error',
    });

    // Data type validation
    this.validationRules.push({
      name: 'type_validation',
      description: 'Ensure resolved values match expected data types',
      validator: (value, field) => {
        const constraint = context?.fieldConstraints?.get(field);
        const errors: ValidationError[] = [];

        if (constraint?.type && !this.isValueOfType(value, constraint.type)) {
          errors.push({
            field,
            rule: 'type_validation',
            message: `Expected ${constraint.type} but got ${typeof value}`,
            severity: 'high',
            suggestedFix: `Convert value to ${constraint.type}`,
          });
        }

        return {
          isValid: errors.length === 0,
          errors,
          warnings: [],
          suggestions: [],
        };
      },
      severity: 'error',
      autoFix: (value, field, context) => {
        const constraint = context?.fieldConstraints?.get(field);
        if (constraint?.type) {
          return this.convertToType(value, constraint.type);
        }
        return value;
      },
    });

    // String length validation
    this.validationRules.push({
      name: 'string_length',
      description: 'Validate string length constraints',
      validator: (value, field) => {
        if (typeof value !== 'string') {
          return { isValid: true, errors: [], warnings: [], suggestions: [] };
        }

        const constraint = context?.fieldConstraints?.get(field);
        const errors: ValidationError[] = [];
        const warnings: ValidationWarning[] = [];

        if (constraint?.minLength && value.length < constraint.minLength) {
          errors.push({
            field,
            rule: 'string_length',
            message: `Minimum length ${constraint.minLength} not met (got ${value.length})`,
            severity: 'medium',
            suggestedFix: 'Pad or extend the string',
          });
        }

        if (constraint?.maxLength && value.length > constraint.maxLength) {
          warnings.push({
            field,
            rule: 'string_length',
            message: `Maximum length ${constraint.maxLength} exceeded (got ${value.length})`,
            impact: 'Value may be truncated by target system',
          });
        }

        return {
          isValid: errors.length === 0,
          errors,
          warnings,
          suggestions: [],
        };
      },
      severity: 'warning',
      autoFix: (value, field, context) => {
        if (typeof value === 'string') {
          const constraint = context?.fieldConstraints?.get(field);
          if (constraint?.maxLength && value.length > constraint.maxLength) {
            return `${value.substring(0, constraint.maxLength - 3)  }...`;
          }
        }
        return value;
      },
    });

    // Pattern validation
    this.validationRules.push({
      name: 'pattern_validation',
      description: 'Validate values against specified patterns',
      validator: (value, field) => {
        const constraint = context?.fieldConstraints?.get(field);
        if (!constraint?.pattern || typeof value !== 'string') {
          return { isValid: true, errors: [], warnings: [], suggestions: [] };
        }

        const matches = constraint.pattern.test(value);
        if (!matches) {
          return {
            isValid: false,
            errors: [
              {
                field,
                rule: 'pattern_validation',
                message: `Value does not match required pattern: ${constraint.pattern}`,
                severity: 'medium',
                suggestedFix: 'Correct the format or choose different value',
              },
            ],
            warnings: [],
            suggestions: [],
          };
        }

        return { isValid: true, errors: [], warnings: [], suggestions: [] };
      },
      severity: 'warning',
    });

    // Allowed values validation
    this.validationRules.push({
      name: 'allowed_values',
      description: 'Validate values are from allowed set',
      validator: (value, field) => {
        const constraint = context?.fieldConstraints?.get(field);
        if (!constraint?.allowedValues) {
          return { isValid: true, errors: [], warnings: [], suggestions: [] };
        }

        const isAllowed = constraint.allowedValues.includes(value);
        if (!isAllowed) {
          return {
            isValid: false,
            errors: [
              {
                field,
                rule: 'allowed_values',
                message: `Value '${value}' is not in allowed values: ${constraint.allowedValues.join(', ')}`,
                severity: 'high',
                suggestedFix: `Choose from: ${constraint.allowedValues.join(', ')}`,
              },
            ],
            warnings: [],
            suggestions: constraint.allowedValues.map(allowedValue => ({
              field,
              suggestion: `Use '${allowedValue}'`,
              reason: 'Valid option from allowed values',
              confidence: 0.8,
            })),
          };
        }

        return { isValid: true, errors: [], warnings: [], suggestions: [] };
      },
      severity: 'error',
    });

    // Jira-specific field validation
    this.validationRules.push({
      name: 'jira_status_workflow',
      description: 'Validate status transitions follow Jira workflow',
      fieldPattern: /^status$/i,
      validator: (value, field) => {
        // This would need actual Jira workflow data
        // For now, just validate common status names
        const validStatuses = [
          'backlog',
          'to do',
          'todo',
          'selected for development',
          'in progress',
          'in review',
          'in testing',
          'ready for deployment',
          'done',
          'closed',
          'cancelled',
          'blocked',
        ];

        const normalizedValue = String(value).toLowerCase();
        const isValid = validStatuses.some(
          status =>
            normalizedValue.includes(status) || status.includes(normalizedValue)
        );

        if (!isValid) {
          return {
            isValid: false,
            errors: [
              {
                field,
                rule: 'jira_status_workflow',
                message: `Unrecognized status: '${value}'`,
                severity: 'medium',
                suggestedFix: 'Verify status exists in Jira workflow',
              },
            ],
            warnings: [],
            suggestions: validStatuses.map(status => ({
              field,
              suggestion: status,
              reason: 'Common Jira status',
              confidence: 0.5,
            })),
          };
        }

        return { isValid: true, errors: [], warnings: [], suggestions: [] };
      },
      severity: 'warning',
    });

    // Priority validation
    this.validationRules.push({
      name: 'priority_validation',
      description: 'Validate priority values',
      fieldPattern: /^priority$/i,
      validator: (value, field) => {
        const validPriorities = [
          'trivial',
          'minor',
          'low',
          'medium',
          'normal',
          'major',
          'high',
          'critical',
          'blocker',
          'highest',
        ];
        const normalizedValue = String(value).toLowerCase();

        if (!validPriorities.includes(normalizedValue)) {
          return {
            isValid: false,
            errors: [
              {
                field,
                rule: 'priority_validation',
                message: `Invalid priority: '${value}'`,
                severity: 'medium',
                suggestedFix: `Use one of: ${validPriorities.join(', ')}`,
              },
            ],
            warnings: [],
            suggestions: [],
          };
        }

        return { isValid: true, errors: [], warnings: [], suggestions: [] };
      },
      severity: 'warning',
    });
  }

  /**
   * Initialize field constraints
   */
  private initializeFieldConstraints(): void {
    // Jira field constraints
    this.fieldConstraints.set('summary', {
      required: true,
      type: 'string',
      minLength: 1,
      maxLength: 255,
    });

    this.fieldConstraints.set('description', {
      type: 'string',
      maxLength: 32767, // Jira's typical description limit
    });

    this.fieldConstraints.set('priority', {
      type: 'string',
      allowedValues: [
        'trivial',
        'minor',
        'low',
        'medium',
        'normal',
        'major',
        'high',
        'critical',
        'blocker',
        'highest',
      ],
    });

    this.fieldConstraints.set('status', {
      required: true,
      type: 'string',
    });

    this.fieldConstraints.set('assignee', {
      type: 'string',
    });

    this.fieldConstraints.set('labels', {
      type: 'array',
    });

    this.fieldConstraints.set('storypoints', {
      type: 'number',
    });
  }

  /**
   * Initialize business rules
   */
  private initializeBusinessRules(): void {
    this.businessRules.push({
      name: 'status_assignee_consistency',
      description: 'Issues in progress should have an assignee',
      validator: (value, allFields) => {
        const status = allFields.get('status');
        const assignee = allFields.get('assignee');

        if (status?.toLowerCase().includes('progress')) {
          return assignee && assignee !== 'Unassigned';
        }
        return true;
      },
      errorMessage: 'Issues in progress must have an assignee',
    });

    this.businessRules.push({
      name: 'done_status_validation',
      description: 'Done issues should not be in active sprints',
      validator: (value, allFields) => {
        const status = allFields.get('status');

        if (
          status &&
          (status.toLowerCase() === 'done' || status.toLowerCase() === 'closed')
        ) {
          // This would need actual sprint status checking
          return true; // Simplified
        }
        return true;
      },
      errorMessage: 'Completed issues should not be in active sprints',
    });
  }

  /**
   * Validate field constraints
   */
  private validateFieldConstraints(
    value: unknown,
    field: string,
    context: ValidationContext
  ): {
    errors: ValidationError[];
    warnings: ValidationWarning[];
    suggestions: ValidationSuggestion[];
  } {
    const constraint = context.fieldConstraints?.get(field);
    if (!constraint) {
      return { errors: [], warnings: [], suggestions: [] };
    }

    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    const suggestions: ValidationSuggestion[] = [];

    // Custom validator
    if (constraint.customValidator && !constraint.customValidator(value)) {
      errors.push({
        field,
        rule: 'custom_constraint',
        message: `Custom validation failed for field '${field}'`,
        severity: 'medium',
      });
    }

    return { errors, warnings, suggestions };
  }

  /**
   * Validate business rules
   */
  private validateBusinessRules(
    value: unknown,
    field: string,
    context: ValidationContext
  ): { errors: ValidationError[]; warnings: ValidationWarning[] } {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    const allFields = new Map<string, unknown>(context.relatedFields);
    allFields.set(field, value);

    for (const rule of context.businessRules || []) {
      try {
        if (!rule.validator(value, allFields)) {
          errors.push({
            field,
            rule: rule.name,
            message: rule.errorMessage,
            severity: 'medium',
          });
        }
      } catch (error) {
        warnings.push({
          field,
          rule: rule.name,
          message: `Business rule validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          impact: 'Rule could not be evaluated',
        });
      }
    }

    return { errors, warnings };
  }

  // Utility methods
  private isEmptyValue(value: unknown): boolean {
    return (
      value === null ||
      value === undefined ||
      (typeof value === 'string' && value.trim() === '') ||
      (Array.isArray(value) && value.length === 0)
    );
  }

  private isValueOfType(value: unknown, expectedType: string): boolean {
    switch (expectedType) {
      case 'string':
        return typeof value === 'string';
      case 'number':
        return typeof value === 'number' && !isNaN(value);
      case 'boolean':
        return typeof value === 'boolean';
      case 'array':
        return Array.isArray(value);
      case 'object':
        return (
          typeof value === 'object' && value !== null && !Array.isArray(value)
        );
      default:
        return true;
    }
  }

  private convertToType(value: unknown, targetType: string): unknown {
    try {
      switch (targetType) {
        case 'string':
          return String(value);
        case 'number': {
          const num = Number(value);
          return isNaN(num) ? 0 : num;
        }
        case 'boolean':
          return Boolean(value);
        case 'array':
          return Array.isArray(value) ? value : [value];
        case 'object':
          return typeof value === 'object' ? value : { value };
        default:
          return value;
      }
    } catch {
      return value;
    }
  }

  private getSeverityWeight(severity: string): number {
    const weights = { critical: 4, high: 3, medium: 2, low: 1 };
    return weights[severity as keyof typeof weights] || 0;
  }
}
