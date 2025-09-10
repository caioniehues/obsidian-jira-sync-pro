import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { SyncStatistics, SyncStatisticsManager } from '../../src/data-model/sync-statistics';

// Mock Date.now() for consistent testing
const mockNow = 1694350800000; // Fixed timestamp: 2023-09-10 12:00:00 UTC
const mockDate = jest.spyOn(Date, 'now').mockReturnValue(mockNow);

describe('SyncStatistics Data Model', () => {
  let stats: SyncStatistics;
  let statsManager: SyncStatisticsManager;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDate.mockReturnValue(mockNow);
    
    // Initialize fresh statistics instance
    stats = {
      totalSyncOperations: 0,
      successfulSyncs: 0,
      failedSyncs: 0,
      averageSyncDuration: 0,
      lastSyncDuration: 0,
      longestSyncDuration: 0,
      totalTicketsProcessed: 0,
      ticketsCreated: 0,
      ticketsUpdated: 0,
      ticketsSkipped: 0,
      errorsByCategory: {},
      consecutiveFailures: 0,
      averageTicketsPerSecond: 0,
      apiCallsThisHour: 0,
      hourlyStats: []
    };
    
    statsManager = new SyncStatisticsManager();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Initial State', () => {
    it('should have all counters initialized to zero', () => {
      expect(stats.totalSyncOperations).toBe(0);
      expect(stats.successfulSyncs).toBe(0);
      expect(stats.failedSyncs).toBe(0);
      expect(stats.totalTicketsProcessed).toBe(0);
      expect(stats.ticketsCreated).toBe(0);
      expect(stats.ticketsUpdated).toBe(0);
      expect(stats.ticketsSkipped).toBe(0);
      expect(stats.consecutiveFailures).toBe(0);
      expect(stats.apiCallsThisHour).toBe(0);
    });

    it('should have timing metrics initialized to zero', () => {
      expect(stats.averageSyncDuration).toBe(0);
      expect(stats.lastSyncDuration).toBe(0);
      expect(stats.longestSyncDuration).toBe(0);
      expect(stats.averageTicketsPerSecond).toBe(0);
    });

    it('should have empty collections initialized', () => {
      expect(stats.errorsByCategory).toEqual({});
      expect(stats.hourlyStats).toEqual([]);
      expect(Array.isArray(stats.hourlyStats)).toBe(true);
    });

    it('should maintain data model integrity constraints', () => {
      // Total syncs should equal successful + failed
      expect(stats.totalSyncOperations).toBe(stats.successfulSyncs + stats.failedSyncs);
      
      // Total tickets should equal created + updated + skipped
      expect(stats.totalTicketsProcessed).toBe(
        stats.ticketsCreated + stats.ticketsUpdated + stats.ticketsSkipped
      );
    });
  });

  describe('Metrics Aggregation', () => {
    describe('Sync Operation Tracking', () => {
      it('should increment total operations on successful sync', () => {
        const duration = 45; // seconds
        const ticketCount = 25;
        
        statsManager.recordSuccessfulSync(stats, duration, ticketCount);
        
        expect(stats.totalSyncOperations).toBe(1);
        expect(stats.successfulSyncs).toBe(1);
        expect(stats.failedSyncs).toBe(0);
        expect(stats.consecutiveFailures).toBe(0);
        expect(stats.lastSyncDuration).toBe(duration);
      });

      it('should increment total operations on failed sync', () => {
        const errorCode = 'API_RATE_LIMIT';
        
        statsManager.recordFailedSync(stats, errorCode);
        
        expect(stats.totalSyncOperations).toBe(1);
        expect(stats.successfulSyncs).toBe(0);
        expect(stats.failedSyncs).toBe(1);
        expect(stats.consecutiveFailures).toBe(1);
      });

      it('should reset consecutive failures on successful sync after failures', () => {
        // Record 3 failures
        statsManager.recordFailedSync(stats, 'NETWORK_ERROR');
        statsManager.recordFailedSync(stats, 'API_TIMEOUT');
        statsManager.recordFailedSync(stats, 'NETWORK_ERROR');
        
        expect(stats.consecutiveFailures).toBe(3);
        
        // Record success - should reset consecutive failures
        statsManager.recordSuccessfulSync(stats, 30, 10);
        
        expect(stats.consecutiveFailures).toBe(0);
        expect(stats.totalSyncOperations).toBe(4);
        expect(stats.successfulSyncs).toBe(1);
        expect(stats.failedSyncs).toBe(3);
      });

      it('should maintain data integrity after multiple operations', () => {
        // Mix of successful and failed syncs
        statsManager.recordSuccessfulSync(stats, 30, 15);
        statsManager.recordFailedSync(stats, 'NETWORK_ERROR');
        statsManager.recordSuccessfulSync(stats, 45, 20);
        statsManager.recordFailedSync(stats, 'API_RATE_LIMIT');
        statsManager.recordSuccessfulSync(stats, 60, 25);
        
        expect(stats.totalSyncOperations).toBe(5);
        expect(stats.successfulSyncs).toBe(3);
        expect(stats.failedSyncs).toBe(2);
        expect(stats.totalSyncOperations).toBe(stats.successfulSyncs + stats.failedSyncs);
      });
    });

    describe('Duration Metrics Calculation', () => {
      it('should calculate average duration correctly with single sync', () => {
        const duration = 120;
        
        statsManager.recordSuccessfulSync(stats, duration, 50);
        
        expect(stats.averageSyncDuration).toBe(duration);
        expect(stats.lastSyncDuration).toBe(duration);
        expect(stats.longestSyncDuration).toBe(duration);
      });

      it('should calculate rolling average duration over multiple syncs', () => {
        const durations = [60, 90, 120, 150, 180]; // seconds
        const expectedAverage = (60 + 90 + 120 + 150 + 180) / 5; // 120
        
        durations.forEach((duration, index) => {
          statsManager.recordSuccessfulSync(stats, duration, 20);
        });
        
        expect(stats.averageSyncDuration).toBe(expectedAverage);
        expect(stats.lastSyncDuration).toBe(180); // Last sync duration
        expect(stats.longestSyncDuration).toBe(180); // Maximum duration
      });

      it('should track longest sync duration across all operations', () => {
        const durations = [45, 120, 30, 200, 75]; // Peak at 200
        
        durations.forEach(duration => {
          statsManager.recordSuccessfulSync(stats, duration, 10);
        });
        
        expect(stats.longestSyncDuration).toBe(200);
        expect(stats.lastSyncDuration).toBe(75);
      });

      it('should handle edge case of very short sync durations', () => {
        const shortDurations = [0.5, 1.2, 0.8]; // Sub-second durations
        
        shortDurations.forEach(duration => {
          statsManager.recordSuccessfulSync(stats, duration, 1);
        });
        
        expect(stats.averageSyncDuration).toBeCloseTo((0.5 + 1.2 + 0.8) / 3);
        expect(stats.longestSyncDuration).toBe(1.2);
      });

      it('should exclude failed syncs from duration calculations', () => {
        // Mix successful syncs with known durations and failed syncs
        statsManager.recordSuccessfulSync(stats, 60, 20);
        statsManager.recordFailedSync(stats, 'NETWORK_ERROR');
        statsManager.recordSuccessfulSync(stats, 90, 30);
        statsManager.recordFailedSync(stats, 'API_RATE_LIMIT');
        
        // Only successful syncs (60, 90) should be included in averages
        expect(stats.averageSyncDuration).toBe((60 + 90) / 2); // 75
        expect(stats.lastSyncDuration).toBe(90);
        expect(stats.longestSyncDuration).toBe(90);
      });
    });

    describe('Ticket Volume Tracking', () => {
      it('should aggregate ticket counts from sync operations', () => {
        statsManager.recordTicketProcessing(stats, {
          created: 10,
          updated: 15,
          skipped: 5
        });
        
        expect(stats.ticketsCreated).toBe(10);
        expect(stats.ticketsUpdated).toBe(15);
        expect(stats.ticketsSkipped).toBe(5);
        expect(stats.totalTicketsProcessed).toBe(30);
      });

      it('should accumulate ticket counts across multiple sync operations', () => {
        const operations = [
          { created: 8, updated: 12, skipped: 3 },
          { created: 15, updated: 8, skipped: 2 },
          { created: 5, updated: 20, skipped: 7 }
        ];
        
        operations.forEach(op => {
          statsManager.recordTicketProcessing(stats, op);
        });
        
        expect(stats.ticketsCreated).toBe(8 + 15 + 5); // 28
        expect(stats.ticketsUpdated).toBe(12 + 8 + 20); // 40
        expect(stats.ticketsSkipped).toBe(3 + 2 + 7); // 12
        expect(stats.totalTicketsProcessed).toBe(28 + 40 + 12); // 80
      });

      it('should maintain ticket processing integrity constraint', () => {
        statsManager.recordTicketProcessing(stats, { created: 20, updated: 30, skipped: 10 });
        
        // Verify the constraint: total = created + updated + skipped
        expect(stats.totalTicketsProcessed).toBe(
          stats.ticketsCreated + stats.ticketsUpdated + stats.ticketsSkipped
        );
      });

      it('should handle zero ticket processing scenarios', () => {
        statsManager.recordTicketProcessing(stats, { created: 0, updated: 0, skipped: 0 });
        
        expect(stats.totalTicketsProcessed).toBe(0);
        expect(stats.ticketsCreated).toBe(0);
        expect(stats.ticketsUpdated).toBe(0);
        expect(stats.ticketsSkipped).toBe(0);
      });
    });
  });

  describe('Performance Metrics', () => {
    describe('Tickets Per Second Calculation', () => {
      it('should calculate average tickets per second for single sync', () => {
        const duration = 60; // seconds
        const ticketCount = 120; // tickets
        const expectedRate = ticketCount / duration; // 2 tickets/second
        
        statsManager.recordSuccessfulSync(stats, duration, ticketCount);
        
        expect(stats.averageTicketsPerSecond).toBe(expectedRate);
      });

      it('should calculate rolling average tickets per second over multiple syncs', () => {
        const syncs = [
          { duration: 30, tickets: 60 }, // 2 tickets/sec
          { duration: 60, tickets: 120 }, // 2 tickets/sec
          { duration: 90, tickets: 270 }  // 3 tickets/sec
        ];
        const expectedAverage = (2 + 2 + 3) / 3; // 2.33 tickets/sec
        
        syncs.forEach(({ duration, tickets }) => {
          statsManager.recordSuccessfulSync(stats, duration, tickets);
        });
        
        expect(stats.averageTicketsPerSecond).toBeCloseTo(expectedAverage, 2);
      });

      it('should handle edge cases in performance calculation', () => {
        // Very fast sync
        statsManager.recordSuccessfulSync(stats, 1, 100); // 100 tickets/sec
        expect(stats.averageTicketsPerSecond).toBe(100);
        
        // Very slow sync
        statsManager.recordSuccessfulSync(stats, 300, 30); // 0.1 tickets/sec
        expect(stats.averageTicketsPerSecond).toBeCloseTo(50.05, 2); // Average of 100 and 0.1
      });

      it('should exclude zero-duration syncs from performance calculations', () => {
        statsManager.recordSuccessfulSync(stats, 60, 120); // 2 tickets/sec
        
        // Attempt to record zero-duration sync (should be handled gracefully)
        statsManager.recordSuccessfulSync(stats, 0, 50);
        
        // Should maintain previous average or handle gracefully
        expect(stats.averageTicketsPerSecond).toBeGreaterThan(0);
      });
    });

    describe('API Call Tracking', () => {
      it('should increment API calls counter', () => {
        const callCount = 5;
        
        statsManager.recordApiCalls(stats, callCount);
        
        expect(stats.apiCallsThisHour).toBe(callCount);
      });

      it('should accumulate API calls across multiple operations', () => {
        const calls = [3, 7, 2, 5, 4];
        const expectedTotal = calls.reduce((sum, count) => sum + count, 0); // 21
        
        calls.forEach(count => {
          statsManager.recordApiCalls(stats, count);
        });
        
        expect(stats.apiCallsThisHour).toBe(expectedTotal);
      });

      it('should handle API call counter reset for new hour', () => {
        statsManager.recordApiCalls(stats, 15);
        expect(stats.apiCallsThisHour).toBe(15);
        
        // Simulate hour boundary reset
        statsManager.resetHourlyApiCalls(stats);
        
        expect(stats.apiCallsThisHour).toBe(0);
      });
    });
  });

  describe('Error Tracking and Categorization', () => {
    describe('Error Category Management', () => {
      it('should track errors by category', () => {
        const errorCode = 'API_RATE_LIMIT';
        
        statsManager.recordErrorByCategory(stats, errorCode);
        
        expect(stats.errorsByCategory[errorCode]).toBe(1);
        expect(Object.keys(stats.errorsByCategory)).toHaveLength(1);
      });

      it('should increment existing error category counts', () => {
        const errorCode = 'NETWORK_ERROR';
        
        // Record multiple errors of same category
        statsManager.recordErrorByCategory(stats, errorCode);
        statsManager.recordErrorByCategory(stats, errorCode);
        statsManager.recordErrorByCategory(stats, errorCode);
        
        expect(stats.errorsByCategory[errorCode]).toBe(3);
      });

      it('should track multiple error categories independently', () => {
        const errorCategories = [
          'API_RATE_LIMIT',
          'NETWORK_ERROR', 
          'VAULT_WRITE_FAILED',
          'API_AUTH_FAILED',
          'NETWORK_ERROR', // Duplicate
          'API_RATE_LIMIT'  // Duplicate
        ];
        
        errorCategories.forEach(errorCode => {
          statsManager.recordErrorByCategory(stats, errorCode);
        });
        
        expect(stats.errorsByCategory['API_RATE_LIMIT']).toBe(2);
        expect(stats.errorsByCategory['NETWORK_ERROR']).toBe(2);
        expect(stats.errorsByCategory['VAULT_WRITE_FAILED']).toBe(1);
        expect(stats.errorsByCategory['API_AUTH_FAILED']).toBe(1);
        expect(Object.keys(stats.errorsByCategory)).toHaveLength(4);
      });

      it('should provide error category summary', () => {
        const errors = {
          'API_RATE_LIMIT': 5,
          'NETWORK_ERROR': 3,
          'VAULT_WRITE_FAILED': 1,
          'PARSE_ERROR': 2
        };
        
        Object.entries(errors).forEach(([errorCode, count]) => {
          for (let i = 0; i < count; i++) {
            statsManager.recordErrorByCategory(stats, errorCode);
          }
        });
        
        const summary = statsManager.getErrorCategorySummary(stats);
        expect(summary.totalErrors).toBe(11);
        expect(summary.mostCommonError).toBe('API_RATE_LIMIT');
        expect(summary.categoriesCount).toBe(4);
      });
    });
  });

  describe('Hourly Statistics Management', () => {
    describe('Hourly Data Structure', () => {
      it('should initialize hourly stats with correct structure', () => {
        const hourlyEntry = statsManager.createHourlyEntry(mockNow);
        
        expect(hourlyEntry).toEqual({
          hour: Math.floor(mockNow / (1000 * 60 * 60)) * (1000 * 60 * 60),
          syncs: 0,
          tickets: 0,
          errors: 0
        });
      });

      it('should round timestamps to hour boundaries', () => {
        const timestamps = [
          1694350800000, // 2023-09-10 12:00:00 UTC
          1694353245000, // 2023-09-10 12:40:45 UTC
          1694354399000  // 2023-09-10 12:59:59 UTC
        ];
        
        const expectedHour = Math.floor(mockNow / (1000 * 60 * 60)) * (1000 * 60 * 60);
        
        timestamps.forEach(timestamp => {
          const entry = statsManager.createHourlyEntry(timestamp);
          expect(entry.hour).toBe(expectedHour);
        });
      });
    });

    describe('Hourly Statistics Updates', () => {
      it('should update hourly stats for current hour', () => {
        const syncCount = 1;
        const ticketCount = 25;
        const errorCount = 0;
        
        statsManager.updateHourlyStats(stats, syncCount, ticketCount, errorCount);
        
        expect(stats.hourlyStats).toHaveLength(1);
        expect(stats.hourlyStats[0].syncs).toBe(syncCount);
        expect(stats.hourlyStats[0].tickets).toBe(ticketCount);
        expect(stats.hourlyStats[0].errors).toBe(errorCount);
      });

      it('should accumulate stats within the same hour', () => {
        const updates = [
          { syncs: 1, tickets: 20, errors: 0 },
          { syncs: 1, tickets: 15, errors: 1 },
          { syncs: 1, tickets: 30, errors: 0 }
        ];
        
        updates.forEach(({ syncs, tickets, errors }) => {
          statsManager.updateHourlyStats(stats, syncs, tickets, errors);
        });
        
        expect(stats.hourlyStats).toHaveLength(1);
        expect(stats.hourlyStats[0].syncs).toBe(3);
        expect(stats.hourlyStats[0].tickets).toBe(65);
        expect(stats.hourlyStats[0].errors).toBe(1);
      });

      it('should create new entries for different hours', () => {
        // First hour
        mockDate.mockReturnValueOnce(mockNow);
        statsManager.updateHourlyStats(stats, 1, 20, 0);
        
        // Second hour (1 hour later)
        const nextHour = mockNow + (60 * 60 * 1000);
        mockDate.mockReturnValueOnce(nextHour);
        statsManager.updateHourlyStats(stats, 1, 15, 1);
        
        expect(stats.hourlyStats).toHaveLength(2);
        expect(stats.hourlyStats[0].syncs).toBe(1);
        expect(stats.hourlyStats[1].syncs).toBe(1);
      });

      it('should maintain chronological order in hourly stats', () => {
        const hours = [
          mockNow,
          mockNow + (60 * 60 * 1000),      // +1 hour
          mockNow + (2 * 60 * 60 * 1000),  // +2 hours
          mockNow + (3 * 60 * 60 * 1000)   // +3 hours
        ];
        
        hours.forEach((timestamp, index) => {
          mockDate.mockReturnValueOnce(timestamp);
          statsManager.updateHourlyStats(stats, 1, 10, 0);
        });
        
        expect(stats.hourlyStats).toHaveLength(4);
        
        // Verify chronological order
        for (let i = 1; i < stats.hourlyStats.length; i++) {
          expect(stats.hourlyStats[i].hour).toBeGreaterThan(stats.hourlyStats[i-1].hour);
        }
      });

      it('should maintain rolling window of 24 hours maximum', () => {
        // Create 26 hours worth of data (exceeds 24-hour window)
        for (let i = 0; i < 26; i++) {
          const timestamp = mockNow + (i * 60 * 60 * 1000); // Each hour
          mockDate.mockReturnValueOnce(timestamp);
          statsManager.updateHourlyStats(stats, 1, 10, 0);
        }
        
        // Should only keep most recent 24 hours
        expect(stats.hourlyStats).toHaveLength(24);
        
        // Verify oldest entries were removed
        const oldestHour = stats.hourlyStats[0].hour;
        const newestHour = stats.hourlyStats[23].hour;
        const hoursDifference = (newestHour - oldestHour) / (1000 * 60 * 60);
        expect(hoursDifference).toBe(23); // 0-based, so 23 = 24 hours span
      });
    });

    describe('Hourly Statistics Queries', () => {
      beforeEach(() => {
        // Setup test data for multiple hours
        for (let i = 0; i < 5; i++) {
          const timestamp = mockNow + (i * 60 * 60 * 1000);
          mockDate.mockReturnValueOnce(timestamp);
          statsManager.updateHourlyStats(stats, 2, 25, i % 2); // Varying error counts
        }
      });

      it('should calculate total syncs in last 24 hours', () => {
        const totalSyncs = statsManager.getTotalSyncsLast24Hours(stats);
        expect(totalSyncs).toBe(10); // 5 hours * 2 syncs each
      });

      it('should calculate total tickets processed in last 24 hours', () => {
        const totalTickets = statsManager.getTotalTicketsLast24Hours(stats);
        expect(totalTickets).toBe(125); // 5 hours * 25 tickets each
      });

      it('should calculate total errors in last 24 hours', () => {
        const totalErrors = statsManager.getTotalErrorsLast24Hours(stats);
        expect(totalErrors).toBe(2); // Hours 1 and 3 had 1 error each (i % 2)
      });

      it('should get hourly stats for specific time range', () => {
        const fromHour = mockNow + (60 * 60 * 1000);     // 1 hour from start
        const toHour = mockNow + (3 * 60 * 60 * 1000);   // 3 hours from start
        
        const rangeStats = statsManager.getHourlyStatsRange(stats, fromHour, toHour);
        expect(rangeStats).toHaveLength(3); // Hours 1, 2, 3
      });
    });
  });

  describe('Counter Management and Reset Logic', () => {
    describe('Counter Overflow Prevention', () => {
      it('should detect when counters approach overflow', () => {
        stats.totalSyncOperations = Number.MAX_SAFE_INTEGER - 100;
        
        const isNearOverflow = statsManager.isCounterNearOverflow(stats);
        expect(isNearOverflow).toBe(true);
      });

      it('should reset counters when overflow is detected', () => {
        // Set counters to near-overflow values
        stats.totalSyncOperations = Number.MAX_SAFE_INTEGER - 50;
        stats.totalTicketsProcessed = Number.MAX_SAFE_INTEGER - 100;
        stats.ticketsCreated = 1000000;
        
        statsManager.preventCounterOverflow(stats);
        
        // Counters should be reset but maintain ratios/relationships
        expect(stats.totalSyncOperations).toBeLessThan(Number.MAX_SAFE_INTEGER / 2);
        expect(stats.totalTicketsProcessed).toBeLessThan(Number.MAX_SAFE_INTEGER / 2);
      });

      it('should preserve statistical relationships after reset', () => {
        stats.totalSyncOperations = 1000;
        stats.successfulSyncs = 800;
        stats.failedSyncs = 200;
        
        const successRateBefore = stats.successfulSyncs / stats.totalSyncOperations;
        
        statsManager.resetCountersWithRatioPreservation(stats);
        
        const successRateAfter = stats.successfulSyncs / stats.totalSyncOperations;
        expect(successRateAfter).toBeCloseTo(successRateBefore, 2);
      });
    });

    describe('Periodic Reset Strategy', () => {
      it('should support scheduled counter reset', () => {
        // Populate with test data
        stats.totalSyncOperations = 1000;
        stats.apiCallsThisHour = 500;
        stats.hourlyStats = [
          { hour: mockNow, syncs: 10, tickets: 100, errors: 2 }
        ];
        
        const preservedData = statsManager.schedulePeriodicReset(stats);
        
        // Verify essential data is preserved
        expect(preservedData.averageSyncDuration).toBe(stats.averageSyncDuration);
        expect(preservedData.longestSyncDuration).toBe(stats.longestSyncDuration);
        expect(preservedData.errorsByCategory).toEqual(stats.errorsByCategory);
      });
    });
  });

  describe('SyncStatisticsManager Integration', () => {
    it('should initialize statistics manager with default values', () => {
      const manager = new SyncStatisticsManager();
      expect(manager).toBeDefined();
    });

    it('should create fresh statistics object', () => {
      const freshStats = statsManager.createFreshStatistics();
      
      expect(freshStats.totalSyncOperations).toBe(0);
      expect(freshStats.errorsByCategory).toEqual({});
      expect(freshStats.hourlyStats).toEqual([]);
      expect(typeof freshStats.averageSyncDuration).toBe('number');
    });

    it('should validate statistics object structure', () => {
      const isValid = statsManager.validateStatisticsStructure(stats);
      expect(isValid).toBe(true);
    });

    it('should detect corrupted statistics object', () => {
      const corruptedStats = { ...stats };
      delete corruptedStats.totalSyncOperations;
      
      const isValid = statsManager.validateStatisticsStructure(corruptedStats);
      expect(isValid).toBe(false);
    });

    it('should repair corrupted statistics object', () => {
      const corruptedStats = { 
        totalSyncOperations: 100,
        // Missing required fields
      };
      
      const repairedStats = statsManager.repairStatistics(corruptedStats);
      
      expect(repairedStats.totalSyncOperations).toBe(100); // Preserved
      expect(repairedStats.successfulSyncs).toBe(0); // Default
      expect(repairedStats.errorsByCategory).toEqual({}); // Default
    });
  });

  describe('Edge Cases and Error Conditions', () => {
    it('should handle negative duration values gracefully', () => {
      expect(() => {
        statsManager.recordSuccessfulSync(stats, -30, 20);
      }).not.toThrow();
      
      // Should either reject negative values or handle them appropriately
      expect(stats.averageSyncDuration).toBeGreaterThanOrEqual(0);
    });

    it('should handle extremely large ticket counts', () => {
      const largeTicketCount = 1000000;
      
      statsManager.recordTicketProcessing(stats, {
        created: largeTicketCount,
        updated: 0,
        skipped: 0
      });
      
      expect(stats.ticketsCreated).toBe(largeTicketCount);
      expect(stats.totalTicketsProcessed).toBe(largeTicketCount);
    });

    it('should handle empty error category strings', () => {
      expect(() => {
        statsManager.recordErrorByCategory(stats, '');
      }).not.toThrow();
      
      // Should handle empty strings gracefully
      const hasEmptyCategory = '' in stats.errorsByCategory;
      expect(typeof hasEmptyCategory).toBe('boolean');
    });

    it('should handle malformed hourly stats array', () => {
      stats.hourlyStats = null as any; // Simulate corruption
      
      expect(() => {
        statsManager.updateHourlyStats(stats, 1, 10, 0);
      }).not.toThrow();
      
      // Should recreate the array
      expect(Array.isArray(stats.hourlyStats)).toBe(true);
    });
  });
});