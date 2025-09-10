# Core Implementation - Fix Business Logic

## Overview
Implement missing business logic in core classes to fix 170 failing tests. The tests are well-structured but the implementation classes are returning default/empty values instead of performing actual operations.

## Current State
- ✅ 536 tests passing (76%)
- ❌ 170 tests failing (24%)
- Main issues: Missing implementations, not architectural problems

## Tech Stack
- TypeScript 4.9+
- Obsidian Plugin API v1.4.0+
- Jira REST API v3 (new endpoints)
- Jest for testing

## Core Classes Requiring Implementation

### 1. BulkImportManager (Priority: HIGH)
**Location**: `src/sync/bulk-import-manager.ts`
**Failing Tests**: 8
**Issues**:
- `totalImported` always returns 0
- Progress callbacks not triggered
- Cancellation not working
- Resume functionality missing
- Duplicate detection broken

**Required Implementation**:
- Batch processing logic (25 tickets/batch)
- Progress tracking and callbacks
- State persistence for resume
- Duplicate detection algorithm
- Cancellation handling

### 2. JQLQueryEngine (Priority: CRITICAL)
**Location**: `src/enhanced-sync/jql-query-engine.ts`
**Failing Tests**: 32+
**Issues**:
- Query execution timing out
- Pagination not working
- Abort signal not handled
- Progress tracking broken
- Retry mechanism missing

**Required Implementation**:
- JQL query execution with new API
- Token-based pagination
- Abort controller integration
- Exponential backoff retry
- Progress reporting

### 3. AutoSyncScheduler (Priority: HIGH)
**Location**: `src/sync/auto-sync-scheduler.ts`
**Failing Tests**: 10+
**Issues**:
- Timer management broken
- Settings not persisting
- Status reporting incorrect
- Cancellation not working

**Required Implementation**:
- Interval-based scheduling
- Timer lifecycle management
- Settings persistence
- Status tracking
- Graceful shutdown

### 4. Mock Infrastructure (Priority: MEDIUM)
**Location**: `tests/__mocks__/obsidian.ts`
**Failing Tests**: 17
**Missing Mocks**:
- Plugin lifecycle methods
- Vault file operations
- Settings management
- Event system

## Implementation Strategy

### Phase 1: Critical Path (Day 1)
1. Fix JQLQueryEngine - Core query functionality
2. Fix BulkImportManager - Import pipeline
3. Fix AutoSyncScheduler - Scheduling system

### Phase 2: Integration (Day 2)
1. Connect components together
2. Fix integration test failures
3. Add error handling

### Phase 3: Polish (Day 3)
1. Complete mock infrastructure
2. Add remaining edge cases
3. Performance optimization

## Success Criteria
- All 706 tests passing
- No timeout failures
- Proper error handling
- Memory usage < 50MB for 500 tickets
- API calls < 20/minute

## Technical Requirements

### JQLQueryEngine Requirements
```typescript
interface QueryResult {
  issues: JiraTicket[];
  nextPageToken?: string;
  total: number;
  isLast: boolean;
}

class JQLQueryEngine {
  async executeQuery(jql: string, options?: QueryOptions): Promise<QueryResult>
  async executeWithPagination(jql: string, onPage: (issues: JiraTicket[]) => void): Promise<void>
  cancelQuery(): void
}
```

### BulkImportManager Requirements
```typescript
interface ImportProgress {
  current: number;
  total: number;
  percentage: number;
  currentBatch: number;
  totalBatches: number;
}

class BulkImportManager {
  async startImport(tickets: JiraTicket[], onProgress?: (progress: ImportProgress) => void): Promise<void>
  pauseImport(): void
  resumeImport(): Promise<void>
  cancelImport(): void
  getProgress(): ImportProgress
}
```

### AutoSyncScheduler Requirements
```typescript
interface SchedulerStatus {
  isRunning: boolean;
  lastSync?: Date;
  nextSync?: Date;
  syncCount: number;
  errorCount: number;
}

class AutoSyncScheduler {
  start(intervalMinutes: number): void
  stop(): void
  triggerSync(): Promise<void>
  getStatus(): SchedulerStatus
  updateInterval(minutes: number): void
}
```

## API Migration Notes
Remember to use new Jira API endpoints:
- `POST /rest/api/3/search/jql` (not `/search`)
- Token-based pagination (not `startAt`)
- Explicit field selection required

## Testing Approach
1. Fix implementation to make existing tests pass
2. No new tests needed initially
3. Use TDD - run specific test, implement, verify
4. Focus on one class at a time

## Risk Mitigation
- Implement incrementally, verify each component
- Use existing test structure as specification
- Maintain backward compatibility
- Add comprehensive logging for debugging