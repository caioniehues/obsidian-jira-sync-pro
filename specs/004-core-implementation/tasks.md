# Tasks: Core Implementation

**Input**: Design documents from `/specs/004-core-implementation/`  
**Prerequisites**: plan.md ✅, implementation-examples.md ✅

## Execution Flow (main)
```
1. Load plan.md from feature directory
   → Found: 3 core classes + 1 mock infrastructure
   → Tech stack: TypeScript 4.9+, Obsidian API v1.4.0+, Jira API v3, Jest
2. Analyze test failures:
   → JQLQueryEngine: 32+ failing (CRITICAL)
   → BulkImportManager: 8 failing (HIGH)
   → AutoSyncScheduler: 10+ failing (HIGH)
   → Mock Infrastructure: 17 failing (MEDIUM)
3. Generate tasks by category:
   → Setup: Branch creation, test environment
   → Tests: Run existing failing tests (TDD approach)
   → Core: Implement business logic for each class
   → Integration: Connect components
   → Polish: Optimization and documentation
4. Apply task rules:
   → Different files = mark [P] for parallel
   → Same file = sequential (no [P])
   → Tests before implementation (TDD)
5. Number tasks sequentially (T001-T040)
6. Generate dependency graph
7. Create parallel execution examples
8. Validate task completeness:
   → All failing tests addressed? ✓
   → All core classes implemented? ✓
   → Integration verified? ✓
9. Return: SUCCESS (tasks ready for execution)
```

## Format: `[ID] [P?] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- Include exact file paths in descriptions

## Phase 3.1: Setup

- [ ] **T001** Verify branch 004-core-implementation is active
  - Ensure clean working directory
  - Pull latest main changes if needed

- [ ] **T002** [P] Run full test suite to baseline failures
  - Execute: `npm test`
  - Document: 170 failing tests across 15 suites
  - Save output for comparison

- [ ] **T003** [P] Set up test watch for TDD workflow
  - Configure: `npm test -- --watch`
  - Focus on one component at a time

## Phase 3.2: Tests First (TDD) ⚠️ MUST RUN BEFORE 3.3

**CRITICAL: Run these tests to see failures, then implement to make them pass**

### JQLQueryEngine Tests (CRITICAL - blocks everything)
- [ ] **T004** Run JQLQueryEngine tests in tests/unit/jql-query-engine.test.ts
  - Execute: `npm test -- jql-query-engine.test.ts`
  - Document timeout failures and missing implementations
  - Expected: 32+ failures

### BulkImportManager Tests
- [ ] **T005** [P] Run BulkImportManager tests in tests/unit/bulk-import-manager.test.ts
  - Execute: `npm test -- bulk-import-manager.test.ts`
  - Document progress tracking failures
  - Expected: 8 failures

### AutoSyncScheduler Tests
- [ ] **T006** [P] Run AutoSyncScheduler tests in tests/unit/auto-sync-scheduler.test.ts
  - Execute: `npm test -- auto-sync-scheduler.test.ts`
  - Document timer management failures
  - Expected: 10+ failures

### Mock Infrastructure Tests
- [ ] **T007** [P] Run mock completeness tests in tests/unit/obsidian-mock-completeness.test.ts
  - Execute: `npm test -- obsidian-mock-completeness.test.ts`
  - Document missing Obsidian API methods
  - Expected: 17 failures

## Phase 3.3: Core Implementation (ONLY after tests are failing)

### JQLQueryEngine Implementation (CRITICAL PATH)
- [ ] **T008** Implement executeQuery method in src/enhanced-sync/jql-query-engine.ts
  - Use new `/rest/api/3/search/jql` endpoint
  - Add proper async/await handling
  - Implement field selection

- [ ] **T009** Add token-based pagination to JQLQueryEngine
  - Handle nextPageToken correctly
  - Implement page size limits (25-50)
  - Track total vs fetched counts

- [ ] **T010** Implement abort signal support in JQLQueryEngine
  - Integrate AbortController
  - Cancel in-flight requests
  - Clean up on abort

- [ ] **T011** Add retry mechanism with exponential backoff
  - Delays: 1s, 2s, 4s, 8s
  - Max 3 retries
  - Handle 429 rate limiting

- [ ] **T012** Implement progress reporting in JQLQueryEngine
  - Emit progress events
  - Calculate percentages
  - Track current state

### BulkImportManager Implementation
- [ ] **T013** [P] Implement batch processing in src/sync/bulk-import-manager.ts
  - Process 25 tickets per batch
  - Add 100ms delay between batches
  - Update internal counters

- [ ] **T014** [P] Add progress tracking to BulkImportManager
  - Calculate percentage complete
  - Track batch numbers
  - Trigger callbacks

- [ ] **T015** [P] Implement duplicate detection in BulkImportManager
  - Check by ticket key
  - Skip existing tickets
  - Log duplicates

- [ ] **T016** [P] Add pause/resume functionality to BulkImportManager
  - Save state to temp file
  - Serialize remaining tickets
  - Restore from saved state

- [ ] **T017** [P] Implement cancellation in BulkImportManager
  - Set cancellation flag
  - Stop current batch
  - Return partial results

### AutoSyncScheduler Implementation
- [ ] **T018** [P] Implement timer lifecycle in src/sync/auto-sync-scheduler.ts
  - Use setInterval for scheduling
  - Handle cleanup properly
  - Prevent multiple timers

- [ ] **T019** [P] Add sync execution to AutoSyncScheduler
  - Call JQLQueryEngine
  - Process through BulkImportManager
  - Handle errors gracefully

- [ ] **T020** [P] Implement status tracking in AutoSyncScheduler
  - Track isRunning state
  - Record timestamps
  - Count syncs and errors

- [ ] **T021** [P] Add settings persistence to AutoSyncScheduler
  - Save interval preference
  - Store last sync state
  - Load on startup

- [ ] **T022** [P] Implement manual trigger in AutoSyncScheduler
  - Allow immediate sync
  - Cancel current timer
  - Restart after manual sync

## Phase 3.4: Mock Infrastructure

- [ ] **T023** [P] Add Plugin lifecycle methods in tests/__mocks__/obsidian.ts
  - Implement loadData/saveData
  - Add addCommand method
  - Add registerEvent method

- [ ] **T024** [P] Add Vault methods in tests/__mocks__/obsidian.ts
  - Implement getFiles
  - Add getMarkdownFiles
  - Add getFolderByPath

- [ ] **T025** [P] Complete Settings mock in tests/__mocks__/obsidian.ts
  - Add containerEl operations
  - Implement Setting builder chain
  - Add control types

- [ ] **T026** [P] Implement Event system in tests/__mocks__/obsidian.ts
  - Add EventRef implementation
  - Implement on/off/trigger
  - Add event propagation

## Phase 3.5: Integration

- [ ] **T027** Wire JQLQueryEngine to JiraClient
  - Pass auth headers correctly in src/jira-bases-adapter/jira-client.ts
  - Handle base URL configuration
  - Map responses to models

- [ ] **T028** Connect BulkImportManager to file system
  - Create/update note files in src/sync/bulk-import-manager.ts
  - Handle frontmatter correctly
  - Trigger Obsidian events

- [ ] **T029** Integrate AutoSyncScheduler with settings
  - Load interval from settings in src/sync/auto-sync-scheduler.ts
  - Update on change
  - Show notifications

- [ ] **T030** Fix integration test failures
  - Run: `npm test -- integration/`
  - Fix basic-auto-sync.test.ts
  - Fix team-queries.test.ts

## Phase 3.6: Polish

- [ ] **T031** [P] Optimize batch processing performance
  - Tune batch size (25-50)
  - Adjust delays
  - Monitor memory usage

- [ ] **T032** [P] Add comprehensive error handling
  - Network error recovery
  - User-friendly messages
  - Debug logging

- [ ] **T033** [P] Add request debouncing
  - Prevent rapid API calls
  - Queue concurrent requests
  - Respect rate limits

- [ ] **T034** [P] Document public APIs
  - Add JSDoc comments
  - Include usage examples
  - Document edge cases

- [ ] **T035** Run full test suite verification
  - Execute: `npm test`
  - Target: 706/706 passing
  - No timeouts

- [ ] **T036** Build and test plugin in Obsidian
  - Run: `npm run build`
  - Install in test vault
  - Verify functionality

- [ ] **T037** Performance validation
  - Test with 500 tickets
  - Verify < 50MB memory usage
  - Confirm < 20 API calls/minute

- [ ] **T038** Update CLAUDE.md with implementation details
  - Document new features
  - Add troubleshooting section
  - Include performance tips

- [ ] **T039** Create PR for review
  - Summarize changes
  - Include test results
  - Add screenshots if applicable

- [ ] **T040** Final cleanup
  - Remove debug logging
  - Clean up commented code
  - Format all files

## Dependencies

**Critical Path**:
- T004 (test JQLQueryEngine) → T008-T012 (implement) → T027 (integrate)
- T005 (test BulkImportManager) → T013-T017 (implement) → T028 (integrate)
- T006 (test AutoSyncScheduler) → T018-T022 (implement) → T029 (integrate)
- T027-T029 (integration) → T030 (integration tests) → T035 (full suite)

**Parallel Opportunities**:
- T005, T006, T007 can run simultaneously (different test files)
- T013-T017 can run in parallel (BulkImportManager methods)
- T018-T022 can run in parallel (AutoSyncScheduler methods)
- T023-T026 can run in parallel (mock infrastructure)
- T031-T034 can run in parallel (polish tasks)

## Parallel Execution Example

```bash
# Phase 3.2: Run all component tests in parallel
Task: "Run BulkImportManager tests in tests/unit/bulk-import-manager.test.ts"
Task: "Run AutoSyncScheduler tests in tests/unit/auto-sync-scheduler.test.ts"
Task: "Run mock completeness tests in tests/unit/obsidian-mock-completeness.test.ts"

# Phase 3.3: Implement BulkImportManager methods in parallel
Task: "Implement batch processing in src/sync/bulk-import-manager.ts"
Task: "Add progress tracking to BulkImportManager"
Task: "Implement duplicate detection in BulkImportManager"
Task: "Add pause/resume functionality to BulkImportManager"
Task: "Implement cancellation in BulkImportManager"

# Phase 3.4: Complete all mocks in parallel
Task: "Add Plugin lifecycle methods in tests/__mocks__/obsidian.ts"
Task: "Add Vault methods in tests/__mocks__/obsidian.ts"
Task: "Complete Settings mock in tests/__mocks__/obsidian.ts"
Task: "Implement Event system in tests/__mocks__/obsidian.ts"
```

## Success Metrics

- [ ] JQLQueryEngine: 32+ tests passing
- [ ] BulkImportManager: 8 tests passing
- [ ] AutoSyncScheduler: 10+ tests passing
- [ ] Mock completeness: 17 tests passing
- [ ] Integration tests: All passing
- [ ] **Total: 706/706 tests green**
- [ ] Build successful with no TypeScript errors
- [ ] Plugin works in Obsidian test vault
- [ ] Memory usage < 50MB for 500 tickets
- [ ] API calls < 20 per minute

## Notes

- **TDD Approach**: Always run tests first (T004-T007) before implementing (T008-T026)
- **Focus Order**: Start with JQLQueryEngine (critical path), then parallelize others
- **Use Templates**: Refer to implementation-examples.md for code templates
- **Test Continuously**: Keep `npm test -- --watch` running during development
- **Commit Frequently**: After each component is green
- **API Migration**: Remember to use new Jira endpoints (see plan.md)