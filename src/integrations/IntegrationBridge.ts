import { EventEmitter } from 'events';
import { Plugin as ObsidianPlugin, Notice } from 'obsidian';
import { PluginRegistry } from './PluginRegistry';
import { EventBus, JiraIntegrationEvent, CapabilityPayload, ErrorEventPayload } from './EventBus';
import { DataProvider } from './DataProvider';
import { JiraTicket } from '../models/JiraModels';
import { IPluginAdapter, AdapterState, AdapterMetadata, HealthCheckResult } from './IPluginAdapter';
import type JiraSyncProPlugin from '../main';

// Import all adapters statically to avoid code splitting
import { TasksPluginAdapter } from './adapters/TasksPluginAdapter';
import { CalendarPluginAdapter } from './adapters/CalendarPluginAdapter';
import { DayPlannerAdapter } from './adapters/DayPlannerAdapter';
import { DataviewAdapter } from './adapters/DataviewAdapter';
import { TemplaterAdapter } from './adapters/TemplaterAdapter';

/**
 * Adapter loading configuration
 */
interface AdapterLoadConfig {
  adapter: IPluginAdapter;
  loadPriority: number;
  dependencies: string[];
  retryCount: number;
  lastError?: Error;
}

/**
 * Integration Bridge - Central coordinator for plugin integrations
 * Manages communication between Jira Sync Pro and other Obsidian plugins
 */
export class IntegrationBridge {
  private readonly eventBus: EventBus;
  private readonly registry: PluginRegistry;
  private readonly dataProvider: DataProvider;
  private isActive: boolean = false;
  private readonly adapters: Map<string, IPluginAdapter> = new Map();
  private readonly adapterConfigs: Map<string, AdapterLoadConfig> = new Map();
  private healthCheckInterval: NodeJS.Timer | null = null;
  private readonly routingRules: Map<string, string[]> = new Map();

  constructor(private readonly plugin: JiraSyncProPlugin) {
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
      
      // Register adapter event handlers
      this.registerAdapterEvents();
      
      // Initialize adapters for detected plugins
      await this.initializeAdapters();
      
      // Start health monitoring
      this.startHealthMonitoring();
      
      this.isActive = true;
      console.log('IntegrationBridge: Initialization complete');
      
      // Notify about available integrations
      const activeAdapters = Array.from(this.adapters.values()).filter(
        adapter => adapter.state === AdapterState.ACTIVE
      );
      if (activeAdapters.length > 0) {
        new Notice(`Jira Integration: ${activeAdapters.length} plugin integration(s) active`);
      }
    } catch (error) {
      console.error('IntegrationBridge: Initialization failed', error);
      this.eventBus.emitError('critical', error as Error, { phase: 'initialization' });
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
   * Register adapter-specific event handlers
   */
  private registerAdapterEvents(): void {
    // Handle capability announcements
    this.eventBus.subscribe(JiraIntegrationEvent.CAPABILITY_ANNOUNCE, async (payload: CapabilityPayload) => {
      const adapter = this.adapters.get(payload.pluginId);
      if (adapter) {
        console.log(`Capability announcement from ${payload.pluginId}:`, payload.capabilities);
        // Update routing rules based on capabilities
        this.updateRoutingRules(payload.pluginId, payload.capabilities);
      }
    });
    
    // Handle adapter errors
    this.eventBus.subscribe(JiraIntegrationEvent.ADAPTER_ERROR, async (payload: ErrorEventPayload) => {
      console.error(`Adapter error from ${payload.source}:`, payload.error);
      
      // Try to recover the adapter
      const adapter = this.adapters.get(payload.source);
      if (adapter?.recover) {
        const recovered = await adapter.recover();
        if (!recovered && adapter.state === AdapterState.ERROR) {
          // Deactivate the problematic adapter
          await this.deactivateAdapterInternal(payload.source);
        }
      }
    });
    
    // Handle data requests
    this.eventBus.subscribe(JiraIntegrationEvent.DATA_REQUEST, async (payload) => {
      if (payload.targetPlugin === 'jira-sync-pro') {
        try {
          const data = await this.dataProvider.getMappedData(payload.dataType, payload.query);
          this.eventBus.respond(payload.requestId, data);
        } catch (error) {
          this.eventBus.respond(payload.requestId, null, (error as Error).message);
        }
      }
    });
  }

  /**
   * Initialize adapters for detected plugins with dependency resolution
   */
  private async initializeAdapters(): Promise<void> {
    const availablePlugins = this.registry.getAvailablePlugins();
    
    // Sort by priority and resolve dependencies
    const sortedPlugins = this.sortPluginsByDependencies(availablePlugins);
    
    for (const pluginInfo of sortedPlugins) {
      try {
        const adapter = await this.loadAdapter(pluginInfo.id);
        if (adapter) {
          // Check version compatibility
          if (!this.checkVersionCompatibility(adapter.metadata, this.plugin.manifest?.version)) {
            console.warn(`Adapter ${pluginInfo.id} version incompatible, skipping`);
            continue;
          }
          
          // Store configuration
          this.adapterConfigs.set(pluginInfo.id, {
            adapter,
            loadPriority: adapter.metadata.priority || 50,
            dependencies: adapter.metadata.dependencies || [],
            retryCount: 0
          });
          
          // Initialize and activate
          await adapter.initialize(this.plugin, this.eventBus, this.dataProvider);
          await adapter.activate();
          
          this.adapters.set(pluginInfo.id, adapter);
          
          // Announce capabilities
          this.announceAdapterCapabilities(adapter);
          
          console.log(`IntegrationBridge: Activated adapter for ${pluginInfo.name}`);
        }
      } catch (error) {
        console.error(`IntegrationBridge: Failed to initialize adapter for ${pluginInfo.id}`, error);
        this.eventBus.emitError('recoverable', error as Error, { 
          adapter: pluginInfo.id 
        }, 'Retry adapter initialization');
      }
    }
  }

  /**
   * Load adapter for a specific plugin (using static imports)
   */
  private async loadAdapter(pluginId: string): Promise<IPluginAdapter | null> {
    try {
      switch (pluginId) {
        case 'obsidian-tasks-plugin':
          return new TasksPluginAdapter();
        
        case 'calendar':
          return new CalendarPluginAdapter();
        
        case 'obsidian-day-planner':
          return new DayPlannerAdapter();
        
        case 'dataview':
          return new DataviewAdapter();
        
        case 'templater-obsidian':
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
      if (adapter?.cleanup) {
        await adapter.cleanup();
      }
      this.adapters.delete(pluginId);
      new Notice(`Jira Integration: ${pluginId} integration disabled`);
    }
  }

  /**
   * Start health monitoring for all adapters
   */
  private startHealthMonitoring(): void {
    // Run health checks every 30 seconds
    this.healthCheckInterval = setInterval(async () => {
      for (const [pluginId, adapter] of this.adapters) {
        try {
          const health = await adapter.healthCheck();
          
          if (!health.healthy && adapter.state === AdapterState.ACTIVE) {
            console.warn(`Adapter ${pluginId} unhealthy:`, health.errors);
            
            // Emit health check event
            this.eventBus.emit(JiraIntegrationEvent.ADAPTER_HEALTH_CHECK, {
              pluginId,
              health,
              timestamp: Date.now()
            });
            
            // Try to recover if possible
            if (adapter.recover) {
              await adapter.recover();
            }
          }
        } catch (error) {
          console.error(`Health check failed for ${pluginId}:`, error);
        }
      }
    }, 30000);
  }

  /**
   * Update routing rules based on adapter capabilities
   */
  private updateRoutingRules(pluginId: string, capabilities: string[]): void {
    // Clear existing rules for this plugin
    for (const [event, plugins] of this.routingRules) {
      const index = plugins.indexOf(pluginId);
      if (index !== -1) {
        plugins.splice(index, 1);
      }
    }
    
    // Add new routing rules based on capabilities
    if (capabilities.includes('sync')) {
      this.addRoutingRule(JiraIntegrationEvent.SYNC_COMPLETED, pluginId);
      this.addRoutingRule(JiraIntegrationEvent.SYNC_STARTED, pluginId);
    }
    
    if (capabilities.includes('write')) {
      this.addRoutingRule(JiraIntegrationEvent.TICKET_UPDATED, pluginId);
      this.addRoutingRule(JiraIntegrationEvent.TICKET_STATUS_CHANGED, pluginId);
    }
    
    if (capabilities.includes('realtime')) {
      this.addRoutingRule(JiraIntegrationEvent.TICKET_CREATED, pluginId);
      this.addRoutingRule(JiraIntegrationEvent.COMMENT_ADDED, pluginId);
    }
  }

  /**
   * Add a routing rule for an event
   */
  private addRoutingRule(event: string, pluginId: string): void {
    if (!this.routingRules.has(event)) {
      this.routingRules.set(event, []);
    }
    const plugins = this.routingRules.get(event)!;
    if (!plugins.includes(pluginId)) {
      plugins.push(pluginId);
    }
  }

  /**
   * Deactivate an adapter internally
   */
  private async deactivateAdapterInternal(pluginId: string): Promise<void> {
    const adapter = this.adapters.get(pluginId);
    if (adapter) {
      try {
        await adapter.deactivate();
        console.log(`Adapter ${pluginId} deactivated`);
      } catch (error) {
        console.error(`Failed to deactivate adapter ${pluginId}:`, error);
      }
    }
  }

  /**
   * Sort plugins by dependencies
   */
  private sortPluginsByDependencies(plugins: any[]): any[] {
    // Simple topological sort for dependency resolution
    const sorted: any[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();
    
    const visit = (plugin: any) => {
      if (visited.has(plugin.id)) return;
      if (visiting.has(plugin.id)) {
        console.warn(`Circular dependency detected for ${plugin.id}`);
        return;
      }
      
      visiting.add(plugin.id);
      
      // Visit dependencies first
      const config = this.adapterConfigs.get(plugin.id);
      if (config?.dependencies) {
        for (const dep of config.dependencies) {
          const depPlugin = plugins.find(p => p.id === dep);
          if (depPlugin) {
            visit(depPlugin);
          }
        }
      }
      
      visiting.delete(plugin.id);
      visited.add(plugin.id);
      sorted.push(plugin);
    };
    
    for (const plugin of plugins) {
      visit(plugin);
    }
    
    return sorted;
  }

  /**
   * Check version compatibility for an adapter
   */
  private checkVersionCompatibility(metadata: AdapterMetadata, pluginVersion?: string): boolean {
    const currentVersion = pluginVersion || this.plugin.manifest.version;
    
    // Check minimum version
    if (metadata.minJiraPluginVersion) {
      if (this.compareVersions(currentVersion, metadata.minJiraPluginVersion) < 0) {
        return false;
      }
    }
    
    // Check maximum version
    if (metadata.maxJiraPluginVersion) {
      if (this.compareVersions(currentVersion, metadata.maxJiraPluginVersion) > 0) {
        return false;
      }
    }
    
    return true;
  }

  /**
   * Compare semantic versions
   */
  private compareVersions(v1: string, v2: string): number {
    const parts1 = v1.split('.').map(Number);
    const parts2 = v2.split('.').map(Number);
    
    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
      const part1 = parts1[i] || 0;
      const part2 = parts2[i] || 0;
      
      if (part1 > part2) return 1;
      if (part1 < part2) return -1;
    }
    
    return 0;
  }

  /**
   * Announce adapter capabilities to the event bus
   */
  private announceAdapterCapabilities(adapter: IPluginAdapter): void {
    const payload: CapabilityPayload = {
      pluginId: adapter.metadata.id,
      capabilities: Object.keys(adapter.metadata.capabilities).filter(
        cap => adapter.metadata.capabilities[cap]
      ),
      version: adapter.metadata.version,
      requirements: adapter.getRequiredPermissions(),
      timestamp: Date.now(),
      source: 'jira-sync-pro'
    };
    
    this.eventBus.emit(JiraIntegrationEvent.CAPABILITY_ANNOUNCE, payload);
  }

  /**
   * Register an adapter for testing or manual plugin management
   */
  async registerAdapter(adapter: IPluginAdapter, plugin: any): Promise<boolean> {
    try {
      // Check if already registered
      if (this.adapters.has(adapter.metadata.id)) {
        console.warn(`Adapter ${adapter.metadata.id} already registered`);
        return false;
      }

      // Check version compatibility
      if (!this.checkVersionCompatibility(adapter.metadata, plugin.manifest?.version)) {
        console.warn(`Adapter ${adapter.metadata.id} version incompatible`);
        return false;
      }

      // Store configuration
      this.adapterConfigs.set(adapter.metadata.id, {
        adapter,
        loadPriority: adapter.metadata.priority || 50,
        dependencies: adapter.metadata.dependencies || [],
        retryCount: 0
      });

      // Initialize the adapter
      await adapter.initialize(this.plugin, this.eventBus, this.dataProvider);
      
      // Store in adapters map but don't activate yet
      this.adapters.set(adapter.metadata.id, adapter);

      // Announce capabilities
      this.announceAdapterCapabilities(adapter);

      console.log(`IntegrationBridge: Registered adapter ${adapter.metadata.id}`);
      return true;
    } catch (error) {
      console.error(`Failed to register adapter ${adapter.metadata.id}:`, error);
            adapter.state = AdapterState.ERROR;
      return false;
    }
  }

  /**
   * Unregister an adapter
   */
  async unregisterAdapter(adapterId: string): Promise<void> {
    if (!this.adapters.has(adapterId)) {
      throw new Error('Adapter not found');
    }

    const adapter = this.adapters.get(adapterId)!;
    
    // Deactivate if active
    if (adapter.state === AdapterState.ACTIVE) {
      await adapter.deactivate();
    }

    // Clean up
    await adapter.cleanup();

    // Remove from maps
    this.adapters.delete(adapterId);
    this.adapterConfigs.delete(adapterId);

    console.log(`IntegrationBridge: Unregistered adapter ${adapterId}`);
  }

  /**
   * Activate a specific adapter by ID
   */
  async activateAdapter(adapterId: string): Promise<void> {
    if (!this.adapters.has(adapterId)) {
      throw new Error('Adapter not found');
    }

    const adapter = this.adapters.get(adapterId)!;
    const config = this.adapterConfigs.get(adapterId)!;

    // Check dependencies
    for (const depId of config.dependencies) {
      const depAdapter = this.adapters.get(depId);
      if (!depAdapter || depAdapter.state !== AdapterState.ACTIVE) {
        throw new Error(`Dependency ${depId} not available`);
      }
    }

    await adapter.activate();
    console.log(`IntegrationBridge: Activated adapter ${adapterId}`);
  }

  /**
   * Deactivate a specific adapter by ID
   */
  async deactivateAdapter(adapterId: string): Promise<void> {
    if (!this.adapters.has(adapterId)) {
      throw new Error('Adapter not found');
    }

    const adapter = this.adapters.get(adapterId)!;
    await adapter.deactivate();
    console.log(`IntegrationBridge: Deactivated adapter ${adapterId}`);
  }

  /**
   * Get an adapter by ID
   */
  getAdapter(adapterId: string): IPluginAdapter | undefined {
    return this.adapters.get(adapterId);
  }

  /**
   * Get all registered adapters
   */
  getAllAdapters(): IPluginAdapter[] {
    return Array.from(this.adapters.values());
  }

  /**
   * Get adapters with specific capability
   */
  getAdaptersByCapability(capability: string): IPluginAdapter[] {
    return Array.from(this.adapters.values()).filter(
      adapter => adapter.metadata.capabilities[capability] === true
    );
  }

  /**
   * Activate all registered adapters
   */
  async activateAll(): Promise<void> {
    // Sort by priority and dependencies
    const sortedAdapters = this.sortAdaptersByDependencies();
    
    for (const adapter of sortedAdapters) {
      try {
        if (adapter.state !== AdapterState.ACTIVE) {
          await adapter.activate();
        }
      } catch (error) {
        console.error(`Failed to activate adapter ${adapter.metadata.id}:`, error);
        // Continue with other adapters
      }
    }
  }

  /**
   * Deactivate all active adapters
   */
  async deactivateAll(): Promise<void> {
    // Deactivate in reverse dependency order
    const sortedAdapters = this.sortAdaptersByDependencies().reverse();
    
    for (const adapter of sortedAdapters) {
      try {
        if (adapter.state === AdapterState.ACTIVE) {
          await adapter.deactivate();
        }
      } catch (error) {
        console.error(`Failed to deactivate adapter ${adapter.metadata.id}:`, error);
        // Continue with other adapters
      }
    }
  }

  /**
   * Sort adapters by dependencies for proper activation order
   */
  private sortAdaptersByDependencies(): IPluginAdapter[] {
    const adapters = Array.from(this.adapters.values());
    const sorted: IPluginAdapter[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();

    const visit = (adapter: IPluginAdapter) => {
      if (visited.has(adapter.metadata.id)) return;
      if (visiting.has(adapter.metadata.id)) {
        console.warn(`Circular dependency detected for ${adapter.metadata.id}`);
        return;
      }

      visiting.add(adapter.metadata.id);

      // Visit dependencies first
      const config = this.adapterConfigs.get(adapter.metadata.id);
      if (config?.dependencies) {
        for (const depId of config.dependencies) {
          const depAdapter = this.adapters.get(depId);
          if (depAdapter) {
            visit(depAdapter);
          }
        }
      }

      visiting.delete(adapter.metadata.id);
      visited.add(adapter.metadata.id);
      sorted.push(adapter);
    };

    for (const adapter of adapters) {
      visit(adapter);
    }

    return sorted;
  }

  /**
   * Clean up resources when plugin unloads
   */
  async cleanup(): Promise<void> {
    console.log('IntegrationBridge: Cleaning up...');
    
    // Stop health monitoring
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
    
    // Clean up all adapters
    for (const [pluginId, adapter] of this.adapters) {
      try {
        await adapter.cleanup();
      } catch (error) {
        console.error(`IntegrationBridge: Error cleaning up adapter ${pluginId}:`, error);
      }
    }
    
    this.adapters.clear();
    this.adapterConfigs.clear();
    this.routingRules.clear();
    this.eventBus.removeAllListeners();
    this.isActive = false;
    
    console.log('IntegrationBridge: Cleanup complete');
  }
}