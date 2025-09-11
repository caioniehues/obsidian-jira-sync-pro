import { EventEmitter } from 'events';

/**
 * Standard event types for Jira integration
 */
export enum JiraIntegrationEvent {
  // Ticket events
  TICKET_CREATED = 'jira:ticket:created',
  TICKET_UPDATED = 'jira:ticket:updated',
  TICKET_DELETED = 'jira:ticket:deleted',
  TICKET_STATUS_CHANGED = 'jira:ticket:status_changed',
  TICKET_ASSIGNED = 'jira:ticket:assigned',
  
  // Sync events
  SYNC_STARTED = 'jira:sync:started',
  SYNC_COMPLETED = 'jira:sync:completed',
  SYNC_FAILED = 'jira:sync:failed',
  
  // Comment events
  COMMENT_ADDED = 'jira:comment:added',
  COMMENT_UPDATED = 'jira:comment:updated',
  
  // Integration events
  PLUGIN_REGISTERED = 'integration:plugin:registered',
  PLUGIN_UNREGISTERED = 'integration:plugin:unregistered',
  DATA_CONFLICT = 'integration:data:conflict',
  PERMISSION_DENIED = 'integration:permission:denied',
  
  // Data request/response events
  DATA_REQUEST = 'integration:data:request',
  DATA_RESPONSE = 'integration:data:response',
  DATA_ERROR = 'integration:data:error',
  
  // Plugin adapter events
  ADAPTER_READY = 'integration:adapter:ready',
  ADAPTER_ERROR = 'integration:adapter:error',
  ADAPTER_HEALTH_CHECK = 'integration:adapter:health',
  
  // Capability events
  CAPABILITY_ANNOUNCE = 'integration:capability:announce',
  CAPABILITY_REQUEST = 'integration:capability:request',
  CAPABILITY_CHANGED = 'integration:capability:changed',
  
  // Error propagation events
  ERROR_CRITICAL = 'integration:error:critical',
  ERROR_RECOVERABLE = 'integration:error:recoverable',
  ERROR_WARNING = 'integration:error:warning'
}

/**
 * Event payload interfaces
 */
export interface JiraEventPayload {
  timestamp: number;
  source: string;
  [key: string]: any;
}

export interface TicketEventPayload extends JiraEventPayload {
  ticket: any; // JiraTicket type
  changes?: Record<string, { old: any; new: any }>;
}

export interface SyncEventPayload extends JiraEventPayload {
  tickets?: any[]; // JiraTicket[]
  count?: number;
  error?: string;
}

/**
 * Data request/response payloads for plugin communication
 */
export interface DataRequestPayload extends JiraEventPayload {
  requestId: string;
  targetPlugin?: string;
  dataType: string;
  query?: any;
  timeout?: number;
}

export interface DataResponsePayload extends JiraEventPayload {
  requestId: string;
  success: boolean;
  data?: any;
  error?: string;
}

/**
 * Error event payloads with severity levels
 */
export interface ErrorEventPayload extends JiraEventPayload {
  severity: 'critical' | 'recoverable' | 'warning';
  error: Error | string;
  context?: any;
  recoveryAction?: string;
}

/**
 * Capability announcement payload
 */
export interface CapabilityPayload extends JiraEventPayload {
  pluginId: string;
  capabilities: string[];
  version: string;
  requirements?: string[];
}

/**
 * Subscription handle for managing event listeners
 */
export interface EventSubscription {
  id: string;
  event: string;
  callback: (payload: any) => void;
  unsubscribe: () => void;
}

/**
 * EventBus - Manages event communication between Jira Sync Pro and integrated plugins
 */
export class EventBus extends EventEmitter {
  private subscriptions: Map<string, EventSubscription> = new Map();
  private subscriptionCounter: number = 0;
  private eventHistory: Array<{ event: string; payload: any; timestamp: number }> = [];
  private maxHistorySize: number = 100;

  constructor() {
    super();
    // Increase max listeners to accommodate multiple plugin integrations
    this.setMaxListeners(50);
  }

  /**
   * Subscribe to an event with automatic subscription management
   */
  subscribe(event: string, callback: (payload: any) => void, context?: any): EventSubscription {
    const subscriptionId = `sub_${++this.subscriptionCounter}`;
    
    // Bind context if provided
    const boundCallback = context ? callback.bind(context) : callback;
    
    // Create subscription
    const subscription: EventSubscription = {
      id: subscriptionId,
      event,
      callback: boundCallback,
      unsubscribe: () => {
        this.unsubscribe(subscriptionId);
      }
    };
    
    // Register listener
    this.on(event, boundCallback);
    this.subscriptions.set(subscriptionId, subscription);
    
    console.log(`EventBus: Subscription ${subscriptionId} created for event ${event}`);
    
    return subscription;
  }

  /**
   * Unsubscribe from an event
   */
  unsubscribe(subscriptionId: string): void {
    const subscription = this.subscriptions.get(subscriptionId);
    if (subscription) {
      this.removeListener(subscription.event, subscription.callback);
      this.subscriptions.delete(subscriptionId);
      console.log(`EventBus: Subscription ${subscriptionId} removed`);
    }
  }

  /**
   * Emit an event with payload and history tracking
   */
  emit(event: string, payload?: any): boolean {
    // Add to history
    this.addToHistory(event, payload);
    
    // Log event emission
    console.log(`EventBus: Emitting ${event}`, payload);
    
    // Emit the event
    return super.emit(event, payload);
  }

  /**
   * Emit internal events (not tracked in history)
   */
  emitInternal(event: string, payload?: any): boolean {
    return super.emit(event, payload);
  }

  /**
   * Subscribe to multiple events at once
   */
  subscribeMultiple(events: string[], callback: (event: string, payload: any) => void, context?: any): EventSubscription[] {
    return events.map(event => 
      this.subscribe(event, (payload) => callback(event, payload), context)
    );
  }

  /**
   * Wait for an event (promise-based)
   */
  waitForEvent(event: string, timeout?: number): Promise<any> {
    return new Promise((resolve, reject) => {
      const timer = timeout ? setTimeout(() => {
        this.removeListener(event, handler);
        reject(new Error(`Timeout waiting for event ${event}`));
      }, timeout) : null;
      
      const handler = (payload: any) => {
        if (timer) clearTimeout(timer);
        this.removeListener(event, handler);
        resolve(payload);
      };
      
      this.once(event, handler);
    });
  }

  /**
   * Get event history
   */
  getEventHistory(eventFilter?: string): Array<{ event: string; payload: any; timestamp: number }> {
    if (eventFilter) {
      return this.eventHistory.filter(entry => entry.event === eventFilter);
    }
    return [...this.eventHistory];
  }

  /**
   * Clear event history
   */
  clearEventHistory(): void {
    this.eventHistory = [];
  }

  /**
   * Add event to history with size management
   */
  private addToHistory(event: string, payload: any): void {
    this.eventHistory.push({
      event,
      payload,
      timestamp: Date.now()
    });
    
    // Trim history if it exceeds max size
    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory = this.eventHistory.slice(-this.maxHistorySize);
    }
  }

  /**
   * Get all active subscriptions
   */
  getActiveSubscriptions(): EventSubscription[] {
    return Array.from(this.subscriptions.values());
  }

  /**
   * Get subscription count for a specific event
   */
  getListenerCount(event: string): number {
    return this.listenerCount(event);
  }

  /**
   * Remove all subscriptions for a specific context
   */
  removeSubscriptionsForContext(context: any): void {
    const subscriptionsToRemove: string[] = [];
    
    for (const [id, subscription] of this.subscriptions) {
      // This is a simplified check - in production, you might want a more robust way
      // to track context associations
      subscriptionsToRemove.push(id);
    }
    
    subscriptionsToRemove.forEach(id => this.unsubscribe(id));
  }

  /**
   * Create a filtered event bus that only receives specific events
   */
  createFilteredBus(eventFilter: string[] | ((event: string) => boolean)): EventBus {
    const filteredBus = new EventBus();
    
    const filterFn = Array.isArray(eventFilter) 
      ? (event: string) => eventFilter.includes(event)
      : eventFilter;
    
    // Forward filtered events
    const allEvents = Object.values(JiraIntegrationEvent);
    allEvents.forEach(event => {
      if (filterFn(event)) {
        this.on(event, (payload) => {
          filteredBus.emit(event, payload);
        });
      }
    });
    
    return filteredBus;
  }

  /**
   * Request/Response pattern for plugin data communication
   */
  async request(dataType: string, query?: any, targetPlugin?: string, timeout: number = 5000): Promise<any> {
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Create request payload
    const requestPayload: DataRequestPayload = {
      requestId,
      targetPlugin,
      dataType,
      query,
      timeout,
      timestamp: Date.now(),
      source: 'jira-sync-pro'
    };
    
    // Set up response listener with timeout
    const responsePromise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.removeListener(JiraIntegrationEvent.DATA_RESPONSE, responseHandler);
        this.removeListener(JiraIntegrationEvent.DATA_ERROR, errorHandler);
        reject(new Error(`Request timeout for ${dataType} (${requestId})`));
      }, timeout);
      
      const responseHandler = (payload: DataResponsePayload) => {
        if (payload.requestId === requestId) {
          clearTimeout(timer);
          this.removeListener(JiraIntegrationEvent.DATA_RESPONSE, responseHandler);
          this.removeListener(JiraIntegrationEvent.DATA_ERROR, errorHandler);
          
          if (payload.success) {
            resolve(payload.data);
          } else {
            reject(new Error(payload.error || 'Request failed'));
          }
        }
      };
      
      const errorHandler = (payload: DataResponsePayload) => {
        if (payload.requestId === requestId) {
          clearTimeout(timer);
          this.removeListener(JiraIntegrationEvent.DATA_RESPONSE, responseHandler);
          this.removeListener(JiraIntegrationEvent.DATA_ERROR, errorHandler);
          reject(new Error(payload.error || 'Request error'));
        }
      };
      
      this.on(JiraIntegrationEvent.DATA_RESPONSE, responseHandler);
      this.on(JiraIntegrationEvent.DATA_ERROR, errorHandler);
    });
    
    // Emit the request
    this.emit(JiraIntegrationEvent.DATA_REQUEST, requestPayload);
    
    return responsePromise;
  }

  /**
   * Respond to a data request
   */
  respond(requestId: string, data?: any, error?: string): void {
    const responsePayload: DataResponsePayload = {
      requestId,
      success: !error,
      data,
      error,
      timestamp: Date.now(),
      source: 'jira-sync-pro'
    };
    
    if (error) {
      this.emit(JiraIntegrationEvent.DATA_ERROR, responsePayload);
    } else {
      this.emit(JiraIntegrationEvent.DATA_RESPONSE, responsePayload);
    }
  }

  /**
   * Emit an error event with severity level
   */
  emitError(severity: 'critical' | 'recoverable' | 'warning', error: Error | string, context?: any, recoveryAction?: string): void {
    const errorPayload: ErrorEventPayload = {
      severity,
      error,
      context,
      recoveryAction,
      timestamp: Date.now(),
      source: 'jira-sync-pro'
    };
    
    // Emit based on severity
    switch (severity) {
      case 'critical':
        this.emit(JiraIntegrationEvent.ERROR_CRITICAL, errorPayload);
        break;
      case 'recoverable':
        this.emit(JiraIntegrationEvent.ERROR_RECOVERABLE, errorPayload);
        break;
      case 'warning':
        this.emit(JiraIntegrationEvent.ERROR_WARNING, errorPayload);
        break;
    }
    
    // Also log to console
    console.error(`[${severity.toUpperCase()}] EventBus Error:`, error, context);
  }

  /**
   * Route events to specific plugins based on routing rules
   */
  routeEvent(event: string, payload: any, routingRules?: Map<string, string[]>): void {
    if (!routingRules || routingRules.size === 0) {
      // No routing rules, emit to all
      this.emit(event, payload);
      return;
    }
    
    const targetPlugins = routingRules.get(event);
    if (!targetPlugins || targetPlugins.length === 0) {
      // No specific targets, emit to all
      this.emit(event, payload);
      return;
    }
    
    // Add routing information to payload
    const routedPayload = {
      ...payload,
      _routing: {
        targets: targetPlugins,
        routed: true
      }
    };
    
    this.emit(event, routedPayload);
  }

  /**
   * Create an event filter for plugin-specific events
   */
  createPluginFilter(pluginId: string): (payload: any) => boolean {
    return (payload: any) => {
      // Check if event is targeted to this plugin
      if (payload.targetPlugin && payload.targetPlugin !== pluginId) {
        return false;
      }
      
      // Check routing information
      if (payload._routing && payload._routing.routed) {
        return payload._routing.targets.includes(pluginId);
      }
      
      return true;
    };
  }
}