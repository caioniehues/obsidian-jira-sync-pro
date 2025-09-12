/**
 * EventBus Unit Tests
 * Following RED-GREEN-Refactor methodology
 * Tests actual implementation, no mocks
 */

import { EventBus } from '../../../src/events/event-bus';
import {
  JiraSyncStartEvent,
  JiraSyncCompleteEvent,
  JiraTicketUpdatedEvent,
  EventTypeMap,
  EventMetrics,
} from '../../../src/events/event-types';

describe('EventBus', () => {
  let eventBus: EventBus;

  beforeEach(() => {
    eventBus = new EventBus();
  });

  afterEach(() => {
    eventBus.removeAllListeners();
    eventBus.resetMetrics();
  });

  describe('Event Registration', () => {
    it('should register event handler and return handler ID', () => {
      const handler = vi.fn();
      const handlerId = eventBus.on('jira:sync:start', handler);

      expect(handlerId).toMatch(/^handler_\d+$/);
      expect(eventBus.listenerCount('jira:sync:start')).toBe(1);
    });

    it('should register multiple handlers for same event type', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      eventBus.on('jira:sync:start', handler1);
      eventBus.on('jira:sync:start', handler2);

      expect(eventBus.listenerCount('jira:sync:start')).toBe(2);
    });

    it('should register handlers with priority ordering', () => {
      const callOrder: number[] = [];

      const lowPriorityHandler = vi.fn(() => callOrder.push(1));
      const highPriorityHandler = vi.fn(() => callOrder.push(2));
      const mediumPriorityHandler = vi.fn(() => callOrder.push(3));

      eventBus.on('jira:sync:start', lowPriorityHandler, {
        priority: 1,
        async: false,
      });
      eventBus.on('jira:sync:start', highPriorityHandler, {
        priority: 10,
        async: false,
      });
      eventBus.on('jira:sync:start', mediumPriorityHandler, {
        priority: 5,
        async: false,
      });

      const mockEvent: JiraSyncStartEvent = {
        type: 'jira:sync:start',
        timestamp: Date.now(),
        source: 'jira-plugin-bridge',
        eventId: 'test-event-1',
        payload: {
          syncType: 'full',
          estimatedDuration: 5000,
          ticketCount: 100,
        },
      };

      // Emit synchronously
      eventBus.emit('jira:sync:start', mockEvent);

      // Should execute in priority order: high (10), medium (5), low (1)
      expect(callOrder).toEqual([2, 3, 1]);
    });

    it('should register once handler that removes itself after execution', async () => {
      const handler = vi.fn();
      eventBus.once('jira:sync:start', handler);

      const mockEvent: JiraSyncStartEvent = {
        type: 'jira:sync:start',
        timestamp: Date.now(),
        source: 'jira-plugin-bridge',
        eventId: 'test-event-1',
        payload: {
          syncType: 'full',
        },
      };

      // First emit
      await eventBus.emit('jira:sync:start', mockEvent);
      expect(handler).toHaveBeenCalledTimes(1);
      expect(eventBus.listenerCount('jira:sync:start')).toBe(0);

      // Second emit - handler should not be called
      await eventBus.emit('jira:sync:start', mockEvent);
      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe('Event Emission', () => {
    it('should emit events to registered handlers with correct event data', async () => {
      const handler = vi.fn();
      eventBus.on('jira:ticket:updated', handler);

      const mockEvent: JiraTicketUpdatedEvent = {
        type: 'jira:ticket:updated',
        timestamp: Date.now(),
        source: 'jira-plugin-bridge',
        eventId: 'test-event-1',
        payload: {
          ticket: {
            key: 'TEST-123',
            summary: 'Test Issue',
            status: 'In Progress',
            assignee: 'test@example.com',
            created: new Date().toISOString(),
            updated: new Date().toISOString(),
            description: 'Test description',
          },
          filePath: '/path/to/test-123.md',
          previousData: { status: 'To Do' },
          changedFields: ['status'],
          source: 'jira',
        },
      };

      await eventBus.emit('jira:ticket:updated', mockEvent);

      expect(handler).toHaveBeenCalledWith(mockEvent);
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should handle async handlers correctly', async () => {
      const asyncHandler = vi.fn().mockImplementation(async event => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return Promise.resolve();
      });

      eventBus.on('jira:sync:start', asyncHandler, { async: true });

      const mockEvent: JiraSyncStartEvent = {
        type: 'jira:sync:start',
        timestamp: Date.now(),
        source: 'jira-plugin-bridge',
        eventId: 'test-event-1',
        payload: {
          syncType: 'incremental',
        },
      };

      const startTime = performance.now();
      await eventBus.emit('jira:sync:start', mockEvent);
      const duration = performance.now() - startTime;

      expect(asyncHandler).toHaveBeenCalledWith(mockEvent);
      expect(duration).toBeGreaterThan(8); // Should wait for async handler
    });

    it('should handle sync handlers immediately', async () => {
      const syncHandler = vi.fn();
      eventBus.on('jira:sync:start', syncHandler, { async: false });

      const mockEvent: JiraSyncStartEvent = {
        type: 'jira:sync:start',
        timestamp: Date.now(),
        source: 'jira-plugin-bridge',
        eventId: 'test-event-1',
        payload: {
          syncType: 'incremental',
        },
      };

      const startTime = performance.now();
      await eventBus.emit('jira:sync:start', mockEvent);
      const duration = performance.now() - startTime;

      expect(syncHandler).toHaveBeenCalledWith(mockEvent);
      expect(duration).toBeLessThan(5); // Should execute immediately
    });

    it('should not fail when emitting events with no handlers', async () => {
      const mockEvent: JiraSyncStartEvent = {
        type: 'jira:sync:start',
        timestamp: Date.now(),
        source: 'jira-plugin-bridge',
        eventId: 'test-event-1',
        payload: {
          syncType: 'full',
        },
      };

      await expect(
        eventBus.emit('jira:sync:start', mockEvent)
      ).resolves.toBeUndefined();
    });

    it('should continue execution even when handlers throw errors', async () => {
      const errorHandler = vi.fn().mockImplementation(() => {
        throw new Error('Handler error');
      });
      const normalHandler = vi.fn();

      eventBus.on('jira:sync:start', errorHandler);
      eventBus.on('jira:sync:start', normalHandler);

      const mockEvent: JiraSyncStartEvent = {
        type: 'jira:sync:start',
        timestamp: Date.now(),
        source: 'jira-plugin-bridge',
        eventId: 'test-event-1',
        payload: {
          syncType: 'full',
        },
      };

      await eventBus.emit('jira:sync:start', mockEvent);

      expect(errorHandler).toHaveBeenCalledWith(mockEvent);
      expect(normalHandler).toHaveBeenCalledWith(mockEvent);
    });
  });

  describe('Handler Management', () => {
    it('should unregister handler by ID', () => {
      const handler = vi.fn();
      const handlerId = eventBus.on('jira:sync:start', handler);

      expect(eventBus.listenerCount('jira:sync:start')).toBe(1);

      const removed = eventBus.off(handlerId);
      expect(removed).toBe(true);
      expect(eventBus.listenerCount('jira:sync:start')).toBe(0);
    });

    it('should return false when removing non-existent handler', () => {
      const removed = eventBus.off('non-existent-handler');
      expect(removed).toBe(false);
    });

    it('should remove all listeners for specific event type', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      eventBus.on('jira:sync:start', handler1);
      eventBus.on('jira:sync:start', handler2);
      eventBus.on('jira:sync:complete', handler1);

      expect(eventBus.listenerCount('jira:sync:start')).toBe(2);
      expect(eventBus.listenerCount('jira:sync:complete')).toBe(1);

      eventBus.removeAllListeners('jira:sync:start');

      expect(eventBus.listenerCount('jira:sync:start')).toBe(0);
      expect(eventBus.listenerCount('jira:sync:complete')).toBe(1);
    });

    it('should remove all listeners when no event type specified', () => {
      const handler = vi.fn();

      eventBus.on('jira:sync:start', handler);
      eventBus.on('jira:sync:complete', handler);

      expect(eventBus.hasListeners()).toBe(true);

      eventBus.removeAllListeners();

      expect(eventBus.hasListeners()).toBe(false);
      expect(eventBus.listenerCount('jira:sync:start')).toBe(0);
      expect(eventBus.listenerCount('jira:sync:complete')).toBe(0);
    });
  });

  describe('Performance Metrics', () => {
    it('should track event performance metrics', async () => {
      const handler1 = vi.fn().mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 5));
      });
      const handler2 = vi.fn().mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
      });

      eventBus.on('jira:sync:start', handler1);
      eventBus.on('jira:sync:start', handler2);

      const mockEvent: JiraSyncStartEvent = {
        type: 'jira:sync:start',
        timestamp: Date.now(),
        source: 'jira-plugin-bridge',
        eventId: 'test-event-1',
        payload: {
          syncType: 'full',
        },
      };

      await eventBus.emit('jira:sync:start', mockEvent);

      const metrics = eventBus.getMetrics('jira:sync:start') as EventMetrics;

      expect(metrics.eventType).toBe('jira:sync:start');
      expect(metrics.handlerCount).toBe(2);
      expect(metrics.totalDuration).toBeGreaterThan(0);
      expect(metrics.maxDuration).toBeGreaterThan(0);
      expect(metrics.avgDuration).toBeGreaterThan(0);
      expect(metrics.errorCount).toBe(0);
    });

    it('should track error count in metrics', async () => {
      const errorHandler = vi.fn().mockImplementation(() => {
        throw new Error('Test error');
      });
      const normalHandler = vi.fn();

      eventBus.on('jira:sync:start', errorHandler);
      eventBus.on('jira:sync:start', normalHandler);

      const mockEvent: JiraSyncStartEvent = {
        type: 'jira:sync:start',
        timestamp: Date.now(),
        source: 'jira-plugin-bridge',
        eventId: 'test-event-1',
        payload: {
          syncType: 'full',
        },
      };

      await eventBus.emit('jira:sync:start', mockEvent);

      const metrics = eventBus.getMetrics('jira:sync:start') as EventMetrics;
      expect(metrics.errorCount).toBe(1);
    });

    it('should meet performance requirement of <5ms overhead per event', async () => {
      // Test with minimal handler to measure pure overhead
      const minimalHandler = vi.fn();
      eventBus.on('jira:sync:start', minimalHandler, { async: false });

      const mockEvent: JiraSyncStartEvent = {
        type: 'jira:sync:start',
        timestamp: Date.now(),
        source: 'jira-plugin-bridge',
        eventId: 'test-event-1',
        payload: {
          syncType: 'full',
        },
      };

      // Measure multiple emissions to get average overhead
      const iterations = 10;
      const startTime = performance.now();

      for (let i = 0; i < iterations; i++) {
        await eventBus.emit('jira:sync:start', mockEvent);
      }

      const totalTime = performance.now() - startTime;
      const averageOverhead = totalTime / iterations;

      expect(averageOverhead).toBeLessThan(5); // Must be <5ms overhead per event
    });

    it('should reset metrics when requested', async () => {
      const handler = vi.fn();
      eventBus.on('jira:sync:start', handler);

      const mockEvent: JiraSyncStartEvent = {
        type: 'jira:sync:start',
        timestamp: Date.now(),
        source: 'jira-plugin-bridge',
        eventId: 'test-event-1',
        payload: {
          syncType: 'full',
        },
      };

      await eventBus.emit('jira:sync:start', mockEvent);

      let metrics = eventBus.getMetrics('jira:sync:start') as EventMetrics;
      expect(metrics.totalDuration).toBeGreaterThan(0);

      eventBus.resetMetrics();

      metrics = eventBus.getMetrics('jira:sync:start') as EventMetrics;
      expect(metrics.totalDuration).toBe(0);
      expect(metrics.errorCount).toBe(0);
    });
  });

  describe('Utility Methods', () => {
    it('should return correct event names', () => {
      const handler = vi.fn();

      eventBus.on('jira:sync:start', handler);
      eventBus.on('jira:sync:complete', handler);

      const eventNames = eventBus.eventNames();
      expect(eventNames).toContain('jira:sync:start');
      expect(eventNames).toContain('jira:sync:complete');
      expect(eventNames).toHaveLength(2);
    });

    it('should correctly report listener status', () => {
      expect(eventBus.hasListeners()).toBe(false);

      const handler = vi.fn();
      eventBus.on('jira:sync:start', handler);

      expect(eventBus.hasListeners()).toBe(true);

      eventBus.removeAllListeners();
      expect(eventBus.hasListeners()).toBe(false);
    });

    it('should return all metrics when no specific event type requested', async () => {
      const handler = vi.fn();

      eventBus.on('jira:sync:start', handler);
      eventBus.on('jira:sync:complete', handler);

      const mockEvent1: JiraSyncStartEvent = {
        type: 'jira:sync:start',
        timestamp: Date.now(),
        source: 'jira-plugin-bridge',
        eventId: 'test-event-1',
        payload: { syncType: 'full' },
      };

      const mockEvent2: JiraSyncCompleteEvent = {
        type: 'jira:sync:complete',
        timestamp: Date.now(),
        source: 'jira-plugin-bridge',
        eventId: 'test-event-2',
        payload: {
          result: {
            success: true,
            syncedCount: 5,
            failedCount: 0,
            conflicts: [],
            errors: [],
            duration: 1000,
          },
          syncType: 'full',
        },
      };

      await eventBus.emit('jira:sync:start', mockEvent1);
      await eventBus.emit('jira:sync:complete', mockEvent2);

      const allMetrics = eventBus.getMetrics() as EventMetrics[];
      expect(Array.isArray(allMetrics)).toBe(true);
      expect(allMetrics).toHaveLength(2);

      const eventTypes = allMetrics.map(m => m.eventType);
      expect(eventTypes).toContain('jira:sync:start');
      expect(eventTypes).toContain('jira:sync:complete');
    });
  });
});
