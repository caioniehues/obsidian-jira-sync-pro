/**
 * Integration Test: Basic Auto-Sync Setup
 * 
 * Tests the complete flow from configuration to auto-sync execution.
 * Maps to Scenario 1 from quickstart.md: Basic Auto-Sync Setup
 * 
 * CRITICAL TDD: This test MUST FAIL initially and only pass once the
 * complete auto-sync feature is implemented.
 * 
 * Test Flow:
 * 1. Configure auto-sync with JQL query
 * 2. Validate JQL query execution
 * 3. Test query to verify results
 * 4. Save configuration
 * 5. Wait for auto-sync trigger (1 minute interval)
 * 6. Verify vault files created with correct content
 * 7. Verify sync status updates
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import {
  createTestSuite,
  waitFor,
  waitForCalls,
  createDeferred,
  createMockRequestUrl,
  MockFileSystem,
  RetryTester,
  assertions
} from '../utils/test-helpers';

// Import the modules that need to be implemented
import { AutoSyncScheduler, AutoSyncConfig, SyncState } from '../../src/enhanced-sync/auto-sync-scheduler';
import { JQLQueryEngine, JQLSearchResult, JiraIssue } from '../../src/enhanced-sync/jql-query-engine';
import { BulkImportManager, ImportProgress } from '../../src/enhanced-sync/bulk-import-manager';
import { SyncStatusDashboard, SyncStatus } from '../../src/enhanced-sync/sync-status-dashboard';
import { JiraClient } from '../../src/jira-bases-adapter/jira-client';
import { Plugin, App, Vault, TFile, Notice } from '../__mocks__/obsidian';

describe('Integration: Basic Auto-Sync Setup (Scenario 1)', () => {
  const testSuite = createTestSuite('BasicAutoSync');
  const { mockTimer, testEnv, mockFs } = testSuite;

  // Core components (should fail initially due to missing implementations)
  let mockApp: App;
  let mockPlugin: Plugin;
  let mockVault: Vault;
  let mockJiraClient: jest.Mocked<JiraClient>;
  let autoSyncScheduler: AutoSyncScheduler;
  let jqlQueryEngine: JQLQueryEngine;
  let bulkImportManager: BulkImportManager;
  let syncStatusDashboard: SyncStatusDashboard;

  // Test data matching quickstart scenario
  const testJQLQuery = 'assignee = currentUser() AND status NOT IN (Done, Closed)';
  const testSyncInterval = 1; // 1 minute for testing
  const mockRequestUrl = createMockRequestUrl();

  // Mock Jira issues that should be returned by the test query
  const mockJiraIssues: JiraIssue[] = [
    {
      key: 'TEST-123',
      id: '10001',
      fields: {
        summary: 'Implement user authentication',
        status: { name: 'In Progress', id: '3' },
        assignee: { displayName: 'Test User', emailAddress: 'test@example.com' },
        reporter: { displayName: 'Product Owner', emailAddress: 'po@example.com' },
        description: 'Create secure authentication system with JWT tokens',
        priority: { name: 'High', id: '2' },
        issuetype: { name: 'Story', id: '10001' },
        project: { key: 'TEST', name: 'Test Project' },
        created: '2025-09-01T10:00:00.000Z',
        updated: '2025-09-10T14:30:00.000Z'
      }
    },
    {
      key: 'TEST-124',
      id: '10002',
      fields: {
        summary: 'Design user dashboard',
        status: { name: 'To Do', id: '1' },
        assignee: { displayName: 'Test User', emailAddress: 'test@example.com' },
        reporter: { displayName: 'UX Designer', emailAddress: 'ux@example.com' },
        description: 'Create responsive dashboard with key metrics',
        priority: { name: 'Medium', id: '3' },
        issuetype: { name: 'Task', id: '10002' },
        project: { key: 'TEST', name: 'Test Project' },
        created: '2025-09-02T09:15:00.000Z',
        updated: '2025-09-10T11:45:00.000Z'
      }
    },
    {
      key: 'TEST-125',
      id: '10003',
      fields: {
        summary: 'Fix login validation bug',
        status: { name: 'In Review', id: '4' },
        assignee: { displayName: 'Test User', emailAddress: 'test@example.com' },
        reporter: { displayName: 'QA Tester', emailAddress: 'qa@example.com' },
        description: 'Login form not validating email format correctly',
        priority: { name: 'High', id: '2' },
        issuetype: { name: 'Bug', id: '10003' },
        project: { key: 'TEST', name: 'Test Project' },
        created: '2025-09-09T16:20:00.000Z',
        updated: '2025-09-10T13:10:00.000Z'
      }
    }
  ];

  // Expected markdown content for ticket files
  const expectedMarkdownFiles = [
    {
      path: 'JIRA/TEST-123.md',
      content: `# TEST-123: Implement user authentication

**Status**: In Progress  
**Assignee**: Test User  
**Priority**: High  
**Type**: Story  

## Description
Create secure authentication system with JWT tokens

## Details
- **Reporter**: Product Owner
- **Project**: TEST - Test Project
- **Created**: 2025-09-01T10:00:00.000Z
- **Updated**: 2025-09-10T14:30:00.000Z

## Links
- [View in Jira](https://test-instance.atlassian.net/browse/TEST-123)

---
*Last synced: ${new Date().toISOString()}*`
    },
    {
      path: 'JIRA/TEST-124.md',
      content: `# TEST-124: Design user dashboard

**Status**: To Do  
**Assignee**: Test User  
**Priority**: Medium  
**Type**: Task  

## Description
Create responsive dashboard with key metrics

## Details
- **Reporter**: UX Designer
- **Project**: TEST - Test Project
- **Created**: 2025-09-02T09:15:00.000Z
- **Updated**: 2025-09-10T11:45:00.000Z

## Links
- [View in Jira](https://test-instance.atlassian.net/browse/TEST-124)

---
*Last synced: ${new Date().toISOString()}*`
    },
    {
      path: 'JIRA/TEST-125.md',
      content: `# TEST-125: Fix login validation bug

**Status**: In Review  
**Assignee**: Test User  
**Priority**: High  
**Type**: Bug  

## Description
Login form not validating email format correctly

## Details
- **Reporter**: QA Tester
- **Project**: TEST - Test Project
- **Created**: 2025-09-09T16:20:00.000Z
- **Updated**: 2025-09-10T13:10:00.000Z

## Links
- [View in Jira](https://test-instance.atlassian.net/browse/TEST-125)

---
*Last synced: ${new Date().toISOString()}*`
    }
  ];

  beforeEach(() => {
    testSuite.beforeEach();

    // Setup mock Obsidian environment
    mockApp = new App();
    mockVault = mockApp.vault;
    mockPlugin = new Plugin(mockApp, { id: 'jira-sync-pro', name: 'Jira Sync Pro' });

    // Mock plugin data persistence
    let savedPluginData: any = {};
    mockPlugin.loadData = jest.fn().mockResolvedValue(savedPluginData);
    mockPlugin.saveData = jest.fn().mockImplementation(async (data) => {
      savedPluginData = { ...savedPluginData, ...data };
    });

    // Setup mock Jira client
    mockJiraClient = {
      searchIssues: jest.fn(),
      testConnection: jest.fn(),
      validateJQLQuery: jest.fn(),
      getServerInfo: jest.fn(),
    } as any;

    // Mock successful Jira responses
    mockJiraClient.searchIssues.mockResolvedValue({
      total: mockJiraIssues.length,
      issues: mockJiraIssues,
      nextPageToken: null
    } as JQLSearchResult);

    mockJiraClient.validateJQLQuery.mockResolvedValue({
      isValid: true,
      errorMessage: null,
      estimatedCount: mockJiraIssues.length
    });

    mockJiraClient.testConnection.mockResolvedValue({ success: true });

    // Mock vault operations for file creation
    jest.spyOn(mockVault, 'create').mockImplementation(async (path: string, content: string) => {
      mockFs.createFile(path, content);
      return new TFile(path);
    });

    jest.spyOn(mockVault, 'getAbstractFileByPath').mockImplementation((path: string) => {
      return mockFs.fileExists(path) ? new TFile(path) : null;
    });

    jest.spyOn(mockVault, 'modify').mockImplementation(async (file: TFile, content: string) => {
      mockFs.createFile(file.path, content);
    });

    // Clear all mocks
    jest.clearAllMocks();
  });

  afterEach(() => {
    if (autoSyncScheduler) {
      autoSyncScheduler.stop();
    }
    testSuite.afterEach();
  });

  /**
   * CRITICAL: This test MUST FAIL initially (TDD requirement)
   * It will only pass once the complete auto-sync feature is implemented
   */
  describe('Complete Auto-Sync Flow', () => {
    it('should configure, validate, and execute auto-sync with JQL query', async () => {
      // Step 1: Initialize components (should fail if not implemented)
      expect(() => {
        jqlQueryEngine = new JQLQueryEngine(mockJiraClient);
        bulkImportManager = new BulkImportManager(mockJiraClient, mockVault);
        syncStatusDashboard = new SyncStatusDashboard();
        
        const autoSyncConfig: AutoSyncConfig = {
          enabled: true,
          jqlQuery: testJQLQuery,
          syncInterval: testSyncInterval,
          maxResults: 1000,
          batchSize: 50
        };

        autoSyncScheduler = new AutoSyncScheduler(
          mockPlugin,
          jqlQueryEngine,
          autoSyncConfig,
          async (options) => {
            // This callback should sync issues to vault
            const searchResult = await jqlQueryEngine.executeQuery({
              jql: testJQLQuery,
              maxResults: 1000,
              batchSize: 50
            });
            
            for (const issue of searchResult.issues) {
              const markdownContent = await generateMarkdownContent(issue);
              const filePath = `JIRA/${issue.key}.md`;
              
              const existingFile = mockVault.getAbstractFileByPath(filePath);
              if (existingFile) {
                await mockVault.modify(existingFile as TFile, markdownContent);
              } else {
                await mockVault.create(filePath, markdownContent);
              }
            }
          }
        );
      }).not.toThrow('Auto-sync components should be implementable');

      // Step 2: Validate JQL query (Test Query button functionality)
      const validationResult = await jqlQueryEngine.validateQuery(testJQLQuery);
      
      expect(validationResult).toBe(true);
      
      // Verify JQL validation was called with correct parameters  
      expect(mockJiraClient.searchIssues).toHaveBeenCalledWith({
        jql: testJQLQuery,
        maxResults: 0,
        validateQuery: true
      });

      // Step 3: Execute test query to verify results
      const testQueryResult = await jqlQueryEngine.executeQuery({
        jql: testJQLQuery,
        maxResults: 100,
        batchSize: 50
      });
      
      expect(testQueryResult).toBeDefined();
      expect(testQueryResult.total).toBe(mockJiraIssues.length);
      expect(testQueryResult.issues).toHaveLength(mockJiraIssues.length);
      expect(testQueryResult.issues[0].key).toBe('TEST-123');
      expect(testQueryResult.issues[0].fields.summary).toBe('Implement user authentication');

      // Step 4: Save configuration (should persist to plugin data)
      await autoSyncScheduler.saveState();
      
      expect(mockPlugin.saveData).toHaveBeenCalledWith({
        syncState: expect.objectContaining({
          lastSyncTime: null, // No sync yet
          totalSyncCount: 0,
          failureCount: 0
        })
      });

      // Step 5: Start auto-sync scheduler (should trigger immediate sync)
      await autoSyncScheduler.start();
      
      expect(autoSyncScheduler.isRunning()).toBe(true);
      
      // Verify immediate sync executed
      expect(mockJiraClient.searchIssues).toHaveBeenCalledWith(
        testJQLQuery,
        expect.objectContaining({
          maxResults: 1000,
          startAt: 0
        })
      );

      // Step 6: Verify vault files created with correct content
      await waitFor(() => mockFs.getAllFiles().hasOwnProperty('JIRA/TEST-123.md'), {
        timeout: 5000,
        timeoutMessage: 'Timeout waiting for ticket files to be created'
      });

      const createdFiles = mockFs.getAllFiles();
      expect(Object.keys(createdFiles)).toHaveLength(mockJiraIssues.length);
      
      // Verify each expected file was created with correct content
      for (const expectedFile of expectedMarkdownFiles) {
        expect(createdFiles).toHaveProperty(expectedFile.path);
        
        const actualContent = createdFiles[expectedFile.path];
        expect(actualContent).toContain('TEST-');
        expect(actualContent).toContain('**Status**:');
        expect(actualContent).toContain('**Assignee**: Test User');
        expect(actualContent).toContain('[View in Jira]');
        expect(actualContent).toContain('Last synced:');
      }

      // Step 7: Wait for automatic sync trigger (1 minute interval)
      mockJiraClient.searchIssues.mockClear();
      
      // Advance timer by 1 minute to trigger next sync
      mockTimer.advanceTime(1 * 60 * 1000);
      
      // Verify auto-sync triggered
      await waitForCalls(mockJiraClient.searchIssues, 1, 2000);
      
      expect(mockJiraClient.searchIssues).toHaveBeenCalledTimes(1);
      expect(mockJiraClient.searchIssues).toHaveBeenCalledWith(
        testJQLQuery,
        expect.objectContaining({
          maxResults: 1000
        })
      );

      // Step 8: Verify sync status updates
      const syncStats = autoSyncScheduler.getStatistics();
      expect(syncStats.totalSyncs).toBeGreaterThanOrEqual(2); // Initial + auto sync
      expect(syncStats.successfulSyncs).toBeGreaterThanOrEqual(2);
      expect(syncStats.failedSyncs).toBe(0);
      expect(syncStats.lastSyncTime).toBeDefined();
      expect(syncStats.currentStatus).toBe('idle');

      // Step 9: Verify sync state persistence
      expect(mockPlugin.saveData).toHaveBeenCalledWith({
        syncState: expect.objectContaining({
          lastSyncStatus: 'success',
          totalSyncCount: expect.any(Number),
          successfulSyncCount: expect.any(Number),
          lastSyncTime: expect.any(String)
        })
      });

      // Step 10: Verify no error messages or console warnings
      const mockConsole = testEnv.getMockConsole();
      expect(mockConsole.error).not.toHaveBeenCalled();
      
      // Success criteria verification
      expect(autoSyncScheduler.isRunning()).toBe(true);
      expect(syncStats.currentStatus).not.toBe('error');
      expect(Object.keys(createdFiles)).toHaveLength(mockJiraIssues.length);
    }, 30000); // 30 second timeout for complete flow

    it('should handle JQL query validation errors', async () => {
      const invalidQuery = 'INVALID JQL SYNTAX';
      
      // Mock validation failure
      mockJiraClient.searchIssues.mockRejectedValue(new Error('Invalid JQL syntax near INVALID'));

      // This should fail if JQLQueryEngine is not implemented
      jqlQueryEngine = new JQLQueryEngine(mockJiraClient);
      
      const validationResult = await jqlQueryEngine.validateQuery(invalidQuery);
      
      expect(validationResult).toBe(false);
    });

    it('should handle network errors during sync with retry', async () => {
      // Setup auto-sync scheduler
      jqlQueryEngine = new JQLQueryEngine(mockJiraClient);
      
      const config: AutoSyncConfig = {
        enabled: true,
        jqlQuery: testJQLQuery,
        syncInterval: testSyncInterval,
        maxResults: 1000,
        batchSize: 50
      };

      let syncCallCount = 0;
      autoSyncScheduler = new AutoSyncScheduler(
        mockPlugin,
        jqlQueryEngine,
        config,
        async () => {
          syncCallCount++;
          if (syncCallCount <= 2) {
            throw new Error('Network error: Connection timeout');
          }
          // Succeed on third attempt
          return;
        }
      );

      // Mock network errors, then success
      mockJiraClient.searchIssues
        .mockRejectedValueOnce(new Error('Network error: Connection timeout'))
        .mockRejectedValueOnce(new Error('Network error: Connection timeout'))
        .mockResolvedValue({
          total: mockJiraIssues.length,
          issues: mockJiraIssues,
          nextPageToken: null
        } as JQLSearchResult);

      await autoSyncScheduler.start();
      
      // Should have failed initially
      expect(autoSyncScheduler.getFailureCount()).toBeGreaterThan(0);
      expect(autoSyncScheduler.getStatistics().currentStatus).toBe('error');

      // Wait for retry with exponential backoff
      mockTimer.advanceTime(60 * 1000); // 1 minute retry delay
      
      // Should still be in failure state after first retry
      expect(autoSyncScheduler.getFailureCount()).toBe(2);
      
      // Wait for second retry
      mockTimer.advanceTime(120 * 1000); // 2 minute retry delay
      
      // Should recover after successful third attempt
      await waitFor(() => autoSyncScheduler.getFailureCount() === 0, {
        timeout: 5000,
        timeoutMessage: 'Auto-sync should have recovered after retries'
      });

      const stats = autoSyncScheduler.getStatistics();
      expect(stats.currentStatus).toBe('idle');
      expect(stats.failedSyncs).toBe(2); // Two failed attempts
      expect(stats.successfulSyncs).toBe(1); // One successful recovery
    });

    it('should prevent concurrent syncs and handle manual trigger', async () => {
      // Setup components
      jqlQueryEngine = new JQLQueryEngine(mockJiraClient);
      
      const config: AutoSyncConfig = {
        enabled: true,
        jqlQuery: testJQLQuery,
        syncInterval: 5, // 5 minutes
        maxResults: 1000,
        batchSize: 50
      };

      // Create slow sync operation
      const syncDeferred = createDeferred<void>();
      let syncCallCount = 0;
      
      autoSyncScheduler = new AutoSyncScheduler(
        mockPlugin,
        jqlQueryEngine,
        config,
        async (options) => {
          syncCallCount++;
          if (syncCallCount === 1) {
            // First call (initial sync) - make it slow
            await syncDeferred.promise;
          }
          // Subsequent calls complete immediately
        }
      );

      // Start scheduler (triggers initial slow sync)
      await autoSyncScheduler.start();
      expect(autoSyncScheduler.getStatistics().currentStatus).toBe('syncing');

      // Try to trigger manual sync while initial sync is running
      await autoSyncScheduler.triggerManualSync();
      
      // Should still be in syncing state, no additional sync should start
      expect(syncCallCount).toBe(1); // Only initial sync
      expect(autoSyncScheduler.getStatistics().currentStatus).toBe('syncing');

      // Resolve the slow sync
      syncDeferred.resolve();
      
      // Wait for sync to complete
      await waitFor(() => autoSyncScheduler.getStatistics().currentStatus === 'idle');
      
      // Now manual sync should work
      await autoSyncScheduler.triggerManualSync();
      expect(syncCallCount).toBe(2); // Initial + manual sync
    });
  });

  describe('Success Criteria Validation (from quickstart.md)', () => {
    beforeEach(async () => {
      // Setup complete auto-sync system
      jqlQueryEngine = new JQLQueryEngine(mockJiraClient);
      bulkImportManager = new BulkImportManager(mockJiraClient, mockVault);
      syncStatusDashboard = new SyncStatusDashboard();
      
      const config: AutoSyncConfig = {
        enabled: true,
        jqlQuery: testJQLQuery,
        syncInterval: testSyncInterval,
        maxResults: 1000,
        batchSize: 50
      };

      autoSyncScheduler = new AutoSyncScheduler(
        mockPlugin,
        jqlQueryEngine,
        config,
        async () => {
          const result = await jqlQueryEngine.executeQuery({
            jql: testJQLQuery,
            maxResults: 1000,
            batchSize: 50
          });
          for (const issue of result.issues) {
            const content = await generateMarkdownContent(issue);
            await mockVault.create(`JIRA/${issue.key}.md`, content);
          }
        }
      );
    });

    it('✅ JQL query validates successfully', async () => {
      const result = await jqlQueryEngine.validateQuery(testJQLQuery);
      expect(result).toBe(true);
    });

    it('✅ Test query returns expected ticket count', async () => {
      const result = await jqlQueryEngine.executeQuery({
        jql: testJQLQuery,
        maxResults: 100,
        batchSize: 50
      });
      expect(result.total).toBe(mockJiraIssues.length);
      expect(result.issues).toHaveLength(mockJiraIssues.length);
    });

    it('✅ Configuration saves without errors', async () => {
      await expect(autoSyncScheduler.saveState()).resolves.not.toThrow();
      expect(mockPlugin.saveData).toHaveBeenCalled();
    });

    it('✅ Auto-sync triggers after 1 minute', async () => {
      await autoSyncScheduler.start();
      mockJiraClient.searchIssues.mockClear();
      
      mockTimer.advanceTime(1 * 60 * 1000); // 1 minute
      
      await waitForCalls(mockJiraClient.searchIssues, 1, 2000);
      expect(mockJiraClient.searchIssues).toHaveBeenCalled();
    });

    it('✅ Matching tickets appear in vault as markdown files', async () => {
      await autoSyncScheduler.start();
      
      await waitFor(() => Object.keys(mockFs.getAllFiles()).length === mockJiraIssues.length, {
        timeout: 5000,
        timeoutMessage: 'Timeout waiting for all ticket files to be created'
      });

      const files = mockFs.getAllFiles();
      expect(files).toHaveProperty('JIRA/TEST-123.md');
      expect(files).toHaveProperty('JIRA/TEST-124.md');
      expect(files).toHaveProperty('JIRA/TEST-125.md');
    });

    it('✅ Files contain correct issue metadata (summary, status, assignee)', async () => {
      await autoSyncScheduler.start();
      
      await waitFor(() => mockFs.fileExists('JIRA/TEST-123.md'));
      
      const testFile = mockFs.getFileContent('JIRA/TEST-123.md');
      expect(testFile).toContain('# TEST-123: Implement user authentication');
      expect(testFile).toContain('**Status**: In Progress');
      expect(testFile).toContain('**Assignee**: Test User');
      expect(testFile).toContain('**Priority**: High');
      expect(testFile).toContain('**Type**: Story');
    });

    it('should show correct sync status and timestamps', async () => {
      const beforeSync = new Date();
      
      await autoSyncScheduler.start();
      
      const stats = autoSyncScheduler.getStatistics();
      expect(stats.lastSyncTime).toBeDefined();
      
      const lastSyncTime = new Date(stats.lastSyncTime!);
      expect(lastSyncTime.getTime()).toBeGreaterThanOrEqual(beforeSync.getTime());
    });

    it('should handle no error messages in console or UI', async () => {
      await autoSyncScheduler.start();
      
      // Advance through a complete sync cycle
      mockTimer.advanceTime(2 * 60 * 1000); // 2 minutes
      
      const mockConsole = testEnv.getMockConsole();
      expect(mockConsole.error).not.toHaveBeenCalled();
      
      const stats = autoSyncScheduler.getStatistics();
      expect(stats.currentStatus).not.toBe('error');
      expect(stats.failedSyncs).toBe(0);
    });
  });

  describe('Performance Requirements Validation', () => {
    it('should sync 100 tickets in < 30 seconds', async () => {
      // Create 100 mock tickets
      const manyTickets: JiraIssue[] = Array.from({ length: 100 }, (_, i) => ({
        key: `PERF-${i + 1}`,
        id: `${10000 + i}`,
        fields: {
          summary: `Performance test ticket ${i + 1}`,
          status: { name: 'To Do', id: '1' },
          assignee: { displayName: 'Test User', emailAddress: 'test@example.com' },
          reporter: { displayName: 'Test Reporter', emailAddress: 'reporter@example.com' },
          description: `Description for ticket ${i + 1}`,
          priority: { name: 'Medium', id: '3' },
          issuetype: { name: 'Task', id: '10001' },
          project: { key: 'PERF', name: 'Performance Test' },
          created: '2025-09-01T10:00:00.000Z',
          updated: '2025-09-10T14:30:00.000Z'
        }
      }));

      mockJiraClient.searchIssues.mockResolvedValue({
        total: manyTickets.length,
        issues: manyTickets,
        nextPageToken: null
      });

      // Setup scheduler
      jqlQueryEngine = new JQLQueryEngine(mockJiraClient);
      const config: AutoSyncConfig = {
        enabled: true,
        jqlQuery: 'project = PERF',
        syncInterval: 5,
        maxResults: 1000,
        batchSize: 50
      };

      autoSyncScheduler = new AutoSyncScheduler(
        mockPlugin,
        jqlQueryEngine,
        config,
        async () => {
          const result = await jqlQueryEngine.executeQuery(config.jqlQuery, { maxResults: 1000 });
          for (const issue of result.issues) {
            const content = await generateMarkdownContent(issue);
            await mockVault.create(`JIRA/${issue.key}.md`, content);
          }
        }
      );

      const startTime = Date.now();
      await autoSyncScheduler.start();
      
      // Wait for all files to be created
      await waitFor(() => Object.keys(mockFs.getAllFiles()).length === 100, {
        timeout: 30000,
        timeoutMessage: 'Performance requirement: 100 tickets should sync in < 30 seconds'
      });

      const endTime = Date.now();
      const duration = endTime - startTime;
      
      expect(duration).toBeLessThan(30000); // Less than 30 seconds
      expect(Object.keys(mockFs.getAllFiles())).toHaveLength(100);
    }, 35000);

    it('should remain responsive during sync operations', async () => {
      // This tests that sync operations don't block the main thread
      jqlQueryEngine = new JQLQueryEngine(mockJiraClient);
      const config: AutoSyncConfig = {
        enabled: true,
        jqlQuery: testJQLQuery,
        syncInterval: testSyncInterval,
        maxResults: 1000,
        batchSize: 50
      };

      let syncInProgress = false;
      autoSyncScheduler = new AutoSyncScheduler(
        mockPlugin,
        jqlQueryEngine,
        config,
        async () => {
          syncInProgress = true;
          const result = await jqlQueryEngine.executeQuery({
            jql: testJQLQuery,
            maxResults: 1000,
            batchSize: 50
          });
          // Simulate some processing time
          await new Promise(resolve => setTimeout(resolve, 100));
          syncInProgress = false;
        }
      );

      await autoSyncScheduler.start();
      
      // Verify we can perform other operations while sync is running
      expect(syncInProgress).toBe(false); // Should complete quickly
      expect(autoSyncScheduler.isRunning()).toBe(true);
      expect(autoSyncScheduler.getStatistics().currentStatus).toBe('idle');
    });
  });
});

/**
 * Helper function to generate markdown content from Jira issue
 * This should match the expected format from the quickstart scenario
 */
async function generateMarkdownContent(issue: JiraIssue): Promise<string> {
  const { key, fields } = issue;
  const { summary, status, assignee, reporter, description, priority, issuetype, project, created, updated } = fields;
  
  return `# ${key}: ${summary}

**Status**: ${status.name}  
**Assignee**: ${assignee?.displayName || 'Unassigned'}  
**Priority**: ${priority.name}  
**Type**: ${issuetype.name}  

## Description
${description || 'No description provided'}

## Details
- **Reporter**: ${reporter?.displayName || 'Unknown'}
- **Project**: ${project.key} - ${project.name}
- **Created**: ${created}
- **Updated**: ${updated}

## Links
- [View in Jira](https://test-instance.atlassian.net/browse/${key})

---
*Last synced: ${new Date().toISOString()}*`;
}