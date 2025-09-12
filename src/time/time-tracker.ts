/**
 * Time Tracker Implementation for Jira Tickets
 * 
 * Provides timer functionality with status bar display, persistence,
 * and integration with Jira ticket workflow. This is the #1 user priority.
 */

import { Plugin, StatusBarItem, Notice } from 'obsidian';
import { formatTime } from './time-parser';

/**
 * Timer state interface
 */
export interface Timer {
  ticketKey: string;
  startTime: number;
  elapsed: number; // accumulated time in milliseconds
  isPaused: boolean;
  description?: string;
}

/**
 * Timer state for persistence
 */
interface TimerState {
  timer: Timer | null;
  lastSave: number;
}

/**
 * Time tracking events
 */
export interface TimeTrackingEvents {
  onTimerStart?: (ticketKey: string) => void;
  onTimerStop?: (ticketKey: string, elapsed: number, entry: string) => void;
  onTimerPause?: (ticketKey: string, elapsed: number) => void;
  onTimerResume?: (ticketKey: string) => void;
}

/**
 * Main time tracker class with status bar integration
 */
export class TimeTracker {
  private currentTimer: Timer | null = null;
  private statusBarItem: StatusBarItem;
  private updateInterval: number;
  private saveInterval: number;
  private plugin: Plugin;
  private events: TimeTrackingEvents;

  constructor(plugin: Plugin, events?: TimeTrackingEvents) {
    this.plugin = plugin;
    this.events = events || {};
    
    // Create status bar item
    this.statusBarItem = plugin.addStatusBarItem();
    this.statusBarItem.setText('');
    
    // Load persisted timer state
    this.loadTimerState();
    
    // Update display every second
    this.updateInterval = window.setInterval(() => {
      this.updateDisplay();
    }, 1000);
    
    // Auto-save state every 30 seconds
    this.saveInterval = window.setInterval(() => {
      this.saveTimerState();
    }, 30000);
    
    // Register intervals for cleanup
    plugin.registerInterval(this.updateInterval);
    plugin.registerInterval(this.saveInterval);
    
    console.log('Jira Sync Pro: Time tracker initialized');
  }

  /**
   * Start timer for a specific ticket
   */
  startTimer(ticketKey: string, description?: string): void {
    // Stop existing timer if running
    if (this.currentTimer) {
      const existingKey = this.currentTimer.ticketKey;
      this.stopTimer();
      if (existingKey === ticketKey) {
        // Starting same ticket again, just notify
        new Notice(`Timer restarted for ${ticketKey}`);
        return;
      }
    }

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
    console.log(`Timer started for ${ticketKey}`);
    
    // Fire event
    this.events.onTimerStart?.(ticketKey);
  }

  /**
   * Stop current timer and return formatted time entry
   */
  stopTimer(): string | null {
    if (!this.currentTimer) {
      new Notice('No active timer to stop');
      return null;
    }

    // Calculate total elapsed time
    const totalElapsed = this.currentTimer.elapsed + 
      (this.currentTimer.isPaused ? 0 : Date.now() - this.currentTimer.startTime);
    
    const ticketKey = this.currentTimer.ticketKey;
    const entry = `- ${this.formatTime(totalElapsed)}: ${this.currentTimer.description || ''}`;
    
    // Clear timer
    this.currentTimer = null;
    this.saveTimerState();
    this.updateDisplay();
    
    new Notice(`⏹️ Timer stopped for ${ticketKey}: ${this.formatTime(totalElapsed)}`);
    console.log(`Timer stopped for ${ticketKey}, elapsed: ${totalElapsed}ms`);
    
    // Fire event
    this.events.onTimerStop?.(ticketKey, totalElapsed, entry);
    
    return entry;
  }

  /**
   * Pause current timer
   */
  pauseTimer(): void {
    if (!this.currentTimer) {
      new Notice('No active timer to pause');
      return;
    }

    if (this.currentTimer.isPaused) {
      new Notice('Timer is already paused');
      return;
    }

    // Add current session time to elapsed
    this.currentTimer.elapsed += Date.now() - this.currentTimer.startTime;
    this.currentTimer.isPaused = true;
    
    this.saveTimerState();
    this.updateDisplay();
    
    const elapsed = this.currentTimer.elapsed;
    new Notice(`⏸️ Timer paused for ${this.currentTimer.ticketKey}`);
    
    // Fire event
    this.events.onTimerPause?.(this.currentTimer.ticketKey, elapsed);
  }

  /**
   * Resume paused timer
   */
  resumeTimer(): void {
    if (!this.currentTimer) {
      new Notice('No timer to resume');
      return;
    }

    if (!this.currentTimer.isPaused) {
      new Notice('Timer is already running');
      return;
    }

    this.currentTimer.isPaused = false;
    this.currentTimer.startTime = Date.now(); // Reset start time
    
    this.saveTimerState();
    this.updateDisplay();
    
    new Notice(`▶️ Timer resumed for ${this.currentTimer.ticketKey}`);
    
    // Fire event
    this.events.onTimerResume?.(this.currentTimer.ticketKey);
  }

  /**
   * Toggle timer pause/resume
   */
  togglePause(): void {
    if (!this.currentTimer) {
      new Notice('No active timer');
      return;
    }

    if (this.currentTimer.isPaused) {
      this.resumeTimer();
    } else {
      this.pauseTimer();
    }
  }

  /**
   * Get current timer information
   */
  getCurrentTimer(): Timer | null {
    return this.currentTimer ? { ...this.currentTimer } : null;
  }

  /**
   * Get current elapsed time in milliseconds
   */
  getCurrentElapsed(): number {
    if (!this.currentTimer) return 0;
    
    if (this.currentTimer.isPaused) {
      return this.currentTimer.elapsed;
    } else {
      return this.currentTimer.elapsed + (Date.now() - this.currentTimer.startTime);
    }
  }

  /**
   * Format milliseconds to readable time string (2h30m format)
   */
  formatTime(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    return formatTime(seconds);
  }

  /**
   * Update status bar display
   */
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

  /**
   * Save timer state for persistence
   */
  private async saveTimerState(): Promise<void> {
    try {
      const data = await this.plugin.loadData() || {};
      
      const timerState: TimerState = {
        timer: this.currentTimer,
        lastSave: Date.now()
      };
      
      data.timeTracker = timerState;
      await this.plugin.saveData(data);
    } catch (error) {
      console.error('Failed to save timer state:', error);
    }
  }

  /**
   * Load persisted timer state
   */
  private async loadTimerState(): Promise<void> {
    try {
      const data = await this.plugin.loadData();
      if (!data?.timeTracker) return;
      
      const timerState: TimerState = data.timeTracker;
      if (!timerState.timer) return;
      
      // Restore timer
      this.currentTimer = timerState.timer;
      
      // Handle crash recovery - if timer was running, adjust for time passed
      if (!this.currentTimer.isPaused) {
        const timeSinceLastSave = Date.now() - timerState.lastSave;
        
        // If more than 5 minutes have passed, pause the timer
        if (timeSinceLastSave > 5 * 60 * 1000) {
          console.log('Timer recovered after crash, but pausing due to time gap');
          this.currentTimer.elapsed += timeSinceLastSave;
          this.currentTimer.isPaused = true;
          new Notice(`⚠️ Timer for ${this.currentTimer.ticketKey} was paused due to application restart`);
        } else {
          // Adjust start time to account for downtime
          this.currentTimer.startTime = Date.now() - timeSinceLastSave;
          console.log(`Timer recovered for ${this.currentTimer.ticketKey}`);
          new Notice(`🔄 Timer restored for ${this.currentTimer.ticketKey}`);
        }
      }
      
      this.updateDisplay();
    } catch (error) {
      console.error('Failed to load timer state:', error);
    }
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    if (this.updateInterval) {
      window.clearInterval(this.updateInterval);
    }
    if (this.saveInterval) {
      window.clearInterval(this.saveInterval);
    }
    
    // Save final state
    this.saveTimerState();
  }
}

/**
 * Timer statistics for reporting
 */
export interface TimerStats {
  totalSessions: number;
  totalTime: number;
  averageSession: number;
  longestSession: number;
  ticketBreakdown: Record<string, number>;
}

/**
 * Simple timer statistics tracker
 */
export class TimerStatsTracker {
  private plugin: Plugin;
  
  constructor(plugin: Plugin) {
    this.plugin = plugin;
  }
  
  /**
   * Record completed timer session
   */
  async recordSession(ticketKey: string, elapsed: number): Promise<void> {
    try {
      const data = await this.plugin.loadData() || {};
      if (!data.timerStats) {
        data.timerStats = {
          sessions: [],
          ticketTotals: {}
        };
      }
      
      // Add session record
      data.timerStats.sessions.push({
        ticketKey,
        elapsed,
        timestamp: Date.now()
      });
      
      // Update ticket totals
      data.timerStats.ticketTotals[ticketKey] = 
        (data.timerStats.ticketTotals[ticketKey] || 0) + elapsed;
      
      // Keep only last 1000 sessions
      if (data.timerStats.sessions.length > 1000) {
        data.timerStats.sessions = data.timerStats.sessions.slice(-1000);
      }
      
      await this.plugin.saveData(data);
    } catch (error) {
      console.error('Failed to record timer session:', error);
    }
  }
  
  /**
   * Get timer statistics
   */
  async getStats(): Promise<TimerStats> {
    try {
      const data = await this.plugin.loadData();
      if (!data?.timerStats?.sessions) {
        return {
          totalSessions: 0,
          totalTime: 0,
          averageSession: 0,
          longestSession: 0,
          ticketBreakdown: {}
        };
      }
      
      const sessions = data.timerStats.sessions;
      const totalSessions = sessions.length;
      const totalTime = sessions.reduce((sum: number, s: any) => sum + s.elapsed, 0);
      const averageSession = totalSessions > 0 ? totalTime / totalSessions : 0;
      const longestSession = sessions.reduce((max: number, s: any) => Math.max(max, s.elapsed), 0);
      
      return {
        totalSessions,
        totalTime,
        averageSession,
        longestSession,
        ticketBreakdown: data.timerStats.ticketTotals || {}
      };
    } catch (error) {
      console.error('Failed to get timer stats:', error);
      return {
        totalSessions: 0,
        totalTime: 0,
        averageSession: 0,
        longestSession: 0,
        ticketBreakdown: {}
      };
    }
  }
}