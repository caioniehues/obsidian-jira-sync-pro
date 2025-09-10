# Tasks: Fix Runtime Errors

**Input**: Design documents from `/specs/003-fix-runtime-errors/`  
**Prerequisites**: plan.md ✅

## Execution Flow (main)
```
✅ 1. Loaded plan.md - Runtime error fixes for Obsidian plugin
✅ 2. Identified critical issues: Settings undefined, Auth errors, Missing error handling
✅ 3. Generated 24 tasks across 5 phases (Setup, Tests, Core Fixes, Integration, Validation)
✅ 4. Applied TDD rules: Write failing tests first, then fix implementation
✅ 5. Numbered tasks sequentially (T001-T024)
✅ 6. Created dependency graph with initialization priority
✅ 7. Generated parallel execution examples for independent fixes
✅ 8. SUCCESS: Tasks ready for immediate execution
```

## 🚨 CRITICAL: Plugin Not Functional
**Current Status**: Plugin crashes on load with settings undefined
**Target**: Zero runtime errors, successful Jira API authentication

## Phase 3.1: Setup & Analysis

- [ ] **T001** Analyze plugin initialization sequence in src/main.ts
  - Read current onload() implementation
  - Identify where settings are accessed before initialization
  - Document the proper initialization order needed
  
- [ ] **T002** [P] Create test file for plugin initialization in tests/integration/plugin-init.test.ts
  - Test settings loading sequence
  - Test default settings fallback
  - Test error handling during init

- [ ] **T003** [P] Create test file for Jira authentication in tests/integration/jira-auth.test.ts
  - Test credential validation
  - Test auth header generation
  - Test 401/403 error handling

## Phase 3.2: Tests First (TDD) ⚠️ MUST COMPLETE BEFORE 3.3

**CRITICAL: These tests MUST be written and MUST FAIL before ANY implementation**

### Settings Initialization Tests
- [ ] **T004** [P] Write test for default settings creation in tests/integration/plugin-init.test.ts
  - Test that plugin creates default settings if none exist
  - Test that settings are available immediately after onload()
  - Verify no undefined settings access

- [ ] **T005** [P] Write test for settings persistence in tests/integration/plugin-init.test.ts
  - Test loading saved settings from disk
  - Test settings migration from old versions
  - Test settings validation on load

### Authentication Tests
- [ ] **T006** [P] Write test for credential validation in tests/integration/jira-auth.test.ts
  - Test empty credentials handling
  - Test invalid URL format detection
  - Test missing API token detection

- [ ] **T007** [P] Write test for auth header generation in tests/unit/jira-client.test.ts
  - Test Basic auth header format
  - Test token encoding
  - Test header presence in requests

- [ ] **T008** [P] Write test for permission error handling in tests/integration/jira-auth.test.ts
  - Test 401 Unauthorized response handling
  - Test 403 Forbidden response handling
  - Test user notification on auth failure

## Phase 3.3: Core Implementation (ONLY after tests are failing)

### Fix Settings Initialization
- [ ] **T009** Fix settings initialization in src/main.ts
  - Move settings load to first line of onload()
  - Add DEFAULT_SETTINGS constant with all required fields
  - Implement loadSettings() with proper async handling
  - Add settings validation before use

- [ ] **T010** Add settings validation in src/settings/settings-validator.ts
  - Validate all required fields present
  - Add type guards for settings object
  - Provide default values for missing fields
  - Log validation errors for debugging

- [ ] **T011** Fix settings access in src/sync/auto-sync-scheduler.ts
  - Add null checks before accessing settings
  - Use optional chaining for nested properties
  - Provide fallback values for missing settings

### Fix Authentication
- [ ] **T012** Fix auth header generation in src/jira-bases-adapter/jira-client.ts
  - Ensure email and apiToken are present
  - Properly encode credentials to Base64
  - Add 'Authorization' header to all requests
  - Log auth issues for debugging

- [ ] **T013** Add credential validation in src/jira-bases-adapter/jira-client.ts
  - Validate URL format
  - Check email format
  - Verify API token not empty
  - Return clear error messages

- [ ] **T014** Implement test connection in src/jira-bases-adapter/jira-client.ts
  - Add testConnection() method
  - Use lightweight API endpoint (e.g., /myself)
  - Return success/failure with clear message
  - Cache valid credentials

## Phase 3.4: Error Handling

- [ ] **T015** Add global error handler in src/main.ts
  - Wrap onload() in try-catch
  - Add window.onerror handler
  - Log errors with context
  - Show user-friendly notifications

- [ ] **T016** [P] Fix uncaught promise rejections in src/sync/auto-sync-scheduler.ts
  - Add try-catch to performSync()
  - Handle async errors in callbacks
  - Add .catch() to all promises
  - Log errors with stack traces

- [ ] **T017** [P] Fix error propagation in src/enhanced-sync/jql-query-engine.ts
  - Catch API errors at source
  - Transform technical errors to user messages
  - Add error recovery strategies
  - Implement retry with backoff

- [ ] **T018** [P] Add user notifications in src/ui/notifications.ts
  - Create notification service
  - Show auth errors clearly
  - Provide actionable error messages
  - Add "Open Settings" links

## Phase 3.5: Integration & Testing

- [ ] **T019** Test plugin initialization sequence
  - Manually test in Obsidian
  - Verify settings load correctly
  - Check no console errors on startup
  - Confirm UI components render

- [ ] **T020** Test Jira authentication flow
  - Test with valid credentials
  - Test with invalid credentials
  - Test with expired token
  - Verify error messages display

- [ ] **T021** Test error recovery
  - Disconnect network and test
  - Use invalid Jira URL
  - Test with rate limited API
  - Verify graceful degradation

## Phase 3.6: Validation & Polish

- [ ] **T022** [P] Run full test suite
  - Execute npm test
  - Verify all new tests pass
  - Check no regression in existing tests
  - Generate coverage report

- [ ] **T023** [P] Build and install plugin
  - Run npm run build
  - Copy to Obsidian vault
  - Test full sync workflow
  - Verify no runtime errors

- [ ] **T024** Update documentation
  - Document credential setup
  - Add troubleshooting guide
  - Update error messages list
  - Create auth setup video/gif

## Dependencies

**Critical Path**:
- T001-T003 (Analysis) → T004-T008 (Tests) → T009-T018 (Implementation) → T019-T024 (Validation)

**Blocking Relationships**:
- T001 must complete before T009 (need to understand current state)
- T004-T008 must fail before implementing T009-T018
- T009 (settings fix) blocks everything else
- T012-T014 (auth) must complete before T020

## Parallel Example

```bash
# Phase 1: Analysis & Test Creation (parallel)
Task: "Create test file for plugin initialization"
Task: "Create test file for Jira authentication"

# Phase 2: Write Tests (parallel)
Task: "Write test for default settings creation"
Task: "Write test for settings persistence"
Task: "Write test for credential validation"
Task: "Write test for auth header generation"
Task: "Write test for permission error handling"

# Phase 3: Error Handling Fixes (parallel after core fixes)
Task: "Fix uncaught promise rejections in scheduler"
Task: "Fix error propagation in query engine"
Task: "Add user notifications service"
```

## Success Criteria

- [ ] Plugin loads without any console errors
- [ ] Settings properly initialized before use
- [ ] Jira API authentication successful
- [ ] No uncaught promise rejections
- [ ] Clear error messages for all failure cases
- [ ] All tests passing (including new auth tests)

## Notes

- Fix settings initialization FIRST - it blocks everything
- Test with real Jira instance to verify auth
- Use defensive programming - check everything
- Log errors for debugging but show user-friendly messages
- Consider adding settings migration for existing users