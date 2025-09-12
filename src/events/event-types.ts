/**
 * Event Type Definitions for Jira Plugin Bridge
 * Defines all events that can be published by the sync engine
 */

import { JiraIssue } from '../types/jira-types';
import { TaskItem } from '../types/tasks-types';
import { SyncResult, SyncConflict } from '../sync/sync-engine';

// Base event interface
export interface BaseEvent {
  timestamp: number;
  source: 'jira-plugin-bridge';
  eventId: string;
}

// Sync lifecycle events
export interface JiraSyncStartEvent extends BaseEvent {
  type: 'jira:sync:start';
  payload: {
    syncType: 'full' | 'incremental' | 'push-only';
    estimatedDuration?: number;
    ticketCount?: number;
  };
}

export interface JiraSyncCompleteEvent extends BaseEvent {
  type: 'jira:sync:complete';
  payload: {
    result: SyncResult;
    syncType: 'full' | 'incremental' | 'push-only';
  };
}

// Ticket lifecycle events
export interface JiraTicketCreatedEvent extends BaseEvent {
  type: 'jira:ticket:created';
  payload: {
    ticket: JiraIssue;
    filePath: string;
    source: 'jira' | 'local';
  };
}

export interface JiraTicketUpdatedEvent extends BaseEvent {
  type: 'jira:ticket:updated';
  payload: {
    ticket: JiraIssue;
    filePath: string;
    previousData: Partial<JiraIssue>;
    changedFields: string[];
    source: 'jira' | 'local';
  };
}

export interface JiraTicketDeletedEvent extends BaseEvent {
  type: 'jira:ticket:deleted';
  payload: {
    ticketKey: string;
    filePath: string;
    lastKnownData: JiraIssue;
    source: 'jira' | 'local';
  };
}

// Conflict detection events
export interface JiraConflictDetectedEvent extends BaseEvent {
  type: 'jira:conflict:detected';
  payload: {
    conflict: SyncConflict;
    resolution: 'pending' | 'auto-resolved';
    autoResolutionStrategy?: 'local' | 'remote';
  };
}

// Tasks plugin integration events
export interface TasksTaskCreatedEvent extends BaseEvent {
  type: 'tasks:task:created';
  payload: {
    task: TaskItem;
    jiraKey?: string;
    filePath: string;
    source: 'jira' | 'plugin';
  };
}

export interface TasksTaskUpdatedEvent extends BaseEvent {
  type: 'tasks:task:updated';
  payload: {
    task: TaskItem;
    previousTask: TaskItem;
    jiraKey?: string;
    filePath: string;
    changedFields: string[];
    source: 'jira' | 'plugin';
  };
}

export interface TasksTaskToggledEvent extends BaseEvent {
  type: 'tasks:task:toggled';
  payload: {
    task: TaskItem;
    previousStatus: string;
    newStatus: string;
    jiraKey?: string;
    filePath: string;
  };
}

export interface TasksTaskSyncedEvent extends BaseEvent {
  type: 'tasks:task:synced';
  payload: {
    jiraKey: string;
    taskFilePath: string;
    operation: 'create' | 'update';
    processingTime: number;
    success: boolean;
    errors?: string[];
  };
}

export interface TasksBulkSyncCompleteEvent extends BaseEvent {
  type: 'tasks:bulk:completed';
  payload: {
    totalProcessed: number;
    successful: number;
    failed: number;
    duration: number;
    errors?: Array<{
      jiraKey: string;
      error: string;
    }>;
  };
}

// Plugin adapter events
export interface AdapterSyncCompletedEvent extends BaseEvent {
  type: 'adapter:sync:completed';
  payload: {
    adapterId: string;
    issueKey: string;
    success: boolean;
    conversionTime: number;
    context?: any;
    errors?: string[];
  };
}

export interface AdapterRegisteredEvent extends BaseEvent {
  type: 'adapter:registered';
  payload: {
    adapterId: string;
    syncDirection: 'jira-to-plugin' | 'plugin-to-jira' | 'bidirectional';
    capabilities: string[];
  };
}

export interface AdapterUnregisteredEvent extends BaseEvent {
  type: 'adapter:unregistered';
  payload: {
    adapterId: string;
    reason?: string;
  };
}

// Union type for all events
export type JiraPluginEvent =
  | JiraSyncStartEvent
  | JiraSyncCompleteEvent
  | JiraTicketCreatedEvent
  | JiraTicketUpdatedEvent
  | JiraTicketDeletedEvent
  | JiraConflictDetectedEvent
  | TasksTaskCreatedEvent
  | TasksTaskUpdatedEvent
  | TasksTaskToggledEvent
  | TasksTaskSyncedEvent
  | TasksBulkSyncCompleteEvent
  | AdapterSyncCompletedEvent
  | AdapterRegisteredEvent
  | AdapterUnregisteredEvent;

// Event type mapping for type safety
export interface EventTypeMap {
  'jira:sync:start': JiraSyncStartEvent;
  'jira:sync:complete': JiraSyncCompleteEvent;
  'jira:ticket:created': JiraTicketCreatedEvent;
  'jira:ticket:updated': JiraTicketUpdatedEvent;
  'jira:ticket:deleted': JiraTicketDeletedEvent;
  'jira:conflict:detected': JiraConflictDetectedEvent;
  'tasks:task:created': TasksTaskCreatedEvent;
  'tasks:task:updated': TasksTaskUpdatedEvent;
  'tasks:task:toggled': TasksTaskToggledEvent;
  'tasks:task:synced': TasksTaskSyncedEvent;
  'tasks:bulk:completed': TasksBulkSyncCompleteEvent;
  'adapter:sync:completed': AdapterSyncCompletedEvent;
  'adapter:registered': AdapterRegisteredEvent;
  'adapter:unregistered': AdapterUnregisteredEvent;
}

// Event handler type definitions
export type EventHandler<T extends JiraPluginEvent> = (
  event: T
) => void | Promise<void>;
export type EventHandlerMap = {
  [K in keyof EventTypeMap]: EventHandler<EventTypeMap[K]>[];
};

// Event listener registration interface
export interface EventListenerConfig {
  once?: boolean;
  priority?: number; // Higher numbers = higher priority
  async?: boolean;
}

// Event performance tracking
export interface EventMetrics {
  eventType: string;
  handlerCount: number;
  totalDuration: number;
  maxDuration: number;
  avgDuration: number;
  errorCount: number;
}
