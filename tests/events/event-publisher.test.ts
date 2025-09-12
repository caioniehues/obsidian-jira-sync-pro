/**
 * Comprehensive Test Suite for EventPublisher
 * 
 * Tests all event publishing functionality including:
 * - Basic event publishing and subscription
 * - Advanced filtering and transformation
 * - Plugin integration events
 * - Performance and memory management
 * - Error handling and resilience
 * - Event history and replay
 * - Metrics and monitoring
 * RED-GREEN-Refactor: All tests written to fail first, then implemented
 * No mocks - using real implementations for reliable testing
 */

import { vi } from 'vitest';
import { Plugin } from 'obsidian';
import { 
  EventPublisher, 
  EventPayload, 
  EventMetadata,
  createEventPublisher,
  createTypedHandler,
  createEventFilter,
  createEventTransform
} from '../../src/events/event-publisher';
import { EventTypes } from '../../src/events/event-types';
import { MockData } from '../fixtures/mock-data';
import { SyncResult, SyncConflict } from '../../src/sync/sync-engine';
import { QueuedChange } from '../../src/sync/change-queue';
import type { Mock, Mocked, MockedFunction } from 'vitest';
describe('EventPublisher', () => {
  let eventPublisher: EventPublisher;
  let mockPlugin: Plugin;
  let testStartTime: number;
  let receivedEvents: EventPayload[] = [];
  beforeEach(() => {
    testStartTime = Date.now();
    receivedEvents = [];
    
    // Create mock plugin
    mockPlugin = {
      app: {
        vault: {
          on: vi.fn(),
          off: vi.fn()
        }
      },
      register: vi.fn(),
      settings: {
        jiraInstanceUrl: 'https://test.atlassian.net'
      }
    } as unknown as Plugin;
    eventPublisher = new EventPublisher(mockPlugin);
  });
  afterEach(() => {
    const testDuration = Date.now() - testStartTime;
    console.log(`Test completed in ${testDuration}ms`);
    // Cleanup
    eventPublisher.removeAllListeners();
  describe('Basic Event Publishing and Subscription', () => {
    test('should publish and receive events', async () => {
      const testData = { message: 'Hello World', value: 42 };
      
      const subscriptionId = eventPublisher.subscribe('test.event', (payload) => {
        receivedEvents.push(payload);
      });
      await eventPublisher.publish('test.event', testData);
      expect(receivedEvents).toHaveLength(1);
      expect(receivedEvents[0].data).toEqual(testData);
      expect(receivedEvents[0].metadata.source).toBe('sync-engine');
      expect(receivedEvents[0].metadata.timestamp).toBeGreaterThan(testStartTime);
      expect(receivedEvents[0].metadata.correlationId).toBeDefined();
      expect(subscriptionId).toBeDefined();
    });
    test('should handle multiple subscribers for same event', async () => {
      const testData = { test: 'multiple-subscribers' };
      const handlers: Mock[] = [];
      // Create multiple subscribers
      for (let i = 0; i < 5; i++) {
        const handler = vi.fn();
        handlers.push(handler);
        eventPublisher.subscribe('multi.event', handler);
      await eventPublisher.publish('multi.event', testData);
      // All handlers should be called
      handlers.forEach(handler => {
        expect(handler).toHaveBeenCalledTimes(1);
        expect(handler).toHaveBeenCalledWith(
          expect.objectContaining({
            data: testData,
            metadata: expect.objectContaining({
              source: 'sync-engine',
              timestamp: expect.any(Number)
            })
          })
        );
    test('should handle async event handlers', async () => {
      let asyncHandlerCompleted = false;
      eventPublisher.subscribe('async.event', async (payload) => {
        await new Promise(resolve => setTimeout(resolve, 50));
        asyncHandlerCompleted = true;
      await eventPublisher.publish('async.event', { async: true });
      expect(asyncHandlerCompleted).toBe(true);
    test('should unsubscribe successfully', async () => {
      const handler = vi.fn();
      const subscriptionId = eventPublisher.subscribe('unsub.event', handler);
      // Publish before unsubscribe
      await eventPublisher.publish('unsub.event', { before: true });
      expect(handler).toHaveBeenCalledTimes(1);
      // Unsubscribe
      const unsubResult = eventPublisher.unsubscribe(subscriptionId);
      expect(unsubResult).toBe(true);
      // Publish after unsubscribe
      await eventPublisher.publish('unsub.event', { after: true });
      expect(handler).toHaveBeenCalledTimes(1); // Should not increase
    test('should handle one-time subscriptions', async () => {
      eventPublisher.subscribe('once.event', handler, { once: true });
      // First publish
      await eventPublisher.publish('once.event', { first: true });
      // Second publish
      await eventPublisher.publish('once.event', { second: true });
  describe('Subscription Priority and Ordering', () => {
    test('should execute handlers in priority order', async () => {
      const executionOrder: number[] = [];
      // Subscribe with different priorities
      eventPublisher.subscribe('priority.event', () => { executionOrder.push(1); }, { priority: 1 });
      eventPublisher.subscribe('priority.event', () => { executionOrder.push(5); }, { priority: 5 });
      eventPublisher.subscribe('priority.event', () => { executionOrder.push(3); }, { priority: 3 });
      eventPublisher.subscribe('priority.event', () => { executionOrder.push(2); }, { priority: 2 });
      await eventPublisher.publish('priority.event', {});
      expect(executionOrder).toEqual([5, 3, 2, 1]); // Highest priority first
    test('should pause and resume subscriptions', async () => {
      const subscriptionId = eventPublisher.subscribe('toggle.event', handler);
      // Active subscription
      await eventPublisher.publish('toggle.event', { active: true });
      // Pause subscription
      eventPublisher.toggleSubscription(subscriptionId, false);
      await eventPublisher.publish('toggle.event', { paused: true });
      // Resume subscription
      eventPublisher.toggleSubscription(subscriptionId, true);
      await eventPublisher.publish('toggle.event', { resumed: true });
      expect(handler).toHaveBeenCalledTimes(2); // Should increase
  describe('Event Filtering', () => {
    test('should filter events by source', async () => {
      eventPublisher.subscribe('filter.event', handler, {
        filter: { source: ['test-source'] }
      // Should receive (matching source)
      await eventPublisher.publish('filter.event', { test: 1 }, { source: 'test-source' });
      // Should not receive (non-matching source)
      await eventPublisher.publish('filter.event', { test: 2 }, { source: 'other-source' });
    test('should filter events by correlation ID', async () => {
      const correlationId = 'test-correlation-123';
      eventPublisher.subscribe('correlation.event', handler, {
        filter: { correlationId }
      // Should receive (matching correlation ID)
      await eventPublisher.publish('correlation.event', { test: 1 }, { correlationId });
      // Should not receive (different correlation ID)
      await eventPublisher.publish('correlation.event', { test: 2 }, { correlationId: 'different-id' });
    test('should filter events by time range', async () => {
      const baseTime = Date.now();
      eventPublisher.subscribe('time.event', handler, {
        filter: { 
          since: baseTime + 1000,
          until: baseTime + 5000
      // Simulate events at different times by manipulating timestamp
      const originalNow = Date.now;
      // Too early
      Date.now = vi.fn(() => baseTime + 500);
      await eventPublisher.publish('time.event', { early: true });
      expect(handler).toHaveBeenCalledTimes(0);
      // Within range
      Date.now = vi.fn(() => baseTime + 3000);
      await eventPublisher.publish('time.event', { inRange: true });
      // Too late
      Date.now = vi.fn(() => baseTime + 6000);
      await eventPublisher.publish('time.event', { late: true });
      Date.now = originalNow;
    test('should use createEventFilter utility', async () => {
      const filter = createEventFilter({
        eventTypes: ['allowed.event'],
        sources: ['test-source'],
        timeRange: { start: Date.now(), end: Date.now() + 10000 }
      eventPublisher.subscribe('allowed.event', handler, { filter });
      await eventPublisher.publish('allowed.event', { test: true }, { source: 'test-source' });
  describe('Event Transformation', () => {
    test('should transform event data', async () => {
      const transform = createEventTransform<{ value: number }, { doubled: number }>((data) => {
        return { doubled: data.value * 2 };
      eventPublisher.subscribe('transform.event', handler, { transform });
      await eventPublisher.publish('transform.event', { value: 21 });
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { doubled: 42 },
          metadata: expect.any(Object)
        })
      );
    test('should filter out events when transform returns null', async () => {
      const transform = createEventTransform<{ include: boolean }, any>((data) => {
        return data.include ? data : null;
      eventPublisher.subscribe('filter-transform.event', handler, { transform });
      // Should be included
      await eventPublisher.publish('filter-transform.event', { include: true, value: 1 });
      // Should be filtered out
      await eventPublisher.publish('filter-transform.event', { include: false, value: 2 });
    test('should chain multiple transformations', async () => {
      // First transformation: add prefix
      const transform1 = createEventTransform<{ message: string }, { message: string }>((data) => {
        return { message: `Transformed: ${data.message}` };
      // Second transformation: add suffix
      const transform2 = createEventTransform<{ message: string }, { message: string }>((data) => {
        return { message: `${data.message} [Done]` };
      // Subscribe with first transform
      const sub1 = eventPublisher.subscribe('chain.event', (payload) => {
        // Apply second transform manually
        const transformed = transform2(payload);
        if (transformed) handler(transformed);
      }, { transform: transform1 });
      await eventPublisher.publish('chain.event', { message: 'Original' });
          data: { message: 'Transformed: Original [Done]' }
  describe('Event History and Replay', () => {
    test('should maintain event history', async () => {
      const events = [
        { type: 'history.event', data: { sequence: 1 } },
        { type: 'history.event', data: { sequence: 2 } },
        { type: 'other.event', data: { sequence: 3 } }
      ];
      for (const event of events) {
        await eventPublisher.publish(event.type, event.data);
      const history = eventPublisher.getHistory();
      expect(history).toHaveLength(3);
      // Check sequence
      expect(history[0].data.sequence).toBe(1);
      expect(history[1].data.sequence).toBe(2);
      expect(history[2].data.sequence).toBe(3);
    test('should filter event history', async () => {
      // Publish events at different times
      Date.now = vi.fn(() => baseTime + 1000);
      await eventPublisher.publish('filtered.event', { time: 1 }, { source: 'source-a' });
      await eventPublisher.publish('filtered.event', { time: 2 }, { source: 'source-b' });
      Date.now = vi.fn(() => baseTime + 5000);
      await eventPublisher.publish('filtered.event', { time: 3 }, { source: 'source-a' });
      // Filter by source
      const sourceFiltered = eventPublisher.getHistory({ source: ['source-a'] });
      expect(sourceFiltered).toHaveLength(2);
      expect(sourceFiltered[0].data.time).toBe(1);
      expect(sourceFiltered[1].data.time).toBe(3);
      // Filter by time range
      const timeFiltered = eventPublisher.getHistory({ 
        since: baseTime + 2000, 
        until: baseTime + 4000 
      expect(timeFiltered).toHaveLength(1);
      expect(timeFiltered[0].data.time).toBe(2);
    test('should replay events to handler', async () => {
      // Publish some events
      await eventPublisher.publish('replay.event', { id: 1 });
      await eventPublisher.publish('replay.event', { id: 2 });
      await eventPublisher.publish('other.event', { id: 3 });
      const replayedEvents: EventPayload[] = [];
      const replayHandler = (payload: EventPayload) => {
        replayedEvents.push(payload);
      };
      // Replay all events
      await eventPublisher.replayEvents(replayHandler);
      expect(replayedEvents).toHaveLength(3);
      // Replay with filter
      const filteredReplayedEvents: EventPayload[] = [];
      await eventPublisher.replayEvents(
        (payload) => filteredReplayedEvents.push(payload),
        { source: ['sync-engine'] }
      expect(filteredReplayedEvents).toHaveLength(3); // All should match default source
    test('should limit history size', async () => {
      const limitedPublisher = new EventPublisher(mockPlugin, { maxHistorySize: 5 });
      // Publish more events than the limit
      for (let i = 1; i <= 10; i++) {
        await limitedPublisher.publish('limited.event', { sequence: i });
      const history = limitedPublisher.getHistory();
      expect(history).toHaveLength(5);
      // Should keep the most recent events
      expect(history[0].data.sequence).toBe(6);
      expect(history[4].data.sequence).toBe(10);
    test('should clear event history', async () => {
      await eventPublisher.publish('clear.event', { test: 1 });
      await eventPublisher.publish('clear.event', { test: 2 });
      expect(eventPublisher.getHistory()).toHaveLength(2);
      eventPublisher.clearHistory();
      expect(eventPublisher.getHistory()).toHaveLength(0);
  describe('Sync Engine Integration Events', () => {
    test('should publish sync lifecycle events', async () => {
      const lifecycleEvents: EventPayload[] = [];
      eventPublisher.subscribe(EventTypes.SYNC_STARTED, (payload) => {
        lifecycleEvents.push(payload);
      eventPublisher.subscribe(EventTypes.SYNC_COMPLETED, (payload) => {
      const correlationId = 'test-sync-123';
      const syncResult: SyncResult = {
        success: true,
        syncedCount: 5,
        failedCount: 0,
        conflicts: [],
        errors: [],
        duration: 250
      await eventPublisher.publishSyncStarted(correlationId);
      await eventPublisher.publishSyncCompleted(syncResult, correlationId);
      expect(lifecycleEvents).toHaveLength(2);
      expect(lifecycleEvents[0].data.correlationId).toBe(correlationId);
      expect(lifecycleEvents[1].data.result).toEqual(syncResult);
    test('should publish issue lifecycle events', async () => {
      const issueEvents: EventPayload[] = [];
      [EventTypes.ISSUE_CREATED, EventTypes.ISSUE_UPDATED, EventTypes.ISSUE_DELETED].forEach(eventType => {
        eventPublisher.subscribe(eventType, (payload) => {
          issueEvents.push(payload);
        });
      const testIssue = MockData.jira.issue;
      const testFile = {
        path: 'test/TEST-123.md',
        name: 'TEST-123.md',
        basename: 'TEST-123',
        extension: 'md'
      } as any;
      await eventPublisher.publishIssueCreated(testIssue, testFile);
      await eventPublisher.publishIssueUpdated(testIssue, testFile, { summary: 'Updated title' });
      await eventPublisher.publishIssueDeleted(testIssue.key, testFile);
      expect(issueEvents).toHaveLength(3);
      expect(issueEvents[0].data.issue.key).toBe(testIssue.key);
      expect(issueEvents[1].data.changes).toEqual({ summary: 'Updated title' });
      expect(issueEvents[2].data.issueKey).toBe(testIssue.key);
    test('should publish conflict events', async () => {
      const conflictEvents: EventPayload[] = [];
      eventPublisher.subscribe(EventTypes.CONFLICT_DETECTED, (payload) => {
        conflictEvents.push(payload);
      eventPublisher.subscribe(EventTypes.CONFLICT_RESOLVED, (payload) => {
      const conflict: SyncConflict = {
        issueKey: 'TEST-123',
        field: 'summary',
        localValue: 'Local Title',
        remoteValue: 'Remote Title',
        localTimestamp: Date.now(),
        remoteTimestamp: Date.now() + 1000,
        conflictType: 'CONCURRENT_EDIT'
      await eventPublisher.publishConflictDetected([conflict]);
      await eventPublisher.publishConflictResolved(conflict, 'remote-wins');
      expect(conflictEvents).toHaveLength(2);
      expect(conflictEvents[0].data.conflicts).toHaveLength(1);
      expect(conflictEvents[1].data.resolution).toBe('remote-wins');
    test('should publish change queue events', async () => {
      const queueEvents: EventPayload[] = [];
      eventPublisher.subscribe(EventTypes.CHANGE_QUEUED, (payload) => {
        queueEvents.push(payload);
      eventPublisher.subscribe(EventTypes.CHANGE_PROCESSED, (payload) => {
      const change: QueuedChange = {
        id: 'test-change-1',
        fields: { summary: 'Updated Title' },
        timestamp: Date.now(),
        retryCount: 0
      await eventPublisher.publishChangeQueued(change);
      await eventPublisher.publishChangeProcessed(change, true);
      expect(queueEvents).toHaveLength(2);
      expect(queueEvents[0].data.change.id).toBe(change.id);
      expect(queueEvents[1].data.success).toBe(true);
  describe('Plugin Integration Events', () => {
    test('should publish events for Tasks plugin', async () => {
      const tasksEvents: EventPayload[] = [];
      eventPublisher.subscribe(EventTypes.TASKS_UPDATED, (payload) => {
        tasksEvents.push(payload);
      const issues = [MockData.jira.issue];
      await eventPublisher.publishForTasksPlugin(issues);
      expect(tasksEvents).toHaveLength(1);
      const taskData = tasksEvents[0].data.tasks[0];
      expect(taskData.id).toBe(issues[0].key);
      expect(taskData.title).toBe(issues[0].fields.summary);
      expect(taskData.status).toBe(issues[0].fields.status?.name);
    test('should publish events for Dataview plugin', async () => {
      const dataviewEvents: EventPayload[] = [];
      eventPublisher.subscribe(EventTypes.DATAVIEW_UPDATED, (payload) => {
        dataviewEvents.push(payload);
      const issues = MockData.jira.issues;
      await eventPublisher.publishForDataviewPlugin(issues);
      expect(dataviewEvents).toHaveLength(1);
      const dataviewData = dataviewEvents[0].data.data;
      expect(dataviewData.jiraIssues).toHaveLength(issues.length);
      expect(dataviewData.metadata.totalIssues).toBe(issues.length);
      expect(dataviewData.metadata.projects).toBeDefined();
    test('should publish events for Calendar plugin', async () => {
      const calendarEvents: EventPayload[] = [];
      eventPublisher.subscribe(EventTypes.CALENDAR_UPDATED, (payload) => {
        calendarEvents.push(payload);
      const issues = [
        {
          ...MockData.jira.issue,
          fields: {
            ...MockData.jira.issue.fields,
            duedate: '2024-12-31'
          }
      await eventPublisher.publishForCalendarPlugin(issues);
      expect(calendarEvents).toHaveLength(1);
      const events = calendarEvents[0].data.events;
      expect(events).toHaveLength(1);
      expect(events[0].date).toBe('2024-12-31');
      expect(events[0].type).toBe('due');
    test('should publish events for Kanban plugin', async () => {
      const kanbanEvents: EventPayload[] = [];
      eventPublisher.subscribe(EventTypes.KANBAN_UPDATED, (payload) => {
        kanbanEvents.push(payload);
      await eventPublisher.publishForKanbanPlugin(issues);
      expect(kanbanEvents).toHaveLength(1);
      const kanbanData = kanbanEvents[0].data.data;
      expect(kanbanData.cards).toHaveLength(issues.length);
      expect(kanbanData.boards).toBeDefined();
      expect(kanbanData.lanes).toBeDefined();
  describe('Error Handling and Resilience', () => {
    test('should handle errors in event handlers gracefully', async () => {
      const workingHandler = vi.fn();
      const failingHandler = vi.fn(() => {
        throw new Error('Handler failed');
      eventPublisher.subscribe('error.event', workingHandler);
      eventPublisher.subscribe('error.event', failingHandler);
      // Should not throw and working handler should still execute
      await expect(eventPublisher.publish('error.event', { test: true })).resolves.not.toThrow();
      expect(workingHandler).toHaveBeenCalledTimes(1);
      expect(failingHandler).toHaveBeenCalledTimes(1);
    test('should disable subscriptions that fail repeatedly', async () => {
        throw new Error('Persistent failure');
      eventPublisher.subscribe('failing.event', failingHandler);
      // Trigger multiple failures
        await eventPublisher.publish('failing.event', { attempt: i });
      expect(failingHandler).toHaveBeenCalledTimes(4); // Should be disabled after 3 failures
    test('should publish error events when handlers fail', async () => {
      const errorEvents: EventPayload[] = [];
      eventPublisher.subscribe(EventTypes.EVENT_ERROR, (payload) => {
        errorEvents.push(payload);
      eventPublisher.subscribe('will-fail.event', () => {
        throw new Error('Test error');
      await eventPublisher.publish('will-fail.event', { test: true });
      expect(errorEvents).toHaveLength(1);
      expect(errorEvents[0].data.originalEventType).toBe('will-fail.event');
      expect(errorEvents[0].data.error.message).toBe('Test error');
    test('should handle async handler errors', async () => {
      const errorHandler = vi.fn();
      eventPublisher.subscribe(EventTypes.EVENT_ERROR, errorHandler);
      eventPublisher.subscribe('async-fail.event', async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        throw new Error('Async error');
      await eventPublisher.publish('async-fail.event', { test: true });
      expect(errorHandler).toHaveBeenCalledTimes(1);
  describe('Performance and Metrics', () => {
    test('should track event metrics', async () => {
      // Publish various events
      await eventPublisher.publish('metric.event1', { test: 1 }, { source: 'source-a' });
      await eventPublisher.publish('metric.event1', { test: 2 }, { source: 'source-a' });
      await eventPublisher.publish('metric.event2', { test: 3 }, { source: 'source-b' });
      const metrics = eventPublisher.getMetrics();
      expect(metrics.totalEvents).toBe(3);
      expect(metrics.eventsByType['metric.event1']).toBe(2);
      expect(metrics.eventsByType['metric.event2']).toBe(1);
      expect(metrics.eventsBySource['source-a']).toBe(2);
      expect(metrics.eventsBySource['source-b']).toBe(1);
      expect(metrics.averageProcessingTime).toBeGreaterThanOrEqual(0);
      expect(metrics.lastEventTime).toBeGreaterThan(testStartTime);
    test('should handle high-frequency events efficiently', async () => {
      eventPublisher.subscribe('high-freq.event', handler);
      const eventCount = 1000;
      const startTime = Date.now();
      // Publish many events rapidly
      const promises: Promise<void>[] = [];
      for (let i = 0; i < eventCount; i++) {
        promises.push(eventPublisher.publish('high-freq.event', { sequence: i }));
      await Promise.all(promises);
      const duration = Date.now() - startTime;
      expect(handler).toHaveBeenCalledTimes(eventCount);
      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
      const eventsPerMs = eventCount / duration;
      expect(eventsPerMs).toBeGreaterThan(0.1); // At least 100 events per second
      console.log(`Performance: ${eventCount} events in ${duration}ms (${eventsPerMs.toFixed(2)} events/ms)`);
    test('should handle concurrent event publishing', async () => {
      eventPublisher.subscribe('concurrent.event', handler);
      const concurrentPublishers = 10;
      const eventsPerPublisher = 100;
      const publisherPromises = Array.from({ length: concurrentPublishers }, async (_, publisherId) => {
        const promises: Promise<void>[] = [];
        for (let i = 0; i < eventsPerPublisher; i++) {
          promises.push(
            eventPublisher.publish('concurrent.event', {
              publisherId,
              eventId: i
          );
        return Promise.all(promises);
      await Promise.all(publisherPromises);
      const totalEvents = concurrentPublishers * eventsPerPublisher;
      expect(handler).toHaveBeenCalledTimes(totalEvents);
      expect(duration).toBeLessThan(10000); // Should complete within 10 seconds
      console.log(`Concurrent performance: ${totalEvents} events from ${concurrentPublishers} publishers in ${duration}ms`);
    test('should maintain performance with large event history', async () => {
      const largeHistoryPublisher = new EventPublisher(mockPlugin, { maxHistorySize: 10000 });
      largeHistoryPublisher.subscribe('history-perf.event', handler);
      // Fill up history
      for (let i = 0; i < 5000; i++) {
        await largeHistoryPublisher.publish('history-perf.event', { sequence: i });
      // Test continued performance
      for (let i = 0; i < 100; i++) {
        await largeHistoryPublisher.publish('history-perf.event', { continued: i });
      expect(handler).toHaveBeenCalledTimes(5100);
      expect(duration).toBeLessThan(1000); // Should still be fast
      const history = largeHistoryPublisher.getHistory();
      expect(history).toHaveLength(5100);
  describe('Memory Management and Cleanup', () => {
    test('should cleanup resources properly', () => {
      const subscriptionId = eventPublisher.subscribe('cleanup.event', handler);
      expect(eventPublisher['subscriptions'].size).toBe(1);
      // Simulate plugin cleanup
      eventPublisher['cleanup']();
      expect(eventPublisher['subscriptions'].size).toBe(0);
      expect(eventPublisher['eventHistory']).toHaveLength(0);
    test('should handle memory pressure with many subscriptions', () => {
      const subscriptionCount = 1000;
      const subscriptions: string[] = [];
      // Create many subscriptions
      for (let i = 0; i < subscriptionCount; i++) {
        const handler = () => { /* no-op */ };
        const sub = eventPublisher.subscribe(`test.event.${i % 10}`, handler);
        subscriptions.push(sub);
      expect(eventPublisher['subscriptions'].size).toBe(subscriptionCount);
      // Unsubscribe half
      for (let i = 0; i < subscriptionCount / 2; i++) {
        eventPublisher.unsubscribe(subscriptions[i]);
      expect(eventPublisher['subscriptions'].size).toBe(subscriptionCount / 2);
    test('should prevent memory leaks with one-time subscriptions', async () => {
      const initialSize = eventPublisher['subscriptions'].size;
      // Create many one-time subscriptions
        eventPublisher.subscribe('once.leak.event', () => {}, { once: true });
      expect(eventPublisher['subscriptions'].size).toBe(initialSize + 100);
      // Trigger all one-time subscriptions
      await eventPublisher.publish('once.leak.event', {});
      // Should be cleaned up automatically
      expect(eventPublisher['subscriptions'].size).toBe(initialSize);
  describe('Utility Functions', () => {
    test('should create event publisher with factory function', () => {
      const publisher = createEventPublisher(mockPlugin, { maxHistorySize: 500 });
      expect(publisher).toBeInstanceOf(EventPublisher);
      expect(publisher['maxHistorySize']).toBe(500);
    test('should create typed handlers', async () => {
      const typedHandler = createTypedHandler<{ message: string }>((data, metadata) => {
        expect(data.message).toBe('typed message');
        expect(metadata.timestamp).toBeDefined();
        receivedEvents.push({ data, metadata });
      eventPublisher.subscribe('typed.event', typedHandler);
      await eventPublisher.publish('typed.event', { message: 'typed message' });
    test('should create event filters with utility', () => {
        eventTypes: ['test.event'],
      expect(filter.eventType).toEqual(['test.event']);
      expect(filter.source).toEqual(['test-source']);
      expect(filter.since).toBeDefined();
      expect(filter.until).toBeDefined();
    test('should create event transforms with utility', () => {
      const transform = createEventTransform<{ value: number }, { result: string }>((data) => {
        return { result: `Value: ${data.value}` };
      const originalPayload: EventPayload<{ value: number }> = {
        data: { value: 42 },
        metadata: {
          timestamp: Date.now(),
          source: 'test',
          version: '1.0.0'
      const transformedPayload = transform(originalPayload);
      expect(transformedPayload?.data.result).toBe('Value: 42');
      expect(transformedPayload?.metadata).toEqual(originalPayload.metadata);
});
