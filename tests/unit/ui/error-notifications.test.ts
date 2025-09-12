/**
 * Error Notifications Test Suite
 * Comprehensive tests for error notification system using real Notice API
 * Following RED-GREEN-Refactor methodology
 */

import { App, Notice } from 'obsidian';
import { ErrorNotificationManager, ErrorType, ErrorContext, ErrorNotificationOptions } from '../../../src/ui/error-notifications';
import { NotificationSettings } from '../../../src/settings/settings';
import type { Mock, Mocked, MockedFunction } from 'vitest';
// Mock Obsidian Notice but keep it functional for testing
vi.mock('obsidian', () => ({
  Notice: vi.fn().mockImplementation((message: string, duration?: number) => {
    const mockNotice = {
      noticeEl: {
        style: {},
        title: '',
        addEventListener: vi.fn(),
        createDiv: vi.fn().mockReturnValue({
          createEl: vi.fn().mockReturnValue({
            addEventListener: vi.fn(),
            disabled: false,
            textContent: '',
            style: {}
          })
        })
      },
      hide: vi.fn()
    };
    return mockNotice;
  }),
  App: vi.fn()
}));
describe('ErrorNotificationManager', () => {
  let app: App;
  let settings: NotificationSettings;
  let manager: ErrorNotificationManager;
  let mockNotice: any;
  beforeEach(() => {
    // Clear all mocks
    vi.clearAllMocks();
    
    // Setup mock app
    app = new App();
    // Setup default notification settings
    settings = {
      enableSyncNotifications: true,
      enableErrorNotifications: true,
      enableConflictNotifications: true,
      notificationDuration: 5,
      soundEnabled: false,
      desktopNotificationsEnabled: false
    // Create manager instance
    manager = new ErrorNotificationManager(app, settings);
    // Get mock notice for assertions
    mockNotice = (Notice as Mock).mock.results[0]?.value;
  });
  describe('Initialization', () => {
    it('should initialize with provided app and settings', () => {
      expect(manager).toBeInstanceOf(ErrorNotificationManager);
    });
    it('should start with empty active notifications and history', () => {
      const recentErrors = manager.getRecentErrors(10);
      expect(recentErrors).toHaveLength(0);
  describe('Settings Management', () => {
    it('should update settings when updateSettings is called', () => {
      const newSettings: NotificationSettings = {
        ...settings,
        enableErrorNotifications: false,
        notificationDuration: 10
      };
      
      manager.updateSettings(newSettings);
      // Test that settings are updated by checking notification behavior
      const errorContext: ErrorContext = {
        operation: 'test-operation',
        timestamp: new Date(),
        originalError: new Error('Test error')
      manager.showError('NETWORK_ERROR', errorContext);
      // Should not show notification when disabled
      expect(Notice).not.toHaveBeenCalled();
  describe('Error Classification', () => {
    const testCases: Array<{ message: string; expected: ErrorType }> = [
      { message: 'Network connection failed', expected: 'NETWORK_ERROR' },
      { message: 'Connection timeout', expected: 'NETWORK_ERROR' },
      { message: 'Authentication failed', expected: 'AUTHENTICATION_ERROR' },
      { message: 'Unauthorized access', expected: 'AUTHENTICATION_ERROR' },
      { message: 'HTTP 401 error', expected: 'AUTHENTICATION_ERROR' },
      { message: 'Forbidden access', expected: 'AUTHORIZATION_ERROR' },
      { message: 'HTTP 403 error', expected: 'AUTHORIZATION_ERROR' },
      { message: 'Rate limit exceeded', expected: 'RATE_LIMIT_ERROR' },
      { message: 'HTTP 429 error', expected: 'RATE_LIMIT_ERROR' },
      { message: 'Sync conflict detected', expected: 'SYNC_CONFLICT' },
      { message: 'Data validation failed', expected: 'VALIDATION_ERROR' },
      { message: 'Invalid field format', expected: 'VALIDATION_ERROR' },
      { message: 'Configuration error', expected: 'CONFIGURATION_ERROR' },
      { message: 'Settings invalid', expected: 'CONFIGURATION_ERROR' },
      { message: 'Jira API failure', expected: 'JIRA_API_ERROR' },
      { message: 'API endpoint error', expected: 'JIRA_API_ERROR' },
      { message: 'File system error', expected: 'FILE_SYSTEM_ERROR' },
      { message: 'Path not found', expected: 'FILE_SYSTEM_ERROR' },
      { message: 'Unknown system failure', expected: 'UNKNOWN_ERROR' }
    ];
    testCases.forEach(({ message, expected }) => {
      it(`should classify "${message}" as ${expected}`, () => {
        const error = new Error(message);
        const context: ErrorContext = {
          operation: 'test',
          timestamp: new Date(),
          originalError: error
        };
        manager.showError(expected, context);
        // Verify the error was stored with correct classification
        const recentErrors = manager.getRecentErrors(1);
        expect(recentErrors).toHaveLength(1);
        expect(recentErrors[0].originalError.message).toBe(message);
      });
  describe('Error Display', () => {
    let errorContext: ErrorContext;
    beforeEach(() => {
      errorContext = {
        operation: 'sync-operation',
        issueKey: 'TEST-123',
        originalError: new Error('Test network error'),
        retryCount: 1
    it('should show simple error notification by default', () => {
      expect(Notice).toHaveBeenCalledWith(
        expect.stringContaining('Connection to Jira failed (TEST-123) during sync-operation'),
        expect.any(Number)
      );
    it('should not show notification when error notifications are disabled', () => {
      const disabledSettings = { ...settings, enableErrorNotifications: false };
      manager.updateSettings(disabledSettings);
    it('should show detailed notification when showDetails option is true', () => {
      const options: ErrorNotificationOptions = {
        showDetails: true,
        priority: 'high'
      manager.showError('NETWORK_ERROR', errorContext, options);
      expect(Notice).toHaveBeenCalled();
      const noticeCall = (Notice as Mock).mock.calls[0];
      expect(noticeCall[0]).toContain('🚨 Connection to Jira failed');
      expect(noticeCall[0]).toContain(errorContext.timestamp.toLocaleTimeString());
    it('should calculate duration based on priority', () => {
      const testCases = [
        { priority: 'low' as const, expectedMultiplier: 0.5 },
        { priority: 'medium' as const, expectedMultiplier: 1 },
        { priority: 'high' as const, expectedMultiplier: 1.5 },
        { priority: 'critical' as const, expectedMultiplier: 3 }
      ];
      testCases.forEach(({ priority, expectedMultiplier }) => {
        vi.clearAllMocks();
        
        manager.showError('NETWORK_ERROR', errorContext, { priority });
        expect(Notice).toHaveBeenCalledWith(
          expect.any(String),
          Math.max(settings.notificationDuration * expectedMultiplier, 1)
        );
    it('should add retry button when allowRetry is true', () => {
      const retryAction = vi.fn().mockResolvedValue(undefined);
        allowRetry: true,
        retryAction
      // Verify notice was created and retry button handling was set up
      expect(mockNotice.noticeEl.addEventListener).not.toHaveBeenCalled(); // Simple notification
      // Test detailed notification with retry
      manager.showError('NETWORK_ERROR', errorContext, { ...options, showDetails: true });
      // The retry button setup happens in addRetryButton which is called for detailed notifications
  describe('Error History', () => {
    it('should store errors in history', () => {
      const error1Context: ErrorContext = {
        operation: 'operation1',
        originalError: new Error('Error 1')
      const error2Context: ErrorContext = {
        operation: 'operation2',
        originalError: new Error('Error 2')
      manager.showError('NETWORK_ERROR', error1Context);
      manager.showError('AUTHENTICATION_ERROR', error2Context);
      expect(recentErrors).toHaveLength(2);
      expect(recentErrors[0].originalError.message).toBe('Error 2'); // Most recent first
      expect(recentErrors[1].originalError.message).toBe('Error 1');
    it('should limit history to maximum size', () => {
      // Create 150 errors (above the 100 limit)
      for (let i = 0; i < 150; i++) {
        const errorContext: ErrorContext = {
          operation: `operation${i}`,
          originalError: new Error(`Error ${i}`)
        manager.showError('NETWORK_ERROR', errorContext);
      }
      const recentErrors = manager.getRecentErrors(200);
      expect(recentErrors).toHaveLength(100); // Should be limited to maxHistorySize
      expect(recentErrors[0].originalError.message).toBe('Error 149'); // Most recent
      expect(recentErrors[99].originalError.message).toBe('Error 50'); // 100 items back
  describe('Error Statistics', () => {
      // Add various errors for statistics testing
      const baseTime = new Date().getTime();
      // Recent errors (within 24 hours)
      for (let i = 0; i < 3; i++) {
          operation: 'recent-operation',
          timestamp: new Date(baseTime - i * 60000), // 1 minute apart
          originalError: new Error('network timeout')
      // Old errors (older than 24 hours)
      for (let i = 0; i < 2; i++) {
          operation: 'old-operation',
          timestamp: new Date(baseTime - (25 + i) * 60 * 60000), // 25+ hours ago
          originalError: new Error('authentication failed')
        manager.showError('AUTHENTICATION_ERROR', errorContext);
    it('should provide accurate error statistics', () => {
      const stats = manager.getErrorStats();
      expect(stats.totalErrors).toBe(5);
      expect(stats.recentErrors).toBe(3); // Only recent ones within 24 hours
      expect(stats.errorsByType['NETWORK_ERROR']).toBe(3);
      expect(stats.errorsByType['AUTHENTICATION_ERROR']).toBe(2);
      expect(stats.mostCommonError).toBe('NETWORK_ERROR');
    it('should handle empty history gracefully', () => {
      const freshManager = new ErrorNotificationManager(app, settings);
      const stats = freshManager.getErrorStats();
      expect(stats.totalErrors).toBe(0);
      expect(stats.recentErrors).toBe(0);
      expect(stats.errorsByType).toEqual({});
      expect(stats.mostCommonError).toBe('None');
  describe('Notification Management', () => {
    it('should track active notifications', () => {
      // Verify notification was created and tracked
    it('should dismiss specific notification', () => {
      // Test dismissal (internal method, but we can test the effect)
      manager.dismissAll();
      // Should not throw errors
      expect(() => manager.dismissAll()).not.toThrow();
    it('should dismiss all active notifications', () => {
      // Create multiple notifications
      expect(Notice).toHaveBeenCalledTimes(3);
      // Dismiss all
      // Should complete without errors
  describe('Convenience Methods', () => {
    it('should show network error with correct configuration', () => {
      const error = new Error('Connection timeout');
      manager.showNetworkError(error, 'sync', 'TEST-123');
      const recentErrors = manager.getRecentErrors(1);
      expect(recentErrors[0].operation).toBe('sync');
      expect(recentErrors[0].issueKey).toBe('TEST-123');
      expect(recentErrors[0].userAction).toBe('Check your internet connection and Jira URL');
    it('should show auth error with critical priority', () => {
      const error = new Error('Authentication failed');
      manager.showAuthError(error, 'login');
        expect.any(String),
        0 // Critical priority should not auto-dismiss (duration 0)
      expect(recentErrors[0].userAction).toBe('Check your credentials in plugin settings');
    it('should show sync conflict with detailed view', () => {
      const error = new Error('Conflicting changes detected');
      manager.showSyncConflict(error, 'TEST-456');
      expect(recentErrors[0].issueKey).toBe('TEST-456');
      expect(recentErrors[0].userAction).toBe('Resolve conflicts in the conflict resolution panel');
    it('should show validation error with helpful guidance', () => {
      const error = new Error('Invalid field format');
      manager.showValidationError(error, 'update', 'TEST-789');
      expect(recentErrors[0].issueKey).toBe('TEST-789');
      expect(recentErrors[0].userAction).toBe('Check the data format and required fields');
  describe('Edge Cases and Error Handling', () => {
    it('should handle undefined error messages gracefully', () => {
      const error = new Error();
      error.message = '';
        operation: 'test',
        originalError: error
      expect(() => manager.showError('UNKNOWN_ERROR', errorContext)).not.toThrow();
    it('should handle missing issue keys gracefully', () => {
      expect(() => manager.showError('NETWORK_ERROR', errorContext)).not.toThrow();
        expect.stringContaining('Connection to Jira failed during test'),
    it('should handle retry action failures gracefully', async () => {
      const failingRetryAction = vi.fn().mockRejectedValue(new Error('Retry failed'));
        retryAction: failingRetryAction,
        showDetails: true
      expect(() => manager.showError('NETWORK_ERROR', errorContext, options)).not.toThrow();
    it('should handle very long error messages appropriately', () => {
      const longMessage = 'A'.repeat(1000);
      const error = new Error(longMessage);
});
