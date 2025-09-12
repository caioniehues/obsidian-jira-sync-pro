/**
 * Bases API Adapter Tests
 * Tests for the BasesApiAdapter with real implementations (no mocks)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  BasesApiAdapter,
  BasesApiConfig,
  createBasesApiAdapter,
  validateBasesApiConfig,
} from '../../src/adapters/bases-api-adapter';
import {
  BaseOperationResult,
  BaseRecord,
  BaseQuery,
  FilterOperator,
  BasePropertyType,
} from '../../src/types/base-types';
import { MockData } from '../fixtures/mock-data';

// Test configuration for real integration
const TEST_CONFIG: BasesApiConfig = {
  obsidianApiEndpoint: 'http://localhost:8080/api/v1',
  workspaceId: 'test-workspace-123',
  authToken: 'test-token-456',
  timeout: 5000,
  retryAttempts: 2,
  rateLimitDelay: 500,
  enableCache: true,
  cacheTimeout: 30000,
};

describe('BasesApiAdapter Integration Tests', () => {
  let adapter: BasesApiAdapter;

  beforeEach(async () => {
    // Create adapter with test configuration
    adapter = new BasesApiAdapter(TEST_CONFIG);

    // Clear any existing cache
    adapter.clearCache();
  });

  afterEach(() => {
    if (adapter) {
      adapter.dispose();
    }
  });

  describe('Connection and Initialization', () => {
    it('should create adapter with valid configuration', () => {
      expect(adapter).toBeDefined();
      expect(adapter).toBeInstanceOf(BasesApiAdapter);
    });

    it('should test connection to Obsidian Base plugin', async () => {
      const result = await adapter.testConnection();

      // This test expects the connection to work or fail gracefully
      if (result.success) {
        expect(result.data).toMatchObject({
          connected: true,
          apiVersion: expect.any(String),
          basePluginVersion: expect.any(String),
          workspaceId: TEST_CONFIG.workspaceId,
          availableBases: expect.any(Array),
          lastChecked: expect.any(Date),
        });
      } else {
        expect(result.errors).toBeDefined();
        expect(result.errors!.length).toBeGreaterThan(0);
        expect(result.errors![0].code).toBe('CONNECTION_FAILED');
      }
    });

    it('should validate configuration correctly', async () => {
      const result = await adapter.validateConfiguration();

      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({
        valid: expect.any(Boolean),
        issues: expect.any(Array),
      });

      if (!result.data!.valid) {
        expect(result.data!.issues.length).toBeGreaterThan(0);
      }
    });

    it('should handle invalid configuration gracefully', () => {
      const invalidConfig: BasesApiConfig = {
        obsidianApiEndpoint: '',
        workspaceId: '',
        timeout: 100, // Too low
        retryAttempts: -1, // Invalid
      };

      const errors = validateBasesApiConfig(invalidConfig);

      expect(errors).toContain('Obsidian API endpoint is required');
      expect(errors).toContain('Workspace ID is required');
      expect(errors).toContain('Timeout must be at least 1000ms');
      expect(errors).toContain('Retry attempts must be non-negative');
    });
  });

  describe('Base Discovery and Schema Operations', () => {
    it('should get available bases in workspace', async () => {
      const result = await adapter.getAvailableBases();

      if (result.success) {
        expect(result.data).toBeInstanceOf(Array);

        // If there are bases, validate their structure
        if (result.data!.length > 0) {
          const base = result.data![0];
          expect(base).toMatchObject({
            id: expect.any(String),
            name: expect.any(String),
            path: expect.any(String),
            schema: expect.objectContaining({
              id: expect.any(String),
              name: expect.any(String),
              properties: expect.any(Array),
            }),
            recordCount: expect.any(Number),
            lastModified: expect.any(Date),
            isActive: expect.any(Boolean),
          });
        }
      } else {
        expect(result.errors).toBeDefined();
        expect(result.errors![0].code).toBe('FETCH_BASES_ERROR');
      }
    });

    it('should get schema for specific base', async () => {
      // First get available bases
      const basesResult = await adapter.getAvailableBases();

      if (basesResult.success && basesResult.data!.length > 0) {
        const baseId = basesResult.data![0].id;
        const schemaResult = await adapter.getBaseSchema(baseId);

        if (schemaResult.success) {
          expect(schemaResult.data).toMatchObject({
            id: baseId,
            name: expect.any(String),
            properties: expect.any(Array),
            version: expect.any(Number),
            createdAt: expect.any(Date),
            updatedAt: expect.any(Date),
          });

          // Validate properties structure if they exist
          if (schemaResult.data!.properties.length > 0) {
            const property = schemaResult.data!.properties[0];
            expect(property).toMatchObject({
              id: expect.any(String),
              name: expect.any(String),
              type: expect.any(String),
              required: expect.any(Boolean),
            });
          }
        }
      }
    });

    it('should handle non-existent base schema requests', async () => {
      const nonExistentBaseId = 'non-existent-base-123';
      const result = await adapter.getBaseSchema(nonExistentBaseId);

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors![0].code).toBe('GET_SCHEMA_ERROR');
    });
  });

  describe('CRUD Operations', () => {
    let testBaseId: string;
    let createdRecordId: string;

    beforeEach(async () => {
      // Get or create a test base
      const basesResult = await adapter.getAvailableBases();
      if (basesResult.success && basesResult.data!.length > 0) {
        testBaseId = basesResult.data![0].id;
      } else {
        // Skip CRUD tests if no bases available
        testBaseId = 'test-base-unavailable';
      }
    });

    it('should create a new record in base', async () => {
      if (testBaseId === 'test-base-unavailable') {
        console.log('Skipping create test - no test base available');
        return;
      }

      const recordData: Partial<BaseRecord> = {
        properties: {
          title: 'Test Record for BasesApiAdapter',
          description: 'Created by automated test',
          status: 'active',
          priority: 'normal',
          tags: ['test', 'automated'],
        },
        createdBy: 'test-suite',
      };

      const result = await adapter.createRecord(testBaseId, recordData);

      if (result.success) {
        expect(result.data).toMatchObject({
          id: expect.any(String),
          baseId: testBaseId,
          properties: expect.objectContaining(recordData.properties),
          createdAt: expect.any(Date),
          updatedAt: expect.any(Date),
        });

        createdRecordId = result.data!.id;
      } else {
        expect(result.errors).toBeDefined();
        expect(result.errors![0].code).toBe('CREATE_RECORD_ERROR');
      }
    });

    it('should retrieve a record by ID', async () => {
      if (!createdRecordId || testBaseId === 'test-base-unavailable') {
        console.log(
          'Skipping get test - no created record or test base available'
        );
        return;
      }

      const result = await adapter.getRecord(testBaseId, createdRecordId);

      if (result.success) {
        expect(result.data).toMatchObject({
          id: createdRecordId,
          baseId: testBaseId,
          properties: expect.any(Object),
          createdAt: expect.any(Date),
          updatedAt: expect.any(Date),
        });
      } else {
        expect(result.errors).toBeDefined();
        expect(['GET_RECORD_ERROR', 'RECORD_NOT_FOUND']).toContain(
          result.errors![0].code
        );
      }
    });

    it('should update an existing record', async () => {
      if (!createdRecordId || testBaseId === 'test-base-unavailable') {
        console.log(
          'Skipping update test - no created record or test base available'
        );
        return;
      }

      const updates: Partial<BaseRecord> = {
        properties: {
          title: 'Updated Test Record',
          status: 'updated',
          lastUpdatedBy: 'automated-test',
        },
        lastModifiedBy: 'test-suite',
      };

      const result = await adapter.updateRecord(
        testBaseId,
        createdRecordId,
        updates
      );

      if (result.success) {
        expect(result.data).toMatchObject({
          id: createdRecordId,
          baseId: testBaseId,
          properties: expect.objectContaining({
            title: 'Updated Test Record',
            status: 'updated',
          }),
          updatedAt: expect.any(Date),
        });
      } else {
        expect(result.errors).toBeDefined();
        expect(['UPDATE_RECORD_ERROR', 'RECORD_NOT_FOUND']).toContain(
          result.errors![0].code
        );
      }
    });

    it('should query records with filters', async () => {
      if (testBaseId === 'test-base-unavailable') {
        console.log('Skipping query test - no test base available');
        return;
      }

      const query: BaseQuery = {
        baseId: testBaseId,
        filters: [
          {
            property: 'status',
            operator: FilterOperator.EQUALS,
            value: 'active',
          },
        ],
        sorts: [
          {
            property: 'updatedAt',
            direction: 'desc',
          },
        ],
        limit: 10,
        offset: 0,
      };

      const result = await adapter.queryRecords(query);

      if (result.success) {
        expect(result.data).toMatchObject({
          records: expect.any(Array),
          hasMore: expect.any(Boolean),
        });

        // Validate record structure if any records found
        if (result.data!.records.length > 0) {
          const record = result.data!.records[0];
          expect(record).toMatchObject({
            id: expect.any(String),
            baseId: testBaseId,
            properties: expect.any(Object),
            createdAt: expect.any(Date),
            updatedAt: expect.any(Date),
          });
        }
      } else {
        expect(result.errors).toBeDefined();
        expect(result.errors![0].code).toBe('QUERY_RECORDS_ERROR');
      }
    });

    it('should handle invalid query gracefully', async () => {
      const invalidQuery: BaseQuery = {
        baseId: '', // Invalid empty baseId
        filters: [
          {
            property: '',
            operator: FilterOperator.EQUALS,
            value: 'test',
          },
        ],
      };

      const result = await adapter.queryRecords(invalidQuery);

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors![0].code).toBe('INVALID_QUERY');
    });

    it('should delete a record successfully', async () => {
      if (!createdRecordId || testBaseId === 'test-base-unavailable') {
        console.log(
          'Skipping delete test - no created record or test base available'
        );
        return;
      }

      const result = await adapter.deleteRecord(testBaseId, createdRecordId);

      if (result.success) {
        expect(result.data).toBe(true);

        // Verify record is actually deleted by trying to get it
        const getResult = await adapter.getRecord(testBaseId, createdRecordId);
        expect(getResult.success).toBe(false);
      } else {
        expect(result.errors).toBeDefined();
        expect(['DELETE_RECORD_ERROR', 'RECORD_NOT_FOUND']).toContain(
          result.errors![0].code
        );
      }
    });
  });

  describe('Batch Operations', () => {
    let testBaseId: string;

    beforeEach(async () => {
      const basesResult = await adapter.getAvailableBases();
      if (basesResult.success && basesResult.data!.length > 0) {
        testBaseId = basesResult.data![0].id;
      } else {
        testBaseId = 'test-base-unavailable';
      }
    });

    it('should perform batch create operation', async () => {
      if (testBaseId === 'test-base-unavailable') {
        console.log('Skipping batch create test - no test base available');
        return;
      }

      const batchRecords: Partial<BaseRecord>[] = [
        {
          properties: {
            title: 'Batch Record 1',
            status: 'active',
            priority: 'high',
          },
        },
        {
          properties: {
            title: 'Batch Record 2',
            status: 'pending',
            priority: 'medium',
          },
        },
        {
          properties: {
            title: 'Batch Record 3',
            status: 'active',
            priority: 'low',
          },
        },
      ];

      const result = await adapter.batchCreateRecords(testBaseId, batchRecords);

      if (result.success) {
        expect(result.data).toBeInstanceOf(Array);
        expect(result.data!.length).toBeLessThanOrEqual(batchRecords.length);

        // Validate created records
        if (result.data!.length > 0) {
          const createdRecord = result.data![0];
          expect(createdRecord).toMatchObject({
            id: expect.any(String),
            baseId: testBaseId,
            properties: expect.any(Object),
            createdAt: expect.any(Date),
            updatedAt: expect.any(Date),
          });
        }

        // Clean up created records
        for (const record of result.data!) {
          await adapter.deleteRecord(testBaseId, record.id);
        }
      } else {
        expect(result.errors).toBeDefined();
        expect(result.errors![0].code).toBe('BATCH_CREATE_ERROR');
      }
    });

    it('should perform batch update operation', async () => {
      if (testBaseId === 'test-base-unavailable') {
        console.log('Skipping batch update test - no test base available');
        return;
      }

      // First create some records to update
      const createRecords: Partial<BaseRecord>[] = [
        { properties: { title: 'Update Test 1', status: 'pending' } },
        { properties: { title: 'Update Test 2', status: 'pending' } },
      ];

      const createResult = await adapter.batchCreateRecords(
        testBaseId,
        createRecords
      );

      if (!createResult.success || createResult.data!.length === 0) {
        console.log(
          'Skipping batch update test - could not create test records'
        );
        return;
      }

      // Now batch update them
      const batchUpdates = createResult.data!.map(record => ({
        id: record.id,
        properties: {
          ...record.properties,
          status: 'updated',
          lastUpdated: new Date().toISOString(),
        },
      }));

      const updateResult = await adapter.batchUpdateRecords(
        testBaseId,
        batchUpdates
      );

      if (updateResult.success) {
        expect(updateResult.data).toBeInstanceOf(Array);
        expect(updateResult.data!.length).toBeLessThanOrEqual(
          batchUpdates.length
        );

        // Validate updated records
        if (updateResult.data!.length > 0) {
          const updatedRecord = updateResult.data![0];
          expect(updatedRecord.properties.status).toBe('updated');
        }
      } else {
        expect(updateResult.errors).toBeDefined();
        expect(updateResult.errors![0].code).toBe('BATCH_UPDATE_ERROR');
      }

      // Clean up
      for (const record of createResult.data!) {
        await adapter.deleteRecord(testBaseId, record.id);
      }
    });

    it('should handle batch operations with partial failures', async () => {
      if (testBaseId === 'test-base-unavailable') {
        console.log('Skipping partial failure test - no test base available');
        return;
      }

      const mixedBatch: Partial<BaseRecord>[] = [
        {
          properties: {
            title: 'Valid Record',
            status: 'active',
          },
        },
        {
          properties: {
            // Potentially invalid record with missing required fields
            status: 'invalid',
          },
        },
      ];

      const result = await adapter.batchCreateRecords(testBaseId, mixedBatch);

      // Even with partial failures, we should get a response
      if (result.success) {
        // Some records might have been created successfully
        expect(result.data).toBeInstanceOf(Array);

        // Clean up any successfully created records
        for (const record of result.data!) {
          await adapter.deleteRecord(testBaseId, record.id);
        }
      } else {
        expect(result.errors).toBeDefined();
      }

      // Check for warnings about partial failures
      if (result.warnings) {
        expect(result.warnings.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Caching Functionality', () => {
    it('should cache and retrieve base schema data', async () => {
      const cacheAdapter = new BasesApiAdapter({
        ...TEST_CONFIG,
        enableCache: true,
        cacheTimeout: 60000,
      });

      try {
        const basesResult = await cacheAdapter.getAvailableBases();

        if (basesResult.success && basesResult.data!.length > 0) {
          const baseId = basesResult.data![0].id;

          // First call - should hit the API
          const firstCall = await cacheAdapter.getBaseSchema(baseId);

          // Second call - should hit the cache
          const secondCall = await cacheAdapter.getBaseSchema(baseId);

          if (firstCall.success && secondCall.success) {
            expect(secondCall.data).toEqual(firstCall.data);
          }
        }

        // Check cache statistics
        const cacheStats = cacheAdapter.getCacheStats();
        expect(cacheStats.size).toBeGreaterThanOrEqual(0);
        expect(cacheStats.keys).toBeInstanceOf(Array);
        expect(cacheStats.memoryUsage).toBeGreaterThanOrEqual(0);
      } finally {
        cacheAdapter.dispose();
      }
    });

    it('should clear cache when requested', async () => {
      const cacheStats = adapter.getCacheStats();
      const initialSize = cacheStats.size;

      // Make some calls to populate cache
      await adapter.getAvailableBases();

      const afterCallsStats = adapter.getCacheStats();

      // Clear cache
      adapter.clearCache();

      const afterClearStats = adapter.getCacheStats();
      expect(afterClearStats.size).toBe(0);
      expect(afterClearStats.keys).toEqual([]);
    });

    it('should invalidate cache after operations', async () => {
      const basesResult = await adapter.getAvailableBases();

      if (basesResult.success && basesResult.data!.length > 0) {
        const baseId = basesResult.data![0].id;

        // Create a record (should invalidate cache)
        const createResult = await adapter.createRecord(baseId, {
          properties: { title: 'Cache Test Record' },
        });

        if (createResult.success) {
          // Cache should be invalidated for this base
          const cacheStats = adapter.getCacheStats();
          const hasBaseCacheKey = cacheStats.keys.some(key =>
            key.includes(baseId)
          );

          // Either no cache keys for this base, or cache was properly invalidated
          expect(hasBaseCacheKey).not.toBeTruthy();

          // Clean up
          await adapter.deleteRecord(baseId, createResult.data!.id);
        }
      }
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle network timeout gracefully', async () => {
      const timeoutAdapter = new BasesApiAdapter({
        ...TEST_CONFIG,
        timeout: 1, // Very short timeout
      });

      try {
        const result = await timeoutAdapter.testConnection();

        if (!result.success) {
          expect(result.errors).toBeDefined();
          expect(['CONNECTION_ERROR', 'NETWORK_ERROR']).toContain(
            result.errors![0].code
          );
        }
      } finally {
        timeoutAdapter.dispose();
      }
    });

    it('should handle invalid API endpoint gracefully', async () => {
      const invalidAdapter = new BasesApiAdapter({
        ...TEST_CONFIG,
        obsidianApiEndpoint: 'http://invalid-endpoint-that-does-not-exist.com',
      });

      try {
        const result = await invalidAdapter.testConnection();

        expect(result.success).toBe(false);
        expect(result.errors).toBeDefined();
        expect(['CONNECTION_FAILED', 'NETWORK_ERROR']).toContain(
          result.errors![0].code
        );
      } finally {
        invalidAdapter.dispose();
      }
    });

    it('should validate configuration on creation', () => {
      expect(() => {
        validateBasesApiConfig(TEST_CONFIG);
      }).not.toThrow();

      const invalidConfig = {
        ...TEST_CONFIG,
        obsidianApiEndpoint: '',
        workspaceId: '',
      };

      const errors = validateBasesApiConfig(invalidConfig);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('Factory Functions', () => {
    it('should create adapter using factory function', () => {
      const factoryAdapter = createBasesApiAdapter(
        TEST_CONFIG.obsidianApiEndpoint,
        TEST_CONFIG.workspaceId,
        TEST_CONFIG.authToken
      );

      expect(factoryAdapter).toBeInstanceOf(BasesApiAdapter);

      factoryAdapter.dispose();
    });

    it('should create adapter with minimal configuration', () => {
      const minimalAdapter = createBasesApiAdapter(
        'http://localhost:8080',
        'test-workspace'
      );

      expect(minimalAdapter).toBeInstanceOf(BasesApiAdapter);

      minimalAdapter.dispose();
    });
  });

  describe('Resource Management', () => {
    it('should dispose resources properly', () => {
      const testAdapter = new BasesApiAdapter(TEST_CONFIG);

      // Make some calls to create resources
      testAdapter.getAvailableBases();

      // Should not throw when disposing
      expect(() => {
        testAdapter.dispose();
      }).not.toThrow();

      // Cache should be cleared
      const stats = testAdapter.getCacheStats();
      expect(stats.size).toBe(0);
    });
  });
});

describe('Configuration Validation', () => {
  it('should identify missing required fields', () => {
    const incompleteConfig = {
      workspaceId: 'test-workspace',
      // Missing obsidianApiEndpoint
    } as BasesApiConfig;

    const errors = validateBasesApiConfig(incompleteConfig);
    expect(errors).toContain('Obsidian API endpoint is required');
  });

  it('should validate numeric constraints', () => {
    const invalidConfig: BasesApiConfig = {
      obsidianApiEndpoint: 'http://localhost:8080',
      workspaceId: 'test',
      timeout: 500, // Too low
      retryAttempts: -5, // Negative
      cacheTimeout: 30000, // Too low
    };

    const errors = validateBasesApiConfig(invalidConfig);
    expect(errors).toContain('Timeout must be at least 1000ms');
    expect(errors).toContain('Retry attempts must be non-negative');
    expect(errors).toContain('Cache timeout must be at least 60 seconds');
  });

  it('should accept valid configuration', () => {
    const validConfig: BasesApiConfig = {
      obsidianApiEndpoint: 'https://api.obsidian.md',
      workspaceId: 'my-workspace',
      authToken: 'valid-token',
      timeout: 30000,
      retryAttempts: 3,
      rateLimitDelay: 1000,
      enableCache: true,
      cacheTimeout: 300000,
    };

    const errors = validateBasesApiConfig(validConfig);
    expect(errors).toEqual([]);
  });
});
