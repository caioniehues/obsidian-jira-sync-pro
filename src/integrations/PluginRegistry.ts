import { App, Plugin as ObsidianPlugin } from 'obsidian';

/**
 * Detailed capability descriptor
 */
export interface CapabilityDescriptor {
  name: string;
  version: string;
  required: boolean;
  description?: string;
  dependencies?: string[];
}

/**
 * Plugin health status
 */
export interface PluginHealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
  lastCheck: number;
  issues?: string[];
  performance?: {
    responseTime?: number;
    errorRate?: number;
    lastActivity?: number;
  };
}

/**
 * Plugin health check result (for test compatibility)
 */
export interface PluginHealthCheckResult {
  pluginId: string;
  healthy: boolean;
  enabled: boolean;
  hasAPI: boolean;
  issues?: string[];
}

/**
 * Plugin information for integration
 */
export interface PluginInfo {
  id: string;
  name: string;
  version?: string;
  isEnabled: boolean;
  hasIntegration: boolean;
  hasAPI?: boolean;
  capabilities?: string[];
  detailedCapabilities?: CapabilityDescriptor[];
  health?: PluginHealthStatus;
  metadata?: {
    author?: string;
    description?: string;
    repository?: string;
    lastUpdated?: number;
  };
}

/**
 * Plugin compatibility information
 */
export interface PluginCompatibility {
  pluginId: string;
  minVersion?: string;
  maxVersion?: string;
  features: string[];
  requiredCapabilities?: CapabilityDescriptor[];
  optionalCapabilities?: CapabilityDescriptor[];
}

/**
 * Registry of supported plugin integrations with detailed capabilities
 */
const SUPPORTED_PLUGINS: PluginCompatibility[] = [
  {
    pluginId: 'obsidian-tasks-plugin',
    minVersion: '4.0.0',
    features: ['task-sync', 'bidirectional', 'metadata-injection'],
    requiredCapabilities: [
      { name: 'task-format', version: '1.0', required: true, description: 'Support for task checkbox syntax' },
      { name: 'frontmatter', version: '1.0', required: true, description: 'YAML frontmatter support' }
    ],
    optionalCapabilities: [
      { name: 'recurring-tasks', version: '1.0', required: false, description: 'Support for recurring task patterns' },
      { name: 'task-dependencies', version: '1.0', required: false, description: 'Task dependency tracking' }
    ]
  },
  {
    pluginId: 'calendar',
    minVersion: '1.5.0',
    features: ['due-date-sync', 'event-creation'],
    requiredCapabilities: [
      { name: 'ics-format', version: '1.0', required: true, description: 'ICS calendar format support' }
    ]
  },
  {
    pluginId: 'obsidian-day-planner',
    minVersion: '0.5.0',
    features: ['time-block-creation', 'story-point-estimation'],
    requiredCapabilities: [
      { name: 'time-blocks', version: '1.0', required: true, description: 'Time block notation support' }
    ]
  },
  {
    pluginId: 'dataview',
    minVersion: '0.5.0',
    features: ['custom-data-source', 'live-queries', 'dashboard-widgets'],
    requiredCapabilities: [
      { name: 'dataview-api', version: '0.5', required: true, description: 'Dataview query API' },
      { name: 'custom-sources', version: '1.0', required: true, description: 'Custom data source registration' }
    ]
  },
  {
    pluginId: 'templater-obsidian',
    minVersion: '1.16.0',
    features: ['user-functions', 'template-variables'],
    requiredCapabilities: [
      { name: 'user-functions', version: '1.0', required: true, description: 'User function registration' }
    ]
  },
  {
    pluginId: 'obsidian-kanban',
    minVersion: '1.0.0',
    features: ['board-sync', 'status-mapping'],
    requiredCapabilities: [
      { name: 'lane-api', version: '1.0', required: true, description: 'Kanban lane manipulation API' }
    ]
  },
  {
    pluginId: 'quickadd',
    minVersion: '0.5.0',
    features: ['macro-integration', 'quick-actions'],
    requiredCapabilities: [
      { name: 'macro-api', version: '1.0', required: true, description: 'Macro execution API' }
    ]
  }
];

/**
 * PluginRegistry - Manages detection and registration of compatible Obsidian plugins
 */
export class PluginRegistry {
  private registeredPlugins: Map<string, PluginInfo> = new Map();
  private pluginHealth: Map<string, PluginHealthStatus> = new Map();
  private capabilityCache: Map<string, CapabilityDescriptor[]> = new Map();
  private app: App;
  private healthCheckInterval: NodeJS.Timer | null = null;

  constructor(app: App) {
    this.app = app;
  }

  /**
   * Discover and register all compatible plugins with enhanced capability detection
   */
  async discoverPlugins(): Promise<void> {
    // Handle null app case
    if (!this.app) {
      console.log("PluginRegistry: App is null, skipping discovery");
      return;
    }
    console.log('PluginRegistry: Starting enhanced plugin discovery...');
    
    // Get all enabled community plugins
    const enabledPlugins = (this.app as any).plugins?.enabledPlugins as Set<string> || new Set();
    
    // Check for each supported plugin
    for (const supportedPlugin of SUPPORTED_PLUGINS) {
      const isEnabled = enabledPlugins.has(supportedPlugin.pluginId);
      
      if (isEnabled) {
        const plugin = this.getPlugin(supportedPlugin.pluginId);
        
        // Check version compatibility
        const isCompatible = this.checkVersionCompatibility(
          plugin?.manifest?.version || '0.0.0',
          supportedPlugin.minVersion,
          supportedPlugin.maxVersion
        );
        
        // Discover dynamic capabilities
        const dynamicCapabilities = await this.discoverDynamicCapabilities(supportedPlugin.pluginId);
        
        const pluginInfo: PluginInfo = {
          id: supportedPlugin.pluginId,
          name: this.getPluginName(supportedPlugin.pluginId),
          version: plugin?.manifest?.version,
          isEnabled: true,
          hasIntegration: isCompatible,
          hasAPI: plugin ? true : false,
          capabilities: supportedPlugin.features,
          detailedCapabilities: [
            ...(supportedPlugin.requiredCapabilities || []),
            ...(supportedPlugin.optionalCapabilities || []),
            ...dynamicCapabilities
          ],
          health: {
            status: isCompatible ? 'healthy' : 'degraded',
            lastCheck: Date.now(),
            issues: isCompatible ? [] : ['Version incompatibility']
          },
          metadata: {
            author: plugin?.manifest?.author,
            description: plugin?.manifest?.description,
            lastUpdated: Date.now()
          }
        };
        
        this.registeredPlugins.set(supportedPlugin.pluginId, pluginInfo);
        this.pluginHealth.set(supportedPlugin.pluginId, pluginInfo.health);
        
        if (!isCompatible) {
          console.warn(`PluginRegistry: ${pluginInfo.name} version ${pluginInfo.version} may not be fully compatible (requires ${supportedPlugin.minVersion}+)`);
        } else {
          console.log(`PluginRegistry: Registered ${pluginInfo.name} v${pluginInfo.version} with ${pluginInfo.detailedCapabilities?.length} capabilities`);
        }
      }
    }
    
    // Start health monitoring
    this.startHealthMonitoring();
    
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
   * Get installed plugins (includes both enabled and disabled)
   */
  getInstalledPlugins(): PluginInfo[] {
    return Array.from(this.registeredPlugins.values());
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
    plugins: Array<{ id: string; name: string; status: string; health?: string }>;
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
          status: registered?.isEnabled ? 'Active' : 'Not Installed',
          health: registered?.health?.status
        };
      })
    };
  }

  /**
   * Enhanced version compatibility checking
   */
  private checkVersionCompatibility(current: string, min?: string, max?: string): boolean {
    if (!min && !max) return true;
    
    if (min && this.compareVersions(current, min) < 0) {
      return false;
    }
    
    if (max && this.compareVersions(current, max) > 0) {
      return false;
    }
    
    return true;
  }

  /**
   * Discover dynamic capabilities at runtime
   */
  private async discoverDynamicCapabilities(pluginId: string): Promise<CapabilityDescriptor[]> {
    const capabilities: CapabilityDescriptor[] = [];
    const plugin = this.getPlugin(pluginId);
    
    if (!plugin) return capabilities;
    
    try {
      // Check for specific API methods that indicate capabilities
      switch (pluginId) {
        case 'dataview':
          const dataviewAPI = (window as any).DataviewAPI;
          if (dataviewAPI) {
            if (dataviewAPI.query) {
              capabilities.push({
                name: 'query-api',
                version: '1.0',
                required: false,
                description: 'Dataview query execution API'
              });
            }
            if (dataviewAPI.queryMarkdown) {
              capabilities.push({
                name: 'markdown-query',
                version: '1.0',
                required: false,
                description: 'Markdown-based query support'
              });
            }
          }
          break;
          
        case 'templater-obsidian':
          if ((plugin as any).templater?.functions_generator) {
            capabilities.push({
              name: 'function-generator',
              version: '1.0',
              required: false,
              description: 'Dynamic function generation'
            });
          }
          break;
          
        case 'obsidian-tasks-plugin':
          if ((plugin as any).cache) {
            capabilities.push({
              name: 'task-cache',
              version: '1.0',
              required: false,
              description: 'Task caching system'
            });
          }
          break;
      }
    } catch (error) {
      console.warn(`Failed to discover dynamic capabilities for ${pluginId}:`, error);
    }
    
    return capabilities;
  }

  /**
   * Start health monitoring for registered plugins
   */
  private startHealthMonitoring(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
    
    // Run health checks every 60 seconds
    this.healthCheckInterval = setInterval(() => {
      this.performHealthChecks();
    }, 60000);
    
    // Run initial health check
    this.performHealthChecks();
  }

  /**
   * Perform health checks on all registered plugins
   */
  private async performHealthChecks(): Promise<void> {
    for (const [pluginId, pluginInfo] of this.registeredPlugins) {
      try {
        const health = await this.checkPluginHealthInternal(pluginId);
        this.pluginHealth.set(pluginId, health);
        
        // Update plugin info with health status
        pluginInfo.health = health;
        
        if (health.status === 'unhealthy') {
          console.warn(`Plugin ${pluginId} is unhealthy:`, health.issues);
        }
      } catch (error) {
        console.error(`Health check failed for ${pluginId}:`, error);
      }
    }
  }

  /**
   * Check health of a specific plugin
   */
  public async checkPluginHealth(pluginId: string): Promise<PluginHealthCheckResult> {
    if (!this.app) {
      return {
        pluginId,
        healthy: false,
        enabled: false,
        hasAPI: false,
        issues: ["App not available"]
      };
    }

    const plugin = this.getPlugin(pluginId);
    
    // Check if plugin is enabled
    const enabledPlugins = (this.app as any).plugins?.enabledPlugins as Set<string> || new Set();
    const isEnabled = enabledPlugins.has(pluginId);
    
    // Check if plugin has API access
    const hasAPI = plugin !== null;
    
    // Determine health status
    const issues: string[] = [];
    if (!plugin) {
      issues.push("Plugin not found");
    }
    if (!isEnabled) {
      issues.push("Plugin is disabled");
    }
    
    const healthy = plugin !== null && isEnabled;

    return {
      pluginId,
      healthy,
      enabled: isEnabled,
      hasAPI,
      issues: issues.length > 0 ? issues : undefined
    };

  }

  /**
   * Internal health check for monitoring (returns PluginHealthStatus)
   */
  private async checkPluginHealthInternal(pluginId: string): Promise<PluginHealthStatus> {
    const plugin = this.getPlugin(pluginId);
    const health: PluginHealthStatus = {
      status: "unknown",
      lastCheck: Date.now(),
      issues: []
    };

    if (!plugin) {
      health.status = "unhealthy";
      health.issues?.push("Plugin not found");
      return health;
    }

    // Check if plugin is enabled
    const enabledPlugins = (this.app as any).plugins?.enabledPlugins as Set<string>;
    if (!enabledPlugins?.has(pluginId)) {
      health.status = "unhealthy";
      health.issues?.push("Plugin is disabled");
      return health;
    }

    // Check API availability
    const api = this.getPluginAPI(pluginId);
    if (!api) {
      health.status = "degraded";
      health.issues?.push("API not accessible");
    }

    // Check performance metrics (placeholder for actual metrics)
    health.performance = {
      responseTime: Math.random() * 100, // Placeholder
      errorRate: 0,
      lastActivity: Date.now()
    };

    // Determine overall health status
    if (health.issues && health.issues.length > 0) {
      health.status = health.issues.some(i => i.includes("not found") || i.includes("disabled")) 
        ? "unhealthy" 
        : "degraded";
    } else {
      health.status = "healthy";
    }

    return health;
  }
  /**
   * Get plugin health status
   */
  getPluginHealth(pluginId: string): PluginHealthStatus | undefined {
    return this.pluginHealth.get(pluginId);
  }

  /**
   * Negotiate capabilities with a plugin
   */
  async negotiateCapabilities(pluginId: string, requiredCapabilities: string[]): Promise<boolean> {
    const plugin = this.registeredPlugins.get(pluginId);
    if (!plugin) return false;
    
    const availableCapabilities = new Set(plugin.capabilities || []);
    const detailedCaps = new Set(
      plugin.detailedCapabilities?.map(c => c.name) || []
    );
    
    // Check if all required capabilities are available
    for (const required of requiredCapabilities) {
      if (!availableCapabilities.has(required) && !detailedCaps.has(required)) {
        console.warn(`Plugin ${pluginId} missing required capability: ${required}`);
        return false;
      }
    }
    
    return true;
  }

  /**
   * Clean up resources
   */
  cleanup(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
    
    this.registeredPlugins.clear();
    this.pluginHealth.clear();
    this.capabilityCache.clear();
  }
}