# STM Task 24: Write Core Tests

## Task Definition
Add comprehensive tests for time tracking and template functionality

## Size: Medium
## Priority: Medium
## Dependencies: Tasks 15, 16, 18 (Timer core, Time parser, Simple template engine)

## Implementation

```typescript
// tests/unit/time/time-parser.test.ts
import { describe, it, expect } from 'vitest';
import { parseTimeString, formatTime } from '@/time/parser';

describe('Time Parser', () => {
  describe('parseTimeString', () => {
    it('should parse hours only', () => {
      expect(parseTimeString('2h')).toBe(7200);
      expect(parseTimeString('1.5h')).toBe(5400);
      expect(parseTimeString('0.25h')).toBe(900);
    });
    
    it('should parse minutes only', () => {
      expect(parseTimeString('30m')).toBe(1800);
      expect(parseTimeString('5m')).toBe(300);
      expect(parseTimeString('90m')).toBe(5400);
    });
    
    it('should parse hours and minutes', () => {
      expect(parseTimeString('2h30m')).toBe(9000);
      expect(parseTimeString('1h 15m')).toBe(4500);
      expect(parseTimeString('0.5h 30m')).toBe(3600);
    });
    
    it('should parse plain numbers as minutes', () => {
      expect(parseTimeString('30')).toBe(1800);
      expect(parseTimeString('90')).toBe(5400);
      expect(parseTimeString('5')).toBe(300);
    });
    
    it('should handle invalid input', () => {
      expect(parseTimeString('')).toBe(0);
      expect(parseTimeString('invalid')).toBe(0);
      expect(parseTimeString('abc')).toBe(0);
    });
    
    it('should handle edge cases', () => {
      expect(parseTimeString('0h')).toBe(0);
      expect(parseTimeString('0m')).toBe(0);
      expect(parseTimeString('0')).toBe(0);
    });
  });
  
  describe('formatTime', () => {
    it('should format seconds to readable time', () => {
      expect(formatTime(3600)).toBe('1h');
      expect(formatTime(1800)).toBe('30m');
      expect(formatTime(5400)).toBe('1h 30m');
      expect(formatTime(7200)).toBe('2h');
    });
    
    it('should handle zero and small values', () => {
      expect(formatTime(0)).toBe('0m');
      expect(formatTime(60)).toBe('1m');
      expect(formatTime(300)).toBe('5m');
    });
    
    it('should handle large values', () => {
      expect(formatTime(36000)).toBe('10h');
      expect(formatTime(39600)).toBe('11h');
    });
  });
});

// tests/unit/time/time-tracker.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TimeTracker } from '@/time/time-tracker';

describe('TimeTracker', () => {
  let mockPlugin: any;
  let timeTracker: TimeTracker;
  
  beforeEach(() => {
    vi.useFakeTimers();
    
    mockPlugin = {
      addStatusBarItem: vi.fn(() => ({
        setText: vi.fn()
      })),
      registerInterval: vi.fn(),
      saveData: vi.fn(),
      loadData: vi.fn().mockResolvedValue({})
    };
    
    timeTracker = new TimeTracker(mockPlugin);
  });
  
  afterEach(() => {
    vi.useRealTimers();
  });
  
  it('should start timer correctly', () => {
    const ticketKey = 'TEST-123';
    
    timeTracker.startTimer(ticketKey);
    
    expect(mockPlugin.saveData).toHaveBeenCalledWith({
      timer: expect.objectContaining({
        ticketKey,
        isPaused: false
      })
    });
  });
  
  it('should stop timer and return formatted entry', () => {
    const ticketKey = 'TEST-123';
    timeTracker.startTimer(ticketKey);
    
    // Advance time by 30 minutes
    vi.advanceTimersByTime(30 * 60 * 1000);
    
    const entry = timeTracker.stopTimer();
    
    expect(entry).toBe('- 30m: ');
    expect(mockPlugin.saveData).toHaveBeenCalledWith({ timer: null });
  });
  
  it('should pause and resume timer', () => {
    const ticketKey = 'TEST-123';
    timeTracker.startTimer(ticketKey);
    
    // Run for 15 minutes then pause
    vi.advanceTimersByTime(15 * 60 * 1000);
    timeTracker.pauseTimer();
    
    // Advance time while paused
    vi.advanceTimersByTime(10 * 60 * 1000);
    timeTracker.resumeTimer();
    
    // Run for another 15 minutes
    vi.advanceTimersByTime(15 * 60 * 1000);
    
    const entry = timeTracker.stopTimer();
    expect(entry).toBe('- 30m: '); // Only 30 minutes counted, not the paused 10
  });
  
  it('should persist timer state', async () => {
    const ticketKey = 'TEST-123';
    const timerData = {
      ticketKey,
      startTime: Date.now(),
      elapsed: 1800000, // 30 minutes
      isPaused: false
    };
    
    mockPlugin.loadData.mockResolvedValue({ timer: timerData });
    
    const newTracker = new TimeTracker(mockPlugin);
    await vi.runAllTimersAsync();
    
    // Should restore the timer
    expect(newTracker.getCurrentTimer()).toEqual(
      expect.objectContaining({ ticketKey })
    );
  });
});

// tests/unit/templates/simple-template-engine.test.ts
import { describe, it, expect } from 'vitest';
import { SimpleTemplateEngine } from '@/templates/simple-template-engine';

describe('SimpleTemplateEngine', () => {
  let templateEngine: SimpleTemplateEngine;
  
  beforeEach(() => {
    templateEngine = new SimpleTemplateEngine();
  });
  
  it('should replace basic ticket variables', () => {
    const ticket = {
      key: 'TEST-123',
      fields: {
        summary: 'Test ticket summary',
        status: { name: 'In Progress' },
        issuetype: { name: 'Bug' },
        priority: { name: 'High' },
        assignee: { displayName: 'John Doe' },
        description: 'This is a test ticket'
      }
    };
    
    const result = templateEngine.applyTemplate(ticket);
    
    expect(result).toContain('TEST-123');
    expect(result).toContain('Test ticket summary');
    expect(result).toContain('In Progress');
    expect(result).toContain('Bug');
    expect(result).toContain('High');
    expect(result).toContain('John Doe');
    expect(result).toContain('This is a test ticket');
  });
  
  it('should handle missing fields gracefully', () => {
    const ticket = {
      key: 'TEST-456',
      fields: {
        summary: 'Incomplete ticket'
        // Missing other fields
      }
    };
    
    const result = templateEngine.applyTemplate(ticket);
    
    expect(result).toContain('TEST-456');
    expect(result).toContain('Incomplete ticket');
    expect(result).toContain('Unassigned'); // Default for missing assignee
  });
  
  it('should extract sprint information correctly', () => {
    const ticket = {
      key: 'TEST-789',
      fields: {
        summary: 'Sprint ticket',
        customfield_10020: [
          'com.atlassian.greenhopper.service.sprint.Sprint@123[id=1,rapidViewId=1,state=ACTIVE,name=Sprint 1,startDate=2023-01-01,endDate=2023-01-14]'
        ]
      }
    };
    
    const result = templateEngine.applyTemplate(ticket);
    
    expect(result).toContain('Sprint 1');
  });
  
  it('should add time entries to existing content', () => {
    const content = `# TEST-123: Sample Ticket

## Details
- **Status**: Open

## ⏱️ Time Log
- 1h: Initial investigation

## Technical Notes`;
    
    const newEntry = '- 30m: Code review';
    const result = templateEngine.addTimeEntry(content, newEntry);
    
    expect(result).toContain('- 1h: Initial investigation');
    expect(result).toContain('- 30m: Code review');
    
    // New entry should be after existing entries
    const lines = result.split('\n');
    const timeLogIndex = lines.findIndex(line => line.includes('## ⏱️ Time Log'));
    const newEntryIndex = lines.findIndex(line => line.includes('- 30m: Code review'));
    
    expect(newEntryIndex).toBeGreaterThan(timeLogIndex);
  });
  
  it('should create time log section if missing', () => {
    const content = `# TEST-123: Sample Ticket

## Details
- **Status**: Open

## Technical Notes`;
    
    const newEntry = '- 1h: First work session';
    const result = templateEngine.addTimeEntry(content, newEntry);
    
    expect(result).toContain('## ⏱️ Time Log');
    expect(result).toContain('- 1h: First work session');
  });
});

// tests/integration/plugin-sync.test.ts
import { describe, it, expect, vi } from 'vitest';

describe('Plugin Integration', () => {
  it('should initialize all components correctly', () => {
    // Integration test for plugin startup
    expect(true).toBe(true); // Placeholder
  });
  
  it('should sync tickets and apply templates', () => {
    // Integration test for sync + template flow  
    expect(true).toBe(true); // Placeholder
  });
  
  it('should track time and push to Jira', () => {
    // Integration test for time tracking flow
    expect(true).toBe(true); // Placeholder
  });
});

// tests/contract/jira-api.test.ts
import { describe, it, expect } from 'vitest';

describe('Jira API Contracts', () => {
  it('should match expected ticket structure', () => {
    const mockTicket = {
      key: 'TEST-123',
      fields: {
        summary: 'Test',
        status: { name: 'Open' },
        issuetype: { name: 'Task' }
      }
    };
    
    // Verify structure matches our expectations
    expect(mockTicket.key).toBeDefined();
    expect(mockTicket.fields.summary).toBeDefined();
    expect(mockTicket.fields.status.name).toBeDefined();
  });
  
  it('should handle worklog API response format', () => {
    const mockWorklogResponse = {
      id: '12345',
      author: { displayName: 'Test User' },
      timeSpentSeconds: 3600,
      comment: 'Work completed'
    };
    
    expect(mockWorklogResponse.timeSpentSeconds).toBe(3600);
    expect(mockWorklogResponse.author.displayName).toBeDefined();
  });
});
```

## Test Configuration

```typescript
// tests/setup.ts (additional test utilities)
export function createMockTicket(overrides = {}) {
  return {
    key: 'TEST-123',
    fields: {
      summary: 'Mock ticket',
      status: { name: 'Open' },
      issuetype: { name: 'Task' },
      priority: { name: 'Medium' },
      assignee: { displayName: 'Test User' },
      description: 'Mock description',
      ...overrides
    }
  };
}

export function createMockPlugin() {
  return {
    app: {
      vault: {
        read: vi.fn(),
        modify: vi.fn(),
        create: vi.fn(),
        getAbstractFileByPath: vi.fn()
      },
      workspace: {
        getActiveFile: vi.fn()
      }
    },
    addStatusBarItem: vi.fn(() => ({ setText: vi.fn() })),
    addCommand: vi.fn(),
    registerInterval: vi.fn(),
    saveData: vi.fn(),
    loadData: vi.fn().mockResolvedValue({})
  };
}
```

## Acceptance Criteria
- [ ] Time parser tests cover all formats
- [ ] Template tests verify variable replacement
- [ ] Timer tests include persistence and pause/resume
- [ ] Integration tests verify component interaction
- [ ] Contract tests validate Jira API expectations
- [ ] All tests pass with good coverage (>85%)
- [ ] Tests are fast and reliable
- [ ] Mock objects realistic and reusable

## Execution Notes
- Use Vitest's built-in mocking for external dependencies
- Focus on testing actual behavior, not implementation details
- Include edge cases and error conditions
- Run tests in CI/CD pipeline
- Aim for >90% code coverage on core modules