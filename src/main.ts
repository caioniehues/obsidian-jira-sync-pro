import { Plugin, PluginSettingTab, Setting, Notice, Modal, App } from 'obsidian';
import { JiraClient } from './jira-bases-adapter/jira-client';
import { JQLQueryEngine } from './enhanced-sync/jql-query-engine';
import { AutoSyncScheduler, AutoSyncConfig } from './enhanced-sync/auto-sync-scheduler';
import { BulkImportManager } from './enhanced-sync/bulk-import-manager';
import { EnhancedSyncDashboard } from './ui/enhanced-dashboard';

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
  settings: JiraSyncProSettings = DEFAULT_SETTINGS;
  jiraClient: JiraClient | null = null;
  queryEngine: JQLQueryEngine | null = null;
  scheduler: AutoSyncScheduler | null = null;
  bulkImportManager: BulkImportManager | null = null;

  async onload() {
    await this.loadSettings();

    // Initialize Jira client and query engine if configured
    if (this.settings.jiraUrl && this.settings.jiraApiToken) {
      this.initializeJiraComponents();
    }

    // Add settings tab
    this.addSettingTab(new JiraSyncProSettingTab(this.app, this));

    // Register commands
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

    // Start auto-sync if enabled
    if (this.settings.autoSyncEnabled && this.scheduler) {
      await this.scheduler.start();
      new Notice('Jira Sync Pro: Auto-sync started');
    }
  }

  async onunload() {
    // Stop scheduler if running
    if (this.scheduler) {
      this.scheduler.stop();
    }
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
    
    // Reinitialize components if settings changed
    if (this.settings.jiraUrl && this.settings.jiraApiToken) {
      this.initializeJiraComponents();
    }
  }

  private initializeJiraComponents() {
    // Initialize Jira client
    this.jiraClient = new JiraClient();
    this.jiraClient.configure({
      baseUrl: this.settings.jiraUrl,
      email: this.settings.jiraUsername,
      apiToken: this.settings.jiraApiToken
    });

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
  }

  private async performSync(isManual: boolean) {
    if (!this.queryEngine) {
      new Notice('Jira Sync Pro: Please configure Jira settings first');
      return;
    }

    try {
      new Notice(`Jira Sync Pro: ${isManual ? 'Manual' : 'Auto'} sync started...`);
      
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

      // TODO: Process the tickets and create/update notes
      console.log(`Synced ${result.issues.length} tickets`);
      
    } catch (error) {
      console.error('Sync failed:', error);
      new Notice(`Jira Sync Pro: Sync failed - ${error.message}`);
    }
  }

  private async performManualSync() {
    if (this.scheduler) {
      await this.scheduler.triggerManualSync();
    } else {
      await this.performSync(true);
    }
  }

  private async performBulkImport() {
    if (!this.bulkImportManager) {
      new Notice('Jira Sync Pro: Please configure Jira settings first');
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
      new Notice('Jira Sync Pro: Scheduler not initialized');
    }
  }

  private openSyncDashboard() {
    // Use the enhanced dashboard with shadcn-inspired UI components
    const dashboard = new EnhancedSyncDashboard(
      this.app,
      this.scheduler,
      this.queryEngine
    );
    dashboard.open();
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