# STM Task 20: Archive Current Structure

## Task Definition
Archive existing Knowledge/Work folder to _Archive_OLD with timestamp

## Size: Small
## Priority: High
## Dependencies: Task 13 (PARA folder structure)

## Implementation

```typescript
// src/migration/archive-old-structure.ts
import { Vault, TFolder } from 'obsidian';

export async function archiveOldStructure(vault: Vault): Promise<void> {
  const oldPath = 'Knowledge/Work';
  const timestamp = new Date().toISOString().split('T')[0];
  const archivePath = `_Archive_OLD_${timestamp}`;
  
  const oldFolder = vault.getAbstractFileByPath(oldPath);
  if (oldFolder instanceof TFolder) {
    // Create archive folder
    await vault.createFolder(archivePath);
    
    // Move all contents
    for (const child of oldFolder.children) {
      await vault.rename(child, `${archivePath}/${child.name}`);
    }
    
    console.log(`Archived ${oldFolder.children.length} items to ${archivePath}`);
  }
}
```

## Test Spec

```typescript
// tests/unit/migration/archive-old-structure.test.ts
import { describe, it, expect, vi } from 'vitest';
import { archiveOldStructure } from '@/migration/archive-old-structure';

describe('Archive Old Structure', () => {
  it('should archive existing Knowledge/Work folder', async () => {
    const mockFolder = {
      children: [
        { name: 'Active Tickets' },
        { name: 'Archived Tickets' }
      ]
    };
    
    const mockVault = {
      getAbstractFileByPath: vi.fn().mockReturnValue(mockFolder),
      createFolder: vi.fn(),
      rename: vi.fn()
    };
    
    await archiveOldStructure(mockVault as any);
    
    expect(mockVault.createFolder).toHaveBeenCalledWith(
      expect.stringMatching(/_Archive_OLD_\d{4}-\d{2}-\d{2}/)
    );
    expect(mockVault.rename).toHaveBeenCalledTimes(2);
  });
  
  it('should handle missing folder gracefully', async () => {
    const mockVault = {
      getAbstractFileByPath: vi.fn().mockReturnValue(null),
      createFolder: vi.fn(),
      rename: vi.fn()
    };
    
    await archiveOldStructure(mockVault as any);
    
    expect(mockVault.createFolder).not.toHaveBeenCalled();
    expect(mockVault.rename).not.toHaveBeenCalled();
  });
});
```

## Acceptance Criteria
- [ ] Old structure archived with timestamp
- [ ] No data loss during migration
- [ ] Archive clearly labeled
- [ ] Handles missing folder gracefully

## Execution Notes
- Run AFTER PARA structure creation (Task 13)
- User should be warned before archiving
- Consider creating backup before migration