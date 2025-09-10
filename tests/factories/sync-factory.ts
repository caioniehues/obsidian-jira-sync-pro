/**
 * Factory for creating sync state and statistics data
 * Provides realistic test data for sync operations, states, and statistics
 */

import { 
  SyncState, 
  SyncStatistics, 
  AutoSyncConfig, 
  SyncCallbackOptions 
} from '../../src/enhanced-sync/auto-sync-scheduler';
import { 
  BulkImportResult, 
  BulkImportState, 
  ImportError, 
  ImportPhase 
} from '../../src/enhanced-sync/bulk-import-manager';
import { QueryPhase } from '../../src/enhanced-sync/jql-query-engine';

/**
 * Options for customizing sync state
 */
export interface SyncStateOptions {
  lastSyncTime?: string | null;
  lastSyncStatus?: 'success' | 'failure' | 'in-progress' | null;
  totalSyncCount?: number;
  failureCount?: number;
  successfulSyncCount?: number;
  failedSyncCount?: number;
  syncDurations?: number[];
}

/**
 * Options for customizing sync statistics
 */
export interface SyncStatisticsOptions {
  totalSyncs?: number;
  successfulSyncs?: number;
  failedSyncs?: number;
  lastSyncTime?: string | null;
  averageSyncDuration?: number;
  currentStatus?: 'idle' | 'syncing' | 'error';
}

/**
 * Options for customizing bulk import results
 */
export interface BulkImportResultOptions {
  totalImported?: number;
  failedImports?: number;
  skipped?: number;
  updated?: number;
  batches?: number;
  errors?: ImportError[];
  duration?: number;
  averageTimePerTicket?: number;
  cancelled?: boolean;
  resumedFrom?: string;
}

/**
 * Preset sync scenarios for testing
 */
export type SyncScenario = 
  | 'fresh-install'
  | 'successful-sync'
  | 'failed-sync'
  | 'multiple-failures'
  | 'recovering'
  | 'in-progress'
  | 'long-running'
  | 'intermittent-failures'
  | 'peak-performance'
  | 'degraded-performance';

/**
 * Factory class for creating sync-related test data
 */
export class SyncFactory {
  
  /**
   * Creates sync state with optional overrides
   */
  static createSyncState(options: SyncStateOptions = {}): SyncState {
    return {
      lastSyncTime: options.lastSyncTime !== undefined ? options.lastSyncTime : new Date().toISOString(),
      lastSyncStatus: options.lastSyncStatus || 'success',
      totalSyncCount: options.totalSyncCount || 10,
      failureCount: options.failureCount || 0,
      successfulSyncCount: options.successfulSyncCount || 10,
      failedSyncCount: options.failedSyncCount || 0,
      syncDurations: options.syncDurations || [1200, 1500, 1100, 1300, 1400, 1250, 1350, 1200, 1450, 1300]
    };
  }

  /**
   * Creates sync state based on preset scenarios
   */
  static createScenarioSyncState(scenario: SyncScenario): SyncState {
    const scenarios: Record<SyncScenario, SyncStateOptions> = {
      'fresh-install': {
        lastSyncTime: null,
        lastSyncStatus: null,
        totalSyncCount: 0,
        failureCount: 0,
        successfulSyncCount: 0,
        failedSyncCount: 0,
        syncDurations: []
      },
      'successful-sync': {
        lastSyncTime: this.generateDate(-5), // 5 minutes ago
        lastSyncStatus: 'success',
        totalSyncCount: 25,
        failureCount: 0,
        successfulSyncCount: 25,
        failedSyncCount: 0,
        syncDurations: [1200, 1150, 1300, 1250, 1100, 1350, 1200, 1400, 1300, 1250]
      },
      'failed-sync': {
        lastSyncTime: this.generateDate(-10), // 10 minutes ago
        lastSyncStatus: 'failure',
        totalSyncCount: 12,
        failureCount: 3,
        successfulSyncCount: 11,
        failedSyncCount: 1,
        syncDurations: [1200, 1300, 1150, 1400, 1250, 1350, 1100, 1300]
      },
      'multiple-failures': {
        lastSyncTime: this.generateDate(-30), // 30 minutes ago
        lastSyncStatus: 'failure',
        totalSyncCount: 8,
        failureCount: 5,
        successfulSyncCount: 3,
        failedSyncCount: 5,
        syncDurations: [1200, 1300, 1100]
      },
      'recovering': {
        lastSyncTime: this.generateDate(-2), // 2 minutes ago
        lastSyncStatus: 'success',
        totalSyncCount: 15,
        failureCount: 0, // Reset after recovery
        successfulSyncCount: 10,
        failedSyncCount: 5,
        syncDurations: [1200, 1300, 1150, 1400, 1250, 1350, 1300, 1200, 1100, 1250]
      },
      'in-progress': {
        lastSyncTime: this.generateDate(0), // Now
        lastSyncStatus: 'in-progress',
        totalSyncCount: 20,
        failureCount: 0,
        successfulSyncCount: 19,
        failedSyncCount: 0,
        syncDurations: [1200, 1300, 1150, 1400, 1250, 1350, 1300, 1200, 1100]
      },
      'long-running': {
        lastSyncTime: this.generateDate(-1440), // 24 hours ago
        lastSyncStatus: 'success',
        totalSyncCount: 288, // Every 5 minutes for 24 hours
        failureCount: 0,
        successfulSyncCount: 288,
        failedSyncCount: 0,
        syncDurations: [1200, 1300, 1150, 1400, 1250, 1350, 1300, 1200, 1100, 1250]
      },
      'intermittent-failures': {
        lastSyncTime: this.generateDate(-15), // 15 minutes ago
        lastSyncStatus: 'failure',
        totalSyncCount: 30,
        failureCount: 2,
        successfulSyncCount: 25,
        failedSyncCount: 5,
        syncDurations: [1200, 1300, 1150, 1400, 1250, 1350, 1300, 1200, 1100, 1250]
      },
      'peak-performance': {
        lastSyncTime: this.generateDate(-5),
        lastSyncStatus: 'success',
        totalSyncCount: 50,
        failureCount: 0,
        successfulSyncCount: 50,
        failedSyncCount: 0,
        syncDurations: [800, 750, 900, 850, 700, 950, 800, 880, 820, 900] // Fast syncs
      },
      'degraded-performance': {
        lastSyncTime: this.generateDate(-10),
        lastSyncStatus: 'success',
        totalSyncCount: 15,
        failureCount: 0,
        successfulSyncCount: 15,
        failedSyncCount: 0,
        syncDurations: [3000, 3500, 2800, 4000, 3200, 3800, 3100, 3400, 2900, 3600] // Slow syncs
      }
    };

    return this.createSyncState(scenarios[scenario]);
  }

  /**
   * Creates sync statistics with optional overrides
   */
  static createSyncStatistics(options: SyncStatisticsOptions = {}): SyncStatistics {
    const totalSyncs = options.totalSyncs || 20;
    const successfulSyncs = options.successfulSyncs !== undefined ? options.successfulSyncs : totalSyncs - 2;
    const failedSyncs = options.failedSyncs !== undefined ? options.failedSyncs : totalSyncs - successfulSyncs;
    
    return {
      totalSyncs,
      successfulSyncs,
      failedSyncs,
      lastSyncTime: options.lastSyncTime !== undefined ? options.lastSyncTime : new Date().toISOString(),
      averageSyncDuration: options.averageSyncDuration || 1250, // ms
      currentStatus: options.currentStatus || 'idle'
    };
  }

  /**
   * Creates bulk import result with optional overrides
   */
  static createBulkImportResult(options: BulkImportResultOptions = {}): BulkImportResult {
    const totalImported = options.totalImported || 50;
    const duration = options.duration || 30000; // 30 seconds
    
    return {
      totalImported,
      failedImports: options.failedImports || 2,
      skipped: options.skipped || 5,
      updated: options.updated || 10,
      batches: options.batches || 3,
      errors: options.errors || this.createImportErrors(2),
      duration,
      averageTimePerTicket: options.averageTimePerTicket || (duration / totalImported),
      cancelled: options.cancelled || false,
      resumedFrom: options.resumedFrom
    };
  }

  /**
   * Creates bulk import state for resume functionality
   */
  static createBulkImportState(options: {
    lastImportedKey?: string;
    totalProcessed?: number;
    query?: string;
    timestamp?: string;
    errors?: ImportError[];
  } = {}): BulkImportState {
    return {
      lastImportedKey: options.lastImportedKey || 'TEST-1234',
      totalProcessed: options.totalProcessed || 25,
      query: options.query || 'project = TEST AND created >= -7d',
      timestamp: options.timestamp || new Date().toISOString(),
      errors: options.errors || this.createImportErrors(1)
    };
  }

  /**
   * Creates import errors for testing
   */
  static createImportErrors(count: number = 3): ImportError[] {
    const errorTemplates = [
      { ticketKey: 'TEST-001', error: 'Network timeout while fetching issue details', category: 'network' as const },
      { ticketKey: 'TEST-002', error: 'Invalid issue data: missing required field summary', category: 'validation' as const },
      { ticketKey: 'TEST-003', error: 'Failed to create file: permission denied', category: 'filesystem' as const },
      { ticketKey: 'TEST-004', error: 'Rate limit exceeded, please try again later', category: 'network' as const },
      { ticketKey: 'TEST-005', error: 'Issue type not supported in current schema', category: 'validation' as const },
      { ticketKey: 'TEST-006', error: 'Disk space full, cannot create more files', category: 'filesystem' as const },
      { ticketKey: 'TEST-007', error: 'Connection reset by peer', category: 'network' as const },
      { ticketKey: 'TEST-008', error: 'Invalid characters in file name', category: 'filesystem' as const }
    ];

    return errorTemplates.slice(0, count);
  }

  /**
   * Creates sync callback options for testing
   */
  static createSyncCallbackOptions(options: {
    isManual?: boolean;
    isInitial?: boolean;
  } = {}): SyncCallbackOptions {
    return {
      isManual: options.isManual || false,
      isInitial: options.isInitial || false
    };
  }

  /**
   * Creates realistic sync duration data
   */
  static createSyncDurations(scenario: 'fast' | 'normal' | 'slow' | 'variable'): number[] {
    const scenarios = {
      fast: () => 500 + Math.random() * 300, // 500-800ms
      normal: () => 1000 + Math.random() * 600, // 1000-1600ms
      slow: () => 2000 + Math.random() * 2000, // 2000-4000ms
      variable: () => {
        // Mix of fast and slow syncs
        return Math.random() > 0.7 ? 3000 + Math.random() * 2000 : 800 + Math.random() * 400;
      }
    };

    return Array.from({ length: 10 }, () => Math.round(scenarios[scenario]()));
  }

  /**
   * Creates time series data for sync performance analysis
   */
  static createSyncTimeSeries(hours: number = 24): Array<{
    timestamp: string;
    duration: number;
    status: 'success' | 'failure';
    issueCount: number;
  }> {
    const data = [];
    const now = new Date();
    
    // Create data points every hour
    for (let i = hours; i >= 0; i--) {
      const timestamp = new Date(now.getTime() - i * 60 * 60 * 1000);
      const isFailure = Math.random() < 0.05; // 5% failure rate
      
      data.push({
        timestamp: timestamp.toISOString(),
        duration: isFailure ? 0 : 1000 + Math.random() * 1000,
        status: isFailure ? 'failure' as const : 'success' as const,
        issueCount: isFailure ? 0 : Math.floor(10 + Math.random() * 40)
      });
    }
    
    return data;
  }

  /**
   * Creates progress tracking data for bulk imports
   */
  static createProgressData(): Array<{
    phase: ImportPhase;
    current: number;
    total: number;
    timestamp: string;
    details?: any;
  }> {
    const total = 100;
    const phases: ImportPhase[] = ['fetching', 'importing', 'complete'];
    const data = [];
    
    // Fetching phase
    for (let i = 0; i <= total; i += 10) {
      data.push({
        phase: 'fetching' as ImportPhase,
        current: i,
        total,
        timestamp: new Date(Date.now() + i * 100).toISOString()
      });
    }
    
    // Importing phase
    for (let i = 0; i <= total; i += 5) {
      data.push({
        phase: 'importing' as ImportPhase,
        current: i,
        total,
        timestamp: new Date(Date.now() + 10000 + i * 200).toISOString(),
        details: {
          batch: Math.floor(i / 25) + 1,
          batches: 4
        }
      });
    }
    
    // Complete phase
    data.push({
      phase: 'complete' as ImportPhase,
      current: total,
      total,
      timestamp: new Date(Date.now() + 30000).toISOString()
    });
    
    return data;
  }

  /**
   * Creates query execution progress data
   */
  static createQueryProgress(): Array<{
    phase: QueryPhase;
    current: number;
    total: number;
    timestamp: string;
  }> {
    const total = 150;
    const data = [];
    
    // Searching phase - quick discovery of total count
    data.push({
      phase: 'searching' as QueryPhase,
      current: 0,
      total,
      timestamp: new Date(Date.now()).toISOString()
    });
    
    // Downloading phase - paginated retrieval
    for (let i = 0; i <= total; i += 25) {
      data.push({
        phase: 'downloading' as QueryPhase,
        current: Math.min(i, total),
        total,
        timestamp: new Date(Date.now() + i * 50).toISOString()
      });
    }
    
    // Processing phase - quick processing
    data.push({
      phase: 'processing' as QueryPhase,
      current: total,
      total,
      timestamp: new Date(Date.now() + 8000).toISOString()
    });
    
    // Complete phase
    data.push({
      phase: 'complete' as QueryPhase,
      current: total,
      total,
      timestamp: new Date(Date.now() + 9000).toISOString()
    });
    
    return data;
  }

  /**
   * Creates performance benchmark data
   */
  static createBenchmarkData(): {
    syncDurations: { [key: string]: number[] };
    issueProcessingTimes: { [key: string]: number };
    memoryUsage: { [key: string]: number };
    errorRates: { [key: string]: number };
  } {
    return {
      syncDurations: {
        '10_issues': [800, 850, 900, 780, 920, 860, 840, 890, 810, 870],
        '50_issues': [2100, 2200, 1980, 2300, 2050, 2150, 2000, 2250, 2100, 2180],
        '100_issues': [4200, 4500, 4100, 4300, 4000, 4400, 4250, 4150, 4350, 4200],
        '500_issues': [18000, 19500, 17800, 20000, 18500, 19200, 18800, 19000, 17500, 18900]
      },
      issueProcessingTimes: {
        simple_task: 45, // ms per issue
        story_with_description: 65,
        bug_with_attachments: 85,
        epic_with_children: 120
      },
      memoryUsage: {
        idle: 25, // MB
        sync_10_issues: 28,
        sync_50_issues: 35,
        sync_100_issues: 45,
        sync_500_issues: 85
      },
      errorRates: {
        network_stable: 0.01, // 1% error rate
        network_unstable: 0.15, // 15% error rate
        server_overload: 0.25, // 25% error rate
        maintenance_window: 0.95 // 95% error rate
      }
    };
  }

  /**
   * Creates test scenarios for different sync conditions
   */
  static createSyncScenarios(): {
    [scenarioName: string]: {
      state: SyncState;
      statistics: SyncStatistics;
      expectedBehavior: string;
    };
  } {
    return {
      first_sync: {
        state: this.createScenarioSyncState('fresh-install'),
        statistics: this.createSyncStatistics({ 
          totalSyncs: 0, 
          successfulSyncs: 0, 
          failedSyncs: 0,
          currentStatus: 'idle'
        }),
        expectedBehavior: 'Should perform initial sync and establish baseline'
      },
      stable_operation: {
        state: this.createScenarioSyncState('successful-sync'),
        statistics: this.createSyncStatistics({ 
          totalSyncs: 100, 
          successfulSyncs: 98, 
          failedSyncs: 2,
          currentStatus: 'idle'
        }),
        expectedBehavior: 'Should continue regular sync intervals'
      },
      recent_failures: {
        state: this.createScenarioSyncState('multiple-failures'),
        statistics: this.createSyncStatistics({ 
          totalSyncs: 20, 
          successfulSyncs: 15, 
          failedSyncs: 5,
          currentStatus: 'error'
        }),
        expectedBehavior: 'Should implement exponential backoff'
      },
      recovering_service: {
        state: this.createScenarioSyncState('recovering'),
        statistics: this.createSyncStatistics({ 
          totalSyncs: 25, 
          successfulSyncs: 20, 
          failedSyncs: 5,
          currentStatus: 'idle'
        }),
        expectedBehavior: 'Should resume normal operations'
      },
      active_sync: {
        state: this.createScenarioSyncState('in-progress'),
        statistics: this.createSyncStatistics({ 
          totalSyncs: 50, 
          successfulSyncs: 49, 
          failedSyncs: 0,
          currentStatus: 'syncing'
        }),
        expectedBehavior: 'Should not start concurrent sync operations'
      }
    };
  }

  // Helper methods

  /**
   * Generates a date string relative to now
   */
  private static generateDate(minutesFromNow: number): string {
    const date = new Date();
    date.setMinutes(date.getMinutes() + minutesFromNow);
    return date.toISOString();
  }

  /**
   * Creates a mock progress callback for testing
   */
  static createMockProgressCallback(): jest.Mock<void, [number, number, ImportPhase, any?]> {
    return jest.fn((current: number, total: number, phase: ImportPhase, details?: any) => {
      // Mock callback that can be inspected in tests
    });
  }

  /**
   * Creates a mock error callback for testing
   */
  static createMockErrorCallback(): jest.Mock<void, [string, string]> {
    return jest.fn((ticketKey: string, error: string) => {
      // Mock callback that can be inspected in tests
    });
  }

  /**
   * Creates realistic bulk import results for different scenarios
   */
  static createBulkImportScenarios(): {
    [scenarioName: string]: BulkImportResult;
  } {
    return {
      small_successful: this.createBulkImportResult({
        totalImported: 25,
        failedImports: 0,
        skipped: 0,
        updated: 5,
        batches: 1,
        errors: [],
        duration: 8000
      }),
      large_with_errors: this.createBulkImportResult({
        totalImported: 180,
        failedImports: 12,
        skipped: 8,
        updated: 25,
        batches: 8,
        errors: this.createImportErrors(12),
        duration: 120000
      }),
      cancelled_operation: this.createBulkImportResult({
        totalImported: 45,
        failedImports: 3,
        skipped: 0,
        updated: 8,
        batches: 2,
        errors: this.createImportErrors(3),
        duration: 35000,
        cancelled: true
      }),
      resumed_import: this.createBulkImportResult({
        totalImported: 67,
        failedImports: 5,
        skipped: 12,
        updated: 15,
        batches: 3,
        errors: this.createImportErrors(5),
        duration: 45000,
        resumedFrom: 'TEST-456'
      })
    };
  }
}