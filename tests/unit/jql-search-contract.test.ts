import { describe, it, expect, vi, beforeEach, afterEach } from '@vitest/globals';
import { JiraClient, JiraClientConfig } from '../../src/jira-bases-adapter/jira-client';
import { requestUrl, RequestUrlResponse } from 'obsidian';

// Mock Obsidian's requestUrl
vi.mock('obsidian');

/**
 * JQL Search Contract Tests
 * 
 * Testing the NEW POST /rest/api/3/search/jql endpoint contract
 * as specified in specs/001-jql-auto-sync/contracts/jql-search.yaml
 * 
 * CRITICAL: These tests MUST FAIL initially (TDD requirement)
 * The current JiraClient implementation uses GET method and startAt pagination,
 * but the new API contract requires POST method and nextPageToken pagination.
 */
describe('JQL Search Contract Tests', () => {
  let jiraClient: JiraClient;
  let mockRequestUrl: vi.MockedFunction<typeof requestUrl>;
  
  const validConfig: JiraClientConfig = {
    baseUrl: 'https://test.atlassian.net',
    email: 'test@example.com',
    apiToken: 'test-api-token'
  };

  beforeEach(() => {
    vi.clearAllMocks();
    jiraClient = new JiraClient();
    jiraClient.configure(validConfig);
    
    // Setup requestUrl mock with default success response
    mockRequestUrl = requestUrl as vi.MockedFunction<typeof requestUrl>;
    mockRequestUrl.mockResolvedValue({
      status: 200,
      headers: { 'content-type': 'application/json' },
      text: '{"mock": "response"}',
      json: { mock: 'response' },
      arrayBuffer: new ArrayBuffer(0)
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('API Endpoint Contract', () => {
    it('should execute JQL search with new POST API endpoint', async () => {
      // NEW API CONTRACT: POST method with request body
      const expectedResponse = {
        maxResults: 50,
        startAt: 0, // Always 0 in new API
        total: 125,
        issues: [
          { 
            key: 'TEST-1', 
            id: '10001',
            self: 'https://test.atlassian.net/rest/api/3/issue/10001',
            fields: { summary: 'Test issue 1' }
          },
          { 
            key: 'TEST-2', 
            id: '10002', 
            self: 'https://test.atlassian.net/rest/api/3/issue/10002',
            fields: { summary: 'Test issue 2' }
          }
        ],
        nextPageToken: 'CAEaAggD' // Token-based pagination
      };

      mockRequestUrl.mockResolvedValue({
        status: 200,
        headers: { 'content-type': 'application/json' },
        text: JSON.stringify(expectedResponse),
        json: expectedResponse,
        arrayBuffer: new ArrayBuffer(0)
      });

      const params = { 
        jql: 'project = TEST AND status != Done',
        fields: ['summary', 'status', 'assignee']
      };

      const result = await jiraClient.searchIssues(params);

      // EXPECTED TO FAIL: Current implementation uses GET method
      expect(mockRequestUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST', // NEW: POST instead of GET
          url: 'https://test.atlassian.net/rest/api/3/search/jql', // No query params
          body: JSON.stringify({
            jql: 'project = TEST AND status != Done',
            maxResults: 50,
            fields: ['summary', 'status', 'assignee']
            // No nextPageToken on first request
          }),
          headers: expect.objectContaining({
            'Content-Type': 'application/json'
          })
        })
      );

      expect(result).toEqual(expectedResponse);
    });
  });

  describe('Token-based Pagination Contract', () => {
    it('should handle token-based pagination with nextPageToken', async () => {
      // Test pagination with nextPageToken (NEW CONTRACT)
      const firstPageResponse = {
        maxResults: 2,
        startAt: 0,
        total: 5,
        issues: [
          { key: 'TEST-1', id: '10001', self: 'https://test.atlassian.net/rest/api/3/issue/10001' },
          { key: 'TEST-2', id: '10002', self: 'https://test.atlassian.net/rest/api/3/issue/10002' }
        ],
        nextPageToken: 'CAEaAggD'
      };

      const secondPageResponse = {
        maxResults: 2,
        startAt: 0, // Always 0 in new API
        total: 5,
        issues: [
          { key: 'TEST-3', id: '10003', self: 'https://test.atlassian.net/rest/api/3/issue/10003' },
          { key: 'TEST-4', id: '10004', self: 'https://test.atlassian.net/rest/api/3/issue/10004' }
        ],
        nextPageToken: 'CAEaAggE'
      };

      mockRequestUrl
        .mockResolvedValueOnce({
          status: 200,
          headers: { 'content-type': 'application/json' },
          text: JSON.stringify(firstPageResponse),
          json: firstPageResponse,
          arrayBuffer: new ArrayBuffer(0)
        })
        .mockResolvedValueOnce({
          status: 200,
          headers: { 'content-type': 'application/json' },
          text: JSON.stringify(secondPageResponse),
          json: secondPageResponse,
          arrayBuffer: new ArrayBuffer(0)
        });

      // First page request
      const firstResult = await jiraClient.searchIssues({
        jql: 'project = TEST',
        maxResults: 2
      });

      // EXPECTED TO FAIL: Current implementation doesn't support nextPageToken
      expect(firstResult.nextPageToken).toBe('CAEaAggD');
      expect(firstResult.startAt).toBe(0); // Always 0 in new API

      // Second page request using nextPageToken
      const secondResult = await jiraClient.searchIssues({
        jql: 'project = TEST',
        maxResults: 2,
        nextPageToken: 'CAEaAggD' // NEW: Token instead of startAt
      });

      // Verify second request uses nextPageToken in POST body
      expect(mockRequestUrl).toHaveBeenNthCalledWith(2, 
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            jql: 'project = TEST',
            maxResults: 2,
            nextPageToken: 'CAEaAggD' // NEW: Token-based pagination
          })
        })
      );

      expect(secondResult.nextPageToken).toBe('CAEaAggE');
    });

    it('should handle last page without nextPageToken', async () => {
      const lastPageResponse = {
        maxResults: 1,
        startAt: 0,
        total: 3,
        issues: [
          { key: 'TEST-3', id: '10003', self: 'https://test.atlassian.net/rest/api/3/issue/10003' }
        ]
        // No nextPageToken indicates last page
      };

      mockRequestUrl.mockResolvedValue({
        status: 200,
        headers: { 'content-type': 'application/json' },
        text: JSON.stringify(lastPageResponse),
        json: lastPageResponse,
        arrayBuffer: new ArrayBuffer(0)
      });

      const result = await jiraClient.searchIssues({
        jql: 'project = TEST',
        maxResults: 1,
        nextPageToken: 'CAEaAggE'
      });

      // EXPECTED TO FAIL: Current implementation doesn't recognize absent nextPageToken
      expect(result.nextPageToken).toBeUndefined();
      expect(result.issues).toHaveLength(1);
    });
  });

  describe('Field Selection Optimization Contract', () => {
    it('should request specific fields optimization', async () => {
      const optimizedResponse = {
        maxResults: 50,
        startAt: 0,
        total: 10,
        issues: [
          {
            key: 'TEST-1',
            id: '10001',
            self: 'https://test.atlassian.net/rest/api/3/issue/10001',
            fields: {
              summary: 'Optimized response with only requested fields',
              status: { name: 'In Progress', statusCategory: { key: 'indeterminate' } },
              assignee: { accountId: '5b10a2844c20165700ede21g', displayName: 'John Doe' },
              priority: { name: 'High' },
              updated: '2025-09-10T14:30:00.000+0000'
            }
          }
        ]
      };

      mockRequestUrl.mockResolvedValue({
        status: 200,
        headers: { 'content-type': 'application/json' },
        text: JSON.stringify(optimizedResponse),
        json: optimizedResponse,
        arrayBuffer: new ArrayBuffer(0)
      });

      const result = await jiraClient.searchIssues({
        jql: 'assignee = currentUser()',
        fields: ['summary', 'status', 'assignee', 'priority', 'updated'],
        expand: ['changelog']
      });

      // EXPECTED TO FAIL: Current implementation uses GET with query params
      expect(mockRequestUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            jql: 'assignee = currentUser()',
            maxResults: 50,
            fields: ['summary', 'status', 'assignee', 'priority', 'updated'],
            expand: ['changelog']
          })
        })
      );

      expect(result.issues[0].fields).toHaveProperty('summary');
      expect(result.issues[0].fields).toHaveProperty('status');
      expect(result.issues[0].fields).toHaveProperty('assignee');
    });
  });

  describe('Error Handling Contract', () => {
    it('should handle 400 Bad Request for invalid JQL', async () => {
      const errorResponse = {
        errorMessages: ["The value 'invalidfield' does not exist for the field 'field'."],
        errors: {}
      };

      mockRequestUrl.mockResolvedValue({
        status: 400,
        headers: { 'content-type': 'application/json' },
        text: JSON.stringify(errorResponse),
        json: errorResponse,
        arrayBuffer: new ArrayBuffer(0)
      });

      await expect(jiraClient.searchIssues({ 
        jql: 'invalidfield = "test"' 
      })).rejects.toMatchObject({
        status: 400,
        message: expect.stringContaining('invalidfield')
      });

      // Verify POST request was made (will fail with current GET implementation)
      expect(mockRequestUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST'
        })
      );
    });

    it('should handle 401 Authentication errors', async () => {
      const errorResponse = {
        errorMessages: ["Authentication required"],
        errors: {}
      };

      mockRequestUrl.mockResolvedValue({
        status: 401,
        headers: { 'content-type': 'application/json' },
        text: JSON.stringify(errorResponse),
        json: errorResponse,
        arrayBuffer: new ArrayBuffer(0)
      });

      await expect(jiraClient.searchIssues({
        jql: 'project = TEST'
      })).rejects.toMatchObject({
        status: 401,
        message: 'Authentication required'
      });
    });

    it('should handle 403 Forbidden errors', async () => {
      const errorResponse = {
        errorMessages: [],
        errors: {
          permission: "You do not have permission to view issues in this project."
        }
      };

      mockRequestUrl.mockResolvedValue({
        status: 403,
        headers: { 'content-type': 'application/json' },
        text: JSON.stringify(errorResponse),
        json: errorResponse,
        arrayBuffer: new ArrayBuffer(0)
      });

      await expect(jiraClient.searchIssues({
        jql: 'project = PRIVATE'
      })).rejects.toMatchObject({
        status: 403,
        message: expect.stringContaining('permission')
      });
    });

    it('should handle 429 Rate Limit with Retry-After header', async () => {
      const errorResponse = {
        errorMessages: ["Rate limit exceeded. Please try again later."],
        errors: {}
      };

      mockRequestUrl.mockResolvedValue({
        status: 429,
        headers: { 
          'content-type': 'application/json',
          'retry-after': '30'
        },
        text: JSON.stringify(errorResponse),
        json: errorResponse,
        arrayBuffer: new ArrayBuffer(0)
      });

      await expect(jiraClient.searchIssues({
        jql: 'project = TEST'
      })).rejects.toMatchObject({
        status: 429,
        message: 'Rate limit exceeded. Please try again later.',
        retryAfter: 30
      });
    });
  });

  describe('New API Response Format Contract', () => {
    it('should parse new API response format correctly', async () => {
      const newApiResponse = {
        maxResults: 25,
        startAt: 0, // Always 0 in new API
        total: 237, // Approximate total
        issues: [
          {
            id: '10068',
            key: 'PROJ-123',
            self: 'https://test.atlassian.net/rest/api/3/issue/10068',
            fields: {
              summary: 'Implement user authentication',
              status: {
                name: 'In Progress',
                statusCategory: {
                  key: 'indeterminate',
                  colorName: 'blue'
                }
              },
              assignee: {
                accountId: '5b10a2844c20165700ede21g',
                displayName: 'John Doe',
                emailAddress: 'john.doe@company.com'
              },
              priority: {
                name: 'High',
                iconUrl: 'https://test.atlassian.net/images/icons/priorities/high.svg'
              },
              created: '2025-09-10T09:15:00.000+0000',
              updated: '2025-09-10T14:30:00.000+0000',
              project: {
                key: 'PROJ',
                name: 'Project Name'
              }
            }
          }
        ],
        nextPageToken: 'CAEaAggE'
      };

      mockRequestUrl.mockResolvedValue({
        status: 200,
        headers: { 'content-type': 'application/json' },
        text: JSON.stringify(newApiResponse),
        json: newApiResponse,
        arrayBuffer: new ArrayBuffer(0)
      });

      const result = await jiraClient.searchIssues({
        jql: 'assignee = currentUser() AND status NOT IN (Done, Closed)',
        maxResults: 25,
        fields: ['summary', 'status', 'assignee', 'priority', 'created', 'updated', 'project']
      });

      // Verify new response structure
      expect(result.startAt).toBe(0); // Always 0 in new API
      expect(result.total).toBe(237); // Approximate count
      expect(result.nextPageToken).toBe('CAEaAggE');
      expect(result.issues[0]).toHaveProperty('id', '10068');
      expect(result.issues[0]).toHaveProperty('key', 'PROJ-123');
      expect(result.issues[0]).toHaveProperty('self');
      expect(result.issues[0].fields.status.statusCategory).toHaveProperty('key', 'indeterminate');

      // EXPECTED TO FAIL: Current implementation uses GET method
      expect(mockRequestUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          url: 'https://test.atlassian.net/rest/api/3/search/jql',
          body: expect.stringContaining('"jql":"assignee = currentUser() AND status NOT IN (Done, Closed)"')
        })
      );
    });

    it('should validate required response fields per contract', async () => {
      const minimalResponse = {
        maxResults: 50,
        startAt: 0,
        total: 1,
        issues: [
          {
            id: '10001', // Required
            key: 'TEST-1', // Required  
            self: 'https://test.atlassian.net/rest/api/3/issue/10001', // Required
            fields: {} // Optional based on fields parameter
          }
        ]
        // nextPageToken is optional (absent on last page)
      };

      mockRequestUrl.mockResolvedValue({
        status: 200,
        headers: { 'content-type': 'application/json' },
        text: JSON.stringify(minimalResponse),
        json: minimalResponse,
        arrayBuffer: new ArrayBuffer(0)
      });

      const result = await jiraClient.searchIssues({
        jql: 'project = TEST'
      });

      // Verify all required fields are present per contract
      expect(result.issues[0]).toHaveProperty('id');
      expect(result.issues[0]).toHaveProperty('key');
      expect(result.issues[0]).toHaveProperty('self');
      expect(result.issues[0].id).toBe('10001');
      expect(result.issues[0].key).toBe('TEST-1');
      expect(result.issues[0].self).toMatch(/^https:\/\/.+\/rest\/api\/3\/issue\/.+$/);
    });
  });
});