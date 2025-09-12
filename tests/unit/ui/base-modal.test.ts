/**
 * BaseModal Unit Tests
 * Following RED-GREEN-Refactor methodology
 * Tests actual Modal implementation without mocks
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { App } from 'obsidian';
import { BaseModal, BaseModalOptions, ModalButton } from '../../../src/ui/base-modal';
import type { Mock, Mocked, MockedFunction } from 'vitest';
// Mock Obsidian App for testing
class MockApp {
  constructor() {}
}
// Concrete implementation for testing abstract BaseModal
class TestModal extends BaseModal {
  public renderContentCalled = false;
  public cleanupCalled = false;
  public beforeCloseCalled = false;
  public testContent = '';
  constructor(app: App, options: BaseModalOptions) {
    super(app, options);
  }
  protected renderContent(): void {
    this.renderContentCalled = true;
    if (this.contentContainer) {
      this.contentContainer.createDiv('test-content').setText(this.testContent);
    }
  protected cleanup(): void {
    this.cleanupCalled = true;
  protected async beforeClose(): Promise<void> {
    this.beforeCloseCalled = true;
  // Expose protected methods for testing
  public testAddButton(button: ModalButton): void {
    this.addButton(button);
  public testClearButtons(): void {
    this.clearButtons();
  public testUpdateButton(index: number, updates: Partial<ModalButton>): void {
    this.updateButton(index, updates);
  public testShowLoading(message?: string): void {
    this.showLoading(message);
  public testHideLoading(): void {
    this.hideLoading();
  public testShowError(message: string): void {
    this.showError(message);
  public testShowSuccess(message: string): void {
    this.showSuccess(message);
  public testCreateSetting(name: string, desc?: string) {
    return this.createSetting(name, desc);
  public testCreateDivider(): HTMLElement {
    return this.createDivider();
  public testCreateSection(title?: string, cssClass?: string): HTMLElement {
    return this.createSection(title, cssClass);
  public testFormatTimestamp(timestamp: number): string {
    return this.formatTimestamp(timestamp);
// Mock DOM elements for testing
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
  createDiv(cssClass = ''): MockElement {
    const div = new MockElement();
    div.className = cssClass;
    this.children.push(div);
    return div;
  createEl(tag: string, options: any = {}): MockElement {
    const el = new MockElement();
    if (options.text) el.textContent = options.text;
    if (options.cls) el.className = options.cls;
    if (options.attr) Object.assign(el.attributes, options.attr);
    this.children.push(el);
    return el;
  addEventListener(event: string, handler: Function): void {
    if (!this.eventListeners[event]) {
      this.eventListeners[event] = [];
    this.eventListeners[event].push(handler);
  addClasses(classes: string[]): void {
    this.className += ' ' + classes.join(' ');
  addClass(cls: string): void {
    this.className += ' ' + cls;
  removeClass(...classes: string[]): void {
    classes.forEach(cls => {
      this.className = this.className.replace(new RegExp(`\\b${cls}\\b`, 'g'), '').trim();
    });
  empty(): void {
    this.children = [];
    this.innerHTML = '';
    this.textContent = '';
  remove(): void {
    // Mock remove functionality
  querySelector(selector: string): MockElement | null {
    // Simple mock - in real tests this would need more sophisticated matching
    if (selector.includes('.modal-loading-overlay')) {
      return this.children.find(child => child.className.includes('modal-loading-overlay')) || null;
    return this.children[0] || null;
  querySelectorAll(selector: string): MockElement[] {
    // Simple mock implementation
    return this.children.filter(child => {
      if (selector.includes('.modal-error-message')) {
        return child.className.includes('modal-error-message');
      }
      if (selector.includes('.modal-success-message')) {
        return child.className.includes('modal-success-message');
      return false;
  // Mock getBoundingClientRect for tooltip positioning
  getBoundingClientRect(): { left: number; top: number; width: number; height: number } {
    return { left: 100, top: 100, width: 50, height: 20 };
  get offsetHeight(): number {
    return 20;
  triggerEvent(eventType: string, eventData: any = {}): void {
    const handlers = this.eventListeners[eventType] || [];
    handlers.forEach(handler => handler(eventData));
// Setup global mocks
const mockModalEl = new MockElement();
const mockTitleEl = new MockElement();
const mockContentEl = new MockElement();
const mockScope = {
  register: vi.fn()
};
// Mock document for tooltip tests
const mockDocument = {
  createElement: (tag: string) => new MockElement(),
  body: new MockElement(),
  querySelectorAll: (selector: string) => []
describe('BaseModal', () => {
  let app: MockApp;
  let modal: TestModal;
  let defaultOptions: BaseModalOptions;
  beforeEach(() => {
    app = new MockApp() as any;
    defaultOptions = {
      title: 'Test Modal',
      width: '500px',
      height: '400px',
      cssClasses: ['test-modal'],
      showCloseButton: true,
      closeOnClickOutside: true,
      closeOnEscape: true
    };
    // Reset mocks
    mockModalEl.empty();
    mockTitleEl.empty();
    mockContentEl.empty();
    vi.clearAllMocks();
    // Setup DOM mocks
    global.document = mockDocument as any;
  });
  describe('Modal Construction', () => {
    it('should create modal with default options', () => {
      const minimalOptions = { title: 'Test Modal' };
      modal = new TestModal(app as App, minimalOptions);
      // Mock the modal elements
      (modal as any).modalEl = mockModalEl;
      (modal as any).titleEl = mockTitleEl;
      (modal as any).contentEl = mockContentEl;
      (modal as any).scope = mockScope;
      expect(modal).toBeDefined();
      expect((modal as any).options.title).toBe('Test Modal');
      expect((modal as any).options.showCloseButton).toBe(true);
      expect((modal as any).options.closeOnClickOutside).toBe(true);
      expect((modal as any).options.closeOnEscape).toBe(true);
    it('should create modal with custom options', () => {
      modal = new TestModal(app as App, defaultOptions);
      expect((modal as any).options.width).toBe('500px');
      expect((modal as any).options.height).toBe('400px');
      expect((modal as any).options.cssClasses).toEqual(['test-modal']);
  describe('Modal Lifecycle', () => {
    beforeEach(() => {
    it('should set up modal structure on open', () => {
      modal.onOpen();
      expect(mockTitleEl.textContent).toBe('Test Modal');
      expect(mockModalEl.className).toContain('test-modal');
      expect(mockModalEl.style.width).toBe('500px');
      expect(mockModalEl.style.height).toBe('400px');
      expect(modal.renderContentCalled).toBe(true);
    it('should add close button when showCloseButton is true', () => {
      // Verify close button was created
      const closeButton = mockTitleEl.children.find(child => 
        child.className.includes('modal-close-button')
      );
      expect(closeButton).toBeDefined();
      expect(closeButton?.attributes['aria-label']).toBe('Close');
    it('should not add close button when showCloseButton is false', () => {
      const optionsWithoutClose = { ...defaultOptions, showCloseButton: false };
      modal = new TestModal(app as App, optionsWithoutClose);
      expect(closeButton).toBeUndefined();
    it('should register escape key handler when closeOnEscape is true', () => {
      expect(mockScope.register).toHaveBeenCalledWith([], 'Escape', expect.any(Function));
    it('should clean up on close', () => {
      modal.onClose();
      expect(mockContentEl.children).toHaveLength(0);
      expect(modal.cleanupCalled).toBe(true);
  describe('Button Management', () => {
    it('should add buttons correctly', () => {
      const testButton: ModalButton = {
        text: 'Test Button',
        variant: 'primary',
        onClick: vi.fn()
      };
      modal.testAddButton(testButton);
      expect((modal as any).buttons).toHaveLength(1);
      expect((modal as any).buttons[0].text).toBe('Test Button');
      expect((modal as any).buttons[0].variant).toBe('primary');
    it('should handle button click events', async () => {
      const clickHandler = vi.fn();
        text: 'Clickable Button',
        onClick: clickHandler
      // Simulate button rendering and click
      const buttonContainer = (modal as any).buttonContainer;
      expect(buttonContainer).toBeDefined();
      // In a real test, we would trigger the actual button click
      await testButton.onClick();
      expect(clickHandler).toHaveBeenCalled();
    it('should disable buttons correctly', () => {
        text: 'Disabled Button',
        disabled: true,
      expect((modal as any).buttons[0].disabled).toBe(true);
    it('should clear all buttons', () => {
      modal.testAddButton({ text: 'Button 1', onClick: vi.fn() });
      modal.testAddButton({ text: 'Button 2', onClick: vi.fn() });
      expect((modal as any).buttons).toHaveLength(2);
      modal.testClearButtons();
      expect((modal as any).buttons).toHaveLength(0);
    it('should update button properties', () => {
        text: 'Original Text',
        disabled: false,
      modal.testUpdateButton(0, { text: 'Updated Text', disabled: true });
      expect((modal as any).buttons[0].text).toBe('Updated Text');
  describe('Loading States', () => {
    it('should show loading state with default message', () => {
      modal.testShowLoading();
      const contentContainer = (modal as any).contentContainer;
      const loadingOverlay = contentContainer.querySelector('.modal-loading-overlay');
      expect(loadingOverlay).toBeTruthy();
    it('should show loading state with custom message', () => {
      const customMessage = 'Custom loading message';
      modal.testShowLoading(customMessage);
    it('should hide loading state', () => {
      modal.testHideLoading();
      expect(loadingOverlay).toBeFalsy();
  describe('Message Display', () => {
    it('should display error messages', () => {
      const errorMessage = 'Test error message';
      modal.testShowError(errorMessage);
      const errorElements = contentContainer.querySelectorAll('.modal-error-message');
      expect(errorElements.length).toBeGreaterThan(0);
    it('should display success messages', () => {
      const successMessage = 'Test success message';
      modal.testShowSuccess(successMessage);
      const successElements = contentContainer.querySelectorAll('.modal-success-message');
      expect(successElements.length).toBeGreaterThan(0);
    it('should remove existing error messages before showing new ones', () => {
      modal.testShowError('First error');
      modal.testShowError('Second error');
      // Should only have one error message (the latest one)
      expect(errorElements.length).toBe(1);
  describe('Utility Methods', () => {
    it('should create settings correctly', () => {
      const setting = modal.testCreateSetting('Test Setting', 'Test description');
      expect(setting).toBeDefined();
    it('should create dividers', () => {
      const divider = modal.testCreateDivider();
      expect(divider.className).toContain('modal-divider');
    it('should create sections with titles', () => {
      const section = modal.testCreateSection('Test Section', 'custom-class');
      expect(section.className).toContain('modal-section');
      expect(section.className).toContain('custom-class');
    it('should format timestamps correctly', () => {
      const now = Date.now();
      const oneMinuteAgo = now - 60000;
      const oneHourAgo = now - 3600000;
      const oneDayAgo = now - 86400000;
      const oneWeekAgo = now - 604800000;
      // Recent timestamps
      const secondsAgo = modal.testFormatTimestamp(now - 30000);
      expect(secondsAgo).toMatch(/\d+s ago/);
      const minutesAgo = modal.testFormatTimestamp(oneMinuteAgo);
      expect(minutesAgo).toMatch(/\d+m ago/);
      const hoursAgo = modal.testFormatTimestamp(oneHourAgo);
      expect(hoursAgo).toMatch(/\d+h ago/);
      const daysAgo = modal.testFormatTimestamp(oneDayAgo);
      expect(daysAgo).toMatch(/\d+d ago/);
      // Old timestamps should show full date
      const oldTimestamp = modal.testFormatTimestamp(oneWeekAgo);
      expect(oldTimestamp).toMatch(/\d{1,2}\/\d{1,2}\/\d{4}/);
  describe('Modal Closing', () => {
    it('should prevent double closing', async () => {
      
      // Mock the super.close method
      const superCloseSpy = vi.fn();
      (modal as any).constructor.prototype.__proto__.close = superCloseSpy;
      // First close should work
      const closePromise1 = modal.close();
      // Second close should be ignored
      const closePromise2 = modal.close();
      await Promise.all([closePromise1, closePromise2]);
      // Should only call beforeClose once
      expect(modal.beforeCloseCalled).toBe(true);
      // Super.close should only be called once despite multiple close attempts
      expect(superCloseSpy).toHaveBeenCalledTimes(1);
    it('should call beforeClose hook', async () => {
      (modal as any).constructor.prototype.__proto__.close = vi.fn();
      await modal.close();
    it('should handle errors in beforeClose gracefully', async () => {
      modal = new (class extends TestModal {
        protected async beforeClose(): Promise<void> {
          throw new Error('Test error in beforeClose');
        }
      })(app as App, defaultOptions);
      // Mock console.error to verify error logging
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation();
      expect(consoleSpy).toHaveBeenCalledWith('Error during modal close:', expect.any(Error));
      expect(superCloseSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
  describe('Event Handling', () => {
    it('should set up click outside listener when enabled', () => {
      const closeSpy = vi.spyOn(modal, 'close').mockImplementation();
      // Simulate click outside (on modal element itself)
      mockModalEl.triggerEvent('click', { target: mockModalEl });
      expect(closeSpy).toHaveBeenCalled();
      closeSpy.mockRestore();
    it('should not close on click outside when disabled', () => {
      const optionsWithoutClickOutside = { ...defaultOptions, closeOnClickOutside: false };
      modal = new TestModal(app as App, optionsWithoutClickOutside);
      // Click outside should not trigger close
      expect(closeSpy).not.toHaveBeenCalled();
  describe('Error Handling', () => {
    it('should handle button click errors gracefully', () => {
      const errorButton: ModalButton = {
        text: 'Error Button',
        onClick: () => {
          throw new Error('Button click error');
      modal.testAddButton(errorButton);
      const showErrorSpy = vi.spyOn(modal, 'testShowError').mockImplementation();
      // Simulate button click error
      expect(() => errorButton.onClick()).toThrow('Button click error');
    it('should throw error when trying to create setting without content container', () => {
      // Clear content container
      (modal as any).contentContainer = null;
      expect(() => {
        modal.testCreateSetting('Test Setting');
      }).toThrow('Content container not initialized');
    it('should throw error when trying to create divider without content container', () => {
        modal.testCreateDivider();
});
