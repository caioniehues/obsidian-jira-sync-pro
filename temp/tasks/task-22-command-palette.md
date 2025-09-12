# STM Task 22: Command Palette Integration

## Task Definition
Add commands for timer control and time pushing to Obsidian's command palette

## Size: Medium
## Priority: High
## Dependencies: Task 15 (Timer core), Task 17 (Jira worklog API)

## Implementation

```typescript
// src/commands/time-commands.ts
import { Plugin, Notice, TFile } from 'obsidian';
import { TimeTracker } from '@/time/time-tracker';
import { TimeEntryModal, ConfirmModal } from '@/ui/modals';
import { parseTimeString, formatTime } from '@/time/parser';

export function registerTimeCommands(plugin: Plugin, timeTracker: TimeTracker) {
  // Start timer for current ticket
  plugin.addCommand({
    id: 'start-timer',
    name: 'Start timer for current ticket',
    checkCallback: (checking: boolean) => {
      const activeFile = plugin.app.workspace.getActiveFile();
      if (activeFile?.name.match(/^[A-Z]+-\d+\.md$/)) {
        if (!checking) {
          const ticketKey = activeFile.basename;
          timeTracker.startTimer(ticketKey);
        }
        return true;
      }
      return false;
    }
  });
  
  // Stop timer and log time
  plugin.addCommand({
    id: 'stop-timer',
    name: 'Stop timer and log time',
    callback: async () => {
      const entry = timeTracker.stopTimer();
      if (entry) {
        const activeFile = plugin.app.workspace.getActiveFile();
        if (activeFile) {
          await addTimeEntryToFile(plugin, activeFile, entry);
          new Notice('Timer stopped and time logged');
        }
      } else {
        new Notice('No active timer to stop');
      }
    }
  });
  
  // Push time entries to Jira
  plugin.addCommand({
    id: 'push-time',
    name: 'Push time entries to Jira',
    checkCallback: (checking: boolean) => {
      const activeFile = plugin.app.workspace.getActiveFile();
      if (activeFile?.name.match(/^[A-Z]+-\d+\.md$/)) {
        if (!checking) {
          pushTimeEntries(plugin, activeFile);
        }
        return true;
      }
      return false;
    }
  });
  
  // Quick add time entry
  plugin.addCommand({
    id: 'quick-time-entry',
    name: 'Quick add time entry',
    checkCallback: (checking: boolean) => {
      const activeFile = plugin.app.workspace.getActiveFile();
      if (activeFile?.name.match(/^[A-Z]+-\d+\.md$/)) {
        if (!checking) {
          new TimeEntryModal(plugin.app, async (time: string, description: string) => {
            const seconds = parseTimeString(time);
            const entry = `- ${formatTime(seconds)}: ${description}`;
            await addTimeEntryToFile(plugin, activeFile, entry);
            new Notice('Time entry added');
          }).open();
        }
        return true;
      }
      return false;
    }
  });
  
  // Pause/Resume timer
  plugin.addCommand({
    id: 'toggle-timer-pause',
    name: 'Pause/Resume timer',
    callback: () => {
      timeTracker.togglePause();
    }
  });
}

async function addTimeEntryToFile(plugin: Plugin, file: TFile, entry: string): Promise<void> {
  const content = await plugin.app.vault.read(file);
  const lines = content.split('\n');
  const timeLogIndex = lines.findIndex(line => line.includes('## ⏱️ Time Log'));
  
  if (timeLogIndex !== -1) {
    // Insert after the Time Log heading, skip any existing entries
    let insertIndex = timeLogIndex + 1;
    while (insertIndex < lines.length && 
           (lines[insertIndex].trim() === '' || lines[insertIndex].startsWith('-'))) {
      insertIndex++;
    }
    lines.splice(insertIndex, 0, entry);
  } else {
    // Add Time Log section if it doesn't exist
    lines.push('', '## ⏱️ Time Log', entry);
  }
  
  await plugin.app.vault.modify(file, lines.join('\n'));
}

async function pushTimeEntries(plugin: Plugin, file: TFile): Promise<void> {
  const content = await plugin.app.vault.read(file);
  const unpushedEntries = extractUnpushedEntries(content);
  
  if (unpushedEntries.length === 0) {
    new Notice('No unpushed time entries found');
    return;
  }
  
  const settings = await plugin.loadData();
  if (settings.confirmBeforePush) {
    new ConfirmModal(plugin.app, unpushedEntries, async () => {
      await doPushEntries(plugin, file, unpushedEntries);
    }).open();
  } else {
    await doPushEntries(plugin, file, unpushedEntries);
  }
}

interface TimeEntry {
  time: string;
  description: string;
  line: number;
}

function extractUnpushedEntries(content: string): TimeEntry[] {
  const entries: TimeEntry[] = [];
  const lines = content.split('\n');
  const timeLogStart = lines.findIndex(line => line.includes('## ⏱️ Time Log'));
  
  if (timeLogStart === -1) return entries;
  
  for (let i = timeLogStart + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('##')) break; // Next section
    
    // Match unpushed entries: "- 2h30m: Description"
    const match = line.match(/^- (\d+[hms\s]+): (.+?)(?:\[.*\])?$/);
    if (match && !line.includes('[✓ Pushed')) {
      entries.push({
        time: match[1],
        description: match[2].trim(),
        line: i
      });
    }
  }
  
  return entries;
}

async function doPushEntries(plugin: Plugin, file: TFile, entries: TimeEntry[]): Promise<void> {
  const ticketKey = file.basename;
  // Implementation would use JiraWorklogClient from Task 17
  new Notice(`Pushed ${entries.length} time entries to ${ticketKey}`);
}
```

## Test Spec

```typescript
// tests/unit/commands/time-commands.test.ts
import { describe, it, expect, vi } from 'vitest';
import { registerTimeCommands } from '@/commands/time-commands';

describe('Time Commands', () => {
  it('should register all time-related commands', () => {
    const mockPlugin = {
      addCommand: vi.fn(),
      app: {
        workspace: {
          getActiveFile: vi.fn()
        },
        vault: {
          read: vi.fn(),
          modify: vi.fn()
        }
      }
    };
    
    const mockTimeTracker = {
      startTimer: vi.fn(),
      stopTimer: vi.fn(),
      togglePause: vi.fn()
    };
    
    registerTimeCommands(mockPlugin as any, mockTimeTracker as any);
    
    expect(mockPlugin.addCommand).toHaveBeenCalledTimes(5);
    expect(mockPlugin.addCommand).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'start-timer' })
    );
    expect(mockPlugin.addCommand).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'stop-timer' })
    );
  });
});
```

## Acceptance Criteria
- [ ] Start timer command works
- [ ] Stop timer adds entry to note
- [ ] Push time command available
- [ ] Quick entry modal works
- [ ] Commands only available for ticket files

## Execution Notes
- Commands should only show for ticket files (matching pattern)
- Include keyboard shortcuts for common commands
- Integrate with existing sync engine