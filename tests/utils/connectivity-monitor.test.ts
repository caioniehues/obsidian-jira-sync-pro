/**
 * Tests for Connectivity Monitor
 * Comprehensive test suite covering network monitoring,
 * connectivity checks, and automatic recovery functionality
 */

import { ConnectivityMonitor, GlobalConnectivityMonitor, ConnectivityStatus } from '../../src/utils/connectivity-monitor';
import { EventManager } from '../../src/events/event-manager';
import type { Mock, Mocked, MockedFunction } from 'vitest';
// Mock Obsidian modules
vi.mock('obsidian', () => ({
  Notice: vi.fn(),
  Plugin: vi.fn(),
  TFile: vi.fn(),
  TFolder: vi.fn(),
  Vault: vi.fn(),
  requestUrl: vi.fn()
}));
import { requestUrl } from 'obsidian';
const mockRequestUrl = requestUrl as MockedFunction<typeof requestUrl>;
describe('ConnectivityMonitor', () => {
  let monitor: ConnectivityMonitor;
  let mockEventManager: Mocked<EventManager>;
  
  const mockJiraUrl = 'https://test.atlassian.net';
  const mockApiToken = 'test-token';
  const mockUserEmail = 'test@example.com';
  beforeEach(() => {
    vi.clearAllMocks();
    
    mockEventManager = {
      createEvent: vi.fn(),
      emit: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
      once: vi.fn(),
      removeAllListeners: vi.fn()
    } as any;
    monitor = new ConnectivityMonitor(
      mockJiraUrl,
      mockApiToken,
      mockUserEmail,
      { enablePersistentMonitoring: false }, // Disable to avoid intervals in tests
      mockEventManager
    );
  });
  afterEach(() => {
    monitor.stopMonitoring();
  describe('Basic Connectivity Checks', () => {
    it('should report online when both internet and Jira are reachable', async () => {
      // Mock successful internet connectivity check
      mockRequestUrl
        .mockResolvedValueOnce({ status: 200, text: 'OK' } as any)
        .mockResolvedValueOnce({ status: 200, text: 'OK' } as any);
      
      const status = await monitor.checkConnectivity();
      expect(status.isOnline).toBe(true);
      expect(status.jiraReachable).toBe(true);
      expect(status.consecutiveFailures).toBe(0);
      expect(status.lastSuccessfulCheck).toBeGreaterThan(0);
    });
    it('should report offline when internet is not available', async () => {
      // Mock failed internet connectivity checks for all fallback URLs
      mockRequestUrl.mockRejectedValue(new Error('Network error'));
      expect(status.isOnline).toBe(false);
      expect(status.jiraReachable).toBe(false);
      expect(status.consecutiveFailures).toBe(1);
      expect(status.error).toBe('No internet connection');
    it('should report degraded when internet is available but Jira is not', async () => {
      // Mock successful internet check but failed Jira check
        .mockResolvedValueOnce({ status: 200, text: 'OK' } as any) // Internet check
        .mockRejectedValue(new Error('Jira unreachable')); // Jira checks
      expect(status.error).toBe('Jira server unreachable');
    it('should track latency during connectivity checks', async () => {
        .mockImplementation(() => new Promise(resolve => {
          setTimeout(() => resolve({ status: 200, text: 'OK' } as any), 100);
        }));
      expect(status.latency).toBeGreaterThan(90); // Should be around 100ms + overhead
      expect(status.latency).toBeLessThan(300); // Reasonable upper bound
  describe('Fallback Connectivity Checks', () => {
    it('should try fallback URLs when primary internet check fails', async () => {
      // First URL fails, second succeeds
        .mockRejectedValueOnce(new Error('First URL failed'))
        .mockResolvedValueOnce({ status: 200, text: 'OK' } as any) // Second URL succeeds
        .mockResolvedValueOnce({ status: 200, text: 'OK' } as any); // Jira check
      expect(mockRequestUrl).toHaveBeenCalledTimes(3); // 2 fallback attempts + 1 Jira
    it('should exhaust all fallback URLs before declaring offline', async () => {
      const customMonitor = new ConnectivityMonitor(
        mockJiraUrl,
        mockApiToken,
        mockUserEmail,
        {
          enablePersistentMonitoring: false,
          fallbackUrls: ['https://test1.com', 'https://test2.com']
        },
        mockEventManager
      );
      // All fallback URLs fail
      mockRequestUrl.mockRejectedValue(new Error('All URLs failed'));
      const status = await customMonitor.checkConnectivity();
      expect(mockRequestUrl).toHaveBeenCalledTimes(2); // Both fallback URLs tried
  describe('Jira Connectivity Checks', () => {
    it('should use primary Jira endpoint for connectivity check', async () => {
        .mockResolvedValueOnce({ status: 200, text: 'Server info' } as any); // Jira check
      await monitor.checkConnectivity();
      // Verify Jira serverInfo endpoint is called
      const jiraCall = mockRequestUrl.mock.calls[1];
      expect(jiraCall[0].url).toContain('/rest/api/3/serverInfo');
      expect(jiraCall[0].headers.Authorization).toContain('Basic');
    it('should use fallback Jira endpoint when primary fails', async () => {
        .mockRejectedValueOnce(new Error('ServerInfo failed')) // Primary Jira endpoint fails
        .mockResolvedValueOnce({ status: 200, text: 'Status OK' } as any); // Fallback endpoint succeeds
      expect(mockRequestUrl).toHaveBeenCalledTimes(3);
      // Verify fallback endpoint is called
      const fallbackCall = mockRequestUrl.mock.calls[2];
      expect(fallbackCall[0].url).toContain('/status');
    it('should accept various HTTP status codes as Jira reachable', async () => {
      const statusCodes = [200, 201, 300, 401, 403]; // Valid statuses
      for (const statusCode of statusCodes) {
        vi.clearAllMocks();
        mockRequestUrl
          .mockResolvedValueOnce({ status: 200, text: 'OK' } as any) // Internet check
          .mockResolvedValueOnce({ status: statusCode, text: 'Response' } as any); // Jira check
        
        const status = await monitor.checkConnectivity();
        expect(status.jiraReachable).toBe(true);
      }
    it('should reject 5xx server errors as Jira unreachable', async () => {
        .mockResolvedValueOnce({ status: 500, text: 'Server error' } as any); // Jira 500 error
  describe('Consecutive Failure Tracking', () => {
    it('should reset consecutive failures on successful check', async () => {
      // First check fails
      let status1 = await monitor.checkConnectivity();
      expect(status1.consecutiveFailures).toBe(1);
      vi.clearAllMocks();
      // Second check succeeds
      let status2 = await monitor.checkConnectivity();
      expect(status2.consecutiveFailures).toBe(0);
    it('should increment consecutive failures on repeated failures', async () => {
      expect(status2.consecutiveFailures).toBe(2);
      let status3 = await monitor.checkConnectivity();
      expect(status3.consecutiveFailures).toBe(3);
  describe('Sync Readiness Assessment', () => {
    it('should be ready for sync when fully online', async () => {
        .mockResolvedValue({ status: 200, text: 'OK' } as any);
      expect(monitor.isReadyForSync()).toBe(true);
    it('should not be ready when Jira is unreachable', async () => {
        .mockResolvedValueOnce({ status: 200, text: 'OK' } as any) // Internet OK
        .mockRejectedValue(new Error('Jira down')); // Jira down
      expect(monitor.isReadyForSync()).toBe(false);
    it('should not be ready when consecutive failures exceed threshold', async () => {
        { maxConsecutiveFailures: 2, enablePersistentMonitoring: false },
      mockRequestUrl.mockRejectedValue(new Error('Repeated failures'));
      // First two failures - should still be ready
      await customMonitor.checkConnectivity();
      expect(customMonitor.isReadyForSync()).toBe(false);
      // Third failure - should not be ready
  describe('Wait for Connectivity', () => {
    it('should return true when connectivity is restored quickly', async () => {
      let callCount = 0;
      mockRequestUrl.mockImplementation(() => {
        callCount++;
        if (callCount <= 2) {
          return Promise.reject(new Error('Still down'));
        }
        return Promise.resolve({ status: 200, text: 'OK' } as any);
      });
      const restored = await monitor.waitForConnectivity(5000);
      expect(restored).toBe(true);
    it('should timeout if connectivity is not restored', async () => {
      mockRequestUrl.mockRejectedValue(new Error('Persistent failure'));
      const startTime = Date.now();
      const restored = await monitor.waitForConnectivity(500); // 500ms timeout
      const duration = Date.now() - startTime;
      expect(restored).toBe(false);
      expect(duration).toBeGreaterThan(400); // Should wait close to timeout
      expect(duration).toBeLessThan(1000); // Should not exceed timeout significantly
  describe('Statistics and Monitoring', () => {
    it('should provide connectivity statistics', async () => {
      const stats = monitor.getStatistics();
      expect(stats.uptime).toBeGreaterThan(0);
      expect(stats.downtime).toBe(0);
      expect(stats.successRate).toBe(100);
      expect(stats.averageLatency).toBeGreaterThan(0);
    it('should identify degraded connectivity states', async () => {
      // High latency scenario
          setTimeout(() => resolve({ status: 200, text: 'OK' } as any), 15000); // 15 second delay
      expect(monitor.isDegraded()).toBe(true);
    it('should track last successful and failed check times', async () => {
      const beforeTime = Date.now();
      // Successful check
      mockRequestUrl.mockResolvedValue({ status: 200, text: 'OK' } as any);
      const successStatus = await monitor.checkConnectivity();
      expect(successStatus.lastSuccessfulCheck).toBeGreaterThan(beforeTime);
      expect(successStatus.lastFailedCheck).toBe(0);
      // Failed check
      const failStatus = await monitor.checkConnectivity();
      expect(failStatus.lastFailedCheck).toBeGreaterThan(successStatus.lastSuccessfulCheck);
  describe('Event Emission', () => {
    it('should emit connectivity events on status change', async () => {
      expect(mockEventManager.createEvent).toHaveBeenCalled();
      expect(mockEventManager.emit).toHaveBeenCalled();
    it('should emit events only when connectivity status changes', async () => {
      // First check
      const firstCallCount = mockEventManager.emit.mock.calls.length;
      // Second check with same status
      const secondCallCount = mockEventManager.emit.mock.calls.length;
      // Should still emit event but with changeDetected: false
      expect(secondCallCount).toBeGreaterThan(0);
    it('should include previous status in connectivity events', async () => {
      // First check - offline
      mockRequestUrl.mockRejectedValue(new Error('Network down'));
      // Second check - online (status change)
      const eventCall = mockEventManager.createEvent.mock.calls[0];
      expect(eventCall[1].ticket.fields.description).toContain('changeDetected');
  describe('Monitoring Lifecycle', () => {
    it('should start and stop monitoring without errors', async () => {
      const monitorWithInterval = new ConnectivityMonitor(
        { 
          enablePersistentMonitoring: true,
          checkInterval: 100 // Very short for testing
      await monitorWithInterval.startMonitoring();
      // Wait for a few monitoring cycles
      await new Promise(resolve => setTimeout(resolve, 350));
      monitorWithInterval.stopMonitoring();
      // Should have made multiple checks
      expect(mockRequestUrl.mock.calls.length).toBeGreaterThan(2);
    it('should handle errors during monitoring without crashing', async () => {
          checkInterval: 50
      // Mock requestUrl to throw errors
      mockRequestUrl.mockRejectedValue(new Error('Monitoring error'));
      // Wait for monitoring cycles
      await new Promise(resolve => setTimeout(resolve, 200));
      // Should not crash despite errors
      expect(monitorWithInterval.getStatus().consecutiveFailures).toBeGreaterThan(0);
    it('should not start monitoring twice', async () => {
        { enablePersistentMonitoring: true },
      await monitorWithInterval.startMonitoring(); // Second call should be ignored
      // Should work without issues
      expect(true).toBe(true); // Test passes if no errors thrown
  describe('Configuration Options', () => {
    it('should respect custom timeout settings', async () => {
        { timeout: 1000, enablePersistentMonitoring: false },
      // Verify timeout is passed to requestUrl
      const requestCall = mockRequestUrl.mock.calls[0];
      expect(requestCall[0].timeout).toBe(1000);
    it('should use custom fallback URLs when provided', async () => {
      const customUrls = ['https://custom1.com', 'https://custom2.com'];
        { fallbackUrls: customUrls, enablePersistentMonitoring: false },
        .mockRejectedValueOnce(new Error('First failed'))
      expect(mockRequestUrl.mock.calls[0][0].url).toBe(customUrls[0]);
      expect(mockRequestUrl.mock.calls[1][0].url).toBe(customUrls[1]);
});
describe('GlobalConnectivityMonitor', () => {
    GlobalConnectivityMonitor.stopGlobalMonitoring();
  describe('Singleton Pattern', () => {
    it('should create and return singleton instance', () => {
      const instance1 = GlobalConnectivityMonitor.initialize(
        'https://test1.com',
        'token1',
        'email1@test.com'
      const instance2 = GlobalConnectivityMonitor.getInstance();
      expect(instance1).toBe(instance2);
      expect(instance2).toBeInstanceOf(ConnectivityMonitor);
    it('should replace existing instance when reinitialized', () => {
      const instance2 = GlobalConnectivityMonitor.initialize(
        'https://test2.com',
        'token2',
        'email2@test.com'
      expect(instance1).not.toBe(instance2);
      expect(GlobalConnectivityMonitor.getInstance()).toBe(instance2);
    it('should return null when no instance initialized', () => {
      expect(GlobalConnectivityMonitor.getInstance()).toBeNull();
  describe('Global Monitoring Control', () => {
    it('should start and stop global monitoring', async () => {
      GlobalConnectivityMonitor.initialize(
        'https://test.com',
        'token',
        'email@test.com',
        { enablePersistentMonitoring: true, checkInterval: 100 }
      await GlobalConnectivityMonitor.startGlobalMonitoring();
      // Wait for monitoring to run
      await new Promise(resolve => setTimeout(resolve, 250));
      GlobalConnectivityMonitor.stopGlobalMonitoring();
      expect(mockRequestUrl.mock.calls.length).toBeGreaterThan(1);
    it('should handle global monitoring when no instance exists', async () => {
      // Should not throw errors
      expect(true).toBe(true); // Test passes if no errors
describe('Real-world Connectivity Scenarios', () => {
      'https://company.atlassian.net',
      'api-token',
      'user@company.com',
      { enablePersistentMonitoring: false }
  describe('Corporate Network Scenarios', () => {
    it('should handle corporate proxy responses', async () => {
      // Mock proxy authentication page
        .mockResolvedValueOnce({ status: 200, text: 'OK' } as any) // Internet check passes
        .mockResolvedValueOnce({ status: 407, text: 'Proxy Authentication Required' } as any); // Jira blocked by proxy
    it('should handle VPN connection issues', async () => {
      // Simulate VPN dropping connection
        .mockResolvedValueOnce({ status: 200, text: 'OK' } as any) // Public internet works
        .mockRejectedValue(new Error('ENOTFOUND company.atlassian.net')); // Internal services fail
  describe('Intermittent Connection Issues', () => {
    it('should handle flaky network connections', async () => {
        // Simulate intermittent failures
        if (callCount % 3 === 0) {
          return Promise.reject(new Error('Temporary network glitch'));
      // Multiple checks should show varying connectivity
      const results = [];
      for (let i = 0; i < 6; i++) {
        results.push(await monitor.checkConnectivity());
      const successCount = results.filter(r => r.jiraReachable).length;
      const failureCount = results.filter(r => !r.jiraReachable).length;
      expect(successCount).toBeGreaterThan(0);
      expect(failureCount).toBeGreaterThan(0);
  describe('Service Maintenance Scenarios', () => {
    it('should handle Jira maintenance mode', async () => {
        .mockResolvedValueOnce({ status: 503, text: 'Service Unavailable - Maintenance' } as any); // Jira maintenance
    it('should handle planned service outages', async () => {
      const outageMonitor = new ConnectivityMonitor(
        'https://company.atlassian.net',
        'api-token',
        'user@company.com',
          checkInterval: 100,
          enablePersistentMonitoring: false 
      // Simulate extended outage
        .mockResolvedValue({ status: 200, text: 'OK' } as any) // Internet always OK
        .mockRejectedValueOnce(new Error('Connection refused')) // Jira down
        .mockRejectedValueOnce(new Error('Connection refused'))
        .mockResolvedValue({ status: 200, text: 'Service restored' } as any); // Service restored
      // Check connectivity over time
      const status1 = await outageMonitor.checkConnectivity();
      const status2 = await outageMonitor.checkConnectivity();
      // Wait for service restoration
      const restored = await outageMonitor.waitForConnectivity(1000);
