/**
 * CRUD Operations Integration Tests
 * Integration tests for Create, Read, Update, Delete operations
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CrudOperationsManager, QueryBuilder, createQueryBuilder } from '../../src/adapters/crud-operations';
import { BaseOperationsClient, createBaseConnection } from '../../src/utils/base-operations';
import { BulkOperationsManager, createOptimizedBulkConfig } from '../../src/utils/bulk-operations';
import { 
  BaseQuery, 
  BaseRecord, 
  FilterOperator,
  BaseOperationResult 
} from '../../src/types/base-types';
import { MockData } from '../fixtures/mock-data';
import type { Mock, Mocked, MockedFunction } from 'vitest';
// Mock the BaseOperationsClient
vi.mock('../../src/utils/base-operations');
describe('CRUD Operations Integration', () => {
  let crudManager: CrudOperationsManager;
  let mockClient: Mocked<BaseOperationsClient>;
  let baseSchema = MockData.base.schema;
  beforeEach(() => {
    // Create mock client
    mockClient = {
      getBaseSchema: vi.fn(),
      createRecord: vi.fn(),
      updateRecord: vi.fn(),
      deleteRecord: vi.fn(),
      queryRecords: vi.fn(),
      getRecord: vi.fn(),
      batchCreateRecords: vi.fn(),
      batchUpdateRecords: vi.fn(),
      testConnection: vi.fn()
    } as any;
    // Create CRUD manager with mocked client
    crudManager = new CrudOperationsManager(baseSchema);
    // Mock console methods
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.clearAllMocks();
  describe('Create Operations', () => {
    it('should create a new record successfully', async () => {
      const newRecord = {
        properties: {
          title: 'New Test Record',
          description: 'Test description',
          priority: 'high'
        },
        createdBy: 'test-user'
      };
      const expectedRecord = MockData.factories.createBaseRecord({
        id: expect.any(String),
        ...newRecord,
        baseId: baseSchema.id,
        createdAt: expect.any(Date),
        updatedAt: expect.any(Date)
      });
      // Mock the private methods that would be called
      vi.spyOn(crudManager as any, 'validateRecord').mockResolvedValue({ success: true });
      vi.spyOn(crudManager as any, 'executeCreate').mockResolvedValue(expectedRecord);
      const result = await crudManager.create(newRecord);
      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({
        properties: newRecord.properties,
        baseId: baseSchema.id
    });
    it('should handle validation errors during create', async () => {
      const invalidRecord = {
          // Missing required title field
          description: 'Test description'
        }
      const validationErrors = [{
        property: 'title',
        message: 'Title is required',
        code: 'REQUIRED_FIELD_MISSING'
      }];
      vi.spyOn(crudManager as any, 'validateRecord').mockResolvedValue({
        success: false,
        errors: validationErrors
      const result = await crudManager.create(invalidRecord);
      expect(result.success).toBe(false);
      expect(result.errors).toEqual(validationErrors);
    it('should apply default values during create', async () => {
          title: 'Test Record'
          // Missing status field which has default value
      let capturedRecord: any;
      vi.spyOn(crudManager as any, 'executeCreate').mockImplementation((record) => {
        capturedRecord = record;
        return Promise.resolve(record);
      await crudManager.create(newRecord);
      expect(capturedRecord.properties.status).toBe('todo'); // Default value from schema
    it('should generate record ID automatically', async () => {
        properties: { title: 'Test Record' }
      expect(capturedRecord.id).toMatch(/^record_\d+_[a-z0-9]+$/);
  describe('Read Operations', () => {
    it('should query records successfully', async () => {
      const query: BaseQuery = {
        filters: [{
          property: 'status',
          operator: FilterOperator.EQUALS,
          value: 'in_progress'
        }],
        limit: 10
      const expectedResult = {
        records: MockData.base.records.filter(r => r.properties.status === 'in_progress'),
        hasMore: false,
        totalCount: 1
      vi.spyOn(crudManager as any, 'executeQuery').mockResolvedValue(expectedResult);
      const result = await crudManager.read(query);
      expect(result.data).toEqual(expectedResult);
    it('should validate query structure', async () => {
      const invalidQuery: BaseQuery = {
        baseId: '', // Invalid empty baseId
        filters: []
      const result = await crudManager.read(invalidQuery);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          code: 'INVALID_QUERY'
        })
      );
    it('should handle complex filter combinations', async () => {
      const complexQuery: BaseQuery = {
        filters: [
          {
            property: 'status',
            operator: FilterOperator.EQUALS,
            value: 'in_progress'
          },
            property: 'priority',
            value: 'high'
            property: 'assignee',
            operator: FilterOperator.IS_NOT_EMPTY,
            value: null
          }
        ],
        sorts: [
          { property: 'updatedAt', direction: 'desc' },
          { property: 'title', direction: 'asc' }
        limit: 50,
        offset: 0
      vi.spyOn(crudManager as any, 'executeQuery').mockResolvedValue({
        records: MockData.base.records,
        hasMore: true,
        totalCount: 100
      const result = await crudManager.read(complexQuery);
      expect(result.data?.hasMore).toBe(true);
      expect(result.data?.totalCount).toBe(100);
  describe('Update Operations', () => {
    it('should update existing record successfully', async () => {
      const recordId = 'existing-record-123';
      const existingRecord = MockData.factories.createBaseRecord({
        id: recordId,
          title: 'Original Title',
          status: 'todo'
      const updates = {
          title: 'Updated Title',
          status: 'in_progress'
        lastModifiedBy: 'test-user'
      const updatedRecord = {
        ...existingRecord,
        ...updates,
          ...existingRecord.properties,
          ...updates.properties
      vi.spyOn(crudManager as any, 'getRecordById').mockResolvedValue(existingRecord);
      vi.spyOn(crudManager as any, 'detectConflicts').mockResolvedValue({ hasConflict: false });
      vi.spyOn(crudManager as any, 'executeUpdate').mockResolvedValue(updatedRecord);
      const result = await crudManager.update(recordId, updates);
      expect(result.data?.properties.title).toBe('Updated Title');
      expect(result.data?.properties.status).toBe('in_progress');
    it('should handle record not found', async () => {
      const nonExistentId = 'nonexistent-record';
      const updates = { properties: { title: 'Updated Title' } };
      vi.spyOn(crudManager as any, 'getRecordById').mockResolvedValue(null);
      const result = await crudManager.update(nonExistentId, updates);
          code: 'RECORD_NOT_FOUND'
    it('should detect and handle conflicts', async () => {
      const recordId = 'conflicted-record';
        updatedAt: new Date('2024-01-01T10:00:00Z')
        properties: { title: 'Conflicted Update' },
        lastModifiedBy: 'user2'
      const conflictResult = {
        hasConflict: true,
        conflictFields: ['title'],
        localVersion: new Date('2024-01-01T10:00:00Z'),
        remoteVersion: new Date('2024-01-01T11:00:00Z')
      vi.spyOn(crudManager as any, 'detectConflicts').mockResolvedValue(conflictResult);
      vi.spyOn(crudManager as any, 'resolveConflicts').mockResolvedValue({
        success: true,
        data: updates
      vi.spyOn(crudManager as any, 'executeUpdate').mockResolvedValue(existingRecord);
      expect(console.warn).toHaveBeenCalledWith(
        `Conflict detected for record ${recordId}:`,
        conflictResult.conflictFields
    it('should merge properties correctly', async () => {
      const recordId = 'merge-test-record';
          description: 'Original Description',
          status: 'todo',
          priority: 'medium'
          // description and priority should remain unchanged
      let mergedRecord: any;
      vi.spyOn(crudManager as any, 'executeUpdate').mockImplementation((record) => {
        mergedRecord = record;
      await crudManager.update(recordId, updates);
      expect(mergedRecord.properties).toEqual({
        title: 'Updated Title',
        description: 'Original Description',
        status: 'in_progress',
        priority: 'medium'
  describe('Delete Operations', () => {
    it('should delete existing record successfully', async () => {
      const recordId = 'record-to-delete';
      const existingRecord = MockData.factories.createBaseRecord({ id: recordId });
      vi.spyOn(crudManager as any, 'handleCascadeDelete').mockResolvedValue({ success: true });
      vi.spyOn(crudManager as any, 'executeDelete').mockResolvedValue(true);
      const result = await crudManager.delete(recordId);
      expect(result.data).toBe(true);
    it('should handle record not found during delete', async () => {
      const result = await crudManager.delete(nonExistentId);
    it('should handle cascade delete restrictions', async () => {
      const recordId = 'record-with-dependencies';
      vi.spyOn(crudManager as any, 'handleCascadeDelete').mockResolvedValue({
        errors: [{
          property: 'dependencies',
          message: 'Cannot delete record with active dependencies',
          code: 'CASCADE_CONSTRAINT'
        }]
  describe('Bulk Operations', () => {
    it('should perform bulk create operation', async () => {
      const bulkOperations = [
        {
          operation: 'create' as const,
          records: [
            { properties: { title: 'Bulk Record 1' } },
            { properties: { title: 'Bulk Record 2' } },
            { properties: { title: 'Bulk Record 3' } }
          ]
      ];
      const mockSuccessfulRecords = bulkOperations[0].records.map((record, index) => 
        MockData.factories.createBaseRecord({
          id: `bulk-record-${index + 1}`,
          ...record
      vi.spyOn(crudManager as any, 'processBulkOperation').mockImplementation(
        async (operation, result) => {
          for (const record of operation.records) {
            const createdRecord = MockData.factories.createBaseRecord(record);
            result.successful.push(createdRecord);
      const result = await crudManager.bulk(bulkOperations);
      expect(result.successful.length).toBe(3);
      expect(result.failed.length).toBe(0);
    it('should handle partial failures in bulk operations', async () => {
            { properties: { title: 'Valid Record' } },
            { properties: {} }, // Invalid - missing title
            { properties: { title: 'Another Valid Record' } }
          for (let i = 0; i < operation.records.length; i++) {
            const record = operation.records[i];
            if (record.properties.title) {
              result.successful.push(MockData.factories.createBaseRecord(record));
            } else {
              result.failed.push({
                record,
                errors: [{
                  property: 'title',
                  message: 'Title is required',
                  code: 'VALIDATION_ERROR'
                }]
              });
            }
      expect(result.successful.length).toBe(2);
      expect(result.failed.length).toBe(1);
      expect(result.failed[0].errors).toContainEqual(
          code: 'VALIDATION_ERROR'
    it('should support transaction mode for bulk operations', async () => {
            { properties: { title: 'Transaction Record 1' } },
            { properties: { title: 'Transaction Record 2' } }
      const mockTransaction = {
        id: 'tx_123',
        operations: [],
        rollbackData: [],
        committed: false,
        startedAt: new Date()
      vi.spyOn(crudManager, 'beginTransaction').mockResolvedValue(mockTransaction);
      vi.spyOn(crudManager, 'commitTransaction').mockResolvedValue();
            result.successful.push(MockData.factories.createBaseRecord(record));
      const result = await crudManager.bulk(bulkOperations, { transactionMode: true });
      expect(crudManager.beginTransaction).toHaveBeenCalled();
      expect(crudManager.commitTransaction).toHaveBeenCalledWith(mockTransaction.id);
    it('should rollback transaction on bulk operation failure', async () => {
            { properties: { title: 'Record 1' } }
      const mockError = new Error('Bulk operation failed');
      vi.spyOn(crudManager, 'rollbackTransaction').mockResolvedValue();
      vi.spyOn(crudManager as any, 'processBulkOperation').mockRejectedValue(mockError);
      expect(crudManager.rollbackTransaction).toHaveBeenCalledWith(mockTransaction.id);
      expect(result.failed.length).toBeGreaterThan(0);
  describe('Transaction Management', () => {
    it('should begin transaction successfully', async () => {
      const transaction = await crudManager.beginTransaction();
      expect(transaction.id).toMatch(/^tx_\d+_[a-z0-9]+$/);
      expect(transaction.operations).toEqual([]);
      expect(transaction.rollbackData).toEqual([]);
      expect(transaction.committed).toBe(false);
      expect(transaction.startedAt).toBeInstanceOf(Date);
    it('should commit transaction successfully', async () => {
      
      vi.spyOn(crudManager as any, 'executeTransactionOperations').mockResolvedValue();
      await crudManager.commitTransaction(transaction.id);
      expect(console.log).toHaveBeenCalledWith(`Transaction committed: ${transaction.id}`);
    it('should rollback transaction on commit failure', async () => {
      const mockError = new Error('Commit failed');
      vi.spyOn(crudManager as any, 'executeTransactionOperations').mockRejectedValue(mockError);
      await expect(crudManager.commitTransaction(transaction.id)).rejects.toThrow(mockError);
      expect(crudManager.rollbackTransaction).toHaveBeenCalledWith(transaction.id);
    it('should handle transaction not found errors', async () => {
      const nonExistentTransactionId = 'tx_nonexistent';
      await expect(crudManager.commitTransaction(nonExistentTransactionId)).rejects.toThrow(
        `Transaction not found: ${nonExistentTransactionId}`
  describe('Query Builder Integration', () => {
    it('should build simple query', () => {
      const query = createQueryBuilder(baseSchema.id)
        .where('status', FilterOperator.EQUALS, 'in_progress')
        .limit(10)
        .build();
      expect(query).toEqual({
        sorts: [],
        limit: 10,
    it('should build complex query with multiple conditions', () => {
        .where('priority', FilterOperator.EQUALS, 'high')
        .where('assignee', FilterOperator.IS_NOT_EMPTY, null)
        .orderBy('updatedAt', 'desc')
        .orderBy('title', 'asc')
        .limit(50)
        .offset(100)
      expect(query.filters).toHaveLength(3);
      expect(query.sorts).toHaveLength(2);
      expect(query.limit).toBe(50);
      expect(query.offset).toBe(100);
    it('should chain query builder methods fluently', () => {
      const builder = createQueryBuilder(baseSchema.id);
      const result = builder
        .where('status', FilterOperator.EQUALS, 'done')
        .orderBy('completedAt', 'desc');
      expect(result).toBe(builder); // Should return same instance for chaining
});
describe('Bulk Operations Manager Integration', () => {
  let bulkManager: BulkOperationsManager;
    const mockConnection = createBaseConnection('https://test.api.com', 'test-key');
    mockClient = new BaseOperationsClient(mockConnection) as Mocked<BaseOperationsClient>;
    
    // Mock all client methods
    Object.getOwnPropertyNames(BaseOperationsClient.prototype).forEach(method => {
      if (method !== 'constructor') {
        vi.spyOn(mockClient, method as keyof BaseOperationsClient).mockResolvedValue({
          success: true,
          data: []
        } as any);
      }
    const config = createOptimizedBulkConfig(100);
    bulkManager = new BulkOperationsManager(mockClient, MockData.base.schema, config);
  it('should perform bulk create with progress tracking', async () => {
    const records = MockData.factories.generateLargeDataSet(100).baseRecords;
    let progressUpdates = 0;
    config.progressCallback = (progress) => {
      progressUpdates++;
      expect(progress.totalItems).toBe(100);
      expect(progress.processedItems).toBeGreaterThanOrEqual(0);
      expect(progress.startTime).toBeInstanceOf(Date);
    };
    const managerWithProgress = new BulkOperationsManager(mockClient, MockData.base.schema, config);
    mockClient.batchCreateRecords.mockResolvedValue({
      success: true,
      data: records.slice(0, 50) // Return first batch
    const result = await managerWithProgress.bulkCreate(records, MockData.base.schema.id);
    expect(result.success).toBe(true);
    expect(progressUpdates).toBeGreaterThan(0);
  it('should handle bulk operations with concurrency', async () => {
    const records = MockData.factories.generateLargeDataSet(200).baseRecords;
      data: []
    const result = await bulkManager.bulkCreate(records, MockData.base.schema.id);
    // Should have called batchCreateRecords multiple times due to batching
    expect(mockClient.batchCreateRecords).toHaveBeenCalledTimes(4); // 200 records / 50 batch size = 4 batches
  it('should calculate accurate performance metrics', async () => {
    const records = MockData.factories.generateLargeDataSet(10).baseRecords;
    mockClient.batchCreateRecords.mockImplementation(() => 
      new Promise(resolve => 
        setTimeout(() => resolve({ success: true, data: [] }), 100)
      )
    );
    expect(result.data?.metrics.totalDuration).toBeGreaterThan(0);
    expect(result.data?.metrics.averageItemTime).toBeGreaterThan(0);
    expect(result.data?.metrics.throughputPerSecond).toBeGreaterThan(0);
    expect(result.data?.metrics.errorRate).toBe(0);
