# JQL Auto-Sync Settings Module

This module provides a comprehensive configuration UI for JQL auto-sync functionality in the Obsidian Jira Sync Pro plugin.

## Overview

The settings module includes:

- **JQLAutoSyncSettingsTab**: Main settings UI component
- **SettingsValidator**: Comprehensive validation utilities  
- **TypeScript interfaces**: Complete type definitions
- **Integration example**: Shows how to integrate with main plugin

## Features

### ✅ JQL Query Validation and Testing
- Real-time syntax validation with debouncing
- Connection testing with query execution
- Query complexity analysis and warnings
- User-friendly error messages with suggestions

### ✅ Sync Interval Configuration  
- Slider control with live preview (1-60 minutes)
- Dynamic updates to running scheduler
- Visual feedback for current settings

### ✅ Connection Testing
- Test Jira connectivity with current credentials
- Validate API token and permissions
- Response time measurement
- Detailed error reporting with suggestions

### ✅ Settings Persistence
- Automatic saving on changes
- Validation before saving
- Migration support for older versions
- Export/import functionality (planned)

### ✅ User-Friendly Validation
- Real-time field validation
- Progressive validation (syntax → connectivity → execution)
- Warning vs error categorization  
- Quick-fix suggestions for common issues

## Quick Start

### Basic Integration

```typescript
import { JQLAutoSyncSettingsTab, DEFAULT_JQL_SETTINGS } from './settings';

export default class MyPlugin extends Plugin {
  settings = DEFAULT_JQL_SETTINGS;
  
  async onload() {
    await this.loadSettings();
    
    // Add settings tab
    this.addSettingTab(new JQLAutoSyncSettingsTab(
      this.app,
      this,
      this.settings,
      this.handleSettingsChanged.bind(this),
      this.queryEngine, // Optional: enables connection testing
      this.scheduler    // Optional: enables auto-sync control
    ));
  }
  
  private async handleSettingsChanged(newSettings: JQLAutoSyncSettings) {
    this.settings = newSettings;
    await this.saveData(this.settings);
    // Handle component updates...
  }
}
```

### Advanced Usage with Validation

```typescript
import { SettingsValidator, ValidationResult } from './settings';

// Create validator with query engine for connectivity testing
const validator = new SettingsValidator(queryEngine);

// Validate complete settings
const result: ValidationResult = await validator.validateSettings(settings, true);

if (result.isValid) {
  console.log('✅ Settings are valid');
} else {
  console.log('❌ Validation errors:', result.errors);
  console.log('⚠️ Warnings:', result.warnings);
}

// Validate individual fields
const fieldResult = await validator.validateField('jqlQuery', query);

// Test JQL query
const jqlResult = await validator.validateJQLQuery(query);
if (jqlResult.queryExecutable) {
  console.log(`Query complexity: ${jqlResult.metadata?.complexity}`);
}
```

## File Structure

```
src/settings/
├── index.ts                          # Module exports
├── jql-auto-sync-settings.ts         # Main settings component  
├── settings-types.ts                 # TypeScript interfaces
├── settings-validator.ts             # Validation utilities
├── settings-integration-example.ts   # Integration example
└── README.md                         # This file
```

## Settings Configuration

### Required Settings
- **jiraUrl**: Jira instance URL (e.g., https://company.atlassian.net)
- **jiraApiToken**: API token from Atlassian account
- **jqlQuery**: JQL query for selecting tickets

### Optional Settings  
- **jiraUsername**: Username (email) for better authentication
- **autoSyncEnabled**: Enable automatic synchronization
- **syncInterval**: Sync frequency in minutes (1-60)
- **maxResults**: Maximum tickets to sync (1-1000)  
- **batchSize**: Batch processing size (1-100)
- **syncFolder**: Vault folder for ticket storage

### Advanced Settings
- **enableResume**: Resume interrupted syncs
- **organizeByProject**: Organize tickets by project
- **skipExisting**: Skip existing tickets during sync
- **retryFailures**: Retry failed operations
- **maxRetryAttempts**: Maximum retry attempts

## Validation Features

### JQL Validation Levels
1. **Syntax Validation**: Basic JQL syntax checking
2. **Connectivity Validation**: Test Jira API connection  
3. **Executability Validation**: Test query execution
4. **Complexity Analysis**: Analyze query performance impact

### Field Validation
- **URL Format**: Validates Jira URL structure
- **Email Format**: Validates username format
- **Range Validation**: Ensures numeric values are in valid ranges
- **Path Validation**: Ensures folder paths are valid
- **API Token**: Basic format validation

### Error Handling
- **Categorized Errors**: Errors vs warnings
- **Contextual Messages**: Specific error descriptions
- **Quick Fixes**: Suggested fixes for common issues  
- **Retry Logic**: Automatic retry for transient failures

## UI Components

### Settings Sections
1. **Jira Connection**: URL, username, API token, connection test
2. **Sync Configuration**: JQL query, auto-sync toggle, interval slider  
3. **Advanced Settings**: Performance and storage options
4. **Actions**: Validate all, reset to defaults

### Interactive Elements
- **Debounced Validation**: Real-time validation with 500ms delay
- **Progress Indicators**: Visual feedback for testing/validation
- **Status Indicators**: Connection and sync status displays
- **Test Buttons**: Individual field and overall testing
- **Quick Actions**: One-click validation and reset

### Visual Feedback
- **Color-coded Validation**: Green (valid), red (error), orange (warning)
- **Loading States**: Spinners and disabled states during operations
- **Success/Error Messages**: Toast notifications for user actions
- **Responsive Design**: Works on different screen sizes

## Integration Points

### Plugin Integration
- **Settings Persistence**: Automatic save/load with Obsidian data API
- **Component Initialization**: Initialize Jira client, query engine, scheduler
- **Command Registration**: Add plugin commands for manual operations
- **Event Handling**: React to settings changes and update components

### External Components
- **JQLQueryEngine**: Query validation and execution
- **AutoSyncScheduler**: Interval control and configuration updates  
- **JiraClient**: Connection testing and API communication
- **SyncStatusDashboard**: Settings integration with status display

## Customization

### Extending Settings
```typescript
interface CustomSettings extends JQLAutoSyncSettings {
  customField: string;
  customToggle: boolean;
}

class CustomSettingsTab extends JQLAutoSyncSettingsTab {
  // Override methods to add custom sections
}
```

### Custom Validation Rules
```typescript
validator.addCustomRule({
  field: 'jqlQuery',
  type: 'custom',
  validator: (query) => !query.includes('dangerous_field'),
  message: 'Query contains restricted fields',
  severity: 'warning'
});
```

## Error Handling

### Common Error Scenarios
- **Network Issues**: Connection timeouts, offline mode
- **Authentication Failures**: Invalid credentials, expired tokens
- **JQL Syntax Errors**: Invalid query syntax, unknown fields
- **Permission Issues**: Insufficient Jira permissions
- **Validation Failures**: Invalid configuration values

### Error Recovery
- **Graceful Degradation**: Continue with available functionality
- **User Guidance**: Clear error messages and suggested fixes
- **Retry Mechanisms**: Automatic retry for transient failures
- **Fallback Options**: Alternative approaches when primary fails

## Performance Considerations

### Optimization Features
- **Debounced Validation**: Reduces API calls during typing
- **Cached Results**: Cache validation results to avoid repeated calls
- **Lazy Loading**: Load components only when needed
- **Efficient Updates**: Only update changed settings

### Resource Management
- **Connection Pooling**: Reuse Jira API connections
- **Memory Management**: Clean up unused resources
- **Rate Limiting**: Respect Jira API rate limits
- **Background Processing**: Non-blocking validation operations

## Testing

### Unit Testing
- Settings validation logic
- Field validation rules  
- Error handling scenarios
- Integration with mock components

### Integration Testing  
- End-to-end settings flow
- Real Jira API connections
- Settings persistence
- Component integration

### Manual Testing
- UI responsiveness
- Validation feedback
- Error scenarios
- Settings migration

## Future Enhancements

### Planned Features
- **Settings Profiles**: Multiple configuration profiles
- **Import/Export**: Settings backup and sharing
- **Advanced Validation**: Query performance analysis
- **Template System**: Predefined JQL query templates
- **Bulk Operations**: Bulk settings updates

### API Improvements
- **Webhook Support**: Real-time Jira updates
- **GraphQL Integration**: More efficient data fetching  
- **Offline Mode**: Local caching and sync
- **Multi-Instance**: Support multiple Jira instances

## Support

For issues, questions, or contributions:

1. Check existing documentation and examples
2. Review common error scenarios and solutions
3. Test with the integration example
4. Submit detailed bug reports with steps to reproduce

## License

Part of the Obsidian Jira Sync Pro plugin.