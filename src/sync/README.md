# Auto-Sync Scheduler Implementation

This directory contains the complete implementation of the auto-sync scheduler for the Obsidian Jira Sync Pro plugin.

## Overview

The auto-sync scheduler provides automatic, configurable synchronization of Jira tickets with your Obsidian vault. It includes failure recovery, retry logic, memory management, and seamless integration with the Obsidian plugin lifecycle.

## Files Structure

```
src/sync/
├── auto-sync-scheduler.ts          # Core scheduler implementation
├── scheduler-integration.ts        # Obsidian plugin integration utilities
├── plugin-integration-example.ts   # Example integration code for main.ts
└── README.md                      # This file

tests/unit/
└── auto-sync-scheduler.test.ts     # Comprehensive test suite
```

## Core Features

### ✅ Configurable Sync Intervals (1-60 minutes)
- Flexible interval configuration from 1 to 60 minutes
- Real-time interval updates without restart
- Proper timer management and cleanup

### ✅ Failure Recovery and Retry Logic
- Exponential backoff with configurable multiplier
- Distinction between retryable and non-retryable errors
- Maximum retry attempts with intelligent delay calculation
- Rate limiting and server error handling

### ✅ Integration with JQL Query Engine
- Seamless integration with existing `JQLQueryEngine`
- Progress callbacks for real-time UI updates
- Memory-efficient batch processing
- Cancellation support with AbortController

### ✅ Timer-based Scheduling with Proper Cleanup
- NodeJS Timer management for reliable scheduling
- Graceful shutdown with proper cleanup
- Prevention of memory leaks and dangling timers
- Concurrent operation prevention

### ✅ Status Reporting and Error Handling
- Comprehensive status tracking (running, enabled, next sync time)
- Real-time progress reporting with phase tracking
- Error collection with history management (last 10 errors)
- Performance statistics (average duration, success rate)

### ✅ Memory-Efficient Operation (<50MB for 500 tickets)
- Active memory monitoring during sync operations
- Configurable memory limits with automatic abort
- Batch processing to prevent memory spikes
- Cleanup of resources after operations

## Quick Start

### 1. Basic Integration

```typescript
import { JiraClient } from '../jira-bases-adapter/jira-client';
import { AutoSyncScheduler, AutoSyncConfig } from './auto-sync-scheduler';
import { SchedulerIntegration } from './scheduler-integration';

// In your plugin's onload() method
const jiraClient = new JiraClient();
jiraClient.configure({
  baseUrl: 'https://your-domain.atlassian.net',
  email: 'your-email@domain.com',
  apiToken: 'your-api-token'
});

const schedulerIntegration = new SchedulerIntegration(plugin, jiraClient);
await schedulerIntegration.initialize();
```

### 2. Configuration Example

```typescript
const config: AutoSyncConfig = {
  // Timing
  intervalMinutes: 15,           // Sync every 15 minutes
  enableAutoSync: true,          // Enable automatic syncing
  
  // JQL Configuration
  jql: 'assignee = currentUser() AND status != Done',
  maxResults: 500,               // Memory management
  batchSize: 25,                 // Optimal for Obsidian
  
  // Retry Configuration
  maxRetries: 3,                 // Retry up to 3 times
  retryBackoffMultiplier: 2.0,   // Exponential backoff
  maxRetryDelayMinutes: 15,      // Max delay between retries
  
  // Resource Management
  memoryLimitMB: 50,             // 50MB memory limit
  timeoutMinutes: 10             // 10 minute operation timeout
};

scheduler.updateConfig(config);
```

### 3. Manual Operations

```typescript
// Trigger manual sync
try {
  const result = await schedulerIntegration.triggerManualSync();
  if (result.success) {
    console.log(`Synced ${result.ticketsProcessed} tickets`);
  }
} catch (error) {
  console.error('Sync failed:', error);
}

// Cancel running sync
await schedulerIntegration.cancelCurrentSync();

// Get current status
const status = schedulerIntegration.getStatus();
console.log(`Next sync: ${new Date(status.nextSyncTime).toLocaleString()}`);
```

### 4. Status Monitoring

```typescript
// Register for status updates
schedulerIntegration.onStatusUpdate((status) => {
  console.log(`Scheduler status: ${status.isRunning ? 'Running' : 'Idle'}`);
  if (status.currentProgress) {
    console.log(`Progress: ${status.currentProgress.current}/${status.currentProgress.total}`);
  }
});

// Register for progress updates
schedulerIntegration.onProgressUpdate((progress) => {
  const percentage = Math.round((progress.current / progress.total) * 100);
  console.log(`${progress.phase}: ${percentage}%`);
});
```

## Architecture

### Core Components

```
┌─────────────────────────────────────┐
│        AutoSyncScheduler            │
├─────────────────────────────────────┤
│ - Timer Management                  │
│ - Retry Logic                       │
│ - Memory Monitoring                 │
│ - Status Tracking                   │
└─────────┬───────────────────────────┘
          │
          ├─→ JQLQueryEngine (Query Execution)
          ├─→ JiraClient (API Communication)
          └─→ SyncProgress (Progress Tracking)

┌─────────────────────────────────────┐
│      SchedulerIntegration           │
├─────────────────────────────────────┤
│ - Plugin Lifecycle                  │
│ - Settings Persistence              │
│ - UI Notifications                  │
│ - Callback Management               │
└─────────────────────────────────────┘
```

### State Management

The scheduler maintains several types of state:

1. **Configuration State**: Sync intervals, JQL queries, retry settings
2. **Runtime State**: Current operation status, next sync time, progress
3. **Statistics State**: Success counts, error history, performance metrics
4. **Resource State**: Memory usage, active timers, abort controllers

### Error Handling Strategy

```
┌─── Error Occurs ───┐
│                    │
├─ Retryable? ──────┐│
│  (Network, 5xx)   ││
│                   ││
│ ┌─ YES ───────────┘│
│ │                  │
│ ├─ Max Retries? ───┼─ NO ──┐
│ │                  │       │
│ │ ┌─ NO ───────────┘       │
│ │ │                        │
│ │ ├─ Calculate Delay       │
│ │ ├─ Wait + Retry          │
│ │ └─ Increment Attempt     │
│ │                          │
│ └─ YES ────────────────────┘
│                            │
├─ NO (Auth, Invalid JQL) ───┘
│                            │
└─── Record Error + Fail ────┘
```

## Performance Characteristics

### Memory Usage
- **Target**: <50MB for 500 tickets
- **Monitoring**: Real-time memory checks every 5 seconds
- **Management**: Batch processing, resource cleanup, automatic abort

### Response Times
- **Manual Sync**: ~100ms to start, progress callbacks every ~1s
- **Scheduled Sync**: <5s overhead, configurable intervals
- **Error Recovery**: Exponential backoff (1s, 2s, 4s, max 15min)

### Resource Usage
- **Timers**: Maximum 3 concurrent timers (sync, retry, memory monitor)
- **Network**: Rate-limited to <20 requests/minute
- **CPU**: Minimal background usage, spikes during sync operations

## Testing

The implementation includes comprehensive tests covering:

- ✅ Configuration validation
- ✅ Timer lifecycle management
- ✅ Manual and scheduled sync operations
- ✅ Error handling and retry logic
- ✅ Status reporting and callbacks
- ✅ Memory monitoring and limits
- ✅ Cancellation and cleanup
- ✅ Integration scenarios

Run tests with:
```bash
npm test tests/unit/auto-sync-scheduler.test.ts
```

## Integration Points

### Required Dependencies

```typescript
// Core dependencies
import { JiraClient } from '../jira-bases-adapter/jira-client';
import { JQLQueryEngine } from '../enhanced-sync/jql-query-engine';
import { SyncProgress, SyncPhase } from '../enhanced-sync/sync-progress-model';
import { SyncError, ERROR_CODES, USER_ACTIONS } from '../types/sync-types';

// Obsidian dependencies
import { Plugin, Notice } from 'obsidian';
```

### Plugin Lifecycle Integration

```typescript
// In your plugin's onload()
await this.schedulerIntegration.initialize();

// In your plugin's onunload()
await this.schedulerIntegration.shutdown();
```

### Settings Integration

The scheduler integrates with Obsidian's settings system:

```typescript
// Load configuration
const config = await this.schedulerIntegration.loadSchedulerConfig();

// Update configuration
await this.schedulerIntegration.updateSchedulerConfig({
  intervalMinutes: 30,
  jql: 'project = "MY_PROJECT"'
});
```

### Command Integration

Register commands for user interaction:

```typescript
// Manual sync command
this.addCommand({
  id: 'trigger-manual-sync',
  name: 'Trigger Manual Sync',
  callback: () => this.schedulerIntegration.triggerManualSync()
});

// Cancel sync command
this.addCommand({
  id: 'cancel-sync',
  name: 'Cancel Current Sync',
  callback: () => this.schedulerIntegration.cancelCurrentSync()
});
```

## Troubleshooting

### Common Issues

1. **Scheduler Won't Start**
   - Check `enableAutoSync` configuration
   - Verify Jira client is properly configured
   - Ensure JQL query is valid

2. **Memory Limit Exceeded**
   - Reduce `maxResults` or `batchSize`
   - Increase `memoryLimitMB` if appropriate
   - Check for memory leaks in callback handlers

3. **Sync Failures**
   - Check network connectivity
   - Verify Jira credentials and permissions
   - Review JQL query syntax
   - Check rate limiting (max 20 requests/minute)

4. **Performance Issues**
   - Reduce sync frequency (`intervalMinutes`)
   - Optimize JQL query to return fewer results
   - Consider using field selection to reduce data transfer

### Debugging

Enable verbose logging:

```typescript
// Enable debug logging
console.log('Scheduler status:', scheduler.getStatus());
console.log('Recent errors:', scheduler.getStatus().recentErrors);

// Monitor progress
scheduler.setProgressCallback((progress) => {
  console.log(`Phase: ${progress.phase}, Progress: ${progress.current}/${progress.total}`);
});
```

## Future Enhancements

Potential areas for improvement:

1. **Persistent State**: Save scheduler state across plugin restarts
2. **Multiple Queries**: Support for multiple concurrent JQL queries
3. **Selective Sync**: Smart sync based on last modified timestamps
4. **Conflict Resolution**: Handle concurrent edits between Jira and Obsidian
5. **Performance Metrics**: More detailed performance tracking and reporting
6. **Custom Retry Strategies**: Configurable retry logic per error type

## Contributing

When contributing to the auto-sync scheduler:

1. **Follow TypeScript strict mode**: All code uses strict type checking
2. **Add comprehensive tests**: Cover both happy path and error scenarios
3. **Update documentation**: Keep README and code comments current
4. **Performance testing**: Verify memory usage stays within limits
5. **Integration testing**: Test with real Jira instances when possible

## License

This implementation is part of the Obsidian Jira Sync Pro plugin and follows the same license terms.