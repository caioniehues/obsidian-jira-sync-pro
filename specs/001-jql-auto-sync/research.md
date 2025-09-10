# Research Findings: JQL-based Auto-Sync

**Date**: 2025-09-10  
**Phase**: 0 (Research & Analysis)  
**Status**: Complete

## Research Areas

### 1. Jira API Migration Strategy

**Decision**: Migrate from deprecated POST /rest/api/3/search to new POST /rest/api/3/search/jql endpoint

**Rationale**: 
- Current deprecated endpoints will be removed May 1, 2025 (6-month window)
- New endpoint provides better performance and scalability for large Jira instances
- Token-based pagination is more efficient than offset-based for large datasets
- Enhanced security with improved request signing

**Alternatives Considered**:
- Keep using deprecated endpoint until forced migration: Rejected due to performance issues at scale
- Use GET /rest/api/3/search/jql: Rejected due to URL length limitations for complex JQL queries
- Implement both old and new for transition period: Rejected due to maintenance complexity

**Key Changes Required**:
- Replace `startAt` parameter with `nextPageToken` for pagination
- Handle different response format (issues array structure unchanged)
- Implement exponential backoff for rate limiting (new endpoint has stricter limits)
- Update error handling for new error codes

### 2. Token-Based Pagination Implementation

**Decision**: Implement continuation token system with automatic page traversal

**Rationale**:
- New API returns `nextPageToken` in response instead of calculating offsets
- Eliminates race conditions with concurrent pagination requests
- Better performance for large result sets (no need to skip records)
- Allows for resumable operations if sync is interrupted

**Alternatives Considered**:
- Emulate old offset behavior: Rejected as not supported by new API
- Single-page requests only: Rejected due to 100-record API limit
- Parallel page requests: Not possible with token-based system

**Implementation Details**:
```typescript
interface PaginatedRequest {
  jql: string;
  maxResults: number;
  nextPageToken?: string;
}

interface PaginatedResponse {
  issues: JiraIssue[];
  nextPageToken?: string; // undefined when no more pages
}
```

### 3. Progressive Bulk Import Strategy

**Decision**: Implement batch processing with 25 tickets per batch and UI progress feedback

**Rationale**:
- Prevents UI blocking during large imports (500+ tickets)
- Allows cancellation and resume of import process
- Provides user feedback on import progress
- Respects API rate limits (max 20 requests per minute)

**Alternatives Considered**:
- Single bulk request: Rejected due to API limits and UI blocking
- Larger batch sizes (50+): Rejected due to memory constraints and timeout risks
- Smaller batch sizes (10): Rejected due to inefficiency (more API calls)

**Implementation Approach**:
- Use Obsidian Modal for progress display
- Store import state for resume capability
- Implement cancellation tokens for user control
- Queue system for retry of failed batches

### 4. Error Handling & Retry Patterns

**Decision**: Implement exponential backoff with circuit breaker pattern

**Rationale**:
- New API has stricter rate limiting (60 requests/hour)
- Network issues are common in plugin environments  
- Circuit breaker prevents cascading failures
- User experience requires graceful degradation

**Retry Strategy**:
- Rate limit (429): Exponential backoff starting at 1 second, max 30 seconds
- Network errors (5xx): Linear retry with 3 attempts
- Authentication (401): Immediate user prompt for credential refresh
- Client errors (4xx): No retry, log and notify user

**Circuit Breaker**:
- Open after 5 consecutive failures
- Half-open state after 2 minutes
- Close after successful request in half-open state

### 5. Performance Optimization Approach

**Decision**: Implement field selection and response caching strategies

**Rationale**:
- New API returns minimal fields by default (better performance)
- Selective field requests reduce bandwidth and parsing time
- Local caching reduces redundant API calls
- Incremental sync reduces processing overhead

**Optimization Techniques**:
- Request only needed fields: `["summary", "status", "assignee", "priority", "updated"]`
- Use `updated > lastSyncTime` filter for incremental syncs
- Cache issue metadata locally (Obsidian plugin storage)
- Batch multiple operations in single API call when possible

**Performance Targets**:
- 100 tickets sync in < 30 seconds (currently achievable)
- Memory usage < 50MB for 500 tickets (field selection helps)
- API calls < 20 per minute (batch optimization)

## Technical Decisions Summary

| Area | Decision | Impact |
|------|----------|--------|
| API Endpoint | POST /rest/api/3/search/jql | Migration required, better performance |
| Pagination | Token-based with nextPageToken | Code changes needed, better reliability |
| Bulk Import | 25 tickets/batch with progress UI | New component needed, better UX |
| Error Handling | Exponential backoff + circuit breaker | Robust error recovery |
| Performance | Field selection + incremental sync | Reduced bandwidth and latency |

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| API deprecation deadline | High | Critical | Prioritize migration implementation |
| Rate limiting changes | Medium | High | Implement conservative rate limiting |
| Token pagination complexity | Low | Medium | Thorough testing with edge cases |
| User experience during migration | Medium | Medium | Provide clear migration notices |

## Next Steps

1. **Phase 1**: Design data models for new API response format
2. **Phase 1**: Create contracts for new endpoint integration  
3. **Phase 1**: Design progressive import UI components
4. **Phase 2**: Implement migration with backward compatibility
5. **Phase 2**: Add comprehensive error handling and retry logic

---
**Research Complete**: All technical decisions documented with rationale and alternatives considered.