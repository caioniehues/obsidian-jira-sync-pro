/**
 * Enhanced Sync Status Dashboard with shadcn components
 * Modern UI/UX improvements for the Jira Sync Pro plugin
 */

import { Modal, App } from 'obsidian';
import { AutoSyncScheduler } from '../enhanced-sync/auto-sync-scheduler';
import { JQLQueryEngine } from '../enhanced-sync/jql-query-engine';
import { SyncStatistics } from '../enhanced-sync/sync-status-dashboard';
import {
  Card,
  Button,
  Progress,
  Alert,
  Badge,
  Tabs,
  addGlobalStyles
} from './shadcn-components';

/**
 * Enhanced Sync Status Dashboard with shadcn UI components
 */
export class EnhancedSyncDashboard extends Modal {
  private readonly scheduler: AutoSyncScheduler | null;
  private statistics: SyncStatistics;
  private refreshInterval: NodeJS.Timeout | null = null;
  
  constructor(
    app: App,
    scheduler: AutoSyncScheduler | null,
    queryEngine: JQLQueryEngine | null // Keep for compatibility but not used
  ) {
    super(app);
    this.scheduler = scheduler;
    this.statistics = this.getInitialStatistics();
    
    // Add global shadcn styles
    addGlobalStyles();
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('enhanced-sync-dashboard');
    
    // Apply dashboard container styles
    contentEl.style.padding = '0';
    contentEl.style.maxWidth = '1200px';
    contentEl.style.margin = '0 auto';
    
    // Header with gradient
    const header = contentEl.createDiv({ cls: 'dashboard-header' });
    header.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
    header.style.color = 'white';
    header.style.padding = '2rem';
    header.style.borderRadius = '0.5rem 0.5rem 0 0';
    header.style.marginBottom = '2rem';
    
    const headerContent = header.createDiv({ cls: 'header-content' });
    headerContent.style.display = 'flex';
    headerContent.style.justifyContent = 'space-between';
    headerContent.style.alignItems = 'center';
    
    const titleSection = headerContent.createDiv();
    titleSection.createEl('h2', { 
      text: '✨ Jira Sync Dashboard',
      cls: 'dashboard-title'
    }).style.fontSize = '1.875rem';
    titleSection.createEl('p', {
      text: 'Real-time synchronization status and metrics',
      cls: 'dashboard-subtitle'
    }).style.opacity = '0.9';
    
    // Live status indicator
    const statusSection = headerContent.createDiv();
    this.createLiveStatus(statusSection);
    
    // Main content area
    const mainContent = contentEl.createDiv({ cls: 'dashboard-main' });
    mainContent.style.padding = '0 2rem 2rem';
    
    // Quick stats row
    this.createQuickStats(mainContent);
    
    // Tabs for different sections
    this.createTabbedInterface(mainContent);
    
    // Action buttons
    this.createActionButtons(mainContent);
    
    // Start auto-refresh
    this.startAutoRefresh();
  }

  onClose() {
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
   * Create live status indicator
   */
  private createLiveStatus(container: HTMLElement): void {
    const statusContainer = container.createDiv({ cls: 'live-status' });
    statusContainer.style.display = 'flex';
    statusContainer.style.alignItems = 'center';
    statusContainer.style.gap = '0.5rem';
    statusContainer.style.background = 'rgba(255, 255, 255, 0.2)';
    statusContainer.style.padding = '0.5rem 1rem';
    statusContainer.style.borderRadius = '9999px';
    
    // Animated status dot
    const statusDot = statusContainer.createDiv({ cls: 'status-dot' });
    const isActive = this.statistics.currentStatus === 'syncing';
    statusDot.style.width = '0.75rem';
    statusDot.style.height = '0.75rem';
    statusDot.style.borderRadius = '50%';
    statusDot.style.background = isActive ? '#10b981' : '#fbbf24';
    
    if (isActive) {
      statusDot.style.animation = 'pulse 2s infinite';
    }
    
    // Status text
    const statusText = statusContainer.createSpan();
    statusText.textContent = this.getStatusText(this.statistics.currentStatus);
    statusText.style.fontWeight = '500';
    statusText.style.fontSize = '0.875rem';
  }

  /**
   * Create quick stats cards
   */
  private createQuickStats(container: HTMLElement): void {
    const statsGrid = container.createDiv({ cls: 'stats-grid' });
    statsGrid.style.display = 'grid';
    statsGrid.style.gridTemplateColumns = 'repeat(auto-fit, minmax(250px, 1fr))';
    statsGrid.style.gap = '1.5rem';
    statsGrid.style.marginBottom = '2rem';
    
    // Update statistics
    if (this.scheduler) {
      this.statistics = this.scheduler.getStatistics();
    }
    
    // Success rate card
    const successRate = this.statistics.totalSyncs > 0
      ? Math.round((this.statistics.successfulSyncs / this.statistics.totalSyncs) * 100)
      : 0;
    
    const successCard = new Card(statsGrid.createDiv(), {
      title: 'Success Rate',
      description: `${this.statistics.successfulSyncs} of ${this.statistics.totalSyncs} syncs`,
      content: this.createMetricDisplay(successRate, '%', this.getSuccessColor(successRate))
    });
    successCard.render();
    
    // Total tickets card
    const ticketsCard = new Card(statsGrid.createDiv(), {
      title: 'Tickets Synced',
      description: `${this.statistics.totalTicketsCreated} created, ${this.statistics.totalTicketsUpdated} updated`,
      content: this.createMetricDisplay(this.statistics.totalTicketsSynced, '', '#667eea')
    });
    ticketsCard.render();
    
    // Average duration card
    const avgDuration = this.formatDuration(this.statistics.averageSyncDuration);
    const durationCard = new Card(statsGrid.createDiv(), {
      title: 'Average Duration',
      description: 'Per sync operation',
      content: this.createMetricDisplay(avgDuration, '', '#764ba2')
    });
    durationCard.render();
    
    // Next sync card
    const nextSyncTime = this.getNextSyncDisplay();
    const nextSyncCard = new Card(statsGrid.createDiv(), {
      title: 'Next Sync',
      description: this.statistics.currentStatus === 'scheduled' ? 'Scheduled' : 'Not scheduled',
      content: this.createMetricDisplay(nextSyncTime, '', '#f59e0b')
    });
    nextSyncCard.render();
  }

  /**
   * Create tabbed interface
   */
  private createTabbedInterface(container: HTMLElement): void {
    const tabContainer = container.createDiv({ cls: 'tab-container' });
    
    // Create tab content
    const overviewContent = this.createOverviewTab();
    const historyContent = this.createHistoryTab();
    const errorsContent = this.createErrorsTab();
    const settingsContent = this.createSettingsTab();
    
    const tabs = new Tabs(tabContainer, {
      tabs: [
        { id: 'overview', label: '📊 Overview', content: overviewContent },
        { id: 'history', label: '📜 History', content: historyContent },
        { id: 'errors', label: '⚠️ Errors', content: errorsContent },
        { id: 'settings', label: '⚙️ Settings', content: settingsContent }
      ],
      activeTab: 'overview',
      onTabChange: (tabId) => {
        console.log(`Switched to tab: ${tabId}`);
      }
    });
    tabs.render();
  }

  /**
   * Create overview tab content
   */
  private createOverviewTab(): HTMLElement {
    const container = document.createElement('div');
    container.className = 'overview-tab';
    
    // Current sync progress
    if (this.statistics.currentStatus === 'syncing') {
      const progressSection = container.createDiv({ cls: 'progress-section' });
      progressSection.style.marginBottom = '2rem';
      
      const progressAlert = new Alert(progressSection.createDiv(), {
        title: 'Sync in Progress',
        description: 'Processing tickets from Jira...',
        variant: 'default',
        icon: '🔄'
      });
      progressAlert.render();
      
      const progressBar = new Progress(progressSection.createDiv(), {
        value: 50, // This would be dynamic
        max: 100,
        showLabel: true,
        animated: true
      });
      progressBar.render();
    }
    
    // Recent activity
    const activitySection = container.createDiv({ cls: 'activity-section' });
    activitySection.createEl('h3', { text: 'Recent Activity' });
    
    if (this.statistics.recentSyncs.length > 0) {
      this.statistics.recentSyncs.slice(0, 5).forEach(sync => {
        const activityItem = activitySection.createDiv({ cls: 'activity-item' });
        activityItem.style.display = 'flex';
        activityItem.style.justifyContent = 'space-between';
        activityItem.style.padding = '0.75rem';
        activityItem.style.borderBottom = '1px solid var(--background-modifier-border)';
        
        const leftSection = activityItem.createDiv();
        leftSection.style.display = 'flex';
        leftSection.style.gap = '0.5rem';
        leftSection.style.alignItems = 'center';
        
        // Status badge
        const badgeContainer = leftSection.createDiv();
        const badge = new Badge(badgeContainer, {
          text: sync.success ? 'Success' : 'Failed',
          variant: sync.success ? 'success' : 'destructive'
        });
        badge.render();
        
        // Time and trigger
        leftSection.createSpan({ text: this.formatDateTime(sync.timestamp) });
        leftSection.createSpan({ text: `• ${sync.trigger}` }).style.color = 'var(--text-muted)';
        
        // Metrics
        const rightSection = activityItem.createDiv();
        rightSection.style.display = 'flex';
        rightSection.style.gap = '1rem';
        rightSection.style.alignItems = 'center';
        rightSection.style.color = 'var(--text-muted)';
        rightSection.style.fontSize = '0.875rem';
        
        rightSection.createSpan({ text: `${sync.ticketsProcessed} tickets` });
        rightSection.createSpan({ text: this.formatDuration(sync.duration) });
      });
    } else {
      const emptyState = new Alert(activitySection.createDiv(), {
        title: 'No recent activity',
        description: 'Sync history will appear here once syncs are performed',
        variant: 'default'
      });
      emptyState.render();
    }
    
    return container;
  }

  /**
   * Create history tab content
   */
  private createHistoryTab(): HTMLElement {
    const container = document.createElement('div');
    container.className = 'history-tab';
    
    if (this.statistics.recentSyncs.length === 0) {
      const emptyAlert = new Alert(container.createDiv(), {
        title: 'No sync history',
        description: 'Your sync history will appear here',
        variant: 'default',
        icon: '📭'
      });
      emptyAlert.render();
      return container;
    }
    
    // History table with enhanced styling
    const table = container.createEl('table', { cls: 'history-table' });
    table.style.width = '100%';
    table.style.borderCollapse = 'separate';
    table.style.borderSpacing = '0';
    
    const thead = table.createEl('thead');
    thead.style.background = 'var(--background-secondary)';
    const headerRow = thead.createEl('tr');
    
    ['Time', 'Trigger', 'Duration', 'Tickets', 'Status'].forEach(header => {
      const th = headerRow.createEl('th', { text: header });
      th.style.padding = '0.75rem';
      th.style.textAlign = 'left';
      th.style.fontWeight = '500';
      th.style.fontSize = '0.875rem';
      th.style.color = 'var(--text-muted)';
    });
    
    const tbody = table.createEl('tbody');
    this.statistics.recentSyncs.slice(0, 10).forEach((sync, index) => {
      const row = tbody.createEl('tr');
      if (index % 2 === 0) {
        row.style.background = 'var(--background-primary-alt)';
      }
      
      row.createEl('td', { text: this.formatDateTime(sync.timestamp) }).style.padding = '0.75rem';
      
      const triggerCell = row.createEl('td');
      triggerCell.style.padding = '0.75rem';
      const triggerBadge = new Badge(triggerCell.createDiv(), {
        text: sync.trigger,
        variant: 'outline'
      });
      triggerBadge.render();
      
      row.createEl('td', { text: this.formatDuration(sync.duration) }).style.padding = '0.75rem';
      row.createEl('td', { text: String(sync.ticketsProcessed) }).style.padding = '0.75rem';
      
      const statusCell = row.createEl('td');
      statusCell.style.padding = '0.75rem';
      const statusBadge = new Badge(statusCell.createDiv(), {
        text: sync.success ? '✓ Success' : '✗ Failed',
        variant: sync.success ? 'success' : 'destructive'
      });
      statusBadge.render();
    });
    
    return container;
  }

  /**
   * Create errors tab content
   */
  private createErrorsTab(): HTMLElement {
    const container = document.createElement('div');
    container.className = 'errors-tab';
    
    if (this.statistics.errors.length === 0) {
      const successAlert = new Alert(container.createDiv(), {
        title: 'No errors recorded',
        description: 'Your sync operations are running smoothly!',
        variant: 'success',
        icon: '✅'
      });
      successAlert.render();
      return container;
    }
    
    // Error list with enhanced cards
    this.statistics.errors.forEach(error => {
      const errorCard = container.createDiv({ cls: 'error-card' });
      errorCard.style.marginBottom = '1rem';
      
      const alert = new Alert(errorCard, {
        title: error.message,
        description: `${this.formatDateTime(error.timestamp)} • ${error.type}${error.ticketKey ? ` • ${error.ticketKey}` : ''}`,
        variant: 'destructive',
        icon: '❌',
        dismissible: true,
        onDismiss: () => {
          // Remove from errors array
          const index = this.statistics.errors.indexOf(error);
          if (index > -1) {
            this.statistics.errors.splice(index, 1);
          }
        }
      });
      alert.render();
      
      if (error.retryable) {
        const retryBadge = new Badge(errorCard.createDiv(), {
          text: '🔄 Retryable',
          variant: 'warning'
        });
        retryBadge.render();
      }
    });
    
    return container;
  }

  /**
   * Create settings tab content
   */
  private createSettingsTab(): HTMLElement {
    const container = document.createElement('div');
    container.className = 'settings-tab';
    
    const settingsCard = new Card(container.createDiv(), {
      title: 'Dashboard Settings',
      description: 'Configure how the dashboard displays information',
      content: this.createSettingsForm()
    });
    settingsCard.render();
    
    return container;
  }

  /**
   * Create settings form
   */
  private createSettingsForm(): HTMLElement {
    const form = document.createElement('div');
    form.className = 'settings-form';
    
    // Auto-refresh toggle
    const refreshSetting = form.createDiv({ cls: 'setting-item' });
    refreshSetting.style.marginBottom = '1rem';
    refreshSetting.createEl('label', { text: 'Auto-refresh' });
    const refreshToggle = refreshSetting.createEl('input', { type: 'checkbox' });
    refreshToggle.checked = true;
    refreshToggle.addEventListener('change', (e) => {
      if ((e.target as HTMLInputElement).checked) {
        this.startAutoRefresh();
      } else {
        this.stopAutoRefresh();
      }
    });
    
    // History limit
    const limitSetting = form.createDiv({ cls: 'setting-item' });
    limitSetting.style.marginBottom = '1rem';
    limitSetting.createEl('label', { text: 'History items to show' });
    const limitInput = limitSetting.createEl('input', { type: 'number', value: '10' });
    limitInput.style.width = '100px';
    limitInput.min = '5';
    limitInput.max = '50';
    
    return form;
  }

  /**
   * Create action buttons
   */
  private createActionButtons(container: HTMLElement): void {
    const buttonContainer = container.createDiv({ cls: 'action-buttons' });
    buttonContainer.style.display = 'flex';
    buttonContainer.style.gap = '1rem';
    buttonContainer.style.justifyContent = 'center';
    buttonContainer.style.marginTop = '2rem';
    buttonContainer.style.padding = '1.5rem';
    buttonContainer.style.borderTop = '1px solid var(--background-modifier-border)';
    
    // Sync now button
    const syncButton = new Button(buttonContainer.createDiv(), {
      label: 'Sync Now',
      icon: '▶️',
      onClick: async () => {
        if (this.scheduler) {
          await this.scheduler.triggerManualSync();
          this.refresh();
        }
      },
      variant: 'primary',
      size: 'lg'
    });
    syncButton.render();
    
    // Refresh button
    const refreshButton = new Button(buttonContainer.createDiv(), {
      label: 'Refresh',
      icon: '🔄',
      onClick: () => this.refresh(),
      variant: 'secondary',
      size: 'lg'
    });
    refreshButton.render();
    
    // Export button
    const exportButton = new Button(buttonContainer.createDiv(), {
      label: 'Export Stats',
      icon: '📥',
      onClick: () => this.exportStatistics(),
      variant: 'outline',
      size: 'lg'
    });
    exportButton.render();
    
    // Close button
    const closeButton = new Button(buttonContainer.createDiv(), {
      label: 'Close',
      onClick: () => this.close(),
      variant: 'ghost',
      size: 'lg'
    });
    closeButton.render();
  }

  /**
   * Helper methods
   */
  private createMetricDisplay(value: string | number, suffix: string, color: string): HTMLElement {
    const container = document.createElement('div');
    container.style.textAlign = 'center';
    container.style.padding = '1rem';
    
    const valueEl = container.createEl('div', { cls: 'metric-value' });
    valueEl.style.fontSize = '2.5rem';
    valueEl.style.fontWeight = '700';
    valueEl.style.color = color;
    valueEl.style.lineHeight = '1';
    valueEl.textContent = `${value}${suffix}`;
    
    return container;
  }

  private getSuccessColor(rate: number): string {
    if (rate >= 90) return '#10b981';
    if (rate >= 70) return '#f59e0b';
    return '#ef4444';
  }

  private getStatusText(status: string): string {
    switch (status) {
      case 'idle': return 'Idle';
      case 'syncing': return 'Syncing...';
      case 'error': return 'Error';
      case 'scheduled': return 'Scheduled';
      default: return 'Unknown';
    }
  }

  private getNextSyncDisplay(): string {
    if (!this.statistics.nextSyncTime) return 'Not scheduled';
    return this.formatRelativeTime(this.statistics.nextSyncTime);
  }

  private formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
  }

  private formatRelativeTime(date: Date): string {
    const now = new Date();
    const diff = date.getTime() - now.getTime();
    const absDiff = Math.abs(diff);
    const future = diff > 0;
    
    if (absDiff < 60000) return future ? 'in a moment' : 'just now';
    if (absDiff < 3600000) {
      const minutes = Math.floor(absDiff / 60000);
      return future ? `in ${minutes}m` : `${minutes}m ago`;
    }
    
    const hours = Math.floor(absDiff / 3600000);
    return future ? `in ${hours}h` : `${hours}h ago`;
  }

  private formatDateTime(date: Date): string {
    return date.toLocaleString();
  }

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
      currentStatus: 'idle' as 'idle' | 'syncing' | 'error' | 'scheduled',
      nextSyncTime: null,
      errors: [],
      recentSyncs: []
    };
  }

  private refresh(): void {
    if (this.scheduler) {
      this.statistics = this.scheduler.getStatistics();
    }
    this.onOpen(); // Re-render
  }

  private startAutoRefresh(): void {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
    }
    
    this.refreshInterval = setInterval(() => {
      this.refresh();
    }, 5000);
  }

  private stopAutoRefresh(): void {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
  }

  private exportStatistics(): void {
    const stats = {
      exported: new Date().toISOString(),
      statistics: this.statistics
    };
    
    const json = JSON.stringify(stats, null, 2);
    navigator.clipboard.writeText(json);
    
    // Show notification
    const notification = this.contentEl.createDiv({ cls: 'export-notification' });
    notification.style.position = 'fixed';
    notification.style.top = '20px';
    notification.style.right = '20px';
    notification.style.padding = '1rem';
    notification.style.borderRadius = '0.5rem';
    notification.style.zIndex = '1000';
    
    const alert = new Alert(notification, {
      title: 'Success!',
      description: 'Statistics exported to clipboard',
      variant: 'success',
      icon: '✅',
      dismissible: true
    });
    alert.render();
    
    setTimeout(() => {
      notification.remove();
    }, 3000);
  }
}