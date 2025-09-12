/**
 * Factory for creating SyncProgress test data
 * Provides realistic sync progress data, error scenarios, and bulk import progress
 * Supports the comprehensive SyncProgress data model testing
 */

// Note: These imports will also fail initially until the actual implementation is created
// This is part of the TDD approach - factories are created alongside tests
import { 
  SyncProgress, 
  SyncPhase, 
  SyncError,
  BulkImportProgress
} from '../../src/enhanced-sync/sync-progress-model';

/**
 * Options for customizing sync progress
 */
export interface SyncProgressOptions {
  current?: number;
  total?: number;
  processed?: number;
  failed?: number;
  phase?: SyncPhase;
  phaseStartTime?: number;
  startTime?: number;
  estimatedTimeRemaining?: number | null;
  errors?: SyncError[];
  warnings?: string[];
  cancellationRequested?: boolean;
  cancellationToken?: string | null;
}

/**
 * Options for customizing bulk import progress
 */
export interface BulkImportProgressOptions extends SyncProgressOptions {
  currentBatch?: number;
  totalBatches?: number;
  batchSize?: number;
  resumeToken?: string | null;
  processedTicketIds?: string[];
  duplicatesFound?: number;
  newTicketsCreated?: number;
  ticketsUpdated?: number;
  allowCancel?: boolean;
  allowPause?: boolean;
  isPaused?: boolean;
}

/**
 * Options for customizing sync errors
 */
export interface SyncErrorOptions {
  code?: string;
  message?: string;
  phase?: SyncPhase;
  timestamp?: number;
  originalError?: Error;
  apiResponse?: {
    status: number;
    statusText: string;
    body: any;
  };
  retryAttempt?: number;
  maxRetries?: number;
  nextRetryAt?: number;
  ticketId?: string;
  userAction?: string;
}

/**
 * Preset sync progress scenarios
 */
export type SyncProgressScenario = 
  | 'fresh-start'
  | 'in-progress'
  | 'nearly-complete'
  | 'completed'
  | 'cancelled'
  | 'error-state'
  | 'bulk-import'
  | 'with-errors'
  | 'with-warnings'
  | 'rate-limited'
  | 'network-issues'
  | 'fast-sync'
  | 'slow-sync'
  | 'paused'
  | 'resumed';

/**
 * Factory class for creating sync progress test data
 */
export class SyncProgressFactory {

  /**
   * Creates basic sync progress with optional overrides
   */
  static createSyncProgress(options: SyncProgressOptions = {}): SyncProgress {
    const now = Date.now();
    
    return {
      current: options.current ?? 0,
      total: options.total ?? 100,
      processed: options.processed ?? 0,
      failed: options.failed ?? 0,
      phase: options.phase ?? SyncPhase.INITIALIZING,
      phaseStartTime: options.phaseStartTime ?? now,
      startTime: options.startTime ?? now,
      estimatedTimeRemaining: options.estimatedTimeRemaining ?? null,
      errors: options.errors ?? [],
      warnings: options.warnings ?? [],
      cancellationRequested: options.cancellationRequested ?? false,
      cancellationToken: options.cancellationToken ?? null
    };
  }

  /**
   * Creates sync progress based on preset scenarios
   */
  static createScenarioProgress(scenario: SyncProgressScenario): SyncProgress {
    const now = Date.now();
    const scenarios: Record<SyncProgressScenario, SyncProgressOptions> = {
      'fresh-start': {
        current: 0,
        total: 100,
        processed: 0,
        failed: 0,
        phase: SyncPhase.INITIALIZING,
        startTime: now
      },
      'in-progress': {
        current: 45,
        total: 100,
        processed: 42,
        failed: 3,
        phase: SyncPhase.DOWNLOADING,
        startTime: now - 30000, // 30 seconds ago
        phaseStartTime: now - 10000, // 10 seconds in current phase
        estimatedTimeRemaining: 20000 // 20 seconds remaining
      },
      'nearly-complete': {
        current: 95,
        total: 100,
        processed: 93,
        failed: 2,
        phase: SyncPhase.FINALIZING,
        startTime: now - 120000, // 2 minutes ago
        phaseStartTime: now - 5000, // 5 seconds in finalizing
        estimatedTimeRemaining: 3000 // 3 seconds remaining
      },
      'completed': {
        current: 100,
        total: 100,
        processed: 98,
        failed: 2,
        phase: SyncPhase.COMPLETE,
        startTime: now - 180000, // 3 minutes ago
        phaseStartTime: now - 1000, // Just completed
        estimatedTimeRemaining: 0
      },
      'cancelled': {
        current: 35,
        total: 100,
        processed: 30,
        failed: 5,
        phase: SyncPhase.CANCELLED,
        startTime: now - 60000, // 1 minute ago
        cancellationRequested: true,
        cancellationToken: 'user-cancel-' + now,
        estimatedTimeRemaining: 0
      },
      'error-state': {
        current: 25,
        total: 100,
        processed: 20,
        failed: 5,
        phase: SyncPhase.ERROR,
        startTime: now - 45000, // 45 seconds ago
        errors: this.createTypicalErrors(3),
        estimatedTimeRemaining: null
      },
      'bulk-import': {
        current: 150,
        total: 500,
        processed: 140,
        failed: 10,
        phase: SyncPhase.PROCESSING,
        startTime: now - 300000, // 5 minutes ago
        phaseStartTime: now - 120000, // 2 minutes in processing
        estimatedTimeRemaining: 600000 // 10 minutes remaining
      },
      'with-errors': {
        current: 60,
        total: 100,
        processed: 55,
        failed: 5,
        phase: SyncPhase.DOWNLOADING,
        startTime: now - 90000,
        errors: this.createTypicalErrors(5),
        warnings: ['Some warnings occurred during processing']
      },
      'with-warnings': {
        current: 80,
        total: 100,
        processed: 80,
        failed: 0,
        phase: SyncPhase.PROCESSING,
        startTime: now - 150000,
        warnings: [
          'Issue TEST-001 has invalid priority, using default',
          'Issue TEST-002 missing description field',
          'Issue TEST-003 has unsupported status'
        ]
      },
      'rate-limited': {
        current: 40,
        total: 200,
        processed: 35,
        failed: 5,
        phase: SyncPhase.DOWNLOADING,
        startTime: now - 240000, // 4 minutes ago, slow due to rate limiting
        phaseStartTime: now - 180000, // 3 minutes in downloading
        estimatedTimeRemaining: 480000, // 8 minutes remaining (slow)
        errors: this.createRateLimitErrors(3),
        warnings: ['API rate limit detected, slowing down requests']
      },
      'network-issues': {
        current: 15,
        total: 100,
        processed: 10,
        failed: 5,
        phase: SyncPhase.SEARCHING,
        startTime: now - 60000,
        errors: this.createNetworkErrors(5),
        estimatedTimeRemaining: null // Can't estimate with network issues
      },
      'fast-sync': {
        current: 90,
        total: 100,
        processed: 90,
        failed: 0,
        phase: SyncPhase.PROCESSING,
        startTime: now - 30000, // 30 seconds for 90 items - very fast
        phaseStartTime: now - 5000,
        estimatedTimeRemaining: 2000 // 2 seconds remaining
      },
      'slow-sync': {
        current: 20,
        total: 100,
        processed: 18,
        failed: 2,
        phase: SyncPhase.DOWNLOADING,
        startTime: now - 600000, // 10 minutes for only 20 items - very slow
        phaseStartTime: now - 300000, // 5 minutes in downloading
        estimatedTimeRemaining: 2400000, // 40 minutes remaining
        warnings: ['Large attachments detected, sync may be slower']
      },
      'paused': {
        current: 50,
        total: 150,
        processed: 45,
        failed: 5,
        phase: SyncPhase.DOWNLOADING,
        startTime: now - 180000, // 3 minutes ago
        phaseStartTime: now - 60000, // 1 minute in current phase
        estimatedTimeRemaining: null // Paused, can't estimate
      },
      'resumed': {
        current: 75,
        total: 150,
        processed: 70,
        failed: 5,
        phase: SyncPhase.PROCESSING,
        startTime: now - 300000, // 5 minutes ago total
        phaseStartTime: now - 30000, // 30 seconds since resuming
        estimatedTimeRemaining: 60000 // 1 minute remaining
      }
    };

    return this.createSyncProgress(scenarios[scenario]);
  }

  /**
   * Creates bulk import progress with optional overrides
   */
  static createBulkImportProgress(options: BulkImportProgressOptions = {}): BulkImportProgress {
    const baseProgress = this.createSyncProgress(options);
    const now = Date.now();

    return {
      ...baseProgress,
      currentBatch: options.currentBatch ?? 1,
      totalBatches: options.totalBatches ?? 5,
      batchSize: options.batchSize ?? 50,
      resumeToken: options.resumeToken ?? null,
      processedTicketIds: options.processedTicketIds ?? [],
      duplicatesFound: options.duplicatesFound ?? 0,
      newTicketsCreated: options.newTicketsCreated ?? 0,
      ticketsUpdated: options.ticketsUpdated ?? 0,
      allowCancel: options.allowCancel ?? true,
      allowPause: options.allowPause ?? true,
      isPaused: options.isPaused ?? false
    };
  }

  /**
   * Creates bulk import progress for specific scenarios
   */
  static createBulkImportScenario(scenario: 'small' | 'large' | 'paused' | 'resumed' | 'with-duplicates'): BulkImportProgress {
    const now = Date.now();
    
    const scenarios = {
      small: this.createBulkImportProgress({
        current: 50,
        total: 100,
        processed: 48,
        failed: 2,
        currentBatch: 2,
        totalBatches: 4,
        batchSize: 25,
        duplicatesFound: 5,
        newTicketsCreated: 35,
        ticketsUpdated: 8,
        processedTicketIds: Array.from({ length: 48 }, (_, i) => `TEST-${i + 1}`)
      }),
      large: this.createBulkImportProgress({
        current: 750,
        total: 2000,
        processed: 720,
        failed: 30,
        currentBatch: 15,
        totalBatches: 40,
        batchSize: 50,
        duplicatesFound: 150,
        newTicketsCreated: 450,
        ticketsUpdated: 120,
        phase: SyncPhase.DOWNLOADING,
        startTime: now - 1800000, // 30 minutes ago
        estimatedTimeRemaining: 2400000, // 40 minutes remaining
        processedTicketIds: Array.from({ length: 720 }, (_, i) => `BULK-${i + 1}`)
      }),
      paused: this.createBulkImportProgress({
        current: 300,
        total: 800,
        processed: 280,
        failed: 20,
        currentBatch: 6,
        totalBatches: 16,
        batchSize: 50,
        isPaused: true,
        resumeToken: `pause-${now}`,
        duplicatesFound: 50,
        newTicketsCreated: 180,
        ticketsUpdated: 50,
        processedTicketIds: Array.from({ length: 280 }, (_, i) => `PAUSE-${i + 1}`)
      }),
      resumed: this.createBulkImportProgress({
        current: 450,
        total: 800,
        processed: 420,
        failed: 30,
        currentBatch: 9,
        totalBatches: 16,
        batchSize: 50,
        isPaused: false,
        resumeToken: `resume-${now - 300000}`, // Resumed 5 minutes ago
        duplicatesFound: 80,
        newTicketsCreated: 250,
        ticketsUpdated: 90,
        phaseStartTime: now - 300000, // Started current phase when resumed
        processedTicketIds: Array.from({ length: 420 }, (_, i) => `RESUME-${i + 1}`)
      }),
      'with-duplicates': this.createBulkImportProgress({
        current: 200,
        total: 300,
        processed: 190,
        failed: 10,
        currentBatch: 4,
        totalBatches: 6,
        batchSize: 50,
        duplicatesFound: 120, // High duplicate rate
        newTicketsCreated: 50,
        ticketsUpdated: 20,
        warnings: [
          'High duplicate rate detected',
          '60% of tickets already exist in vault'
        ],
        processedTicketIds: Array.from({ length: 190 }, (_, i) => `DUP-${i + 1}`)
      })
    };

    return scenarios[scenario];
  }

  /**
   * Creates sync error with optional overrides
   */
  static createSyncError(options: SyncErrorOptions = {}): SyncError {
    const now = Date.now();
    
    return {
      code: options.code ?? 'GENERIC_ERROR',
      message: options.message ?? 'An error occurred during sync',
      phase: options.phase ?? SyncPhase.PROCESSING,
      timestamp: options.timestamp ?? now,
      originalError: options.originalError,
      apiResponse: options.apiResponse,
      retryAttempt: options.retryAttempt ?? 0,
      maxRetries: options.maxRetries ?? 3,
      nextRetryAt: options.nextRetryAt,
      ticketId: options.ticketId,
      userAction: options.userAction
    };
  }

  /**
   * Creates typical sync errors for testing
   */
  static createTypicalErrors(count: number = 3): SyncError[] {
    const errorTemplates = [
      {
        code: 'API_RATE_LIMIT',
        message: 'Rate limit exceeded, please try again later',
        phase: SyncPhase.DOWNLOADING
      },
      {
        code: 'NETWORK_TIMEOUT',
        message: 'Request timed out while fetching issue details',
        phase: SyncPhase.DOWNLOADING
      },
      {
        code: 'VAULT_WRITE_FAILED',
        message: 'Failed to write ticket file to vault',
        phase: SyncPhase.PROCESSING
      },
      {
        code: 'INVALID_JQL',
        message: 'JQL query syntax is invalid',
        phase: SyncPhase.SEARCHING
      },
      {
        code: 'API_AUTH_FAILED',
        message: 'Authentication failed - check API token',
        phase: SyncPhase.SEARCHING
      },
      {
        code: 'PARSE_ERROR',
        message: 'Failed to parse issue data from API response',
        phase: SyncPhase.PROCESSING
      }
    ];

    return errorTemplates.slice(0, count).map((template, index) => 
      this.createSyncError({
        ...template,
        ticketId: `TEST-${String(index + 1).padStart(3, '0')}`,
        retryAttempt: index % 3,
        maxRetries: 3,
        timestamp: Date.now() + index * 1000
      })
    );
  }

  /**
   * Creates rate limit specific errors
   */
  static createRateLimitErrors(count: number): SyncError[] {
    return Array.from({ length: count }, (_, index) => 
      this.createSyncError({
        code: 'API_RATE_LIMIT',
        message: `Rate limit exceeded (attempt ${index + 1})`,
        phase: SyncPhase.DOWNLOADING,
        retryAttempt: index,
        maxRetries: 5,
        nextRetryAt: Date.now() + (Math.pow(2, index) * 60000), // Exponential backoff
        ticketId: `RATE-${String(index + 1).padStart(3, '0')}`,
        apiResponse: {
          status: 429,
          statusText: 'Too Many Requests',
          body: {
            errorMessages: ['Rate limit exceeded'],
            errors: {}
          }
        }
      })
    );
  }

  /**
   * Creates network specific errors
   */
  static createNetworkErrors(count: number): SyncError[] {
    const networkErrorTypes = [
      { code: 'NETWORK_TIMEOUT', message: 'Connection timeout' },
      { code: 'NETWORK_OFFLINE', message: 'No network connection' },
      { code: 'NETWORK_ERROR', message: 'Network request failed' },
      { code: 'DNS_ERROR', message: 'DNS resolution failed' },
      { code: 'SSL_ERROR', message: 'SSL certificate error' }
    ];

    return Array.from({ length: count }, (_, index) => {
      const errorType = networkErrorTypes[index % networkErrorTypes.length];
      return this.createSyncError({
        ...errorType,
        phase: index < 2 ? SyncPhase.SEARCHING : SyncPhase.DOWNLOADING,
        retryAttempt: index,
        maxRetries: 3,
        ticketId: `NET-${String(index + 1).padStart(3, '0')}`,
        originalError: new Error(`Network error ${index + 1}`)
      });
    });
  }

  /**
   * Creates progress with realistic timing data
   */
  static createProgressWithTiming(scenario: 'linear' | 'accelerating' | 'decelerating'): SyncProgress {
    const now = Date.now();
    const total = 100;

    const scenarios = {
      linear: {
        // Steady 1 item per second
        current: 30,
        total,
        processed: 30,
        startTime: now - 30000,
        estimatedTimeRemaining: 70000
      },
      accelerating: {
        // Started slow, getting faster
        current: 40,
        total,
        processed: 40,
        startTime: now - 60000, // 60 seconds for 40 items, but accelerating
        estimatedTimeRemaining: 45000 // Less than linear estimate
      },
      decelerating: {
        // Started fast, getting slower (rate limiting)
        current: 20,
        total,
        processed: 18,
        failed: 2,
        startTime: now - 60000, // 60 seconds for only 20 items
        estimatedTimeRemaining: 240000, // Much longer than linear
        warnings: ['Rate limiting detected, requests slowing down']
      }
    };

    return this.createSyncProgress(scenarios[scenario]);
  }

  /**
   * Creates progress data for phase transition testing
   */
  static createPhaseTransitionSequence(): Array<{ phase: SyncPhase; duration: number; progress: number }> {
    return [
      { phase: SyncPhase.INITIALIZING, duration: 1000, progress: 0 },
      { phase: SyncPhase.SEARCHING, duration: 5000, progress: 5 },
      { phase: SyncPhase.DOWNLOADING, duration: 30000, progress: 70 },
      { phase: SyncPhase.PROCESSING, duration: 15000, progress: 95 },
      { phase: SyncPhase.FINALIZING, duration: 2000, progress: 99 },
      { phase: SyncPhase.COMPLETE, duration: 0, progress: 100 }
    ];
  }

  /**
   * Creates mock progress update function for testing
   */
  static createMockProgressCallback(): {
    callback: vi.Mock;
    getUpdates: () => Array<SyncProgress>;
    getLastUpdate: () => SyncProgress | null;
    waitForPhase: (phase: SyncPhase, timeout?: number) => Promise<void>;
  } {
    const updates: SyncProgress[] = [];
    const callback = vi.fn((progress: SyncProgress) => {
      updates.push({ ...progress });
    });

    return {
      callback,
      getUpdates: () => [...updates],
      getLastUpdate: () => updates[updates.length - 1] || null,
      waitForPhase: async (phase: SyncPhase, timeout: number = 5000) => {
        const startTime = Date.now();
        while (Date.now() - startTime < timeout) {
          const lastUpdate = updates[updates.length - 1];
          if (lastUpdate && lastUpdate.phase === phase) {
            return;
          }
          await new Promise(resolve => setTimeout(resolve, 10));
        }
        throw new Error(`Timeout waiting for phase: ${phase}`);
      }
    };
  }

  /**
   * Validates progress data consistency
   */
  static validateProgressConsistency(progress: SyncProgress): {
    isValid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    // Basic numeric validation
    if (progress.current < 0) errors.push('Current cannot be negative');
    if (progress.total < 0) errors.push('Total cannot be negative');
    if (progress.processed < 0) errors.push('Processed cannot be negative');
    if (progress.failed < 0) errors.push('Failed cannot be negative');

    // Progress relationship validation
    if (progress.current > progress.total) {
      errors.push('Current cannot exceed total');
    }
    if (progress.processed + progress.failed > progress.current) {
      errors.push('Processed + failed cannot exceed current');
    }

    // Timing validation
    if (progress.phaseStartTime < progress.startTime) {
      errors.push('Phase start time cannot be before overall start time');
    }

    // Phase validation
    if (progress.phase === SyncPhase.COMPLETE && progress.current < progress.total) {
      errors.push('Cannot be complete with current < total');
    }

    // Cancellation validation
    if (progress.cancellationRequested && !progress.cancellationToken) {
      errors.push('Cancellation requested but no token provided');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }
}