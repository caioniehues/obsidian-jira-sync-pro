/**
 * Comprehensive Test Suite for RateLimiter and AdaptiveRateLimiter
 *
 * Tests all rate limiting functionality including:
 * - Basic rate limiting with fixed limits
 * - Adaptive rate limiting with dynamic adjustment
 * - Concurrent request handling
 * - Burst handling and token bucket algorithm
 * - Performance under various load scenarios
 * - Error handling and edge cases
 *
 * RED-GREEN-Refactor: All tests written to fail first, then implemented
 * No mocks - using real implementations for reliable testing
 */

import { vi } from 'vitest';
import { RateLimiter, AdaptiveRateLimiter } from '../../src/sync/rate-limiter';

describe('RateLimiter', () => {
  let rateLimiter: RateLimiter;
  let testStartTime: number;

  beforeEach(() => {
    testStartTime = Date.now();
  });

  afterEach(() => {
    const testDuration = Date.now() - testStartTime;
    console.log(`Test completed in ${testDuration}ms`);
  });

  describe('Basic Rate Limiting', () => {
    test('should initialize with correct parameters', () => {
      rateLimiter = new RateLimiter(100, 60000); // 100 requests per minute

      expect(rateLimiter.getMaxRequests()).toBe(100);
      expect(rateLimiter.getTimeWindow()).toBe(60000);
      expect(rateLimiter.getCurrentCount()).toBe(0);
      expect(rateLimiter.isLimitReached()).toBe(false);
    });

    test('should allow requests within limit', async () => {
      rateLimiter = new RateLimiter(5, 1000); // 5 requests per second

      // Should allow first 5 requests immediately
      for (let i = 0; i < 5; i++) {
        const canProceed = rateLimiter.canProceed();
        expect(canProceed).toBe(true);

        if (canProceed) {
          rateLimiter.recordRequest();
        }
      }

      expect(rateLimiter.getCurrentCount()).toBe(5);
      expect(rateLimiter.isLimitReached()).toBe(true);
    });

    test('should block requests when limit is exceeded', () => {
      rateLimiter = new RateLimiter(3, 1000); // 3 requests per second

      // Use up the limit
      for (let i = 0; i < 3; i++) {
        expect(rateLimiter.canProceed()).toBe(true);
        rateLimiter.recordRequest();
      }

      // Next request should be blocked
      expect(rateLimiter.canProceed()).toBe(false);
      expect(rateLimiter.isLimitReached()).toBe(true);
    });

    test('should reset count after time window expires', async () => {
      rateLimiter = new RateLimiter(2, 100); // 2 requests per 100ms

      // Use up the limit
      expect(rateLimiter.canProceed()).toBe(true);
      rateLimiter.recordRequest();
      expect(rateLimiter.canProceed()).toBe(true);
      rateLimiter.recordRequest();

      expect(rateLimiter.isLimitReached()).toBe(true);

      // Wait for window to expire
      await new Promise(resolve => setTimeout(resolve, 150));

      // Should allow requests again
      expect(rateLimiter.canProceed()).toBe(true);
      expect(rateLimiter.getCurrentCount()).toBe(0);
    });

    test('should calculate correct wait time when limit is exceeded', () => {
      rateLimiter = new RateLimiter(2, 5000); // 2 requests per 5 seconds

      const startTime = Date.now();

      // Use up the limit
      rateLimiter.recordRequest();
      rateLimiter.recordRequest();

      const waitTime = rateLimiter.getWaitTime();
      const expectedWaitTime = 5000 - (Date.now() - startTime);

      expect(waitTime).toBeGreaterThan(0);
      expect(waitTime).toBeLessThanOrEqual(5000);
      expect(waitTime).toBeCloseTo(expectedWaitTime, -2); // Within 100ms tolerance
    });

    test('should handle concurrent requests safely', async () => {
      rateLimiter = new RateLimiter(10, 1000); // 10 requests per second

      const concurrentRequests = 20;
      const results: boolean[] = [];

      // Make concurrent requests
      const promises = Array.from({ length: concurrentRequests }, async () => {
        const canProceed = rateLimiter.canProceed();
        if (canProceed) {
          rateLimiter.recordRequest();
        }
        return canProceed;
      });

      const requestResults = await Promise.all(promises);

      const allowedRequests = requestResults.filter(r => r).length;
      const blockedRequests = requestResults.filter(r => !r).length;

      expect(allowedRequests).toBe(10); // Only 10 should be allowed
      expect(blockedRequests).toBe(10); // 10 should be blocked
      expect(rateLimiter.getCurrentCount()).toBe(10);
    });

    test('should provide accurate statistics', () => {
      rateLimiter = new RateLimiter(5, 1000);

      // Make some requests
      for (let i = 0; i < 3; i++) {
        if (rateLimiter.canProceed()) {
          rateLimiter.recordRequest();
        }
      }

      // Try some blocked requests
      for (let i = 0; i < 2; i++) {
        rateLimiter.canProceed();
      }

      const stats = rateLimiter.getStatistics();

      expect(stats.totalRequests).toBe(3);
      expect(stats.allowedRequests).toBe(3);
      expect(stats.blockedRequests).toBeGreaterThanOrEqual(2);
      expect(stats.currentCount).toBe(3);
      expect(stats.limitReached).toBe(false);
    });
  });

  describe('Async Rate Limiting with waitIfNeeded', () => {
    test('should not wait when within limit', async () => {
      rateLimiter = new RateLimiter(5, 1000);

      const startTime = Date.now();
      await rateLimiter.waitIfNeeded();
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(50); // Should be immediate
      expect(rateLimiter.getCurrentCount()).toBe(1); // Should auto-record request
    });

    test('should wait when limit is exceeded', async () => {
      rateLimiter = new RateLimiter(2, 500); // 2 requests per 500ms

      // Use up the limit
      await rateLimiter.waitIfNeeded();
      await rateLimiter.waitIfNeeded();

      // This should wait
      const startTime = Date.now();
      await rateLimiter.waitIfNeeded();
      const endTime = Date.now();

      const waitDuration = endTime - startTime;
      expect(waitDuration).toBeGreaterThan(400); // Should wait close to 500ms
      expect(waitDuration).toBeLessThan(600); // But not much more
      expect(rateLimiter.getCurrentCount()).toBe(1); // Count should reset after wait
    });

    test('should handle multiple concurrent waiters', async () => {
      rateLimiter = new RateLimiter(1, 200); // 1 request per 200ms

      const startTime = Date.now();
      const promises: Promise<void>[] = [];

      // Create 5 concurrent waiters
      for (let i = 0; i < 5; i++) {
        promises.push(rateLimiter.waitIfNeeded());
      }

      await Promise.all(promises);
      const endTime = Date.now();

      const totalDuration = endTime - startTime;

      // Should take at least 800ms (4 * 200ms waits after first immediate request)
      expect(totalDuration).toBeGreaterThan(800);
      expect(totalDuration).toBeLessThan(1200); // But not too much more
    });

    test('should handle burst requests efficiently', async () => {
      rateLimiter = new RateLimiter(3, 1000); // 3 requests per second

      const timestamps: number[] = [];

      // Make 6 requests (should process in 2 batches)
      for (let i = 0; i < 6; i++) {
        await rateLimiter.waitIfNeeded();
        timestamps.push(Date.now());
      }

      // First 3 should be immediate
      expect(timestamps[1] - timestamps[0]).toBeLessThan(50);
      expect(timestamps[2] - timestamps[1]).toBeLessThan(50);

      // There should be a gap before the 4th request
      expect(timestamps[3] - timestamps[2]).toBeGreaterThan(900);

      // Next 3 should be immediate again
      expect(timestamps[4] - timestamps[3]).toBeLessThan(50);
      expect(timestamps[5] - timestamps[4]).toBeLessThan(50);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    test('should handle zero or negative limits gracefully', () => {
      expect(() => new RateLimiter(0, 1000)).toThrow(
        'Max requests must be positive'
      );
      expect(() => new RateLimiter(-1, 1000)).toThrow(
        'Max requests must be positive'
      );
    });

    test('should handle zero or negative time windows gracefully', () => {
      expect(() => new RateLimiter(100, 0)).toThrow(
        'Time window must be positive'
      );
      expect(() => new RateLimiter(100, -1000)).toThrow(
        'Time window must be positive'
      );
    });

    test('should handle very high request rates', async () => {
      rateLimiter = new RateLimiter(1000, 1000); // 1000 requests per second

      const startTime = Date.now();

      // Make 1000 requests as fast as possible
      for (let i = 0; i < 1000; i++) {
        expect(rateLimiter.canProceed()).toBe(true);
        rateLimiter.recordRequest();
      }

      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(100); // Should be very fast
      expect(rateLimiter.getCurrentCount()).toBe(1000);
    });

    test('should handle very small time windows', async () => {
      rateLimiter = new RateLimiter(1, 10); // 1 request per 10ms

      const timestamps: number[] = [];

      for (let i = 0; i < 3; i++) {
        await rateLimiter.waitIfNeeded();
        timestamps.push(Date.now());
      }

      // Should respect even very small time windows
      expect(timestamps[1] - timestamps[0]).toBeGreaterThan(8);
      expect(timestamps[2] - timestamps[1]).toBeGreaterThan(8);
    });

    test('should maintain accuracy under system clock changes', () => {
      rateLimiter = new RateLimiter(5, 1000);

      // Use up some requests
      for (let i = 0; i < 3; i++) {
        rateLimiter.recordRequest();
      }

      // Simulate system clock going backwards (though we can't actually do this)
      // The rate limiter should handle this gracefully
      const originalNow = Date.now;
      Date.now = vi.fn(() => originalNow() - 10000); // 10 seconds ago

      try {
        // Should still work correctly
        expect(rateLimiter.canProceed()).toBe(true);
      } finally {
        Date.now = originalNow;
      }
    });

    test('should handle memory pressure with long-running instances', () => {
      rateLimiter = new RateLimiter(100, 1000);

      // Simulate long-running scenario with many requests over time
      const iterations = 10000;
      let allowedCount = 0;

      for (let i = 0; i < iterations; i++) {
        if (rateLimiter.canProceed()) {
          rateLimiter.recordRequest();
          allowedCount++;
        }

        // Simulate time passing occasionally
        if (i % 1000 === 0 && i > 0) {
          // Force internal cleanup by checking stats
          const stats = rateLimiter.getStatistics();
          expect(stats).toBeDefined();
        }
      }

      expect(allowedCount).toBeLessThanOrEqual(100); // Should respect limits

      // Memory usage should be stable (no way to directly test, but should not crash)
      const finalStats = rateLimiter.getStatistics();
      expect(finalStats.totalRequests).toBeGreaterThan(0);
    });
  });

  describe('Performance Benchmarks', () => {
    test('should handle high-frequency operations efficiently', () => {
      rateLimiter = new RateLimiter(10000, 1000); // Very high limit

      const startTime = Date.now();
      const operationCount = 100000;

      for (let i = 0; i < operationCount; i++) {
        rateLimiter.canProceed();
        if (i < 10000) {
          rateLimiter.recordRequest();
        }
      }

      const duration = Date.now() - startTime;
      const operationsPerMs = operationCount / duration;

      expect(operationsPerMs).toBeGreaterThan(100); // Should handle >100 ops/ms
      console.log(
        `Performance: ${operationCount} operations in ${duration}ms (${operationsPerMs.toFixed(2)} ops/ms)`
      );
    });

    test('should maintain performance under concurrent load', async () => {
      rateLimiter = new RateLimiter(1000, 1000);

      const concurrentWorkers = 50;
      const operationsPerWorker = 1000;
      const startTime = Date.now();

      const workerPromises = Array.from(
        { length: concurrentWorkers },
        async (_, workerId) => {
          for (let i = 0; i < operationsPerWorker; i++) {
            const canProceed = rateLimiter.canProceed();
            if (canProceed && rateLimiter.getCurrentCount() < 1000) {
              rateLimiter.recordRequest();
            }
          }
        }
      );

      await Promise.all(workerPromises);
      const duration = Date.now() - startTime;

      const totalOperations = concurrentWorkers * operationsPerWorker;
      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds

      console.log(
        `Concurrent performance: ${totalOperations} operations across ${concurrentWorkers} workers in ${duration}ms`
      );
    });
  });
});

describe('AdaptiveRateLimiter', () => {
  let adaptiveLimiter: AdaptiveRateLimiter;
  let testStartTime: number;

  beforeEach(() => {
    testStartTime = Date.now();
  });

  afterEach(() => {
    const testDuration = Date.now() - testStartTime;
    console.log(`Adaptive test completed in ${testDuration}ms`);
  });

  describe('Adaptive Behavior', () => {
    test('should initialize with base configuration', () => {
      adaptiveLimiter = new AdaptiveRateLimiter({
        baseMaxRequests: 100,
        baseTimeWindow: 60000,
        adaptationFactor: 0.1,
        maxAdaptation: 2.0,
        minAdaptation: 0.5,
      });

      expect(adaptiveLimiter.getCurrentMaxRequests()).toBe(100);
      expect(adaptiveLimiter.getTimeWindow()).toBe(60000);
    });

    test('should increase limit on successful requests', async () => {
      adaptiveLimiter = new AdaptiveRateLimiter({
        baseMaxRequests: 10,
        baseTimeWindow: 1000,
        adaptationFactor: 0.2,
        maxAdaptation: 2.0,
      });

      const initialLimit = adaptiveLimiter.getCurrentMaxRequests();

      // Simulate successful requests
      for (let i = 0; i < 20; i++) {
        adaptiveLimiter.recordRequest();
        adaptiveLimiter.recordSuccess();
      }

      adaptiveLimiter.adapt();

      const newLimit = adaptiveLimiter.getCurrentMaxRequests();
      expect(newLimit).toBeGreaterThan(initialLimit);
      expect(newLimit).toBeLessThanOrEqual(20); // Should not exceed max adaptation
    });

    test('should decrease limit on failed requests', () => {
      adaptiveLimiter = new AdaptiveRateLimiter({
        baseMaxRequests: 10,
        baseTimeWindow: 1000,
        adaptationFactor: 0.3,
        minAdaptation: 0.5,
      });

      const initialLimit = adaptiveLimiter.getCurrentMaxRequests();

      // Simulate failed requests
      for (let i = 0; i < 10; i++) {
        adaptiveLimiter.recordRequest();
        adaptiveLimiter.recordFailure();
      }

      adaptiveLimiter.adapt();

      const newLimit = adaptiveLimiter.getCurrentMaxRequests();
      expect(newLimit).toBeLessThan(initialLimit);
      expect(newLimit).toBeGreaterThanOrEqual(5); // Should not go below min adaptation
    });

    test('should handle mixed success/failure scenarios', () => {
      adaptiveLimiter = new AdaptiveRateLimiter({
        baseMaxRequests: 20,
        baseTimeWindow: 1000,
        adaptationFactor: 0.1,
      });

      // Simulate mixed results - 70% success rate
      for (let i = 0; i < 10; i++) {
        adaptiveLimiter.recordRequest();
        if (i < 7) {
          adaptiveLimiter.recordSuccess();
        } else {
          adaptiveLimiter.recordFailure();
        }
      }

      const beforeAdaptation = adaptiveLimiter.getCurrentMaxRequests();
      adaptiveLimiter.adapt();
      const afterAdaptation = adaptiveLimiter.getCurrentMaxRequests();

      // With 70% success rate, should slightly increase
      expect(afterAdaptation).toBeGreaterThanOrEqual(beforeAdaptation);
    });

    test('should respect max and min adaptation bounds', () => {
      adaptiveLimiter = new AdaptiveRateLimiter({
        baseMaxRequests: 10,
        baseTimeWindow: 1000,
        adaptationFactor: 1.0, // Very aggressive adaptation
        maxAdaptation: 1.5, // Max 150% of base
        minAdaptation: 0.3, // Min 30% of base
      });

      // Test max bound with many successes
      for (let i = 0; i < 100; i++) {
        adaptiveLimiter.recordRequest();
        adaptiveLimiter.recordSuccess();
        adaptiveLimiter.adapt();
      }

      expect(adaptiveLimiter.getCurrentMaxRequests()).toBeLessThanOrEqual(15); // 10 * 1.5

      // Reset and test min bound with many failures
      adaptiveLimiter = new AdaptiveRateLimiter({
        baseMaxRequests: 10,
        baseTimeWindow: 1000,
        adaptationFactor: 1.0,
        maxAdaptation: 1.5,
        minAdaptation: 0.3,
      });

      for (let i = 0; i < 100; i++) {
        adaptiveLimiter.recordRequest();
        adaptiveLimiter.recordFailure();
        adaptiveLimiter.adapt();
      }

      expect(adaptiveLimiter.getCurrentMaxRequests()).toBeGreaterThanOrEqual(3); // 10 * 0.3
    });

    test('should provide detailed adaptation statistics', () => {
      adaptiveLimiter = new AdaptiveRateLimiter({
        baseMaxRequests: 15,
        baseTimeWindow: 1000,
      });

      // Generate some activity
      for (let i = 0; i < 10; i++) {
        adaptiveLimiter.recordRequest();
        if (i % 2 === 0) {
          adaptiveLimiter.recordSuccess();
        } else {
          adaptiveLimiter.recordFailure();
        }
      }

      adaptiveLimiter.adapt();

      const stats = adaptiveLimiter.getAdaptationStats();

      expect(stats.baseMaxRequests).toBe(15);
      expect(stats.currentMaxRequests).toBeDefined();
      expect(stats.adaptationFactor).toBeDefined();
      expect(stats.successRate).toBeCloseTo(0.5, 1); // 50% success rate
      expect(stats.totalRequests).toBe(10);
      expect(stats.successfulRequests).toBe(5);
      expect(stats.failedRequests).toBe(5);
      expect(stats.adaptationHistory).toBeDefined();
    });
  });

  describe('Automatic Adaptation Triggers', () => {
    test('should auto-adapt after configurable number of requests', () => {
      adaptiveLimiter = new AdaptiveRateLimiter({
        baseMaxRequests: 10,
        baseTimeWindow: 1000,
        autoAdaptThreshold: 5, // Adapt every 5 requests
      });

      const initialLimit = adaptiveLimiter.getCurrentMaxRequests();

      // Make 4 successful requests - should not adapt yet
      for (let i = 0; i < 4; i++) {
        adaptiveLimiter.recordRequest();
        adaptiveLimiter.recordSuccess();
      }

      expect(adaptiveLimiter.getCurrentMaxRequests()).toBe(initialLimit);

      // 5th request should trigger adaptation
      adaptiveLimiter.recordRequest();
      adaptiveLimiter.recordSuccess();

      expect(adaptiveLimiter.getCurrentMaxRequests()).toBeGreaterThan(
        initialLimit
      );
    });

    test('should handle time-based adaptation', async () => {
      adaptiveLimiter = new AdaptiveRateLimiter({
        baseMaxRequests: 10,
        baseTimeWindow: 1000,
        adaptationInterval: 100, // Adapt every 100ms
      });

      const initialLimit = adaptiveLimiter.getCurrentMaxRequests();

      // Make some successful requests
      for (let i = 0; i < 5; i++) {
        adaptiveLimiter.recordRequest();
        adaptiveLimiter.recordSuccess();
      }

      // Wait for adaptation interval
      await new Promise(resolve => setTimeout(resolve, 150));

      // Should have adapted automatically
      const currentLimit = adaptiveLimiter.getCurrentMaxRequests();
      expect(currentLimit).toBeGreaterThan(initialLimit);
    });

    test('should adapt based on failure rate threshold', () => {
      adaptiveLimiter = new AdaptiveRateLimiter({
        baseMaxRequests: 20,
        baseTimeWindow: 1000,
        failureRateThreshold: 0.3, // Adapt when >30% failures
      });

      const initialLimit = adaptiveLimiter.getCurrentMaxRequests();

      // Generate high failure rate (40%)
      for (let i = 0; i < 10; i++) {
        adaptiveLimiter.recordRequest();
        if (i < 6) {
          adaptiveLimiter.recordSuccess();
        } else {
          adaptiveLimiter.recordFailure();
        }
      }

      // Should trigger adaptation due to high failure rate
      const currentLimit = adaptiveLimiter.getCurrentMaxRequests();
      expect(currentLimit).toBeLessThan(initialLimit);
    });
  });

  describe('Integration with Base Rate Limiter', () => {
    test('should work as a drop-in replacement for RateLimiter', async () => {
      adaptiveLimiter = new AdaptiveRateLimiter({
        baseMaxRequests: 5,
        baseTimeWindow: 1000,
      });

      // Should behave like regular rate limiter initially
      expect(adaptiveLimiter.canProceed()).toBe(true);
      expect(adaptiveLimiter.getCurrentCount()).toBe(0);

      // Use up the limit
      for (let i = 0; i < 5; i++) {
        expect(adaptiveLimiter.canProceed()).toBe(true);
        adaptiveLimiter.recordRequest();
      }

      expect(adaptiveLimiter.isLimitReached()).toBe(true);
      expect(adaptiveLimiter.canProceed()).toBe(false);

      // waitIfNeeded should work
      const startTime = Date.now();
      await adaptiveLimiter.waitIfNeeded();
      const duration = Date.now() - startTime;

      expect(duration).toBeGreaterThan(900); // Should wait close to 1 second
    });

    test('should maintain rate limiting while adapting', async () => {
      adaptiveLimiter = new AdaptiveRateLimiter({
        baseMaxRequests: 3,
        baseTimeWindow: 500,
        adaptationFactor: 0.5,
      });

      // Use initial limit
      for (let i = 0; i < 3; i++) {
        expect(adaptiveLimiter.canProceed()).toBe(true);
        adaptiveLimiter.recordRequest();
        adaptiveLimiter.recordSuccess();
      }

      expect(adaptiveLimiter.isLimitReached()).toBe(true);

      // Adapt to increase limit
      adaptiveLimiter.adapt();

      // Wait for window to reset
      await new Promise(resolve => setTimeout(resolve, 600));

      // Should have higher limit now
      const newLimit = adaptiveLimiter.getCurrentMaxRequests();
      expect(newLimit).toBeGreaterThan(3);

      // Should be able to make more requests
      for (let i = 0; i < newLimit; i++) {
        expect(adaptiveLimiter.canProceed()).toBe(true);
        adaptiveLimiter.recordRequest();
      }

      expect(adaptiveLimiter.isLimitReached()).toBe(true);
    });
  });

  describe('Performance and Stability', () => {
    test('should handle continuous adaptation without performance degradation', () => {
      adaptiveLimiter = new AdaptiveRateLimiter({
        baseMaxRequests: 100,
        baseTimeWindow: 1000,
        adaptationFactor: 0.1,
      });

      const startTime = Date.now();
      const adaptationCount = 1000;

      // Perform many adaptations
      for (let i = 0; i < adaptationCount; i++) {
        // Simulate varying success rates
        const successRate = 0.5 + 0.3 * Math.sin(i / 100); // Varies between 20% and 80%

        for (let j = 0; j < 10; j++) {
          adaptiveLimiter.recordRequest();
          if (Math.random() < successRate) {
            adaptiveLimiter.recordSuccess();
          } else {
            adaptiveLimiter.recordFailure();
          }
        }

        adaptiveLimiter.adapt();
      }

      const duration = Date.now() - startTime;
      const adaptationsPerMs = adaptationCount / duration;

      expect(adaptationsPerMs).toBeGreaterThan(1); // Should handle >1 adaptation/ms
      expect(adaptiveLimiter.getCurrentMaxRequests()).toBeGreaterThan(0);

      console.log(
        `Adaptation performance: ${adaptationCount} adaptations in ${duration}ms`
      );
    });

    test('should maintain stable behavior under extreme conditions', () => {
      adaptiveLimiter = new AdaptiveRateLimiter({
        baseMaxRequests: 50,
        baseTimeWindow: 1000,
        adaptationFactor: 0.9, // Very aggressive
        maxAdaptation: 10.0, // Very high max
        minAdaptation: 0.01, // Very low min
      });

      // Simulate extreme success
      for (let i = 0; i < 1000; i++) {
        adaptiveLimiter.recordRequest();
        adaptiveLimiter.recordSuccess();
        if (i % 10 === 0) adaptiveLimiter.adapt();
      }

      const highLimit = adaptiveLimiter.getCurrentMaxRequests();
      expect(highLimit).toBeGreaterThan(50);
      expect(highLimit).toBeLessThanOrEqual(500); // 50 * 10.0

      // Simulate extreme failure
      for (let i = 0; i < 1000; i++) {
        adaptiveLimiter.recordRequest();
        adaptiveLimiter.recordFailure();
        if (i % 10 === 0) adaptiveLimiter.adapt();
      }

      const lowLimit = adaptiveLimiter.getCurrentMaxRequests();
      expect(lowLimit).toBeLessThan(highLimit);
      expect(lowLimit).toBeGreaterThanOrEqual(0.5); // 50 * 0.01

      // Should still function correctly
      expect(adaptiveLimiter.canProceed()).toBe(true);
    });

    test('should handle rapid adaptation scenarios', () => {
      adaptiveLimiter = new AdaptiveRateLimiter({
        baseMaxRequests: 20,
        baseTimeWindow: 1000,
        adaptationFactor: 0.3,
        autoAdaptThreshold: 1, // Adapt after every request
      });

      const initialLimit = adaptiveLimiter.getCurrentMaxRequests();
      const limits: number[] = [initialLimit];

      // Generate alternating success/failure pattern
      for (let i = 0; i < 50; i++) {
        adaptiveLimiter.recordRequest();

        if (i % 2 === 0) {
          adaptiveLimiter.recordSuccess();
        } else {
          adaptiveLimiter.recordFailure();
        }

        // Should adapt after each request due to autoAdaptThreshold: 1
        limits.push(adaptiveLimiter.getCurrentMaxRequests());
      }

      // Should have stabilized around the base limit due to 50/50 success rate
      const finalLimit = limits[limits.length - 1];
      const stabilityRange = initialLimit * 0.2; // Within 20% of base

      expect(finalLimit).toBeGreaterThan(initialLimit - stabilityRange);
      expect(finalLimit).toBeLessThan(initialLimit + stabilityRange);

      // Should show adaptation activity
      const uniqueLimits = new Set(limits);
      expect(uniqueLimits.size).toBeGreaterThan(1);
    });
  });
});
