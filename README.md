# Obsidian Jira Sync Pro

Enhanced Obsidian plugin for automatic Jira ticket synchronization with JQL-based queries, auto-sync scheduling, and bulk import capabilities.

## Features

- 🔍 **JQL-based Sync**: Use powerful JQL queries to select exactly which tickets to sync
- ⏰ **Auto-Sync Scheduler**: Configurable automatic synchronization (1-60 minute intervals)
- 📦 **Bulk Import**: Progressive import with progress tracking for initial setup
- 🔄 **Bidirectional Sync**: Keep Obsidian and Jira in sync (coming soon)
- 📊 **Status Dashboard**: Monitor sync health and statistics
- ⚡ **Performance Optimized**: Pagination, field selection, and rate limit handling
- 🔌 **Plugin Integration Bridge**: Seamlessly integrates with Tasks, Dataview, Calendar, and more
- 🏢 **Status-Based Organization**: Auto-organize tickets by status (Active/Archived)
- 🔐 **Permission Handling**: Automatic filtering of inaccessible tickets

## Installation

### From Release
1. Download the latest release from GitHub
2. Extract files to `.obsidian/plugins/obsidian-jira-sync-pro/`
3. Enable the plugin in Obsidian Settings

### Development Setup
```bash
# Clone the repository
git clone https://github.com/yourusername/obsidian-jira-sync-pro.git
cd obsidian-jira-sync-pro

# Install dependencies
npm install

# Build the plugin
npm run build

# For development with auto-rebuild
npm run dev
```

## Configuration

1. Open Settings → Jira Sync Pro
2. Enter your Jira credentials:
   - **Jira URL**: Your Atlassian instance (e.g., `https://company.atlassian.net`)
   - **Username**: Your email address
   - **API Token**: Generate from [Atlassian Account Settings](https://id.atlassian.com/manage-profile/security/api-tokens)
3. Configure sync settings:
   - **JQL Query**: Define which tickets to sync
   - **Auto-sync**: Enable/disable automatic synchronization
   - **Sync Interval**: Set frequency (1-60 minutes)
   - **Sync Folder**: Where to store ticket notes

## Plugin Integrations

The Integration Bridge enables seamless communication between Jira Sync Pro and other Obsidian plugins:

### Supported Plugins
- **Tasks Plugin**: Converts Jira tickets to task format with priority emojis
- **Dataview**: Query Jira data directly in Dataview queries
- **Calendar**: Sync due dates to calendar views
- **Day Planner**: Create time blocks from Jira tickets
- **Templater**: Use Jira data in templates
- **Kanban**: Sync ticket status with Kanban boards (coming soon)

### Enabling Integrations
1. Install the desired plugin from Community Plugins
2. Open Jira Sync Pro settings
3. Navigate to "Plugin Integrations" section
4. Toggle on the plugins you want to integrate
5. Run a sync to activate the integration

## Usage

### Commands

Access via Command Palette (Ctrl/Cmd + P):
- `Jira Sync: Manual sync now` - Trigger immediate synchronization
- `Jira Sync: Bulk import tickets` - Import all matching tickets
- `Jira Sync: Show sync status` - View sync statistics
- `Jira Sync: Open sync dashboard` - Enhanced dashboard with real-time monitoring
- `Jira Sync: Test connection` - Verify Jira credentials and connectivity
- `Jira Sync: Show plugin integration status` - View compatible plugin integrations
- `Jira Sync: Test all integrations` - Verify plugin bridge connections

### JQL Query Examples

```sql
-- Active tickets assigned to me
assignee = currentUser() AND status NOT IN (Done, Closed)

-- Sprint tickets
sprint in openSprints() AND project = "PROJ"

-- High priority bugs
priority in (Critical, High) AND type = Bug

-- Recent updates
updated >= -7d AND assignee = currentUser()
```

## Development

### Project Structure
```
obsidian-jira-sync-pro/
├── src/
│   ├── main.ts                 # Plugin entry point
│   ├── enhanced-sync/           # Core sync components
│   │   ├── jql-query-engine.ts # JQL query execution
│   │   ├── auto-sync-scheduler.ts # Scheduling system
│   │   └── bulk-import-manager.ts # Bulk import manager
│   ├── jira-bases-adapter/     # Jira API integration
│   │   └── jira-client.ts      # API client
│   ├── integrations/           # Plugin integration system
│   │   ├── IntegrationBridge.ts # Central coordinator
│   │   ├── EventBus.ts         # Event-driven communication
│   │   ├── PluginRegistry.ts   # Plugin discovery
│   │   └── adapters/           # Plugin-specific adapters
│   │       ├── TasksPluginAdapter.ts
│   │       ├── DataviewAdapter.ts
│   │       └── ...             # Other plugin adapters
│   └── services/               # Core services
│       └── simple-note-service.ts # Note creation/management
├── tests/                       # Test suites
├── manifest.json               # Plugin metadata
└── package.json               # Dependencies
```

### Testing
```bash
npm test              # Run all tests
npm run test:watch    # Watch mode
npm run test:coverage # Coverage report
```

### Building
```bash
npm run build    # Production build
npm run dev      # Development mode with watch
npm run lint     # Check code quality
```

## Current Status

✅ **Completed**:
- JQL Query Engine with pagination and error handling
- Auto-Sync Scheduler with configurable intervals
- Jira API client with authentication
- Settings UI with configuration options
- Manual sync command
- Bulk Import Manager with progress tracking
- Enhanced Configuration UI with validation
- Status Dashboard with real-time monitoring
- Plugin Integration Bridge for seamless plugin communication
- Status-based ticket organization (Active/Archived)
- Permission-aware sync with automatic filtering

🚧 **In Progress**:
- Full bidirectional sync
- Advanced conflict resolution
- Custom field mapping UI

## Contributing

Contributions are welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Submit a pull request

## License

MIT

## Support

- Report issues on [GitHub Issues](https://github.com/yourusername/obsidian-jira-sync-pro/issues)
- Check the [Wiki](https://github.com/yourusername/obsidian-jira-sync-pro/wiki) for documentation

## Acknowledgments

Built for the Obsidian community to bridge the gap between Jira project management and Obsidian knowledge management.