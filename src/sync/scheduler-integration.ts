/**
 * Auto-Sync Scheduler Integration Helper
 * 
 * This module provides integration utilities for connecting the AutoSyncScheduler
 * with the Obsidian plugin lifecycle, settings management, and UI components.
 * 
 * Key features:
 * - Plugin lifecycle integration (onload/onunload)
 * - Settings persistence and validation
 * - Status monitoring and UI updates
 * - Error notification handling
 */

import { Plugin, Notice, TFile } from 'obsidian';
import { AutoSyncScheduler, AutoSyncConfig, AutoSyncStatus, AutoSyncResult } from './auto-sync-scheduler';
import { JiraClient, JiraClientConfig } from '../jira-bases-adapter/jira-client';
import { SyncProgress, SyncPhase } from '../enhanced-sync/sync-progress-model';

// ============================================================================
// Integration Configuration
// ============================================================================

/**
 * Plugin integration configuration
 */
export interface SchedulerIntegrationConfig {
  // Plugin settings
  settingsFile?: string;            // Settings file name (default: 'auto-sync-settings.json')
  statusUpdateInterval?: number;    // UI update interval in ms (default: 1000)
  
  // Notification settings
  enableSuccessNotifications?: boolean;  // Show success notifications (default: false)
  enableErrorNotifications?: boolean;    // Show error notifications (default: true)
  enableProgressNotifications?: boolean; // Show progress updates (default: false)
  
  // Performance settings
  memoryCheckInterval?: number;     // Memory check interval in ms (default: 5000)
  maxLogEntries?: number;          // Maximum log entries to keep (default: 100)
}

const DEFAULT_INTEGRATION_CONFIG: Required<SchedulerIntegrationConfig> = {
  settingsFile: 'auto-sync-settings.json',
  statusUpdateInterval: 1000,
  enableSuccessNotifications: false,
  enableErrorNotifications: true,
  enableProgressNotifications: false,
  memoryCheckInterval: 5000,
  maxLogEntries: 100
};

// ============================================================================
// Plugin Integration Manager
// ============================================================================

/**
 * Manages integration between AutoSyncScheduler and Obsidian plugin
 */
export class SchedulerIntegration {
  private readonly plugin: Plugin;
  private scheduler: AutoSyncScheduler | null = null;
  private readonly jiraClient: JiraClient;
  private readonly config: Required<SchedulerIntegrationConfig>;
  
  // State tracking
  private statusUpdateTimer: NodeJS.Timeout | null = null;
  private lastNotificationTime: number = 0;
  private isShuttingDown: boolean = false;
  
  // Status callbacks for UI integration
  private statusCallbacks: Array<(status: AutoSyncStatus) => void> = [];
  private progressCallbacks: Array<(progress: SyncProgress) => void> = [];
  
  constructor(
    plugin: Plugin,
    jiraClient: JiraClient,
    integrationConfig?: Partial<SchedulerIntegrationConfig>
  ) {
    this.plugin = plugin;
    this.jiraClient = jiraClient;
    this.config = { ...DEFAULT_INTEGRATION_CONFIG, ...integrationConfig };
    
    console.log('SchedulerIntegration initialized');
  }
  
  // ============================================================================
  // Plugin Lifecycle Integration
  // ============================================================================
  
  /**
   * Initializes the scheduler integration (call from plugin.onload())
   */
  async initialize(): Promise<void> {
    console.log('Initializing scheduler integration...');
    
    try {
      // Load scheduler configuration
      const autoSyncConfig = await this.loadSchedulerConfig();
      
      // Create and configure scheduler
      this.scheduler = new AutoSyncScheduler(this.jiraClient, autoSyncConfig);
      
      // Set up callbacks
      this.scheduler.setProgressCallback((progress: SyncProgress) => {
        this.handleProgressUpdate(progress);
      });
      
      this.scheduler.setCompletionCallback((result: AutoSyncResult) => {
        this.handleSyncCompletion(result);
      });
      
      // Start status monitoring
      this.startStatusMonitoring();
      
      // Start scheduler if enabled
      if (autoSyncConfig.enableAutoSync) {
        await this.scheduler.start();
      }
      
      console.log('Scheduler integration initialized successfully');
      
    } catch (error) {
      console.error('Failed to initialize scheduler integration:', error);
      this.showErrorNotification('Failed to initialize auto-sync scheduler', error);
      throw error;
    }
  }
  
  /**
   * Shuts down the scheduler integration (call from plugin.onunload())
   */
  async shutdown(): Promise<void> {
    console.log('Shutting down scheduler integration...');
    
    this.isShuttingDown = true;
    
    try {
      // Stop status monitoring
      if (this.statusUpdateTimer) {
        clearInterval(this.statusUpdateTimer);
        this.statusUpdateTimer = null;
      }
      
      // Stop scheduler
      if (this.scheduler) {
        await this.scheduler.stop();
        this.scheduler = null;
      }
      
      // Clear callbacks
      this.statusCallbacks = [];
      this.progressCallbacks = [];
      
      console.log('Scheduler integration shut down successfully');
      
    } catch (error) {
      console.error('Error during scheduler shutdown:', error);
    } finally {
      this.isShuttingDown = false;
    }
  }
  
  // ============================================================================
  // Configuration Management
  // ============================================================================
  
  /**
   * Updates scheduler configuration and persists to disk
   */
  async updateSchedulerConfig(newConfig: Partial<AutoSyncConfig>): Promise<void> {
    if (!this.scheduler) {
      throw new Error('Scheduler not initialized');
    }
    
    try {
      // Update scheduler
      this.scheduler.updateConfig(newConfig);
      
      // Get current config
      const currentStatus = this.scheduler.getStatus();
      const configToSave = { ...await this.loadSchedulerConfig(), ...newConfig };
      
      // Save to disk
      await this.saveSchedulerConfig(configToSave);
      
      console.log('Scheduler configuration updated');
      
    } catch (error) {
      console.error('Failed to update scheduler configuration:', error);
      throw error;
    }
  }
  
  /**
   * Loads scheduler configuration from plugin data
   */
  async loadSchedulerConfig(): Promise<AutoSyncConfig> {
    try {
      const data = await this.plugin.loadData();
      return data?.autoSyncConfig || this.getDefaultSchedulerConfig();
    } catch (error) {
      console.warn('Failed to load scheduler config, using defaults:', error);
      return this.getDefaultSchedulerConfig();
    }
  }
  
  /**
   * Saves scheduler configuration to plugin data
   */
  async saveSchedulerConfig(config: AutoSyncConfig): Promise<void> {
    try {
      const data = await this.plugin.loadData() || {};
      data.autoSyncConfig = config;
      await this.plugin.saveData(data);
    } catch (error) {
      console.error('Failed to save scheduler config:', error);
      throw error;
    }
  }
  
  /**
   * Gets default scheduler configuration
   */
  private getDefaultSchedulerConfig(): AutoSyncConfig {
    return {
      intervalMinutes: 15,
      enableAutoSync: false, // Disabled by default until configured
      jql: 'assignee = currentUser() AND status != Done',
      maxResults: 500,
      batchSize: 25,
      maxRetries: 3,
      retryBackoffMultiplier: 2.0,
      maxRetryDelayMinutes: 15,
      memoryLimitMB: 50,
      timeoutMinutes: 10
    };
  }
  
  // ============================================================================
  // Manual Operations
  // ============================================================================
  
  /**
   * Triggers a manual sync operation
   */
  async triggerManualSync(): Promise<AutoSyncResult> {
    if (!this.scheduler) {
      throw new Error('Scheduler not initialized');
    }
    
    try {
      this.showProgressNotification('Starting manual sync...');
      
      const result = await this.scheduler.triggerManualSync();
      
      if (result.success) {
        this.showSuccessNotification(
          `Manual sync completed: ${result.ticketsProcessed} tickets processed`
        );
      } else {
        this.showErrorNotification('Manual sync failed', result.error);
      }
      
      return result;
      
    } catch (error) {
      this.showErrorNotification('Failed to start manual sync', error);
      throw error;
    }
  }
  
  /**
   * Cancels the current sync operation
   */
  async cancelCurrentSync(): Promise<void> {
    if (!this.scheduler) {
      throw new Error('Scheduler not initialized');
    }
    
    try {
      await this.scheduler.cancelCurrentSync();
      this.showProgressNotification('Sync operation cancelled');
    } catch (error) {
      console.error('Failed to cancel sync:', error);
      throw error;
    }
  }
  
  /**
   * Gets current scheduler status
   */
  getStatus(): AutoSyncStatus | null {
    return this.scheduler?.getStatus() || null;
  }
  
  // ============================================================================
  // Callback Registration
  // ============================================================================
  
  /**
   * Registers a callback for status updates
   */
  onStatusUpdate(callback: (status: AutoSyncStatus) => void): void {
    this.statusCallbacks.push(callback);
  }
  
  /**
   * Registers a callback for progress updates
   */
  onProgressUpdate(callback: (progress: SyncProgress) => void): void {
    this.progressCallbacks.push(callback);
  }
  
  /**
   * Removes a status update callback
   */
  removeStatusCallback(callback: (status: AutoSyncStatus) => void): void {
    const index = this.statusCallbacks.indexOf(callback);
    if (index >= 0) {
      this.statusCallbacks.splice(index, 1);
    }
  }
  
  /**
   * Removes a progress update callback
   */
  removeProgressCallback(callback: (progress: SyncProgress) => void): void {
    const index = this.progressCallbacks.indexOf(callback);
    if (index >= 0) {
      this.progressCallbacks.splice(index, 1);
    }
  }
  
  // ============================================================================
  // Event Handling
  // ============================================================================
  
  /**
   * Handles progress updates from scheduler
   */
  private handleProgressUpdate(progress: SyncProgress): void {
    // Notify registered callbacks
    this.progressCallbacks.forEach(callback => {
      try {
        callback(progress);
      } catch (error) {
        console.error('Progress callback error:', error);
      }
    });
    
    // Show progress notification if enabled
    if (this.config.enableProgressNotifications) {
      const percentage = progress.total > 0 
        ? Math.round((progress.current / progress.total) * 100)
        : 0;
      
      this.showProgressNotification(
        `Sync progress: ${percentage}% (${progress.current}/${progress.total}) - ${progress.phase}`
      );
    }
  }
  
  /**
   * Handles sync completion
   */
  private handleSyncCompletion(result: AutoSyncResult): void {
    if (result.success) {
      if (this.config.enableSuccessNotifications) {
        const message = result.wasManualTrigger 
          ? `Manual sync completed: ${result.ticketsProcessed} tickets`
          : `Auto-sync completed: ${result.ticketsProcessed} tickets`;
        
        this.showSuccessNotification(message);
      }
    } else {
      if (this.config.enableErrorNotifications) {
        const message = result.wasManualTrigger 
          ? 'Manual sync failed'
          : 'Auto-sync failed';
        
        this.showErrorNotification(message, result.error);
      }
    }
    
    console.log(`Sync completed: ${JSON.stringify(result)}`);
  }
  
  // ============================================================================
  // Status Monitoring
  // ============================================================================
  
  /**
   * Starts periodic status monitoring for UI updates
   */
  private startStatusMonitoring(): void {
    this.statusUpdateTimer = setInterval(() => {
      if (this.scheduler && !this.isShuttingDown) {
        const status = this.scheduler.getStatus();
        
        // Notify registered callbacks
        this.statusCallbacks.forEach(callback => {
          try {
            callback(status);
          } catch (error) {
            console.error('Status callback error:', error);
          }
        });
      }
    }, this.config.statusUpdateInterval);
  }
  
  // ============================================================================
  // Notification Helpers
  // ============================================================================
  
  /**
   * Shows a success notification
   */
  private showSuccessNotification(message: string): void {
    if (this.config.enableSuccessNotifications) {
      new Notice(`✅ ${message}`, 5000);
    }
    console.log(`SUCCESS: ${message}`);
  }
  
  /**
   * Shows an error notification
   */
  private showErrorNotification(message: string, error?: any): void {
    if (this.config.enableErrorNotifications) {
      const errorText = error?.message || error?.toString() || '';
      const fullMessage = errorText ? `${message}: ${errorText}` : message;
      new Notice(`❌ ${fullMessage}`, 10000);
    }
    
    console.error(`ERROR: ${message}`, error);
  }
  
  /**
   * Shows a progress notification (temporary)
   */
  private showProgressNotification(message: string): void {
    // Throttle progress notifications to avoid spam
    const now = Date.now();
    if (now - this.lastNotificationTime < 2000) { // Max one every 2 seconds
      return;
    }
    this.lastNotificationTime = now;
    
    if (this.config.enableProgressNotifications) {
      new Notice(`⏳ ${message}`, 3000);
    }
    console.log(`PROGRESS: ${message}`);
  }
}

// ============================================================================
// Utility Functions for Plugin Integration
// ============================================================================

/**
 * Validates Jira client configuration
 */
export function validateJiraConfig(config: JiraClientConfig): string[] {
  const errors: string[] = [];
  
  if (!config.baseUrl || config.baseUrl.trim().length === 0) {
    errors.push('Base URL is required');
  } else if (!config.baseUrl.startsWith('http')) {
    errors.push('Base URL must start with http:// or https://');
  }
  
  if (!config.email || config.email.trim().length === 0) {
    errors.push('Email is required');
  } else if (!config.email.includes('@')) {
    errors.push('Email must be a valid email address');
  }
  
  if (!config.apiToken || config.apiToken.trim().length === 0) {
    errors.push('API token is required');
  }
  
  return errors;
}

/**
 * Creates a human-readable status summary
 */
export function formatStatusSummary(status: AutoSyncStatus): string {
  const parts: string[] = [];
  
  parts.push(`Status: ${status.isEnabled ? 'Enabled' : 'Disabled'}`);
  
  if (status.isRunning) {
    parts.push('Running');
  }
  
  if (status.nextSyncTime) {
    const nextSync = new Date(status.nextSyncTime);
    parts.push(`Next: ${nextSync.toLocaleTimeString()}`);
  }
  
  if (status.lastSyncTime) {
    const lastSync = new Date(status.lastSyncTime);
    parts.push(`Last: ${lastSync.toLocaleTimeString()}`);
  }
  
  parts.push(`Total: ${status.totalSyncsCompleted} syncs`);
  parts.push(`Processed: ${status.totalTicketsProcessed} tickets`);
  
  if (status.totalErrors > 0) {
    parts.push(`Errors: ${status.totalErrors}`);
  }
  
  return parts.join(' | ');
}

/**
 * Formats sync duration for display
 */
export function formatDuration(milliseconds: number): string {
  const seconds = Math.round(milliseconds / 1000);
  
  if (seconds < 60) {
    return `${seconds}s`;
  }
  
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  
  return `${minutes}m ${remainingSeconds}s`;
}