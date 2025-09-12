/**
 * Settings Integration Example
 * 
 * Demonstrates how to integrate the JQL Auto-Sync Settings component
 * with the main plugin and existing scheduler/query engine components.
 */

import { App, Plugin, PluginSettingTab } from 'obsidian';
import { 
  JQLAutoSyncSettingsTab, 
  JQLAutoSyncSettings, 
  DEFAULT_JQL_SETTINGS,
  SettingsValidator 
} from './index';
import { JQLQueryEngine } from '../enhanced-sync/jql-query-engine';
import { AutoSyncScheduler, AutoSyncConfig } from '../enhanced-sync/auto-sync-scheduler';
import { JiraClient } from '../jira-bases-adapter/jira-client';

/**
 * Example integration showing how to use the JQL Auto-Sync Settings
 * in a plugin's main file.
 */
export class ExamplePluginIntegration extends Plugin {
  private settings: JQLAutoSyncSettings = DEFAULT_JQL_SETTINGS;
  private readonly settingsTab?: JQLAutoSyncSettingsTab;
  private settingsValidator?: SettingsValidator;
  
  // Plugin components
  private jiraClient?: JiraClient;
  private queryEngine?: JQLQueryEngine;
  private scheduler?: AutoSyncScheduler;

  async onload() {
    console.log('Loading JQL Auto-Sync Plugin with new settings component');
    
    // Load settings from disk
    await this.loadSettings();
    
    // Initialize components
    await this.initializeComponents();
    
    // Add settings tab
    this.addSettingTab(new JQLAutoSyncSettingsTab(
      this.app,
      this,
      this.settings,
      this.handleSettingsChanged.bind(this),
      this.queryEngine,
      this.scheduler
    ));
    
    // Register commands
    this.registerCommands();
    
    // Start auto-sync if enabled
    if (this.settings.autoSyncEnabled && this.scheduler) {
      await this.scheduler.start();
    }
  }

  async onunload() {
    console.log('Unloading JQL Auto-Sync Plugin');
    
    // Stop scheduler
    if (this.scheduler) {
      this.scheduler.stop();
    }
  }

  /**
   * Loads settings from Obsidian's data storage
   */
  private async loadSettings(): Promise<void> {
    const savedSettings = await this.loadData();
    this.settings = Object.assign({}, DEFAULT_JQL_SETTINGS, savedSettings);
  }

  /**
   * Saves settings to Obsidian's data storage
   */
  private async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  /**
   * Initializes plugin components based on current settings
   */
  private async initializeComponents(): Promise<void> {
    // Initialize Jira client if we have connection details
    if (this.settings.jiraUrl && this.settings.jiraApiToken) {
      this.jiraClient = new JiraClient({
        jiraUrl: this.settings.jiraUrl,
        username: this.settings.jiraUsername,
        apiToken: this.settings.jiraApiToken,
        timeout: 30000
      });

      // Initialize query engine with client
      this.queryEngine = new JQLQueryEngine(this.jiraClient);

      // Initialize settings validator with query engine
      this.settingsValidator = new SettingsValidator(this.queryEngine);

      // Initialize auto-sync scheduler
      const schedulerConfig: AutoSyncConfig = {
        enabled: this.settings.autoSyncEnabled,
        jqlQuery: this.settings.jqlQuery,
        syncInterval: this.settings.syncInterval,
        maxResults: this.settings.maxResults,
        batchSize: this.settings.batchSize
      };

      this.scheduler = new AutoSyncScheduler(
        this.app,
        this,
        this.queryEngine,
        schedulerConfig
      );

      console.log('Components initialized successfully');
    } else {
      console.log('Waiting for Jira configuration before initializing components');
    }
  }

  /**
   * Handles settings changes from the settings UI
   */
  private async handleSettingsChanged(newSettings: JQLAutoSyncSettings): Promise<void> {
    const oldSettings = { ...this.settings };
    this.settings = newSettings;
    
    // Save to disk
    await this.saveSettings();
    
    // Check if we need to reinitialize components
    const connectionChanged = 
      oldSettings.jiraUrl !== newSettings.jiraUrl ||
      oldSettings.jiraUsername !== newSettings.jiraUsername ||
      oldSettings.jiraApiToken !== newSettings.jiraApiToken;

    if (connectionChanged) {
      console.log('Connection settings changed, reinitializing components');
      await this.initializeComponents();
    }

    // Update scheduler configuration if it exists
    if (this.scheduler) {
      const schedulerConfig: AutoSyncConfig = {
        enabled: newSettings.autoSyncEnabled,
        jqlQuery: newSettings.jqlQuery,
        syncInterval: newSettings.syncInterval,
        maxResults: newSettings.maxResults,
        batchSize: newSettings.batchSize
      };

      this.scheduler.updateConfig(schedulerConfig);
      
      // Start or stop scheduler based on settings
      if (newSettings.autoSyncEnabled && !oldSettings.autoSyncEnabled) {
        await this.scheduler.start();
      } else if (!newSettings.autoSyncEnabled && oldSettings.autoSyncEnabled) {
        this.scheduler.stop();
      }
    }

    console.log('Settings updated successfully', { oldSettings, newSettings });
  }

  /**
   * Registers plugin commands
   */
  private registerCommands(): void {
    this.addCommand({
      id: 'jql-sync-manual',
      name: 'Sync Jira tickets now',
      callback: async () => this.performManualSync()
    });

    this.addCommand({
      id: 'jql-sync-toggle',
      name: 'Toggle auto-sync',
      callback: async () => this.toggleAutoSync()
    });

    this.addCommand({
      id: 'jql-sync-validate-settings',
      name: 'Validate JQL settings',
      callback: async () => this.validateSettings()
    });

    this.addCommand({
      id: 'jql-sync-test-connection',
      name: 'Test Jira connection',
      callback: async () => this.testConnection()
    });
  }

  /**
   * Performs a manual sync
   */
  private async performManualSync(): Promise<void> {
    if (!this.queryEngine) {
      console.error('Cannot sync: Query engine not initialized');
      return;
    }

    try {
      console.log('Starting manual sync');
      const results = await this.queryEngine.executeQuery(
        this.settings.jqlQuery,
        {
          maxResults: this.settings.maxResults,
          startAt: 0
        }
      );
      
      console.log(`Manual sync completed: ${results.issues.length} issues found`);
    } catch (error: any) {
      console.error('Manual sync failed:', error.message);
    }
  }

  /**
   * Toggles auto-sync on/off
   */
  private async toggleAutoSync(): Promise<void> {
    const newSettings = {
      ...this.settings,
      autoSyncEnabled: !this.settings.autoSyncEnabled
    };
    
    await this.handleSettingsChanged(newSettings);
    console.log(`Auto-sync ${newSettings.autoSyncEnabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Validates current settings
   */
  private async validateSettings(): Promise<void> {
    if (!this.settingsValidator) {
      console.log('Settings validator not available');
      return;
    }

    try {
      console.log('Validating settings...');
      const result = await this.settingsValidator.validateSettings(
        this.settings, 
        true // Include connectivity test
      );
      
      if (result.isValid) {
        console.log('✅ All settings are valid');
      } else {
        console.log('❌ Settings validation failed:');
        result.errors.forEach(error => console.log(`  Error: ${error}`));
        result.warnings.forEach(warning => console.log(`  Warning: ${warning}`));
      }
    } catch (error: any) {
      console.error('Settings validation error:', error.message);
    }
  }

  /**
   * Tests the Jira connection
   */
  private async testConnection(): Promise<void> {
    if (!this.settingsValidator) {
      console.log('Settings validator not available');
      return;
    }

    try {
      console.log('Testing Jira connection...');
      const result = await this.settingsValidator.testConnection(this.settings);
      
      if (result.success) {
        console.log(`✅ Connection successful (${result.responseTime}ms)`);
      } else {
        console.log(`❌ Connection failed: ${result.error?.message}`);
      }
    } catch (error: any) {
      console.error('Connection test error:', error.message);
    }
  }

  /**
   * Gets current settings (for external access)
   */
  public getSettings(): JQLAutoSyncSettings {
    return { ...this.settings };
  }

  /**
   * Updates settings programmatically
   */
  public async updateSettings(newSettings: Partial<JQLAutoSyncSettings>): Promise<void> {
    const updatedSettings = { ...this.settings, ...newSettings };
    await this.handleSettingsChanged(updatedSettings);
  }

  /**
   * Gets settings validator for external validation
   */
  public getSettingsValidator(): SettingsValidator | undefined {
    return this.settingsValidator;
  }
}

/**
 * Example of how to create a custom settings tab that extends
 * the base JQL Auto-Sync Settings with additional functionality
 */
export class CustomJQLSettingsTab extends JQLAutoSyncSettingsTab {
  private readonly plugin: ExamplePluginIntegration;

  constructor(app: App, plugin: ExamplePluginIntegration) {
    super(
      app,
      plugin,
      plugin.getSettings(),
      plugin.updateSettings.bind(plugin),
      undefined, // Will be set by plugin
      undefined  // Will be set by plugin
    );
    this.plugin = plugin;
  }

  /**
   * Override display to add custom sections
   */
  display(): void {
    // Call parent display first
    super.display();
    
    // Add custom sections
    this.addCustomSections();
  }

  /**
   * Adds custom sections to the settings UI
   */
  private addCustomSections(): void {
    const { containerEl } = this;
    
    // Add custom section
    containerEl.createEl('h3', { text: 'Custom Settings' });
    
    // Add custom settings here
    containerEl.createEl('p', { 
      text: 'This is where you could add custom settings specific to your use case.',
      cls: 'setting-item-description'
    });
  }
}

/**
 * Example usage in main.ts:
 * 
 * ```typescript
 * export default class MyJiraPlugin extends Plugin {
 *   private settingsIntegration: ExamplePluginIntegration;
 * 
 *   async onload() {
 *     this.settingsIntegration = new ExamplePluginIntegration();
 *     await this.settingsIntegration.onload.call(this);
 *   }
 * 
 *   async onunload() {
 *     await this.settingsIntegration.onunload();
 *   }
 * }
 * ```
 */