import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { BulkImportManager } from '../src/enhanced-sync/bulk-import-manager';
import { JQLQueryEngine } from '../src/enhanced-sync/jql-query-engine';
import { Plugin, Notice, Vault } from 'obsidian';

// Mock Obsidian
jest.mock('obsidian', () => ({
  Plugin: jest.fn(),
  Notice: jest.fn(),
  Vault: jest.fn(),
  normalizePath: jest.fn((path: string) => path)
}));

// Mock JQLQueryEngine
jest.mock('../src/enhanced-sync/jql-query-engine');

describe('BulkImportManager', () => {
  let manager: BulkImportManager;
  let mockPlugin: jest.Mocked<Plugin>;
  let mockQueryEngine: jest.Mocked<JQLQueryEngine>;
  let mockVault: jest.Mocked<Vault>;
  let progressCallback: jest.Mock;
  let errorCallback: jest.Mock;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Create mock vault
    mockVault = {
      adapter: {
        exists: jest.fn().mockResolvedValue(false),
        list: jest.fn().mockResolvedValue({ files: [], folders: [] })
      },
      create: jest.fn().mockResolvedValue(undefined),
      modify: jest.fn().mockResolvedValue(undefined),
      createFolder: jest.fn().mockResolvedValue(undefined),
      getAbstractFileByPath: jest.fn().mockReturnValue(null)
    } as any;
    
    // Create mock plugin
    mockPlugin = {
      app: { vault: mockVault },
      loadData: jest.fn().mockResolvedValue({}),
      saveData: jest.fn().mockResolvedValue(undefined)
    } as any;
    
    // Create mock query engine
    mockQueryEngine = new JQLQueryEngine(null as any) as jest.Mocked<JQLQueryEngine>;
    
    // Create callbacks
    progressCallback = jest.fn();
    errorCallback = jest.fn();
    
    // Initialize manager
    manager = new BulkImportManager(mockPlugin, mockQueryEngine, 'Jira Issues');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Bulk Import Execution', () => {
    it('should import tickets in batches of 25', async () => {
      // Arrange
      const mockTickets = Array(60).fill(null).map((_, i) => ({
        key: `TEST-${i + 1}`,
        fields: {
          summary: `Test Issue ${i + 1}`,
          description: `Description ${i + 1}`,
          status: { name: 'Open' },
          assignee: { displayName: 'Test User' }
        }
      }));

      mockQueryEngine.executeQuery = jest.fn().mockResolvedValue({
        issues: mockTickets,
        total: 60,
        truncated: false
      });

      // Act
      const result = await manager.startImport({
        jqlQuery: 'project = TEST',
        batchSize: 25,
        onProgress: progressCallback,
        onError: errorCallback
      });

      // Assert
      expect(result.totalImported).toBe(60);
      expect(result.batches).toBe(3); // 60 tickets / 25 per batch
      expect(progressCallback).toHaveBeenCalledWith(25, 60, 'importing');
      expect(progressCallback).toHaveBeenCalledWith(50, 60, 'importing');
      expect(progressCallback).toHaveBeenCalledWith(60, 60, 'complete');
    });

    it('should handle empty results gracefully', async () => {
      // Arrange
      mockQueryEngine.executeQuery = jest.fn().mockResolvedValue({
        issues: [],
        total: 0,
        truncated: false
      });

      // Act
      const result = await manager.startImport({
        jqlQuery: 'project = EMPTY',
        batchSize: 25,
        onProgress: progressCallback
      });

      // Assert
      expect(result.totalImported).toBe(0);
      expect(result.errors).toHaveLength(0);
      expect(progressCallback).toHaveBeenCalledWith(0, 0, 'complete');
    });

    it('should continue import despite individual ticket failures', async () => {
      // Arrange
      const mockTickets = Array(5).fill(null).map((_, i) => ({
        key: `TEST-${i + 1}`,
        fields: { summary: `Test ${i + 1}` }
      }));

      mockQueryEngine.executeQuery = jest.fn().mockResolvedValue({
        issues: mockTickets,
        total: 5
      });

      // Simulate failure on third ticket
      mockVault.create.mockImplementation((path: string) => {
        if (path.includes('TEST-3')) {
          return Promise.reject(new Error('Failed to create note'));
        }
        return Promise.resolve();
      });

      // Act
      const result = await manager.startImport({
        jqlQuery: 'project = TEST',
        batchSize: 25,
        onError: errorCallback
      });

      // Assert
      expect(result.totalImported).toBe(4); // 5 total - 1 failed
      expect(result.failedImports).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(errorCallback).toHaveBeenCalledTimes(1);
    });
  });

  describe('Cancellation Support', () => {
    it('should support cancellation during import', async () => {
      // Arrange
      const mockTickets = Array(100).fill(null).map((_, i) => ({
        key: `TEST-${i + 1}`,
        fields: { summary: `Test ${i + 1}` }
      }));

      mockQueryEngine.executeQuery = jest.fn().mockResolvedValue({
        issues: mockTickets,
        total: 100
      });

      // Slow down ticket creation to allow cancellation
      let processedCount = 0;
      mockVault.create.mockImplementation(async () => {
        processedCount++;
        if (processedCount === 30) {
          manager.cancelImport();
        }
        await new Promise(resolve => setTimeout(resolve, 10));
      });

      // Act
      const result = await manager.startImport({
        jqlQuery: 'project = TEST',
        batchSize: 25
      });

      // Assert
      expect(result.cancelled).toBe(true);
      expect(result.totalImported).toBeLessThan(100);
    });

    it('should not start new import while one is in progress', async () => {
      // Arrange
      const mockTickets = Array(50).fill(null).map((_, i) => ({
        key: `TEST-${i + 1}`,
        fields: { summary: `Test ${i + 1}` }
      }));

      mockQueryEngine.executeQuery = jest.fn().mockResolvedValue({
        issues: mockTickets,
        total: 50
      });

      // Act
      const import1 = manager.startImport({ jqlQuery: 'project = TEST' });
      const import2 = manager.startImport({ jqlQuery: 'project = TEST2' });

      const [result1, result2] = await Promise.all([import1, import2]);

      // Assert
      expect(result1.totalImported).toBeGreaterThan(0);
      expect(result2).toBeNull(); // Second import should be rejected
    });
  });

  describe('Resume Capability', () => {
    it('should save progress for resume capability', async () => {
      // Arrange
      const mockTickets = Array(50).fill(null).map((_, i) => ({
        key: `TEST-${i + 1}`,
        fields: { summary: `Test ${i + 1}` }
      }));

      mockQueryEngine.executeQuery = jest.fn().mockResolvedValue({
        issues: mockTickets,
        total: 50
      });

      // Act
      await manager.startImport({
        jqlQuery: 'project = TEST',
        batchSize: 25,
        enableResume: true
      });

      // Assert
      expect(mockPlugin.saveData).toHaveBeenCalledWith(
        expect.objectContaining({
          bulkImportState: expect.objectContaining({
            lastImportedKey: 'TEST-50',
            totalProcessed: 50,
            query: 'project = TEST'
          })
        })
      );
    });

    it('should resume from last imported ticket', async () => {
      // Arrange
      const savedState = {
        bulkImportState: {
          lastImportedKey: 'TEST-25',
          totalProcessed: 25,
          query: 'project = TEST'
        }
      };
      mockPlugin.loadData.mockResolvedValue(savedState);

      const mockTickets = Array(50).fill(null).map((_, i) => ({
        key: `TEST-${i + 1}`,
        fields: { summary: `Test ${i + 1}` }
      }));

      mockQueryEngine.executeQuery = jest.fn().mockResolvedValue({
        issues: mockTickets.slice(25), // Resume from ticket 26
        total: 50
      });

      // Act
      const result = await manager.resumeImport({
        onProgress: progressCallback
      });

      // Assert
      expect(result?.totalImported).toBe(25); // Only imported remaining 25
      expect(result?.resumedFrom).toBe('TEST-25');
    });
  });

  describe('Duplicate Detection', () => {
    it('should skip existing tickets', async () => {
      // Arrange
      const mockTickets = Array(10).fill(null).map((_, i) => ({
        key: `TEST-${i + 1}`,
        fields: { summary: `Test ${i + 1}` }
      }));

      mockQueryEngine.executeQuery = jest.fn().mockResolvedValue({
        issues: mockTickets,
        total: 10
      });

      // Simulate some tickets already exist
      mockVault.getAbstractFileByPath.mockImplementation((path: string) => {
        if (path.includes('TEST-3') || path.includes('TEST-7')) {
          return { path } as any; // File exists
        }
        return null;
      });

      // Act
      const result = await manager.startImport({
        jqlQuery: 'project = TEST',
        skipExisting: true
      });

      // Assert
      expect(result.totalImported).toBe(8); // 10 total - 2 existing
      expect(result.skipped).toBe(2);
      expect(mockVault.create).toHaveBeenCalledTimes(8);
    });

    it('should update existing tickets when skipExisting is false', async () => {
      // Arrange
      const mockTickets = Array(5).fill(null).map((_, i) => ({
        key: `TEST-${i + 1}`,
        fields: { summary: `Updated ${i + 1}` }
      }));

      mockQueryEngine.executeQuery = jest.fn().mockResolvedValue({
        issues: mockTickets,
        total: 5
      });

      // Simulate all tickets exist
      mockVault.getAbstractFileByPath.mockReturnValue({ path: 'dummy' } as any);

      // Act
      const result = await manager.startImport({
        jqlQuery: 'project = TEST',
        skipExisting: false
      });

      // Assert
      expect(result.totalImported).toBe(5);
      expect(result.updated).toBe(5);
      expect(mockVault.modify).toHaveBeenCalledTimes(5);
      expect(mockVault.create).not.toHaveBeenCalled();
    });
  });

  describe('Progress Reporting', () => {
    it('should report detailed progress information', async () => {
      // Arrange
      const mockTickets = Array(75).fill(null).map((_, i) => ({
        key: `TEST-${i + 1}`,
        fields: { summary: `Test ${i + 1}` }
      }));

      mockQueryEngine.executeQuery = jest.fn().mockResolvedValue({
        issues: mockTickets,
        total: 75
      });

      const progressStates: any[] = [];
      const detailedProgress = jest.fn((current, total, phase, details) => {
        progressStates.push({ current, total, phase, details });
      });

      // Act
      await manager.startImport({
        jqlQuery: 'project = TEST',
        batchSize: 25,
        onProgress: detailedProgress
      });

      // Assert
      expect(progressStates).toContainEqual(
        expect.objectContaining({
          current: 0,
          total: 75,
          phase: 'fetching'
        })
      );
      expect(progressStates).toContainEqual(
        expect.objectContaining({
          current: 25,
          total: 75,
          phase: 'importing',
          details: expect.objectContaining({ batch: 1 })
        })
      );
      expect(progressStates).toContainEqual(
        expect.objectContaining({
          current: 75,
          total: 75,
          phase: 'complete'
        })
      );
    });

    it('should calculate time estimates', async () => {
      // Arrange
      const mockTickets = Array(100).fill(null).map((_, i) => ({
        key: `TEST-${i + 1}`,
        fields: { summary: `Test ${i + 1}` }
      }));

      mockQueryEngine.executeQuery = jest.fn().mockResolvedValue({
        issues: mockTickets,
        total: 100
      });

      // Act
      const result = await manager.startImport({
        jqlQuery: 'project = TEST',
        batchSize: 25
      });

      // Assert
      expect(result.duration).toBeGreaterThan(0);
      expect(result.averageTimePerTicket).toBeGreaterThan(0);
    });
  });

  describe('Error Collection and Reporting', () => {
    it('should collect and categorize errors', async () => {
      // Arrange
      const mockTickets = [
        { key: 'TEST-1', fields: { summary: 'Valid' } },
        { key: 'TEST-2', fields: null }, // Missing fields
        { key: 'TEST-3', fields: { summary: '' } }, // Empty summary
        { key: 'TEST-4', fields: { summary: 'Valid 2' } }
      ];

      mockQueryEngine.executeQuery = jest.fn().mockResolvedValue({
        issues: mockTickets,
        total: 4
      });

      // Act
      const result = await manager.startImport({
        jqlQuery: 'project = TEST',
        onError: errorCallback
      });

      // Assert
      expect(result.failedImports).toBeGreaterThan(0);
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            ticketKey: 'TEST-2',
            error: expect.stringContaining('fields')
          }),
          expect.objectContaining({
            ticketKey: 'TEST-3',
            error: expect.stringContaining('summary')
          })
        ])
      );
      expect(errorCallback).toHaveBeenCalled();
    });

    it('should generate error report', () => {
      // Arrange
      manager.addError('TEST-1', 'Network error', 'network');
      manager.addError('TEST-2', 'Invalid data', 'validation');
      manager.addError('TEST-3', 'Timeout', 'network');

      // Act
      const report = manager.getErrorReport();

      // Assert
      expect(report).toContain('Total Errors: 3');
      expect(report).toContain('Network Errors: 2');
      expect(report).toContain('Validation Errors: 1');
      expect(report).toContain('TEST-1: Network error');
    });
  });

  describe('Folder Management', () => {
    it('should create sync folder if it does not exist', async () => {
      // Arrange
      mockVault.adapter.exists.mockResolvedValue(false);
      const mockTickets = [{ key: 'TEST-1', fields: { summary: 'Test' } }];
      mockQueryEngine.executeQuery = jest.fn().mockResolvedValue({
        issues: mockTickets,
        total: 1
      });

      // Act
      await manager.startImport({ jqlQuery: 'project = TEST' });

      // Assert
      expect(mockVault.createFolder).toHaveBeenCalledWith('Jira Issues');
    });

    it('should organize tickets in project subfolders', async () => {
      // Arrange
      const mockTickets = [
        { key: 'PROJ1-1', fields: { summary: 'Test 1', project: { key: 'PROJ1' } } },
        { key: 'PROJ2-1', fields: { summary: 'Test 2', project: { key: 'PROJ2' } } }
      ];

      mockQueryEngine.executeQuery = jest.fn().mockResolvedValue({
        issues: mockTickets,
        total: 2
      });

      // Act
      await manager.startImport({
        jqlQuery: 'project in (PROJ1, PROJ2)',
        organizeByProject: true
      });

      // Assert
      expect(mockVault.createFolder).toHaveBeenCalledWith('Jira Issues/PROJ1');
      expect(mockVault.createFolder).toHaveBeenCalledWith('Jira Issues/PROJ2');
      expect(mockVault.create).toHaveBeenCalledWith(
        'Jira Issues/PROJ1/PROJ1-1.md',
        expect.any(String)
      );
      expect(mockVault.create).toHaveBeenCalledWith(
        'Jira Issues/PROJ2/PROJ2-1.md',
        expect.any(String)
      );
    });
  });
});