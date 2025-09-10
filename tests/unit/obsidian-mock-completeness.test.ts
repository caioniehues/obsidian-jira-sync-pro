/**
 * Test to verify Obsidian API mock completeness for T007
 * This test ensures all DOM methods needed for dashboard components are properly mocked
 * 
 * COMPLETED: Task T007 - Complete Obsidian API mock in tests/__mocks__/obsidian.ts
 * - Added comprehensive DOM method mocks (addClass, removeClass, createDiv, createEl, etc.)
 * - Fixed dashboard test that was failing due to incomplete manual mocks
 * - All sync status dashboard tests now pass with proper Obsidian API mocking
 */

import { MockHTMLElement } from '../__mocks__/obsidian';

describe('Obsidian Mock Completeness', () => {
  let mockElement: MockHTMLElement;

  beforeEach(() => {
    mockElement = new MockHTMLElement('div');
  });

  describe('Essential DOM Methods', () => {
    it('should have addClass method', () => {
      expect(typeof mockElement.addClass).toBe('function');
      mockElement.addClass('test-class');
      expect(mockElement.hasClass('test-class')).toBe(true);
    });

    it('should have removeClass method', () => {
      mockElement.addClass('test-class');
      expect(mockElement.hasClass('test-class')).toBe(true);
      
      mockElement.removeClass('test-class');
      expect(mockElement.hasClass('test-class')).toBe(false);
    });

    it('should have createDiv method', () => {
      expect(typeof mockElement.createDiv).toBe('function');
      const childDiv = mockElement.createDiv();
      expect(childDiv).toBeInstanceOf(MockHTMLElement);
      expect(childDiv.tagName).toBe('DIV');
    });

    it('should have createEl method', () => {
      expect(typeof mockElement.createEl).toBe('function');
      const span = mockElement.createEl('span');
      expect(span).toBeInstanceOf(MockHTMLElement);
      expect(span.tagName).toBe('SPAN');
    });

    it('should have empty method', () => {
      mockElement.createDiv();
      mockElement.createDiv();
      expect(mockElement.children.length).toBe(2);
      
      mockElement.empty();
      expect(mockElement.children.length).toBe(0);
      expect(mockElement.innerHTML).toBe('');
      expect(mockElement.textContent).toBe('');
    });
  });

  describe('Nested Element Creation', () => {
    it('should return elements with Obsidian methods when created via createDiv', () => {
      const childDiv = mockElement.createDiv();
      
      // Child should also have all Obsidian methods
      expect(typeof childDiv.createDiv).toBe('function');
      expect(typeof childDiv.createEl).toBe('function');
      expect(typeof childDiv.addClass).toBe('function');
      expect(typeof childDiv.removeClass).toBe('function');
      expect(typeof childDiv.empty).toBe('function');
    });

    it('should return elements with Obsidian methods when created via createEl', () => {
      const span = mockElement.createEl('span');
      
      // Child should also have all Obsidian methods
      expect(typeof span.createDiv).toBe('function');
      expect(typeof span.createEl).toBe('function');
      expect(typeof span.addClass).toBe('function');
      expect(typeof span.removeClass).toBe('function');
      expect(typeof span.empty).toBe('function');
    });

    it('should support deeply nested element creation', () => {
      const level1 = mockElement.createDiv();
      const level2 = level1.createDiv();
      const level3 = level2.createEl('span');
      
      // All levels should have Obsidian methods
      expect(typeof level1.createDiv).toBe('function');
      expect(typeof level2.createDiv).toBe('function');
      expect(typeof level3.createDiv).toBe('function');
      
      // Test actual functionality
      level3.addClass('deeply-nested');
      expect(level3.hasClass('deeply-nested')).toBe(true);
    });
  });

  describe('Dashboard-specific Methods', () => {
    it('should support createDiv with attributes and callback', () => {
      const callback = jest.fn();
      const div = mockElement.createDiv({ cls: 'stat-card' }, callback);
      
      expect(div.hasClass('stat-card')).toBe(true);
      expect(callback).toHaveBeenCalledWith(div);
    });

    it('should support createEl with text attribute', () => {
      const span = mockElement.createEl('span', { text: 'Hello World', cls: 'greeting' });
      
      expect(span.textContent).toBe('Hello World');
      expect(span.hasClass('greeting')).toBe(true);
    });

    it('should support chained element creation for dashboard patterns', () => {
      // Simulate dashboard card creation pattern
      const statsGrid = mockElement.createDiv({ cls: 'stats-grid' });
      const card = statsGrid.createDiv({ cls: 'stat-card' });
      const emoji = card.createEl('div', { text: '🔄', cls: 'stat-emoji' });
      const label = card.createEl('div', { text: 'Total Syncs', cls: 'stat-label' });
      const value = card.createEl('div', { text: '42', cls: 'stat-value' });
      
      // Verify structure
      expect(statsGrid.hasClass('stats-grid')).toBe(true);
      expect(card.hasClass('stat-card')).toBe(true);
      expect(emoji.textContent).toBe('🔄');
      expect(label.textContent).toBe('Total Syncs');
      expect(value.textContent).toBe('42');
    });
  });

  describe('Event Handling', () => {
    it('should have addEventListener method', () => {
      expect(typeof mockElement.addEventListener).toBe('function');
      const callback = jest.fn();
      mockElement.addEventListener('click', callback);
      // Mock implementation doesn't track listeners, but method should exist
    });

    it('should have removeEventListener method', () => {
      expect(typeof mockElement.removeEventListener).toBe('function');
      const callback = jest.fn();
      mockElement.removeEventListener('click', callback);
    });

    it('should have click method', () => {
      expect(typeof mockElement.click).toBe('function');
      mockElement.click(); // Should not throw
    });
  });

  describe('Attribute Management', () => {
    it('should support setAttribute and getAttribute', () => {
      mockElement.setAttribute('data-test', 'value');
      expect(mockElement.getAttribute('data-test')).toBe('value');
    });

    it('should support data attributes via dataset', () => {
      mockElement.setAttribute('data-id', '123');
      expect(mockElement.dataset['id']).toBe('123');
    });

    it('should support removeAttribute', () => {
      mockElement.setAttribute('test-attr', 'value');
      expect(mockElement.getAttribute('test-attr')).toBe('value');
      
      mockElement.removeAttribute('test-attr');
      expect(mockElement.getAttribute('test-attr')).toBeNull();
    });
  });

  describe('Style Management', () => {
    it('should have style property', () => {
      expect(mockElement.style).toBeDefined();
      mockElement.style.display = 'none';
      expect(mockElement.style.display).toBe('none');
    });

    it('should support show and hide methods', () => {
      mockElement.hide();
      expect(mockElement.style.display).toBe('none');
      
      mockElement.show();
      expect(mockElement.style.display).toBe('');
    });
  });
});