import { Plugin, PluginSettingTab, Setting, Notice, Modal, App } from 'obsidian';
import { JiraClient } from './jira-bases-adapter/jira-client';
import { JQLQueryEngine } from './enhanced-sync/jql-query-engine';
import { AutoSyncScheduler, AutoSyncConfig } from './enhanced-sync/auto-sync-scheduler';
import { BulkImportManager } from './enhanced-sync/bulk-import-manager';
import { EnhancedSyncDashboard } from './ui/enhanced-dashboard';
import { SimpleNoteService } from './services/simple-note-service';
import { EventBus } from './events/event-bus';
import { PluginRegistry } from './integrations/PluginRegistry';
import { IntegrationBridge } from './integrations/IntegrationBridge';
import { StatusMapping, DEFAULT_STATUS_MAPPING } from './settings/settings-types';
import { initializePARAStructure, checkPARAStructure } from './organization/para-setup';
import { TimeTracker, TimerStatsTracker, TimeTrackingEvents } from './time/time-tracker';
import { parseTimeString, formatTime, validateTimeString } from './time/time-parser';
import { JiraWorklogClient, extractTimeEntriesFromMarkdown, markEntryAsPushed, createConfirmationMessage } from './time/jira-worklog-client';

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
  
  // Status-Based Organization
  enableStatusOrganization?: boolean;
  activeTicketsFolder?: string;
  archivedTicketsFolder?: string;
  archiveByYear?: boolean;
  keepRecentArchive?: boolean;
  recentArchiveDays?: number;
  statusMapping?: StatusMapping;
  
  // NEW: PARA Organization Settings
  usePARAStructure?: boolean;
  projectsFolder?: string;
  areasFolder?: string;
  resourcesFolder?: string;
  archivesFolder?: string;
  
  // NEW: Time Tracking Settings
  timeTrackingEnabled?: boolean;
  confirmBeforePush?: boolean;
  roundToMinutes?: number;
  
  // NEW: Template Settings
  useTemplates?: boolean;
  includeTimeLog?: boolean;
  
  // NEW: Custom Field Settings
  syncCustomFields?: boolean;
  customFieldMappings?: Record<string, string>;
  
  // Plugin Integrations
  enabledIntegrations?: string[];
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
  syncFolder: 'Knowledge/Work',
  
  // Status-Based Organization
  enableStatusOrganization: true,
  activeTicketsFolder: 'Active Tickets',
  archivedTicketsFolder: 'Archived Tickets',
  archiveByYear: true,
  keepRecentArchive: true,
  recentArchiveDays: 30,
  statusMapping: DEFAULT_STATUS_MAPPING,
  
  // NEW: PARA Organization Settings
  usePARAStructure: false,
  projectsFolder: '01_Projects',
  areasFolder: '02_Areas', 
  resourcesFolder: '03_Resources',
  archivesFolder: '04_Archives',
  
  // NEW: Time Tracking Settings
  timeTrackingEnabled: true,
  confirmBeforePush: true,
  roundToMinutes: 5,
  
  // NEW: Template Settings
  useTemplates: true,
  includeTimeLog: true,
  
  // NEW: Custom Field Settings
  syncCustomFields: false,
  customFieldMappings: {},
  
  // Plugin Integrations
  enabledIntegrations: []
};

export default class JiraSyncProPlugin extends Plugin {
  // Initialize settings immediately with defaults to prevent undefined errors
  settings: JiraSyncProSettings = { ...DEFAULT_SETTINGS };
  jiraClient: JiraClient | null = null;
  queryEngine: JQLQueryEngine | null = null;
  scheduler: AutoSyncScheduler | null = null;
  bulkImportManager: BulkImportManager | null = null;
  private eventBus: EventBus | null = null;
  private pluginRegistry: PluginRegistry | null = null;
  private integrationBridge: IntegrationBridge | null = null;
  private initializationPromise: Promise<void> | null = null;
  private isInitialized: boolean = false;
  
  // NEW: Time Tracking Components  
  private timeTracker: TimeTracker | null = null;
  private timerStats: TimerStatsTracker | null = null;
  private jiraWorklogClient: JiraWorklogClient | null = null;

  async onload() {
    console.log('Jira Sync Pro: Starting plugin initialization...');
    
    try {
      // Load settings first - critical for preventing undefined errors
      await this.loadSettings();
      console.log('Jira Sync Pro: Settings loaded successfully');

      // Initialize core components
      this.eventBus = new EventBus();
      this.pluginRegistry = new PluginRegistry(this.app);
      
      // Initialize the Integration Bridge to coordinate plugin communications
      this.integrationBridge = new IntegrationBridge(this);
      await this.integrationBridge.initialize();
      
      console.log('Jira Sync Pro: Event bus, plugin registry, and integration bridge initialized');

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

      // Initialize time tracking if enabled
      if (this.settings.timeTrackingEnabled) {
        this.initializeTimeTracking();
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

    // Clean up time tracking
    if (this.timeTracker) {
      this.timeTracker.destroy();
      this.timeTracker = null;
    }
    this.timerStats = null;

    // Clean up integration bridge first (it manages event bus)
    if (this.integrationBridge) {
      await this.integrationBridge.cleanup();
      this.integrationBridge = null;
    }

    // Clean up event bus
    if (this.eventBus) {
      this.eventBus.removeAllListeners();
      this.eventBus = null;
    }

    // Clean up other resources
    this.jiraClient = null;
    this.queryEngine = null;
    this.bulkImportManager = null;
    this.pluginRegistry = null;
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

    // Plugin bridge commands
    this.addCommand({
      id: 'jira-sync-integration-status',
      name: 'Show plugin integration status',
      callback: () => this.showIntegrationStatus()
    });

    this.addCommand({
      id: 'jira-sync-refresh-integrations',
      name: 'Refresh plugin integrations',
      callback: () => this.refreshIntegrations()
    });

    this.addCommand({
      id: 'jira-sync-test-integrations',
      name: 'Test all enabled integrations',
      callback: () => this.testIntegrations()
    });

    // PARA Organization commands
    this.addCommand({
      id: 'jira-sync-initialize-para',
      name: 'Initialize PARA folder structure',
      callback: () => this.initializePARAStructure()
    });

    this.addCommand({
      id: 'jira-sync-check-para',
      name: 'Check PARA structure status', 
      callback: () => this.checkPARAStructureStatus()
    });

    // Time Tracking commands
    this.addCommand({
      id: 'jira-timer-start',
      name: 'Start timer for current ticket',
      checkCallback: (checking: boolean) => {
        const activeFile = this.app.workspace.getActiveFile();
        if (activeFile?.name.match(/^[A-Z]+-\d+\.md$/)) {
          if (!checking) {
            const ticketKey = activeFile.basename;
            this.startTimerForTicket(ticketKey);
          }
          return true;
        }
        return false;
      }
    });

    this.addCommand({
      id: 'jira-timer-stop',
      name: 'Stop timer',
      callback: () => this.stopTimer()
    });

    this.addCommand({
      id: 'jira-timer-toggle-pause',
      name: 'Pause/Resume timer',
      callback: () => this.toggleTimerPause()
    });

    this.addCommand({
      id: 'jira-timer-status',
      name: 'Show timer status',
      callback: () => this.showTimerStatus()
    });

    // Time Entry Push commands
    this.addCommand({
      id: 'jira-push-time',
      name: 'Push time entries to Jira',
      checkCallback: (checking: boolean) => {
        const activeFile = this.app.workspace.getActiveFile();
        if (activeFile?.name.match(/^[A-Z]+-\d+\.md$/)) {
          if (!checking) {
            const ticketKey = activeFile.basename;
            this.pushTimeEntriesToJira(ticketKey);
          }
          return true;
        }
        return false;
      }
    });

    this.addCommand({
      id: 'jira-test-worklog-connection',
      name: 'Test Jira worklog connection',
      callback: () => this.testWorklogConnection()
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
      
      // Notify integration bridge of sync start
      if (this.integrationBridge) {
        this.integrationBridge.onTicketsSynced(result.issues);
      }
      
      for (const ticket of result.issues) {
        try {
          const noteResult = await noteService.processTicket(ticket, {
            overwriteExisting: true,  // Update existing notes
            organizationStrategy: this.settings.enableStatusOrganization ? 'status-based' : 'by-project',
            preserveLocalNotes: true,  // Preserve local notes section
            // Pass status organization settings
            statusMapping: this.settings.statusMapping,
            activeTicketsFolder: this.settings.activeTicketsFolder,
            archivedTicketsFolder: this.settings.archivedTicketsFolder,
            archiveByYear: this.settings.archiveByYear,
            keepRecentArchive: this.settings.keepRecentArchive,
            recentArchiveDays: this.settings.recentArchiveDays
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

  private async showIntegrationStatus() {
    if (!this.pluginRegistry) {
      new Notice('Plugin registry not initialized');
      return;
    }

    const modal = new Modal(this.app);
    modal.titleEl.setText('Plugin Integration Status');
    
    const contentEl = modal.contentEl;
    contentEl.empty();
    
    const plugins = this.pluginRegistry.getAvailablePlugins();
    
    if (plugins.length === 0) {
      contentEl.createEl('p', { text: 'No compatible plugins found.' });
    } else {
      contentEl.createEl('h3', { text: 'Compatible Plugins' });
      
      for (const plugin of plugins) {
        const pluginEl = contentEl.createDiv({ cls: 'plugin-status-item' });
        pluginEl.style.marginBottom = '15px';
        pluginEl.style.padding = '10px';
        pluginEl.style.border = '1px solid var(--background-modifier-border)';
        pluginEl.style.borderRadius = '5px';
        
        const headerEl = pluginEl.createEl('div');
        headerEl.style.display = 'flex';
        headerEl.style.justifyContent = 'space-between';
        
        headerEl.createEl('strong', { text: plugin.name });
        
        const statusEl = headerEl.createEl('span');
        if (plugin.isEnabled) {
          statusEl.textContent = '✅ Active';
          statusEl.style.color = '#27ae60';
        } else {
          statusEl.textContent = '❌ Inactive';
          statusEl.style.color = '#e74c3c';
        }
        
        const isIntegrated = this.settings.enabledIntegrations?.includes(plugin.id) ?? false;
        pluginEl.createEl('div', {
          text: `Integration: ${isIntegrated ? 'Enabled' : 'Disabled'}`,
          cls: 'plugin-integration'
        }).style.fontSize = '0.9em';
      }
    }
    
    modal.open();
  }

  private async refreshIntegrations() {
    if (!this.pluginRegistry) {
      new Notice('Plugin registry not initialized');
      return;
    }

    try {
      // Refresh the plugin registry
      this.pluginRegistry = new PluginRegistry(this.app);
      
      const availablePlugins = this.pluginRegistry.getAvailablePlugins();
      const count = availablePlugins.filter(p => p.isEnabled).length;
      
      new Notice(`Found ${count} compatible plugin${count !== 1 ? 's' : ''}`);
    } catch (error: any) {
      new Notice(`Failed to refresh integrations: ${error.message}`);
    }
  }

  private async testIntegrations() {
    if (!this.pluginRegistry) {
      new Notice('Plugin registry not initialized');
      return;
    }

    const enabledIntegrations = this.settings.enabledIntegrations || [];
    if (enabledIntegrations.length === 0) {
      new Notice('No integrations enabled. Enable integrations in settings first.');
      return;
    }

    const availablePlugins = this.pluginRegistry.getAvailablePlugins();
    let testedCount = 0;
    let successCount = 0;

    for (const pluginId of enabledIntegrations) {
      const plugin = availablePlugins.find(p => p.id === pluginId);
      if (plugin && plugin.isEnabled) {
        testedCount++;
        // Here you would perform actual integration tests
        // For now, we'll just check if the plugin is active
        if (plugin.hasAPI || plugin.hasIntegration) {
          successCount++;
        }
      }
    }

    if (testedCount === 0) {
      new Notice('No enabled integrations are currently active');
    } else {
      new Notice(`Tested ${testedCount} integration${testedCount !== 1 ? 's' : ''}: ${successCount} working`);
    }
  }

  // PARA Organization Methods
  private async initializePARAStructure(): Promise<void> {
    try {
      new Notice('Initializing PARA folder structure...');
      
      const config = {
        projectsFolder: this.settings.projectsFolder || '01_Projects',
        areasFolder: this.settings.areasFolder || '02_Areas',
        resourcesFolder: this.settings.resourcesFolder || '03_Resources', 
        archivesFolder: this.settings.archivesFolder || '04_Archives'
      };
      
      await initializePARAStructure(this.app.vault, config);
      
      // Enable PARA structure in settings
      this.settings.usePARAStructure = true;
      await this.saveSettings();
      
      new Notice('✅ PARA structure initialized successfully!');
    } catch (error: any) {
      console.error('Failed to initialize PARA structure:', error);
      new Notice(`❌ Failed to initialize PARA structure: ${error.message}`);
    }
  }

  private checkPARAStructureStatus(): void {
    try {
      const config = {
        projectsFolder: this.settings.projectsFolder || '01_Projects',
        areasFolder: this.settings.areasFolder || '02_Areas',
        resourcesFolder: this.settings.resourcesFolder || '03_Resources',
        archivesFolder: this.settings.archivesFolder || '04_Archives'
      };
      
      const exists = checkPARAStructure(this.app.vault, config);
      
      if (exists) {
        new Notice('✅ PARA structure is properly set up');
      } else {
        new Notice('❌ PARA structure incomplete. Run "Initialize PARA folder structure" command.');
      }
    } catch (error: any) {
      console.error('Error checking PARA structure:', error);
      new Notice(`❌ Error checking PARA structure: ${error.message}`);
    }
  }

  // Time Tracking Methods
  initializeTimeTracking(): void {
    if (this.timeTracker) {
      console.log('Time tracker already initialized');
      return;
    }

    try {
      const events: TimeTrackingEvents = {
        onTimerStart: (ticketKey: string) => {
          console.log(`Timer started for ${ticketKey}`);
        },
        onTimerStop: async (ticketKey: string, elapsed: number, entry: string) => {
          console.log(`Timer stopped for ${ticketKey}, elapsed: ${elapsed}ms`);
          
          // Record session in stats
          if (this.timerStats) {
            await this.timerStats.recordSession(ticketKey, elapsed);
          }
          
          // TODO: Add time entry to ticket file (will be implemented later)
        },
        onTimerPause: (ticketKey: string, elapsed: number) => {
          console.log(`Timer paused for ${ticketKey}, elapsed: ${elapsed}ms`);
        },
        onTimerResume: (ticketKey: string) => {
          console.log(`Timer resumed for ${ticketKey}`);
        }
      };

      this.timeTracker = new TimeTracker(this, events);
      this.timerStats = new TimerStatsTracker(this);
      
      // Initialize Jira worklog client
      this.jiraWorklogClient = new JiraWorklogClient({
        jiraUrl: this.settings.jiraUrl,
        jiraUsername: this.settings.jiraUsername,
        jiraApiToken: this.settings.jiraApiToken,
        confirmBeforePush: this.settings.confirmBeforePush,
        roundToMinutes: this.settings.roundToMinutes
      });
      
      console.log('Jira Sync Pro: Time tracking initialized');
    } catch (error) {
      console.error('Failed to initialize time tracking:', error);
      new Notice('❌ Failed to initialize time tracking');
    }
  }

  disableTimeTracking(): void {
    if (this.timeTracker) {
      this.timeTracker.destroy();
      this.timeTracker = null;
    }
    this.timerStats = null;
    this.jiraWorklogClient = null;
    console.log('Jira Sync Pro: Time tracking disabled');
  }

  private startTimerForTicket(ticketKey: string): void {
    if (!this.timeTracker) {
      new Notice('Time tracking is not enabled. Enable it in settings first.');
      return;
    }

    this.timeTracker.startTimer(ticketKey);
  }

  private stopTimer(): void {
    if (!this.timeTracker) {
      new Notice('Time tracking is not enabled');
      return;
    }

    const entry = this.timeTracker.stopTimer();
    if (entry) {
      // TODO: Add entry to current ticket file (will be implemented later)
    }
  }

  private toggleTimerPause(): void {
    if (!this.timeTracker) {
      new Notice('Time tracking is not enabled');
      return;
    }

    this.timeTracker.togglePause();
  }

  private showTimerStatus(): void {
    if (!this.timeTracker) {
      new Notice('Time tracking is not enabled');
      return;
    }

    const timer = this.timeTracker.getCurrentTimer();
    if (!timer) {
      new Notice('No active timer');
      return;
    }

    const elapsed = this.timeTracker.getCurrentElapsed();
    const formatted = this.timeTracker.formatTime(elapsed);
    const status = timer.isPaused ? 'Paused' : 'Running';
    
    new Notice(`Timer: ${timer.ticketKey}\nStatus: ${status}\nElapsed: ${formatted}`, 4000);
  }

  // Jira Worklog Methods
  private async pushTimeEntriesToJira(ticketKey: string): Promise<void> {
    if (!this.jiraWorklogClient) {
      new Notice('Time tracking is not enabled');
      return;
    }

    if (!this.hasValidCredentials()) {
      new Notice('Please configure your Jira credentials first');
      return;
    }

    try {
      const activeFile = this.app.workspace.getActiveFile();
      if (!activeFile) {
        new Notice('No active file');
        return;
      }

      // Read file content
      const content = await this.app.vault.read(activeFile);
      
      // Extract unpushed time entries
      const entries = extractTimeEntriesFromMarkdown(content, true);
      
      if (entries.length === 0) {
        new Notice('No unpushed time entries found');
        return;
      }

      // Show confirmation if enabled
      if (this.settings.confirmBeforePush) {
        const confirmed = await this.showPushConfirmation(ticketKey, entries);
        if (!confirmed) {
          new Notice('Time push cancelled');
          return;
        }
      }

      // Push entries to Jira
      const result = await this.jiraWorklogClient.pushTimeEntries(ticketKey, entries);
      
      // Mark successful entries as pushed
      if (result.successCount > 0) {
        let updatedContent = content;
        
        // Mark each successful entry as pushed
        result.results.forEach(pushResult => {
          if (pushResult.success && pushResult.entry.line) {
            updatedContent = markEntryAsPushed(updatedContent, pushResult.entry.line);
          }
        });
        
        // Save updated content
        await this.app.vault.modify(activeFile, updatedContent);
      }

      // Show detailed results if there were failures
      if (result.failureCount > 0) {
        console.error('Some time entries failed to push:', result.results);
        
        const failedEntries = result.results
          .filter(r => !r.success)
          .map(r => `- ${r.entry.time}: ${r.entry.description} (${r.error})`)
          .join('\n');
          
        new Notice(`Failed to push ${result.failureCount} entries:\n${failedEntries}`, 8000);
      }

    } catch (error: any) {
      console.error('Failed to push time entries:', error);
      new Notice(`❌ Failed to push time entries: ${error.message}`);
    }
  }

  private async testWorklogConnection(): Promise<void> {
    if (!this.jiraWorklogClient) {
      new Notice('Time tracking is not enabled');
      return;
    }

    if (!this.hasValidCredentials()) {
      new Notice('Please configure your Jira credentials first');
      return;
    }

    try {
      new Notice('Testing Jira worklog connection...');
      
      // Get ticket key from current file if available
      const activeFile = this.app.workspace.getActiveFile();
      const testTicketKey = activeFile?.name.match(/^([A-Z]+-\d+)\.md$/)?.[1];
      
      const result = await this.jiraWorklogClient.testConnection(testTicketKey);
      
      if (result.success) {
        new Notice(`✅ ${result.message}`, 5000);
      } else {
        new Notice(`❌ ${result.message}`, 6000);
      }
      
    } catch (error: any) {
      console.error('Worklog connection test failed:', error);
      new Notice(`❌ Connection test failed: ${error.message}`);
    }
  }

  private async showPushConfirmation(ticketKey: string, entries: any[]): Promise<boolean> {
    return new Promise((resolve) => {
      const modal = new Modal(this.app);
      modal.titleEl.setText('Confirm Time Push');
      
      const { contentEl } = modal;
      contentEl.empty();
      
      // Create confirmation message
      const message = createConfirmationMessage(ticketKey, entries);
      contentEl.createEl('pre', { text: message, cls: 'time-push-confirmation' });
      
      // Buttons
      const buttonContainer = contentEl.createDiv({ cls: 'modal-button-container' });
      
      const pushButton = buttonContainer.createEl('button', { text: 'Push to Jira' });
      pushButton.addClass('mod-cta');
      pushButton.onclick = () => {
        modal.close();
        resolve(true);
      };
      
      const cancelButton = buttonContainer.createEl('button', { text: 'Cancel' });
      cancelButton.onclick = () => {
        modal.close();
        resolve(false);
      };
      
      modal.open();
    });
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

    // Status-Based Organization
    containerEl.createEl('h3', { text: 'Status-Based Organization' });

    new Setting(containerEl)
      .setName('Enable Status Organization')
      .setDesc('Automatically organize tickets based on their status')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.enableStatusOrganization ?? true)
        .onChange(async (value) => {
          this.plugin.settings.enableStatusOrganization = value;
          await this.plugin.saveSettings();
          // Refresh the display to show/hide related settings
          this.display();
        }));

    if (this.plugin.settings.enableStatusOrganization) {
      new Setting(containerEl)
        .setName('Active Tickets Folder')
        .setDesc('Folder name for active tickets (relative to sync folder)')
        .addText(text => text
          .setPlaceholder('Active Tickets')
          .setValue(this.plugin.settings.activeTicketsFolder ?? 'Active Tickets')
          .onChange(async (value) => {
            this.plugin.settings.activeTicketsFolder = value;
            await this.plugin.saveSettings();
          }));

      new Setting(containerEl)
        .setName('Archived Tickets Folder')
        .setDesc('Folder name for archived tickets (relative to sync folder)')
        .addText(text => text
          .setPlaceholder('Archived Tickets')
          .setValue(this.plugin.settings.archivedTicketsFolder ?? 'Archived Tickets')
          .onChange(async (value) => {
            this.plugin.settings.archivedTicketsFolder = value;
            await this.plugin.saveSettings();
          }));

      new Setting(containerEl)
        .setName('Archive by Year')
        .setDesc('Organize archived tickets into year-based subfolders')
        .addToggle(toggle => toggle
          .setValue(this.plugin.settings.archiveByYear ?? true)
          .onChange(async (value) => {
            this.plugin.settings.archiveByYear = value;
            await this.plugin.saveSettings();
            this.display();
          }));

      new Setting(containerEl)
        .setName('Keep Recent Archive')
        .setDesc('Keep recently closed tickets in a separate "Recent" folder')
        .addToggle(toggle => toggle
          .setValue(this.plugin.settings.keepRecentArchive ?? true)
          .onChange(async (value) => {
            this.plugin.settings.keepRecentArchive = value;
            await this.plugin.saveSettings();
            this.display();
          }));

      if (this.plugin.settings.keepRecentArchive) {
        new Setting(containerEl)
          .setName('Recent Archive Days')
          .setDesc('Number of days to keep tickets in the Recent folder (1-365)')
          .addText(text => text
            .setPlaceholder('30')
            .setValue(String(this.plugin.settings.recentArchiveDays ?? 30))
            .onChange(async (value) => {
              const days = parseInt(value);
              if (!isNaN(days) && days >= 1 && days <= 365) {
                this.plugin.settings.recentArchiveDays = days;
                await this.plugin.saveSettings();
              } else {
                text.inputEl.style.borderColor = '#e74c3c';
                new Notice('Please enter a value between 1 and 365');
              }
            }));
      }

      // Status Mapping Configuration
      new Setting(containerEl)
        .setName('Status Mapping')
        .setDesc('Configure which statuses are considered active vs archived');

      // Active statuses
      new Setting(containerEl)
        .setName('Active Statuses')
        .setDesc('Comma-separated list of statuses that should go to Active folder')
        .addTextArea(text => {
          text.inputEl.rows = 2;
          text.setPlaceholder('Open, In Progress, In Review, Blocked...');
          const activeStatuses = this.plugin.settings.statusMapping?.active || DEFAULT_STATUS_MAPPING.active;
          text.setValue(activeStatuses.join(', '));
          text.onChange(async (value) => {
            if (!this.plugin.settings.statusMapping) {
              this.plugin.settings.statusMapping = { ...DEFAULT_STATUS_MAPPING };
            }
            this.plugin.settings.statusMapping.active = value.split(',').map(s => s.trim()).filter(s => s);
            await this.plugin.saveSettings();
          });
        });

      // Archived statuses
      new Setting(containerEl)
        .setName('Archived Statuses')
        .setDesc('Comma-separated list of statuses that should go to Archived folder')
        .addTextArea(text => {
          text.inputEl.rows = 2;
          text.setPlaceholder('Done, Closed, Resolved, Cancelled...');
          const archivedStatuses = this.plugin.settings.statusMapping?.archived || DEFAULT_STATUS_MAPPING.archived;
          text.setValue(archivedStatuses.join(', '));
          text.onChange(async (value) => {
            if (!this.plugin.settings.statusMapping) {
              this.plugin.settings.statusMapping = { ...DEFAULT_STATUS_MAPPING };
            }
            this.plugin.settings.statusMapping.archived = value.split(',').map(s => s.trim()).filter(s => s);
            await this.plugin.saveSettings();
          });
        });
    }

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

    // Plugin Integrations
    containerEl.createEl('h3', { text: 'Plugin Integrations' });
    
    // Get available integrations
    const availablePlugins = this.plugin.pluginRegistry ? 
      this.plugin.pluginRegistry.getAvailablePlugins() : [];
    
    if (availablePlugins.length === 0) {
      containerEl.createEl('p', { 
        text: 'No compatible plugins detected. Install supported plugins to enable integrations.',
        cls: 'setting-item-description'
      });
    } else {
      containerEl.createEl('p', { 
        text: 'Enable integrations with compatible Obsidian plugins for enhanced functionality.',
        cls: 'setting-item-description'
      });
      
      // List each available plugin with toggle
      for (const pluginInfo of availablePlugins) {
        const isEnabled = this.plugin.settings.enabledIntegrations?.includes(pluginInfo.id) ?? false;
        
        new Setting(containerEl)
          .setName(pluginInfo.name)
          .setDesc(`${pluginInfo.isEnabled ? '✅ Installed' : '❌ Not installed'} • Version: ${pluginInfo.version || 'Unknown'}`)
          .addToggle(toggle => toggle
            .setValue(isEnabled && pluginInfo.isEnabled)
            .setDisabled(!pluginInfo.isEnabled)
            .onChange(async (value) => {
              if (!this.plugin.settings.enabledIntegrations) {
                this.plugin.settings.enabledIntegrations = [];
              }
              
              if (value) {
                if (!this.plugin.settings.enabledIntegrations.includes(pluginInfo.id)) {
                  this.plugin.settings.enabledIntegrations.push(pluginInfo.id);
                }
              } else {
                const index = this.plugin.settings.enabledIntegrations.indexOf(pluginInfo.id);
                if (index > -1) {
                  this.plugin.settings.enabledIntegrations.splice(index, 1);
                }
              }
              
              await this.plugin.saveSettings();
              new Notice(`${pluginInfo.name} integration ${value ? 'enabled' : 'disabled'}`);
            }));
        
        // Show capabilities if available
        if (pluginInfo.capabilities && pluginInfo.capabilities.length > 0) {
          const capabilitiesEl = containerEl.createEl('div', {
            cls: 'setting-item-description',
            attr: { style: 'margin-left: 20px; font-size: 0.9em;' }
          });
          capabilitiesEl.createEl('span', { 
            text: `Capabilities: ${pluginInfo.capabilities.join(', ')}`
          });
        }
      }
    }
    
    // Integration status command
    new Setting(containerEl)
      .setName('Check Integration Status')
      .setDesc('View detailed status of all plugin integrations')
      .addButton(button => button
        .setButtonText('Check Status')
        .onClick(async () => {
          await this.checkIntegrationStatus();
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

  private async checkIntegrationStatus(): Promise<void> {
    if (!this.plugin.pluginRegistry) {
      new Notice('Plugin registry not initialized');
      return;
    }

    const modal = new Modal(this.app);
    modal.titleEl.setText('Plugin Integration Status');
    
    const contentEl = modal.contentEl;
    contentEl.empty();
    
    const plugins = this.plugin.pluginRegistry.getAvailablePlugins();
    
    if (plugins.length === 0) {
      contentEl.createEl('p', { text: 'No compatible plugins found.' });
    } else {
      contentEl.createEl('h3', { text: 'Compatible Plugins' });
      
      for (const plugin of plugins) {
        const pluginEl = contentEl.createDiv({ cls: 'plugin-status-item' });
        pluginEl.style.marginBottom = '15px';
        pluginEl.style.padding = '10px';
        pluginEl.style.border = '1px solid var(--background-modifier-border)';
        pluginEl.style.borderRadius = '5px';
        
        // Plugin name and status
        const headerEl = pluginEl.createEl('div', { cls: 'plugin-header' });
        headerEl.style.display = 'flex';
        headerEl.style.justifyContent = 'space-between';
        headerEl.style.marginBottom = '5px';
        
        headerEl.createEl('strong', { text: plugin.name });
        
        const statusEl = headerEl.createEl('span');
        if (plugin.isEnabled) {
          statusEl.textContent = '✅ Active';
          statusEl.style.color = '#27ae60';
        } else {
          statusEl.textContent = '❌ Inactive';
          statusEl.style.color = '#e74c3c';
        }
        
        // Plugin details
        if (plugin.version) {
          pluginEl.createEl('div', { 
            text: `Version: ${plugin.version}`,
            cls: 'plugin-version'
          }).style.fontSize = '0.9em';
        }
        
        // Integration status
        const isIntegrated = this.plugin.settings.enabledIntegrations?.includes(plugin.id) ?? false;
        const integrationEl = pluginEl.createEl('div', {
          text: `Integration: ${isIntegrated ? 'Enabled' : 'Disabled'}`,
          cls: 'plugin-integration'
        });
        integrationEl.style.fontSize = '0.9em';
        integrationEl.style.color = isIntegrated ? '#27ae60' : '#95a5a6';
        
        // Capabilities
        if (plugin.capabilities && plugin.capabilities.length > 0) {
          const capEl = pluginEl.createEl('div', { cls: 'plugin-capabilities' });
          capEl.style.fontSize = '0.85em';
          capEl.style.marginTop = '5px';
          capEl.createEl('em', { text: `Capabilities: ${plugin.capabilities.join(', ')}` });
        }
      }
    }
    
    // Add close button
    const buttonDiv = contentEl.createDiv({ cls: 'modal-button-container' });
    buttonDiv.style.marginTop = '20px';
    buttonDiv.style.textAlign = 'center';
    
    const closeButton = buttonDiv.createEl('button', { text: 'Close' });
    closeButton.onclick = () => modal.close();
    
    modal.open();
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