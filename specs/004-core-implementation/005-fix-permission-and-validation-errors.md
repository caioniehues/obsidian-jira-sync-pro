# Fix Permission and Validation Errors

**ID**: 005-fix-permission-and-validation-errors  
**Priority**: Critical  
**Type**: Bug Fix  
**Created**: 2025-09-10  
**Deadline**: Immediate (blocking sync functionality)

## Problem Statement

Two critical issues are preventing the Jira Sync Pro plugin from functioning correctly:

1. **Permission Error (403)**: Users encounter "You do not have permission to view these issues" error during sync, even when their credentials are valid and connection tests pass.
2. **Validation Not Working**: The settings validation doesn't properly validate JQL queries against user permissions, leading to false positives during validation.

### Current Behavior
- Connection test passes successfully
- JQL validation reports queries as valid
- Sync fails with 403 permission error
- No recovery mechanism or helpful guidance for users

### Root Causes Identified

1. **Permission Error**:
   - JQL query may return issues from projects the user doesn't have access to
   - The query `assignee = currentUser() AND updated >= -7d` might include issues from restricted projects
   - No permission pre-check before attempting to fetch issues
   - API error handling doesn't provide actionable recovery options

2. **Validation Issues**:
   - `validateQuery()` only checks syntax, not actual permissions
   - Connection test doesn't verify query executability with user permissions
   - No distinction between syntax validation and permission validation
   - Settings UI doesn't provide feedback on permission-related issues

## Requirements

### Functional Requirements

1. **Enhanced Permission Handling**
   - Detect permission errors early in the validation process
   - Provide specific feedback about which projects/issues are inaccessible
   - Offer automatic query refinement suggestions
   - Implement permission-aware query validation

2. **Improved Validation Process**
   - Separate syntax validation from permission validation
   - Add project access verification during connection test
   - Provide real-time feedback on query executability
   - Show estimated accessible vs. inaccessible issues

3. **Error Recovery Mechanisms**
   - Graceful degradation when some issues are inaccessible
   - Skip inaccessible issues and continue with accessible ones
   - Provide detailed error reporting with actionable steps
   - Add retry logic with filtered queries

4. **Enhanced User Experience**
   - Clear messaging about permission requirements
   - Guided query builder with permission awareness
   - Visual indicators for permission status
   - Helpful documentation and troubleshooting tips

### Non-Functional Requirements

1. **Performance**
   - Permission checks should not significantly slow down validation
   - Cached permission information for faster subsequent checks
   - Efficient filtering of inaccessible issues

2. **Reliability**
   - Robust error handling for various permission scenarios
   - Consistent behavior across different Jira configurations
   - Fallback mechanisms when permissions change

3. **Security**
   - No exposure of sensitive permission information
   - Secure handling of authentication failures
   - Proper cleanup of failed requests

## Technical Design

### 1. Permission-Aware Query Validation

```typescript
interface PermissionValidationResult {
  hasAccess: boolean;
  accessibleProjects: string[];
  inaccessibleProjects: string[];
  suggestedQuery?: string;
  warnings: string[];
}

class PermissionValidator {
  async validateQueryPermissions(jql: string): Promise<PermissionValidationResult> {
    // 1. Extract projects from JQL
    // 2. Check user permissions for each project
    // 3. Return detailed permission information
    // 4. Suggest refined query if needed
  }
  
  async getUserAccessibleProjects(): Promise<string[]> {
    // Query user's accessible projects
    // Cache results for performance
  }
  
  async refineQueryForPermissions(jql: string, accessibleProjects: string[]): string {
    // Add project restrictions to JQL
    // Return modified query that respects permissions
  }
}
```

### 2. Enhanced Error Handling

```typescript
class JiraPermissionError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public failedProjects?: string[],
    public suggestedAction?: string,
    public recoverableQuery?: string
  ) {
    super(message);
    this.name = 'JiraPermissionError';
  }
}

// In JiraClient.handleApiError()
private handleApiError(response: RequestUrlResponse): any {
  if (response.status === 403) {
    // Parse response for specific permission details
    const permissionDetails = this.parsePermissionError(response);
    
    throw new JiraPermissionError(
      'Permission denied for some issues',
      403,
      permissionDetails.failedProjects,
      'Try adding project restrictions to your JQL query',
      permissionDetails.suggestedQuery
    );
  }
  // ... existing error handling
}
```

### 3. Graceful Sync with Permission Filtering

```typescript
// In JQLQueryEngine.executeQuery()
async executeQuery(options: JQLQueryOptions): Promise<JQLQueryResult> {
  try {
    // Attempt normal query execution
    return await this.executeQueryInternal(options);
  } catch (error) {
    if (error instanceof JiraPermissionError && options.allowPartialResults) {
      // Retry with refined query
      const refinedOptions = {
        ...options,
        jql: error.recoverableQuery || this.addPermissionFilter(options.jql)
      };
      
      const result = await this.executeQueryInternal(refinedOptions);
      result.warnings = ['Some issues were filtered due to permission restrictions'];
      return result;
    }
    throw error;
  }
}

private addPermissionFilter(jql: string): string {
  // Add project restrictions based on cached permissions
  const accessibleProjects = this.getAccessibleProjectsFromCache();
  if (accessibleProjects.length > 0) {
    return `(${jql}) AND project IN (${accessibleProjects.join(',')})`;
  }
  return jql;
}
```

### 4. Improved Settings Validation UI

```typescript
// In JQLAutoSyncSettingsTab
private async validateJQLWithPermissions(query: string): Promise<void> {
  const syntaxResult = this.validateJQLSyntax(query);
  if (!syntaxResult.isValid) {
    this.showValidationError('Invalid JQL syntax', syntaxResult.errors);
    return;
  }
  
  // Test with minimal results to check permissions
  const permissionResult = await this.testQueryPermissions(query);
  if (!permissionResult.hasAccess) {
    this.showPermissionWarning(
      'Permission restrictions detected',
      permissionResult.inaccessibleProjects,
      permissionResult.suggestedQuery
    );
    
    // Offer to use suggested query
    if (permissionResult.suggestedQuery) {
      this.offerQueryRefinement(permissionResult.suggestedQuery);
    }
  }
  
  // Show success with details
  this.showValidationSuccess(
    `Query valid - Access to ${permissionResult.accessibleProjects.length} projects`
  );
}

private async testQueryPermissions(query: string): Promise<PermissionValidationResult> {
  try {
    // Test with maxResults=1 to check permissions quickly
    await this.queryEngine.executeQuery({
      jql: query,
      maxResults: 1,
      validateOnly: true
    });
    
    return {
      hasAccess: true,
      accessibleProjects: await this.getAccessibleProjects(),
      inaccessibleProjects: [],
      warnings: []
    };
  } catch (error) {
    if (error.status === 403) {
      return this.analyzePermissionError(error, query);
    }
    throw error;
  }
}
```

### 5. Configuration Updates

```typescript
// Add to JQLAutoSyncSettings interface
export interface JQLAutoSyncSettings {
  // ... existing fields
  
  // New permission-related settings
  enforcePermissionFilter: boolean; // Auto-add project filters
  allowPartialSync: boolean; // Continue sync despite some permission errors
  cachedAccessibleProjects?: string[]; // Cache of accessible projects
  lastPermissionCheck?: number; // Timestamp of last permission check
}

// Default settings update
export const DEFAULT_JQL_SETTINGS: JQLAutoSyncSettings = {
  // ... existing defaults
  enforcePermissionFilter: true,
  allowPartialSync: true,
  cachedAccessibleProjects: undefined,
  lastPermissionCheck: undefined
};
```

## Implementation Plan

### Phase 1: Core Permission Handling (2 days)
1. Implement `PermissionValidator` class
2. Add `JiraPermissionError` with detailed error information
3. Update `JiraClient.handleApiError()` to parse permission errors
4. Add permission caching mechanism

### Phase 2: Query Refinement (1 day)
1. Implement automatic query refinement logic
2. Add project extraction from JQL
3. Create permission-aware query builder
4. Test with various JQL patterns

### Phase 3: Graceful Degradation (1 day)
1. Implement partial sync capability
2. Add skip logic for inaccessible issues
3. Update sync statistics to show filtered issues
4. Add warning messages for partial syncs

### Phase 4: UI Enhancements (2 days)
1. Update settings validation UI
2. Add permission status indicators
3. Implement query refinement suggestions
4. Add helpful error messages and documentation

### Phase 5: Testing & Edge Cases (1 day)
1. Test with various permission scenarios
2. Handle edge cases (no projects accessible, etc.)
3. Performance testing with permission checks
4. Update integration tests

## Task Breakdown

### Task 1: Implement Permission Detection
**Priority**: Critical  
**Estimate**: 4 hours  
**Acceptance Criteria**:
- [ ] Can detect 403 permission errors
- [ ] Extracts specific project/issue information from error
- [ ] Provides actionable error messages
- [ ] Includes suggested query refinements

### Task 2: Add Permission Validation
**Priority**: Critical  
**Estimate**: 3 hours  
**Acceptance Criteria**:
- [ ] Validates user's project access before sync
- [ ] Caches permission information
- [ ] Provides list of accessible projects
- [ ] Warns about inaccessible content

### Task 3: Implement Query Refinement
**Priority**: High  
**Estimate**: 3 hours  
**Acceptance Criteria**:
- [ ] Automatically adds project filters to queries
- [ ] Preserves original query logic
- [ ] Handles complex JQL patterns
- [ ] Provides user-friendly suggestions

### Task 4: Enable Partial Sync
**Priority**: High  
**Estimate**: 4 hours  
**Acceptance Criteria**:
- [ ] Continues sync despite permission errors
- [ ] Skips inaccessible issues gracefully
- [ ] Reports partial sync status
- [ ] Maintains sync statistics accurately

### Task 5: Update Settings Validation
**Priority**: High  
**Estimate**: 4 hours  
**Acceptance Criteria**:
- [ ] Shows permission status during validation
- [ ] Provides real-time feedback
- [ ] Offers query refinement options
- [ ] Saves permission preferences

### Task 6: Add Error Recovery UI
**Priority**: Medium  
**Estimate**: 3 hours  
**Acceptance Criteria**:
- [ ] Shows clear error messages
- [ ] Provides recovery actions
- [ ] Links to documentation
- [ ] Remembers user preferences

### Task 7: Write Tests
**Priority**: High  
**Estimate**: 4 hours  
**Acceptance Criteria**:
- [ ] Unit tests for permission validation
- [ ] Integration tests for error handling
- [ ] E2E tests for sync with permissions
- [ ] Performance tests for permission checks

## Testing Strategy

### Test Data
Use the provided data.json configuration:
```json
{
  "jiraUrl": "https://richemont.atlassian.net",
  "jiraUsername": "caio.niehues@richemont.com",
  "jqlQuery": "assignee = currentUser() AND updated >= -7d",
  "syncInterval": 5,
  "autoSyncEnabled": true
}
```

### Test Scenarios

1. **Permission Error Scenarios**
   - User has no access to any projects
   - User has partial access to projects
   - User's permissions change during sync
   - Invalid credentials vs. permission errors

2. **Validation Scenarios**
   - Valid syntax with full permissions
   - Valid syntax with partial permissions
   - Invalid syntax
   - Empty or malformed queries

3. **Recovery Scenarios**
   - Automatic query refinement
   - Partial sync completion
   - Retry with filtered query
   - Manual intervention required

4. **Performance Scenarios**
   - Large result sets with permissions
   - Permission check caching
   - Concurrent permission validations
   - Rate limiting with retries

## Success Metrics

1. **Error Resolution**
   - 0% sync failures due to permission errors (with proper configuration)
   - 100% of permission errors provide actionable feedback
   - < 2 seconds for permission validation

2. **User Experience**
   - Clear error messages in 100% of cases
   - Successful query refinement in > 80% of permission cases
   - Reduced support tickets for permission issues

3. **System Reliability**
   - Graceful handling of all permission scenarios
   - No data loss during partial syncs
   - Consistent behavior across Jira configurations

## Rollback Plan

If issues arise after deployment:

1. **Immediate Rollback**
   - Revert to previous error handling
   - Disable permission filtering
   - Clear permission cache

2. **Feature Toggle**
   - Add setting to disable permission checking
   - Allow users to opt-out of automatic refinement
   - Provide legacy sync mode

3. **Gradual Rollout**
   - Test with small user group first
   - Monitor error rates and feedback
   - Iterate based on real-world usage

## Documentation Updates

1. **User Guide**
   - Explain permission requirements
   - Document query refinement process
   - Provide troubleshooting steps

2. **Administrator Guide**
   - Jira permission configuration
   - Project access setup
   - Bulk permission management

3. **Developer Documentation**
   - Permission validation API
   - Error handling patterns
   - Testing permission scenarios

## Dependencies

- Jira REST API v3 documentation
- Obsidian Plugin API v1.4.0+
- Existing test infrastructure
- User feedback from error reports

## Open Questions

1. Should we automatically modify user's JQL queries or always ask for confirmation?
2. How long should permission information be cached?
3. Should partial sync be opt-in or opt-out?
4. What's the best way to educate users about Jira permissions?

## Notes

- The 403 error is often caused by JQL queries that span multiple projects
- Consider adding a "Test with my permissions" button that shows accessible vs. inaccessible content
- May need to coordinate with Jira administrators for proper permission setup
- Consider adding telemetry to understand common permission patterns