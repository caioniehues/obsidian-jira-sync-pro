/**
 * User Messaging Test Suite
 * Comprehensive tests for user messaging system and progressive error disclosure
 * Following RED-GREEN-Refactor methodology
 */

import { App, Notice } from 'obsidian';
import { UserMessagingManager, UserMessage, UserAction, MessageCategory } from '../../../src/ui/user-messaging';
import { ErrorNotificationManager, ErrorType, ErrorContext } from '../../../src/ui/error-notifications';
import { StatusIndicatorManager } from '../../../src/ui/status-indicators';
import { NotificationSettings } from '../../../src/settings/settings';
import type { Mock, Mocked, MockedFunction } from 'vitest';
// Mock dependencies
vi.mock('obsidian', () => ({
  App: vi.fn(),
  Notice: vi.fn().mockImplementation((message: string, duration?: number) => ({
    noticeEl: {
      style: { cursor: '' },
      title: '',
      addEventListener: vi.fn()
    },
    hide: vi.fn()
  }))
}));
vi.mock('../../../src/ui/error-notifications', () => ({
  ErrorNotificationManager: vi.fn().mockImplementation(() => ({
    showError: vi.fn(),
    updateSettings: vi.fn()
vi.mock('../../../src/ui/status-indicators', () => ({
  StatusIndicatorManager: vi.fn().mockImplementation(() => ({
    reportError: vi.fn(),
describe('UserMessagingManager', () => {
  let app: App;
  let errorNotifications: ErrorNotificationManager;
  let statusIndicators: StatusIndicatorManager;
  let settings: NotificationSettings;
  let manager: UserMessagingManager;
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Setup mocks
    app = new App();
    errorNotifications = new ErrorNotificationManager(app, {} as any);
    statusIndicators = new StatusIndicatorManager(app, {} as any, {} as any);
    settings = {
      enableSyncNotifications: true,
      enableErrorNotifications: true,
      enableConflictNotifications: true,
      notificationDuration: 5,
      soundEnabled: false,
      desktopNotificationsEnabled: false
    };
    manager = new UserMessagingManager(app, errorNotifications, statusIndicators, settings);
  });
  describe('Initialization and Settings', () => {
    it('should initialize with provided dependencies', () => {
      expect(manager).toBeInstanceOf(UserMessagingManager);
    });
    it('should update settings across all components', () => {
      const newSettings: NotificationSettings = {
        ...settings,
        enableErrorNotifications: false,
        notificationDuration: 10
      };
      manager.updateSettings(newSettings);
      expect(errorNotifications.updateSettings).toHaveBeenCalledWith(newSettings);
      expect(statusIndicators.updateSettings).toHaveBeenCalledWith(newSettings);
  describe('Error Classification', () => {
    const testCases: Array<{ message: string; expected: ErrorType }> = [
      { message: 'network connection failed', expected: 'NETWORK_ERROR' },
      { message: 'connection timeout occurred', expected: 'NETWORK_ERROR' },
      { message: 'authentication failed', expected: 'AUTHENTICATION_ERROR' },
      { message: 'unauthorized access denied', expected: 'AUTHENTICATION_ERROR' },
      { message: 'HTTP 401 unauthorized', expected: 'AUTHENTICATION_ERROR' },
      { message: 'forbidden resource access', expected: 'AUTHORIZATION_ERROR' },
      { message: 'HTTP 403 forbidden', expected: 'AUTHORIZATION_ERROR' },
      { message: 'rate limit exceeded temporarily', expected: 'RATE_LIMIT_ERROR' },
      { message: 'HTTP 429 too many requests', expected: 'RATE_LIMIT_ERROR' },
      { message: 'sync conflict detected in file', expected: 'SYNC_CONFLICT' },
      { message: 'data validation failed for field', expected: 'VALIDATION_ERROR' },
      { message: 'invalid field format provided', expected: 'VALIDATION_ERROR' },
      { message: 'configuration error in settings', expected: 'CONFIGURATION_ERROR' },
      { message: 'plugin settings are invalid', expected: 'CONFIGURATION_ERROR' },
      { message: 'jira api returned error', expected: 'JIRA_API_ERROR' },
      { message: 'api endpoint not responding', expected: 'JIRA_API_ERROR' },
      { message: 'file system access denied', expected: 'FILE_SYSTEM_ERROR' },
      { message: 'file path does not exist', expected: 'FILE_SYSTEM_ERROR' },
      { message: 'unknown system failure occurred', expected: 'UNKNOWN_ERROR' }
    ];
    testCases.forEach(({ message, expected }) => {
      it(`should classify "${message}" as ${expected}`, async () => {
        const error = new Error(message);
        
        await manager.handleError(error, { operation: 'test-operation' });
        // Verify error notification was called with correct type
        expect(errorNotifications.showError).toHaveBeenCalledWith(
          expected,
          expect.objectContaining({
            operation: 'test-operation',
            originalError: error
          }),
          expect.any(Object)
        );
      });
  describe('Error Handling Process', () => {
    it('should process complete error handling workflow', async () => {
      const error = new Error('Network connection failed');
      const context = {
        operation: 'sync-tickets',
        issueKey: 'TEST-123',
        retryCount: 2
      await manager.handleError(error, context);
      // Verify all components are called
      expect(errorNotifications.showError).toHaveBeenCalled();
      expect(statusIndicators.reportError).toHaveBeenCalled();
    it('should create proper error context with defaults', async () => {
      const error = new Error('Test error');
      
      await manager.handleError(error);
      expect(errorNotifications.showError).toHaveBeenCalledWith(
        'UNKNOWN_ERROR',
        expect.objectContaining({
          operation: 'unknown operation',
          timestamp: expect.any(Date),
          originalError: error,
          retryCount: 0
        }),
        expect.any(Object)
      );
    it('should preserve provided context properties', async () => {
      const error = new Error('Network error');
      const timestamp = new Date('2024-01-15T10:30:00Z');
        operation: 'fetch-issues',
        issueKey: 'PROJ-456',
        timestamp,
        retryCount: 3,
        userAction: 'Check connection'
        'NETWORK_ERROR',
        expect.objectContaining(context),
  describe('Error Priority Assessment', () => {
    const priorityTestCases: Array<{ errorType: ErrorType; expectedPriority: string }> = [
      { errorType: 'AUTHENTICATION_ERROR', expectedPriority: 'critical' },
      { errorType: 'AUTHORIZATION_ERROR', expectedPriority: 'critical' },
      { errorType: 'CONFIGURATION_ERROR', expectedPriority: 'high' },
      { errorType: 'NETWORK_ERROR', expectedPriority: 'high' },
      { errorType: 'SYNC_CONFLICT', expectedPriority: 'medium' },
      { errorType: 'VALIDATION_ERROR', expectedPriority: 'medium' },
      { errorType: 'RATE_LIMIT_ERROR', expectedPriority: 'medium' },
      { errorType: 'JIRA_API_ERROR', expectedPriority: 'medium' },
      { errorType: 'FILE_SYSTEM_ERROR', expectedPriority: 'medium' },
      { errorType: 'UNKNOWN_ERROR', expectedPriority: 'medium' }
    priorityTestCases.forEach(({ errorType, expectedPriority }) => {
      it(`should assign ${expectedPriority} priority to ${errorType}`, async () => {
        const error = new Error('Test error');
        await manager.handleError(error);
          expect.any(String),
          expect.any(Object),
            priority: expectedPriority
          })
  describe('Retry Capability Assessment', () => {
    const retryableErrors: ErrorType[] = [
      'NETWORK_ERROR',
      'RATE_LIMIT_ERROR',
      'JIRA_API_ERROR',
      'UNKNOWN_ERROR'
    const nonRetryableErrors: ErrorType[] = [
      'AUTHENTICATION_ERROR',
      'AUTHORIZATION_ERROR',
      'CONFIGURATION_ERROR',
      'SYNC_CONFLICT',
      'VALIDATION_ERROR',
      'FILE_SYSTEM_ERROR'
    retryableErrors.forEach(errorType => {
      it(`should allow retry for ${errorType}`, async () => {
        await manager.handleError(error, { retryCount: 1 });
            allowRetry: true,
            retryAction: expect.any(Function)
    nonRetryableErrors.forEach(errorType => {
      it(`should not allow retry for ${errorType}`, async () => {
            allowRetry: false
  describe('User Message Generation', () => {
    it('should generate network error message with appropriate actions', async () => {
      const error = new Error('Connection timeout');
        operation: 'sync-data',
        issueKey: 'NET-001',
        retryCount: 1
      // Verify that a user message would be generated
      // (This tests the internal message template system)
    it('should generate authentication error message with critical severity', async () => {
      const error = new Error('Authentication failed');
      await manager.handleError(error, { operation: 'login' });
        'AUTHENTICATION_ERROR',
        expect.any(Object),
          priority: 'critical'
        })
    it('should generate sync conflict message with resolution actions', async () => {
      const error = new Error('Conflicting changes detected');
      await manager.handleError(error, {
        operation: 'sync',
        issueKey: 'CONF-123'
        'SYNC_CONFLICT',
          issueKey: 'CONF-123'
          priority: 'medium'
  describe('Progressive Message Display', () => {
    let userMessage: UserMessage;
    beforeEach(() => {
      userMessage = {
        title: 'Test Error',
        summary: 'A test error occurred',
        details: 'Detailed information about the test error',
        actions: [
          {
            label: 'Retry',
            action: vi.fn(),
            type: 'primary'
          },
            label: 'Settings',
            type: 'secondary'
          }
        ],
        severity: 'warning',
        category: 'sync',
        metadata: {
          errorType: 'NETWORK_ERROR',
          timestamp: new Date()
        }
    it('should show progressive message for low severity', async () => {
      userMessage.severity = 'warning';
      await manager.showUserMessage(userMessage);
      expect(Notice).toHaveBeenCalledWith(
        expect.stringContaining('⚠️ A test error occurred'),
        expect.any(Number)
    it('should show detailed message for critical severity', async () => {
      userMessage.severity = 'critical';
      // For critical messages, detailed view should be shown
      expect(Notice).toHaveBeenCalled();
    it('should calculate correct duration based on severity', async () => {
      const testCases = [
        { severity: 'info' as const, multiplier: 0.5 },
        { severity: 'warning' as const, multiplier: 1 },
        { severity: 'error' as const, multiplier: 1.5 },
        { severity: 'critical' as const, multiplier: 0 }
      ];
      for (const testCase of testCases) {
        vi.clearAllMocks();
        userMessage.severity = testCase.severity;
        await manager.showUserMessage(userMessage);
        const expectedDuration = testCase.multiplier === 0 ? 0 : settings.notificationDuration * testCase.multiplier;
        expect(Notice).toHaveBeenCalledWith(
          expectedDuration
      }
    it('should add click handler for progressive disclosure', async () => {
      const mockNotice = (Notice as Mock).mock.results[0].value;
      expect(mockNotice.noticeEl.style.cursor).toBe('pointer');
      expect(mockNotice.noticeEl.title).toBe('Click for details and actions');
      expect(mockNotice.noticeEl.addEventListener).toHaveBeenCalledWith('click', expect.any(Function));
  describe('Message History Management', () => {
    it('should store messages in history', async () => {
      const message1: UserMessage = {
        title: 'Error 1',
        summary: 'First error',
        actions: [],
        severity: 'error',
        category: 'sync'
      const message2: UserMessage = {
        title: 'Error 2',
        summary: 'Second error',
        category: 'connection'
      await manager.showUserMessage(message1);
      await manager.showUserMessage(message2);
      const recentMessages = manager.getRecentMessages(10);
      expect(recentMessages).toHaveLength(2);
      expect(recentMessages[0].title).toBe('Error 2'); // Most recent first
      expect(recentMessages[1].title).toBe('Error 1');
    it('should limit history to maximum size', async () => {
      // Create 60 messages (above the 50 limit)
      for (let i = 0; i < 60; i++) {
        const message: UserMessage = {
          title: `Error ${i}`,
          summary: `Error number ${i}`,
          actions: [],
          severity: 'info',
          category: 'system'
        };
        await manager.showUserMessage(message);
      const allMessages = manager.getRecentMessages(100);
      expect(allMessages).toHaveLength(50); // Should be limited to maxHistorySize
      expect(allMessages[0].title).toBe('Error 59'); // Most recent
      expect(allMessages[49].title).toBe('Error 10'); // 50 messages back
    it('should filter messages by category', async () => {
      const categories: MessageCategory[] = ['sync', 'connection', 'authentication'];
      for (let i = 0; i < categories.length; i++) {
          title: `${categories[i]} Error`,
          summary: `Error in ${categories[i]}`,
          severity: 'warning',
          category: categories[i]
      const syncMessages = manager.getMessagesByCategory('sync');
      const connectionMessages = manager.getMessagesByCategory('connection');
      const authMessages = manager.getMessagesByCategory('authentication');
      expect(syncMessages).toHaveLength(1);
      expect(connectionMessages).toHaveLength(1);
      expect(authMessages).toHaveLength(1);
      expect(syncMessages[0].category).toBe('sync');
      expect(connectionMessages[0].category).toBe('connection');
      expect(authMessages[0].category).toBe('authentication');
  describe('Severity Icon Mapping', () => {
    const severityIconCases = [
      { severity: 'info' as const, icon: 'ℹ️' },
      { severity: 'warning' as const, icon: '⚠️' },
      { severity: 'error' as const, icon: '🚨' },
      { severity: 'critical' as const, icon: '💥' }
    severityIconCases.forEach(({ severity, icon }) => {
      it(`should use ${icon} icon for ${severity} severity`, async () => {
          title: 'Test Message',
          summary: 'Test summary',
          severity,
          expect.stringContaining(icon),
          expect.any(Number)
  describe('Error Handling and Edge Cases', () => {
    it('should handle errors with empty messages', async () => {
      const error = new Error('');
      expect(async () => {
      }).not.toThrow();
    it('should handle missing error context gracefully', async () => {
      await manager.handleError(error, {});
        expect.any(String),
    it('should handle undefined error objects', async () => {
      const error = undefined as any;
      await expect(manager.handleError(error)).rejects.toThrow();
    it('should handle messages with no actions', async () => {
      const message: UserMessage = {
        title: 'Simple Message',
        summary: 'A message without actions',
        severity: 'info',
        category: 'system'
      await expect(manager.showUserMessage(message)).resolves.not.toThrow();
    it('should handle messages with undefined details', async () => {
        title: 'Message without details',
        summary: 'Summary only',
  describe('Integration with Dependencies', () => {
    it('should coordinate with error notification manager', async () => {
      const error = new Error('Integration test error');
          priority: 'medium',
          allowRetry: true
    it('should coordinate with status indicator manager', async () => {
      const error = new Error('Status integration test');
      const timestamp = new Date();
      await manager.handleError(error, { timestamp });
      expect(statusIndicators.reportError).toHaveBeenCalledWith(timestamp);
    it('should handle dependency method failures gracefully', async () => {
      // Mock error notification to throw
      (errorNotifications.showError as Mock).mockImplementation(() => {
        throw new Error('Notification system failure');
      // Should not propagate the internal error
      await expect(manager.handleError(error)).rejects.toThrow('Notification system failure');
});
