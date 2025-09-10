/**
 * Settings Module Index
 * 
 * Exports all settings-related components, types, and utilities
 * for easy importing throughout the application.
 */

// Main settings component
export { JQLAutoSyncSettingsTab } from './jql-auto-sync-settings';

// Settings types and interfaces
export type {
  JQLAutoSyncSettings,
  ValidationResult,
  JQLValidationResult,
  ConnectionTestResult,
  ValidationConfig,
  SettingsUIState,
  SettingsChangeEvent,
  SettingsExport,
  ValidationRule,
  FieldMetadata
} from './settings-types';

// Settings constants and defaults
export {
  DEFAULT_JQL_SETTINGS,
  DEFAULT_VALIDATION_CONFIG,
  FIELD_METADATA,
  VALIDATION_RULES,
  SettingsEventType,
  SettingsTransform
} from './settings-types';

// Type guards
export {
  isValidJQLSettings,
  isValidationResult
} from './settings-types';

// Settings validator
export { SettingsValidator } from './settings-validator';

// Re-export commonly used types for convenience
export type {
  UserAction,
  ErrorCode,
  SyncPhase,
  SyncError
} from '../types/sync-types';