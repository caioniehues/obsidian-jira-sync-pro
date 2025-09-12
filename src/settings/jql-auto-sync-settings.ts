/**
 * JQL Auto-Sync Settings Component
 * 
 * Provides configuration UI for JQL auto-sync functionality including:
 * - JQL query validation and testing
 * - Sync interval slider (1-60 minutes)
 * - Connection testing functionality
 * - Settings persistence with validation
 * - User-friendly validation messages
 */

import { App, PluginSettingTab, Setting, Notice } from 'obsidian';
import { JQLQueryEngine } from '../enhanced-sync/jql-query-engine';
import { AutoSyncScheduler } from '../enhanced-sync/auto-sync-scheduler';
import { UserAction, ERROR_CODES } from '../types/sync-types';

/**
 * Settings interface for JQL auto-sync configuration
 */
export interface JQLAutoSyncSettings {
  // Jira Connection
  jiraUrl: string;
  jiraUsername: string;
  jiraApiToken: string;
  
  // JQL Configuration  
  jqlQuery: string;
  
  // Auto-Sync Settings
  autoSyncEnabled: boolean;
  syncInterval: number; // minutes (1-60)
  
  // Status-Based Organization
  enableStatusOrganization?: boolean;
  activeTicketsFolder?: string;
  archivedTicketsFolder?: string;
  archiveByYear?: boolean;
  keepRecentArchive?: boolean;
  recentArchiveDays?: number;
  
  // Advanced Settings
  maxResults: number;
  batchSize: number;
  syncFolder: string;
}

/**
 * Default settings for JQL auto-sync
 */
export const DEFAULT_JQL_SETTINGS: JQLAutoSyncSettings = {
  jiraUrl: '',
  jiraUsername: '',
  jiraApiToken: '',
  jqlQuery: 'assignee = currentUser() AND status NOT IN (Done, Closed)',
  autoSyncEnabled: false,
  syncInterval: 5,
  enableStatusOrganization: true,
  activeTicketsFolder: 'Active Tickets',
  archivedTicketsFolder: 'Archived Tickets',
  archiveByYear: true,
  keepRecentArchive: true,
  recentArchiveDays: 30,
  maxResults: 1000,
  batchSize: 50,
  syncFolder: 'Knowledge/Work'
};

/**
 * Validation result interface for settings validation
 */
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * JQL validation result with additional context
 */
export interface JQLValidationResult extends ValidationResult {
  syntaxValid: boolean;
  connectionValid: boolean;
  queryExecutable: boolean;
  estimatedResults?: number;
}

/**
 * JQL Auto-Sync Settings Tab Component
 * 
 * Extends Obsidian's PluginSettingTab to provide comprehensive
 * configuration UI for JQL auto-sync functionality.
 */
export class JQLAutoSyncSettingsTab extends PluginSettingTab {
  private settings: JQLAutoSyncSettings;
  private readonly onSettingsChanged: (settings: JQLAutoSyncSettings) => Promise<void>;
  
  // Component dependencies
  private readonly queryEngine?: JQLQueryEngine;
  private readonly scheduler?: AutoSyncScheduler;
  
  // UI Element references for state management
  private jqlQueryValidationTimeout: NodeJS.Timeout | null = null;
  private connectionTestButton: HTMLButtonElement | null = null;
  private syncStatusIndicator: HTMLElement | null = null;
  private intervalDisplayElement: HTMLElement | null = null;
  
  constructor(
    app: App, 
    plugin: any,
    settings: JQLAutoSyncSettings,
    onSettingsChanged: (settings: JQLAutoSyncSettings) => Promise<void>,
    queryEngine?: JQLQueryEngine,
    scheduler?: AutoSyncScheduler
  ) {
    super(app, plugin);
    this.settings = settings;
    this.onSettingsChanged = onSettingsChanged;
    this.queryEngine = queryEngine;
    this.scheduler = scheduler;
  }

  /**
   * Renders the settings UI
   */
  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    this.renderHeader();
    this.renderConnectionSettings();
    this.renderSyncConfiguration();
    this.renderStatusOrganization();
    this.renderAdvancedSettings();
    this.renderActions();
    this.addCustomStyles();
  }

  /**
   * Renders the header section with description
   */
  private renderHeader(): void {
    const { containerEl } = this;
    
    containerEl.createEl('h2', { text: 'JQL Auto-Sync Configuration' });
    
    containerEl.createEl('p', { 
      text: 'Configure automatic synchronization of Jira tickets using JQL queries.',
      cls: 'setting-item-description jql-settings-description'
    });

    // Status indicator for overall configuration state
    const statusContainer = containerEl.createDiv({ cls: 'jql-config-status' });
    this.renderConfigurationStatus(statusContainer);
  }

  /**
   * Renders Jira connection settings section
   */
  private renderConnectionSettings(): void {
    const { containerEl } = this;
    
    containerEl.createEl('h3', { text: 'Jira Connection' });

    // Jira URL
    new Setting(containerEl)
      .setName('Jira URL')
      .setDesc('Your Jira instance URL (e.g., https://your-domain.atlassian.net)')
      .addText(text => text
        .setPlaceholder('https://your-domain.atlassian.net')
        .setValue(this.settings.jiraUrl)
        .onChange(async (value) => {
          await this.handleJiraUrlChange(text.inputEl, value);
        }));

    // Username
    new Setting(containerEl)
      .setName('Username')
      .setDesc('Your Jira username (email address)')
      .addText(text => text
        .setPlaceholder('your-email@example.com')
        .setValue(this.settings.jiraUsername)
        .onChange(async (value) => {
          await this.handleUsernameChange(text.inputEl, value);
        }));

    // API Token
    new Setting(containerEl)
      .setName('API Token')
      .setDesc('Your Jira API token (generate from Atlassian account settings)')
      .addText(text => {
        text.inputEl.type = 'password';
        text.setPlaceholder('Enter your API token')
          .setValue(this.settings.jiraApiToken)
          .onChange(async (value) => {
            await this.handleApiTokenChange(value);
          });
      });

    // Connection Test
    this.renderConnectionTest();
  }

  /**
   * Renders sync configuration section
   */
  private renderSyncConfiguration(): void {
    const { containerEl } = this;
    
    containerEl.createEl('h3', { text: 'Sync Configuration' });

    // JQL Query with advanced validation
    this.renderJQLQuerySetting();
    
    // Auto-sync toggle with status
    this.renderAutoSyncToggle();
    
    // Sync interval slider
    this.renderSyncIntervalSlider();
  }

  /**
   * Renders status-based organization settings
   */
  private renderStatusOrganization(): void {
    const { containerEl } = this;
    
    containerEl.createEl('h3', { text: 'Status-Based Organization' });

    // Enable/Disable toggle
    new Setting(containerEl)
      .setName('Enable Status Organization')
      .setDesc('Automatically organize tickets based on their status')
      .addToggle(toggle => toggle
        .setValue(this.settings.enableStatusOrganization ?? true)
        .onChange(async (value) => {
          this.settings.enableStatusOrganization = value;
          await this.saveSettings();
          // Refresh the display to show/hide related settings
          this.display();
        }));

    if (this.settings.enableStatusOrganization) {
      // Active tickets folder
      new Setting(containerEl)
        .setName('Active Tickets Folder')
        .setDesc('Folder name for active tickets (relative to sync folder)')
        .addText(text => text
          .setPlaceholder('Active Tickets')
          .setValue(this.settings.activeTicketsFolder ?? 'Active Tickets')
          .onChange(async (value) => {
            this.settings.activeTicketsFolder = value;
            await this.saveSettings();
          }));

      // Archived tickets folder
      new Setting(containerEl)
        .setName('Archived Tickets Folder')
        .setDesc('Folder name for archived tickets (relative to sync folder)')
        .addText(text => text
          .setPlaceholder('Archived Tickets')
          .setValue(this.settings.archivedTicketsFolder ?? 'Archived Tickets')
          .onChange(async (value) => {
            this.settings.archivedTicketsFolder = value;
            await this.saveSettings();
          }));

      // Archive by year toggle
      new Setting(containerEl)
        .setName('Archive by Year')
        .setDesc('Organize archived tickets into year-based subfolders')
        .addToggle(toggle => toggle
          .setValue(this.settings.archiveByYear ?? true)
          .onChange(async (value) => {
            this.settings.archiveByYear = value;
            await this.saveSettings();
            // Refresh display to show/hide year-based settings
            this.display();
          }));

      // Keep recent archive toggle
      new Setting(containerEl)
        .setName('Keep Recent Archive')
        .setDesc('Keep recently closed tickets in a separate "Recent" folder')
        .addToggle(toggle => toggle
          .setValue(this.settings.keepRecentArchive ?? true)
          .onChange(async (value) => {
            this.settings.keepRecentArchive = value;
            await this.saveSettings();
            // Refresh display to show/hide recent archive settings
            this.display();
          }));

      if (this.settings.keepRecentArchive) {
        // Recent archive days
        new Setting(containerEl)
          .setName('Recent Archive Days')
          .setDesc('Number of days to keep tickets in the Recent folder (1-365)')
          .addText(text => text
            .setPlaceholder('30')
            .setValue(String(this.settings.recentArchiveDays ?? 30))
            .onChange(async (value) => {
              const days = parseInt(value);
              if (!isNaN(days) && days >= 1 && days <= 365) {
                this.settings.recentArchiveDays = days;
                await this.saveSettings();
              } else {
                text.inputEl.classList.add('is-invalid');
                new Notice('Please enter a value between 1 and 365');
              }
            }));
      }
    }
  }

  /**
   * Renders advanced settings section
   */
  private renderAdvancedSettings(): void {
    const { containerEl } = this;
    
    containerEl.createEl('h3', { text: 'Advanced Settings' });

    // Max Results
    new Setting(containerEl)
      .setName('Max Results')
      .setDesc('Maximum number of tickets to sync (1-1000)')
      .addText(text => text
        .setPlaceholder('1000')
        .setValue(String(this.settings.maxResults))
        .onChange(async (value) => {
          await this.handleMaxResultsChange(text.inputEl, value);
        }));

    // Batch Size
    new Setting(containerEl)
      .setName('Batch Size')
      .setDesc('Number of tickets to process in each batch (1-100)')
      .addText(text => text
        .setPlaceholder('50')
        .setValue(String(this.settings.batchSize))
        .onChange(async (value) => {
          await this.handleBatchSizeChange(text.inputEl, value);
        }));

    // Sync Folder
    new Setting(containerEl)
      .setName('Sync Folder')
      .setDesc('Vault folder where Jira tickets will be stored')
      .addText(text => text
        .setPlaceholder('Jira Issues')
        .setValue(this.settings.syncFolder)
        .onChange(async (value) => {
          await this.handleSyncFolderChange(text.inputEl, value);
        }));
  }

  /**
   * Renders action buttons section
   */
  private renderActions(): void {
    const { containerEl } = this;
    
    containerEl.createEl('h3', { text: 'Actions' });

    new Setting(containerEl)
      .setName('Validate All Settings')
      .setDesc('Comprehensive validation of all settings and connection test')
      .addButton(button => button
        .setButtonText('Validate All')
        .setCta()
        .onClick(async () => {
          await this.validateAllSettings(button);
        }));

    new Setting(containerEl)
      .setName('Reset to Defaults')
      .setDesc('Reset all settings to default values')
      .addButton(button => button
        .setButtonText('Reset')
        .setWarning()
        .onClick(async () => {
          await this.resetToDefaults();
        }));
  }

  /**
   * Renders JQL query setting with advanced validation
   */
  private renderJQLQuerySetting(): void {
    const { containerEl } = this;
    
    const jqlSetting = new Setting(containerEl)
      .setName('JQL Query')
      .setDesc('JQL query to select tickets for synchronization');
    
    const jqlContainer = jqlSetting.controlEl.createDiv({ cls: 'jql-query-container' });
    
    // Text area for query
    const jqlTextArea = jqlContainer.createEl('textarea', {
      cls: 'jql-query-input',
      attr: {
        placeholder: 'assignee = currentUser() AND status NOT IN (Done, Closed)',
        rows: '4',
        'data-testid': 'jql-query-input'
      }
    });
    jqlTextArea.value = this.settings.jqlQuery;
    
    // Validation indicator
    const validationContainer = jqlContainer.createDiv({ cls: 'jql-validation-container' });
    const validationIndicator = validationContainer.createEl('div', {
      cls: 'jql-validation-indicator'
    });
    
    // Query test button
    const testButton = validationContainer.createEl('button', {
      cls: 'mod-cta mod-small jql-test-button',
      text: 'Test Query'
    });
    
    // Handle query changes with debounced validation
    jqlTextArea.addEventListener('input', (e) => {
      const value = (e.target as HTMLTextAreaElement).value;
      this.handleJQLQueryChange(value, validationIndicator);
    });
    
    // Handle test button click
    testButton.addEventListener('click', async () => {
      await this.testJQLQuery(testButton, validationIndicator);
    });
  }

  /**
   * Renders auto-sync toggle with status indicator
   */
  private renderAutoSyncToggle(): void {
    const { containerEl } = this;
    
    const autoSyncSetting = new Setting(containerEl)
      .setName('Auto-Sync')
      .setDesc('Automatically sync tickets at regular intervals');
    
    autoSyncSetting.addToggle(toggle => {
      // Status indicator
      this.syncStatusIndicator = autoSyncSetting.controlEl.createEl('span', {
        cls: 'sync-status-indicator'
      });
      
      this.updateSyncStatusIndicator(this.settings.autoSyncEnabled);
      
      toggle
        .setValue(this.settings.autoSyncEnabled)
        .onChange(async (value) => {
          await this.handleAutoSyncToggle(value);
        });
    });
  }

  /**
   * Renders sync interval slider with live preview
   */
  private renderSyncIntervalSlider(): void {
    const { containerEl } = this;
    
    const intervalSetting = new Setting(containerEl)
      .setName('Sync Interval')
      .setDesc('How frequently to sync tickets (in minutes)');
    
    this.intervalDisplayElement = intervalSetting.controlEl.createEl('span', {
      cls: 'interval-display',
      text: this.formatIntervalDisplay(this.settings.syncInterval)
    });
    
    intervalSetting.addSlider(slider => slider
      .setLimits(1, 60, 1)
      .setValue(this.settings.syncInterval)
      .setDynamicTooltip()
      .onChange(async (value) => {
        await this.handleSyncIntervalChange(value);
      }));
  }

  /**
   * Renders connection test functionality
   */
  private renderConnectionTest(): void {
    const { containerEl } = this;
    
    new Setting(containerEl)
      .setName('Test Connection')
      .setDesc('Verify Jira connection and validate credentials')
      .addButton(button => {
        this.connectionTestButton = button.buttonEl;
        button
          .setButtonText('Test Connection')
          .onClick(async () => {
            await this.testConnection();
          });
      });
  }

  /**
   * Renders configuration status indicator
   */
  private renderConfigurationStatus(container: HTMLElement): void {
    const statusEl = container.createEl('div', { cls: 'config-status-indicator' });
    const validation = this.validateSettings(this.settings);
    
    if (validation.isValid) {
      statusEl.innerHTML = '✅ Configuration is valid and ready';
      statusEl.className = 'config-status-indicator config-status-valid';
    } else {
      const errorCount = validation.errors.length;
      const warningCount = validation.warnings.length;
      statusEl.innerHTML = `⚠️ ${errorCount} errors, ${warningCount} warnings`;
      statusEl.className = 'config-status-indicator config-status-invalid';
    }
  }

  // Event Handlers

  /**
   * Handles Jira URL changes with validation
   */
  private async handleJiraUrlChange(inputEl: HTMLInputElement, value: string): Promise<void> {
    if (value && !this.isValidUrl(value)) {
      this.setInputError(inputEl, 'Invalid URL format');
      return;
    }
    
    this.clearInputError(inputEl);
    this.settings.jiraUrl = value.trim();
    await this.onSettingsChanged(this.settings);
  }

  /**
   * Handles username changes with validation
   */
  private async handleUsernameChange(inputEl: HTMLInputElement, value: string): Promise<void> {
    if (value && !this.isValidEmail(value)) {
      this.setInputWarning(inputEl, 'Username should be a valid email address');
    } else {
      this.clearInputError(inputEl);
    }
    
    this.settings.jiraUsername = value.trim();
    await this.onSettingsChanged(this.settings);
  }

  /**
   * Handles API token changes
   */
  private async handleApiTokenChange(value: string): Promise<void> {
    this.settings.jiraApiToken = value.trim();
    await this.onSettingsChanged(this.settings);
  }

  /**
   * Handles JQL query changes with debounced validation
   */
  private handleJQLQueryChange(value: string, validationIndicator: HTMLElement): void {
    // Clear previous timeout
    if (this.jqlQueryValidationTimeout) {
      clearTimeout(this.jqlQueryValidationTimeout);
    }
    
    // Show validating state
    this.setValidationState(validationIndicator, 'validating', '⏳ Validating...');
    
    // Debounce validation
    this.jqlQueryValidationTimeout = setTimeout(async () => {
      const result = await this.validateJQLQuery(value);
      this.updateJQLValidationIndicator(validationIndicator, result);
      
      if (result.syntaxValid) {
        this.settings.jqlQuery = value;
        await this.onSettingsChanged(this.settings);
      }
    }, 500);
  }

  /**
   * Handles auto-sync toggle changes
   */
  private async handleAutoSyncToggle(value: boolean): Promise<void> {
    this.settings.autoSyncEnabled = value;
    await this.onSettingsChanged(this.settings);
    
    this.updateSyncStatusIndicator(value);
    
    // Update scheduler if available
    if (this.scheduler) {
      if (value) {
        await this.scheduler.start();
        new Notice('✅ Auto-sync started');
      } else {
        this.scheduler.stop();
        new Notice('⏹️ Auto-sync stopped');
      }
    }
  }

  /**
   * Handles sync interval changes
   */
  private async handleSyncIntervalChange(value: number): Promise<void> {
    this.settings.syncInterval = value;
    await this.onSettingsChanged(this.settings);
    
    if (this.intervalDisplayElement) {
      this.intervalDisplayElement.textContent = this.formatIntervalDisplay(value);
    }
    
    // Update scheduler if running
    if (this.scheduler && this.settings.autoSyncEnabled) {
      this.scheduler.updateInterval(value);
      new Notice(`Sync interval updated to ${this.formatIntervalDisplay(value)}`);
    }
  }

  /**
   * Handles max results changes with validation
   */
  private async handleMaxResultsChange(inputEl: HTMLInputElement, value: string): Promise<void> {
    const num = parseInt(value);
    if (isNaN(num) || num < 1 || num > 1000) {
      this.setInputError(inputEl, 'Value must be between 1 and 1000');
      return;
    }
    
    this.clearInputError(inputEl);
    this.settings.maxResults = num;
    await this.onSettingsChanged(this.settings);
  }

  /**
   * Handles batch size changes with validation
   */
  private async handleBatchSizeChange(inputEl: HTMLInputElement, value: string): Promise<void> {
    const num = parseInt(value);
    if (isNaN(num) || num < 1 || num > 100) {
      this.setInputError(inputEl, 'Value must be between 1 and 100');
      return;
    }
    
    this.clearInputError(inputEl);
    this.settings.batchSize = num;
    await this.onSettingsChanged(this.settings);
  }

  /**
   * Handles sync folder changes with validation
   */
  private async handleSyncFolderChange(inputEl: HTMLInputElement, value: string): Promise<void> {
    if (!this.isValidFolderPath(value)) {
      this.setInputError(inputEl, 'Invalid folder path');
      return;
    }
    
    this.clearInputError(inputEl);
    this.settings.syncFolder = value;
    await this.onSettingsChanged(this.settings);
  }

  /**
   * Helper method to save settings
   */
  private async saveSettings(): Promise<void> {
    await this.onSettingsChanged(this.settings);
  }

  // Validation Methods

  /**
   * Validates complete settings configuration
   */
  public validateSettings(settings: JQLAutoSyncSettings): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    // Required fields validation
    if (!settings.jiraUrl) {
      errors.push('Jira URL is required');
    } else if (!this.isValidUrl(settings.jiraUrl)) {
      errors.push('Invalid Jira URL format');
    }
    
    if (!settings.jiraApiToken) {
      errors.push('API token is required');
    }
    
    if (!settings.jqlQuery) {
      errors.push('JQL query is required');
    }
    
    // Optional field warnings
    if (!settings.jiraUsername) {
      warnings.push('Username is recommended for better authentication');
    } else if (!this.isValidEmail(settings.jiraUsername)) {
      warnings.push('Username should be a valid email address');
    }
    
    // Range validations
    if (settings.syncInterval < 1 || settings.syncInterval > 60) {
      errors.push('Sync interval must be between 1 and 60 minutes');
    }
    
    if (settings.maxResults < 1 || settings.maxResults > 1000) {
      errors.push('Max results must be between 1 and 1000');
    }
    
    if (settings.batchSize < 1 || settings.batchSize > 100) {
      errors.push('Batch size must be between 1 and 100');
    }
    
    if (!this.isValidFolderPath(settings.syncFolder)) {
      errors.push('Invalid sync folder path');
    }
    
    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Validates JQL query syntax and executability
   */
  public async validateJQLQuery(query: string): Promise<JQLValidationResult> {
    const result: JQLValidationResult = {
      isValid: false,
      syntaxValid: false,
      connectionValid: false,
      queryExecutable: false,
      errors: [],
      warnings: []
    };
    
    if (!query?.trim()) {
      result.errors.push('JQL query cannot be empty');
      return result;
    }
    
    // Basic syntax validation
    result.syntaxValid = this.validateJQLSyntax(query);
    if (!result.syntaxValid) {
      result.errors.push('Invalid JQL syntax');
      return result;
    }
    
    // Test execution with permission safety
    if (this.queryEngine) {
      try {
        // First test with permission filter
        const safeQuery = query.includes('projectsWhereUserHasPermission') 
          ? query 
          : `(${query}) AND project in projectsWhereUserHasPermission("Browse Projects")`;
        
        const isValid = await this.queryEngine.validateQuery(safeQuery);
        
        result.connectionValid = true;
        result.queryExecutable = isValid;
        
        if (!isValid) {
          result.errors.push('JQL query cannot be executed. You may not have access to the specified projects.');
          result.warnings.push('Tip: The query will automatically filter to only show issues you have permission to view.');
        } else {
          // Test without filter to see if there's a difference
          try {
            await this.queryEngine.validateQuery(query);
          } catch (permError: any) {
            if (permError.status === 403 || permError.name === 'JiraPermissionError') {
              result.warnings.push('Some issues may be filtered due to permissions. This is normal and sync will continue with accessible issues.');
            }
          }
        }
      } catch (error: any) {
        if (error.status === 403 || error.name === 'JiraPermissionError') {
          result.errors.push('Permission denied. Please verify your Jira project access.');
          result.warnings.push(error.suggestedAction || 'Contact your Jira administrator for project access.');
        } else {
          result.errors.push(`Query validation failed: ${error.message}`);
        }
      }
    }
    
    result.isValid = result.syntaxValid && 
                     (result.queryExecutable || !this.queryEngine);
    
    return result;
  }

  // Testing Methods

  /**
   * Tests Jira connection with current settings
   */
  public async testConnection(): Promise<boolean> {
    if (!this.connectionTestButton) return false;
    
    const validation = this.validateSettings(this.settings);
    
    // Don't block on validation errors if they're just warnings
    const hasBlockingErrors = validation.errors.filter(e => 
      !e.includes('JQL query') // Allow JQL issues to be tested
    ).length > 0;
    
    if (hasBlockingErrors) {
      new Notice('❌ Please fix configuration errors first');
      return false;
    }
    
    if (!this.queryEngine) {
      new Notice('❌ Query engine not initialized');
      return false;
    }
    
    try {
      this.setButtonState(this.connectionTestButton, 'testing', 'Testing...', true);
      
      // Test with permission-safe query
      const safeQuery = this.settings.jqlQuery.includes('projectsWhereUserHasPermission')
        ? this.settings.jqlQuery
        : `(${this.settings.jqlQuery}) AND project in projectsWhereUserHasPermission("Browse Projects")`;
      
      const isValid = await this.queryEngine.validateQuery(safeQuery);
      
      if (isValid) {
        this.setButtonState(this.connectionTestButton, 'success', '✅ Connected', false);
        new Notice('✅ Connection successful! Query will be filtered to accessible issues.');
        
        setTimeout(() => {
          this.setButtonState(this.connectionTestButton, 'default', 'Test Connection', false);
        }, 3000);
        
        return true;
      } else {
        this.setButtonState(this.connectionTestButton, 'warning', '⚠️ Limited Access', false);
        new Notice('⚠️ Connection works but you may have limited project access');
        
        setTimeout(() => {
          this.setButtonState(this.connectionTestButton, 'default', 'Test Connection', false);
        }, 3000);
        
        return true; // Still return true as connection works
      }
    } catch (error: any) {
      if (error.status === 403 || error.name === 'JiraPermissionError') {
        this.setButtonState(this.connectionTestButton, 'warning', '⚠️ Permission Issue', false);
        new Notice(`⚠️ Connection works but permissions are limited. ${error.suggestedAction || ''}`);
        
        setTimeout(() => {
          this.setButtonState(this.connectionTestButton, 'default', 'Test Connection', false);
        }, 3000);
        
        return true; // Connection technically works, just permission limited
      }
      
      this.setButtonState(this.connectionTestButton, 'error', '❌ Failed', false);
      new Notice(`❌ Connection failed: ${error.message}`);
      
      setTimeout(() => {
        this.setButtonState(this.connectionTestButton, 'default', 'Test Connection', false);
      }, 3000);
      
      return false;
    }
  }

  /**
   * Tests JQL query execution
   */
  private async testJQLQuery(button: HTMLElement, indicator: HTMLElement): Promise<void> {
    if (!this.queryEngine) {
      this.setValidationState(indicator, 'error', '❌ Query engine not available');
      return;
    }
    
    const query = this.settings.jqlQuery;
    if (!query) {
      this.setValidationState(indicator, 'error', '❌ No query to test');
      return;
    }
    
    try {
      this.setButtonState(button as HTMLButtonElement, 'testing', 'Testing...', true);
      this.setValidationState(indicator, 'validating', '⏳ Testing query...');
      
      const result = await this.validateJQLQuery(query);
      this.updateJQLValidationIndicator(indicator, result);
      
      if (result.isValid) {
        new Notice('✅ JQL query test successful');
      } else {
        new Notice(`❌ JQL query test failed: ${result.errors.join(', ')}`);
      }
    } catch (error: any) {
      this.setValidationState(indicator, 'error', `❌ Test failed: ${error.message}`);
      new Notice(`❌ Query test error: ${error.message}`);
    } finally {
      this.setButtonState(button as HTMLButtonElement, 'default', 'Test Query', false);
    }
  }

  /**
   * Validates all settings comprehensively
   */
  private async validateAllSettings(button: any): Promise<void> {
    button.setDisabled(true);
    button.setButtonText('Validating...');
    
    const validation = this.validateSettings(this.settings);
    
    // Test connection if basic validation passes
    let connectionValid = false;
    if (validation.isValid && this.queryEngine) {
      try {
        connectionValid = await this.testConnection();
      } catch (error: any) {
        validation.errors.push(`Connection test failed: ${error.message}`);
      }
    }
    
    // Show results
    if (validation.isValid && (!this.queryEngine || connectionValid)) {
      button.setButtonText('✅ All Valid');
      new Notice('✅ All settings are valid and connection successful!');
    } else {
      button.setButtonText('❌ Issues Found');
      
      if (validation.errors.length > 0) {
        new Notice(`❌ Errors:\n${validation.errors.join('\n')}`, 6000);
      }
      
      if (validation.warnings.length > 0) {
        new Notice(`⚠️ Warnings:\n${validation.warnings.join('\n')}`, 4000);
      }
    }
    
    // Reset button
    setTimeout(() => {
      button.setButtonText('Validate All');
      button.setDisabled(false);
    }, 3000);
  }

  /**
   * Resets all settings to default values
   */
  private async resetToDefaults(): Promise<void> {
    // Confirm with user first
    const confirmed = confirm(
      'Are you sure you want to reset all settings to defaults? This action cannot be undone.'
    );
    
    if (!confirmed) return;
    
    this.settings = { ...DEFAULT_JQL_SETTINGS };
    await this.onSettingsChanged(this.settings);
    
    // Refresh the UI
    this.display();
    
    new Notice('✅ Settings reset to defaults');
  }

  // Utility Methods

  /**
   * Updates sync status indicator
   */
  private updateSyncStatusIndicator(enabled: boolean): void {
    if (!this.syncStatusIndicator) return;
    
    if (enabled) {
      this.syncStatusIndicator.textContent = '🟢 Active';
      this.syncStatusIndicator.className = 'sync-status-indicator sync-active';
    } else {
      this.syncStatusIndicator.textContent = '🔴 Inactive';
      this.syncStatusIndicator.className = 'sync-status-indicator sync-inactive';
    }
  }

  /**
   * Updates JQL validation indicator
   */
  private updateJQLValidationIndicator(indicator: HTMLElement, result: JQLValidationResult): void {
    if (result.isValid) {
      this.setValidationState(indicator, 'valid', '✅ Valid JQL query');
    } else {
      const errorMsg = result.errors.length > 0 ? result.errors[0] : 'Invalid query';
      this.setValidationState(indicator, 'error', `❌ ${errorMsg}`);
    }
  }

  /**
   * Sets validation state for indicators
   */
  private setValidationState(element: HTMLElement, state: string, message: string): void {
    element.textContent = message;
    element.className = `validation-indicator validation-${state}`;
  }

  /**
   * Sets button state with styling
   */
  private setButtonState(button: HTMLButtonElement, state: string, text: string, disabled: boolean): void {
    button.textContent = text;
    button.disabled = disabled;
    button.className = `mod-cta button-${state}`;
  }

  /**
   * Sets input error styling and message
   */
  private setInputError(input: HTMLInputElement, message: string): void {
    input.style.borderColor = 'var(--color-red)';
    input.title = message;
    input.setAttribute('aria-invalid', 'true');
  }

  /**
   * Sets input warning styling
   */
  private setInputWarning(input: HTMLInputElement, message: string): void {
    input.style.borderColor = 'var(--color-orange)';
    input.title = message;
  }

  /**
   * Clears input error styling
   */
  private clearInputError(input: HTMLInputElement): void {
    input.style.borderColor = '';
    input.title = '';
    input.removeAttribute('aria-invalid');
  }

  /**
   * Formats interval display text
   */
  private formatIntervalDisplay(minutes: number): string {
    return `${minutes} minute${minutes === 1 ? '' : 's'}`;
  }

  // Validation Utilities

  /**
   * Validates URL format
   */
  private isValidUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  }

  /**
   * Validates email format
   */
  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Validates JQL syntax (basic validation)
   */
  private validateJQLSyntax(query: string): boolean {
    if (!query?.trim()) return false;
    
    // Basic JQL syntax patterns
    const patterns = [
      /\w+\s*(=|!=|>|<|>=|<=|~|!~|in|not in|is|is not|was|was not)\s*.+/i,
      /order\s+by\s+\w+/i,
      /and|or/i
    ];
    
    return patterns.some(pattern => pattern.test(query));
  }

  /**
   * Validates folder path format
   */
  private isValidFolderPath(path: string): boolean {
    if (!path?.trim()) return false;
    if (path.startsWith('/') || path.startsWith('..')) return false;
    if (path.includes('\\') || path.includes(':')) return false;
    return true;
  }

  /**
   * Adds custom styles for the settings UI
   */
  private addCustomStyles(): void {
    const styleId = 'jql-auto-sync-settings-styles';
    
    // Remove existing styles
    const existingStyle = document.getElementById(styleId);
    if (existingStyle) {
      existingStyle.remove();
    }
    
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      /* JQL Auto-Sync Settings Styles */
      .jql-settings-description {
        margin-bottom: 1.5em;
        color: var(--text-muted);
      }
      
      .jql-config-status {
        margin-bottom: 2em;
        padding: 1em;
        border-radius: 6px;
        background: var(--background-secondary);
      }
      
      .config-status-indicator {
        font-weight: 600;
        font-size: 0.95em;
      }
      
      .config-status-valid {
        color: var(--color-green);
      }
      
      .config-status-invalid {
        color: var(--color-red);
      }
      
      .jql-query-container {
        width: 100%;
      }
      
      .jql-query-input {
        width: 100%;
        min-height: 80px;
        padding: 8px 12px;
        border: 1px solid var(--background-modifier-border);
        border-radius: 4px;
        background: var(--background-primary);
        color: var(--text-normal);
        font-family: var(--font-monospace);
        font-size: 0.9em;
        line-height: 1.4;
        resize: vertical;
      }
      
      .jql-query-input:focus {
        outline: none;
        border-color: var(--interactive-accent);
        box-shadow: 0 0 0 2px var(--interactive-accent-hover);
      }
      
      .jql-validation-container {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-top: 8px;
        gap: 12px;
      }
      
      .validation-indicator {
        font-size: 0.85em;
        font-weight: 500;
        transition: all 0.2s ease;
      }
      
      .validation-valid {
        color: var(--color-green);
      }
      
      .validation-error {
        color: var(--color-red);
      }
      
      .validation-validating {
        color: var(--text-muted);
      }
      
      .jql-test-button {
        padding: 4px 12px;
        font-size: 0.8em;
        min-height: 28px;
      }
      
      .sync-status-indicator {
        font-weight: 600;
        font-size: 0.9em;
        margin-left: 12px;
      }
      
      .sync-active {
        color: var(--color-green);
      }
      
      .sync-inactive {
        color: var(--text-muted);
      }
      
      .interval-display {
        font-weight: 600;
        color: var(--interactive-accent);
        margin-left: 12px;
      }
      
      .button-testing {
        opacity: 0.7;
        cursor: wait;
      }
      
      .button-success {
        background-color: var(--color-green);
        color: white;
      }
      
      .button-error {
        background-color: var(--color-red);
        color: white;
      }
      
      /* Responsive design for smaller screens */
      @media (max-width: 768px) {
        .jql-validation-container {
          flex-direction: column;
          align-items: stretch;
        }
        
        .jql-test-button {
          width: 100%;
          margin-top: 4px;
        }
      }
    `;
    
    document.head.appendChild(style);
  }
}