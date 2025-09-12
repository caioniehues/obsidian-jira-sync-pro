/**
 * Settings Manager Unit Tests
 * Comprehensive tests for settings validation, migration, import/export functionality
 */

import { SettingsManager } from '../../../src/settings/settings-manager';
import { 
  PluginSettings, 
  DEFAULT_SETTINGS, 
  ConflictResolutionStrategy,
  FieldMapping,
  SettingsExportData
} from '../../../src/settings/settings';
import { BasePropertyType } from '../../../src/types/base-types';
import { JiraFieldType } from '../../../src/types/jira-types';
import type { Mock, Mocked, MockedFunction } from 'vitest';
// Mock Obsidian Plugin
class MockPlugin {
  private data: any = null;
  async loadData(): Promise<any> {
    return this.data;
  }
  async saveData(data: any): Promise<void> {
    this.data = data;
  setMockData(data: any): void {
}
describe('SettingsManager', () => {
  let mockPlugin: MockPlugin;
  let settingsManager: SettingsManager;
  beforeEach(() => {
    mockPlugin = new MockPlugin();
    settingsManager = new SettingsManager(mockPlugin as any);
  });
  describe('loadSettings', () => {
    it('should load default settings when no saved data exists', async () => {
      await settingsManager.loadSettings();
      
      const settings = settingsManager.getSettings();
      expect(settings.version).toBe(DEFAULT_SETTINGS.version);
      expect(settings.jira.jqlQuery).toBe(DEFAULT_SETTINGS.jira.jqlQuery);
      expect(settings.sync.syncInterval).toBe(DEFAULT_SETTINGS.sync.syncInterval);
    });
    it('should load existing settings when data exists', async () => {
      const existingData = {
        ...DEFAULT_SETTINGS,
        jira: {
          ...DEFAULT_SETTINGS.jira,
          jiraUrl: 'https://test.atlassian.net',
          jiraUsername: 'test@example.com'
        },
        sync: {
          ...DEFAULT_SETTINGS.sync,
          syncInterval: 10
        }
      };
      mockPlugin.setMockData(existingData);
      expect(settings.jira.jiraUrl).toBe('https://test.atlassian.net');
      expect(settings.jira.jiraUsername).toBe('test@example.com');
      expect(settings.sync.syncInterval).toBe(10);
    it('should migrate legacy settings to new format', async () => {
      const legacyData = {
        jiraUrl: 'https://legacy.atlassian.net',
        jiraUsername: 'legacy@example.com',
        jiraApiToken: 'legacy-token',
        jqlQuery: 'project = LEGACY',
        syncInterval: 15,
        autoSyncEnabled: false,
        maxResults: 500,
        batchSize: 25,
        syncFolder: 'Legacy/Jira'
      mockPlugin.setMockData(legacyData);
      expect(settings.version).toBe('1.0.0');
      expect(settings.jira.jiraUrl).toBe('https://legacy.atlassian.net');
      expect(settings.jira.jiraUsername).toBe('legacy@example.com');
      expect(settings.jira.jiraApiToken).toBe('legacy-token');
      expect(settings.sync.syncInterval).toBe(15);
      expect(settings.sync.autoSyncEnabled).toBe(false);
    it('should handle corrupted data gracefully', async () => {
      mockPlugin.setMockData('invalid json data');
    it('should apply fixes for critical validation errors', async () => {
      const invalidData = {
          syncInterval: -1, // Invalid range
          maxResults: 0      // Invalid range
        performance: {
          ...DEFAULT_SETTINGS.performance,
          cacheSize: 2000    // Exceeds maximum
      mockPlugin.setMockData(invalidData);
      expect(settings.sync.maxResults).toBe(DEFAULT_SETTINGS.sync.maxResults);
      expect(settings.performance.cacheSize).toBe(DEFAULT_SETTINGS.performance.cacheSize);
  describe('saveSettings', () => {
    it('should save settings with updated timestamp', async () => {
      const beforeTime = Date.now();
      // Wait a small amount to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 10));
      await settingsManager.saveSettings();
      expect(new Date(settings.updatedAt).getTime()).toBeGreaterThan(beforeTime);
    it('should handle save errors gracefully', async () => {
      // Mock saveData to throw an error after loading
      const originalSaveData = mockPlugin.saveData;
      mockPlugin.saveData = vi.fn().mockRejectedValue(new Error('Save failed'));
      await expect(settingsManager.saveSettings()).rejects.toThrow('Save failed');
      // Restore original method
      mockPlugin.saveData = originalSaveData;
  describe('updateSettings', () => {
    beforeEach(async () => {
    it('should update valid settings successfully', async () => {
      const updates = {
          syncInterval: 20,
          autoSyncEnabled: false
      const result = await settingsManager.updateSettings(updates);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(settings.sync.syncInterval).toBe(20);
    it('should reject invalid settings updates', async () => {
      const invalidUpdates = {
          syncInterval: -5, // Invalid range
          maxResults: 50000 // Exceeds maximum
          jiraUrl: 'not-a-url' // Invalid URL format
      const result = await settingsManager.updateSettings(invalidUpdates);
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      const errorCodes = result.errors.map(e => e.code);
      expect(errorCodes).toContain('INVALID_RANGE');
      expect(errorCodes).toContain('INVALID_URL');
      // Settings should not be updated
    it('should allow settings with warnings only', async () => {
      const updatesWithWarnings = {
          bidirectionalSyncEnabled: true
        conflictResolution: {
          strategy: ConflictResolutionStrategy.MANUAL,
          notifyOnConflict: false // This should generate a warning
      const result = await settingsManager.updateSettings(updatesWithWarnings);
      expect(result.isValid).toBe(true); // Should be valid despite warnings
      // Cross-field validation warnings might be in errors array with severity 'warning'
      const hasWarnings = result.warnings.length > 0 || 
                         result.errors.some(e => e.severity === 'warning');
      expect(hasWarnings).toBe(true);
      expect(settings.sync.bidirectionalSyncEnabled).toBe(true);
    it('should perform deep merge of nested objects', async () => {
          connectionTimeout: 45000 // Only update this field
      await settingsManager.updateSettings(updates);
      // Should update the specific field
      expect(settings.jira.connectionTimeout).toBe(45000);
      // Should preserve other jira settings
      expect(settings.jira.retryAttempts).toBe(DEFAULT_SETTINGS.jira.retryAttempts);
  describe('validateSettings', () => {
    it('should validate complete valid settings', () => {
      const result = settingsManager.validateSettings(DEFAULT_SETTINGS);
    it('should detect missing required fields', () => {
      const invalidSettings: PluginSettings = {
          jiraUrl: '',     // Required field missing
          jiraUsername: '', // Required field missing
          jiraApiToken: ''  // Required field missing
      const result = settingsManager.validateSettings(invalidSettings);
      expect(result.errors.length).toBeGreaterThanOrEqual(3);
      const errorFields = result.errors.map(e => e.field);
      expect(errorFields).toContain('jira.jiraUrl');
      expect(errorFields).toContain('jira.jiraUsername');
      expect(errorFields).toContain('jira.jiraApiToken');
    it('should validate field ranges', () => {
          syncInterval: 0,     // Below minimum
          maxResults: 20000,   // Above maximum
          batchSize: 2000      // Above maximum
          cacheSize: 2000,     // Above maximum
          maxConcurrentRequests: 25 // Above maximum
      expect(result.errors.length).toBeGreaterThanOrEqual(5);
      const rangeCodes = result.errors.filter(e => e.code === 'INVALID_RANGE');
      expect(rangeCodes.length).toBeGreaterThanOrEqual(5);
    it('should validate URL format', () => {
          jiraUrl: 'not-a-valid-url'
      const urlError = result.errors.find(e => e.code === 'INVALID_URL');
      expect(urlError).toBeDefined();
      expect(urlError?.field).toBe('jira.jiraUrl');
    it('should validate field mappings for duplicates', () => {
      const duplicateMapping: FieldMapping = {
        jiraField: 'summary', // Duplicate of existing mapping
        jiraFieldType: JiraFieldType.STRING,
        baseProperty: 'title2',
        basePropertyType: BasePropertyType.TEXT,
        bidirectional: false,
        transformationRules: [],
        validationRules: []
        fieldMappings: [...DEFAULT_SETTINGS.fieldMappings, duplicateMapping]
      const duplicateError = result.errors.find(e => e.code === 'DUPLICATE_FIELD');
      expect(duplicateError).toBeDefined();
    it('should perform cross-field validation', () => {
      const settingsWithCrossFieldIssues: PluginSettings = {
          syncInterval: 2, // Very frequent sync
          maxConcurrentRequests: 10 // High concurrent requests
          ...DEFAULT_SETTINGS.conflictResolution,
          notifyOnConflict: false // Should warn about this combination
      const result = settingsManager.validateSettings(settingsWithCrossFieldIssues);
      // Check for cross-field validation warnings/errors
      const hasCrossValidationIssues = result.warnings.length > 0 ||
        result.errors.some(e => e.code === 'CROSS_FIELD_VALIDATION' || e.code === 'PERFORMANCE_WARNING');
      expect(hasCrossValidationIssues).toBeTruthy();
  describe('exportSettings', () => {
      // Set up test settings with credentials
      const testSettings = {
          jiraUsername: 'test@example.com',
          jiraApiToken: 'secret-token'
      await settingsManager.updateSettings(testSettings);
    it('should export settings without credentials by default', () => {
      const exportData = settingsManager.exportSettings(false);
      expect(exportData.settings.jira.jiraUsername).toBe('');
      expect(exportData.settings.jira.jiraApiToken).toBe('');
      expect(exportData.includeCredentials).toBe(false);
      expect(exportData.exportedAt).toBeDefined();
      expect(exportData.exportVersion).toBeDefined();
    it('should export settings with credentials when requested', () => {
      const exportData = settingsManager.exportSettings(true);
      expect(exportData.settings.jira.jiraUsername).toBe('test@example.com');
      expect(exportData.settings.jira.jiraApiToken).toBe('secret-token');
      expect(exportData.includeCredentials).toBe(true);
    it('should preserve non-credential settings in both export modes', () => {
      const exportWithoutCreds = settingsManager.exportSettings(false);
      const exportWithCreds = settingsManager.exportSettings(true);
      expect(exportWithoutCreds.settings.sync.syncInterval).toBe(exportWithCreds.settings.sync.syncInterval);
      expect(exportWithoutCreds.settings.fieldMappings).toEqual(exportWithCreds.settings.fieldMappings);
  describe('importSettings', () => {
    it('should import valid settings successfully', async () => {
      const validExportData: SettingsExportData = {
        settings: {
          ...DEFAULT_SETTINGS,
          sync: {
            ...DEFAULT_SETTINGS.sync,
            syncInterval: 30,
            autoSyncEnabled: false
          }
        exportedAt: new Date().toISOString(),
        exportVersion: '1.0.0',
        includeCredentials: false
      const result = await settingsManager.importSettings(validExportData);
      expect(settings.sync.syncInterval).toBe(30);
    it('should preserve existing credentials when importing without credentials', async () => {
      // Set initial credentials
      await settingsManager.updateSettings({
          jiraUsername: 'existing@example.com',
          jiraApiToken: 'existing-token'
      });
      const importData: SettingsExportData = {
          sync: { ...DEFAULT_SETTINGS.sync, syncInterval: 25 }
      await settingsManager.importSettings(importData);
      expect(settings.jira.jiraUsername).toBe('existing@example.com');
      expect(settings.jira.jiraApiToken).toBe('existing-token');
      expect(settings.sync.syncInterval).toBe(25);
    it('should import credentials when included in export', async () => {
          jira: {
            ...DEFAULT_SETTINGS.jira,
            jiraUsername: 'imported@example.com',
            jiraApiToken: 'imported-token'
        includeCredentials: true
      expect(settings.jira.jiraUsername).toBe('imported@example.com');
      expect(settings.jira.jiraApiToken).toBe('imported-token');
    it('should reject invalid settings import', async () => {
      const invalidExportData: SettingsExportData = {
            syncInterval: -10 // Invalid value
      const result = await settingsManager.importSettings(invalidExportData);
      // Settings should not have changed
    it('should handle malformed import data gracefully', async () => {
      const malformedData = { invalid: 'data' } as any;
      const result = await settingsManager.importSettings(malformedData);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('IMPORT_ERROR');
  describe('resetToDefaults', () => {
    it('should reset all settings to defaults', async () => {
      // First modify some settings
          syncInterval: 45,
          jqlQuery: 'project = CUSTOM'
      // Verify settings were changed
      let settings = settingsManager.getSettings();
      expect(settings.sync.syncInterval).toBe(45);
      expect(settings.jira.jqlQuery).toBe('project = CUSTOM');
      // Reset to defaults
      await settingsManager.resetToDefaults();
      settings = settingsManager.getSettings();
  describe('field mapping management', () => {
    it('should get existing field mapping', () => {
      const mapping = settingsManager.getFieldMapping('summary');
      expect(mapping).toBeDefined();
      expect(mapping?.jiraField).toBe('summary');
      expect(mapping?.baseProperty).toBe('title');
    it('should return undefined for non-existent field mapping', () => {
      const mapping = settingsManager.getFieldMapping('non-existent-field');
      expect(mapping).toBeUndefined();
    it('should update existing field mapping', async () => {
      const updatedMapping: FieldMapping = {
        jiraField: 'summary',
        baseProperty: 'new-title',
      await settingsManager.updateFieldMapping(updatedMapping);
      expect(mapping?.baseProperty).toBe('new-title');
    it('should add new field mapping', async () => {
      const newMapping: FieldMapping = {
        jiraField: 'custom-field',
        baseProperty: 'custom-property',
        bidirectional: true,
      await settingsManager.updateFieldMapping(newMapping);
      const mapping = settingsManager.getFieldMapping('custom-field');
      expect(mapping?.baseProperty).toBe('custom-property');
      expect(mapping?.bidirectional).toBe(true);
    it('should remove field mapping', async () => {
      await settingsManager.removeFieldMapping('summary');
      const summaryMapping = settings.fieldMappings.find(m => m.jiraField === 'summary');
      expect(summaryMapping).toBeUndefined();
  describe('error handling and edge cases', () => {
    it('should handle undefined input gracefully', async () => {
      const result = await settingsManager.updateSettings(undefined as any);
      expect(result.isValid).toBe(true); // Should handle undefined as no-op
    it('should handle null field values appropriately', async () => {
      const settingsWithNulls = {
          jiraUrl: null,
          jiraUsername: null
      const result = await settingsManager.updateSettings(settingsWithNulls as any);
      expect(result.errors.some(e => e.code === 'REQUIRED_FIELD')).toBe(true);
    it('should handle array field validation', () => {
      const settingsWithEmptyMappings: PluginSettings = {
        fieldMappings: [
          {
            jiraField: '',  // Invalid empty field
            jiraFieldType: JiraFieldType.STRING,
            baseProperty: '',  // Invalid empty property
            basePropertyType: BasePropertyType.TEXT,
            bidirectional: false,
            transformationRules: [],
            validationRules: []
        ]
      const result = settingsManager.validateSettings(settingsWithEmptyMappings);
      expect(result.errors.some(e => e.field.includes('fieldMappings[0].jiraField'))).toBe(true);
      expect(result.errors.some(e => e.field.includes('fieldMappings[0].baseProperty'))).toBe(true);
    it('should maintain settings integrity after failed updates', async () => {
      const originalSettings = settingsManager.getSettings();
      const invalidUpdate = {
          syncInterval: -999 // Invalid value
      await settingsManager.updateSettings(invalidUpdate);
      const currentSettings = settingsManager.getSettings();
      expect(currentSettings.sync.syncInterval).toBe(originalSettings.sync.syncInterval);
});
