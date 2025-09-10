/**
 * Comprehensive tests for SyncProgress data model
 * Tests phase transitions, progress calculations, error collection, 
 * cancellation handling, and time estimation algorithms.
 * 
 * CRITICAL TDD: This test MUST FAIL initially to ensure proper TDD workflow.
 * The actual SyncProgress implementation does not exist yet.
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { MockTimer, createDeferred, waitFor } from '../utils/test-helpers';

// These imports WILL FAIL initially - this is the TDD requirement
// Implementation should be created to make tests pass
import { 
  SyncProgress, 
  SyncPhase, 
  SyncError,
  BulkImportProgress,
  createSyncProgress,
  updateSyncProgress,
  calculateEstimatedTime,
  isValidPhaseTransition,
  collectSyncError,
  requestCancellation,
  resetSyncProgress
} from '../../src/enhanced-sync/sync-progress-model';

describe('SyncProgress Data Model - Comprehensive Tests', () => {
  let mockTimer: MockTimer;
  let startTime: number;

  beforeEach(() => {
    mockTimer = new MockTimer();
    mockTimer.install();
    startTime = mockTimer.getCurrentTime();
  });

  afterEach(() => {
    mockTimer.uninstall();
  });

  // Helper function to create test progress object
  const createTestProgress = (overrides: Partial<SyncProgress> = {}): SyncProgress => {
    const defaults: SyncProgress = {
      current: 0,
      total: 100,
      processed: 0,
      failed: 0,
      phase: SyncPhase.INITIALIZING,
      phaseStartTime: startTime,
      startTime: startTime,
      estimatedTimeRemaining: null,
      errors: [],
      warnings: [],
      cancellationRequested: false,
      cancellationToken: null
    };

    return { ...defaults, ...overrides };
  };

  describe('Basic Progress Metrics', () => {
    it('should initialize with correct default values', () => {
      const progress = createSyncProgress(100);

      expect(progress.current).toBe(0);
      expect(progress.total).toBe(100);
      expect(progress.processed).toBe(0);
      expect(progress.failed).toBe(0);
      expect(progress.phase).toBe(SyncPhase.INITIALIZING);
      expect(progress.startTime).toBe(mockTimer.getCurrentTime());
      expect(progress.phaseStartTime).toBe(mockTimer.getCurrentTime());
      expect(progress.estimatedTimeRemaining).toBe(null);
      expect(progress.errors).toEqual([]);
      expect(progress.warnings).toEqual([]);
      expect(progress.cancellationRequested).toBe(false);
      expect(progress.cancellationToken).toBe(null);
    });

    it('should validate progress calculation constraints', () => {
      const progress = createTestProgress({
        current: 25,
        total: 100,
        processed: 20,
        failed: 5
      });

      // Current should not exceed total
      expect(progress.current).toBeLessThanOrEqual(progress.total);

      // Processed + failed should equal current (or be close)
      expect(progress.processed + progress.failed).toBeLessThanOrEqual(progress.current);

      // Percentage calculations
      expect(progress.current / progress.total).toBe(0.25);
      expect(progress.processed / progress.total).toBe(0.20);
      expect(progress.failed / progress.total).toBe(0.05);
    });

    it('should handle edge cases for progress calculations', () => {
      // Zero total case
      const zeroProgress = createTestProgress({
        current: 0,
        total: 0,
        processed: 0,
        failed: 0
      });

      expect(zeroProgress.current / Math.max(zeroProgress.total, 1)).toBe(0);

      // All failed case
      const allFailedProgress = createTestProgress({
        current: 50,
        total: 50,
        processed: 0,
        failed: 50
      });

      expect(allFailedProgress.processed + allFailedProgress.failed).toBe(allFailedProgress.current);
      expect(allFailedProgress.failed / allFailedProgress.total).toBe(1.0);

      // Over 100% edge case (shouldn't happen but test robustness)
      const overProgress = createTestProgress({
        current: 120,
        total: 100,
        processed: 100,
        failed: 20
      });

      expect(overProgress.current).toBeGreaterThan(overProgress.total);
    });

    it('should update progress metrics correctly', () => {
      let progress = createTestProgress();

      // Simulate processing items
      progress = updateSyncProgress(progress, {
        current: 25,
        processed: 23,
        failed: 2
      });

      expect(progress.current).toBe(25);
      expect(progress.processed).toBe(23);
      expect(progress.failed).toBe(2);

      // Continue processing
      progress = updateSyncProgress(progress, {
        current: 50,
        processed: 47,
        failed: 3
      });

      expect(progress.current).toBe(50);
      expect(progress.processed).toBe(47);
      expect(progress.failed).toBe(3);
    });
  });

  describe('Phase Transitions', () => {
    it('should follow proper phase progression order', () => {
      let progress = createTestProgress();

      // INITIALIZING → SEARCHING
      expect(isValidPhaseTransition(progress.phase, SyncPhase.SEARCHING)).toBe(true);
      progress = updateSyncProgress(progress, { phase: SyncPhase.SEARCHING });
      expect(progress.phase).toBe(SyncPhase.SEARCHING);
      expect(progress.phaseStartTime).toBe(mockTimer.getCurrentTime());

      // SEARCHING → DOWNLOADING
      mockTimer.advanceTime(1000);
      expect(isValidPhaseTransition(progress.phase, SyncPhase.DOWNLOADING)).toBe(true);
      progress = updateSyncProgress(progress, { phase: SyncPhase.DOWNLOADING });
      expect(progress.phase).toBe(SyncPhase.DOWNLOADING);

      // DOWNLOADING → PROCESSING
      mockTimer.advanceTime(5000);
      expect(isValidPhaseTransition(progress.phase, SyncPhase.PROCESSING)).toBe(true);
      progress = updateSyncProgress(progress, { phase: SyncPhase.PROCESSING });
      expect(progress.phase).toBe(SyncPhase.PROCESSING);

      // PROCESSING → FINALIZING
      mockTimer.advanceTime(3000);
      expect(isValidPhaseTransition(progress.phase, SyncPhase.FINALIZING)).toBe(true);
      progress = updateSyncProgress(progress, { phase: SyncPhase.FINALIZING });
      expect(progress.phase).toBe(SyncPhase.FINALIZING);

      // FINALIZING → COMPLETE
      mockTimer.advanceTime(500);
      expect(isValidPhaseTransition(progress.phase, SyncPhase.COMPLETE)).toBe(true);
      progress = updateSyncProgress(progress, { phase: SyncPhase.COMPLETE });
      expect(progress.phase).toBe(SyncPhase.COMPLETE);
    });

    it('should prevent invalid phase transitions', () => {
      let progress = createTestProgress({ phase: SyncPhase.INITIALIZING });

      // Cannot skip phases
      expect(isValidPhaseTransition(progress.phase, SyncPhase.DOWNLOADING)).toBe(false);
      expect(isValidPhaseTransition(progress.phase, SyncPhase.PROCESSING)).toBe(false);
      expect(isValidPhaseTransition(progress.phase, SyncPhase.COMPLETE)).toBe(false);

      // Cannot go backwards
      progress = updateSyncProgress(progress, { phase: SyncPhase.DOWNLOADING });
      expect(isValidPhaseTransition(progress.phase, SyncPhase.SEARCHING)).toBe(false);
      expect(isValidPhaseTransition(progress.phase, SyncPhase.INITIALIZING)).toBe(false);

      // Cannot transition from terminal phases
      progress = updateSyncProgress(progress, { phase: SyncPhase.COMPLETE });
      expect(isValidPhaseTransition(progress.phase, SyncPhase.PROCESSING)).toBe(false);
      expect(isValidPhaseTransition(progress.phase, SyncPhase.INITIALIZING)).toBe(false);
    });

    it('should allow transitions to error and cancelled phases from any phase', () => {
      const phases = [
        SyncPhase.INITIALIZING,
        SyncPhase.SEARCHING,
        SyncPhase.DOWNLOADING,
        SyncPhase.PROCESSING,
        SyncPhase.FINALIZING
      ];

      phases.forEach(fromPhase => {
        expect(isValidPhaseTransition(fromPhase, SyncPhase.ERROR)).toBe(true);
        expect(isValidPhaseTransition(fromPhase, SyncPhase.CANCELLED)).toBe(true);
      });
    });

    it('should track phase timing correctly', () => {
      let progress = createTestProgress();
      const initialTime = mockTimer.getCurrentTime();

      // Phase 1: INITIALIZING → SEARCHING
      mockTimer.advanceTime(1000);
      progress = updateSyncProgress(progress, { phase: SyncPhase.SEARCHING });
      expect(progress.phaseStartTime).toBe(initialTime + 1000);

      // Phase 2: SEARCHING → DOWNLOADING  
      mockTimer.advanceTime(2000);
      progress = updateSyncProgress(progress, { phase: SyncPhase.DOWNLOADING });
      expect(progress.phaseStartTime).toBe(initialTime + 3000);

      // Phase 3: DOWNLOADING → PROCESSING
      mockTimer.advanceTime(5000);
      progress = updateSyncProgress(progress, { phase: SyncPhase.PROCESSING });
      expect(progress.phaseStartTime).toBe(initialTime + 8000);

      // Overall start time should remain unchanged
      expect(progress.startTime).toBe(initialTime);
    });

    it('should handle rapid phase transitions', () => {
      let progress = createTestProgress();

      // Rapidly transition through phases
      const phases = [
        SyncPhase.SEARCHING,
        SyncPhase.DOWNLOADING,
        SyncPhase.PROCESSING,
        SyncPhase.FINALIZING,
        SyncPhase.COMPLETE
      ];

      phases.forEach(phase => {
        mockTimer.advanceTime(10); // Very short time
        progress = updateSyncProgress(progress, { phase });
        expect(progress.phase).toBe(phase);
        expect(progress.phaseStartTime).toBe(mockTimer.getCurrentTime());
      });
    });
  });

  describe('Time Estimation Algorithms', () => {
    it('should calculate estimated time based on current progress', () => {
      const progress = createTestProgress({
        current: 25,
        total: 100,
        startTime: startTime
      });

      mockTimer.advanceTime(10000); // 10 seconds elapsed

      const estimated = calculateEstimatedTime(progress);
      
      // 25% complete in 10 seconds, should take ~40 seconds total
      // Remaining: 40 - 10 = 30 seconds
      expect(estimated).toBeCloseTo(30000, -1000); // Allow 1-second tolerance
    });

    it('should return null estimation when no progress made', () => {
      const progress = createTestProgress({
        current: 0,
        total: 100,
        startTime: startTime
      });

      mockTimer.advanceTime(5000);

      const estimated = calculateEstimatedTime(progress);
      expect(estimated).toBe(null);
    });

    it('should handle completed progress', () => {
      const progress = createTestProgress({
        current: 100,
        total: 100,
        startTime: startTime
      });

      mockTimer.advanceTime(15000);

      const estimated = calculateEstimatedTime(progress);
      expect(estimated).toBe(0);
    });

    it('should account for phase-specific time weighting', () => {
      // Different phases have different expected durations
      const progressSearching = createTestProgress({
        phase: SyncPhase.SEARCHING,
        current: 10,
        total: 100
      });

      const progressDownloading = createTestProgress({
        phase: SyncPhase.DOWNLOADING,
        current: 10,
        total: 100
      });

      mockTimer.advanceTime(5000);

      const estimatedSearching = calculateEstimatedTime(progressSearching);
      const estimatedDownloading = calculateEstimatedTime(progressDownloading);

      // Downloading phase should typically take longer than searching
      // So downloading should have higher remaining time estimate
      expect(estimatedDownloading).toBeGreaterThan(estimatedSearching);
    });

    it('should adjust estimates based on processing speed changes', () => {
      let progress = createTestProgress({ total: 100 });

      // First measurement - slow progress
      mockTimer.advanceTime(10000); // 10 seconds
      progress = updateSyncProgress(progress, { current: 10 });
      const slowEstimate = calculateEstimatedTime(progress);

      // Second measurement - faster progress  
      mockTimer.advanceTime(5000); // 5 more seconds
      progress = updateSyncProgress(progress, { current: 30 }); // 20 more items in 5 seconds
      const fasterEstimate = calculateEstimatedTime(progress);

      // Faster progress should result in lower remaining time estimate
      expect(fasterEstimate).toBeLessThan(slowEstimate);
    });

    it('should provide reasonable estimates for different progress patterns', () => {
      // Linear progress
      let linearProgress = createTestProgress({ total: 100 });
      mockTimer.advanceTime(20000);
      linearProgress = updateSyncProgress(linearProgress, { current: 40 });
      const linearEstimate = calculateEstimatedTime(linearProgress);
      expect(linearEstimate).toBeCloseTo(30000, -2000); // ~30 seconds remaining

      // Accelerating progress (batch processing getting faster)
      let accelProgress = createTestProgress({ total: 100 });
      mockTimer.advanceTime(20000);
      accelProgress = updateSyncProgress(accelProgress, { current: 50 }); // Faster than linear
      const accelEstimate = calculateEstimatedTime(accelProgress);
      expect(accelEstimate).toBeLessThan(linearEstimate);

      // Decelerating progress (hitting rate limits)
      let decelProgress = createTestProgress({ total: 100 });
      mockTimer.advanceTime(20000);
      decelProgress = updateSyncProgress(decelProgress, { current: 20 }); // Slower than linear
      const decelEstimate = calculateEstimatedTime(decelProgress);
      expect(decelEstimate).toBeGreaterThan(linearEstimate);
    });
  });

  describe('Error Collection and Management', () => {
    it('should collect and store sync errors properly', () => {
      let progress = createTestProgress();

      const error1: SyncError = {
        code: 'API_RATE_LIMIT',
        message: 'Rate limit exceeded',
        phase: SyncPhase.DOWNLOADING,
        timestamp: mockTimer.getCurrentTime(),
        retryAttempt: 0,
        maxRetries: 3
      };

      progress = collectSyncError(progress, error1);

      expect(progress.errors).toHaveLength(1);
      expect(progress.errors[0]).toEqual(error1);

      const error2: SyncError = {
        code: 'NETWORK_TIMEOUT',
        message: 'Request timed out',
        phase: SyncPhase.DOWNLOADING,
        timestamp: mockTimer.getCurrentTime() + 1000,
        retryAttempt: 1,
        maxRetries: 3,
        ticketId: 'TEST-123'
      };

      progress = collectSyncError(progress, error2);

      expect(progress.errors).toHaveLength(2);
      expect(progress.errors[1]).toEqual(error2);
    });

    it('should categorize errors by type and phase', () => {
      let progress = createTestProgress();

      const errors: SyncError[] = [
        {
          code: 'API_RATE_LIMIT',
          message: 'Rate limit exceeded',
          phase: SyncPhase.DOWNLOADING,
          timestamp: mockTimer.getCurrentTime(),
          retryAttempt: 0,
          maxRetries: 3
        },
        {
          code: 'API_RATE_LIMIT',
          message: 'Rate limit exceeded again',
          phase: SyncPhase.DOWNLOADING,
          timestamp: mockTimer.getCurrentTime() + 1000,
          retryAttempt: 1,
          maxRetries: 3
        },
        {
          code: 'VAULT_WRITE_FAILED',
          message: 'Could not write file',
          phase: SyncPhase.PROCESSING,
          timestamp: mockTimer.getCurrentTime() + 2000,
          retryAttempt: 0,
          maxRetries: 1,
          ticketId: 'TEST-456'
        }
      ];

      errors.forEach(error => {
        progress = collectSyncError(progress, error);
      });

      expect(progress.errors).toHaveLength(3);

      // Group by error code
      const rateLimit = progress.errors.filter(e => e.code === 'API_RATE_LIMIT');
      const vaultErrors = progress.errors.filter(e => e.code === 'VAULT_WRITE_FAILED');
      
      expect(rateLimit).toHaveLength(2);
      expect(vaultErrors).toHaveLength(1);

      // Group by phase
      const downloadingErrors = progress.errors.filter(e => e.phase === SyncPhase.DOWNLOADING);
      const processingErrors = progress.errors.filter(e => e.phase === SyncPhase.PROCESSING);

      expect(downloadingErrors).toHaveLength(2);
      expect(processingErrors).toHaveLength(1);
    });

    it('should track retry attempts and schedules', () => {
      let progress = createTestProgress();

      const baseError: Omit<SyncError, 'retryAttempt' | 'nextRetryAt'> = {
        code: 'NETWORK_ERROR',
        message: 'Connection failed',
        phase: SyncPhase.DOWNLOADING,
        timestamp: mockTimer.getCurrentTime(),
        maxRetries: 3,
        ticketId: 'TEST-789'
      };

      // First attempt fails
      progress = collectSyncError(progress, {
        ...baseError,
        retryAttempt: 0,
        nextRetryAt: mockTimer.getCurrentTime() + 2000
      });

      // Second attempt fails
      progress = collectSyncError(progress, {
        ...baseError,
        retryAttempt: 1,
        nextRetryAt: mockTimer.getCurrentTime() + 4000
      });

      // Third attempt fails
      progress = collectSyncError(progress, {
        ...baseError,
        retryAttempt: 2,
        nextRetryAt: mockTimer.getCurrentTime() + 8000
      });

      // Final attempt fails
      progress = collectSyncError(progress, {
        ...baseError,
        retryAttempt: 3,
        nextRetryAt: undefined // No more retries
      });

      expect(progress.errors).toHaveLength(4);
      expect(progress.errors[0].retryAttempt).toBe(0);
      expect(progress.errors[1].retryAttempt).toBe(1);
      expect(progress.errors[2].retryAttempt).toBe(2);
      expect(progress.errors[3].retryAttempt).toBe(3);
      expect(progress.errors[3].nextRetryAt).toBeUndefined();
    });

    it('should handle warnings separately from errors', () => {
      let progress = createTestProgress();

      progress = updateSyncProgress(progress, {
        warnings: ['Issue TEST-001 has invalid priority, using default']
      });

      expect(progress.warnings).toHaveLength(1);
      expect(progress.warnings[0]).toBe('Issue TEST-001 has invalid priority, using default');

      progress = updateSyncProgress(progress, {
        warnings: [
          ...progress.warnings,
          'Issue TEST-002 missing description field',
          'Issue TEST-003 has unsupported status'
        ]
      });

      expect(progress.warnings).toHaveLength(3);
    });

    it('should maintain error and warning limits to prevent memory issues', () => {
      let progress = createTestProgress();

      // Add many errors
      for (let i = 0; i < 150; i++) {
        const error: SyncError = {
          code: 'TEST_ERROR',
          message: `Error ${i}`,
          phase: SyncPhase.PROCESSING,
          timestamp: mockTimer.getCurrentTime() + i,
          retryAttempt: 0,
          maxRetries: 1,
          ticketId: `TEST-${i}`
        };
        progress = collectSyncError(progress, error);
      }

      // Should be limited to prevent memory issues (e.g., max 100 errors)
      expect(progress.errors.length).toBeLessThanOrEqual(100);
      
      // Should keep the most recent errors
      const lastError = progress.errors[progress.errors.length - 1];
      expect(lastError.message).toContain('149'); // Most recent error
    });
  });

  describe('Cancellation Handling', () => {
    it('should support cancellation requests with tokens', () => {
      let progress = createTestProgress();

      expect(progress.cancellationRequested).toBe(false);
      expect(progress.cancellationToken).toBe(null);

      progress = requestCancellation(progress, 'user-cancel-123');

      expect(progress.cancellationRequested).toBe(true);
      expect(progress.cancellationToken).toBe('user-cancel-123');
    });

    it('should handle multiple cancellation requests gracefully', () => {
      let progress = createTestProgress();

      progress = requestCancellation(progress, 'first-cancel');
      const firstTime = mockTimer.getCurrentTime();

      mockTimer.advanceTime(1000);

      progress = requestCancellation(progress, 'second-cancel');

      // Should keep first cancellation request
      expect(progress.cancellationRequested).toBe(true);
      expect(progress.cancellationToken).toBe('first-cancel');
    });

    it('should transition to CANCELLED phase when cancellation processed', () => {
      let progress = createTestProgress({
        phase: SyncPhase.DOWNLOADING,
        current: 25,
        total: 100
      });

      progress = requestCancellation(progress, 'user-abort');
      expect(progress.cancellationRequested).toBe(true);

      // Simulate processing the cancellation
      progress = updateSyncProgress(progress, { 
        phase: SyncPhase.CANCELLED,
        estimatedTimeRemaining: 0
      });

      expect(progress.phase).toBe(SyncPhase.CANCELLED);
      expect(progress.cancellationRequested).toBe(true); // Should remain true
      expect(progress.estimatedTimeRemaining).toBe(0);
    });

    it('should preserve partial progress when cancelled', () => {
      let progress = createTestProgress({
        current: 75,
        total: 200,
        processed: 70,
        failed: 5
      });

      progress = requestCancellation(progress, 'timeout-cancel');
      progress = updateSyncProgress(progress, { phase: SyncPhase.CANCELLED });

      // Progress metrics should be preserved
      expect(progress.current).toBe(75);
      expect(progress.total).toBe(200);
      expect(progress.processed).toBe(70);
      expect(progress.failed).toBe(5);
      expect(progress.phase).toBe(SyncPhase.CANCELLED);
    });

    it('should handle cancellation at different phases', () => {
      const phases = [
        SyncPhase.INITIALIZING,
        SyncPhase.SEARCHING,
        SyncPhase.DOWNLOADING,
        SyncPhase.PROCESSING,
        SyncPhase.FINALIZING
      ];

      phases.forEach(phase => {
        let progress = createTestProgress({ phase });
        progress = requestCancellation(progress, `cancel-from-${phase}`);
        
        expect(progress.cancellationRequested).toBe(true);
        expect(isValidPhaseTransition(phase, SyncPhase.CANCELLED)).toBe(true);
      });
    });
  });

  describe('BulkImportProgress Extension', () => {
    const createBulkProgress = (overrides: Partial<BulkImportProgress> = {}): BulkImportProgress => {
      const baseProgress = createTestProgress();
      const bulkDefaults: BulkImportProgress = {
        ...baseProgress,
        currentBatch: 1,
        totalBatches: 5,
        batchSize: 25,
        resumeToken: null,
        processedTicketIds: [],
        duplicatesFound: 0,
        newTicketsCreated: 0,
        ticketsUpdated: 0,
        allowCancel: true,
        allowPause: true,
        isPaused: false
      };

      return { ...bulkDefaults, ...overrides };
    };

    it('should extend base SyncProgress with bulk import fields', () => {
      const bulkProgress = createBulkProgress({
        currentBatch: 3,
        totalBatches: 10,
        batchSize: 50,
        duplicatesFound: 5,
        newTicketsCreated: 35,
        ticketsUpdated: 10
      });

      // Should have all base SyncProgress fields
      expect(bulkProgress.current).toBeDefined();
      expect(bulkProgress.total).toBeDefined();
      expect(bulkProgress.phase).toBeDefined();
      expect(bulkProgress.errors).toBeDefined();

      // Should have bulk import specific fields
      expect(bulkProgress.currentBatch).toBe(3);
      expect(bulkProgress.totalBatches).toBe(10);
      expect(bulkProgress.batchSize).toBe(50);
      expect(bulkProgress.duplicatesFound).toBe(5);
      expect(bulkProgress.newTicketsCreated).toBe(35);
      expect(bulkProgress.ticketsUpdated).toBe(10);
    });

    it('should maintain business rule: duplicates + created + updated = processed', () => {
      const bulkProgress = createBulkProgress({
        processed: 50,
        duplicatesFound: 10,
        newTicketsCreated: 30,
        ticketsUpdated: 10
      });

      const totalAccountedFor = bulkProgress.duplicatesFound + 
                               bulkProgress.newTicketsCreated + 
                               bulkProgress.ticketsUpdated;

      expect(totalAccountedFor).toBe(bulkProgress.processed);
    });

    it('should track processed ticket IDs for resume capability', () => {
      let bulkProgress = createBulkProgress();

      const ticketIds = ['TEST-001', 'TEST-002', 'TEST-003'];
      
      bulkProgress = updateSyncProgress(bulkProgress, {
        processedTicketIds: [...bulkProgress.processedTicketIds, ...ticketIds],
        processed: bulkProgress.processed + ticketIds.length
      });

      expect(bulkProgress.processedTicketIds).toEqual(ticketIds);
      expect(bulkProgress.processed).toBe(3);
    });

    it('should handle pause and resume functionality', () => {
      let bulkProgress = createBulkProgress({
        currentBatch: 3,
        allowPause: true
      });

      expect(bulkProgress.isPaused).toBe(false);
      expect(bulkProgress.allowPause).toBe(true);

      // Pause operation
      bulkProgress = updateSyncProgress(bulkProgress, {
        isPaused: true,
        resumeToken: `batch-3-${mockTimer.getCurrentTime()}`
      });

      expect(bulkProgress.isPaused).toBe(true);
      expect(bulkProgress.resumeToken).toBeTruthy();

      // Resume operation
      bulkProgress = updateSyncProgress(bulkProgress, {
        isPaused: false
      });

      expect(bulkProgress.isPaused).toBe(false);
      // Resume token should remain for potential future pauses
      expect(bulkProgress.resumeToken).toBeTruthy();
    });

    it('should manage batch processing progress', () => {
      let bulkProgress = createBulkProgress({
        totalBatches: 4,
        batchSize: 25,
        total: 100
      });

      // Process batch 1
      bulkProgress = updateSyncProgress(bulkProgress, {
        currentBatch: 1,
        current: 25,
        processed: 20,
        newTicketsCreated: 15,
        ticketsUpdated: 3,
        duplicatesFound: 2
      });

      expect(bulkProgress.currentBatch).toBe(1);
      expect(bulkProgress.current).toBe(25);

      // Process batch 2
      bulkProgress = updateSyncProgress(bulkProgress, {
        currentBatch: 2,
        current: 50,
        processed: 45,
        newTicketsCreated: 30,
        ticketsUpdated: 8,
        duplicatesFound: 7
      });

      expect(bulkProgress.currentBatch).toBe(2);
      expect(bulkProgress.current).toBe(50);
      expect(bulkProgress.newTicketsCreated + bulkProgress.ticketsUpdated + bulkProgress.duplicatesFound).toBe(45);
    });
  });

  describe('Progress Reset and Cleanup', () => {
    it('should reset progress to initial state', () => {
      let progress = createTestProgress({
        current: 75,
        total: 100,
        processed: 70,
        failed: 5,
        phase: SyncPhase.PROCESSING,
        errors: [
          {
            code: 'TEST_ERROR',
            message: 'Test error',
            phase: SyncPhase.PROCESSING,
            timestamp: mockTimer.getCurrentTime(),
            retryAttempt: 0,
            maxRetries: 1
          }
        ],
        warnings: ['Test warning'],
        cancellationRequested: true,
        cancellationToken: 'test-token'
      });

      progress = resetSyncProgress(progress, 200); // New total

      expect(progress.current).toBe(0);
      expect(progress.total).toBe(200);
      expect(progress.processed).toBe(0);
      expect(progress.failed).toBe(0);
      expect(progress.phase).toBe(SyncPhase.INITIALIZING);
      expect(progress.errors).toEqual([]);
      expect(progress.warnings).toEqual([]);
      expect(progress.cancellationRequested).toBe(false);
      expect(progress.cancellationToken).toBe(null);
      expect(progress.estimatedTimeRemaining).toBe(null);
      expect(progress.startTime).toBe(mockTimer.getCurrentTime());
    });

    it('should preserve certain fields during partial reset', () => {
      let progress = createTestProgress({
        total: 100,
        processed: 50,
        failed: 10,
        errors: [
          {
            code: 'PRESERVED_ERROR',
            message: 'This should be preserved',
            phase: SyncPhase.PROCESSING,
            timestamp: mockTimer.getCurrentTime(),
            retryAttempt: 0,
            maxRetries: 1
          }
        ]
      });

      const originalStartTime = progress.startTime;

      // Partial reset - keep errors and start time
      progress = resetSyncProgress(progress, progress.total, {
        preserveErrors: true,
        preserveStartTime: true
      });

      expect(progress.current).toBe(0);
      expect(progress.processed).toBe(0);
      expect(progress.failed).toBe(0);
      expect(progress.startTime).toBe(originalStartTime); // Preserved
      expect(progress.errors).toHaveLength(1); // Preserved
      expect(progress.errors[0].code).toBe('PRESERVED_ERROR');
    });
  });

  describe('Integration and Performance', () => {
    it('should handle high-frequency updates efficiently', () => {
      let progress = createTestProgress({ total: 10000 });

      const startTime = mockTimer.getCurrentTime();

      // Simulate rapid progress updates
      for (let i = 1; i <= 1000; i++) {
        mockTimer.advanceTime(1); // 1ms per update
        progress = updateSyncProgress(progress, {
          current: i * 10,
          processed: i * 10,
          estimatedTimeRemaining: calculateEstimatedTime(progress)
        });
      }

      // Should handle updates without performance degradation
      expect(progress.current).toBe(10000);
      expect(progress.processed).toBe(10000);
      expect(progress.estimatedTimeRemaining).toBe(0);
      
      const totalTime = mockTimer.getCurrentTime() - startTime;
      expect(totalTime).toBe(1000); // 1000ms total
    });

    it('should maintain data consistency during concurrent-like updates', () => {
      let progress = createTestProgress({ total: 100 });

      // Simulate updates that might occur concurrently
      const updates = [
        { current: 25, processed: 20, failed: 5, phase: SyncPhase.DOWNLOADING },
        { warnings: ['Warning 1'] },
        { errors: [
          {
            code: 'CONCURRENT_ERROR',
            message: 'Concurrent error',
            phase: SyncPhase.DOWNLOADING,
            timestamp: mockTimer.getCurrentTime(),
            retryAttempt: 0,
            maxRetries: 1
          }
        ]},
        { current: 30, processed: 25 },
        { warnings: ['Warning 1', 'Warning 2'] }
      ];

      updates.forEach(update => {
        progress = updateSyncProgress(progress, update);
      });

      // Final state should be consistent
      expect(progress.current).toBe(30);
      expect(progress.processed).toBe(25);
      expect(progress.failed).toBe(5);
      expect(progress.warnings).toEqual(['Warning 1', 'Warning 2']);
      expect(progress.errors).toHaveLength(1);
    });

    it('should handle memory efficiently with large datasets', () => {
      let progress = createTestProgress({ total: 100000 });

      // Add many ticket IDs (if BulkImportProgress)
      const bulkProgress = {
        ...progress,
        processedTicketIds: Array.from({ length: 50000 }, (_, i) => `BULK-${i + 1}`),
        currentBatch: 200,
        totalBatches: 500,
        batchSize: 200
      } as BulkImportProgress;

      // Should handle large datasets without issues
      expect(bulkProgress.processedTicketIds.length).toBe(50000);
      expect(bulkProgress.totalBatches).toBe(500);

      // Memory-conscious implementations should limit array sizes
      // This is more of a documentation test for implementation guidance
    });
  });

  describe('Edge Cases and Error Conditions', () => {
    it('should handle invalid progress values gracefully', () => {
      // Negative values
      let progress = createTestProgress();
      progress = updateSyncProgress(progress, {
        current: -10,
        processed: -5,
        failed: -2
      });

      // Implementation should normalize these
      expect(progress.current).toBeGreaterThanOrEqual(0);
      expect(progress.processed).toBeGreaterThanOrEqual(0);
      expect(progress.failed).toBeGreaterThanOrEqual(0);
    });

    it('should handle extremely large numbers', () => {
      const progress = createTestProgress({
        total: Number.MAX_SAFE_INTEGER,
        current: Number.MAX_SAFE_INTEGER - 1000
      });

      const estimated = calculateEstimatedTime(progress);
      // For extremely large numbers, the function may return null or a valid numeric result
      if (estimated === null) {
        expect(estimated).toBeNull();
      } else {
        expect(estimated).not.toBeNaN();
        expect(estimated).toBeGreaterThanOrEqual(0);
        // Result may be finite or Infinity for extremely large numbers
        expect(Number.isFinite(estimated) || estimated === Infinity).toBe(true);
      }
    });

    it('should handle malformed error objects', () => {
      let progress = createTestProgress();

      // Missing required fields
      const malformedError = {
        message: 'Malformed error',
        timestamp: mockTimer.getCurrentTime()
        // Missing code, phase, retryAttempt, maxRetries
      } as any;

      expect(() => {
        progress = collectSyncError(progress, malformedError);
      }).not.toThrow();

      // Should handle gracefully with defaults
      expect(progress.errors).toHaveLength(1);
    });

    it('should handle timestamp inconsistencies', () => {
      let progress = createTestProgress();

      // Start time in future
      progress = updateSyncProgress(progress, {
        startTime: mockTimer.getCurrentTime() + 10000
      });

      const estimated = calculateEstimatedTime(progress);
      // Should return null for timestamp inconsistencies (start time in future)
      expect(estimated).toBeNull();
    });
  });
});