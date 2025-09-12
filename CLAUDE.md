# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Development
```bash
npm run dev          # Build with watch mode for development
npm run build        # Production build
npm run quick        # Build + reminder to reload Obsidian (Cmd+R)
npm run clean        # Clean build artifacts
```

### Testing
```bash
npm test                    # Run all tests
npm run test:watch         # Watch mode for TDD
npm run test:coverage      # Generate coverage report
npm test -- --testPathPattern=<pattern>  # Run specific test file/pattern
npm test -- -t "<test name>"             # Run specific test by name
```

### Code Quality
```bash
npm run lint         # Check code quality
npm run lint:fix     # Auto-fix linting issues
```

## Architecture Overview

This is an Obsidian plugin for syncing Jira tickets, built with TypeScript and the Obsidian Plugin API. The codebase follows a modular architecture with clear separation of concerns:

### Core Components

1. **Main Plugin Entry** (`src/main.ts`)
   - Initializes all components
   - Manages plugin lifecycle
   - Coordinates between services

2. **Sync Engine** (`src/enhanced-sync/`)
   - `JQLQueryEngine`: Executes JQL queries with pagination
   - `AutoSyncScheduler`: Manages periodic sync operations
   - `BulkImportManager`: Handles initial large-scale imports

3. **Integration Layer** (`src/integrations/`)
   - `IntegrationBridge`: Central coordinator for plugin-to-plugin communication
   - `EventBus`: Event-driven communication system
   - `PluginRegistry`: Discovers and manages other Obsidian plugins
   - Enables communication with task management plugins like Tasks, Dataview, etc.

4. **Jira API Client** (`src/jira-bases-adapter/jira-client.ts`)
   - Wraps Jira REST API v3
   - Handles authentication and rate limiting
   - Migrating to new `/search/jql` endpoint (deadline: May 1, 2025)

5. **Note Management** (`src/services/simple-note-service.ts`)
   - Creates and updates Obsidian notes from Jira tickets
   - Manages folder structure
   - Handles note metadata and frontmatter

## Development Patterns

### Plugin Development
- Always test credentials before initializing components
- Use Obsidian's Notice API for user feedback
- Components should fail gracefully with meaningful error messages

### Testing Approach
- Mock Obsidian API using `tests/__mocks__/obsidian.ts`
- Use `jest.useFakeTimers()` explicitly in tests that need timer control
- Factory pattern for test data creation (`tests/factories/`)
- Integration tests should use real API calls when possible

### Error Handling
- Permission errors (403) are handled by adding `projectsWhereUserHasPermission` filters
- All API errors should be caught and displayed to users via Notice
- Sync operations continue with accessible issues even if some fail

## API Migration Notes

Critical migration from deprecated Jira endpoints by May 1, 2025:
- Old: `POST /rest/api/3/search`
- New: `POST /rest/api/3/search/jql`
- Token-based pagination: `nextPageToken` instead of `startAt`
- Must explicitly request fields (minimal by default)

## Key Settings

Settings are managed through `JiraSyncProSettings` interface:
- `jiraUrl`, `jiraUsername`, `jiraApiToken`: Authentication
- `jqlQuery`: JQL query for filtering tickets
- `syncInterval`: Auto-sync frequency (1-60 minutes)
- `syncFolder`: Target folder for ticket notes

## Project-Specific Considerations

1. **Build Output**: Vite builds to `main.js` in project root (not `dist/`)
2. **Obsidian Reload**: After building, reload Obsidian with Cmd+R to see changes
3. **Timer Testing**: Tests using timers must explicitly call `jest.useFakeTimers()` due to Jest conflicts
4. **Permission Handling**: All JQL queries automatically wrapped with permission filters