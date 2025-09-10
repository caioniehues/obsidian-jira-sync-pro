# Code Style and Conventions

## TypeScript Conventions
- **Target**: ES2020
- **Module**: ESNext
- **Strict Mode**: Enabled with strict type checking
- **Async/Await**: Required for all asynchronous operations
- **Error Handling**: Structured with user-friendly messages

## Architecture Patterns
- **Obsidian Plugin API**: Use directly without wrapper classes
- **Component-based**: Separate classes for different concerns
- **Direct API Calls**: No Repository pattern
- **File Organization**: Feature-based directory structure

## Naming Conventions
- **Files**: kebab-case (e.g., `jql-query-engine.ts`)
- **Classes**: PascalCase (e.g., `JQLQueryEngine`)
- **Interfaces**: PascalCase with 'I' prefix optional
- **Functions/Methods**: camelCase
- **Constants**: UPPER_SNAKE_CASE for globals
- **Private members**: Prefix with underscore (e.g., `_privateMethod`)

## Project Structure
```
src/
├── enhanced-sync/        # Core sync components
├── jira-bases-adapter/   # Jira API integration
├── sync/                 # Sync management components
├── settings/             # Configuration UI
├── models/               # Data models
├── types/                # TypeScript type definitions
└── utils/                # Utility functions

tests/
├── unit/                 # Unit tests
├── integration/          # Integration tests
└── __mocks__/           # Mock implementations
```

## Testing Conventions
- **TDD Approach**: RED-GREEN-Refactor cycle
- **Test Files**: `*.test.ts` pattern
- **Mock Files**: In `__mocks__` directory
- **Coverage Target**: Aim for >80% coverage

## Documentation
- **JSDoc**: Use for public APIs
- **Comments**: Explain "why" not "what"
- **README files**: In major directories

## Performance Guidelines
- **Pagination**: Use token-based pagination
- **Rate Limiting**: < 20 API calls per minute
- **Memory**: < 50MB for 500 tickets
- **Response Time**: < 30 seconds for 100 tickets
- **UI**: Non-blocking operations

## Error Handling
- **Try-Catch**: For all async operations
- **User Messages**: Clear and actionable
- **Logging**: Use console.warn for recoverable errors
- **Validation**: Input validation before processing