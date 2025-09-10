import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { JiraClient, JiraClientConfig, SearchParams, SearchResponse } from '../../src/jira-bases-adapter/jira-client';
import { requestUrl, RequestUrlResponse } from 'obsidian';

// Mock Obsidian's requestUrl
jest.mock('obsidian');

describe('JiraClient', () => {
  let jiraClient: JiraClient;
  let mockRequestUrl: jest.MockedFunction<typeof requestUrl>;
  
  const validConfig: JiraClientConfig = {
    baseUrl: 'https://test.atlassian.net',
    email: 'test@example.com',
    apiToken: 'test-api-token'
  };

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    
    // Create fresh instance
    jiraClient = new JiraClient();
    
    // Setup requestUrl mock with default success response
    mockRequestUrl = requestUrl as jest.MockedFunction<typeof requestUrl>;
    mockRequestUrl.mockResolvedValue({
      status: 200,
      headers: { 'content-type': 'application/json' },
      text: '{"mock": "response"}',
      json: { mock: 'response' },
      arrayBuffer: new ArrayBuffer(0)
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Configuration and Initialization', () => {
    it('should initialize with null configuration', () => {
      const client = new JiraClient();
      expect(client).toBeDefined();
    });

    it('should configure the client with valid configuration', () => {
      expect(() => {
        jiraClient.configure(validConfig);
      }).not.toThrow();
    });

    it('should throw error when not configured', async () => {
      const unconfiguredClient = new JiraClient();
      
      await expect(unconfiguredClient.searchIssues({ jql: 'test' }))
        .rejects.toThrow('JiraClient not configured');
      
      await expect(unconfiguredClient.getCurrentUser())
        .rejects.toThrow('JiraClient not configured');
      
      await expect(unconfiguredClient.getFields())
        .rejects.toThrow('JiraClient not configured');
    });
  });

  describe('Authentication Header Generation', () => {
    beforeEach(() => {
      jiraClient.configure(validConfig);
    });

    it('should generate correct Basic Auth headers', async () => {
      const searchParams: SearchParams = { jql: 'project = TEST' };
      
      await jiraClient.searchIssues(searchParams);
      
      const expectedAuth = Buffer.from('test@example.com:test-api-token').toString('base64');
      
      expect(mockRequestUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': `Basic ${expectedAuth}`,
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          })
        })
      );
    });

    it('should include all required headers', async () => {
      const searchParams: SearchParams = { jql: 'project = TEST' };
      
      await jiraClient.searchIssues(searchParams);
      
      expect(mockRequestUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': expect.stringMatching(/^Basic .+/),
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          })
        })
      );
    });
  });

  describe('Search API calls with /search/jql endpoint', () => {
    beforeEach(() => {
      jiraClient.configure(validConfig);
    });

    it('should call the correct /search/jql endpoint with POST method', async () => {
      const searchParams: SearchParams = { jql: 'project = TEST' };
      
      await jiraClient.searchIssues(searchParams);
      
      expect(mockRequestUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'https://test.atlassian.net/rest/api/3/search/jql',
          method: 'POST',
          body: expect.stringContaining('"jql":"project = TEST"')
        })
      );
    });

    it('should handle minimal search parameters with POST body', async () => {
      const searchParams: SearchParams = { jql: 'project = TEST' };
      const mockResponse = {
        issues: [{ key: 'TEST-1', summary: 'Test issue' }],
        total: 1,
        startAt: 0,
        maxResults: 50
      };
      
      mockRequestUrl.mockResolvedValue({
        status: 200,
        headers: { 'content-type': 'application/json' },
        text: JSON.stringify(mockResponse),
        json: mockResponse,
        arrayBuffer: new ArrayBuffer(0)
      });
      
      const result = await jiraClient.searchIssues(searchParams);
      
      expect(result).toEqual(mockResponse);
      expect(mockRequestUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            jql: 'project = TEST',
            maxResults: 50
          })
        })
      );
    });

    it('should handle all search parameters in POST body', async () => {
      const searchParams: SearchParams = {
        jql: 'project = TEST AND status = "In Progress"',
        startAt: 10,
        maxResults: 25,
        fields: ['summary', 'description', 'assignee'],
        expand: ['changelog', 'transitions'],
        validateQuery: true
      };
      
      await jiraClient.searchIssues(searchParams);
      
      expect(mockRequestUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'https://test.atlassian.net/rest/api/3/search/jql',
          method: 'POST',
          body: JSON.stringify({
            jql: 'project = TEST AND status = "In Progress"',
            maxResults: 1, // Reduced for validation queries
            fields: ['summary', 'description', 'assignee'],
            expand: ['changelog', 'transitions'],
            validateQuery: true
          })
        })
      );
    });

    it('should handle complex JQL queries in POST body', async () => {
      const complexJQL = 'project = TEST AND assignee in (currentUser(), "john.doe") AND created >= -7d ORDER BY priority DESC';
      const searchParams: SearchParams = { jql: complexJQL };
      
      await jiraClient.searchIssues(searchParams);
      
      expect(mockRequestUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            jql: complexJQL,
            maxResults: 50
          })
        })
      );
    });

    it('should default missing parameters correctly in POST body', async () => {
      const searchParams: SearchParams = { jql: 'project = TEST' };
      
      await jiraClient.searchIssues(searchParams);
      
      expect(mockRequestUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            jql: 'project = TEST',
            maxResults: 50
          })
        })
      );
    });

    it('should handle empty arrays for fields and expand', async () => {
      const searchParams: SearchParams = {
        jql: 'project = TEST',
        fields: [],
        expand: []
      };
      
      await jiraClient.searchIssues(searchParams);
      
      const calledUrl = (mockRequestUrl.mock.calls[0][0] as any).url;
      expect(calledUrl).not.toContain('fields=');
      expect(calledUrl).not.toContain('expand=');
    });
  });

  describe('getCurrentUser method', () => {
    beforeEach(() => {
      jiraClient.configure(validConfig);
    });

    it('should call the correct myself endpoint', async () => {
      const mockUser = {
        accountId: '123456',
        displayName: 'Test User',
        emailAddress: 'test@example.com'
      };
      
      mockRequestUrl.mockResolvedValue({
        status: 200,
        headers: { 'content-type': 'application/json' },
        text: JSON.stringify(mockUser),
        json: mockUser,
        arrayBuffer: new ArrayBuffer(0)
      });
      
      const result = await jiraClient.getCurrentUser();
      
      expect(result).toEqual(mockUser);
      expect(mockRequestUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'https://test.atlassian.net/rest/api/3/myself',
          method: 'GET'
        })
      );
    });

    it('should handle getCurrentUser errors', async () => {
      mockRequestUrl.mockResolvedValue({
        status: 401,
        headers: { 'content-type': 'application/json' },
        text: '{"errorMessages":["Authentication required"]}',
        json: { errorMessages: ['Authentication required'] },
        arrayBuffer: new ArrayBuffer(0)
      });
      
      await expect(jiraClient.getCurrentUser()).rejects.toMatchObject({
        status: 401,
        message: 'Authentication required'
      });
    });
  });

  describe('getFields method', () => {
    beforeEach(() => {
      jiraClient.configure(validConfig);
    });

    it('should call the correct field endpoint', async () => {
      const mockFields = [
        { id: 'summary', name: 'Summary', custom: false },
        { id: 'description', name: 'Description', custom: false },
        { id: 'customfield_10001', name: 'Story Points', custom: true }
      ];
      
      mockRequestUrl.mockResolvedValue({
        status: 200,
        headers: { 'content-type': 'application/json' },
        text: JSON.stringify(mockFields),
        json: mockFields,
        arrayBuffer: new ArrayBuffer(0)
      });
      
      const result = await jiraClient.getFields();
      
      expect(result).toEqual(mockFields);
      expect(mockRequestUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'https://test.atlassian.net/rest/api/3/field',
          method: 'GET'
        })
      );
    });

    it('should handle getFields errors', async () => {
      mockRequestUrl.mockResolvedValue({
        status: 403,
        headers: { 'content-type': 'application/json' },
        text: '{"errorMessages":["Permission denied"]}',
        json: { errorMessages: ['Permission denied'] },
        arrayBuffer: new ArrayBuffer(0)
      });
      
      await expect(jiraClient.getFields()).rejects.toMatchObject({
        status: 403,
        message: 'Permission denied'
      });
    });
  });

  describe('Error Handling', () => {
    beforeEach(() => {
      jiraClient.configure(validConfig);
    });

    it('should handle 400 Bad Request errors', async () => {
      mockRequestUrl.mockResolvedValue({
        status: 400,
        headers: { 'content-type': 'application/json' },
        text: '{"errorMessages":["Invalid JQL syntax"]}',
        json: { errorMessages: ['Invalid JQL syntax'] },
        arrayBuffer: new ArrayBuffer(0)
      });
      
      const searchParams: SearchParams = { jql: 'invalid JQL syntax' };
      
      await expect(jiraClient.searchIssues(searchParams)).rejects.toMatchObject({
        status: 400,
        message: 'Invalid JQL syntax'
      });
    });

    it('should handle 401 Authentication errors', async () => {
      mockRequestUrl.mockResolvedValue({
        status: 401,
        headers: { 'content-type': 'application/json' },
        text: '{"errorMessages":["Authentication failed"]}',
        json: { errorMessages: ['Authentication failed'] },
        arrayBuffer: new ArrayBuffer(0)
      });
      
      const searchParams: SearchParams = { jql: 'project = TEST' };
      
      await expect(jiraClient.searchIssues(searchParams)).rejects.toMatchObject({
        status: 401,
        message: 'Authentication failed'
      });
    });

    it('should handle 403 Forbidden errors', async () => {
      mockRequestUrl.mockResolvedValue({
        status: 403,
        headers: { 'content-type': 'application/json' },
        text: '{"errors":{"permission":"No permission to view issues"}}',
        json: { errors: { permission: 'No permission to view issues' } },
        arrayBuffer: new ArrayBuffer(0)
      });
      
      const searchParams: SearchParams = { jql: 'project = PRIVATE' };
      
      await expect(jiraClient.searchIssues(searchParams)).rejects.toMatchObject({
        status: 403,
        message: 'No permission to view issues'
      });
    });

    it('should handle 404 Not Found errors', async () => {
      mockRequestUrl.mockResolvedValue({
        status: 404,
        headers: { 'content-type': 'application/json' },
        text: '{}',
        json: {},
        arrayBuffer: new ArrayBuffer(0)
      });
      
      const searchParams: SearchParams = { jql: 'project = NONEXISTENT' };
      
      await expect(jiraClient.searchIssues(searchParams)).rejects.toMatchObject({
        status: 404,
        message: 'Jira endpoint not found - check your base URL'
      });
    });

    it('should handle 429 Rate Limit errors with retry-after header', async () => {
      mockRequestUrl.mockResolvedValue({
        status: 429,
        headers: {
          'content-type': 'application/json',
          'retry-after': '30'
        },
        text: '{"errorMessages":["Rate limit exceeded"]}',
        json: { errorMessages: ['Rate limit exceeded'] },
        arrayBuffer: new ArrayBuffer(0)
      });
      
      const searchParams: SearchParams = { jql: 'project = TEST' };
      
      await expect(jiraClient.searchIssues(searchParams)).rejects.toMatchObject({
        status: 429,
        message: 'Rate limit exceeded',
        retryAfter: 30
      });
    });

    it('should handle 429 Rate Limit errors with x-ratelimit-reset header', async () => {
      mockRequestUrl.mockResolvedValue({
        status: 429,
        headers: {
          'content-type': 'application/json',
          'x-ratelimit-reset': '60'
        },
        text: '{"errorMessages":["Too many requests"]}',
        json: { errorMessages: ['Too many requests'] },
        arrayBuffer: new ArrayBuffer(0)
      });
      
      const searchParams: SearchParams = { jql: 'project = TEST' };
      
      await expect(jiraClient.searchIssues(searchParams)).rejects.toMatchObject({
        status: 429,
        message: 'Too many requests',
        retryAfter: 60
      });
    });

    it('should handle 500 Internal Server Error', async () => {
      mockRequestUrl.mockResolvedValue({
        status: 500,
        headers: { 'content-type': 'application/json' },
        text: '{"errorMessages":["Internal server error"]}',
        json: { errorMessages: ['Internal server error'] },
        arrayBuffer: new ArrayBuffer(0)
      });
      
      const searchParams: SearchParams = { jql: 'project = TEST' };
      
      await expect(jiraClient.searchIssues(searchParams)).rejects.toMatchObject({
        status: 500,
        message: 'Internal server error'
      });
    });

    it('should handle 502 Bad Gateway errors', async () => {
      mockRequestUrl.mockResolvedValue({
        status: 502,
        headers: { 'content-type': 'application/json' },
        text: '{}',
        json: {},
        arrayBuffer: new ArrayBuffer(0)
      });
      
      const searchParams: SearchParams = { jql: 'project = TEST' };
      
      await expect(jiraClient.searchIssues(searchParams)).rejects.toMatchObject({
        status: 502,
        message: 'Jira server error - please try again later'
      });
    });

    it('should handle 503 Service Unavailable errors', async () => {
      mockRequestUrl.mockResolvedValue({
        status: 503,
        headers: { 'content-type': 'application/json' },
        text: '{}',
        json: {},
        arrayBuffer: new ArrayBuffer(0)
      });
      
      const searchParams: SearchParams = { jql: 'project = TEST' };
      
      await expect(jiraClient.searchIssues(searchParams)).rejects.toMatchObject({
        status: 503,
        message: 'Jira server error - please try again later'
      });
    });

    it('should handle unknown status codes', async () => {
      mockRequestUrl.mockResolvedValue({
        status: 418,
        headers: { 'content-type': 'application/json' },
        text: '{}',
        json: {},
        arrayBuffer: new ArrayBuffer(0)
      });
      
      const searchParams: SearchParams = { jql: 'project = TEST' };
      
      await expect(jiraClient.searchIssues(searchParams)).rejects.toMatchObject({
        status: 418,
        message: 'Jira API error (418)'
      });
    });

    it('should extract error messages from errorMessages array', async () => {
      mockRequestUrl.mockResolvedValue({
        status: 400,
        headers: { 'content-type': 'application/json' },
        text: '{"errorMessages":["Error 1", "Error 2"]}',
        json: { errorMessages: ['Error 1', 'Error 2'] },
        arrayBuffer: new ArrayBuffer(0)
      });
      
      const searchParams: SearchParams = { jql: 'invalid' };
      
      await expect(jiraClient.searchIssues(searchParams)).rejects.toMatchObject({
        status: 400,
        message: 'Error 1, Error 2'
      });
    });

    it('should extract error messages from errors object', async () => {
      mockRequestUrl.mockResolvedValue({
        status: 400,
        headers: { 'content-type': 'application/json' },
        text: '{"errors":{"field1":"Error 1","field2":"Error 2"}}',
        json: { errors: { field1: 'Error 1', field2: 'Error 2' } },
        arrayBuffer: new ArrayBuffer(0)
      });
      
      const searchParams: SearchParams = { jql: 'invalid' };
      
      await expect(jiraClient.searchIssues(searchParams)).rejects.toMatchObject({
        status: 400,
        message: 'Error 1, Error 2'
      });
    });

    it('should use default error message when JSON parsing fails', async () => {
      mockRequestUrl.mockResolvedValue({
        status: 400,
        headers: { 'content-type': 'text/html' },
        text: '<html>Bad Request</html>',
        json: null,
        arrayBuffer: new ArrayBuffer(0)
      });
      
      const searchParams: SearchParams = { jql: 'invalid' };
      
      await expect(jiraClient.searchIssues(searchParams)).rejects.toMatchObject({
        status: 400,
        message: 'Invalid JQL syntax or bad request'
      });
    });
  });

  describe('Network Error Handling', () => {
    beforeEach(() => {
      jiraClient.configure(validConfig);
    });

    it('should handle network errors', async () => {
      const networkError = new Error('Network connection failed');
      mockRequestUrl.mockRejectedValue(networkError);
      
      const searchParams: SearchParams = { jql: 'project = TEST' };
      
      await expect(jiraClient.searchIssues(searchParams)).rejects.toMatchObject({
        status: 0,
        message: 'Network request failed: Network connection failed',
        originalError: networkError
      });
    });

    it('should re-throw structured errors with status', async () => {
      const structuredError = { status: 401, message: 'Auth error' };
      mockRequestUrl.mockRejectedValue(structuredError);
      
      const searchParams: SearchParams = { jql: 'project = TEST' };
      
      await expect(jiraClient.searchIssues(searchParams)).rejects.toEqual(structuredError);
    });

    it('should handle timeout errors', async () => {
      const timeoutError = new Error('Request timeout');
      mockRequestUrl.mockRejectedValue(timeoutError);
      
      const searchParams: SearchParams = { jql: 'project = TEST' };
      
      await expect(jiraClient.searchIssues(searchParams)).rejects.toMatchObject({
        status: 0,
        message: 'Network request failed: Request timeout'
      });
    });
  });

  describe('Request Body Building', () => {
    beforeEach(() => {
      jiraClient.configure(validConfig);
    });

    it('should properly handle JQL queries with special characters in POST body', async () => {
      const jqlWithSpecialChars = 'project = "TEST PROJECT" AND assignee = "john.doe@example.com"';
      const searchParams: SearchParams = { jql: jqlWithSpecialChars };
      
      await jiraClient.searchIssues(searchParams);
      
      expect(mockRequestUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            jql: jqlWithSpecialChars,
            maxResults: 50
          })
        })
      );
    });

    it('should handle multiple fields correctly in POST body', async () => {
      const searchParams: SearchParams = {
        jql: 'project = TEST',
        fields: ['summary', 'description', 'assignee', 'customfield_10001']
      };
      
      await jiraClient.searchIssues(searchParams);
      
      expect(mockRequestUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            jql: 'project = TEST',
            maxResults: 50,
            fields: ['summary', 'description', 'assignee', 'customfield_10001']
          })
        })
      );
    });

    it('should handle multiple expand parameters correctly in POST body', async () => {
      const searchParams: SearchParams = {
        jql: 'project = TEST',
        expand: ['changelog', 'transitions', 'operations', 'renderedFields']
      };
      
      await jiraClient.searchIssues(searchParams);
      
      expect(mockRequestUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            jql: 'project = TEST',
            maxResults: 50,
            expand: ['changelog', 'transitions', 'operations', 'renderedFields']
          })
        })
      );
    });

    it('should handle pagination parameters in POST body (startAt deprecated, maxResults as number)', async () => {
      const searchParams: SearchParams = {
        jql: 'project = TEST',
        startAt: 100, // Deprecated but still accepted
        maxResults: 25
      };
      
      await jiraClient.searchIssues(searchParams);
      
      expect(mockRequestUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            jql: 'project = TEST',
            maxResults: 25
          })
        })
      );
    });

    it('should include validateQuery parameter when true in POST body', async () => {
      const searchParams: SearchParams = {
        jql: 'project = TEST',
        validateQuery: true
      };
      
      await jiraClient.searchIssues(searchParams);
      
      expect(mockRequestUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            jql: 'project = TEST',
            maxResults: 1, // Reduced for validation
            validateQuery: true
          })
        })
      );
    });

    it('should not include validateQuery parameter when false in POST body', async () => {
      const searchParams: SearchParams = {
        jql: 'project = TEST',
        validateQuery: false
      };
      
      await jiraClient.searchIssues(searchParams);
      
      const calledBody = JSON.parse((mockRequestUrl.mock.calls[0][0] as any).body);
      expect(calledBody.validateQuery).toBeUndefined();
      expect(calledBody).toEqual({
        jql: 'project = TEST',
        maxResults: 50
      });
    });

    it('should handle nextPageToken parameter for token-based pagination', async () => {
      const searchParams: SearchParams = {
        jql: 'project = TEST',
        nextPageToken: 'token123',
        maxResults: 25
      };
      
      await jiraClient.searchIssues(searchParams);
      
      expect(mockRequestUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            jql: 'project = TEST',
            maxResults: 25,
            nextPageToken: 'token123'
          })
        })
      );
    });
  });

  describe('Response Transformation', () => {
    beforeEach(() => {
      jiraClient.configure(validConfig);
    });

    it('should return successful response JSON directly', async () => {
      const expectedResponse: SearchResponse = {
        issues: [
          { key: 'TEST-1', summary: 'Issue 1' },
          { key: 'TEST-2', summary: 'Issue 2' }
        ],
        total: 2,
        startAt: 0,
        maxResults: 50
      };
      
      mockRequestUrl.mockResolvedValue({
        status: 200,
        headers: { 'content-type': 'application/json' },
        text: JSON.stringify(expectedResponse),
        json: expectedResponse,
        arrayBuffer: new ArrayBuffer(0)
      });
      
      const result = await jiraClient.searchIssues({ jql: 'project = TEST' });
      
      expect(result).toEqual(expectedResponse);
    });

    it('should handle empty results', async () => {
      const emptyResponse: SearchResponse = {
        issues: [],
        total: 0,
        startAt: 0,
        maxResults: 50
      };
      
      mockRequestUrl.mockResolvedValue({
        status: 200,
        headers: { 'content-type': 'application/json' },
        text: JSON.stringify(emptyResponse),
        json: emptyResponse,
        arrayBuffer: new ArrayBuffer(0)
      });
      
      const result = await jiraClient.searchIssues({ jql: 'project = EMPTY' });
      
      expect(result).toEqual(emptyResponse);
      expect(result.issues).toHaveLength(0);
    });

    it('should handle 201 Created as success', async () => {
      const response = { success: true };
      
      mockRequestUrl.mockResolvedValue({
        status: 201,
        headers: { 'content-type': 'application/json' },
        text: JSON.stringify(response),
        json: response,
        arrayBuffer: new ArrayBuffer(0)
      });
      
      const result = await jiraClient.searchIssues({ jql: 'project = TEST' });
      
      expect(result).toEqual(response);
    });

    it('should handle 299 as success (edge case)', async () => {
      const response = { data: 'success' };
      
      mockRequestUrl.mockResolvedValue({
        status: 299,
        headers: { 'content-type': 'application/json' },
        text: JSON.stringify(response),
        json: response,
        arrayBuffer: new ArrayBuffer(0)
      });
      
      const result = await jiraClient.searchIssues({ jql: 'project = TEST' });
      
      expect(result).toEqual(response);
    });
  });

  describe('Request Configuration', () => {
    beforeEach(() => {
      jiraClient.configure(validConfig);
    });

    it('should use POST method for search requests with new API', async () => {
      await jiraClient.searchIssues({ jql: 'project = TEST' });
      
      expect(mockRequestUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json'
          })
        })
      );
    });

    it('should set throw: false option', async () => {
      await jiraClient.searchIssues({ jql: 'project = TEST' });
      
      expect(mockRequestUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          throw: false
        })
      );
    });

    it('should use configured base URL', async () => {
      await jiraClient.searchIssues({ jql: 'project = TEST' });
      
      expect(mockRequestUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          url: expect.stringContaining('https://test.atlassian.net')
        })
      );
    });

    it('should handle different base URL formats', async () => {
      const configWithTrailingSlash: JiraClientConfig = {
        ...validConfig,
        baseUrl: 'https://test.atlassian.net/'
      };
      
      const clientWithTrailingSlash = new JiraClient();
      clientWithTrailingSlash.configure(configWithTrailingSlash);
      
      await clientWithTrailingSlash.searchIssues({ jql: 'project = TEST' });
      
      expect(mockRequestUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          url: expect.stringContaining('https://test.atlassian.net//rest/api/3')
        })
      );
    });
  });

  describe('Integration Edge Cases', () => {
    beforeEach(() => {
      jiraClient.configure(validConfig);
    });

    it('should handle very long JQL queries in POST body', async () => {
      const veryLongJQL = 'project = TEST AND assignee in (' + 
        Array(100).fill(0).map((_, i) => `"user${i}"`).join(', ') + 
        ') ORDER BY created DESC';
      
      const searchParams: SearchParams = { jql: veryLongJQL };
      
      await jiraClient.searchIssues(searchParams);
      
      expect(mockRequestUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            jql: veryLongJQL,
            maxResults: 50
          })
        })
      );
    });

    it('should handle maximum pagination parameters in POST body (startAt deprecated)', async () => {
      const searchParams: SearchParams = {
        jql: 'project = TEST',
        startAt: 999999, // Deprecated, not included in body
        maxResults: 1000
      };
      
      await jiraClient.searchIssues(searchParams);
      
      expect(mockRequestUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            jql: 'project = TEST',
            maxResults: 1000
          })
        })
      );
    });

    it('should handle zero maxResults in POST body', async () => {
      const searchParams: SearchParams = {
        jql: 'project = TEST',
        maxResults: 0
      };
      
      await jiraClient.searchIssues(searchParams);
      
      expect(mockRequestUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            jql: 'project = TEST',
            maxResults: 0
          })
        })
      );
    });

    it('should handle single field and expand parameters in POST body', async () => {
      const searchParams: SearchParams = {
        jql: 'project = TEST',
        fields: ['summary'],
        expand: ['changelog']
      };
      
      await jiraClient.searchIssues(searchParams);
      
      expect(mockRequestUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            jql: 'project = TEST',
            maxResults: 50,
            fields: ['summary'],
            expand: ['changelog']
          })
        })
      );
    });
  });
});