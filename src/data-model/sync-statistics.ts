/**
 * SyncStatistics Data Model
 * 
 * Aggregated metrics for sync operations monitoring with rolling averages,
 * time-series data management, and counter overflow prevention.
 */

export interface SyncStatistics {
  // Overall metrics
  totalSyncOperations: number;
  successfulSyncs: number;
  failedSyncs: number;
  
  // Timing metrics
  averageSyncDuration: number;    // Seconds
  lastSyncDuration: number;       // Seconds
  longestSyncDuration: number;    // Seconds
  
  // Volume metrics
  totalTicketsProcessed: number;
  ticketsCreated: number;
  ticketsUpdated: number;
  ticketsSkipped: number;         // Duplicates or filtered out
  
  // Error tracking
  errorsByCategory: Record<string, number>; // Error code → count
  consecutiveFailures: number;
  
  // Performance metrics
  averageTicketsPerSecond: number;
  apiCallsThisHour: number;       // Rate limiting tracking
  
  // Time series data (last 24 hours)
  hourlyStats: Array<{
    hour: number;                 // Unix timestamp rounded to hour
    syncs: number;
    tickets: number;
    errors: number;
  }>;
}

export interface TicketProcessingRecord {
  created: number;
  updated: number;
  skipped: number;
}

export interface ErrorCategorySummary {
  totalErrors: number;
  mostCommonError: string;
  categoriesCount: number;
}

export interface HourlyStatsEntry {
  hour: number;
  syncs: number;
  tickets: number;
  errors: number;
}

/**
 * Manager class for SyncStatistics operations including aggregation,
 * rolling averages calculation, and time-series data management.
 */
export class SyncStatisticsManager {
  // Constants for overflow prevention
  private static readonly MAX_SAFE_COUNTER = Number.MAX_SAFE_INTEGER / 2;
  private static readonly HOUR_IN_MS = 60 * 60 * 1000;
  private static readonly MAX_HOURLY_ENTRIES = 24;

  /**
   * Records a successful sync operation with duration and ticket count
   * @param timestamp Optional timestamp for testing - uses Date.now() if not provided
   */
  recordSuccessfulSync(stats: SyncStatistics, duration: number, ticketCount: number, timestamp?: number): void {
    // Handle negative or invalid duration
    if (duration < 0) {
      duration = 0;
    }

    stats.totalSyncOperations++;
    stats.successfulSyncs++;
    stats.consecutiveFailures = 0; // Reset on success
    stats.lastSyncDuration = duration;

    // Update longest duration
    if (duration > stats.longestSyncDuration) {
      stats.longestSyncDuration = duration;
    }

    // Calculate rolling average duration (only for successful syncs)
    this.updateAverageDuration(stats, duration);

    // Calculate tickets per second and update average
    this.updateTicketsPerSecond(stats, duration, ticketCount);

    // Update hourly stats
    this.updateHourlyStats(stats, 1, ticketCount, 0, timestamp);
  }

  /**
   * Records a failed sync operation with error categorization
   * @param timestamp Optional timestamp for testing - uses Date.now() if not provided
   */
  recordFailedSync(stats: SyncStatistics, errorCode: string, timestamp?: number): void {
    stats.totalSyncOperations++;
    stats.failedSyncs++;
    stats.consecutiveFailures++;

    // Record error by category
    this.recordErrorByCategory(stats, errorCode);

    // Update hourly stats (1 sync, 0 tickets, 1 error)
    this.updateHourlyStats(stats, 1, 0, 1, timestamp);
  }

  /**
   * Records ticket processing results
   */
  recordTicketProcessing(stats: SyncStatistics, record: TicketProcessingRecord): void {
    stats.ticketsCreated += record.created;
    stats.ticketsUpdated += record.updated;
    stats.ticketsSkipped += record.skipped;
    stats.totalTicketsProcessed += record.created + record.updated + record.skipped;
  }

  /**
   * Records API calls for rate limiting tracking
   */
  recordApiCalls(stats: SyncStatistics, callCount: number): void {
    stats.apiCallsThisHour += callCount;
  }

  /**
   * Resets hourly API call counter (called at hour boundaries)
   */
  resetHourlyApiCalls(stats: SyncStatistics): void {
    stats.apiCallsThisHour = 0;
  }

  /**
   * Records an error by category
   */
  recordErrorByCategory(stats: SyncStatistics, errorCode: string): void {
    if (!stats.errorsByCategory[errorCode]) {
      stats.errorsByCategory[errorCode] = 0;
    }
    stats.errorsByCategory[errorCode]++;
  }

  /**
   * Gets summary of error categories
   */
  getErrorCategorySummary(stats: SyncStatistics): ErrorCategorySummary {
    const entries = Object.entries(stats.errorsByCategory);
    const totalErrors = entries.reduce((sum, [_, count]) => sum + count, 0);
    
    let mostCommonError = '';
    let maxCount = 0;
    
    for (const [errorCode, count] of entries) {
      if (count > maxCount) {
        maxCount = count;
        mostCommonError = errorCode;
      }
    }

    return {
      totalErrors,
      mostCommonError,
      categoriesCount: entries.length
    };
  }

  /**
   * Creates a new hourly stats entry
   */
  createHourlyEntry(timestamp: number): HourlyStatsEntry {
    // Round timestamp to hour boundary
    const hour = Math.floor(timestamp / SyncStatisticsManager.HOUR_IN_MS) * SyncStatisticsManager.HOUR_IN_MS;
    
    return {
      hour,
      syncs: 0,
      tickets: 0,
      errors: 0
    };
  }

  /**
   * Updates hourly statistics
   * @param timestamp Optional timestamp for testing - uses Date.now() if not provided
   */
  updateHourlyStats(stats: SyncStatistics, syncs: number, tickets: number, errors: number, timestamp?: number): void {
    // Initialize hourlyStats if corrupted
    if (!Array.isArray(stats.hourlyStats)) {
      stats.hourlyStats = [];
    }

    const currentTimestamp = timestamp ?? Date.now();
    const currentHour = Math.floor(currentTimestamp / SyncStatisticsManager.HOUR_IN_MS) * SyncStatisticsManager.HOUR_IN_MS;

    // Find or create entry for current hour
    let currentEntry = stats.hourlyStats.find(entry => entry.hour === currentHour);
    
    if (!currentEntry) {
      currentEntry = this.createHourlyEntry(currentTimestamp);
      stats.hourlyStats.push(currentEntry);
      
      // Sort by hour to maintain chronological order
      stats.hourlyStats.sort((a, b) => a.hour - b.hour);
      
      // Maintain rolling window of 24 hours maximum
      if (stats.hourlyStats.length > SyncStatisticsManager.MAX_HOURLY_ENTRIES) {
        stats.hourlyStats = stats.hourlyStats.slice(-SyncStatisticsManager.MAX_HOURLY_ENTRIES);
      }
    }

    // Update entry
    currentEntry.syncs += syncs;
    currentEntry.tickets += tickets;
    currentEntry.errors += errors;
  }

  /**
   * Gets total syncs in last 24 hours
   */
  getTotalSyncsLast24Hours(stats: SyncStatistics): number {
    return stats.hourlyStats.reduce((total, entry) => total + entry.syncs, 0);
  }

  /**
   * Gets total tickets processed in last 24 hours
   */
  getTotalTicketsLast24Hours(stats: SyncStatistics): number {
    return stats.hourlyStats.reduce((total, entry) => total + entry.tickets, 0);
  }

  /**
   * Gets total errors in last 24 hours
   */
  getTotalErrorsLast24Hours(stats: SyncStatistics): number {
    return stats.hourlyStats.reduce((total, entry) => total + entry.errors, 0);
  }

  /**
   * Gets hourly stats for a specific time range
   */
  getHourlyStatsRange(stats: SyncStatistics, fromHour: number, toHour: number): HourlyStatsEntry[] {
    const fromHourRounded = Math.floor(fromHour / SyncStatisticsManager.HOUR_IN_MS) * SyncStatisticsManager.HOUR_IN_MS;
    const toHourRounded = Math.floor(toHour / SyncStatisticsManager.HOUR_IN_MS) * SyncStatisticsManager.HOUR_IN_MS;
    
    return stats.hourlyStats.filter(entry => entry.hour >= fromHourRounded && entry.hour <= toHourRounded);
  }

  /**
   * Checks if counters are approaching overflow
   */
  isCounterNearOverflow(stats: SyncStatistics): boolean {
    return stats.totalSyncOperations > SyncStatisticsManager.MAX_SAFE_COUNTER ||
           stats.totalTicketsProcessed > SyncStatisticsManager.MAX_SAFE_COUNTER;
  }

  /**
   * Prevents counter overflow by resetting counters while preserving ratios
   */
  preventCounterOverflow(stats: SyncStatistics): void {
    if (this.isCounterNearOverflow(stats)) {
      this.resetCountersWithRatioPreservation(stats);
    }
  }

  /**
   * Resets counters while preserving statistical relationships
   */
  resetCountersWithRatioPreservation(stats: SyncStatistics): void {
    if (stats.totalSyncOperations === 0) return;

    // Store original values
    const originalTotal = stats.totalSyncOperations;
    
    // Calculate ratios before reset
    const successRatio = stats.successfulSyncs / stats.totalSyncOperations;
    const failRatio = stats.failedSyncs / stats.totalSyncOperations;
    
    // Scale down to safe values while maintaining ratios
    // Use a smaller divisor to avoid losing precision when floored
    const scaledTotal = Math.max(Math.floor(stats.totalSyncOperations / 100), 10);
    const scaledSuccess = Math.round(scaledTotal * successRatio); // Use round instead of floor
    const scaledFailures = scaledTotal - scaledSuccess;

    // Calculate scale factor BEFORE updating the values
    const scaleFactor = scaledTotal / originalTotal;

    // Update sync counters
    stats.totalSyncOperations = scaledTotal;
    stats.successfulSyncs = scaledSuccess;
    stats.failedSyncs = scaledFailures;

    // Scale other counters proportionally
    stats.totalTicketsProcessed = Math.floor(stats.totalTicketsProcessed * scaleFactor);
    stats.ticketsCreated = Math.floor(stats.ticketsCreated * scaleFactor);
    stats.ticketsUpdated = Math.floor(stats.ticketsUpdated * scaleFactor);
    stats.ticketsSkipped = Math.floor(stats.ticketsSkipped * scaleFactor);
  }

  /**
   * Schedules periodic reset and returns preserved data
   */
  schedulePeriodicReset(stats: SyncStatistics): Partial<SyncStatistics> {
    return {
      averageSyncDuration: stats.averageSyncDuration,
      longestSyncDuration: stats.longestSyncDuration,
      errorsByCategory: { ...stats.errorsByCategory },
      averageTicketsPerSecond: stats.averageTicketsPerSecond
    };
  }

  /**
   * Creates a fresh statistics object with default values
   */
  createFreshStatistics(): SyncStatistics {
    return {
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
  }

  /**
   * Validates statistics object structure
   */
  validateStatisticsStructure(stats: any): stats is SyncStatistics {
    const requiredFields = [
      'totalSyncOperations', 'successfulSyncs', 'failedSyncs',
      'averageSyncDuration', 'lastSyncDuration', 'longestSyncDuration',
      'totalTicketsProcessed', 'ticketsCreated', 'ticketsUpdated', 'ticketsSkipped',
      'errorsByCategory', 'consecutiveFailures', 'averageTicketsPerSecond',
      'apiCallsThisHour', 'hourlyStats'
    ];

    return requiredFields.every(field => field in stats) &&
           typeof stats.errorsByCategory === 'object' &&
           Array.isArray(stats.hourlyStats);
  }

  /**
   * Repairs a corrupted statistics object by filling missing fields
   */
  repairStatistics(corruptedStats: any): SyncStatistics {
    const fresh = this.createFreshStatistics();
    
    // Copy valid fields from corrupted stats
    for (const [key, value] of Object.entries(corruptedStats)) {
      if (key in fresh && typeof value === typeof fresh[key as keyof SyncStatistics]) {
        (fresh as any)[key] = value;
      }
    }

    return fresh;
  }

  /**
   * Updates average sync duration using rolling average
   */
  private updateAverageDuration(stats: SyncStatistics, newDuration: number): void {
    if (stats.successfulSyncs === 1) {
      // First successful sync
      stats.averageSyncDuration = newDuration;
    } else {
      // Rolling average calculation
      const totalDuration = stats.averageSyncDuration * (stats.successfulSyncs - 1);
      stats.averageSyncDuration = (totalDuration + newDuration) / stats.successfulSyncs;
    }
  }

  /**
   * Updates tickets per second average
   */
  private updateTicketsPerSecond(stats: SyncStatistics, duration: number, ticketCount: number): void {
    if (duration === 0) {
      // Handle zero duration gracefully - don't update rate
      return;
    }

    const ticketsPerSecond = ticketCount / duration;
    
    if (stats.successfulSyncs === 1) {
      // First successful sync
      stats.averageTicketsPerSecond = ticketsPerSecond;
    } else {
      // Rolling average calculation
      const totalRate = stats.averageTicketsPerSecond * (stats.successfulSyncs - 1);
      stats.averageTicketsPerSecond = (totalRate + ticketsPerSecond) / stats.successfulSyncs;
    }
  }
}