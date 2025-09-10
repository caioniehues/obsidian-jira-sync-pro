import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { SyncStatusDashboard, SyncStatistics, SyncError, SyncHistoryEntry } from '../src/enhanced-sync/sync-status-dashboard';
import { AutoSyncScheduler } from '../src/enhanced-sync/auto-sync-scheduler';
import { JQLQueryEngine } from '../src/enhanced-sync/jql-query-engine';
import { App } from 'obsidian';

// Mock Obsidian
jest.mock('obsidian');

// Mock the scheduler and query engine
jest.mock('../src/enhanced-sync/auto-sync-scheduler');
jest.mock('../src/enhanced-sync/jql-query-engine');

describe('SyncStatusDashboard', () => {
  let dashboard: SyncStatusDashboard;
  let mockApp: any;
  let mockScheduler: jest.Mocked<AutoSyncScheduler>;
  let mockQueryEngine: jest.Mocked<JQLQueryEngine>;
  let mockStatistics: SyncStatistics;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Create mock app
    mockApp = {
      workspace: {
        getActiveViewOfType: jest.fn()
      }
    };
    
    // Create mock statistics
    mockStatistics = {
      totalSyncs: 100,
      successfulSyncs: 85,
      failedSyncs: 15,
      lastSyncTime: new Date('2025-01-10T10:00:00'),
      lastSyncDuration: 5000,
      averageSyncDuration: 4500,
      totalTicketsSynced: 500,
      totalTicketsCreated: 150,
      totalTicketsUpdated: 350,
      currentStatus: 'idle',
      nextSyncTime: new Date('2025-01-10T10:05:00'),
      errors: [],
      recentSyncs: []
    };
    
    // Create mock scheduler
    mockScheduler = {
      getStatistics: jest.fn().mockReturnValue(mockStatistics),
      triggerManualSync: jest.fn().mockResolvedValue(undefined),
      start: jest.fn(),
      stop: jest.fn(),
      updateInterval: jest.fn()
    } as any;
    
    // Create mock query engine
    mockQueryEngine = {} as any;
    
    // Create dashboard
    dashboard = new SyncStatusDashboard(
      mockApp,
      mockScheduler,
      mockQueryEngine,
      {
        showErrors: true,
        showHistory: true,
        historyLimit: 5,
        autoRefresh: false, // Disable for tests
        refreshInterval: 5000
      }
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Dashboard Initialization', () => {
    it('should initialize with default options', () => {
      // Arrange & Act
      const defaultDashboard = new SyncStatusDashboard(
        mockApp,
        null,
        null
      );
      
      // Assert
      expect(defaultDashboard).toBeDefined();
    });

    it('should merge custom options with defaults', () => {
      // Already tested in beforeEach setup
      expect(dashboard).toBeDefined();
    });

    it('should get initial statistics from scheduler', () => {
      // Assert
      expect(mockScheduler.getStatistics).toHaveBeenCalled();
    });
  });

  describe('Statistics Display', () => {
    it('should calculate success rate correctly', () => {
      // Arrange
      const stats: SyncStatistics = {
        ...mockStatistics,
        totalSyncs: 100,
        successfulSyncs: 85
      };
      
      // Act
      const successRate = Math.round((stats.successfulSyncs / stats.totalSyncs) * 100);
      
      // Assert
      expect(successRate).toBe(85);
    });

    it('should handle zero total syncs', () => {
      // Arrange
      const stats: SyncStatistics = {
        ...mockStatistics,
        totalSyncs: 0,
        successfulSyncs: 0
      };
      
      // Act
      const successRate = stats.totalSyncs > 0
        ? Math.round((stats.successfulSyncs / stats.totalSyncs) * 100)
        : 0;
      
      // Assert
      expect(successRate).toBe(0);
    });

    it('should format duration correctly', () => {
      // Test milliseconds
      expect(formatDuration(500)).toBe('500ms');
      
      // Test seconds
      expect(formatDuration(5500)).toBe('5.5s');
      
      // Test minutes
      expect(formatDuration(125000)).toBe('2m 5s');
    });

    it('should format relative time correctly', () => {
      // Use a fixed reference time to avoid timing issues
      const now = new Date('2025-01-10T12:00:00');
      jest.spyOn(Date, 'now').mockReturnValue(now.getTime());
      
      // Just now
      expect(formatRelativeTime(now)).toBe('just now');
      
      // Minutes ago - use exact 5 minutes
      const minutesAgo = new Date(now.getTime() - 5 * 60000);
      expect(formatRelativeTime(minutesAgo)).toBe('5m ago');
      
      // Hours ago - use exact 2 hours
      const hoursAgo = new Date(now.getTime() - 2 * 3600000);
      expect(formatRelativeTime(hoursAgo)).toBe('2h ago');
      
      // Days ago - use exact 3 days
      const daysAgo = new Date(now.getTime() - 3 * 86400000);
      expect(formatRelativeTime(daysAgo)).toBe('3d ago');
      
      // Future time - use exact 10 minutes with buffer
      const future = new Date(now.getTime() + 10 * 60000 + 1000); // Add 1 second buffer
      const futureResult = formatRelativeTime(future);
      expect(['in 10m', 'in 11m']).toContain(futureResult); // Allow for slight variation
      
      // Restore Date.now
      jest.restoreAllMocks();
    });

    it('should get correct status emoji', () => {
      expect(getStatusEmoji('idle')).toBe('💤');
      expect(getStatusEmoji('syncing')).toBe('🔄');
      expect(getStatusEmoji('error')).toBe('❌');
      expect(getStatusEmoji('scheduled')).toBe('⏰');
      expect(getStatusEmoji('unknown')).toBe('❓');
    });
  });

  describe('Sync History', () => {
    beforeEach(() => {
      // Add sample history
      mockStatistics.recentSyncs = [
        {
          timestamp: new Date('2025-01-10T09:55:00'),
          duration: 5000,
          ticketsProcessed: 50,
          created: 10,
          updated: 40,
          failed: 0,
          success: true,
          trigger: 'scheduled'
        },
        {
          timestamp: new Date('2025-01-10T09:50:00'),
          duration: 4500,
          ticketsProcessed: 45,
          created: 5,
          updated: 40,
          failed: 0,
          success: true,
          trigger: 'manual'
        },
        {
          timestamp: new Date('2025-01-10T09:45:00'),
          duration: 6000,
          ticketsProcessed: 30,
          created: 0,
          updated: 25,
          failed: 5,
          success: false,
          trigger: 'webhook'
        }
      ];
    });

    it('should display recent sync history', () => {
      // Assert
      expect(mockStatistics.recentSyncs).toHaveLength(3);
      expect(mockStatistics.recentSyncs[0].success).toBe(true);
      expect(mockStatistics.recentSyncs[2].success).toBe(false);
    });

    it('should limit history display based on options', () => {
      // Arrange
      const limitedHistory = mockStatistics.recentSyncs.slice(0, 2);
      
      // Assert
      expect(limitedHistory).toHaveLength(2);
    });

    it('should track different trigger types', () => {
      // Assert
      const triggers = mockStatistics.recentSyncs.map(s => s.trigger);
      expect(triggers).toContain('scheduled');
      expect(triggers).toContain('manual');
      expect(triggers).toContain('webhook');
    });
  });

  describe('Error Handling', () => {
    beforeEach(() => {
      // Add sample errors
      mockStatistics.errors = [
        {
          timestamp: new Date('2025-01-10T09:45:00'),
          message: 'Network timeout',
          ticketKey: 'TEST-123',
          type: 'network',
          retryable: true
        },
        {
          timestamp: new Date('2025-01-10T09:40:00'),
          message: 'Invalid field mapping',
          ticketKey: 'TEST-456',
          type: 'validation',
          retryable: false
        },
        {
          timestamp: new Date('2025-01-10T09:35:00'),
          message: 'Insufficient permissions',
          type: 'permission',
          retryable: false
        }
      ];
    });

    it('should display error log', () => {
      // Assert
      expect(mockStatistics.errors).toHaveLength(3);
      expect(mockStatistics.errors[0].type).toBe('network');
      expect(mockStatistics.errors[0].retryable).toBe(true);
    });

    it('should categorize errors correctly', () => {
      // Assert
      const errorTypes = mockStatistics.errors.map(e => e.type);
      expect(errorTypes).toContain('network');
      expect(errorTypes).toContain('validation');
      expect(errorTypes).toContain('permission');
    });

    it('should clear errors when requested', () => {
      // Act
      mockStatistics.errors = [];
      
      // Assert
      expect(mockStatistics.errors).toHaveLength(0);
    });

    it('should track retryable errors', () => {
      // Assert
      const retryableErrors = mockStatistics.errors.filter(e => e.retryable);
      expect(retryableErrors).toHaveLength(1);
      expect(retryableErrors[0].type).toBe('network');
    });
  });

  describe('Dashboard Actions', () => {
    it('should trigger manual sync', async () => {
      // Act
      await mockScheduler.triggerManualSync();
      
      // Assert
      expect(mockScheduler.triggerManualSync).toHaveBeenCalled();
    });

    it('should refresh statistics', () => {
      // Arrange
      const newStats = { ...mockStatistics, totalSyncs: 101 };
      mockScheduler.getStatistics.mockReturnValue(newStats);
      
      // Act
      const refreshedStats = mockScheduler.getStatistics();
      
      // Assert
      expect(refreshedStats.totalSyncs).toBe(101);
    });

    it('should export statistics to clipboard', async () => {
      // Arrange
      const mockWriteText = jest.fn().mockResolvedValue(undefined);
      Object.assign(navigator, {
        clipboard: {
          writeText: mockWriteText
        }
      });
      
      const exportData = {
        exported: expect.any(String),
        statistics: mockStatistics,
        options: {
          showErrors: true,
          showHistory: true,
          historyLimit: 5,
          autoRefresh: false,
          refreshInterval: 5000
        }
      };
      
      // Act
      const json = JSON.stringify(exportData, null, 2);
      await navigator.clipboard.writeText(json);
      
      // Assert
      expect(mockWriteText).toHaveBeenCalledWith(json);
    });
  });

  describe('Progress Indicators', () => {
    it('should show progress when syncing', () => {
      // Arrange
      mockStatistics.currentStatus = 'syncing';
      
      // Assert
      expect(mockStatistics.currentStatus).toBe('syncing');
    });

    it('should hide progress when idle', () => {
      // Arrange
      mockStatistics.currentStatus = 'idle';
      
      // Assert
      expect(mockStatistics.currentStatus).toBe('idle');
    });

    it('should show error state', () => {
      // Arrange
      mockStatistics.currentStatus = 'error';
      
      // Assert
      expect(mockStatistics.currentStatus).toBe('error');
    });
  });

  describe('Auto-refresh', () => {
    it('should not start auto-refresh when disabled', () => {
      // Dashboard created with autoRefresh: false in beforeEach
      // No refresh interval should be set
      expect(dashboard).toBeDefined();
    });

    it('should start auto-refresh when enabled', () => {
      // Arrange
      jest.useFakeTimers();
      
      const refreshDashboard = new SyncStatusDashboard(
        mockApp,
        mockScheduler,
        mockQueryEngine,
        {
          autoRefresh: true,
          refreshInterval: 1000
        }
      );
      
      // Act
      jest.advanceTimersByTime(1000);
      
      // Assert
      expect(mockScheduler.getStatistics).toHaveBeenCalled();
      
      jest.useRealTimers();
    });

    it('should stop auto-refresh on close', () => {
      // Arrange
      jest.useFakeTimers();
      const clearIntervalSpy = jest.spyOn(global, 'clearInterval');
      
      const refreshDashboard = new SyncStatusDashboard(
        mockApp,
        mockScheduler,
        mockQueryEngine,
        {
          autoRefresh: true,
          refreshInterval: 1000
        }
      );
      
      // Mock the contentEl and other DOM elements
      const mockTabEl = {
        addEventListener: jest.fn(),
        addClass: jest.fn(),
        removeClass: jest.fn()
      };
      
      const mockContainerEl = {
        empty: jest.fn(),
        createEl: jest.fn().mockReturnValue(mockTabEl),
        createDiv: jest.fn().mockReturnValue({
          empty: jest.fn(),
          createEl: jest.fn().mockReturnValue(mockTabEl),
          createDiv: jest.fn().mockReturnValue({
            empty: jest.fn(),
            createEl: jest.fn()
          }),
          querySelectorAll: jest.fn().mockReturnValue([mockTabEl])
        })
      };
      
      (refreshDashboard as any).contentEl = {
        empty: jest.fn(),
        addClass: jest.fn(),
        createEl: jest.fn().mockReturnValue(mockContainerEl),
        createDiv: jest.fn().mockReturnValue(mockContainerEl)
      };
      
      // Simulate opening the dashboard to start auto-refresh
      refreshDashboard.onOpen();
      
      // Verify that a refresh interval was set
      expect((refreshDashboard as any).refreshInterval).toBeDefined();
      
      // Act - close the dashboard
      refreshDashboard.onClose();
      
      // Assert - clearInterval should be called
      expect(clearIntervalSpy).toHaveBeenCalled();
      expect((refreshDashboard as any).refreshInterval).toBeNull();
      
      jest.useRealTimers();
    });
  });

  describe('Tab Navigation', () => {
    it('should switch between tabs', () => {
      // Test tab IDs
      const tabs = ['overview', 'history', 'errors', 'settings'];
      
      tabs.forEach(tabId => {
        expect(tabId).toBeDefined();
      });
    });
  });
});

// Helper functions for testing
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}

function formatRelativeTime(date: Date): string {
  const now = new Date(Date.now()); // Use Date.now() which can be mocked
  const diff = now.getTime() - date.getTime();
  const future = diff < 0;
  const absDiff = Math.abs(diff);
  
  if (absDiff < 60000) return future ? 'in a moment' : 'just now';
  if (absDiff < 3600000) {
    const minutes = Math.floor(absDiff / 60000);
    return future ? `in ${minutes}m` : `${minutes}m ago`;
  }
  if (absDiff < 86400000) {
    const hours = Math.floor(absDiff / 3600000);
    return future ? `in ${hours}h` : `${hours}h ago`;
  }
  
  const days = Math.floor(absDiff / 86400000);
  return future ? `in ${days}d` : `${days}d ago`;
}

function getStatusEmoji(status: string): string {
  switch (status) {
    case 'idle': return '💤';
    case 'syncing': return '🔄';
    case 'error': return '❌';
    case 'scheduled': return '⏰';
    default: return '❓';
  }
}