/**
 * Plugin Lifecycle Integration Tests
 * Tests the complete plugin lifecycle including event system integration with real Obsidian APIs
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { App, Plugin, Vault, Events, TFile } from 'obsidian';
import JiraPluginBridge from '../../src/main';
import { JiraEventBus } from '../../src/events/obsidian-bridge';
import { 
  JiraPluginEvent, 
  EventTypeMap,
  JiraSyncStartEvent,
  JiraSyncCompleteEvent,
  JiraTicketUpdatedEvent,
  JiraConflictDetectedEvent
} from '../../src/events/event-types';
import type { Mock, Mocked, MockedFunction } from 'vitest';
// Mock Obsidian APIs while preserving real behavior where possible
const mockApp: Partial<App> = {
  vault: {
    on: vi.fn(),
    off: vi.fn(),
    create: vi.fn(),
    modify: vi.fn(),
    delete: vi.fn(),
    read: vi.fn(),
    getAbstractFileByPath: vi.fn(),
    createFolder: vi.fn()
  } as Partial<Vault> as Vault,
  workspace: {
    off: vi.fn()
  }
};
// Create mock plugin settings
const mockSettings = {
  jiraUrl: 'https://test.atlassian.net',
  apiToken: 'test-api-token',
  userEmail: 'test@example.com',
  syncInterval: 300000,
  outputPath: 'Areas/Work/Jira Tickets',
  jqlQuery: 'assignee=currentUser() AND resolution=Unresolved',
  enableBidirectional: true,
  conflictResolution: 'manual' as const,
  batchSize: 10,
  retryAttempts: 3,
  debugLogging: true
describe('Plugin Lifecycle Integration', () => {
  let plugin: JiraPluginBridge;
  let eventBus: JiraEventBus;
  beforeEach(async () => {
    // Create plugin instance
    plugin = new JiraPluginBridge(mockApp as App, {} as any);
    
    // Mock plugin methods and properties
    plugin.loadData = vi.fn().mockResolvedValue(mockSettings);
    plugin.saveData = vi.fn().mockResolvedValue(undefined);
    plugin.addRibbonIcon = vi.fn();
    plugin.addCommand = vi.fn();
    plugin.addSettingTab = vi.fn();
    plugin.register = vi.fn();
    plugin.registerEvent = vi.fn();
    // Mock console methods to reduce noise
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(async () => {
    if (plugin) {
      await plugin.onunload();
    }
    vi.clearAllMocks();
  describe('Plugin Loading and Initialization', () => {
    it('should load plugin and initialize event bus successfully', async () => {
      await plugin.onload();
      expect(plugin.eventBus).toBeDefined();
      expect(plugin.eventBus).toBeInstanceOf(JiraEventBus);
      expect(plugin.addRibbonIcon).toHaveBeenCalledWith('refresh-cw', 'Sync Jira tickets', expect.any(Function));
      expect(plugin.addCommand).toHaveBeenCalledWith(expect.objectContaining({
        id: 'sync-jira-tickets',
        name: 'Sync Jira tickets'
      }));
    });
    it('should load settings from storage during initialization', async () => {
      expect(plugin.loadData).toHaveBeenCalled();
      expect(plugin.settings).toEqual(mockSettings);
    it('should initialize sync engine when configuration is valid', async () => {
      expect(plugin.syncEngine).toBeDefined();
      expect(console.log).toHaveBeenCalledWith('Sync engine initialized successfully');
    it('should handle missing configuration gracefully', async () => {
      const invalidSettings = { ...mockSettings, jiraUrl: '', apiToken: '' };
      plugin.loadData = vi.fn().mockResolvedValue(invalidSettings);
      expect(plugin.syncEngine).toBeNull();
      expect(console.log).not.toHaveBeenCalledWith('Sync engine initialized successfully');
    it('should set up demo event listeners for debugging', async () => {
      
      // Verify event listeners are registered by checking internal subscriptions
      const subscriptions = plugin.eventBus!.getActiveSubscriptions();
      expect(subscriptions['jira:sync:start']).toBeGreaterThan(0);
      expect(subscriptions['jira:sync:complete']).toBeGreaterThan(0);
      expect(subscriptions['jira:ticket:updated']).toBeGreaterThan(0);
      expect(subscriptions['jira:conflict:detected']).toBeGreaterThan(0);
  describe('Event Bus Integration', () => {
    beforeEach(async () => {
      eventBus = plugin.eventBus!;
    it('should publish and receive sync start events', async () => {
      let receivedEvent: JiraSyncStartEvent | null = null;
      eventBus.on('jira:sync:start', (event) => {
        receivedEvent = event;
      });
      const payload = {
        syncType: 'full' as const,
        estimatedDuration: 30000,
        ticketCount: 25
      };
      await eventBus.publish('jira:sync:start', payload);
      expect(receivedEvent).toBeDefined();
      expect(receivedEvent!.type).toBe('jira:sync:start');
      expect(receivedEvent!.payload).toEqual(payload);
      expect(receivedEvent!.source).toBe('jira-plugin-bridge');
      expect(receivedEvent!.timestamp).toBeGreaterThan(0);
      expect(receivedEvent!.eventId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    it('should handle sync complete events with metrics', async () => {
      let receivedEvent: JiraSyncCompleteEvent | null = null;
      eventBus.on('jira:sync:complete', (event) => {
        result: {
          success: true,
          syncedCount: 15,
          failedCount: 2,
          conflicts: [],
          errors: ['Minor error'],
          duration: 25000
        },
        syncType: 'incremental' as const
      await eventBus.publish('jira:sync:complete', payload);
      expect(receivedEvent!.payload.result.success).toBe(true);
      expect(receivedEvent!.payload.result.syncedCount).toBe(15);
      expect(receivedEvent!.payload.syncType).toBe('incremental');
    it('should handle ticket update events with proper data structure', async () => {
      let receivedEvent: JiraTicketUpdatedEvent | null = null;
      eventBus.on('jira:ticket:updated', (event) => {
        ticket: {
          id: '12345',
          key: 'TEST-123',
          self: 'https://test.atlassian.net/rest/api/2/issue/12345',
          fields: {
            summary: 'Updated test ticket',
            status: { name: 'In Progress' },
            updated: '2024-01-15T10:30:00.000Z'
          }
        filePath: 'Areas/Work/Jira Tickets/TEST/TEST-123.md',
        previousData: {
            summary: 'Original test ticket',
            status: { name: 'To Do' }
        changedFields: ['summary', 'status'],
        source: 'jira' as const
      await eventBus.publish('jira:ticket:updated', payload);
      expect(receivedEvent!.payload.ticket.key).toBe('TEST-123');
      expect(receivedEvent!.payload.changedFields).toEqual(['summary', 'status']);
      expect(receivedEvent!.payload.source).toBe('jira');
    it('should handle conflict detection events', async () => {
      let receivedEvent: JiraConflictDetectedEvent | null = null;
      eventBus.on('jira:conflict:detected', (event) => {
        conflict: {
          issueKey: 'TEST-456',
          field: 'summary',
          localValue: 'Local version',
          remoteValue: 'Remote version',
          localTimestamp: Date.now() - 1000,
          remoteTimestamp: Date.now()
        resolution: 'pending' as const,
        autoResolutionStrategy: 'remote' as const
      await eventBus.publish('jira:conflict:detected', payload);
      expect(receivedEvent!.payload.conflict.issueKey).toBe('TEST-456');
      expect(receivedEvent!.payload.resolution).toBe('pending');
    it('should support event handler priorities', async () => {
      const executionOrder: number[] = [];
      // Register handlers with different priorities
      eventBus.on('jira:sync:start', () => executionOrder.push(1), { priority: 1 });
      eventBus.on('jira:sync:start', () => executionOrder.push(3), { priority: 3 });
      eventBus.on('jira:sync:start', () => executionOrder.push(2), { priority: 2 });
      await eventBus.publish('jira:sync:start', {
        syncType: 'full',
        estimatedDuration: 10000
      expect(executionOrder).toEqual([3, 2, 1]); // Higher priority first
    it('should support one-time event listeners', async () => {
      let callCount = 0;
      eventBus.on('jira:sync:start', () => callCount++, { once: true });
      await eventBus.publish('jira:sync:start', { syncType: 'full' });
      expect(callCount).toBe(1); // Should only be called once
    it('should collect performance metrics for events', async () => {
      // Register some handlers with artificial delays
      eventBus.on('jira:sync:start', async () => {
        await new Promise(resolve => setTimeout(resolve, 5));
        await new Promise(resolve => setTimeout(resolve, 10));
      const metrics = eventBus.getMetrics('jira:sync:start');
      expect(metrics).toHaveLength(1);
      expect(metrics[0].eventType).toBe('jira:sync:start');
      expect(metrics[0].handlerCount).toBe(2);
      expect(metrics[0].totalDuration).toBeGreaterThan(0);
    it('should handle async event handlers correctly', async () => {
      let asyncHandlerCompleted = false;
      let syncHandlerCompleted = false;
        asyncHandlerCompleted = true;
      eventBus.on('jira:sync:start', () => {
        syncHandlerCompleted = true;
      expect(asyncHandlerCompleted).toBe(true);
      expect(syncHandlerCompleted).toBe(true);
    it('should isolate errors in event handlers', async () => {
      let goodHandlerCalled = false;
      // Register a handler that throws an error
        throw new Error('Handler error');
      // Register a good handler
        goodHandlerCalled = true;
      // Should not throw, but should log error
      expect(goodHandlerCalled).toBe(true);
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining("Error in event handler for 'jira:sync:start'"),
        expect.any(Error)
      );
  describe('Public Plugin API', () => {
    it('should allow other plugins to register event listeners', () => {
      const handler = vi.fn();
      plugin.addEventListener('jira:sync:start', handler);
      expect(plugin.eventBus!.getActiveSubscriptions()['jira:sync:start']).toBeGreaterThan(0);
    it('should allow other plugins to remove event listeners', () => {
      const initialCount = plugin.eventBus!.getActiveSubscriptions()['jira:sync:start'];
      plugin.removeEventListener('jira:sync:start', handler);
      const finalCount = plugin.eventBus!.getActiveSubscriptions()['jira:sync:start'] || 0;
      expect(finalCount).toBe(initialCount - 1);
    it('should provide manual sync trigger for other plugins', async () => {
      // Mock the manual sync method
      plugin.performManualSync = vi.fn().mockResolvedValue(undefined);
      await plugin.triggerSync();
      expect(plugin.performManualSync).toHaveBeenCalled();
    it('should throw error when accessing event bus before initialization', () => {
      const uninitializedPlugin = new JiraPluginBridge(mockApp as App, {} as any);
      expect(() => {
        uninitializedPlugin.addEventListener('jira:sync:start', () => {});
      }).toThrow('Event bus not initialized');
  describe('Plugin Cleanup and Shutdown', () => {
    it('should cleanup resources on unload', async () => {
      const eventBus = plugin.eventBus!;
      const shutdownSpy = vi.spyOn(eventBus, 'shutdown');
      expect(shutdownSpy).toHaveBeenCalled();
      expect(plugin.eventBus).toBeNull();
    it('should clear periodic sync interval on unload', async () => {
      const clearIntervalSpy = vi.spyOn(window, 'clearInterval');
      // Simulate having a sync interval
      (plugin as any).syncIntervalId = 12345;
      expect(clearIntervalSpy).toHaveBeenCalledWith(12345);
      expect((plugin as any).syncIntervalId).toBeNull();
    it('should shutdown sync engine gracefully', async () => {
      const syncEngine = plugin.syncEngine!;
      const shutdownSpy = vi.spyOn(syncEngine, 'shutdown');
    it('should clear all event listeners on shutdown', async () => {
      const removeAllListenersSpy = vi.spyOn(eventBus, 'removeAllListeners');
      expect(removeAllListenersSpy).toHaveBeenCalled();
  describe('Event Bus Health and Monitoring', () => {
    it('should report healthy status when functioning normally', async () => {
      // Generate some normal event activity
      await eventBus.publish('jira:sync:complete', { 
        result: { success: true, syncedCount: 1, failedCount: 0, conflicts: [], errors: [], duration: 1000 },
        syncType: 'full' 
      expect(eventBus.isHealthy()).toBe(true);
    it('should provide event count statistics', async () => {
      await eventBus.publish('jira:sync:start', { syncType: 'incremental' });
      const counts = eventBus.getEventCounts();
      expect(counts['jira:sync:start']).toBe(2);
      expect(counts['jira:sync:complete']).toBe(1);
    it('should enable and disable debug logging', () => {
        eventBus.setDebugLogging(true);
      }).not.toThrow();
      expect(console.log).toHaveBeenCalledWith('JiraEventBus debug logging enabled');
      eventBus.setDebugLogging(false);
      expect(console.log).toHaveBeenCalledWith('JiraEventBus debug logging disabled');
    it('should clear metrics when requested', () => {
      eventBus.clearMetrics();
      expect(console.log).toHaveBeenCalledWith('Event bus performance metrics cleared');
      const metrics = eventBus.getMetrics();
      expect(metrics).toHaveLength(0);
  describe('Settings Management', () => {
    it('should save settings and reinitialize components', async () => {
      const newSettings = { ...mockSettings, syncInterval: 600000 };
      plugin.settings = newSettings;
      await plugin.saveSettings();
      expect(plugin.saveData).toHaveBeenCalledWith(newSettings);
    it('should stop sync when configuration becomes invalid', async () => {
      plugin.settings = invalidSettings;
});
