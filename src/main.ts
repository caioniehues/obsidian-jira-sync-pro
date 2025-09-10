import { Plugin, PluginSettingTab, Setting, Notice, Modal, App } from 'obsidian';
import { JiraClient } from './jira-bases-adapter/jira-client';
import { JQLQueryEngine } from './enhanced-sync/jql-query-engine';
import { AutoSyncScheduler, AutoSyncConfig } from './enhanced-sync/auto-sync-scheduler';
import { BulkImportManager } from './enhanced-sync/bulk-import-manager';
import { EnhancedSyncDashboard } from './ui/enhanced-dashboard';
import { SimpleNoteService } from './services/simple-note-service';

interface JiraSyncProSettings {
  jiraUrl: string;
  jiraUsername: string;
  jiraApiToken: string;
  jqlQuery: string;
  syncInterval: number;
  autoSyncEnabled: boolean;
  maxResults: number;
  batchSize: number;
  syncFolder: string;
}

const DEFAULT_SETTINGS: JiraSyncProSettings = {
  jiraUrl: '',
  jiraUsername: '',
  jiraApiToken: '',
  jqlQuery: 'assignee = currentUser() AND status NOT IN (Done, Closed)',
  syncInterval: 5,
  autoSyncEnabled: false,
  maxResults: 1000,
  batchSize: 50,
  syncFolder: 'Areas/Work/Jira Tickets'
};

export default class JiraSyncProPlugin extends Plugin {
  // Initialize settings immediately with defaults to prevent undefined errors
  settings: JiraSyncProSettings = { ...DEFAULT_SETTINGS };
  jiraClient: JiraClient | null = null;
  queryEngine: JQLQueryEngine | null = null;
  scheduler: AutoSyncScheduler | null = null;
  bulkImportManager: BulkImportManager | null = null;
  private initializationPromise: Promise<void> | null = null;
  private isInitialized: boolean = false;

  async onload() {
    console.log('Jira Sync Pro: Starting plugin initialization...');
    
    try {
      // Load settings first - critical for preventing undefined errors
      await this.loadSettings();
      console.log('Jira Sync Pro: Settings loaded successfully');

      // Add settings tab
      this.addSettingTab(new JiraSyncProSettingTab(this.app, this));

      // Initialize Jira components if configured
      if (this.hasValidCredentials()) {
        console.log('Jira Sync Pro: Valid credentials found, initializing components...');
        await this.initializeJiraComponents();
      } else {
        console.log('Jira Sync Pro: No valid credentials, skipping component initialization');
        new Notice('Jira Sync Pro: Please configure your Jira credentials in settings');
      }

      // Register commands
      this.registerCommands();

      // Start auto-sync if enabled and properly configured
      if (this.settings.autoSyncEnabled && this.scheduler && this.hasValidCredentials()) {
        try {
          await this.scheduler.start();
          new Notice('Jira Sync Pro: Auto-sync started');
        } catch (error) {
          console.error('Failed to start auto-sync:', error);
          new Notice('Jira Sync Pro: Failed to start auto-sync. Check your credentials.');
        }
      }

      this.isInitialized = true;
      console.log('Jira Sync Pro: Plugin initialization complete');
    } catch (error) {
      console.error('Jira Sync Pro: Plugin initialization failed:', error);
      new Notice('Jira Sync Pro: Plugin initialization failed. Check console for details.');
      // Ensure settings are at least set to defaults
      this.settings = { ...DEFAULT_SETTINGS };
    }
  }

  async onunload() {
    console.log('Jira Sync Pro: Unloading plugin...');
    
    // Stop scheduler if running
    if (this.scheduler) {
      try {
        this.scheduler.stop();
      } catch (error) {
        console.error('Error stopping scheduler:', error);
      }
    }

    // Clean up other resources
    this.jiraClient = null;
    this.queryEngine = null;
    this.bulkImportManager = null;
    this.isInitialized = false;
  }

  async loadSettings() {
    try {
      const savedData = await this.loadData();
      // Merge saved settings with defaults to ensure all fields are present
      this.settings = {
        ...DEFAULT_SETTINGS,
        ...(savedData || {})
      };
      
      // Validate settings structure
      this.validateSettingsStructure();
    } catch (error) {
      console.error('Failed to load settings:', error);
      // Fall back to defaults
      this.settings = { ...DEFAULT_SETTINGS };
    }
  }

  async saveSettings() {
    try {
      await this.saveData(this.settings);
      
      // Reinitialize components if settings changed and credentials are valid
      if (this.hasValidCredentials()) {
        await this.initializeJiraComponents();
      } else {
        // Clear components if credentials are invalid
        this.clearJiraComponents();
      }
    } catch (error) {
      console.error('Failed to save settings:', error);
      new Notice('Failed to save settings. Check console for details.');
    }
  }

  private validateSettingsStructure() {
    // Ensure all required fields exist
    const requiredFields: (keyof JiraSyncProSettings)[] = [
      'jiraUrl', 'jiraUsername', 'jiraApiToken', 'jqlQuery',
      'syncInterval', 'autoSyncEnabled', 'maxResults', 'batchSize', 'syncFolder'
    ];

    for (const field of requiredFields) {
      if (this.settings[field] === undefined) {
        console.warn(`Missing setting field: ${field}, using default`);
        this.settings[field] = DEFAULT_SETTINGS[field];
      }
    }

    // Validate numeric fields
    if (typeof this.settings.syncInterval !== 'number' || this.settings.syncInterval < 1) {
      this.settings.syncInterval = DEFAULT_SETTINGS.syncInterval;
    }
    if (typeof this.settings.maxResults !== 'number' || this.settings.maxResults < 1) {
      this.settings.maxResults = DEFAULT_SETTINGS.maxResults;
    }
    if (typeof this.settings.batchSize !== 'number' || this.settings.batchSize < 1) {
      this.settings.batchSize = DEFAULT_SETTINGS.batchSize;
    }
  }

  private hasValidCredentials(): boolean {
    return !!(
      this.settings &&
      this.settings.jiraUrl &&
      this.settings.jiraUrl.trim() !== '' &&
      this.settings.jiraApiToken &&
      this.settings.jiraApiToken.trim() !== '' &&
      this.settings.jiraUsername &&
      this.settings.jiraUsername.trim() !== ''
    );
  }

  private async initializeJiraComponents() {
    try {
      // Clear existing components first
      this.clearJiraComponents();

      // Initialize Jira client with error handling
      this.jiraClient = new JiraClient();
      this.jiraClient.configure({
        baseUrl: this.settings.jiraUrl.trim(),
        email: this.settings.jiraUsername.trim(),
        apiToken: this.settings.jiraApiToken.trim()
      });

      // Test the connection before proceeding
      try {
        console.log('Jira Sync Pro: Testing connection...');
        // You might want to add a testConnection method to JiraClient
        // For now, we'll proceed assuming the connection will be tested on first use
      } catch (error) {
        console.error('Jira connection test failed:', error);
        new Notice('Jira Sync Pro: Connection failed. Please check your credentials.');
        this.clearJiraComponents();
        return;
      }

      // Initialize query engine
      this.queryEngine = new JQLQueryEngine(this.jiraClient);

      // Initialize bulk import manager
      this.bulkImportManager = new BulkImportManager(
        this,
        this.queryEngine,
        this.settings.syncFolder
      );

      // Initialize scheduler
      const syncConfig: AutoSyncConfig = {
        enabled: this.settings.autoSyncEnabled,
        jqlQuery: this.settings.jqlQuery,
        syncInterval: this.settings.syncInterval,
        maxResults: this.settings.maxResults,
        batchSize: this.settings.batchSize
      };

      this.scheduler = new AutoSyncScheduler(
        this,
        this.queryEngine,
        syncConfig,
        async (options) => {
          await this.performSync(options.isManual);
        }
      );

      console.log('Jira Sync Pro: Components initialized successfully');
    } catch (error) {
      console.error('Failed to initialize Jira components:', error);
      new Notice('Jira Sync Pro: Failed to initialize. Check your settings.');
      this.clearJiraComponents();
    }
  }

  private clearJiraComponents() {
    if (this.scheduler) {
      try {
        this.scheduler.stop();
      } catch (error) {
        console.error('Error stopping scheduler:', error);
      }
    }
    
    this.scheduler = null;
    this.bulkImportManager = null;
    this.queryEngine = null;
    this.jiraClient = null;
  }

  private registerCommands() {
    this.addCommand({
      id: 'jira-sync-manual',
      name: 'Manual sync now',
      callback: () => this.performManualSync()
    });

    this.addCommand({
      id: 'jira-sync-bulk-import',
      name: 'Bulk import tickets',
      callback: () => this.performBulkImport()
    });

    this.addCommand({
      id: 'jira-sync-status',
      name: 'Show sync status',
      callback: () => this.showSyncStatus()
    });

    this.addCommand({
      id: 'jira-sync-dashboard',
      name: 'Open sync dashboard',
      callback: () => this.openSyncDashboard()
    });

    this.addCommand({
      id: 'jira-sync-test-connection',
      name: 'Test Jira connection',
      callback: () => this.testJiraConnection()
    });
  }

  private async performSync(isManual: boolean) {
    if (!this.hasValidCredentials()) {
      new Notice('Jira Sync Pro: Please configure Jira settings first');
      return;
    }

    if (!this.queryEngine) {
      new Notice('Jira Sync Pro: Jira components not initialized. Check your settings.');
      return;
    }

    try {
      new Notice(`Jira Sync Pro: ${isManual ? 'Manual' : 'Auto'} sync started...`);
      
      // Create note service
      const noteService = new SimpleNoteService(
        this.app.vault,
        this.settings.syncFolder
      );
      
      // Statistics for sync
      const stats = {
        created: 0,
        updated: 0,
        skipped: 0,
        errors: 0,
        total: 0
      };
      
      const result = await this.queryEngine.executeQuery({
        jql: this.settings.jqlQuery,
        maxResults: this.settings.maxResults,
        batchSize: this.settings.batchSize,
        onProgress: (current, total, phase) => {
          if (phase === 'complete') {
            new Notice(`Jira Sync Pro: Sync complete! ${current} tickets processed`);
          }
        }
      });

      // Check for permission warnings in the result
      if (result.errors && result.errors.length > 0) {
        const permissionErrors = result.errors.filter(e => e.message.includes('Permission'));
        if (permissionErrors.length > 0) {
          new Notice(`⚠️ Some issues were filtered due to permissions. Syncing ${result.issues.length} accessible issues.`);
          console.warn('Permission warnings:', permissionErrors);
        }
      }

      // Process each ticket and create/update notes
      stats.total = result.issues.length;
      
      if (stats.total === 0) {
        new Notice('Jira Sync Pro: No accessible issues found. Check your JQL query and permissions.');
        return;
      }
      
      new Notice(`Jira Sync Pro: Processing ${stats.total} tickets...`);
      
      for (const ticket of result.issues) {
        try {
          const noteResult = await noteService.processTicket(ticket, {
            overwriteExisting: true,  // Update existing notes
            organizationStrategy: 'by-project',  // Organize by project
            preserveLocalNotes: true  // Preserve local notes section
          });
          
          // Update statistics
          switch (noteResult.action) {
            case 'created':
              stats.created++;
              break;
            case 'updated':
              stats.updated++;
              break;
            case 'skipped':
              stats.skipped++;
              break;
            case 'error':
              stats.errors++;
              console.error(`Error processing ${ticket.key}:`, noteResult.error);
              break;
          }
        } catch (error) {
          stats.errors++;
          console.error(`Failed to process ticket ${ticket.key}:`, error);
        }
      }
      
      // Show final statistics
      const successCount = stats.created + stats.updated;
      let message = `Jira Sync Pro: Sync complete!\n`;
      message += `✅ Success: ${successCount}/${stats.total}\n`;
      if (stats.created > 0) message += `📝 Created: ${stats.created}\n`;
      if (stats.updated > 0) message += `🔄 Updated: ${stats.updated}\n`;
      if (stats.skipped > 0) message += `⏭️ Skipped: ${stats.skipped}\n`;
      if (stats.errors > 0) message += `❌ Errors: ${stats.errors}`;
      
      new Notice(message, 5000);
      
      console.log('Sync statistics:', stats);
      
    } catch (error: any) {
      console.error('Sync failed:', error);
      
      // Provide more specific error messages
      if (error.message?.includes('401') || error.message?.includes('403')) {
        new Notice('Jira Sync Pro: Authentication failed. Please check your credentials.');
      } else if (error.message?.includes('permission')) {
        new Notice('Jira Sync Pro: Permission denied. Check your Jira access rights.');
      } else {
        new Notice(`Jira Sync Pro: Sync failed - ${error.message || 'Unknown error'}`);
      }
    }
  }

  private async performManualSync() {
    if (!this.hasValidCredentials()) {
      new Notice('Jira Sync Pro: Please configure your credentials first');
      return;
    }

    if (this.scheduler) {
      await this.scheduler.triggerManualSync();
    } else {
      await this.performSync(true);
    }
  }

  private async performBulkImport() {
    if (!this.hasValidCredentials()) {
      new Notice('Jira Sync Pro: Please configure your credentials first');
      return;
    }

    if (!this.bulkImportManager) {
      new Notice('Jira Sync Pro: Bulk import not available. Check your settings.');
      return;
    }

    // Create progress modal
    const modal = new BulkImportModal(this.app, this.bulkImportManager, this.settings.jqlQuery);
    modal.open();
  }

  private showSyncStatus() {
    if (this.scheduler) {
      const stats = this.scheduler.getStatistics();
      new Notice(`Jira Sync Pro:
        Total syncs: ${stats.totalSyncs}
        Successful: ${stats.successfulSyncs}
        Failed: ${stats.failedSyncs}
        Last sync: ${stats.lastSyncTime || 'Never'}
        Status: ${stats.currentStatus}`);
    } else {
      new Notice('Jira Sync Pro: Scheduler not initialized. Check your credentials.');
    }
  }

  private openSyncDashboard() {
    if (!this.hasValidCredentials()) {
      new Notice('Jira Sync Pro: Please configure your credentials first');
      return;
    }

    // Use the enhanced dashboard with shadcn-inspired UI components
    const dashboard = new EnhancedSyncDashboard(
      this.app,
      this.scheduler,
      this.queryEngine
    );
    dashboard.open();
  }

  private async testJiraConnection() {
    if (!this.hasValidCredentials()) {
      new Notice('Jira Sync Pro: Please configure your credentials first');
      return;
    }

    if (!this.queryEngine) {
      // Try to initialize components
      await this.initializeJiraComponents();
      if (!this.queryEngine) {
        new Notice('Jira Sync Pro: Failed to initialize Jira connection');
        return;
      }
    }

    try {
      new Notice('Jira Sync Pro: Testing connection...');
      const isValid = await this.queryEngine.validateQuery(this.settings.jqlQuery);
      
      if (isValid) {
        new Notice('✅ Jira Sync Pro: Connection successful!');
      } else {
        new Notice('❌ Jira Sync Pro: Connection works but JQL query is invalid');
      }
    } catch (error: any) {
      console.error('Connection test failed:', error);
      
      if (error.message?.includes('401')) {
        new Notice('❌ Jira Sync Pro: Authentication failed. Check your API token.');
      } else if (error.message?.includes('403')) {
        new Notice('❌ Jira Sync Pro: Permission denied. Check your Jira access.');
      } else {
        new Notice(`❌ Jira Sync Pro: Connection failed - ${error.message || 'Unknown error'}`);
      }
    }
  }
}
class JiraSyncProSettingTab extends PluginSettingTab {
  plugin: JiraSyncProPlugin;
  private jqlQueryValidationTimeout: NodeJS.Timeout | null = null;
  private connectionTestButton: HTMLButtonElement | null = null;

  constructor(app: App, plugin: JiraSyncProPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl('h2', { text: 'Jira Sync Pro Settings' });

    // Add description
    containerEl.createEl('p', { 
      text: 'Configure your Jira connection and synchronization preferences.',
      cls: 'setting-item-description'
    });

    // Jira Connection Settings
    containerEl.createEl('h3', { text: 'Jira Connection' });

    new Setting(containerEl)
      .setName('Jira URL')
      .setDesc('Your Jira instance URL (e.g., https://your-domain.atlassian.net)')
      .addText(text => text
        .setPlaceholder('https://your-domain.atlassian.net')
        .setValue(this.plugin.settings.jiraUrl)
        .onChange(async (value) => {
          // Validate URL format
          if (value && !this.isValidUrl(value)) {
            text.inputEl.style.borderColor = '#e74c3c';
            new Notice('Invalid URL format');
          } else {
            text.inputEl.style.borderColor = '';
            this.plugin.settings.jiraUrl = value.trim();
            await this.plugin.saveSettings();
          }
        }));

    new Setting(containerEl)
      .setName('Username')
      .setDesc('Your Jira username (email address)')
      .addText(text => text
        .setPlaceholder('your-email@example.com')
        .setValue(this.plugin.settings.jiraUsername)
        .onChange(async (value) => {
          // Basic email validation
          if (value && !this.isValidEmail(value)) {
            text.inputEl.style.borderColor = '#e74c3c';
          } else {
            text.inputEl.style.borderColor = '';
            this.plugin.settings.jiraUsername = value.trim();
            await this.plugin.saveSettings();
          }
        }));

    new Setting(containerEl)
      .setName('API Token')
      .setDesc('Your Jira API token (get one from Atlassian account settings)')
      .addText(text => {
        text.inputEl.type = 'password';
        text.setPlaceholder('Enter your API token')
          .setValue(this.plugin.settings.jiraApiToken)
          .onChange(async (value) => {
            this.plugin.settings.jiraApiToken = value.trim();
            await this.plugin.saveSettings();
          });
      });

    // Test Connection Button
    new Setting(containerEl)
      .setName('Test Connection')
      .setDesc('Test your Jira connection and validate credentials')
      .addButton(button => {
        this.connectionTestButton = button.buttonEl;
        button
          .setButtonText('Test Connection')
          .onClick(async () => {
            await this.testConnection(button);
          });
      });

    // Sync Configuration
    containerEl.createEl('h3', { text: 'Sync Configuration' });

    // JQL Query with validation
    const jqlSetting = new Setting(containerEl)
      .setName('JQL Query')
      .setDesc('JQL query to select tickets for synchronization');
    
    // Create container for query input and validation
    const jqlContainer = jqlSetting.controlEl.createDiv();
    
    // Add text area
    const jqlTextArea = jqlContainer.createEl('textarea', {
      cls: 'jql-query-input',
      attr: {
        placeholder: 'assignee = currentUser() AND status NOT IN (Done, Closed)',
        rows: '4',
        style: 'width: 100%; font-family: monospace;'
      }
    });
    jqlTextArea.value = this.plugin.settings.jqlQuery;
    
    // Add validation indicator
    const validationIndicator = jqlContainer.createEl('div', {
      cls: 'jql-validation-indicator',
      attr: { style: 'margin-top: 5px; font-size: 0.9em;' }
    });
    
    // Handle JQL query changes with debounced validation
    jqlTextArea.addEventListener('input', async (e) => {
      const value = (e.target as HTMLTextAreaElement).value;
      
      // Clear previous timeout
      if (this.jqlQueryValidationTimeout) {
        clearTimeout(this.jqlQueryValidationTimeout);
      }
      
      // Update indicator to show validating
      validationIndicator.textContent = '⏳ Validating...';
      validationIndicator.style.color = '#95a5a6';
      
      // Debounce validation
      this.jqlQueryValidationTimeout = setTimeout(async () => {
        if (this.validateJQLSyntax(value)) {
          validationIndicator.textContent = '✅ Valid JQL syntax';
          validationIndicator.style.color = '#27ae60';
          jqlTextArea.style.borderColor = '#27ae60';
          
          this.plugin.settings.jqlQuery = value;
          await this.plugin.saveSettings();
        } else {
          validationIndicator.textContent = '❌ Invalid JQL syntax';
          validationIndicator.style.color = '#e74c3c';
          jqlTextArea.style.borderColor = '#e74c3c';
        }
      }, 500);
    });

    // Auto-sync toggle with status indicator
    const autoSyncSetting = new Setting(containerEl)
      .setName('Auto-sync')
      .setDesc('Automatically sync at regular intervals');
    
    let statusIndicator: HTMLElement;
    
    autoSyncSetting.addToggle(toggle => {
      // Add status indicator next to toggle
      statusIndicator = autoSyncSetting.controlEl.createEl('span', {
        cls: 'sync-status-indicator',
        attr: { style: 'margin-left: 10px; font-size: 0.9em;' }
      });
      
      this.updateSyncStatusIndicator(statusIndicator, this.plugin.settings.autoSyncEnabled);
      
      toggle
        .setValue(this.plugin.settings.autoSyncEnabled)
        .onChange(async (value) => {
          this.plugin.settings.autoSyncEnabled = value;
          await this.plugin.saveSettings();
          
          // Update status indicator
          this.updateSyncStatusIndicator(statusIndicator, value);
          
          // Start or stop scheduler
          if (value && this.plugin.scheduler) {
            await this.plugin.scheduler.start();
            new Notice('✅ Auto-sync started');
          } else if (!value && this.plugin.scheduler) {
            this.plugin.scheduler.stop();
            new Notice('⏹️ Auto-sync stopped');
          }
        });
    });

    // Sync interval slider with live preview
    const intervalSetting = new Setting(containerEl)
      .setName('Sync interval')
      .setDesc('How often to sync (in minutes)');
    
    const intervalDisplay = intervalSetting.controlEl.createEl('span', {
      cls: 'interval-display',
      text: `${this.plugin.settings.syncInterval} minutes`,
      attr: { style: 'margin-left: 10px; font-weight: bold;' }
    });
    
    intervalSetting.addSlider(slider => slider
      .setLimits(1, 60, 1)
      .setValue(this.plugin.settings.syncInterval)
      .setDynamicTooltip()
      .onChange(async (value) => {
        intervalDisplay.textContent = `${value} minute${value === 1 ? '' : 's'}`;
        this.plugin.settings.syncInterval = value;
        await this.plugin.saveSettings();
        
        // Update scheduler interval if running
        if (this.plugin.scheduler && this.plugin.settings.autoSyncEnabled) {
          this.plugin.scheduler.updateInterval(value);
          new Notice(`Sync interval updated to ${value} minute${value === 1 ? '' : 's'}`);
        }
      }));

    // Advanced Settings (collapsible)
    containerEl.createEl('h3', { text: 'Advanced Settings' });

    new Setting(containerEl)
      .setName('Max results')
      .setDesc('Maximum number of tickets to sync (1-1000)')
      .addText(text => text
        .setPlaceholder('1000')
        .setValue(String(this.plugin.settings.maxResults))
        .onChange(async (value) => {
          const num = parseInt(value);
          if (isNaN(num) || num < 1 || num > 1000) {
            text.inputEl.style.borderColor = '#e74c3c';
            new Notice('Value must be between 1 and 1000');
          } else {
            text.inputEl.style.borderColor = '';
            this.plugin.settings.maxResults = num;
            await this.plugin.saveSettings();
          }
        }));

    new Setting(containerEl)
      .setName('Batch size')
      .setDesc('Number of tickets to process in each batch (1-100)')
      .addText(text => text
        .setPlaceholder('50')
        .setValue(String(this.plugin.settings.batchSize))
        .onChange(async (value) => {
          const num = parseInt(value);
          if (isNaN(num) || num < 1 || num > 100) {
            text.inputEl.style.borderColor = '#e74c3c';
            new Notice('Value must be between 1 and 100');
          } else {
            text.inputEl.style.borderColor = '';
            this.plugin.settings.batchSize = num;
            await this.plugin.saveSettings();
          }
        }));

    new Setting(containerEl)
      .setName('Sync folder')
      .setDesc('Folder where Jira tickets will be stored')
      .addText(text => text
        .setPlaceholder('Jira Issues')
        .setValue(this.plugin.settings.syncFolder)
        .onChange(async (value) => {
          if (!this.isValidFolderPath(value)) {
            text.inputEl.style.borderColor = '#e74c3c';
            new Notice('Invalid folder path');
          } else {
            text.inputEl.style.borderColor = '';
            this.plugin.settings.syncFolder = value;
            await this.plugin.saveSettings();
          }
        }));

    // Actions section
    containerEl.createEl('h3', { text: 'Actions' });

    new Setting(containerEl)
      .setName('Validate All Settings')
      .setDesc('Check all settings for errors and test the connection')
      .addButton(button => button
        .setButtonText('Validate All')
        .setCta()
        .onClick(async () => {
          await this.validateAllSettings(button);
        }));

    // Add some styling
    this.addStyles();
  }

  private async testConnection(button: any): Promise<void> {
    // Validate required fields first
    if (!this.plugin.settings.jiraUrl || !this.plugin.settings.jiraApiToken) {
      new Notice('❌ Please configure Jira URL and API token first');
      return;
    }

    if (!this.plugin.queryEngine) {
      new Notice('❌ Jira client not initialized. Check your settings.');
      return;
    }

    try {
      button.setDisabled(true);
      button.setButtonText('Testing...');
      
      // Test the connection and JQL query
      const isValid = await this.plugin.queryEngine.validateQuery(
        this.plugin.settings.jqlQuery
      );
      
      if (isValid) {
        button.setButtonText('✅ Connected');
        new Notice('✅ Connection successful! JQL query is valid');
        
        // Reset button text after delay
        setTimeout(() => {
          button.setButtonText('Test Connection');
        }, 3000);
      } else {
        button.setButtonText('❌ Invalid Query');
        new Notice('❌ Connection works but JQL query is invalid');
        
        setTimeout(() => {
          button.setButtonText('Test Connection');
        }, 3000);
      }
    } catch (error: any) {
      button.setButtonText('❌ Failed');
      new Notice(`❌ Connection failed: ${error.message}`);
      
      setTimeout(() => {
        button.setButtonText('Test Connection');
      }, 3000);
    } finally {
      button.setDisabled(false);
    }
  }

  private async validateAllSettings(button: any): Promise<void> {
    button.setDisabled(true);
    button.setButtonText('Validating...');
    
    const errors: string[] = [];
    const warnings: string[] = [];
    
    // Validate URL
    if (!this.plugin.settings.jiraUrl) {
      errors.push('Jira URL is required');
    } else if (!this.isValidUrl(this.plugin.settings.jiraUrl)) {
      errors.push('Invalid Jira URL format');
    }
    
    // Validate username
    if (!this.plugin.settings.jiraUsername) {
      warnings.push('Username is recommended for better authentication');
    } else if (!this.isValidEmail(this.plugin.settings.jiraUsername)) {
      warnings.push('Username should be a valid email address');
    }
    
    // Validate API token
    if (!this.plugin.settings.jiraApiToken) {
      errors.push('API token is required');
    }
    
    // Validate JQL
    if (!this.plugin.settings.jqlQuery) {
      errors.push('JQL query is required');
    } else if (!this.validateJQLSyntax(this.plugin.settings.jqlQuery)) {
      errors.push('Invalid JQL query syntax');
    }
    
    // Validate sync interval
    if (this.plugin.settings.syncInterval < 1 || this.plugin.settings.syncInterval > 60) {
      errors.push('Sync interval must be between 1 and 60 minutes');
    }
    
    // Validate max results
    if (this.plugin.settings.maxResults < 1 || this.plugin.settings.maxResults > 1000) {
      errors.push('Max results must be between 1 and 1000');
    }
    
    // Validate batch size
    if (this.plugin.settings.batchSize < 1 || this.plugin.settings.batchSize > 100) {
      errors.push('Batch size must be between 1 and 100');
    }
    
    // Validate folder path
    if (!this.isValidFolderPath(this.plugin.settings.syncFolder)) {
      errors.push('Invalid sync folder path');
    }
    
    // Show results
    if (errors.length === 0 && warnings.length === 0) {
      button.setButtonText('✅ All Valid');
      new Notice('✅ All settings are valid!');
      
      // Test connection if possible
      if (this.plugin.queryEngine) {
        try {
          await this.plugin.queryEngine.validateQuery(this.plugin.settings.jqlQuery);
          new Notice('✅ Connection test passed!');
        } catch (error: any) {
          new Notice(`⚠️ Connection test failed: ${error.message}`);
        }
      }
    } else {
      button.setButtonText('❌ Issues Found');
      
      if (errors.length > 0) {
        new Notice(`❌ Errors:\n${errors.join('\n')}`, 5000);
      }
      
      if (warnings.length > 0) {
        new Notice(`⚠️ Warnings:\n${warnings.join('\n')}`, 4000);
      }
    }
    
    setTimeout(() => {
      button.setButtonText('Validate All');
      button.setDisabled(false);
    }, 3000);
  }

  private updateSyncStatusIndicator(indicator: HTMLElement, enabled: boolean): void {
    if (enabled) {
      indicator.textContent = '🟢 Active';
      indicator.style.color = '#27ae60';
    } else {
      indicator.textContent = '🔴 Inactive';
      indicator.style.color = '#95a5a6';
    }
  }

  private isValidUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  }

  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  private validateJQLSyntax(query: string): boolean {
    if (!query || !query.trim()) return false;
    
    // Basic JQL syntax validation
    const basicPattern = /\w+\s*(=|!=|>|<|>=|<=|~|!~|in|not in|is|is not|was|was not)\s*.+/i;
    return basicPattern.test(query);
  }

  private isValidFolderPath(path: string): boolean {
    if (!path || !path.trim()) return false;
    if (path.startsWith('/') || path.startsWith('..')) return false;
    if (path.includes('\\') || path.includes(':')) return false;
    return true;
  }

  private addStyles(): void {
    // Add custom CSS for better UI
    const style = document.createElement('style');
    style.textContent = `
      .jql-query-input {
        border: 1px solid var(--background-modifier-border);
        border-radius: 4px;
        padding: 8px;
        background: var(--background-primary);
        color: var(--text-normal);
      }
      
      .jql-query-input:focus {
        outline: none;
        border-color: var(--interactive-accent);
      }
      
      .sync-status-indicator {
        font-weight: 600;
      }
      
      .interval-display {
        color: var(--text-accent);
      }
      
      .jql-validation-indicator {
        transition: color 0.3s ease;
      }
    `;
    document.head.appendChild(style);
  }
}

class BulkImportModal extends Modal {
  private bulkImportManager: BulkImportManager;
  private jqlQuery: string;
  private isImporting: boolean = false;
  private progressEl: HTMLElement;
  private statusEl: HTMLElement;
  private errorEl: HTMLElement;
  private cancelButton: HTMLButtonElement;
  private startButton: HTMLButtonElement;

  constructor(app: App, bulkImportManager: BulkImportManager, jqlQuery: string) {
    super(app);
    this.bulkImportManager = bulkImportManager;
    this.jqlQuery = jqlQuery;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();

    contentEl.createEl('h2', { text: 'Bulk Import Jira Tickets' });

    // JQL Query display
    const queryContainer = contentEl.createDiv({ cls: 'jira-sync-query' });
    queryContainer.createEl('strong', { text: 'Query: ' });
    queryContainer.createEl('code', { text: this.jqlQuery });

    // Progress bar container
    const progressContainer = contentEl.createDiv({ cls: 'jira-sync-progress' });
    progressContainer.createEl('h4', { text: 'Progress' });
    this.progressEl = progressContainer.createEl('div', { 
      cls: 'progress-bar',
      attr: { style: 'width: 100%; height: 20px; background: #e0e0e0; border-radius: 10px; overflow: hidden;' }
    });
    this.progressEl.createEl('div', {
      cls: 'progress-fill',
      attr: { style: 'width: 0%; height: 100%; background: #4caf50; transition: width 0.3s;' }
    });

    // Status text
    this.statusEl = contentEl.createEl('p', { text: 'Ready to import' });

    // Error container (hidden initially)
    this.errorEl = contentEl.createDiv({ cls: 'jira-sync-errors' });
    this.errorEl.style.display = 'none';
    this.errorEl.style.color = 'red';
    this.errorEl.style.maxHeight = '100px';
    this.errorEl.style.overflowY = 'auto';

    // Buttons
    const buttonContainer = contentEl.createDiv({ cls: 'modal-button-container' });
    
    this.startButton = buttonContainer.createEl('button', { text: 'Start Import' });
    this.startButton.onclick = () => this.startImport();
    
    this.cancelButton = buttonContainer.createEl('button', { text: 'Cancel' });
    this.cancelButton.onclick = () => this.cancel();
    this.cancelButton.disabled = true;
  }

  private async startImport() {
    if (this.isImporting) return;

    this.isImporting = true;
    this.startButton.disabled = true;
    this.cancelButton.disabled = false;
    this.errorEl.style.display = 'none';
    this.errorEl.empty();

    try {
      const result = await this.bulkImportManager.startImport({
        jqlQuery: this.jqlQuery,
        batchSize: 25,
        skipExisting: false,
        organizeByProject: true,
        enableResume: true,
        onProgress: (current, total, phase, details) => {
          this.updateProgress(current, total, phase, details);
        },
        onError: (ticketKey, error) => {
          this.addError(`${ticketKey}: ${error}`);
        }
      });

      if (result) {
        if (result.cancelled) {
          this.statusEl.setText(`Import cancelled. Imported ${result.totalImported} tickets.`);
        } else {
          this.statusEl.setText(
            `Import complete! Imported: ${result.totalImported}, ` +
            `Updated: ${result.updated}, Skipped: ${result.skipped}, ` +
            `Failed: ${result.failedImports}`
          );
        }

        if (result.errors.length > 0) {
          this.showErrors(result.errors);
        }
      }
    } catch (error) {
      this.statusEl.setText(`Import failed: ${error.message}`);
      this.addError(error.message);
    } finally {
      this.isImporting = false;
      this.startButton.disabled = false;
      this.cancelButton.disabled = true;
    }
  }

  private updateProgress(current: number, total: number, phase: string, details?: any) {
    const percentage = total > 0 ? (current / total) * 100 : 0;
    const progressFill = this.progressEl.querySelector('.progress-fill') as HTMLElement;
    if (progressFill) {
      progressFill.style.width = `${percentage}%`;
    }

    let statusText = `${phase.charAt(0).toUpperCase() + phase.slice(1)}: ${current}/${total}`;
    if (details?.batch) {
      statusText += ` (Batch ${details.batch}/${details.batches})`;
    }
    this.statusEl.setText(statusText);
  }

  private addError(error: string) {
    if (this.errorEl.style.display === 'none') {
      this.errorEl.style.display = 'block';
      this.errorEl.createEl('strong', { text: 'Errors:' });
    }
    this.errorEl.createEl('div', { text: `• ${error}` });
  }

  private showErrors(errors: Array<{ ticketKey: string; error: string }>) {
    this.errorEl.style.display = 'block';
    this.errorEl.empty();
    this.errorEl.createEl('strong', { text: `Errors (${errors.length}):` });
    
    const errorList = this.errorEl.createEl('div');
    errors.slice(0, 10).forEach(err => {
      errorList.createEl('div', { text: `• ${err.ticketKey}: ${err.error}` });
    });
    
    if (errors.length > 10) {
      errorList.createEl('div', { text: `... and ${errors.length - 10} more errors` });
    }
  }

  private cancel() {
    if (this.isImporting) {
      this.bulkImportManager.cancelImport();
      this.cancelButton.disabled = true;
    } else {
      this.close();
    }
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}