# Status-Based Ticket Sorting Feature

## Overview
Implemented automatic organization of Jira tickets based on their status, separating active work from completed/archived items for better vault organization.

## Problem Solved
Previously, all Jira tickets were organized only by project folders (e.g., `SWSE/`, `RICCE/`, `ECOMCP/`), making it difficult to distinguish between active work and completed tasks. This resulted in cluttered project folders with hundreds of tickets regardless of their status.

## Solution Implemented
Added status-based organization that automatically sorts tickets into Active or Archived folders based on configurable status mappings.

## Implementation Date
January 12, 2025

## Key Features

### 1. Automatic Status-Based Organization
- Tickets are automatically sorted into `Active Tickets` or `Archived Tickets` folders
- Organization happens during sync based on ticket status
- Maintains project subfolder structure within Active/Archived folders

### 2. Configurable Status Mapping
- **Active Statuses** (default): Open, In Progress, In Review, Ready for Testing, Blocked, Waiting, To Do, Reopened
- **Archived Statuses** (default): Done, Closed, Resolved, Completed, Cancelled
- Users can customize which statuses map to which folder via settings UI

### 3. Year-Based Archiving
- Archived tickets can be organized by year (e.g., `Archived Tickets/2025/`)
- Helps manage long-term ticket storage

### 4. Recent Archive Support
- Option to keep recently closed tickets in a `Recent` folder
- Configurable retention period (default: 30 days)
- Tickets automatically move from Recent to year-based folders after the retention period

## File Structure

### Before (Project-Based Only)
```
Knowledge/Work/
├── SWSE/
│   ├── SWSE-60001.md
│   ├── SWSE-60002.md (Done)
│   ├── SWSE-60003.md
│   └── ... (hundreds of tickets mixed)
├── RICCE/
│   └── ... (all tickets mixed)
└── ECOMCP/
    └── ... (all tickets mixed)
```

### After (Status-Based Organization)
```
Knowledge/Work/
├── Active Tickets/
│   ├── SWSE/
│   │   ├── SWSE-60001.md
│   │   └── SWSE-60003.md
│   ├── RICCE/
│   │   └── RICCE-1708.md
│   └── ECOMCP/
│       └── ECOMCP-4811.md
└── Archived Tickets/
    ├── Recent/
    │   └── SWSE/
    │       └── SWSE-59999.md (closed 5 days ago)
    └── 2025/
        ├── SWSE/
        │   └── SWSE-60002.md
        └── RICCE/
            └── RICCE-487.md
```

## Technical Implementation

### Files Modified

1. **src/main.ts**
   - Added `StatusMapping` import and interface field
   - Updated `DEFAULT_SETTINGS` with status mapping configuration
   - Modified `performSync()` to use status-based organization when enabled
   - Added status mapping UI controls in settings tab

2. **src/settings/settings-types.ts**
   - Defined `StatusMapping` interface
   - Created `DEFAULT_STATUS_MAPPING` constant
   - Added status organization fields to settings interface

3. **src/services/simple-note-service.ts**
   - Implemented `getStatusBasedPath()` method
   - Added logic to determine active vs archived status
   - Support for year-based and recent archive organization

4. **src/sync/sync-engine.ts**
   - Added `determineTargetFolder()` for status-based paths
   - Implemented `moveTicket()` for relocating tickets when status changes
   - Added `findExistingTicket()` to search across all locations

### Key Code Changes

#### Status Detection Logic
```typescript
const noteResult = await noteService.processTicket(ticket, {
  overwriteExisting: true,
  organizationStrategy: this.settings.enableStatusOrganization ? 'status-based' : 'by-project',
  preserveLocalNotes: true,
  statusMapping: this.settings.statusMapping,
  activeTicketsFolder: this.settings.activeTicketsFolder,
  archivedTicketsFolder: this.settings.archivedTicketsFolder,
  archiveByYear: this.settings.archiveByYear,
  keepRecentArchive: this.settings.keepRecentArchive,
  recentArchiveDays: this.settings.recentArchiveDays
});
```

## Configuration Options

### Settings UI
Navigate to Settings → Jira Sync Pro → Status-Based Organization

1. **Enable Status Organization**: Toggle to enable/disable the feature
2. **Active Tickets Folder**: Name of folder for active tickets (default: "Active Tickets")
3. **Archived Tickets Folder**: Name of folder for archived tickets (default: "Archived Tickets")
4. **Archive by Year**: Toggle to organize archives by year
5. **Keep Recent Archive**: Toggle to maintain a Recent folder
6. **Recent Archive Days**: Days to keep in Recent folder (1-365)
7. **Active Statuses**: Comma-separated list of statuses for active folder
8. **Archived Statuses**: Comma-separated list of statuses for archived folder

## Usage Instructions

### Initial Setup
1. Open Obsidian Settings
2. Navigate to Jira Sync Pro plugin settings
3. Enable "Status Organization" toggle
4. Configure status mappings if defaults don't match your workflow
5. Set folder names and archive preferences

### Running Initial Organization
1. Open Command Palette (Cmd/Ctrl + P)
2. Run "Jira Sync Pro: Manual sync now"
3. All existing tickets will be reorganized based on their current status
4. Future syncs will automatically maintain this organization

### Customizing Status Mappings
1. In settings, find "Active Statuses" and "Archived Statuses" text areas
2. Edit the comma-separated lists to match your Jira workflow
3. Example custom mapping:
   - Active: "Open, To Do, In Development, Code Review, Testing"
   - Archived: "Done, Won't Do, Duplicate, Obsolete"

## Benefits

1. **Better Organization**: Clear separation between active work and completed tasks
2. **Reduced Clutter**: Active folders only show current work items
3. **Historical Archive**: Completed work is preserved but organized by time
4. **Customizable**: Status mappings can be tailored to any workflow
5. **Automatic**: No manual filing required - happens during sync

## Migration Notes

### For Existing Vaults
- First sync after enabling will move all tickets to appropriate folders
- Original project folder structure is preserved within Active/Archived
- No data loss - tickets are moved, not deleted
- Recommend backing up vault before first status-based sync

### Performance Considerations
- Initial reorganization may take longer for vaults with many tickets
- Subsequent syncs are optimized to only move tickets with status changes
- File movement is atomic - no partial updates

## Troubleshooting

### Tickets Not Moving to Correct Folders
1. Check that "Enable Status Organization" is toggled ON
2. Verify status mappings include all your Jira statuses
3. Run manual sync to trigger reorganization
4. Check console for any error messages

### Missing Statuses
If tickets with certain statuses aren't being organized:
1. Check the ticket's actual status in Jira
2. Add the status to either Active or Archived lists in settings
3. Statuses are case-sensitive - match exactly as shown in Jira

### Folder Creation Issues
- Plugin automatically creates necessary folders
- Ensure Obsidian has write permissions to vault directory
- Check that folder names don't contain invalid characters

## Future Enhancements

Potential improvements for future versions:
1. Custom status categories beyond Active/Archived
2. Status transition tracking and history
3. Bulk status update from Obsidian
4. Smart status detection based on patterns
5. Integration with Obsidian's graph view for status visualization

## Related Documentation
- [Jira Sync Pro README](../README.md)
- [Plugin Settings Guide](./SETTINGS_GUIDE.md)
- [Vault Organization Best Practices](./VAULT_ORGANIZATION.md)