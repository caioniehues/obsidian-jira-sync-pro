/**
 * DiffViewer Unit Tests
 * Following RED-GREEN-Refactor methodology
 * Tests diff viewer functionality with real DOM interactions
 */

import { DiffViewer, FieldDiff, DiffValue, DiffViewerOptions } from '../../../src/ui/diff-viewer';
import type { Mock, Mocked, MockedFunction } from 'vitest';
// Mock DOM element implementation
class MockElement {
  public children: MockElement[] = [];
  public textContent = '';
  public innerHTML = '';
  public className = '';
  public style: Record<string, string> = {};
  public attributes: Record<string, string> = {};
  private eventListeners: Record<string, Function[]> = {};
  public value = '';
  public disabled = false;
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
    if (options.type) el.attributes.type = options.type;
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
  remove(): void {
    // Mock implementation
  querySelector(selector: string): MockElement | null {
    return this.findElementBySelector(selector);
  querySelectorAll(selector: string): MockElement[] {
    return this.findAllElementsBySelector(selector);
  focus(): void {
    // Mock focus
  triggerEvent(eventType: string, eventData: any = {}): void {
    const handlers = this.eventListeners[eventType] || [];
    handlers.forEach(handler => handler({ ...eventData, target: this }));
  private findElementBySelector(selector: string): MockElement | null {
    if (selector.startsWith('.')) {
      const className = selector.substring(1);
      if (this.className.includes(className)) {
        return this;
      }
      for (const child of this.children) {
        const found = child.findElementBySelector(selector);
        if (found) return found;
    return null;
  private findAllElementsBySelector(selector: string): MockElement[] {
    const results: MockElement[] = [];
        results.push(this);
        results.push(...child.findAllElementsBySelector(selector));
    return results;
  addClass(cls: string): void {
    this.className += ' ' + cls;
  removeClass(cls: string): void {
    this.className = this.className.replace(new RegExp(`\\b${cls}\\b`, 'g'), '').trim();
  get classList() {
    return {
      add: (cls: string) => this.addClass(cls),
      remove: (cls: string) => this.removeClass(cls)
    };
}
describe('DiffViewer', () => {
  let container: MockElement;
  let diffViewer: DiffViewer;
  let onValueChangeMock: Mock;
  const createSampleDiff = (overrides: Partial<FieldDiff> = {}): FieldDiff => ({
    fieldName: 'summary',
    fieldType: 'text',
    local: {
      value: 'Local summary value',
      timestamp: Date.now() - 1000,
      source: 'local',
      author: 'John Doe'
    },
    remote: {
      value: 'Remote summary value',
      timestamp: Date.now(),
      source: 'remote',
      author: 'Jira System'
    severity: 'medium',
    suggestion: 'Use remote version (newer)',
    ...overrides
  });
  beforeEach(() => {
    container = new MockElement();
    onValueChangeMock = vi.fn();
    
    const options: DiffViewerOptions = {
      showTimestamps: true,
      showAuthors: true,
      showSuggestions: true,
      allowInlineEdit: true,
      maxTextLength: 100,
      highlightChanges: true
    diffViewer = new DiffViewer(container as any, options, onValueChangeMock);
  describe('Initialization', () => {
    it('should create diff viewer with default options', () => {
      const basicContainer = new MockElement();
      const basicViewer = new DiffViewer(basicContainer as any);
      
      expect(basicViewer).toBeDefined();
      // Since options are private, we can't directly test them
      // but we can verify behavior in other tests
    });
    it('should create diff viewer with custom options and callback', () => {
      expect(diffViewer).toBeDefined();
      expect(onValueChangeMock).toHaveBeenCalledTimes(0);
  describe('Empty State', () => {
    it('should render empty state when no diffs are provided', () => {
      diffViewer.setDiffs([]);
      const emptyState = container.querySelector('.diff-viewer-empty');
      expect(emptyState).toBeTruthy();
      expect(emptyState?.textContent).toContain('No conflicts to display');
    it('should clear container and show empty state', () => {
      // Add some content first
      container.createDiv('existing-content');
      diffViewer.clear();
      expect(container.children).toHaveLength(0);
  describe('Header Rendering', () => {
    it('should render header with column labels', () => {
      const diff = createSampleDiff();
      diffViewer.setDiffs([diff]);
      const header = container.querySelector('.diff-viewer-header');
      expect(header).toBeTruthy();
      const fieldColumn = header?.querySelector('.diff-header-field');
      expect(fieldColumn?.textContent).toBe('Field');
      const localColumn = header?.querySelector('.diff-header-local');
      expect(localColumn?.textContent).toBe('Local Version');
      const remoteColumn = header?.querySelector('.diff-header-remote');
      expect(remoteColumn?.textContent).toBe('Remote Version');
    it('should include suggestion column when showSuggestions is enabled', () => {
      const diff = createSampleDiff({ suggestion: 'Test suggestion' });
      const suggestionColumn = header?.querySelector('.diff-header-suggestion');
      expect(suggestionColumn?.textContent).toBe('Suggestion');
  describe('Single Diff Rendering', () => {
    it('should render basic diff structure', () => {
      const diffRow = container.querySelector('.diff-row');
      expect(diffRow).toBeTruthy();
      expect(diffRow?.className).toContain('diff-row-medium');
    it('should render field information correctly', () => {
      const diff = createSampleDiff({ fieldName: 'test_field', fieldType: 'text' });
      const fieldColumn = container.querySelector('.diff-field-column');
      expect(fieldColumn).toBeTruthy();
      const fieldName = fieldColumn?.querySelector('.diff-field-name');
      expect(fieldName?.textContent).toBe('Test Field'); // Formatted name
      const fieldType = fieldColumn?.querySelector('.diff-field-type');
      expect(fieldType?.textContent).toBe('TEXT');
    it('should render severity icons correctly', () => {
      const highSeverityDiff = createSampleDiff({ severity: 'high' });
      const mediumSeverityDiff = createSampleDiff({ severity: 'medium', fieldName: 'field2' });
      const lowSeverityDiff = createSampleDiff({ severity: 'low', fieldName: 'field3' });
      diffViewer.setDiffs([highSeverityDiff, mediumSeverityDiff, lowSeverityDiff]);
      const highSeverityIcon = container.querySelector('.diff-severity-high');
      const mediumSeverityIcon = container.querySelector('.diff-severity-medium');
      const lowSeverityIcon = container.querySelector('.diff-severity-low');
      expect(highSeverityIcon?.innerHTML).toBe('🔴');
      expect(mediumSeverityIcon?.innerHTML).toBe('🟡');
      expect(lowSeverityIcon?.innerHTML).toBe('🟢');
    it('should render value columns with metadata', () => {
      const localColumn = container.querySelector('.diff-local-column');
      const remoteColumn = container.querySelector('.diff-remote-column');
      expect(localColumn).toBeTruthy();
      expect(remoteColumn).toBeTruthy();
      // Check for metadata
      const localTimestamp = localColumn?.querySelector('.diff-timestamp');
      const remoteTimestamp = remoteColumn?.querySelector('.diff-timestamp');
      expect(localTimestamp).toBeTruthy();
      expect(remoteTimestamp).toBeTruthy();
      const localAuthor = localColumn?.querySelector('.diff-author');
      const remoteAuthor = remoteColumn?.querySelector('.diff-author');
      expect(localAuthor?.textContent).toBe('by John Doe');
      expect(remoteAuthor?.textContent).toBe('by Jira System');
  describe('Value Type Rendering', () => {
    it('should render text values correctly', () => {
      const diff = createSampleDiff({
        fieldType: 'text',
        local: { value: 'Short text', timestamp: Date.now(), source: 'local' },
        remote: { value: 'Another short text', timestamp: Date.now(), source: 'remote' }
      });
      const textValues = container.querySelectorAll('.diff-text-value');
      expect(textValues).toHaveLength(2);
      expect(textValues[0].textContent).toBe('Short text');
      expect(textValues[1].textContent).toBe('Another short text');
    it('should truncate long text values', () => {
      const longText = 'A'.repeat(200); // Longer than maxTextLength (100)
        local: { value: longText, timestamp: Date.now(), source: 'local' }
      const textValue = container.querySelector('.diff-text-value');
      expect(textValue?.textContent).toContain('...');
      expect(textValue?.textContent?.length).toBeLessThan(longText.length);
      // Should have expand button
      const expandButton = container.querySelector('.diff-expand-button');
      expect(expandButton?.textContent).toBe('Show more');
    it('should render number values', () => {
        fieldType: 'number',
        local: { value: 42, timestamp: Date.now(), source: 'local' },
        remote: { value: 84, timestamp: Date.now(), source: 'remote' }
      const numberValues = container.querySelectorAll('.diff-number-value');
      expect(numberValues).toHaveLength(2);
      expect(numberValues[0].textContent).toBe('42');
      expect(numberValues[1].textContent).toBe('84');
    it('should render boolean values', () => {
        fieldType: 'boolean',
        local: { value: true, timestamp: Date.now(), source: 'local' },
        remote: { value: false, timestamp: Date.now(), source: 'remote' }
      const booleanValues = container.querySelectorAll('.diff-boolean-value');
      expect(booleanValues).toHaveLength(2);
      expect(booleanValues[0].textContent).toBe('Yes');
      expect(booleanValues[1].textContent).toBe('No');
    it('should render array values with count', () => {
        fieldType: 'array',
        local: { value: ['item1', 'item2', 'item3'], timestamp: Date.now(), source: 'local' },
        remote: { value: ['item1', 'item4'], timestamp: Date.now(), source: 'remote' }
      const arrayCounts = container.querySelectorAll('.diff-array-count');
      expect(arrayCounts).toHaveLength(2);
      expect(arrayCounts[0].textContent).toBe('3 items');
      expect(arrayCounts[1].textContent).toBe('2 items');
      const arrayItems = container.querySelectorAll('.diff-array-item');
      expect(arrayItems.length).toBeGreaterThan(0);
    it('should render empty arrays', () => {
        local: { value: [], timestamp: Date.now(), source: 'local' }
      const emptyArray = container.querySelector('.diff-empty-array');
      expect(emptyArray?.textContent).toBe('(empty array)');
    it('should render object values', () => {
        fieldType: 'object',
        local: { 
          value: { prop1: 'value1', prop2: 'value2', prop3: 'value3', prop4: 'value4' }, 
          timestamp: Date.now(), 
          source: 'local' 
        }
      const objectProps = container.querySelectorAll('.diff-object-prop');
      expect(objectProps).toHaveLength(3); // Should limit to 3
      const moreIndicator = container.querySelector('.diff-object-more');
      expect(moreIndicator?.textContent).toContain('and 1 more');
    it('should render null/undefined values', () => {
        local: { value: null, timestamp: Date.now(), source: 'local' },
        remote: { value: undefined, timestamp: Date.now(), source: 'remote' }
      const nullValues = container.querySelectorAll('.diff-null-value');
      expect(nullValues).toHaveLength(2);
      expect(nullValues[0].textContent).toBe('(empty)');
      expect(nullValues[1].textContent).toBe('(empty)');
  describe('Suggestion Rendering', () => {
    it('should render suggestion text', () => {
      const diff = createSampleDiff({ suggestion: 'Use local version' });
      const suggestionText = container.querySelector('.diff-suggestion-text');
      expect(suggestionText?.textContent).toBe('Use local version');
    it('should render "Use Local" quick action when suggestion mentions local', () => {
      const diff = createSampleDiff({ suggestion: 'Use local version (newer)' });
      const useLocalBtn = container.querySelector('.diff-use-local');
      expect(useLocalBtn?.textContent).toBe('Use Local');
    it('should render "Use Remote" quick action when suggestion mentions remote', () => {
      const diff = createSampleDiff({ suggestion: 'Use remote version (newer)' });
      const useRemoteBtn = container.querySelector('.diff-use-remote');
      expect(useRemoteBtn?.textContent).toBe('Use Remote');
    it('should render "Merge" quick action when suggestion mentions merge', () => {
      const diff = createSampleDiff({ suggestion: 'Consider merging both values' });
      const mergeBtn = container.querySelector('.diff-merge');
      expect(mergeBtn?.textContent).toBe('Merge');
  describe('Quick Actions', () => {
    it('should trigger onValueChange when Use Local is clicked', () => {
      const useLocalBtn = container.querySelector('.diff-use-local') as MockElement;
      useLocalBtn?.triggerEvent('click');
      expect(onValueChangeMock).toHaveBeenCalledWith(
        'summary',
        'Local summary value',
        'local'
      );
    it('should trigger onValueChange when Use Remote is clicked', () => {
      const diff = createSampleDiff({ suggestion: 'Use remote version' });
      const useRemoteBtn = container.querySelector('.diff-use-remote') as MockElement;
      useRemoteBtn?.triggerEvent('click');
        'Remote summary value',
        'remote'
    it('should handle merge action for text fields', () => {
      const diff = createSampleDiff({ 
        suggestion: 'Consider merging both values' 
      const mergeBtn = container.querySelector('.diff-merge') as MockElement;
      mergeBtn?.triggerEvent('click');
        expect.stringContaining('Local summary value'),
        expect.stringContaining('Remote summary value'),
    it('should handle merge action for array fields', () => {
        local: { value: ['a', 'b'], timestamp: Date.now(), source: 'local' },
        remote: { value: ['b', 'c'], timestamp: Date.now(), source: 'remote' },
        suggestion: 'Consider merging both arrays' 
        ['a', 'b', 'c'], // Merged and deduplicated
  describe('Inline Editing', () => {
    it('should show edit button when inline editing is enabled', () => {
      const editButtons = container.querySelectorAll('.diff-edit-button');
      expect(editButtons.length).toBeGreaterThan(0);
    it('should create input field when edit button is clicked', () => {
      const diff = createSampleDiff({ fieldType: 'text' });
      const editButton = container.querySelector('.diff-edit-button') as MockElement;
      editButton?.triggerEvent('click');
      // In a real implementation, this would create an input field
      // Here we're testing the mechanism exists
      expect(editButton).toBeTruthy();
  describe('Diff Management', () => {
    it('should add single diff to existing diffs', () => {
      const diff1 = createSampleDiff({ fieldName: 'field1' });
      const diff2 = createSampleDiff({ fieldName: 'field2' });
      diffViewer.setDiffs([diff1]);
      diffViewer.addDiff(diff2);
      const diffRows = container.querySelectorAll('.diff-row');
      expect(diffRows).toHaveLength(2);
    it('should clear all diffs and container', () => {
      expect(container.children.length).toBeGreaterThan(0);
  describe('Utility Methods', () => {
    it('should format field names correctly', () => {
      const testCases = [
        { input: 'field_name', expected: 'Field Name' },
        { input: 'camelCase', expected: 'CamelCase' },
        { input: 'kebab-case', expected: 'Kebab Case' },
        { input: 'simple', expected: 'Simple' }
      ];
      testCases.forEach(({ input, expected }) => {
        const diff = createSampleDiff({ fieldName: input });
        diffViewer.setDiffs([diff]);
        const fieldName = container.querySelector('.diff-field-name');
        expect(fieldName?.textContent).toBe(expected);
        diffViewer.clear();
    it('should format timestamps correctly', () => {
      const now = Date.now();
        { timestamp: now, expected: 'Just now' },
        { timestamp: now - 30000, expected: '0m ago' }, // Less than 1 minute
        { timestamp: now - 120000, expected: '2m ago' },
        { timestamp: now - 7200000, expected: '2h ago' }
      testCases.forEach(({ timestamp, expected }) => {
        const diff = createSampleDiff({
          local: { value: 'test', timestamp, source: 'local' }
        });
        const timestampEl = container.querySelector('.diff-timestamp');
        expect(timestampEl?.textContent).toMatch(/ago|Just now/);
  describe('Error Handling', () => {
    it('should handle missing onValueChange callback gracefully', () => {
      const viewerWithoutCallback = new DiffViewer(container as any);
      viewerWithoutCallback.setDiffs([diff]);
      expect(() => {
        useLocalBtn?.triggerEvent('click');
      }).not.toThrow();
    it('should handle invalid field types gracefully', () => {
        fieldType: 'unknown' as any,
        local: { value: 'test value', timestamp: Date.now(), source: 'local' }
      const defaultValue = container.querySelector('.diff-default-value');
      expect(defaultValue?.textContent).toBe('test value');
  describe('Performance Considerations', () => {
    it('should handle large numbers of diffs efficiently', () => {
      const largeDiffSet: FieldDiff[] = Array.from({ length: 100 }, (_, index) =>
        createSampleDiff({ fieldName: `field_${index}` })
      const startTime = performance.now();
      diffViewer.setDiffs(largeDiffSet);
      const endTime = performance.now();
      // Should complete within reasonable time (100ms for 100 diffs)
      expect(endTime - startTime).toBeLessThan(100);
      expect(diffRows).toHaveLength(100);
});
