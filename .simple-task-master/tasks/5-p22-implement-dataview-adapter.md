---
schema: 1
id: 5
title: "[P2.2] Implement Dataview Adapter"
status: pending
created: "2025-09-12T14:03:31.181Z"
updated: "2025-09-12T14:03:31.181Z"
tags:
  - phase2
  - adapter
  - high-priority
  - large
dependencies:
  - 1
  - 2
  - 4
---
## Description
Complete the Dataview adapter with metadata injection, note discovery, and index management for Jira query support

## Details
Technical Requirements:
- Update Dataview index with Jira ticket metadata for querying
- Add inline fields to notes for Dataview query compatibility
- Handle note path discovery for tickets using Jira keys
- Trigger Dataview index reload after metadata updates
- Support common Dataview query patterns for Jira data

Implementation Steps:
1. Implement `handleTicketSync` method for Dataview integration
2. Create `getTicketNotePath` method for finding associated notes
3. Implement `updateNoteMetadata` for adding Dataview inline fields
4. Add Dataview index refresh trigger
5. Map Jira fields to Dataview-compatible inline field format

Complete Core Implementation:
```typescript
async handleTicketSync(tickets: JiraTicket[]): Promise<void> {
  if (!this.dataviewPlugin || this.state !== AdapterState.ACTIVE) {
    return;
  }
  
  // Update Dataview index with Jira metadata
  for (const ticket of tickets) {
    const notePath = this.getTicketNotePath(ticket.key);
    
    if (notePath) {
      // Add inline fields for Dataview queries
      const metadata = {
        'jira-key': ticket.key,
        'jira-status': ticket.fields.status.name,
        'jira-assignee': ticket.fields.assignee?.displayName,
        'jira-priority': ticket.fields.priority?.name,
        'jira-type': ticket.fields.issuetype?.name,
        'jira-project': ticket.fields.project.key,
        'jira-updated': ticket.fields.updated,
        'jira-created': ticket.fields.created
      };
      
      await this.updateNoteMetadata(notePath, metadata);
    }
  }
  
  // Trigger Dataview refresh
  this.dataviewPlugin.index.reload();
}
```

Additional Required Methods:
```typescript
// Find note file for ticket using various strategies
private getTicketNotePath(jiraKey: string): string | null {
  const vault = this.plugin.app.vault;
  
  // Strategy 1: Look for note with Jira key in filename
  const filesByName = vault.getMarkdownFiles()
    .filter(file => file.name.includes(jiraKey));
  
  if (filesByName.length > 0) {
    return filesByName[0].path;
  }
  
  // Strategy 2: Look for note with Jira key in content/frontmatter
  const allFiles = vault.getMarkdownFiles();
  for (const file of allFiles) {
    const cache = this.plugin.app.metadataCache.getFileCache(file);
    if (cache?.frontmatter?.['jira-key'] === jiraKey ||
        cache?.frontmatter?.jiraKey === jiraKey) {
      return file.path;
    }
  }
  
  // Strategy 3: Look in configured sync folder
  const syncFolder = this.plugin.settings.syncFolder || '';
  const expectedPath = `${syncFolder}/${jiraKey}.md`;
  const expectedFile = vault.getAbstractFileByPath(expectedPath);
  
  if (expectedFile instanceof TFile) {
    return expectedFile.path;
  }
  
  return null;
}

// Add inline fields to note for Dataview compatibility
private async updateNoteMetadata(notePath: string, metadata: Record<string, any>): Promise<void> {
  const file = this.plugin.app.vault.getAbstractFileByPath(notePath);
  if (!(file instanceof TFile)) return;
  
  let content = await this.plugin.app.vault.read(file);
  
  // Parse existing frontmatter
  const frontmatterRegex = /^---\n(.*?)\n---\n/s;
  const frontmatterMatch = content.match(frontmatterRegex);
  
  let frontmatter = {};
  let bodyContent = content;
  
  if (frontmatterMatch) {
    try {
      frontmatter = yaml.load(frontmatterMatch[1]) || {};
      bodyContent = content.slice(frontmatterMatch[0].length);
    } catch (error) {
      console.error('Failed to parse frontmatter:', error);
    }
  }
  
  // Update frontmatter with Jira metadata
  const updatedFrontmatter = { ...frontmatter, ...metadata };
  
  // Format dates for Dataview compatibility
  if (updatedFrontmatter['jira-updated']) {
    updatedFrontmatter['jira-updated'] = new Date(updatedFrontmatter['jira-updated']).toISOString().split('T')[0];
  }
  if (updatedFrontmatter['jira-created']) {
    updatedFrontmatter['jira-created'] = new Date(updatedFrontmatter['jira-created']).toISOString().split('T')[0];
  }
  
  // Rebuild content with updated frontmatter
  const newFrontmatterYaml = yaml.dump(updatedFrontmatter);
  const newContent = `---\n${newFrontmatterYaml}---\n${bodyContent}`;
  
  await this.plugin.app.vault.modify(file, newContent);
}
```

Dataview Query Examples Enabled:
```dataview
TABLE jira-status, jira-assignee, jira-priority 
FROM #jira 
WHERE jira-project = "PROJ"
SORT jira-updated DESC
```

```dataview
LIST 
FROM #jira 
WHERE jira-status = "In Progress" 
AND jira-assignee = "John Doe"
```

Key Implementation Notes:
- Multiple note discovery strategies ensure flexibility
- Frontmatter fields use kebab-case for Dataview compatibility
- Date formatting converts ISO strings to YYYY-MM-DD format
- Index reload triggers Dataview to recognize new metadata
- Existing frontmatter is preserved and merged with Jira data
- Error handling prevents YAML parsing issues from breaking sync

## Validation
Acceptance Criteria:
- [ ] Jira metadata is added as inline fields in notes
- [ ] Dataview index is refreshed after metadata updates
- [ ] All common Jira fields are mapped to Dataview fields
- [ ] Date fields are formatted for Dataview compatibility (YYYY-MM-DD)
- [ ] Notes are found correctly using ticket keys
- [ ] Metadata updates don't corrupt existing note content
- [ ] Tests verify Dataview API integration
- [ ] Tests cover metadata injection and index refresh

Test Scenarios:
1. Note with Jira key in filename - metadata added correctly
2. Note with Jira key in frontmatter - existing frontmatter preserved
3. Note in sync folder with expected path - found and updated
4. Multiple note discovery strategies - all work correctly
5. Date formatting - ISO dates converted to YYYY-MM-DD
6. Existing frontmatter - merged without overwriting non-Jira fields
7. Invalid YAML in frontmatter - handled gracefully
8. Dataview queries - can access new jira-* fields

Validation Steps:
1. Create test notes with different Jira key placement strategies
2. Test metadata injection preserves existing frontmatter
3. Verify date formatting for Dataview compatibility
4. Test Dataview queries can access jira-* fields
5. Verify index refresh triggers after metadata updates
6. Test error handling with malformed frontmatter