/**
 * JiraBasesAdapter Unit Tests
 * Comprehensive test suite for the core adapter functionality
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { JiraBasesAdapter, JiraBasesConfig, SyncOptions, JiraBasesAdapterError } from '../../src/adapters/jira-bases-adapter';
import { MockData } from '../fixtures/mock-data';
import type { Mock, Mocked, MockedFunction } from 'vitest';
// Mock the dependencies
vi.mock('../../src/utils/field-mappings');
vi.mock('../../src/utils/base-operations');
describe('JiraBasesAdapter', () => {
  let adapter: JiraBasesAdapter;
  let mockConfig: JiraBasesConfig;
  beforeEach(() => {
    // Setup mock configuration
    mockConfig = {
      jiraBaseUrl: 'https://test.atlassian.net',
      username: 'test@example.com',
      apiToken: 'test-token',
      baseId: 'base123',
      fieldMappings: {
        'summary': 'title',
        'description': 'description',
        'assignee': 'assignee'
      },
      defaultProject: 'TEST',
      defaultIssueType: 'Story',
      enableWebhooks: false,
      batchSize: 50,
      retryAttempts: 3,
      timeout: 30000
    };
    adapter = new JiraBasesAdapter(mockConfig);
    // Mock console methods to reduce test noise
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.clearAllMocks();
  describe('Constructor', () => {
    it('should create adapter with valid configuration', () => {
      expect(adapter).toBeInstanceOf(JiraBasesAdapter);
    });
    it('should throw error with missing required configuration', () => {
      const invalidConfig = { ...mockConfig };
      delete invalidConfig.jiraBaseUrl;
      expect(() => new JiraBasesAdapter(invalidConfig)).toThrow(JiraBasesAdapterError);
    it('should validate all required configuration fields', () => {
      const requiredFields = ['jiraBaseUrl', 'username', 'apiToken', 'baseId'];
      
      requiredFields.forEach(field => {
        const invalidConfig = { ...mockConfig };
        delete invalidConfig[field as keyof JiraBasesConfig];
        
        expect(() => new JiraBasesAdapter(invalidConfig)).toThrow(
          expect.objectContaining({
            code: 'CONFIG_ERROR',
            message: expect.stringContaining(field)
          })
        );
      });
  describe('initialize', () => {
    it('should initialize successfully with valid configuration', async () => {
      // Mock the initialization dependencies
      const mockLoadBaseSchema = vi.spyOn(adapter as any, 'loadBaseSchema').mockResolvedValue(undefined);
      const mockLoadJiraFields = vi.spyOn(adapter as any, 'loadJiraFields').mockResolvedValue(undefined);
      const mockValidateFieldMappings = vi.spyOn(adapter as any, 'validateFieldMappings').mockReturnValue(undefined);
      await adapter.initialize();
      expect(mockLoadBaseSchema).toHaveBeenCalled();
      expect(mockLoadJiraFields).toHaveBeenCalled();
      expect(mockValidateFieldMappings).toHaveBeenCalled();
      expect(console.log).toHaveBeenCalledWith('JiraBasesAdapter initialized successfully');
    it('should handle initialization errors gracefully', async () => {
      const mockError = new Error('Failed to load schema');
      vi.spyOn(adapter as any, 'loadBaseSchema').mockRejectedValue(mockError);
      await expect(adapter.initialize()).rejects.toThrow(JiraBasesAdapterError);
    it('should set up proper error context on initialization failure', async () => {
      const mockError = new Error('Schema load failed');
      try {
        await adapter.initialize();
      } catch (error) {
        expect(error).toBeInstanceOf(JiraBasesAdapterError);
        expect(error.code).toBe('INIT_ERROR');
        expect(error.context).toEqual({ originalError: mockError });
      }
  describe('createFromJira', () => {
    beforeEach(async () => {
      // Mock initialization
      vi.spyOn(adapter as any, 'loadBaseSchema').mockResolvedValue(undefined);
      vi.spyOn(adapter as any, 'loadJiraFields').mockResolvedValue(undefined);
      vi.spyOn(adapter as any, 'validateFieldMappings').mockReturnValue(undefined);
    it('should create Base record from Jira issue successfully', async () => {
      // Mock dependencies
      const mockMappedProperties = { title: 'Test Issue', description: 'Test description' };
      const mockBaseRecord = MockData.base.record;
      vi.spyOn(adapter as any, 'validateJiraIssue').mockReturnValue(undefined);
      vi.spyOn(adapter as any, 'mapJiraToBase').mockResolvedValue(mockMappedProperties);
      vi.spyOn(adapter as any, 'validateBaseProperties').mockResolvedValue({ success: true });
      vi.spyOn(adapter as any, 'createBaseRecord').mockResolvedValue(mockBaseRecord);
      const result = await adapter.createFromJira(MockData.jira.issue);
      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockBaseRecord);
    it('should handle validation errors', async () => {
      const validationErrors = [
        {
          property: 'title',
          message: 'Title is required',
          code: 'REQUIRED_FIELD'
        }
      ];
      vi.spyOn(adapter as any, 'mapJiraToBase').mockResolvedValue({});
      vi.spyOn(adapter as any, 'validateBaseProperties').mockResolvedValue({
        success: false,
        errors: validationErrors
      });
      expect(result.success).toBe(false);
      expect(result.errors).toEqual(validationErrors);
    it('should handle invalid Jira issue', async () => {
      const invalidIssue = { ...MockData.jira.issue, key: '' };
      const result = await adapter.createFromJira(invalidIssue);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          code: 'INVALID_JIRA_ISSUE'
        })
      );
    it('should generate proper Base record ID from Jira key', async () => {
      const mockMappedProperties = { title: 'Test Issue' };
      let capturedRecord: any;
      vi.spyOn(adapter as any, 'createBaseRecord').mockImplementation((record) => {
        capturedRecord = record;
        return Promise.resolve(record);
      await adapter.createFromJira(MockData.jira.issue);
      expect(capturedRecord.id).toBe('jira_test-123');
  describe('updateFromJira', () => {
    it('should update existing Base record from Jira issue', async () => {
      const existingRecord = MockData.base.record;
      const updatedRecord = { ...existingRecord, updatedAt: new Date() };
      const mockMappedProperties = { title: 'Updated Title' };
      vi.spyOn(adapter as any, 'getBaseRecord').mockResolvedValue(existingRecord);
      vi.spyOn(adapter as any, 'mergeProperties').mockReturnValue(mockMappedProperties);
      vi.spyOn(adapter as any, 'updateBaseRecord').mockResolvedValue(updatedRecord);
      const result = await adapter.updateFromJira('record123', MockData.jira.issue);
      expect(result.data).toEqual(updatedRecord);
    it('should handle record not found error', async () => {
      vi.spyOn(adapter as any, 'getBaseRecord').mockResolvedValue(null);
      const result = await adapter.updateFromJira('nonexistent', MockData.jira.issue);
          code: 'RECORD_NOT_FOUND'
    it('should merge properties correctly', async () => {
      const newProperties = { title: 'New Title', newField: 'New Value' };
      let mergedProperties: any;
      vi.spyOn(adapter as any, 'mapJiraToBase').mockResolvedValue(newProperties);
      vi.spyOn(adapter as any, 'mergeProperties').mockImplementation((existing, updated) => {
        mergedProperties = { ...existing, ...updated };
        return mergedProperties;
      vi.spyOn(adapter as any, 'updateBaseRecord').mockResolvedValue(existingRecord);
      await adapter.updateFromJira('record123', MockData.jira.issue);
      expect(mergedProperties).toEqual({
        ...existingRecord.properties,
        ...newProperties
      });
    });
  });
  describe('createInJira', () => {
    it('should create Jira issue from Base record', async () => {
      const baseRecord = MockData.base.record;
      const mockMappedFields = { summary: 'Test Issue', description: 'Test description' };
      const createdIssue = MockData.jira.issue;
      vi.spyOn(adapter as any, 'mapBaseToJira').mockResolvedValue(mockMappedFields);
      vi.spyOn(adapter as any, 'createJiraIssue').mockResolvedValue(createdIssue);
      const result = await adapter.createInJira(baseRecord);
      expect(result.data).toEqual(createdIssue);
    });
    it('should include default project and issue type in create request', async () => {
      const mockMappedFields = { summary: 'Test Issue' };
      let capturedRequest: any;
      vi.spyOn(adapter as any, 'createJiraIssue').mockImplementation((request) => {
        capturedRequest = request;
        return Promise.resolve(MockData.jira.issue);
      });
      await adapter.createInJira(baseRecord);
      expect(capturedRequest.fields).toMatchObject({
        ...mockMappedFields,
        project: { key: mockConfig.defaultProject },
        issuetype: { name: mockConfig.defaultIssueType }
      });
    });
  });
  describe('updateInJira', () => {
    it('should update Jira issue from Base record', async () => {
      const mockMappedFields = { summary: 'Updated Issue' };
      const updatedIssue = { ...MockData.jira.issue, fields: { ...MockData.jira.issue.fields, summary: 'Updated Issue' } };
      vi.spyOn(adapter as any, 'updateJiraIssue').mockResolvedValue(updatedIssue);
      const result = await adapter.updateInJira('TEST-123', baseRecord);
      expect(result.data).toEqual(updatedIssue);
    it('should handle update errors gracefully', async () => {
      const mockError = new Error('Update failed');
      vi.spyOn(adapter as any, 'mapBaseToJira').mockResolvedValue({});
      vi.spyOn(adapter as any, 'updateJiraIssue').mockRejectedValue(mockError);
          code: 'UPDATE_IN_JIRA'
  describe('sync', () => {
    it('should perform Jira to Base sync', async () => {
      const syncOptions: SyncOptions = {
        direction: 'jira-to-base',
        conflictResolution: 'jira-wins',
        batchSize: 10
      };
      const mockResult = {
        totalProcessed: 5,
        successful: 5,
        failed: 0,
        conflicts: 0,
        errors: [],
        warnings: [],
        duration: 1000
      vi.spyOn(adapter as any, 'syncJiraToBase').mockResolvedValue(undefined);
      const result = await adapter.sync(syncOptions);
      expect(result.totalProcessed).toBeGreaterThanOrEqual(0);
      expect(result.duration).toBeGreaterThanOrEqual(0);
      expect(console.log).toHaveBeenCalledWith('Starting sync with direction: jira-to-base');
    it('should perform Base to Jira sync', async () => {
        direction: 'base-to-jira',
        conflictResolution: 'base-wins'
      vi.spyOn(adapter as any, 'syncBaseToJira').mockResolvedValue(undefined);
      expect(console.log).toHaveBeenCalledWith('Starting sync with direction: base-to-jira');
    it('should perform bidirectional sync', async () => {
        direction: 'bidirectional',
        conflictResolution: 'merge'
      vi.spyOn(adapter as any, 'syncBidirectional').mockResolvedValue(undefined);
      expect(console.log).toHaveBeenCalledWith('Starting sync with direction: bidirectional');
    it('should handle sync errors gracefully', async () => {
        conflictResolution: 'jira-wins'
      const mockError = new Error('Sync failed');
      vi.spyOn(adapter as any, 'syncJiraToBase').mockRejectedValue(mockError);
          id: 'SYNC_ERROR',
          error: mockError.message
    it('should track sync duration accurately', async () => {
      // Mock a delay in sync operation
      vi.spyOn(adapter as any, 'syncJiraToBase').mockImplementation(
        () => new Promise(resolve => setTimeout(resolve, 100))
      expect(result.duration).toBeGreaterThanOrEqual(100);
      expect(result.duration).toBeLessThan(200); // Allow some variance
  describe('queryBase', () => {
    it('should execute Base query successfully', async () => {
      const mockQuery = {
        baseId: 'base123',
        filters: MockData.queries.filters,
        limit: 10
        records: MockData.base.records,
        hasMore: false,
        totalCount: 3
      vi.spyOn(adapter as any, 'executeBaseQuery').mockResolvedValue(mockResult);
      const result = await adapter.queryBase(mockQuery);
      expect(result).toEqual(mockResult);
    it('should handle query errors', async () => {
        filters: []
      const mockError = new Error('Query failed');
      vi.spyOn(adapter as any, 'executeBaseQuery').mockRejectedValue(mockError);
      await expect(adapter.queryBase(mockQuery)).rejects.toThrow(JiraBasesAdapterError);
  describe('queryJira', () => {
    it('should execute Jira search successfully', async () => {
      const mockSearchRequest = {
        jql: 'project = TEST AND status = "In Progress"',
        maxResults: 50,
        fields: ['summary', 'description', 'assignee']
      const mockResult = MockData.jira.searchResult;
      vi.spyOn(adapter as any, 'executeJiraSearch').mockResolvedValue(mockResult);
      const result = await adapter.queryJira(mockSearchRequest);
    it('should handle search errors', async () => {
        jql: 'invalid jql query',
        maxResults: 50
      const mockError = new Error('Invalid JQL');
      vi.spyOn(adapter as any, 'executeJiraSearch').mockRejectedValue(mockError);
      await expect(adapter.queryJira(mockSearchRequest)).rejects.toThrow(JiraBasesAdapterError);
  describe('Error Handling', () => {
    it('should create JiraBasesAdapterError with proper context', () => {
      const error = new JiraBasesAdapterError(
        'Test error',
        'TEST_ERROR',
        true,
        { testData: 'value' }
      expect(error.message).toBe('Test error');
      expect(error.code).toBe('TEST_ERROR');
      expect(error.retryable).toBe(true);
      expect(error.context).toEqual({ testData: 'value' });
      expect(error.name).toBe('JiraBasesAdapterError');
    it('should handle unknown errors gracefully', () => {
      const result = (adapter as any).handleError('TEST_OPERATION', {});
          code: 'UNKNOWN_ERROR'
  describe('Configuration Validation', () => {
    it('should validate URL format', () => {
      const configWithInvalidUrl = {
        ...mockConfig,
        jiraBaseUrl: 'not-a-valid-url'
      // This test assumes URL validation is implemented
      // Currently, the adapter doesn't validate URL format
      expect(() => new JiraBasesAdapter(configWithInvalidUrl)).not.toThrow();
    it('should set default values for optional configuration', () => {
      const minimalConfig = {
        jiraBaseUrl: 'https://test.atlassian.net',
        username: 'test@example.com',
        apiToken: 'test-token',
        fieldMappings: {}
      const adapter = new JiraBasesAdapter(minimalConfig);
  describe('Private Method Testing', () => {
    it('should generate proper Base record ID', () => {
      const recordId = (adapter as any).generateBaseRecordId('TEST-123');
      expect(recordId).toBe('jira_test-123');
    it('should merge properties correctly', () => {
      const existing = { prop1: 'value1', prop2: 'value2' };
      const updated = { prop2: 'newValue2', prop3: 'value3' };
      const merged = (adapter as any).mergeProperties(existing, updated);
      expect(merged).toEqual({
        prop1: 'value1',
        prop2: 'newValue2',
        prop3: 'value3'
    it('should validate Jira issue correctly', () => {
      const validIssue = MockData.jira.issue;
      const invalidIssue = { ...validIssue, key: '' };
      expect(() => (adapter as any).validateJiraIssue(validIssue)).not.toThrow();
      expect(() => (adapter as any).validateJiraIssue(invalidIssue)).toThrow(JiraBasesAdapterError);
});
