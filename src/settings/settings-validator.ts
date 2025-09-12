/**
 * Settings Validation Utility
 * 
 * Provides comprehensive validation functionality for JQL auto-sync settings
 * including syntax validation, connectivity testing, and field validation.
 */

import { 
  JQLAutoSyncSettings, 
  ValidationResult, 
  JQLValidationResult,
  ConnectionTestResult,
  ValidationRule,
  VALIDATION_RULES 
} from './settings-types';
import { JQLQueryEngine } from '../enhanced-sync/jql-query-engine';

/**
 * Comprehensive settings validator class
 */
export class SettingsValidator {
  private queryEngine?: JQLQueryEngine;
  private readonly customRules: ValidationRule[] = [];

  constructor(queryEngine?: JQLQueryEngine) {
    this.queryEngine = queryEngine;
  }

  /**
   * Sets the query engine for connectivity validation
   */
  setQueryEngine(queryEngine: JQLQueryEngine): void {
    this.queryEngine = queryEngine;
  }

  /**
   * Adds custom validation rules
   */
  addCustomRule(rule: ValidationRule): void {
    this.customRules.push(rule);
  }

  /**
   * Validates complete settings object
   */
  async validateSettings(settings: JQLAutoSyncSettings, includeConnectivity = false): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    // Get all validation rules (built-in + custom)
    const allRules = [...VALIDATION_RULES, ...this.customRules];
    
    // Run all validation rules
    for (const rule of allRules) {
      try {
        const value = settings[rule.field];
        const isValid = await rule.validator(value);
        
        if (!isValid) {
          if (rule.severity === 'error') {
            errors.push(rule.message);
          } else {
            warnings.push(rule.message);
          }
        }
      } catch (error: any) {
        errors.push(`Validation error for ${rule.field}: ${error.message}`);
      }
    }

    // Run connectivity tests if requested and no critical errors
    if (includeConnectivity && errors.length === 0 && this.queryEngine) {
      try {
        const connectionResult = await this.testConnection(settings);
        if (!connectionResult.success) {
          if (connectionResult.error) {
            errors.push(`Connection test failed: ${connectionResult.error.message}`);
          } else {
            errors.push('Connection test failed');
          }
        }
      } catch (error: any) {
        warnings.push(`Could not test connectivity: ${error.message}`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      timestamp: Date.now()
    };
  }

  /**
   * Validates a single field value
   */
  async validateField(
    field: keyof JQLAutoSyncSettings, 
    value: any, 
    settings?: JQLAutoSyncSettings
  ): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    // Get rules for this field
    const fieldRules = [...VALIDATION_RULES, ...this.customRules]
      .filter(rule => rule.field === field);
    
    // Run validation rules for this field
    for (const rule of fieldRules) {
      try {
        const isValid = await rule.validator(value);
        
        if (!isValid) {
          if (rule.severity === 'error') {
            errors.push(rule.message);
          } else {
            warnings.push(rule.message);
          }
        }
      } catch (error: any) {
        errors.push(`Validation error: ${error.message}`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      timestamp: Date.now()
    };
  }

  /**
   * Validates JQL query syntax and executability
   */
  async validateJQLQuery(query: string): Promise<JQLValidationResult> {
    const result: JQLValidationResult = {
      isValid: false,
      syntaxValid: false,
      connectionValid: false,
      queryExecutable: false,
      errors: [],
      warnings: [],
      timestamp: Date.now()
    };

    // Check if query is provided
    if (!query?.trim()) {
      result.errors.push('JQL query cannot be empty');
      return result;
    }

    // Basic syntax validation
    result.syntaxValid = this.validateJQLSyntax(query);
    if (!result.syntaxValid) {
      result.errors.push('Invalid JQL syntax');
    }

    // Advanced validation with query engine
    if (this.queryEngine && result.syntaxValid) {
      const startTime = Date.now();
      
      try {
        // Test query executability
        const isExecutable = await this.queryEngine.validateQuery(query);
        result.connectionValid = true;
        result.queryExecutable = isExecutable;
        result.executionTime = Date.now() - startTime;
        
        if (!isExecutable) {
          result.errors.push('JQL query cannot be executed');
        } else {
          // Try to get query metadata if successful
          try {
            const metadata = await this.getQueryMetadata(query);
            result.metadata = metadata;
            
            // Add warnings for complex queries
            if (metadata.complexity === 'high') {
              result.warnings.push('Complex query may impact performance');
            }
          } catch (metadataError: any) {
            result.warnings.push(`Could not analyze query complexity: ${metadataError.message}`);
          }
        }
      } catch (error: any) {
        result.errors.push(`Query validation failed: ${error.message}`);
        result.executionTime = Date.now() - startTime;
      }
    }

    // Set overall validity
    result.isValid = result.syntaxValid && 
                     (result.queryExecutable || !this.queryEngine);

    return result;
  }

  /**
   * Tests connection to Jira with current settings
   */
  async testConnection(settings: JQLAutoSyncSettings): Promise<ConnectionTestResult> {
    if (!this.queryEngine) {
      return {
        success: false,
        responseTime: 0,
        error: {
          code: 'NO_ENGINE',
          message: 'Query engine not available'
        }
      };
    }

    const startTime = Date.now();
    
    try {
      // Test basic connectivity with a simple query
      const testQuery = 'key = "DUMMY-1" OR key = "TEST-1"'; // Should return quickly
      await this.queryEngine.validateQuery(testQuery);
      
      return {
        success: true,
        responseTime: Date.now() - startTime,
        // Could add more info like Jira version, permissions, etc.
      };
    } catch (error: any) {
      return {
        success: false,
        responseTime: Date.now() - startTime,
        error: {
          code: this.mapErrorToCode(error),
          message: error.message || 'Connection failed',
          details: error
        }
      };
    }
  }

  /**
   * Validates JQL syntax using basic pattern matching
   */
  private validateJQLSyntax(query: string): boolean {
    if (!query?.trim()) return false;
    
    // Remove comments and normalize whitespace
    const normalizedQuery = query
      .replace(/\/\*[\s\S]*?\*\//g, '') // Remove /* */ comments
      .replace(/--.*$/gm, '') // Remove -- comments
      .replace(/\s+/g, ' ')
      .trim();
    
    if (!normalizedQuery) return false;
    
    // Basic JQL patterns
    const patterns = [
      // Field comparisons
      /\w+\s*(=|!=|>|<|>=|<=|~|!~|in|not\s+in|is|is\s+not|was|was\s+not|changed|not\s+changed)\s*.+/i,
      
      // Functions
      /\w+\s*\([^)]*\)/i,
      
      // Order by clause
      /order\s+by\s+\w+(\s+(asc|desc))?/i,
      
      // Logical operators
      /\w+.*\s+(and|or)\s+.*/i,
      
      // Text search
      /text\s*~\s*['"]/i,
      
      // Date functions
      /(now|startOfDay|startOfWeek|startOfMonth|startOfYear|endOfDay|endOfWeek|endOfMonth|endOfYear)\s*\(/i
    ];
    
    // Check if query matches any valid pattern
    const hasValidPattern = patterns.some(pattern => pattern.test(normalizedQuery));
    
    // Additional checks for common syntax errors
    if (hasValidPattern) {
      // Check for balanced quotes
      const singleQuotes = (normalizedQuery.match(/'/g) || []).length;
      const doubleQuotes = (normalizedQuery.match(/"/g) || []).length;
      
      if (singleQuotes % 2 !== 0 || doubleQuotes % 2 !== 0) {
        return false; // Unbalanced quotes
      }
      
      // Check for balanced parentheses
      let parenCount = 0;
      for (const char of normalizedQuery) {
        if (char === '(') parenCount++;
        if (char === ')') parenCount--;
        if (parenCount < 0) return false; // Closing before opening
      }
      
      if (parenCount !== 0) return false; // Unbalanced parentheses
    }
    
    return hasValidPattern;
  }

  /**
   * Gets metadata about a JQL query (complexity, fields used, etc.)
   */
  private async getQueryMetadata(query: string): Promise<{
    fields: string[];
    projects: string[];
    complexity: 'low' | 'medium' | 'high';
  }> {
    // Extract fields mentioned in the query
    const fields = this.extractFieldsFromQuery(query);
    
    // Extract project references
    const projects = this.extractProjectsFromQuery(query);
    
    // Determine complexity based on various factors
    const complexity = this.calculateQueryComplexity(query, fields);
    
    return {
      fields,
      projects,
      complexity
    };
  }

  /**
   * Extracts field names from JQL query
   */
  private extractFieldsFromQuery(query: string): string[] {
    const fields = new Set<string>();
    
    // Common JQL field patterns
    const fieldPatterns = [
      /(\w+)\s*[=!<>~]/g, // field = value
      /(\w+)\s+is\s/gi, // field is null
      /(\w+)\s+was\s/gi, // field was value
      /(\w+)\s+changed/gi, // field changed
      /(\w+)\s+in\s*\(/gi, // field in (...)
      /order\s+by\s+(\w+)/gi // order by field
    ];
    
    fieldPatterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(query)) !== null) {
        fields.add(match[1].toLowerCase());
      }
    });
    
    return Array.from(fields);
  }

  /**
   * Extracts project references from JQL query
   */
  private extractProjectsFromQuery(query: string): string[] {
    const projects = new Set<string>();
    
    // Project reference patterns
    const projectPatterns = [
      /project\s*=\s*['"]?(\w+)['"]?/gi,
      /project\s+in\s*\(['"]?([^)]+)['"]?\)/gi
    ];
    
    projectPatterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(query)) !== null) {
        if (pattern.source.includes('in')) {
          // Handle project in (...) syntax
          const projectList = match[1].split(',').map(p => p.trim().replace(/['"]/g, ''));
          projectList.forEach(p => projects.add(p));
        } else {
          projects.add(match[1]);
        }
      }
    });
    
    return Array.from(projects);
  }

  /**
   * Calculates query complexity based on various factors
   */
  private calculateQueryComplexity(query: string, fields: string[]): 'low' | 'medium' | 'high' {
    let complexity = 0;
    
    // Factor in query length
    if (query.length > 200) complexity += 2;
    else if (query.length > 100) complexity += 1;
    
    // Factor in number of fields
    if (fields.length > 10) complexity += 2;
    else if (fields.length > 5) complexity += 1;
    
    // Factor in logical operators
    const andCount = (query.match(/\sand\s/gi) || []).length;
    const orCount = (query.match(/\sor\s/gi) || []).length;
    complexity += Math.min(andCount + orCount, 3);
    
    // Factor in functions and complex operations
    const functions = query.match(/\w+\([^)]*\)/g) || [];
    complexity += Math.min(functions.length, 3);
    
    // Factor in date operations
    if (/changed|was|startof|endof|now\(\)/i.test(query)) complexity += 1;
    
    // Factor in text search
    if (/text\s*~/i.test(query)) complexity += 1;
    
    // Factor in subqueries or nested conditions
    if (/\([^)]*\sand\s[^)]*\)/i.test(query)) complexity += 1;
    
    if (complexity >= 6) return 'high';
    if (complexity >= 3) return 'medium';
    return 'low';
  }

  /**
   * Maps error types to error codes for better handling
   */
  private mapErrorToCode(error: any): string {
    if (error.message?.includes('timeout')) return 'TIMEOUT';
    if (error.message?.includes('network')) return 'NETWORK_ERROR';
    if (error.message?.includes('authentication')) return 'AUTH_ERROR';
    if (error.message?.includes('permission')) return 'PERMISSION_ERROR';
    if (error.status === 401) return 'UNAUTHORIZED';
    if (error.status === 403) return 'FORBIDDEN';
    if (error.status === 404) return 'NOT_FOUND';
    if (error.status >= 500) return 'SERVER_ERROR';
    return 'UNKNOWN_ERROR';
  }

  /**
   * Provides suggestions for fixing validation errors
   */
  getSuggestions(validationResult: ValidationResult): string[] {
    const suggestions: string[] = [];
    
    validationResult.errors.forEach(error => {
      if (error.includes('URL')) {
        suggestions.push('Ensure URL starts with http:// or https://');
      }
      if (error.includes('email')) {
        suggestions.push('Use your Atlassian account email address');
      }
      if (error.includes('API token')) {
        suggestions.push('Generate a new API token from your Atlassian account settings');
      }
      if (error.includes('JQL')) {
        suggestions.push('Check JQL syntax documentation or test in Jira search');
      }
      if (error.includes('folder')) {
        suggestions.push('Use a relative path without special characters');
      }
    });
    
    return [...new Set(suggestions)]; // Remove duplicates
  }

  /**
   * Provides quick fixes for common validation issues
   */
  getQuickFixes(field: keyof JQLAutoSyncSettings, value: any): Array<{
    description: string;
    fixedValue: any;
  }> {
    const fixes: Array<{ description: string; fixedValue: any }> = [];
    
    switch (field) {
      case 'jiraUrl':
        if (typeof value === 'string' && value && !value.startsWith('http')) {
          fixes.push({
            description: 'Add https:// prefix',
            fixedValue: `https://${value}`
          });
        }
        break;
        
      case 'syncInterval':
        if (typeof value === 'number') {
          if (value < 1) {
            fixes.push({
              description: 'Set to minimum value (1 minute)',
              fixedValue: 1
            });
          }
          if (value > 60) {
            fixes.push({
              description: 'Set to maximum value (60 minutes)',
              fixedValue: 60
            });
          }
        }
        break;
        
      case 'maxResults':
        if (typeof value === 'number') {
          if (value < 1) {
            fixes.push({
              description: 'Set to minimum value (1)',
              fixedValue: 1
            });
          }
          if (value > 1000) {
            fixes.push({
              description: 'Set to maximum value (1000)',
              fixedValue: 1000
            });
          }
        }
        break;
        
      case 'syncFolder':
        if (typeof value === 'string' && value) {
          if (value.startsWith('/')) {
            fixes.push({
              description: 'Remove leading slash',
              fixedValue: value.substring(1)
            });
          }
          if (value.includes('\\')) {
            fixes.push({
              description: 'Replace backslashes with forward slashes',
              fixedValue: value.replace(/\\/g, '/')
            });
          }
        }
        break;
    }
    
    return fixes;
  }
}