/**
 * EventManager Unit Tests
 * Following RED-GREEN-Refactor methodology
 * Tests actual implementation with memory-safe cleanup
 */

import { EventManager } from '../../../src/events/event-manager';
import { EventBus } from '../../../src/events/event-bus';
import {
  JiraSyncStartEvent,
  JiraTicketUpdatedEvent,
  EventTypeMap
} from '../../../src/events/event-types';
import type { Mock, Mocked, MockedFunction } from 'vitest';
// Mock plugin class for testing
class MockPlugin {
  id: string;
  constructor(id: string) {
    this.id = id;
  }
}
describe('EventManager', () => {
  let eventManager: EventManager;
  let eventBus: EventBus;
  let mockPlugin1: MockPlugin;
  let mockPlugin2: MockPlugin;
  beforeEach(() => {
    eventBus = new EventBus();
    eventManager = new EventManager(eventBus);
    mockPlugin1 = new MockPlugin('plugin1');
    mockPlugin2 = new MockPlugin('plugin2');
  });
  afterEach(() => {
    eventManager.forceCleanup();
  describe('Handler Registration', () => {
    it('should register handler bound to plugin instance', () => {
      const handler = vi.fn();
      const handlerId = eventManager.registerHandler(
        mockPlugin1,
        'jira:sync:start',
        handler
      );
      expect(handlerId).toMatch(/^handler_\d+$/);
      expect(eventManager.getSubscriptionCount(mockPlugin1)).toBe(1);
      expect(eventBus.listenerCount('jira:sync:start')).toBe(1);
    });
    it('should register multiple handlers for same plugin', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      eventManager.registerHandler(mockPlugin1, 'jira:sync:start', handler1);
      eventManager.registerHandler(mockPlugin1, 'jira:sync:complete', handler2);
      expect(eventManager.getSubscriptionCount(mockPlugin1)).toBe(2);
      expect(eventManager.getSubscribedEvents(mockPlugin1)).toContain('jira:sync:start');
      expect(eventManager.getSubscribedEvents(mockPlugin1)).toContain('jira:sync:complete');
    it('should register handlers for different plugin instances independently', () => {
      eventManager.registerHandler(mockPlugin2, 'jira:sync:start', handler2);
      expect(eventManager.getSubscriptionCount(mockPlugin2)).toBe(1);
      expect(eventBus.listenerCount('jira:sync:start')).toBe(2);
    it('should register once handler correctly', () => {
      const handlerId = eventManager.registerOnceHandler(
    it('should handle handler registration with custom config', () => {
        handler,
        { priority: 10, async: false }
  describe('Handler Execution', () => {
    it('should execute registered handlers when events are emitted', async () => {
      eventManager.registerHandler(mockPlugin1, 'jira:sync:start', handler);
      const mockEvent: JiraSyncStartEvent = {
        type: 'jira:sync:start',
        timestamp: Date.now(),
        source: 'jira-plugin-bridge',
        eventId: 'test-event-1',
        payload: {
          syncType: 'full',
          estimatedDuration: 5000
        }
      };
      await eventManager.emit('jira:sync:start', mockEvent);
      expect(handler).toHaveBeenCalledWith(mockEvent);
      expect(handler).toHaveBeenCalledTimes(1);
    it('should execute handlers from multiple plugins', async () => {
          syncType: 'incremental'
      expect(handler1).toHaveBeenCalledWith(mockEvent);
      expect(handler2).toHaveBeenCalledWith(mockEvent);
    it('should remove once handlers after execution', async () => {
      eventManager.registerOnceHandler(mockPlugin1, 'jira:sync:start', handler);
          syncType: 'full'
      // First emit
      expect(eventManager.getSubscriptionCount(mockPlugin1)).toBe(0);
      // Second emit - handler should not execute
  describe('Handler Cleanup', () => {
    it('should unregister specific handler by ID', () => {
      const unregistered = eventManager.unregisterHandler(mockPlugin1, handlerId);
      expect(unregistered).toBe(true);
      expect(eventBus.listenerCount('jira:sync:start')).toBe(0);
    it('should return false when unregistering non-existent handler', () => {
      const unregistered = eventManager.unregisterHandler(
        'non-existent-handler'
      expect(unregistered).toBe(false);
    it('should unregister all handlers for a plugin instance', () => {
      const handler3 = vi.fn();
      // Register handlers for plugin1
      
      // Register handler for plugin2
      eventManager.registerHandler(mockPlugin2, 'jira:sync:start', handler3);
      const unregisteredCount = eventManager.unregisterAllHandlers(mockPlugin1);
      expect(unregisteredCount).toBe(2);
    it('should handle cleanup of non-registered plugin', () => {
      expect(unregisteredCount).toBe(0);
  describe('Memory Safety', () => {
    it('should use WeakMap for memory-safe plugin tracking', () => {
      // Simulate garbage collection by nullifying reference
      // Note: In real scenario, WeakMap would automatically clean up
      // when plugin instance is garbage collected
      mockPlugin1 = null as any;
      // We can't directly test WeakMap cleanup since it's automatic,
      // but we can verify the registration structure works
      const newPlugin = new MockPlugin('new-plugin');
      expect(eventManager.getSubscriptionCount(newPlugin)).toBe(0);
  describe('Event Creation', () => {
    it('should create event with correct structure and default properties', () => {
      const payload = {
        syncType: 'full' as const,
        estimatedDuration: 5000
      const event = eventManager.createEvent('jira:sync:start', payload);
      expect(event.type).toBe('jira:sync:start');
      expect(event.source).toBe('jira-plugin-bridge');
      expect(event.timestamp).toBeCloseTo(Date.now(), -1);
      expect(event.eventId).toMatch(/^\d+-[a-z0-9]+$/);
      expect(event.payload).toEqual(payload);
    it('should generate unique event IDs', () => {
      const event1 = eventManager.createEvent('jira:sync:start', { syncType: 'full' });
      const event2 = eventManager.createEvent('jira:sync:start', { syncType: 'full' });
      expect(event1.eventId).not.toBe(event2.eventId);
  describe('Health Monitoring', () => {
    it('should provide accurate health status', () => {
      eventManager.registerHandler(mockPlugin2, 'jira:sync:start', handler1);
      const health = eventManager.getHealthStatus();
      expect(health.totalEventTypes).toBe(2);
      expect(health.totalHandlers).toBe(3);
      expect(health.hasListeners).toBe(true);
      expect(Array.isArray(health.metrics)).toBe(true);
    it('should report empty health status when no handlers registered', () => {
      expect(health.totalEventTypes).toBe(0);
      expect(health.totalHandlers).toBe(0);
      expect(health.hasListeners).toBe(false);
      expect(health.metrics).toHaveLength(0);
  describe('Subscription Information', () => {
    it('should return correct subscription count for plugin', () => {
      eventManager.registerHandler(mockPlugin1, 'jira:sync:complete', handler);
    it('should return subscribed event types for plugin', () => {
      eventManager.registerHandler(mockPlugin1, 'jira:ticket:updated', handler);
      const subscribedEvents = eventManager.getSubscribedEvents(mockPlugin1);
      expect(subscribedEvents).toContain('jira:sync:start');
      expect(subscribedEvents).toContain('jira:ticket:updated');
      expect(subscribedEvents).toHaveLength(2);
    it('should return empty array for plugin with no subscriptions', () => {
      expect(subscribedEvents).toEqual([]);
    it('should handle duplicate event type registrations correctly', () => {
      eventManager.registerHandler(mockPlugin1, 'jira:sync:start', handler2);
      expect(subscribedEvents).toEqual(['jira:sync:start']);
      expect(subscribedEvents).toHaveLength(1);
  describe('Force Cleanup', () => {
    it('should clean up all handlers when force cleanup is called', () => {
      eventManager.registerHandler(mockPlugin2, 'jira:sync:complete', handler);
      expect(eventBus.hasListeners()).toBe(true);
      eventManager.forceCleanup();
      expect(eventBus.hasListeners()).toBe(false);
      expect(eventBus.listenerCount('jira:sync:complete')).toBe(0);
  describe('Integration with EventBus', () => {
    it('should properly integrate with custom EventBus instance', () => {
      const customEventBus = new EventBus();
      const customEventManager = new EventManager(customEventBus);
      customEventManager.registerHandler(mockPlugin1, 'jira:sync:start', handler);
      expect(customEventBus.listenerCount('jira:sync:start')).toBe(1);
      expect(eventBus.listenerCount('jira:sync:start')).toBe(0); // Original bus unchanged
});
