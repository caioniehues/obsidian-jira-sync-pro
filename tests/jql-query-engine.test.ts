import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { JQLQueryEngine } from '../src/enhanced-sync/jql-query-engine';
import { JiraClient } from '../src/jira-bases-adapter/jira-client';
import { Notice } from 'obsidian';

// Mock Obsidian Notice
jest.mock('obsidian', () => ({
  Notice: jest.fn()
}));

// Mock JiraClient
jest.mock('../src/jira-bases-adapter/jira-client');

describe('JQLQueryEngine', () => {
  let engine: JQLQueryEngine;
  let mockJiraClient: jest.Mocked<JiraClient>;
  let progressCallback: jest.Mock;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Create mock Jira client
    mockJiraClient = new JiraClient() as jest.Mocked<JiraClient>;
    
    // Create progress callback spy
    progressCallback = jest.fn();
    
    // Initialize engine with mocked client
    engine = new JQLQueryEngine(mockJiraClient);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Query Validation', () => {
    it('should validate correct JQL syntax', async () => {
      // Arrange
      const validJQL = 'assignee = currentUser() AND status NOT IN (Done, Closed)';
      mockJiraClient.searchIssues = jest.fn().mockResolvedValue({
        issues: [],
        total: 0,
        startAt: 0,
        maxResults: 0
      });

      // Act
      const isValid = await engine.validateQuery(validJQL);

      // Assert
      expect(isValid).toBe(true);
      expect(mockJiraClient.searchIssues).toHaveBeenCalledWith({
        jql: validJQL,
        maxResults: 0,
        validateQuery: true
      });
    });

    it('should reject invalid JQL syntax', async () => {
      // Arrange
      const invalidJQL = 'assignee == currentUser() ANDD status';
      mockJiraClient.searchIssues = jest.fn().mockRejectedValue({
        status: 400,
        message: 'Invalid JQL syntax'
      });

      // Act
      const isValid = await engine.validateQuery(invalidJQL);

      // Assert
      expect(isValid).toBe(false);
      expect(mockJiraClient.searchIssues).toHaveBeenCalled();
    });

    it('should handle empty JQL query', async () => {
      // Arrange
      const emptyJQL = '';

      // Act
      const isValid = await engine.validateQuery(emptyJQL);

      // Assert
      expect(isValid).toBe(false);
      expect(mockJiraClient.searchIssues).not.toHaveBeenCalled();
    });
  });

  describe('Query Execution', () => {
    it('should execute simple query with single page of results', async () => {
      // Arrange
      const jql = 'project = TEST';
      const mockIssues = [
        { key: 'TEST-1', fields: { summary: 'Issue 1' } },
        { key: 'TEST-2', fields: { summary: 'Issue 2' } }
      ];
      
      mockJiraClient.searchIssues = jest.fn().mockResolvedValue({
        issues: mockIssues,
        total: 2,
        startAt: 0,
        maxResults: 50
      });

      // Act
      const result = await engine.executeQuery({
        jql,
        maxResults: 50,
        batchSize: 50,
        onProgress: progressCallback
      });

      // Assert
      expect(result.issues).toEqual(mockIssues);
      expect(result.total).toBe(2);
      expect(progressCallback).toHaveBeenCalledWith(2, 2, 'complete');
      expect(mockJiraClient.searchIssues).toHaveBeenCalledTimes(1);
    });

    it('should handle pagination for large result sets', async () => {
      // Arrange
      const jql = 'project = LARGE';
      const page1Issues = Array(50).fill(null).map((_, i) => ({
        key: `LARGE-${i + 1}`,
        fields: { summary: `Issue ${i + 1}` }
      }));
      const page2Issues = Array(25).fill(null).map((_, i) => ({
        key: `LARGE-${i + 51}`,
        fields: { summary: `Issue ${i + 51}` }
      }));

      mockJiraClient.searchIssues = jest.fn()
        .mockResolvedValueOnce({
          issues: page1Issues,
          total: 75,
          startAt: 0,
          maxResults: 50,
          nextPageToken: 'token_page_1',
          isLast: false
        })
        .mockResolvedValueOnce({
          issues: page2Issues,
          total: 75,
          startAt: 50,
          maxResults: 50,
          nextPageToken: undefined,
          isLast: true
        });

      // Act
      const result = await engine.executeQuery({
        jql,
        maxResults: 100,
        batchSize: 50,
        onProgress: progressCallback
      });

      // Assert
      expect(result.issues).toHaveLength(75);
      expect(result.total).toBe(75);
      expect(mockJiraClient.searchIssues).toHaveBeenCalledTimes(2);
      expect(progressCallback).toHaveBeenCalledWith(50, 75, 'downloading');
      expect(progressCallback).toHaveBeenCalledWith(75, 75, 'complete');
    });

    it('should respect maxResults limit', async () => {
      // Arrange
      const jql = 'project = HUGE';
      const page1Issues = Array(50).fill(null).map((_, i) => ({
        key: `HUGE-${i + 1}`,
        fields: { summary: `Issue ${i + 1}` }
      }));
      const page2Issues = Array(50).fill(null).map((_, i) => ({
        key: `HUGE-${i + 51}`,
        fields: { summary: `Issue ${i + 51}` }
      }));

      mockJiraClient.searchIssues = jest.fn()
        .mockResolvedValueOnce({
          issues: page1Issues,
          total: 2000,
          startAt: 0,
          maxResults: 50
        })
        .mockResolvedValueOnce({
          issues: page2Issues,
          total: 2000,
          startAt: 50,
          maxResults: 50
        });

      // Act
      const result = await engine.executeQuery({
        jql,
        maxResults: 100,
        batchSize: 50,
        onProgress: progressCallback
      });

      // Assert
      expect(result.issues).toHaveLength(100);
      expect(result.total).toBe(2000);
      expect(result.truncated).toBe(true);
      expect(mockJiraClient.searchIssues).toHaveBeenCalledTimes(2);
    });

    it('should handle zero results gracefully', async () => {
      // Arrange
      const jql = 'project = EMPTY';
      mockJiraClient.searchIssues = jest.fn().mockResolvedValue({
        issues: [],
        total: 0,
        startAt: 0,
        maxResults: 50
      });

      // Act
      const result = await engine.executeQuery({
        jql,
        maxResults: 50,
        batchSize: 50,
        onProgress: progressCallback
      });

      // Assert
      expect(result.issues).toEqual([]);
      expect(result.total).toBe(0);
      expect(progressCallback).toHaveBeenCalledWith(0, 0, 'complete');
    });
  });

  describe('Error Handling', () => {
    it('should handle network errors gracefully', async () => {
      // Arrange
      const jql = 'project = TEST';
      mockJiraClient.searchIssues = jest.fn().mockRejectedValue(
        new Error('Network request failed')
      );

      // Act & Assert
      await expect(engine.executeQuery({
        jql,
        maxResults: 50,
        batchSize: 50
      })).rejects.toThrow('Network request failed');
      
      expect(mockJiraClient.searchIssues).toHaveBeenCalledTimes(1);
    });

    it('should handle API rate limiting with retry', async () => {
      // Arrange
      const jql = 'project = TEST';
      const rateLimitError = {
        status: 429,
        message: 'Rate limit exceeded',
        retryAfter: 1
      };
      const mockIssues = [{ key: 'TEST-1', fields: { summary: 'Issue 1' } }];

      mockJiraClient.searchIssues = jest.fn()
        .mockRejectedValueOnce(rateLimitError)
        .mockResolvedValueOnce({
          issues: mockIssues,
          total: 1,
          startAt: 0,
          maxResults: 50
        });

      // Act
      const result = await engine.executeQuery({
        jql,
        maxResults: 50,
        batchSize: 50,
        enableRetry: true
      });

      // Assert
      expect(result.issues).toEqual(mockIssues);
      expect(mockJiraClient.searchIssues).toHaveBeenCalledTimes(2);
    });

    it('should handle authentication errors', async () => {
      // Arrange
      const jql = 'project = TEST';
      const authError = {
        status: 401,
        message: 'Authentication required'
      };

      mockJiraClient.searchIssues = jest.fn().mockRejectedValue(authError);

      // Act & Assert
      await expect(engine.executeQuery({
        jql,
        maxResults: 50,
        batchSize: 50
      })).rejects.toMatchObject({
        status: 401,
        message: 'Authentication required'
      });
      
      expect(mockJiraClient.searchIssues).toHaveBeenCalledTimes(1);
    });

    it('should handle permission errors', async () => {
      // Arrange
      const jql = 'project = SECRET';
      const permissionError = {
        status: 403,
        message: 'You do not have permission to view these issues'
      };

      mockJiraClient.searchIssues = jest.fn().mockRejectedValue(permissionError);

      // Act & Assert
      await expect(engine.executeQuery({
        jql,
        maxResults: 50,
        batchSize: 50
      })).rejects.toMatchObject({
        status: 403,
        message: 'You do not have permission to view these issues'
      });
    });
  });

  describe('Field Selection', () => {
    it('should request only specified fields', async () => {
      // Arrange
      const jql = 'project = TEST';
      const fields = ['summary', 'status', 'assignee', 'priority'];
      mockJiraClient.searchIssues = jest.fn().mockResolvedValue({
        issues: [],
        total: 0,
        startAt: 0,
        maxResults: 50
      });

      // Act
      await engine.executeQuery({
        jql,
        maxResults: 50,
        batchSize: 50,
        fields
      });

      // Assert
      expect(mockJiraClient.searchIssues).toHaveBeenCalledWith(
        expect.objectContaining({
          fields: fields
        })
      );
    });

    it('should use default fields when none specified', async () => {
      // Arrange
      const jql = 'project = TEST';
      mockJiraClient.searchIssues = jest.fn().mockResolvedValue({
        issues: [],
        total: 0,
        startAt: 0,
        maxResults: 50
      });

      // Act
      await engine.executeQuery({
        jql,
        maxResults: 50,
        batchSize: 50
      });

      // Assert
      expect(mockJiraClient.searchIssues).toHaveBeenCalledWith(
        expect.objectContaining({
          fields: expect.arrayContaining([
            'summary',
            'status',
            'assignee',
            'priority',
            'created',
            'updated',
            'description',
            'issuetype',
            'project'
          ])
        })
      );
    });
  });

  describe('Progress Callbacks', () => {
    it('should report progress during multi-page fetch', async () => {
      // Arrange
      const jql = 'project = TEST';
      const page1 = Array(50).fill(null).map((_, i) => ({
        key: `TEST-${i + 1}`,
        fields: { summary: `Issue ${i + 1}` }
      }));
      const page2 = Array(30).fill(null).map((_, i) => ({
        key: `TEST-${i + 51}`,
        fields: { summary: `Issue ${i + 51}` }
      }));

      mockJiraClient.searchIssues = jest.fn()
        .mockResolvedValueOnce({
          issues: page1,
          total: 80,
          startAt: 0,
          maxResults: 50
        })
        .mockResolvedValueOnce({
          issues: page2,
          total: 80,
          startAt: 50,
          maxResults: 50
        });

      // Act
      await engine.executeQuery({
        jql,
        maxResults: 100,
        batchSize: 50,
        onProgress: progressCallback
      });

      // Assert
      expect(progressCallback).toHaveBeenCalledWith(0, 80, 'searching');
      expect(progressCallback).toHaveBeenCalledWith(50, 80, 'downloading');
      expect(progressCallback).toHaveBeenCalledWith(80, 80, 'complete');
      expect(progressCallback).toHaveBeenCalledTimes(4);
    });

    it('should handle progress callback errors gracefully', async () => {
      // Arrange
      const jql = 'project = TEST';
      const faultyCallback = jest.fn().mockImplementation(() => {
        throw new Error('Callback error');
      });
      
      mockJiraClient.searchIssues = jest.fn().mockResolvedValue({
        issues: [{ key: 'TEST-1', fields: { summary: 'Issue 1' } }],
        total: 1,
        startAt: 0,
        maxResults: 50
      });

      // Act
      const result = await engine.executeQuery({
        jql,
        maxResults: 50,
        batchSize: 50,
        onProgress: faultyCallback
      });

      // Assert - Should complete despite callback error
      expect(result.issues).toHaveLength(1);
      expect(faultyCallback).toHaveBeenCalled();
    });
  });

  describe('Query Cancellation', () => {
    it('should support query cancellation', async () => {
      // Arrange
      const jql = 'project = TEST';
      const abortController = new AbortController();
      
      mockJiraClient.searchIssues = jest.fn().mockImplementation(async () => {
        // Simulate delay
        await new Promise(resolve => setTimeout(resolve, 100));
        throw new Error('Request aborted');
      });

      // Act
      const queryPromise = engine.executeQuery({
        jql,
        maxResults: 50,
        batchSize: 50,
        signal: abortController.signal
      });

      // Cancel after starting
      setTimeout(() => abortController.abort(), 10);

      // Assert
      await expect(queryPromise).rejects.toThrow('Request aborted');
    });
  });
});