import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { Plugin, TFile, Notice } from 'obsidian';
import { BulkImportManager } from '../../src/sync/bulk-import-manager';
import { JQLQueryEngine, JiraIssue } from '../../src/enhanced-sync/jql-query-engine';
import { BulkImportProgress, SyncPhase } from '../../src/models/bulk-import-progress';

// Mock Obsidian components
jest.mock('obsidian');

// Mock dependencies
jest.mock('../../src/enhanced-sync/jql-query-engine');
jest.mock('../../src/models/bulk-import-progress');

describe('BulkImportManager', () => {
  let mockPlugin: jest.Mocked<Plugin>;
  let mockQueryEngine: jest.Mocked<JQLQueryEngine>;
  let bulkImportManager: BulkImportManager;
  let mockNotice: jest.MockedClass<typeof Notice>;

  // Mock data factories
  const createMockJiraIssue = (key: string): JiraIssue => ({
    key,
    id: `id-${key}`,
    self: `https://test.atlassian.net/rest/api/3/issue/${key}`,
    fields: {
      summary: `Test Issue ${key}`,
      status: { name: 'Open' },
      assignee: { displayName: 'Test User' },
      priority: { name: 'Medium' },
      created: '2025-01-01T00:00:00.000Z',
      updated: '2025-01-02T00:00:00.000Z',
      description: `Description for ${key}`,
      issuetype: { name: 'Task' },
      project: { key: 'TEST', name: 'Test Project' },
      reporter: { displayName: 'Test Reporter' }
    }
  });

  const createMockQueryResult = (issues: JiraIssue[]) => ({
    issues,
    total: issues.length,
    truncated: false,
    errors: [],
    executionTime: 1000
  });

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Mock Plugin
    mockPlugin = {
      app: {
        vault: {
          getAbstractFileByPath: jest.fn(),
          createFolder: jest.fn(),
          create: jest.fn(),
          modify: jest.fn()
        }
      },
      loadData: jest.fn(),
      saveData: jest.fn()
    } as any;

    // Mock JQLQueryEngine
    mockQueryEngine = {
      executeQuery: jest.fn(),
      validateQuery: jest.fn()
    } as any;

    // Mock Notice
    mockNotice = Notice as jest.MockedClass<typeof Notice>;

    // Create manager instance
    bulkImportManager = new BulkImportManager(mockPlugin, mockQueryEngine, 'test-sync');
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('Initialization and Configuration', () => {
    it('should initialize with correct dependencies', () => {
      expect(bulkImportManager).toBeInstanceOf(BulkImportManager);
    });

    it('should prevent concurrent imports', async () => {
      // Setup mock query result
      const mockIssues = [createMockJiraIssue('TEST-1')];
      mockQueryEngine.executeQuery.mockResolvedValue(createMockQueryResult(mockIssues));
      mockPlugin.app.vault.getAbstractFileByPath.mockReturnValue(null);
      mockPlugin.app.vault.create.mockResolvedValue({} as TFile);

      // Start first import
      const firstImportPromise = bulkImportManager.startImport({
        jqlQuery: 'project = TEST'
      });

      // Try to start second import
      const secondImportResult = await bulkImportManager.startImport({
        jqlQuery: 'project = TEST2'
      });

      // Second import should be rejected
      expect(secondImportResult).toBeNull();
      expect(mockNotice).toHaveBeenCalledWith('Import already in progress');

      // Clean up first import
      await firstImportPromise;
    });
  });

  describe('Basic Import Operations', () => {
    beforeEach(() => {
      mockPlugin.app.vault.getAbstractFileByPath.mockReturnValue(null);
      mockPlugin.app.vault.create.mockResolvedValue({} as TFile);
    });

    it('should successfully import single ticket', async () => {
      const mockIssues = [createMockJiraIssue('TEST-1')];
      mockQueryEngine.executeQuery.mockResolvedValue(createMockQueryResult(mockIssues));

      const result = await bulkImportManager.startImport({
        jqlQuery: 'key = TEST-1'
      });

      expect(result).toBeDefined();
      expect(result!.totalImported).toBe(1);
      expect(result!.failedImports).toBe(0);
      expect(mockPlugin.app.vault.create).toHaveBeenCalledTimes(1);
    });

    it('should handle empty query result', async () => {
      mockQueryEngine.executeQuery.mockResolvedValue(createMockQueryResult([]));

      const result = await bulkImportManager.startImport({
        jqlQuery: 'project = EMPTY'
      });

      expect(result).toBeDefined();
      expect(result!.totalImported).toBe(0);
      expect(mockPlugin.app.vault.create).not.toHaveBeenCalled();
    });

    it('should process multiple tickets in batches', async () => {
      // Use real timers for this test to avoid timeout issues
      jest.useRealTimers();
      
      const mockIssues = Array.from({ length: 50 }, (_, i) => 
        createMockJiraIssue(`TEST-${i + 1}`)
      );
      mockQueryEngine.executeQuery.mockResolvedValue(createMockQueryResult(mockIssues));
      mockPlugin.app.vault.getAbstractFileByPath.mockReturnValue(null);
      mockPlugin.app.vault.create.mockResolvedValue({} as TFile);

      const result = await bulkImportManager.startImport({
        jqlQuery: 'project = TEST',
        batchSize: 25
      });

      expect(result).toBeDefined();
      expect(result!.totalImported).toBe(50);
      expect(result!.batches).toBe(2);
      expect(mockPlugin.app.vault.create).toHaveBeenCalledTimes(50);
      
      // Restore fake timers
      jest.useFakeTimers();
    }, 10000);
  });

  describe('Progress Tracking', () => {
    it('should report progress during import', async () => {
      jest.useRealTimers();
      const mockIssues = Array.from({ length: 10 }, (_, i) => 
        createMockJiraIssue(`TEST-${i + 1}`)
      );
      mockQueryEngine.executeQuery.mockResolvedValue(createMockQueryResult(mockIssues));
      mockPlugin.app.vault.getAbstractFileByPath.mockReturnValue(null);
      mockPlugin.app.vault.create.mockResolvedValue({} as TFile);

      const progressCallback = jest.fn();

      await bulkImportManager.startImport({
        jqlQuery: 'project = TEST',
        batchSize: 5,
        onProgress: progressCallback
      });

      // Progress should be reported multiple times
      expect(progressCallback).toHaveBeenCalled();
      
      // Check that different phases were reported
      const phases = progressCallback.mock.calls.map(call => call[0].phase);
      expect(phases).toContain(SyncPhase.INITIALIZING);
      expect(phases).toContain(SyncPhase.SEARCHING);
      expect(phases).toContain(SyncPhase.PROCESSING);
      expect(phases).toContain(SyncPhase.COMPLETE);
      
      jest.useFakeTimers();
    }, 10000);

    it('should update batch progress correctly', async () => {
      jest.useRealTimers();
      const mockIssues = Array.from({ length: 15 }, (_, i) => 
        createMockJiraIssue(`TEST-${i + 1}`)
      );
      mockQueryEngine.executeQuery.mockResolvedValue(createMockQueryResult(mockIssues));
      mockPlugin.app.vault.getAbstractFileByPath.mockReturnValue(null);
      mockPlugin.app.vault.create.mockResolvedValue({} as TFile);

      const progressCallback = jest.fn();

      await bulkImportManager.startImport({
        jqlQuery: 'project = TEST',
        batchSize: 5,
        onProgress: progressCallback
      });

      // Find processing phase calls
      const processingCalls = progressCallback.mock.calls.filter(
        call => call[0].phase === SyncPhase.PROCESSING
      );

      expect(processingCalls.length).toBeGreaterThan(0);
      
      // Check batch progression
      const lastProcessingCall = processingCalls[processingCalls.length - 1][0];
      expect(lastProcessingCall.currentBatch).toBeLessThanOrEqual(lastProcessingCall.totalBatches);
      expect(lastProcessingCall.totalBatches).toBe(3); // 15 tickets / 5 per batch
      
      jest.useFakeTimers();
    }, 10000);
  });

  describe('Error Handling and Recovery', () => {
    it('should handle ticket processing errors gracefully', async () => {
      const mockIssues = [
        createMockJiraIssue('TEST-1'),
        createMockJiraIssue('TEST-2')
      ];
      mockQueryEngine.executeQuery.mockResolvedValue(createMockQueryResult(mockIssues));
      
      // Mock first create to fail, second to succeed
      mockPlugin.app.vault.getAbstractFileByPath.mockReturnValue(null);
      mockPlugin.app.vault.create
        .mockRejectedValueOnce(new Error('File creation failed'))
        .mockResolvedValueOnce({} as TFile);

      const errorCallback = jest.fn();

      const result = await bulkImportManager.startImport({
        jqlQuery: 'project = TEST',
        onError: errorCallback
      });

      expect(result).toBeDefined();
      expect(result!.totalImported).toBe(1);
      expect(result!.failedImports).toBe(1);
      expect(errorCallback).toHaveBeenCalledWith('TEST-1', expect.any(String), 'processing');
    });

    it('should retry failed tickets with exponential backoff', async () => {
      const mockIssues = [createMockJiraIssue('TEST-1')];
      mockQueryEngine.executeQuery.mockResolvedValue(createMockQueryResult(mockIssues));
      
      mockPlugin.app.vault.getAbstractFileByPath.mockReturnValue(null);
      
      // Mock to fail twice then succeed (testing retry logic)
      mockPlugin.app.vault.create
        .mockRejectedValueOnce(new Error('Network timeout'))
        .mockRejectedValueOnce(new Error('Network timeout'))
        .mockResolvedValueOnce({} as TFile);

      const result = await bulkImportManager.startImport({
        jqlQuery: 'key = TEST-1'
      });

      expect(result).toBeDefined();
      expect(result!.totalImported).toBe(1);
      expect(result!.failedImports).toBe(0);
      expect(mockPlugin.app.vault.create).toHaveBeenCalledTimes(3);
    });

    it('should handle batch failures and provide recovery options', async () => {
      const mockIssues = Array.from({ length: 10 }, (_, i) => 
        createMockJiraIssue(`TEST-${i + 1}`)
      );
      mockQueryEngine.executeQuery.mockResolvedValue(createMockQueryResult(mockIssues));
      
      mockPlugin.app.vault.getAbstractFileByPath.mockReturnValue(null);
      
      // Mock most operations to fail (simulating high failure rate)
      mockPlugin.app.vault.create.mockRejectedValue(new Error('Validation failed'));

      const result = await bulkImportManager.startImport({
        jqlQuery: 'project = TEST',
        batchSize: 5
      });

      expect(result).toBeDefined();
      expect(result!.failedImports).toBe(10);
      expect(result!.errors.length).toBeGreaterThan(0);
    });
  });

  describe('Memory Management', () => {
    it('should monitor memory usage during import', async () => {
      const mockIssues = Array.from({ length: 100 }, (_, i) => 
        createMockJiraIssue(`TEST-${i + 1}`)
      );
      mockQueryEngine.executeQuery.mockResolvedValue(createMockQueryResult(mockIssues));
      mockPlugin.app.vault.getAbstractFileByPath.mockReturnValue(null);
      mockPlugin.app.vault.create.mockResolvedValue({} as TFile);

      const result = await bulkImportManager.startImport({
        jqlQuery: 'project = TEST',
        batchSize: 25,
        memoryLimit: 50 // 50MB limit
      });

      expect(result).toBeDefined();
      expect(result!.memoryPeak).toBeGreaterThanOrEqual(0);
    });

    it('should adapt batch size based on memory pressure', async () => {
      const mockIssues = Array.from({ length: 50 }, (_, i) => 
        createMockJiraIssue(`TEST-${i + 1}`)
      );
      mockQueryEngine.executeQuery.mockResolvedValue(createMockQueryResult(mockIssues));
      mockPlugin.app.vault.getAbstractFileByPath.mockReturnValue(null);
      mockPlugin.app.vault.create.mockResolvedValue({} as TFile);

      const progressCallback = jest.fn();

      await bulkImportManager.startImport({
        jqlQuery: 'project = TEST',
        batchSize: 25,
        memoryLimit: 10, // Very low limit to trigger adaptation
        onProgress: progressCallback
      });

      // Should have warnings about memory pressure and batch size reduction
      const progressWithWarnings = progressCallback.mock.calls.find(
        call => call[0].warnings && call[0].warnings.length > 0
      );
      
      expect(progressWithWarnings).toBeDefined();
    });
  });

  describe('Pause and Resume Operations', () => {
    it('should pause import and save state', async () => {
      const mockIssues = Array.from({ length: 25 }, (_, i) => 
        createMockJiraIssue(`TEST-${i + 1}`)
      );
      mockQueryEngine.executeQuery.mockResolvedValue(createMockQueryResult(mockIssues));
      mockPlugin.app.vault.getAbstractFileByPath.mockReturnValue(null);
      mockPlugin.app.vault.create.mockResolvedValue({} as TFile);
      mockPlugin.saveData.mockResolvedValue(undefined);

      // Start import and pause after some progress
      const importPromise = bulkImportManager.startImport({
        jqlQuery: 'project = TEST',
        batchSize: 5,
        enableResume: true
      });

      // Pause after a short delay
      setTimeout(() => {
        bulkImportManager.pauseImport();
      }, 10);

      const result = await importPromise;
      
      expect(mockPlugin.saveData).toHaveBeenCalled();
      expect(mockNotice).toHaveBeenCalledWith('Import paused - can be resumed later');
    });

    it('should resume import from saved state', async () => {
      // Mock saved state
      const savedState = {
        resumeToken: 'resume_batch_2_offset_10',
        jqlQuery: 'project = TEST',
        batchSize: 5,
        processedTicketIds: ['TEST-1', 'TEST-2', 'TEST-3'],
        timestamp: new Date().toISOString()
      };
      
      mockPlugin.loadData.mockResolvedValue({ bulkImportState: savedState });
      
      const remainingIssues = Array.from({ length: 5 }, (_, i) => 
        createMockJiraIssue(`TEST-${i + 4}`) // Starting from TEST-4
      );
      mockQueryEngine.executeQuery.mockResolvedValue(createMockQueryResult(remainingIssues));
      mockPlugin.app.vault.getAbstractFileByPath.mockReturnValue(null);
      mockPlugin.app.vault.create.mockResolvedValue({} as TFile);

      const result = await bulkImportManager.resumeImport();

      expect(result).toBeDefined();
      expect(result!.resumedFrom).toBe(savedState.resumeToken);
      expect(mockQueryEngine.executeQuery).toHaveBeenCalled();
      
      // Should have modified query to exclude already processed tickets
      const queryCall = mockQueryEngine.executeQuery.mock.calls[0][0];
      expect(queryCall.jql).toContain('NOT IN');
    });
  });

  describe('Cancellation', () => {
    it('should cancel import gracefully', async () => {
      const mockIssues = Array.from({ length: 50 }, (_, i) => 
        createMockJiraIssue(`TEST-${i + 1}`)
      );
      mockQueryEngine.executeQuery.mockResolvedValue(createMockQueryResult(mockIssues));
      mockPlugin.app.vault.getAbstractFileByPath.mockReturnValue(null);
      mockPlugin.app.vault.create.mockResolvedValue({} as TFile);

      // Start import and cancel after short delay
      const importPromise = bulkImportManager.startImport({
        jqlQuery: 'project = TEST',
        batchSize: 10
      });

      setTimeout(() => {
        bulkImportManager.cancelImport();
      }, 10);

      const result = await importPromise;

      expect(result).toBeDefined();
      expect(result!.cancelled).toBe(true);
      expect(result!.totalImported).toBeLessThan(50); // Should be partially completed
      expect(mockNotice).toHaveBeenCalledWith('Import cancellation requested');
    });

    it('should not allow cancellation during finalization phase', async () => {
      const mockIssues = [createMockJiraIssue('TEST-1')];
      mockQueryEngine.executeQuery.mockResolvedValue(createMockQueryResult(mockIssues));
      mockPlugin.app.vault.getAbstractFileByPath.mockReturnValue(null);
      mockPlugin.app.vault.create.mockResolvedValue({} as TFile);

      const progressCallback = jest.fn();

      await bulkImportManager.startImport({
        jqlQuery: 'key = TEST-1',
        onProgress: progressCallback
      });

      // Check that finalization phase had allowCancel = false
      const finalizingCall = progressCallback.mock.calls.find(
        call => call[0].phase === SyncPhase.FINALIZING
      );
      
      if (finalizingCall) {
        expect(finalizingCall[0].allowCancel).toBe(false);
      }
    });
  });

  describe('Performance Optimizations', () => {
    it('should use concurrent processing when memory allows', async () => {
      const mockIssues = Array.from({ length: 20 }, (_, i) => 
        createMockJiraIssue(`TEST-${i + 1}`)
      );
      mockQueryEngine.executeQuery.mockResolvedValue(createMockQueryResult(mockIssues));
      mockPlugin.app.vault.getAbstractFileByPath.mockReturnValue(null);
      mockPlugin.app.vault.create.mockResolvedValue({} as TFile);

      const startTime = Date.now();

      const result = await bulkImportManager.startImport({
        jqlQuery: 'project = TEST',
        batchSize: 10,
        maxConcurrency: 3,
        memoryLimit: 200 // High limit to allow concurrency
      });

      const duration = Date.now() - startTime;

      expect(result).toBeDefined();
      expect(result!.performanceMetrics.ticketsPerSecond).toBeGreaterThan(0);
      expect(duration).toBeLessThan(5000); // Should complete reasonably fast
    });

    it('should fall back to sequential processing under memory pressure', async () => {
      const mockIssues = Array.from({ length: 20 }, (_, i) => 
        createMockJiraIssue(`TEST-${i + 1}`)
      );
      mockQueryEngine.executeQuery.mockResolvedValue(createMockQueryResult(mockIssues));
      mockPlugin.app.vault.getAbstractFileByPath.mockReturnValue(null);
      mockPlugin.app.vault.create.mockResolvedValue({} as TFile);

      const result = await bulkImportManager.startImport({
        jqlQuery: 'project = TEST',
        batchSize: 10,
        maxConcurrency: 5,
        memoryLimit: 5 // Very low limit to force sequential processing
      });

      expect(result).toBeDefined();
      expect(result!.totalImported).toBe(20);
      // Performance should be lower but still functional
    });
  });

  describe('File Organization', () => {
    it('should organize files by project when enabled', async () => {
      const mockIssues = [
        createMockJiraIssue('PROJ1-1'),
        createMockJiraIssue('PROJ2-1')
      ];
      // Set different project keys
      mockIssues[0].fields.project = { key: 'PROJ1', name: 'Project 1' };
      mockIssues[1].fields.project = { key: 'PROJ2', name: 'Project 2' };
      
      mockQueryEngine.executeQuery.mockResolvedValue(createMockQueryResult(mockIssues));
      mockPlugin.app.vault.getAbstractFileByPath.mockReturnValue(null);
      mockPlugin.app.vault.create.mockResolvedValue({} as TFile);

      await bulkImportManager.startImport({
        jqlQuery: 'project in (PROJ1, PROJ2)',
        organizeByProject: true
      });

      expect(mockPlugin.app.vault.create).toHaveBeenCalledWith(
        expect.stringContaining('test-sync/PROJ1/PROJ1-1.md'),
        expect.any(String)
      );
      expect(mockPlugin.app.vault.create).toHaveBeenCalledWith(
        expect.stringContaining('test-sync/PROJ2/PROJ2-1.md'),
        expect.any(String)
      );
    });

    it('should skip existing files when skipExisting is enabled', async () => {
      const mockIssues = [
        createMockJiraIssue('TEST-1'),
        createMockJiraIssue('TEST-2')
      ];
      mockQueryEngine.executeQuery.mockResolvedValue(createMockQueryResult(mockIssues));
      
      // Mock first file exists, second doesn't
      mockPlugin.app.vault.getAbstractFileByPath
        .mockReturnValueOnce({} as TFile) // TEST-1 exists
        .mockReturnValueOnce(null); // TEST-2 doesn't exist
      mockPlugin.app.vault.create.mockResolvedValue({} as TFile);

      const result = await bulkImportManager.startImport({
        jqlQuery: 'project = TEST',
        skipExisting: true
      });

      expect(result).toBeDefined();
      expect(result!.totalImported).toBe(1); // Only TEST-2 imported
      expect(result!.skipped).toBe(1); // TEST-1 skipped
      expect(mockPlugin.app.vault.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('Content Generation', () => {
    it('should generate enhanced note content with metadata', async () => {
      const mockIssue = createMockJiraIssue('TEST-1');
      mockIssue.fields.description = 'Test description with details';
      
      mockQueryEngine.executeQuery.mockResolvedValue(createMockQueryResult([mockIssue]));
      mockPlugin.app.vault.getAbstractFileByPath.mockReturnValue(null);
      mockPlugin.app.vault.create.mockResolvedValue({} as TFile);

      await bulkImportManager.startImport({
        jqlQuery: 'key = TEST-1'
      });

      const createCall = mockPlugin.app.vault.create.mock.calls[0];
      const content = createCall[1] as string;

      // Check frontmatter
      expect(content).toContain('jira-key: TEST-1');
      expect(content).toContain('sync-version: 2.0');
      expect(content).toContain('import-date:');
      
      // Check content structure
      expect(content).toContain('# TEST-1: Test Issue TEST-1');
      expect(content).toContain('## Description');
      expect(content).toContain('Test description with details');
      expect(content).toContain('## Details');
      expect(content).toContain('**Status**: Open');
    });
  });
});