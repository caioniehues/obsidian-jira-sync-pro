# STM Task 23: Settings Tab UI

## Task Definition
Add UI controls for new features in the plugin settings tab

## Size: Medium
## Priority: Medium
## Dependencies: Task 14 (Settings interface update)

## Implementation

```typescript
// src/ui/settings-tab.ts
import { PluginSettingTab, Setting, Notice } from 'obsidian';
import { JiraSyncProPlugin } from '@/main';
import { initializePARAStructure } from '@/organization/para-setup';
import { CustomFieldMappingModal } from '@/ui/modals';

export class JiraSyncProSettingTab extends PluginSettingTab {
  plugin: JiraSyncProPlugin;
  
  constructor(app: any, plugin: JiraSyncProPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  
  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    
    containerEl.createEl('h1', { text: 'Jira Sync Pro Settings' });
    
    // Existing Jira connection settings
    this.addJiraConnectionSettings(containerEl);
    
    // New Organization settings
    this.addOrganizationSettings(containerEl);
    
    // New Time Tracking settings
    this.addTimeTrackingSettings(containerEl);
    
    // New Template settings
    this.addTemplateSettings(containerEl);
    
    // New Custom Field settings
    this.addCustomFieldSettings(containerEl);
  }
  
  private addJiraConnectionSettings(containerEl: HTMLElement): void {
    containerEl.createEl('h2', { text: 'Jira Connection' });
    
    new Setting(containerEl)
      .setName('Jira URL')
      .setDesc('Your Jira instance URL (e.g., https://company.atlassian.net)')
      .addText(text => text
        .setPlaceholder('https://company.atlassian.net')
        .setValue(this.plugin.settings.jiraUrl)
        .onChange(async (value) => {
          this.plugin.settings.jiraUrl = value;
          await this.plugin.saveSettings();
        }));
        
    new Setting(containerEl)
      .setName('Username')
      .setDesc('Your Jira username or email')
      .addText(text => text
        .setPlaceholder('user@company.com')
        .setValue(this.plugin.settings.jiraUsername)
        .onChange(async (value) => {
          this.plugin.settings.jiraUsername = value;
          await this.plugin.saveSettings();
        }));
        
    new Setting(containerEl)
      .setName('API Token')
      .setDesc('Your Jira API token (create at id.atlassian.com)')
      .addText(text => text
        .setPlaceholder('API Token')
        .setValue(this.plugin.settings.jiraApiToken)
        .onChange(async (value) => {
          this.plugin.settings.jiraApiToken = value;
          await this.plugin.saveSettings();
        }));
  }
  
  private addOrganizationSettings(containerEl: HTMLElement): void {
    containerEl.createEl('h2', { text: 'Organization' });
    
    new Setting(containerEl)
      .setName('Use PARA structure')
      .setDesc('Organize tickets using PARA method with numbered folders (01_Projects, 02_Areas, etc.)')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.usePARAStructure)
        .onChange(async (value) => {
          this.plugin.settings.usePARAStructure = value;
          await this.plugin.saveSettings();
          
          if (value) {
            // Initialize PARA structure
            await initializePARAStructure(this.app.vault);
            new Notice('PARA structure created. Check your vault for new folders.');
          }
        }));
    
    new Setting(containerEl)
      .setName('Projects folder')
      .setDesc('Name of the projects folder (default: 01_Projects)')
      .addText(text => text
        .setPlaceholder('01_Projects')
        .setValue(this.plugin.settings.projectsFolder)
        .onChange(async (value) => {
          this.plugin.settings.projectsFolder = value || '01_Projects';
          await this.plugin.saveSettings();
        }));
        
    new Setting(containerEl)
      .setName('Archives folder')
      .setDesc('Name of the archives folder (default: 04_Archives)')
      .addText(text => text
        .setPlaceholder('04_Archives')
        .setValue(this.plugin.settings.archivesFolder)
        .onChange(async (value) => {
          this.plugin.settings.archivesFolder = value || '04_Archives';
          await this.plugin.saveSettings();
        }));
  }
  
  private addTimeTrackingSettings(containerEl: HTMLElement): void {
    containerEl.createEl('h2', { text: 'Time Tracking' });
    
    new Setting(containerEl)
      .setName('Enable time tracking')
      .setDesc('Show timer in status bar and enable time commands')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.timeTrackingEnabled)
        .onChange(async (value) => {
          this.plugin.settings.timeTrackingEnabled = value;
          await this.plugin.saveSettings();
          
          if (value) {
            this.plugin.initializeTimeTracking();
          } else {
            this.plugin.disableTimeTracking();
          }
        }));
    
    new Setting(containerEl)
      .setName('Confirm before push')
      .setDesc('Show confirmation dialog before pushing time to Jira')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.confirmBeforePush)
        .onChange(async (value) => {
          this.plugin.settings.confirmBeforePush = value;
          await this.plugin.saveSettings();
        }));
    
    new Setting(containerEl)
      .setName('Round to nearest minutes')
      .setDesc('Round time entries to nearest X minutes (0 to disable)')
      .addText(text => text
        .setPlaceholder('5')
        .setValue(String(this.plugin.settings.roundToMinutes))
        .onChange(async (value) => {
          const minutes = parseInt(value) || 0;
          this.plugin.settings.roundToMinutes = minutes;
          await this.plugin.saveSettings();
        }));
  }
  
  private addTemplateSettings(containerEl: HTMLElement): void {
    containerEl.createEl('h2', { text: 'Templates' });
    
    new Setting(containerEl)
      .setName('Use templates')
      .setDesc('Apply templates to new tickets automatically')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.useTemplates)
        .onChange(async (value) => {
          this.plugin.settings.useTemplates = value;
          await this.plugin.saveSettings();
        }));
    
    new Setting(containerEl)
      .setName('Include time log section')
      .setDesc('Add time tracking section to new tickets')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.includeTimeLog)
        .onChange(async (value) => {
          this.plugin.settings.includeTimeLog = value;
          await this.plugin.saveSettings();
        }));
  }
  
  private addCustomFieldSettings(containerEl: HTMLElement): void {
    containerEl.createEl('h2', { text: 'Custom Fields' });
    
    new Setting(containerEl)
      .setName('Sync custom fields')
      .setDesc('Include Jira custom fields in tickets')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.syncCustomFields)
        .onChange(async (value) => {
          this.plugin.settings.syncCustomFields = value;
          await this.plugin.saveSettings();
        }));
    
    // Custom field mapping configuration
    new Setting(containerEl)
      .setName('Configure field mappings')
      .setDesc('Map Jira custom field IDs to friendly names')
      .addButton(button => button
        .setButtonText('Configure Mappings')
        .setClass('mod-cta')
        .onClick(() => {
          new CustomFieldMappingModal(this.app, this.plugin).open();
        }));
    
    // Display current mappings count
    const mappingCount = Object.keys(this.plugin.settings.customFieldMappings).length;
    if (mappingCount > 0) {
      containerEl.createEl('p', {
        text: `Currently mapping ${mappingCount} custom field(s)`,
        cls: 'setting-item-description'
      });
    }
  }
}
```

## Additional UI Components

```typescript
// src/ui/modals/custom-field-mapping-modal.ts
import { Modal, Setting } from 'obsidian';
import { JiraSyncProPlugin } from '@/main';

export class CustomFieldMappingModal extends Modal {
  constructor(app: any, private plugin: JiraSyncProPlugin) {
    super(app);
  }
  
  onOpen() {
    const { contentEl } = this;
    contentEl.createEl('h2', { text: 'Custom Field Mappings' });
    
    contentEl.createEl('p', {
      text: 'Map Jira custom field IDs (e.g., customfield_10001) to friendly names.'
    });
    
    // Show existing mappings
    const mappings = this.plugin.settings.customFieldMappings;
    Object.entries(mappings).forEach(([fieldId, friendlyName]) => {
      this.addMappingRow(contentEl, fieldId, friendlyName);
    });
    
    // Add new mapping button
    new Setting(contentEl)
      .addButton(button => button
        .setButtonText('Add New Mapping')
        .onClick(() => {
          this.addMappingRow(contentEl, '', '');
        }));
  }
  
  private addMappingRow(container: HTMLElement, fieldId: string, friendlyName: string) {
    new Setting(container)
      .setName('Field Mapping')
      .addText(text => text
        .setPlaceholder('customfield_10001')
        .setValue(fieldId)
        .onChange(value => {
          // Update mapping when field ID changes
        }))
      .addText(text => text
        .setPlaceholder('Sprint')
        .setValue(friendlyName)
        .onChange(value => {
          // Update mapping when friendly name changes
        }))
      .addButton(button => button
        .setButtonText('Remove')
        .onClick(() => {
          container.removeChild(button.buttonEl.parentElement?.parentElement as HTMLElement);
          delete this.plugin.settings.customFieldMappings[fieldId];
          this.plugin.saveSettings();
        }));
  }
  
  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}
```

## Test Spec

```typescript
// tests/unit/ui/settings-tab.test.ts
import { describe, it, expect, vi } from 'vitest';
import { JiraSyncProSettingTab } from '@/ui/settings-tab';

describe('Settings Tab', () => {
  it('should display all setting sections', () => {
    const mockApp = {};
    const mockPlugin = {
      settings: {
        jiraUrl: 'https://test.atlassian.net',
        timeTrackingEnabled: true,
        usePARAStructure: false
      }
    };
    
    const settingsTab = new JiraSyncProSettingTab(mockApp as any, mockPlugin as any);
    const mockContainer = {
      empty: vi.fn(),
      createEl: vi.fn()
    };
    
    settingsTab.containerEl = mockContainer as any;
    settingsTab.display();
    
    expect(mockContainer.createEl).toHaveBeenCalledWith('h1', { text: 'Jira Sync Pro Settings' });
    expect(mockContainer.createEl).toHaveBeenCalledWith('h2', { text: 'Organization' });
    expect(mockContainer.createEl).toHaveBeenCalledWith('h2', { text: 'Time Tracking' });
  });
});
```

## Acceptance Criteria
- [ ] All settings toggles work correctly
- [ ] PARA structure initialized when toggled on
- [ ] Settings persist across restarts
- [ ] Custom field mapping modal opens and functions
- [ ] UI is intuitive and well-organized
- [ ] Real-time feedback for setting changes

## Execution Notes
- Extend existing settings tab rather than replace
- Preserve all current functionality
- Add validation for URL and credential fields
- Consider grouping related settings visually