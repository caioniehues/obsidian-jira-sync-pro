/**
 * JiraBasesAdapter Integration Tests
 * Comprehensive test suite for the enhanced adapter functionality with property mapping
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { 
  JiraBasesAdapter, 
  JiraBasesConfig, 
  SyncOptions, 
  JiraBasesAdapterError 
} from '../../src/adapters/jira-bases-adapter';
import { BaseProperty, BasePropertyType } from '../../src/types/base-types';
import { JiraField, JiraFieldType, JiraIssue, JiraUser } from '../../src/types/jira-types';
import type { Mock, Mocked, MockedFunction } from 'vitest';
describe('JiraBasesAdapter Enhanced Tests', () => {
  let adapter: JiraBasesAdapter;
  let mockConfig: JiraBasesConfig;
  const mockJiraIssue: JiraIssue = {
    id: '12345',
    key: 'TEST-123',
    self: 'https://test.atlassian.net/rest/api/2/issue/12345',
    fields: {
      summary: 'Test Issue Title',
      description: 'Test issue description content',
      assignee: {
        accountId: 'user123',
        displayName: 'John Doe',
        emailAddress: 'john@example.com',
        active: true
      } as JiraUser,
      priority: {
        name: 'High',
        id: '3'
      },
      status: {
        name: 'In Progress',
        id: '10001'
      },
      labels: ['bug', 'frontend'],
      created: '2024-01-15T10:30:00.000Z',
      updated: '2024-01-16T14:45:00.000Z'
    }
  };
  beforeEach(() => {
    mockConfig = {
      jiraBaseUrl: 'https://test.atlassian.net',
      username: 'test@example.com',
      apiToken: 'test-token',
      baseId: 'base123',
      fieldMappings: {
        'summary': 'title',
        'description': 'description',
        'assignee': 'assignee',
        'priority': 'priority'
      },
      defaultProject: 'TEST',
      defaultIssueType: 'Story'
    };
    adapter = new JiraBasesAdapter(mockConfig);
    // Mock console methods to reduce test noise
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.clearAllMocks();
  describe('Enhanced Property Mapping Functionality', () => {
    it('should have property mapper and schema validator configured', () => {
      expect((adapter as any).propertyMapper).toBeDefined();
      expect((adapter as any).schemaValidator).toBeDefined();
    });
    it('should have field mappings from both defaults and config', () => {
      const mappings = adapter.getFieldMappings();
      expect(mappings.length).toBeGreaterThan(0);
      
      // Should include default mappings
      const summaryMapping = mappings.find(m => m.jiraFieldId === 'summary');
      expect(summaryMapping).toBeDefined();
      // Should include config mappings
      const configMapping = mappings.find(m => 
        mockConfig.fieldMappings && 
        m.jiraFieldId in mockConfig.fieldMappings
      );
      expect(configMapping).toBeDefined();
    });

    it('should provide methods for mapping management', () => {
      expect(typeof adapter.getFieldMappings).toBe('function');
      expect(typeof adapter.setFieldMapping).toBe('function');
      expect(typeof adapter.removeFieldMapping).toBe('function');
      expect(typeof adapter.testFieldMapping).toBe('function');
      expect(typeof adapter.validateProperties).toBe('function');
    });
  });

  describe('Error Handling', () => {
    it('should throw error when not initialized', async () => {
      const uninitializedAdapter = new JiraBasesAdapter(mockConfig);
      await expect(uninitializedAdapter.testFieldMapping({}))
        .rejects.toThrow('not initialized');
    });
  });

  describe('Configuration Validation', () => {
    it('should validate required config fields', () => {
      expect(() => new JiraBasesAdapter({} as any)).toThrow();
    });
    it('should accept valid configuration', () => {
      expect(() => new JiraBasesAdapter(mockConfig)).not.toThrow();
    });
  });
});
