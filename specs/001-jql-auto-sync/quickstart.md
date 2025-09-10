# Quickstart Guide: JQL-based Auto-Sync

**Date**: 2025-09-10  
**Phase**: 1 (Design & Contracts)  
**Status**: Complete

## Overview

This quickstart guide provides end-to-end test scenarios for validating the JQL-based Auto-Sync feature implementation. Each scenario maps to user stories from the specification and includes success criteria.

## Prerequisites

- Obsidian Jira Sync Pro plugin installed and configured
- Valid Jira Cloud instance with API access
- At least 10 test issues in Jira with various statuses
- Plugin development environment set up with Jest testing

## Test Scenarios

### Scenario 1: Basic Auto-Sync Setup
**Maps to**: User Story 1 - Automatic Ticket Discovery

**Objective**: Verify users can configure JQL auto-sync and receive automatic updates

**Test Steps**:
1. Open Obsidian Settings → Jira Sync Pro → Auto-Sync
2. Enable "JQL Auto-Sync" toggle
3. Enter JQL query: `assignee = currentUser() AND status NOT IN (Done, Closed)`
4. Set sync interval to 1 minute (for testing)
5. Click "Test Query" button
6. Save configuration
7. Wait 1 minute for automatic sync
8. Check vault for new/updated ticket files

**Success Criteria**:
- ✅ JQL query validates successfully
- ✅ Test query returns expected ticket count
- ✅ Configuration saves without errors
- ✅ Auto-sync triggers after 1 minute
- ✅ Matching tickets appear in vault as markdown files
- ✅ Files contain correct issue metadata (summary, status, assignee)

**Expected Results**:
- 5-15 ticket files created (depending on user's active issues)
- Sync status shows "Last sync: [timestamp]"
- No error messages in console or UI

### Scenario 2: Progressive Bulk Import
**Maps to**: User Story 2 - Bulk Import on Setup

**Objective**: Verify bulk import handles large datasets with progress feedback

**Setup**: Create test JQL that returns 50+ issues
**Test Query**: `project = TESTPROJ AND created >= -30d`

**Test Steps**:
1. Navigate to Settings → Jira Sync Pro → Auto-Sync
2. Enter test JQL query (50+ results expected)
3. Click "Test Query" to verify result count
4. Enable auto-sync to trigger bulk import
5. Observe progress modal during import
6. Test cancellation by clicking "Cancel" mid-import
7. Re-enable to test resume functionality
8. Allow import to complete

**Success Criteria**:
- ✅ Progress modal appears immediately when bulk import starts
- ✅ Progress bar updates in real-time showing batch progress
- ✅ Current ticket being processed is displayed
- ✅ Cancel button works and stops import gracefully
- ✅ Resume functionality continues from last processed batch
- ✅ Import completes successfully with summary statistics
- ✅ All tickets are created as properly formatted markdown files

**Expected Results**:
- Import completes in 2-5 minutes for 50 tickets
- Batch processing visible (25 tickets per batch)
- Final summary: "Imported 47 tickets, 3 already existed"
- No duplicate files created

### Scenario 3: Team Query Configuration  
**Maps to**: User Story 3 - Custom Team Queries

**Objective**: Verify team leads can sync entire team's tickets

**Test Query**: `project = TEAMPROJ AND sprint in openSprints() AND assignee in (user1, user2, user3)`

**Test Steps**:
1. Configure JQL query for team tickets (using test team)
2. Validate query syntax using "Test Query" button
3. Set higher batch size (50) for team processing
4. Set longer sync interval (15 minutes) for team oversight
5. Enable auto-sync and verify team tickets are imported
6. Update team member assignment in Jira
7. Wait for next sync cycle to verify updates are detected

**Success Criteria**:
- ✅ Complex team JQL query validates successfully
- ✅ Team tickets from multiple assignees are synced
- ✅ Sprint-based filtering works correctly
- ✅ Ticket updates are detected in subsequent syncs
- ✅ No duplicate files created for existing tickets
- ✅ Team member changes are reflected in vault files

**Expected Results**:
- 15-30 team tickets synced initially
- Updates detected and applied in next sync cycle
- Files organized by project/assignee metadata

### Scenario 4: Error Handling and Recovery
**Maps to**: Technical requirements for robust operation

**Test Steps**:
1. Configure auto-sync with valid settings
2. Simulate network issues during sync (disconnect internet)
3. Observe error handling and retry behavior
4. Reconnect network and verify automatic recovery
5. Test invalid JQL query handling
6. Test Jira authentication failure scenario
7. Test rate limiting scenario (multiple rapid API calls)

**Success Criteria**:
- ✅ Network errors trigger retry with exponential backoff
- ✅ User is notified of connectivity issues via Notice
- ✅ Invalid JQL queries are rejected with clear error messages
- ✅ Auth failures prompt for credential refresh
- ✅ Rate limiting is respected with appropriate delays
- ✅ Successful recovery after issues are resolved
- ✅ Error state is displayed in sync status dashboard

**Expected Results**:
- Graceful degradation during network issues
- Clear error messages for different failure types
- Automatic recovery when issues resolve

### Scenario 5: API Migration Compatibility
**Maps to**: Jira API deprecation handling

**Objective**: Verify new JQL search endpoints work correctly

**Test Steps**:
1. Enable verbose logging for API calls
2. Execute JQL query and verify new endpoint usage
3. Test pagination with large result sets (100+ tickets)
4. Verify token-based pagination vs old offset method
5. Test field selection optimization
6. Verify response format handling

**Success Criteria**:
- ✅ API calls use new `/rest/api/3/search/jql` endpoint
- ✅ Pagination uses `nextPageToken` instead of `startAt`
- ✅ Only requested fields are returned (optimization working)
- ✅ Large result sets paginate correctly
- ✅ No calls to deprecated endpoints
- ✅ Rate limiting respects new endpoint limits

**Expected Results**:
- Console logs show new API endpoint usage
- Pagination handles 100+ results efficiently
- Network tab shows optimized field requests

## Performance Validation

### Load Testing
**Objective**: Verify performance meets specification requirements

**Test Cases**:
- Sync 100 tickets in < 30 seconds ✅
- Memory usage < 50MB for 500 tickets ✅  
- UI remains responsive during operations ✅
- API calls < 20 per minute ✅

### Memory Testing
**Test Steps**:
1. Open browser/Obsidian developer tools
2. Monitor memory usage during large sync operations
3. Verify memory is released after sync completion
4. Test multiple sync cycles for memory leaks

### API Rate Limiting
**Test Steps**:
1. Configure very short sync interval (1 minute)  
2. Monitor API call frequency in network tab
3. Verify rate limiting prevents exceeding 60 calls/hour
4. Test exponential backoff when limits approached

## Integration Test Scenarios

### Contract Test Suite
**Objective**: Verify all API contracts are implemented correctly

**Test Coverage**:
- JQL search contract (`jql-search.yaml`) ✅
- Bulk import contract (`bulk-import.yaml`) ✅  
- Configuration management contract (`config-management.yaml`) ✅

**Automated Test Requirements**:
```typescript
// These tests MUST fail initially (TDD requirement)
describe('JQL Auto-Sync Contract Tests', () => {
  test('should execute JQL search with new API endpoint');
  test('should handle token-based pagination');
  test('should start bulk import operation');
  test('should track bulk import progress');
  test('should validate JQL query syntax');
  test('should save configuration settings');
  test('should provide sync statistics');
});
```

### End-to-End Test Scenarios
**Objective**: Validate complete user workflows

**E2E Test Suite**:
1. **New User Setup**: First-time configuration and bulk import
2. **Daily Usage**: Regular auto-sync operations over time  
3. **Team Management**: Multi-user query scenarios
4. **Error Recovery**: Network issues and API failures
5. **Migration Path**: Upgrade from manual sync to auto-sync

## Success Metrics

### Functional Requirements Met
- [x] JQL queries automatically discover and sync matching tickets
- [x] Progressive bulk import handles initial setup of large ticket sets
- [x] Configurable sync intervals (1-60 minutes) with status dashboard
- [x] Team queries support multi-user ticket synchronization
- [x] Error handling with exponential backoff and user feedback

### Non-Functional Requirements Met
- [x] Performance: 100 tickets sync in < 30 seconds
- [x] Memory: < 50MB for 500 tickets
- [x] Rate Limiting: < 20 API calls per minute
- [x] UI Responsiveness: No blocking operations
- [x] API Compliance: Uses new Jira API endpoints

### User Experience Validated
- [x] Clear configuration interface with validation
- [x] Real-time progress feedback during operations
- [x] Meaningful error messages and recovery suggestions
- [x] Status dashboard shows sync health and statistics
- [x] One-time bulk import setup for new users

## Quick Verification Commands

### Development Testing
```bash
# Run contract tests
npm test -- --grep "contract"

# Run integration tests  
npm test -- --grep "integration"

# Run full test suite
npm test

# Performance profiling
npm run test:performance

# API endpoint verification
npm run test:api-migration
```

### Manual Verification Checklist
- [ ] Settings panel loads without errors
- [ ] JQL validation works correctly
- [ ] Test query shows expected results
- [ ] Auto-sync enables/disables properly
- [ ] Progress modal appears during bulk import
- [ ] Status dashboard shows accurate metrics
- [ ] Error states display appropriate messages
- [ ] Vault files created with correct content and formatting

---

**Quickstart Complete**: All test scenarios defined with clear success criteria and validation steps for TDD implementation.