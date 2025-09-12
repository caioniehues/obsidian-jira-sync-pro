# STM Task 15: Timer Core Implementation

## Task Definition
Build timer functionality with start/stop/pause, status bar display, and crash recovery

## Size: Large
## Priority: High (USER PRIORITY #1)
## Dependencies: Task 14 (Settings)

## Implementation

```typescript
// src/time/time-tracker.ts
export class TimeTracker {
  private currentTimer: Timer | null = null;
  private statusBarItem: StatusBarItem;
  private updateInterval: number;
  private saveInterval: number;

  startTimer(ticketKey: string, description?: string): void {
    this.currentTimer = {
      ticketKey,
      startTime: Date.now(),
      elapsed: 0,
      isPaused: false,
      description
    };
    
    this.saveTimerState();
    this.updateDisplay();
    new Notice(`⏱️ Timer started for ${ticketKey}`);
  }

  stopTimer(): string | null {
    if (!this.currentTimer) return null;
    
    const totalElapsed = this.currentTimer.elapsed + 
      (this.currentTimer.isPaused ? 0 : Date.now() - this.currentTimer.startTime);
    
    const entry = `- ${this.formatTime(totalElapsed)}: ${this.currentTimer.description || ''}`;
    
    this.currentTimer = null;
    this.saveTimerState();
    this.updateDisplay();
    
    return entry;
  }

  private updateDisplay(): void {
    if (!this.currentTimer) {
      this.statusBarItem.setText('');
      return;
    }

    const elapsed = this.getCurrentElapsed();
    const formatted = this.formatTime(elapsed);
    
    if (this.currentTimer.isPaused) {
      this.statusBarItem.setText(`⏸️ ${this.currentTimer.ticketKey}: ${formatted}`);
    } else {
      this.statusBarItem.setText(`⏱️ ${this.currentTimer.ticketKey}: ${formatted}`);
    }
  }
}
```

## Commands Added
- `Start timer for current ticket` - Starts timer for ticket file
- `Stop timer` - Stops timer and logs entry
- `Pause/Resume timer` - Toggle timer state
- `Show timer status` - Display current info

## Acceptance Criteria
- [x] Timer starts/stops correctly for ticket files
- [x] Status bar shows real-time updates (⏱️ RICCE-123: 2h 30m)
- [x] Timer persists across crashes/restarts
- [x] Pause/resume functionality works
- [x] Smart commands only for ticket files (PROJ-123.md pattern)

## Status: ✅ COMPLETED