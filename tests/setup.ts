/**
 * Vitest Setup File
 * Global mocks and setup for all tests
 */

import { vi } from 'vitest';
import { JSDOM } from 'jsdom';
import type { Mock, Mocked, MockedFunction } from 'vitest';
// Set up JSDOM for DOM testing (Vitest handles this better with environment: 'jsdom')
// But we keep this for explicit global setup
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
  url: 'http://localhost',
  pretendToBeVisual: true,
  resources: 'usable'
});
global.window = dom.window as any;
global.document = dom.window.document;
global.HTMLElement = dom.window.HTMLElement;
global.Element = dom.window.Element;
// Global mock for Obsidian module
const mockObsidian = {
  Notice: vi.fn(),
  Plugin: class MockPlugin {
    app = { vault: {} };
    async loadData() { return {}; }
    async saveData(data: any) { /* mock save */ }
    registerEvent = vi.fn();
    addCommand = vi.fn();
    addSettingTab = vi.fn();
    addRibbonIcon = vi.fn();
  },
  TFile: class MockTFile {
    path = '';
    stat = { mtime: Date.now(), ctime: Date.now(), size: 0 };
  },
  TFolder: class MockTFolder {},
  Vault: class MockVault {
    getAbstractFileByPath = vi.fn();
    read = vi.fn();
    modify = vi.fn();
    create = vi.fn();
    createFolder = vi.fn();
    delete = vi.fn();
    on = vi.fn();
  },
  requestUrl: vi.fn(),
  Setting: class MockSetting {
    setName = vi.fn().mockReturnThis();
    setDesc = vi.fn().mockReturnThis();
    addText = vi.fn().mockReturnThis();
    addToggle = vi.fn().mockReturnThis();
    addDropdown = vi.fn().mockReturnThis();
    addButton = vi.fn().mockReturnThis();
  },
  SettingTab: class MockSettingTab {
    containerEl = document.createElement('div');
  },
  PluginSettingTab: class MockPluginSettingTab {
    plugin: any;
    app: any;
    constructor(app: any, plugin: any) {
      this.app = app;
      this.plugin = plugin;
    }
    display() {}
    hide() {}
  },
  Modal: class MockModal {
    titleEl = document.createElement('div');
    contentEl = document.createElement('div');
    constructor(app: any) {}
    open() {}
    close() {}
  },
  Component: class MockComponent {
    addChild = vi.fn();
    removeChild = vi.fn();
    load = vi.fn();
    unload = vi.fn();
  },
  EventRef: class MockEventRef {},
  Events: class MockEvents {
    off = vi.fn();
    trigger = vi.fn();
  }
};
// Mock the obsidian module
vi.mock('obsidian', () => mockObsidian);
// Set up global test environment
global.console = {
  ...console,
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  log: vi.fn()
};
// Mock timers for tests that use setTimeout/setInterval
vi.useFakeTimers();
export default mockObsidian;
