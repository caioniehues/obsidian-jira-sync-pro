import { requestUrl, RequestUrlParam, RequestUrlResponse } from 'obsidian';

/**
 * Search parameters for Jira API
 */
export interface SearchParams {
  jql: string;
  startAt?: number;
  maxResults?: number;
  fields?: string[];
  expand?: string[];
  validateQuery?: boolean;
}

/**
 * Jira search response
 */
export interface SearchResponse {
  startAt: number;
  maxResults: number;
  total: number;
  issues: any[];
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
  
  /**
   * Initializes the Jira client with configuration
   */
  configure(config: JiraClientConfig): void {
    this.config = config;
  }

  /**
   * Searches for issues using JQL
   */
  async searchIssues(params: SearchParams): Promise<SearchResponse> {
    if (!this.config) {
      throw new Error('JiraClient not configured');
    }

    const {
      jql,
      startAt = 0,
      maxResults = 50,
      fields = [],
      expand = [],
      validateQuery = false
    } = params;

    // Build query parameters
    const queryParams = new URLSearchParams({
      jql,
      startAt: startAt.toString(),
      maxResults: maxResults.toString()
    });

    if (fields.length > 0) {
      queryParams.append('fields', fields.join(','));
    }

    if (expand.length > 0) {
      queryParams.append('expand', expand.join(','));
    }

    if (validateQuery) {
      queryParams.append('validateQuery', 'true');
    }

    // Prepare request
    const url = `${this.config.baseUrl}/rest/api/3/search/jql?${queryParams.toString()}`;
    const headers = this.getAuthHeaders();

    try {
      // Execute request using Obsidian's requestUrl
      const response = await requestUrl({
        url,
        method: 'GET',
        headers,
        throw: false
      });

      // Handle response
      if (response.status >= 200 && response.status < 300) {
        return response.json;
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
      if (response.json && response.json.errorMessages) {
        error.message = response.json.errorMessages.join(', ');
      } else if (response.json && response.json.errors) {
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