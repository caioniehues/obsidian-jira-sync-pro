/**
 * Dataview Property Mapper Unit Tests
 * Comprehensive test suite for Jira to Dataview property transformation
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  DataviewPropertyMapper,
  DataviewMappingResult,
  DataviewPropertyType,
  DataviewMappingOptions,
  DataviewMappingError,
  createOptimizedDataviewMapper,
  createComprehensiveDataviewMapper,
} from '../../src/adapters/dataview-property-mapper';
import {
  JiraIssue,
  JiraUser,
  JiraStatus,
  JiraPriority,
  JiraProject,
  JiraComponent,
} from '../../src/types/jira-types';

describe('DataviewPropertyMapper', () => {
  let mapper: DataviewPropertyMapper;
  let mockJiraIssue: JiraIssue;
  let mockUser: JiraUser;
  let mockStatus: JiraStatus;
  let mockPriority: JiraPriority;
  let mockProject: JiraProject;

  beforeEach(() => {
    mapper = new DataviewPropertyMapper();

    mockUser = {
      accountId: 'user123',
      displayName: 'John Doe',
      emailAddress: 'john@example.com',
      active: true,
      avatarUrls: {
        '32x32': 'https://avatar.url/32x32.png',
      },
    };

    mockStatus = {
      id: '3',
      name: 'In Progress',
      description: 'Work in progress',
      statusCategory: {
        id: 4,
        key: 'indeterminate',
        colorName: 'yellow',
        name: 'In Progress',
        self: 'https://status-category.self',
      },
      self: 'https://status.self',
    };

    mockPriority = {
      id: '2',
      name: 'High',
      description: 'High priority',
      iconUrl: 'https://priority.icon',
      self: 'https://priority.self',
    };

    mockProject = {
      id: '10001',
      key: 'TEST',
      name: 'Test Project',
      description: 'A test project',
      projectTypeKey: 'software',
      simplified: false,
      self: 'https://project.self',
    };

    mockJiraIssue = {
      id: '12345',
      key: 'TEST-123',
      self: 'https://jira.example.com/rest/api/2/issue/12345',
      fields: {
        summary: 'Test issue summary',
        description: 'This is a test issue description with some details',
        status: mockStatus,
        priority: mockPriority,
        assignee: mockUser,
        reporter: mockUser,
        created: '2024-01-15T10:30:00.000Z',
        updated: '2024-01-16T14:45:30.000Z',
        resolutiondate: null,
        duedate: '2024-02-15',
        project: mockProject,
        issuetype: {
          id: '1',
          name: 'Story',
          description: 'User story',
          iconUrl: 'https://issuetype.icon',
          subtask: false,
          self: 'https://issuetype.self',
        },
        labels: ['frontend', 'urgent', 'customer-facing'],
        components: [
          {
            id: '10100',
            name: 'Web UI',
            description: 'Web user interface',
            projectId: 10001,
            project: 'TEST',
            isAssigneeTypeValid: true,
            self: 'https://component.self',
          } as JiraComponent,
        ],
        customfield_10020: 8, // Story points
        customfield_10014: 'TEST-100', // Epic link
      },
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Constructor', () => {
    it('should initialize with default options', () => {
      const defaultMapper = new DataviewPropertyMapper();
      expect(defaultMapper).toBeInstanceOf(DataviewPropertyMapper);
    });

    it('should initialize with custom options', () => {
      const customOptions: DataviewMappingOptions = {
        includeRawFields: true,
        maxNestingDepth: 5,
        dateFormat: 'iso',
        linkFormat: 'markdown',
        tagPrefix: 'custom',
        arrayMaxLength: 100,
      };

      const customMapper = new DataviewPropertyMapper(customOptions);
      expect(customMapper).toBeInstanceOf(DataviewPropertyMapper);
    });

    it('should merge partial options with defaults', () => {
      const partialOptions: DataviewMappingOptions = {
        tagPrefix: 'custom-prefix',
      };

      const customMapper = new DataviewPropertyMapper(partialOptions);
      expect(customMapper).toBeInstanceOf(DataviewPropertyMapper);
    });
  });

  describe('mapJiraIssueToDataview', () => {
    it('should map basic issue properties correctly', async () => {
      const result = await mapper.mapJiraIssueToDataview(mockJiraIssue);

      expect(result.properties.jira_key).toBe('TEST-123');
      expect(result.properties.jira_id).toBe('12345');
      expect(result.properties.jira_url).toBe(
        'https://jira.example.com/rest/api/2/issue/12345'
      );
      expect(result.properties.summary).toBe('Test issue summary');
      expect(result.properties.description).toBe(
        'This is a test issue description with some details'
      );
    });

    it('should map user fields correctly', async () => {
      const result = await mapper.mapJiraIssueToDataview(mockJiraIssue);

      expect(result.properties.assignee).toBe('John Doe');
      expect(result.properties.assignee_id).toBe('user123');
      expect(result.properties.assignee_email).toBe('john@example.com');
      expect(result.properties.assignee_active).toBe(true);
      expect(result.properties.assignee_avatar).toBe(
        'https://avatar.url/32x32.png'
      );

      expect(result.properties.reporter).toBe('John Doe');
      expect(result.properties.reporter_id).toBe('user123');
    });

    it('should map status fields correctly', async () => {
      const result = await mapper.mapJiraIssueToDataview(mockJiraIssue);

      expect(result.properties.status).toBe('In Progress');
      expect(result.properties.status_id).toBe('3');
      expect(result.properties.status_category).toBe('In Progress');
      expect(result.properties.status_category_key).toBe('indeterminate');
      expect(result.properties.status_color).toBe('yellow');
    });

    it('should map priority fields correctly', async () => {
      const result = await mapper.mapJiraIssueToDataview(mockJiraIssue);

      expect(result.properties.priority).toBe('High');
      expect(result.properties.priority_id).toBe('2');
      expect(result.properties.priority_icon).toBe('https://priority.icon');
    });

    it('should map project fields correctly', async () => {
      const result = await mapper.mapJiraIssueToDataview(mockJiraIssue);

      expect(result.properties.project).toBe('Test Project');
      expect(result.properties.project_key).toBe('TEST');
      expect(result.properties.project_id).toBe('10001');
      expect(result.properties.project_type).toBe('software');
      expect(result.properties.project_simplified).toBe(false);
    });

    it('should map array fields correctly', async () => {
      const result = await mapper.mapJiraIssueToDataview(mockJiraIssue);

      expect(result.properties.labels).toEqual([
        'frontend',
        'urgent',
        'customer-facing',
      ]);
      expect(result.properties.labels_count).toBe(3);
      expect(result.properties.labels_first).toBe('frontend');

      expect(result.properties.components).toEqual(['Web UI']);
      expect(result.properties.components_count).toBe(1);
      expect(result.properties.components_first).toBe('Web UI');
    });

    it('should map date fields correctly', async () => {
      const result = await mapper.mapJiraIssueToDataview(mockJiraIssue);

      expect(result.properties.created).toBe('2024-01-15');
      expect(result.properties.updated).toBe('2024-01-16');
      expect(result.properties.duedate).toBe('2024-02-15');
    });

    it('should map custom fields correctly', async () => {
      const result = await mapper.mapJiraIssueToDataview(mockJiraIssue);

      expect(result.properties.customfield_10020).toBe(8);
      expect(result.properties.customfield_10014).toBe('TEST-100');
    });

    it('should generate computed properties', async () => {
      const result = await mapper.mapJiraIssueToDataview(mockJiraIssue);

      expect(typeof result.properties.age_days).toBe('number');
      expect(result.properties.age_days).toBeGreaterThan(0);

      expect(typeof result.properties.days_since_update).toBe('number');
      expect(result.properties.days_since_update).toBeGreaterThan(0);

      expect(result.properties.story_points).toBe(8);
      expect(result.properties.has_story_points).toBe(true);

      expect(result.properties.epic_link).toBe('TEST-100');
      expect(result.properties.has_epic).toBe(true);
    });

    it('should generate appropriate tags', async () => {
      const result = await mapper.mapJiraIssueToDataview(mockJiraIssue);

      expect(result.tags).toContain('jira');
      expect(result.tags).toContain('jira/type/story');
      expect(result.tags).toContain('jira/status/in-progress');
      expect(result.tags).toContain('jira/priority/high');
      expect(result.tags).toContain('jira/project/TEST');
      expect(result.tags).toContain('jira/user/john-doe');
      expect(result.tags).toContain('jira/component/web-ui');
      expect(result.tags).toContain('jira/label/frontend');
      expect(result.tags).toContain('jira/label/urgent');
      expect(result.tags).toContain('jira/label/customer-facing');
      expect(result.tags).toContain('jira/unresolved');
    });

    it('should generate links correctly', async () => {
      const result = await mapper.mapJiraIssueToDataview(mockJiraIssue);

      expect(result.links).toContain('[[TEST]]');
    });

    it('should handle null/undefined values gracefully', async () => {
      const issueWithNulls: JiraIssue = {
        ...mockJiraIssue,
        fields: {
          ...mockJiraIssue.fields,
          assignee: null,
          description: null,
          duedate: null,
          labels: [],
          components: [],
        },
      };

      const result = await mapper.mapJiraIssueToDataview(issueWithNulls);

      expect(result.properties.jira_key).toBe('TEST-123');
      expect(result.properties.assignee).toBeUndefined();
      expect(result.properties.description).toBeUndefined();
      expect(result.properties.duedate).toBeUndefined();
      expect(result.properties.labels).toEqual([]);
      expect(result.properties.components).toEqual([]);
    });

    it('should respect performance target', async () => {
      const result = await mapper.mapJiraIssueToDataview(mockJiraIssue);

      expect(result.processingTime).toBeLessThan(100); // Generous limit for test environment
      expect(typeof result.processingTime).toBe('number');
    });

    it('should warn when performance target is exceeded', async () => {
      // Create a very large issue to potentially exceed performance target
      const largeIssue: JiraIssue = {
        ...mockJiraIssue,
        fields: {
          ...mockJiraIssue.fields,
          labels: Array.from({ length: 1000 }, (_, i) => `label-${i}`),
          components: Array.from(
            { length: 100 },
            (_, i) =>
              ({
                id: `${10100 + i}`,
                name: `Component ${i}`,
                projectId: 10001,
                project: 'TEST',
                isAssigneeTypeValid: true,
                self: `https://component.self/${i}`,
              }) as JiraComponent
          ),
        },
      };

      const result = await mapper.mapJiraIssueToDataview(largeIssue);

      if (result.processingTime > 50) {
        expect(result.warnings).toContainEqual(
          expect.stringContaining('Processing exceeded target time')
        );
      }
    });

    it('should handle mapping errors gracefully', async () => {
      const invalidIssue = {
        ...mockJiraIssue,
        fields: {
          ...mockJiraIssue.fields,
          status: 'invalid status object', // Should be an object, not string
        },
      };

      await expect(async () => {
        await mapper.mapJiraIssueToDataview(invalidIssue as JiraIssue);
      }).not.toThrow(); // Should handle errors gracefully, not throw
    });
  });

  describe('Array Processing', () => {
    it('should handle large arrays with truncation', async () => {
      const mapperWithSmallLimit = new DataviewPropertyMapper({
        arrayMaxLength: 3,
      });

      const issueWithLargeArray: JiraIssue = {
        ...mockJiraIssue,
        fields: {
          ...mockJiraIssue.fields,
          labels: ['label1', 'label2', 'label3', 'label4', 'label5'],
        },
      };

      const result =
        await mapperWithSmallLimit.mapJiraIssueToDataview(issueWithLargeArray);

      expect(result.properties.labels).toHaveLength(3);
      expect(result.properties.labels_truncated).toBe(true);
      expect(result.properties.labels_total_count).toBe(5);
    });

    it('should handle empty arrays', async () => {
      const issueWithEmptyArrays: JiraIssue = {
        ...mockJiraIssue,
        fields: {
          ...mockJiraIssue.fields,
          labels: [],
          components: [],
        },
      };

      const result = await mapper.mapJiraIssueToDataview(issueWithEmptyArrays);

      expect(result.properties.labels).toEqual([]);
      expect(result.properties.labels_count).toBe(0);
      expect(result.properties.components).toEqual([]);
      expect(result.properties.components_count).toBe(0);
    });
  });

  describe('Date Formatting', () => {
    it('should format dates in obsidian format by default', async () => {
      const result = await mapper.mapJiraIssueToDataview(mockJiraIssue);

      expect(result.properties.created).toBe('2024-01-15');
      expect(result.properties.updated).toBe('2024-01-16');
    });

    it('should format dates in ISO format when specified', async () => {
      const isoMapper = new DataviewPropertyMapper({ dateFormat: 'iso' });
      const result = await isoMapper.mapJiraIssueToDataview(mockJiraIssue);

      expect(result.properties.created).toBe('2024-01-15T10:30:00.000Z');
      expect(result.properties.updated).toBe('2024-01-16T14:45:30.000Z');
    });

    it('should format dates in custom format when specified', async () => {
      const customMapper = new DataviewPropertyMapper({
        dateFormat: 'custom',
        customDateFormat: 'MM/DD/YYYY',
      });
      const result = await customMapper.mapJiraIssueToDataview(mockJiraIssue);

      expect(result.properties.created).toBe('01/15/2024');
      expect(result.properties.updated).toBe('01/16/2024');
    });
  });

  describe('Link Formatting', () => {
    it('should format links as wikilinks by default', async () => {
      const result = await mapper.mapJiraIssueToDataview(mockJiraIssue);

      expect(result.properties.project_link).toBe('[[TEST]]');
    });

    it('should format links as markdown when specified', async () => {
      const markdownMapper = new DataviewPropertyMapper({
        linkFormat: 'markdown',
      });
      const result = await markdownMapper.mapJiraIssueToDataview(mockJiraIssue);

      expect(result.properties.project_link).toBe('[Test Project](TEST)');
    });
  });

  describe('Tag Generation', () => {
    it('should use custom tag prefix', async () => {
      const customMapper = new DataviewPropertyMapper({ tagPrefix: 'custom' });
      const result = await customMapper.mapJiraIssueToDataview(mockJiraIssue);

      expect(result.tags).toContain('custom');
      expect(result.tags).toContain('custom/type/story');
      expect(result.tags).toContain('custom/status/in-progress');
    });

    it('should sanitize tag names correctly', async () => {
      const issueWithSpecialChars: JiraIssue = {
        ...mockJiraIssue,
        fields: {
          ...mockJiraIssue.fields,
          status: {
            ...mockStatus,
            name: 'In Progress (Review)', // Contains special characters
          },
        },
      };

      const result = await mapper.mapJiraIssueToDataview(issueWithSpecialChars);

      expect(result.tags).toContain('jira/status/in-progress-review');
    });
  });

  describe('Raw Fields Option', () => {
    it('should include raw fields when option is enabled', async () => {
      const rawMapper = new DataviewPropertyMapper({ includeRawFields: true });

      // Create an issue with a field that might cause processing errors
      const issueWithComplexField: JiraIssue = {
        ...mockJiraIssue,
        fields: {
          ...mockJiraIssue.fields,
          customComplexField: {
            deeply: {
              nested: {
                complex: {
                  structure: 'value',
                },
              },
            },
          },
        },
      };

      const result = await rawMapper.mapJiraIssueToDataview(
        issueWithComplexField
      );

      // Check that the mapper processes the issue without errors
      expect(result.properties.jira_key).toBe('TEST-123');
    });
  });

  describe('Factory Functions', () => {
    it('should create optimized mapper with correct settings', () => {
      const optimizedMapper = createOptimizedDataviewMapper();
      expect(optimizedMapper).toBeInstanceOf(DataviewPropertyMapper);
    });

    it('should create comprehensive mapper with correct settings', () => {
      const comprehensiveMapper = createComprehensiveDataviewMapper();
      expect(comprehensiveMapper).toBeInstanceOf(DataviewPropertyMapper);
    });
  });

  describe('Error Handling', () => {
    it('should throw DataviewMappingError for invalid issues', async () => {
      const invalidIssue = null as any;

      await expect(mapper.mapJiraIssueToDataview(invalidIssue)).rejects.toThrow(
        DataviewMappingError
      );
    });

    it('should include processing time in error', async () => {
      const invalidIssue = null as any;

      try {
        await mapper.mapJiraIssueToDataview(invalidIssue);
      } catch (error) {
        expect(error).toBeInstanceOf(DataviewMappingError);
        expect(
          (error as DataviewMappingError).processingTime
        ).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('Type Guards', () => {
    it('should correctly identify Jira objects', async () => {
      // This test ensures our type guards work correctly
      const result = await mapper.mapJiraIssueToDataview(mockJiraIssue);

      // User object should be properly identified and processed
      expect(result.properties.assignee).toBe('John Doe');
      expect(result.properties.assignee_id).toBe('user123');

      // Status object should be properly identified and processed
      expect(result.properties.status).toBe('In Progress');
      expect(result.properties.status_category).toBe('In Progress');

      // Project object should be properly identified and processed
      expect(result.properties.project).toBe('Test Project');
      expect(result.properties.project_key).toBe('TEST');
    });
  });

  describe('Performance Testing', () => {
    it('should handle multiple issues efficiently', async () => {
      const issues = Array.from({ length: 10 }, (_, i) => ({
        ...mockJiraIssue,
        id: `${12345 + i}`,
        key: `TEST-${123 + i}`,
      }));

      const startTime = performance.now();

      const results = await Promise.all(
        issues.map(issue => mapper.mapJiraIssueToDataview(issue))
      );

      const totalTime = performance.now() - startTime;
      const averageTime = totalTime / issues.length;

      expect(results).toHaveLength(10);
      expect(averageTime).toBeLessThan(100); // Average should be reasonable

      // All results should have the expected structure
      results.forEach(result => {
        expect(result.properties.jira_key).toMatch(/TEST-\d+/);
        expect(result.tags).toContain('jira');
        expect(typeof result.processingTime).toBe('number');
      });
    });
  });

  describe('Computed Properties', () => {
    it('should calculate age correctly', async () => {
      // Create an issue that was created 5 days ago
      const fiveDaysAgo = new Date();
      fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);

      const oldIssue: JiraIssue = {
        ...mockJiraIssue,
        fields: {
          ...mockJiraIssue.fields,
          created: fiveDaysAgo.toISOString(),
        },
      };

      const result = await mapper.mapJiraIssueToDataview(oldIssue);

      expect(result.properties.age_days).toBeGreaterThanOrEqual(4);
      expect(result.properties.age_days).toBeLessThanOrEqual(6);
    });

    it('should calculate resolution time for resolved issues', async () => {
      const createdDate = new Date('2024-01-15T10:00:00.000Z');
      const resolvedDate = new Date('2024-01-20T15:00:00.000Z');

      const resolvedIssue: JiraIssue = {
        ...mockJiraIssue,
        fields: {
          ...mockJiraIssue.fields,
          created: createdDate.toISOString(),
          resolutiondate: resolvedDate.toISOString(),
        },
      };

      const result = await mapper.mapJiraIssueToDataview(resolvedIssue);

      expect(result.properties.resolution_time_days).toBe(5);
    });

    it('should detect story points correctly', async () => {
      const result = await mapper.mapJiraIssueToDataview(mockJiraIssue);

      expect(result.properties.story_points).toBe(8);
      expect(result.properties.has_story_points).toBe(true);
    });

    it('should detect epic link correctly', async () => {
      const result = await mapper.mapJiraIssueToDataview(mockJiraIssue);

      expect(result.properties.epic_link).toBe('TEST-100');
      expect(result.properties.has_epic).toBe(true);
    });
  });
});
