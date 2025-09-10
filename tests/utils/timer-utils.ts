/**
 * Jest Timer Utilities for Auto-Sync Scheduler Testing
 * 
 * Addresses known timer mocking conflicts in Jest when testing
 * interval-based operations like AutoSyncScheduler.
 * 
 * This utility provides a unified approach to timer management that
 * works with Jest's global fake timers configuration and individual test setups.
 */

/**
 * Check if Jest fake timers are currently active
 */
export const areFakeTimersActive = (): boolean => {
  try {
    // Check if we can get timer count - this is only available with fake timers
    const timerCount = jest.getTimerCount();
    return typeof timerCount === 'number';
  } catch {
    // If getTimerCount fails, try checking if advanceTimersByTime works
    try {
      jest.advanceTimersByTime(0);
      return true;
    } catch {
      return false;
    }
  }
};

/**
 * Safely ensure fake timers are active for the current test
 * Only calls useFakeTimers() if not already active
 */
export const ensureFakeTimers = (): void => {
  if (!areFakeTimersActive()) {
    jest.useFakeTimers();
  }
};

/**
 * Safely clear timers and optionally restore real timers
 * Handles cases where fake timers may not be active
 */
export const safelyCleanupTimers = (restoreRealTimers = false): void => {
  try {
    if (areFakeTimersActive()) {
      // Clear any pending timers if fake timers are active
      jest.clearAllTimers();
    }
    
    if (restoreRealTimers) {
      jest.useRealTimers();
    }
  } catch (error) {
    // If cleanup fails, just restore real timers as fallback
    try {
      jest.useRealTimers();
    } catch {
      // Silently ignore if even real timers can't be restored
    }
  }
};

/**
 * Setup function for timer-dependent tests
 * Call this in beforeEach when you need fake timers
 */
export const setupFakeTimersForTest = (): void => {
  ensureFakeTimers();
};

/**
 * Cleanup function for timer-dependent tests
 * Call this in afterEach to clean up timers
 */
export const cleanupTimersAfterTest = (): void => {
  safelyCleanupTimers(false); // Don't restore real timers, let Jest handle it
};

/**
 * Polyfill for setImmediate in environments where it's not available
 */
const immediatePolyfill = (callback: () => void) => {
  if (typeof setImmediate !== 'undefined') {
    return setImmediate(callback);
  } else {
    return setTimeout(callback, 0);
  }
};

/**
 * Helper to advance timers and wait for async operations
 * Useful for scheduler testing where we need to advance time
 * and wait for async operations to complete
 */
export const advanceTimersAndFlush = async (ms: number): Promise<void> => {
  if (areFakeTimersActive()) {
    jest.advanceTimersByTime(ms);
    await new Promise(resolve => immediatePolyfill(resolve));
  } else {
    // If real timers, just wait the actual time
    await new Promise(resolve => setTimeout(resolve, ms));
  }
};

/**
 * Helper to run all pending timers and flush promises
 * Useful when testing multiple scheduled operations
 */
export const runAllTimersAndFlush = async (): Promise<void> => {
  if (areFakeTimersActive()) {
    jest.runAllTimers();
    await new Promise(resolve => immediatePolyfill(resolve));
  } else {
    // With real timers, just flush the event loop
    await new Promise(resolve => immediatePolyfill(resolve));
  }
};

/**
 * Helper to create a controlled timer environment
 * for complex scheduler testing scenarios
 */
export class TimerController {
  private startTime: number;
  private fakeTimersWereActive: boolean;

  constructor() {
    this.startTime = Date.now();
    this.fakeTimersWereActive = areFakeTimersActive();
    
    // Ensure fake timers are active for timer control
    ensureFakeTimers();
    
    // Set system time if fake timers are available
    if (areFakeTimersActive()) {
      jest.setSystemTime(this.startTime);
    }
  }

  /**
   * Advance time by specified milliseconds
   */
  advance(ms: number): void {
    if (areFakeTimersActive()) {
      jest.advanceTimersByTime(ms);
    } else {
      console.warn('TimerController.advance() called but fake timers are not active');
    }
  }

  /**
   * Set absolute system time
   */
  setTime(timestamp: number): void {
    if (areFakeTimersActive()) {
      jest.setSystemTime(timestamp);
    } else {
      console.warn('TimerController.setTime() called but fake timers are not active');
    }
  }

  /**
   * Get current mocked time
   */
  now(): number {
    return Date.now();
  }

  /**
   * Reset to start time
   */
  reset(): void {
    if (areFakeTimersActive()) {
      jest.setSystemTime(this.startTime);
    }
  }

  /**
   * Run all pending timers
   */
  runAllTimers(): void {
    if (areFakeTimersActive()) {
      jest.runAllTimers();
    } else {
      console.warn('TimerController.runAllTimers() called but fake timers are not active');
    }
  }

  /**
   * Run only pending timers (not recurring)
   */
  runOnlyPendingTimers(): void {
    if (areFakeTimersActive()) {
      jest.runOnlyPendingTimers();
    } else {
      console.warn('TimerController.runOnlyPendingTimers() called but fake timers are not active');
    }
  }

  /**
   * Clean up the timer controller
   */
  destroy(): void {
    // Only restore real timers if we activated fake timers
    if (!this.fakeTimersWereActive && areFakeTimersActive()) {
      safelyCleanupTimers(true);
    }
  }
}

/**
 * Mock scheduler for testing auto-sync intervals
 * Helps avoid Jest timer mocking conflicts by providing a controlled interface
 */
export class MockScheduler {
  private intervals: Map<number, NodeJS.Timeout> = new Map();
  private timeouts: Map<number, NodeJS.Timeout> = new Map();
  private nextId = 1;

  setInterval(callback: () => void, delay: number): number {
    const id = this.nextId++;
    const timer = setInterval(callback, delay);
    this.intervals.set(id, timer);
    return id;
  }

  setTimeout(callback: () => void, delay: number): number {
    const id = this.nextId++;
    const timer = setTimeout(callback, delay);
    this.timeouts.set(id, timer);
    return id;
  }

  clearInterval(id: number): void {
    const timer = this.intervals.get(id);
    if (timer) {
      clearInterval(timer);
      this.intervals.delete(id);
    }
  }

  clearTimeout(id: number): void {
    const timer = this.timeouts.get(id);
    if (timer) {
      clearTimeout(timer);
      this.timeouts.delete(id);
    }
  }

  clearAll(): void {
    this.intervals.forEach((timer) => clearInterval(timer));
    this.timeouts.forEach((timer) => clearTimeout(timer));
    this.intervals.clear();
    this.timeouts.clear();
  }

  /**
   * Get count of active intervals (for testing)
   */
  getActiveIntervals(): number {
    return this.intervals.size;
  }

  /**
   * Get count of active timeouts (for testing)
   */
  getActiveTimeouts(): number {
    return this.timeouts.size;
  }

  /**
   * Force execution of all active timers (for testing with fake timers)
   */
  executeAllTimers(): void {
    if (areFakeTimersActive()) {
      jest.runAllTimers();
    } else {
      console.warn('MockScheduler.executeAllTimers() called but fake timers are not active');
    }
  }

  /**
   * Advance time and execute timers (for testing with fake timers)
   */
  advanceTime(ms: number): void {
    if (areFakeTimersActive()) {
      jest.advanceTimersByTime(ms);
    } else {
      console.warn('MockScheduler.advanceTime() called but fake timers are not active');
    }
  }
}