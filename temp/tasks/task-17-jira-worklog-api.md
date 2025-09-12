# STM Task 17: Jira Worklog API Integration

## Task Definition
Implement push to Jira functionality using REST API v3 with authentication and error handling

## Size: Medium
## Priority: High
## Dependencies: Task 16 (Time parser)

## Implementation

```typescript
// src/time/jira-worklog-client.ts
export class JiraWorklogClient {
  constructor(private settings: JiraWorklogSettings) {}

  async pushTimeEntry(ticketKey: string, entry: TimeEntry, startTime?: Date): Promise<PushResult> {
    try {
      // Validate settings and ticket key
      const validation = this.validateSettings();
      if (!validation.valid) {
        return { success: false, entry, error: validation.errors.join(', ') };
      }

      // Calculate time in minutes for Jira
      const timeSpentMinutes = formatTimeForJira(entry.seconds, this.settings.roundToMinutes);
      
      if (timeSpentMinutes <= 0) {
        return { success: false, entry, error: 'Time entry too short to log' };
      }

      // Prepare worklog data
      const worklogData = {
        timeSpentSeconds: timeSpentMinutes * 60,
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
      return { success: true, entry, jiraResponse };

    } catch (error: any) {
      return { success: false, entry, error: this.formatError(error) };
    }
  }

  async pushTimeEntries(ticketKey: string, entries: TimeEntry[]): Promise<BulkPushResult> {
    const results: PushResult[] = [];
    let successCount = 0;
    let totalTimeSeconds = 0;

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      const result = await this.pushTimeEntry(ticketKey, entry, entry.startTime);
      
      results.push(result);
      if (result.success) {
        successCount++;
        totalTimeSeconds += entry.seconds;
      }

      // Small delay between requests
      if (i < entries.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 250));
      }
    }

    return {
      ticketKey,
      totalEntries: entries.length,
      successCount,
      failureCount: entries.length - successCount,
      results,
      totalTimeSeconds
    };
  }

  private async makeJiraRequest(endpoint: string, method = 'GET', body?: any): Promise<Response> {
    const url = `${this.settings.jiraUrl.replace(/\/$/, '')}/rest/api/3/${endpoint}`;
    const auth = btoa(`${this.settings.jiraUsername}:${this.settings.jiraApiToken}`);
    
    return fetch(url, {
      method,
      headers: {
        'Authorization': `Basic ${auth}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      body: body ? JSON.stringify(body) : undefined
    });
  }
}

// Helper functions
export function extractTimeEntriesFromMarkdown(content: string): TimeEntry[] {
  // Finds entries in "## ⏱️ Time Log" section
  // Format: "- 2h30m: Description"
  // Excludes entries marked "[✓ Pushed]"
}

export function markEntryAsPushed(content: string, lineNumber: number): string {
  // Adds "[✓ Pushed]" marker to time entry
}
```

## Commands Added
- `Push time entries to Jira` - Push unpushed entries from current ticket
- `Test Jira worklog connection` - Verify API connectivity

## Acceptance Criteria
- [x] Successfully posts to Jira REST API v3
- [x] Handles Basic authentication correctly
- [x] Shows success/failure notifications
- [x] Handles errors gracefully with user-friendly messages
- [x] Confirmation dialogs when enabled (manual control)
- [x] Marks successful entries as "[✓ Pushed]"
- [x] Bulk push with progress feedback

## Status: ✅ COMPLETED