# Tasks: JQL-based Auto-Sync

**Input**: Design documents from `/specs/001-jql-auto-sync/`
**Prerequisites**: plan.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅, quickstart.md ✅

## Execution Flow (main)
```
✅ 1. Loaded plan.md - TypeScript 4.9+ with Obsidian Plugin API v1.4.0+
✅ 2. Loaded design documents: 6 entities, 3 contracts, 5 test scenarios
✅ 3. Generated 49 tasks across 5 phases (Setup, Tests, Core, Integration, Polish)
✅ 4. Applied TDD rules: Tests before implementation, parallel marking for independent files
✅ 5. Numbered tasks sequentially (T001-T049)
✅ 6. Created dependency graph with API migration priority
✅ 7. Generated parallel execution examples for performance optimization
✅ 8. Validated completeness: All contracts, entities, and scenarios covered
✅ 9. SUCCESS: Tasks ready for immediate execution
```

## 🚨 CRITICAL: API Migration Priority
**Deadline**: May 1, 2025 - Jira API deprecation
**Priority Tasks**: T004, T005, T008, T017, T018 (API migration tests and implementation)

## Phase 3.1: Setup

- [ ] **T001** Create project structure for JQL auto-sync feature in existing plugin architecture
  - Update src/ directory with new sync/, enhanced-sync/, settings/ subdirectories
  - Ensure compatibility with existing plugin structure
  
- [ ] **T002** Initialize TypeScript dependencies for new API endpoints and timer functionality
  - Verify Obsidian Plugin API v1.4.0+ compatibility
  - Add Jest timer mocking utilities for scheduler testing
  
- [ ] **T003** [P] Configure ESLint rules for auto-sync TypeScript files
  - Add linting rules for async/await patterns and error handling
  - Set up Jest test configuration for timer mocking

## Phase 3.2: Tests First (TDD) ⚠️ MUST COMPLETE BEFORE 3.3
**CRITICAL: These tests MUST be written and MUST FAIL before ANY implementation**

### Contract Tests (API Migration Critical)
- [ ] **T004** [P] Contract test POST /rest/api/3/search/jql endpoint in tests/unit/jql-search-contract.test.ts
  - Test new token-based pagination with nextPageToken
  - Verify field selection optimization
  - Test error handling for 400, 401, 403, 429 responses
  
- [ ] **T005** [P] Contract test bulk import operations in tests/unit/bulk-import-contract.test.ts  
  - Test start/pause/resume/cancel operations
  - Verify progress tracking and batch processing
  - Test error collection and recovery

- [ ] **T006** [P] Contract test configuration management in tests/unit/config-management-contract.test.ts
  - Test JQL query validation
  - Verify settings persistence and loading
  - Test sync statistics collection

### Data Model Tests  
- [ ] **T007** [P] Data model test for JQLAutoSyncConfig in tests/unit/jql-auto-sync-config.test.ts
  - Test validation rules (syncInterval 1-60, batchSize 10-100)
  - Test state transitions (enabled, syncInProgress)
  - Test configuration serialization/deserialization

- [ ] **T008** [P] Data model test for SyncProgress in tests/unit/sync-progress.test.ts
  - Test phase transitions and progress calculations  
  - Test error collection and cancellation handling
  - Test time estimation algorithms

- [ ] **T009** [P] Data model test for BulkImportProgress in tests/unit/bulk-import-progress.test.ts
  - Test batch processing logic and resume tokens
  - Test duplicate detection and statistics tracking
  - Test pause/resume state management

- [ ] **T010** [P] Data model test for JQLSearchResult in tests/unit/jql-search-result.test.ts
  - Test new API response format parsing
  - Test pagination token handling
  - Test field selection and issue mapping

- [ ] **T011** [P] Data model test for SyncError in tests/unit/sync-error.test.ts
  - Test structured error information and categorization
  - Test retry attempt tracking and backoff calculations
  - Test error context and user action correlation

- [ ] **T012** [P] Data model test for SyncStatistics in tests/unit/sync-statistics.test.ts
  - Test metrics aggregation and rolling averages
  - Test hourly statistics and counter management
  - Test performance metrics and API call tracking

### Integration Tests (User Scenarios)
- [ ] **T013** [P] Integration test for Basic Auto-Sync Setup in tests/integration/basic-auto-sync.test.ts
  - Test complete flow: configure → validate → sync → verify vault files
  - Verify auto-sync triggers after configured interval
  - Test JQL query validation and execution

- [ ] **T014** [P] Integration test for Progressive Bulk Import in tests/integration/bulk-import.test.ts
  - Test large dataset processing with progress UI
  - Test cancellation and resume functionality  
  - Verify batch processing (25 tickets per batch)

- [ ] **T015** [P] Integration test for Team Query Configuration in tests/integration/team-queries.test.ts
  - Test complex JQL queries with multiple assignees
  - Test sprint-based filtering and team oversight
  - Verify team member changes are detected

- [ ] **T016** [P] Integration test for Error Handling and Recovery in tests/integration/error-handling.test.ts
  - Test network failure scenarios and retry logic
  - Test invalid JQL query handling
  - Test rate limiting and exponential backoff

- [ ] **T017** [P] Integration test for API Migration Compatibility in tests/integration/api-migration.test.ts  
  - **CRITICAL**: Test new /rest/api/3/search/jql endpoint usage
  - Verify token-based pagination vs offset-based  
  - Test field selection optimization and response handling

## Phase 3.3: Core Implementation (ONLY after tests are failing)

### Data Models
- [ ] **T018** [P] Implement JQLAutoSyncConfig interface in src/models/jql-auto-sync-config.ts
  - Implement validation methods and state transitions
  - Add serialization for plugin settings storage
  
- [ ] **T019** [P] Implement SyncProgress interface in src/models/sync-progress.ts  
  - Implement progress calculations and time estimation
  - Add cancellation token management

- [ ] **T020** [P] Implement BulkImportProgress interface in src/models/bulk-import-progress.ts
  - Implement batch processing logic and resume tokens
  - Add duplicate detection and statistics tracking

- [ ] **T021** [P] Implement JQLSearchResult interface in src/models/jql-search-result.ts
  - Implement new API response format parsing
  - Add pagination token handling and field mapping

- [ ] **T022** [P] Implement SyncError interface in src/models/sync-error.ts
  - Implement structured error creation and categorization
  - Add retry logic and exponential backoff calculations

- [ ] **T023** [P] Implement SyncStatistics interface in src/models/sync-statistics.ts
  - Implement metrics aggregation and persistence
  - Add hourly statistics and performance tracking

### Core Services  
- [ ] **T024** Migrate JQLQueryEngine to new API endpoints in src/enhanced-sync/jql-query-engine.ts
  - **CRITICAL**: Implement POST /rest/api/3/search/jql endpoint migration
  - Replace startAt pagination with nextPageToken system
  - Add field selection optimization and error handling
  
- [ ] **T025** Implement AutoSyncScheduler with interval management in src/sync/auto-sync-scheduler.ts
  - Implement configurable interval timing (1-60 minutes)
  - Add failure recovery with exponential backoff
  - Integrate with plugin lifecycle (onLoad/onUnload)

- [ ] **T026** Implement BulkImportManager with progress UI in src/sync/bulk-import-manager.ts
  - Implement batch processing with 25 tickets per batch
  - Add cancellation and pause/resume capabilities
  - Integrate with Obsidian Modal for progress display

- [ ] **T027** Update JiraClient for API migration in src/jira-bases-adapter/jira-client.ts
  - **CRITICAL**: Add support for new JQL search endpoints  
  - Implement token-based pagination methods
  - Add rate limiting with token bucket algorithm

### UI Components
- [ ] **T028** Implement SyncStatusView dashboard in src/sync/sync-status-view.ts
  - Extend ItemView for sync statistics display
  - Add manual sync button with loading states
  - Implement auto-refresh of statistics and error logs

- [ ] **T029** Implement JQLAutoSyncSettingTab in src/settings/jql-auto-sync-settings.ts  
  - Extend PluginSettingTab for configuration UI
  - Add JQL query validation with test button
  - Implement sync interval slider and enable/disable toggle

### Command Integration
- [ ] **T030** Add Command Palette entries for auto-sync operations
  - Add "Manual sync" command with loading feedback
  - Add "Open sync settings" command  
  - Add "Show sync status" command for dashboard

## Phase 3.4: Integration

### Plugin Integration
- [ ] **T031** Integrate AutoSyncScheduler with main plugin lifecycle
  - Start scheduler on plugin load if enabled
  - Stop scheduler on plugin unload
  - Handle plugin settings changes and scheduler restart

- [ ] **T032** Integrate BulkImportManager with settings changes
  - Trigger bulk import when auto-sync is first enabled
  - Handle configuration changes during active imports
  - Persist import progress across plugin reloads

- [ ] **T033** Integrate SyncStatusView with workspace layout
  - Register view type with workspace
  - Add view to ribbon icon or status bar
  - Handle view lifecycle and cleanup

### Error Handling & Logging
- [ ] **T034** Implement centralized error handling and logging
  - Add structured logging via Obsidian Notice system
  - Implement error collection and persistence
  - Add user-friendly error messages and recovery suggestions

- [ ] **T035** Implement circuit breaker pattern for API failures
  - Add circuit breaker for consecutive failures (5+ failures → open)
  - Implement half-open state after recovery delay
  - Add circuit state to sync statistics dashboard

### Performance Optimization  
- [ ] **T036** Implement rate limiting and API call optimization
  - Add token bucket algorithm for API calls (<20/minute)
  - Implement request deduplication and caching
  - Add memory management for large ticket sets

## Phase 3.5: Polish

### Unit Tests for Components
- [ ] **T037** [P] Unit tests for AutoSyncScheduler timer logic in tests/unit/auto-sync-scheduler.test.ts
  - **NOTE**: Known Jest timer mocking conflicts - document workarounds
  - Test interval management and failure recovery
  - Test scheduler state persistence

- [ ] **T038** [P] Unit tests for BulkImportManager batch processing in tests/unit/bulk-import-manager.test.ts
  - Test batch size optimization and error handling
  - Test cancellation and resume token management
  - Test progress callback mechanisms

- [ ] **T039** [P] Unit tests for SyncStatusView UI interactions in tests/unit/sync-status-view.test.ts  
  - Test statistics display and refresh logic
  - Test manual sync button and loading states
  - Test error log display and clearing

### Performance & Memory Tests
- [ ] **T040** Performance test for 100 tickets in <30 seconds in tests/performance/sync-performance.test.ts
  - Verify sync speed meets specification requirements
  - Test batch processing efficiency 
  - Monitor API call frequency and rate limiting

- [ ] **T041** Memory test for <50MB with 500 tickets in tests/performance/memory-usage.test.ts
  - Monitor memory usage during large sync operations
  - Test memory cleanup after sync completion
  - Verify no memory leaks across multiple sync cycles

### API Migration Validation
- [ ] **T042** [P] API endpoint verification tests in tests/integration/api-endpoint-validation.test.ts
  - **CRITICAL**: Verify no deprecated endpoint usage
  - Test new endpoint compatibility and field optimization
  - Validate rate limiting respects new API constraints

- [ ] **T043** [P] Pagination compatibility tests in tests/integration/pagination-validation.test.ts
  - Test token-based pagination with large datasets (100+ tickets)
  - Verify nextPageToken handling and edge cases
  - Test pagination resume after interruption

### Documentation & Validation
- [ ] **T044** [P] Update plugin documentation with auto-sync features in docs/auto-sync.md
  - Document JQL query examples and best practices
  - Add troubleshooting guide for common issues
  - Document API migration timeline and impact

- [ ] **T045** [P] Create user migration guide from manual to auto-sync in docs/migration-guide.md
  - Document configuration steps and recommendations
  - Add FAQ for common migration scenarios
  - Document rollback procedures if needed

### Final Integration & Testing
- [ ] **T046** Run complete quickstart validation scenarios
  - Execute all 5 test scenarios from quickstart.md
  - Verify success criteria are met for each scenario
  - Document any deviations or issues found

- [ ] **T047** Performance optimization and memory cleanup
  - Profile memory usage and optimize batch processing
  - Optimize API call patterns and caching
  - Remove any debug code or temporary implementations

- [ ] **T048** Final integration testing with existing plugin features
  - Test compatibility with existing sync functionality
  - Verify no regressions in manual sync operations
  - Test plugin startup/shutdown with auto-sync enabled

- [ ] **T049** Production readiness verification  
  - Verify all error paths have user-friendly messages
  - Test plugin behavior under various network conditions
  - Validate settings persistence across Obsidian restarts

## Dependencies

### Critical Path (API Migration)
- T004 → T024 → T027 → T042 (API migration contract → JQL engine → Jira client → validation)
- T017 → T043 (API integration test → pagination validation)

### Core Dependencies  
- Setup (T001-T003) → All other tasks
- Contract Tests (T004-T006) → Implementation (T024-T030)
- Data Model Tests (T007-T012) → Data Models (T018-T023)
- Integration Tests (T013-T017) → Service Implementation (T024-T027)
- Core Services (T024-T027) → UI Components (T028-T030)
- All Implementation → Integration (T031-T036)
- Integration → Polish (T037-T049)

### Blocking Relationships
- T024 blocks T025, T031 (JQL engine needed for scheduler)
- T025 blocks T031, T032 (scheduler needed for plugin integration)
- T026 blocks T032 (bulk import manager needed for integration)
- T027 blocks T024 (Jira client migration needed for JQL engine)
- T028, T029 block T033 (UI components needed for view integration)

## Parallel Execution Examples

### 🚀 High Performance Task Groups

**Phase 3.2a: Contract Tests (Launch Together)**
```bash
# API Migration Critical - Highest Priority
Task: "Contract test POST /rest/api/3/search/jql endpoint in tests/unit/jql-search-contract.test.ts" 
Task: "Contract test bulk import operations in tests/unit/bulk-import-contract.test.ts"
Task: "Contract test configuration management in tests/unit/config-management-contract.test.ts"
```

**Phase 3.2b: Data Model Tests (Launch Together)**  
```bash
# Independent data structures
Task: "Data model test for JQLAutoSyncConfig in tests/unit/jql-auto-sync-config.test.ts"
Task: "Data model test for SyncProgress in tests/unit/sync-progress.test.ts"
Task: "Data model test for BulkImportProgress in tests/unit/bulk-import-progress.test.ts"
Task: "Data model test for JQLSearchResult in tests/unit/jql-search-result.test.ts"
Task: "Data model test for SyncError in tests/unit/sync-error.test.ts"
Task: "Data model test for SyncStatistics in tests/unit/sync-statistics.test.ts"
```

**Phase 3.2c: Integration Tests (Launch Together)**
```bash
# Independent user scenarios
Task: "Integration test for Basic Auto-Sync Setup in tests/integration/basic-auto-sync.test.ts"
Task: "Integration test for Progressive Bulk Import in tests/integration/bulk-import.test.ts"
Task: "Integration test for Team Query Configuration in tests/integration/team-queries.test.ts"
Task: "Integration test for Error Handling and Recovery in tests/integration/error-handling.test.ts"
Task: "Integration test for API Migration Compatibility in tests/integration/api-migration.test.ts"
```

**Phase 3.3a: Data Models Implementation (Launch Together)**
```bash
# Independent model files
Task: "Implement JQLAutoSyncConfig interface in src/models/jql-auto-sync-config.ts"
Task: "Implement SyncProgress interface in src/models/sync-progress.ts"
Task: "Implement BulkImportProgress interface in src/models/bulk-import-progress.ts"  
Task: "Implement JQLSearchResult interface in src/models/jql-search-result.ts"
Task: "Implement SyncError interface in src/models/sync-error.ts"
Task: "Implement SyncStatistics interface in src/models/sync-statistics.ts"
```

**Phase 3.5a: Polish Tests (Launch Together)**
```bash
# Independent unit tests
Task: "Unit tests for AutoSyncScheduler timer logic in tests/unit/auto-sync-scheduler.test.ts"
Task: "Unit tests for BulkImportManager batch processing in tests/unit/bulk-import-manager.test.ts"
Task: "Unit tests for SyncStatusView UI interactions in tests/unit/sync-status-view.test.ts"
```

**Phase 3.5b: Documentation (Launch Together)**
```bash
# Independent documentation files  
Task: "Update plugin documentation with auto-sync features in docs/auto-sync.md"
Task: "Create user migration guide from manual to auto-sync in docs/migration-guide.md"
Task: "API endpoint verification tests in tests/integration/api-endpoint-validation.test.ts"
Task: "Pagination compatibility tests in tests/integration/pagination-validation.test.ts"
```

## Notes
- [P] tasks = different files, no dependencies, can run in parallel
- **CRITICAL** tasks marked for API migration deadline priority
- Timer mocking issues documented in T037 - known limitation
- All contract and integration tests MUST FAIL before implementation
- Commit after each completed task for proper TDD tracking
- API migration tasks (T004, T017, T024, T027, T042, T043) have highest priority

## Task Generation Rules Applied ✅

1. **From Contracts**: 3 contract files → 3 contract test tasks [P] (T004-T006)
2. **From Data Model**: 6 entities → 6 model test + implementation tasks [P] (T007-T012, T018-T023)  
3. **From User Stories**: 5 scenarios → 5 integration test tasks [P] (T013-T017)
4. **From Libraries**: 4 core services → 4 implementation tasks (T024-T027)
5. **From UI Components**: 2 components → 2 UI tasks (T028-T029)
6. **Ordering**: Setup → Tests → Models → Services → UI → Integration → Polish ✅

## Validation Checklist ✅

- [x] All contracts have corresponding tests (T004-T006)
- [x] All entities have model tasks (T007-T012, T018-T023)
- [x] All tests come before implementation (Phase 3.2 → 3.3)
- [x] Parallel tasks truly independent ([P] marked appropriately)
- [x] Each task specifies exact file path
- [x] No task modifies same file as another [P] task
- [x] API migration priority clearly marked and sequenced
- [x] Performance requirements addressed (T040-T041)
- [x] All quickstart scenarios covered (T013-T017, T046)

---
**Total Tasks**: 49 | **Parallel Tasks**: 23 | **Critical Path**: 8 tasks  
**Estimated Timeline**: 3-4 weeks | **API Migration Deadline**: May 1, 2025 ⚠️