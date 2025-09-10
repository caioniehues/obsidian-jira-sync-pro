import { describe, it, expect, jest, beforeEach } from '@jest/globals';

/**
 * JQLSearchResult Data Model Tests
 * 
 * CRITICAL TDD REQUIREMENT: These tests MUST FAIL initially.
 * 
 * Testing the JQLSearchResult data model as specified in:
 * specs/001-jql-auto-sync/data-model.md
 * 
 * The data model includes:
 * - API response metadata parsing
 * - Token-based pagination handling
 * - Field selection optimization
 * - Issue mapping from new API format
 * - Execution time tracking
 * - JQL query context
 */

// Import the types that should exist (but don't yet - will cause initial test failure)
// These imports will fail until the data model is implemented
import { 
  JQLSearchResult, 
  JiraIssueResponse 
} from '../../src/models/jql-search-result';

describe('JQLSearchResult Data Model', () => {
  
  describe('API Response Metadata', () => {
    it('should parse basic API response metadata correctly', () => {
      // Test basic structure parsing
      const mockApiResponse = {
        maxResults: 50,
        startAt: 0, // Always 0 for new token-based API
        total: 237,
        nextPageToken: 'CAEaAggE',
        issues: [],
        jql: 'project = TEST AND status != Done',
        executionTime: 142
      };

      // EXPECTED TO FAIL: JQLSearchResult constructor/parser doesn't exist yet
      const searchResult = new JQLSearchResult(mockApiResponse);
      
      expect(searchResult.maxResults).toBe(50);
      expect(searchResult.startAt).toBe(0);
      expect(searchResult.total).toBe(237);
      expect(searchResult.jql).toBe('project = TEST AND status != Done');
      expect(searchResult.executionTime).toBe(142);
    });

    it('should validate that startAt is always 0 for new API', () => {
      const mockApiResponse = {
        maxResults: 25,
        startAt: 100, // Invalid - should be 0 in new API
        total: 500,
        issues: [],
        jql: 'assignee = currentUser()',
        executionTime: 89
      };

      // EXPECTED TO FAIL: Validation logic doesn't exist yet
      expect(() => new JQLSearchResult(mockApiResponse))
        .toThrow('startAt must be 0 for token-based pagination API');
    });

    it('should handle approximate total counts', () => {
      const mockApiResponse = {
        maxResults: 50,
        startAt: 0,
        total: 1000, // Approximate total from Jira
        issues: [],
        jql: 'project = LARGE',
        executionTime: 245
      };

      // EXPECTED TO FAIL: Property doesn't exist yet
      const searchResult = new JQLSearchResult(mockApiResponse);
      expect(searchResult.isApproximateTotal).toBe(true);
      expect(searchResult.total).toBe(1000);
    });
  });

  describe('Token-based Pagination', () => {
    it('should handle nextPageToken for pagination', () => {
      const mockApiResponse = {
        maxResults: 25,
        startAt: 0,
        total: 100,
        nextPageToken: 'CAEaAggD',
        issues: [],
        jql: 'status = "In Progress"',
        executionTime: 156
      };

      // EXPECTED TO FAIL: nextPageToken property doesn't exist yet
      const searchResult = new JQLSearchResult(mockApiResponse);
      expect(searchResult.nextPageToken).toBe('CAEaAggD');
      expect(searchResult.hasNextPage).toBe(true);
    });

    it('should handle last page without nextPageToken', () => {
      const mockApiResponse = {
        maxResults: 25,
        startAt: 0,
        total: 15,
        // No nextPageToken indicates last page
        issues: [],
        jql: 'project = SMALL',
        executionTime: 67
      };

      // EXPECTED TO FAIL: hasNextPage method doesn't exist yet
      const searchResult = new JQLSearchResult(mockApiResponse);
      expect(searchResult.nextPageToken).toBeUndefined();
      expect(searchResult.hasNextPage).toBe(false);
    });

    it('should provide pagination information methods', () => {
      const mockApiResponse = {
        maxResults: 50,
        startAt: 0,
        total: 200,
        nextPageToken: 'CAEaAggG',
        issues: new Array(50).fill(null).map((_, i) => ({
          id: `1000${i}`,
          key: `TEST-${i}`,
          self: `https://test.atlassian.net/rest/api/3/issue/1000${i}`,
          fields: {}
        })),
        jql: 'project = TEST',
        executionTime: 189
      };

      // EXPECTED TO FAIL: Pagination utility methods don't exist yet
      const searchResult = new JQLSearchResult(mockApiResponse);
      expect(searchResult.getCurrentPageSize()).toBe(50);
      expect(searchResult.getEstimatedPagesRemaining()).toBe(3); // Approximate: (200-50)/50
      expect(searchResult.isFirstPage()).toBe(true);
      expect(searchResult.isLastPage()).toBe(false);
    });
  });

  describe('Issue Mapping', () => {
    it('should map JiraIssueResponse objects correctly', () => {
      const mockIssueData = {
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
      };

      const mockApiResponse = {
        maxResults: 1,
        startAt: 0,
        total: 1,
        issues: [mockIssueData],
        jql: 'key = PROJ-123',
        executionTime: 45
      };

      // EXPECTED TO FAIL: JiraIssueResponse mapping doesn't exist yet
      const searchResult = new JQLSearchResult(mockApiResponse);
      const issue = searchResult.issues[0];
      
      expect(issue).toBeInstanceOf(JiraIssueResponse);
      expect(issue.id).toBe('10068');
      expect(issue.key).toBe('PROJ-123');
      expect(issue.self).toBe('https://test.atlassian.net/rest/api/3/issue/10068');
      expect(issue.fields.summary).toBe('Implement user authentication');
      expect(issue.fields.status?.name).toBe('In Progress');
      expect(issue.fields.assignee?.displayName).toBe('John Doe');
    });

    it('should handle optional fields correctly', () => {
      const mockIssueWithMinimalData = {
        id: '10001',
        key: 'TEST-1',
        self: 'https://test.atlassian.net/rest/api/3/issue/10001',
        fields: {
          summary: 'Minimal issue'
          // Missing optional fields: assignee, description, etc.
        }
      };

      const mockApiResponse = {
        maxResults: 1,
        startAt: 0,
        total: 1,
        issues: [mockIssueWithMinimalData],
        jql: 'key = TEST-1',
        executionTime: 23
      };

      // EXPECTED TO FAIL: Optional field handling doesn't exist yet
      const searchResult = new JQLSearchResult(mockApiResponse);
      const issue = searchResult.issues[0];
      
      expect(issue.fields.summary).toBe('Minimal issue');
      expect(issue.fields.assignee).toBeUndefined();
      expect(issue.fields.description).toBeUndefined();
      expect(issue.fields.priority).toBeUndefined();
    });

    it('should validate required issue fields', () => {
      const mockInvalidIssue = {
        // Missing required 'id' field
        key: 'TEST-1',
        self: 'https://test.atlassian.net/rest/api/3/issue/10001',
        fields: {}
      };

      const mockApiResponse = {
        maxResults: 1,
        startAt: 0,
        total: 1,
        issues: [mockInvalidIssue],
        jql: 'key = TEST-1',
        executionTime: 15
      };

      // EXPECTED TO FAIL: Validation logic doesn't exist yet
      expect(() => new JQLSearchResult(mockApiResponse))
        .toThrow('JiraIssueResponse missing required field: id');
    });
  });

  describe('Field Selection Strategy', () => {
    it('should handle always-requested fields', () => {
      const mockApiResponse = {
        maxResults: 1,
        startAt: 0,
        total: 1,
        issues: [{
          id: '10001',
          key: 'TEST-1',
          self: 'https://test.atlassian.net/rest/api/3/issue/10001',
          fields: {
            summary: 'Test issue',
            status: { name: 'To Do' },
            updated: '2025-09-10T12:00:00.000+0000'
          }
        }],
        jql: 'key = TEST-1',
        executionTime: 34
      };

      // EXPECTED TO FAIL: Field strategy validation doesn't exist yet
      const searchResult = new JQLSearchResult(mockApiResponse);
      expect(searchResult.hasRequiredFields()).toBe(true);
      
      const requiredFields = searchResult.getRequiredFieldsPresent();
      expect(requiredFields).toContain('summary');
      expect(requiredFields).toContain('status');
      expect(requiredFields).toContain('updated');
    });

    it('should identify configurable fields', () => {
      const mockApiResponse = {
        maxResults: 1,
        startAt: 0,
        total: 1,
        issues: [{
          id: '10001',
          key: 'TEST-1',
          self: 'https://test.atlassian.net/rest/api/3/issue/10001',
          fields: {
            summary: 'Test issue',
            assignee: { displayName: 'John Doe' },
            priority: { name: 'High' },
            created: '2025-09-09T10:00:00.000+0000',
            description: 'Test description'
          }
        }],
        jql: 'key = TEST-1',
        executionTime: 56
      };

      // EXPECTED TO FAIL: Configurable field detection doesn't exist yet
      const searchResult = new JQLSearchResult(mockApiResponse);
      const configurableFields = searchResult.getConfigurableFieldsPresent();
      expect(configurableFields).toContain('assignee');
      expect(configurableFields).toContain('priority');
      expect(configurableFields).toContain('created');
      expect(configurableFields).toContain('description');
    });

    it('should detect on-demand fields', () => {
      const mockApiResponse = {
        maxResults: 1,
        startAt: 0,
        total: 1,
        issues: [{
          id: '10001',
          key: 'TEST-1',
          self: 'https://test.atlassian.net/rest/api/3/issue/10001',
          fields: {
            summary: 'Test issue'
          },
          changelog: {
            histories: [
              {
                id: '12345',
                created: '2025-09-10T14:00:00.000+0000',
                items: []
              }
            ]
          }
        }],
        jql: 'key = TEST-1',
        executionTime: 78
      };

      // EXPECTED TO FAIL: On-demand field detection doesn't exist yet
      const searchResult = new JQLSearchResult(mockApiResponse);
      const onDemandFields = searchResult.getOnDemandFieldsPresent();
      expect(onDemandFields).toContain('changelog');
    });
  });

  describe('Performance and Execution Context', () => {
    it('should track query execution time', () => {
      const mockApiResponse = {
        maxResults: 100,
        startAt: 0,
        total: 1500,
        issues: [],
        jql: 'project IN (PROJ1, PROJ2, PROJ3) AND created >= -30d',
        executionTime: 2340 // 2.34 seconds for complex query
      };

      // EXPECTED TO FAIL: Execution time handling doesn't exist yet
      const searchResult = new JQLSearchResult(mockApiResponse);
      expect(searchResult.executionTime).toBe(2340);
      expect(searchResult.getExecutionTimeSeconds()).toBe(2.34);
      expect(searchResult.isSlowQuery()).toBe(true); // > 2 seconds
    });

    it('should preserve original JQL query context', () => {
      const originalJql = 'assignee = currentUser() AND status NOT IN (Done, Closed) ORDER BY updated DESC';
      
      const mockApiResponse = {
        maxResults: 50,
        startAt: 0,
        total: 25,
        issues: [],
        jql: originalJql,
        executionTime: 123
      };

      // EXPECTED TO FAIL: JQL context preservation doesn't exist yet
      const searchResult = new JQLSearchResult(mockApiResponse);
      expect(searchResult.jql).toBe(originalJql);
      expect(searchResult.getQueryComplexity()).toBeGreaterThan(0);
      expect(searchResult.hasOrderBy()).toBe(true);
      expect(searchResult.getOrderByFields()).toEqual(['updated DESC']);
    });

    it('should provide result statistics', () => {
      const issues = new Array(25).fill(null).map((_, i) => ({
        id: `1000${i}`,
        key: `TEST-${i}`,
        self: `https://test.atlassian.net/rest/api/3/issue/1000${i}`,
        fields: {
          summary: `Issue ${i}`,
          project: { key: i < 10 ? 'PROJ1' : 'PROJ2' }
        }
      }));

      const mockApiResponse = {
        maxResults: 50,
        startAt: 0,
        total: 25,
        issues,
        jql: 'project IN (PROJ1, PROJ2)',
        executionTime: 167
      };

      // EXPECTED TO FAIL: Result statistics methods don't exist yet
      const searchResult = new JQLSearchResult(mockApiResponse);
      expect(searchResult.getIssueCount()).toBe(25);
      expect(searchResult.getUniqueProjects()).toEqual(['PROJ1', 'PROJ2']);
      expect(searchResult.getProjectCounts()).toEqual({
        'PROJ1': 10,
        'PROJ2': 15
      });
    });
  });

  describe('Error Handling and Validation', () => {
    it('should validate required API response fields', () => {
      const invalidApiResponse = {
        // Missing required fields: maxResults, startAt, total
        issues: [],
        jql: 'project = TEST',
        executionTime: 45
      };

      // EXPECTED TO FAIL: Validation doesn't exist yet
      expect(() => new JQLSearchResult(invalidApiResponse))
        .toThrow('Invalid API response: missing required fields');
    });

    it('should handle malformed issue data gracefully', () => {
      const mockApiResponseWithBadIssue = {
        maxResults: 2,
        startAt: 0,
        total: 2,
        issues: [
          {
            id: '10001',
            key: 'TEST-1',
            self: 'https://test.atlassian.net/rest/api/3/issue/10001',
            fields: { summary: 'Good issue' }
          },
          {
            // Malformed issue missing required fields
            key: 'TEST-2',
            fields: {}
          }
        ],
        jql: 'project = TEST',
        executionTime: 89
      };

      // EXPECTED TO FAIL: Error handling doesn't exist yet
      expect(() => new JQLSearchResult(mockApiResponseWithBadIssue))
        .toThrow('Invalid issue data at index 1');
    });

    it('should validate execution time is reasonable', () => {
      const mockApiResponse = {
        maxResults: 50,
        startAt: 0,
        total: 100,
        issues: [],
        jql: 'project = TEST',
        executionTime: -50 // Invalid negative time
      };

      // EXPECTED TO FAIL: Execution time validation doesn't exist yet
      expect(() => new JQLSearchResult(mockApiResponse))
        .toThrow('Invalid execution time: must be non-negative');
    });
  });

  describe('Serialization and Deserialization', () => {
    it('should serialize to JSON correctly', () => {
      const mockApiResponse = {
        maxResults: 50,
        startAt: 0,
        total: 100,
        nextPageToken: 'CAEaAggK',
        issues: [{
          id: '10001',
          key: 'TEST-1',
          self: 'https://test.atlassian.net/rest/api/3/issue/10001',
          fields: { summary: 'Test issue' }
        }],
        jql: 'project = TEST',
        executionTime: 123
      };

      // EXPECTED TO FAIL: Serialization methods don't exist yet
      const searchResult = new JQLSearchResult(mockApiResponse);
      const serialized = searchResult.toJSON();
      
      expect(serialized).toHaveProperty('maxResults', 50);
      expect(serialized).toHaveProperty('nextPageToken', 'CAEaAggK');
      expect(serialized).toHaveProperty('issues');
      expect(serialized.issues).toHaveLength(1);
    });

    it('should deserialize from JSON correctly', () => {
      const serializedData = {
        maxResults: 25,
        startAt: 0,
        total: 75,
        nextPageToken: 'CAEaAggL',
        issues: [{
          id: '10002',
          key: 'TEST-2',
          self: 'https://test.atlassian.net/rest/api/3/issue/10002',
          fields: { summary: 'Deserialized issue' }
        }],
        jql: 'assignee = currentUser()',
        executionTime: 234
      };

      // EXPECTED TO FAIL: Deserialization method doesn't exist yet
      const searchResult = JQLSearchResult.fromJSON(serializedData);
      
      expect(searchResult.maxResults).toBe(25);
      expect(searchResult.nextPageToken).toBe('CAEaAggL');
      expect(searchResult.issues[0].key).toBe('TEST-2');
      expect(searchResult.jql).toBe('assignee = currentUser()');
    });
  });

  describe('Integration with Field Selection Strategy', () => {
    it('should optimize field selection for sync operations', () => {
      const mockApiResponse = {
        maxResults: 50,
        startAt: 0,
        total: 200,
        issues: [{
          id: '10001',
          key: 'TEST-1',
          self: 'https://test.atlassian.net/rest/api/3/issue/10001',
          fields: {
            // Always requested fields
            summary: 'Test issue',
            status: { name: 'In Progress' },
            updated: '2025-09-10T14:30:00.000+0000',
            
            // Configurable fields (based on sync settings)
            assignee: { displayName: 'John Doe' },
            priority: { name: 'High' },
            
            // Should not include on-demand fields unless explicitly requested
            // No changelog, comments, attachments
          }
        }],
        jql: 'project = TEST AND updated >= -7d',
        executionTime: 156
      };

      // EXPECTED TO FAIL: Field optimization methods don't exist yet
      const searchResult = new JQLSearchResult(mockApiResponse);
      
      expect(searchResult.isOptimizedForSync()).toBe(true);
      expect(searchResult.hasMinimalFieldSet()).toBe(false); // Has configurable fields
      expect(searchResult.getFieldSelectionStrategy()).toBe('SYNC_OPTIMIZED');
    });
  });
});

describe('JiraIssueResponse Data Model', () => {
  
  describe('Core Identification Fields', () => {
    it('should parse core identification fields correctly', () => {
      const mockIssueData = {
        id: '10068',
        key: 'PROJ-123',
        self: 'https://test.atlassian.net/rest/api/3/issue/10068',
        fields: {}
      };

      // EXPECTED TO FAIL: JiraIssueResponse constructor doesn't exist yet
      const issue = new JiraIssueResponse(mockIssueData);
      
      expect(issue.id).toBe('10068');
      expect(issue.key).toBe('PROJ-123');
      expect(issue.self).toBe('https://test.atlassian.net/rest/api/3/issue/10068');
    });

    it('should validate self URL format', () => {
      const mockIssueData = {
        id: '10001',
        key: 'TEST-1',
        self: 'invalid-url-format', // Invalid self URL
        fields: {}
      };

      // EXPECTED TO FAIL: URL validation doesn't exist yet
      expect(() => new JiraIssueResponse(mockIssueData))
        .toThrow('Invalid self URL format');
    });
  });

  describe('Fields Data Handling', () => {
    it('should handle status field with statusCategory', () => {
      const mockIssueData = {
        id: '10001',
        key: 'TEST-1',
        self: 'https://test.atlassian.net/rest/api/3/issue/10001',
        fields: {
          status: {
            name: 'In Progress',
            statusCategory: {
              key: 'indeterminate',
              colorName: 'blue'
            }
          }
        }
      };

      // EXPECTED TO FAIL: Status field parsing doesn't exist yet
      const issue = new JiraIssueResponse(mockIssueData);
      
      expect(issue.fields.status?.name).toBe('In Progress');
      expect(issue.fields.status?.statusCategory.key).toBe('indeterminate');
      expect(issue.fields.status?.statusCategory.colorName).toBe('blue');
    });

    it('should handle assignee field with account information', () => {
      const mockIssueData = {
        id: '10001',
        key: 'TEST-1',
        self: 'https://test.atlassian.net/rest/api/3/issue/10001',
        fields: {
          assignee: {
            accountId: '5b10a2844c20165700ede21g',
            displayName: 'John Doe',
            emailAddress: 'john.doe@company.com'
          }
        }
      };

      // EXPECTED TO FAIL: Assignee field parsing doesn't exist yet
      const issue = new JiraIssueResponse(mockIssueData);
      
      expect(issue.fields.assignee?.accountId).toBe('5b10a2844c20165700ede21g');
      expect(issue.fields.assignee?.displayName).toBe('John Doe');
      expect(issue.fields.assignee?.emailAddress).toBe('john.doe@company.com');
    });

    it('should handle ISO timestamp fields correctly', () => {
      const mockIssueData = {
        id: '10001',
        key: 'TEST-1',
        self: 'https://test.atlassian.net/rest/api/3/issue/10001',
        fields: {
          created: '2025-09-10T09:15:00.000+0000',
          updated: '2025-09-10T14:30:00.000+0000'
        }
      };

      // EXPECTED TO FAIL: Date field parsing doesn't exist yet
      const issue = new JiraIssueResponse(mockIssueData);
      
      expect(issue.fields.created).toBe('2025-09-10T09:15:00.000+0000');
      expect(issue.fields.updated).toBe('2025-09-10T14:30:00.000+0000');
      expect(issue.getCreatedDate()).toBeInstanceOf(Date);
      expect(issue.getUpdatedDate()).toBeInstanceOf(Date);
    });
  });

  describe('Changelog Integration', () => {
    it('should handle expanded changelog data', () => {
      const mockIssueData = {
        id: '10001',
        key: 'TEST-1',
        self: 'https://test.atlassian.net/rest/api/3/issue/10001',
        fields: {},
        changelog: {
          histories: [
            {
              id: '12345',
              created: '2025-09-10T14:00:00.000+0000',
              author: {
                accountId: '5b10a2844c20165700ede21g',
                displayName: 'John Doe'
              },
              items: [
                {
                  field: 'status',
                  fieldtype: 'jira',
                  from: '10001',
                  fromString: 'To Do',
                  to: '10002',
                  toString: 'In Progress'
                }
              ]
            }
          ]
        }
      };

      // EXPECTED TO FAIL: Changelog parsing doesn't exist yet
      const issue = new JiraIssueResponse(mockIssueData);
      
      expect(issue.changelog).toBeDefined();
      expect(issue.changelog?.histories).toHaveLength(1);
      expect(issue.hasChangelog()).toBe(true);
      expect(issue.getChangelogEntryCount()).toBe(1);
    });
  });
});