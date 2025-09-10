import { Modal, App, Setting } from 'obsidian';
import { AutoSyncScheduler } from './auto-sync-scheduler';
import { JQLQueryEngine } from './jql-query-engine';

/**
 * Sync statistics data structure
 */
export interface SyncStatistics {
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
  errors: SyncError[];
  recentSyncs: SyncHistoryEntry[];
}

/**
 * Sync error details
 */
export interface SyncError {
  timestamp: Date;
  message: string;
  ticketKey?: string;
  type: 'network' | 'validation' | 'permission' | 'unknown';
  retryable: boolean;
}

/**
 * Sync history entry
 */
export interface SyncHistoryEntry {
  timestamp: Date;
  duration: number;
  ticketsProcessed: number;
  created: number;
  updated: number;
  failed: number;
  success: boolean;
  trigger: 'manual' | 'scheduled' | 'webhook';
}

/**
 * Dashboard display options
 */
export interface DashboardOptions {
  showErrors: boolean;
  showHistory: boolean;
  historyLimit: number;
  autoRefresh: boolean;
  refreshInterval: number;
}

/**
 * Sync Status Dashboard Modal
 * Provides comprehensive view of sync operations and statistics
 */
export class SyncStatusDashboard extends Modal {
  private scheduler: AutoSyncScheduler | null;
  private queryEngine: JQLQueryEngine | null;
  private statistics: SyncStatistics;
  private options: DashboardOptions;
  private refreshInterval: NodeJS.Timer | null = null;
  private containerEl: HTMLElement;
  
  // UI Elements
  private statsContainer: HTMLElement;
  private historyContainer: HTMLElement;
  private errorContainer: HTMLElement;
  private progressContainer: HTMLElement;
  private actionsContainer: HTMLElement;

  constructor(
    app: App,
    scheduler: AutoSyncScheduler | null,
    queryEngine: JQLQueryEngine | null,
    options?: Partial<DashboardOptions>
  ) {
    super(app);
    this.scheduler = scheduler;
    this.queryEngine = queryEngine;
    
    // Initialize options with defaults
    this.options = {
      showErrors: true,
      showHistory: true,
      historyLimit: 10,
      autoRefresh: true,
      refreshInterval: 5000,
      ...options
    };
    
    // Initialize statistics
    this.statistics = this.getInitialStatistics();
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('sync-status-dashboard');
    
    // Create header
    contentEl.createEl('h2', { text: '📊 Sync Status Dashboard' });
    
    // Create tab navigation
    const tabContainer = contentEl.createDiv({ cls: 'dashboard-tabs' });
    this.createTabs(tabContainer);
    
    // Create main content area
    const mainContent = contentEl.createDiv({ cls: 'dashboard-content' });
    
    // Statistics section
    this.statsContainer = mainContent.createDiv({ cls: 'stats-section' });
    this.renderStatistics();
    
    // Progress section
    this.progressContainer = mainContent.createDiv({ cls: 'progress-section' });
    this.renderProgress();
    
    // History section
    if (this.options.showHistory) {
      this.historyContainer = mainContent.createDiv({ cls: 'history-section' });
      this.renderHistory();
    }
    
    // Error log section
    if (this.options.showErrors) {
      this.errorContainer = mainContent.createDiv({ cls: 'error-section' });
      this.renderErrors();
    }
    
    // Actions section
    this.actionsContainer = contentEl.createDiv({ cls: 'actions-section' });
    this.renderActions();
    
    // Start auto-refresh if enabled
    if (this.options.autoRefresh) {
      this.startAutoRefresh();
    }
    
    // Add styles
    this.addStyles();
  }

  onClose() {
    // Stop auto-refresh
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
    
    const { contentEl } = this;
    if (contentEl) {
      contentEl.empty();
    }
  }

  /**
   * Create tab navigation
   */
  private createTabs(container: HTMLElement): void {
    const tabs = [
      { id: 'overview', label: '📈 Overview', active: true },
      { id: 'history', label: '📜 History', active: false },
      { id: 'errors', label: '⚠️ Errors', active: false },
      { id: 'settings', label: '⚙️ Settings', active: false }
    ];
    
    tabs.forEach(tab => {
      const tabEl = container.createEl('button', {
        text: tab.label,
        cls: `dashboard-tab ${tab.active ? 'active' : ''}`
      });
      
      tabEl.addEventListener('click', () => {
        this.switchTab(tab.id);
        
        // Update active state
        container.querySelectorAll('.dashboard-tab').forEach(t => {
          t.removeClass('active');
        });
        tabEl.addClass('active');
      });
    });
  }

  /**
   * Switch between dashboard tabs
   */
  private switchTab(tabId: string): void {
    // Hide all sections
    this.statsContainer?.style.setProperty('display', 'none');
    this.historyContainer?.style.setProperty('display', 'none');
    this.errorContainer?.style.setProperty('display', 'none');
    this.progressContainer?.style.setProperty('display', 'none');
    
    // Show selected section
    switch (tabId) {
      case 'overview':
        this.statsContainer?.style.setProperty('display', 'block');
        this.progressContainer?.style.setProperty('display', 'block');
        break;
      case 'history':
        this.historyContainer?.style.setProperty('display', 'block');
        break;
      case 'errors':
        this.errorContainer?.style.setProperty('display', 'block');
        break;
      case 'settings':
        // Settings handled separately
        break;
    }
  }

  /**
   * Render statistics section
   */
  private renderStatistics(): void {
    if (!this.statsContainer) return;
    
    this.statsContainer.empty();
    this.statsContainer.createEl('h3', { text: 'Sync Statistics' });
    
    // Update statistics from scheduler
    if (this.scheduler) {
      this.statistics = this.scheduler.getStatistics();
    }
    
    // Create stats grid
    const statsGrid = this.statsContainer.createDiv({ cls: 'stats-grid' });
    
    // Total syncs
    this.createStatCard(statsGrid, '🔄', 'Total Syncs', String(this.statistics.totalSyncs));
    
    // Success rate
    const successRate = this.statistics.totalSyncs > 0
      ? Math.round((this.statistics.successfulSyncs / this.statistics.totalSyncs) * 100)
      : 0;
    this.createStatCard(statsGrid, '✅', 'Success Rate', `${successRate}%`);
    
    // Total tickets
    this.createStatCard(statsGrid, '🎫', 'Tickets Synced', String(this.statistics.totalTicketsSynced));
    
    // Average duration
    const avgDuration = this.formatDuration(this.statistics.averageSyncDuration);
    this.createStatCard(statsGrid, '⏱️', 'Avg Duration', avgDuration);
    
    // Current status
    const statusEmoji = this.getStatusEmoji(this.statistics.currentStatus);
    this.createStatCard(statsGrid, statusEmoji, 'Current Status', this.statistics.currentStatus);
    
    // Last sync
    const lastSync = this.statistics.lastSyncTime
      ? this.formatRelativeTime(this.statistics.lastSyncTime)
      : 'Never';
    this.createStatCard(statsGrid, '🕐', 'Last Sync', lastSync);
    
    // Next sync
    const nextSync = this.statistics.nextSyncTime
      ? this.formatRelativeTime(this.statistics.nextSyncTime)
      : 'Not scheduled';
    this.createStatCard(statsGrid, '⏰', 'Next Sync', nextSync);
    
    // Failed syncs
    this.createStatCard(statsGrid, '❌', 'Failed Syncs', String(this.statistics.failedSyncs));
  }

  /**
   * Create a statistics card
   */
  private createStatCard(container: HTMLElement, emoji: string, label: string, value: string): void {
    const card = container.createDiv({ cls: 'stat-card' });
    card.createEl('div', { text: emoji, cls: 'stat-emoji' });
    card.createEl('div', { text: label, cls: 'stat-label' });
    card.createEl('div', { text: value, cls: 'stat-value' });
  }

  /**
   * Render progress section
   */
  private renderProgress(): void {
    if (!this.progressContainer) return;
    
    this.progressContainer.empty();
    
    if (this.statistics.currentStatus === 'syncing') {
      this.progressContainer.createEl('h3', { text: 'Sync in Progress' });
      
      // Progress bar
      const progressBar = this.progressContainer.createDiv({ cls: 'progress-bar' });
      const progressFill = progressBar.createDiv({ cls: 'progress-fill' });
      progressFill.style.width = '50%'; // This would be dynamic based on actual progress
      
      // Progress text
      this.progressContainer.createEl('p', {
        text: 'Processing tickets...',
        cls: 'progress-text'
      });
    }
  }

  /**
   * Render sync history
   */
  private renderHistory(): void {
    if (!this.historyContainer) return;
    
    this.historyContainer.empty();
    this.historyContainer.createEl('h3', { text: 'Recent Sync History' });
    
    if (this.statistics.recentSyncs.length === 0) {
      this.historyContainer.createEl('p', {
        text: 'No sync history available',
        cls: 'empty-message'
      });
      return;
    }
    
    // Create history table
    const table = this.historyContainer.createEl('table', { cls: 'history-table' });
    const thead = table.createEl('thead');
    const headerRow = thead.createEl('tr');
    headerRow.createEl('th', { text: 'Time' });
    headerRow.createEl('th', { text: 'Trigger' });
    headerRow.createEl('th', { text: 'Duration' });
    headerRow.createEl('th', { text: 'Processed' });
    headerRow.createEl('th', { text: 'Status' });
    
    const tbody = table.createEl('tbody');
    
    // Show limited history
    const historyToShow = this.statistics.recentSyncs.slice(0, this.options.historyLimit);
    
    historyToShow.forEach(entry => {
      const row = tbody.createEl('tr');
      row.createEl('td', { text: this.formatDateTime(entry.timestamp) });
      row.createEl('td', { text: entry.trigger });
      row.createEl('td', { text: this.formatDuration(entry.duration) });
      row.createEl('td', { text: String(entry.ticketsProcessed) });
      
      const statusCell = row.createEl('td');
      statusCell.createEl('span', {
        text: entry.success ? '✅ Success' : '❌ Failed',
        cls: entry.success ? 'status-success' : 'status-error'
      });
    });
  }

  /**
   * Render error log
   */
  private renderErrors(): void {
    if (!this.errorContainer) return;
    
    this.errorContainer.empty();
    this.errorContainer.createEl('h3', { text: 'Error Log' });
    
    if (this.statistics.errors.length === 0) {
      this.errorContainer.createEl('p', {
        text: 'No errors recorded',
        cls: 'empty-message success-message'
      });
      return;
    }
    
    // Create error list
    const errorList = this.errorContainer.createDiv({ cls: 'error-list' });
    
    this.statistics.errors.forEach(error => {
      const errorItem = errorList.createDiv({ cls: 'error-item' });
      
      // Error header
      const errorHeader = errorItem.createDiv({ cls: 'error-header' });
      errorHeader.createEl('span', {
        text: this.formatDateTime(error.timestamp),
        cls: 'error-time'
      });
      errorHeader.createEl('span', {
        text: error.type,
        cls: `error-type error-type-${error.type}`
      });
      if (error.retryable) {
        errorHeader.createEl('span', {
          text: '🔄 Retryable',
          cls: 'error-retryable'
        });
      }
      
      // Error message
      errorItem.createEl('div', {
        text: error.message,
        cls: 'error-message'
      });
      
      // Ticket key if available
      if (error.ticketKey) {
        errorItem.createEl('div', {
          text: `Ticket: ${error.ticketKey}`,
          cls: 'error-ticket'
        });
      }
    });
  }

  /**
   * Render action buttons
   */
  private renderActions(): void {
    if (!this.actionsContainer) return;
    
    this.actionsContainer.empty();
    
    const buttonGroup = this.actionsContainer.createDiv({ cls: 'button-group' });
    
    // Refresh button
    const refreshBtn = buttonGroup.createEl('button', {
      text: '🔄 Refresh',
      cls: 'dashboard-button'
    });
    refreshBtn.addEventListener('click', () => {
      this.refresh();
    });
    
    // Manual sync button
    const syncBtn = buttonGroup.createEl('button', {
      text: '▶️ Sync Now',
      cls: 'dashboard-button primary'
    });
    syncBtn.addEventListener('click', () => {
      this.triggerManualSync();
    });
    
    // Clear errors button
    const clearBtn = buttonGroup.createEl('button', {
      text: '🗑️ Clear Errors',
      cls: 'dashboard-button'
    });
    clearBtn.addEventListener('click', () => {
      this.clearErrors();
    });
    
    // Export stats button
    const exportBtn = buttonGroup.createEl('button', {
      text: '📥 Export Stats',
      cls: 'dashboard-button'
    });
    exportBtn.addEventListener('click', () => {
      this.exportStatistics();
    });
    
    // Close button
    const closeBtn = buttonGroup.createEl('button', {
      text: 'Close',
      cls: 'dashboard-button'
    });
    closeBtn.addEventListener('click', () => {
      this.close();
    });
  }

  /**
   * Start auto-refresh timer
   */
  private startAutoRefresh(): void {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
    }
    
    this.refreshInterval = setInterval(() => {
      this.refresh();
    }, this.options.refreshInterval);
  }

  /**
   * Refresh dashboard data
   */
  private refresh(): void {
    // Update statistics
    if (this.scheduler) {
      this.statistics = this.scheduler.getStatistics();
    }
    
    // Re-render sections
    this.renderStatistics();
    this.renderProgress();
    this.renderHistory();
    this.renderErrors();
  }

  /**
   * Trigger manual sync
   */
  private async triggerManualSync(): Promise<void> {
    if (this.scheduler) {
      await this.scheduler.triggerManualSync();
      this.refresh();
    }
  }

  /**
   * Clear error log
   */
  private clearErrors(): void {
    this.statistics.errors = [];
    this.renderErrors();
  }

  /**
   * Export statistics to clipboard
   */
  private exportStatistics(): void {
    const stats = {
      exported: new Date().toISOString(),
      statistics: this.statistics,
      options: this.options
    };
    
    const json = JSON.stringify(stats, null, 2);
    navigator.clipboard.writeText(json);
    
    // Show notification
    const notification = this.contentEl.createDiv({ cls: 'export-notification' });
    notification.textContent = '✅ Statistics exported to clipboard';
    
    setTimeout(() => {
      notification.remove();
    }, 3000);
  }

  /**
   * Get initial statistics
   */
  private getInitialStatistics(): SyncStatistics {
    if (this.scheduler) {
      return this.scheduler.getStatistics();
    }
    
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
      recentSyncs: []
    };
  }

  /**
   * Format duration in human-readable format
   */
  private formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
  }

  /**
   * Format relative time
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
   * Format date time
   */
  private formatDateTime(date: Date): string {
    return date.toLocaleString();
  }

  /**
   * Get status emoji
   */
  private getStatusEmoji(status: string): string {
    switch (status) {
      case 'idle': return '💤';
      case 'syncing': return '🔄';
      case 'error': return '❌';
      case 'scheduled': return '⏰';
      default: return '❓';
    }
  }

  /**
   * Add custom styles
   */
  private addStyles(): void {
    const style = document.createElement('style');
    style.textContent = `
      .sync-status-dashboard {
        padding: 20px;
        max-width: 900px;
        margin: 0 auto;
      }
      
      .dashboard-tabs {
        display: flex;
        gap: 10px;
        margin-bottom: 20px;
        border-bottom: 2px solid var(--background-modifier-border);
      }
      
      .dashboard-tab {
        padding: 10px 20px;
        background: transparent;
        border: none;
        cursor: pointer;
        font-size: 14px;
        color: var(--text-muted);
        transition: all 0.3s ease;
      }
      
      .dashboard-tab:hover {
        color: var(--text-normal);
      }
      
      .dashboard-tab.active {
        color: var(--text-accent);
        border-bottom: 2px solid var(--interactive-accent);
        margin-bottom: -2px;
      }
      
      .stats-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
        gap: 15px;
        margin: 20px 0;
      }
      
      .stat-card {
        background: var(--background-secondary);
        padding: 15px;
        border-radius: 8px;
        text-align: center;
        transition: transform 0.2s ease;
      }
      
      .stat-card:hover {
        transform: translateY(-2px);
      }
      
      .stat-emoji {
        font-size: 24px;
        margin-bottom: 8px;
      }
      
      .stat-label {
        font-size: 12px;
        color: var(--text-muted);
        margin-bottom: 4px;
      }
      
      .stat-value {
        font-size: 18px;
        font-weight: bold;
        color: var(--text-normal);
      }
      
      .progress-bar {
        width: 100%;
        height: 20px;
        background: var(--background-modifier-border);
        border-radius: 10px;
        overflow: hidden;
        margin: 10px 0;
      }
      
      .progress-fill {
        height: 100%;
        background: var(--interactive-accent);
        transition: width 0.3s ease;
      }
      
      .history-table {
        width: 100%;
        border-collapse: collapse;
        margin: 20px 0;
      }
      
      .history-table th {
        text-align: left;
        padding: 10px;
        border-bottom: 2px solid var(--background-modifier-border);
        color: var(--text-muted);
        font-size: 12px;
        text-transform: uppercase;
      }
      
      .history-table td {
        padding: 10px;
        border-bottom: 1px solid var(--background-modifier-border);
      }
      
      .status-success {
        color: #27ae60;
      }
      
      .status-error {
        color: #e74c3c;
      }
      
      .error-list {
        max-height: 300px;
        overflow-y: auto;
      }
      
      .error-item {
        background: var(--background-secondary);
        padding: 10px;
        margin: 10px 0;
        border-radius: 5px;
        border-left: 3px solid #e74c3c;
      }
      
      .error-header {
        display: flex;
        justify-content: space-between;
        margin-bottom: 5px;
      }
      
      .error-time {
        font-size: 12px;
        color: var(--text-muted);
      }
      
      .error-type {
        font-size: 11px;
        padding: 2px 6px;
        border-radius: 3px;
        background: var(--background-modifier-border);
      }
      
      .error-type-network {
        background: #3498db;
        color: white;
      }
      
      .error-type-validation {
        background: #f39c12;
        color: white;
      }
      
      .error-type-permission {
        background: #e74c3c;
        color: white;
      }
      
      .error-message {
        color: var(--text-normal);
        margin: 5px 0;
      }
      
      .button-group {
        display: flex;
        gap: 10px;
        justify-content: center;
        margin-top: 20px;
      }
      
      .dashboard-button {
        padding: 8px 16px;
        border: 1px solid var(--background-modifier-border);
        background: var(--background-secondary);
        color: var(--text-normal);
        border-radius: 5px;
        cursor: pointer;
        transition: all 0.2s ease;
      }
      
      .dashboard-button:hover {
        background: var(--background-modifier-hover);
      }
      
      .dashboard-button.primary {
        background: var(--interactive-accent);
        color: white;
        border: none;
      }
      
      .dashboard-button.primary:hover {
        opacity: 0.9;
      }
      
      .empty-message {
        text-align: center;
        color: var(--text-muted);
        padding: 20px;
      }
      
      .success-message {
        color: #27ae60;
      }
      
      .export-notification {
        position: fixed;
        top: 20px;
        right: 20px;
        background: #27ae60;
        color: white;
        padding: 10px 20px;
        border-radius: 5px;
        animation: slideIn 0.3s ease;
      }
      
      @keyframes slideIn {
        from {
          transform: translateX(100%);
          opacity: 0;
        }
        to {
          transform: translateX(0);
          opacity: 1;
        }
      }
    `;
    document.head.appendChild(style);
  }
}