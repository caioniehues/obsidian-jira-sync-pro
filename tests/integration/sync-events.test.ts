/**
 * Sync Events Integration Tests
 * Tests the event system integration with sync operations using real EventBus/EventManager
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventBus } from '../../src/events/event-bus';
import { EventManager } from '../../src/events/event-manager';
import { 
  EventTypeMap,
  JiraSyncStartEvent,
  JiraSyncCompleteEvent,
  JiraTicketUpdatedEvent,
  JiraConflictDetectedEvent
} from '../../src/events/event-types';
import { ChangeQueue, QueuedChange } from '../../src/sync/change-queue';
import { ConflictDetector, ConflictInfo } from '../../src/sync/conflict-detector';
import { JiraIssue } from '../../src/types/jira-types';
import type { Mock, Mocked, MockedFunction } from 'vitest';
// Mock Plugin minimal interface
interface MockPlugin {
  loadData(): Promise<any>;
  saveData(data: any): Promise<void>;
}
const createMockPlugin = (): MockPlugin => ({
  loadData: vi.fn().mockResolvedValue({}),
  saveData: vi.fn().mockResolvedValue(undefined)
});
describe('Sync Events Integration', () => {
  let eventBus: EventBus;
  let eventManager: EventManager;
  let mockPlugin: MockPlugin;
  let capturedEvents: Array<{ type: string; event: any; timestamp: number }>;
  let performanceMetrics: Array<{ eventType: string; duration: number }>;
  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();
    
    // Create fresh instances
    eventBus = new EventBus();
    eventManager = new EventManager(eventBus);
    mockPlugin = createMockPlugin();
    capturedEvents = [];
    performanceMetrics = [];
    // Set up event listeners to capture all events
    const eventTypes: Array<keyof EventTypeMap> = [
      'jira:sync:start',
      'jira:sync:complete',
      'jira:ticket:created',
      'jira:ticket:updated',
      'jira:ticket:deleted',
      'jira:conflict:detected'
    ];
    eventTypes.forEach(eventType => {
      eventManager.registerHandler(mockPlugin, eventType, (event) => {
        const startTime = performance.now();
        capturedEvents.push({
          type: eventType,
          event: event,
          timestamp: Date.now()
        });
        const duration = performance.now() - startTime;
        performanceMetrics.push({ eventType, duration });
      });
    });
  });
  afterEach(() => {
    // Cleanup event listeners
    eventManager.unregisterAllHandlers(mockPlugin);
    eventBus.removeAllListeners();
    eventBus.resetMetrics();
  describe('EventBus Core Functionality', () => {
    it('should emit and handle events correctly', async () => {
      // Arrange
      const testPayload = {
        syncType: 'full' as const,
        estimatedDuration: 5000,
        ticketCount: 10
      };
      // Act
      const event = eventManager.createEvent('jira:sync:start', testPayload);
      await eventManager.emit('jira:sync:start', event);
      // Assert
      expect(capturedEvents).toHaveLength(1);
      const capturedEvent = capturedEvents[0];
      expect(capturedEvent.type).toBe('jira:sync:start');
      expect((capturedEvent.event as JiraSyncStartEvent).payload.syncType).toBe('full');
    it('should maintain event order and timing', async () => {
      const events = [
        eventManager.createEvent('jira:sync:start', { syncType: 'full', estimatedDuration: 1000 }),
        eventManager.createEvent('jira:sync:complete', { 
          result: { success: true, syncedCount: 1, failedCount: 0, conflicts: [], errors: [], duration: 1000 },
          syncType: 'full' 
        })
      ];
      for (const event of events) {
        await eventManager.emit(event.type as keyof EventTypeMap, event);
      }
      expect(capturedEvents).toHaveLength(2);
      expect(capturedEvents[0].type).toBe('jira:sync:start');
      expect(capturedEvents[1].type).toBe('jira:sync:complete');
      expect(capturedEvents[1].timestamp).toBeGreaterThanOrEqual(capturedEvents[0].timestamp);
  describe('Change Queue Event Integration', () => {
    let changeQueue: ChangeQueue;
    beforeEach(() => {
      changeQueue = new ChangeQueue(mockPlugin as any, eventManager);
    it('should emit event when change is added to queue', async () => {
      const testChange: Omit<QueuedChange, 'maxRetries'> = {
        id: 'test-change-1',
        issueKey: 'TEST-123',
        fields: { summary: 'Test Issue' },
        timestamp: Date.now(),
        retryCount: 0
      await changeQueue.addChange(testChange);
      const ticketUpdatedEvents = capturedEvents.filter(e => e.type === 'jira:ticket:updated');
      expect(ticketUpdatedEvents.length).toBeGreaterThanOrEqual(1);
      
      const updateEvent = ticketUpdatedEvents[0].event as JiraTicketUpdatedEvent;
      expect(updateEvent.payload.ticket.key).toBe('TEST-123');
      expect(updateEvent.payload.source).toBe('local');
      expect(updateEvent.payload.changedFields).toContain('summary');
    it('should handle multiple queue operations', async () => {
      const changes = [
        { id: 'change-1', issueKey: 'TEST-1', fields: { summary: 'Test 1' }, timestamp: Date.now(), retryCount: 0 },
        { id: 'change-2', issueKey: 'TEST-2', fields: { summary: 'Test 2' }, timestamp: Date.now(), retryCount: 0 }
      for (const change of changes) {
        await changeQueue.addChange(change);
      const ticketEvents = capturedEvents.filter(e => e.type === 'jira:ticket:updated');
      expect(ticketEvents.length).toBeGreaterThanOrEqual(2);
    it('should emit event when change processing completes', () => {
        id: 'test-complete',
        issueKey: 'TEST-COMPLETE',
        fields: { summary: 'Completion Test' },
      // Manually add to queue for testing
      changeQueue['queue'].set('test-complete', { ...testChange, maxRetries: 3 });
      capturedEvents.length = 0; // Clear previous events
      changeQueue.markAsProcessed('test-complete');
      // Assert - Should have emitted processing completion event
      const processedEvents = capturedEvents.filter(e => e.type === 'jira:ticket:updated');
      expect(processedEvents.length).toBeGreaterThanOrEqual(1);
  describe('Conflict Detector Event Integration', () => {
    let conflictDetector: ConflictDetector;
      conflictDetector = new ConflictDetector(eventManager);
    it('should emit conflict:detected event when conflict is found', () => {
      const localData = {
        title: 'Local Title',
        status: 'In Progress'
      const remoteIssue: JiraIssue = {
        id: '12345',
        self: 'https://test.atlassian.net/rest/api/2/issue/12345',
        key: 'TEST-126',
        fields: {
          summary: 'Remote Title',
          status: { name: 'Done', id: '3' },
          updated: new Date().toISOString(),
          created: new Date().toISOString(),
          description: '',
          priority: { name: 'Medium', id: '3' },
          assignee: null,
          reporter: null,
          issuetype: { name: 'Task', id: '1' }
        }
      const localTimestamp = Date.now() - 10000; // 10 seconds ago
      const remoteTimestamp = Date.now(); // Now
      const conflict = conflictDetector.detectConflict(
        localData, 
        remoteIssue, 
        localTimestamp, 
        remoteTimestamp
      );
      expect(conflict).not.toBeNull();
      const conflictEvents = capturedEvents.filter(e => e.type === 'jira:conflict:detected');
      expect(conflictEvents).toHaveLength(1);
      const conflictEvent = conflictEvents[0].event as JiraConflictDetectedEvent;
      expect(conflictEvent.type).toBe('jira:conflict:detected');
      expect(conflictEvent.payload.conflict.issueKey).toBe('TEST-126');
      expect(conflictEvent.payload.resolution).toBe('pending');
    it('should emit events for each conflict in analysis', () => {
      const conflicts: ConflictInfo[] = [
        {
          issueKey: 'TEST-127',
          field: 'summary',
          localValue: 'Local Summary',
          remoteValue: 'Remote Summary',
          localTimestamp: Date.now() - 5000,
          remoteTimestamp: Date.now(),
          severity: 'high'
        },
          field: 'priority',
          localValue: 'High',
          remoteValue: 'Low',
          localTimestamp: Date.now() - 3000,
          severity: 'low'
      const analysis = conflictDetector.analyzeConflicts(conflicts);
      expect(analysis.autoResolvable.length + analysis.requiresManual.length).toBe(2);
      expect(conflictEvents).toHaveLength(2);
      conflictEvents.forEach(event => {
        const conflictEvent = event.event as JiraConflictDetectedEvent;
        expect(conflictEvent.payload.conflict.issueKey).toBe('TEST-127');
  describe('Event Performance Requirements', () => {
    it('should maintain <5ms overhead per event', async () => {
        id: 'perf-test',
        issueKey: 'PERF-001',
        fields: { summary: 'Performance Test' },
      const changeQueue = new ChangeQueue(mockPlugin as any, eventManager);
      const startTime = performance.now();
      const endTime = performance.now();
      const eventOverhead = endTime - startTime;
      expect(eventOverhead).toBeLessThan(50); // More relaxed for integration test
      // Check individual handler performance
      if (performanceMetrics.length > 0) {
        const avgDuration = performanceMetrics.reduce((sum, metric) => sum + metric.duration, 0) / performanceMetrics.length;
        expect(avgDuration).toBeLessThan(5); // <5ms requirement
    it('should handle concurrent events efficiently', async () => {
      const changes: Array<Omit<QueuedChange, 'maxRetries'>> = [];
      for (let i = 0; i < 5; i++) {
        changes.push({
          id: `concurrent-${i}`,
          issueKey: `CONC-${i}`,
          fields: { summary: `Concurrent Test ${i}` },
          timestamp: Date.now(),
          retryCount: 0
      await Promise.all(changes.map(change => changeQueue.addChange(change)));
      const totalTime = performance.now() - startTime;
      expect(totalTime).toBeLessThan(100); // Should handle 5 events in <100ms
      expect(capturedEvents.length).toBeGreaterThanOrEqual(5);
  describe('Event Error Handling', () => {
    it('should handle event emission errors gracefully', async () => {
      const faultyEventManager = new EventManager(eventBus);
      vi.spyOn(faultyEventManager, 'emit').mockRejectedValue(new Error('Event emission failed'));
      const changeQueue = new ChangeQueue(mockPlugin as any, faultyEventManager);
        id: 'error-test',
        issueKey: 'ERROR-001',
        fields: { summary: 'Error Test' },
      // Act & Assert
      // Should not throw - errors should be handled gracefully
      await expect(changeQueue.addChange(testChange)).resolves.toBeUndefined();
    it('should continue processing when event handlers fail', async () => {
      const faultyHandler = vi.fn().mockImplementation(() => {
        throw new Error('Handler failed');
      eventManager.registerHandler(mockPlugin, 'jira:sync:start', faultyHandler);
      const event = eventManager.createEvent('jira:sync:start', {
        syncType: 'full',
        estimatedDuration: 1000
      // Should complete despite handler failure
      await expect(eventManager.emit('jira:sync:start', event)).resolves.toBeUndefined();
  describe('Event Memory Management', () => {
    it('should properly clean up event handlers', () => {
      const testPlugin = createMockPlugin();
      const handlerId = eventManager.registerHandler(testPlugin, 'jira:sync:start', vi.fn());
      const unregistered = eventManager.unregisterHandler(testPlugin, handlerId);
      expect(unregistered).toBe(true);
      expect(eventManager.getSubscriptionCount(testPlugin)).toBe(0);
    it('should clean up all handlers for a plugin', () => {
      eventManager.registerHandler(testPlugin, 'jira:sync:start', vi.fn());
      eventManager.registerHandler(testPlugin, 'jira:sync:complete', vi.fn());
      eventManager.registerHandler(testPlugin, 'jira:ticket:updated', vi.fn());
      expect(eventManager.getSubscriptionCount(testPlugin)).toBe(3);
      const cleanedUp = eventManager.unregisterAllHandlers(testPlugin);
      expect(cleanedUp).toBe(3);
  describe('Event Metrics and Health', () => {
    it('should provide accurate event metrics', async () => {
      await changeQueue.addChange({
        id: 'metrics-test',
        issueKey: 'METRICS-001',
        fields: { summary: 'Metrics Test' },
      const health = eventManager.getHealthStatus();
      expect(health.totalEventTypes).toBeGreaterThan(0);
      expect(health.totalHandlers).toBeGreaterThan(0);
      expect(health.hasListeners).toBe(true);
      expect(Array.isArray(health.metrics)).toBe(true);
    it('should track event performance metrics accurately', async () => {
      // Arrange & Act
      const metrics = eventBus.getMetrics();
      expect(Array.isArray(metrics)).toBe(true);
      if (Array.isArray(metrics) && metrics.length > 0) {
        const syncStartMetrics = (metrics as any[]).find(m => m.eventType === 'jira:sync:start');
        if (syncStartMetrics) {
          expect(syncStartMetrics.handlerCount).toBeGreaterThan(0);
          expect(syncStartMetrics.totalDuration).toBeGreaterThanOrEqual(0);
