import { EventEmitter } from 'events';
import { Plugin as ObsidianPlugin, Notice } from 'obsidian';
import { PluginRegistry } from './PluginRegistry';
import { EventBus, JiraIntegrationEvent } from './EventBus';
import { DataProvider } from './DataProvider';
import { JiraTicket } from '../models/JiraModels';
import type JiraSyncProPlugin from '../main';

/**
 * Integration Bridge - Central coordinator for plugin integrations
 * Manages communication between Jira Sync Pro and other Obsidian plugins
 */
export class IntegrationBridge {
  private eventBus: EventBus;
  private registry: PluginRegistry;
  private dataProvider: DataProvider;
  private isActive: boolean = false;
  private adapters: Map<string, any> = new Map();

  constructor(private plugin: JiraSyncProPlugin) {
    this.eventBus = new EventBus();
    this.registry = new PluginRegistry(plugin.app);
    this.dataProvider = new DataProvider(plugin);
  }

  /**
   * Initialize the integration bridge and discover available plugins
   */
  async initialize(): Promise<void> {
    try {
      console.log('IntegrationBridge: Initializing...');
      
      // Discover available plugins
      await this.registry.discoverPlugins();
      
      // Register core events
      this.registerCoreEvents();
      
      // Initialize adapters for detected plugins
      await this.initializeAdapters();
      
      this.isActive = true;
      console.log('IntegrationBridge: Initialization complete');
      
      // Notify about available integrations
      const availablePlugins = this.registry.getAvailablePlugins();
      if (availablePlugins.length > 0) {
        new Notice(`Jira Integration: ${availablePlugins.length} compatible plugin(s) detected`);
      }
    } catch (error) {
      console.error('IntegrationBridge: Initialization failed', error);
      new Notice('Jira Integration: Failed to initialize');
    }
  }

  /**
   * Register core event handlers for Jira data changes
   */
  private registerCoreEvents(): void {
    // These will be called by the main plugin when data changes
    this.eventBus.on('internal:sync:started', () => {
      this.eventBus.emit(JiraIntegrationEvent.SYNC_STARTED, {
        timestamp: Date.now(),
        source: 'jira-sync-pro'
      });
    });

    this.eventBus.on('internal:sync:completed', (tickets: JiraTicket[]) => {
      this.eventBus.emit(JiraIntegrationEvent.SYNC_COMPLETED, {
        tickets,
        count: tickets.length,
        timestamp: Date.now(),
        source: 'jira-sync-pro'
      });
    });
  }

  /**
   * Initialize adapters for detected plugins
   */
  private async initializeAdapters(): Promise<void> {
    const availablePlugins = this.registry.getAvailablePlugins();
    
    for (const pluginInfo of availablePlugins) {
      try {
        const adapter = await this.loadAdapter(pluginInfo.id);
        if (adapter) {
          this.adapters.set(pluginInfo.id, adapter);
          await adapter.initialize(this.plugin, this.eventBus, this.dataProvider);
          console.log(`IntegrationBridge: Initialized adapter for ${pluginInfo.name}`);
        }
      } catch (error) {
        console.error(`IntegrationBridge: Failed to initialize adapter for ${pluginInfo.id}`, error);
      }
    }
  }

  /**
   * Dynamically load adapter for a specific plugin
   */
  private async loadAdapter(pluginId: string): Promise<any> {
    try {
      switch (pluginId) {
        case 'obsidian-tasks-plugin':
          const { TasksPluginAdapter } = await import('./adapters/TasksPluginAdapter');
          return new TasksPluginAdapter();
        
        case 'calendar':
          const { CalendarPluginAdapter } = await import('./adapters/CalendarPluginAdapter');
          return new CalendarPluginAdapter();
        
        case 'obsidian-day-planner':
          const { DayPlannerAdapter } = await import('./adapters/DayPlannerAdapter');
          return new DayPlannerAdapter();
        
        case 'dataview':
          const { DataviewAdapter } = await import('./adapters/DataviewAdapter');
          return new DataviewAdapter();
        
        case 'templater-obsidian':
          const { TemplaterAdapter } = await import('./adapters/TemplaterAdapter');
          return new TemplaterAdapter();
        
        default:
          return null;
      }
    } catch (error) {
      console.error(`Failed to load adapter for ${pluginId}:`, error);
      return null;
    }
  }

  /**
   * Called when Jira tickets are synced - notifies all adapters
   */
  onTicketsSynced(tickets: JiraTicket[]): void {
    if (!this.isActive) return;
    
    console.log(`IntegrationBridge: Processing ${tickets.length} synced tickets`);
    
    // Emit sync completed event
    this.eventBus.emitInternal('internal:sync:completed', tickets);
    
    // Process tickets through each adapter
    for (const [pluginId, adapter] of this.adapters) {
      try {
        if (adapter.onTicketsSynced) {
          adapter.onTicketsSynced(tickets);
        }
      } catch (error) {
        console.error(`IntegrationBridge: Error in adapter ${pluginId}:`, error);
      }
    }
  }

  /**
   * Called when a single ticket is updated
   */
  onTicketUpdated(ticket: JiraTicket): void {
    if (!this.isActive) return;
    
    this.eventBus.emit(JiraIntegrationEvent.TICKET_UPDATED, {
      ticket,
      timestamp: Date.now(),
      source: 'jira-sync-pro'
    });
    
    // Notify adapters
    for (const [pluginId, adapter] of this.adapters) {
      try {
        if (adapter.onTicketUpdated) {
          adapter.onTicketUpdated(ticket);
        }
      } catch (error) {
        console.error(`IntegrationBridge: Error in adapter ${pluginId}:`, error);
      }
    }
  }

  /**
   * Called when a ticket status changes
   */
  onTicketStatusChanged(ticket: JiraTicket, oldStatus: string, newStatus: string): void {
    if (!this.isActive) return;
    
    this.eventBus.emit(JiraIntegrationEvent.TICKET_STATUS_CHANGED, {
      ticket,
      oldStatus,
      newStatus,
      timestamp: Date.now(),
      source: 'jira-sync-pro'
    });
  }

  /**
   * Get the event bus for external subscriptions
   */
  getEventBus(): EventBus {
    return this.eventBus;
  }

  /**
   * Get the data provider for external data access
   */
  getDataProvider(): DataProvider {
    return this.dataProvider;
  }

  /**
   * Get registry for plugin management
   */
  getRegistry(): PluginRegistry {
    return this.registry;
  }

  /**
   * Check if a specific plugin integration is active
   */
  isPluginIntegrationActive(pluginId: string): boolean {
    return this.adapters.has(pluginId);
  }

  /**
   * Enable/disable a specific plugin integration
   */
  async togglePluginIntegration(pluginId: string, enabled: boolean): Promise<void> {
    if (enabled && !this.adapters.has(pluginId)) {
      // Load and initialize the adapter
      const adapter = await this.loadAdapter(pluginId);
      if (adapter) {
        this.adapters.set(pluginId, adapter);
        await adapter.initialize(this.plugin, this.eventBus, this.dataProvider);
        new Notice(`Jira Integration: ${pluginId} integration enabled`);
      }
    } else if (!enabled && this.adapters.has(pluginId)) {
      // Clean up and remove the adapter
      const adapter = this.adapters.get(pluginId);
      if (adapter && adapter.cleanup) {
        await adapter.cleanup();
      }
      this.adapters.delete(pluginId);
      new Notice(`Jira Integration: ${pluginId} integration disabled`);
    }
  }

  /**
   * Clean up resources when plugin unloads
   */
  async cleanup(): Promise<void> {
    console.log('IntegrationBridge: Cleaning up...');
    
    // Clean up all adapters
    for (const [pluginId, adapter] of this.adapters) {
      try {
        if (adapter.cleanup) {
          await adapter.cleanup();
        }
      } catch (error) {
        console.error(`IntegrationBridge: Error cleaning up adapter ${pluginId}:`, error);
      }
    }
    
    this.adapters.clear();
    this.eventBus.removeAllListeners();
    this.isActive = false;
    
    console.log('IntegrationBridge: Cleanup complete');
  }
}