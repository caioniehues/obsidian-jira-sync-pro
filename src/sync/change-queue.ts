/**
 * Change Queue for Bidirectional Sync
 * Manages pending changes with persistence and retry logic
 */

import { Plugin } from 'obsidian';
import { EventManager, eventManager } from '../events/event-manager';

export interface QueuedChange {
  id: string;
  issueKey: string;
  fields: Record<string, any>;
  timestamp: number;
  retryCount: number;
  maxRetries?: number;
  lastAttempt?: number;
  error?: string;
}

export class ChangeQueue {
  private readonly plugin: Plugin;
  private readonly queue: Map<string, QueuedChange> = new Map();
  private readonly eventManager: EventManager;
  private readonly STORAGE_KEY = 'jira-sync-change-queue';
  private readonly MAX_RETRIES = 3;
  private readonly RETRY_DELAY = [1000, 2000, 4000, 8000]; // Exponential backoff

  constructor(plugin: Plugin, eventManagerInstance?: EventManager) {
    this.plugin = plugin;
    this.eventManager = eventManagerInstance || eventManager;
  }

  /**
   * Load queue from persistent storage
   */
  async load(): Promise<void> {
    try {
      const data = await this.plugin.loadData();
      if (data?.[this.STORAGE_KEY]) {
        const queueData = data[this.STORAGE_KEY] as QueuedChange[];
        for (const change of queueData) {
          this.queue.set(change.id, change);
        }
      }
    } catch (error) {
      console.error('Error loading change queue:', error);
    }
  }

  /**
   * Save queue to persistent storage
   */
  async save(): Promise<void> {
    try {
      const data = (await this.plugin.loadData()) || {};
      data[this.STORAGE_KEY] = Array.from(this.queue.values());
      await this.plugin.saveData(data);
    } catch (error) {
      console.error('Error saving change queue:', error);
    }
  }

  /**
   * Add a change to the queue
   */
  async addChange(change: Omit<QueuedChange, 'maxRetries'>): Promise<void> {
    const queuedChange: QueuedChange = {
      ...change,
      maxRetries: this.MAX_RETRIES,
    };

    // Check if there's already a change for this issue
    const existingChange = this.findChangeByIssueKey(change.issueKey);
    let isUpdate = false;
    if (existingChange) {
      // Merge fields
      queuedChange.fields = {
        ...existingChange.fields,
        ...change.fields,
      };
      // Use the existing ID to replace
      queuedChange.id = existingChange.id;
      isUpdate = true;
    }

    this.queue.set(queuedChange.id, queuedChange);
    await this.save();

    // Emit event for change queued - we'll use ticket:updated event as closest match
    await this.emitChangeQueuedEvent(queuedChange, isUpdate);
  }

  /**
   * Get all pending changes
   */
  getPendingChanges(): QueuedChange[] {
    const now = Date.now();
    const pending: QueuedChange[] = [];

    for (const change of this.queue.values()) {
      // Skip if max retries exceeded
      if (change.retryCount >= (change.maxRetries || this.MAX_RETRIES)) {
        continue;
      }

      // Skip if retry delay not met
      if (change.lastAttempt) {
        const delay = this.getRetryDelay(change.retryCount);
        if (now - change.lastAttempt < delay) {
          continue;
        }
      }

      pending.push(change);
    }

    return pending;
  }

  /**
   * Mark a change as successfully processed
   */
  markAsProcessed(changeId: string): void {
    const change = this.queue.get(changeId);
    this.queue.delete(changeId);

    // Emit event for change processed successfully
    if (change) {
      this.emitChangeProcessedEvent(change, true);
    }
  }

  /**
   * Increment retry count for a failed change
   */
  async incrementRetryCount(changeId: string, error?: string): Promise<void> {
    const change = this.queue.get(changeId);
    if (change) {
      const wasFailedBefore =
        change.retryCount >= (change.maxRetries || this.MAX_RETRIES);

      change.retryCount++;
      change.lastAttempt = Date.now();
      if (error) {
        change.error = error;
      }

      // Check if max retries exceeded
      const isFailedNow =
        change.retryCount >= (change.maxRetries || this.MAX_RETRIES);
      if (isFailedNow && !wasFailedBefore) {
        console.error(
          `Max retries exceeded for ${change.issueKey}:`,
          change.error
        );
        // Keep in queue but marked as failed for manual review
        await this.emitChangeProcessedEvent(change, false, error);
      }

      await this.save();
    }
  }

  /**
   * Check if there are pending changes
   */
  hasPendingChanges(): boolean {
    return this.getPendingChanges().length > 0;
  }

  /**
   * Get failed changes (exceeded max retries)
   */
  getFailedChanges(): QueuedChange[] {
    const failed: QueuedChange[] = [];

    for (const change of this.queue.values()) {
      if (change.retryCount >= (change.maxRetries || this.MAX_RETRIES)) {
        failed.push(change);
      }
    }

    return failed;
  }

  /**
   * Clear all changes from queue
   */
  async clear(): Promise<void> {
    this.queue.clear();
    await this.save();
  }

  /**
   * Clear failed changes from queue
   */
  async clearFailed(): Promise<void> {
    const failed = this.getFailedChanges();
    for (const change of failed) {
      this.queue.delete(change.id);
    }
    await this.save();
  }

  /**
   * Retry a specific failed change
   */
  async retryChange(changeId: string): Promise<void> {
    const change = this.queue.get(changeId);
    if (change) {
      change.retryCount = 0;
      change.lastAttempt = undefined;
      change.error = undefined;
      await this.save();
    }
  }

  /**
   * Get queue statistics
   */
  getStatistics(): {
    total: number;
    pending: number;
    failed: number;
    retrying: number;
  } {
    const pending = this.getPendingChanges();
    const failed = this.getFailedChanges();
    const now = Date.now();

    let retrying = 0;
    for (const change of this.queue.values()) {
      if (
        change.retryCount > 0 &&
        change.retryCount < (change.maxRetries || this.MAX_RETRIES) &&
        change.lastAttempt
      ) {
        const delay = this.getRetryDelay(change.retryCount);
        if (now - change.lastAttempt < delay) {
          retrying++;
        }
      }
    }

    return {
      total: this.queue.size,
      pending: pending.length,
      failed: failed.length,
      retrying,
    };
  }

  /**
   * Private helper methods
   */

  private findChangeByIssueKey(issueKey: string): QueuedChange | undefined {
    for (const change of this.queue.values()) {
      if (change.issueKey === issueKey) {
        return change;
      }
    }
    return undefined;
  }

  private getRetryDelay(retryCount: number): number {
    return this.RETRY_DELAY[Math.min(retryCount, this.RETRY_DELAY.length - 1)];
  }

  /**
   * Emit event when a change is added to the queue
   */
  private async emitChangeQueuedEvent(
    change: QueuedChange,
    isUpdate: boolean
  ): Promise<void> {
    try {
      // Create a mock ticket object for the event
      const mockTicket = {
        key: change.issueKey,
        fields: change.fields,
      } as any;

      if (isUpdate) {
        const event = this.eventManager.createEvent('jira:ticket:updated', {
          ticket: mockTicket,
          filePath: '', // Will be filled by sync engine
          previousData: {},
          changedFields: Object.keys(change.fields),
          source: 'local',
        });
        await this.eventManager.emit('jira:ticket:updated', event);
      } else {
        const event = this.eventManager.createEvent('jira:ticket:updated', {
          ticket: mockTicket,
          filePath: '', // Will be filled by sync engine
          previousData: {},
          changedFields: Object.keys(change.fields),
          source: 'local',
        });
        await this.eventManager.emit('jira:ticket:updated', event);
      }
    } catch (error) {
      console.error('Failed to emit change queued event:', error);
    }
  }

  /**
   * Emit event when a change is processed (success or failure)
   */
  private async emitChangeProcessedEvent(
    change: QueuedChange,
    success: boolean,
    error?: string
  ): Promise<void> {
    try {
      // For now, we'll use ticket:updated events to indicate processing completion
      // In the future, we might add specific queue events to the event types
      const mockTicket = {
        key: change.issueKey,
        fields: change.fields,
      } as any;

      const event = this.eventManager.createEvent('jira:ticket:updated', {
        ticket: mockTicket,
        filePath: '', // Will be filled by sync engine
        previousData: {},
        changedFields: success ? Object.keys(change.fields) : [],
        source: 'local',
      });
      await this.eventManager.emit('jira:ticket:updated', event);

      if (!success && error) {
        console.warn(
          `Change processing failed for ${change.issueKey}: ${error}`
        );
      }
    } catch (eventError) {
      console.error('Failed to emit change processed event:', eventError);
    }
  }
}
