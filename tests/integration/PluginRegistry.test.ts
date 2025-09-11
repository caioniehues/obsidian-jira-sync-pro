import { PluginRegistry } from '../../src/integrations/PluginRegistry';

describe('PluginRegistry - Capability Detection and Health Monitoring', () => {
  let registry: PluginRegistry;
  let mockApp: any;

  beforeEach(() => {
    const manifests = {
      'obsidian-tasks-plugin': {
        id: 'obsidian-tasks-plugin',
        name: 'Tasks',
        version: '1.5.0',
        author: 'Test Author'
      },
      'dataview': {
        id: 'dataview',
        name: 'Dataview',
        version: '0.5.0',
        author: 'Test Author'
      },
      'calendar': {
        id: 'calendar',
        name: 'Calendar',
        version: '1.0.0',
        author: 'Test Author'
      }
    };

    // Mock Obsidian app with plugins
    mockApp = {
      plugins: {
        manifests,
        plugins: {
          'obsidian-tasks-plugin': {
            manifest: manifests['obsidian-tasks-plugin'],
            settings: {
              globalFilter: 'path includes Work',
              removeGlobalFilter: false
            },
            api: {
              getTasks: jest.fn().mockResolvedValue([])
            }
          },
          'dataview': {
            manifest: manifests['dataview'],
            api: {
              query: jest.fn().mockResolvedValue({ values: [] }),
              queryMarkdown: jest.fn().mockResolvedValue(''),
              index: {
                pages: new Map(),
                tasks: new Map()
              }
            }
          },
          'calendar': {
            manifest: manifests['calendar'],
            settings: {
              weekStart: 1
            }
          }
        },
        enabledPlugins: new Set(['obsidian-tasks-plugin', 'dataview', 'calendar'])
      }
    };

    // Create registry with app in constructor
    registry = new PluginRegistry(mockApp as any);
  });

  afterEach(() => {
    registry.cleanup();
  });

  describe('Plugin Discovery', () => {
    it('should discover installed plugins', async () => {
      await registry.discoverPlugins();
      
      const plugins = registry.getInstalledPlugins();
      
      expect(plugins).toHaveLength(3);
      expect(plugins.map(p => p.id)).toContain('obsidian-tasks-plugin');
      expect(plugins.map(p => p.id)).toContain('dataview');
      expect(plugins.map(p => p.id)).toContain('calendar');
    });

    it('should detect plugin metadata', async () => {
      await registry.discoverPlugins();
      
      const plugins = registry.getInstalledPlugins();
      const tasksPlugin = plugins.find(p => p.id === 'obsidian-tasks-plugin');
      
      expect(tasksPlugin).toBeDefined();
      expect(tasksPlugin?.name).toBe('Tasks');
      expect(tasksPlugin?.version).toBe('1.5.0');
      expect(tasksPlugin?.isEnabled).toBe(true);
    });

    it('should identify available plugins for integration', async () => {
      await registry.discoverPlugins();
      
      const availablePlugins = registry.getAvailablePlugins();
      
      expect(availablePlugins.length).toBeGreaterThan(0);
      expect(availablePlugins.some(p => p.id === 'obsidian-tasks-plugin')).toBe(true);
    });

    it('should check plugin compatibility', async () => {
      await registry.discoverPlugins();
      
      const isTasksCompatible = registry.isVersionCompatible('obsidian-tasks-plugin', '1.0.0');
      const isDataviewCompatible = registry.isVersionCompatible('dataview', '0.5.0');
      
      expect(isTasksCompatible).toBe(true);
      expect(isDataviewCompatible).toBe(true);
    });
  });

  describe('Dynamic Capability Discovery', () => {
    it('should discover tasks plugin capabilities', async () => {
      await registry.discoverPlugins();
      
      const plugins = registry.getInstalledPlugins();
      const tasksPlugin = plugins.find(p => p.id === 'obsidian-tasks-plugin');
      
      expect(tasksPlugin?.detailedCapabilities).toBeDefined();
      expect(tasksPlugin?.detailedCapabilities?.length).toBeGreaterThan(0);
      
      const hasTaskApi = tasksPlugin?.detailedCapabilities?.some(cap => cap.name === 'task-api');
      expect(hasTaskApi).toBe(true);
    });

    it('should discover dataview plugin capabilities', async () => {
      await registry.discoverPlugins();
      
      const plugins = registry.getInstalledPlugins();
      const dataviewPlugin = plugins.find(p => p.id === 'dataview');
      
      expect(dataviewPlugin?.detailedCapabilities).toBeDefined();
      expect(dataviewPlugin?.detailedCapabilities?.length).toBeGreaterThan(0);
      
      const hasQueryApi = dataviewPlugin?.detailedCapabilities?.some(cap => cap.name === 'query-api');
      expect(hasQueryApi).toBe(true);
    });

    it('should discover calendar plugin capabilities', async () => {
      await registry.discoverPlugins();
      
      const plugins = registry.getInstalledPlugins();
      const calendarPlugin = plugins.find(p => p.id === 'calendar');
      
      expect(calendarPlugin).toBeDefined();
      expect(calendarPlugin?.capabilities).toContain('due-date-sync');
    });
  });

  describe('Health Monitoring', () => {
    it('should check plugin health status', async () => {
      await registry.discoverPlugins();
      
      const health = registry.checkPluginHealth('obsidian-tasks-plugin');
      
      expect(health).toBeDefined();
      expect(health.status).toBe('healthy');
      expect(health.lastCheck).toBeDefined();
    });

    it('should detect plugin issues', async () => {
      await registry.discoverPlugins();
      
      // Force a plugin to be disabled
      mockApp.plugins.enabledPlugins.delete('dataview');
      
      await registry.discoverPlugins(); // Refresh
      
      const plugins = registry.getInstalledPlugins();
      const dataviewPlugin = plugins.find(p => p.id === 'dataview');
      
      expect(dataviewPlugin).toBeUndefined(); // Should not be in enabled plugins
    });

    it('should provide health recommendations', async () => {
      await registry.discoverPlugins();
      
      const recommendations = registry.getHealthRecommendations();
      
      expect(recommendations).toBeDefined();
      expect(Array.isArray(recommendations)).toBe(true);
    });
  });

  describe('Integration Status', () => {
    it('should provide integration overview', async () => {
      await registry.discoverPlugins();
      
      const overview = registry.getIntegrationOverview();
      
      expect(overview.totalPlugins).toBe(3);
      expect(overview.compatiblePlugins).toBeGreaterThan(0);
      expect(overview.activeIntegrations).toBeGreaterThan(0);
    });

    it('should list plugin requirements', async () => {
      await registry.discoverPlugins();
      
      const requirements = registry.getPluginRequirements('obsidian-tasks-plugin');
      
      expect(requirements).toBeDefined();
      expect(requirements.required.length).toBeGreaterThan(0);
    });
  });
});
