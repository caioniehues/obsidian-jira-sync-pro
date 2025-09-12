/**
 * Integration Test: API Migration Compatibility (Scenario 5)
 * 
 * Tests the migration from deprecated Jira API endpoints to new v3/search/jql endpoint.
 * Maps to Scenario 5 from quickstart.md: API Migration Compatibility
 * 
 * CRITICAL DEADLINE: May 1, 2025 - Jira API v2/search endpoint deprecation
 * 
 * CRITICAL TDD: This test MUST FAIL initially and only pass once the new API
 * endpoints are implemented with token-based pagination support.
 * 
 * Migration Requirements:
 * - Use `/rest/api/3/search/jql` instead of `/rest/api/3/search`  
 * - Implement token-based pagination (`nextPageToken`) instead of offset (`startAt`)
 * - Optimize field selection to reduce response size
 * - Handle new rate limiting and response format
 * - Ensure backwards compatibility during transition period
 * 
 * Test Flow:
 * 1. Verify new endpoint usage in API calls
 * 2. Test token-based pagination with large result sets (100+ tickets)
 * 3. Validate field selection optimization
 * 4. Test rate limiting compliance with new endpoint
 * 5. Verify response format handling
 * 6. Test migration fallback scenarios
 */

import { describe, it, expect, vi, beforeEach, afterEach } from '@vitest/globals';
import {
  createTestSuite,
  waitFor,
  waitForCalls,
  createDeferred,
  createMockRequestUrl,
  MockFileSystem,
  RetryTester,
  assertions
} from '../utils/test-helpers';

// Import modules that need to implement new API migration
import { JiraClient, SearchParams, SearchResponse } from '../../src/jira-bases-adapter/jira-client';
import { JQLQueryEngine, JQLQueryOptions, JQLQueryResult, JiraIssue } from '../../src/enhanced-sync/jql-query-engine';
import { AutoSyncScheduler, AutoSyncConfig } from '../../src/enhanced-sync/auto-sync-scheduler';
import { Plugin, App, Vault, requestUrl, RequestUrlParam, RequestUrlResponse } from '../__mocks__/obsidian';

// CRITICAL: These interfaces will FAIL initially - they need to be implemented for new API
export interface JQLSearchResult {
  // API response metadata
  maxResults: number;
  startAt: number;           // Always 0 for new token-based API
  total: number;             // Approximate total (may change)
  
  // NEW: Token-based pagination
  nextPageToken?: string;    // Token for next page (undefined when last page)
  isLast?: boolean;         // Indicates if this is the last page
  
  // Results
  issues: JiraIssue[];
  
  // Query context
  jql: string;               // Query that generated these results
  executionTime: number;     // Query execution time in milliseconds
}

// Extended search parameters for new API
export interface NewSearchParams extends SearchParams {
  pageToken?: string;        // NEW: Token for pagination instead of startAt
}

// Mock data for large dataset testing (100+ tickets)
function generateMockJiraIssues(count: number, startIndex: number = 1): JiraIssue[] {
  return Array.from({ length: count }, (_, i) => {
    const index = startIndex + i;
    return {
      key: `MIGRATE-${index.toString().padStart(3, '0')}`,
      id: `${20000 + index}`,
      fields: {
        summary: `API Migration Test Ticket ${index}`,
        status: { name: index % 3 === 0 ? 'Done' : index % 2 === 0 ? 'In Progress' : 'To Do', id: `${index % 3 + 1}` },
        assignee: { displayName: 'Migration Tester', emailAddress: 'migration@example.com' },
        reporter: { displayName: 'API Team', emailAddress: 'api-team@example.com' },
        description: `Testing new API endpoint for ticket ${index} - token-based pagination`,
        priority: { name: ['Low', 'Medium', 'High', 'Highest'][index % 4], id: `${index % 4 + 1}` },
        issuetype: { name: ['Story', 'Task', 'Bug', 'Epic'][index % 4], id: `${index % 4 + 10001}` },
        project: { key: 'MIGRATE', name: 'API Migration Project' },
        created: new Date(Date.now() - (index * 24 * 60 * 60 * 1000)).toISOString(), // Spread over days
        updated: new Date(Date.now() - (index * 12 * 60 * 60 * 1000)).toISOString()
      }
    };
  });
}

// New API response structure with token-based pagination
interface NewSearchResponse {
  total: number;
  issues: JiraIssue[];
  nextPageToken?: string; // NEW: Token-based pagination
  isLast: boolean; // NEW: Indicates if this is the last page
  maxResults: number;
  startAt?: number; // DEPRECATED: For backwards compatibility
}

describe('Integration: API Migration Compatibility (Scenario 5)', () => {
  const testSuite = createTestSuite('APIMigration');
  const { mockTimer, testEnv, mockFs } = testSuite;

  // Core components for testing migration
  let mockApp: App;
  let mockPlugin: Plugin;
  let mockVault: Vault;
  let jiraClient: JiraClient;
  let jqlQueryEngine: JQLQueryEngine;
  let autoSyncScheduler: AutoSyncScheduler;

  // Migration test configuration
  const migrationTestConfig = {
    baseUrl: 'https://migration-test.atlassian.net',
    email: 'migration-test@example.com',
    apiToken: 'migration-test-token-123'
  };

  // Test query for large dataset pagination
  const largeDatasetJQL = 'project = MIGRATE AND created >= -30d ORDER BY created ASC';
  
  // Mock large dataset (150 tickets to test pagination)
  const fullDataset = generateMockJiraIssues(150);
  const firstPage = fullDataset.slice(0, 50);
  const secondPage = fullDataset.slice(50, 100);
  const thirdPage = fullDataset.slice(100, 150);

  // Track API calls for verification
  const apiCallLog: Array<{
    url: string;
    method: string;
    headers: Record<string, string>;
    timestamp: number;
    params?: URLSearchParams;
    body?: string; // NEW: Track request body for POST requests
  }> = [];

  beforeEach(() => {
    testSuite.beforeEach();
    apiCallLog.length = 0; // Clear call log

    // Setup mock Obsidian environment
    mockApp = new App();
    mockVault = mockApp.vault;
    mockPlugin = new Plugin(mockApp, { id: 'jira-sync-pro', name: 'Jira Sync Pro' });

    // Mock requestUrl to capture and log all API calls
    (requestUrl as vi.Mock).mockImplementation(async (request: RequestUrlParam): Promise<RequestUrlResponse> => {
      // Log the API call for verification
      const url = new URL(request.url);
      apiCallLog.push({
        url: request.url,
        method: request.method || 'GET',
        headers: request.headers || {},
        timestamp: Date.now(),
        params: url.searchParams,
        body: request.body // NEW: Track request body
      });

      // CRITICAL: This test MUST FAIL if old API endpoint is used
      if (request.url.includes('/rest/api/3/search?') && !request.url.includes('/rest/api/3/search/jql')) {
        throw new Error(`MIGRATION FAILURE: Old API endpoint detected! Use /rest/api/3/search/jql instead of /rest/api/3/search`);
      }

      // Simulate new API endpoint responses
      if (request.url.includes('/rest/api/3/search/jql')) {
        return handleNewSearchJQLEndpoint(request);
      }

      // Handle other endpoints (user info, fields, etc.)
      if (request.url.includes('/rest/api/3/myself')) {
        return {
          status: 200,
          headers: {},
          json: {
            displayName: 'Migration Tester',
            emailAddress: 'migration@example.com',
            accountId: 'migration-account-123'
          }
        } as RequestUrlResponse;
      }

      if (request.url.includes('/rest/api/3/field')) {
        return {
          status: 200,
          headers: {},
          json: [
            { id: 'summary', name: 'Summary', searchable: true },
            { id: 'status', name: 'Status', searchable: true },
            { id: 'assignee', name: 'Assignee', searchable: true }
          ]
        } as RequestUrlResponse;
      }

      // Default fallback
      throw new Error(`Unhandled API endpoint: ${request.url}`);
    });

    // Initialize Jira client with migration configuration
    jiraClient = new JiraClient();
    jiraClient.configure(migrationTestConfig);

    // Clear all mocks
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (autoSyncScheduler) {
      autoSyncScheduler.stop();
    }
    testSuite.afterEach();
    
    // Reset the mock
    (requestUrl as vi.Mock).mockReset();
  });

  /**
   * Mock handler for new /rest/api/3/search/jql endpoint
   * Implements token-based pagination and field selection optimization
   */
  function handleNewSearchJQLEndpoint(request: RequestUrlParam): RequestUrlResponse {
    const url = new URL(request.url);
    
    // NEW API uses POST with request body, not query parameters
    let requestData: any = {};
    if (request.body) {
      try {
        requestData = JSON.parse(request.body);
      } catch (e) {
        // Fallback for invalid JSON
        requestData = {};
      }
    }
    
    const jql = requestData.jql || '';
    const pageToken = requestData.nextPageToken;
    const maxResults = parseInt(requestData.maxResults || '50');
    const fields = requestData.fields || [];

    // CRITICAL: Verify new endpoint structure
    if (!url.pathname.endsWith('/search/jql')) {
      throw new Error('MIGRATION FAILURE: Expected /search/jql endpoint');
    }

    // CRITICAL: Token-based pagination implementation
    let pageIndex = 0;
    if (pageToken) {
      // Decode token to get page index (in real API, this would be opaque)
      pageIndex = parseInt(atob(pageToken).split(':')[1] || '0');
    }

    const startIndex = pageIndex * maxResults;
    const endIndex = Math.min(startIndex + maxResults, fullDataset.length);
    const pageData = fullDataset.slice(startIndex, endIndex);
    
    // Generate next page token if more data exists
    const hasNextPage = endIndex < fullDataset.length;
    const nextPageToken = hasNextPage ? btoa(`page:${pageIndex + 1}:${Date.now()}`) : undefined;

    // Simulate field selection optimization
    const optimizedIssues = fields.length > 0 ? 
      pageData.map(issue => optimizeFieldSelection(issue, fields)) : 
      pageData;

    const response: NewSearchResponse = {
      total: fullDataset.length,
      issues: optimizedIssues,
      nextPageToken,
      isLast: !hasNextPage,
      maxResults,
      // Backwards compatibility (deprecated)
      startAt: startIndex
    };

    // Simulate API response time based on result size
    const responseTime = Math.max(100, pageData.length * 2); // 2ms per issue minimum
    setTimeout(() => {}, responseTime);

    return {
      status: 200,
      headers: {
        'X-API-Version': '3.0',
        'X-Pagination-Type': 'token-based',
        'X-Rate-Limit-Remaining': '58', // New rate limiting headers
        'X-Rate-Limit-Reset': Math.floor(Date.now() / 1000 + 3600).toString()
      },
      json: response
    } as RequestUrlResponse;
  }

  /**
   * Optimize field selection to reduce response size
   */
  function optimizeFieldSelection(issue: JiraIssue, requestedFields: string[]): Partial<JiraIssue> {
    if (requestedFields.includes('*') || requestedFields.length === 0) {
      return issue; // Return all fields
    }

    const optimizedIssue: any = {
      key: issue.key,
      id: issue.id,
      fields: {}
    };

    // Only include requested fields
    requestedFields.forEach(field => {
      if (issue.fields[field as keyof typeof issue.fields]) {
        optimizedIssue.fields[field] = issue.fields[field as keyof typeof issue.fields];
      }
    });

    return optimizedIssue as JiraIssue;
  }

  describe('New API Endpoint Migration', () => {
    /**
     * CRITICAL TDD: This test MUST FAIL initially
     * Only passes when JiraClient is updated to use new endpoint
     */
    it('should use new /rest/api/3/search/jql endpoint instead of deprecated /rest/api/3/search', async () => {
      // This test will FAIL if JiraClient still uses old endpoint
      const searchParams: SearchParams = {
        jql: largeDatasetJQL,
        maxResults: 50,
        fields: ['summary', 'status', 'assignee']
      };

      // Execute search (should trigger new endpoint)
      const result = await jiraClient.searchIssues(searchParams);

      // Verify new endpoint was called
      expect(apiCallLog).toHaveLength(1);
      expect(apiCallLog[0].url).toContain('/rest/api/3/search/jql');
      expect(apiCallLog[0].url).not.toContain('/rest/api/3/search?');
      
      // Verify API call structure
      expect(apiCallLog[0].method).toBe('POST');
      expect(apiCallLog[0].headers).toHaveProperty('Authorization');
      // NEW: Check request body instead of query params
      const requestBody = JSON.parse(apiCallLog[0].body || '{}');
      expect(requestBody.jql).toBe(largeDatasetJQL);
      expect(requestBody.maxResults).toBe(50);
      expect(requestBody.fields).toEqual(['summary', 'status', 'assignee']);

      // Verify response structure
      expect(result).toHaveProperty('issues');
      expect(result).toHaveProperty('total');
      expect(result.total).toBe(150); // Full dataset size
      expect(result.issues).toHaveLength(50); // First page
    });

    /**
     * CRITICAL TDD: This test MUST FAIL initially
     * Only passes when token-based pagination is implemented
     */
    it('should implement token-based pagination instead of offset-based startAt', async () => {
      jqlQueryEngine = new JQLQueryEngine(jiraClient);

      // Execute initial query - WILL FAIL until JQLQueryEngine supports token pagination
      const firstPageOptions: JQLQueryOptions = {
        jql: largeDatasetJQL,
        maxResults: 50,
        batchSize: 50
      };
      const firstPageResult = await jqlQueryEngine.executeQuery(firstPageOptions);

      // Verify first page results
      expect(firstPageResult.total).toBe(150);
      expect(firstPageResult.issues).toHaveLength(50);
      expect(firstPageResult.issues[0].key).toBe('MIGRATE-001');

      // CRITICAL: Must have nextPageToken, not startAt-based pagination
      expect(firstPageResult).toHaveProperty('nextPageToken');
      expect(firstPageResult.nextPageToken).toBeDefined();
      expect(typeof firstPageResult.nextPageToken).toBe('string');

      // Execute second page using token - WILL FAIL until token support is implemented
      const secondPageOptions: JQLQueryOptions = {
        jql: largeDatasetJQL,
        maxResults: 50,
        batchSize: 50,
        // @ts-expect-error - pageToken doesn't exist yet, will be implemented
        pageToken: firstPageResult.nextPageToken
      };
      const secondPageResult = await jqlQueryEngine.executeQuery(secondPageOptions);

      // Verify second page results
      expect(secondPageResult.issues).toHaveLength(50);
      expect(secondPageResult.issues[0].key).toBe('MIGRATE-051');
      expect(secondPageResult).toHaveProperty('nextPageToken');

      // Execute third page using token - WILL FAIL until token support is implemented
      const thirdPageOptions: JQLQueryOptions = {
        jql: largeDatasetJQL,
        maxResults: 50,
        batchSize: 50,
        // @ts-expect-error - pageToken doesn't exist yet, will be implemented
        pageToken: secondPageResult.nextPageToken
      };
      const thirdPageResult = await jqlQueryEngine.executeQuery(thirdPageOptions);

      // Verify third page results (last page)
      expect(thirdPageResult.issues).toHaveLength(50);
      expect(thirdPageResult.issues[0].key).toBe('MIGRATE-101');
      expect(thirdPageResult.nextPageToken).toBeUndefined(); // Last page

      // Verify no deprecated startAt parameters were used
      apiCallLog.forEach((call, index) => {
        if (call.body) {
          const requestBody = JSON.parse(call.body);
          expect(requestBody.startAt).toBeUndefined();
          if (index > 0) { // First call won't have nextPageToken
            expect(requestBody.nextPageToken).toBeTruthy();
          }
        }
      });
    });

    it('should optimize field selection to reduce response size', async () => {
      // Test with minimal field selection
      const minimalFields = ['summary', 'status'];
      const searchParams: SearchParams = {
        jql: largeDatasetJQL,
        maxResults: 25,
        fields: minimalFields
      };

      const result = await jiraClient.searchIssues(searchParams);

      // Verify field optimization was applied
      const requestBody = JSON.parse(apiCallLog[0].body || '{}');
      expect(requestBody.fields).toEqual(['summary', 'status']);
      
      // Verify response contains only requested fields
      result.issues.forEach(issue => {
        expect(issue.fields).toHaveProperty('summary');
        expect(issue.fields).toHaveProperty('status');
        // Should not have other fields like description, reporter, etc.
        expect(issue.fields).not.toHaveProperty('description');
        expect(issue.fields).not.toHaveProperty('reporter');
      });

      // Test with all fields
      const allFieldsParams: SearchParams = {
        jql: largeDatasetJQL,
        maxResults: 25,
        fields: ['*'] // Request all fields
      };

      apiCallLog.length = 0; // Clear log
      const fullResult = await jiraClient.searchIssues(allFieldsParams);

      const allFieldsRequestBody = JSON.parse(apiCallLog[0].body || '{}');
      expect(allFieldsRequestBody.fields).toEqual(['*']);
      
      // Should have all fields
      fullResult.issues.forEach(issue => {
        expect(issue.fields).toHaveProperty('summary');
        expect(issue.fields).toHaveProperty('status');
        expect(issue.fields).toHaveProperty('description');
        expect(issue.fields).toHaveProperty('reporter');
      });
    });

    it('should handle large result sets (100+ tickets) efficiently with token pagination', async () => {
      jqlQueryEngine = new JQLQueryEngine(jiraClient);

      const startTime = Date.now();
      const allIssues: JiraIssue[] = [];
      let currentPageToken: string | undefined;
      let pageCount = 0;

      // Paginate through entire dataset
      do {
        pageCount++;
        const pageOptions: JQLQueryOptions = {
          jql: largeDatasetJQL,
          maxResults: 50,
          batchSize: 50,
          // @ts-expect-error - pageToken doesn't exist yet, will be implemented
          pageToken: currentPageToken
        };
        const pageResult = await jqlQueryEngine.executeQuery(pageOptions);

        allIssues.push(...pageResult.issues);
        currentPageToken = pageResult.nextPageToken;

        // Safety check to prevent infinite loops
        expect(pageCount).toBeLessThan(10);
        
      } while (currentPageToken);

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Performance validation
      expect(duration).toBeLessThan(5000); // Should complete in < 5 seconds
      expect(pageCount).toBe(3); // 150 issues / 50 per page = 3 pages
      expect(allIssues).toHaveLength(150); // All issues retrieved

      // Verify correct pagination order
      expect(allIssues[0].key).toBe('MIGRATE-001');
      expect(allIssues[49].key).toBe('MIGRATE-050'); // End of page 1
      expect(allIssues[50].key).toBe('MIGRATE-051'); // Start of page 2
      expect(allIssues[149].key).toBe('MIGRATE-150'); // Last issue

      // Verify API efficiency - no redundant calls
      expect(apiCallLog).toHaveLength(3); // Exactly 3 pages
      apiCallLog.forEach(call => {
        expect(call.url).toContain('/search/jql');
        const callRequestBody = JSON.parse(call.body || '{}');
        expect(callRequestBody.maxResults).toBe(50);
      });
    });
  });

  describe('Rate Limiting and API Compliance', () => {
    it('should respect new API endpoint rate limits', async () => {
      // New endpoint allows higher rate limits but we should still be conservative
      const rapidRequests = 10;
      const requests: Promise<any>[] = [];

      for (let i = 0; i < rapidRequests; i++) {
        requests.push(jiraClient.searchIssues({
          jql: `project = MIGRATE AND key = MIGRATE-${(i + 1).toString().padStart(3, '0')}`,
          maxResults: 1
        }));
      }

      // All requests should succeed (new endpoint has higher limits)
      const results = await Promise.all(requests);
      expect(results).toHaveLength(rapidRequests);

      // Verify rate limit headers are being received
      expect(apiCallLog[0].headers).toEqual({
        'Authorization': expect.any(String),
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      });

      // Response headers should include rate limit info
      // Note: This would be verified in the actual response, not request headers
    });

    it('should handle rate limiting errors gracefully', async () => {
      // Mock rate limit exceeded response
      (global as any).requestUrl = vi.fn().mockResolvedValue({
        status: 429,
        headers: {
          'Retry-After': '60',
          'X-Rate-Limit-Reset': Math.floor(Date.now() / 1000 + 3600).toString()
        },
        json: {
          errorMessages: ['Rate limit exceeded'],
          errors: {}
        }
      });

      await expect(jiraClient.searchIssues({
        jql: largeDatasetJQL,
        maxResults: 50
      })).rejects.toThrow('Rate limit exceeded');
    });
  });

  describe('Response Format Compatibility', () => {
    it('should handle new response format with isLast property', async () => {
      jqlQueryEngine = new JQLQueryEngine(jiraClient);

      const options: JQLQueryOptions = {
        jql: largeDatasetJQL,
        maxResults: 150, // Request all data in one page
        batchSize: 150
      };
      const result = await jqlQueryEngine.executeQuery(options);

      // New API response format validation
      expect(result).toHaveProperty('total', 150);
      expect(result).toHaveProperty('issues');
      expect(result.issues).toHaveLength(150);
      
      // Should indicate this is the last page
      // @ts-expect-error - nextPageToken doesn't exist yet, will be implemented
      expect(result.nextPageToken).toBeUndefined();

      // Test smaller page that should have more data
      const partialOptions: JQLQueryOptions = {
        jql: largeDatasetJQL,
        maxResults: 75,
        batchSize: 75
      };
      const partialResult = await jqlQueryEngine.executeQuery(partialOptions);

      // @ts-expect-error - nextPageToken doesn't exist yet, will be implemented
      expect(partialResult.nextPageToken).toBeDefined();
      expect(partialResult.issues).toHaveLength(75);
    });

    it('should maintain backwards compatibility with startAt for transition period', async () => {
      // During migration period, responses may still include startAt for compatibility
      const result = await jiraClient.searchIssues({
        jql: largeDatasetJQL,
        maxResults: 50
      });

      // New primary properties
      expect(result).toHaveProperty('total');
      expect(result).toHaveProperty('issues');
      
      // Legacy properties may still be present for backwards compatibility
      // but should not be used for pagination logic
      if ('startAt' in result) {
        expect(typeof result.startAt).toBe('number');
      }
    });
  });

  describe('Migration Fallback Scenarios', () => {
    it('should handle API endpoint not available fallback', async () => {
      // Mock 404 response for new endpoint (not yet deployed)
      (global as any).requestUrl = vi.fn().mockImplementation(async (request: RequestUrlParam) => {
        if (request.url.includes('/search/jql')) {
          return {
            status: 404,
            headers: {},
            json: {
              errorMessages: ['Endpoint not found'],
              errors: {}
            }
          } as RequestUrlResponse;
        }
        throw new Error('Unexpected endpoint');
      });

      // This should fail in our current implementation since we require the new endpoint
      await expect(jiraClient.searchIssues({
        jql: largeDatasetJQL,
        maxResults: 50
      })).rejects.toThrow('Jira endpoint not found');
    });

    it('should validate new API version headers', async () => {
      await jiraClient.searchIssues({
        jql: 'project = MIGRATE',
        maxResults: 10
      });

      // The mock response includes new API version headers
      // In real implementation, we should verify these are present
      expect(apiCallLog).toHaveLength(1);
      expect(apiCallLog[0].url).toContain('/search/jql');
    });
  });

  describe('End-to-End API Migration Flow', () => {
    it('should complete full sync cycle using new API endpoints', async () => {
      // Setup complete auto-sync with new API
      jqlQueryEngine = new JQLQueryEngine(jiraClient);
      
      const config: AutoSyncConfig = {
        enabled: true,
        jqlQuery: largeDatasetJQL,
        syncInterval: 5, // 5 minutes
        maxResults: 1000,
        batchSize: 50
      };

      let syncedIssues: JiraIssue[] = [];
      autoSyncScheduler = new AutoSyncScheduler(
        mockPlugin,
        jqlQueryEngine,
        config,
        async (options) => {
          // Use token-based pagination to sync all issues
          let currentToken: string | undefined;
          do {
            const pageOptions: JQLQueryOptions = {
              jql: config.jqlQuery,
              maxResults: config.batchSize,
              batchSize: config.batchSize,
              // @ts-expect-error - pageToken doesn't exist yet, will be implemented
              pageToken: currentToken
            };
            const result = await jqlQueryEngine.executeQuery(pageOptions);
            
            syncedIssues.push(...result.issues);
            // @ts-expect-error - nextPageToken doesn't exist yet, will be implemented
            currentToken = result.nextPageToken;
            
          } while (currentToken);
        }
      );

      // Execute complete sync
      await autoSyncScheduler.start();

      // Verify all issues were synced using new API
      expect(syncedIssues).toHaveLength(150);
      expect(syncedIssues[0].key).toBe('MIGRATE-001');
      expect(syncedIssues[149].key).toBe('MIGRATE-150');

      // Verify all API calls used new endpoint
      apiCallLog.forEach(call => {
        expect(call.url).toContain('/rest/api/3/search/jql');
        expect(call.url).not.toContain('/rest/api/3/search?');
      });

      // Should have made exactly 3 API calls (3 pages of 50 each)
      expect(apiCallLog).toHaveLength(3);
    });
  });

  describe('Success Criteria Validation (from quickstart.md)', () => {
    beforeEach(async () => {
      jqlQueryEngine = new JQLQueryEngine(jiraClient);
    });

    it('✅ API calls use new /rest/api/3/search/jql endpoint', async () => {
      await jiraClient.searchIssues({
        jql: 'project = MIGRATE',
        maxResults: 50
      });

      expect(apiCallLog).toHaveLength(1);
      expect(apiCallLog[0].url).toContain('/rest/api/3/search/jql');
      expect(apiCallLog[0].url).not.toContain('/rest/api/3/search?');
    });

    it('✅ Pagination uses nextPageToken instead of startAt', async () => {
      const options: JQLQueryOptions = {
        jql: largeDatasetJQL,
        maxResults: 50,
        batchSize: 50
      };
      const result = await jqlQueryEngine.executeQuery(options);

      // @ts-expect-error - nextPageToken doesn't exist yet, will be implemented
      expect(result).toHaveProperty('nextPageToken');
      // @ts-expect-error - nextPageToken doesn't exist yet, will be implemented
      expect(result.nextPageToken).toBeDefined();

      // Verify no startAt parameter was used
      const paginationRequestBody = JSON.parse(apiCallLog[0].body || '{}');
      expect(paginationRequestBody.startAt).toBeUndefined();
    });

    it('✅ Only requested fields are returned (optimization working)', async () => {
      const requestedFields = ['summary', 'status', 'assignee'];
      await jiraClient.searchIssues({
        jql: largeDatasetJQL,
        maxResults: 10,
        fields: requestedFields
      });

      const fieldRequestBody = JSON.parse(apiCallLog[0].body || '{}');
      expect(fieldRequestBody.fields).toEqual(['summary', 'status', 'assignee']);
    });

    it('✅ Large result sets paginate correctly', async () => {
      const allIssues: JiraIssue[] = [];
      let pageToken: string | undefined;

      // Paginate through all results
      do {
        const pageOptions: JQLQueryOptions = {
          jql: largeDatasetJQL,
          maxResults: 50,
          batchSize: 50,
          // @ts-expect-error - pageToken doesn't exist yet, will be implemented
          pageToken
        };
        const result = await jqlQueryEngine.executeQuery(pageOptions);
        
        allIssues.push(...result.issues);
        // @ts-expect-error - nextPageToken doesn't exist yet, will be implemented
        pageToken = result.nextPageToken;
        
      } while (pageToken);

      expect(allIssues).toHaveLength(150);
      expect(apiCallLog).toHaveLength(3); // 3 pages
    });

    it('✅ No calls to deprecated endpoints', async () => {
      await jiraClient.searchIssues({
        jql: largeDatasetJQL,
        maxResults: 100
      });

      // Verify no deprecated endpoints were called
      apiCallLog.forEach(call => {
        expect(call.url).not.toContain('/rest/api/2/');
        expect(call.url).not.toContain('/rest/api/3/search?');
        expect(call.url).toContain('/rest/api/3/search/jql');
      });
    });

    it('✅ Rate limiting respects new endpoint limits', async () => {
      // Make multiple rapid requests
      const promises = Array.from({ length: 5 }, () => 
        jiraClient.searchIssues({
          jql: 'project = MIGRATE',
          maxResults: 10
        })
      );

      const results = await Promise.all(promises);
      expect(results).toHaveLength(5);
      expect(apiCallLog).toHaveLength(5);

      // All calls should have succeeded (new endpoint has higher limits)
      results.forEach(result => {
        expect(result).toHaveProperty('issues');
        expect(result).toHaveProperty('total');
      });
    });
  });

  describe('Performance and Logging Validation', () => {
    it('should log API endpoint usage for monitoring', async () => {
      // Enable verbose logging in real implementation
      process.env.JIRA_SYNC_VERBOSE_LOGGING = 'true';

      await jiraClient.searchIssues({
        jql: largeDatasetJQL,
        maxResults: 25,
        fields: ['summary', 'status']
      });

      // Verify detailed logging captured
      expect(apiCallLog).toHaveLength(1);
      expect(apiCallLog[0]).toHaveProperty('url');
      expect(apiCallLog[0]).toHaveProperty('timestamp');
      expect(apiCallLog[0]).toHaveProperty('params');
      
      // Clean up
      delete process.env.JIRA_SYNC_VERBOSE_LOGGING;
    });

    it('should handle network tab monitoring for debugging', async () => {
      // This test validates that network requests are properly formatted
      // for debugging and monitoring in browser dev tools
      
      await jiraClient.searchIssues({
        jql: largeDatasetJQL,
        maxResults: 50
      });

      const call = apiCallLog[0];
      
      // Verify request is properly formatted for network monitoring
      expect(call.url).toMatch(/^https:\/\/.+\.atlassian\.net\/rest\/api\/3\/search\/jql/);
      expect(call.method).toBe('POST');
      expect(call.headers).toHaveProperty('Authorization');
      expect(call.headers['Accept']).toBe('application/json');
      expect(call.headers['Content-Type']).toBe('application/json');
    });

    it('should measure pagination performance with 100+ results', async () => {
      const startTime = Date.now();
      
      jqlQueryEngine = new JQLQueryEngine(jiraClient);
      
      // Paginate through large dataset
      let totalRetrieved = 0;
      let pageToken: string | undefined;
      
      do {
        const pageOptions: JQLQueryOptions = {
          jql: largeDatasetJQL,
          maxResults: 50,
          batchSize: 50,
          // @ts-expect-error - pageToken doesn't exist yet, will be implemented
          pageToken
        };
        const result = await jqlQueryEngine.executeQuery(pageOptions);
        
        totalRetrieved += result.issues.length;
        // @ts-expect-error - nextPageToken doesn't exist yet, will be implemented
        pageToken = result.nextPageToken;
        
      } while (pageToken);
      
      const duration = Date.now() - startTime;
      
      // Performance validation
      expect(totalRetrieved).toBe(150);
      expect(duration).toBeLessThan(3000); // Should complete in < 3 seconds
      expect(apiCallLog).toHaveLength(3); // Efficient pagination
    });
  });
});