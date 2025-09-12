/**
 * Bases API Adapter
 * Bridges between Obsidian's Base plugin API and our BaseOperationsClient
 * Provides integration layer for Base database operations
 */

import {
  BaseRecord,
  BaseSchema,
  BaseQuery,
  BaseQueryResult,
  BaseOperationResult,
} from '../types/base-types';

import {
  BaseOperationsClient,
  BaseConnection,
  createBaseConnection,
  validateBaseQuery,
  generateRecordId,
} from '../utils/base-operations';

export interface BasesApiConfig {
  obsidianApiEndpoint: string;
  workspaceId: string;
  authToken?: string;
  timeout?: number;
  retryAttempts?: number;
  rateLimitDelay?: number;
  enableCache?: boolean;
  cacheTimeout?: number;
}

export interface ObsidianBaseInfo {
  id: string;
  name: string;
  path: string;
  schema: BaseSchema;
  recordCount: number;
  lastModified: Date;
  isActive: boolean;
}

export interface ConnectionStatus {
  connected: boolean;
  apiVersion: string;
  basePluginVersion: string;
  workspaceId: string;
  availableBases: string[];
  lastChecked: Date;
  error?: string;
}

/**
 * Adapter for connecting to Obsidian's Base plugin API
 */
export class BasesApiAdapter {
  private config: BasesApiConfig;
  private client!: BaseOperationsClient;
  private cache = new Map<string, { data: any; timestamp: Date }>();
  private logger: Console;

  constructor(config: BasesApiConfig) {
    this.config = {
      timeout: 30000,
      retryAttempts: 3,
      rateLimitDelay: 1000,
      enableCache: true,
      cacheTimeout: 300000, // 5 minutes
      ...config,
    };

    this.logger = console;
    this.initializeClient();
  }

  /**
   * Initialize the BaseOperationsClient with Obsidian-specific configuration
   */
  private initializeClient(): void {
    const connection: BaseConnection = createBaseConnection(
      this.config.obsidianApiEndpoint,
      this.config.authToken || '',
      {
        timeout: this.config.timeout!,
        retryAttempts: this.config.retryAttempts!,
        rateLimitDelay: this.config.rateLimitDelay!,
      }
    );

    this.client = new BaseOperationsClient(connection);
  }

  /**
   * Test connection to Obsidian Base plugin
   */
  async testConnection(): Promise<BaseOperationResult<ConnectionStatus>> {
    try {
      this.logger.log('Testing connection to Obsidian Base plugin...');

      const healthResult = await this.client.testConnection();

      if (!healthResult.success) {
        return {
          success: false,
          errors: [
            {
              property: 'connection',
              message: 'Failed to connect to Obsidian Base plugin',
              code: 'CONNECTION_FAILED',
            },
          ],
        };
      }

      // Get available bases
      const basesResult = await this.getAvailableBases();
      const availableBases = basesResult.success ? basesResult.data! : [];

      const status: ConnectionStatus = {
        connected: true,
        apiVersion: healthResult.data?.version || '1.0.0',
        basePluginVersion: await this.getBasePluginVersion(),
        workspaceId: this.config.workspaceId,
        availableBases: availableBases.map(b => b.id),
        lastChecked: new Date(),
      };

      this.logger.log('Connection test successful:', status);

      return {
        success: true,
        data: status,
      };
    } catch (error) {
      this.logger.error('Connection test failed:', error);

      return {
        success: false,
        errors: [
          {
            property: 'connection',
            message: (error as Error)?.message || 'Unknown connection error',
            code: 'CONNECTION_ERROR',
          },
        ],
      };
    }
  }

  /**
   * Get all available bases in the workspace
   */
  async getAvailableBases(): Promise<BaseOperationResult<ObsidianBaseInfo[]>> {
    try {
      const cacheKey = `available_bases_${this.config.workspaceId}`;

      if (this.config.enableCache) {
        const cached = this.getCachedData(cacheKey);
        if (cached) {
          return {
            success: true,
            data: cached,
          };
        }
      }

      this.logger.log('Fetching available bases from workspace...');

      // Call Obsidian API to get workspace bases
      const response = await this.makeObsidianApiCall<{
        bases: Array<{
          id: string;
          name: string;
          path: string;
          recordCount: number;
          lastModified: string;
          isActive: boolean;
        }>;
      }>('GET', `/workspaces/${this.config.workspaceId}/bases`);

      if (!response.success) {
        return {
          success: false,
          errors: [
            {
              property: 'workspace',
              message: 'Failed to fetch available bases',
              code: 'FETCH_BASES_ERROR',
            },
          ],
        };
      }

      const bases: ObsidianBaseInfo[] = [];

      for (const baseInfo of response.data?.bases || []) {
        // Get schema for each base
        const schemaResult = await this.client.getBaseSchema(baseInfo.id);

        const base: ObsidianBaseInfo = {
          id: baseInfo.id,
          name: baseInfo.name,
          path: baseInfo.path,
          schema: schemaResult.success
            ? schemaResult.data!
            : this.createEmptySchema(baseInfo.id, baseInfo.name),
          recordCount: baseInfo.recordCount,
          lastModified: new Date(baseInfo.lastModified),
          isActive: baseInfo.isActive,
        };

        bases.push(base);
      }

      if (this.config.enableCache) {
        this.setCachedData(cacheKey, bases);
      }

      this.logger.log(`Found ${bases.length} available bases`);

      return {
        success: true,
        data: bases,
      };
    } catch (error) {
      return {
        success: false,
        errors: [
          {
            property: 'operation',
            message:
              (error as Error)?.message || 'Failed to get available bases',
            code: 'GET_BASES_ERROR',
          },
        ],
      };
    }
  }

  /**
   * Get schema for a specific base
   */
  async getBaseSchema(
    baseId: string
  ): Promise<BaseOperationResult<BaseSchema>> {
    try {
      const cacheKey = `schema_${baseId}`;

      if (this.config.enableCache) {
        const cached = this.getCachedData(cacheKey);
        if (cached) {
          return {
            success: true,
            data: cached,
          };
        }
      }

      this.logger.log(`Fetching schema for base: ${baseId}`);

      const result = await this.client.getBaseSchema(baseId);

      if (result.success && this.config.enableCache) {
        this.setCachedData(cacheKey, result.data);
      }

      return result;
    } catch (error) {
      return {
        success: false,
        errors: [
          {
            property: 'baseId',
            message: (error as Error)?.message || 'Failed to get base schema',
            code: 'GET_SCHEMA_ERROR',
          },
        ],
      };
    }
  }

  /**
   * Create a new record in a base
   */
  async createRecord(
    baseId: string,
    recordData: Partial<BaseRecord>
  ): Promise<BaseOperationResult<BaseRecord>> {
    try {
      this.logger.log(`Creating record in base: ${baseId}`);

      // Ensure record has required fields
      const fullRecord: Partial<BaseRecord> = {
        ...recordData,
        id: recordData.id || generateRecordId('obsidian'),
        baseId,
        createdAt: recordData.createdAt || new Date(),
        updatedAt: recordData.updatedAt || new Date(),
      };

      const result = await this.client.createRecord(baseId, fullRecord);

      if (result.success) {
        // Invalidate cache for this base
        this.invalidateBaseCache(baseId);

        this.logger.log(`Record created successfully: ${result.data?.id}`);
      }

      return result;
    } catch (error) {
      return {
        success: false,
        errors: [
          {
            property: 'record',
            message: (error as Error)?.message || 'Failed to create record',
            code: 'CREATE_RECORD_ERROR',
          },
        ],
      };
    }
  }

  /**
   * Update an existing record
   */
  async updateRecord(
    baseId: string,
    recordId: string,
    updates: Partial<BaseRecord>
  ): Promise<BaseOperationResult<BaseRecord>> {
    try {
      this.logger.log(`Updating record: ${recordId} in base: ${baseId}`);

      const result = await this.client.updateRecord(baseId, recordId, updates);

      if (result.success) {
        // Invalidate cache for this base
        this.invalidateBaseCache(baseId);

        this.logger.log(`Record updated successfully: ${recordId}`);
      }

      return result;
    } catch (error) {
      return {
        success: false,
        errors: [
          {
            property: 'record',
            message: (error as Error)?.message || 'Failed to update record',
            code: 'UPDATE_RECORD_ERROR',
          },
        ],
      };
    }
  }

  /**
   * Delete a record from a base
   */
  async deleteRecord(
    baseId: string,
    recordId: string
  ): Promise<BaseOperationResult<boolean>> {
    try {
      this.logger.log(`Deleting record: ${recordId} from base: ${baseId}`);

      const result = await this.client.deleteRecord(baseId, recordId);

      if (result.success) {
        // Invalidate cache for this base
        this.invalidateBaseCache(baseId);

        this.logger.log(`Record deleted successfully: ${recordId}`);
      }

      return result;
    } catch (error) {
      return {
        success: false,
        errors: [
          {
            property: 'record',
            message: (error as Error)?.message || 'Failed to delete record',
            code: 'DELETE_RECORD_ERROR',
          },
        ],
      };
    }
  }

  /**
   * Query records from a base
   */
  async queryRecords(
    query: BaseQuery
  ): Promise<BaseOperationResult<BaseQueryResult>> {
    try {
      this.logger.log(`Querying records in base: ${query.baseId}`);

      // Validate query before execution
      const queryErrors = validateBaseQuery(query);
      if (queryErrors.length > 0) {
        return {
          success: false,
          errors: queryErrors.map(error => ({
            property: 'query',
            message: error,
            code: 'INVALID_QUERY',
          })),
        };
      }

      const result = await this.client.queryRecords(query);

      if (result.success) {
        this.logger.log(
          `Query returned ${result.data?.records.length || 0} records`
        );
      }

      return result;
    } catch (error) {
      return {
        success: false,
        errors: [
          {
            property: 'query',
            message: (error as Error)?.message || 'Failed to query records',
            code: 'QUERY_RECORDS_ERROR',
          },
        ],
      };
    }
  }

  /**
   * Get a specific record by ID
   */
  async getRecord(
    baseId: string,
    recordId: string
  ): Promise<BaseOperationResult<BaseRecord>> {
    try {
      this.logger.log(`Getting record: ${recordId} from base: ${baseId}`);

      return await this.client.getRecord(baseId, recordId);
    } catch (error) {
      return {
        success: false,
        errors: [
          {
            property: 'record',
            message: (error as Error)?.message || 'Failed to get record',
            code: 'GET_RECORD_ERROR',
          },
        ],
      };
    }
  }

  /**
   * Batch create multiple records
   */
  async batchCreateRecords(
    baseId: string,
    records: Partial<BaseRecord>[]
  ): Promise<BaseOperationResult<BaseRecord[]>> {
    try {
      this.logger.log(
        `Batch creating ${records.length} records in base: ${baseId}`
      );

      // Ensure all records have required fields
      const fullRecords = records.map(record => ({
        ...record,
        id: record.id || generateRecordId('obsidian'),
        baseId,
        createdAt: record.createdAt || new Date(),
        updatedAt: record.updatedAt || new Date(),
      }));

      const result = await this.client.batchCreateRecords(baseId, fullRecords);

      if (result.success) {
        // Invalidate cache for this base
        this.invalidateBaseCache(baseId);

        this.logger.log(
          `Batch created ${result.data?.length || 0} records successfully`
        );
      }

      return result;
    } catch (error) {
      return {
        success: false,
        errors: [
          {
            property: 'records',
            message:
              (error as Error)?.message || 'Failed to batch create records',
            code: 'BATCH_CREATE_ERROR',
          },
        ],
      };
    }
  }

  /**
   * Batch update multiple records
   */
  async batchUpdateRecords(
    baseId: string,
    updates: Array<{ id: string; properties: Record<string, any> }>
  ): Promise<BaseOperationResult<BaseRecord[]>> {
    try {
      this.logger.log(
        `Batch updating ${updates.length} records in base: ${baseId}`
      );

      const result = await this.client.batchUpdateRecords(baseId, updates);

      if (result.success) {
        // Invalidate cache for this base
        this.invalidateBaseCache(baseId);

        this.logger.log(
          `Batch updated ${result.data?.length || 0} records successfully`
        );
      }

      return result;
    } catch (error) {
      return {
        success: false,
        errors: [
          {
            property: 'updates',
            message:
              (error as Error)?.message || 'Failed to batch update records',
            code: 'BATCH_UPDATE_ERROR',
          },
        ],
      };
    }
  }

  /**
   * Validate base configuration and connectivity
   */
  async validateConfiguration(): Promise<
    BaseOperationResult<{ valid: boolean; issues: string[] }>
  > {
    const issues: string[] = [];

    try {
      // Test basic connectivity
      const connectionResult = await this.testConnection();
      if (!connectionResult.success) {
        issues.push('Cannot connect to Obsidian Base plugin');
      }

      // Validate workspace access
      if (!this.config.workspaceId) {
        issues.push('Workspace ID is required');
      }

      // Test API endpoint
      if (!this.config.obsidianApiEndpoint) {
        issues.push('Obsidian API endpoint is required');
      }

      // Check Base plugin availability
      try {
        await this.getBasePluginVersion();
      } catch (error) {
        issues.push('Base plugin not available or incompatible version');
      }

      return {
        success: true,
        data: {
          valid: issues.length === 0,
          issues,
        },
      };
    } catch (error) {
      return {
        success: false,
        errors: [
          {
            property: 'configuration',
            message:
              (error as Error)?.message || 'Configuration validation failed',
            code: 'VALIDATION_ERROR',
          },
        ],
      };
    }
  }

  // Private helper methods

  private async makeObsidianApiCall<T>(
    method: string,
    endpoint: string,
    data?: any
  ): Promise<BaseOperationResult<T>> {
    try {
      const url = `${this.config.obsidianApiEndpoint}${endpoint}`;
      const options: RequestInit = {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: this.config.authToken
            ? `Bearer ${this.config.authToken}`
            : '',
          'User-Agent': 'BasesApiAdapter/1.0.0',
        },
        signal: AbortSignal.timeout(this.config.timeout!),
      };

      if (
        data &&
        (method === 'POST' || method === 'PATCH' || method === 'PUT')
      ) {
        options.body = JSON.stringify(data);
      }

      const response = await fetch(url, options);
      const responseData = await response.json();

      if (response.ok) {
        return {
          success: true,
          data: responseData,
        };
      } else {
        return {
          success: false,
          errors: [
            {
              property: 'api',
              message: responseData.error?.message || response.statusText,
              code: responseData.error?.code || `HTTP_${response.status}`,
            },
          ],
        };
      }
    } catch (error) {
      return {
        success: false,
        errors: [
          {
            property: 'network',
            message: (error as Error)?.message || 'Network request failed',
            code: 'NETWORK_ERROR',
          },
        ],
      };
    }
  }

  private async getBasePluginVersion(): Promise<string> {
    try {
      const response = await this.makeObsidianApiCall<{ version: string }>(
        'GET',
        '/plugins/base/version'
      );
      return response.success ? response.data?.version || '1.0.0' : '1.0.0';
    } catch (error) {
      this.logger.warn('Could not get Base plugin version:', error);
      return '1.0.0';
    }
  }

  private createEmptySchema(baseId: string, name: string): BaseSchema {
    return {
      id: baseId,
      name,
      description: 'Schema information not available',
      properties: [],
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  private getCachedData(key: string): any {
    if (!this.config.enableCache) return null;

    const cached = this.cache.get(key);
    if (!cached) return null;

    const now = new Date();
    const age = now.getTime() - cached.timestamp.getTime();

    if (age > this.config.cacheTimeout!) {
      this.cache.delete(key);
      return null;
    }

    return cached.data;
  }

  private setCachedData(key: string, data: any): void {
    if (!this.config.enableCache) return;

    this.cache.set(key, {
      data,
      timestamp: new Date(),
    });
  }

  private invalidateBaseCache(baseId: string): void {
    if (!this.config.enableCache) return;

    const keysToDelete: string[] = [];
    for (const key of this.cache.keys()) {
      if (key.includes(baseId) || key.includes('available_bases')) {
        keysToDelete.push(key);
      }
    }

    keysToDelete.forEach(key => this.cache.delete(key));
  }

  /**
   * Clear all cached data
   */
  clearCache(): void {
    this.cache.clear();
    this.logger.log('Cache cleared');
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; keys: string[]; memoryUsage: number } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys()),
      memoryUsage: JSON.stringify(Array.from(this.cache.entries())).length,
    };
  }

  /**
   * Dispose resources and cleanup
   */
  dispose(): void {
    this.clearCache();
    this.logger.log('BasesApiAdapter disposed');
  }
}

/**
 * Factory function to create a BasesApiAdapter with default configuration
 */
export function createBasesApiAdapter(
  obsidianApiEndpoint: string,
  workspaceId: string,
  authToken?: string
): BasesApiAdapter {
  const config: BasesApiConfig = {
    obsidianApiEndpoint,
    workspaceId,
    authToken: authToken || undefined,
    timeout: 30000,
    retryAttempts: 3,
    rateLimitDelay: 1000,
    enableCache: true,
    cacheTimeout: 300000,
  };

  return new BasesApiAdapter(config);
}

/**
 * Utility function to validate base configuration
 */
export function validateBasesApiConfig(config: BasesApiConfig): string[] {
  const errors: string[] = [];

  if (!config.obsidianApiEndpoint) {
    errors.push('Obsidian API endpoint is required');
  }

  if (!config.workspaceId) {
    errors.push('Workspace ID is required');
  }

  if (config.timeout && config.timeout < 1000) {
    errors.push('Timeout must be at least 1000ms');
  }

  if (config.retryAttempts && config.retryAttempts < 0) {
    errors.push('Retry attempts must be non-negative');
  }

  if (config.cacheTimeout && config.cacheTimeout < 60000) {
    errors.push('Cache timeout must be at least 60 seconds');
  }

  return errors;
}
