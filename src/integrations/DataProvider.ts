import { JiraTicket } from '../models/JiraModels';
import { FieldMapper } from './FieldMapper';
import type JiraSyncProPlugin from '../main';

/**
 * Query options for data retrieval
 */
export interface DataQueryOptions {
  projectKey?: string;
  status?: string[];
  assignee?: string;
  labels?: string[];
  limit?: number;
  offset?: number;
  orderBy?: string;
  includeSubtasks?: boolean;
  updatedAfter?: Date;
  customJQL?: string;
}

/**
 * Cached data entry
 */
interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

/**
 * DataProvider - Unified data access layer for Jira data
 * Provides caching, query optimization, and data transformation
 */
export class DataProvider {
  private readonly cache: Map<string, CacheEntry<any>> = new Map();
  private defaultTTL: number = 5 * 60 * 1000; // 5 minutes default TTL
  private readonly plugin: JiraSyncProPlugin;
  private fieldMapper: FieldMapper;
  private readonly batchSize: number = 10; // Max tickets per batch request
  private cacheHits: number = 0;
  private cacheMisses: number = 0;

  constructor(plugin: JiraSyncProPlugin) {
    this.plugin = plugin;
    this.fieldMapper = new FieldMapper();
  }

  /**
   * Get a single ticket by key with optional field mapping
   */
  async getTicket(key: string, useCache: boolean = true, mapFields: boolean = false): Promise<JiraTicket | Record<string, any> | null> {
    const cacheKey = `ticket:${key}`;
    
    if (useCache) {
      const cached = this.getFromCache<JiraTicket>(cacheKey);
      if (cached) {
        this.cacheHits++;
        return mapFields ? this.fieldMapper.mapTicket(cached) : cached;
      }
    }

    this.cacheMisses++;

    try {
      // Fetch from Jira API through the plugin's existing infrastructure
      const ticket = await this.fetchTicketFromAPI(key);
      
      if (ticket) {
        this.setCache(cacheKey, ticket);
      }
      
      return ticket ? (mapFields ? this.fieldMapper.mapTicket(ticket) : ticket) : null;
    } catch (error) {
      console.error(`DataProvider: Failed to fetch ticket ${key}`, error);
      return null;
    }
  }

  /**
   * Get multiple tickets based on query options
   */
  async getTickets(options: DataQueryOptions = {}): Promise<JiraTicket[]> {
    const cacheKey = this.buildCacheKey('tickets', options);
    
    const cached = this.getFromCache<JiraTicket[]>(cacheKey);
    if (cached) return cached;

    try {
      const tickets = await this.fetchTicketsFromAPI(options);
      this.setCache(cacheKey, tickets);
      return tickets;
    } catch (error) {
      console.error('DataProvider: Failed to fetch tickets', error);
      return [];
    }
  }

  /**
   * Get tickets updated after a specific date
   */
  async getUpdatedTickets(since: Date): Promise<JiraTicket[]> {
    return this.getTickets({ updatedAfter: since });
  }

  /**
   * Get tickets by project
   */
  async getProjectTickets(projectKey: string): Promise<JiraTicket[]> {
    return this.getTickets({ projectKey });
  }

  /**
   * Get tickets assigned to a user
   */
  async getUserTickets(assignee: string): Promise<JiraTicket[]> {
    return this.getTickets({ assignee });
  }

  /**
   * Execute a custom JQL query
   */
  async queryTickets(jql: string): Promise<JiraTicket[]> {
    return this.getTickets({ customJQL: jql });
  }

  /**
   * Invalidate cache for a specific ticket
   */
  invalidateTicket(key: string): void {
    this.cache.delete(`ticket:${key}`);
    // Also invalidate any list caches that might contain this ticket
    this.invalidateListCaches();
  }

  /**
   * Invalidate all cached data
   */
  invalidateAll(): void {
    this.cache.clear();
  }

  /**
   * Update cache with new ticket data
   */
  updateCache(ticket: JiraTicket): void {
    const cacheKey = `ticket:${ticket.key}`;
    this.setCache(cacheKey, ticket);
    // Invalidate list caches as they might be stale
    this.invalidateListCaches();
  }

  /**
   * Batch update cache
   */
  updateBatchCache(tickets: JiraTicket[]): void {
    tickets.forEach(ticket => {
      const cacheKey = `ticket:${ticket.key}`;
      this.setCache(cacheKey, ticket);
    });
    this.invalidateListCaches();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; entries: number; hitRate: number } {
    const totalSize = Array.from(this.cache.values()).reduce((sum, entry) => {
      return sum + JSON.stringify(entry.data).length;
    }, 0);

    return {
      size: totalSize,
      entries: this.cache.size,
      hitRate: this.calculateHitRate()
    };
  }

  /**
   * Set cache TTL
   */
  setCacheTTL(ttl: number): void {
    this.defaultTTL = ttl;
  }

  // Private methods

  private async fetchTicketFromAPI(key: string): Promise<JiraTicket | null> {
    // This would integrate with the plugin's existing Jira API client
    // For now, return null as a placeholder
    // In production, this would call something like:
    // return this.plugin.jiraClient.getTicket(key);
    return null;
  }

  private async fetchTicketsFromAPI(options: DataQueryOptions): Promise<JiraTicket[]> {
    // This would integrate with the plugin's existing Jira API client
    // For now, return empty array as a placeholder
    // In production, this would build JQL and call:
    // return this.plugin.jiraClient.searchTickets(jql, options);
    return [];
  }

  private getFromCache<T>(key: string): T | null {
    const entry = this.cache.get(key);
    
    if (!entry) return null;
    
    const now = Date.now();
    if (now - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }
    
    return entry.data as T;
  }

  private setCache<T>(key: string, data: T, ttl?: number): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl: ttl || this.defaultTTL
    });
  }

  private buildCacheKey(prefix: string, options: DataQueryOptions): string {
    const parts = [prefix];
    
    if (options.projectKey) parts.push(`project:${options.projectKey}`);
    if (options.status) parts.push(`status:${options.status.join(',')}`);
    if (options.assignee) parts.push(`assignee:${options.assignee}`);
    if (options.labels) parts.push(`labels:${options.labels.join(',')}`);
    if (options.limit) parts.push(`limit:${options.limit}`);
    if (options.offset) parts.push(`offset:${options.offset}`);
    if (options.customJQL) parts.push(`jql:${options.customJQL}`);
    
    return parts.join(':');
  }

  private invalidateListCaches(): void {
    // Invalidate all cache entries that start with 'tickets:'
    Array.from(this.cache.keys()).forEach(key => {
      if (key.startsWith('tickets:')) {
        this.cache.delete(key);
      }
    });
  }

  private calculateHitRate(): number {
    const total = this.cacheHits + this.cacheMisses;
    if (total === 0) return 0;
    return (this.cacheHits / total) * 100;
  }

  /**
   * Get tickets in batches for optimization
   */
  async getBatchTickets(keys: string[]): Promise<JiraTicket[]> {
    const results: JiraTicket[] = [];
    const uncachedKeys: string[] = [];
    
    // Check cache first
    for (const key of keys) {
      const cached = this.getFromCache<JiraTicket>(`ticket:${key}`);
      if (cached) {
        this.cacheHits++;
        results.push(cached);
      } else {
        this.cacheMisses++;
        uncachedKeys.push(key);
      }
    }
    
    // Fetch uncached tickets in batches
    if (uncachedKeys.length > 0) {
      for (let i = 0; i < uncachedKeys.length; i += this.batchSize) {
        const batch = uncachedKeys.slice(i, i + this.batchSize);
        const tickets = await this.fetchBatchTicketsFromAPI(batch);
        tickets.forEach(ticket => {
          this.setCache(`ticket:${ticket.key}`, ticket);
          results.push(ticket);
        });
      }
    }
    
    return results;
  }

  /**
   * Fetch batch tickets from API
   */
  private async fetchBatchTicketsFromAPI(keys: string[]): Promise<JiraTicket[]> {
    // Build JQL for batch query
    const jql = `key in (${keys.join(',')})`;
    return this.fetchTicketsFromAPI({ customJQL: jql });
  }

  /**
   * Get mapped data for plugin consumption
   */
  async getMappedData(dataType: string, query?: any): Promise<any> {
    switch (dataType) {
      case 'ticket':
        if (query?.key) {
          return this.getTicket(query.key, true, true);
        }
        break;
        
      case 'tickets':
        const tickets = await this.getTickets(query);
        return this.fieldMapper.mapTickets(tickets);
        
      case 'project':
        return this.getProjectTickets(query?.projectKey);
        
      case 'user':
        return this.getUserTickets(query?.assignee);
        
      case 'jql':
        return this.queryTickets(query?.jql);
        
      default:
        throw new Error(`Unknown data type: ${dataType}`);
    }
  }

  /**
   * Configure field mapper
   */
  configureFieldMapper(jiraUrl: string): void {
    this.fieldMapper = new FieldMapper(jiraUrl);
  }

  /**
   * Register custom field mapping
   */
  registerCustomField(fieldId: string, definition: any, mapping?: any): void {
    this.fieldMapper.registerCustomField(fieldId, definition, mapping);
  }

  /**
   * Get field mapper instance
   */
  getFieldMapper(): FieldMapper {
    return this.fieldMapper;
  }

  /**
   * Clean up resources
   */
  cleanup(): void {
    this.cache.clear();
  }
}