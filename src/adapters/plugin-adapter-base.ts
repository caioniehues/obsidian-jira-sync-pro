/**
 * PluginAdapterBase - Base interface for Obsidian plugin adapters
 * Defines the contract for converting Jira issues to plugin-specific formats
 */

import { JiraIssue, JiraPriority } from '../types/jira-types';
import { EventBus } from '../events/event-bus';

export interface AdapterConfig {
  enabled: boolean;
  pluginId: string;
  syncDirection: 'jira-to-plugin' | 'plugin-to-jira' | 'bidirectional';
  batchSize?: number;
  retryAttempts?: number;
  timeout?: number;
}

export interface ConversionResult<T = any> {
  success: boolean;
  data?: T;
  errors?: AdapterError[];
  warnings?: string[];
  metadata?: Record<string, any>;
}

export interface AdapterError {
  code: string;
  message: string;
  field?: string;
  retryable: boolean;
  context?: any;
}

export interface SyncContext {
  issueKey: string;
  operation: 'create' | 'update' | 'delete';
  source: 'jira' | 'plugin';
  timestamp: number;
  userId?: string;
  metadata?: Record<string, any>;
}

export interface AdapterMetrics {
  conversionsCount: number;
  averageConversionTime: number;
  errorRate: number;
  lastSyncTime: number;
  totalSyncedIssues: number;
}

export abstract class PluginAdapterBase<
  TPluginFormat = any,
  TPluginConfig extends AdapterConfig = AdapterConfig,
> {
  protected config: TPluginConfig;
  protected eventBus: EventBus;
  protected metrics: AdapterMetrics;
  protected logger: Console;

  constructor(config: TPluginConfig, eventBus: EventBus) {
    this.config = config;
    this.eventBus = eventBus;
    this.logger = console;
    this.metrics = {
      conversionsCount: 0,
      averageConversionTime: 0,
      errorRate: 0,
      lastSyncTime: 0,
      totalSyncedIssues: 0,
    };
  }

  /**
   * Initialize the adapter by setting up plugin connections and event listeners
   */
  abstract initialize(): Promise<void>;

  /**
   * Clean up resources and event listeners
   */
  abstract dispose(): Promise<void>;

  /**
   * Check if the target plugin is available and properly configured
   */
  abstract isPluginAvailable(): Promise<boolean>;

  /**
   * Convert a Jira issue to the plugin's native format
   */
  abstract convertFromJira(
    issue: JiraIssue,
    context?: SyncContext
  ): Promise<ConversionResult<TPluginFormat>>;

  /**
   * Convert from plugin format back to Jira update format
   */
  abstract convertToJira(
    pluginData: TPluginFormat,
    context?: SyncContext
  ): Promise<ConversionResult<Partial<JiraIssue>>>;

  /**
   * Apply the converted data to the target plugin
   */
  abstract applyToPlugin(
    data: TPluginFormat,
    context?: SyncContext
  ): Promise<ConversionResult<void>>;

  /**
   * Sync a single issue from Jira to the plugin
   */
  async syncIssueToPlugin(
    issue: JiraIssue,
    context?: SyncContext
  ): Promise<ConversionResult<void>> {
    const startTime = performance.now();

    try {
      this.logger.log(`Syncing issue ${issue.key} to ${this.config.pluginId}`);

      // Check if plugin is available
      const isAvailable = await this.isPluginAvailable();
      if (!isAvailable) {
        return {
          success: false,
          errors: [
            {
              code: 'PLUGIN_UNAVAILABLE',
              message: `Plugin ${this.config.pluginId} is not available`,
              retryable: true,
            },
          ],
        };
      }

      // Convert from Jira format
      const conversionResult = await this.convertFromJira(issue, context);
      if (!conversionResult.success) {
        return conversionResult;
      }

      // Apply to plugin
      const applyResult = await this.applyToPlugin(
        conversionResult.data!,
        context
      );

      // Update metrics
      const conversionTime = performance.now() - startTime;
      this.updateMetrics(conversionTime, applyResult.success);

      // Emit sync event
      this.eventBus.emit('adapter:sync:completed', {
        adapterId: this.config.pluginId,
        issueKey: issue.key,
        success: applyResult.success,
        conversionTime,
        context,
      });

      return applyResult;
    } catch (error) {
      this.logger.error(`Failed to sync issue ${issue.key}:`, error);

      const conversionTime = performance.now() - startTime;
      this.updateMetrics(conversionTime, false);

      return {
        success: false,
        errors: [
          {
            code: 'SYNC_ERROR',
            message: error.message || 'Unknown sync error',
            retryable: true,
            context: { issueKey: issue.key, error },
          },
        ],
      };
    }
  }

  /**
   * Sync multiple issues in batch
   */
  async syncIssuesToPlugin(
    issues: JiraIssue[],
    context?: SyncContext
  ): Promise<ConversionResult<void>[]> {
    const batchSize = this.config.batchSize || 10;
    const results: ConversionResult<void>[] = [];

    for (let i = 0; i < issues.length; i += batchSize) {
      const batch = issues.slice(i, i + batchSize);
      const batchPromises = batch.map(async issue =>
        this.syncIssueToPlugin(issue, context)
      );
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
    }

    return results;
  }

  /**
   * Get adapter configuration
   */
  getConfig(): TPluginConfig {
    return { ...this.config };
  }

  /**
   * Update adapter configuration
   */
  updateConfig(updates: Partial<TPluginConfig>): void {
    this.config = { ...this.config, ...updates };
    this.onConfigUpdated();
  }

  /**
   * Get adapter metrics
   */
  getMetrics(): AdapterMetrics {
    return { ...this.metrics };
  }

  /**
   * Reset adapter metrics
   */
  resetMetrics(): void {
    this.metrics = {
      conversionsCount: 0,
      averageConversionTime: 0,
      errorRate: 0,
      lastSyncTime: 0,
      totalSyncedIssues: 0,
    };
  }

  /**
   * Validate adapter configuration
   */
  protected validateConfig(): void {
    if (!this.config.pluginId) {
      throw new Error('Plugin ID is required');
    }
    if (
      !['jira-to-plugin', 'plugin-to-jira', 'bidirectional'].includes(
        this.config.syncDirection
      )
    ) {
      throw new Error('Invalid sync direction');
    }
  }

  /**
   * Hook called when configuration is updated
   */
  protected onConfigUpdated(): void {
    // Override in subclasses if needed
  }

  /**
   * Update performance metrics
   */
  private updateMetrics(conversionTime: number, success: boolean): void {
    this.metrics.conversionsCount += 1;
    this.metrics.lastSyncTime = Date.now();

    // Update average conversion time
    const totalTime =
      this.metrics.averageConversionTime * (this.metrics.conversionsCount - 1) +
      conversionTime;
    this.metrics.averageConversionTime =
      totalTime / this.metrics.conversionsCount;

    // Update error rate
    if (success) {
      this.metrics.totalSyncedIssues += 1;
    }
    this.metrics.errorRate =
      1 - this.metrics.totalSyncedIssues / this.metrics.conversionsCount;
  }
}

/**
 * Registry for managing plugin adapters
 */
export class AdapterRegistry {
  private readonly adapters: Map<string, PluginAdapterBase> = new Map();
  private readonly eventBus: EventBus;

  constructor(eventBus: EventBus) {
    this.eventBus = eventBus;
  }

  /**
   * Register a plugin adapter
   */
  register<T extends PluginAdapterBase>(adapter: T): void {
    this.adapters.set(adapter.getConfig().pluginId, adapter);
    console.log(`Registered adapter: ${adapter.getConfig().pluginId}`);
  }

  /**
   * Unregister a plugin adapter
   */
  unregister(pluginId: string): void {
    const adapter = this.adapters.get(pluginId);
    if (adapter) {
      adapter.dispose();
      this.adapters.delete(pluginId);
      console.log(`Unregistered adapter: ${pluginId}`);
    }
  }

  /**
   * Get a registered adapter
   */
  get<T extends PluginAdapterBase>(pluginId: string): T | undefined {
    return this.adapters.get(pluginId) as T | undefined;
  }

  /**
   * Get all registered adapters
   */
  getAll(): PluginAdapterBase[] {
    return Array.from(this.adapters.values());
  }

  /**
   * Get adapters filtered by sync direction
   */
  getByDirection(
    direction: AdapterConfig['syncDirection']
  ): PluginAdapterBase[] {
    return this.getAll().filter(
      adapter =>
        adapter.getConfig().syncDirection === direction ||
        adapter.getConfig().syncDirection === 'bidirectional'
    );
  }

  /**
   * Sync an issue to all compatible adapters
   */
  async syncIssueToAll(
    issue: JiraIssue,
    context?: SyncContext
  ): Promise<Map<string, ConversionResult<void>>> {
    const compatibleAdapters = this.getByDirection('jira-to-plugin');
    const results = new Map<string, ConversionResult<void>>();

    const syncPromises = compatibleAdapters.map(async adapter => {
      const result = await adapter.syncIssueToPlugin(issue, context);
      results.set(adapter.getConfig().pluginId, result);
    });

    await Promise.all(syncPromises);
    return results;
  }

  /**
   * Get aggregate metrics from all adapters
   */
  getAggregateMetrics(): AdapterMetrics {
    const allMetrics = this.getAll().map(adapter => adapter.getMetrics());

    if (allMetrics.length === 0) {
      return {
        conversionsCount: 0,
        averageConversionTime: 0,
        errorRate: 0,
        lastSyncTime: 0,
        totalSyncedIssues: 0,
      };
    }

    return {
      conversionsCount: allMetrics.reduce(
        (sum, m) => sum + m.conversionsCount,
        0
      ),
      averageConversionTime:
        allMetrics.reduce((sum, m) => sum + m.averageConversionTime, 0) /
        allMetrics.length,
      errorRate:
        allMetrics.reduce((sum, m) => sum + m.errorRate, 0) / allMetrics.length,
      lastSyncTime: Math.max(...allMetrics.map(m => m.lastSyncTime)),
      totalSyncedIssues: allMetrics.reduce(
        (sum, m) => sum + m.totalSyncedIssues,
        0
      ),
    };
  }

  /**
   * Dispose all adapters
   */
  async dispose(): Promise<void> {
    const disposePromises = this.getAll().map(async adapter => adapter.dispose());
    await Promise.all(disposePromises);
    this.adapters.clear();
  }
}
