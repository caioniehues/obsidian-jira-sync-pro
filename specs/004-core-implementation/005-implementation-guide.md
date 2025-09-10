# Technical Implementation Guide: Permission and Validation Fixes

## Quick Start Implementation

This guide provides the exact code changes needed to fix the permission and validation errors.

## Priority 1: Immediate Fix for Permission Error

### Step 1: Update JiraClient Error Handling

**File**: `src/jira-bases-adapter/jira-client.ts`

Add detailed permission error handling:

```typescript
// Add new error class at the top of the file
export class JiraPermissionError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public originalResponse?: any,
    public suggestedAction?: string
  ) {
    super(message);
    this.name = 'JiraPermissionError';
  }
}

// Update handleApiError method (line ~293)
private handleApiError(response: RequestUrlResponse): any {
  // Special handling for 403 permission errors
  if (response.status === 403) {
    let detailedMessage = 'Permission denied';
    let suggestedAction = '';
    
    try {
      if (response.json?.errorMessages?.length > 0) {
        detailedMessage = response.json.errorMessages.join(', ');
      }
      
      // Check for specific permission patterns
      if (detailedMessage.includes('browse') || detailedMessage.includes('project')) {
        suggestedAction = 'Try adding: AND project in projectsWhereUserHasPermission("Browse Projects")';
      } else {
        suggestedAction = 'Contact your Jira administrator to verify your project permissions';
      }
    } catch (e) {
      // Use default message
    }
    
    throw new JiraPermissionError(
      detailedMessage,
      403,
      response.json,
      suggestedAction
    );
  }
  
  // Rest of existing error handling...
  const error: any = new Error(this.getErrorMessage(response));
  // ... existing code
}
```

### Step 2: Add Permission-Safe Query Wrapper

**File**: `src/enhanced-sync/jql-query-engine.ts`

Add permission filtering to queries:

```typescript
// Add after imports
const PERMISSION_SAFE_JQL_SUFFIX = ' AND project in projectsWhereUserHasPermission("Browse Projects")';

// Add new method to JQLQueryEngine class
private makeQueryPermissionSafe(jql: string): string {
  // Don't add if already has permission filter
  if (jql.includes('projectsWhereUserHasPermission')) {
    return jql;
  }
  
  // Add permission filter to ensure we only get accessible issues
  return `(${jql})${PERMISSION_SAFE_JQL_SUFFIX}`;
}

// Update executeQuery method (around line 131)
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
    nextPageToken,
  } = options;
  
  // Make query permission-safe
  const safeJql = this.makeQueryPermissionSafe(jql);
  
  try {
    // Use safeJql instead of jql
    const result = await this.executeSearchWithRetry({
      jql: safeJql,  // Changed from jql to safeJql
      maxResults,
      fields,
      onProgress,
      signal,
      nextPageToken,
    }, enableRetry);
    
    return result;
  } catch (error: any) {
    // Handle permission errors gracefully
    if (error.name === 'JiraPermissionError') {
      console.warn('Permission error detected, query may need refinement:', error.suggestedAction);
      
      // Return empty result with warning
      return {
        issues: [],
        total: 0,
        errors: [`Permission error: ${error.message}. ${error.suggestedAction || ''}`],
        duration: Date.now() - startTime
      };
    }
    throw error;
  }
}
```

### Step 3: Fix Validation to Check Permissions

**File**: `src/settings/jql-auto-sync-settings.ts`

Update the validation to properly check permissions:

```typescript
// Update validateJQLQuery method (around line 614)
public async validateJQLQuery(query: string): Promise<JQLValidationResult> {
  const result: JQLValidationResult = {
    isValid: false,
    syntaxValid: false,
    connectionValid: false,
    queryExecutable: false,
    errors: [],
    warnings: []
  };
  
  if (!query || !query.trim()) {
    result.errors.push('JQL query cannot be empty');
    return result;
  }
  
  // Basic syntax validation
  result.syntaxValid = this.validateJQLSyntax(query);
  if (!result.syntaxValid) {
    result.errors.push('Invalid JQL syntax');
    return result;
  }
  
  // Test execution with permission safety
  if (this.queryEngine) {
    try {
      // First test with permission filter
      const safeQuery = `(${query}) AND project in projectsWhereUserHasPermission("Browse Projects")`;
      const isValid = await this.queryEngine.validateQuery(safeQuery);
      
      result.connectionValid = true;
      result.queryExecutable = isValid;
      
      if (!isValid) {
        result.errors.push('JQL query cannot be executed. You may not have access to the specified projects.');
        result.warnings.push('Tip: The query will automatically filter to only show issues you have permission to view.');
      } else {
        // Test without filter to see if there's a difference
        try {
          await this.queryEngine.validateQuery(query);
        } catch (permError: any) {
          if (permError.status === 403) {
            result.warnings.push('Some issues may be filtered due to permissions. This is normal and sync will continue with accessible issues.');
          }
        }
      }
    } catch (error: any) {
      if (error.status === 403) {
        result.errors.push('Permission denied. Please verify your Jira project access.');
        result.warnings.push(error.suggestedAction || 'Contact your Jira administrator for project access.');
      } else {
        result.errors.push(`Query validation failed: ${error.message}`);
      }
    }
  }
  
  result.isValid = result.syntaxValid && 
                   (result.queryExecutable || !this.queryEngine);
  
  return result;
}

// Update testConnection method (around line 662)
public async testConnection(): Promise<boolean> {
  if (!this.connectionTestButton) return false;
  
  const validation = this.validateSettings(this.settings);
  
  // Don't block on validation errors if they're just warnings
  const hasBlockingErrors = validation.errors.filter(e => 
    !e.includes('JQL query') // Allow JQL issues to be tested
  ).length > 0;
  
  if (hasBlockingErrors) {
    new Notice('❌ Please fix configuration errors first');
    return false;
  }
  
  if (!this.queryEngine) {
    new Notice('❌ Query engine not initialized');
    return false;
  }
  
  try {
    this.setButtonState(this.connectionTestButton, 'testing', 'Testing...', true);
    
    // Test with permission-safe query
    const safeQuery = `(${this.settings.jqlQuery}) AND project in projectsWhereUserHasPermission("Browse Projects")`;
    const isValid = await this.queryEngine.validateQuery(safeQuery);
    
    if (isValid) {
      this.setButtonState(this.connectionTestButton, 'success', '✅ Connected', false);
      new Notice('✅ Connection successful! Query will be filtered to accessible issues.');
      
      setTimeout(() => {
        this.setButtonState(this.connectionTestButton, 'default', 'Test Connection', false);
      }, 3000);
      
      return true;
    } else {
      this.setButtonState(this.connectionTestButton, 'warning', '⚠️ Limited Access', false);
      new Notice('⚠️ Connection works but you may have limited project access');
      
      setTimeout(() => {
        this.setButtonState(this.connectionTestButton, 'default', 'Test Connection', false);
      }, 3000);
      
      return true; // Still return true as connection works
    }
  } catch (error: any) {
    if (error.status === 403) {
      this.setButtonState(this.connectionTestButton, 'warning', '⚠️ Permission Issue', false);
      new Notice(`⚠️ Connection works but permissions are limited. ${error.suggestedAction || ''}`);
      
      setTimeout(() => {
        this.setButtonState(this.connectionTestButton, 'default', 'Test Connection', false);
      }, 3000);
      
      return true; // Connection technically works, just permission limited
    }
    
    this.setButtonState(this.connectionTestButton, 'error', '❌ Failed', false);
    new Notice(`❌ Connection failed: ${error.message}`);
    
    setTimeout(() => {
      this.setButtonState(this.connectionTestButton, 'default', 'Test Connection', false);
    }, 3000);
    
    return false;
  }
}
```

### Step 4: Update Main Plugin Error Handling

**File**: `src/main.ts`

Update the performSync method to handle permission errors better:

```typescript
// Update performSync method (around line 287)
private async performSync(isManual: boolean) {
  if (!this.hasValidCredentials()) {
    new Notice('Jira Sync Pro: Please configure Jira settings first');
    return;
  }

  if (!this.queryEngine) {
    new Notice('Jira Sync Pro: Jira components not initialized. Check your settings.');
    return;
  }

  try {
    new Notice(`Jira Sync Pro: ${isManual ? 'Manual' : 'Auto'} sync started...`);
    
    // Create note service
    const noteService = new SimpleNoteService(
      this.app.vault,
      this.settings.syncFolder
    );
    
    // Statistics for sync
    let totalIssues = 0;
    let processedIssues = 0;
    let skippedIssues = 0;
    
    // Execute query with permission safety
    const result = await this.queryEngine.executeQuery({
      jql: this.settings.jqlQuery,
      maxResults: this.settings.maxResults || 100,
      batchSize: this.settings.batchSize || 50,
      fields: ['summary', 'status', 'assignee', 'priority', 'description', 'created', 'updated'],
      onProgress: (progress) => {
        if (progress.currentBatch > 0 && progress.currentBatch % 10 === 0) {
          new Notice(`Processing batch ${progress.currentBatch}/${progress.totalBatches}...`);
        }
      },
      enableRetry: true
    });
    
    totalIssues = result.issues.length;
    
    // Check if we got permission warnings
    if (result.errors && result.errors.length > 0) {
      const permissionErrors = result.errors.filter(e => e.includes('Permission'));
      if (permissionErrors.length > 0) {
        new Notice(`⚠️ Some issues were filtered due to permissions. Syncing ${totalIssues} accessible issues.`);
      }
    }
    
    // Process issues (existing code continues...)
    for (const issue of result.issues) {
      try {
        await noteService.upsertNote(issue);
        processedIssues++;
      } catch (error) {
        console.error(`Failed to process issue ${issue.key}:`, error);
        skippedIssues++;
      }
    }
    
    // Update sync state
    await this.updateSyncState(true, totalIssues);
    
    // Show completion notice with details
    if (skippedIssues > 0) {
      new Notice(`Jira Sync Pro: Sync completed with warnings. Processed ${processedIssues}/${totalIssues} issues (${skippedIssues} skipped)`);
    } else if (totalIssues === 0) {
      new Notice('Jira Sync Pro: No accessible issues found. Check your JQL query and permissions.');
    } else {
      new Notice(`Jira Sync Pro: Successfully synced ${processedIssues} issues`);
    }
    
  } catch (error: any) {
    await this.updateSyncState(false);
    console.error('Sync failed:', error);
    
    // Provide more specific error messages
    if (error.name === 'JiraPermissionError') {
      new Notice(`Jira Sync Pro: Permission issue detected. ${error.suggestedAction || 'Please check your Jira project access.'}`);
      
      // Offer to add permission filter
      if (!this.settings.jqlQuery.includes('projectsWhereUserHasPermission')) {
        new Notice('Tip: We\'ll automatically filter to accessible issues on next sync.');
      }
    } else if (error.message?.includes('401')) {
      new Notice('Jira Sync Pro: Authentication failed. Please check your credentials.');
    } else if (error.message?.includes('403')) {
      new Notice('Jira Sync Pro: Permission denied. Check your Jira access rights.');
    } else {
      new Notice(`Jira Sync Pro: Sync failed - ${error.message || 'Unknown error'}`);
    }
  }
}
```

## Priority 2: Quick Configuration Fix

Add this to your data.json to immediately fix the issue:

```json
{
  "jiraUrl": "https://richemont.atlassian.net",
  "jiraUsername": "caio.niehues@richemont.com",
  "jiraApiToken": "ATATT3xFfGF0vyZjLpJhyvwXZsOyAlPxuIhu1tahLSxp1057pM0motcLspJm1vZMBha_rl00qi9uQXm1miOwvAycs31RITJ2j9ZhiEgbvMdNwCYzdn1W8Bna1A5RwfLC4T-Xe6Uat9KLphXLI_oAyvdEC-KPXVXM0dGniEXyQYASITUKno_zW7U=89D04C44",
  "jqlQuery": "assignee = currentUser() AND updated >= -7d AND project in projectsWhereUserHasPermission(\"Browse Projects\")",
  "syncInterval": 5,
  "autoSyncEnabled": true,
  "maxResults": 1000,
  "batchSize": 50,
  "syncFolder": "Areas/Work/Jira Tickets",
  "enforcePermissionFilter": true,
  "allowPartialSync": true
}
```

## Testing the Fix

1. **Test Permission Filter**:
   ```typescript
   // In browser console while plugin is loaded
   const query = "assignee = currentUser() AND updated >= -7d";
   const safeQuery = query + " AND project in projectsWhereUserHasPermission('Browse Projects')";
   console.log('Safe query:', safeQuery);
   ```

2. **Verify Connection Test**:
   - Open settings
   - Click "Test Connection"
   - Should show "✅ Connected" or "⚠️ Limited Access" instead of failing

3. **Run Manual Sync**:
   - Use command palette: "Jira Sync Pro: Sync now"
   - Should complete without permission errors
   - May show warning about filtered issues

## Rollback Instructions

If the fix causes issues, revert these changes:

1. Remove the permission filter from JQLQueryEngine
2. Restore original error handling in JiraClient
3. Remove permission checks from validation
4. Clear the `enforcePermissionFilter` setting from data.json

## Common Issues and Solutions

### Issue: "Still getting 403 errors"
**Solution**: The JQL query might be requesting fields you don't have access to. Simplify the fields array in executeQuery.

### Issue: "No issues returned after fix"
**Solution**: You might not have access to any projects. Contact your Jira admin to verify your permissions.

### Issue: "Validation says query is invalid"
**Solution**: The permission filter syntax might not be supported in your Jira version. Try without the filter but with specific project names.

## Monitoring Success

Check these indicators after implementation:

1. ✅ No 403 errors in console during sync
2. ✅ Connection test completes successfully
3. ✅ Sync completes with at least some issues
4. ✅ Clear messages about any filtered content
5. ✅ Settings validation provides helpful feedback

## Next Steps

After implementing the immediate fix:

1. Monitor for 24 hours to ensure stability
2. Collect user feedback on permission messages
3. Consider adding project picker UI for easier configuration
4. Implement permission caching for better performance
5. Add telemetry to understand common permission patterns