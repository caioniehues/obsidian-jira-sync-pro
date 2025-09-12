/**
 * Settings Types for JQL Auto-Sync Configuration
 * 
 * This file defines all TypeScript interfaces and types used for
 * settings configuration, validation, and UI state management.
 */

/**
 * Status mapping configuration for organizing tickets by status
 */
export interface StatusMapping {
  active: string[];    // Statuses for active folder
  archived: string[];  // Statuses for archive folder
  ignore?: string[];   // Statuses to skip syncing
}

/**
 * Core settings interface for JQL auto-sync functionality
 */
export interface JQLAutoSyncSettings {
  // Jira Connection Settings
  jiraUrl: string;
  jiraUsername: string;
  jiraApiToken: string;
  
  // JQL Query Configuration
  jqlQuery: string;
  
  // Auto-Sync Configuration
  autoSyncEnabled: boolean;
  syncInterval: number; // in minutes (1-60)
  
  // Performance Settings
  maxResults: number; // 1-1000
  batchSize: number; // 1-100
  
  // Storage Settings
  syncFolder: string;
  
  // Status-Based Organization Settings
  enableStatusOrganization?: boolean;
  activeTicketsFolder?: string;
  archivedTicketsFolder?: string;
  archiveByYear?: boolean;
  keepRecentArchive?: boolean;
  recentArchiveDays?: number;
  statusMapping?: StatusMapping;
  preserveProjectFolders?: boolean;
  
  // Advanced Settings
  enableResume?: boolean;
  organizeByProject?: boolean;
  skipExisting?: boolean;
  retryFailures?: boolean;
  maxRetryAttempts?: number;
}

/**
 * Validation result interface for settings validation
 */
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  timestamp?: number;
}

/**
 * Enhanced validation result for JQL queries
 */
export interface JQLValidationResult extends ValidationResult {
  syntaxValid: boolean;
  connectionValid: boolean;
  queryExecutable: boolean;
  estimatedResults?: number;
  executionTime?: number;
  metadata?: {
    fields: string[];
    projects: string[];
    complexity: 'low' | 'medium' | 'high';
  };
}

/**
 * Connection test result interface
 */
export interface ConnectionTestResult {
  success: boolean;
  responseTime: number;
  jiraVersion?: string;
  permissions?: string[];
  error?: {
    code: string;
    message: string;
    details?: any;
  };
}

/**
 * Settings validation configuration
 */
export interface ValidationConfig {
  // Validation levels
  strict: boolean;
  validateConnectivity: boolean;
  testQueries: boolean;
  
  // Timeout settings
  connectionTimeout: number; // milliseconds
  queryTimeout: number; // milliseconds
  
  // Retry settings
  maxRetries: number;
  retryDelay: number;
}

/**
 * UI state interface for settings tab
 */
export interface SettingsUIState {
  // Loading states
  isValidating: boolean;
  isTesting: boolean;
  isResetting: boolean;
  
  // Validation states
  jqlValidationState: 'idle' | 'validating' | 'valid' | 'invalid';
  connectionState: 'disconnected' | 'connecting' | 'connected' | 'error';
  
  // Error states
  hasErrors: boolean;
  hasWarnings: boolean;
  
  // UI element states
  expandedSections: string[];
  
  // Last validation timestamp
  lastValidated?: number;
}

/**
 * Settings change event interface
 */
export interface SettingsChangeEvent {
  field: keyof JQLAutoSyncSettings;
  oldValue: any;
  newValue: any;
  valid: boolean;
  timestamp: number;
  source: 'user' | 'system' | 'import' | 'reset';
}

/**
 * Settings export/import interface
 */
export interface SettingsExport {
  version: string;
  timestamp: number;
  settings: Omit<JQLAutoSyncSettings, 'jiraApiToken'>; // Exclude sensitive data
  metadata: {
    exportedBy: string;
    obsidianVersion: string;
    pluginVersion: string;
  };
}

/**
 * Settings validation rule interface
 */
export interface ValidationRule {
  field: keyof JQLAutoSyncSettings;
  type: 'required' | 'format' | 'range' | 'custom';
  validator: (value: any) => boolean | Promise<boolean>;
  message: string;
  severity: 'error' | 'warning';
  dependencies?: (keyof JQLAutoSyncSettings)[];
}

/**
 * Settings field metadata for UI generation
 */
export interface FieldMetadata {
  key: keyof JQLAutoSyncSettings;
  label: string;
  description: string;
  type: 'text' | 'password' | 'number' | 'boolean' | 'textarea' | 'select' | 'slider';
  placeholder?: string;
  required: boolean;
  
  // Validation constraints
  minValue?: number;
  maxValue?: number;
  pattern?: RegExp;
  options?: Array<{ value: any; label: string }>;
  
  // UI hints
  section: 'connection' | 'sync' | 'advanced' | 'actions';
  order: number;
  helpUrl?: string;
  testable?: boolean; // Can this field be tested/validated?
  sensitive?: boolean; // Should this field be masked?
}

/**
 * Default status mapping for ticket organization
 */
export const DEFAULT_STATUS_MAPPING: StatusMapping = {
  active: [
    'Open',
    'In Progress',
    'In Review',
    'Ready for Testing',
    'Blocked',
    'Waiting',
    'To Do',
    'Reopened'
  ],
  archived: [
    'Done',
    'Closed',
    'Resolved',
    'Completed',
    'Cancelled',
    'Rejected',
    'Won\'t Do'
  ],
  ignore: [
    'Deleted'
  ]
};

/**
 * Default values for all settings
 */
export const DEFAULT_JQL_SETTINGS: JQLAutoSyncSettings = {
  jiraUrl: '',
  jiraUsername: '',
  jiraApiToken: '',
  jqlQuery: 'assignee = currentUser() AND status NOT IN (Done, Closed)',
  autoSyncEnabled: false,
  syncInterval: 5,
  maxResults: 1000,
  batchSize: 50,
  syncFolder: 'Knowledge/Work',
  enableStatusOrganization: true,
  activeTicketsFolder: 'Active Tickets',
  archivedTicketsFolder: 'Archived Tickets',
  archiveByYear: true,
  keepRecentArchive: true,
  recentArchiveDays: 30,
  statusMapping: DEFAULT_STATUS_MAPPING,
  preserveProjectFolders: true,
  enableResume: true,
  organizeByProject: true,
  skipExisting: false,
  retryFailures: true,
  maxRetryAttempts: 3
};

/**
 * Default validation configuration
 */
export const DEFAULT_VALIDATION_CONFIG: ValidationConfig = {
  strict: false,
  validateConnectivity: true,
  testQueries: true,
  connectionTimeout: 10000, // 10 seconds
  queryTimeout: 30000, // 30 seconds
  maxRetries: 3,
  retryDelay: 1000 // 1 second
};

/**
 * Field metadata definitions for UI generation
 */
export const FIELD_METADATA: FieldMetadata[] = [
  // Connection Settings
  {
    key: 'jiraUrl',
    label: 'Jira URL',
    description: 'Your Jira instance URL (e.g., https://your-domain.atlassian.net)',
    type: 'text',
    placeholder: 'https://your-domain.atlassian.net',
    required: true,
    section: 'connection',
    order: 1,
    pattern: /^https?:\/\/.+/,
    testable: true
  },
  {
    key: 'jiraUsername',
    label: 'Username',
    description: 'Your Jira username (email address)',
    type: 'text',
    placeholder: 'your-email@example.com',
    required: false,
    section: 'connection',
    order: 2,
    pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    testable: true
  },
  {
    key: 'jiraApiToken',
    label: 'API Token',
    description: 'Your Jira API token (generate from Atlassian account settings)',
    type: 'password',
    placeholder: 'Enter your API token',
    required: true,
    section: 'connection',
    order: 3,
    sensitive: true,
    testable: true,
    helpUrl: 'https://id.atlassian.com/manage-profile/security/api-tokens'
  },
  
  // Sync Configuration
  {
    key: 'jqlQuery',
    label: 'JQL Query',
    description: 'JQL query to select tickets for synchronization',
    type: 'textarea',
    placeholder: 'assignee = currentUser() AND status NOT IN (Done, Closed)',
    required: true,
    section: 'sync',
    order: 4,
    testable: true,
    helpUrl: 'https://www.atlassian.com/software/jira/guides/expand-jira/jql'
  },
  {
    key: 'autoSyncEnabled',
    label: 'Auto-Sync',
    description: 'Automatically sync tickets at regular intervals',
    type: 'boolean',
    required: false,
    section: 'sync',
    order: 5
  },
  {
    key: 'syncInterval',
    label: 'Sync Interval',
    description: 'How frequently to sync tickets (in minutes)',
    type: 'slider',
    required: true,
    minValue: 1,
    maxValue: 60,
    section: 'sync',
    order: 6
  },
  
  // Advanced Settings
  {
    key: 'maxResults',
    label: 'Max Results',
    description: 'Maximum number of tickets to sync (1-1000)',
    type: 'number',
    placeholder: '1000',
    required: true,
    minValue: 1,
    maxValue: 1000,
    section: 'advanced',
    order: 7
  },
  {
    key: 'batchSize',
    label: 'Batch Size',
    description: 'Number of tickets to process in each batch (1-100)',
    type: 'number',
    placeholder: '50',
    required: true,
    minValue: 1,
    maxValue: 100,
    section: 'advanced',
    order: 8
  },
  {
    key: 'syncFolder',
    label: 'Sync Folder',
    description: 'Vault folder where Jira tickets will be stored',
    type: 'text',
    placeholder: 'Jira Issues',
    required: true,
    section: 'advanced',
    order: 9
  }
];

/**
 * Built-in validation rules
 */
export const VALIDATION_RULES: ValidationRule[] = [
  {
    field: 'jiraUrl',
    type: 'required',
    validator: (value: string) => !!value?.trim(),
    message: 'Jira URL is required',
    severity: 'error'
  },
  {
    field: 'jiraUrl',
    type: 'format',
    validator: (value: string) => {
      if (!value) return true; // Required rule handles empty
      try {
        const url = new URL(value);
        return url.protocol === 'http:' || url.protocol === 'https:';
      } catch {
        return false;
      }
    },
    message: 'Invalid URL format',
    severity: 'error'
  },
  {
    field: 'jiraApiToken',
    type: 'required',
    validator: (value: string) => !!value?.trim(),
    message: 'API token is required',
    severity: 'error'
  },
  {
    field: 'jqlQuery',
    type: 'required',
    validator: (value: string) => !!value?.trim(),
    message: 'JQL query is required',
    severity: 'error'
  },
  {
    field: 'jiraUsername',
    type: 'format',
    validator: (value: string) => {
      if (!value) return true; // Optional field
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
    },
    message: 'Username should be a valid email address',
    severity: 'warning'
  },
  {
    field: 'syncInterval',
    type: 'range',
    validator: (value: number) => value >= 1 && value <= 60,
    message: 'Sync interval must be between 1 and 60 minutes',
    severity: 'error'
  },
  {
    field: 'maxResults',
    type: 'range',
    validator: (value: number) => value >= 1 && value <= 1000,
    message: 'Max results must be between 1 and 1000',
    severity: 'error'
  },
  {
    field: 'batchSize',
    type: 'range',
    validator: (value: number) => value >= 1 && value <= 100,
    message: 'Batch size must be between 1 and 100',
    severity: 'error'
  },
  {
    field: 'syncFolder',
    type: 'format',
    validator: (value: string) => {
      if (!value?.trim()) return false;
      if (value.startsWith('/') || value.startsWith('..')) return false;
      if (value.includes('\\') || value.includes(':')) return false;
      return true;
    },
    message: 'Invalid folder path',
    severity: 'error'
  }
];

/**
 * Settings events enumeration
 */
export enum SettingsEventType {
  FIELD_CHANGED = 'field_changed',
  VALIDATION_COMPLETED = 'validation_completed',
  CONNECTION_TESTED = 'connection_tested',
  QUERY_TESTED = 'query_tested',
  SETTINGS_RESET = 'settings_reset',
  SETTINGS_IMPORTED = 'settings_imported',
  SETTINGS_EXPORTED = 'settings_exported'
}

/**
 * Type guard functions for type safety
 */
export function isValidJQLSettings(obj: any): obj is JQLAutoSyncSettings {
  return (
    obj &&
    typeof obj.jiraUrl === 'string' &&
    typeof obj.jiraUsername === 'string' &&
    typeof obj.jiraApiToken === 'string' &&
    typeof obj.jqlQuery === 'string' &&
    typeof obj.autoSyncEnabled === 'boolean' &&
    typeof obj.syncInterval === 'number' &&
    typeof obj.maxResults === 'number' &&
    typeof obj.batchSize === 'number' &&
    typeof obj.syncFolder === 'string'
  );
}

export function isValidationResult(obj: any): obj is ValidationResult {
  return (
    obj &&
    typeof obj.isValid === 'boolean' &&
    Array.isArray(obj.errors) &&
    Array.isArray(obj.warnings) &&
    obj.errors.every((e: any) => typeof e === 'string') &&
    obj.warnings.every((w: any) => typeof w === 'string')
  );
}

/**
 * Settings transformation utilities
 */
export class SettingsTransform {
  /**
   * Sanitizes settings for storage (removes sensitive data if needed)
   */
  static sanitizeForStorage(settings: JQLAutoSyncSettings): JQLAutoSyncSettings {
    return { ...settings };
  }

  /**
   * Sanitizes settings for export (removes sensitive data)
   */
  static sanitizeForExport(settings: JQLAutoSyncSettings): Omit<JQLAutoSyncSettings, 'jiraApiToken'> {
    const { jiraApiToken, ...exportSettings } = settings;
    return exportSettings;
  }

  /**
   * Validates and migrates settings from older versions
   */
  static migrate(settings: any, fromVersion: string): JQLAutoSyncSettings {
    // Start with defaults
    let migratedSettings = { ...DEFAULT_JQL_SETTINGS };
    
    if (!settings) return migratedSettings;
    
    // Copy over valid fields
    Object.keys(DEFAULT_JQL_SETTINGS).forEach(key => {
      if (key in settings) {
        migratedSettings[key as keyof JQLAutoSyncSettings] = settings[key];
      }
    });
    
    return migratedSettings;
  }

  /**
   * Creates a deep copy of settings
   */
  static clone(settings: JQLAutoSyncSettings): JQLAutoSyncSettings {
    return JSON.parse(JSON.stringify(settings));
  }
}