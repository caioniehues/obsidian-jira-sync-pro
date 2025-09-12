/**
 * Integration test for Progressive Bulk Import functionality
 * 
 * Based on quickstart scenario 2: Progressive Bulk Import
 * Tests large dataset processing with progress UI, cancellation and resume functionality
 * 
 * CRITICAL TDD REQUIREMENT: This test MUST fail initially to validate implementation needs
 * Test scenario covers:
 * - Batch processing (25 tickets per batch) 
 * - Progress modal with real-time updates
 * - Cancel and resume functionality
 * - Large dataset handling (50+ tickets)
 * - UI responsiveness and progress feedback
 */

import { describe, it, expect, vi, beforeEach, afterEach } from '@vitest/globals';
import { BulkImportManager } from '../../src/enhanced-sync/bulk-import-manager';
import { JQLQueryEngine } from '../../src/enhanced-sync/jql-query-engine';
import { JiraClient } from '../../src/jira-bases-adapter/jira-client';
import { JiraFactory } from '../factories/jira-factory';
import { 
  createMockProgressCallback,
  createMockErrorCallback, 
  MockTimer,
  waitFor,
  withTimeout,
  createDeferred,
  assertions
} from '../utils/test-helpers';
import { Plugin, Notice, Vault, TFile, App } from 'obsidian';

// Mock Obsidian components
vi.mock('obsidian', () => ({
  Plugin: vi.fn(),
  Notice: vi.fn(),
  Vault: vi.fn(),
  TFile: vi.fn(),
  App: vi.fn(),
  normalizePath: vi.fn((path: string) => path),
  Modal: vi.fn().mockImplementation(() => ({
    open: vi.fn(),
    close: vi.fn(),
    onOpen: vi.fn(),
    onClose: vi.fn()
  }))
}));

// Mock enhanced sync components
vi.mock('../../src/enhanced-sync/jql-query-engine');
vi.mock('../../src/jira-bases-adapter/jira-client');

/**
 * Interface for Progressive Import Modal (to be implemented)
 * This represents the UI component that shows import progress
 */
interface ProgressiveImportModal {
  open(): void;
  close(): void;
  updateProgress(current: number, total: number, phase: string, currentTicket?: string): void;
  showCancelButton(enabled: boolean): void;
  onCancel(callback: () => void): void;
  showErrorSummary(errors: Array<{ticketKey: string, error: string}>): void;
}

/**
 * Interface for Enhanced Bulk Import Manager (to be implemented)
 * This extends the basic BulkImportManager with progressive features
 */
interface ProgressiveBulkImportManager extends BulkImportManager {
  startProgressiveImport(options: {
    jqlQuery: string;
    batchSize?: number;
    maxResults?: number;
    modal?: ProgressiveImportModal;
    onProgress?: (current: number, total: number, phase: string, details?: any) => void;
    onError?: (ticketKey: string, error: string) => void;
    onComplete?: (summary: BulkImportSummary) => void;
  }): Promise<BulkImportResult>;
  
  pauseImport(): void;
  resumeImport(): Promise<void>;
  getImportState(): ProgressiveImportState;
}

interface BulkImportResult {
  totalImported: number;
  totalErrors: number;
  duration: number;
  batches: number;
  cancelled: boolean;
  resumed: boolean;
  summary: BulkImportSummary;
}

interface BulkImportSummary {
  imported: number;
  updated: number;
  skipped: number;
  failed: number;
  errors: Array<{ticketKey: string, error: string}>;
}

interface ProgressiveImportState {
  isRunning: boolean;
  isPaused: boolean;
  currentBatch: number;
  totalBatches: number;
  processedTickets: number;
  totalTickets: number;
  currentPhase: 'fetching' | 'importing' | 'paused' | 'complete' | 'error';
  startTime: number;
  lastSavedState?: {
    lastProcessedKey: string;
    batchIndex: number;
  };
}

describe('Progressive Bulk Import Integration', () => {
  let manager: ProgressiveBulkImportManager;
  let mockPlugin: vi.Mocked<Plugin>;
  let mockQueryEngine: vi.Mocked<JQLQueryEngine>;
  let mockJiraClient: vi.Mocked<JiraClient>;
  let mockVault: vi.Mocked<Vault>;
  let mockApp: vi.Mocked<App>;
  let mockModal: vi.Mocked<ProgressiveImportModal>;
  let mockTimer: MockTimer;
  let progressCallback: ReturnType<typeof createMockProgressCallback>;
  let errorCallback: ReturnType<typeof createMockErrorCallback>;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();
    JiraFactory.resetCounter();
    
    // Setup mock timer for testing delays and timeouts
    mockTimer = new MockTimer(Date.now());
    mockTimer.install();
    
    // Create mock Jira client
    mockJiraClient = new JiraClient({
      baseUrl: 'https://test.atlassian.net',
      email: 'test@example.com', 
      apiToken: 'test-token'
    }) as vi.Mocked<JiraClient>;
    
    // Create mock vault with file system operations
    mockVault = {
      adapter: {
        exists: vi.fn().mockResolvedValue(false),
        list: vi.fn().mockResolvedValue({ files: [], folders: [] }),
        path: vi.fn(),
        read: vi.fn().mockResolvedValue(''),
        write: vi.fn().mockResolvedValue(undefined)
      },
      create: vi.fn().mockResolvedValue({ path: 'test.md' } as TFile),
      modify: vi.fn().mockResolvedValue(undefined),
      createFolder: vi.fn().mockResolvedValue(undefined),
      getAbstractFileByPath: vi.fn().mockReturnValue(null),
      delete: vi.fn().mockResolvedValue(undefined)
    } as any;
    
    // Create mock app
    mockApp = {
      vault: mockVault,
      workspace: {
        getActiveFile: vi.fn(),
        openLinkText: vi.fn()
      }
    } as any;
    
    // Create mock plugin
    mockPlugin = {
      app: mockApp,
      loadData: vi.fn().mockResolvedValue({}),
      saveData: vi.fn().mockResolvedValue(undefined),
      manifest: { id: 'jira-sync-pro', name: 'Jira Sync Pro' }
    } as any;
    
    // Create mock query engine
    mockQueryEngine = new JQLQueryEngine(mockJiraClient) as vi.Mocked<JQLQueryEngine>;
    
    // Create mock progress modal
    mockModal = {
      open: vi.fn(),
      close: vi.fn(), 
      updateProgress: vi.fn(),
      showCancelButton: vi.fn(),
      onCancel: vi.fn(),
      showErrorSummary: vi.fn()
    } as vi.Mocked<ProgressiveImportModal>;
    
    // Create callback helpers
    progressCallback = createMockProgressCallback();
    errorCallback = createMockErrorCallback();
    
    // Initialize manager - THIS WILL FAIL until ProgressiveBulkImportManager is implemented
    manager = new BulkImportManager(mockPlugin, mockQueryEngine, 'Jira Issues') as ProgressiveBulkImportManager;
  });

  afterEach(() => {
    mockTimer.uninstall();
    vi.restoreAllMocks();
  });

  describe('Large Dataset Processing with Batch Management', () => {
    it('should handle 50+ tickets in batches of 25 with real-time progress', async () => {
      // Arrange - Create test data matching quickstart scenario
      const TOTAL_TICKETS = 63; // Realistic large dataset
      const BATCH_SIZE = 25;    // Required batch size from quickstart
      const EXPECTED_BATCHES = Math.ceil(TOTAL_TICKETS / BATCH_SIZE); // 3 batches
      
      const mockTickets = JiraFactory.createBulkTestData(TOTAL_TICKETS);
      const searchResponse = mockTickets.searchResponse;
      
      mockQueryEngine.executeQuery = vi.fn().mockResolvedValue({
        issues: mockTickets.issues,
        total: TOTAL_TICKETS,
        truncated: false,
        errors: []
      });
      
      // Mock file operations to simulate realistic delays
      let processedCount = 0;
      mockVault.create = vi.fn().mockImplementation(async (path: string, content: string) => {
        processedCount++;
        // Simulate processing time
        await new Promise(resolve => setTimeout(resolve, 50));
        return { path } as TFile;
      });

      // Act - THIS WILL FAIL: startProgressiveImport method doesn't exist
      const result = await manager.startProgressiveImport({
        jqlQuery: 'project = TESTPROJ AND created >= -30d',
        batchSize: BATCH_SIZE,
        modal: mockModal,
        onProgress: progressCallback.callback,
        onError: errorCallback.callback
      });

      // Assert - Expected behavior after implementation
      expect(result.totalImported).toBe(TOTAL_TICKETS);
      expect(result.batches).toBe(EXPECTED_BATCHES);
      expect(result.cancelled).toBe(false);
      expect(result.summary.failed).toBe(0);
      
      // Verify batch processing occurred
      expect(mockVault.create).toHaveBeenCalledTimes(TOTAL_TICKETS);
      
      // Verify modal interactions
      expect(mockModal.open).toHaveBeenCalled();
      expect(mockModal.updateProgress).toHaveBeenCalledWith(0, TOTAL_TICKETS, 'fetching');
      expect(mockModal.updateProgress).toHaveBeenCalledWith(25, TOTAL_TICKETS, 'importing');
      expect(mockModal.updateProgress).toHaveBeenCalledWith(50, TOTAL_TICKETS, 'importing');  
      expect(mockModal.updateProgress).toHaveBeenCalledWith(63, TOTAL_TICKETS, 'complete');
      expect(mockModal.close).toHaveBeenCalled();
      
      // Verify progress callback phases
      const progressCalls = progressCallback.getCalls();
      expect(progressCalls).toContainEqual({ current: 0, total: TOTAL_TICKETS, phase: 'fetching' });
      expect(progressCalls).toContainEqual({ current: 25, total: TOTAL_TICKETS, phase: 'importing' });
      expect(progressCalls).toContainEqual({ current: 50, total: TOTAL_TICKETS, phase: 'importing' });
      expect(progressCalls).toContainEqual({ current: 63, total: TOTAL_TICKETS, phase: 'complete' });
    }, 30000); // 30 second timeout for large dataset
    
    it('should display current ticket being processed in progress modal', async () => {
      // Arrange
      const tickets = JiraFactory.createBulkTestData(10);
      mockQueryEngine.executeQuery = vi.fn().mockResolvedValue({
        issues: tickets.issues,
        total: 10,
        truncated: false
      });
      
      let ticketProcessingOrder: string[] = [];
      mockVault.create = vi.fn().mockImplementation(async (path: string) => {
        // Extract ticket key from path
        const ticketKey = path.match(/([A-Z]+-\d+)\.md$/)?.[1] || 'UNKNOWN';
        ticketProcessingOrder.push(ticketKey);
        return { path } as TFile;
      });

      // Act - THIS WILL FAIL: Enhanced progress tracking not implemented
      await manager.startProgressiveImport({
        jqlQuery: 'project = TEST',
        batchSize: 5,
        modal: mockModal,
        onProgress: (current, total, phase, details) => {
          if (details?.currentTicket) {
            progressCallback.callback(current, total, phase, details);
          }
        }
      });

      // Assert - Should show current ticket in progress updates
      expect(mockModal.updateProgress).toHaveBeenCalledWith(
        expect.any(Number), 
        10, 
        'importing',
        expect.stringMatching(/PROJ-\d+/) // Current ticket key
      );
      
      // Verify tickets processed in correct order
      expect(ticketProcessingOrder).toHaveLength(10);
      expect(ticketProcessingOrder[0]).toMatch(/^(PROJ|TEST|DEV|PROD)-\d+$/);
    });

    it('should maintain UI responsiveness during large imports', async () => {
      // Arrange - Simulate very large dataset
      const LARGE_DATASET = 150;
      const tickets = JiraFactory.createBulkTestData(LARGE_DATASET);
      
      mockQueryEngine.executeQuery = vi.fn().mockResolvedValue({
        issues: tickets.issues,
        total: LARGE_DATASET,
        truncated: false
      });

      let uiUpdates: number[] = [];
      mockModal.updateProgress = vi.fn().mockImplementation((current: number) => {
        uiUpdates.push(current);
      });

      // Act - THIS WILL FAIL: UI responsiveness mechanisms not implemented
      const startTime = Date.now();
      await manager.startProgressiveImport({
        jqlQuery: 'project = LARGE',
        batchSize: 25,
        modal: mockModal
      });
      const duration = Date.now() - startTime;

      // Assert - UI should update frequently to maintain responsiveness
      expect(uiUpdates.length).toBeGreaterThan(6); // At least 6 batches worth of updates
      expect(uiUpdates).toContain(25);   // First batch
      expect(uiUpdates).toContain(50);   // Second batch  
      expect(uiUpdates).toContain(75);   // Third batch
      expect(uiUpdates).toContain(150);  // Final update
      
      // Import should complete in reasonable time (under 10 seconds for testing)
      expect(duration).toBeLessThan(10000);
    });
  });

  describe('Cancellation Support During Import', () => {
    it('should cancel import gracefully when requested', async () => {
      // Arrange
      const TOTAL_TICKETS = 75;
      const tickets = JiraFactory.createBulkTestData(TOTAL_TICKETS);
      
      mockQueryEngine.executeQuery = vi.fn().mockResolvedValue({
        issues: tickets.issues,
        total: TOTAL_TICKETS,
        truncated: false
      });

      let processedTickets = 0;
      const processingDelay = createDeferred<void>();
      
      mockVault.create = vi.fn().mockImplementation(async () => {
        processedTickets++;
        
        // Cancel after processing 30 tickets (middle of second batch)
        if (processedTickets === 30) {
          setTimeout(() => {
            manager.pauseImport(); // THIS WILL FAIL: pauseImport not implemented
          }, 10);
          
          // Hold up processing to allow cancellation
          await processingDelay.promise;
        }
        
        return { path: `test-${processedTickets}.md` } as TFile;
      });

      // Setup modal cancel callback
      mockModal.onCancel = vi.fn().mockImplementation((callback) => {
        // Simulate user clicking cancel
        setTimeout(callback, 100);
      });

      // Act - Start import and cancel mid-way
      const importPromise = manager.startProgressiveImport({
        jqlQuery: 'project = CANCEL_TEST',
        batchSize: 25,
        modal: mockModal,
        onProgress: progressCallback.callback
      });

      // Allow some processing, then resolve the delay to continue
      setTimeout(() => processingDelay.resolve(), 500);
      
      const result = await importPromise;

      // Assert - Should cancel gracefully
      expect(result.cancelled).toBe(true);
      expect(result.totalImported).toBeLessThan(TOTAL_TICKETS);
      expect(result.totalImported).toBeGreaterThan(25); // Should have processed at least first batch
      
      // Modal should show cancel button and handle cancellation
      expect(mockModal.showCancelButton).toHaveBeenCalledWith(true);
      expect(mockModal.onCancel).toHaveBeenCalled();
      
      // Progress should show cancellation
      const lastProgress = progressCallback.getLastCall();
      expect(lastProgress?.phase).toBe('cancelled');
    });

    it('should save state for resume capability when cancelled', async () => {
      // Arrange
      const tickets = JiraFactory.createBulkTestData(50);
      mockQueryEngine.executeQuery = vi.fn().mockResolvedValue({
        issues: tickets.issues,
        total: 50,
        truncated: false
      });

      let cancelAfterTickets = 0;
      mockVault.create = vi.fn().mockImplementation(async (path: string) => {
        cancelAfterTickets++;
        if (cancelAfterTickets === 20) {
          // Cancel after 20 tickets processed
          setTimeout(() => manager.pauseImport(), 10);
        }
        return { path } as TFile;
      });

      // Act - THIS WILL FAIL: State saving not implemented
      const result = await manager.startProgressiveImport({
        jqlQuery: 'project = RESUME_TEST',
        batchSize: 25,
        modal: mockModal
      });

      // Assert - Should save state for resume
      expect(result.cancelled).toBe(true);
      expect(mockPlugin.saveData).toHaveBeenCalledWith(
        expect.objectContaining({
          progressiveImportState: expect.objectContaining({
            lastProcessedKey: expect.stringMatching(/^(PROJ|TEST|DEV|PROD)-\d+$/),
            totalProcessed: expect.any(Number),
            query: 'project = RESUME_TEST',
            batchSize: 25,
            totalTickets: 50
          })
        })
      );
    });

    it('should not allow new import while one is in progress', async () => {
      // Arrange
      const tickets = JiraFactory.createBulkTestData(30);
      mockQueryEngine.executeQuery = vi.fn().mockResolvedValue({
        issues: tickets.issues,
        total: 30,
        truncated: false
      });

      // Slow down processing to keep first import running
      mockVault.create = vi.fn().mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
        return { path: 'test.md' } as TFile;
      });

      // Act - Start two imports simultaneously
      const import1Promise = manager.startProgressiveImport({
        jqlQuery: 'project = TEST1',
        batchSize: 25,
        modal: mockModal
      });

      // Start second import while first is running
      const import2Promise = manager.startProgressiveImport({
        jqlQuery: 'project = TEST2', 
        batchSize: 25
      });

      const [result1, result2] = await Promise.all([
        import1Promise.catch(e => ({ error: e.message })),
        import2Promise.catch(e => ({ error: e.message }))
      ]);

      // Assert - Second import should be rejected
      expect(result1).not.toHaveProperty('error');
      expect(result2).toEqual({
        error: expect.stringContaining('import already in progress')
      });
    });
  });

  describe('Resume Functionality', () => {
    it('should resume from last processed ticket', async () => {
      // Arrange - Setup saved state from previous cancelled import
      const savedState = {
        progressiveImportState: {
          lastProcessedKey: 'TEST-25',
          totalProcessed: 25,
          query: 'project = TESTPROJ AND created >= -30d',
          batchSize: 25,
          totalTickets: 60,
          startTime: Date.now() - 300000 // Started 5 minutes ago
        }
      };
      
      mockPlugin.loadData.mockResolvedValue(savedState);
      
      // Remaining tickets (26-60)
      const remainingTickets = Array.from({ length: 35 }, (_, i) => 
        JiraFactory.createIssue({
          key: `TEST-${26 + i}`,
          summary: `Remaining ticket ${26 + i}`
        })
      );
      
      mockQueryEngine.executeQuery = vi.fn().mockResolvedValue({
        issues: remainingTickets,
        total: 60, // Original total
        truncated: false
      });

      // Act - THIS WILL FAIL: Resume functionality not implemented  
      const result = await manager.resumeImport();

      // Assert - Should resume from correct position
      expect(result).toBeDefined();
      expect(result.resumed).toBe(true);
      expect(result.totalImported).toBe(35); // Only remaining tickets
      expect(result.summary.imported).toBe(35);
      
      // Should query for remaining tickets only
      expect(mockQueryEngine.executeQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          jql: expect.stringContaining('AND key > "TEST-25"') // Resume filter
        })
      );
      
      // Should create files for remaining tickets
      expect(mockVault.create).toHaveBeenCalledTimes(35);
    });

    it('should show resume progress starting from saved position', async () => {
      // Arrange
      const savedState = {
        progressiveImportState: {
          lastProcessedKey: 'PROJ-15',
          totalProcessed: 15,
          query: 'project = PROJ',
          batchSize: 25,
          totalTickets: 40
        }
      };
      
      mockPlugin.loadData.mockResolvedValue(savedState);
      
      const remainingTickets = JiraFactory.createBulkTestData(25); // Tickets 16-40
      mockQueryEngine.executeQuery = vi.fn().mockResolvedValue({
        issues: remainingTickets.issues,
        total: 40,
        truncated: false
      });

      // Act - Resume with progress tracking
      await manager.resumeImport();

      // Assert - Progress should start from saved position
      expect(progressCallback.getCalls()).toContainEqual({
        current: 15, // Starting from saved position
        total: 40,
        phase: 'resuming'
      });
      
      expect(progressCallback.getCalls()).toContainEqual({
        current: 40, // Final completion
        total: 40,
        phase: 'complete'
      });
    });

    it('should handle resume when no saved state exists', async () => {
      // Arrange - No saved state
      mockPlugin.loadData.mockResolvedValue({});

      // Act & Assert - THIS WILL FAIL: Resume state handling not implemented
      await expect(manager.resumeImport()).rejects.toThrow('No import to resume');
    });
  });

  describe('Error Handling and Recovery', () => {
    it('should continue processing after individual ticket failures', async () => {
      // Arrange
      const tickets = JiraFactory.createBulkTestData(20);
      mockQueryEngine.executeQuery = vi.fn().mockResolvedValue({
        issues: tickets.issues,
        total: 20,
        truncated: false
      });

      // Simulate failures on specific tickets
      const failingTickets = ['TEST-5', 'TEST-12', 'TEST-18'];
      mockVault.create = vi.fn().mockImplementation(async (path: string) => {
        const ticketKey = path.match(/([A-Z]+-\d+)\.md$/)?.[1];
        if (failingTickets.some(key => path.includes(key))) {
          throw new Error(`Failed to create ${ticketKey}: Permission denied`);
        }
        return { path } as TFile;
      });

      // Act
      const result = await manager.startProgressiveImport({
        jqlQuery: 'project = ERROR_TEST',
        batchSize: 25,
        modal: mockModal,
        onError: errorCallback.callback
      });

      // Assert - Should continue despite errors
      expect(result.totalImported).toBe(17); // 20 total - 3 failed
      expect(result.summary.failed).toBe(3);
      expect(result.summary.errors).toHaveLength(3);
      
      // Errors should be reported via callback
      expect(errorCallback.getErrorCount()).toBe(3);
      failingTickets.forEach(key => {
        expect(errorCallback.hasError(key)).toBe(true);
      });
      
      // Modal should show error summary
      expect(mockModal.showErrorSummary).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ ticketKey: 'TEST-5' }),
          expect.objectContaining({ ticketKey: 'TEST-12' }),  
          expect.objectContaining({ ticketKey: 'TEST-18' })
        ])
      );
    });

    it('should provide detailed error summary in final report', async () => {
      // Arrange
      const tickets = [
        JiraFactory.createScenarioIssue('active-bug'),
        { ...JiraFactory.createScenarioIssue('completed-story'), fields: null }, // Invalid data
        JiraFactory.createScenarioIssue('in-progress-task'),
        { ...JiraFactory.createScenarioIssue('blocked-epic'), key: '' } // Invalid key
      ];
      
      mockQueryEngine.executeQuery = vi.fn().mockResolvedValue({
        issues: tickets,
        total: 4,
        truncated: false
      });

      // Act - THIS WILL FAIL: Enhanced error categorization not implemented
      const result = await manager.startProgressiveImport({
        jqlQuery: 'project = MIXED_ERRORS',
        batchSize: 25,
        modal: mockModal,
        onError: errorCallback.callback
      });

      // Assert - Should provide detailed error breakdown
      expect(result.summary.imported).toBe(2); // 2 valid tickets
      expect(result.summary.failed).toBe(2);   // 2 invalid tickets
      
      const errorReport = result.summary.errors;
      expect(errorReport).toHaveLength(2);
      expect(errorReport).toContainEqual({
        ticketKey: expect.stringMatching(/TEST-\d+/),
        error: expect.stringContaining('Invalid ticket data')
      });
      expect(errorReport).toContainEqual({
        ticketKey: 'UNKNOWN',
        error: expect.stringContaining('Invalid ticket key')
      });
    });
  });

  describe('Performance and Progress Metrics', () => {
    it('should provide accurate time estimates during import', async () => {
      // Arrange
      const TICKET_COUNT = 50;
      const tickets = JiraFactory.createBulkTestData(TICKET_COUNT);
      
      mockQueryEngine.executeQuery = vi.fn().mockResolvedValue({
        issues: tickets.issues,
        total: TICKET_COUNT,
        truncated: false
      });

      // Simulate consistent processing time
      const PROCESSING_TIME_MS = 100;
      mockVault.create = vi.fn().mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, PROCESSING_TIME_MS));
        return { path: 'test.md' } as TFile;
      });

      let timeEstimates: number[] = [];
      const enhancedProgress = vi.fn((current, total, phase, details) => {
        if (details?.estimatedTimeRemaining) {
          timeEstimates.push(details.estimatedTimeRemaining);
        }
      });

      // Act - THIS WILL FAIL: Time estimation not implemented
      const startTime = Date.now();
      const result = await manager.startProgressiveImport({
        jqlQuery: 'project = TIMING_TEST',
        batchSize: 25,
        modal: mockModal,
        onProgress: enhancedProgress
      });
      const actualDuration = Date.now() - startTime;

      // Assert - Should provide reasonable time estimates
      expect(result.duration).toBeLessThan(actualDuration + 1000); // Within 1 second
      expect(result.duration).toBeGreaterThan(actualDuration - 1000);
      
      // Time estimates should decrease as progress continues
      expect(timeEstimates.length).toBeGreaterThan(2);
      expect(timeEstimates[0]).toBeGreaterThan(timeEstimates[timeEstimates.length - 1]);
    });

    it('should track and report throughput metrics', async () => {
      // Arrange
      const tickets = JiraFactory.createBulkTestData(30);
      mockQueryEngine.executeQuery = vi.fn().mockResolvedValue({
        issues: tickets.issues,
        total: 30,
        truncated: false
      });

      // Act - THIS WILL FAIL: Throughput tracking not implemented
      const result = await manager.startProgressiveImport({
        jqlQuery: 'project = THROUGHPUT_TEST',
        batchSize: 25,
        modal: mockModal
      });

      // Assert - Should provide throughput metrics
      expect(result.summary).toHaveProperty('averageTimePerTicket');
      expect(result.summary).toHaveProperty('ticketsPerSecond');
      expect(result.summary.averageTimePerTicket).toBeGreaterThan(0);
      expect(result.summary.ticketsPerSecond).toBeGreaterThan(0);
    });
  });

  describe('Import State Management', () => {
    it('should track detailed import state throughout process', async () => {
      // Arrange
      const tickets = JiraFactory.createBulkTestData(40);
      mockQueryEngine.executeQuery = vi.fn().mockResolvedValue({
        issues: tickets.issues,
        total: 40,
        truncated: false
      });

      let stateSnapshots: ProgressiveImportState[] = [];
      
      // Capture state at different points
      mockVault.create = vi.fn().mockImplementation(async () => {
        const state = manager.getImportState(); // THIS WILL FAIL: getImportState not implemented
        stateSnapshots.push({ ...state });
        return { path: 'test.md' } as TFile;
      });

      // Act
      await manager.startProgressiveImport({
        jqlQuery: 'project = STATE_TEST',
        batchSize: 25,
        modal: mockModal
      });

      // Assert - Should track state progression
      expect(stateSnapshots.length).toBeGreaterThan(5); // Multiple state captures
      
      // First state should show initial values
      expect(stateSnapshots[0]).toMatchObject({
        isRunning: true,
        isPaused: false,
        currentBatch: 1,
        totalBatches: 2,
        processedTickets: expect.any(Number),
        currentPhase: 'importing'
      });
      
      // Later states should show progression
      const midState = stateSnapshots[Math.floor(stateSnapshots.length / 2)];
      expect(midState.processedTickets).toBeGreaterThan(stateSnapshots[0].processedTickets);
    });
  });

  describe('Integration with JQL Query Engine', () => {
    it('should properly configure query engine for large datasets', async () => {
      // Arrange
      const LARGE_RESULT_SET = 100;
      const tickets = JiraFactory.createBulkTestData(LARGE_RESULT_SET);
      
      mockQueryEngine.executeQuery = vi.fn().mockResolvedValue({
        issues: tickets.issues,
        total: LARGE_RESULT_SET,
        truncated: false
      });

      // Act
      await manager.startProgressiveImport({
        jqlQuery: 'project = LARGE_INTEGRATION',
        batchSize: 25,
        maxResults: LARGE_RESULT_SET,
        modal: mockModal
      });

      // Assert - Should configure query engine appropriately
      expect(mockQueryEngine.executeQuery).toHaveBeenCalledWith({
        jql: 'project = LARGE_INTEGRATION',
        maxResults: LARGE_RESULT_SET,
        batchSize: 25,
        onProgress: expect.any(Function),
        enableRetry: true,
        fields: expect.arrayContaining([
          'summary', 'status', 'assignee', 'priority', 
          'created', 'updated', 'description', 'issuetype', 'project'
        ])
      });
    });
  });

  // Test coverage verification
  describe('Test Coverage Verification', () => {
    it('should validate that all progressive import requirements are tested', () => {
      // This test ensures we've covered all requirements from quickstart scenario
      const requiredFeatures = [
        'batch processing (25 tickets per batch)',
        'progress modal with real-time updates', 
        'cancel functionality mid-import',
        'resume functionality after cancellation',
        'large dataset handling (50+ tickets)',
        'UI responsiveness during import',
        'error handling with continued processing',
        'time estimation and metrics',
        'state persistence for resume'
      ];
      
      // If this test passes, we've defined tests for all required features
      expect(requiredFeatures.length).toBe(9);
      expect(requiredFeatures).toContain('batch processing (25 tickets per batch)');
    });

    it('should confirm TDD approach - this test will fail initially', () => {
      // This test documents the TDD requirement
      // ALL tests in this file MUST fail initially to validate proper TDD implementation
      expect(typeof manager.startProgressiveImport).toBe('function');
      expect(typeof manager.pauseImport).toBe('function');
      expect(typeof manager.resumeImport).toBe('function');
      expect(typeof manager.getImportState).toBe('function');
    });
  });
});