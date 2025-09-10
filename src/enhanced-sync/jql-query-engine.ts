import { JiraClient } from '../jira-bases-adapter/jira-client';

/**
 * Configuration options for executing a JQL query
 */
export interface JQLQueryOptions {
  jql: string;
  maxResults: number;
  batchSize: number;
  fields?: string[];
  onProgress?: (current: number, total: number, phase: QueryPhase) => void;
  enableRetry?: boolean;
  signal?: AbortSignal;
}

/**
 * Result of a JQL query execution
 */
export interface JQLQueryResult {
  issues: JiraIssue[];
  total: number;
  truncated?: boolean;
  errors?: QueryError[];
}

/**
 * Represents a Jira issue
 */
export interface JiraIssue {
  key: string;
  fields: {
    summary?: string;
    status?: any;
    assignee?: any;
    priority?: any;
    created?: string;
    updated?: string;
    description?: string;
    issuetype?: any;
    project?: any;
    [key: string]: any;
  };
}

/**
 * Query execution phases for progress reporting
 */
export type QueryPhase = 'searching' | 'downloading' | 'processing' | 'complete';

/**
 * Error information for query execution
 */
export interface QueryError {
  message: string;
  code?: string;
  retryable?: boolean;
}

/**
 * Default fields to retrieve if none specified
 */
const DEFAULT_FIELDS = [
  'summary',
  'status',
  'assignee',
  'priority',
  'created',
  'updated',
  'description',
  'issuetype',
  'project'
];

/**
 * JQL Query Engine for executing Jira queries with pagination and error handling
 */
export class JQLQueryEngine {
  private jiraClient: JiraClient;
  
  constructor(jiraClient: JiraClient) {
    this.jiraClient = jiraClient;
  }

  /**
   * Validates a JQL query syntax without executing it
   */
  async validateQuery(jql: string): Promise<boolean> {
    // Check for empty query
    if (!jql || jql.trim().length === 0) {
      return false;
    }

    try {
      // Use Jira's validation endpoint
      await this.jiraClient.searchIssues({
        jql,
        maxResults: 0,
        validateQuery: true
      });
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Executes a JQL query with pagination support
   */
  async executeQuery(options: JQLQueryOptions): Promise<JQLQueryResult> {
    const {
      jql,
      maxResults,
      batchSize,
      fields = DEFAULT_FIELDS,
      onProgress,
      enableRetry = false,
      signal
    } = options;

    // Validate inputs
    if (!jql || jql.trim().length === 0) {
      throw new Error('JQL query cannot be empty');
    }

    const result: JQLQueryResult = {
      issues: [],
      total: 0,
      truncated: false,
      errors: []
    };

    let startAt = 0;
    let hasMore = true;
    let firstRequest = true;
    let totalIssues = 0;

    // Don't report initial progress until we know the total

    while (hasMore && result.issues.length < maxResults) {
      // Check for cancellation
      if (signal?.aborted) {
        throw new Error('Request aborted');
      }

      try {
        // Calculate batch size for this request
        const remainingCapacity = maxResults - result.issues.length;
        const currentBatchSize = Math.min(batchSize, remainingCapacity);

        // Execute the search request
        const response = await this.executeSearchWithRetry({
          jql,
          startAt,
          maxResults: currentBatchSize,
          fields,
          enableRetry
        });

        // Process the response
        if (firstRequest) {
          result.total = response.total;
          totalIssues = response.total;
          firstRequest = false;
          // Report initial progress now that we know the total
          this.reportProgress(onProgress, 0, totalIssues, 'searching');
        }

        // Only add issues up to maxResults
        const issuesToAdd = response.issues.slice(0, remainingCapacity);
        result.issues.push(...issuesToAdd);
        
        // Report progress
        this.reportProgress(
          onProgress, 
          result.issues.length, 
          result.total,
          result.issues.length < result.total && result.issues.length < maxResults ? 'downloading' : 'complete'
        );

        // Check if there are more results
        startAt += response.issues.length;
        hasMore = startAt < response.total && result.issues.length < maxResults;

        // Mark as truncated if we hit the maxResults limit
        if (startAt < response.total && result.issues.length >= maxResults) {
          result.truncated = true;
        }

      } catch (error) {
        // Handle specific error types
        if (this.isRetryableError(error) && enableRetry) {
          // Will be retried in executeSearchWithRetry
          throw error;
        } else {
          // Non-retryable error
          throw error;
        }
      }
    }

    // Final progress report
    this.reportProgress(onProgress, result.issues.length, result.total, 'complete');

    return result;
  }

  /**
   * Executes a search request with optional retry logic
   */
  private async executeSearchWithRetry(params: {
    jql: string;
    startAt: number;
    maxResults: number;
    fields: string[];
    enableRetry: boolean;
  }): Promise<any> {
    const { jql, startAt, maxResults, fields, enableRetry } = params;
    let lastError: any;
    const maxAttempts = enableRetry ? 3 : 1;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await this.jiraClient.searchIssues({
          jql,
          startAt,
          maxResults,
          fields
        });
      } catch (error: any) {
        lastError = error;

        // Check if error is retryable
        if (!this.isRetryableError(error) || attempt === maxAttempts) {
          throw error;
        }

        // Calculate delay for retry
        const delay = this.calculateRetryDelay(error, attempt);
        await this.sleep(delay);
      }
    }

    throw lastError;
  }

  /**
   * Determines if an error is retryable
   */
  private isRetryableError(error: any): boolean {
    if (!error) return false;
    
    // Rate limiting errors
    if (error.status === 429) return true;
    
    // Server errors
    if (error.status >= 500 && error.status < 600) return true;
    
    // Network errors
    if (error.message && error.message.includes('Network')) return true;
    
    return false;
  }

  /**
   * Calculates the delay before retrying a request
   */
  private calculateRetryDelay(error: any, attempt: number): number {
    // If the error includes a retry-after header, use it
    if (error.retryAfter) {
      return error.retryAfter * 1000;
    }

    // Otherwise, use exponential backoff with jitter
    const baseDelay = 1000; // 1 second
    const maxDelay = 30000; // 30 seconds
    const exponentialDelay = baseDelay * Math.pow(2, attempt - 1);
    const jitter = Math.random() * 1000; // 0-1 second jitter
    
    return Math.min(exponentialDelay + jitter, maxDelay);
  }

  /**
   * Reports progress to the callback if provided
   */
  private reportProgress(
    callback: ((current: number, total: number, phase: QueryPhase) => void) | undefined,
    current: number,
    total: number,
    phase: QueryPhase
  ): void {
    if (!callback) return;

    try {
      callback(current, total, phase);
    } catch (error) {
      // Swallow callback errors to prevent them from breaking the query
      console.error('Progress callback error:', error);
    }
  }

  /**
   * Sleep utility for retry delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}