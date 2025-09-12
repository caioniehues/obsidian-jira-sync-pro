import { jest } from '@vitest/globals';
import { App, Plugin, WorkspaceLeaf, ItemView, Setting, Notice } from 'obsidian';
import { SyncStatusView, SYNC_STATUS_VIEW_TYPE, DashboardSyncStatistics, ActiveOperation } from '../../src/sync/sync-status-view';
import { AutoSyncScheduler } from '../../src/enhanced-sync/auto-sync-scheduler';
import { BulkImportManager } from '../../src/enhanced-sync/bulk-import-manager';
import { JQLQueryEngine } from '../../src/enhanced-sync/jql-query-engine';
import { SyncPhase, ErrorCategory } from '../../src/types/sync-types';

describe('SyncStatusView', () => {
  let mockApp: vi.Mocked<App>;
  let mockPlugin: vi.Mocked<Plugin>;
  let mockLeaf: vi.Mocked<WorkspaceLeaf>;
  let mockScheduler: vi.Mocked<AutoSyncScheduler>;
  let mockBulkImportManager: vi.Mocked<BulkImportManager>;
  let mockQueryEngine: vi.Mocked<JQLQueryEngine>;

  beforeEach(() => {
    // Clear all mocks
    vi.clearAllMocks();
    
    // Setup mock objects
    mockApp = {} as vi.Mocked<App>;
    mockPlugin = { app: mockApp } as vi.Mocked<Plugin>;
    mockLeaf = {} as vi.Mocked<WorkspaceLeaf>;
    
    mockScheduler = {
      getStatistics: vi.fn(),
      isRunning: vi.fn(),
      getConfig: vi.fn(),
      triggerManualSync: vi.fn()
    } as vi.Mocked<AutoSyncScheduler>;
    
    mockBulkImportManager = {} as vi.Mocked<BulkImportManager>;
    mockQueryEngine = {} as vi.Mocked<JQLQueryEngine>;
  });

  describe('Construction and Basic Properties', () => {
    it('should create with correct view type', () => {
      const view = new SyncStatusView(mockLeaf, mockPlugin);
      
      expect(view.getViewType()).toBe(SYNC_STATUS_VIEW_TYPE);
    });

    it('should have correct display text', () => {
      const view = new SyncStatusView(mockLeaf, mockPlugin);
      
      expect(view.getDisplayText()).toBe('Jira Sync Status');
    });

    it('should have correct icon', () => {
      const view = new SyncStatusView(mockLeaf, mockPlugin);
      
      expect(view.getIcon()).toBe('activity');
    });

    it('should initialize with default options', () => {
      const view = new SyncStatusView(mockLeaf, mockPlugin);
      
      // Access private options through type assertion for testing
      const options = (view as any).options;
      expect(options.autoRefresh).toBe(true);
      expect(options.refreshInterval).toBe(3000);
      expect(options.maxHistoryEntries).toBe(20);
      expect(options.maxErrorEntries).toBe(50);
      expect(options.showAdvancedMetrics).toBe(true);
    });
  });

  describe('Component Integration', () => {
    it('should accept scheduler in constructor', () => {
      const view = new SyncStatusView(mockLeaf, mockPlugin, mockScheduler);
      
      expect((view as any).scheduler).toBe(mockScheduler);
    });

    it('should update components via updateComponents', () => {
      const view = new SyncStatusView(mockLeaf, mockPlugin);
      
      view.updateComponents(mockScheduler, mockBulkImportManager, mockQueryEngine);
      
      expect((view as any).scheduler).toBe(mockScheduler);
      expect((view as any).bulkImportManager).toBe(mockBulkImportManager);
      expect((view as any).queryEngine).toBe(mockQueryEngine);
    });
  });

  describe('Statistics Management', () => {
    it('should have initial statistics with correct structure', () => {
      const view = new SyncStatusView(mockLeaf, mockPlugin);
      
      const stats = (view as any).statistics as DashboardSyncStatistics;
      expect(stats.totalSyncs).toBe(0);
      expect(stats.successfulSyncs).toBe(0);
      expect(stats.failedSyncs).toBe(0);
      expect(stats.currentStatus).toBe('idle');
      expect(stats.errors).toEqual([]);
      expect(stats.recentSyncs).toEqual([]);
      expect(stats.activeOperation).toBeNull();
    });

    it('should load statistics from scheduler', async () => {
      const schedulerStats = {
        totalSyncs: 10,
        successfulSyncs: 8,
        failedSyncs: 2,
        lastSyncTime: '2023-01-01T10:00:00.000Z',
        averageSyncDuration: 5000,
        currentStatus: 'idle' as const
      };
      
      mockScheduler.getStatistics.mockReturnValue(schedulerStats);
      mockScheduler.isRunning.mockReturnValue(true);
      mockScheduler.getConfig.mockReturnValue({
        enabled: true,
        jqlQuery: 'project = TEST',
        syncInterval: 15,
        maxResults: 100,
        batchSize: 25
      });
      
      const view = new SyncStatusView(mockLeaf, mockPlugin, mockScheduler);
      await (view as any).loadStatistics();
      
      const stats = (view as any).statistics as DashboardSyncStatistics;
      expect(stats.totalSyncs).toBe(10);
      expect(stats.successfulSyncs).toBe(8);
      expect(stats.failedSyncs).toBe(2);
      expect(stats.averageSyncDuration).toBe(5000);
      expect(mockScheduler.getStatistics).toHaveBeenCalled();
    });
  });

  describe('Active Operation Tracking', () => {
    it('should create active operation when status is syncing', () => {
      const view = new SyncStatusView(mockLeaf, mockPlugin);
      
      // Set syncing status
      (view as any).statistics.currentStatus = 'syncing';
      (view as any).updateActiveOperationStatus();
      
      const stats = (view as any).statistics as DashboardSyncStatistics;
      expect(stats.activeOperation).not.toBeNull();
      expect(stats.activeOperation?.type).toBe('sync');
      expect(stats.activeOperation?.phase).toBe(SyncPhase.PROCESSING);
    });

    it('should clear active operation when not syncing', () => {
      const view = new SyncStatusView(mockLeaf, mockPlugin);
      
      // Set up active operation
      (view as any).statistics.activeOperation = {
        type: 'sync',
        phase: SyncPhase.PROCESSING,
        startTime: new Date(),
        current: 5,
        total: 10
      } as ActiveOperation;
      
      // Set idle status
      (view as any).statistics.currentStatus = 'idle';
      (view as any).updateActiveOperationStatus();
      
      const stats = (view as any).statistics as DashboardSyncStatistics;
      expect(stats.activeOperation).toBeNull();
    });
  });

  describe('Manual Sync Triggering', () => {
    beforeEach(() => {
      // Clear Notice mock calls
      (Notice as vi.Mock).mockClear();
    });
    it('should trigger manual sync when scheduler is available', async () => {
      mockScheduler.triggerManualSync.mockResolvedValue();
      mockScheduler.getStatistics.mockReturnValue({
        totalSyncs: 0,
        successfulSyncs: 0,
        failedSyncs: 0,
        lastSyncTime: null,
        averageSyncDuration: 0,
        currentStatus: 'idle' as const
      });
      
      const view = new SyncStatusView(mockLeaf, mockPlugin, mockScheduler);
      (view as any).statistics.currentStatus = 'idle';
      
      // Initialize UI containers to prevent errors
      await view.onOpen();
      
      await (view as any).triggerManualSync();
      
      expect(mockScheduler.triggerManualSync).toHaveBeenCalled();
    });

    it('should show notice when scheduler is not available', async () => {
      const view = new SyncStatusView(mockLeaf, mockPlugin);
      
      await (view as any).triggerManualSync();
      
      expect(Notice).toHaveBeenCalledWith('Scheduler not available');
    });

    it('should prevent manual sync when already syncing', async () => {
      const view = new SyncStatusView(mockLeaf, mockPlugin, mockScheduler);
      (view as any).statistics.currentStatus = 'syncing';
      
      await (view as any).triggerManualSync();
      
      expect(Notice).toHaveBeenCalledWith('Sync already in progress');
      expect(mockScheduler.triggerManualSync).not.toHaveBeenCalled();
    });

    it('should handle manual sync errors gracefully', async () => {
      const error = new Error('Sync failed');
      mockScheduler.triggerManualSync.mockRejectedValue(error);
      mockScheduler.getStatistics.mockReturnValue({
        totalSyncs: 0,
        successfulSyncs: 0,
        failedSyncs: 0,
        lastSyncTime: null,
        averageSyncDuration: 0,
        currentStatus: 'idle' as const
      });
      
      const view = new SyncStatusView(mockLeaf, mockPlugin, mockScheduler);
      (view as any).statistics.currentStatus = 'idle';
      
      // Initialize UI containers to prevent errors
      await view.onOpen();
      
      // Mock console.error to prevent error output
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation();
      
      await (view as any).triggerManualSync();
      
      expect(Notice).toHaveBeenCalledWith('Manual sync failed: Sync failed');
      expect(consoleSpy).toHaveBeenCalled();
      
      consoleSpy.mockRestore();
    });
  });

  describe('Error Management', () => {
    it('should clear resolved errors', async () => {
      const view = new SyncStatusView(mockLeaf, mockPlugin);
      
      // Initialize UI containers to prevent errors
      await view.onOpen();
      
      // Add mixed resolved and unresolved errors
      (view as any).statistics.errors = [
        {
          timestamp: new Date(),
          message: 'Resolved error',
          type: ErrorCategory.API_ERROR,
          retryable: false,
          resolved: true
        },
        {
          timestamp: new Date(),
          message: 'Active error',
          type: ErrorCategory.NETWORK_ERROR,
          retryable: true,
          resolved: false
        }
      ];
      
      (Notice as vi.Mock).mockClear();
      
      (view as any).clearErrors();
      
      const stats = (view as any).statistics as DashboardSyncStatistics;
      expect(stats.errors).toHaveLength(1);
      expect(stats.errors[0].message).toBe('Active error');
      expect(stats.errors[0].resolved).toBe(false);
      expect(Notice).toHaveBeenCalledWith('Resolved errors cleared');
    });
  });

  describe('Utility Functions', () => {
    let view: SyncStatusView;
    
    beforeEach(() => {
      view = new SyncStatusView(mockLeaf, mockPlugin);
    });

    describe('formatDuration', () => {
      it('should format milliseconds correctly', () => {
        expect((view as any).formatDuration(500)).toBe('500ms');
      });

      it('should format seconds correctly', () => {
        expect((view as any).formatDuration(2500)).toBe('2.5s');
      });

      it('should format minutes and seconds correctly', () => {
        expect((view as any).formatDuration(125000)).toBe('2m 5s');
      });

      it('should format hours, minutes correctly', () => {
        expect((view as any).formatDuration(7325000)).toBe('2h 2m');
      });
    });

    describe('formatRelativeTime', () => {
      it('should format recent time as "just now"', () => {
        const recent = new Date(Date.now() - 30000); // 30 seconds ago
        expect((view as any).formatRelativeTime(recent)).toBe('just now');
      });

      it('should format minutes ago', () => {
        const minutesAgo = new Date(Date.now() - 300000); // 5 minutes ago
        expect((view as any).formatRelativeTime(minutesAgo)).toBe('5m ago');
      });

      it('should format hours ago', () => {
        const hoursAgo = new Date(Date.now() - 7200000); // 2 hours ago
        expect((view as any).formatRelativeTime(hoursAgo)).toBe('2h ago');
      });

      it('should format future times', () => {
        const future = new Date(Date.now() + 300000); // 5 minutes from now
        expect((view as any).formatRelativeTime(future)).toBe('in 5m');
      });
    });

    describe('getStatusText', () => {
      it('should return correct status text for each status', () => {
        expect((view as any).getStatusText('idle')).toBe('Idle');
        expect((view as any).getStatusText('syncing')).toBe('Syncing');
        expect((view as any).getStatusText('error')).toBe('Error');
        expect((view as any).getStatusText('scheduled')).toBe('Scheduled');
        expect((view as any).getStatusText('unknown')).toBe('Unknown');
      });
    });
  });

  describe('Auto-refresh Management', () => {
    let view: SyncStatusView;
    
    beforeEach(() => {
      view = new SyncStatusView(mockLeaf, mockPlugin);
      vi.spyOn(global, 'setInterval');
      vi.spyOn(global, 'clearInterval');
    });

    it('should start auto-refresh with correct interval', () => {
      (view as any).startAutoRefresh();
      
      expect(setInterval).toHaveBeenCalledWith(
        expect.any(Function),
        3000
      );
    });

    it('should stop auto-refresh', () => {
      // Start first to get an interval ID
      (view as any).startAutoRefresh();
      const intervalId = (view as any).refreshInterval;
      
      (view as any).stopAutoRefresh();
      
      expect(clearInterval).toHaveBeenCalledWith(intervalId);
      expect((view as any).refreshInterval).toBeNull();
    });

    it('should clear existing interval when starting new refresh', () => {
      // Start first refresh
      (view as any).startAutoRefresh();
      const firstIntervalId = (view as any).refreshInterval;
      
      // Start second refresh
      (view as any).startAutoRefresh();
      
      expect(clearInterval).toHaveBeenCalledWith(firstIntervalId);
    });
  });

  describe('View Lifecycle', () => {
    it('should set isVisible to true on open', async () => {
      const view = new SyncStatusView(mockLeaf, mockPlugin);
      
      await view.onOpen();
      
      expect((view as any).isVisible).toBe(true);
    });

    it('should set isVisible to false on close', async () => {
      const view = new SyncStatusView(mockLeaf, mockPlugin);
      (view as any).isVisible = true;
      
      await view.onClose();
      
      expect((view as any).isVisible).toBe(false);
    });

    it('should stop auto-refresh on close', async () => {
      const view = new SyncStatusView(mockLeaf, mockPlugin);
      vi.spyOn(view as any, 'stopAutoRefresh');
      
      await view.onClose();
      
      expect((view as any).stopAutoRefresh).toHaveBeenCalled();
    });
  });

  describe('Style Management', () => {
    it('should add styles only once', () => {
      const view = new SyncStatusView(mockLeaf, mockPlugin);
      
      // Mock document methods
      const mockGetElementById = vi.fn();
      const mockAppendChild = vi.fn();
      const mockCreateElement = vi.fn(() => ({ 
        id: '', 
        textContent: ''
      }));
      
      // Replace document methods temporarily
      const originalGetElementById = global.document.getElementById;
      const originalAppendChild = global.document.head.appendChild;
      const originalCreateElement = global.document.createElement;
      
      global.document.getElementById = mockGetElementById;
      global.document.head.appendChild = mockAppendChild;
      global.document.createElement = mockCreateElement;
      
      try {
        // First call - no existing style element
        mockGetElementById.mockReturnValue(null);
        (view as any).addStyles();
        expect(mockAppendChild).toHaveBeenCalledTimes(1);
        
        // Second call - style element exists
        mockGetElementById.mockReturnValue({});
        (view as any).addStyles();
        expect(mockAppendChild).toHaveBeenCalledTimes(1); // Should not be called again
        
      } finally {
        // Restore original methods
        global.document.getElementById = originalGetElementById;
        global.document.head.appendChild = originalAppendChild;
        global.document.createElement = originalCreateElement;
      }
    });
  });
});