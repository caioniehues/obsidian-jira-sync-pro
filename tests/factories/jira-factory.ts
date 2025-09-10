/**
 * Factory for creating mock Jira issues, search responses, and API data
 * Provides realistic test data with customization options and preset scenarios
 */

import { SearchResponse, SearchParams, JiraClientConfig } from '../../src/jira-bases-adapter/jira-client';
import { JiraIssue, JQLQueryResult } from '../../src/enhanced-sync/jql-query-engine';

/**
 * Options for customizing generated Jira issues
 */
export interface JiraIssueFactoryOptions {
  key?: string;
  summary?: string;
  status?: string;
  assignee?: string;
  priority?: string;
  created?: string;
  updated?: string;
  description?: string;
  issueType?: string;
  project?: string;
  projectKey?: string;
  fields?: Record<string, any>;
}

/**
 * Options for creating search responses
 */
export interface SearchResponseOptions {
  total?: number;
  startAt?: number;
  maxResults?: number;
  issueCount?: number;
  includeExpectedFields?: boolean;
}

/**
 * Preset scenarios for common test cases
 */
export type JiraScenario = 
  | 'active-bug'
  | 'completed-story' 
  | 'in-progress-task'
  | 'blocked-epic'
  | 'unassigned-bug'
  | 'high-priority-incident'
  | 'minimal-data'
  | 'rich-data';

/**
 * Factory class for creating Jira test data
 */
export class JiraFactory {
  private static ticketCounter = 1000;
  
  /**
   * Creates a single Jira issue with optional customization
   */
  static createIssue(options: JiraIssueFactoryOptions = {}): JiraIssue {
    const counter = this.ticketCounter++;
    const defaultKey = `TEST-${counter}`;
    
    return {
      key: options.key || defaultKey,
      fields: {
        summary: options.summary || this.generateSummary(),
        status: this.createStatus(options.status || 'To Do'),
        assignee: this.createUser(options.assignee),
        priority: this.createPriority(options.priority || 'Medium'),
        created: options.created || this.generateDate(-30),
        updated: options.updated || this.generateDate(-1),
        description: options.description || this.generateDescription(),
        issuetype: this.createIssueType(options.issueType || 'Task'),
        project: this.createProject(options.project || 'Test Project', options.projectKey || 'TEST'),
        ...options.fields
      }
    };
  }

  /**
   * Creates multiple Jira issues
   */
  static createIssues(count: number, baseOptions: JiraIssueFactoryOptions = {}): JiraIssue[] {
    return Array.from({ length: count }, (_, index) => 
      this.createIssue({
        ...baseOptions,
        key: baseOptions.key || `TEST-${this.ticketCounter + index}`,
      })
    );
  }

  /**
   * Creates a Jira issue based on preset scenarios
   */
  static createScenarioIssue(scenario: JiraScenario): JiraIssue {
    const scenarios: Record<JiraScenario, JiraIssueFactoryOptions> = {
      'active-bug': {
        summary: 'Application crashes when submitting form',
        status: 'In Progress',
        assignee: 'john.doe@company.com',
        priority: 'High',
        issueType: 'Bug',
        description: 'Users report that the application crashes when they try to submit the contact form. This happens consistently across different browsers.',
        created: this.generateDate(-5),
        updated: this.generateDate(-1),
      },
      'completed-story': {
        summary: 'Add user authentication to dashboard',
        status: 'Done',
        assignee: 'jane.smith@company.com',
        priority: 'Medium',
        issueType: 'Story',
        description: 'As a user, I want to authenticate before accessing the dashboard so that my data is secure.',
        created: this.generateDate(-14),
        updated: this.generateDate(-2),
      },
      'in-progress-task': {
        summary: 'Update API documentation',
        status: 'In Progress',
        assignee: 'bob.wilson@company.com',
        priority: 'Low',
        issueType: 'Task',
        description: 'Update the API documentation to reflect the recent changes in endpoints and response formats.',
        created: this.generateDate(-7),
        updated: this.generateDate(0),
      },
      'blocked-epic': {
        summary: 'Migrate to microservices architecture',
        status: 'Blocked',
        assignee: 'alice.brown@company.com',
        priority: 'Medium',
        issueType: 'Epic',
        description: 'Large-scale refactoring to split the monolithic application into microservices. Blocked pending infrastructure decisions.',
        created: this.generateDate(-21),
        updated: this.generateDate(-3),
      },
      'unassigned-bug': {
        summary: 'Memory leak in data processing module',
        status: 'Open',
        assignee: null,
        priority: 'Medium',
        issueType: 'Bug',
        description: 'Memory usage continuously increases during bulk data processing operations.',
        created: this.generateDate(-2),
        updated: this.generateDate(-1),
      },
      'high-priority-incident': {
        summary: 'Production database connection failures',
        status: 'In Progress',
        assignee: 'emergency.team@company.com',
        priority: 'Highest',
        issueType: 'Incident',
        description: 'Critical: Production users cannot access the application due to database connection issues.',
        created: this.generateDate(0),
        updated: this.generateDate(0),
      },
      'minimal-data': {
        summary: 'Simple task',
        status: 'To Do',
        issueType: 'Task',
        description: null,
        assignee: null,
        priority: 'Medium',
      },
      'rich-data': {
        summary: 'Complex feature with extensive metadata',
        status: 'In Progress',
        assignee: 'senior.dev@company.com',
        priority: 'High',
        issueType: 'Story',
        description: 'This is a comprehensive feature that requires extensive documentation and testing.',
        created: this.generateDate(-10),
        updated: this.generateDate(0),
        fields: {
          labels: ['frontend', 'backend', 'database'],
          components: [{ name: 'UI Components' }, { name: 'API Gateway' }],
          fixVersions: [{ name: '2.1.0' }],
          reporter: { displayName: 'Product Manager', emailAddress: 'pm@company.com' },
          customfield_10001: 'Sprint 23',
          customfield_10002: 13, // Story points
          timetracking: {
            originalEstimate: '5d',
            remainingEstimate: '2d',
            timeSpent: '3d'
          },
          comment: {
            comments: [
              {
                author: { displayName: 'John Doe' },
                body: 'Started working on this feature',
                created: this.generateDate(-2)
              }
            ]
          }
        }
      }
    };

    return this.createIssue(scenarios[scenario]);
  }

  /**
   * Creates a Jira search response
   */
  static createSearchResponse(options: SearchResponseOptions = {}): SearchResponse {
    const issueCount = options.issueCount !== undefined ? options.issueCount : 5;
    const total = options.total !== undefined ? options.total : issueCount;
    const startAt = options.startAt !== undefined ? options.startAt : 0;
    const maxResults = options.maxResults !== undefined ? options.maxResults : 50;
    
    const issues = this.createIssues(issueCount);

    return {
      startAt,
      maxResults,
      total,
      issues: options.includeExpectedFields !== false ? issues : issues.map(issue => ({
        ...issue,
        // Remove some fields to simulate different API responses
        fields: {
          summary: issue.fields.summary,
          status: issue.fields.status,
          key: issue.key
        }
      }))
    };
  }

  /**
   * Creates a paginated search response for testing pagination
   */
  static createPaginatedSearchResponse(
    page: number, 
    pageSize: number, 
    totalIssues: number
  ): SearchResponse {
    const startAt = page * pageSize;
    const remainingIssues = Math.max(0, totalIssues - startAt);
    const issuesInPage = Math.min(pageSize, remainingIssues);
    
    // Determine if there are more pages
    const hasNextPage = startAt + issuesInPage < totalIssues;
    
    return {
      startAt,
      maxResults: pageSize,
      total: totalIssues,
      issues: this.createIssues(issuesInPage, {
        key: `PAGE${page}-{index}`
      }),
      // NEW: Token-based pagination fields
      nextPageToken: hasNextPage ? `token_page_${page + 1}_${Date.now()}` : undefined,
      isLast: !hasNextPage
    };
  }

  /**
   * Creates a JQL query result
   */
  static createQueryResult(
    issueCount: number = 5,
    total?: number,
    truncated: boolean = false
  ): JQLQueryResult {
    return {
      issues: this.createIssues(issueCount),
      total: total || issueCount,
      truncated,
      errors: []
    };
  }

  /**
   * Creates search parameters for testing
   */
  static createSearchParams(overrides: Partial<SearchParams> = {}): SearchParams {
    return {
      jql: 'project = TEST AND status != Done',
      startAt: 0,
      maxResults: 50,
      fields: ['summary', 'status', 'assignee', 'priority', 'created', 'updated'],
      expand: [],
      validateQuery: false,
      ...overrides
    };
  }

  /**
   * Creates Jira client configuration
   */
  static createClientConfig(overrides: Partial<JiraClientConfig> = {}): JiraClientConfig {
    return {
      baseUrl: 'https://test-company.atlassian.net',
      email: 'test.user@company.com',
      apiToken: 'fake-api-token-for-testing',
      ...overrides
    };
  }

  /**
   * Creates error responses for testing failure scenarios
   */
  static createErrorResponse(status: number, message?: string): any {
    const errorResponses: Record<number, any> = {
      400: {
        status: 400,
        message: message || 'Invalid JQL syntax or bad request',
        json: {
          errorMessages: ['The JQL query is invalid'],
          errors: {}
        }
      },
      401: {
        status: 401,
        message: message || 'Authentication required - check your credentials',
        json: {
          errorMessages: ['You do not have the permission to see the specified issue.']
        }
      },
      403: {
        status: 403,
        message: message || 'You do not have permission to view these issues',
        json: {
          errorMessages: ['Forbidden - insufficient permissions']
        }
      },
      404: {
        status: 404,
        message: message || 'Jira endpoint not found - check your base URL',
        json: {
          errorMessages: ['Not Found']
        }
      },
      429: {
        status: 429,
        message: message || 'Rate limit exceeded - too many requests',
        json: {
          errorMessages: ['Rate limit exceeded']
        },
        headers: {
          'retry-after': '60'
        }
      },
      500: {
        status: 500,
        message: message || 'Jira server error - please try again later',
        json: {
          errorMessages: ['Internal Server Error']
        }
      }
    };

    return errorResponses[status] || {
      status: status,
      message: message || `HTTP ${status} Error`,
      json: { errorMessages: [message || `HTTP ${status} Error`] }
    };
  }

  /**
   * Creates a current user response
   */
  static createCurrentUser(overrides: any = {}): any {
    return {
      accountId: '123456789',
      displayName: 'Test User',
      emailAddress: 'test.user@company.com',
      active: true,
      timeZone: 'America/New_York',
      locale: 'en_US',
      groups: {
        size: 2,
        items: [
          { name: 'jira-users' },
          { name: 'developers' }
        ]
      },
      ...overrides
    };
  }

  /**
   * Creates field metadata response
   */
  static createFieldsResponse(): any[] {
    return [
      {
        id: 'summary',
        name: 'Summary',
        custom: false,
        orderable: true,
        navigable: true,
        searchable: true,
        schema: { type: 'string', system: 'summary' }
      },
      {
        id: 'status',
        name: 'Status',
        custom: false,
        orderable: false,
        navigable: true,
        searchable: true,
        schema: { type: 'status', system: 'status' }
      },
      {
        id: 'assignee',
        name: 'Assignee',
        custom: false,
        orderable: true,
        navigable: true,
        searchable: true,
        schema: { type: 'user', system: 'assignee' }
      },
      {
        id: 'customfield_10001',
        name: 'Story Points',
        custom: true,
        orderable: true,
        navigable: true,
        searchable: true,
        schema: { type: 'number', custom: 'com.atlassian.jira.plugin.system.customfieldtypes:float', customId: 10001 }
      }
    ];
  }

  // Helper methods for creating nested objects

  private static createStatus(name: string): any {
    const statusCategories: Record<string, any> = {
      'To Do': { id: '2', key: 'new', colorName: 'blue-gray' },
      'In Progress': { id: '4', key: 'indeterminate', colorName: 'yellow' },
      'Done': { id: '3', key: 'done', colorName: 'green' },
      'Blocked': { id: '4', key: 'indeterminate', colorName: 'red' },
      'Open': { id: '2', key: 'new', colorName: 'blue-gray' }
    };

    const category = statusCategories[name] || statusCategories['To Do'];
    
    return {
      self: `https://test-company.atlassian.net/rest/api/3/status/${name.toLowerCase().replace(' ', '-')}`,
      description: `Issues in ${name} status`,
      iconUrl: `https://test-company.atlassian.net/images/icons/statuses/${name.toLowerCase().replace(' ', '-')}.png`,
      name,
      id: Math.random().toString(),
      statusCategory: category
    };
  }

  private static createUser(email: string | null): any {
    if (!email) return null;
    
    const name = email.split('@')[0].replace('.', ' ');
    const displayName = name.split(' ').map(part => 
      part.charAt(0).toUpperCase() + part.slice(1)
    ).join(' ');

    return {
      self: `https://test-company.atlassian.net/rest/api/3/user?accountId=${email}`,
      accountId: email,
      emailAddress: email,
      displayName,
      active: true,
      timeZone: 'America/New_York',
      accountType: 'atlassian'
    };
  }

  private static createPriority(name: string): any {
    const priorities: Record<string, any> = {
      'Highest': { id: '1', iconUrl: '/images/icons/priorities/highest.svg' },
      'High': { id: '2', iconUrl: '/images/icons/priorities/high.svg' },
      'Medium': { id: '3', iconUrl: '/images/icons/priorities/medium.svg' },
      'Low': { id: '4', iconUrl: '/images/icons/priorities/low.svg' },
      'Lowest': { id: '5', iconUrl: '/images/icons/priorities/lowest.svg' }
    };

    const priority = priorities[name] || priorities['Medium'];
    
    return {
      self: `https://test-company.atlassian.net/rest/api/3/priority/${priority.id}`,
      iconUrl: priority.iconUrl,
      name,
      id: priority.id
    };
  }

  private static createIssueType(name: string): any {
    const types: Record<string, any> = {
      'Bug': { iconUrl: '/images/icons/issuetypes/bug.svg', subtask: false },
      'Task': { iconUrl: '/images/icons/issuetypes/task.svg', subtask: false },
      'Story': { iconUrl: '/images/icons/issuetypes/story.svg', subtask: false },
      'Epic': { iconUrl: '/images/icons/issuetypes/epic.svg', subtask: false },
      'Incident': { iconUrl: '/images/icons/issuetypes/incident.svg', subtask: false }
    };

    const type = types[name] || types['Task'];
    
    return {
      self: `https://test-company.atlassian.net/rest/api/3/issuetype/${name.toLowerCase()}`,
      id: name.toLowerCase(),
      description: `A ${name.toLowerCase()} issue type`,
      iconUrl: type.iconUrl,
      name,
      subtask: type.subtask
    };
  }

  private static createProject(name: string, key: string): any {
    return {
      self: `https://test-company.atlassian.net/rest/api/3/project/${key}`,
      id: key.toLowerCase(),
      key,
      name,
      projectTypeKey: 'software',
      simplified: false,
      style: 'next-gen',
      isPrivate: false
    };
  }

  private static generateSummary(): string {
    const actions = ['Add', 'Fix', 'Update', 'Remove', 'Implement', 'Refactor', 'Test'];
    const subjects = ['user authentication', 'API endpoint', 'database schema', 'UI component', 'error handling', 'performance issue'];
    
    return `${actions[Math.floor(Math.random() * actions.length)]} ${subjects[Math.floor(Math.random() * subjects.length)]}`;
  }

  private static generateDescription(): string {
    const descriptions = [
      'This issue requires investigation and implementation of a solution.',
      'User reported issue that needs to be addressed in the next release.',
      'Technical debt that should be resolved to improve maintainability.',
      'New feature request from the product team.',
      'Bug fix required to resolve customer complaints.',
      null // Some issues may not have descriptions
    ];
    
    return descriptions[Math.floor(Math.random() * descriptions.length)];
  }

  private static generateDate(daysFromNow: number): string {
    const date = new Date();
    date.setDate(date.getDate() + daysFromNow);
    return date.toISOString();
  }

  /**
   * Resets the ticket counter (useful for consistent test data)
   */
  static resetCounter(): void {
    this.ticketCounter = 1000;
  }

  /**
   * Creates test data for bulk operations
   */
  static createBulkTestData(count: number): {
    issues: JiraIssue[];
    searchResponse: SearchResponse;
    projects: string[];
  } {
    const projects = ['PROJ', 'TEST', 'DEV', 'PROD'];
    const issues = Array.from({ length: count }, (_, index) => {
      const projectKey = projects[index % projects.length];
      return this.createIssue({
        key: `${projectKey}-${1000 + index}`,
        projectKey,
        project: `${projectKey} Project`
      });
    });

    return {
      issues,
      searchResponse: {
        startAt: 0,
        maxResults: 50,
        total: count,
        issues
      },
      projects
    };
  }
}