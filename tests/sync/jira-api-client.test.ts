/**
 * JiraApiClient Integration Tests
 * Tests all CRUD operations and API functionality with real implementations
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { JiraApiClient, ApiClientConfig, ApiResponse } from '../../src/sync/jira-api-client';
import { 
  JiraIssue, 
  JiraCreateIssueRequest, 
  JiraUpdateIssueRequest,
  JiraTransition 
} from '../../src/types/jira-types';
import type { Mock, Mocked, MockedFunction } from 'vitest';
// Mock obsidian module
vi.mock('obsidian', () => ({
  requestUrl: vi.fn()
}));
import { requestUrl } from 'obsidian';
const mockedRequestUrl = requestUrl as MockedFunction<typeof requestUrl>;
describe('JiraApiClient', () => {
  let client: JiraApiClient;
  let mockConfig: ApiClientConfig;
  beforeEach(() => {
    mockConfig = {
      jiraUrl: 'https://test.atlassian.net',
      apiToken: 'test-api-token',
      userEmail: 'test@example.com'
    };
    client = new JiraApiClient(mockConfig);
    
    // Clear mocks
    vi.clearAllMocks();
    // Mock console to reduce test noise
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  describe('Constructor', () => {
    it('should initialize with proper configuration', () => {
      expect(client).toBeInstanceOf(JiraApiClient);
      expect((client as any).config).toEqual(mockConfig);
      expect((client as any).baseUrl).toBe('https://test.atlassian.net/rest/api/3');
    });
    it('should set up correct authentication headers', () => {
      const expectedAuth = btoa(`${mockConfig.userEmail}:${mockConfig.apiToken}`);
      const headers = (client as any).headers;
      
      expect(headers.Authorization).toBe(`Basic ${expectedAuth}`);
      expect(headers.Accept).toBe('application/json');
      expect(headers['Content-Type']).toBe('application/json');
  describe('searchIssues', () => {
    const mockSearchResult = {
      expand: 'names,schema',
      startAt: 0,
      maxResults: 50,
      total: 2,
      issues: [
        {
          id: '10001',
          key: 'TEST-1',
          self: 'https://test.atlassian.net/rest/api/3/issue/10001',
          fields: {
            summary: 'Test Issue 1',
            description: 'Test description 1',
            status: { name: 'To Do' },
            priority: { name: 'Medium' }
          }
        },
          id: '10002',
          key: 'TEST-2',
          self: 'https://test.atlassian.net/rest/api/3/issue/10002',
            summary: 'Test Issue 2',
            description: 'Test description 2',
            status: { name: 'In Progress' },
            priority: { name: 'High' }
        }
      ]
    it('should search issues with basic JQL successfully', async () => {
      mockedRequestUrl.mockResolvedValueOnce({
        status: 200,
        text: JSON.stringify(mockSearchResult)
      } as any);
      const result = await client.searchIssues('project = TEST');
      expect(mockedRequestUrl).toHaveBeenCalledWith({
        url: 'https://test.atlassian.net/rest/api/3/search?jql=project+%3D+TEST&maxResults=100&startAt=0',
        method: 'GET',
        headers: expect.any(Object),
        throw: false
      });
      expect(result).toHaveLength(2);
      expect(result[0].key).toBe('TEST-1');
      expect(result[1].key).toBe('TEST-2');
    it('should handle pagination correctly', async () => {
      const firstPageResult = {
        ...mockSearchResult,
        total: 150,
        maxResults: 100
      };
      const secondPageResult = {
        startAt: 100,
        issues: [
          {
            id: '10003',
            key: 'TEST-3',
            self: 'https://test.atlassian.net/rest/api/3/issue/10003',
            fields: {
              summary: 'Test Issue 3'
            }
        ]
      mockedRequestUrl
        .mockResolvedValueOnce({
          status: 200,
          text: JSON.stringify(firstPageResult)
        } as any)
          text: JSON.stringify(secondPageResult)
        } as any);
      expect(mockedRequestUrl).toHaveBeenCalledTimes(2);
      expect(result).toHaveLength(3);
      expect(result[2].key).toBe('TEST-3');
    it('should include specific fields when requested', async () => {
      await client.searchIssues('project = TEST', ['summary', 'status']);
      expect(mockedRequestUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          url: expect.stringContaining('fields=summary%2Cstatus')
        })
      );
    it('should handle API errors gracefully', async () => {
        status: 400,
        text: JSON.stringify({
          errorMessages: ['Invalid JQL query']
      await expect(client.searchIssues('invalid jql')).rejects.toThrow();
      expect(console.error).toHaveBeenCalledWith('Error searching issues:', expect.any(Error));
    it('should return empty array for successful response with no issues', async () => {
          ...mockSearchResult,
          issues: [],
          total: 0
      const result = await client.searchIssues('project = EMPTY');
      expect(result).toEqual([]);
  describe('getIssue', () => {
    const mockIssue: JiraIssue = {
      id: '10001',
      key: 'TEST-1',
      self: 'https://test.atlassian.net/rest/api/3/issue/10001',
      fields: {
        summary: 'Test Issue',
        description: 'Test description',
        status: { name: 'To Do' },
        priority: { name: 'Medium' },
        assignee: {
          displayName: 'Test User',
          accountId: 'test-account-id'
      }
    it('should get single issue successfully', async () => {
        text: JSON.stringify(mockIssue)
      const result = await client.getIssue('TEST-1');
        url: 'https://test.atlassian.net/rest/api/3/issue/TEST-1',
      expect(result).toEqual(mockIssue);
      await client.getIssue('TEST-1', ['summary', 'status']);
          url: 'https://test.atlassian.net/rest/api/3/issue/TEST-1?fields=summary%2Cstatus'
    it('should throw error for non-existent issue', async () => {
        status: 404,
          errorMessages: ['Issue does not exist or you do not have permission to see it.']
      await expect(client.getIssue('NON-EXISTENT')).rejects.toThrow('Failed to get issue NON-EXISTENT');
    it('should handle network errors', async () => {
      mockedRequestUrl.mockRejectedValueOnce(new Error('Network error'));
      await expect(client.getIssue('TEST-1')).rejects.toThrow('Network error');
      expect(console.error).toHaveBeenCalledWith('Error getting issue TEST-1:', expect.any(Error));
  describe('updateIssue', () => {
    const updateRequest: JiraUpdateIssueRequest = {
        summary: 'Updated Summary',
        description: 'Updated description'
    it('should update issue successfully', async () => {
        status: 204,
        text: ''
      const result = await client.updateIssue('TEST-1', updateRequest);
        method: 'PUT',
        body: JSON.stringify(updateRequest),
      expect(result.success).toBe(true);
    it('should handle validation errors', async () => {
          errors: {
            summary: 'Summary is required'
      const result = await client.updateIssue('TEST-1', { fields: {} });
      expect(result.success).toBe(false);
      expect(result.error).toContain('summary: Summary is required');
    it('should handle network errors gracefully', async () => {
      mockedRequestUrl.mockRejectedValueOnce(new Error('Network timeout'));
      expect(result.error).toBe('Network timeout');
    it('should handle permission errors', async () => {
        status: 403,
          errorMessages: ['You do not have permission to edit this issue']
      expect(result.error).toContain('You do not have permission to edit this issue');
  describe('createIssue', () => {
    const createRequest: JiraCreateIssueRequest = {
        project: { key: 'TEST' },
        summary: 'New Test Issue',
        description: 'New test description',
        issuetype: { name: 'Story' }
    const createdIssue: JiraIssue = {
      id: '10003',
      key: 'TEST-3',
      self: 'https://test.atlassian.net/rest/api/3/issue/10003',
      fields: createRequest.fields
    it('should create issue successfully', async () => {
        status: 201,
        text: JSON.stringify(createdIssue)
      const result = await client.createIssue(createRequest);
        url: 'https://test.atlassian.net/rest/api/3/issue',
        method: 'POST',
        body: JSON.stringify(createRequest),
      expect(result.data).toEqual(createdIssue);
    it('should handle missing required fields error', async () => {
            project: 'Project is required',
            issuetype: 'Issue type is required'
      const result = await client.createIssue({ fields: { summary: 'Test' } });
      expect(result.error).toContain('project: Project is required');
      expect(result.error).toContain('issuetype: Issue type is required');
    it('should handle project permission errors', async () => {
          errorMessages: ['You do not have permission to create issues in this project']
      expect(result.error).toContain('You do not have permission to create issues');
      mockedRequestUrl.mockRejectedValueOnce(new Error('Connection refused'));
      expect(result.error).toBe('Connection refused');
      expect(console.error).toHaveBeenCalledWith('Error creating issue:', expect.any(Error));
  describe('getTransitions', () => {
    const mockTransitions: JiraTransition[] = [
      {
        id: '11',
        name: 'To Do',
        to: {
          id: '1',
          name: 'To Do',
          statusCategory: {
            id: 2,
            key: 'new',
            colorName: 'blue-gray',
            name: 'To Do',
            self: 'https://test.atlassian.net/rest/api/3/statuscategory/2'
          },
          self: 'https://test.atlassian.net/rest/api/3/status/1'
        hasScreen: false,
        isGlobal: true,
        isInitial: false,
        isConditional: false
      },
        id: '21',
        name: 'In Progress',
          id: '3',
          name: 'In Progress',
            id: 4,
            key: 'indeterminate',
            colorName: 'yellow',
            name: 'In Progress',
            self: 'https://test.atlassian.net/rest/api/3/statuscategory/4'
          self: 'https://test.atlassian.net/rest/api/3/status/3'
    ];
    it('should get available transitions successfully', async () => {
        text: JSON.stringify({ transitions: mockTransitions })
      const result = await client.getTransitions('TEST-1');
        url: 'https://test.atlassian.net/rest/api/3/issue/TEST-1/transitions',
      expect(result).toEqual(mockTransitions);
    it('should return empty array for issues with no transitions', async () => {
        text: JSON.stringify({ transitions: [] })
          errorMessages: ['Issue does not exist']
      const result = await client.getTransitions('NON-EXISTENT');
      expect(console.error).toHaveBeenCalledWith('Error getting transitions for NON-EXISTENT:', expect.any(Error));
      mockedRequestUrl.mockRejectedValueOnce(new Error('Request timeout'));
      expect(console.error).toHaveBeenCalledWith('Error getting transitions for TEST-1:', expect.any(Error));
  describe('transitionIssue', () => {
    it('should transition issue successfully', async () => {
      const result = await client.transitionIssue('TEST-1', '21');
        body: JSON.stringify({
          transition: { id: '21' }
        }),
    it('should transition issue with additional fields', async () => {
      const additionalFields = {
        assignee: { accountId: 'test-user' },
        resolution: { name: 'Fixed' }
      const result = await client.transitionIssue('TEST-1', '31', additionalFields);
          body: JSON.stringify({
            transition: { id: '31' },
            fields: additionalFields
          })
    it('should handle invalid transition errors', async () => {
          errorMessages: ['Transition is not valid for current status']
      const result = await client.transitionIssue('TEST-1', '999');
      expect(result.error).toContain('Transition is not valid');
          errorMessages: ['You do not have permission to transition this issue']
      expect(result.error).toContain('You do not have permission to transition');
      mockedRequestUrl.mockRejectedValueOnce(new Error('Service unavailable'));
      expect(result.error).toBe('Service unavailable');
      expect(console.error).toHaveBeenCalledWith('Error transitioning issue TEST-1:', expect.any(Error));
  describe('addComment', () => {
    it('should add comment successfully', async () => {
      const mockComment = {
        id: '10000',
        body: {
          type: 'doc',
          version: 1,
          content: [
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: 'Test comment'
                }
              ]
          ]
        created: '2024-01-01T10:00:00.000Z',
        updated: '2024-01-01T10:00:00.000Z'
        text: JSON.stringify(mockComment)
      const result = await client.addComment('TEST-1', 'Test comment');
        url: 'https://test.atlassian.net/rest/api/3/issue/TEST-1/comment',
          body: {
            type: 'doc',
            version: 1,
            content: [
              {
                type: 'paragraph',
                content: [
                  {
                    type: 'text',
                    text: 'Test comment'
                  }
                ]
              }
            ]
    it('should handle permission errors for comments', async () => {
          errorMessages: ['You do not have permission to comment on this issue']
      expect(result.error).toContain('You do not have permission to comment');
      mockedRequestUrl.mockRejectedValueOnce(new Error('Request failed'));
      expect(result.error).toBe('Request failed');
      expect(console.error).toHaveBeenCalledWith('Error adding comment to TEST-1:', expect.any(Error));
  describe('testConnection', () => {
    it('should test connection successfully', async () => {
        text: JSON.stringify({ version: '1000.0.0' })
      const result = await client.testConnection();
      expect(result.message).toBe('Successfully connected to Jira');
    it('should fallback to myself endpoint on serverInfo failure', async () => {
          status: 403,
          text: JSON.stringify({ errorMessages: ['Forbidden'] })
          text: JSON.stringify({ accountId: 'test-user' })
    it('should handle authentication errors', async () => {
          status: 401,
          text: JSON.stringify({ errorMessages: ['Unauthorized'] })
      expect(result.message).toContain('Unauthorized');
    it('should handle complete connection failures', async () => {
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'));
      expect(result.message).toBe('Network error');
  describe('validateJql', () => {
    it('should validate correct JQL successfully', async () => {
        text: JSON.stringify({ errors: [] })
      const result = await client.validateJql('project = TEST');
        url: 'https://test.atlassian.net/rest/api/3/jql/parse',
        body: JSON.stringify({ queries: ['project = TEST'] }),
      expect(result.valid).toBe(true);
      expect(result.errors).toBeUndefined();
    it('should identify invalid JQL syntax', async () => {
          errors: [
            { message: 'Expected field name but got invalid token' }
      const result = await client.validateJql('invalid jql syntax');
      expect(result.valid).toBe(false);
      expect(result.errors).toEqual(['Expected field name but got invalid token']);
    it('should handle JQL parsing API errors', async () => {
          errorMessages: ['Bad Request']
      expect(result.errors).toEqual(['Bad Request']);
      mockedRequestUrl.mockRejectedValueOnce(new Error('Connection timeout'));
      expect(result.errors).toEqual(['Connection timeout']);
      expect(console.error).toHaveBeenCalledWith('Error validating JQL:', expect.any(Error));
  describe('Error Handling', () => {
    it('should handle HTTP 204 No Content responses', async () => {
      const result = await client.updateIssue('TEST-1', {
        fields: { summary: 'Updated' }
    it('should handle plain text error responses', async () => {
        status: 500,
        text: 'Internal Server Error'
      expect(result.error).toContain('Internal Server Error');
    it('should handle malformed JSON responses', async () => {
        text: 'invalid json {'
      expect(result.data).toBe('invalid json {');
    it('should handle network timeouts', async () => {
      expect(result.error).toBe('Request timeout');
  describe('Rate Limiting', () => {
    it('should handle rate limit errors (429)', async () => {
        status: 429,
          errorMessages: ['Rate limit exceeded']
      expect(result.error).toContain('Rate limit exceeded');
      expect(result.status).toBe(429);
});
