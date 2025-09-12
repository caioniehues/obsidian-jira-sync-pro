/**
 * EventBus Implementation for Jira Plugin Bridge
 * Provides typed event registration, emission, and memory-safe cleanup
 */

import {
  EventTypeMap,
  JiraPluginEvent,
  EventHandler,
  EventListenerConfig,
  EventMetrics,
} from './event-types';

interface RegisteredHandler<T extends JiraPluginEvent = JiraPluginEvent> {
  handler: EventHandler<T>;
  config: Required<EventListenerConfig>;
  id: string;
}

export class EventBus {
  private handlers: Map<keyof EventTypeMap, RegisteredHandler[]> = new Map();
  private metrics: Map<string, EventMetrics> = new Map();
  private handlerIdCounter = 0;

  /**
   * Register an event handler with optional configuration
   */
  on<K extends keyof EventTypeMap>(
    eventType: K,
    handler: EventHandler<EventTypeMap[K]>,
    config: EventListenerConfig = {}
  ): string {
    const handlerId = `handler_${++this.handlerIdCounter}`;

    const fullConfig: Required<EventListenerConfig> = {
      once: config.once ?? false,
      priority: config.priority ?? 0,
      async: config.async ?? true,
    };

    const registeredHandler: RegisteredHandler<EventTypeMap[K]> = {
      handler: handler as EventHandler<EventTypeMap[K]>,
      config: fullConfig,
      id: handlerId,
    };

    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, []);
    }

    const handlers = this.handlers.get(eventType)!;
    handlers.push(registeredHandler);

    // Sort by priority (higher priority first)
    handlers.sort((a, b) => b.config.priority - a.config.priority);

    return handlerId;
  }

  /**
   * Register a one-time event handler
   */
  once<K extends keyof EventTypeMap>(
    eventType: K,
    handler: EventHandler<EventTypeMap[K]>,
    config: Omit<EventListenerConfig, 'once'> = {}
  ): string {
    return this.on(eventType, handler, { ...config, once: true });
  }

  /**
   * Unregister an event handler by ID
   */
  off(handlerId: string): boolean {
    for (const [eventType, handlers] of this.handlers.entries()) {
      const index = handlers.findIndex(h => h.id === handlerId);
      if (index >= 0) {
        handlers.splice(index, 1);
        if (handlers.length === 0) {
          this.handlers.delete(eventType);
        }
        return true;
      }
    }
    return false;
  }

  /**
   * Remove all handlers for a specific event type
   */
  removeAllListeners<K extends keyof EventTypeMap>(eventType?: K): void {
    if (eventType) {
      this.handlers.delete(eventType);
    } else {
      this.handlers.clear();
    }
  }

  /**
   * Emit an event to all registered handlers
   */
  async emit<K extends keyof EventTypeMap>(
    eventType: K,
    event: EventTypeMap[K]
  ): Promise<void> {
    const startTime = performance.now();
    const handlers = this.handlers.get(eventType) || [];

    if (handlers.length === 0) {
      return;
    }

    let errorCount = 0;
    const handlerDurations: number[] = [];
    const oneTimeHandlers: string[] = [];

    // Execute handlers based on async config
    for (const registeredHandler of handlers) {
      const handlerStartTime = performance.now();

      try {
        if (registeredHandler.config.async) {
          await registeredHandler.handler(event);
        } else {
          registeredHandler.handler(event);
        }
      } catch (error) {
        errorCount++;
        console.error(`Event handler error for ${String(eventType)}:`, error);
      }

      const handlerDuration = performance.now() - handlerStartTime;
      handlerDurations.push(handlerDuration);

      // Mark one-time handlers for removal
      if (registeredHandler.config.once) {
        oneTimeHandlers.push(registeredHandler.id);
      }
    }

    // Remove one-time handlers
    oneTimeHandlers.forEach(id => this.off(id));

    // Update metrics
    const totalDuration = performance.now() - startTime;
    this.updateMetrics(
      String(eventType),
      handlers.length,
      handlerDurations,
      errorCount,
      totalDuration
    );
  }

  /**
   * Get event handler count for a specific event type
   */
  listenerCount<K extends keyof EventTypeMap>(eventType: K): number {
    return this.handlers.get(eventType)?.length ?? 0;
  }

  /**
   * Get all registered event types
   */
  eventNames(): Array<keyof EventTypeMap> {
    return Array.from(this.handlers.keys());
  }

  /**
   * Get performance metrics for events
   */
  getMetrics(eventType?: string): EventMetrics | EventMetrics[] {
    if (eventType) {
      return this.metrics.get(eventType) ?? this.createEmptyMetrics(eventType);
    }
    return Array.from(this.metrics.values());
  }

  /**
   * Reset all performance metrics
   */
  resetMetrics(): void {
    this.metrics.clear();
  }

  /**
   * Check if EventBus has any registered handlers
   */
  hasListeners(): boolean {
    return this.handlers.size > 0;
  }

  private updateMetrics(
    eventType: string,
    handlerCount: number,
    handlerDurations: number[],
    errorCount: number,
    totalDuration: number
  ): void {
    const existing = this.metrics.get(eventType);
    const maxDuration = Math.max(...handlerDurations, 0);
    const avgDuration =
      handlerDurations.length > 0
        ? handlerDurations.reduce((sum, dur) => sum + dur, 0) /
          handlerDurations.length
        : 0;

    const metrics: EventMetrics = {
      eventType,
      handlerCount,
      totalDuration: existing
        ? existing.totalDuration + totalDuration
        : totalDuration,
      maxDuration: existing
        ? Math.max(existing.maxDuration, maxDuration)
        : maxDuration,
      avgDuration: existing
        ? (existing.avgDuration + avgDuration) / 2
        : avgDuration,
      errorCount: existing ? existing.errorCount + errorCount : errorCount,
    };

    this.metrics.set(eventType, metrics);
  }

  private createEmptyMetrics(eventType: string): EventMetrics {
    return {
      eventType,
      handlerCount: 0,
      totalDuration: 0,
      maxDuration: 0,
      avgDuration: 0,
      errorCount: 0,
    };
  }
}

// Singleton instance for global access
export const eventBus = new EventBus();
