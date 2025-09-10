# Suggested Commands for Development

## Build Commands
```bash
npm run build        # Production build
npm run dev          # Development build with watch mode
npm run quick        # Quick build and notify to reload Obsidian
npm run build:strict # Build with TypeScript strict checking
```

## Testing Commands
```bash
npm test             # Run all tests
npm run test:watch   # Run tests in watch mode
npm run test:coverage # Generate test coverage report
```

## Code Quality Commands
```bash
npm run lint         # Run ESLint on src/**/*.ts
npm run lint:fix     # Auto-fix ESLint issues
tsc --noEmit        # TypeScript type checking without build
```

## Utility Commands
```bash
npm run clean        # Clean build artifacts and caches
npm run setup        # Run development setup script (./dev-tools.sh)
```

## Git Commands (Darwin/macOS)
```bash
git status           # Check current changes
git add .            # Stage all changes
git commit -m "msg"  # Commit with message
git push             # Push to remote
git log --oneline    # View commit history
```

## File System Commands (Darwin/macOS)
```bash
ls -la               # List all files with details
find . -name "*.ts"  # Find TypeScript files
grep -r "pattern"    # Recursive text search
open .               # Open current directory in Finder
```

## Development Workflow
1. Make changes to code
2. Run `npm test` to verify tests pass
3. Run `npm run lint` to check code quality
4. Run `npm run build` to build plugin
5. Reload Obsidian (Cmd+R) to see changes

## Specific Plugin Paths
- **Development Directory**: `/Users/caio.niehues/Developer/obsidian-jira-sync-pro`
- **Vault Plugin Directory**: `/Users/caio.niehues/ObsidianVault/.obsidian/plugins/obsidian-jira-sync-pro`