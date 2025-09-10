# Task Completion Checklist

## When a Task is Completed

### 1. Run Tests
```bash
npm test                 # Ensure all tests pass
npm run test:coverage    # Check coverage hasn't decreased
```

### 2. Code Quality Checks
```bash
npm run lint            # Check for ESLint violations
npm run lint:fix        # Auto-fix if needed
tsc --noEmit           # Verify TypeScript compilation
```

### 3. Build Verification
```bash
npm run build          # Ensure production build succeeds
# Check output size in console - should be ~300KB
```

### 4. Manual Testing (if applicable)
- If UI changes: Test in Obsidian by reloading plugin (Cmd+R)
- If API changes: Test with real Jira instance
- If sync logic changes: Test with sample data

### 5. Commit Changes
```bash
git add .
git commit -m "feat: [description]" # or fix:, docs:, test:, refactor:
git push
```

## Commit Message Format
- `feat:` - New feature
- `fix:` - Bug fix
- `test:` - Test changes
- `docs:` - Documentation only
- `refactor:` - Code refactoring
- `perf:` - Performance improvements
- `chore:` - Build process or auxiliary tool changes

## Before Merging to Main
1. All tests must pass (652 total tests expected)
2. No TypeScript errors
3. ESLint passes with minimal warnings
4. Plugin builds successfully
5. Manual testing completed if applicable

## Performance Validation
- Sync 100 tickets should complete in < 30 seconds
- Memory usage should stay under 50MB
- API calls should not exceed 20 per minute

## Documentation Updates
- Update CLAUDE.md if architecture changes
- Update README.md for new features
- Add JSDoc comments for new public APIs