import { App, Plugin as ObsidianPlugin } from 'obsidian';

/**
 * Plugin information for integration
 */
export interface PluginInfo {
  id: string;
  name: string;
  version?: string;
  isEnabled: boolean;
  hasIntegration: boolean;
  capabilities?: string[];
}

/**
 * Plugin compatibility information
 */
export interface PluginCompatibility {
  pluginId: string;
  minVersion?: string;
  maxVersion?: string;
  features: string[];
}

/**
 * Registry of supported plugin integrations
 */
const SUPPORTED_PLUGINS: PluginCompatibility[] = [
  {
    pluginId: 'obsidian-tasks-plugin',
    features: ['task-sync', 'bidirectional', 'metadata-injection']
  },
  {
    pluginId: 'calendar',
    features: ['due-date-sync', 'event-creation']
  },
  {
    pluginId: 'obsidian-day-planner',
    features: ['time-block-creation', 'story-point-estimation']
  },
  {
    pluginId: 'dataview',
    features: ['custom-data-source', 'live-queries', 'dashboard-widgets']
  },
  {
    pluginId: 'templater-obsidian',
    features: ['user-functions', 'template-variables']
  },
  {
    pluginId: 'obsidian-kanban',
    features: ['board-sync', 'status-mapping']
  },
  {
    pluginId: 'quickadd',
    features: ['macro-integration', 'quick-actions']
  }
];

/**
 * PluginRegistry - Manages detection and registration of compatible Obsidian plugins
 */
export class PluginRegistry {
  private registeredPlugins: Map<string, PluginInfo> = new Map();
  private app: App;

  constructor(app: App) {
    this.app = app;
  }

  /**
   * Discover and register all compatible plugins
   */
  async discoverPlugins(): Promise<void> {
    console.log('PluginRegistry: Starting plugin discovery...');
    
    // Get all enabled community plugins
    const enabledPlugins = (this.app as any).plugins?.enabledPlugins as Set<string> || new Set();
    
    // Check for each supported plugin
    for (const supportedPlugin of SUPPORTED_PLUGINS) {
      const isEnabled = enabledPlugins.has(supportedPlugin.pluginId);
      
      if (isEnabled) {
        const plugin = this.getPlugin(supportedPlugin.pluginId);
        const pluginInfo: PluginInfo = {
          id: supportedPlugin.pluginId,
          name: this.getPluginName(supportedPlugin.pluginId),
          version: plugin?.manifest?.version,
          isEnabled: true,
          hasIntegration: true,
          capabilities: supportedPlugin.features
        };
        
        this.registeredPlugins.set(supportedPlugin.pluginId, pluginInfo);
        console.log(`PluginRegistry: Registered ${pluginInfo.name} (${pluginInfo.id})`);
      }
    }
    
    console.log(`PluginRegistry: Discovery complete. Found ${this.registeredPlugins.size} compatible plugins`);
  }

  /**
   * Get plugin instance by ID
   */
  private getPlugin(pluginId: string): ObsidianPlugin | null {
    try {
      const plugins = (this.app as any).plugins?.plugins;
      return plugins?.[pluginId] || null;
    } catch (error) {
      console.error(`PluginRegistry: Failed to get plugin ${pluginId}:`, error);
      return null;
    }
  }

  /**
   * Get human-readable plugin name
   */
  private getPluginName(pluginId: string): string {
    const nameMap: Record<string, string> = {
      'obsidian-tasks-plugin': 'Tasks',
      'calendar': 'Calendar',
      'obsidian-day-planner': 'Day Planner',
      'dataview': 'Dataview',
      'templater-obsidian': 'Templater',
      'obsidian-kanban': 'Kanban',
      'quickadd': 'QuickAdd'
    };
    
    return nameMap[pluginId] || pluginId;
  }

  /**
   * Check if a plugin is registered and enabled
   */
  isPluginRegistered(pluginId: string): boolean {
    const plugin = this.registeredPlugins.get(pluginId);
    return plugin?.isEnabled || false;
  }

  /**
   * Get all registered plugins
   */
  getRegisteredPlugins(): PluginInfo[] {
    return Array.from(this.registeredPlugins.values());
  }

  /**
   * Get plugins that are available for integration
   */
  getAvailablePlugins(): PluginInfo[] {
    return this.getRegisteredPlugins().filter(p => p.isEnabled && p.hasIntegration);
  }

  /**
   * Register a plugin manually
   */
  registerPlugin(pluginInfo: PluginInfo): void {
    this.registeredPlugins.set(pluginInfo.id, pluginInfo);
    console.log(`PluginRegistry: Manually registered ${pluginInfo.name}`);
  }

  /**
   * Unregister a plugin
   */
  unregisterPlugin(pluginId: string): void {
    if (this.registeredPlugins.delete(pluginId)) {
      console.log(`PluginRegistry: Unregistered ${pluginId}`);
    }
  }

  /**
   * Get plugin capabilities
   */
  getPluginCapabilities(pluginId: string): string[] {
    const plugin = this.registeredPlugins.get(pluginId);
    return plugin?.capabilities || [];
  }

  /**
   * Check if a plugin has a specific capability
   */
  hasCapability(pluginId: string, capability: string): boolean {
    const capabilities = this.getPluginCapabilities(pluginId);
    return capabilities.includes(capability);
  }

  /**
   * Get plugin by capability
   */
  getPluginsByCapability(capability: string): PluginInfo[] {
    return this.getAvailablePlugins().filter(plugin => 
      plugin.capabilities?.includes(capability) || false
    );
  }

  /**
   * Refresh plugin registry
   */
  async refresh(): Promise<void> {
    this.registeredPlugins.clear();
    await this.discoverPlugins();
  }

  /**
   * Get plugin API if available (for direct plugin interaction)
   */
  getPluginAPI(pluginId: string): any {
    const plugin = this.getPlugin(pluginId);
    
    // Different plugins expose their API differently
    switch (pluginId) {
      case 'dataview':
        // Dataview exposes its API globally
        return (window as any).DataviewAPI || plugin;
      
      case 'templater-obsidian':
        // Templater has a specific API structure
        return plugin?.templater || plugin;
      
      case 'obsidian-tasks-plugin':
        // Tasks plugin might have specific methods
        return plugin?.tasksApi || plugin;
      
      default:
        // Return the plugin instance itself as fallback
        return plugin;
    }
  }

  /**
   * Check plugin version compatibility
   */
  isVersionCompatible(pluginId: string, requiredVersion?: string): boolean {
    if (!requiredVersion) return true;
    
    const plugin = this.registeredPlugins.get(pluginId);
    if (!plugin?.version) return false;
    
    // Simple version comparison (you might want to use a proper semver library)
    return this.compareVersions(plugin.version, requiredVersion) >= 0;
  }

  /**
   * Simple version comparison
   */
  private compareVersions(current: string, required: string): number {
    const currentParts = current.split('.').map(Number);
    const requiredParts = required.split('.').map(Number);
    
    for (let i = 0; i < Math.max(currentParts.length, requiredParts.length); i++) {
      const currentPart = currentParts[i] || 0;
      const requiredPart = requiredParts[i] || 0;
      
      if (currentPart > requiredPart) return 1;
      if (currentPart < requiredPart) return -1;
    }
    
    return 0;
  }

  /**
   * Get integration status summary
   */
  getIntegrationStatus(): {
    total: number;
    enabled: number;
    available: number;
    plugins: Array<{ id: string; name: string; status: string }>;
  } {
    const plugins = Array.from(this.registeredPlugins.values());
    
    return {
      total: SUPPORTED_PLUGINS.length,
      enabled: plugins.filter(p => p.isEnabled).length,
      available: plugins.filter(p => p.isEnabled && p.hasIntegration).length,
      plugins: SUPPORTED_PLUGINS.map(sp => {
        const registered = this.registeredPlugins.get(sp.pluginId);
        return {
          id: sp.pluginId,
          name: this.getPluginName(sp.pluginId),
          status: registered?.isEnabled ? 'Active' : 'Not Installed'
        };
      })
    };
  }
}