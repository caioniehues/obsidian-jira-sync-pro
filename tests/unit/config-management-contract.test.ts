import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { AutoSyncScheduler, AutoSyncConfig, SyncStatistics } from '../../src/enhanced-sync/auto-sync-scheduler';
import { JQLQueryEngine } from '../../src/enhanced-sync/jql-query-engine';
import { Plugin } from 'obsidian';

// Mock Obsidian Plugin
jest.mock('obsidian');

/**
 * Configuration Management Contract Tests
 * 
 * Testing the configuration management API contract as specified in
 * specs/001-jql-auto-sync/contracts/config-management.yaml
 * 
 * CRITICAL: These tests MUST FAIL initially (TDD requirement)
 * The current implementation may not fully support all contract requirements
 * including JQL validation, advanced statistics tracking, and configuration persistence.
 */
describe('Configuration Management Contract Tests', () => {
  let autoSyncScheduler: AutoSyncScheduler;
  let mockPlugin: jest.Mocked<Plugin>;
  let mockQueryEngine: jest.Mocked<JQLQueryEngine>;
  let mockSyncCallback: jest.MockedFunction<any>;
  
  const validBaseConfig: AutoSyncConfig = {
    enabled: false,
    jqlQuery: 'assignee = currentUser() AND status NOT IN (Done, Closed)',
    syncInterval: 5,
    maxResults: 1000,
    batchSize: 50
  };

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock Plugin
    mockPlugin = {
      loadData: jest.fn().mockResolvedValue({}),
      saveData: jest.fn().mockResolvedValue(undefined),
    } as any;
    
    // Mock JQL Query Engine
    mockQueryEngine = {
      validateQuery: jest.fn(),
      estimateResultCount: jest.fn(),
      executeQuery: jest.fn(),
    } as any;
    
    // Mock sync callback
    mockSyncCallback = jest.fn().mockResolvedValue(undefined);
    
    autoSyncScheduler = new AutoSyncScheduler(
      mockPlugin,
      mockQueryEngine,
      validBaseConfig,
      mockSyncCallback
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Auto-sync Configuration Management (/config/auto-sync)', () => {
    describe('GET /config/auto-sync - getAutoSyncConfig', () => {
      it('should retrieve current auto-sync configuration with all contract fields', async () => {
        // CONTRACT REQUIREMENT: Full JQLAutoSyncConfig schema
        const config = autoSyncScheduler.getConfig();
        
        // EXPECTED TO FAIL: Current config may not include all contract fields
        expect(config).toMatchObject({
          // Feature control
          enabled: expect.any(Boolean),
          
          // Query configuration
          jqlQuery: expect.any(String),
          validateQuery: expect.any(Boolean), // NEW: May not exist
          
          // Sync timing
          syncInterval: expect.any(Number),
          lastSyncTime: expect.any(String), // NEW: May not exist
          
          // Processing limits
          maxResults: expect.any(Number),
          batchSize: expect.any(Number),
          
          // State tracking (read-only)
          syncInProgress: expect.any(Boolean), // NEW: May not exist
          failedSyncCount: expect.any(Number), // NEW: May not exist
          lastError: expect.stringMatching(/.*/), // NEW: May not exist
          
          // Bulk import state
          bulkImportInProgress: expect.any(Boolean) // NEW: May not exist
        });
        
        // Validate field constraints per contract
        expect(config.syncInterval).toBeGreaterThanOrEqual(1);
        expect(config.syncInterval).toBeLessThanOrEqual(60);
        expect(config.maxResults).toBeGreaterThanOrEqual(1);
        expect(config.maxResults).toBeLessThanOrEqual(1000);
        expect(config.batchSize).toBeGreaterThanOrEqual(10);
        expect(config.batchSize).toBeLessThanOrEqual(100);
        expect(config.jqlQuery.length).toBeLessThanOrEqual(2048);
      });

      it('should include ISO 8601 formatted lastSyncTime when available', async () => {
        // Setup with previous sync
        await autoSyncScheduler.start();
        await new Promise(resolve => setTimeout(resolve, 10)); // Let sync attempt
        autoSyncScheduler.stop();
        
        const config = autoSyncScheduler.getConfig();
        
        // EXPECTED TO FAIL: lastSyncTime may not be in config or properly formatted
        if (config.lastSyncTime) {
          expect(config.lastSyncTime).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/);
        }
      });
    });

    describe('PUT /config/auto-sync - updateAutoSyncConfig', () => {
      it('should update configuration and return validation result', async () => {
        const updateData = {
          enabled: true,
          jqlQuery: 'project = TEST AND assignee = currentUser()',
          validateQuery: true,
          syncInterval: 10,
          maxResults: 500,
          batchSize: 25
        };

        // Mock validation response
        mockQueryEngine.validateQuery.mockResolvedValue({
          valid: true,
          warnings: ['Query may return large result set'],
          estimatedCount: 150,
          queryComplexity: 'medium',
          suggestedOptimizations: ['Consider adding a date range filter']
        });

        // EXPECTED TO FAIL: Current implementation may not support validation during update
        const updateResult = await autoSyncScheduler.updateConfigWithValidation(updateData);
        
        expect(updateResult).toMatchObject({
          updated: true,
          validationResult: {
            valid: true,
            warnings: expect.any(Array),
            estimatedCount: expect.any(Number),
            queryComplexity: expect.stringMatching(/^(low|medium|high)$/),
            suggestedOptimizations: expect.any(Array)
          },
          syncTriggered: true // Should trigger sync when enabling
        });

        expect(mockQueryEngine.validateQuery).toHaveBeenCalledWith(updateData.jqlQuery);
      });

      it('should reject invalid configuration parameters with detailed errors', async () => {
        const invalidConfig = {
          syncInterval: 0, // Below minimum
          maxResults: 2000, // Above maximum
          batchSize: 5, // Below minimum
          jqlQuery: 'a'.repeat(2049) // Exceeds maxLength
        };

        // EXPECTED TO FAIL: Current implementation may not have detailed validation
        await expect(autoSyncScheduler.updateConfigWithValidation(invalidConfig))
          .rejects.toMatchObject({
            error: 'Invalid configuration',
            fieldErrors: {
              syncInterval: 'Must be between 1 and 60 minutes',
              maxResults: 'Must be between 1 and 1000',
              batchSize: 'Must be between 10 and 100',
              jqlQuery: 'Query exceeds maximum length of 2048 characters'
            },
            suggestions: expect.any(Array)
          });
      });

      it('should trigger immediate sync when enabled changes from false to true', async () => {
        const config = { enabled: true };
        
        // EXPECTED TO FAIL: Current implementation may not return sync trigger status
        const result = await autoSyncScheduler.updateConfigWithValidation(config);
        
        expect(result.syncTriggered).toBe(true);
        expect(mockSyncCallback).toHaveBeenCalledWith({
          isManual: false,
          isInitial: true
        });
      });
    });

    describe('POST /config/auto-sync/validate - validateJQLQuery', () => {
      it('should validate JQL query syntax and return comprehensive result', async () => {
        const jqlQuery = 'assignee = currentUser() AND status != Done';
        
        mockQueryEngine.validateQuery.mockResolvedValue({
          valid: true,
          warnings: ['Query may return large result set'],
          estimatedCount: 75,
          queryComplexity: 'low',
          suggestedOptimizations: ['Consider adding a project filter']
        });

        // EXPECTED TO FAIL: Direct query validation may not be exposed
        const validationResult = await autoSyncScheduler.validateJQLQuery(jqlQuery);
        
        expect(validationResult).toMatchObject({
          valid: true,
          errorMessage: null,
          warnings: ['Query may return large result set'],
          estimatedCount: 75,
          queryComplexity: 'low',
          suggestedOptimizations: ['Consider adding a project filter']
        });

        expect(mockQueryEngine.validateQuery).toHaveBeenCalledWith(jqlQuery);
      });

      it('should return validation errors for invalid JQL syntax', async () => {
        const invalidJql = 'invalidfield = "test"';
        
        mockQueryEngine.validateQuery.mockResolvedValue({
          valid: false,
          errorMessage: "Field 'invalidfield' does not exist",
          warnings: [],
          estimatedCount: null,
          queryComplexity: null,
          suggestedOptimizations: []
        });

        // EXPECTED TO FAIL: Validation method may not exist
        const validationResult = await autoSyncScheduler.validateJQLQuery(invalidJql);
        
        expect(validationResult).toMatchObject({
          valid: false,
          errorMessage: "Field 'invalidfield' does not exist",
          warnings: [],
          estimatedCount: null,
          queryComplexity: null,
          suggestedOptimizations: []
        });
      });
    });

    describe('POST /config/auto-sync/test - testAutoSyncConfig', () => {
      it('should perform test run and return results without creating vault files', async () => {
        mockQueryEngine.executeQuery.mockResolvedValue({
          issues: [
            { key: 'PROJ-123', summary: 'Test issue 1', status: 'In Progress' },
            { key: 'PROJ-124', summary: 'Test issue 2', status: 'Open' }
          ],
          totalResults: 47,
          executionTime: 1250.5
        });

        // EXPECTED TO FAIL: Test execution method may not exist
        const testResult = await autoSyncScheduler.testAutoSyncConfig();
        
        expect(testResult).toMatchObject({
          success: true,
          testResults: {
            queryExecutionTime: 1250.5,
            issuesFound: 47,
            sampleIssues: expect.arrayContaining([
              expect.objectContaining({
                key: expect.any(String),
                summary: expect.any(String),
                status: expect.any(String)
              })
            ]),
            newIssues: expect.any(Number),
            existingIssues: expect.any(Number),
            estimatedSyncTime: expect.any(Number),
            potentialIssues: expect.any(Array)
          }
        });

        expect(testResult.testResults.sampleIssues.length).toBeLessThanOrEqual(5);
      });

      it('should return error for invalid or incomplete configuration', async () => {
        // Set invalid configuration
        autoSyncScheduler.updateConfig({ ...validBaseConfig, jqlQuery: '' });

        // EXPECTED TO FAIL: Configuration validation may not exist
        await expect(autoSyncScheduler.testAutoSyncConfig())
          .rejects.toMatchObject({
            error: 'Configuration invalid or incomplete',
            details: expect.any(String)
          });
      });
    });

    describe('POST /config/auto-sync/reset - resetAutoSyncConfig', () => {
      it('should reset configuration and stop running operations', async () => {
        // Start scheduler with some state
        await autoSyncScheduler.start();
        
        // EXPECTED TO FAIL: Reset method may not exist
        const resetResult = await autoSyncScheduler.resetAutoSyncConfig();
        
        expect(resetResult).toMatchObject({
          reset: true,
          stoppedOperations: expect.any(Number)
        });

        // Verify scheduler is stopped
        expect(autoSyncScheduler.isRunning()).toBe(false);
        
        // Verify config is reset to defaults
        const config = autoSyncScheduler.getConfig();
        expect(config.enabled).toBe(false);
        expect(config.syncInterval).toBe(5); // Default value
        
        // Verify statistics are cleared
        const stats = autoSyncScheduler.getStatistics();
        expect(stats.totalSyncs).toBe(0);
        expect(stats.successfulSyncs).toBe(0);
        expect(stats.failedSyncs).toBe(0);
      });
    });
  });

  describe('Sync Statistics Management (/config/sync-statistics)', () => {
    describe('GET /config/sync-statistics - getSyncStatistics', () => {
      it('should return comprehensive sync statistics per contract', async () => {
        // Setup some sync history
        autoSyncScheduler.setState({
          totalSyncCount: 247,
          successfulSyncCount: 234,
          failedSyncCount: 13,
          lastSyncTime: '2025-09-10T14:30:00Z',
          syncDurations: [18200, 23500, 15600, 31800, 27400]
        });

        const statistics = autoSyncScheduler.getStatistics();
        
        // EXPECTED TO FAIL: Current statistics may not match full contract schema
        expect(statistics).toMatchObject({
          // Overall metrics
          totalSyncOperations: 247,
          successfulSyncs: 234,
          failedSyncs: 13,
          
          // Timing metrics
          averageSyncDuration: expect.any(Number),
          lastSyncDuration: expect.any(Number),
          longestSyncDuration: expect.any(Number),
          
          // Volume metrics  
          totalTicketsProcessed: expect.any(Number),
          ticketsCreated: expect.any(Number),
          ticketsUpdated: expect.any(Number),
          ticketsSkipped: expect.any(Number),
          
          // Performance metrics
          averageTicketsPerSecond: expect.any(Number),
          apiCallsThisHour: expect.any(Number),
          
          // Error tracking
          errorsByCategory: expect.any(Object),
          consecutiveFailures: expect.any(Number),
          
          // Time series data
          hourlyStats: expect.any(Array)
        });

        // Validate time series format
        if (statistics.hourlyStats && statistics.hourlyStats.length > 0) {
          expect(statistics.hourlyStats[0]).toMatchObject({
            hour: expect.any(Number),
            syncs: expect.any(Number),
            tickets: expect.any(Number),
            errors: expect.any(Number)
          });
        }
      });

      it('should calculate timing metrics correctly', async () => {
        const syncDurations = [18200, 23500, 15600, 31800, 27400]; // milliseconds
        autoSyncScheduler.setState({
          syncDurations,
          totalSyncCount: 5,
          successfulSyncCount: 5,
          failedSyncCount: 0
        });

        const statistics = autoSyncScheduler.getStatistics();
        
        // EXPECTED TO FAIL: Advanced timing calculations may not exist
        const expectedAverage = syncDurations.reduce((a, b) => a + b, 0) / syncDurations.length / 1000; // Convert to seconds
        const expectedLongest = Math.max(...syncDurations) / 1000;
        
        expect(statistics.averageSyncDuration).toBeCloseTo(expectedAverage, 1);
        expect(statistics.longestSyncDuration).toBe(expectedLongest);
        expect(statistics.lastSyncDuration).toBe(syncDurations[syncDurations.length - 1] / 1000);
      });

      it('should track errors by category', async () => {
        // EXPECTED TO FAIL: Error categorization may not exist
        const statistics = autoSyncScheduler.getStatistics();
        
        expect(statistics.errorsByCategory).toEqual(expect.objectContaining({
          'NETWORK_ERROR': expect.any(Number),
          'RATE_LIMIT': expect.any(Number),
          'API_ERROR': expect.any(Number)
        }));
      });
    });

    describe('DELETE /config/sync-statistics - clearSyncStatistics', () => {
      it('should clear all statistics and reset counters', async () => {
        // Setup statistics with data
        autoSyncScheduler.setState({
          totalSyncCount: 50,
          successfulSyncCount: 45,
          failedSyncCount: 5,
          syncDurations: [1000, 1500, 2000],
          lastSyncTime: '2025-09-10T14:30:00Z'
        });

        // EXPECTED TO FAIL: Clear statistics method may not exist
        await autoSyncScheduler.clearSyncStatistics();
        
        const statistics = autoSyncScheduler.getStatistics();
        expect(statistics.totalSyncs).toBe(0);
        expect(statistics.successfulSyncs).toBe(0);
        expect(statistics.failedSyncs).toBe(0);
        expect(statistics.averageSyncDuration).toBe(0);
        expect(statistics.lastSyncTime).toBeNull();
      });
    });
  });

  describe('Configuration Persistence Contract', () => {
    it('should persist configuration changes to plugin data', async () => {
      const newConfig = {
        enabled: true,
        jqlQuery: 'project = TEST',
        syncInterval: 15,
        maxResults: 100,
        batchSize: 20
      };

      // EXPECTED TO FAIL: Persistence during config update may not be implemented
      await autoSyncScheduler.updateConfigWithValidation(newConfig);
      
      expect(mockPlugin.saveData).toHaveBeenCalledWith(
        expect.objectContaining({
          autoSyncConfig: expect.objectContaining(newConfig)
        })
      );
    });

    it('should load persisted configuration on initialization', async () => {
      const persistedConfig = {
        enabled: true,
        jqlQuery: 'assignee = currentUser()',
        validateQuery: true,
        syncInterval: 20,
        lastSyncTime: '2025-09-10T12:00:00Z',
        maxResults: 200,
        batchSize: 30,
        syncInProgress: false,
        failedSyncCount: 2,
        lastError: 'Network timeout'
      };

      mockPlugin.loadData.mockResolvedValue({ autoSyncConfig: persistedConfig });

      // EXPECTED TO FAIL: Configuration loading may not be implemented
      const newScheduler = new AutoSyncScheduler(
        mockPlugin,
        mockQueryEngine,
        validBaseConfig,
        mockSyncCallback
      );
      await newScheduler.loadConfiguration();

      const loadedConfig = newScheduler.getConfig();
      expect(loadedConfig).toMatchObject(persistedConfig);
    });

    it('should handle corrupted or missing configuration gracefully', async () => {
      mockPlugin.loadData.mockResolvedValue({ autoSyncConfig: null });

      // EXPECTED TO FAIL: Graceful handling may not be implemented
      const newScheduler = new AutoSyncScheduler(
        mockPlugin,
        mockQueryEngine,
        validBaseConfig,
        mockSyncCallback
      );
      await newScheduler.loadConfiguration();

      const config = newScheduler.getConfig();
      expect(config).toMatchObject(validBaseConfig); // Should fallback to defaults
    });
  });

  describe('JQL Query Validation Integration', () => {
    it('should validate query complexity and suggest optimizations', async () => {
      const complexQuery = 'project in (A, B, C, D, E) AND assignee in membersOf("large-group") AND created > -365d';
      
      mockQueryEngine.validateQuery.mockResolvedValue({
        valid: true,
        warnings: ['Query involves multiple large datasets'],
        estimatedCount: 5000,
        queryComplexity: 'high',
        suggestedOptimizations: [
          'Consider limiting to specific projects',
          'Add more restrictive date filters',
          'Use smaller user groups'
        ]
      });

      // EXPECTED TO FAIL: Complex validation integration may not exist
      const result = await autoSyncScheduler.validateJQLQuery(complexQuery);
      
      expect(result.queryComplexity).toBe('high');
      expect(result.suggestedOptimizations).toHaveLength(3);
      expect(result.estimatedCount).toBeGreaterThan(1000);
    });

    it('should prevent configuration update with invalid queries when validation enabled', async () => {
      const configWithInvalidQuery = {
        jqlQuery: 'nonexistentfield = "value"',
        validateQuery: true
      };

      mockQueryEngine.validateQuery.mockResolvedValue({
        valid: false,
        errorMessage: "Field 'nonexistentfield' does not exist",
        warnings: [],
        estimatedCount: null,
        queryComplexity: null,
        suggestedOptimizations: []
      });

      // EXPECTED TO FAIL: Validation during configuration update may not block invalid queries
      await expect(autoSyncScheduler.updateConfigWithValidation(configWithInvalidQuery))
        .rejects.toMatchObject({
          fieldErrors: {
            jqlQuery: "Field 'nonexistentfield' does not exist"
          }
        });
    });
  });
});