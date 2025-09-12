# STM Task 21: Auto-categorization by Project

## Task Definition
Automatically file tickets into correct project folders based on ticket key prefix

## Size: Small
## Priority: Medium
## Dependencies: Task 13 (PARA folder structure)

## Implementation

```typescript
// src/organization/ticket-organizer.ts
import { Vault, TFile } from 'obsidian';
import { JiraSyncProSettings } from '@/types/settings';

export class TicketOrganizer {
  constructor(private settings: JiraSyncProSettings) {}
  
  getTicketPath(ticket: any): string {
    if (!this.settings.usePARAStructure) {
      // Use old structure
      return `${this.settings.syncFolder}/${ticket.key}.md`;
    }
    
    const projectCode = ticket.key.split('-')[0];
    const status = ticket.fields?.status?.name || 'Open';
    
    // Check if ticket is done/closed
    const archivedStatuses = ['Done', 'Closed', 'Resolved', 'Cancelled'];
    const isArchived = archivedStatuses.includes(status);
    
    if (isArchived) {
      const year = new Date().getFullYear();
      return `${this.settings.archivesFolder}/${year}/${projectCode}/${ticket.key}.md`;
    } else {
      return `${this.settings.projectsFolder}/${projectCode}/${ticket.key}.md`;
    }
  }
  
  async moveTicketIfNeeded(vault: Vault, ticket: any, currentPath: string): Promise<string> {
    const targetPath = this.getTicketPath(ticket);
    
    if (currentPath !== targetPath) {
      // Ensure target folder exists
      const targetFolder = targetPath.substring(0, targetPath.lastIndexOf('/'));
      if (!vault.getAbstractFileByPath(targetFolder)) {
        await vault.createFolder(targetFolder);
      }
      
      // Move file
      const file = vault.getAbstractFileByPath(currentPath);
      if (file) {
        await vault.rename(file, targetPath);
        console.log(`Moved ${currentPath} to ${targetPath}`);
      }
    }
    
    return targetPath;
  }
  
  // Helper to detect project from key
  getProjectFromKey(ticketKey: string): string {
    return ticketKey.split('-')[0];
  }
  
  // Helper to determine if status is archived
  isArchivedStatus(status: string): boolean {
    const archivedStatuses = ['Done', 'Closed', 'Resolved', 'Cancelled', 'Rejected'];
    return archivedStatuses.some(s => 
      status.toLowerCase().includes(s.toLowerCase())
    );
  }
}
```

## Test Spec

```typescript
// tests/unit/organization/ticket-organizer.test.ts
import { describe, it, expect } from 'vitest';
import { TicketOrganizer } from '@/organization/ticket-organizer';

describe('Ticket Organizer', () => {
  const settings = {
    usePARAStructure: true,
    syncFolder: 'Knowledge/Work',
    projectsFolder: '01_Projects',
    archivesFolder: '04_Archives'
  };
  
  it('should determine correct path for active tickets', () => {
    const organizer = new TicketOrganizer(settings as any);
    const ticket = {
      key: 'RICCE-123',
      fields: {
        status: { name: 'In Progress' }
      }
    };
    
    const path = organizer.getTicketPath(ticket);
    expect(path).toBe('01_Projects/RICCE/RICCE-123.md');
  });
  
  it('should determine correct path for archived tickets', () => {
    const organizer = new TicketOrganizer(settings as any);
    const ticket = {
      key: 'SWSE-456',
      fields: {
        status: { name: 'Done' }
      }
    };
    
    const year = new Date().getFullYear();
    const path = organizer.getTicketPath(ticket);
    expect(path).toBe(`04_Archives/${year}/SWSE/SWSE-456.md`);
  });
  
  it('should fall back to old structure when PARA disabled', () => {
    const oldSettings = { ...settings, usePARAStructure: false };
    const organizer = new TicketOrganizer(oldSettings as any);
    const ticket = { key: 'TEST-789' };
    
    const path = organizer.getTicketPath(ticket);
    expect(path).toBe('Knowledge/Work/TEST-789.md');
  });
});
```

## Acceptance Criteria
- [ ] Tickets filed by project code
- [ ] Archived tickets moved to archives
- [ ] Folders created as needed
- [ ] Existing tickets moved correctly
- [ ] Status detection works for various formats

## Execution Notes
- Integrate with sync engine
- Run after each sync to reorganize tickets
- Consider bulk move operation for initial migration