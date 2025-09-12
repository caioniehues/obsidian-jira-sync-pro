/**
 * Utility functions for testing (wait functions, mock timers, etc.)
 * Provides comprehensive testing utilities for async operations, mocking, and test setup
 */

/**
 * Waits for a specified number of milliseconds
 */
export function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Waits for a condition to be true with timeout and polling
 */
export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  options: {
    timeout?: number;
    interval?: number;
    timeoutMessage?: string;
  } = {}
): Promise<void> {
  const { timeout = 5000, interval = 100, timeoutMessage = 'Condition timed out' } = options;
  
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    const result = await condition();
    if (result) {
      return;
    }
    await wait(interval);
  }
  
  throw new Error(timeoutMessage);
}

/**
 * Waits for a callback to be called a certain number of times
 */
export async function waitForCalls(
  mockFunction: vi.Mock,
  expectedCallCount: number,
  timeout: number = 5000
): Promise<void> {
  await waitFor(
    () => mockFunction.mock.calls.length >= expectedCallCount,
    {
      timeout,
      timeoutMessage: `Expected ${expectedCallCount} calls, got ${mockFunction.mock.calls.length}`
    }
  );
}

/**
 * Waits for an element or condition with custom matcher
 */
export async function waitForCondition<T>(
  getter: () => T,
  matcher: (value: T) => boolean,
  options: {
    timeout?: number;
    interval?: number;
    description?: string;
  } = {}
): Promise<T> {
  const { timeout = 5000, interval = 100, description = 'condition' } = options;
  
  const startTime = Date.now();
  let lastValue: T;
  
  while (Date.now() - startTime < timeout) {
    lastValue = getter();
    if (matcher(lastValue)) {
      return lastValue;
    }
    await wait(interval);
  }
  
  throw new Error(`Timeout waiting for ${description}. Last value: ${JSON.stringify(lastValue!)}`);
}

/**
 * Mock timer utilities for testing time-dependent code
 */
export class MockTimer {
  private originalSetTimeout: typeof setTimeout;
  private originalSetInterval: typeof setInterval;
  private originalClearTimeout: typeof clearTimeout;
  private originalClearInterval: typeof clearInterval;
  private originalDateNow: typeof Date.now;
  
  private currentTime: number = 0;
  private timers: Map<number, {
    callback: () => void;
    time: number;
    interval?: number;
    type: 'timeout' | 'interval';
  }> = new Map();
  private timerIdCounter: number = 1;

  constructor(startTime: number = 0) {
    this.currentTime = startTime;
    this.originalSetTimeout = global.setTimeout;
    this.originalSetInterval = global.setInterval;
    this.originalClearTimeout = global.clearTimeout;
    this.originalClearInterval = global.clearInterval;
    this.originalDateNow = Date.now;
  }

  /**
   * Installs the mock timer
   */
  install(): void {
    global.setTimeout = vi.fn((callback: () => void, delay: number) => {
      const id = this.timerIdCounter++;
      this.timers.set(id, {
        callback,
        time: this.currentTime + delay,
        type: 'timeout'
      });
      return id as any;
    });

    global.setInterval = vi.fn((callback: () => void, delay: number) => {
      const id = this.timerIdCounter++;
      this.timers.set(id, {
        callback,
        time: this.currentTime + delay,
        interval: delay,
        type: 'interval'
      });
      return id as any;
    });

    global.clearTimeout = vi.fn((id: number) => {
      this.timers.delete(id);
    });

    global.clearInterval = vi.fn((id: number) => {
      this.timers.delete(id);
    });

    Date.now = vi.fn(() => this.currentTime);
  }

  /**
   * Uninstalls the mock timer and restores originals
   */
  uninstall(): void {
    global.setTimeout = this.originalSetTimeout;
    global.setInterval = this.originalSetInterval;
    global.clearTimeout = this.originalClearTimeout;
    global.clearInterval = this.originalClearInterval;
    Date.now = this.originalDateNow;
  }

  /**
   * Advances time and executes callbacks
   */
  advanceTime(ms: number): void {
    const targetTime = this.currentTime + ms;
    
    while (this.currentTime < targetTime) {
      // Find the next timer to execute
      let nextTime = targetTime;
      let nextTimer: { id: number; timer: any } | null = null;
      
      for (const [id, timer] of this.timers.entries()) {
        if (timer.time <= targetTime && timer.time > this.currentTime) {
          if (timer.time < nextTime) {
            nextTime = timer.time;
            nextTimer = { id, timer };
          }
        }
      }
      
      if (nextTimer) {
        this.currentTime = nextTime;
        nextTimer.timer.callback();
        
        if (nextTimer.timer.type === 'interval' && nextTimer.timer.interval) {
          // Reschedule interval
          this.timers.set(nextTimer.id, {
            ...nextTimer.timer,
            time: this.currentTime + nextTimer.timer.interval
          });
        } else {
          // Remove timeout
          this.timers.delete(nextTimer.id);
        }
      } else {
        this.currentTime = targetTime;
        break;
      }
    }
  }

  /**
   * Advances time to the next timer
   */
  advanceToNextTimer(): boolean {
    let nextTime = Infinity;
    
    for (const timer of this.timers.values()) {
      if (timer.time > this.currentTime && timer.time < nextTime) {
        nextTime = timer.time;
      }
    }
    
    if (nextTime === Infinity) {
      return false; // No timers remaining
    }
    
    this.advanceTime(nextTime - this.currentTime);
    return true;
  }

  /**
   * Flushes all pending timers
   */
  flush(): void {
    while (this.advanceToNextTimer()) {
      // Continue until no timers remain
    }
  }

  /**
   * Gets current mock time
   */
  getCurrentTime(): number {
    return this.currentTime;
  }

  /**
   * Sets the current time
   */
  setCurrentTime(time: number): void {
    this.currentTime = time;
  }

  /**
   * Gets the number of pending timers
   */
  getPendingTimerCount(): number {
    return this.timers.size;
  }

  /**
   * Clears all timers
   */
  clearAllTimers(): void {
    this.timers.clear();
  }
}

/**
 * Creates a mock progress callback that tracks calls
 */
export function createMockProgressCallback(): {
  callback: vi.Mock;
  getCalls: () => Array<{ current: number; total: number; phase: string; details?: any }>;
  getLastCall: () => { current: number; total: number; phase: string; details?: any } | null;
  waitForPhase: (phase: string, timeout?: number) => Promise<void>;
  waitForCompletion: (timeout?: number) => Promise<void>;
} {
  const callback = vi.fn();
  
  return {
    callback,
    getCalls: () => callback.mock.calls.map(call => ({
      current: call[0],
      total: call[1],
      phase: call[2],
      details: call[3]
    })),
    getLastCall: () => {
      const calls = callback.mock.calls;
      if (calls.length === 0) return null;
      const lastCall = calls[calls.length - 1];
      return {
        current: lastCall[0],
        total: lastCall[1],
        phase: lastCall[2],
        details: lastCall[3]
      };
    },
    waitForPhase: async (phase: string, timeout: number = 5000) => {
      await waitFor(
        () => callback.mock.calls.some(call => call[2] === phase),
        { timeout, timeoutMessage: `Timeout waiting for phase: ${phase}` }
      );
    },
    waitForCompletion: async (timeout: number = 5000) => {
      await waitFor(
        () => {
          const calls = callback.mock.calls;
          return calls.length > 0 && calls[calls.length - 1][2] === 'complete';
        },
        { timeout, timeoutMessage: 'Timeout waiting for completion' }
      );
    }
  };
}

/**
 * Creates a mock error callback that tracks errors
 */
export function createMockErrorCallback(): {
  callback: vi.Mock;
  getErrors: () => Array<{ ticketKey: string; error: string }>;
  getErrorCount: () => number;
  hasError: (ticketKey: string) => boolean;
  waitForError: (ticketKey?: string, timeout?: number) => Promise<void>;
} {
  const callback = vi.fn();
  
  return {
    callback,
    getErrors: () => callback.mock.calls.map(call => ({
      ticketKey: call[0],
      error: call[1]
    })),
    getErrorCount: () => callback.mock.calls.length,
    hasError: (ticketKey: string) => callback.mock.calls.some(call => call[0] === ticketKey),
    waitForError: async (ticketKey?: string, timeout: number = 5000) => {
      await waitFor(
        () => {
          if (ticketKey) {
            return callback.mock.calls.some(call => call[0] === ticketKey);
          }
          return callback.mock.calls.length > 0;
        },
        { timeout, timeoutMessage: `Timeout waiting for error${ticketKey ? ` for ${ticketKey}` : ''}` }
      );
    }
  };
}

/**
 * Utility for testing async operations with timeouts
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutMessage?: string
): Promise<T> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(timeoutMessage || `Operation timed out after ${timeoutMs}ms`)), timeoutMs)
  );

  return Promise.race([promise, timeout]);
}

/**
 * Creates a deferred promise for testing
 */
export function createDeferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: any) => void;
  isSettled: () => boolean;
} {
  let resolve!: (value: T) => void;
  let reject!: (error: any) => void;
  let settled = false;

  const promise = new Promise<T>((res, rej) => {
    resolve = (value: T) => {
      settled = true;
      res(value);
    };
    reject = (error: any) => {
      settled = true;
      rej(error);
    };
  });

  return {
    promise,
    resolve,
    reject,
    isSettled: () => settled
  };
}

/**
 * Utility for testing retry logic
 */
export class RetryTester {
  private attempts: number = 0;
  private shouldSucceedAfter: number;

  constructor(shouldSucceedAfter: number = 3) {
    this.shouldSucceedAfter = shouldSucceedAfter;
  }

  async execute<T>(successValue: T, errorMessage: string = 'Temporary failure'): Promise<T> {
    this.attempts++;
    
    if (this.attempts < this.shouldSucceedAfter) {
      throw new Error(`${errorMessage} (attempt ${this.attempts})`);
    }
    
    return successValue;
  }

  getAttempts(): number {
    return this.attempts;
  }

  reset(): void {
    this.attempts = 0;
  }
}

/**
 * Mock for Obsidian's requestUrl function
 */
export function createMockRequestUrl(): {
  mock: vi.Mock;
  mockSuccess: (response: any) => void;
  mockError: (status: number, message?: string, headers?: Record<string, string>) => void;
  mockNetworkError: (message?: string) => void;
  getLastCall: () => any;
  getCallCount: () => number;
} {
  const mock = vi.fn();

  return {
    mock,
    mockSuccess: (response: any) => {
      mock.mockResolvedValueOnce({
        status: 200,
        json: response,
        headers: {}
      });
    },
    mockError: (status: number, message?: string, headers: Record<string, string> = {}) => {
      mock.mockResolvedValueOnce({
        status,
        json: {
          errorMessages: [message || `HTTP ${status} Error`],
          errors: {}
        },
        headers
      });
    },
    mockNetworkError: (message: string = 'Network error') => {
      mock.mockRejectedValueOnce(new Error(message));
    },
    getLastCall: () => mock.mock.calls[mock.mock.calls.length - 1]?.[0],
    getCallCount: () => mock.mock.calls.length
  };
}

/**
 * Test environment setup utilities
 */
export class TestEnvironment {
  private originalEnv: Record<string, string | undefined> = {};
  private mockConsole: Partial<Console> = {};

  /**
   * Sets up test environment with clean state
   */
  setup(): void {
    // Clean up any existing mocks
    vi.clearAllMocks();
    
    // Setup console mocking
    this.mockConsole.log = vi.fn();
    this.mockConsole.warn = vi.fn();
    this.mockConsole.error = vi.fn();
    
    Object.assign(console, this.mockConsole);
  }

  /**
   * Tears down test environment
   */
  teardown(): void {
    // Restore environment variables
    for (const [key, value] of Object.entries(this.originalEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    
    vi.restoreAllMocks();
  }

  /**
   * Sets environment variable for test
   */
  setEnv(key: string, value: string): void {
    if (!(key in this.originalEnv)) {
      this.originalEnv[key] = process.env[key];
    }
    process.env[key] = value;
  }

  /**
   * Gets mock console for assertions
   */
  getMockConsole(): {
    log: vi.Mock;
    warn: vi.Mock;
    error: vi.Mock;
  } {
    return this.mockConsole as any;
  }
}

/**
 * Utility for testing file system operations
 */
export class MockFileSystem {
  private files: Map<string, string> = new Map();
  private directories: Set<string> = new Set();

  constructor() {
    this.directories.add('/'); // Root directory always exists
  }

  /**
   * Creates a file in the mock filesystem
   */
  createFile(path: string, content: string): void {
    const dir = path.substring(0, path.lastIndexOf('/')) || '/';
    if (!this.directories.has(dir)) {
      throw new Error(`Directory does not exist: ${dir}`);
    }
    this.files.set(path, content);
  }

  /**
   * Creates a directory in the mock filesystem
   */
  createDirectory(path: string): void {
    // Create parent directories if they don't exist
    const parts = path.split('/').filter(Boolean);
    let current = '/';
    
    for (const part of parts) {
      current = current === '/' ? `/${part}` : `${current}/${part}`;
      this.directories.add(current);
    }
  }

  /**
   * Checks if a file exists
   */
  fileExists(path: string): boolean {
    return this.files.has(path);
  }

  /**
   * Checks if a directory exists
   */
  directoryExists(path: string): boolean {
    return this.directories.has(path);
  }

  /**
   * Gets file content
   */
  getFileContent(path: string): string | null {
    return this.files.get(path) || null;
  }

  /**
   * Lists files in a directory
   */
  listFiles(dirPath: string): string[] {
    const files: string[] = [];
    for (const [path] of this.files.entries()) {
      if (path.startsWith(dirPath + '/') && path !== dirPath) {
        const relativePath = path.substring(dirPath.length + 1);
        if (!relativePath.includes('/')) {
          files.push(relativePath);
        }
      }
    }
    return files;
  }

  /**
   * Clears all files and directories (except root)
   */
  clear(): void {
    this.files.clear();
    this.directories.clear();
    this.directories.add('/');
  }

  /**
   * Gets all files for testing
   */
  getAllFiles(): Record<string, string> {
    const result: Record<string, string> = {};
    for (const [path, content] of this.files.entries()) {
      result[path] = content;
    }
    return result;
  }
}

/**
 * Creates a test suite setup helper
 */
export function createTestSuite(name: string): {
  mockTimer: MockTimer;
  testEnv: TestEnvironment;
  mockFs: MockFileSystem;
  beforeEach: () => void;
  afterEach: () => void;
} {
  const mockTimer = new MockTimer();
  const testEnv = new TestEnvironment();
  const mockFs = new MockFileSystem();

  return {
    mockTimer,
    testEnv,
    mockFs,
    beforeEach: () => {
      testEnv.setup();
      mockTimer.install();
    },
    afterEach: () => {
      mockTimer.uninstall();
      testEnv.teardown();
      mockFs.clear();
    }
  };
}

/**
 * Assertion helpers for common test patterns
 */
export const assertions = {
  /**
   * Asserts that a function throws with a specific message
   */
  async toThrowWithMessage<T>(
    fn: () => Promise<T>,
    expectedMessage: string | RegExp
  ): Promise<void> {
    try {
      await fn();
      throw new Error('Expected function to throw, but it did not');
    } catch (error: any) {
      if (typeof expectedMessage === 'string') {
        expect(error.message).toContain(expectedMessage);
      } else {
        expect(error.message).toMatch(expectedMessage);
      }
    }
  },

  /**
   * Asserts that a mock function was called with partial arguments
   */
  toHaveBeenCalledWithPartial(
    mockFn: vi.Mock,
    expectedArgs: any[]
  ): void {
    const calls = mockFn.mock.calls;
    const found = calls.some(call => 
      expectedArgs.every((expectedArg, index) => 
        expect.objectContaining(expectedArg).asymmetricMatch
          ? expect.objectContaining(expectedArg).asymmetricMatch(call[index])
          : call[index] === expectedArg
      )
    );
    
    if (!found) {
      throw new Error(
        `Expected mock to have been called with partial args ${JSON.stringify(expectedArgs)}, ` +
        `but it was called with: ${calls.map(call => JSON.stringify(call)).join(', ')}`
      );
    }
  },

  /**
   * Asserts that an async operation completes within a timeout
   */
  async toCompleteWithin<T>(
    operation: Promise<T>,
    timeoutMs: number
  ): Promise<T> {
    return withTimeout(operation, timeoutMs, `Operation did not complete within ${timeoutMs}ms`);
  }
};