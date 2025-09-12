import { describe, it, expect, vi, beforeEach, afterEach } from '@vitest/globals';
import { 
  JQLAutoSyncConfig, 
  BulkImportProgress, 
  SyncProgress, 
  SyncPhase, 
  SyncError,
  validateJQLAutoSyncConfig,
  transitionEnabled,
  transitionSyncInProgress,
  transitionSyncCompleted,
  serializeJQLAutoSyncConfig,
  deserializeJQLAutoSyncConfig
} from '../../src/data-model/jql-auto-sync-config';

/**
 * JQLAutoSyncConfig Data Model Tests
 * 
 * Testing the core data model for JQL-based auto-sync as specified in:
 * specs/001-jql-auto-sync/data-model.md
 * 
 * CRITICAL TDD REQUIREMENT: These tests MUST FAIL initially
 * The JQLAutoSyncConfig interface and validation logic do not exist yet.
 * 
 * Tests cover:
 * - Validation rules for syncInterval (1-60), batchSize (10-100), etc.
 * - State transitions (enabled, syncInProgress)
 * - Configuration serialization/deserialization
 * - Type safety and constraints
 */
describe('JQLAutoSyncConfig Data Model Tests', () => {

  describe('Default Configuration Creation', () => {
    it('should create a valid default JQLAutoSyncConfig', () => {
      // EXPECTED TO FAIL: JQLAutoSyncConfig interface doesn't exist yet
      const defaultConfig: JQLAutoSyncConfig = {
        enabled: false,
        jqlQuery: '',
        validateQuery: true,
        syncInterval: 15,
        lastSyncTime: null,
        maxResults: 1000,
        batchSize: 50,
        syncInProgress: false,
        failedSyncCount: 0,
        lastError: null,
        bulkImportInProgress: false,
        bulkImportProgress: null
      };

      expect(defaultConfig.enabled).toBe(false);
      expect(defaultConfig.syncInterval).toBe(15);
      expect(defaultConfig.batchSize).toBe(50);
      expect(defaultConfig.maxResults).toBe(1000);
      expect(defaultConfig.validateQuery).toBe(true);
      expect(defaultConfig.syncInProgress).toBe(false);
      expect(defaultConfig.bulkImportInProgress).toBe(false);
    });
  });

  describe('Validation Rules', () => {
    describe('syncInterval validation', () => {
      it('should reject syncInterval below 1 minute', () => {
        // EXPECTED TO FAIL: Validation function doesn't exist
        const invalidConfig = {
          enabled: true,
          jqlQuery: 'project = TEST',
          validateQuery: true,
          syncInterval: 0, // Invalid: below minimum
          lastSyncTime: null,
          maxResults: 1000,
          batchSize: 50,
          syncInProgress: false,
          failedSyncCount: 0,
          lastError: null,
          bulkImportInProgress: false,
          bulkImportProgress: null
        };

        expect(() => validateJQLAutoSyncConfig(invalidConfig)).toThrow(
          'syncInterval must be between 1 and 60 minutes'
        );
      });

      it('should reject syncInterval above 60 minutes', () => {
        // EXPECTED TO FAIL: Validation function doesn't exist
        const invalidConfig = {
          enabled: true,
          jqlQuery: 'project = TEST',
          validateQuery: true,
          syncInterval: 61, // Invalid: above maximum
          lastSyncTime: null,
          maxResults: 1000,
          batchSize: 50,
          syncInProgress: false,
          failedSyncCount: 0,
          lastError: null,
          bulkImportInProgress: false,
          bulkImportProgress: null
        };

        expect(() => validateJQLAutoSyncConfig(invalidConfig)).toThrow(
          'syncInterval must be between 1 and 60 minutes'
        );
      });

      it('should accept valid syncInterval values', () => {
        // EXPECTED TO FAIL: Validation function doesn't exist
        const validIntervals = [1, 15, 30, 45, 60];
        
        validIntervals.forEach(interval => {
          const validConfig = {
            enabled: true,
            jqlQuery: 'project = TEST',
            validateQuery: true,
            syncInterval: interval,
            lastSyncTime: null,
            maxResults: 1000,
            batchSize: 50,
            syncInProgress: false,
            failedSyncCount: 0,
            lastError: null,
            bulkImportInProgress: false,
            bulkImportProgress: null
          };

          expect(() => validateJQLAutoSyncConfig(validConfig)).not.toThrow();
        });
      });
    });

    describe('batchSize validation', () => {
      it('should reject batchSize below 10', () => {
        // EXPECTED TO FAIL: Validation function doesn't exist
        const invalidConfig = {
          enabled: true,
          jqlQuery: 'project = TEST',
          validateQuery: true,
          syncInterval: 15,
          lastSyncTime: null,
          maxResults: 1000,
          batchSize: 9, // Invalid: below minimum
          syncInProgress: false,
          failedSyncCount: 0,
          lastError: null,
          bulkImportInProgress: false,
          bulkImportProgress: null
        };

        expect(() => validateJQLAutoSyncConfig(invalidConfig)).toThrow(
          'batchSize must be between 10 and 100'
        );
      });

      it('should reject batchSize above 100', () => {
        // EXPECTED TO FAIL: Validation function doesn't exist
        const invalidConfig = {
          enabled: true,
          jqlQuery: 'project = TEST',
          validateQuery: true,
          syncInterval: 15,
          lastSyncTime: null,
          maxResults: 1000,
          batchSize: 101, // Invalid: above maximum
          syncInProgress: false,
          failedSyncCount: 0,
          lastError: null,
          bulkImportInProgress: false,
          bulkImportProgress: null
        };

        expect(() => validateJQLAutoSyncConfig(invalidConfig)).toThrow(
          'batchSize must be between 10 and 100'
        );
      });

      it('should accept valid batchSize values', () => {
        // EXPECTED TO FAIL: Validation function doesn't exist
        const validBatchSizes = [10, 25, 50, 75, 100];
        
        validBatchSizes.forEach(batchSize => {
          const validConfig = {
            enabled: true,
            jqlQuery: 'project = TEST',
            validateQuery: true,
            syncInterval: 15,
            lastSyncTime: null,
            maxResults: 1000,
            batchSize: batchSize,
            syncInProgress: false,
            failedSyncCount: 0,
            lastError: null,
            bulkImportInProgress: false,
            bulkImportProgress: null
          };

          expect(() => validateJQLAutoSyncConfig(validConfig)).not.toThrow();
        });
      });
    });

    describe('maxResults validation', () => {
      it('should reject maxResults below 1', () => {
        // EXPECTED TO FAIL: Validation function doesn't exist
        const invalidConfig = {
          enabled: true,
          jqlQuery: 'project = TEST',
          validateQuery: true,
          syncInterval: 15,
          lastSyncTime: null,
          maxResults: 0, // Invalid: below minimum
          batchSize: 50,
          syncInProgress: false,
          failedSyncCount: 0,
          lastError: null,
          bulkImportInProgress: false,
          bulkImportProgress: null
        };

        expect(() => validateJQLAutoSyncConfig(invalidConfig)).toThrow(
          'maxResults must be between 1 and 1000'
        );
      });

      it('should reject maxResults above 1000', () => {
        // EXPECTED TO FAIL: Validation function doesn't exist
        const invalidConfig = {
          enabled: true,
          jqlQuery: 'project = TEST',
          validateQuery: true,
          syncInterval: 15,
          lastSyncTime: null,
          maxResults: 1001, // Invalid: above maximum
          batchSize: 50,
          syncInProgress: false,
          failedSyncCount: 0,
          lastError: null,
          bulkImportInProgress: false,
          bulkImportProgress: null
        };

        expect(() => validateJQLAutoSyncConfig(invalidConfig)).toThrow(
          'maxResults must be between 1 and 1000'
        );
      });
    });

    describe('jqlQuery validation', () => {
      it('should reject empty jqlQuery when validateQuery is false', () => {
        // EXPECTED TO FAIL: Validation function doesn't exist
        const invalidConfig = {
          enabled: true,
          jqlQuery: '', // Invalid: empty string
          validateQuery: false,
          syncInterval: 15,
          lastSyncTime: null,
          maxResults: 1000,
          batchSize: 50,
          syncInProgress: false,
          failedSyncCount: 0,
          lastError: null,
          bulkImportInProgress: false,
          bulkImportProgress: null
        };

        expect(() => validateJQLAutoSyncConfig(invalidConfig)).toThrow(
          'jqlQuery cannot be empty'
        );
      });

      it('should accept valid jqlQuery strings', () => {
        // EXPECTED TO FAIL: Validation function doesn't exist
        const validQueries = [
          'project = TEST',
          'assignee = currentUser()',
          'status NOT IN (Done, Closed)',
          'project = TEST AND status = "In Progress"'
        ];

        validQueries.forEach(query => {
          const validConfig = {
            enabled: true,
            jqlQuery: query,
            validateQuery: false,
            syncInterval: 15,
            lastSyncTime: null,
            maxResults: 1000,
            batchSize: 50,
            syncInProgress: false,
            failedSyncCount: 0,
            lastError: null,
            bulkImportInProgress: false,
            bulkImportProgress: null
          };

          expect(() => validateJQLAutoSyncConfig(validConfig)).not.toThrow();
        });
      });
    });

    describe('lastSyncTime validation', () => {
      it('should accept null lastSyncTime', () => {
        // EXPECTED TO FAIL: Validation function doesn't exist
        const validConfig = {
          enabled: true,
          jqlQuery: 'project = TEST',
          validateQuery: false,
          syncInterval: 15,
          lastSyncTime: null, // Valid: null allowed
          maxResults: 1000,
          batchSize: 50,
          syncInProgress: false,
          failedSyncCount: 0,
          lastError: null,
          bulkImportInProgress: false,
          bulkImportProgress: null
        };

        expect(() => validateJQLAutoSyncConfig(validConfig)).not.toThrow();
      });

      it('should accept valid ISO 8601 date strings', () => {
        // EXPECTED TO FAIL: Validation function doesn't exist
        const validDates = [
          '2025-09-10T14:30:00.000Z',
          '2025-09-10T14:30:00.000+0000',
          '2025-09-10T14:30:00.000+05:30'
        ];

        validDates.forEach(dateString => {
          const validConfig = {
            enabled: true,
            jqlQuery: 'project = TEST',
            validateQuery: false,
            syncInterval: 15,
            lastSyncTime: dateString,
            maxResults: 1000,
            batchSize: 50,
            syncInProgress: false,
            failedSyncCount: 0,
            lastError: null,
            bulkImportInProgress: false,
            bulkImportProgress: null
          };

          expect(() => validateJQLAutoSyncConfig(validConfig)).not.toThrow();
        });
      });

      it('should reject invalid date strings', () => {
        // EXPECTED TO FAIL: Validation function doesn't exist
        const invalidDates = [
          '2025-13-10T14:30:00.000Z', // Invalid month
          '2025-09-32T14:30:00.000Z', // Invalid day
          '2025-09-10T25:30:00.000Z', // Invalid hour
          'not-a-date',
          '2025/09/10 14:30:00' // Wrong format
        ];

        invalidDates.forEach(dateString => {
          const invalidConfig = {
            enabled: true,
            jqlQuery: 'project = TEST',
            validateQuery: false,
            syncInterval: 15,
            lastSyncTime: dateString,
            maxResults: 1000,
            batchSize: 50,
            syncInProgress: false,
            failedSyncCount: 0,
            lastError: null,
            bulkImportInProgress: false,
            bulkImportProgress: null
          };

          expect(() => validateJQLAutoSyncConfig(invalidConfig)).toThrow(
            'lastSyncTime must be a valid ISO 8601 date string or null'
          );
        });
      });
    });
  });

  describe('State Transitions', () => {
    it('should track enabled state transitions from false to true', () => {
      // EXPECTED TO FAIL: State transition tracking doesn't exist yet
      const config: JQLAutoSyncConfig = {
        enabled: false,
        jqlQuery: 'project = TEST',
        validateQuery: false,
        syncInterval: 15,
        lastSyncTime: null,
        maxResults: 1000,
        batchSize: 50,
        syncInProgress: false,
        failedSyncCount: 0,
        lastError: null,
        bulkImportInProgress: false,
        bulkImportProgress: null
      };

      const updatedConfig = transitionEnabled(config, true);
      
      expect(updatedConfig.enabled).toBe(true);
      // Should trigger immediate sync when enabled
      expect(updatedConfig.syncInProgress).toBe(true);
    });

    it('should handle syncInProgress state transitions', () => {
      // EXPECTED TO FAIL: State transition functions don't exist yet
      const config: JQLAutoSyncConfig = {
        enabled: true,
        jqlQuery: 'project = TEST',
        validateQuery: false,
        syncInterval: 15,
        lastSyncTime: null,
        maxResults: 1000,
        batchSize: 50,
        syncInProgress: false,
        failedSyncCount: 2,
        lastError: 'Previous sync failed',
        bulkImportInProgress: false,
        bulkImportProgress: null
      };

      // Start sync operation
      const syncStarted = transitionSyncInProgress(config, true);
      expect(syncStarted.syncInProgress).toBe(true);

      // Complete sync successfully
      const syncCompleted = transitionSyncCompleted(syncStarted, true);
      expect(syncCompleted.syncInProgress).toBe(false);
      expect(syncCompleted.failedSyncCount).toBe(0); // Reset on success
      expect(syncCompleted.lastError).toBe(null); // Clear error on success
      expect(syncCompleted.lastSyncTime).toBeTruthy(); // Set to current time
    });

    it('should increment failedSyncCount on sync failure', () => {
      // EXPECTED TO FAIL: State transition functions don't exist yet
      const config: JQLAutoSyncConfig = {
        enabled: true,
        jqlQuery: 'project = TEST',
        validateQuery: false,
        syncInterval: 15,
        lastSyncTime: null,
        maxResults: 1000,
        batchSize: 50,
        syncInProgress: true,
        failedSyncCount: 1,
        lastError: null,
        bulkImportInProgress: false,
        bulkImportProgress: null
      };

      const errorMessage = 'API rate limit exceeded';
      const syncFailed = transitionSyncCompleted(config, false, errorMessage);
      
      expect(syncFailed.syncInProgress).toBe(false);
      expect(syncFailed.failedSyncCount).toBe(2); // Increment on failure
      expect(syncFailed.lastError).toBe(errorMessage);
      expect(syncFailed.lastSyncTime).toBe(null); // Don't update on failure
    });

    it('should prevent sync operations when bulkImportInProgress is true', () => {
      // EXPECTED TO FAIL: State validation doesn't exist yet
      const config: JQLAutoSyncConfig = {
        enabled: true,
        jqlQuery: 'project = TEST',
        validateQuery: false,
        syncInterval: 15,
        lastSyncTime: null,
        maxResults: 1000,
        batchSize: 50,
        syncInProgress: false,
        failedSyncCount: 0,
        lastError: null,
        bulkImportInProgress: true, // Bulk import in progress
        bulkImportProgress: null
      };

      expect(() => transitionSyncInProgress(config, true)).toThrow(
        'Cannot start sync while bulk import is in progress'
      );
    });
  });

  describe('Configuration Serialization', () => {
    it('should serialize configuration to JSON correctly', () => {
      // EXPECTED TO FAIL: Serialization functions don't exist yet
      const config: JQLAutoSyncConfig = {
        enabled: true,
        jqlQuery: 'project = TEST AND assignee = currentUser()',
        validateQuery: true,
        syncInterval: 30,
        lastSyncTime: '2025-09-10T14:30:00.000Z',
        maxResults: 500,
        batchSize: 25,
        syncInProgress: false,
        failedSyncCount: 0,
        lastError: null,
        bulkImportInProgress: false,
        bulkImportProgress: null
      };

      const serialized = serializeJQLAutoSyncConfig(config);
      const parsed = JSON.parse(serialized);

      expect(parsed.enabled).toBe(true);
      expect(parsed.jqlQuery).toBe('project = TEST AND assignee = currentUser()');
      expect(parsed.syncInterval).toBe(30);
      expect(parsed.batchSize).toBe(25);
      expect(parsed.lastSyncTime).toBe('2025-09-10T14:30:00.000Z');
    });

    it('should deserialize configuration from JSON correctly', () => {
      // EXPECTED TO FAIL: Deserialization functions don't exist yet
      const jsonConfig = JSON.stringify({
        enabled: false,
        jqlQuery: 'status NOT IN (Done, Cancelled)',
        validateQuery: false,
        syncInterval: 45,
        lastSyncTime: '2025-09-09T10:15:00.000Z',
        maxResults: 750,
        batchSize: 75,
        syncInProgress: false,
        failedSyncCount: 3,
        lastError: 'Connection timeout',
        bulkImportInProgress: false,
        bulkImportProgress: null
      });

      const config = deserializeJQLAutoSyncConfig(jsonConfig);

      expect(config.enabled).toBe(false);
      expect(config.jqlQuery).toBe('status NOT IN (Done, Cancelled)');
      expect(config.syncInterval).toBe(45);
      expect(config.batchSize).toBe(75);
      expect(config.failedSyncCount).toBe(3);
      expect(config.lastError).toBe('Connection timeout');
    });

    it('should validate deserialized configuration', () => {
      // EXPECTED TO FAIL: Deserialization validation doesn't exist yet
      const invalidJsonConfig = JSON.stringify({
        enabled: true,
        jqlQuery: 'project = TEST',
        validateQuery: true,
        syncInterval: 0, // Invalid: below minimum
        lastSyncTime: null,
        maxResults: 1000,
        batchSize: 5, // Invalid: below minimum
        syncInProgress: false,
        failedSyncCount: 0,
        lastError: null,
        bulkImportInProgress: false,
        bulkImportProgress: null
      });

      expect(() => deserializeJQLAutoSyncConfig(invalidJsonConfig)).toThrow();
    });

    it('should handle missing properties during deserialization', () => {
      // EXPECTED TO FAIL: Default value handling doesn't exist yet
      const partialJsonConfig = JSON.stringify({
        enabled: true,
        jqlQuery: 'project = TEST'
        // Missing other properties
      });

      const config = deserializeJQLAutoSyncConfig(partialJsonConfig);

      // Should fill in defaults for missing properties
      expect(config.enabled).toBe(true);
      expect(config.jqlQuery).toBe('project = TEST');
      expect(config.validateQuery).toBe(true); // Default value
      expect(config.syncInterval).toBe(15); // Default value
      expect(config.batchSize).toBe(50); // Default value
      expect(config.maxResults).toBe(1000); // Default value
      expect(config.syncInProgress).toBe(false); // Default value
      expect(config.failedSyncCount).toBe(0); // Default value
      expect(config.bulkImportInProgress).toBe(false); // Default value
    });
  });

  describe('BulkImportProgress Integration', () => {
    it('should create BulkImportProgress with correct typing', () => {
      // EXPECTED TO FAIL: BulkImportProgress interface doesn't exist yet
      const bulkImportProgress: BulkImportProgress = {
        // SyncProgress base properties
        current: 0,
        total: 1000,
        processed: 0,
        failed: 0,
        phase: SyncPhase.INITIALIZING,
        phaseStartTime: Date.now(),
        startTime: Date.now(),
        estimatedTimeRemaining: null,
        errors: [],
        warnings: [],
        cancellationRequested: false,
        cancellationToken: null,
        
        // BulkImportProgress specific properties
        currentBatch: 1,
        totalBatches: 20,
        batchSize: 50,
        resumeToken: null,
        processedTicketIds: [],
        duplicatesFound: 0,
        newTicketsCreated: 0,
        ticketsUpdated: 0,
        allowCancel: true,
        allowPause: true,
        isPaused: false
      };

      expect(bulkImportProgress.currentBatch).toBe(1);
      expect(bulkImportProgress.totalBatches).toBe(20);
      expect(bulkImportProgress.batchSize).toBe(50);
      expect(bulkImportProgress.allowCancel).toBe(true);
      expect(bulkImportProgress.allowPause).toBe(true);
      expect(bulkImportProgress.isPaused).toBe(false);
    });

    it('should validate bulk import business rules', () => {
      // EXPECTED TO FAIL: Business rule validation doesn't exist yet
      const bulkImportProgress: BulkImportProgress = {
        current: 150,
        total: 1000,
        processed: 150,
        failed: 5,
        phase: SyncPhase.PROCESSING,
        phaseStartTime: Date.now() - 30000,
        startTime: Date.now() - 60000,
        estimatedTimeRemaining: 300,
        errors: [],
        warnings: [],
        cancellationRequested: false,
        cancellationToken: null,
        currentBatch: 3,
        totalBatches: 20,
        batchSize: 50,
        resumeToken: null,
        processedTicketIds: [],
        duplicatesFound: 25,
        newTicketsCreated: 100,
        ticketsUpdated: 25, // duplicatesFound + newTicketsCreated + ticketsUpdated = processed
        allowCancel: true,
        allowPause: true,
        isPaused: false
      };

      // Business rule: duplicatesFound + newTicketsCreated + ticketsUpdated = processed
      const sum = bulkImportProgress.duplicatesFound + 
                  bulkImportProgress.newTicketsCreated + 
                  bulkImportProgress.ticketsUpdated;
      
      expect(sum).toBe(bulkImportProgress.processed);
    });
  });

  describe('SyncError Integration', () => {
    it('should create SyncError with all required properties', () => {
      // EXPECTED TO FAIL: SyncError interface doesn't exist yet
      const syncError: SyncError = {
        code: 'API_RATE_LIMIT',
        message: 'API rate limit exceeded. Please try again later.',
        phase: SyncPhase.SEARCHING,
        timestamp: Date.now(),
        originalError: new Error('Rate limit exceeded'),
        apiResponse: {
          status: 429,
          statusText: 'Too Many Requests',
          body: { errorMessages: ['Rate limit exceeded'] }
        },
        retryAttempt: 2,
        maxRetries: 5,
        nextRetryAt: Date.now() + 30000,
        ticketId: 'TEST-123',
        userAction: 'Manual sync triggered'
      };

      expect(syncError.code).toBe('API_RATE_LIMIT');
      expect(syncError.message).toContain('rate limit');
      expect(syncError.phase).toBe(SyncPhase.SEARCHING);
      expect(syncError.retryAttempt).toBe(2);
      expect(syncError.maxRetries).toBe(5);
      expect(syncError.apiResponse?.status).toBe(429);
    });
  });

  describe('Type Safety', () => {
    it('should enforce strict typing for all properties', () => {
      // EXPECTED TO FAIL: Interfaces don't exist yet
      // This test ensures TypeScript compilation fails with type errors
      
      // @ts-expect-error: enabled should be boolean, not string
      const invalidConfig1: JQLAutoSyncConfig = {
        enabled: 'true', // Type error: should be boolean
        jqlQuery: 'project = TEST',
        validateQuery: true,
        syncInterval: 15,
        lastSyncTime: null,
        maxResults: 1000,
        batchSize: 50,
        syncInProgress: false,
        failedSyncCount: 0,
        lastError: null,
        bulkImportInProgress: false,
        bulkImportProgress: null
      };

      // @ts-expect-error: syncInterval should be number, not string
      const invalidConfig2: JQLAutoSyncConfig = {
        enabled: true,
        jqlQuery: 'project = TEST',
        validateQuery: true,
        syncInterval: '15', // Type error: should be number
        lastSyncTime: null,
        maxResults: 1000,
        batchSize: 50,
        syncInProgress: false,
        failedSyncCount: 0,
        lastError: null,
        bulkImportInProgress: false,
        bulkImportProgress: null
      };

      // These assignments should cause TypeScript compilation errors
      // The test validates that our types are strict enough
      expect(invalidConfig1).toBeDefined(); // Just to use the variable
      expect(invalidConfig2).toBeDefined(); // Just to use the variable
    });
  });
});

