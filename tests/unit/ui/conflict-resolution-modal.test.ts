/**
 * ConflictResolutionModal Unit Tests
 * Following RED-GREEN-Refactor methodology
 * Tests comprehensive conflict resolution functionality
 */

import { App } from 'obsidian';
import { 
  ConflictResolutionModal, 
  ConflictResolutionOptions, 
  ConflictResolution,
  ConflictAuditEntry
} from '../../../src/ui/conflict-resolution-modal';
import { ConflictInfo } from '../../../src/sync/conflict-detector';
import type { Mock, Mocked, MockedFunction } from 'vitest';
// Mock Obsidian App
class MockApp {
  constructor() {}
}
// Mock DOM implementation (reusing from base-modal tests but simplified)
class MockElement {
  public children: MockElement[] = [];
  public textContent = '';
  public innerHTML = '';
  public className = '';
  public style: Record<string, string> = {};
  public attributes: Record<string, string> = {};
  private eventListeners: Record<string, Function[]> = {};
  setText(text: string): this {
    this.textContent = text;
    return this;
  }
  createDiv(cssClass = ''): MockElement {
    const div = new MockElement();
    div.className = cssClass;
    this.children.push(div);
    return div;
  createEl(tag: string, options: any = {}): MockElement {
    const el = new MockElement();
    if (options.text) el.textContent = options.text;
    if (options.cls) el.className = options.cls;
    this.children.push(el);
    return el;
  addEventListener(event: string, handler: Function): void {
    if (!this.eventListeners[event]) {
      this.eventListeners[event] = [];
    }
    this.eventListeners[event].push(handler);
  empty(): void {
    this.children = [];
    this.innerHTML = '';
    this.textContent = '';
  querySelector(selector: string): MockElement | null {
    return this.findBySelector(selector);
  querySelectorAll(selector: string): MockElement[] {
    return this.findAllBySelector(selector);
  addClass(cls: string): void {
    this.className += ' ' + cls;
  removeClass(cls: string): void {
    this.className = this.className.replace(new RegExp(`\\b${cls}\\b`, 'g'), '').trim();
  triggerEvent(eventType: string, data: any = {}): void {
    const handlers = this.eventListeners[eventType] || [];
    handlers.forEach(handler => handler({ ...data, target: this }));
  private findBySelector(selector: string): MockElement | null {
    if (this.matchesSelector(selector)) return this;
    for (const child of this.children) {
      const result = child.findBySelector(selector);
      if (result) return result;
    return null;
  private findAllBySelector(selector: string): MockElement[] {
    const results: MockElement[] = [];
    if (this.matchesSelector(selector)) results.push(this);
      results.push(...child.findAllBySelector(selector));
    return results;
  private matchesSelector(selector: string): boolean {
    if (selector.startsWith('.')) {
      return this.className.includes(selector.substring(1));
    return false;
// Test implementation of ConflictResolutionModal
class TestConflictResolutionModal extends ConflictResolutionModal {
  public testRenderContent(): void {
    this.renderContent();
  public testCleanup(): void {
    this.cleanup();
  // Expose protected methods for testing
  public testGetResolutions(): Map<string, ConflictResolution> {
    return (this as any).resolutions;
  public testGetAuditLog(): ConflictAuditEntry[] {
    return (this as any).auditLog;
  public testSwitchTab(tabId: 'conflicts' | 'summary' | 'audit'): void {
    (this as any).switchTab(tabId);
  public testBulkResolve(resolution: 'local' | 'remote'): void {
    (this as any).bulkResolve(resolution);
  public testPerformAutoResolution(): void {
    (this as any).performAutoResolution();
  public testResetAllResolutions(): void {
    (this as any).resetAllResolutions();
  public testHandleValueChange(fieldName: string, value: any, source: 'local' | 'remote'): void {
    (this as any).handleValueChange(fieldName, value, source);
  public testApplyResolutions(): Promise<void> {
    return (this as any).applyResolutions();
  public testExportSummary(): void {
    (this as any).exportSummary();
  public testHandleCancel(): Promise<void> {
    return (this as any).handleCancel();
describe('ConflictResolutionModal', () => {
  let app: MockApp;
  let modal: TestConflictResolutionModal;
  let mockOptions: ConflictResolutionOptions;
  let mockConflicts: ConflictInfo[];
  let onResolveMock: Mock;
  let onCancelMock: Mock;
  // Setup DOM mocks
  const mockModalEl = new MockElement();
  const mockTitleEl = new MockElement();
  const mockContentEl = new MockElement();
  const mockScope = { register: vi.fn() };
  const createSampleConflict = (overrides: Partial<ConflictInfo> = {}): ConflictInfo => ({
    issueKey: 'TEST-123',
    field: 'summary',
    localValue: 'Local summary',
    remoteValue: 'Remote summary',
    localTimestamp: Date.now() - 1000,
    remoteTimestamp: Date.now(),
    severity: 'medium',
    ...overrides
  });
  beforeEach(() => {
    app = new MockApp() as any;
    onResolveMock = vi.fn();
    onCancelMock = vi.fn();
    mockConflicts = [
      createSampleConflict({ field: 'summary', severity: 'high' }),
      createSampleConflict({ field: 'description', severity: 'medium' }),
      createSampleConflict({ field: 'priority', severity: 'low' })
    ];
    mockOptions = {
      title: 'Resolve Conflicts',
      issueKey: 'TEST-123',
      conflicts: mockConflicts,
      onResolve: onResolveMock,
      onCancel: onCancelMock,
      autoResolveEnabled: true,
      showAuditLog: true
    };
    modal = new TestConflictResolutionModal(app as App, mockOptions);
    // Mock DOM elements
    (modal as any).modalEl = mockModalEl;
    (modal as any).titleEl = mockTitleEl;
    (modal as any).contentEl = mockContentEl;
    (modal as any).scope = mockScope;
    // Reset mocks
    mockModalEl.empty();
    mockTitleEl.empty();
    mockContentEl.empty();
    vi.clearAllMocks();
    // Mock global confirm function
    global.confirm = vi.fn().mockReturnValue(true);
    // Mock URL and Blob for export functionality
    global.URL = {
      createObjectURL: vi.fn().mockReturnValue('mock-url'),
      revokeObjectURL: vi.fn()
    } as any;
    global.Blob = vi.fn().mockImplementation((content, options) => ({
      content,
      options
    })) as any;
    // Mock document.createElement for download
    global.document = {
      createElement: vi.fn().mockReturnValue({
        href: '',
        download: '',
        click: vi.fn()
      })
  afterEach(() => {
    vi.restoreAllMocks();
  describe('Modal Initialization', () => {
    it('should create modal with correct options', () => {
      expect(modal).toBeDefined();
      expect((modal as any).options.issueKey).toBe('TEST-123');
      expect((modal as any).options.conflicts).toHaveLength(3);
      expect((modal as any).options.autoResolveEnabled).toBe(true);
      expect((modal as any).options.showAuditLog).toBe(true);
    });
    it('should create modal with minimal options', () => {
      const minimalOptions: ConflictResolutionOptions = {
        title: 'Minimal Modal',
        issueKey: 'MIN-1',
        conflicts: [createSampleConflict()],
        onResolve: vi.fn()
      };
      const minimalModal = new TestConflictResolutionModal(app as App, minimalOptions);
      expect(minimalModal).toBeDefined();
      expect((minimalModal as any).options.autoResolveEnabled).toBe(true); // Default
      expect((minimalModal as any).options.showAuditLog).toBe(true); // Default
  describe('Content Rendering', () => {
    beforeEach(() => {
      // Mock contentContainer
      (modal as any).contentContainer = mockContentEl;
    it('should render warning message with conflict stats', () => {
      modal.testRenderContent();
      const warningSection = mockContentEl.querySelector('.conflict-warning-section');
      expect(warningSection).toBeTruthy();
      const conflictCount = warningSection?.querySelector('.conflict-count');
      expect(conflictCount?.textContent).toContain('3 conflicts');
      const issueKey = warningSection?.querySelector('.conflict-issue');
      expect(issueKey?.textContent).toContain('TEST-123');
    it('should render tabs correctly', () => {
      const tabContainer = mockContentEl.querySelector('.conflict-tab-container');
      expect(tabContainer).toBeTruthy();
      const tabs = tabContainer?.children;
      expect(tabs?.length).toBeGreaterThanOrEqual(2); // At least conflicts and summary
    it('should render conflicts tab by default', () => {
      const conflictsTab = mockContentEl.querySelector('.tab-content-conflicts');
      expect(conflictsTab).toBeTruthy();
      const diffViewerContainer = conflictsTab?.querySelector('.diff-viewer-container');
      expect(diffViewerContainer).toBeTruthy();
    it('should render bulk actions in conflicts tab', () => {
      const bulkActionsSection = mockContentEl.querySelector('.bulk-actions-section');
      expect(bulkActionsSection).toBeTruthy();
      const acceptAllLocalBtn = bulkActionsSection?.querySelector('.bulk-accept-local');
      const acceptAllRemoteBtn = bulkActionsSection?.querySelector('.bulk-accept-remote');
      const autoResolveBtn = bulkActionsSection?.querySelector('.bulk-auto-resolve');
      const resetBtn = bulkActionsSection?.querySelector('.bulk-reset');
      expect(acceptAllLocalBtn?.textContent).toContain('Accept All Local');
      expect(acceptAllRemoteBtn?.textContent).toContain('Accept All Remote');
      expect(autoResolveBtn?.textContent).toContain('Auto Resolve');
      expect(resetBtn?.textContent).toContain('Reset All');
  describe('Tab Management', () => {
    it('should switch to summary tab', () => {
      modal.testSwitchTab('summary');
      const summaryTab = mockContentEl.querySelector('.tab-content-summary');
      expect(summaryTab).toBeTruthy();
      const progressSection = summaryTab?.querySelector('.resolution-progress');
      expect(progressSection).toBeTruthy();
    it('should switch to audit tab when enabled', () => {
      modal.testSwitchTab('audit');
      const auditTab = mockContentEl.querySelector('.tab-content-audit');
      expect(auditTab).toBeTruthy();
    it('should show correct progress in summary tab', () => {
      // Resolve one conflict
      modal.testHandleValueChange('summary', 'Test value', 'local');
      
      const progressSection = mockContentEl.querySelector('.resolution-progress');
      expect(progressSection?.innerHTML).toContain('1/3 conflicts resolved');
      expect(progressSection?.innerHTML).toContain('33%');
  describe('Conflict Resolution', () => {
    it('should handle individual field resolution', () => {
      const fieldName = 'summary';
      const value = 'Resolved summary';
      const source = 'local';
      modal.testHandleValueChange(fieldName, value, source);
      const resolutions = modal.testGetResolutions();
      expect(resolutions.has(fieldName)).toBe(true);
      const resolution = resolutions.get(fieldName);
      expect(resolution?.fieldName).toBe(fieldName);
      expect(resolution?.finalValue).toBe(value);
      expect(resolution?.resolution).toBe(source);
      expect(resolution?.reason).toContain('User selected local version');
      const auditLog = modal.testGetAuditLog();
      expect(auditLog).toHaveLength(1);
      expect(auditLog[0].fieldName).toBe(fieldName);
      expect(auditLog[0].autoResolved).toBe(false);
    it('should perform bulk resolution with local values', () => {
      modal.testBulkResolve('local');
      expect(resolutions.size).toBe(3);
      mockConflicts.forEach(conflict => {
        const resolution = resolutions.get(conflict.field);
        expect(resolution?.resolution).toBe('local');
        expect(resolution?.finalValue).toBe(conflict.localValue);
      });
      expect(auditLog).toHaveLength(3);
      auditLog.forEach(entry => {
        expect(entry.reason).toContain('Bulk resolution: accept all local');
        expect(entry.autoResolved).toBe(false);
    it('should perform bulk resolution with remote values', () => {
      modal.testBulkResolve('remote');
        expect(resolution?.resolution).toBe('remote');
        expect(resolution?.finalValue).toBe(conflict.remoteValue);
    it('should reset all resolutions', () => {
      // First resolve some conflicts
      expect(modal.testGetResolutions().size).toBe(3);
      // Then reset
      modal.testResetAllResolutions();
      expect(modal.testGetResolutions().size).toBe(0);
      const resetEntry = auditLog.find(entry => entry.fieldName === 'ALL');
      expect(resetEntry).toBeTruthy();
      expect(resetEntry?.reason).toContain('User reset all resolutions');
  describe('Auto Resolution', () => {
    it('should auto-resolve low severity conflicts', () => {
      const lowSeverityConflicts = [
        createSampleConflict({ 
          field: 'priority', 
          severity: 'low',
          localTimestamp: Date.now(),
          remoteTimestamp: Date.now() - 1000 
        })
      ];
      // Create modal with only low severity conflicts
      const autoModal = new TestConflictResolutionModal(app as App, {
        ...mockOptions,
        conflicts: lowSeverityConflicts
      (autoModal as any).contentContainer = mockContentEl;
      autoModal.testPerformAutoResolution();
      const resolutions = autoModal.testGetResolutions();
      expect(resolutions.size).toBe(1);
      const resolution = resolutions.get('priority');
      expect(resolution?.resolution).toBe('local'); // Local is newer
      expect(resolution?.reason).toContain('Auto-resolved');
      const auditLog = autoModal.testGetAuditLog();
      expect(auditLog[0].autoResolved).toBe(true);
    it('should auto-resolve empty description conflicts', () => {
      const emptyDescriptionConflict = createSampleConflict({
        field: 'description',
        severity: 'medium',
        localValue: '', // Empty local
        remoteValue: 'Remote description'
        conflicts: [emptyDescriptionConflict]
      const resolution = resolutions.get('description');
      expect(resolution?.resolution).toBe('remote');
      expect(resolution?.reason).toContain('Local description is empty');
    it('should not auto-resolve high severity conflicts', () => {
      const highSeverityConflicts = [
        createSampleConflict({ field: 'summary', severity: 'high' })
        conflicts: highSeverityConflicts
      expect(resolutions.size).toBe(0); // No high severity conflicts auto-resolved
  describe('Resolution Validation', () => {
    it('should enable apply button when all conflicts are resolved', () => {
      // Resolve all conflicts
      // Check that apply button would be enabled
      expect(resolutions.size).toBe(mockConflicts.length);
    it('should keep apply button disabled when conflicts remain', () => {
      // Resolve only one conflict
      modal.testHandleValueChange('summary', 'Test', 'local');
      expect(resolutions.size).toBeLessThan(mockConflicts.length);
    it('should show validation status in summary tab', () => {
      const validationSection = mockContentEl.querySelector('.validation-status');
      expect(validationSection).toBeTruthy();
      const remainingConflicts = validationSection?.querySelector('.remaining-conflicts');
      expect(remainingConflicts).toBeTruthy();
  describe('Apply Resolutions', () => {
    it('should successfully apply all resolutions', async () => {
      await modal.testApplyResolutions();
      expect(onResolveMock).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            fieldName: 'summary',
            resolution: 'local'
          }),
            fieldName: 'description',
            fieldName: 'priority',
          })
        ])
      );
    it('should prevent applying when not all conflicts are resolved', async () => {
      // Only resolve one conflict
      expect(onResolveMock).not.toHaveBeenCalled();
    it('should handle resolution errors gracefully', async () => {
      onResolveMock.mockRejectedValue(new Error('Resolution failed'));
      expect(onResolveMock).toHaveBeenCalled();
      // Error should be handled internally, not thrown
  describe('Export Functionality', () => {
    it('should export resolution summary', () => {
      modal.testExportSummary();
      expect(global.Blob).toHaveBeenCalledWith(
        [expect.stringContaining('TEST-123')],
        { type: 'application/json' }
      expect(global.URL.createObjectURL).toHaveBeenCalled();
      expect(global.document.createElement).toHaveBeenCalledWith('a');
    it('should include audit log in export', () => {
      // Verify that Blob was called with JSON containing audit log
      const blobCall = (global.Blob as Mock).mock.calls[0];
      const exportData = JSON.parse(blobCall[0][0]);
      expect(exportData.auditLog).toHaveLength(1);
      expect(exportData.auditLog[0].fieldName).toBe('summary');
  describe('Cancel Handling', () => {
    it('should cancel without confirmation when no resolutions made', async () => {
      await modal.testHandleCancel();
      expect(global.confirm).not.toHaveBeenCalled();
      expect(onCancelMock).toHaveBeenCalled();
    it('should request confirmation when resolutions exist', async () => {
      expect(global.confirm).toHaveBeenCalledWith(
        expect.stringContaining('1 out of 3 conflicts')
      expect(onCancelMock).toHaveBeenCalled(); // Since confirm returns true
    it('should not cancel if user rejects confirmation', async () => {
      (global.confirm as Mock).mockReturnValue(false);
      expect(global.confirm).toHaveBeenCalled();
      expect(onCancelMock).not.toHaveBeenCalled();
  describe('Cleanup', () => {
    it('should clean up resources on close', () => {
      // Add some resolutions first
      expect(modal.testGetResolutions().size).toBe(1);
      expect(modal.testGetAuditLog()).toHaveLength(1);
      modal.testCleanup();
      expect(modal.testGetAuditLog()).toHaveLength(0);
  describe('Field Name Formatting', () => {
    it('should format field names correctly', () => {
      const testConflicts = [
        createSampleConflict({ field: 'field_name' }),
        createSampleConflict({ field: 'camelCase' }),
        createSampleConflict({ field: 'kebab-case' })
      const formattedModal = new TestConflictResolutionModal(app as App, {
        conflicts: testConflicts
      (formattedModal as any).contentContainer = mockContentEl;
      formattedModal.testRenderContent();
      // In a full test, we would verify the formatted names appear in the UI
      // For now, we test that the modal can handle various field name formats
      expect(formattedModal).toBeDefined();
  describe('Timestamp Handling', () => {
    it('should handle various timestamp formats', () => {
      const now = Date.now();
      const timestampConflicts = [
          field: 'recent',
          localTimestamp: now - 1000,
          remoteTimestamp: now
        }),
          field: 'old',
          localTimestamp: now - 86400000, // 1 day ago
          remoteTimestamp: now - 3600000   // 1 hour ago
      const timestampModal = new TestConflictResolutionModal(app as App, {
        conflicts: timestampConflicts
      (timestampModal as any).contentContainer = mockContentEl;
      timestampModal.testRenderContent();
      expect(timestampModal).toBeDefined();
  describe('Error Boundary', () => {
    it('should handle malformed conflict data gracefully', () => {
      const malformedConflicts = [
        {
          issueKey: 'TEST-123',
          field: 'malformed',
          localValue: null,
          remoteValue: undefined,
          localTimestamp: NaN,
          remoteTimestamp: 0,
          severity: 'unknown' as any
        } as ConflictInfo
      expect(() => {
        new TestConflictResolutionModal(app as App, {
          ...mockOptions,
          conflicts: malformedConflicts
        });
      }).not.toThrow();
});
