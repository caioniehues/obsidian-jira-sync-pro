/**
 * Comprehensive Obsidian API Mocks for Testing
 * Provides complete mocks for all Obsidian APIs and DOM methods
 */

// DOM Element Mocks
export class MockHTMLElement {
  tagName: string;
  className: string = '';
  textContent: string = '';
  innerHTML: string = '';
  style: Record<string, string> = {};
  children: MockHTMLElement[] = [];
  parentElement: MockHTMLElement | null = null;
  attributes: Record<string, string> = {};
  dataset: Record<string, string> = {};
  
  constructor(tagName: string = 'div') {
    this.tagName = tagName.toUpperCase();
  }

  createEl<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    attrs?: Record<string, string>,
    callback?: (el: MockHTMLElement) => void
  ): MockHTMLElement {
    const element = new MockHTMLElement(tag);
    if (attrs) {
      Object.entries(attrs).forEach(([key, value]) => {
        if (key === 'text') {
          element.textContent = value;
        } else if (key === 'cls') {
          element.className = value;
        } else {
          element.setAttribute(key, value);
        }
      });
    }
    this.appendChild(element);
    if (callback) callback(element);
    return element;
  }

  createDiv(attrs?: Record<string, string> | string, callback?: (el: MockHTMLElement) => void): MockHTMLElement {
    // Handle case where first parameter is a class name string (Obsidian API style)
    const normalizedAttrs = typeof attrs === 'string' ? { cls: attrs } : attrs;
    return this.createEl('div', normalizedAttrs, callback);
  }

  createSpan(attrs?: Record<string, string> | string, callback?: (el: MockHTMLElement) => void): MockHTMLElement {
    // Handle case where first parameter is a class name string (Obsidian API style)
    const normalizedAttrs = typeof attrs === 'string' ? { cls: attrs } : attrs;
    return this.createEl('span', normalizedAttrs, callback);
  }

  appendChild(element: MockHTMLElement): MockHTMLElement {
    element.parentElement = this;
    this.children.push(element);
    return element;
  }

  removeChild(element: MockHTMLElement): MockHTMLElement {
    const index = this.children.indexOf(element);
    if (index > -1) {
      this.children.splice(index, 1);
      element.parentElement = null;
    }
    return element;
  }

  addClass(className: string): void {
    const classes = this.className.split(' ').filter(c => c);
    if (!classes.includes(className)) {
      classes.push(className);
      this.className = classes.join(' ');
    }
  }

  removeClass(className: string): void {
    const classes = this.className.split(' ').filter(c => c && c !== className);
    this.className = classes.join(' ');
  }

  hasClass(className: string): boolean {
    return this.className.split(' ').includes(className);
  }

  toggleClass(className: string, force?: boolean): boolean {
    const hasClass = this.hasClass(className);
    const shouldAdd = force !== undefined ? force : !hasClass;
    
    if (shouldAdd && !hasClass) {
      this.addClass(className);
      return true;
    } else if (!shouldAdd && hasClass) {
      this.removeClass(className);
      return false;
    }
    return hasClass;
  }

  setAttribute(name: string, value: string): void {
    this.attributes[name] = value;
    if (name.startsWith('data-')) {
      this.dataset[name.substring(5)] = value;
    }
  }

  getAttribute(name: string): string | null {
    return this.attributes[name] || null;
  }

  removeAttribute(name: string): void {
    delete this.attributes[name];
    if (name.startsWith('data-')) {
      delete this.dataset[name.substring(5)];
    }
  }

  addEventListener(event: string, callback: Function): void {
    // Mock implementation - could be enhanced to track listeners
  }

  removeEventListener(event: string, callback: Function): void {
    // Mock implementation
  }

  click(): void {
    // Mock click event
  }

  focus(): void {
    // Mock focus
  }

  blur(): void {
    // Mock blur
  }

  querySelector(selector: string): MockHTMLElement | null {
    // Simple mock - could be enhanced with actual CSS selector parsing
    return this.children[0] || null;
  }

  querySelectorAll(selector: string): MockHTMLElement[] {
    // Simple mock
    return this.children;
  }

  empty(): void {
    this.children = [];
    this.innerHTML = '';
    this.textContent = '';
  }

  getElementById(id: string): MockHTMLElement | null {
    // Simple mock
    return this.children.find(child => child.getAttribute('id') === id) || null;
  }

  getElementsByClassName(className: string): MockHTMLElement[] {
    return this.children.filter(child => child.hasClass(className));
  }

  empty(): void {
    this.children = [];
    this.innerHTML = '';
    this.textContent = '';
  }

  show(): void {
    this.style.display = '';
  }

  hide(): void {
    this.style.display = 'none';
  }
}

// Event Reference Mock
export interface EventRef {
  e: any;
  f: Function;
}

// File System Mocks
export abstract class TAbstractFile {
  path: string;
  name: string;
  parent: TFolder | null;

  constructor(path: string) {
    this.path = path;
    this.name = path.split('/').pop() || '';
    this.parent = null;
  }
}

export class TFile extends TAbstractFile {
  extension: string;
  stat: { ctime: number; mtime: number; size: number };

  constructor(path: string) {
    super(path);
    this.extension = path.split('.').pop() || '';
    this.stat = {
      ctime: Date.now(),
      mtime: Date.now(),
      size: 0
    };
  }
}

export class TFolder extends TAbstractFile {
  children: TAbstractFile[] = [];

  constructor(path: string) {
    super(path);
  }
}

// Vault Mock
export class Vault {
  private files: Map<string, TFile> = new Map();
  private folders: Map<string, TFolder> = new Map();

  async read(file: TFile): Promise<string> {
    return `Mock content for ${file.path}`;
  }

  async modify(file: TFile, data: string): Promise<void> {
    // Mock implementation
  }

  async create(path: string, data: string): Promise<TFile> {
    const file = new TFile(path);
    this.files.set(path, file);
    return file;
  }

  async createFolder(path: string): Promise<TFolder> {
    const folder = new TFolder(path);
    this.folders.set(path, folder);
    return folder;
  }

  async delete(file: TAbstractFile): Promise<void> {
    this.files.delete(file.path);
    this.folders.delete(file.path);
  }

  getAbstractFileByPath(path: string): TAbstractFile | null {
    return this.files.get(path) || this.folders.get(path) || null;
  }

  getFiles(): TFile[] {
    return Array.from(this.files.values());
  }

  getMarkdownFiles(): TFile[] {
    return Array.from(this.files.values()).filter(f => f.extension === 'md');
  }

  getFolders(): TFolder[] {
    return Array.from(this.folders.values());
  }

  getFolderByPath(path: string): TFolder | null {
    return this.folders.get(path) || null;
  }

  getAllLoadedFiles(): TAbstractFile[] {
    return [...this.getFiles(), ...this.getFolders()];
  }

  adapter = {
    exists: jest.fn().mockResolvedValue(true),
    read: jest.fn().mockResolvedValue('mock content'),
    write: jest.fn().mockResolvedValue(undefined),
    mkdir: jest.fn().mockResolvedValue(undefined),
    list: jest.fn().mockResolvedValue({ files: [], folders: [] })
  };
}

// Workspace Mock
export class WorkspaceLeaf {
  view: any = null;
  
  getViewState() {
    return { type: 'empty' };
  }

  setViewState(viewState: any) {
    return Promise.resolve();
  }

  detach() {
    return Promise.resolve();
  }
}

export class Workspace {
  leftSplit: any = null;
  rightSplit: any = null;
  rootSplit: any = null;
  private eventHandlers: Map<string, Function[]> = new Map();
  
  getLeavesOfType(type: string): WorkspaceLeaf[] {
    return [];
  }

  getRightLeaf(split: boolean = false): WorkspaceLeaf | null {
    return new WorkspaceLeaf();
  }

  getLeftLeaf(split: boolean = false): WorkspaceLeaf | null {
    return new WorkspaceLeaf();
  }

  revealLeaf(leaf: WorkspaceLeaf): void {
    // Mock reveal implementation
  }

  getActiveFile(): TFile | null {
    return null;
  }

  openLinkText(linkText: string, sourcePath: string) {
    return Promise.resolve();
  }

  on(event: string, callback: Function): EventRef {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }
    this.eventHandlers.get(event)!.push(callback);
    
    // Return EventRef mock
    return {
      e: this,
      f: callback
    } as EventRef;
  }

  off(event: string, callback: Function): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      const index = handlers.indexOf(callback);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
  }

  offref(ref: EventRef): void {
    if (ref.e === this && typeof ref.f === 'function') {
      // Find and remove the callback
      for (const [event, handlers] of this.eventHandlers.entries()) {
        const index = handlers.indexOf(ref.f);
        if (index > -1) {
          handlers.splice(index, 1);
          break;
        }
      }
    }
  }

  trigger(event: string, ...args: any[]): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(...args);
        } catch (error) {
          console.error(`Error in event handler for ${event}:`, error);
        }
      });
    }
  }

  // Additional workspace methods that might be needed
  detachLeavesOfType(type: string): void {
    // Mock implementation
  }

  createLeafBySplit(leaf: WorkspaceLeaf, direction?: 'horizontal' | 'vertical'): WorkspaceLeaf {
    return new WorkspaceLeaf();
  }

  splitActiveLeaf(direction?: 'horizontal' | 'vertical'): WorkspaceLeaf {
    return new WorkspaceLeaf();
  }

  duplicateLeaf(leaf: WorkspaceLeaf, direction?: 'horizontal' | 'vertical'): Promise<WorkspaceLeaf> {
    return Promise.resolve(new WorkspaceLeaf());
  }

  getMostRecentLeaf(): WorkspaceLeaf | null {
    return new WorkspaceLeaf();
  }

  getLeaf(newLeaf?: boolean): WorkspaceLeaf {
    return new WorkspaceLeaf();
  }

  setActiveLeaf(leaf: WorkspaceLeaf, pushHistory?: boolean): void {
    // Mock implementation
  }

  getActiveViewOfType<T>(type: { new(...args: any[]): T }): T | null {
    return null;
  }
}

// MetadataCache Mock
export class MetadataCache {
  getFileCache(file: TFile) {
    return {
      links: [],
      embeds: [],
      tags: [],
      headings: []
    };
  }

  getCache(path: string) {
    return this.getFileCache(new TFile(path));
  }

  on(event: string, callback: Function): void {
    // Mock event registration
  }

  off(event: string, callback: Function): void {
    // Mock event deregistration
  }
}

// App Mock
export class App {
  vault: Vault;
  workspace: Workspace;
  metadataCache: MetadataCache;
  
  constructor() {
    this.vault = new Vault();
    this.workspace = new Workspace();
    this.metadataCache = new MetadataCache();
  }
}

// Plugin Mock
export class Plugin {
  app: App;
  manifest: any;
  
  constructor(app: App, manifest: any) {
    this.app = app;
    this.manifest = manifest;
  }

  async loadData(): Promise<any> {
    return {};
  }

  async saveData(data: any): Promise<void> {
    // Mock implementation
  }

  addRibbonIcon(icon: string, title: string, callback: Function): MockHTMLElement {
    return new MockHTMLElement('button');
  }

  addStatusBarItem(): MockHTMLElement {
    return new MockHTMLElement('div');
  }

  addCommand(command: {
    id: string;
    name: string;
    callback: Function;
    hotkeys?: any[];
  }): void {
    // Mock implementation
  }

  addSettingTab(tab: PluginSettingTab): void {
    // Mock implementation
  }

  registerView(type: string, viewCreator: (leaf: WorkspaceLeaf) => ItemView): void {
    // Mock implementation
  }

  registerEvent(event: any): void {
    // Mock implementation for event registration
  }

  registerDomEvent(element: Element, event: string, callback: Function): void {
    // Mock implementation
  }

  registerInterval(callback: Function, interval: number): number {
    return setInterval(callback, interval);
  }

  onload(): void {
    // Override in actual plugin
  }

  onunload(): void {
    // Override in actual plugin
  }
}

// Setting Mock
export class Setting {
  settingEl: MockHTMLElement;
  nameEl: MockHTMLElement;
  descEl: MockHTMLElement;
  controlEl: MockHTMLElement;

  constructor(containerEl: MockHTMLElement) {
    this.settingEl = containerEl.createDiv('setting-item');
    this.nameEl = this.settingEl.createDiv('setting-item-name');
    this.descEl = this.settingEl.createDiv('setting-item-description');
    this.controlEl = this.settingEl.createDiv('setting-item-control');
  }

  setName(name: string): Setting {
    this.nameEl.textContent = name;
    return this;
  }

  setDesc(desc: string): Setting {
    this.descEl.textContent = desc;
    return this;
  }

  addText(callback: (text: TextComponent) => void): Setting {
    const text = new TextComponent(this.controlEl);
    callback(text);
    return this;
  }

  addTextArea(callback: (textArea: TextAreaComponent) => void): Setting {
    const textArea = new TextAreaComponent(this.controlEl);
    callback(textArea);
    return this;
  }

  addToggle(callback: (toggle: ToggleComponent) => void): Setting {
    const toggle = new ToggleComponent(this.controlEl);
    callback(toggle);
    return this;
  }

  addDropdown(callback: (dropdown: DropdownComponent) => void): Setting {
    const dropdown = new DropdownComponent(this.controlEl);
    callback(dropdown);
    return this;
  }

  addButton(callback: (button: ButtonComponent) => void): Setting {
    const button = new ButtonComponent(this.controlEl);
    callback(button);
    return this;
  }
}

// Component Mocks
export class TextComponent {
  inputEl: MockHTMLElement;
  
  constructor(containerEl: MockHTMLElement) {
    this.inputEl = containerEl.createEl('input');
  }

  setValue(value: string): TextComponent {
    this.inputEl.setAttribute('value', value);
    return this;
  }

  getValue(): string {
    return this.inputEl.getAttribute('value') || '';
  }

  setPlaceholder(placeholder: string): TextComponent {
    this.inputEl.setAttribute('placeholder', placeholder);
    return this;
  }

  onChange(callback: (value: string) => void): TextComponent {
    // Mock implementation
    return this;
  }
}

export class TextAreaComponent {
  inputEl: MockHTMLElement;
  
  constructor(containerEl: MockHTMLElement) {
    this.inputEl = containerEl.createEl('textarea');
  }

  setValue(value: string): TextAreaComponent {
    this.inputEl.textContent = value;
    return this;
  }

  getValue(): string {
    return this.inputEl.textContent;
  }

  setPlaceholder(placeholder: string): TextAreaComponent {
    this.inputEl.setAttribute('placeholder', placeholder);
    return this;
  }

  onChange(callback: (value: string) => void): TextAreaComponent {
    // Mock implementation
    return this;
  }
}

export class ToggleComponent {
  toggleEl: MockHTMLElement;
  private _value: boolean = false;
  
  constructor(containerEl: MockHTMLElement) {
    this.toggleEl = containerEl.createEl('input');
    this.toggleEl.setAttribute('type', 'checkbox');
  }

  setValue(value: boolean): ToggleComponent {
    this._value = value;
    this.toggleEl.setAttribute('checked', value.toString());
    return this;
  }

  getValue(): boolean {
    return this._value;
  }

  onChange(callback: (value: boolean) => void): ToggleComponent {
    // Mock implementation
    return this;
  }
}

export class DropdownComponent {
  selectEl: MockHTMLElement;
  private _value: string = '';
  
  constructor(containerEl: MockHTMLElement) {
    this.selectEl = containerEl.createEl('select');
  }

  addOption(value: string, text: string): DropdownComponent {
    const option = this.selectEl.createEl('option');
    option.setAttribute('value', value);
    option.textContent = text;
    return this;
  }

  addOptions(options: Record<string, string>): DropdownComponent {
    Object.entries(options).forEach(([value, text]) => {
      this.addOption(value, text);
    });
    return this;
  }

  setValue(value: string): DropdownComponent {
    this._value = value;
    this.selectEl.setAttribute('value', value);
    return this;
  }

  getValue(): string {
    return this._value;
  }

  onChange(callback: (value: string) => void): DropdownComponent {
    // Mock implementation
    return this;
  }
}

export class ButtonComponent {
  buttonEl: MockHTMLElement;
  
  constructor(containerEl: MockHTMLElement) {
    this.buttonEl = containerEl.createEl('button');
  }

  setButtonText(text: string): ButtonComponent {
    this.buttonEl.textContent = text;
    return this;
  }

  setCta(): ButtonComponent {
    this.buttonEl.addClass('mod-cta');
    return this;
  }

  setWarning(): ButtonComponent {
    this.buttonEl.addClass('mod-warning');
    return this;
  }

  onClick(callback: Function): ButtonComponent {
    // Mock implementation
    return this;
  }
}

// Modal Mock
export class Modal {
  app: App;
  contentEl: MockHTMLElement;
  modalEl: MockHTMLElement;
  titleEl: MockHTMLElement;
  
  constructor(app: App) {
    this.app = app;
    this.modalEl = new MockHTMLElement('div');
    this.modalEl.addClass('modal');
    this.titleEl = this.modalEl.createDiv('modal-title');
    this.contentEl = this.modalEl.createDiv('modal-content');
    
    // Ensure contentEl has all necessary methods for dashboard functionality
    // This is critical for components that extend Modal and use contentEl extensively
  }

  open(): void {
    this.onOpen();
  }

  close(): void {
    this.onClose();
  }

  onOpen(): void {
    // Override in subclass
  }

  onClose(): void {
    // Override in subclass
  }

  setTitle(title: string): void {
    this.titleEl.textContent = title;
  }
}

// PluginSettingTab Mock
export class PluginSettingTab {
  app: App;
  plugin: Plugin;
  containerEl: MockHTMLElement;
  
  constructor(app: App, plugin: Plugin) {
    this.app = app;
    this.plugin = plugin;
    this.containerEl = new MockHTMLElement('div');
  }

  display(): void {
    // Override in subclass
  }

  hide(): void {
    this.containerEl.empty();
  }
}

// Notice Mock
export const Notice = jest.fn().mockImplementation((message: string, timeout?: number) => {
  return {
    message,
    timeout: timeout || 5000,
    hide: jest.fn()
  };
});

// Utility Functions Mock
export function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+/g, '/');
}

export function moment(date?: any): any {
  return {
    format: (format: string) => '2023-01-01 12:00:00',
    valueOf: () => Date.now(),
    toDate: () => new Date(),
    isValid: () => true
  };
}

// Request Mock
export interface RequestUrlParam {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string | ArrayBuffer;
  throw?: boolean;
}

export interface RequestUrlResponse {
  status: number;
  headers: Record<string, string>;
  text: string;
  json: any;
  arrayBuffer: ArrayBuffer;
}

export const requestUrl = jest.fn<Promise<RequestUrlResponse>, [RequestUrlParam | string]>()
  .mockImplementation(async (param) => {
    const url = typeof param === 'string' ? param : param.url;
    return {
      status: 200,
      headers: { 'content-type': 'application/json' },
      text: '{"mock": "response"}',
      json: { mock: 'response' },
      arrayBuffer: new ArrayBuffer(0)
    };
  });

// Platform Mock
export const Platform = {
  isMobile: false,
  isDesktop: true,
  isWin: process.platform === 'win32',
  isMac: process.platform === 'darwin',
  isLinux: process.platform === 'linux'
};

// Editor Mock
export class Editor {
  getSelection(): string {
    return '';
  }

  replaceSelection(replacement: string): void {
    // Mock implementation
  }

  getCursor(): { line: number; ch: number } {
    return { line: 0, ch: 0 };
  }

  setCursor(cursor: { line: number; ch: number }): void {
    // Mock implementation
  }

  getLine(line: number): string {
    return '';
  }

  setLine(line: number, text: string): void {
    // Mock implementation
  }

  getValue(): string {
    return '';
  }

  setValue(value: string): void {
    // Mock implementation
  }
}

// View Mock
export class View {
  app: App;
  leaf: WorkspaceLeaf;
  containerEl: MockHTMLElement;
  
  constructor(leaf: WorkspaceLeaf) {
    this.leaf = leaf;
    this.app = leaf.view?.app || new App();
    this.containerEl = new MockHTMLElement('div');
  }

  getViewType(): string {
    return 'mock-view';
  }

  getDisplayText(): string {
    return 'Mock View';
  }

  onOpen(): Promise<void> {
    return Promise.resolve();
  }

  onClose(): Promise<void> {
    return Promise.resolve();
  }
}

// ItemView Mock (extends View for Obsidian views)
export class ItemView extends View {
  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
    this.containerEl = new MockHTMLElement('div');
    // Add children array to containerEl to match expected structure
    this.containerEl.children = [new MockHTMLElement('div'), new MockHTMLElement('div')];
  }

  getIcon(): string {
    return 'document';
  }

  async onOpen(): Promise<void> {
    return Promise.resolve();
  }

  async onClose(): Promise<void> {
    return Promise.resolve();
  }
}

// Helper function to create comprehensive mock elements for testing
export function createMockElement(tagName: string = 'div'): MockHTMLElement {
  return new MockHTMLElement(tagName);
}

// Helper function to create a comprehensive mock for any DOM container
export function createComprehensiveMock(): Record<string, any> {
  const element = new MockHTMLElement('div');
  return {
    empty: element.empty.bind(element),
    addClass: element.addClass.bind(element),
    removeClass: element.removeClass.bind(element),
    hasClass: element.hasClass.bind(element),
    toggleClass: element.toggleClass.bind(element),
    createEl: element.createEl.bind(element),
    createDiv: element.createDiv.bind(element),
    createSpan: element.createSpan.bind(element),
    appendChild: element.appendChild.bind(element),
    removeChild: element.removeChild.bind(element),
    setAttribute: element.setAttribute.bind(element),
    getAttribute: element.getAttribute.bind(element),
    removeAttribute: element.removeAttribute.bind(element),
    addEventListener: element.addEventListener.bind(element),
    removeEventListener: element.removeEventListener.bind(element),
    click: element.click.bind(element),
    focus: element.focus.bind(element),
    blur: element.blur.bind(element),
    querySelector: element.querySelector.bind(element),
    querySelectorAll: element.querySelectorAll.bind(element),
    getElementById: element.getElementById.bind(element),
    getElementsByClassName: element.getElementsByClassName.bind(element),
    show: element.show.bind(element),
    hide: element.hide.bind(element),
    style: element.style,
    className: element.className,
    textContent: element.textContent,
    innerHTML: element.innerHTML,
    children: element.children,
    parentElement: element.parentElement,
    attributes: element.attributes,
    dataset: element.dataset,
    tagName: element.tagName
  };
}

// Export default Document mock for DOM manipulation
export const document = {
  createElement: (tagName: string) => new MockHTMLElement(tagName),
  createTextNode: (text: string) => ({ textContent: text }),
  getElementById: (id: string) => new MockHTMLElement('div'),
  querySelector: (selector: string) => new MockHTMLElement('div'),
  querySelectorAll: (selector: string) => [new MockHTMLElement('div')],
  body: new MockHTMLElement('body'),
  head: new MockHTMLElement('head')
};

// Export window mock
export const window = {
  document,
  addEventListener: jest.fn(),
  removeEventListener: jest.fn(),
  setTimeout: global.setTimeout,
  clearTimeout: global.clearTimeout,
  setInterval: global.setInterval,
  clearInterval: global.clearInterval
};

// Additional Obsidian constants and utilities
export const Component = class {
  load(): void {}
  unload(): void {}
  onload(): void {}
  onunload(): void {}
  addChild(component: any): void {}
  removeChild(component: any): void {}
};

// Export all commonly used classes and functions
export {
  MockHTMLElement as HTMLElement,
  MockHTMLElement as Element,
  MockHTMLElement as HTMLDivElement,
  MockHTMLElement as HTMLInputElement,
  MockHTMLElement as HTMLTextAreaElement,
  MockHTMLElement as HTMLButtonElement,
  MockHTMLElement as HTMLSelectElement
};

// Default export for convenience
export default {
  App,
  Plugin,
  Modal,
  Notice,
  Setting,
  PluginSettingTab,
  TFile,
  TFolder,
  TAbstractFile,
  Vault,
  Workspace,
  WorkspaceLeaf,
  MetadataCache,
  Component,
  requestUrl,
  normalizePath,
  moment,
  Platform,
  Editor,
  View,
  ItemView,
  document,
  window
};