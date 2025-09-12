import { EventBus, JiraIntegrationEvent, DataRequestPayload, DataResponsePayload, ErrorEventPayload } from '../../src/integrations/EventBus';

describe('EventBus - Enhanced Plugin Communication', () => {
  let eventBus: EventBus;

  beforeEach(() => {
    eventBus = new EventBus();
  });

  afterEach(() => {
    eventBus.removeAllListeners();
  });

  describe('Request/Response Pattern', () => {
    it('should handle successful request/response cycle', async () => {
      // Set up responder
      eventBus.on(JiraIntegrationEvent.DATA_REQUEST, (payload: DataRequestPayload) => {
        if (payload.dataType === 'ticket-data') {
          eventBus.respond(payload.requestId, {
            ticketKey: 'TEST-123',
            summary: 'Test Ticket'
          });
        }
      });

      // Make request
      const result = await eventBus.request('ticket-data', { key: 'TEST-123' });
      
      expect(result).toBeDefined();
      expect(result.ticketKey).toBe('TEST-123');
      expect(result.summary).toBe('Test Ticket');
    });

    it('should handle request timeout', async () => {
      // No responder set up - should timeout
      await expect(
        eventBus.request('non-existent-data', {}, undefined, 100)
      ).rejects.toThrow('Request timeout');
    });

    it('should handle error responses', async () => {
      // Set up error responder
      eventBus.on(JiraIntegrationEvent.DATA_REQUEST, (payload: DataRequestPayload) => {
        eventBus.respond(payload.requestId, undefined, 'Data not found');
      });

      await expect(
        eventBus.request('missing-data', {})
      ).rejects.toThrow('Data not found');
    });

    it('should support targeted plugin requests', async () => {
      const requestHandler = vi.fn();
      
      // Set up targeted responder
      eventBus.on(JiraIntegrationEvent.DATA_REQUEST, (payload: DataRequestPayload) => {
        requestHandler(payload);
        if (payload.targetPlugin === 'tasks-plugin') {
          eventBus.respond(payload.requestId, { tasks: [] });
        }
      });

      // Make targeted request
      const result = await eventBus.request('task-list', {}, 'tasks-plugin');
      
      expect(requestHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          targetPlugin: 'tasks-plugin',
          dataType: 'task-list'
        })
      );
      expect(result).toEqual({ tasks: [] });
    });
  });

  describe('Error Event Handling', () => {
    it('should emit critical errors', (done) => {
      eventBus.on(JiraIntegrationEvent.ERROR_CRITICAL, (payload: ErrorEventPayload) => {
        expect(payload.severity).toBe('critical');
        expect(payload.error).toBe('System failure');
        expect(payload.context).toEqual({ component: 'test' });
        expect(payload.recoveryAction).toBe('restart');
        done();
      });

      eventBus.emitError('critical', 'System failure', { component: 'test' }, 'restart');
    });

    it('should emit recoverable errors', (done) => {
      eventBus.on(JiraIntegrationEvent.ERROR_RECOVERABLE, (payload: ErrorEventPayload) => {
        expect(payload.severity).toBe('recoverable');
        expect(payload.error).toBeInstanceOf(Error);
        done();
      });

      eventBus.emitError('recoverable', new Error('Temporary issue'));
    });

    it('should emit warnings', (done) => {
      eventBus.on(JiraIntegrationEvent.ERROR_WARNING, (payload: ErrorEventPayload) => {
        expect(payload.severity).toBe('warning');
        expect(payload.error).toBe('Performance degradation');
        done();
      });

      eventBus.emitError('warning', 'Performance degradation');
    });
  });

  describe('Event Routing', () => {
    it('should route events to specific plugins', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      const handler3 = vi.fn();

      eventBus.on('test-event', handler1);
      eventBus.on('test-event', handler2);
      eventBus.on('test-event', handler3);

      // Set up routing rules
      const routingRules = new Map<string, string[]>([
        ['test-event', ['plugin-1', 'plugin-2']]
      ]);

      eventBus.routeEvent('test-event', { data: 'test' }, routingRules);

      // All handlers should receive the event with routing info
      expect(handler1).toHaveBeenCalledWith(
        expect.objectContaining({
          data: 'test',
          _routing: {
            targets: ['plugin-1', 'plugin-2'],
            routed: true
          }
        })
      );
    });

    it('should emit to all when no routing rules', () => {
      const handler = vi.fn();
      eventBus.on('broadcast-event', handler);

      eventBus.routeEvent('broadcast-event', { data: 'broadcast' });

      expect(handler).toHaveBeenCalledWith({ data: 'broadcast' });
    });
  });

  describe('Plugin Filtering', () => {
    it('should filter events for specific plugins', () => {
      const filter = eventBus.createPluginFilter('my-plugin');

      // Should accept events without targeting
      expect(filter({ data: 'test' })).toBe(true);

      // Should accept events targeted to this plugin
      expect(filter({ targetPlugin: 'my-plugin' })).toBe(true);

      // Should reject events targeted to other plugins
      expect(filter({ targetPlugin: 'other-plugin' })).toBe(false);

      // Should handle routed events
      expect(filter({
        _routing: {
          routed: true,
          targets: ['my-plugin', 'other-plugin']
        }
      })).toBe(true);

      expect(filter({
        _routing: {
          routed: true,
          targets: ['other-plugin']
        }
      })).toBe(false);
    });
  });

  describe('Filtered Event Bus', () => {
    it('should create filtered bus that only receives specific events', (done) => {
      const filteredBus = eventBus.createFilteredBus([
        JiraIntegrationEvent.TICKET_CREATED,
        JiraIntegrationEvent.TICKET_UPDATED
      ]);

      let receivedEvents: string[] = [];
      
      filteredBus.on(JiraIntegrationEvent.TICKET_CREATED, () => {
        receivedEvents.push('created');
      });

      filteredBus.on(JiraIntegrationEvent.TICKET_UPDATED, () => {
        receivedEvents.push('updated');
        
        // Verify only filtered events were received
        expect(receivedEvents).toEqual(['created', 'updated']);
        done();
      });

      // Emit various events
      eventBus.emit(JiraIntegrationEvent.TICKET_CREATED, {});
      eventBus.emit(JiraIntegrationEvent.TICKET_DELETED, {}); // Should not be received
      eventBus.emit(JiraIntegrationEvent.TICKET_UPDATED, {});
    });
  });

  describe('Subscription Management', () => {
    it('should manage subscriptions with automatic cleanup', () => {
      const handler = vi.fn();
      
      const subscription = eventBus.subscribe('test-event', handler);
      
      expect(subscription.id).toMatch(/^sub_\d+$/);
      expect(subscription.event).toBe('test-event');
      
      eventBus.emit('test-event', { data: 'test' });
      expect(handler).toHaveBeenCalledTimes(1);
      
      // Unsubscribe
      subscription.unsubscribe();
      
      eventBus.emit('test-event', { data: 'test2' });
      expect(handler).toHaveBeenCalledTimes(1); // Should not be called again
    });

    it('should subscribe to multiple events at once', () => {
      const handler = vi.fn();
      
      const subscriptions = eventBus.subscribeMultiple(
        ['event1', 'event2', 'event3'],
        handler
      );
      
      expect(subscriptions).toHaveLength(3);
      
      eventBus.emit('event1', { data: 1 });
      eventBus.emit('event2', { data: 2 });
      eventBus.emit('event3', { data: 3 });
      
      expect(handler).toHaveBeenCalledTimes(3);
      expect(handler).toHaveBeenCalledWith('event1', { data: 1 });
      expect(handler).toHaveBeenCalledWith('event2', { data: 2 });
      expect(handler).toHaveBeenCalledWith('event3', { data: 3 });
    });
  });

  describe('Event History', () => {
    it('should track event history', () => {
      eventBus.emit('event1', { data: 1 });
      eventBus.emit('event2', { data: 2 });
      eventBus.emit('event1', { data: 3 });
      
      const history = eventBus.getEventHistory();
      expect(history).toHaveLength(3);
      expect(history[0].event).toBe('event1');
      expect(history[1].event).toBe('event2');
      expect(history[2].event).toBe('event1');
      
      const filteredHistory = eventBus.getEventHistory('event1');
      expect(filteredHistory).toHaveLength(2);
    });

    it('should limit history size', () => {
      // Default max size is 100
      for (let i = 0; i < 150; i++) {
        eventBus.emit('test-event', { index: i });
      }
      
      const history = eventBus.getEventHistory();
      expect(history).toHaveLength(100);
      expect(history[0].payload.index).toBe(50); // First 50 should be trimmed
    });
  });

  describe('Promise-based Event Waiting', () => {
    it('should wait for an event with promise', async () => {
      setTimeout(() => {
        eventBus.emit('delayed-event', { success: true });
      }, 50);
      
      const result = await eventBus.waitForEvent('delayed-event');
      expect(result).toEqual({ success: true });
    });

    it('should timeout when waiting for event', async () => {
      await expect(
        eventBus.waitForEvent('never-emitted', 100)
      ).rejects.toThrow('Timeout waiting for event');
    });
  });

  describe('Integration Event Types', () => {
    it('should handle all standard integration events', () => {
      const receivedEvents: string[] = [];
      
      // Subscribe to all event types
      Object.values(JiraIntegrationEvent).forEach(event => {
        eventBus.on(event, () => {
          receivedEvents.push(event);
        });
      });
      
      // Emit sample events
      eventBus.emit(JiraIntegrationEvent.TICKET_CREATED, {});
      eventBus.emit(JiraIntegrationEvent.SYNC_STARTED, {});
      eventBus.emit(JiraIntegrationEvent.PLUGIN_REGISTERED, {});
      eventBus.emit(JiraIntegrationEvent.ADAPTER_READY, {});
      eventBus.emit(JiraIntegrationEvent.CAPABILITY_ANNOUNCE, {});
      
      expect(receivedEvents).toContain(JiraIntegrationEvent.TICKET_CREATED);
      expect(receivedEvents).toContain(JiraIntegrationEvent.SYNC_STARTED);
      expect(receivedEvents).toContain(JiraIntegrationEvent.PLUGIN_REGISTERED);
      expect(receivedEvents).toContain(JiraIntegrationEvent.ADAPTER_READY);
      expect(receivedEvents).toContain(JiraIntegrationEvent.CAPABILITY_ANNOUNCE);
    });
  });
});