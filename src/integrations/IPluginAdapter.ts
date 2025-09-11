import { EventBus } from './EventBus';
import { DataProvider } from './DataProvider';
import { JiraTicket } from '../models/JiraModels';
import type JiraSyncProPlugin from '../main';

/**
 * Lifecycle states for plugin adapters
 */
export enum AdapterState {
  UNINITIALIZED = 'uninitialized',
  INITIALIZING = 'initializing',
  READY = 'ready',
  ACTIVE = 'active',
  PAUSED = 'paused',
  ERROR = 'error',
  CLEANING_UP = 'cleaning_up',
  CLEANED_UP = 'cleaned_up'
}

/**
 * Adapter capabilities that plugins can support
 */
export interface AdapterCapabilities {
  read: boolean;
  write: boolean;
  sync: boolean;
  bulkOperations: boolean;
  realtime: boolean;
  customFields: boolean;
  conflictResolution: boolean;
  [key: string]: boolean;
}

/**
 * Adapter metadata for registry
 */
export interface AdapterMetadata {
  id: string;
  name: string;
  version: string;
  minJiraPluginVersion: string;
  maxJiraPluginVersion?: string;
  capabilities: AdapterCapabilities;
  dependencies?: string[];
  priority?: number;
}

/**
 * Health check result
 */
export interface HealthCheckResult {
  healthy: boolean;
  state: AdapterState;
  lastActivity?: number;
  errors?: string[];
  warnings?: string[];
  metrics?: {
    eventsProcessed?: number;
    syncedTickets?: number;
    errorRate?: number;
  };
}

/**
 * Base interface for all plugin adapters
 */
export interface IPluginAdapter {
  // Metadata
  readonly metadata: AdapterMetadata;
  
  // Current state
  state: AdapterState;
  
  // Lifecycle methods
  initialize(plugin: JiraSyncProPlugin, eventBus: EventBus, dataProvider: DataProvider): Promise<void>;
  activate(): Promise<void>;
  deactivate(): Promise<void>;
  cleanup(): Promise<void>;
  
  // Health monitoring
  healthCheck(): Promise<HealthCheckResult>;
  
  // Event handlers
  handleEvent(event: string, payload: any): Promise<void>;
  
  // Data synchronization (optional)
  sync?(tickets: JiraTicket[]): Promise<void>;
  onTicketsSynced?(tickets: JiraTicket[]): void;
  onTicketUpdated?(ticket: JiraTicket): void;
  onTicketDeleted?(ticketKey: string): void;
  
  // Capability checks
  supportsCapability(capability: string): boolean;
  getRequiredPermissions(): string[];
  
  // Error recovery
  onError?(error: Error, context?: any): void;
  recover?(): Promise<boolean>;
}

/**
 * Abstract base class for plugin adapters
 */
export abstract class BasePluginAdapter implements IPluginAdapter {
  abstract readonly metadata: AdapterMetadata;
  state: AdapterState = AdapterState.UNINITIALIZED;
  
  protected plugin: JiraSyncProPlugin | null = null;
  protected eventBus: EventBus | null = null;
  protected dataProvider: DataProvider | null = null;
  protected lastActivity: number = Date.now();
  protected errorCount: number = 0;
  protected metrics = {
    eventsProcessed: 0,
    syncedTickets: 0,
    errorRate: 0
  };
  
  async initialize(plugin: JiraSyncProPlugin, eventBus: EventBus, dataProvider: DataProvider): Promise<void> {
    this.state = AdapterState.INITIALIZING;
    this.plugin = plugin;
    this.eventBus = eventBus;
    this.dataProvider = dataProvider;
    
    try {
      await this.onInitialize();
      this.state = AdapterState.READY;
      console.log(`Adapter ${this.metadata.id} initialized successfully`);
    } catch (error) {
      this.state = AdapterState.ERROR;
      console.error(`Failed to initialize adapter ${this.metadata.id}:`, error);
      throw error;
    }
  }
  
  async activate(): Promise<void> {
    if (this.state !== AdapterState.READY && this.state !== AdapterState.PAUSED) {
      throw new Error(`Cannot activate adapter in state: ${this.state}`);
    }
    
    this.state = AdapterState.ACTIVE;
    await this.onActivate();
    this.lastActivity = Date.now();
  }
  
  async deactivate(): Promise<void> {
    if (this.state !== AdapterState.ACTIVE) {
      return;
    }
    
    this.state = AdapterState.PAUSED;
    await this.onDeactivate();
  }
  
  async cleanup(): Promise<void> {
    this.state = AdapterState.CLEANING_UP;
    
    try {
      await this.onCleanup();
      this.plugin = null;
      this.eventBus = null;
      this.dataProvider = null;
      this.state = AdapterState.CLEANED_UP;
    } catch (error) {
      console.error(`Error during cleanup of adapter ${this.metadata.id}:`, error);
      throw error;
    }
  }
  
  async healthCheck(): Promise<HealthCheckResult> {
    const baseHealth: HealthCheckResult = {
      healthy: this.state === AdapterState.ACTIVE || this.state === AdapterState.READY,
      state: this.state,
      lastActivity: this.lastActivity,
      metrics: { ...this.metrics }
    };
    
    // Allow subclasses to add custom health checks
    return this.onHealthCheck(baseHealth);
  }
  
  async handleEvent(event: string, payload: any): Promise<void> {
    this.lastActivity = Date.now();
    this.metrics.eventsProcessed++;
    
    try {
      await this.onHandleEvent(event, payload);
    } catch (error) {
      this.errorCount++;
      this.metrics.errorRate = this.errorCount / this.metrics.eventsProcessed;
      
      if (this.onError) {
        this.onError(error as Error, { event, payload });
      } else {
        console.error(`Error handling event ${event} in adapter ${this.metadata.id}:`, error);
      }
      
      throw error;
    }
  }
  
  supportsCapability(capability: string): boolean {
    return this.metadata.capabilities[capability] === true;
  }
  
  getRequiredPermissions(): string[] {
    const permissions: string[] = [];
    
    if (this.metadata.capabilities.read) permissions.push('read');
    if (this.metadata.capabilities.write) permissions.push('write');
    if (this.metadata.capabilities.sync) permissions.push('sync');
    
    return permissions;
  }
  
  // Abstract methods for subclasses to implement
  protected abstract onInitialize(): Promise<void>;
  protected abstract onActivate(): Promise<void>;
  protected abstract onDeactivate(): Promise<void>;
  protected abstract onCleanup(): Promise<void>;
  protected abstract onHandleEvent(event: string, payload: any): Promise<void>;
  protected abstract onHealthCheck(baseHealth: HealthCheckResult): Promise<HealthCheckResult>;
}