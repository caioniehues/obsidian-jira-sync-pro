import { IPluginAdapter, AdapterState, AdapterMetadata, HealthCheckResult } from '../IPluginAdapter';
import { EventBus } from '../../events/event-bus';
import { DataProvider } from '../DataProvider';
import { JiraTicket } from '../../models/JiraModels';
import type JiraSyncProPlugin from '../../main';

/**
 * Adapter for integrating with the Dataview plugin
 * Provides Jira data as a custom data source for Dataview queries
 */
export class DataviewAdapter implements IPluginAdapter {
  state: AdapterState = AdapterState.INACTIVE;
  
  readonly metadata: AdapterMetadata = {
    id: 'dataview',
    name: 'Dataview Adapter',
    version: '1.0.0',
    author: 'Jira Sync Pro',
    description: 'Provides Jira ticket data to Dataview queries',
    capabilities: {
      read: true,
      write: false,
      sync: true,
      realtime: false,
      bidirectional: false
    },
    priority: 20,
    dependencies: [],
    minJiraPluginVersion: '1.0.0'
  };

  private plugin: JiraSyncProPlugin | null = null;
  private eventBus: EventBus | null = null;
  private dataProvider: DataProvider | null = null;
  private dataviewAPI: any = null;

  async initialize(plugin: JiraSyncProPlugin, eventBus: EventBus, dataProvider: DataProvider): Promise<void> {
    this.plugin = plugin;
    this.eventBus = eventBus;
    this.dataProvider = dataProvider;
    
    // Get Dataview API
    this.dataviewAPI = (window as any).DataviewAPI;
    if (this.dataviewAPI) {
      console.log('DataviewAdapter: Dataview API found');
    } else {
      console.warn('DataviewAdapter: Dataview API not available');
    }
    
    this.state = AdapterState.INITIALIZED;
  }

  async activate(): Promise<void> {
    if (this.state !== AdapterState.INITIALIZED) {
      throw new Error('Adapter must be initialized before activation');
    }

    // Register custom data source with Dataview
    if (this.dataviewAPI) {
      // Register Jira data as a custom source
      // This would integrate with Dataview's custom source API
      console.log('DataviewAdapter: Registering Jira data source');
    }

    this.state = AdapterState.ACTIVE;
    console.log('DataviewAdapter: Activated');
  }

  async deactivate(): Promise<void> {
    // Unregister from Dataview
    this.state = AdapterState.INACTIVE;
    console.log('DataviewAdapter: Deactivated');
  }

  async cleanup(): Promise<void> {
    await this.deactivate();
    this.plugin = null;
    this.eventBus = null;
    this.dataProvider = null;
    this.dataviewAPI = null;
  }

  async healthCheck(): Promise<HealthCheckResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!this.dataviewAPI) {
      errors.push('Dataview API not available');
    }

    return {
      healthy: errors.length === 0,
      errors,
      warnings,
      lastCheck: Date.now()
    };
  }

  async recover(): Promise<boolean> {
    try {
      this.dataviewAPI = (window as any).DataviewAPI;
      if (this.dataviewAPI) {
        this.state = AdapterState.ACTIVE;
        return true;
      }
    } catch (error) {
      console.error('DataviewAdapter: Recovery failed', error);
    }
    
    this.state = AdapterState.ERROR;
    return false;
  }

  getRequiredPermissions(): string[] {
    return ['dataview:read', 'dataview:query'];
  }

  onTicketsSynced?(tickets: JiraTicket[]): void {
    console.log(`DataviewAdapter: ${tickets.length} tickets synced, updating data source`);
    // Update Dataview custom data source
  }

  onTicketUpdated?(ticket: JiraTicket): void {
    console.log(`DataviewAdapter: Ticket ${ticket.key} updated`);
    // Update specific ticket in Dataview data source
  }
}