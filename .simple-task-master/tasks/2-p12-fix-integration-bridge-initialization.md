---
schema: 1
id: 2
title: "[P1.2] Fix Integration Bridge Initialization"
status: pending
created: "2025-09-12T14:00:39.649Z"
updated: "2025-09-12T14:00:39.649Z"
tags:
  - phase1
  - core
  - high-priority
  - medium
dependencies: []
---
## Description
Ensure proper initialization of adapters with health checks, state management, and event listener registration

## Details
Technical Requirements:
- Fix adapter initialization to properly check health before activation
- Implement proper context passing to adapters (plugin, eventBus, dataProvider)
- Add health checking mechanism for adapters
- Register event listeners for active adapters
- Handle initialization failures gracefully without breaking other adapters

Implementation Steps:
1. Fix `initializeAdapters` method in IntegrationBridge
2. Add health check verification for each adapter
3. Implement proper adapter state management
4. Add event listener registration for active adapters
5. Add logging and error handling for initialization failures

Complete Code Implementation:
```typescript
async initializeAdapters(): Promise<void> {
  const availablePlugins = this.registry.getAvailablePlugins();
  
  for (const pluginInfo of availablePlugins) {
    if (!pluginInfo.isEnabled) continue;
    
    try {
      // Create adapter based on plugin ID
      const adapter = this.createAdapter(pluginInfo.id);
      
      if (adapter) {
        // Initialize with proper context
        await adapter.initialize(this.plugin, this.eventBus, this.dataProvider);
        
        // Verify adapter can communicate with its plugin
        const health = await adapter.checkHealth();
        
        if (health.status === 'healthy') {
          adapter.state = AdapterState.ACTIVE;
          this.adapters.set(pluginInfo.id, adapter);
          
          // Register event listeners
          this.registerAdapterEvents(adapter);
          
          console.log(`Activated integration: ${pluginInfo.name}`);
        } else {
          console.warn(`Integration unhealthy: ${pluginInfo.name}`, health.message);
        }
      }
    } catch (error) {
      console.error(`Failed to initialize ${pluginInfo.name}:`, error);
    }
  }
}
```

Key Implementation Notes:
- Health check must be performed BEFORE setting adapter to ACTIVE state
- Proper context (plugin, eventBus, dataProvider) must be passed to adapter.initialize()
- Event listeners are only registered for healthy adapters
- Individual adapter failures must not prevent other adapters from initializing
- Clear logging distinguishes between healthy, unhealthy, and failed adapters

## Validation
Acceptance Criteria:
- [ ] Health checks are performed before adapter activation
- [ ] Only healthy adapters are marked as ACTIVE
- [ ] Proper context (plugin, eventBus, dataProvider) is passed to adapters
- [ ] Event listeners are registered for active adapters
- [ ] Initialization failures are logged but don't break other adapters
- [ ] Tests verify health check integration
- [ ] Tests verify proper state management

Test Scenarios:
1. All adapters healthy - all should be activated and registered
2. Mixed healthy/unhealthy adapters - only healthy ones activated
3. Adapter initialization throws error - other adapters continue initializing
4. Missing plugin - adapter gracefully reports unhealthy
5. Context objects properly passed to adapter.initialize()
6. Event listeners only registered for ACTIVE adapters

Validation Steps:
1. Mock adapter.checkHealth() to return different health statuses
2. Verify only adapters with 'healthy' status get ACTIVE state
3. Test that adapter failures are isolated during initialization
4. Verify proper context passing to adapter.initialize() method
5. Check event listener registration only happens for active adapters
6. Confirm logging distinguishes between different failure types