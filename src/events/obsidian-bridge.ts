/**
 * Obsidian Event Bus Bridge
 * Integrates Jira plugin events with Obsidian's event system
 */

import { Events, Plugin } from 'obsidian';
import { EventEmitter } from 'events';
import {
  JiraPluginEvent,
  EventTypeMap,
  EventHandler,
  EventListenerConfig,
  EventMetrics,
  BaseEvent,
} from './event-types';
import { v4 as uuidv4 } from 'uuid';

interface EventSubscription {
  handler: EventHandler<any>;
  config: EventListenerConfig;
  subscriptionId: string;
  registrationTime: number;
}

interface EventPerformanceData {
  eventType: string;
  timestamp: number;
  duration: number;
  handlerCount: number;
  errors: Error[];
}

export class JiraEventBus extends EventEmitter {
  private plugin: Plugin;
  private subscriptions: Map<string, EventSubscription[]> = new Map();
  private performanceData: EventPerformanceData[] = [];
  private maxPerformanceEntries: number = 1000;
  private debugLogging: boolean = false;

  constructor(plugin: Plugin) {
    super();
    this.plugin = plugin;
    this.setMaxListeners(50); // Increase default limit for cross-plugin communication
  }

  async initialize(): Promise<void> {
    // Clear any existing subscriptions
    this.subscriptions.clear();

    // Set up cleanup on plugin unload
    this.plugin.register(() => this.cleanup());

    console.log('JiraEventBus initialized');
  }

  /**
   * Subscribe to a specific event type with optional configuration
   */
  on<K extends keyof EventTypeMap>(
    eventType: K,
    handler: EventHandler<EventTypeMap[K]>,
    config: EventListenerConfig = {}
  ): this {
    const subscriptionId = uuidv4();
    const subscription: EventSubscription = {
      handler,
      config: {
        once: config.once || false,
        priority: config.priority || 0,
        async: config.async !== false, // Default to async
      },
      subscriptionId,
      registrationTime: Date.now(),
    };

    // Get or create subscription array for this event type
    const subscriptions = this.subscriptions.get(eventType) || [];
    subscriptions.push(subscription);

    // Sort by priority (higher numbers first)
    subscriptions.sort(
      (a, b) => (b.config.priority || 0) - (a.config.priority || 0)
    );

    this.subscriptions.set(eventType, subscriptions);

    // Register with native EventEmitter for internal handling
    super.on(eventType, handler);

    if (this.debugLogging) {
      console.log(
        `Event listener registered for '${eventType}' with priority ${subscription.config.priority}`
      );
    }

    return this;
  }

  /**
   * Subscribe to an event only once
   */
  once<K extends keyof EventTypeMap>(
    eventType: K,
    handler: EventHandler<EventTypeMap[K]>
  ): this {
    this.on(eventType, handler, { once: true });
    return this;
  }

  /**
   * Remove a specific event listener
   */
  off<K extends keyof EventTypeMap>(
    eventType: K,
    handler: EventHandler<EventTypeMap[K]>
  ): this {
    const subscriptions = this.subscriptions.get(eventType);
    if (!subscriptions) return;

    const updatedSubscriptions = subscriptions.filter(
      sub => sub.handler !== handler
    );

    if (updatedSubscriptions.length === 0) {
      this.subscriptions.delete(eventType);
    } else {
      this.subscriptions.set(eventType, updatedSubscriptions);
    }

    super.off(eventType, handler);

    if (this.debugLogging) {
      console.log(`Event listener removed for '${eventType}'`);
    }

    return this;
  }

  /**
   * Remove all listeners for a specific event type
   */
  removeAllListeners<K extends keyof EventTypeMap>(eventType?: K): this {
    if (eventType) {
      this.subscriptions.delete(eventType);
      super.removeAllListeners(eventType);
    } else {
      this.subscriptions.clear();
      super.removeAllListeners();
    }

    if (this.debugLogging) {
      console.log(
        eventType
          ? `All listeners removed for '${eventType}'`
          : 'All listeners removed'
      );
    }

    return this;
  }

  /**
   * Publish an event to all registered listeners
   */
  async publish<K extends keyof EventTypeMap>(
    eventType: K,
    payload: EventTypeMap[K]['payload']
  ): Promise<void> {
    const event: EventTypeMap[K] = this.createEvent(
      eventType,
      payload
    ) as EventTypeMap[K];

    const startTime = Date.now();
    const subscriptions = this.subscriptions.get(eventType) || [];
    const errors: Error[] = [];

    if (this.debugLogging) {
      console.log(
        `Publishing event '${eventType}' to ${subscriptions.length} listeners`,
        payload
      );
    }

    // Track performance regardless of debug setting
    const performanceEntry: EventPerformanceData = {
      eventType,
      timestamp: startTime,
      duration: 0,
      handlerCount: subscriptions.length,
      errors: [],
    };

    try {
      // Execute all handlers
      const handlerPromises: Promise<void>[] = [];

      for (const subscription of subscriptions) {
        try {
          if (subscription.config.async) {
            // Execute async handlers
            const handlerPromise = this.executeHandler(
              subscription.handler,
              event
            );
            handlerPromises.push(handlerPromise);
          } else {
            // Execute sync handlers immediately
            await this.executeHandler(subscription.handler, event);
          }

          // Remove one-time listeners
          if (subscription.config.once) {
            this.off(eventType, subscription.handler);
          }
        } catch (error) {
          errors.push(error as Error);
          performanceEntry.errors.push(error as Error);

          console.error(`Error in event handler for '${eventType}':`, error);
        }
      }

      // Wait for all async handlers to complete
      if (handlerPromises.length > 0) {
        const results = await Promise.allSettled(handlerPromises);

        // Collect any additional errors from async handlers
        results.forEach(result => {
          if (result.status === 'rejected') {
            const error = result.reason as Error;
            errors.push(error);
            performanceEntry.errors.push(error);
            console.error(
              `Error in async event handler for '${eventType}':`,
              error
            );
          }
        });
      }

      // Emit the event through the native EventEmitter as well
      this.emit(eventType, event);
    } catch (error) {
      errors.push(error as Error);
      performanceEntry.errors.push(error as Error);
      console.error(`Critical error publishing event '${eventType}':`, error);
    } finally {
      performanceEntry.duration = Date.now() - startTime;
      this.recordPerformance(performanceEntry);

      // Log performance if over threshold or if debug logging is enabled
      if (performanceEntry.duration > 5 || this.debugLogging) {
        console.log(
          `Event '${eventType}' processed in ${performanceEntry.duration}ms ` +
            `(${performanceEntry.handlerCount} handlers, ${performanceEntry.errors.length} errors)`
        );
      }

      // Alert if performance is poor
      if (performanceEntry.duration > 50) {
        console.warn(
          `Slow event processing detected for '${eventType}': ${performanceEntry.duration}ms ` +
            `with ${performanceEntry.handlerCount} handlers`
        );
      }
    }
  }

  /**
   * Execute a single event handler with error isolation
   */
  private async executeHandler(
    handler: EventHandler<any>,
    event: any
  ): Promise<void> {
    const result = handler(event);

    // Handle both sync and async handlers
    if (result && typeof result.then === 'function') {
      await result;
    }
  }

  /**
   * Create a properly formatted event object
   */
  private createEvent<K extends keyof EventTypeMap>(
    eventType: K,
    payload: EventTypeMap[K]['payload']
  ): EventTypeMap[K] {
    return {
      type: eventType,
      timestamp: Date.now(),
      source: 'jira-plugin-bridge',
      eventId: uuidv4(),
      payload,
    } as EventTypeMap[K];
  }

  /**
   * Record performance data for analytics
   */
  private recordPerformance(data: EventPerformanceData): void {
    this.performanceData.push(data);

    // Trim old entries to prevent memory leaks
    if (this.performanceData.length > this.maxPerformanceEntries) {
      this.performanceData.splice(
        0,
        this.performanceData.length - this.maxPerformanceEntries
      );
    }
  }

  /**
   * Get performance metrics for specific event types
   */
  getMetrics(eventType?: string): EventMetrics[] {
    const filteredData = eventType
      ? this.performanceData.filter(d => d.eventType === eventType)
      : this.performanceData;

    const metricsByType = new Map<string, EventPerformanceData[]>();

    filteredData.forEach(data => {
      const existing = metricsByType.get(data.eventType) || [];
      existing.push(data);
      metricsByType.set(data.eventType, existing);
    });

    const metrics: EventMetrics[] = [];

    metricsByType.forEach((data, type) => {
      const durations = data.map(d => d.duration);
      const totalDuration = durations.reduce((sum, d) => sum + d, 0);
      const maxDuration = Math.max(...durations);
      const avgDuration = totalDuration / durations.length;
      const errorCount = data.reduce((sum, d) => sum + d.errors.length, 0);
      const handlerCount =
        data.reduce((sum, d) => sum + d.handlerCount, 0) / data.length;

      metrics.push({
        eventType: type,
        handlerCount: Math.round(handlerCount),
        totalDuration,
        maxDuration,
        avgDuration: Math.round(avgDuration * 100) / 100,
        errorCount,
      });
    });

    return metrics.sort((a, b) => b.totalDuration - a.totalDuration);
  }

  /**
   * Get list of active event subscriptions
   */
  getActiveSubscriptions(): { [eventType: string]: number } {
    const subscriptions: { [eventType: string]: number } = {};

    this.subscriptions.forEach((subs, eventType) => {
      subscriptions[eventType] = subs.length;
    });

    return subscriptions;
  }

  /**
   * Enable or disable debug logging
   */
  setDebugLogging(enabled: boolean): void {
    this.debugLogging = enabled;
    console.log(
      `JiraEventBus debug logging ${enabled ? 'enabled' : 'disabled'}`
    );
  }

  /**
   * Clear performance data
   */
  clearMetrics(): void {
    this.performanceData = [];
    console.log('Event bus performance metrics cleared');
  }

  /**
   * Get total event count by type
   */
  getEventCounts(): { [eventType: string]: number } {
    const counts: { [eventType: string]: number } = {};

    this.performanceData.forEach(data => {
      counts[data.eventType] = (counts[data.eventType] || 0) + 1;
    });

    return counts;
  }

  /**
   * Health check - returns true if event bus is functioning normally
   */
  isHealthy(): boolean {
    const recentEvents = this.performanceData.filter(
      data => Date.now() - data.timestamp < 300000 // Last 5 minutes
    );

    if (recentEvents.length === 0) return true; // No recent activity, assume healthy

    const avgDuration =
      recentEvents.reduce((sum, d) => sum + d.duration, 0) /
      recentEvents.length;
    const errorRate =
      recentEvents.reduce((sum, d) => sum + d.errors.length, 0) /
      recentEvents.length;

    // Consider healthy if average processing time < 10ms and error rate < 0.1 per event
    return avgDuration < 10 && errorRate < 0.1;
  }

  /**
   * Cleanup method called on plugin unload
   */
  private cleanup(): void {
    console.log('Cleaning up JiraEventBus');

    // Remove all listeners
    this.removeAllListeners();

    // Clear subscriptions
    this.subscriptions.clear();

    // Clear performance data
    this.performanceData = [];
  }

  /**
   * Shutdown method for explicit cleanup
   */
  async shutdown(): Promise<void> {
    this.cleanup();
  }
}
