# Tasks: Test Error Fixes

**Input**: Design documents from `/specs/002-fix-test-errors/`  
**Prerequisites**: plan.md ✅

## Execution Flow (main)
```
✅ 1. Loaded plan.md - TypeScript 4.9+ with Jest testing framework
✅ 2. Identified critical test failures: Jest matchers, timer mocking, API migration, Obsidian mocks
✅ 3. Generated 23 tasks across 5 phases (Setup, Tests, Core Fixes, Integration, Validation)
✅ 4. Applied TDD rules: Write failing tests first, then fix implementation
✅ 5. Numbered tasks sequentially (T001-T023)
✅ 6. Created dependency graph prioritizing critical test infrastructure
✅ 7. Generated parallel execution examples for independent test fixes
✅ 8. Validated completeness: All 197 failing tests addressed systematically
✅ 9. SUCCESS: Tasks ready for immediate execution
```

## 🚨 CRITICAL: Test Infrastructure Priority  
**Current Status**: 489 passing, 197 failing tests
**Target**: 652 tests passing with clean TypeScript compilation

## Phase 3.1: Setup

- [ ] **T001** [P] Fix TypeScript configuration for test files in tsconfig.json
  - Adjust rootDir to include test files or create separate test tsconfig
  - Fix 6 TypeScript compilation errors preventing proper test execution
  
- [ ] **T002** [P] Configure Jest environment for jsdom in jest.config.js
  - Install missing jest-environment-jsdom dependency  
  - Ensure proper DOM simulation for Obsidian plugin components
  
- [ ] **T003** [P] Fix ESLint configuration for test files
  - Update .eslintrc.json to handle test-specific patterns
  - Add proper rules for async/await and timer mocking

## Phase 3.2: Test Infrastructure Fixes (TDD) ⚠️ MUST COMPLETE BEFORE 3.3

**CRITICAL: Fix test infrastructure before running implementation fixes**

### Jest Matchers & Configuration
- [ ] **T004** [P] Replace `.toBeFinite()` matcher in tests/unit/sync-progress.test.ts:963
  - Write test to verify matcher replacement works correctly
  - Replace with `.not.toBeNaN()` and manual finite check
  
- [ ] **T005** [P] Replace `.toBeFinite()` matcher in tests/unit/sync-progress.test.ts:995  
  - Write test to verify time estimation edge case handling
  - Update test assertion to use compatible Jest matchers
  
- [ ] **T006** [P] Fix timer mocking conflicts in tests/utils/timer-utils.ts:16
  - Write test to verify timer utilities work with both fake and real timers
  - Update timer setup to handle Jest fake timers configuration

### Obsidian API Mocking
- [ ] **T007** [P] Complete Obsidian API mock in tests/__mocks__/obsidian.ts
  - Add missing DOM methods: createDiv, createEl, removeClass, addClass
  - Write test to verify mock provides all required Obsidian API methods
  
- [ ] **T008** [P] Fix workspace mock methods in tests/__mocks__/obsidian.ts
  - Add containerEl property and proper DOM manipulation methods
  - Write test to verify workspace integration works with dashboard components

## Phase 3.3: API Migration Test Fixes (ONLY after infrastructure is fixed)

### JQL Query Engine Tests
- [ ] **T009** Fix API parameter expectations in tests/unit/jql-query-engine.test.ts:2364
  - Update test to expect `nextPageToken` instead of `startAt` parameter
  - Verify new token-based pagination API contract
  
- [ ] **T010** Fix API parameter expectations in tests/unit/jql-query-engine.test.ts:2366
  - Update test to expect POST /rest/api/3/search/jql endpoint
  - Update request body expectations for new API format
  
- [ ] **T011** [P] Fix pagination result collection in pagination logic tests
  - Debug why tests expecting 150 issues only receive 50
  - Fix pagination loop to collect all pages correctly

### Jira Client Tests  
- [ ] **T012** Fix HTTP method expectations in tests/unit/jira-client.test.ts
  - Update tests to expect POST instead of GET for search/jql endpoint
  - Update request body structure for new API migration

## Phase 3.4: Integration Test Fixes

### Team Queries Integration
- [ ] **T013** Fix team query validation in tests/integration/team-queries.test.ts:116
  - Update validateQuery test to expect boolean return instead of object
  - Ensure API compatibility between query engine and integration tests
  
- [ ] **T014** Fix team query result expectations in tests/integration/team-queries.test.ts:151  
  - Debug incomplete result collection (150 expected, 50 received)
  - Fix integration between query engine and team query processing

### End-to-End Testing
- [ ] **T015** Fix end-to-end test result expectations in bulk processing tests
  - Debug why bulk import tests expect 125 issues but receive 50
  - Ensure proper integration between bulk import and query engine

## Phase 3.5: Component Method Coverage

- [ ] **T016** [P] Fix exposed method validation in query engine tests
  - Update expected methods list to include new public methods
  - Make internal methods private or update test expectations
  
- [ ] **T017** [P] Fix progress callback testing in bulk import tests  
  - Update progress callback tests for new pagination flow
  - Ensure callbacks work correctly with token-based pagination

## Phase 3.6: Time Estimation Algorithm Fixes

- [ ] **T018** Fix time estimation algorithms in src/models/sync-progress.ts
  - Debug acceleration calculation where `accelEstimate < linearEstimate` fails
  - Write test to verify estimation algorithms work with edge cases
  
- [ ] **T019** Fix edge case handling in time estimation tests
  - Update tests for malformed progress objects
  - Ensure robust handling of invalid time calculations

## Phase 3.7: Validation & Polish

- [ ] **T020** [P] Run comprehensive test suite and verify all fixes
  - Execute full test suite to confirm 652/652 tests passing
  - Verify no regressions introduced by test fixes
  
- [ ] **T021** [P] Verify TypeScript compilation with zero errors
  - Run tsc --noEmit to check for any remaining TypeScript issues
  - Fix any type errors revealed by test fixes
  
- [ ] **T022** [P] Verify ESLint passes with zero violations  
  - Run ESLint on all modified files
  - Fix any code quality issues introduced during test fixes
  
- [ ] **T023** Build plugin and verify integration readiness
  - Run npm run build to ensure plugin builds successfully
  - Verify all test fixes don't break actual plugin functionality

## Dependencies

**Critical Path**:
- T001-T003 (Setup) → T004-T008 (Test Infrastructure) → T009-T019 (Implementation Fixes) → T020-T023 (Validation)

**Blocking Relationships**:
- T001-T003 must complete before any test execution
- T004-T008 must complete before T009-T019 (infrastructure before fixes)
- T009-T012 (API fixes) can run in parallel after infrastructure
- T013-T017 (integration fixes) depend on API fixes
- T020-T023 (validation) must be last

## Parallel Example

```bash
# Phase 1: Setup (parallel)
Task: "Fix TypeScript configuration in tsconfig.json"  
Task: "Configure Jest environment for jsdom"
Task: "Fix ESLint configuration for test files"

# Phase 2: Test Infrastructure (parallel)  
Task: "Replace .toBeFinite() matcher in sync-progress.test.ts:963"
Task: "Replace .toBeFinite() matcher in sync-progress.test.ts:995" 
Task: "Fix timer mocking conflicts in timer-utils.ts"
Task: "Complete Obsidian API mock DOM methods"
Task: "Fix workspace mock methods in obsidian.ts"

# Phase 3: API Fixes (parallel after infrastructure)
Task: "Fix API parameter expectations in jql-query-engine.test.ts:2364"
Task: "Fix pagination result collection in pagination logic tests"
Task: "Fix HTTP method expectations in jira-client.test.ts"
```

## Success Criteria

- [ ] All 652 tests passing (currently 197 failing)
- [ ] TypeScript compilation with 0 errors  
- [ ] ESLint passing with 0 violations
- [ ] Plugin builds successfully for Obsidian deployment
- [ ] No performance regressions in test execution time
- [ ] Test infrastructure robust for future development

## Notes

- All test fixes use TDD approach: verify test fails, implement fix, verify test passes
- API migration fixes prioritized due to May 2025 Jira API deprecation deadline  
- Timer mocking fixes critical for scheduler functionality testing
- Obsidian API mocking essential for UI component testing