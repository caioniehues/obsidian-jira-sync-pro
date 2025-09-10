import { Plugin } from 'obsidian';
import { JQLQueryEngine } from './jql-query-engine';

/**
 * Configuration for the auto-sync scheduler
 */
export interface AutoSyncConfig {
  enabled: boolean;
  jqlQuery: string;
  syncInterval: number; // minutes
  maxResults: number;
  batchSize: number;
}

/**
 * Sync callback options
 */
export interface SyncCallbackOptions {
  isManual: boolean;
  isInitial: boolean;
}

/**
 * Sync state for persistence
 */
export interface SyncState {
  lastSyncTime: string | null;
  lastSyncStatus: 'success' | 'failure' | 'in-progress' | null;
  totalSyncCount: number;
  failureCount: number;
  successfulSyncCount?: number;
  failedSyncCount?: number;
  syncDurations?: number[];
}

/**
 * Sync statistics for monitoring
 */
export interface SyncStatistics {
  totalSyncs: number;
  successfulSyncs: number;
  failedSyncs: number;
  lastSyncTime: string | null;
  averageSyncDuration: number;
  currentStatus: 'idle' | 'syncing' | 'error';
}

/**
 * Auto-sync scheduler for periodic JQL query execution
 */
export class AutoSyncScheduler {
  private plugin: Plugin;
  private queryEngine: JQLQueryEngine;
  private config: AutoSyncConfig;
  private syncCallback: (options: SyncCallbackOptions) => Promise<void>;
  private intervalId: NodeJS.Timeout | null = null;
  private retryTimeoutId: NodeJS.Timeout | null = null;
  private running: boolean = false;
  private syncing: boolean = false;
  private state: SyncState;
  private syncStartTime: number = 0;

  constructor(
    plugin: Plugin,
    queryEngine: JQLQueryEngine,
    config: AutoSyncConfig,
    syncCallback: (options: SyncCallbackOptions) => Promise<void>
  ) {
    this.plugin = plugin;
    this.queryEngine = queryEngine;
    this.config = config;
    this.syncCallback = syncCallback;
    this.state = this.getInitialState();
  }

  /**
   * Starts the auto-sync scheduler
   */
  async start(): Promise<void> {
    // Prevent multiple starts
    if (this.running) {
      return;
    }

    this.running = true;

    // Perform immediate sync on start (don't await to avoid blocking)
    this.performSync(false, true).catch(error => {
      console.error('Initial sync failed:', error);
    });

    // Set up periodic sync
    this.scheduleNextSync();
  }

  /**
   * Stops the auto-sync scheduler
   */
  stop(): void {
    this.running = false;

    // Clear any existing intervals
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    // Clear any retry timeouts
    if (this.retryTimeoutId) {
      clearTimeout(this.retryTimeoutId);
      this.retryTimeoutId = null;
    }
  }

  /**
   * Checks if the scheduler is currently running
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Updates the sync interval (in minutes)
   */
  updateInterval(minutes: number): void {
    // Validate interval
    if (minutes < 1 || minutes > 60) {
      throw new Error('Sync interval must be between 1 and 60 minutes');
    }

    // Update config
    this.config.syncInterval = minutes;

    // If running, restart with new interval
    if (this.running) {
      // Clear existing interval
      if (this.intervalId) {
        clearInterval(this.intervalId);
        this.intervalId = null;
      }
      // Schedule with new interval
      this.scheduleNextSync();
    }
  }

  /**
   * Triggers a manual sync
   */
  async triggerManualSync(): Promise<void> {
    // Prevent concurrent manual syncs by checking if already syncing
    if (this.syncing) {
      return;
    }
    await this.performSync(true, false);
  }

  /**
   * Gets the current failure count
   */
  getFailureCount(): number {
    return this.state.failureCount;
  }

  /**
   * Gets the current retry delay in milliseconds
   */
  getRetryDelay(): number {
    // Exponential backoff with cap at 30 minutes
    const baseDelay = 60 * 1000; // 1 minute
    const maxDelay = 30 * 60 * 1000; // 30 minutes
    const exponentialDelay = baseDelay * Math.pow(2, this.state.failureCount);
    return Math.min(exponentialDelay, maxDelay);
  }

  /**
   * Sets the sync state
   */
  setState(state: Partial<SyncState>): void {
    this.state = { ...this.state, ...state };
  }

  /**
   * Gets the current sync state
   */
  getState(): SyncState {
    return { ...this.state };
  }

  /**
   * Saves the sync state to plugin data
   */
  async saveState(): Promise<void> {
    const data = await this.plugin.loadData() || {};
    data.syncState = this.state;
    await this.plugin.saveData(data);
  }

  /**
   * Loads the sync state from plugin data
   */
  async loadState(): Promise<void> {
    const data = await this.plugin.loadData() || {};
    if (data.syncState) {
      this.state = { ...this.getInitialState(), ...data.syncState };
    }
  }

  /**
   * Updates the scheduler configuration
   */
  updateConfig(config: AutoSyncConfig): void {
    const wasEnabled = this.config.enabled && this.running;
    const intervalChanged = this.config.syncInterval !== config.syncInterval;
    
    this.config = config;

    // Handle enable/disable
    if (!config.enabled && this.running) {
      this.stop();
    } else if (config.enabled && !this.running) {
      this.start();
    } else if (intervalChanged && this.running) {
      // Restart with new interval
      this.stop();
      this.start();
    }
  }

  /**
   * Gets the current configuration
   */
  getConfig(): AutoSyncConfig {
    return { ...this.config };
  }

  /**
   * Gets sync statistics
   */
  getStatistics(): SyncStatistics {
    const durations = this.state.syncDurations || [];
    const averageDuration = durations.length > 0
      ? durations.reduce((a, b) => a + b, 0) / durations.length
      : 0;

    let currentStatus: 'idle' | 'syncing' | 'error' = 'idle';
    if (this.syncing) {
      currentStatus = 'syncing';
    } else if (this.state.failureCount > 0) {
      currentStatus = 'error';
    }

    return {
      totalSyncs: this.state.totalSyncCount,
      successfulSyncs: this.state.successfulSyncCount || 0,
      failedSyncs: this.state.failedSyncCount || 0,
      lastSyncTime: this.state.lastSyncTime,
      averageSyncDuration: averageDuration,
      currentStatus
    };
  }

  /**
   * Performs a sync operation
   */
  private async performSync(isManual: boolean, isInitial: boolean): Promise<void> {
    // Prevent concurrent syncs
    if (this.syncing) {
      return;
    }

    this.syncing = true;
    this.syncStartTime = Date.now();
    this.state.lastSyncStatus = 'in-progress';

    try {
      // Execute the sync callback
      await this.syncCallback({ isManual, isInitial });

      // Update success state
      this.state.lastSyncTime = new Date().toISOString();
      this.state.lastSyncStatus = 'success';
      this.state.totalSyncCount++;
      this.state.successfulSyncCount = (this.state.successfulSyncCount || 0) + 1;
      this.state.failureCount = 0; // Reset failure count on success

      // Track sync duration
      const duration = Date.now() - this.syncStartTime;
      this.updateSyncDurations(duration);

      // Save state after successful sync
      await this.saveState();

    } catch (error) {
      // Update failure state
      this.state.lastSyncStatus = 'failure';
      this.state.totalSyncCount++;
      this.state.failedSyncCount = (this.state.failedSyncCount || 0) + 1;
      this.state.failureCount++;

      // Save state after failed sync
      await this.saveState();

      // Schedule retry with exponential backoff for automatic syncs only
      if (this.running && !isManual) {
        this.scheduleRetry();
      }

      // Log error for debugging
      console.error('Sync failed:', error);
    } finally {
      this.syncing = false;
    }
  }

  /**
   * Schedules the next regular sync
   */
  private scheduleNextSync(): void {
    // Clear existing interval
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    // Set up new interval
    const intervalMs = this.config.syncInterval * 60 * 1000;
    this.intervalId = setInterval(() => {
      // Don't await, let it run async
      this.performSync(false, false).catch(error => {
        console.error('Scheduled sync failed:', error);
      });
    }, intervalMs);
  }

  /**
   * Schedules a retry after failure with exponential backoff
   */
  private scheduleRetry(): void {
    // Clear existing retry timeout
    if (this.retryTimeoutId) {
      clearTimeout(this.retryTimeoutId);
      this.retryTimeoutId = null;
    }

    // Don't schedule retry if not running
    if (!this.running) {
      return;
    }

    const retryDelay = this.getRetryDelay();
    this.retryTimeoutId = setTimeout(() => {
      this.retryTimeoutId = null;
      this.performSync(false, false);
    }, retryDelay);
  }

  /**
   * Updates the sync duration tracking
   */
  private updateSyncDurations(duration: number): void {
    if (!this.state.syncDurations) {
      this.state.syncDurations = [];
    }

    // Keep last 10 durations for averaging
    this.state.syncDurations.push(duration);
    if (this.state.syncDurations.length > 10) {
      this.state.syncDurations.shift();
    }
  }

  /**
   * Gets the initial state
   */
  private getInitialState(): SyncState {
    return {
      lastSyncTime: null,
      lastSyncStatus: null,
      totalSyncCount: 0,
      failureCount: 0,
      successfulSyncCount: 0,
      failedSyncCount: 0,
      syncDurations: []
    };
  }
}