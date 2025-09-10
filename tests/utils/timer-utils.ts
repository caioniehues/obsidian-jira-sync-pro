/**
 * Jest Timer Utilities for Auto-Sync Scheduler Testing
 * 
 * Addresses known timer mocking conflicts in Jest when testing
 * interval-based operations like AutoSyncScheduler.
 */

// Global Jest timer setup
beforeEach(() => {
  // Use fake timers for all tests
  jest.useFakeTimers();
});

afterEach(() => {
  // Clear all timers and restore real timers
  jest.runOnlyPendingTimers();
  jest.useRealTimers();
});

/**
 * Helper to advance timers and wait for async operations
 * Useful for scheduler testing where we need to advance time
 * and wait for async operations to complete
 */
export const advanceTimersAndFlush = async (ms: number) => {
  jest.advanceTimersByTime(ms);
  await new Promise(resolve => setImmediate(resolve));
};

/**
 * Helper to run all pending timers and flush promises
 * Useful when testing multiple scheduled operations
 */
export const runAllTimersAndFlush = async () => {
  jest.runAllTimers();
  await new Promise(resolve => setImmediate(resolve));
};

/**
 * Helper to create a controlled timer environment
 * for complex scheduler testing scenarios
 */
export class TimerController {
  private startTime: number;

  constructor() {
    this.startTime = Date.now();
    jest.setSystemTime(this.startTime);
  }

  /**
   * Advance time by specified milliseconds
   */
  advance(ms: number): void {
    jest.advanceTimersByTime(ms);
  }

  /**
   * Set absolute system time
   */
  setTime(timestamp: number): void {
    jest.setSystemTime(timestamp);
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
    jest.setSystemTime(this.startTime);
  }

  /**
   * Run all pending timers
   */
  runAllTimers(): void {
    jest.runAllTimers();
  }

  /**
   * Run only pending timers (not recurring)
   */
  runOnlyPendingTimers(): void {
    jest.runOnlyPendingTimers();
  }
}

/**
 * Mock scheduler for testing auto-sync intervals
 * Helps avoid Jest timer mocking conflicts
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
}