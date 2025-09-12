/**
 * PluginAdapterBase Unit Tests
 * Tests for the base plugin adapter interface and AdapterRegistry
 * RED-GREEN-Refactor approach with real implementations
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { 
  PluginAdapterBase, 
  AdapterRegistry, 
  ConversionResult, 
  SyncContext, 
  AdapterConfig 
} from '../../src/adapters/plugin-adapter-base';
import { EventBus } from '../../src/events/event-bus';
import { MockData } from '../fixtures/mock-data';
import type { Mock, Mocked, MockedFunction } from 'vitest';
// Concrete implementation for testing the abstract base class
class TestAdapter extends PluginAdapterBase<string, AdapterConfig> {
  private isInitialized = false;
  private isDisposed = false;
  private pluginAvailable = true;
  constructor(config: AdapterConfig, eventBus: EventBus) {
    super(config, eventBus);
  }
  async initialize(): Promise<void> {
    this.isInitialized = true;
    this.logger.log('TestAdapter initialized');
  async dispose(): Promise<void> {
    this.isDisposed = true;
    this.logger.log('TestAdapter disposed');
  async isPluginAvailable(): Promise<boolean> {
    return this.pluginAvailable;
  async convertFromJira(issue: any, context?: SyncContext): Promise<ConversionResult<string>> {
    // Simulate conversion time
    await new Promise(resolve => setTimeout(resolve, 1));
    
    return {
      success: true,
      data: `Converted: ${issue.key} - ${issue.fields.summary}`,
      metadata: {
        conversionTime: 1,
        issueKey: issue.key
      }
    };
  async convertToJira(data: string, context?: SyncContext): Promise<ConversionResult<any>> {
      data: {
        fields: {
          summary: data
        }
  async applyToPlugin(data: string, context?: SyncContext): Promise<ConversionResult<void>> {
    // Simulate some processing time
    await new Promise(resolve => setTimeout(resolve, 2));
        applied: true,
        data
  // Test helpers
  setPluginAvailable(available: boolean): void {
    this.pluginAvailable = available;
  getIsInitialized(): boolean {
    return this.isInitialized;
  getIsDisposed(): boolean {
    return this.isDisposed;
}
class FailingAdapter extends TestAdapter {
  async convertFromJira(): Promise<ConversionResult<string>> {
      success: false,
      errors: [{
        code: 'CONVERSION_FAILED',
        message: 'Simulated conversion failure',
        retryable: true
      }]
  async applyToPlugin(): Promise<ConversionResult<void>> {
    throw new Error('Simulated plugin error');
describe('PluginAdapterBase', () => {
  let adapter: TestAdapter;
  let eventBus: EventBus;
  let mockConfig: AdapterConfig;
  beforeEach(() => {
    eventBus = new EventBus();
    mockConfig = {
      enabled: true,
      pluginId: 'test-plugin',
      syncDirection: 'jira-to-plugin',
      batchSize: 5,
      retryAttempts: 3,
      timeout: 1000
    adapter = new TestAdapter(mockConfig, eventBus);
    // Mock console methods
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.clearAllMocks();
  describe('Constructor', () => {
    it('should create adapter with valid configuration', () => {
      expect(adapter).toBeInstanceOf(PluginAdapterBase);
      expect(adapter.getConfig()).toEqual(mockConfig);
    });
    it('should initialize metrics to zero', () => {
      const metrics = adapter.getMetrics();
      
      expect(metrics.conversionsCount).toBe(0);
      expect(metrics.averageConversionTime).toBe(0);
      expect(metrics.errorRate).toBe(0);
      expect(metrics.lastSyncTime).toBe(0);
      expect(metrics.totalSyncedIssues).toBe(0);
    it('should throw error with invalid plugin ID', () => {
      const invalidConfig = { ...mockConfig, pluginId: '' };
      expect(() => new TestAdapter(invalidConfig, eventBus)).toThrow('Plugin ID is required');
    it('should throw error with invalid sync direction', () => {
      const invalidConfig = { ...mockConfig, syncDirection: 'invalid' as any };
      expect(() => new TestAdapter(invalidConfig, eventBus)).toThrow('Invalid sync direction');
  describe('Configuration Management', () => {
    it('should return current configuration', () => {
      const config = adapter.getConfig();
      expect(config).toEqual(mockConfig);
      expect(config).not.toBe(mockConfig); // Should be a copy
    it('should update configuration', () => {
      const updates = {
        batchSize: 10,
        timeout: 2000
      };
      adapter.updateConfig(updates);
      const updatedConfig = adapter.getConfig();
      expect(updatedConfig.batchSize).toBe(10);
      expect(updatedConfig.timeout).toBe(2000);
      expect(updatedConfig.pluginId).toBe('test-plugin'); // Unchanged
    it('should call onConfigUpdated hook', () => {
      const onConfigUpdatedSpy = vi.spyOn(adapter as any, 'onConfigUpdated');
      adapter.updateConfig({ batchSize: 15 });
      expect(onConfigUpdatedSpy).toHaveBeenCalled();
  describe('Metrics Management', () => {
    it('should return current metrics', () => {
      expect(metrics).toHaveProperty('conversionsCount');
      expect(metrics).toHaveProperty('averageConversionTime');
      expect(metrics).toHaveProperty('errorRate');
      expect(metrics).toHaveProperty('lastSyncTime');
      expect(metrics).toHaveProperty('totalSyncedIssues');
    it('should reset metrics to zero', () => {
      // First, simulate some activity
      (adapter as any).updateMetrics(50, true);
      (adapter as any).updateMetrics(30, false);
      let metrics = adapter.getMetrics();
      expect(metrics.conversionsCount).toBeGreaterThan(0);
      adapter.resetMetrics();
      metrics = adapter.getMetrics();
    it('should update metrics correctly on successful conversion', () => {
      const conversionTime = 25;
      (adapter as any).updateMetrics(conversionTime, true);
      expect(metrics.conversionsCount).toBe(1);
      expect(metrics.averageConversionTime).toBe(conversionTime);
      expect(metrics.totalSyncedIssues).toBe(1);
      expect(metrics.lastSyncTime).toBeGreaterThan(0);
    it('should update metrics correctly on failed conversion', () => {
      const conversionTime = 15;
      (adapter as any).updateMetrics(conversionTime, false);
      expect(metrics.errorRate).toBe(1); // 100% error rate
    it('should calculate average conversion time correctly', () => {
      (adapter as any).updateMetrics(10, true);
      (adapter as any).updateMetrics(20, true);
      expect(metrics.conversionsCount).toBe(3);
      expect(metrics.averageConversionTime).toBe(20); // (10+20+30)/3
      expect(metrics.errorRate).toBeCloseTo(0.333, 2); // 1 failure out of 3
  describe('syncIssueToPlugin', () => {
    it('should sync issue successfully', async () => {
      const issue = MockData.jira.issue;
      const context: SyncContext = {
        issueKey: issue.key,
        operation: 'create',
        source: 'jira',
        timestamp: Date.now()
      const result = await adapter.syncIssueToPlugin(issue, context);
      expect(result.success).toBe(true);
      expect(console.log).toHaveBeenCalledWith(`Syncing issue ${issue.key} to ${mockConfig.pluginId}`);
    it('should fail when plugin is not available', async () => {
      adapter.setPluginAvailable(false);
      const result = await adapter.syncIssueToPlugin(issue);
      expect(result.success).toBe(false);
      expect(result.errors![0].code).toBe('PLUGIN_UNAVAILABLE');
      expect(result.errors![0].retryable).toBe(true);
    it('should handle conversion errors', async () => {
      const failingAdapter = new FailingAdapter(mockConfig, eventBus);
      const result = await failingAdapter.syncIssueToPlugin(issue);
      expect(result.errors![0].code).toBe('CONVERSION_FAILED');
    it('should handle application errors', async () => {
      // Override convertFromJira to succeed but applyToPlugin to fail
      vi.spyOn(failingAdapter, 'convertFromJira').mockResolvedValue({
        success: true,
        data: 'test data'
      });
      expect(result.errors![0].code).toBe('SYNC_ERROR');
    it('should update metrics on sync', async () => {
      const initialMetrics = adapter.getMetrics();
      expect(initialMetrics.conversionsCount).toBe(0);
      await adapter.syncIssueToPlugin(issue);
      const updatedMetrics = adapter.getMetrics();
      expect(updatedMetrics.conversionsCount).toBe(1);
      expect(updatedMetrics.totalSyncedIssues).toBe(1);
    it('should emit sync completed event', async () => {
      const eventSpy = vi.spyOn(eventBus, 'emit');
        operation: 'update',
      await adapter.syncIssueToPlugin(issue, context);
      expect(eventSpy).toHaveBeenCalledWith('adapter:sync:completed', expect.objectContaining({
        adapterId: mockConfig.pluginId,
        context
      }));
  describe('syncIssuesToPlugin', () => {
    it('should sync multiple issues in batches', async () => {
      const issues = [
        MockData.jira.issue,
        { ...MockData.jira.issue, key: 'TEST-124', id: '10002' },
        { ...MockData.jira.issue, key: 'TEST-125', id: '10003' },
        { ...MockData.jira.issue, key: 'TEST-126', id: '10004' }
      ];
      const results = await adapter.syncIssuesToPlugin(issues);
      expect(results).toHaveLength(4);
      expect(results.every(result => result.success)).toBe(true);
    it('should respect batch size configuration', async () => {
      const batchSize = 2;
      const batchConfig = { ...mockConfig, batchSize };
      const batchAdapter = new TestAdapter(batchConfig, eventBus);
      const issues = new Array(5).fill(null).map((_, i) => ({
        ...MockData.jira.issue,
        key: `BATCH-${i + 1}`,
        id: `${10000 + i}`
      const syncSpy = vi.spyOn(batchAdapter, 'syncIssueToPlugin');
      const results = await batchAdapter.syncIssuesToPlugin(issues);
      expect(results).toHaveLength(5);
      expect(syncSpy).toHaveBeenCalledTimes(5);
      // Should be called in batches, but we can't easily test the timing without advanced mocking
    it('should handle mixed success and failure', async () => {
        { ...MockData.jira.issue, key: 'TEST-124', id: '10002' }
      // Mock first call to succeed, second to fail
      vi.spyOn(adapter, 'syncIssueToPlugin')
        .mockResolvedValueOnce({ success: true })
        .mockResolvedValueOnce({ 
          success: false, 
          errors: [{ code: 'TEST_ERROR', message: 'Test error', retryable: false }] 
        });
      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(false);
  describe('Abstract Method Requirements', () => {
    it('should require initialize implementation', async () => {
      expect(typeof adapter.initialize).toBe('function');
      await adapter.initialize();
      expect(adapter.getIsInitialized()).toBe(true);
    it('should require dispose implementation', async () => {
      expect(typeof adapter.dispose).toBe('function');
      await adapter.dispose();
      expect(adapter.getIsDisposed()).toBe(true);
    it('should require isPluginAvailable implementation', async () => {
      expect(typeof adapter.isPluginAvailable).toBe('function');
      const available = await adapter.isPluginAvailable();
      expect(typeof available).toBe('boolean');
    it('should require convertFromJira implementation', async () => {
      expect(typeof adapter.convertFromJira).toBe('function');
      const result = await adapter.convertFromJira(MockData.jira.issue);
      expect(result).toHaveProperty('success');
    it('should require convertToJira implementation', async () => {
      expect(typeof adapter.convertToJira).toBe('function');
      const result = await adapter.convertToJira('test data');
    it('should require applyToPlugin implementation', async () => {
      expect(typeof adapter.applyToPlugin).toBe('function');
      const result = await adapter.applyToPlugin('test data');
});
describe('AdapterRegistry', () => {
  let registry: AdapterRegistry;
  let adapter1: TestAdapter;
  let adapter2: TestAdapter;
    registry = new AdapterRegistry(eventBus);
    adapter1 = new TestAdapter({
      pluginId: 'adapter-1',
      batchSize: 5
    }, eventBus);
    adapter2 = new TestAdapter({
      pluginId: 'adapter-2',
      syncDirection: 'bidirectional',
      batchSize: 10
  describe('register', () => {
    it('should register adapter successfully', () => {
      registry.register(adapter1);
      const retrieved = registry.get('adapter-1');
      expect(retrieved).toBe(adapter1);
      expect(console.log).toHaveBeenCalledWith('Registered adapter: adapter-1');
    it('should allow multiple adapter registrations', () => {
      registry.register(adapter2);
      expect(registry.get('adapter-1')).toBe(adapter1);
      expect(registry.get('adapter-2')).toBe(adapter2);
  describe('unregister', () => {
    beforeEach(() => {
    it('should unregister adapter and dispose it', async () => {
      const disposeSpy = vi.spyOn(adapter1, 'dispose');
      registry.unregister('adapter-1');
      expect(registry.get('adapter-1')).toBeUndefined();
      expect(disposeSpy).toHaveBeenCalled();
      expect(console.log).toHaveBeenCalledWith('Unregistered adapter: adapter-1');
    it('should handle unregistering non-existent adapter', () => {
      registry.unregister('non-existent');
      // Should not throw error
      expect(console.log).not.toHaveBeenCalledWith('Unregistered adapter: non-existent');
  describe('getAll', () => {
    it('should return empty array when no adapters registered', () => {
      const adapters = registry.getAll();
      expect(adapters).toEqual([]);
    it('should return all registered adapters', () => {
      expect(adapters).toHaveLength(2);
      expect(adapters).toContain(adapter1);
      expect(adapters).toContain(adapter2);
  describe('getByDirection', () => {
      registry.register(adapter1); // 'jira-to-plugin'
      registry.register(adapter2); // 'bidirectional'
    it('should return adapters with specific direction', () => {
      const jiraToPlugin = registry.getByDirection('jira-to-plugin');
      expect(jiraToPlugin).toHaveLength(1);
      expect(jiraToPlugin[0]).toBe(adapter1);
    it('should include bidirectional adapters for any direction', () => {
      const pluginToJira = registry.getByDirection('plugin-to-jira');
      expect(jiraToPlugin).toContain(adapter2);
      expect(pluginToJira).toContain(adapter2);
    it('should return empty array for direction with no matches', () => {
      // Only bidirectional adapter should match
      expect(pluginToJira).toHaveLength(1);
      expect(pluginToJira[0]).toBe(adapter2);
  describe('syncIssueToAll', () => {
    it('should sync issue to all compatible adapters', async () => {
      const results = await registry.syncIssueToAll(issue, context);
      expect(results.size).toBe(2); // Both adapters should receive the issue
      expect(results.get('adapter-1')?.success).toBe(true);
      expect(results.get('adapter-2')?.success).toBe(true);
    it('should handle adapter failures gracefully', async () => {
      const failingAdapter = new FailingAdapter({
        enabled: true,
        pluginId: 'failing-adapter',
        syncDirection: 'jira-to-plugin'
      }, eventBus);
      registry.register(failingAdapter);
      const results = await registry.syncIssueToAll(issue);
      expect(results.size).toBe(2);
      expect(results.get('failing-adapter')?.success).toBe(false);
  describe('getAggregateMetrics', () => {
    it('should return zero metrics when no adapters registered', () => {
      const metrics = registry.getAggregateMetrics();
    it('should aggregate metrics from all adapters', async () => {
      // Generate some activity
      await adapter1.syncIssueToPlugin(MockData.jira.issue);
      await adapter2.syncIssueToPlugin(MockData.jira.issue);
      expect(metrics.conversionsCount).toBe(2);
      expect(metrics.totalSyncedIssues).toBe(2);
      expect(metrics.averageConversionTime).toBeGreaterThan(0);
    it('should calculate average conversion time across adapters', async () => {
      // Mock metrics to control values
      const mockMetrics1 = {
        conversionsCount: 10,
        averageConversionTime: 20,
        errorRate: 0.1,
        lastSyncTime: 1000,
        totalSyncedIssues: 9
      const mockMetrics2 = {
        conversionsCount: 20,
        averageConversionTime: 30,
        errorRate: 0.2,
        lastSyncTime: 2000,
        totalSyncedIssues: 16
      vi.spyOn(adapter1, 'getMetrics').mockReturnValue(mockMetrics1);
      vi.spyOn(adapter2, 'getMetrics').mockReturnValue(mockMetrics2);
      const aggregated = registry.getAggregateMetrics();
      expect(aggregated.conversionsCount).toBe(30);
      expect(aggregated.averageConversionTime).toBe(25); // (20+30)/2
      expect(aggregated.errorRate).toBe(0.15); // (0.1+0.2)/2
      expect(aggregated.lastSyncTime).toBe(2000); // Max
      expect(aggregated.totalSyncedIssues).toBe(25);
  describe('dispose', () => {
    it('should dispose all adapters and clear registry', async () => {
      const dispose1Spy = vi.spyOn(adapter1, 'dispose');
      const dispose2Spy = vi.spyOn(adapter2, 'dispose');
      await registry.dispose();
      expect(dispose1Spy).toHaveBeenCalled();
      expect(dispose2Spy).toHaveBeenCalled();
      expect(registry.getAll()).toHaveLength(0);
    it('should handle disposal errors gracefully', async () => {
      vi.spyOn(adapter1, 'dispose').mockRejectedValue(new Error('Disposal error'));
      await expect(registry.dispose()).resolves.not.toThrow();
      // Registry should still be cleared
  describe('Error Handling', () => {
    it('should handle adapter registration with duplicate IDs', () => {
      const duplicateAdapter = new TestAdapter({
        pluginId: 'adapter-1', // Same ID as adapter1
        syncDirection: 'plugin-to-jira'
      registry.register(duplicateAdapter); // Should overwrite
      expect(retrieved).toBe(duplicateAdapter);
      expect(retrieved).not.toBe(adapter1);
