// Mock implementation of Obsidian API for testing

class Plugin {
  constructor() {
    this.app = null;
    this.manifest = {};
  }
  
  async loadData() {
    return {};
  }
  
  async saveData(data) {
    return;
  }
  
  addCommand(command) {
    return command;
  }
  
  addSettingTab(tab) {
    return tab;
  }
  
  async onload() {}
  async onunload() {}
}

class PluginSettingTab {
  constructor(app, plugin) {
    this.app = app;
    this.plugin = plugin;
    this.containerEl = {
      empty: jest.fn(),
      createEl: jest.fn((tag, options) => {
        const element = {
          createEl: jest.fn((childTag, childOptions) => ({
            createEl: jest.fn(),
            createDiv: jest.fn(() => ({
              createEl: jest.fn((subTag, subOptions) => {
                if (subTag === 'textarea') {
                  return {
                    value: '',
                    addEventListener: jest.fn(),
                    style: {}
                  };
                }
                return {
                  textContent: '',
                  style: {},
                  createEl: jest.fn()
                };
              })
            }))
          })),
          createDiv: jest.fn(() => ({
            createEl: jest.fn()
          })),
          empty: jest.fn()
        };
        return element;
      })
    };
    this.controlEl = {
      createEl: jest.fn(),
      createDiv: jest.fn()
    };
  }
  
  display() {}
}

class Setting {
  constructor(containerEl) {
    this.containerEl = containerEl;
    this.nameEl = null;
    this.descEl = null;
    this.controlEl = { 
      empty: jest.fn(),
      createEl: jest.fn((tag, options) => ({
        textContent: '',
        style: {}
      })),
      createDiv: jest.fn(() => ({
        createEl: jest.fn((tag) => {
          if (tag === 'textarea') {
            return {
              value: '',
              addEventListener: jest.fn(),
              style: {}
            };
          }
          return { textContent: '', style: {} };
        })
      }))
    };
    
    const methods = {
      setName: jest.fn((name) => {
        this.nameEl = name;
        return methods;
      }),
      setDesc: jest.fn((desc) => {
        this.descEl = desc;
        return methods;
      }),
      addText: jest.fn((cb) => {
        const textComponent = {
          setValue: jest.fn().mockReturnThis(),
          setPlaceholder: jest.fn().mockReturnThis(),
          onChange: jest.fn().mockReturnThis(),
          inputEl: { 
            value: '', 
            style: {},
            type: 'text'
          }
        };
        cb(textComponent);
        return methods;
      }),
      addTextArea: jest.fn((cb) => {
        const textAreaComponent = {
          setValue: jest.fn().mockReturnThis(),
          setPlaceholder: jest.fn().mockReturnThis(),
          onChange: jest.fn().mockReturnThis(),
          inputEl: { value: '', style: {} }
        };
        cb(textAreaComponent);
        return methods;
      }),
      addToggle: jest.fn((cb) => {
        const toggleComponent = {
          setValue: jest.fn().mockReturnThis(),
          onChange: jest.fn().mockReturnThis(),
          toggleEl: { checked: false }
        };
        cb(toggleComponent);
        return methods;
      }),
      addSlider: jest.fn((cb) => {
        const sliderComponent = {
          setValue: jest.fn().mockReturnThis(),
          setLimits: jest.fn().mockReturnThis(),
          setDynamicTooltip: jest.fn().mockReturnThis(),
          onChange: jest.fn().mockReturnThis(),
          sliderEl: { value: '5' }
        };
        cb(sliderComponent);
        return methods;
      }),
      addButton: jest.fn((cb) => {
        const buttonComponent = {
          setButtonText: jest.fn().mockReturnThis(),
          setDisabled: jest.fn().mockReturnThis(),
          setCta: jest.fn().mockReturnThis(),
          onClick: jest.fn().mockReturnThis(),
          buttonEl: { disabled: false }
        };
        cb(buttonComponent);
        return methods;
      })
    };
    
    Object.assign(this, methods);
    return this;
  }
}

class Notice {
  constructor(message, timeout) {
    this.message = message;
    this.timeout = timeout;
  }
}

class Modal {
  constructor(app) {
    this.app = app;
    this.contentEl = {
      empty: jest.fn(),
      createEl: jest.fn((tag, options) => ({
        createEl: jest.fn(),
        querySelector: jest.fn(),
        style: {}
      })),
      createDiv: jest.fn(() => ({
        createEl: jest.fn(),
        style: {}
      }))
    };
  }
  
  open() {}
  close() {}
  onOpen() {}
  onClose() {}
}

class TFile {
  constructor(path) {
    this.path = path;
    this.basename = path.split('/').pop().replace('.md', '');
    this.extension = 'md';
  }
}

function normalizePath(path) {
  return path.replace(/\\/g, '/');
}

const App = jest.fn();
const Vault = jest.fn();

module.exports = {
  Plugin,
  PluginSettingTab,
  Setting,
  Notice,
  Modal,
  App,
  TFile,
  Vault,
  normalizePath
};