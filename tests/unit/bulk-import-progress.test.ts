import { describe, it, expect, vi, beforeEach, afterEach } from '@vitest/globals';

// Import types from data model spec (these don't exist yet - intentionally failing test)
import { 
  BulkImportProgress, 
  SyncProgress, 
  SyncPhase, 
  SyncError 
} from '../../src/models/data-model';

// Mock data factory
interface MockBulkImportProgressOptions {
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
  
  // Base SyncProgress properties
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

// Test factory for creating BulkImportProgress instances
class BulkImportProgressFactory {
  static create(options: MockBulkImportProgressOptions = {}): BulkImportProgress {
    const now = Date.now();
    
    return {
      // Batch processing properties
      currentBatch: options.currentBatch || 1,
      totalBatches: options.totalBatches || 5,
      batchSize: options.batchSize || 50,
      
      // Resume capability
      resumeToken: options.resumeToken || null,
      processedTicketIds: options.processedTicketIds || [],
      
      // Import-specific state
      duplicatesFound: options.duplicatesFound || 0,
      newTicketsCreated: options.newTicketsCreated || 0,
      ticketsUpdated: options.ticketsUpdated || 0,
      
      // User interaction
      allowCancel: options.allowCancel !== undefined ? options.allowCancel : true,
      allowPause: options.allowPause !== undefined ? options.allowPause : true,
      isPaused: options.isPaused || false,
      
      // Base SyncProgress properties
      current: options.current || 25,
      total: options.total || 250,
      processed: options.processed || 20,
      failed: options.failed || 0,
      phase: options.phase || SyncPhase.PROCESSING,
      phaseStartTime: options.phaseStartTime || now - 30000, // 30 seconds ago
      startTime: options.startTime || now - 60000, // 1 minute ago
      estimatedTimeRemaining: options.estimatedTimeRemaining || 120, // 2 minutes
      errors: options.errors || [],
      warnings: options.warnings || [],
      cancellationRequested: options.cancellationRequested || false,
      cancellationToken: options.cancellationToken || null
    };
  }

  static createForScenario(scenario: string): BulkImportProgress {
    const scenarios: Record<string, MockBulkImportProgressOptions> = {
      'starting': {
        currentBatch: 1,
        totalBatches: 10,
        current: 0,
        total: 500,
        processed: 0,
        phase: SyncPhase.INITIALIZING,
        duplicatesFound: 0,
        newTicketsCreated: 0,
        ticketsUpdated: 0
      },
      'mid-progress': {
        currentBatch: 3,
        totalBatches: 8,
        current: 125,
        total: 400,
        processed: 120,
        failed: 5,
        phase: SyncPhase.PROCESSING,
        duplicatesFound: 15,
        newTicketsCreated: 75,
        ticketsUpdated: 30,
        processedTicketIds: Array.from({ length: 120 }, (_, i) => `PROJ-${i + 1}`)
      },
      'paused': {
        currentBatch: 5,
        totalBatches: 12,
        isPaused: true,
        resumeToken: 'resume_batch_5_offset_234',
        current: 234,
        total: 600,
        processed: 230,
        phase: SyncPhase.PROCESSING,
        duplicatesFound: 45,
        newTicketsCreated: 125,
        ticketsUpdated: 60
      },
      'near-completion': {
        currentBatch: 9,
        totalBatches: 10,
        current: 485,
        total: 500,
        processed: 480,
        failed: 5,
        phase: SyncPhase.FINALIZING,
        duplicatesFound: 78,
        newTicketsCreated: 302,
        ticketsUpdated: 100
      },
      'completed': {
        currentBatch: 10,
        totalBatches: 10,
        current: 500,
        total: 500,
        processed: 495,
        failed: 5,
        phase: SyncPhase.COMPLETE,
        duplicatesFound: 95,
        newTicketsCreated: 320,
        ticketsUpdated: 80,
        estimatedTimeRemaining: 0,
        resumeToken: null
      },
      'cancelled': {
        currentBatch: 4,
        totalBatches: 8,
        current: 160,
        total: 400,
        processed: 155,
        failed: 5,
        phase: SyncPhase.CANCELLED,
        cancellationRequested: true,
        cancellationToken: 'cancel_token_12345'
      },
      'with-errors': {
        currentBatch: 6,
        totalBatches: 10,
        current: 280,
        total: 500,
        processed: 250,
        failed: 30,
        phase: SyncPhase.PROCESSING,
        errors: [
          {
            code: 'API_RATE_LIMIT',
            message: 'Rate limit exceeded',
            phase: SyncPhase.DOWNLOADING,
            timestamp: Date.now() - 10000,
            retryAttempt: 2,
            maxRetries: 3,
            ticketId: 'PROJ-123'
          },
          {
            code: 'NETWORK_TIMEOUT',
            message: 'Request timeout',
            phase: SyncPhase.DOWNLOADING,
            timestamp: Date.now() - 5000,
            retryAttempt: 1,
            maxRetries: 3,
            ticketId: 'PROJ-456'
          }
        ],
        warnings: [
          'Ticket PROJ-789 has invalid description format',
          'Custom field missing for PROJ-101'
        ]
      }
    };

    return this.create(scenarios[scenario] || {});
  }
}

describe('BulkImportProgress Data Model', () => {
  describe('Basic Properties and Structure', () => {
    it('should extend SyncProgress interface', () => {
      const progress = BulkImportProgressFactory.create();
      
      // Should have all SyncProgress properties
      expect(progress).toHaveProperty('current');
      expect(progress).toHaveProperty('total');
      expect(progress).toHaveProperty('processed');
      expect(progress).toHaveProperty('failed');
      expect(progress).toHaveProperty('phase');
      expect(progress).toHaveProperty('phaseStartTime');
      expect(progress).toHaveProperty('startTime');
      expect(progress).toHaveProperty('estimatedTimeRemaining');
      expect(progress).toHaveProperty('errors');
      expect(progress).toHaveProperty('warnings');
      expect(progress).toHaveProperty('cancellationRequested');
      expect(progress).toHaveProperty('cancellationToken');
    });

    it('should have bulk import specific properties', () => {
      const progress = BulkImportProgressFactory.create();
      
      // Batch processing properties
      expect(progress).toHaveProperty('currentBatch');
      expect(progress).toHaveProperty('totalBatches');
      expect(progress).toHaveProperty('batchSize');
      
      // Resume capability
      expect(progress).toHaveProperty('resumeToken');
      expect(progress).toHaveProperty('processedTicketIds');
      
      // Import statistics
      expect(progress).toHaveProperty('duplicatesFound');
      expect(progress).toHaveProperty('newTicketsCreated');
      expect(progress).toHaveProperty('ticketsUpdated');
      
      // User interaction
      expect(progress).toHaveProperty('allowCancel');
      expect(progress).toHaveProperty('allowPause');
      expect(progress).toHaveProperty('isPaused');
    });

    it('should have correct default values for new import', () => {
      const progress = BulkImportProgressFactory.createForScenario('starting');
      
      expect(progress.currentBatch).toBe(1);
      expect(progress.processed).toBe(0);
      expect(progress.duplicatesFound).toBe(0);
      expect(progress.newTicketsCreated).toBe(0);
      expect(progress.ticketsUpdated).toBe(0);
      expect(progress.resumeToken).toBeNull();
      expect(progress.processedTicketIds).toEqual([]);
      expect(progress.allowCancel).toBe(true);
      expect(progress.allowPause).toBe(true);
      expect(progress.isPaused).toBe(false);
    });
  });

  describe('Batch Processing Logic', () => {
    it('should correctly track batch progression', () => {
      const progress = BulkImportProgressFactory.createForScenario('mid-progress');
      
      expect(progress.currentBatch).toBe(3);
      expect(progress.totalBatches).toBe(8);
      expect(progress.batchSize).toBe(50);
      
      // Current position should align with batch progress
      const expectedMinCurrent = (progress.currentBatch - 1) * progress.batchSize;
      const expectedMaxCurrent = progress.currentBatch * progress.batchSize;
      expect(progress.current).toBeGreaterThanOrEqual(expectedMinCurrent);
      expect(progress.current).toBeLessThanOrEqual(expectedMaxCurrent);
    });

    it('should calculate correct batch information for different scenarios', () => {
      const scenarios = ['starting', 'mid-progress', 'near-completion', 'completed'];
      
      scenarios.forEach(scenario => {
        const progress = BulkImportProgressFactory.createForScenario(scenario);
        
        expect(progress.currentBatch).toBeGreaterThan(0);
        expect(progress.currentBatch).toBeLessThanOrEqual(progress.totalBatches);
        expect(progress.totalBatches).toBeGreaterThan(0);
        expect(progress.batchSize).toBeGreaterThan(0);
      });
    });

    it('should handle edge case of single batch import', () => {
      const progress = BulkImportProgressFactory.create({
        currentBatch: 1,
        totalBatches: 1,
        batchSize: 25,
        total: 25,
        current: 15,
        processed: 12
      });

      expect(progress.currentBatch).toBe(1);
      expect(progress.totalBatches).toBe(1);
      expect(progress.current).toBeLessThanOrEqual(progress.total);
    });

    it('should handle large batch scenarios correctly', () => {
      const progress = BulkImportProgressFactory.create({
        currentBatch: 47,
        totalBatches: 100,
        batchSize: 100,
        total: 10000,
        current: 4650,
        processed: 4600
      });

      expect(progress.currentBatch).toBe(47);
      expect(progress.totalBatches).toBe(100);
      expect(progress.total).toBe(10000);
      expect(progress.current).toBeGreaterThan(4500);
      expect(progress.processed).toBeLessThanOrEqual(progress.current);
    });
  });

  describe('Resume Token Management', () => {
    it('should handle resume token creation and management', () => {
      const pausedProgress = BulkImportProgressFactory.createForScenario('paused');
      
      expect(pausedProgress.resumeToken).toBe('resume_batch_5_offset_234');
      expect(pausedProgress.isPaused).toBe(true);
      expect(pausedProgress.allowPause).toBe(true);
    });

    it('should clear resume token on completion', () => {
      const completedProgress = BulkImportProgressFactory.createForScenario('completed');
      
      expect(completedProgress.resumeToken).toBeNull();
      expect(completedProgress.isPaused).toBe(false);
      expect(completedProgress.phase).toBe(SyncPhase.COMPLETE);
    });

    it('should maintain resume token during processing', () => {
      const progress = BulkImportProgressFactory.create({
        isPaused: false,
        resumeToken: 'resume_batch_3_offset_150',
        currentBatch: 3,
        current: 150
      });

      expect(progress.resumeToken).toBe('resume_batch_3_offset_150');
      expect(progress.isPaused).toBe(false);
      // Resume token should persist even when not paused (for recovery scenarios)
    });

    it('should track processed ticket IDs for resume capability', () => {
      const progress = BulkImportProgressFactory.createForScenario('mid-progress');
      
      expect(progress.processedTicketIds).toHaveLength(120);
      expect(progress.processedTicketIds[0]).toBe('PROJ-1');
      expect(progress.processedTicketIds[119]).toBe('PROJ-120');
      expect(progress.processed).toBe(120);
    });
  });

  describe('Duplicate Detection and Statistics', () => {
    it('should track all import statistics correctly', () => {
      const progress = BulkImportProgressFactory.createForScenario('mid-progress');
      
      expect(progress.duplicatesFound).toBe(15);
      expect(progress.newTicketsCreated).toBe(75);
      expect(progress.ticketsUpdated).toBe(30);
      
      // Business rule: duplicatesFound + newTicketsCreated + ticketsUpdated = processed
      const totalProcessed = progress.duplicatesFound + progress.newTicketsCreated + progress.ticketsUpdated;
      expect(totalProcessed).toBe(progress.processed);
    });

    it('should enforce business rule: statistics sum equals processed count', () => {
      const testCases = [
        { duplicates: 10, created: 20, updated: 5, expected: 35 },
        { duplicates: 0, created: 100, updated: 0, expected: 100 },
        { duplicates: 25, created: 50, updated: 25, expected: 100 },
        { duplicates: 5, created: 0, updated: 0, expected: 5 }
      ];

      testCases.forEach(({ duplicates, created, updated, expected }) => {
        const progress = BulkImportProgressFactory.create({
          duplicatesFound: duplicates,
          newTicketsCreated: created,
          ticketsUpdated: updated,
          processed: expected
        });

        const sum = progress.duplicatesFound + progress.newTicketsCreated + progress.ticketsUpdated;
        expect(sum).toBe(progress.processed);
        expect(sum).toBe(expected);
      });
    });

    it('should handle edge case of all duplicates', () => {
      const progress = BulkImportProgressFactory.create({
        duplicatesFound: 150,
        newTicketsCreated: 0,
        ticketsUpdated: 0,
        processed: 150
      });

      expect(progress.duplicatesFound).toBe(150);
      expect(progress.newTicketsCreated).toBe(0);
      expect(progress.ticketsUpdated).toBe(0);
      expect(progress.duplicatesFound + progress.newTicketsCreated + progress.ticketsUpdated).toBe(150);
    });

    it('should handle edge case of all new tickets', () => {
      const progress = BulkImportProgressFactory.create({
        duplicatesFound: 0,
        newTicketsCreated: 200,
        ticketsUpdated: 0,
        processed: 200
      });

      expect(progress.newTicketsCreated).toBe(200);
      expect(progress.duplicatesFound).toBe(0);
      expect(progress.ticketsUpdated).toBe(0);
    });
  });

  describe('Pause and Resume State Management', () => {
    it('should handle pause state correctly', () => {
      const pausedProgress = BulkImportProgressFactory.createForScenario('paused');
      
      expect(pausedProgress.isPaused).toBe(true);
      expect(pausedProgress.allowPause).toBe(true);
      expect(pausedProgress.resumeToken).not.toBeNull();
      expect(pausedProgress.phase).toBe(SyncPhase.PROCESSING);
    });

    it('should handle different pause/resume capabilities by phase', () => {
      const phases = [
        { phase: SyncPhase.INITIALIZING, allowPause: false, allowCancel: true },
        { phase: SyncPhase.SEARCHING, allowPause: false, allowCancel: true },
        { phase: SyncPhase.DOWNLOADING, allowPause: true, allowCancel: true },
        { phase: SyncPhase.PROCESSING, allowPause: true, allowCancel: true },
        { phase: SyncPhase.FINALIZING, allowPause: false, allowCancel: false },
        { phase: SyncPhase.COMPLETE, allowPause: false, allowCancel: false },
        { phase: SyncPhase.CANCELLED, allowPause: false, allowCancel: false },
        { phase: SyncPhase.ERROR, allowPause: false, allowCancel: true }
      ];

      phases.forEach(({ phase, allowPause, allowCancel }) => {
        const progress = BulkImportProgressFactory.create({
          phase,
          allowPause,
          allowCancel
        });

        expect(progress.allowPause).toBe(allowPause);
        expect(progress.allowCancel).toBe(allowCancel);
      });
    });

    it('should handle resume from pause state', () => {
      const resumingProgress = BulkImportProgressFactory.create({
        isPaused: false,
        resumeToken: 'resume_batch_5_offset_234', // Token exists but not paused
        currentBatch: 5,
        current: 234,
        phase: SyncPhase.PROCESSING
      });

      expect(resumingProgress.isPaused).toBe(false);
      expect(resumingProgress.resumeToken).not.toBeNull();
      expect(resumingProgress.phase).toBe(SyncPhase.PROCESSING);
    });
  });

  describe('Cancellation Handling', () => {
    it('should handle cancellation state correctly', () => {
      const cancelledProgress = BulkImportProgressFactory.createForScenario('cancelled');
      
      expect(cancelledProgress.cancellationRequested).toBe(true);
      expect(cancelledProgress.cancellationToken).toBe('cancel_token_12345');
      expect(cancelledProgress.phase).toBe(SyncPhase.CANCELLED);
      expect(cancelledProgress.allowCancel).toBe(true); // Can still be true even when already cancelled
    });

    it('should maintain partial progress on cancellation', () => {
      const cancelledProgress = BulkImportProgressFactory.createForScenario('cancelled');
      
      expect(cancelledProgress.processed).toBeGreaterThan(0);
      expect(cancelledProgress.currentBatch).toBeGreaterThan(0);
      expect(cancelledProgress.currentBatch).toBeLessThan(cancelledProgress.totalBatches);
      expect(cancelledProgress.current).toBeLessThan(cancelledProgress.total);
    });
  });

  describe('Error Handling and Recovery', () => {
    it('should track errors with proper structure', () => {
      const progressWithErrors = BulkImportProgressFactory.createForScenario('with-errors');
      
      expect(progressWithErrors.errors).toHaveLength(2);
      expect(progressWithErrors.failed).toBe(30);
      
      const firstError = progressWithErrors.errors[0];
      expect(firstError).toHaveProperty('code');
      expect(firstError).toHaveProperty('message');
      expect(firstError).toHaveProperty('phase');
      expect(firstError).toHaveProperty('timestamp');
      expect(firstError).toHaveProperty('retryAttempt');
      expect(firstError).toHaveProperty('maxRetries');
      expect(firstError).toHaveProperty('ticketId');
      
      expect(firstError.code).toBe('API_RATE_LIMIT');
      expect(firstError.ticketId).toBe('PROJ-123');
      expect(firstError.retryAttempt).toBeLessThanOrEqual(firstError.maxRetries);
    });

    it('should track warnings separately from errors', () => {
      const progressWithErrors = BulkImportProgressFactory.createForScenario('with-errors');
      
      expect(progressWithErrors.warnings).toHaveLength(2);
      expect(progressWithErrors.warnings[0]).toContain('PROJ-789');
      expect(progressWithErrors.warnings[1]).toContain('PROJ-101');
      
      // Warnings don't affect failed count
      expect(progressWithErrors.failed).not.toEqual(progressWithErrors.warnings.length);
    });

    it('should handle retry logic in error tracking', () => {
      const progress = BulkImportProgressFactory.create({
        errors: [
          {
            code: 'NETWORK_TIMEOUT',
            message: 'Connection timeout',
            phase: SyncPhase.DOWNLOADING,
            timestamp: Date.now(),
            retryAttempt: 3,
            maxRetries: 3,
            ticketId: 'PROJ-999'
          }
        ],
        failed: 1
      });

      const error = progress.errors[0];
      expect(error.retryAttempt).toBe(error.maxRetries);
      expect(progress.failed).toBe(1);
    });
  });

  describe('Progress Calculation and Timing', () => {
    it('should calculate progress percentage correctly', () => {
      const progress = BulkImportProgressFactory.createForScenario('mid-progress');
      
      const progressPercentage = (progress.current / progress.total) * 100;
      expect(progressPercentage).toBeGreaterThan(0);
      expect(progressPercentage).toBeLessThan(100);
      expect(progressPercentage).toBeCloseTo(31.25); // 125/400 * 100
    });

    it('should have realistic timing estimates', () => {
      const progress = BulkImportProgressFactory.createForScenario('mid-progress');
      
      expect(progress.startTime).toBeLessThan(Date.now());
      expect(progress.phaseStartTime).toBeGreaterThan(progress.startTime);
      expect(progress.phaseStartTime).toBeLessThan(Date.now());
      
      if (progress.estimatedTimeRemaining !== null) {
        expect(progress.estimatedTimeRemaining).toBeGreaterThan(0);
      }
    });

    it('should handle completed state timing', () => {
      const completedProgress = BulkImportProgressFactory.createForScenario('completed');
      
      expect(completedProgress.current).toBe(completedProgress.total);
      expect(completedProgress.estimatedTimeRemaining).toBe(0);
      expect(completedProgress.phase).toBe(SyncPhase.COMPLETE);
    });
  });

  describe('Integration with SyncPhase Enum', () => {
    it('should support all SyncPhase values', () => {
      const phases = [
        SyncPhase.INITIALIZING,
        SyncPhase.SEARCHING,
        SyncPhase.DOWNLOADING,
        SyncPhase.PROCESSING,
        SyncPhase.FINALIZING,
        SyncPhase.COMPLETE,
        SyncPhase.CANCELLED,
        SyncPhase.ERROR
      ];

      phases.forEach(phase => {
        const progress = BulkImportProgressFactory.create({ phase });
        expect(progress.phase).toBe(phase);
      });
    });

    it('should have appropriate states for each phase', () => {
      // Test that certain combinations make sense
      const processingProgress = BulkImportProgressFactory.create({
        phase: SyncPhase.PROCESSING,
        allowPause: true,
        allowCancel: true
      });
      expect(processingProgress.allowPause).toBe(true);
      expect(processingProgress.allowCancel).toBe(true);

      const finalizingProgress = BulkImportProgressFactory.create({
        phase: SyncPhase.FINALIZING,
        allowPause: false,
        allowCancel: false
      });
      expect(finalizingProgress.allowPause).toBe(false);
      expect(finalizingProgress.allowCancel).toBe(false);
    });
  });

  describe('Business Logic Validation', () => {
    it('should validate that current never exceeds total', () => {
      const progress = BulkImportProgressFactory.create({
        current: 150,
        total: 200
      });

      expect(progress.current).toBeLessThanOrEqual(progress.total);
    });

    it('should validate that processed never exceeds current', () => {
      const progress = BulkImportProgressFactory.create({
        current: 150,
        processed: 140,
        failed: 10
      });

      expect(progress.processed).toBeLessThanOrEqual(progress.current);
      expect(progress.processed + progress.failed).toBeLessThanOrEqual(progress.current);
    });

    it('should validate that currentBatch is within totalBatches', () => {
      const progress = BulkImportProgressFactory.create({
        currentBatch: 7,
        totalBatches: 10
      });

      expect(progress.currentBatch).toBeGreaterThan(0);
      expect(progress.currentBatch).toBeLessThanOrEqual(progress.totalBatches);
    });

    it('should validate statistical consistency across scenarios', () => {
      const scenarios = ['starting', 'mid-progress', 'near-completion', 'completed'];
      
      scenarios.forEach(scenario => {
        const progress = BulkImportProgressFactory.createForScenario(scenario);
        
        // Statistics should sum to processed
        const statsSum = progress.duplicatesFound + progress.newTicketsCreated + progress.ticketsUpdated;
        expect(statsSum).toBe(progress.processed);
        
        // All statistics should be non-negative
        expect(progress.duplicatesFound).toBeGreaterThanOrEqual(0);
        expect(progress.newTicketsCreated).toBeGreaterThanOrEqual(0);
        expect(progress.ticketsUpdated).toBeGreaterThanOrEqual(0);
        
        // Processed should not exceed current
        expect(progress.processed).toBeLessThanOrEqual(progress.current);
        
        // Current should not exceed total
        expect(progress.current).toBeLessThanOrEqual(progress.total);
      });
    });
  });
});