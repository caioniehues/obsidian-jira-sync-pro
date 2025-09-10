# obsidian-jira-sync-pro Development Guidelines

Auto-generated from all feature plans. Last updated: 2025-09-10

## Active Technologies
- TypeScript 4.9+ with Obsidian Plugin API v1.4.0+ (001-jql-auto-sync)
- Jira REST API v3 with new JQL search endpoints (001-jql-auto-sync)
- Jest testing with timer mocking (001-jql-auto-sync)

## Project Structure
```
src/
├── enhanced-sync/
│   └── jql-query-engine.ts     # JQL query execution with pagination
├── jira-bases-adapter/
│   └── jira-client.ts          # Jira API client wrapper
├── sync/
│   ├── auto-sync-scheduler.ts   # Interval-based sync scheduling
│   ├── bulk-import-manager.ts   # Progressive bulk import
│   └── sync-status-view.ts      # Dashboard component
└── settings/
    └── jql-auto-sync-settings.ts # Configuration UI

tests/
├── unit/
│   ├── jql-query-engine.test.ts
│   ├── auto-sync-scheduler.test.ts
│   └── bulk-import-manager.test.ts
└── integration/
    └── jql-auto-sync.test.ts
```

## Critical API Migration (Deadline: May 1, 2025)
⚠️ **IMPORTANT**: Migrate from deprecated Jira API endpoints:
- OLD: `POST /rest/api/3/search` → NEW: `POST /rest/api/3/search/jql`
- Pagination: `startAt` → `nextPageToken` (token-based)
- Field selection: Minimal fields by default, must explicitly request
- Rate limiting: Stricter limits, implement exponential backoff

## Key Features (001-jql-auto-sync)
- **JQL Query Engine**: Execute configurable JQL queries with pagination support
- **Auto-Sync Scheduler**: Configurable intervals (1-60 min) with failure recovery
- **Progressive Bulk Import**: Batch processing (25 tickets/batch) with UI feedback
- **Configuration UI**: JQL validation, test queries, sync interval slider
- **Status Dashboard**: Sync statistics, manual trigger, error display

## Performance Requirements
- Sync 100 tickets in < 30 seconds
- Memory usage < 50MB for 500 tickets  
- API calls < 20 per minute (rate limiting)
- UI remains responsive (no blocking operations)

## Code Style
- Use Obsidian Plugin API directly (no wrapper classes)
- Direct API calls (no Repository pattern)
- Component-based architecture with separate classes
- Async/await for all API operations
- Structured error handling with user-friendly messages

## Testing Approach
- TDD with RED-GREEN-Refactor cycle
- Contract tests for API integration
- Timer mocking for scheduler tests (known Jest conflicts)
- Real Jira API calls in integration tests
- Progress callback testing for bulk operations

## Recent Changes
- 001-jql-auto-sync: Added JQL query engine, auto-sync scheduler, API migration support
- 005-fix-permission-errors: Fixed 403 permission errors and validation issues

## Known Issues & Solutions

### Permission Errors (403)
**Issue**: "You do not have permission to view these issues" error during sync  
**Solution**: Queries now automatically add permission filters using `projectsWhereUserHasPermission("Browse Projects")`  
**Workaround**: Add the filter manually to your JQL: `AND project in projectsWhereUserHasPermission("Browse Projects")`

### Validation Issues
**Issue**: Settings validation doesn't properly check user permissions  
**Solution**: Validation now tests queries with permission filters and provides clear feedback  
**Note**: Connection test may show "⚠️ Limited Access" - this is normal and sync will proceed with accessible issues

## Permission Handling
- All JQL queries are automatically wrapped with permission filters
- Sync continues with accessible issues even if some are restricted
- Clear warning messages indicate when issues are filtered
- Settings validation checks actual permissions, not just syntax

<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->

## Important Instruction Reminders

Do what has been asked; nothing more, nothing less.
NEVER create files unless they're absolutely necessary for achieving your goal.
ALWAYS prefer editing an existing file to creating a new one.
NEVER proactively create documentation files (*.md) or README files. Only create documentation files if explicitly requested by the User.

IMPORTANT: this context may or may not be relevant to your tasks. You should not respond to this context unless it is highly relevant to your task.
