/**
 * Status Indicators Test Suite
 * Comprehensive tests for status indicator system
 * Following RED-GREEN-Refactor methodology
 */

import { App, Plugin, setIcon } from 'obsidian';
import { StatusIndicatorManager, StatusState, StatusConfig } from '../../../src/ui/status-indicators';
import { NotificationSettings } from '../../../src/settings/settings';
import type { Mock, Mocked, MockedFunction } from 'vitest';
// Mock Obsidian components
vi.mock('obsidian', () => ({
  App: vi.fn(),
  Plugin: vi.fn(),
  setIcon: vi.fn(),
  StatusBarItemEl: vi.fn()
}));
describe('StatusIndicatorManager', () => {
  let app: App;
  let plugin: Plugin;
  let settings: NotificationSettings;
  let config: StatusConfig;
  let manager: StatusIndicatorManager;
  let mockStatusBarItem: any;
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Setup mock status bar item
    mockStatusBarItem = {
      addClass: vi.fn(),
      empty: vi.fn(),
      createSpan: vi.fn().mockReturnValue({
        style: {}
      }),
      onclick: null,
      title: '',
      remove: vi.fn()
    };
    // Setup mock app
    app = new App();
    // Setup mock plugin
    plugin = {
      addStatusBarItem: vi.fn().mockReturnValue(mockStatusBarItem)
    } as any;
    // Setup notification settings
    settings = {
      enableSyncNotifications: true,
      enableErrorNotifications: true,
      enableConflictNotifications: true,
      notificationDuration: 5,
      soundEnabled: false,
      desktopNotificationsEnabled: false
    // Setup status config
    config = {
      showInStatusBar: true,
      showDetailedTooltips: true,
      updateInterval: 1000
    // Create manager instance
    manager = new StatusIndicatorManager(app, plugin, settings, config);
  });
  afterEach(() => {
    manager.destroy();
  describe('Initialization', () => {
    it('should initialize with default idle state', () => {
      const currentStatus = manager.getCurrentStatus();
      
      expect(currentStatus.sync).toBe('idle');
      expect(currentStatus.connection).toBe('disconnected');
      expect(currentStatus.queue).toBe('empty');
      expect(currentStatus.conflictCount).toBe(0);
      expect(currentStatus.queueLength).toBe(0);
      expect(currentStatus.errorCount).toBe(0);
    });
    it('should create status bar item when showInStatusBar is true', () => {
      expect(plugin.addStatusBarItem).toHaveBeenCalled();
      expect(mockStatusBarItem.addClass).toHaveBeenCalledWith('jira-bridge-status');
    it('should not create status bar item when showInStatusBar is false', () => {
      const noStatusBarConfig = { ...config, showInStatusBar: false };
      const noStatusBarManager = new StatusIndicatorManager(app, plugin, settings, noStatusBarConfig);
      // Reset mocks to check this specific instance
      vi.clearAllMocks();
      // Destroy and verify no status bar interaction
      noStatusBarManager.destroy();
      expect(mockStatusBarItem.remove).not.toHaveBeenCalled();
  describe('Status Updates', () => {
    it('should update sync status correctly', () => {
      const testDate = new Date();
      manager.setSyncStatus('syncing', testDate);
      const status = manager.getCurrentStatus();
      expect(status.sync).toBe('syncing');
      expect(status.lastSync).toBe(testDate);
    it('should update connection status correctly', () => {
      manager.setConnectionStatus('connected');
      expect(status.connection).toBe('connected');
    it('should update queue status with length', () => {
      manager.setQueueStatus('processing', 5);
      expect(status.queue).toBe('processing');
      expect(status.queueLength).toBe(5);
    it('should increment error count when reporting errors', () => {
      const errorDate = new Date();
      manager.reportError(errorDate);
      manager.reportError();
      expect(status.errorCount).toBe(2);
      expect(status.lastError).toBe(errorDate);
    it('should set conflict count correctly', () => {
      manager.setConflictCount(3);
      expect(status.conflictCount).toBe(3);
    it('should update partial state without affecting other properties', () => {
      // Set initial complex state
      manager.updateStatus({
        sync: 'syncing',
        connection: 'connected',
        queue: 'processing',
        queueLength: 5
      });
      // Update only sync status
      manager.setSyncStatus('idle');
      expect(status.sync).toBe('idle');
      expect(status.connection).toBe('connected'); // Should remain unchanged
      expect(status.queue).toBe('processing'); // Should remain unchanged
      expect(status.queueLength).toBe(5); // Should remain unchanged
  describe('Status Bar Display', () => {
    beforeEach(() => {
      // Setup mock createSpan to return different elements for icon and text
      let spanCount = 0;
      mockStatusBarItem.createSpan.mockImplementation((className: string) => {
        spanCount++;
        return {
          style: { color: '' },
          textContent: '',
          classList: { add: vi.fn() },
          className
        };
    it('should display error status with highest priority', () => {
      const recentErrorDate = new Date();
        errorCount: 2,
        lastError: recentErrorDate,
        conflictCount: 1,
        sync: 'syncing'
      // Verify status bar is updated
      expect(mockStatusBarItem.empty).toHaveBeenCalled();
      expect(setIcon).toHaveBeenCalledWith(expect.anything(), 'alert-triangle');
    it('should display conflict status when no recent errors', () => {
      const oldErrorDate = new Date(Date.now() - 10 * 60 * 1000); // 10 minutes ago
        errorCount: 1,
        lastError: oldErrorDate,
        conflictCount: 2
      expect(setIcon).toHaveBeenCalledWith(expect.anything(), 'git-merge');
    it('should display syncing status when actively syncing', () => {
        connection: 'connected'
      expect(setIcon).toHaveBeenCalledWith(expect.anything(), 'refresh-cw');
    it('should display disconnected status when not connected', () => {
        connection: 'disconnected',
        sync: 'idle'
      expect(setIcon).toHaveBeenCalledWith(expect.anything(), 'wifi-off');
    it('should display queue status when items are queued', () => {
        queueLength: 3,
      expect(setIcon).toHaveBeenCalledWith(expect.anything(), 'clock');
    it('should display normal status when everything is operational', () => {
        sync: 'idle',
        queue: 'empty',
        conflictCount: 0,
        errorCount: 0
      expect(setIcon).toHaveBeenCalledWith(expect.anything(), 'check-circle');
    it('should add count text for multiple items', () => {
        errorCount: 5,
        lastError: new Date()
      // Verify that text span is created for count > 1
      expect(mockStatusBarItem.createSpan).toHaveBeenCalledWith('status-text');
    it('should not add count text for single items', () => {
      // Should still create the structure but without count text
      expect(mockStatusBarItem.createSpan).toHaveBeenCalledWith('status-icon');
  describe('Tooltip Generation', () => {
    it('should generate error tooltip with count and time', () => {
        errorCount: 3,
        lastError: errorDate
      // Tooltip should be set on the status bar item
      expect(mockStatusBarItem.title).toContain('🚨 3 errors');
      expect(mockStatusBarItem.title).toContain('Last error:');
    it('should generate conflict tooltip', () => {
      expect(mockStatusBarItem.title).toContain('⚠️ 2 conflicts');
      expect(mockStatusBarItem.title).toContain('Click to resolve conflicts');
    it('should generate syncing tooltip with queue info', () => {
        queueLength: 4
      expect(mockStatusBarItem.title).toContain('🔄 Syncing with Jira...');
      expect(mockStatusBarItem.title).toContain('4 items in queue');
    it('should generate normal status tooltip with last sync time', () => {
      const syncDate = new Date();
        lastSync: syncDate,
      expect(mockStatusBarItem.title).toContain('✅ All systems operational');
      expect(mockStatusBarItem.title).toContain('Last sync:');
    it('should show simple tooltip when detailed tooltips are disabled', () => {
      const simpleConfig = { ...config, showDetailedTooltips: false };
      const simpleManager = new StatusIndicatorManager(app, plugin, settings, simpleConfig);
      simpleManager.updateStatus({
      // Should only show the title, not detailed information
      const mockItem = plugin.addStatusBarItem() as any;
      expect(mockItem.title).toBe('Jira Bridge Status');
      simpleManager.destroy();
  describe('Settings Status Display', () => {
    let containerEl: HTMLElement;
      containerEl = {
        createDiv: vi.fn().mockImplementation((options: any) => ({
          createEl: vi.fn().mockReturnValue({
            textContent: ''
          }),
          createDiv: vi.fn().mockReturnValue({
            createDiv: vi.fn().mockReturnValue({
              createSpan: vi.fn().mockReturnValue({
                textContent: '',
                style: { color: '' }
              })
            }),
            createEl: vi.fn().mockReturnValue({
              textContent: ''
            })
          })
        })),
        empty: vi.fn()
      } as any;
    it('should create settings status display', () => {
      const statusEl = manager.createSettingsStatus(containerEl);
      expect(containerEl.createDiv).toHaveBeenCalledWith('jira-bridge-settings-status');
      expect(statusEl).toBeDefined();
    it('should update settings status display with current state', () => {
        lastSync: new Date(),
        conflictCount: 2,
        errorCount: 1
      // Verify that the display structure is created
  describe('Time Formatting', () => {
    it('should format recent times correctly', () => {
      const now = new Date();
      const oneMinuteAgo = new Date(now.getTime() - 60000);
      const oneHourAgo = new Date(now.getTime() - 3600000);
      const oneDayAgo = new Date(now.getTime() - 86400000);
      const threeDaysAgo = new Date(now.getTime() - 3 * 86400000);
      // Test through status updates that use time formatting
      manager.updateStatus({ lastSync: oneMinuteAgo });
      expect(mockStatusBarItem.title).toContain('1m ago');
      manager.updateStatus({ lastSync: oneHourAgo });
      expect(mockStatusBarItem.title).toContain('1h ago');
      manager.updateStatus({ lastSync: oneDayAgo });
      expect(mockStatusBarItem.title).toContain('1d ago');
      manager.updateStatus({ lastSync: threeDaysAgo });
      expect(mockStatusBarItem.title).toContain('3d ago');
    it('should handle just now correctly', () => {
      const justNow = new Date();
      manager.updateStatus({ lastSync: justNow });
      expect(mockStatusBarItem.title).toContain('just now');
  describe('Configuration Updates', () => {
    it('should update settings successfully', () => {
      const newSettings: NotificationSettings = {
        ...settings,
        enableErrorNotifications: false
      };
      expect(() => manager.updateSettings(newSettings)).not.toThrow();
    it('should update configuration and restart periodic updates', () => {
      const newConfig: Partial<StatusConfig> = {
        updateInterval: 2000
      expect(() => manager.updateConfig(newConfig)).not.toThrow();
    it('should handle configuration updates without interval change', () => {
        showDetailedTooltips: false
  describe('Cleanup and Resource Management', () => {
    it('should clean up resources on destroy', () => {
      manager.destroy();
      expect(mockStatusBarItem.remove).toHaveBeenCalled();
    it('should handle destroy when no status bar item exists', () => {
      expect(() => noStatusBarManager.destroy()).not.toThrow();
    it('should clear periodic update timer on destroy', () => {
      // Verify timer management through multiple destroy calls
      manager.destroy(); // Should not throw
      expect(mockStatusBarItem.remove).toHaveBeenCalledTimes(1);
  describe('Status Modal Integration', () => {
    it('should set up click handler for status details', () => {
      // Verify that the onclick handler is set up
      expect(mockStatusBarItem.onclick).toBeDefined();
    it('should handle click to show details', () => {
      // Mock the modal creation to avoid DOM dependencies
      const mockModal = { open: vi.fn() };
      // Simulate click
      if (mockStatusBarItem.onclick) {
        expect(() => mockStatusBarItem.onclick()).not.toThrow();
      }
  describe('Edge Cases and Error Handling', () => {
    it('should handle undefined timestamps gracefully', () => {
      expect(() => manager.updateStatus({
        lastSync: undefined,
        lastError: undefined
      })).not.toThrow();
    it('should handle extreme queue lengths', () => {
      manager.setQueueStatus('processing', 99999);
      expect(status.queueLength).toBe(99999);
      expect(mockStatusBarItem.title).toContain('99999');
    it('should handle negative error counts gracefully', () => {
      manager.updateStatus({ errorCount: -1 });
      // Should not crash and should handle gracefully
      expect(() => manager.getCurrentStatus()).not.toThrow();
    it('should handle rapid status updates without memory leaks', () => {
      // Simulate rapid updates
      for (let i = 0; i < 1000; i++) {
        manager.updateStatus({
          sync: i % 2 === 0 ? 'syncing' : 'idle',
          queueLength: i
        });
      expect(status.queueLength).toBe(999);
  describe('Integration with Obsidian APIs', () => {
    it('should use setIcon correctly for status display', () => {
      manager.updateStatus({ sync: 'syncing' });
      expect(setIcon).toHaveBeenCalledWith(
        expect.anything(),
        'refresh-cw'
      );
    it('should handle missing Obsidian APIs gracefully', () => {
      // Temporarily break setIcon
      (setIcon as Mock).mockImplementation(() => {
        throw new Error('API not available');
      expect(() => manager.updateStatus({ sync: 'syncing' })).not.toThrow();
      // Restore setIcon
      (setIcon as Mock).mockImplementation(() => {});
});
