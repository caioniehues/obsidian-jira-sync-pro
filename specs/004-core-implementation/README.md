# Core Implementation Specification

## Overview
This specification addresses the 170 failing tests in the Obsidian Jira Sync Pro plugin by implementing the missing business logic in core components.

## Current Status
- **Test Pass Rate**: 76% (536/706 passing)
- **Failing Tests**: 170 across 15 test suites
- **Root Cause**: Core implementation classes returning default/empty values

## Key Documents

### 1. [plan.md](./plan.md)
Technical specification and requirements for implementing the core business logic.

### 2. [tasks.md](./tasks.md)  
Detailed task breakdown with 36 implementation tasks organized by component and priority.

### 3. [implementation-examples.md](./implementation-examples.md)
Code templates and examples showing how to implement each core component.

## Priority Components

### Critical (Must Fix First)
1. **JQLQueryEngine** - 32+ test failures
   - Query execution timing out
   - Pagination broken
   - Abort signal not handled

### High Priority
2. **BulkImportManager** - 8 test failures
   - Batch processing not implemented
   - Progress tracking broken
   - No duplicate detection

3. **AutoSyncScheduler** - 10+ test failures
   - Timer management broken
   - Settings not persisting
   - Status reporting incorrect

### Medium Priority
4. **Mock Infrastructure** - 17 test failures
   - Missing Obsidian API methods
   - Incomplete test doubles

## Implementation Strategy

### Day 1: Core Components
- Implement JQLQueryEngine with new Jira API
- Fix BulkImportManager batch processing
- Complete AutoSyncScheduler timer logic

### Day 2: Integration
- Connect components together
- Fix integration test failures
- Add comprehensive error handling

### Day 3: Polish
- Complete mock infrastructure
- Optimize performance
- Add remaining edge cases

## Test-Driven Development Process

1. **Run specific test**: `npm test -- <component>.test.ts --watch`
2. **Understand failure**: Read test expectations
3. **Implement minimum**: Just enough to pass
4. **Verify green**: Ensure test passes
5. **Refactor**: Clean up if needed
6. **Next test**: Move to next failure

## Success Criteria

✅ All 706 tests passing
✅ No timeout failures  
✅ Memory usage < 50MB for 500 tickets
✅ API calls < 20 per minute
✅ Plugin works in Obsidian

## Quick Start

```bash
# Start with JQLQueryEngine (most critical)
npm test -- jql-query-engine.test.ts --watch

# Open src/enhanced-sync/jql-query-engine.ts
# Follow implementation template in implementation-examples.md
# Make tests pass one by one
```

## Key Technical Considerations

### API Migration
- Use new endpoint: `POST /rest/api/3/search/jql`
- Token-based pagination (not `startAt`)
- Explicit field selection required

### Performance
- Batch size: 25-50 tickets
- Delay between batches: 100ms
- Exponential backoff: 1s, 2s, 4s, 8s
- Max retries: 3

### Error Handling
- Network failures: Retry with backoff
- Rate limiting (429): Respect Retry-After header
- Abort signals: Clean cancellation
- User feedback: Clear error messages

## Next Steps

1. Create a new branch: `git checkout -b 004-core-implementation`
2. Start with Task T001: Read JQLQueryEngine test failures
3. Implement using templates from implementation-examples.md
4. Run tests continuously to verify progress
5. Commit after each component is complete

---

*Generated: 2025-09-10*  
*Specification Version: 1.0*  
*Target Completion: 3 days*