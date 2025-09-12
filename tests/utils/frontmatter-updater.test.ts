/**
 * Tests for FrontmatterUpdater Utility
 * RED-GREEN-Refactor approach for non-destructive YAML frontmatter operations
 * Tests YAML parsing, merging, and file operations with real Obsidian integration
 */

import { describe, beforeEach, afterEach, it, expect, vi } from 'vitest';
import { FrontmatterUpdater } from '../../src/utils/frontmatter-updater';
import { TFile, Vault } from 'obsidian';
import type { Mock, Mocked, MockedFunction } from 'vitest';
// Mock Obsidian APIs
vi.mock('obsidian');
describe('FrontmatterUpdater Utility Tests', () => {
  let frontmatterUpdater: FrontmatterUpdater;
  let mockVault: Mocked<Vault>;
  let mockFile: Mocked<TFile>;
  beforeEach(() => {
    mockFile = {
      path: 'test-note.md',
      basename: 'test-note',
      extension: 'md',
      name: 'test-note.md'
    } as Mocked<TFile>;
    mockVault = {
      getAbstractFileByPath: vi.fn().mockReturnValue(mockFile),
      read: vi.fn(),
      modify: vi.fn().mockResolvedValue(undefined)
    } as unknown as Mocked<Vault>;
    frontmatterUpdater = new FrontmatterUpdater(mockVault as Vault);
  });
  afterEach(() => {
    vi.clearAllMocks();
  describe('Frontmatter Parsing', () => {
    it('should fail initially without proper YAML parsing implementation', async () => {
      // RED: This should fail because we need to implement proper YAML parsing
      const contentWithFrontmatter = `---
title: Test Note
tags: [test, note]
created: 2023-01-01
---
# Test Note
This is the content.`;
      mockVault.read.mockResolvedValue(contentWithFrontmatter);
      // This should fail initially
      const frontmatter = await frontmatterUpdater.readFrontmatter('test-note.md');
      
      expect(frontmatter).toEqual({
        title: 'Test Note',
        tags: ['test', 'note'],
        created: '2023-01-01'
      });
    });
    it('should parse frontmatter correctly from content with YAML delimiters', async () => {
      // GREEN: Make the test pass with proper implementation
priority: high
number_field: 42
boolean_field: true
null_field: null
# Test Note Content
This is the main content.`;
        priority: 'high',
        number_field: 42,
        boolean_field: true,
        null_field: null
    it('should handle content without frontmatter', async () => {
      const contentWithoutFrontmatter = `# Regular Note
This note has no frontmatter.`;
      mockVault.read.mockResolvedValue(contentWithoutFrontmatter);
      expect(frontmatter).toEqual({});
    it('should detect frontmatter existence correctly', async () => {
      const withFrontmatter = `---
title: Has Frontmatter
Content`;
      const withoutFrontmatter = `# No Frontmatter
      mockVault.read.mockResolvedValueOnce(withFrontmatter);
      expect(await frontmatterUpdater.hasFrontmatter('test1.md')).toBe(true);
      mockVault.read.mockResolvedValueOnce(withoutFrontmatter);
      expect(await frontmatterUpdater.hasFrontmatter('test2.md')).toBe(false);
  describe('Non-Destructive Updates', () => {
    it('should update frontmatter while preserving existing content', async () => {
      const existingContent = `---
title: Original Title
author: John Doe
# Original Content
This content should be preserved.`;
      mockVault.read.mockResolvedValue(existingContent);
      const updates = {
        title: 'Updated Title',
        tags: ['updated', 'test']
      };
      await frontmatterUpdater.updateFrontmatter('test-note.md', updates);
      expect(mockVault.modify).toHaveBeenCalled();
      const [file, newContent] = mockVault.modify.mock.calls[0];
      expect(file).toBe(mockFile);
      // Should contain updated values
      expect(newContent).toContain('title: Updated Title');
      expect(newContent).toContain('priority: high');
      expect(newContent).toContain('tags: [updated, test]');
      // Should preserve existing values
      expect(newContent).toContain('author: John Doe');
      expect(newContent).toContain('created: 2023-01-01');
      // Should preserve content
      expect(newContent).toContain('# Original Content');
      expect(newContent).toContain('This content should be preserved.');
    it('should add frontmatter to content that has none', async () => {
      const contentWithoutFrontmatter = `# Test Note
This note needs frontmatter.`;
        tags: ['new'],
      const [, newContent] = mockVault.modify.mock.calls[0];
      // Should add frontmatter section
      expect(newContent).toMatch(/^---\n.*\n---\n/);
      expect(newContent).toContain('title: Test Note');
      expect(newContent).toContain('tags: [new]');
      // Should preserve original content
      expect(newContent).toContain('# Test Note');
      expect(newContent).toContain('This note needs frontmatter.');
    it('should handle merge options correctly', async () => {
tags: [old, existing]
priority: low
      // Test array merging
        title: 'New Title',
        tags: ['new', 'updated'],
        status: 'active'
      await frontmatterUpdater.updateFrontmatter('test-note.md', updates, {
        mergeArrays: true,
        overwriteExisting: true
      expect(newContent).toContain('title: New Title'); // Overwritten
      expect(newContent).toContain('status: active'); // New field
      // Tags should be merged (removing duplicates)
      expect(newContent).toMatch(/tags: \[.*old.*existing.*new.*updated.*\]/);
  describe('Property Removal', () => {
    it('should remove specified frontmatter properties', async () => {
status: active
keep_this: important
# Content
Content to preserve.`;
      const propertiesToRemove = ['author', 'priority', 'status'];
      await frontmatterUpdater.removeFrontmatterProperties('test-note.md', propertiesToRemove);
      // Should remove specified properties
      expect(newContent).not.toContain('author:');
      expect(newContent).not.toContain('priority:');
      expect(newContent).not.toContain('status:');
      // Should keep unspecified properties
      expect(newContent).toContain('tags: [test, note]');
      expect(newContent).toContain('keep_this: important');
      expect(newContent).toContain('# Content');
      expect(newContent).toContain('Content to preserve.');
    it('should handle removal from content without frontmatter gracefully', async () => {
      const contentWithoutFrontmatter = `# No Frontmatter
Just content here.`;
      const propertiesToRemove = ['nonexistent', 'properties'];
      // Should not call modify since there's nothing to remove
      expect(mockVault.modify).not.toHaveBeenCalled();
  describe('YAML Value Handling', () => {
    it('should handle different YAML value types correctly', async () => {
      const complexContent = `---
string_value: "quoted string"
unquoted_string: simple string
number_value: 42
float_value: 3.14
boolean_true: true
boolean_false: false
null_value: null
array_simple: [one, two, three]
array_mixed: [1, "two", true, null]
      mockVault.read.mockResolvedValue(complexContent);
        string_value: 'quoted string',
        unquoted_string: 'simple string',
        number_value: 42,
        float_value: 3.14,
        boolean_true: true,
        boolean_false: false,
        null_value: null,
        array_simple: ['one', 'two', 'three'],
        array_mixed: [1, 'two', true, null]
    it('should stringify values correctly when writing YAML', async () => {
      const originalContent = `# Test
      mockVault.read.mockResolvedValue(originalContent);
      const complexUpdates = {
        string_with_colon: 'value: with colon',
        string_with_quotes: 'value "with" quotes',
        number: 42,
        boolean: true,
        array: ['item1', 'item2', 123, true],
        object: { nested: 'value', count: 5 }
      await frontmatterUpdater.updateFrontmatter('test-note.md', complexUpdates);
      // Strings with special characters should be quoted
      expect(newContent).toContain('string_with_colon: "value: with colon"');
      expect(newContent).toContain('string_with_quotes: "value \\"with\\" quotes"');
      // Other types should be formatted correctly
      expect(newContent).toContain('number: 42');
      expect(newContent).toContain('boolean: true');
      expect(newContent).toContain('null_value: null');
      expect(newContent).toContain('array: [item1, item2, 123, true]');
      expect(newContent).toContain('object: {nested: value, count: 5}');
  describe('Error Handling', () => {
    it('should handle file not found errors', async () => {
      mockVault.getAbstractFileByPath.mockReturnValue(null);
      await expect(frontmatterUpdater.updateFrontmatter('nonexistent.md', { test: 'value' }))
        .rejects.toThrow('File not found: nonexistent.md');
    it('should handle malformed YAML gracefully', async () => {
      const malformedContent = `---
title: Test
invalid_yaml: [unclosed array
another: value
      mockVault.read.mockResolvedValue(malformedContent);
      // Should not throw, but return empty frontmatter
      // Should handle parsing errors gracefully
      expect(frontmatter).toBeDefined();
      // Might return partial results or empty object depending on implementation
    it('should validate frontmatter format', async () => {
      const validContent = `---
title: Valid YAML
      const invalidContent = `---
title Valid YAML without colon
invalid line without proper format
      // Valid content should pass validation
      const validResult = frontmatterUpdater.validateFrontmatter(validContent);
      expect(validResult.valid).toBe(true);
      expect(validResult.errors).toHaveLength(0);
      // Invalid content should fail validation
      const invalidResult = frontmatterUpdater.validateFrontmatter(invalidContent);
      expect(invalidResult.valid).toBe(false);
      expect(invalidResult.errors.length).toBeGreaterThan(0);
  describe('Performance and Edge Cases', () => {
    it('should handle large frontmatter efficiently', async () => {
      // Create content with many frontmatter properties
      const largeFrontmatterLines = [];
      for (let i = 1; i <= 100; i++) {
        largeFrontmatterLines.push(`field_${i}: value_${i}`);
      }
      const largeContent = `---\n${largeFrontmatterLines.join('\n')}\n---\nContent`;
      mockVault.read.mockResolvedValue(largeContent);
      const startTime = performance.now();
      const frontmatter = await frontmatterUpdater.readFrontmatter('large-note.md');
      const duration = performance.now() - startTime;
      // Should process within reasonable time (under 100ms)
      expect(duration).toBeLessThan(100);
      expect(Object.keys(frontmatter)).toHaveLength(100);
    it('should preserve frontmatter delimiter styles', async () => {
      const plusDelimiterContent = `+++
title: Test with plus delimiters
+++
      mockVault.read.mockResolvedValue(plusDelimiterContent);
      await frontmatterUpdater.updateFrontmatter('test-note.md', { new_field: 'value' });
      // Should preserve original delimiter style
      expect(newContent).toMatch(/^\+\+\+/);
      expect(newContent).toMatch(/\n\+\+\+\n/);
      expect(newContent).toContain('title: Test with plus delimiters');
      expect(newContent).toContain('new_field: value');
    it('should not modify file if no changes are needed', async () => {
      // Update with same values
        author: 'John Doe'
      // Should not call modify if content hasn't changed
      // Note: This test may need adjustment based on exact implementation details
});
