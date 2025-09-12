/**
 * Jira Worklog API Client
 * 
 * Handles pushing time entries to Jira using the REST API v3.
 * Supports authentication, validation, and error handling.
 */

import { Notice } from 'obsidian';
import { formatTimeForJira, parseTimeString } from './time-parser';

/**
 * Jira worklog API settings
 */
export interface JiraWorklogSettings {
  jiraUrl: string;
  jiraUsername: string;
  jiraApiToken: string;
  confirmBeforePush?: boolean;
  roundToMinutes?: number;
}

/**
 * Time entry to push to Jira
 */
export interface TimeEntry {
  time: string;          // Human-readable time (e.g., "2h30m")
  seconds: number;       // Time in seconds  
  description: string;   // Work description
  startTime?: Date;      // When work started (optional)
  line?: number;         // Line number in file (for tracking)
}

/**
 * Jira worklog response
 */
export interface JiraWorklogResponse {
  id: string;
  author: {
    displayName: string;
    emailAddress: string;
  };
  timeSpentSeconds: number;
  comment: string;
  started: string;
  created: string;
}

/**
 * Push result for a single time entry
 */
export interface PushResult {
  success: boolean;
  entry: TimeEntry;
  jiraResponse?: JiraWorklogResponse;
  error?: string;
}

/**
 * Bulk push result
 */
export interface BulkPushResult {
  ticketKey: string;
  totalEntries: number;
  successCount: number;
  failureCount: number;
  results: PushResult[];
  totalTimeSeconds: number;
}

/**
 * Jira worklog API client
 */
export class JiraWorklogClient {
  private settings: JiraWorklogSettings;

  constructor(settings: JiraWorklogSettings) {
    this.settings = settings;
  }

  /**
   * Update client settings
   */
  updateSettings(settings: JiraWorklogSettings): void {
    this.settings = settings;
  }

  /**
   * Push a single time entry to Jira
   */
  async pushTimeEntry(
    ticketKey: string,
    entry: TimeEntry,
    startTime?: Date
  ): Promise<PushResult> {
    try {
      // Validate settings
      const validation = this.validateSettings();
      if (!validation.valid) {
        return {
          success: false,
          entry,
          error: `Invalid settings: ${validation.errors.join(', ')}`
        };
      }

      // Validate ticket key
      if (!this.isValidTicketKey(ticketKey)) {
        return {
          success: false,
          entry,
          error: 'Invalid ticket key format'
        };
      }

      // Calculate time in minutes for Jira
      const timeSpentMinutes = formatTimeForJira(entry.seconds, this.settings.roundToMinutes);
      
      if (timeSpentMinutes <= 0) {
        return {
          success: false,
          entry,
          error: 'Time entry too short to log'
        };
      }

      // Prepare worklog data
      const worklogData = {
        timeSpentSeconds: timeSpentMinutes * 60, // Convert back to seconds for API
        comment: entry.description || 'Time logged via Obsidian',
        started: this.formatStartTime(startTime)
      };

      // Make API request
      const response = await this.makeJiraRequest(
        `issue/${ticketKey}/worklog`,
        'POST',
        worklogData
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const jiraResponse: JiraWorklogResponse = await response.json();

      return {
        success: true,
        entry,
        jiraResponse
      };

    } catch (error: any) {
      console.error(`Failed to push time entry for ${ticketKey}:`, error);
      
      return {
        success: false,
        entry,
        error: this.formatError(error)
      };
    }
  }

  /**
   * Push multiple time entries for a ticket
   */
  async pushTimeEntries(
    ticketKey: string,
    entries: TimeEntry[]
  ): Promise<BulkPushResult> {
    const results: PushResult[] = [];
    let successCount = 0;
    let totalTimeSeconds = 0;

    // Show progress notice for multiple entries
    if (entries.length > 1) {
      new Notice(`Pushing ${entries.length} time entries to ${ticketKey}...`);
    }

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      const result = await this.pushTimeEntry(ticketKey, entry, entry.startTime);
      
      results.push(result);
      
      if (result.success) {
        successCount++;
        totalTimeSeconds += entry.seconds;
      }

      // Small delay between requests to be nice to Jira API
      if (i < entries.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 250));
      }
    }

    const bulkResult: BulkPushResult = {
      ticketKey,
      totalEntries: entries.length,
      successCount,
      failureCount: entries.length - successCount,
      results,
      totalTimeSeconds
    };

    // Show completion notice
    this.showBulkPushNotice(bulkResult);

    return bulkResult;
  }

  /**
   * Test connection to Jira worklog API
   */
  async testConnection(testTicketKey?: string): Promise<{
    success: boolean;
    message: string;
    details?: any;
  }> {
    try {
      // Validate settings first
      const validation = this.validateSettings();
      if (!validation.valid) {
        return {
          success: false,
          message: `Invalid settings: ${validation.errors.join(', ')}`
        };
      }

      // If test ticket provided, try to get its worklogs
      if (testTicketKey && this.isValidTicketKey(testTicketKey)) {
        const response = await this.makeJiraRequest(
          `issue/${testTicketKey}/worklog`,
          'GET'
        );

        if (response.ok) {
          const data = await response.json();
          return {
            success: true,
            message: `Connection successful! Found ${data.worklogs?.length || 0} existing worklogs for ${testTicketKey}`,
            details: data
          };
        } else {
          const errorText = await response.text();
          return {
            success: false,
            message: `Failed to access ticket ${testTicketKey}: ${response.status} ${errorText}`
          };
        }
      } else {
        // Just test basic authentication with user info
        const response = await this.makeJiraRequest('myself', 'GET');
        
        if (response.ok) {
          const userData = await response.json();
          return {
            success: true,
            message: `Connection successful! Authenticated as ${userData.displayName}`,
            details: userData
          };
        } else {
          const errorText = await response.text();
          return {
            success: false,
            message: `Authentication failed: ${response.status} ${errorText}`
          };
        }
      }

    } catch (error: any) {
      console.error('Jira connection test failed:', error);
      return {
        success: false,
        message: `Connection failed: ${this.formatError(error)}`
      };
    }
  }

  /**
   * Get existing worklogs for a ticket
   */
  async getWorklogs(ticketKey: string): Promise<{
    success: boolean;
    worklogs?: JiraWorklogResponse[];
    error?: string;
  }> {
    try {
      if (!this.isValidTicketKey(ticketKey)) {
        return {
          success: false,
          error: 'Invalid ticket key format'
        };
      }

      const response = await this.makeJiraRequest(
        `issue/${ticketKey}/worklog`,
        'GET'
      );

      if (!response.ok) {
        const errorText = await response.text();
        return {
          success: false,
          error: `HTTP ${response.status}: ${errorText}`
        };
      }

      const data = await response.json();
      
      return {
        success: true,
        worklogs: data.worklogs || []
      };

    } catch (error: any) {
      console.error(`Failed to get worklogs for ${ticketKey}:`, error);
      return {
        success: false,
        error: this.formatError(error)
      };
    }
  }

  /**
   * Make authenticated request to Jira API
   */
  private async makeJiraRequest(
    endpoint: string,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
    body?: any
  ): Promise<Response> {
    const url = `${this.settings.jiraUrl.replace(/\/$/, '')}/rest/api/3/${endpoint}`;
    
    // Create basic auth header
    const auth = btoa(`${this.settings.jiraUsername}:${this.settings.jiraApiToken}`);
    
    const headers: Record<string, string> = {
      'Authorization': `Basic ${auth}`,
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    };

    const requestOptions: RequestInit = {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined
    };

    return fetch(url, requestOptions);
  }

  /**
   * Validate Jira worklog settings
   */
  private validateSettings(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!this.settings.jiraUrl) {
      errors.push('Jira URL is required');
    } else {
      try {
        new URL(this.settings.jiraUrl);
      } catch {
        errors.push('Invalid Jira URL format');
      }
    }

    if (!this.settings.jiraUsername) {
      errors.push('Jira username is required');
    }

    if (!this.settings.jiraApiToken) {
      errors.push('Jira API token is required');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate ticket key format
   */
  private isValidTicketKey(ticketKey: string): boolean {
    // Jira ticket keys are typically PROJECT-NUMBER (e.g., PROJ-123)
    return /^[A-Z]+[A-Z0-9]*-\d+$/i.test(ticketKey);
  }

  /**
   * Format start time for Jira API
   */
  private formatStartTime(startTime?: Date): string {
    const date = startTime || new Date();
    
    // Jira expects ISO format with timezone offset
    // Example: "2023-01-15T10:30:00.000+0000"
    return date.toISOString().replace('Z', '+0000');
  }

  /**
   * Format error message for user display
   */
  private formatError(error: any): string {
    if (error.message) {
      // Common Jira API errors
      if (error.message.includes('401')) {
        return 'Authentication failed. Check your API token.';
      }
      if (error.message.includes('403')) {
        return 'Permission denied. Check your Jira access rights.';
      }
      if (error.message.includes('404')) {
        return 'Ticket not found or you do not have access to it.';
      }
      if (error.message.includes('400')) {
        return 'Invalid request. Check the ticket key and time format.';
      }
      
      return error.message;
    }
    
    return 'Unknown error occurred';
  }

  /**
   * Show bulk push result notice
   */
  private showBulkPushNotice(result: BulkPushResult): void {
    const { ticketKey, successCount, failureCount, totalTimeSeconds } = result;
    const totalTime = Math.round(totalTimeSeconds / 60); // Convert to minutes
    
    if (failureCount === 0) {
      new Notice(
        `✅ ${ticketKey}: Pushed ${successCount} time entries (${totalTime}m total)`,
        4000
      );
    } else if (successCount === 0) {
      new Notice(
        `❌ ${ticketKey}: Failed to push all time entries`,
        5000
      );
    } else {
      new Notice(
        `⚠️ ${ticketKey}: Pushed ${successCount}/${successCount + failureCount} entries (${totalTime}m)`,
        5000
      );
    }
  }
}

/**
 * Create time entries from markdown text
 */
export function extractTimeEntriesFromMarkdown(
  content: string,
  excludePushed: boolean = true
): TimeEntry[] {
  const entries: TimeEntry[] = [];
  const lines = content.split('\n');
  
  // Find time log section
  let inTimeLogSection = false;
  let lineNumber = 0;
  
  for (const line of lines) {
    lineNumber++;
    
    // Check if entering time log section
    if (line.includes('⏱️ Time Log') || line.includes('Time Log')) {
      inTimeLogSection = true;
      continue;
    }
    
    // Check if leaving time log section (another heading)
    if (inTimeLogSection && line.startsWith('##') && !line.includes('Time Log')) {
      break;
    }
    
    // Parse time entries in the section
    if (inTimeLogSection) {
      const match = line.match(/^[\s\-\*]*\s*([0-9]+(?:\.[0-9]+)?[hms\s]*[0-9]*[hms]*)\s*:\s*(.+?)(\[.*\])?$/i);
      
      if (match) {
        const timeString = match[1].trim();
        const description = match[2].trim();
        const statusTag = match[3] || '';
        
        // Skip if already pushed and we want to exclude pushed entries
        if (excludePushed && statusTag.includes('✓ Pushed')) {
          continue;
        }
        
        const seconds = parseTimeString(timeString);
        if (seconds > 0) {
          entries.push({
            time: timeString,
            seconds,
            description,
            line: lineNumber
          });
        }
      }
    }
  }
  
  return entries;
}

/**
 * Mark time entry as pushed in markdown content
 */
export function markEntryAsPushed(content: string, lineNumber: number): string {
  const lines = content.split('\n');
  
  if (lineNumber > 0 && lineNumber <= lines.length) {
    const line = lines[lineNumber - 1];
    
    // Only add pushed marker if not already present
    if (!line.includes('[✓ Pushed]')) {
      lines[lineNumber - 1] = line + ' [✓ Pushed]';
    }
  }
  
  return lines.join('\n');
}

/**
 * Create a confirmation message for time entries
 */
export function createConfirmationMessage(
  ticketKey: string,
  entries: TimeEntry[]
): string {
  const totalSeconds = entries.reduce((sum, entry) => sum + entry.seconds, 0);
  const totalMinutes = Math.round(totalSeconds / 60);
  
  let message = `Push ${entries.length} time entries to ${ticketKey}?\n\n`;
  message += `Total time: ${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m\n\n`;
  message += 'Entries:\n';
  
  entries.forEach((entry, index) => {
    const minutes = Math.round(entry.seconds / 60);
    message += `${index + 1}. ${minutes}m: ${entry.description}\n`;
  });
  
  return message;
}