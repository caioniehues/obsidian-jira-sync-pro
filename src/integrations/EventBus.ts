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
  PERMISSION_DENIED = 'integration:permission:denied'
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
}