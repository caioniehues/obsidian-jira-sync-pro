import { JiraClient } from '../jira-bases-adapter/jira-client';

/**
 * Configuration options for executing a JQL query
 * Updated for token-based pagination support
 */
export interface JQLQueryOptions {
  jql: string;
  maxResults: number;
  batchSize: number;
  fields?: string[];
  onProgress?: (current: number, total: number, phase: QueryPhase) => void;
  enableRetry?: boolean;
  signal?: AbortSignal;
  // NEW: Token-based pagination support
  nextPageToken?: string;
  pageToken?: string; // Alternative name for nextPageToken (for test compatibility)
}

/**
 * Result of a JQL query execution
 * Updated for token-based pagination support
 */
export interface JQLQueryResult {
  issues: JiraIssue[];
  total: number;
  truncated?: boolean;
  errors?: QueryError[];
  // NEW: Token-based pagination
  nextPageToken?: string;
  isLast?: boolean;
  executionTime?: number;
}

/**
 * Represents a Jira issue
 */
export interface JiraIssue {
  key: string;
  id?: string; // NEW: Added id field for new API response
  self?: string; // NEW: Added self field for new API response
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
    reporter?: any;
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
 * Result of JQL query validation
 */
export interface JQLValidationResult {
  isValid: boolean;
  errorMessage?: string | null;
  estimatedCount?: number;
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
   * Validates a JQL query syntax and returns validation result
   */
  async validateQuery(jql: string): Promise<boolean> {
    // Check for empty query
    if (!jql || jql.trim().length === 0) {
      return false;
    }

    try {
      // Use Jira's validation endpoint with minimal results to test syntax
      await this.jiraClient.searchIssues({
        jql,
        maxResults: 0, // No results needed for validation
        validateQuery: true
      });
      
      return true;
    } catch (error: any) {
      return false;
    }
  }

  /**
   * Executes a JQL query with token-based pagination support
   */
  async executeQuery(options: JQLQueryOptions): Promise<JQLQueryResult> {
    const startTime = Date.now();
    const {
      jql,
      maxResults,
      batchSize,
      fields = DEFAULT_FIELDS,
      onProgress,
      enableRetry = false,
      signal,
      nextPageToken, // NEW: Token-based pagination
      pageToken // Alternative name for nextPageToken (for test compatibility)
    } = options;

    // Validate inputs
    if (!jql || jql.trim().length === 0) {
      throw new Error('JQL query cannot be empty');
    }
    
    if (maxResults <= 0) {
      throw new Error('maxResults must be greater than 0');
    }
    
    if (batchSize <= 0) {
      throw new Error('batchSize must be greater than 0');
    }

    const result: JQLQueryResult = {
      issues: [],
      total: 0,
      truncated: false,
      errors: []
    };

    let currentPageToken = nextPageToken || pageToken; // NEW: Use token instead of startAt
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

        // Execute the search request with token-based pagination
        const response = await this.executeSearchWithRetry({
          jql,
          maxResults: currentBatchSize,
          fields,
          enableRetry,
          nextPageToken: currentPageToken // NEW: Token-based pagination
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

        // NEW: Token-based pagination logic
        currentPageToken = response.nextPageToken;
        hasMore = response.nextPageToken !== undefined && result.issues.length < maxResults;

        // Store pagination info in result
        result.nextPageToken = response.nextPageToken;
        result.isLast = response.nextPageToken === undefined || result.issues.length >= maxResults;

        // Mark as truncated if we hit the maxResults limit
        if (response.nextPageToken && result.issues.length >= maxResults) {
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

    // Final progress report and execution time
    this.reportProgress(onProgress, result.issues.length, result.total, 'complete');
    result.executionTime = Date.now() - startTime;

    return result;
  }

  /**
   * Executes a search request with optional retry logic and token-based pagination
   */
  private async executeSearchWithRetry(params: {
    jql: string;
    maxResults: number;
    fields: string[];
    enableRetry: boolean;
    nextPageToken?: string; // NEW: Token-based pagination
  }): Promise<any> {
    const { jql, maxResults, fields, enableRetry, nextPageToken } = params;
    let lastError: any;
    const maxAttempts = enableRetry ? 3 : 1;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await this.jiraClient.searchIssues({
          jql,
          maxResults,
          fields,
          nextPageToken // NEW: Token-based pagination
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