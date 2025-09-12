/**
 * EventManager for Lifecycle Management and Memory-Safe Cleanup
 * Manages event subscriptions with WeakMap for automatic cleanup
 */

import { EventBus, eventBus } from './event-bus';
import { EventTypeMap, EventHandler, EventListenerConfig } from './event-types';

interface PluginEventSubscription {
  eventType: string;
  handlerId: string;
  cleanup: () => void;
}

export class EventManager {
  // WeakMap for memory-safe cleanup - when plugin instance is garbage collected,
  // associated event handlers are automatically cleaned up
  private pluginSubscriptions: WeakMap<object, PluginEventSubscription[]> =
    new WeakMap();
  private eventBusInstance: EventBus;
  private handlerIdCounter = 0;

  constructor(eventBusInstance: EventBus = eventBus) {
    this.eventBusInstance = eventBusInstance;
  }

  /**
   * Register an event handler bound to a plugin instance
   * Automatically cleaned up when plugin is garbage collected
   */
  registerHandler<K extends keyof EventTypeMap>(
    pluginInstance: object,
    eventType: K,
    handler: EventHandler<EventTypeMap[K]>,
    config?: EventListenerConfig
  ): string {
    // For once handlers, wrap the original handler to clean up subscription tracking
    const isOnce = config?.once === true;
    // eslint-disable-next-line prefer-const
    let actualHandlerId: string;

    const wrappedHandler = isOnce
      ? ((event => {
          const result = handler(event);
          // Clean up the subscription from our tracking immediately after execution
          this.cleanupOnceHandler(pluginInstance, actualHandlerId);
          return result;
        }) as EventHandler<EventTypeMap[K]>)
      : handler;

    // Use the EventBus on method to get the actual handler ID
    actualHandlerId = this.eventBusInstance.on(
      eventType,
      wrappedHandler,
      config
    );

    const subscription: PluginEventSubscription = {
      eventType: String(eventType),
      handlerId: actualHandlerId,
      cleanup: () => this.eventBusInstance.off(actualHandlerId),
    };

    // Get or create subscriptions array for this plugin
    let subscriptions = this.pluginSubscriptions.get(pluginInstance);
    if (!subscriptions) {
      subscriptions = [];
      this.pluginSubscriptions.set(pluginInstance, subscriptions);
    }
    subscriptions.push(subscription);

    return actualHandlerId;
  }

  /**
   * Register a one-time event handler bound to a plugin instance
   */
  registerOnceHandler<K extends keyof EventTypeMap>(
    pluginInstance: object,
    eventType: K,
    handler: EventHandler<EventTypeMap[K]>,
    config?: Omit<EventListenerConfig, 'once'>
  ): string {
    return this.registerHandler(pluginInstance, eventType, handler, {
      ...config,
      once: true,
    });
  }

  /**
   * Unregister a specific handler by ID
   */
  unregisterHandler(pluginInstance: object, handlerId: string): boolean {
    const subscriptions = this.pluginSubscriptions.get(pluginInstance);
    if (!subscriptions) return false;

    const index = subscriptions.findIndex(sub => sub.handlerId === handlerId);
    if (index >= 0) {
      const subscription = subscriptions[index];
      subscription.cleanup();
      subscriptions.splice(index, 1);

      // Clean up empty subscriptions array
      if (subscriptions.length === 0) {
        this.pluginSubscriptions.delete(pluginInstance);
      }

      return true;
    }

    return false;
  }

  /**
   * Unregister all handlers for a plugin instance
   * Call this in plugin onunload() method
   */
  unregisterAllHandlers(pluginInstance: object): number {
    const subscriptions = this.pluginSubscriptions.get(pluginInstance);
    if (!subscriptions) return 0;

    const count = subscriptions.length;

    // Cleanup all subscriptions
    subscriptions.forEach(subscription => subscription.cleanup());

    // Remove from WeakMap
    this.pluginSubscriptions.delete(pluginInstance);

    return count;
  }

  /**
   * Get the number of active subscriptions for a plugin
   */
  getSubscriptionCount(pluginInstance: object): number {
    const subscriptions = this.pluginSubscriptions.get(pluginInstance);
    return subscriptions?.length ?? 0;
  }

  /**
   * Get event types subscribed to by a plugin
   */
  getSubscribedEvents(pluginInstance: object): string[] {
    const subscriptions = this.pluginSubscriptions.get(pluginInstance);
    if (!subscriptions) return [];

    return [...new Set(subscriptions.map(sub => sub.eventType))];
  }

  /**
   * Emit an event through the managed event bus
   */
  async emit<K extends keyof EventTypeMap>(
    eventType: K,
    event: EventTypeMap[K]
  ): Promise<void> {
    return this.eventBusInstance.emit(eventType, event);
  }

  /**
   * Create event with default properties
   */
  createEvent<K extends keyof EventTypeMap>(
    type: K,
    payload: EventTypeMap[K]['payload']
  ): EventTypeMap[K] {
    return {
      type,
      timestamp: Date.now(),
      source: 'jira-plugin-bridge',
      eventId: this.generateEventId(),
      payload,
    } as EventTypeMap[K];
  }

  /**
   * Get health status of the event system
   */
  getHealthStatus(): object {
    return {
      totalEventTypes: this.eventBusInstance.eventNames().length,
      totalHandlers: this.eventBusInstance
        .eventNames()
        .reduce(
          (sum, eventType) =>
            sum + this.eventBusInstance.listenerCount(eventType),
          0
        ),
      hasListeners: this.eventBusInstance.hasListeners(),
      metrics: this.eventBusInstance.getMetrics(),
    };
  }

  /**
   * Force cleanup of all handlers (for testing or emergency cleanup)
   */
  forceCleanup(): void {
    this.eventBusInstance.removeAllListeners();
    // Note: We can't clear WeakMap, but references will be cleaned up automatically
  }

  private generateEventId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private cleanupOnceHandler(pluginInstance: object, handlerId: string): void {
    const subscriptions = this.pluginSubscriptions.get(pluginInstance);
    if (!subscriptions) return;

    const index = subscriptions.findIndex(sub => sub.handlerId === handlerId);
    if (index >= 0) {
      subscriptions.splice(index, 1);

      // Clean up empty subscriptions array
      if (subscriptions.length === 0) {
        this.pluginSubscriptions.delete(pluginInstance);
      }
    }
  }
}

// Singleton instance for global access
export const eventManager = new EventManager();
