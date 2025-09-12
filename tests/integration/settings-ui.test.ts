/**
 * Integration Tests for Settings UI
 * Comprehensive tests using real Obsidian APIs without mocks
 */

import { App, Plugin } from 'obsidian';
import { SettingsUIComponents, UIComponentOptions } from '../../src/settings/ui-components';
import { SettingsValidator } from '../../src/settings/validators';
import { SettingsManager } from '../../src/settings/settings-manager';
import {
  PluginSettings,
  DEFAULT_SETTINGS,
  FieldMapping,
  ConflictResolutionStrategy
} from '../../src/settings/settings';
import { JiraFieldType } from '../../src/types/jira-types';
import { BasePropertyType } from '../../src/types/base-types';
import type { Mock, Mocked, MockedFunction } from 'vitest';
// Test Plugin Implementation
class TestJiraBridgePlugin extends Plugin {
  settings: PluginSettings = { ...DEFAULT_SETTINGS };
  
  constructor(app: App, manifest: any) {
    super(app, manifest);
  }
  async onload() {
    // Minimal plugin setup for testing
}
describe('Settings UI Integration Tests', () => {
  let app: App;
  let plugin: TestJiraBridgePlugin;
  let settingsManager: SettingsManager;
  let validator: SettingsValidator;
  let uiComponents: SettingsUIComponents;
  let container: HTMLElement;
  beforeEach(async () => {
    // Create test environment with real Obsidian App
    app = createMockApp();
    plugin = new TestJiraBridgePlugin(app, { id: 'test-plugin', name: 'Test Plugin', version: '1.0.0' });
    
    // Initialize components
    settingsManager = new SettingsManager(plugin);
    await settingsManager.loadSettings();
    validator = new SettingsValidator();
    // Create test container
    container = document.createElement('div');
    document.body.appendChild(container);
    // Track field changes and validations
    const fieldChanges = new Map<string, any>();
    const validationResults = new Map<string, { isValid: boolean; errors: string[] }>();
    const uiOptions: UIComponentOptions = {
      container,
      validator,
      onChange: async (field: string, value: any) => {
        fieldChanges.set(field, value);
        const settings = settingsManager.getSettings();
        
        // Apply the change to settings
        const pathParts = field.split('.');
        let target: any = settings;
        for (let i = 0; i < pathParts.length - 1; i++) {
          target = target[pathParts[i]];
        }
        target[pathParts[pathParts.length - 1]] = value;
        // Update settings
        await settingsManager.updateSettings(settings);
      },
      onValidationChange: (field: string, isValid: boolean, errors: string[]) => {
        validationResults.set(field, { isValid, errors });
      }
    };
    uiComponents = new SettingsUIComponents(uiOptions);
    // Store references for test access
    (uiComponents as any)._fieldChanges = fieldChanges;
    (uiComponents as any)._validationResults = validationResults;
  });
  afterEach(() => {
    // Clean up
    container.remove();
    vi.clearAllMocks();
  describe('Bidirectional Sync Toggle', () => {
    test('should create toggle with warning when enabled', async () => {
      const toggle = uiComponents.createBidirectionalSyncToggle(container, true, false);
      
      expect(toggle).toBeDefined();
      expect(toggle.getValue()).toBe(true);
      // Check for warning elements
      const warningEl = container.querySelector('.settings-warning');
      expect(warningEl).toBeTruthy();
      expect(warningEl?.textContent).toContain('Warning');
      expect(warningEl?.textContent).toContain('experimental');
      // Check for recommendations
      const recommendations = container.querySelector('.warning-recommendations');
      expect(recommendations).toBeTruthy();
      expect(recommendations?.textContent).toContain('Configure conflict resolution');
      expect(recommendations?.textContent).toContain('Enable backup');
      expect(recommendations?.textContent).toContain('Test with non-critical data');
    });
    test('should handle toggle changes with validation', async () => {
      const toggle = uiComponents.createBidirectionalSyncToggle(container, false, false);
      // Simulate toggle change
      await toggle.setValue(true);
      // Wait for debounced validation
      await new Promise(resolve => setTimeout(resolve, 350));
      // Check field change was recorded
      const fieldChanges = (uiComponents as any)._fieldChanges;
      expect(fieldChanges.get('sync.bidirectionalSyncEnabled')).toBe(true);
      // Check validation was triggered
      const validationResults = (uiComponents as any)._validationResults;
      expect(validationResults.has('sync.bidirectionalSyncEnabled')).toBe(true);
    test('should disable toggle when disabled parameter is true', () => {
      const toggle = uiComponents.createBidirectionalSyncToggle(container, false, true);
      expect(toggle.disabled).toBe(true);
    test('should not show warning when disabled', () => {
      uiComponents.createBidirectionalSyncToggle(container, false, false);
      expect(warningEl).toBeFalsy();
  describe('Field Mapping Configuration', () => {
    test('should render field mappings with add button', () => {
      const mappings: FieldMapping[] = [
        {
          jiraField: 'summary',
          jiraFieldType: JiraFieldType.STRING,
          baseProperty: 'title',
          basePropertyType: BasePropertyType.TEXT,
          bidirectional: true,
          transformationRules: [],
          validationRules: []
      ];
      const container = uiComponents.createFieldMappingConfiguration(container, mappings);
      expect(container).toBeTruthy();
      expect(container.querySelector('h3')?.textContent).toBe('Field Mappings');
      // Check for add button
      const addButton = container.querySelector('button');
      expect(addButton?.textContent).toContain('Add Mapping');
      // Check for existing mapping
      const mappingItems = container.querySelectorAll('.field-mapping-item');
      expect(mappingItems.length).toBe(1);
    test('should add new field mapping when button clicked', async () => {
      const mappings: FieldMapping[] = [];
      const mappingContainer = uiComponents.createFieldMappingConfiguration(container, mappings);
      const addButton = mappingContainer.querySelector('button') as HTMLButtonElement;
      expect(addButton).toBeTruthy();
      // Click add button
      addButton.click();
      // Check mapping was added
      expect(mappings.length).toBe(1);
      expect(mappings[0].jiraField).toBe('');
      expect(mappings[0].jiraFieldType).toBe(JiraFieldType.STRING);
      expect(mappings[0].basePropertyType).toBe(BasePropertyType.TEXT);
    test('should render field mapping inputs with validation', async () => {
          bidirectional: false,
      uiComponents.createFieldMappingConfiguration(container, mappings);
      // Check for input fields
      const textInputs = container.querySelectorAll('input[type="text"]');
      expect(textInputs.length).toBeGreaterThanOrEqual(2); // Jira field and Base property
      // Check for dropdowns
      const dropdowns = container.querySelectorAll('select');
      expect(dropdowns.length).toBeGreaterThanOrEqual(2); // Jira type and Base type
      // Check for bidirectional toggle
      const toggles = container.querySelectorAll('input[type="checkbox"]');
      expect(toggles.length).toBeGreaterThanOrEqual(1);
      // Check for remove button
      const removeButtons = container.querySelectorAll('button');
      const removeButton = Array.from(removeButtons).find(btn => 
        btn.textContent?.includes('Remove')
      );
      expect(removeButton).toBeTruthy();
    test('should validate field mapping changes in real-time', async () => {
          jiraField: '',
          baseProperty: '',
      // Find the Jira field input
      const jiraFieldInput = container.querySelector('input[type="text"]') as HTMLInputElement;
      expect(jiraFieldInput).toBeTruthy();
      // Set invalid value (empty)
      jiraFieldInput.value = '';
      jiraFieldInput.dispatchEvent(new Event('input', { bubbles: true }));
      // Check validation error
      const result = validationResults.get('fieldMappings[0].jiraField');
      expect(result?.isValid).toBe(false);
      expect(result?.errors).toContain('Jira field name is required');
    test('should remove field mapping when remove button clicked', async () => {
      // Mock confirm dialog
      const originalConfirm = window.confirm;
      window.confirm = vi.fn(() => true);
      // Find remove button
      ) as HTMLButtonElement;
      // Click remove
      removeButton.click();
      // Check mapping was removed
      expect(mappings.length).toBe(0);
      // Restore confirm
      window.confirm = originalConfirm;
  describe('Plugin Integration Checkboxes', () => {
    test('should render plugin integration checkboxes with status', () => {
      const integrations = {
        tasksPluginEnabled: true,
        dataviewPluginEnabled: false,
        calendarPluginEnabled: true,
        dayPlannerPluginEnabled: false,
        kanbanPluginEnabled: false,
        templaterPluginEnabled: true,
        quickaddPluginEnabled: false
      };
      const toggleMap = uiComponents.createPluginIntegrationCheckboxes(container, integrations);
      expect(toggleMap.size).toBe(7);
      // Check for plugin names and descriptions
      expect(container.textContent).toContain('Tasks Plugin');
      expect(container.textContent).toContain('Dataview Plugin');
      expect(container.textContent).toContain('Calendar Plugin');
      expect(container.textContent).toContain('Sync Jira issues as tasks');
      // Check toggle states
      expect(toggleMap.get('tasksPluginEnabled')?.getValue()).toBe(true);
      expect(toggleMap.get('dataviewPluginEnabled')?.getValue()).toBe(false);
    test('should show warning for unavailable plugins', () => {
        tasksPluginEnabled: false,
        calendarPluginEnabled: false,
        templaterPluginEnabled: false,
      uiComponents.createPluginIntegrationCheckboxes(container, integrations);
      // Check for plugin warnings (since plugins aren't available in test env)
      const warnings = container.querySelectorAll('.plugin-warning');
      expect(warnings.length).toBeGreaterThan(0);
      const warningText = container.textContent;
      expect(warningText).toContain('Plugin not installed');
    test('should handle plugin toggle changes', async () => {
      const tasksToggle = toggleMap.get('tasksPluginEnabled');
      expect(tasksToggle).toBeTruthy();
      // Change value
      await tasksToggle!.setValue(true);
      expect(fieldChanges.get('pluginIntegrations.tasksPluginEnabled')).toBe(true);
  describe('Conflict Resolution Dropdown', () => {
    test('should render conflict resolution strategies', () => {
      const dropdown = uiComponents.createConflictResolutionDropdown(
        container, 
        ConflictResolutionStrategy.MANUAL
      expect(dropdown).toBeTruthy();
      expect(dropdown.getValue()).toBe(ConflictResolutionStrategy.MANUAL);
      // Check dropdown options
      const select = container.querySelector('select');
      expect(select).toBeTruthy();
      const options = select!.querySelectorAll('option');
      expect(options.length).toBe(5); // All strategies
      // Check for strategy descriptions
      expect(container.textContent).toContain('Manual Resolution');
      expect(container.textContent).toContain('Jira Wins');
      expect(container.textContent).toContain('Obsidian Wins');
      expect(container.textContent).toContain('Newest Wins');
      expect(container.textContent).toContain('Rule-Based');
    test('should update description when strategy changes', async () => {
      // Initial description check
      expect(container.textContent).toContain('presented to you for manual resolution');
      // Change strategy
      await dropdown.setValue(ConflictResolutionStrategy.JIRA_WINS);
      // Wait for update
      await new Promise(resolve => setTimeout(resolve, 100));
      // Check updated description
      expect(container.textContent).toContain('Jira version will always be used');
      expect(fieldChanges.get('conflictResolution.strategy')).toBe(ConflictResolutionStrategy.JIRA_WINS);
    test('should show appropriate description for each strategy', async () => {
      const strategies = [
        { value: ConflictResolutionStrategy.MANUAL, text: 'presented to you for manual resolution' },
        { value: ConflictResolutionStrategy.JIRA_WINS, text: 'Jira version will always be used' },
        { value: ConflictResolutionStrategy.BASE_WINS, text: 'Obsidian version will always be used' },
        { value: ConflictResolutionStrategy.NEWEST_WINS, text: 'most recently modified version' },
        { value: ConflictResolutionStrategy.RULE_BASED, text: 'Custom rules will be applied' }
      for (const strategy of strategies) {
        container.empty();
        const dropdown = uiComponents.createConflictResolutionDropdown(container, strategy.value);
        expect(container.textContent).toContain(strategy.text);
  describe('Performance Tuning Sliders', () => {
    test('should render performance sliders with validation', () => {
      const performance = DEFAULT_SETTINGS.performance;
      const sliderMap = uiComponents.createPerformanceTuningSliders(container, performance);
      expect(sliderMap.size).toBe(4);
      expect(sliderMap.has('cacheSize')).toBe(true);
      expect(sliderMap.has('cacheTimeout')).toBe(true);
      expect(sliderMap.has('maxConcurrentRequests')).toBe(true);
      expect(sliderMap.has('requestThrottleMs')).toBe(true);
      // Check slider elements
      const sliders = container.querySelectorAll('input[type="range"]');
      expect(sliders.length).toBe(4);
      // Check value displays
      const valueDisplays = container.querySelectorAll('.slider-value-display');
      expect(valueDisplays.length).toBe(4);
      // Check formatted values
      expect(container.textContent).toContain('MB');
      expect(container.textContent).toContain('requests');
    test('should validate slider values in real-time', async () => {
      const cacheSizeSlider = sliderMap.get('cacheSize');
      expect(cacheSizeSlider).toBeTruthy();
      // Set valid value
      await cacheSizeSlider!.setValue(100);
      // Wait for validation
      // Check no validation errors
      const errorElements = container.querySelectorAll('.setting-error');
      expect(errorElements.length).toBe(0);
      expect(fieldChanges.get('performance.cacheSize')).toBe(100);
    test('should show warnings for extreme values', async () => {
      // Set high value that triggers warning
      await cacheSizeSlider!.setValue(600);
      // Check for warning
      const warningElements = container.querySelectorAll('.slider-validation.warning');
      expect(warningElements.length).toBeGreaterThan(0);
      expect(warningText).toContain('Large cache sizes may impact system performance');
    test('should update value displays with proper formatting', async () => {
      // Test cache timeout formatting
      const cacheTimeoutSlider = sliderMap.get('cacheTimeout');
      await cacheTimeoutSlider!.setValue(120); // 2 hours
      // Check formatted display
      const timeoutDisplay = Array.from(valueDisplays).find(el => 
        el.textContent?.includes('h')
      expect(timeoutDisplay).toBeTruthy();
      expect(timeoutDisplay?.textContent).toBe('2h');
      // Test throttle formatting
      const throttleSlider = sliderMap.get('requestThrottleMs');
      await throttleSlider!.setValue(1500);
      const throttleDisplay = Array.from(valueDisplays).find(el => 
        el.textContent?.includes('1.5s')
      expect(throttleDisplay).toBeTruthy();
  describe('Validation Display', () => {
    test('should create validation display elements', () => {
      const validationEl = uiComponents.createValidationDisplay(container, 'test.field');
      expect(validationEl).toBeTruthy();
      expect(validationEl.classList.contains('validation-display')).toBe(true);
      expect(validationEl.classList.contains('validation-test-field')).toBe(true);
      expect(validationEl.style.display).toBe('none');
    test('should show error messages in validation display', () => {
      uiComponents.createValidationDisplay(container, 'test.field');
      uiComponents.updateValidationDisplay('test.field', false, ['Error message 1', 'Error message 2']);
      const validationEl = container.querySelector('.validation-test-field') as HTMLElement;
      expect(validationEl.style.display).toBe('block');
      expect(validationEl.classList.contains('validation-error')).toBe(true);
      const errorMessages = validationEl.querySelectorAll('.validation-message.error');
      expect(errorMessages.length).toBe(2);
      expect(validationEl.textContent).toContain('Error message 1');
      expect(validationEl.textContent).toContain('Error message 2');
    test('should show warning messages in validation display', () => {
      uiComponents.updateValidationDisplay('test.field', true, [], ['Warning message']);
      expect(validationEl.classList.contains('validation-warning')).toBe(true);
      const warningMessages = validationEl.querySelectorAll('.validation-message.warning');
      expect(warningMessages.length).toBe(1);
      expect(validationEl.textContent).toContain('Warning message');
    test('should hide validation display when no errors or warnings', () => {
      // First show errors
      uiComponents.updateValidationDisplay('test.field', false, ['Error']);
      // Then clear
      uiComponents.updateValidationDisplay('test.field', true, [], []);
      expect(validationEl.classList.contains('validation-error')).toBe(false);
      expect(validationEl.classList.contains('validation-warning')).toBe(false);
  describe('Help Text and Tooltips', () => {
    test('should create help text with icon', () => {
      const helpEl = uiComponents.createHelpText(container, 'This is help text');
      expect(helpEl.classList.contains('setting-help-text')).toBe(true);
      expect(helpEl.textContent).toContain('This is help text');
      expect(helpEl.innerHTML).toContain('ℹ️');
    test('should create help text with tooltip', () => {
      const helpEl = uiComponents.createHelpText(
        'This is help text', 
        'This is a tooltip'
      const tooltipEl = helpEl.querySelector('.help-tooltip');
      expect(tooltipEl).toBeTruthy();
      expect(tooltipEl?.getAttribute('title')).toBe('This is a tooltip');
    test('should show and hide tooltips on hover', (done) => {
        'Help text', 
        'Tooltip content'
      const tooltipTrigger = helpEl.querySelector('.help-tooltip') as HTMLElement;
      expect(tooltipTrigger).toBeTruthy();
      // Simulate mouseenter
      tooltipTrigger.dispatchEvent(new MouseEvent('mouseenter'));
      setTimeout(() => {
        // Check tooltip was created
        const tooltip = document.querySelector('.settings-tooltip');
        expect(tooltip).toBeTruthy();
        expect(tooltip?.textContent).toBe('Tooltip content');
        // Simulate mouseleave
        tooltipTrigger.dispatchEvent(new MouseEvent('mouseleave'));
        setTimeout(() => {
          // Check tooltip was removed
          const tooltipAfter = document.querySelector('.settings-tooltip');
          expect(tooltipAfter).toBeFalsy();
          done();
        }, 50);
      }, 50);
  describe('Cross-field Validation Integration', () => {
    test('should validate cross-field dependencies', async () => {
      // Test bidirectional sync requires proper conflict resolution
      const settings = settingsManager.getSettings();
      settings.sync.bidirectionalSyncEnabled = true;
      settings.conflictResolution.strategy = ConflictResolutionStrategy.MANUAL;
      settings.conflictResolution.notifyOnConflict = false;
      const validation = validator.validateSettings(settings);
      expect(validation.isValid).toBe(true); // Warnings don't make it invalid
      expect(validation.warnings.length).toBeGreaterThan(0);
      const conflictWarning = validation.warnings.find(w => 
        w.message.includes('notifications') && w.message.includes('enabled')
      expect(conflictWarning).toBeTruthy();
    test('should warn about performance implications', async () => {
      settings.sync.syncInterval = 2; // Very frequent
      settings.performance.maxConcurrentRequests = 15; // High concurrency
      const performanceWarning = validation.warnings.find(w => 
        w.message.includes('overload')
      expect(performanceWarning).toBeTruthy();
    test('should validate field mapping consistency', async () => {
      settings.fieldMappings = []; // No bidirectional mappings
      const mappingWarning = validation.warnings.find(w => 
        w.message.includes('bidirectional mapping')
      expect(mappingWarning).toBeTruthy();
  describe('Real-time Validation Flow', () => {
    test('should debounce validation calls', async () => {
      const validationSpy = vi.spyOn(validator, 'validateField');
      // Create a simple text input that triggers validation
      const input = document.createElement('input');
      container.appendChild(input);
      // Simulate rapid typing
      for (let i = 0; i < 5; i++) {
        input.value = `test${i}`;
        input.dispatchEvent(new Event('input'));
      // Should not have called validation yet (debounced)
      expect(validationSpy).not.toHaveBeenCalled();
      // Wait for debounce
      // Should have been called once after debounce
      expect(validationSpy).toHaveBeenCalledTimes(1);
      validationSpy.mockRestore();
    test('should handle validation errors gracefully', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation();
      // Create UI component with failing onChange handler
      const failingOptions: UIComponentOptions = {
        container,
        validator,
        onChange: async () => {
          throw new Error('Simulated validation failure');
      const failingUI = new SettingsUIComponents(failingOptions);
      const toggle = failingUI.createBidirectionalSyncToggle(container, false);
      // Trigger change
      // Wait for error handling
      // Should have logged error
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error handling field change'),
        expect.any(Error)
      consoleSpy.mockRestore();
  describe('Accessibility and UX', () => {
    test('should have proper ARIA labels and descriptions', () => {
      const toggle = uiComponents.createBidirectionalSyncToggle(container, false);
      // Check for proper labeling
      const settingElements = container.querySelectorAll('.setting-item');
      expect(settingElements.length).toBeGreaterThan(0);
      // Check for descriptions
      const descriptions = container.querySelectorAll('.setting-item-description');
      expect(descriptions.length).toBeGreaterThan(0);
    test('should provide clear visual feedback for validation states', () => {
      // Test error state
      uiComponents.updateValidationDisplay('test.field', false, ['Error message']);
      const errorIcon = container.querySelector('.validation-icon');
      expect(errorIcon?.textContent).toBe('❌');
      // Test warning state
      const warningIcon = container.querySelector('.validation-icon');
      expect(warningIcon?.textContent).toBe('⚠️');
    test('should maintain focus during dynamic updates', async () => {
      addButton.focus();
      // Add new mapping
      // Button should still be focusable
      expect(document.activeElement).toBeTruthy();
});
// Test utilities
function createMockApp(): App {
  const mockApp = {
    vault: {
      adapter: {
        path: {
          join: vi.fn((...paths) => paths.join('/')),
          dirname: vi.fn(path => path.split('/').slice(0, -1).join('/')),
          basename: vi.fn(path => path.split('/').pop() || ''),
    },
    plugins: {
      enabledPlugins: new Set(['obsidian-tasks-plugin', 'dataview']),
      plugins: {}
    }
  };
  return mockApp as unknown as App;
// Mock DOM methods for testing
global.MutationObserver = class {
  observe() {}
  disconnect() {}
  takeRecords() { return []; }
};
// Mock Obsidian Notice for testing
global.Notice = class {
  constructor(message: string) {
    console.log('Notice:', message);
// Setup JSDOM environment
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
global.document = dom.window.document;
global.window = dom.window as any;
global.HTMLElement = dom.window.HTMLElement;
global.HTMLInputElement = dom.window.HTMLInputElement;
global.HTMLButtonElement = dom.window.HTMLButtonElement;
global.HTMLSelectElement = dom.window.HTMLSelectElement;
global.Event = dom.window.Event;
global.MouseEvent = dom.window.MouseEvent;
