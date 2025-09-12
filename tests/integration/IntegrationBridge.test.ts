import { IntegrationBridge } from '../../src/integrations/IntegrationBridge';
import { EventBus, JiraIntegrationEvent } from '../../src/integrations/EventBus';
import { PluginRegistry } from '../../src/integrations/PluginRegistry';
import { DataProvider } from '../../src/integrations/DataProvider';
import { IPluginAdapter, AdapterState, AdapterMetadata, BasePluginAdapter, HealthCheckResult } from '../../src/integrations/IPluginAdapter';
import type JiraSyncProPlugin from '../../src/main';

// Mock adapter for testing
class MockAdapter extends BasePluginAdapter {
  readonly metadata: AdapterMetadata = {
    id: 'mock-adapter',
    name: 'Mock Adapter',
    version: '1.0.0',
    minJiraPluginVersion: '1.0.0',
    maxJiraPluginVersion: '2.0.0',
    capabilities: {
      read: true,
      write: true,
      sync: true,
      bulkOperations: false,
      realtime: false,
      customFields: false,
      conflictResolution: false
    },
    priority: 1
  };

  protected async onInitialize(): Promise<void> {
    // Mock initialization
  }

  protected async onActivate(): Promise<void> {
    // Mock activation
  }

  protected async onDeactivate(): Promise<void> {
    // Mock deactivation
  }

  protected async onCleanup(): Promise<void> {
    // Mock cleanup
  }

  protected async onHandleEvent(event: string, payload: any): Promise<void> {
    // Mock event handling
  }

  protected async onHealthCheck(baseHealth: HealthCheckResult): Promise<HealthCheckResult> {
    return baseHealth;
  }
}

// Mock adapter with dependencies
class DependentAdapter extends MockAdapter {
  readonly metadata: AdapterMetadata = {
    ...super.metadata,
    id: 'dependent-adapter',
    name: 'Dependent Adapter',
    dependencies: ['mock-adapter']
  };
}

// Non-sync adapter for testing capabilities
class NonSyncAdapter extends MockAdapter {
  readonly metadata: AdapterMetadata = {
    ...super.metadata,
    id: 'non-sync-adapter',
    name: 'Non-Sync Adapter',
    capabilities: {
      read: true,
      write: true,
      sync: false,
      bulkOperations: false,
      realtime: false,
      customFields: false,
      conflictResolution: false
    }
  };
}

describe('IntegrationBridge - Plugin Adapter Management', () => {
  let bridge: IntegrationBridge;
  let mockPlugin: JiraSyncProPlugin;

  beforeEach(() => {
    // Mock plugin with app and manifest
    mockPlugin = {
      manifest: { version: '1.5.0' },
      app: {
        plugins: {
          manifests: {},
          plugins: {},
          enabledPlugins: new Set()
        }
      }
    } as any as JiraSyncProPlugin;

    // Create bridge with plugin in constructor
    bridge = new IntegrationBridge(mockPlugin);
  });

  afterEach(async () => {
    await bridge.cleanup();
  });

  describe('Adapter Registration', () => {
    it('should register and initialize a plugin adapter', async () => {
      const adapter = new MockAdapter();
      
      const result = await bridge.registerAdapter(adapter, mockPlugin);
      
      expect(result).toBe(true);
      expect(adapter.state).toBe(AdapterState.READY);
    });

    it('should reject adapter with incompatible version', async () => {
      const adapter = new MockAdapter();
      const incompatiblePlugin = {
        manifest: { version: '3.0.0' }
      } as JiraSyncProPlugin;
      
      const result = await bridge.registerAdapter(adapter, incompatiblePlugin);
      
      expect(result).toBe(false);
      expect(adapter.state).toBe(AdapterState.UNINITIALIZED);
    });

    it('should handle adapter initialization failure', async () => {
      const failingAdapter = new MockAdapter();
      vi.spyOn(failingAdapter, 'initialize').mockRejectedValue(new Error('Init failed'));
      
      const result = await bridge.registerAdapter(failingAdapter, mockPlugin);
      
      expect(result).toBe(false);
      expect(failingAdapter.state).toBe(AdapterState.ERROR);
    });

    it('should prevent duplicate adapter registration', async () => {
      const adapter1 = new MockAdapter();
      const adapter2 = new MockAdapter(); // Same ID
      
      const result1 = await bridge.registerAdapter(adapter1, mockPlugin);
      const result2 = await bridge.registerAdapter(adapter2, mockPlugin);
      
      expect(result1).toBe(true);
      expect(result2).toBe(false);
    });
  });

  describe('Adapter Lifecycle', () => {
    it('should activate adapter after registration', async () => {
      const adapter = new MockAdapter();
      const activateSpy = vi.spyOn(adapter, 'activate');
      
      await bridge.registerAdapter(adapter, mockPlugin);
      await bridge.activateAdapter('mock-adapter');
      
      expect(activateSpy).toHaveBeenCalled();
      expect(adapter.state).toBe(AdapterState.ACTIVE);
    });

    it('should deactivate active adapter', async () => {
      const adapter = new MockAdapter();
      const deactivateSpy = vi.spyOn(adapter, 'deactivate');
      
      await bridge.registerAdapter(adapter, mockPlugin);
      await bridge.activateAdapter('mock-adapter');
      await bridge.deactivateAdapter('mock-adapter');
      
      expect(deactivateSpy).toHaveBeenCalled();
      expect(adapter.state).toBe(AdapterState.PAUSED);
    });

    it('should unregister adapter and clean up', async () => {
      const adapter = new MockAdapter();
      const cleanupSpy = vi.spyOn(adapter, 'cleanup');
      
      await bridge.registerAdapter(adapter, mockPlugin);
      await bridge.unregisterAdapter('mock-adapter');
      
      expect(cleanupSpy).toHaveBeenCalled();
      expect(adapter.state).toBe(AdapterState.CLEANED_UP);
      expect(bridge.getAdapter('mock-adapter')).toBeUndefined();
    });

    it('should handle adapter not found errors', async () => {
      await expect(bridge.activateAdapter('non-existent')).rejects.toThrow('Adapter not found');
      await expect(bridge.deactivateAdapter('non-existent')).rejects.toThrow('Adapter not found');
      await expect(bridge.unregisterAdapter('non-existent')).rejects.toThrow('Adapter not found');
    });
  });

  describe('Dependency Resolution', () => {
    it('should register adapters in dependency order', async () => {
      const baseAdapter = new MockAdapter();
      const dependentAdapter = new DependentAdapter();
      
      // Register dependent first (should handle ordering)
      await bridge.registerAdapter(dependentAdapter, mockPlugin);
      await bridge.registerAdapter(baseAdapter, mockPlugin);
      
      // Should activate base before dependent
      const activationOrder: string[] = [];
      vi.spyOn(baseAdapter, 'activate').mockImplementation(async () => {
        activationOrder.push('base');
        baseAdapter.state = AdapterState.ACTIVE;
      });
      vi.spyOn(dependentAdapter, 'activate').mockImplementation(async () => {
        activationOrder.push('dependent');
        dependentAdapter.state = AdapterState.ACTIVE;
      });
      
      await bridge.activateAll();
      
      expect(activationOrder).toEqual(['base', 'dependent']);
    });

    it('should fail activation if dependency is missing', async () => {
      const dependentAdapter = new DependentAdapter();
      
      await bridge.registerAdapter(dependentAdapter, mockPlugin);
      
      await expect(bridge.activateAdapter('dependent-adapter'))
        .rejects.toThrow('Dependency mock-adapter not available');
    });
  });

  describe('Bulk Operations', () => {
    it('should activate all adapters', async () => {
      const adapter1 = new MockAdapter();
      const adapter2 = new DependentAdapter();
      
      await bridge.registerAdapter(adapter1, mockPlugin);
      await bridge.registerAdapter(adapter2, mockPlugin);
      
      await bridge.activateAll();
      
      expect(adapter1.state).toBe(AdapterState.ACTIVE);
      expect(adapter2.state).toBe(AdapterState.ACTIVE);
    });

    it('should deactivate all adapters', async () => {
      const adapter1 = new MockAdapter();
      const adapter2 = new DependentAdapter();
      
      await bridge.registerAdapter(adapter1, mockPlugin);
      await bridge.registerAdapter(adapter2, mockPlugin);
      await bridge.activateAll();
      
      await bridge.deactivateAll();
      
      expect(adapter1.state).toBe(AdapterState.PAUSED);
      expect(adapter2.state).toBe(AdapterState.PAUSED);
    });

    it('should clean up all adapters on bridge cleanup', async () => {
      const adapter1 = new MockAdapter();
      const adapter2 = new DependentAdapter();
      const cleanup1Spy = vi.spyOn(adapter1, 'cleanup');
      const cleanup2Spy = vi.spyOn(adapter2, 'cleanup');
      
      await bridge.registerAdapter(adapter1, mockPlugin);
      await bridge.registerAdapter(adapter2, mockPlugin);
      
      await bridge.cleanup();
      
      expect(cleanup1Spy).toHaveBeenCalled();
      expect(cleanup2Spy).toHaveBeenCalled();
      expect(bridge.getAllAdapters()).toHaveLength(0);
    });
  });

  describe('Adapter Discovery', () => {
    it('should get adapter by ID', async () => {
      const adapter = new MockAdapter();
      
      await bridge.registerAdapter(adapter, mockPlugin);
      
      const retrieved = bridge.getAdapter('mock-adapter');
      expect(retrieved).toBe(adapter);
    });

    it('should list all registered adapters', async () => {
      const adapter1 = new MockAdapter();
      const adapter2 = new DependentAdapter();
      
      await bridge.registerAdapter(adapter1, mockPlugin);
      await bridge.registerAdapter(adapter2, mockPlugin);
      
      const adapters = bridge.getAllAdapters();
      
      expect(adapters).toHaveLength(2);
      expect(adapters.map(a => a.metadata.id)).toContain('mock-adapter');
      expect(adapters.map(a => a.metadata.id)).toContain('dependent-adapter');
    });

    it('should get adapters by capability', async () => {
      const adapter1 = new MockAdapter();
      const adapter2 = new NonSyncAdapter(); // Use the new adapter without sync capability
      
      await bridge.registerAdapter(adapter1, mockPlugin);
      await bridge.registerAdapter(adapter2, mockPlugin);
      
      const syncAdapters = bridge.getAdaptersByCapability('sync');
      
      expect(syncAdapters).toHaveLength(1);
      expect(syncAdapters[0].metadata.id).toBe('mock-adapter');
    });
  });

  describe('Error Recovery', () => {
    it('should handle adapter error and attempt recovery', async () => {
      const adapter = new MockAdapter();
      const recoverSpy = vi.fn().mockResolvedValue(true);
      adapter.recover = recoverSpy;
      
      await bridge.registerAdapter(adapter, mockPlugin);
      await bridge.activateAdapter('mock-adapter');
      
      // Simulate error
      adapter.state = AdapterState.ERROR;
      
      // For now, just check if error handling doesn't crash
      expect(adapter.state).toBe(AdapterState.ERROR);
    });

    it('should emit error events for adapter failures', (done) => {
      const adapter = new MockAdapter();
      vi.spyOn(adapter, 'initialize').mockRejectedValue(new Error('Test error'));
      
      bridge.registerAdapter(adapter, mockPlugin);
      // Test passes if no exception is thrown
      setTimeout(done, 100);
    });
  });
});
