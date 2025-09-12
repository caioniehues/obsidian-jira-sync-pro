/**
 * Tests for DataviewSync Integration
 * RED-GREEN-Refactor approach with real event system integration
 * Tests event-driven frontmatter updates and batch processing performance
 */

import { describe, beforeEach, afterEach, it, expect, vi } from 'vitest';
import { DataviewSync } from '../../src/integrations/dataview-sync';
import { DataviewEventHandlers } from '../../src/events/dataview-event-handlers';
import { FrontmatterUpdater } from '../../src/utils/frontmatter-updater';
import { EventBus } from '../../src/events/event-bus';
import { JiraIssue } from '../../src/types/jira-types';
import { 
  JiraTicketCreatedEvent,
  JiraTicketUpdatedEvent,
  JiraTicketDeletedEvent
} from '../../src/events/event-types';
import { TFile, Vault } from 'obsidian';
import type { Mock, Mocked, MockedFunction } from 'vitest';
// Mock Obsidian APIs for testing
vi.mock('obsidian');
describe('DataviewSync Integration Tests', () => {
  let dataviewSync: DataviewSync;
  let eventHandlers: DataviewEventHandlers;
  let eventBus: EventBus;
  let mockVault: Mocked<Vault>;
  let mockFile: Mocked<TFile>;
  // Test data
  const sampleTicket: JiraIssue = {
    id: 'TEST-123-ID',
    key: 'TEST-123',
    self: 'https://test.atlassian.net/rest/api/2/issue/TEST-123',
    fields: {
      summary: 'Test ticket for Dataview sync',
      status: { name: 'In Progress', statusCategory: { key: 'indeterminate' } },
      priority: { name: 'High' },
      assignee: { displayName: 'John Doe' },
      reporter: { displayName: 'Jane Smith' },
      project: { key: 'TEST', name: 'Test Project' },
      issuetype: { name: 'Story' },
      created: '2023-01-01T10:00:00.000Z',
      updated: '2023-01-02T10:00:00.000Z',
      description: 'Test description for sync',
      labels: ['backend', 'sync'],
      components: [{ name: 'API' }, { name: 'Database' }],
      timetracking: {
        originalEstimateSeconds: 28800, // 8 hours
        timeSpentSeconds: 14400, // 4 hours  
        remainingEstimateSeconds: 14400 // 4 hours
      }
    }
  };
  beforeEach(() => {
    // Setup mock vault and file
    mockFile = {
      path: 'Areas/Work/Jira Tickets/TEST/TEST-123.md',
      basename: 'TEST-123',
      extension: 'md',
      name: 'TEST-123.md'
    } as Mocked<TFile>;
    mockVault = {
      getAbstractFileByPath: vi.fn().mockReturnValue(mockFile),
      read: vi.fn().mockResolvedValue('# TEST-123\n\nTest content'),
      modify: vi.fn().mockResolvedValue(undefined)
    } as unknown as Mocked<Vault>;
    // Initialize components
    eventBus = new EventBus();
    dataviewSync = new DataviewSync({
      batchSize: 10,
      batchDelay: 100,
      maxConcurrentUpdates: 3,
      performanceThreshold: 1000
    }, mockVault as Vault);
    
    eventHandlers = new DataviewEventHandlers(dataviewSync, {
      enableNotifications: false,
      logVerbose: false,
      trackPerformance: true
    });
    // Initialize event handlers
    dataviewSync.initialize();
    eventHandlers.initialize();
  });
  afterEach(async () => {
    // Clean up
    dataviewSync.destroy();
    eventHandlers.destroy();
    eventBus.removeAllListeners();
    // Flush any remaining batch operations
    await dataviewSync.flushBatch();
    vi.clearAllMocks();
  describe('Event-Driven Frontmatter Updates', () => {
    it('should fail initially without proper event integration', async () => {
      // RED: This test should fail because we haven't properly integrated the event system
      const ticketCreatedEvent: JiraTicketCreatedEvent = {
        timestamp: Date.now(),
        source: 'jira-plugin-bridge',
        eventId: 'test-event-1',
        type: 'jira:ticket:created',
        payload: {
          ticket: sampleTicket,
          filePath: mockFile.path,
          source: 'jira'
        }
      };
      // Emit event
      await eventBus.emit('jira:ticket:created', ticketCreatedEvent);
      
      // Wait for batch processing
      await new Promise(resolve => setTimeout(resolve, 200));
      await dataviewSync.flushBatch();
      // This should fail initially because FrontmatterUpdater needs proper Vault integration
      expect(mockVault.modify).toHaveBeenCalled();
    it('should handle ticket creation events with frontmatter updates', async () => {
      // GREEN: Make the test pass by properly mocking the vault operations
      const expectedFrontmatter = `---
jira_key: TEST-123
title: Test ticket for Dataview sync
status: In Progress
priority: High
assignee: John Doe
reporter: Jane Smith
project: TEST
type: Story
created: 2023-01-01
updated: 2023-01-02
description: Test description for sync
labels: [backend, sync]
components: [API, Database]
jira_id: TEST-123-ID
jira_self: https://test.atlassian.net/rest/api/2/issue/TEST-123
sync_timestamp: ${new Date().toISOString().split('T')[0]}
original_estimate_seconds: 28800
time_spent_seconds: 14400
remaining_estimate_seconds: 14400
completion_percent: 50
status_category: indeterminate
---
# TEST-123
Test content`;
      // Mock the vault to return content without frontmatter initially
      mockVault.read.mockResolvedValue('# TEST-123\n\nTest content');
      // Create the event
      // Emit the event
      // Wait for processing
      // Verify vault operations were called
      expect(mockVault.getAbstractFileByPath).toHaveBeenCalledWith(mockFile.path);
      expect(mockVault.read).toHaveBeenCalled();
      // Verify the content structure (we can't easily test exact content due to timestamp)
      const modifyCall = mockVault.modify.mock.calls[0];
      const [file, newContent] = modifyCall;
      expect(file).toBe(mockFile);
      expect(newContent).toContain('jira_key: TEST-123');
      expect(newContent).toContain('title: Test ticket for Dataview sync');
      expect(newContent).toContain('status: In Progress');
      expect(newContent).toContain('project: TEST');
    it('should handle ticket updates with changed fields tracking', async () => {
      // Setup existing content with frontmatter
      const existingContent = `---
title: Old title
status: To Do
priority: Medium
Existing content`;
      mockVault.read.mockResolvedValue(existingContent);
      // Create updated ticket data
      const updatedTicket = {
        ...sampleTicket,
        fields: {
          ...sampleTicket.fields,
          summary: 'Updated ticket title',
          status: { name: 'Done', statusCategory: { key: 'done' } },
          priority: { name: 'Critical' }
      const ticketUpdatedEvent: JiraTicketUpdatedEvent = {
        eventId: 'test-event-2',
        type: 'jira:ticket:updated',
          ticket: updatedTicket,
          previousData: { summary: 'Old title', status: 'To Do' },
          changedFields: ['summary', 'status', 'priority'],
      await eventBus.emit('jira:ticket:updated', ticketUpdatedEvent);
      // Verify update was called
      const [, newContent] = mockVault.modify.mock.calls[0];
      expect(newContent).toContain('title: Updated ticket title');
      expect(newContent).toContain('status: Done');
      expect(newContent).toContain('priority: Critical');
      expect(newContent).toContain('status_category: done');
    it('should handle ticket deletion by removing frontmatter properties', async () => {
title: Test ticket
custom_field: keep_this
Content to preserve`;
      const ticketDeletedEvent: JiraTicketDeletedEvent = {
        eventId: 'test-event-3',
        type: 'jira:ticket:deleted',
          ticketKey: 'TEST-123',
          lastKnownData: sampleTicket,
      await eventBus.emit('jira:ticket:deleted', ticketDeletedEvent);
      // Should preserve custom fields but remove Jira-specific ones
      expect(newContent).toContain('custom_field: keep_this');
      expect(newContent).not.toContain('jira_key:');
      expect(newContent).not.toContain('status: In Progress');
      expect(newContent).toContain('# TEST-123'); // Content preserved
  describe('Batch Processing Performance', () => {
    it('should process multiple events efficiently in batches', async () => {
      const startTime = performance.now();
      const eventPromises: Promise<void>[] = [];
      // Create 25 events (should trigger 3 batches with batchSize=10)
      for (let i = 1; i <= 25; i++) {
        const ticket = {
          ...sampleTicket,
          id: `TEST-${i}-ID`,
          key: `TEST-${i}`,
          fields: { ...sampleTicket.fields, summary: `Test ticket ${i}` }
        };
        const event: JiraTicketCreatedEvent = {
          timestamp: Date.now(),
          source: 'jira-plugin-bridge',
          eventId: `test-event-${i}`,
          type: 'jira:ticket:created',
          payload: {
            ticket,
            filePath: `Areas/Work/Jira Tickets/TEST/TEST-${i}.md`,
            source: 'jira'
          }
        eventPromises.push(eventBus.emit('jira:ticket:created', event));
      // Wait for all events to be emitted
      await Promise.all(eventPromises);
      // Wait for batch processing to complete
      await new Promise(resolve => setTimeout(resolve, 500));
      const duration = performance.now() - startTime;
      // Should process all 25 tickets in under 1 second (performance threshold)
      expect(duration).toBeLessThan(1000);
      // Should have called modify for each ticket
      expect(mockVault.modify).toHaveBeenCalledTimes(25);
    it('should handle 1000+ tickets within performance threshold', async () => {
      // Create a larger batch for performance testing
      const ticketCount = 1000;
      for (let i = 1; i <= ticketCount; i++) {
          id: `PERF-${i}-ID`,
          key: `PERF-${i}`
          eventId: `perf-event-${i}`,
            filePath: `Areas/Work/Jira Tickets/PERF/PERF-${i}.md`,
      await new Promise(resolve => setTimeout(resolve, 2000)); // Allow more time for processing
      // Should process 1000 tickets in under 5 seconds (requirement)
      expect(duration).toBeLessThan(5000);
      // Verify all tickets were processed
      expect(mockVault.modify).toHaveBeenCalledTimes(ticketCount);
    it('should maintain batch queue status correctly', async () => {
      // Initially empty
      let status = dataviewSync.getBatchStatus();
      expect(status.queueSize).toBe(0);
      expect(status.processing).toBe(false);
      // Add some events
      for (let i = 1; i <= 5; i++) {
          eventId: `status-event-${i}`,
            ticket: { ...sampleTicket, key: `STATUS-${i}` },
            filePath: `test-${i}.md`,
        await eventBus.emit('jira:ticket:created', event);
      // Should have items queued
      status = dataviewSync.getBatchStatus();
      expect(status.queueSize).toBeGreaterThan(0);
      // Process and verify cleanup
  describe('Event Handler Statistics', () => {
    it('should track processing statistics accurately', async () => {
      // Reset stats
      eventHandlers.resetStats();
      let initialStats = eventHandlers.getStats();
      expect(initialStats.totalEvents).toBe(0);
      expect(initialStats.successfulUpdates).toBe(0);
      // Process some events
      const eventPromises = [];
      for (let i = 1; i <= 10; i++) {
          eventId: `stats-event-${i}`,
            ticket: { ...sampleTicket, key: `STATS-${i}` },
            filePath: `stats-${i}.md`,
      await new Promise(resolve => setTimeout(resolve, 300));
      // Check final stats
      const finalStats = eventHandlers.getStats();
      expect(finalStats.totalEvents).toBe(10);
      expect(finalStats.successfulUpdates).toBe(10);
      expect(finalStats.failedUpdates).toBe(0);
      expect(finalStats.averageProcessingTime).toBeGreaterThan(0);
  describe('Error Handling', () => {
    it('should handle vault operation failures gracefully', async () => {
      // Make vault operations fail
      mockVault.modify.mockRejectedValue(new Error('Vault write failed'));
      const event: JiraTicketCreatedEvent = {
        eventId: 'error-event-1',
      // Should not throw error
      await expect(eventBus.emit('jira:ticket:created', event)).resolves.not.toThrow();
      // Error should be tracked in statistics
      const stats = eventHandlers.getStats();
      expect(stats.failedUpdates).toBeGreaterThan(0);
    it('should handle malformed ticket data gracefully', async () => {
      const malformedTicket = {
        fields: null // This should cause processing issues
        eventId: 'malformed-event-1',
          ticket: malformedTicket as JiraIssue,
      // Should handle gracefully without throwing
});
