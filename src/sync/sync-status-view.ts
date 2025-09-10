import { ItemView, WorkspaceLeaf, Plugin, Setting, Notice } from 'obsidian';
import { AutoSyncScheduler } from '../enhanced-sync/auto-sync-scheduler';
import { BulkImportManager, BulkImportResult } from '../enhanced-sync/bulk-import-manager';
import { JQLQueryEngine } from '../enhanced-sync/jql-query-engine';
import { SyncPhase, SyncError as TypedSyncError, ErrorCategory } from '../types/sync-types';

/**
 * View identifier for the sync status dashboard
 */
export const SYNC_STATUS_VIEW_TYPE = 'jira-sync-status';

/**
 * Extended sync statistics with additional dashboard metrics
 */
export interface DashboardSyncStatistics {
  totalSyncs: number;
  successfulSyncs: number;
  failedSyncs: number;
  lastSyncTime: Date | null;
  lastSyncDuration: number;
  averageSyncDuration: number;
  totalTicketsSynced: number;
  totalTicketsCreated: number;
  totalTicketsUpdated: number;
  currentStatus: 'idle' | 'syncing' | 'error' | 'scheduled';
  nextSyncTime: Date | null;
  errors: DashboardSyncError[];
  recentSyncs: SyncHistoryEntry[];
  activeOperation: ActiveOperation | null;
}

/**
 * Dashboard-specific error structure
 */
export interface DashboardSyncError {
  timestamp: Date;
  message: string;
  ticketKey?: string;
  type: ErrorCategory;
  retryable: boolean;
  phase?: SyncPhase;
  resolved?: boolean;
}

/**
 * Sync history entry for dashboard display
 */
export interface SyncHistoryEntry {
  timestamp: Date;
  duration: number;
  ticketsProcessed: number;
  created: number;
  updated: number;
  failed: number;
  success: boolean;
  trigger: 'manual' | 'scheduled' | 'bulk';
  phase: SyncPhase;
}

/**
 * Active operation tracking
 */
export interface ActiveOperation {
  type: 'sync' | 'bulk-import';
  phase: SyncPhase;
  startTime: Date;
  current: number;
  total: number;
  ticketsPerSecond?: number;
  estimatedTimeRemaining?: number;
}

/**
 * Dashboard configuration options
 */
export interface DashboardOptions {
  autoRefresh: boolean;
  refreshInterval: number; // milliseconds
  maxHistoryEntries: number;
  maxErrorEntries: number;
  showAdvancedMetrics: boolean;
}

/**
 * Sync Status View - Obsidian view for displaying sync dashboard
 * 
 * This view provides real-time monitoring of sync operations, statistics,
 * and controls for managing sync operations within the Obsidian workspace.
 */
export class SyncStatusView extends ItemView {
  private plugin: Plugin;
  private scheduler: AutoSyncScheduler | null;
  private bulkImportManager: BulkImportManager | null;
  private queryEngine: JQLQueryEngine | null;
  
  // Dashboard state
  private statistics: DashboardSyncStatistics;
  private options: DashboardOptions;
  private refreshInterval: NodeJS.Timeout | null = null;
  private isVisible: boolean = false;
  
  // UI elements
  private headerContainer: HTMLElement;
  private statusContainer: HTMLElement;
  private statisticsContainer: HTMLElement;
  private progressContainer: HTMLElement;
  private historyContainer: HTMLElement;
  private errorContainer: HTMLElement;
  private controlsContainer: HTMLElement;

  constructor(
    leaf: WorkspaceLeaf,
    plugin: Plugin,
    scheduler?: AutoSyncScheduler,
    bulkImportManager?: BulkImportManager,
    queryEngine?: JQLQueryEngine
  ) {
    super(leaf);
    this.plugin = plugin;
    this.scheduler = scheduler || null;
    this.bulkImportManager = bulkImportManager || null;
    this.queryEngine = queryEngine || null;
    
    this.options = {
      autoRefresh: true,
      refreshInterval: 3000, // 3 seconds
      maxHistoryEntries: 20,
      maxErrorEntries: 50,
      showAdvancedMetrics: true
    };
    
    this.statistics = this.getInitialStatistics();
  }

  getViewType(): string {
    return SYNC_STATUS_VIEW_TYPE;
  }

  getDisplayText(): string {
    return 'Jira Sync Status';
  }

  getIcon(): string {
    return 'activity';
  }

  async onOpen(): Promise<void> {
    this.isVisible = true;
    const container = this.containerEl.children[1];
    container.empty();
    container.addClass('jira-sync-status-view');

    this.createLayout(container);
    await this.loadStatistics();
    this.renderDashboard();
    
    if (this.options.autoRefresh) {
      this.startAutoRefresh();
    }
    
    this.addStyles();
  }

  async onClose(): Promise<void> {
    this.isVisible = false;
    this.stopAutoRefresh();
  }

  /**
   * Updates the dashboard with new component instances
   */
  updateComponents(
    scheduler?: AutoSyncScheduler,
    bulkImportManager?: BulkImportManager,
    queryEngine?: JQLQueryEngine
  ): void {
    this.scheduler = scheduler || this.scheduler;
    this.bulkImportManager = bulkImportManager || this.bulkImportManager;
    this.queryEngine = queryEngine || this.queryEngine;
    
    if (this.isVisible) {
      this.refreshDashboard();
    }
  }

  /**
   * Creates the dashboard layout structure
   */
  private createLayout(container: Element): void {
    // Header with title and controls
    this.headerContainer = container.createDiv({ cls: 'sync-header' });
    
    // Current status section
    this.statusContainer = container.createDiv({ cls: 'sync-status' });
    
    // Statistics grid
    this.statisticsContainer = container.createDiv({ cls: 'sync-statistics' });
    
    // Progress section for active operations
    this.progressContainer = container.createDiv({ cls: 'sync-progress' });
    
    // Sync history
    this.historyContainer = container.createDiv({ cls: 'sync-history' });
    
    // Error log
    this.errorContainer = container.createDiv({ cls: 'sync-errors' });
    
    // Control buttons
    this.controlsContainer = container.createDiv({ cls: 'sync-controls' });
  }

  /**
   * Renders the complete dashboard
   */
  private renderDashboard(): void {
    this.renderHeader();
    this.renderCurrentStatus();
    this.renderStatistics();
    this.renderProgress();
    this.renderHistory();
    this.renderErrors();
    this.renderControls();
  }

  /**
   * Renders the header section
   */
  private renderHeader(): void {
    this.headerContainer.empty();
    
    const titleContainer = this.headerContainer.createDiv({ cls: 'header-title' });
    titleContainer.createEl('h2', { text: 'Jira Sync Status', cls: 'dashboard-title' });
    
    const lastUpdate = this.headerContainer.createDiv({ cls: 'last-update' });
    lastUpdate.textContent = `Last updated: ${new Date().toLocaleTimeString()}`;
    
    // Refresh toggle
    const toggleContainer = this.headerContainer.createDiv({ cls: 'refresh-toggle' });
    const toggle = new Setting(toggleContainer)
      .setName('Auto-refresh')
      .setDesc('Automatically refresh every 3 seconds')
      .addToggle(toggle => toggle
        .setValue(this.options.autoRefresh)
        .onChange(async (value) => {
          this.options.autoRefresh = value;
          if (value) {
            this.startAutoRefresh();
          } else {
            this.stopAutoRefresh();
          }
        }));
  }

  /**
   * Renders the current status section
   */
  private renderCurrentStatus(): void {
    this.statusContainer.empty();
    
    const statusCard = this.statusContainer.createDiv({ cls: 'status-card' });
    
    // Status indicator
    const statusIndicator = statusCard.createDiv({ cls: 'status-indicator' });
    const statusBadge = statusIndicator.createDiv({ 
      cls: `status-badge ${this.statistics.currentStatus}` 
    });
    
    statusBadge.textContent = this.getStatusText(this.statistics.currentStatus);
    
    // Status details
    const statusDetails = statusCard.createDiv({ cls: 'status-details' });
    
    if (this.statistics.activeOperation) {
      const op = this.statistics.activeOperation;
      statusDetails.createEl('div', { 
        text: `${op.type.replace('-', ' ').toUpperCase()}: ${op.phase}`,
        cls: 'operation-type'
      });
      
      const progress = statusDetails.createDiv({ cls: 'operation-progress' });
      progress.createEl('span', { text: `${op.current}/${op.total} items` });
      
      if (op.estimatedTimeRemaining) {
        progress.createEl('span', { 
          text: ` • ETA: ${this.formatDuration(op.estimatedTimeRemaining)}`,
          cls: 'eta' 
        });
      }
    } else {
      if (this.statistics.lastSyncTime) {
        statusDetails.createEl('div', { 
          text: `Last sync: ${this.formatRelativeTime(this.statistics.lastSyncTime)}`,
          cls: 'last-sync'
        });
      }
      
      if (this.statistics.nextSyncTime) {
        statusDetails.createEl('div', { 
          text: `Next sync: ${this.formatRelativeTime(this.statistics.nextSyncTime)}`,
          cls: 'next-sync'
        });
      }
    }
  }

  /**
   * Renders the statistics grid
   */
  private renderStatistics(): void {
    this.statisticsContainer.empty();
    
    const statsTitle = this.statisticsContainer.createEl('h3', { text: 'Sync Statistics' });
    const statsGrid = this.statisticsContainer.createDiv({ cls: 'stats-grid' });
    
    // Create stat cards
    this.createStatCard(statsGrid, '🔄', 'Total Syncs', this.statistics.totalSyncs.toString());
    
    const successRate = this.statistics.totalSyncs > 0
      ? Math.round((this.statistics.successfulSyncs / this.statistics.totalSyncs) * 100)
      : 0;
    this.createStatCard(statsGrid, '✅', 'Success Rate', `${successRate}%`);
    
    this.createStatCard(statsGrid, '🎫', 'Tickets Synced', this.statistics.totalTicketsSynced.toString());
    this.createStatCard(statsGrid, '📥', 'Created', this.statistics.totalTicketsCreated.toString());
    this.createStatCard(statsGrid, '📝', 'Updated', this.statistics.totalTicketsUpdated.toString());
    
    const avgDuration = this.formatDuration(this.statistics.averageSyncDuration);
    this.createStatCard(statsGrid, '⏱️', 'Avg Duration', avgDuration);
    
    if (this.statistics.failedSyncs > 0) {
      this.createStatCard(statsGrid, '❌', 'Failed Syncs', this.statistics.failedSyncs.toString());
    }
    
    // Advanced metrics if enabled
    if (this.options.showAdvancedMetrics && this.statistics.activeOperation) {
      const op = this.statistics.activeOperation;
      if (op.ticketsPerSecond) {
        this.createStatCard(statsGrid, '⚡', 'Rate', `${op.ticketsPerSecond.toFixed(1)}/s`);
      }
    }
  }

  /**
   * Creates a statistics card
   */
  private createStatCard(container: HTMLElement, emoji: string, label: string, value: string): void {
    const card = container.createDiv({ cls: 'stat-card' });
    card.createEl('div', { text: emoji, cls: 'stat-emoji' });
    card.createEl('div', { text: label, cls: 'stat-label' });
    card.createEl('div', { text: value, cls: 'stat-value' });
  }

  /**
   * Renders the progress section
   */
  private renderProgress(): void {
    this.progressContainer.empty();
    
    if (!this.statistics.activeOperation) {
      this.progressContainer.style.display = 'none';
      return;
    }
    
    this.progressContainer.style.display = 'block';
    this.progressContainer.createEl('h3', { text: 'Active Operation' });
    
    const op = this.statistics.activeOperation;
    const progressInfo = this.progressContainer.createDiv({ cls: 'progress-info' });
    
    progressInfo.createEl('div', { 
      text: `${op.type.replace('-', ' ').toUpperCase()}: ${op.phase}`,
      cls: 'progress-title'
    });
    
    // Progress bar
    const progressBar = this.progressContainer.createDiv({ cls: 'progress-bar' });
    const progressFill = progressBar.createDiv({ cls: 'progress-fill' });
    const percentage = op.total > 0 ? (op.current / op.total) * 100 : 0;
    progressFill.style.width = `${percentage}%`;
    
    // Progress text
    const progressText = this.progressContainer.createDiv({ cls: 'progress-text' });
    progressText.createEl('span', { text: `${op.current}/${op.total} items (${percentage.toFixed(1)}%)` });
    
    if (op.ticketsPerSecond) {
      progressText.createEl('span', { text: ` • ${op.ticketsPerSecond.toFixed(1)} items/sec` });
    }
    
    const elapsed = Date.now() - op.startTime.getTime();
    progressText.createEl('div', { 
      text: `Elapsed: ${this.formatDuration(elapsed)}`,
      cls: 'elapsed-time'
    });
  }

  /**
   * Renders the sync history section
   */
  private renderHistory(): void {
    this.historyContainer.empty();
    
    const historyTitle = this.historyContainer.createEl('h3', { text: 'Recent Activity' });
    
    if (this.statistics.recentSyncs.length === 0) {
      this.historyContainer.createEl('div', { 
        text: 'No sync history available',
        cls: 'empty-message'
      });
      return;
    }
    
    const historyList = this.historyContainer.createDiv({ cls: 'history-list' });
    
    const recentSyncs = this.statistics.recentSyncs
      .slice(0, this.options.maxHistoryEntries)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    
    recentSyncs.forEach(entry => {
      const historyItem = historyList.createDiv({ cls: 'history-item' });
      
      // Status indicator
      const statusIcon = historyItem.createDiv({ 
        cls: `history-status ${entry.success ? 'success' : 'error'}` 
      });
      statusIcon.textContent = entry.success ? '✅' : '❌';
      
      // Entry details
      const entryDetails = historyItem.createDiv({ cls: 'history-details' });
      
      const entryHeader = entryDetails.createDiv({ cls: 'history-header' });
      entryHeader.createEl('span', { 
        text: this.formatDateTime(entry.timestamp),
        cls: 'history-time'
      });
      entryHeader.createEl('span', { 
        text: entry.trigger.toUpperCase(),
        cls: 'history-trigger'
      });
      
      const entryStats = entryDetails.createDiv({ cls: 'history-stats' });
      entryStats.textContent = `${entry.ticketsProcessed} items, ${this.formatDuration(entry.duration)}`;
      
      if (entry.created > 0 || entry.updated > 0) {
        const changes = entryStats.createDiv({ cls: 'history-changes' });
        if (entry.created > 0) changes.createEl('span', { text: `+${entry.created}` });
        if (entry.updated > 0) changes.createEl('span', { text: `~${entry.updated}` });
      }
    });
  }

  /**
   * Renders the error log section
   */
  private renderErrors(): void {
    this.errorContainer.empty();
    
    const errorTitle = this.errorContainer.createEl('h3', { text: 'Error Log' });
    
    if (this.statistics.errors.length === 0) {
      this.errorContainer.createEl('div', { 
        text: '✅ No errors recorded',
        cls: 'empty-message success'
      });
      return;
    }
    
    // Error summary
    const errorSummary = this.errorContainer.createDiv({ cls: 'error-summary' });
    const activeErrors = this.statistics.errors.filter(e => !e.resolved);
    
    if (activeErrors.length > 0) {
      errorSummary.createEl('div', { 
        text: `${activeErrors.length} active errors`,
        cls: 'error-count active'
      });
    }
    
    // Error list
    const errorList = this.errorContainer.createDiv({ cls: 'error-list' });
    
    const recentErrors = this.statistics.errors
      .slice(0, this.options.maxErrorEntries)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    
    recentErrors.forEach(error => {
      const errorItem = errorList.createDiv({ 
        cls: `error-item ${error.resolved ? 'resolved' : 'active'}` 
      });
      
      // Error header
      const errorHeader = errorItem.createDiv({ cls: 'error-header' });
      errorHeader.createEl('span', { 
        text: this.formatDateTime(error.timestamp),
        cls: 'error-time'
      });
      errorHeader.createEl('span', { 
        text: error.type,
        cls: `error-type ${error.type.toLowerCase()}`
      });
      
      if (error.retryable && !error.resolved) {
        errorHeader.createEl('span', { 
          text: 'Retryable',
          cls: 'error-retryable'
        });
      }
      
      // Error message
      errorItem.createEl('div', { 
        text: error.message,
        cls: 'error-message'
      });
      
      if (error.ticketKey) {
        errorItem.createEl('div', { 
          text: `Ticket: ${error.ticketKey}`,
          cls: 'error-ticket'
        });
      }
    });
  }

  /**
   * Renders the control buttons
   */
  private renderControls(): void {
    this.controlsContainer.empty();
    
    const controlsTitle = this.controlsContainer.createEl('h3', { text: 'Controls' });
    const buttonGroup = this.controlsContainer.createDiv({ cls: 'button-group' });
    
    // Refresh button
    const refreshBtn = buttonGroup.createEl('button', { 
      text: '🔄 Refresh',
      cls: 'control-button'
    });
    refreshBtn.addEventListener('click', () => this.refreshDashboard());
    
    // Manual sync button
    const syncBtn = buttonGroup.createEl('button', { 
      text: '▶️ Sync Now',
      cls: 'control-button primary'
    });
    syncBtn.addEventListener('click', () => this.triggerManualSync());
    
    if (this.statistics.currentStatus === 'syncing') {
      syncBtn.disabled = true;
      syncBtn.textContent = '🔄 Syncing...';
    }
    
    // Clear errors button
    const clearErrorsBtn = buttonGroup.createEl('button', { 
      text: '🗑️ Clear Errors',
      cls: 'control-button'
    });
    clearErrorsBtn.addEventListener('click', () => this.clearErrors());
    
    // Settings button
    const settingsBtn = buttonGroup.createEl('button', { 
      text: '⚙️ Settings',
      cls: 'control-button'
    });
    settingsBtn.addEventListener('click', () => this.openSettings());
  }

  /**
   * Starts auto-refresh timer
   */
  private startAutoRefresh(): void {
    this.stopAutoRefresh();
    
    this.refreshInterval = setInterval(() => {
      if (this.isVisible) {
        this.refreshDashboard();
      }
    }, this.options.refreshInterval);
  }

  /**
   * Stops auto-refresh timer
   */
  private stopAutoRefresh(): void {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
  }

  /**
   * Refreshes the dashboard data and UI
   */
  private async refreshDashboard(): Promise<void> {
    await this.loadStatistics();
    this.renderDashboard();
  }

  /**
   * Loads statistics from components
   */
  private async loadStatistics(): Promise<void> {
    this.statistics = this.getInitialStatistics();
    
    // Load data from scheduler
    if (this.scheduler) {
      const schedulerStats = this.scheduler.getStatistics();
      this.statistics.totalSyncs = schedulerStats.totalSyncs;
      this.statistics.successfulSyncs = schedulerStats.successfulSyncs;
      this.statistics.failedSyncs = schedulerStats.failedSyncs;
      this.statistics.lastSyncTime = schedulerStats.lastSyncTime ? new Date(schedulerStats.lastSyncTime) : null;
      this.statistics.averageSyncDuration = schedulerStats.averageSyncDuration;
      this.statistics.currentStatus = schedulerStats.currentStatus;
      
      // Calculate next sync time if scheduler is running
      if (this.scheduler.isRunning() && this.statistics.lastSyncTime) {
        const config = this.scheduler.getConfig();
        const nextSync = new Date(this.statistics.lastSyncTime.getTime() + (config.syncInterval * 60 * 1000));
        this.statistics.nextSyncTime = nextSync;
      }
    }
    
    // Check for active operations
    this.updateActiveOperationStatus();
  }

  /**
   * Updates active operation status
   */
  private updateActiveOperationStatus(): void {
    // This would be called by the scheduler/bulk import manager to report progress
    // For now, we'll detect based on current status
    if (this.statistics.currentStatus === 'syncing') {
      if (!this.statistics.activeOperation) {
        this.statistics.activeOperation = {
          type: 'sync',
          phase: SyncPhase.PROCESSING,
          startTime: new Date(),
          current: 0,
          total: 100 // This would be provided by the actual sync operation
        };
      }
    } else {
      this.statistics.activeOperation = null;
    }
  }

  /**
   * Triggers a manual sync
   */
  private async triggerManualSync(): Promise<void> {
    if (!this.scheduler) {
      new Notice('Scheduler not available');
      return;
    }
    
    if (this.statistics.currentStatus === 'syncing') {
      new Notice('Sync already in progress');
      return;
    }
    
    try {
      new Notice('Starting manual sync...');
      await this.scheduler.triggerManualSync();
      this.refreshDashboard();
    } catch (error) {
      console.error('Manual sync failed:', error);
      new Notice('Manual sync failed: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
  }

  /**
   * Clears resolved errors from the log
   */
  private clearErrors(): void {
    this.statistics.errors = this.statistics.errors.filter(error => !error.resolved);
    this.renderErrors();
    new Notice('Resolved errors cleared');
  }

  /**
   * Opens dashboard settings
   */
  private openSettings(): void {
    // This would open a settings modal for dashboard configuration
    new Notice('Dashboard settings not yet implemented');
  }

  /**
   * Gets initial statistics structure
   */
  private getInitialStatistics(): DashboardSyncStatistics {
    return {
      totalSyncs: 0,
      successfulSyncs: 0,
      failedSyncs: 0,
      lastSyncTime: null,
      lastSyncDuration: 0,
      averageSyncDuration: 0,
      totalTicketsSynced: 0,
      totalTicketsCreated: 0,
      totalTicketsUpdated: 0,
      currentStatus: 'idle',
      nextSyncTime: null,
      errors: [],
      recentSyncs: [],
      activeOperation: null
    };
  }

  /**
   * Formats duration in human-readable format
   */
  private formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    if (ms < 3600000) return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
    return `${Math.floor(ms / 3600000)}h ${Math.floor((ms % 3600000) / 60000)}m`;
  }

  /**
   * Formats relative time
   */
  private formatRelativeTime(date: Date): string {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const future = diff < 0;
    const absDiff = Math.abs(diff);
    
    if (absDiff < 60000) return future ? 'in a moment' : 'just now';
    if (absDiff < 3600000) {
      const minutes = Math.floor(absDiff / 60000);
      return future ? `in ${minutes}m` : `${minutes}m ago`;
    }
    if (absDiff < 86400000) {
      const hours = Math.floor(absDiff / 3600000);
      return future ? `in ${hours}h` : `${hours}h ago`;
    }
    
    const days = Math.floor(absDiff / 86400000);
    return future ? `in ${days}d` : `${days}d ago`;
  }

  /**
   * Formats date and time
   */
  private formatDateTime(date: Date): string {
    return date.toLocaleString();
  }

  /**
   * Gets human-readable status text
   */
  private getStatusText(status: string): string {
    switch (status) {
      case 'idle': return 'Idle';
      case 'syncing': return 'Syncing';
      case 'error': return 'Error';
      case 'scheduled': return 'Scheduled';
      default: return 'Unknown';
    }
  }

  /**
   * Adds custom styles to the view
   */
  private addStyles(): void {
    if (document.getElementById('jira-sync-status-styles')) {
      return; // Styles already added
    }
    
    const style = document.createElement('style');
    style.id = 'jira-sync-status-styles';
    style.textContent = `
      .jira-sync-status-view {
        padding: 20px;
        font-family: var(--default-font);
        background: var(--background-primary);
        color: var(--text-normal);
        overflow-y: auto;
        max-height: 100%;
      }
      
      .sync-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 20px;
        padding-bottom: 15px;
        border-bottom: 1px solid var(--background-modifier-border);
      }
      
      .dashboard-title {
        margin: 0;
        color: var(--text-accent);
      }
      
      .last-update {
        font-size: 12px;
        color: var(--text-muted);
      }
      
      .status-card {
        background: var(--background-secondary);
        border: 1px solid var(--background-modifier-border);
        border-radius: 8px;
        padding: 15px;
        margin-bottom: 20px;
      }
      
      .status-indicator {
        margin-bottom: 10px;
      }
      
      .status-badge {
        display: inline-block;
        padding: 4px 12px;
        border-radius: 15px;
        font-size: 12px;
        font-weight: 600;
        text-transform: uppercase;
      }
      
      .status-badge.idle {
        background: var(--color-cyan);
        color: white;
      }
      
      .status-badge.syncing {
        background: var(--color-orange);
        color: white;
        animation: pulse 2s infinite;
      }
      
      .status-badge.error {
        background: var(--color-red);
        color: white;
      }
      
      .status-badge.scheduled {
        background: var(--color-green);
        color: white;
      }
      
      @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.7; }
      }
      
      .stats-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
        gap: 15px;
        margin: 15px 0;
      }
      
      .stat-card {
        background: var(--background-secondary);
        border: 1px solid var(--background-modifier-border);
        border-radius: 6px;
        padding: 12px;
        text-align: center;
        transition: transform 0.2s ease;
      }
      
      .stat-card:hover {
        transform: translateY(-2px);
      }
      
      .stat-emoji {
        font-size: 20px;
        margin-bottom: 6px;
      }
      
      .stat-label {
        font-size: 11px;
        color: var(--text-muted);
        margin-bottom: 4px;
        text-transform: uppercase;
      }
      
      .stat-value {
        font-size: 16px;
        font-weight: 600;
        color: var(--text-accent);
      }
      
      .progress-bar {
        width: 100%;
        height: 8px;
        background: var(--background-modifier-border);
        border-radius: 4px;
        overflow: hidden;
        margin: 10px 0;
      }
      
      .progress-fill {
        height: 100%;
        background: var(--interactive-accent);
        border-radius: 4px;
        transition: width 0.3s ease;
      }
      
      .progress-info {
        margin-bottom: 10px;
      }
      
      .progress-title {
        font-weight: 600;
        color: var(--text-normal);
      }
      
      .progress-text {
        font-size: 12px;
        color: var(--text-muted);
        display: flex;
        justify-content: space-between;
        margin-top: 5px;
      }
      
      .history-list, .error-list {
        max-height: 300px;
        overflow-y: auto;
        border: 1px solid var(--background-modifier-border);
        border-radius: 6px;
      }
      
      .history-item, .error-item {
        display: flex;
        align-items: flex-start;
        padding: 10px;
        border-bottom: 1px solid var(--background-modifier-border);
      }
      
      .history-item:last-child, .error-item:last-child {
        border-bottom: none;
      }
      
      .history-status {
        margin-right: 10px;
        font-size: 14px;
      }
      
      .history-details {
        flex: 1;
      }
      
      .history-header {
        display: flex;
        justify-content: space-between;
        margin-bottom: 4px;
      }
      
      .history-time {
        font-size: 12px;
        color: var(--text-muted);
      }
      
      .history-trigger {
        font-size: 10px;
        background: var(--background-modifier-border);
        padding: 2px 6px;
        border-radius: 3px;
        color: var(--text-muted);
      }
      
      .history-stats {
        font-size: 12px;
        color: var(--text-normal);
      }
      
      .error-item.resolved {
        opacity: 0.6;
      }
      
      .error-header {
        display: flex;
        gap: 8px;
        margin-bottom: 4px;
      }
      
      .error-type {
        font-size: 10px;
        padding: 2px 6px;
        border-radius: 3px;
        text-transform: uppercase;
      }
      
      .error-type.api_error {
        background: var(--color-red);
        color: white;
      }
      
      .error-type.network_error {
        background: var(--color-orange);
        color: white;
      }
      
      .error-type.vault_error {
        background: var(--color-purple);
        color: white;
      }
      
      .error-retryable {
        background: var(--color-blue);
        color: white;
        font-size: 10px;
        padding: 2px 6px;
        border-radius: 3px;
      }
      
      .button-group {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
        margin: 15px 0;
      }
      
      .control-button {
        padding: 8px 16px;
        border: 1px solid var(--background-modifier-border);
        background: var(--background-secondary);
        color: var(--text-normal);
        border-radius: 6px;
        cursor: pointer;
        font-size: 12px;
        transition: all 0.2s ease;
      }
      
      .control-button:hover:not(:disabled) {
        background: var(--background-modifier-hover);
        transform: translateY(-1px);
      }
      
      .control-button.primary {
        background: var(--interactive-accent);
        color: var(--text-on-accent);
        border: none;
      }
      
      .control-button:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }
      
      .empty-message {
        text-align: center;
        padding: 20px;
        color: var(--text-muted);
        font-style: italic;
      }
      
      .empty-message.success {
        color: var(--color-green);
      }
      
      .refresh-toggle .setting-item {
        border: none;
        padding: 0;
      }
      
      .refresh-toggle .setting-item-info {
        display: none;
      }
      
      h3 {
        color: var(--text-normal);
        font-size: 14px;
        font-weight: 600;
        margin: 20px 0 10px 0;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
      
      .sync-progress[style*="display: none"] {
        display: none !important;
      }
    `;
    
    document.head.appendChild(style);
  }
}