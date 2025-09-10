import { requestUrl, RequestUrlParam, RequestUrlResponse } from 'obsidian';

/**
 * Token bucket rate limiter for API requests
 */
class TokenBucket {
  private tokens: number;
  private lastRefill: number;
  
  constructor(
    private maxTokens: number,
    private refillRate: number // tokens per millisecond
  ) {
    this.tokens = maxTokens;
    this.lastRefill = Date.now();
  }
  
  /**
   * Attempts to consume tokens from the bucket
   * Returns true if successful, false if not enough tokens
   */
  tryConsume(tokensToConsume: number = 1): boolean {
    this.refill();
    
    if (this.tokens >= tokensToConsume) {
      this.tokens -= tokensToConsume;
      return true;
    }
    
    return false;
  }
  
  /**
   * Gets the time to wait before the next token is available
   */
  getWaitTime(): number {
    this.refill();
    if (this.tokens >= 1) return 0;
    
    return Math.ceil((1 - this.tokens) / this.refillRate);
  }
  
  private refill(): void {
    const now = Date.now();
    const timePassed = now - this.lastRefill;
    const tokensToAdd = timePassed * this.refillRate;
    
    this.tokens = Math.min(this.maxTokens, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }
}

/**
 * Search parameters for Jira API
 * Updated for new /rest/api/3/search/jql endpoint with token-based pagination
 */
export interface SearchParams {
  jql: string;
  startAt?: number; // DEPRECATED: Use nextPageToken for new API
  maxResults?: number;
  fields?: string[];
  expand?: string[];
  validateQuery?: boolean;
  // NEW: Token-based pagination
  nextPageToken?: string;
}

/**
 * Jira search response
 * Updated for new /rest/api/3/search/jql endpoint with token-based pagination
 */
export interface SearchResponse {
  startAt: number; // Always 0 in new API
  maxResults: number;
  total: number;
  issues: any[];
  // NEW: Token-based pagination
  nextPageToken?: string;
  isLast?: boolean; // Indicates if this is the last page
}

/**
 * Jira API client configuration
 */
export interface JiraClientConfig {
  baseUrl: string;
  email: string;
  apiToken: string;
}

/**
 * Jira API client for REST API v3 interactions
 */
export class JiraClient {
  private config: JiraClientConfig | null = null;
  private rateLimiter: TokenBucket;
  
  constructor() {
    // Rate limit: 20 requests per minute (60000ms) = 1 request per 3000ms
    // Allow burst of 5 requests, but be conservative with new API
    this.rateLimiter = new TokenBucket(3, 1 / 3000); // 1 token per 3 seconds, reduced burst
  }
  
  /**
   * Initializes the Jira client with configuration
   */
  configure(config: JiraClientConfig): void {
    this.config = config;
  }

  /**
   * Searches for issues using JQL with new API endpoint and token-based pagination
   */
  async searchIssues(params: SearchParams): Promise<SearchResponse> {
    if (!this.config) {
      throw new Error('JiraClient not configured');
    }

    // Rate limiting
    await this.waitForRateLimit();

    const {
      jql,
      startAt = 0, // DEPRECATED: kept for backwards compatibility
      maxResults = 50,
      fields = [],
      expand = [],
      validateQuery = false,
      nextPageToken // NEW: Token-based pagination
    } = params;

    // For validation queries, use minimal maxResults
    const actualMaxResults = validateQuery ? 1 : maxResults;

    // Build request body for POST request (NEW API CONTRACT)
    const requestBody: any = {
      jql,
      maxResults: actualMaxResults
    };

    // Only include fields if specified and not empty
    if (fields && fields.length > 0) {
      requestBody.fields = fields;
    }

    if (expand && expand.length > 0) {
      requestBody.expand = expand;
    }

    if (validateQuery) {
      requestBody.validateQuery = validateQuery;
    }

    // NEW: Token-based pagination
    if (nextPageToken) {
      requestBody.nextPageToken = nextPageToken;
    }

    // NEW: Use POST method with /search/jql endpoint
    const url = `${this.config.baseUrl}/rest/api/3/search/jql`;
    const headers = this.getAuthHeaders();

    try {
      // Execute request using POST method (NEW API CONTRACT)
      const response = await requestUrl({
        url,
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody),
        throw: false
      });

      // Handle response
      if (response.status >= 200 && response.status < 300) {
        const result = response.json;
        
        // NEW: Always set startAt to 0 for new API compatibility
        result.startAt = 0;
        
        // NEW: Add isLast property based on nextPageToken presence
        if (result.nextPageToken === undefined) {
          result.isLast = true;
        }
        
        return result;
      } else {
        throw this.handleApiError(response);
      }
    } catch (error) {
      // Re-throw structured errors
      if (error.status) {
        throw error;
      }
      // Wrap network errors
      throw {
        status: 0,
        message: `Network request failed: ${error.message}`,
        originalError: error
      };
    }
  }

  /**
   * Wait for rate limit to allow next request
   */
  private async waitForRateLimit(): Promise<void> {
    while (!this.rateLimiter.tryConsume()) {
      const waitTime = this.rateLimiter.getWaitTime();
      if (waitTime > 0) {
        await this.sleep(waitTime);
      }
    }
  }

  /**
   * Sleep utility for rate limiting
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Gets the current user information
   */
  async getCurrentUser(): Promise<any> {
    if (!this.config) {
      throw new Error('JiraClient not configured');
    }

    const url = `${this.config.baseUrl}/rest/api/3/myself`;
    const headers = this.getAuthHeaders();

    const response = await requestUrl({
      url,
      method: 'GET',
      headers,
      throw: false
    });

    if (response.status >= 200 && response.status < 300) {
      return response.json;
    } else {
      throw this.handleApiError(response);
    }
  }

  /**
   * Gets available fields
   */
  async getFields(): Promise<any[]> {
    if (!this.config) {
      throw new Error('JiraClient not configured');
    }

    const url = `${this.config.baseUrl}/rest/api/3/field`;
    const headers = this.getAuthHeaders();

    const response = await requestUrl({
      url,
      method: 'GET',
      headers,
      throw: false
    });

    if (response.status >= 200 && response.status < 300) {
      return response.json;
    } else {
      throw this.handleApiError(response);
    }
  }

  /**
   * Gets authentication headers for API requests
   */
  private getAuthHeaders(): Record<string, string> {
    if (!this.config) {
      throw new Error('JiraClient not configured');
    }

    // Basic auth with email and API token
    const auth = Buffer.from(`${this.config.email}:${this.config.apiToken}`).toString('base64');
    
    return {
      'Authorization': `Basic ${auth}`,
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    };
  }

  /**
   * Handles API error responses
   */
  private handleApiError(response: RequestUrlResponse): any {
    const error: any = new Error(this.getErrorMessage(response));
    error.status = response.status;
    
    // Add rate limit information if available
    if (response.status === 429) {
      const retryAfter = response.headers['retry-after'] || response.headers['x-ratelimit-reset'];
      if (retryAfter) {
        error.retryAfter = parseInt(retryAfter);
      }
    }

    // Try to extract error details from response body
    try {
      if (response.json && response.json.errorMessages && response.json.errorMessages.length > 0) {
        error.message = response.json.errorMessages.join(', ');
      } else if (response.json && response.json.errors && Object.keys(response.json.errors).length > 0) {
        error.message = Object.values(response.json.errors).join(', ');
      }
    } catch (e) {
      // Use default error message
    }

    return error;
  }

  /**
   * Gets a user-friendly error message based on status code
   */
  private getErrorMessage(response: RequestUrlResponse): string {
    switch (response.status) {
      case 400:
        return 'Invalid JQL syntax or bad request';
      case 401:
        return 'Authentication required - check your credentials';
      case 403:
        return 'You do not have permission to view these issues';
      case 404:
        return 'Jira endpoint not found - check your base URL';
      case 429:
        return 'Rate limit exceeded - too many requests';
      case 500:
      case 502:
      case 503:
        return 'Jira server error - please try again later';
      default:
        return `Jira API error (${response.status})`;
    }
  }
}