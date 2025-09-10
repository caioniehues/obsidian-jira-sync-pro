/**
 * JQL Search Result Data Model
 * 
 * Data models for the new Jira API search endpoint with token-based pagination.
 * Supports the May 1, 2025 API migration deadline.
 * 
 * Specification: specs/001-jql-auto-sync/data-model.md
 */

/**
 * Changelog entry from Jira API
 */
interface ChangelogEntry {
  id: string;
  created: string; // ISO timestamp
  author: {
    accountId: string;
    displayName: string;
  };
  items: Array<{
    field: string;
    fieldtype: string;
    from?: string;
    fromString?: string;
    to?: string;
    toString?: string;
  }>;
}

/**
 * Individual Jira issue response from the API
 */
export class JiraIssueResponse {
  public readonly id: string;
  public readonly key: string;
  public readonly self: string;
  public readonly fields: {
    summary?: string;
    status?: {
      name: string;
      statusCategory: {
        key: string;           // "new", "indeterminate", "done"
        colorName: string;
      };
    };
    assignee?: {
      accountId: string;
      displayName: string;
      emailAddress?: string;
    };
    priority?: {
      name: string;
      iconUrl: string;
    };
    created?: string;          // ISO timestamp
    updated?: string;          // ISO timestamp
    description?: any;         // Atlassian Document Format
    project?: {
      key: string;
      name: string;
    };
  };
  public readonly changelog?: {
    histories: ChangelogEntry[];
  };

  constructor(data: any) {
    // Validate required fields
    if (!data.id) {
      throw new Error('JiraIssueResponse missing required field: id');
    }
    if (!data.key) {
      throw new Error('JiraIssueResponse missing required field: key');
    }
    if (!data.self) {
      throw new Error('JiraIssueResponse missing required field: self');
    }

    // Validate self URL format
    if (!this.isValidSelfUrl(data.self)) {
      throw new Error('Invalid self URL format');
    }

    this.id = data.id;
    this.key = data.key;
    this.self = data.self;
    this.fields = data.fields || {};
    this.changelog = data.changelog;
  }

  /**
   * Validate the self URL format
   */
  private isValidSelfUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'https:' && 
             parsed.pathname.includes('/rest/api/') &&
             parsed.pathname.includes('/issue/');
    } catch {
      return false;
    }
  }

  /**
   * Get created date as Date object
   */
  getCreatedDate(): Date | null {
    return this.fields.created ? new Date(this.fields.created) : null;
  }

  /**
   * Get updated date as Date object
   */
  getUpdatedDate(): Date | null {
    return this.fields.updated ? new Date(this.fields.updated) : null;
  }

  /**
   * Check if issue has changelog data
   */
  hasChangelog(): boolean {
    return this.changelog !== undefined && this.changelog.histories.length > 0;
  }

  /**
   * Get number of changelog entries
   */
  getChangelogEntryCount(): number {
    return this.changelog?.histories.length || 0;
  }
}

/**
 * Field selection strategy types
 */
type FieldSelectionStrategy = 'MINIMAL' | 'SYNC_OPTIMIZED' | 'FULL';

/**
 * Main JQL search result response from new Jira API
 */
export class JQLSearchResult {
  public readonly maxResults: number;
  public readonly startAt: number;
  public readonly total: number;
  public readonly nextPageToken?: string;
  public readonly issues: JiraIssueResponse[];
  public readonly jql: string;
  public readonly executionTime: number;

  constructor(data: any) {
    // Validate required API response fields
    this.validateRequiredFields(data);
    
    // Validate startAt is always 0 for new API
    if (data.startAt !== 0) {
      throw new Error('startAt must be 0 for token-based pagination API');
    }

    // Validate execution time is reasonable
    if (data.executionTime < 0) {
      throw new Error('Invalid execution time: must be non-negative');
    }

    this.maxResults = data.maxResults;
    this.startAt = data.startAt;
    this.total = data.total;
    this.nextPageToken = data.nextPageToken;
    this.jql = data.jql;
    this.executionTime = data.executionTime;

    // Parse and validate issues
    this.issues = this.parseIssues(data.issues || []);
  }

  /**
   * Validate required API response fields
   */
  private validateRequiredFields(data: any): void {
    const requiredFields = ['maxResults', 'startAt', 'total', 'jql', 'executionTime'];
    const missingFields = requiredFields.filter(field => data[field] === undefined);
    
    if (missingFields.length > 0) {
      throw new Error('Invalid API response: missing required fields');
    }
  }

  /**
   * Parse issues array and validate each issue
   */
  private parseIssues(issuesData: any[]): JiraIssueResponse[] {
    return issuesData.map((issueData, index) => {
      try {
        return new JiraIssueResponse(issueData);
      } catch (error) {
        // For single issue cases, preserve the original error message
        // For multiple issue cases, use index-based error message
        if (issuesData.length === 1) {
          throw error; // Preserve original validation error for single issues
        }
        throw new Error(`Invalid issue data at index ${index}`);
      }
    });
  }

  /**
   * Check if there's a next page
   */
  get hasNextPage(): boolean {
    return this.nextPageToken !== undefined;
  }

  /**
   * Check if total is approximate (for large result sets)
   */
  get isApproximateTotal(): boolean {
    return this.total >= 1000;
  }

  /**
   * Get current page size (number of issues returned)
   */
  getCurrentPageSize(): number {
    return this.issues.length;
  }

  /**
   * Estimate remaining pages (approximate for large totals)
   */
  getEstimatedPagesRemaining(): number {
    const remaining = this.total - this.getCurrentPageSize();
    return Math.ceil(remaining / this.maxResults);
  }

  /**
   * Check if this is the first page
   */
  isFirstPage(): boolean {
    return this.startAt === 0;
  }

  /**
   * Check if this is the last page
   */
  isLastPage(): boolean {
    return !this.hasNextPage;
  }

  /**
   * Get execution time in seconds
   */
  getExecutionTimeSeconds(): number {
    return this.executionTime / 1000;
  }

  /**
   * Check if query execution was slow (> 2 seconds)
   */
  isSlowQuery(): boolean {
    return this.getExecutionTimeSeconds() > 2.0;
  }

  /**
   * Get query complexity score (simple heuristic)
   */
  getQueryComplexity(): number {
    let complexity = 0;
    const jql = this.jql.toLowerCase();
    
    // Count operators and functions
    complexity += (jql.match(/\band\b|\bor\b/g) || []).length;
    complexity += (jql.match(/\bin\b|\bnot in\b/g) || []).length;
    complexity += (jql.match(/currentuser\(\)|now\(\)/g) || []).length;
    
    // Order by adds complexity
    if (jql.includes('order by')) complexity += 1;
    
    return complexity;
  }

  /**
   * Check if JQL query has ORDER BY clause
   */
  hasOrderBy(): boolean {
    return this.jql.toLowerCase().includes('order by');
  }

  /**
   * Extract ORDER BY fields
   */
  getOrderByFields(): string[] {
    if (!this.hasOrderBy()) return [];
    
    const match = this.jql.match(/order by\s+(.+)$/i);
    if (!match) return [];
    
    return match[1].split(',').map(field => field.trim());
  }

  /**
   * Get number of issues returned
   */
  getIssueCount(): number {
    return this.issues.length;
  }

  /**
   * Get unique project keys from issues
   */
  getUniqueProjects(): string[] {
    const projects = new Set<string>();
    this.issues.forEach(issue => {
      if (issue.fields.project?.key) {
        projects.add(issue.fields.project.key);
      }
    });
    return Array.from(projects).sort();
  }

  /**
   * Get project counts
   */
  getProjectCounts(): Record<string, number> {
    const counts: Record<string, number> = {};
    this.issues.forEach(issue => {
      const projectKey = issue.fields.project?.key;
      if (projectKey) {
        counts[projectKey] = (counts[projectKey] || 0) + 1;
      }
    });
    return counts;
  }

  /**
   * Check if response has required fields for sync operations
   */
  hasRequiredFields(): boolean {
    const requiredFields = ['summary', 'status', 'updated'];
    return this.issues.every(issue => 
      requiredFields.every(field => issue.fields[field as keyof typeof issue.fields] !== undefined)
    );
  }

  /**
   * Get list of required fields that are present
   */
  getRequiredFieldsPresent(): string[] {
    const requiredFields = ['summary', 'status', 'updated'];
    const presentFields = new Set<string>();
    
    this.issues.forEach(issue => {
      requiredFields.forEach(field => {
        if (issue.fields[field as keyof typeof issue.fields] !== undefined) {
          presentFields.add(field);
        }
      });
    });
    
    return Array.from(presentFields);
  }

  /**
   * Get list of configurable fields that are present
   */
  getConfigurableFieldsPresent(): string[] {
    const configurableFields = ['assignee', 'priority', 'created', 'description'];
    const presentFields = new Set<string>();
    
    this.issues.forEach(issue => {
      configurableFields.forEach(field => {
        if (issue.fields[field as keyof typeof issue.fields] !== undefined) {
          presentFields.add(field);
        }
      });
    });
    
    return Array.from(presentFields);
  }

  /**
   * Get list of on-demand fields that are present
   */
  getOnDemandFieldsPresent(): string[] {
    const onDemandFields: string[] = [];
    
    this.issues.forEach(issue => {
      if (issue.changelog) {
        onDemandFields.push('changelog');
      }
    });
    
    return Array.from(new Set(onDemandFields));
  }

  /**
   * Check if optimized for sync operations
   */
  isOptimizedForSync(): boolean {
    return this.hasRequiredFields() && this.getConfigurableFieldsPresent().length > 0;
  }

  /**
   * Check if has minimal field set (only required fields)
   */
  hasMinimalFieldSet(): boolean {
    return this.getConfigurableFieldsPresent().length === 0 && 
           this.getOnDemandFieldsPresent().length === 0;
  }

  /**
   * Get field selection strategy
   */
  getFieldSelectionStrategy(): FieldSelectionStrategy {
    if (this.hasMinimalFieldSet()) {
      return 'MINIMAL';
    } else if (this.isOptimizedForSync()) {
      return 'SYNC_OPTIMIZED';
    } else {
      return 'FULL';
    }
  }

  /**
   * Serialize to JSON
   */
  toJSON(): any {
    return {
      maxResults: this.maxResults,
      startAt: this.startAt,
      total: this.total,
      nextPageToken: this.nextPageToken,
      issues: this.issues.map(issue => ({
        id: issue.id,
        key: issue.key,
        self: issue.self,
        fields: issue.fields,
        changelog: issue.changelog
      })),
      jql: this.jql,
      executionTime: this.executionTime
    };
  }

  /**
   * Deserialize from JSON
   */
  static fromJSON(data: any): JQLSearchResult {
    return new JQLSearchResult(data);
  }
}

// Export types for external use
export { ChangelogEntry };