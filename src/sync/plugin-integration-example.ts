/**
 * Plugin Integration Example
 * 
 * This file demonstrates how to integrate the AutoSyncScheduler with the main
 * Obsidian plugin. Copy this code into your main plugin file and adapt as needed.
 * 
 * This example shows:
 * - Proper initialization and cleanup
 * - Settings integration
 * - Command registration
 * - Status ribbon integration
 * - Error handling
 */

import { Plugin, Notice, PluginSettingTab, Setting } from 'obsidian';
import { JiraClient, JiraClientConfig } from '../jira-bases-adapter/jira-client';
import { AutoSyncConfig } from './auto-sync-scheduler';
import { SchedulerIntegration, validateJiraConfig, formatStatusSummary } from './scheduler-integration';

// ============================================================================
// Plugin Integration Code (for main.ts)
// ============================================================================

/**
 * Add these properties to your main plugin class
 */
interface PluginWithScheduler extends Plugin {
  // Existing properties
  settings: JiraSyncProSettings;
  
  // New scheduler properties
  schedulerIntegration: SchedulerIntegration | null;
  statusBarItem: HTMLElement | null;
}

/**
 * Add these methods to your main plugin class onload() method
 */
async function initializeSchedulerIntegration(plugin: PluginWithScheduler): Promise<void> {
  try {
    // Initialize Jira client (existing code)
    const jiraClient = new JiraClient();
    const jiraConfig: JiraClientConfig = {
      baseUrl: plugin.settings.jiraUrl,
      email: plugin.settings.jiraUsername,
      apiToken: plugin.settings.jiraApiToken
    };
    
    // Validate configuration
    const configErrors = validateJiraConfig(jiraConfig);
    if (configErrors.length > 0) {
      console.warn('Jira configuration issues:', configErrors);
      new Notice(`Jira configuration incomplete: ${configErrors.join(', ')}`);
      return;
    }
    
    jiraClient.configure(jiraConfig);
    
    // Create scheduler integration
    plugin.schedulerIntegration = new SchedulerIntegration(plugin, jiraClient, {
      enableSuccessNotifications: false,  // Keep notifications minimal
      enableErrorNotifications: true,
      enableProgressNotifications: false
    });
    
    // Initialize scheduler
    await plugin.schedulerIntegration.initialize();
    
    // Set up status bar
    plugin.statusBarItem = plugin.addStatusBarItem();
    plugin.updateStatusBar();
    
    // Set up status monitoring
    plugin.schedulerIntegration.onStatusUpdate(() => {
      plugin.updateStatusBar();
    });
    
    console.log('Auto-sync scheduler initialized successfully');
    
  } catch (error) {
    console.error('Failed to initialize auto-sync scheduler:', error);
    new Notice(`Failed to initialize auto-sync: ${error.message}`);
  }
}

/**
 * Add to your plugin's onunload() method
 */
async function cleanupSchedulerIntegration(plugin: PluginWithScheduler): Promise<void> {
  if (plugin.schedulerIntegration) {
    await plugin.schedulerIntegration.shutdown();
    plugin.schedulerIntegration = null;
  }
  
  if (plugin.statusBarItem) {
    plugin.statusBarItem.remove();
    plugin.statusBarItem = null;
  }
}

/**
 * Add these commands to your registerCommands() method
 */
function registerSchedulerCommands(plugin: PluginWithScheduler): void {
  // Manual sync command
  plugin.addCommand({
    id: 'trigger-manual-sync',
    name: 'Trigger Manual Sync',
    callback: async () => {
      if (!plugin.schedulerIntegration) {
        new Notice('Auto-sync scheduler not initialized');
        return;
      }
      
      try {
        new Notice('Starting manual sync...');
        const result = await plugin.schedulerIntegration.triggerManualSync();
        
        if (result.success) {
          new Notice(`✅ Manual sync completed: ${result.ticketsProcessed} tickets processed`);
        } else {
          new Notice(`❌ Manual sync failed: ${result.error?.message}`);
        }
      } catch (error) {
        new Notice(`❌ Failed to start manual sync: ${error.message}`);
      }
    }
  });
  
  // Cancel sync command
  plugin.addCommand({
    id: 'cancel-sync',
    name: 'Cancel Current Sync',
    callback: async () => {
      if (!plugin.schedulerIntegration) {
        new Notice('Auto-sync scheduler not initialized');
        return;
      }
      
      try {
        await plugin.schedulerIntegration.cancelCurrentSync();
        new Notice('Sync operation cancelled');
      } catch (error) {
        new Notice(`Failed to cancel sync: ${error.message}`);
      }
    }
  });
  
  // Toggle auto-sync command
  plugin.addCommand({
    id: 'toggle-auto-sync',
    name: 'Toggle Auto-Sync',
    callback: async () => {
      const newValue = !plugin.settings.autoSyncEnabled;
      plugin.settings.autoSyncEnabled = newValue;
      await plugin.saveSettings();
      
      // Update scheduler config
      if (plugin.schedulerIntegration) {
        await plugin.schedulerIntegration.updateSchedulerConfig({
          enableAutoSync: newValue
        });
      }
      
      new Notice(`Auto-sync ${newValue ? 'enabled' : 'disabled'}`);
    }
  });
}

/**
 * Add this method to your plugin class
 */
function updateStatusBar(plugin: PluginWithScheduler): void {
  if (!plugin.statusBarItem || !plugin.schedulerIntegration) {
    return;
  }
  
  const status = plugin.schedulerIntegration.getStatus();
  if (!status) {
    plugin.statusBarItem.setText('Jira: Not configured');
    return;
  }
  
  let statusText = 'Jira: ';
  
  if (status.isRunning) {
    if (status.currentProgress) {
      const percentage = status.currentProgress.total > 0 
        ? Math.round((status.currentProgress.current / status.currentProgress.total) * 100)
        : 0;
      statusText += `Syncing ${percentage}%`;
    } else {
      statusText += 'Syncing...';
    }
  } else if (!status.isEnabled) {
    statusText += 'Disabled';
  } else if (status.nextSyncTime) {
    const minutes = Math.round((status.nextSyncTime - Date.now()) / 60000);
    statusText += `Next in ${minutes}m`;
  } else {
    statusText += 'Ready';
  }
  
  // Add error indicator
  if (status.recentErrors.length > 0) {
    statusText += ' ⚠️';
  }
  
  plugin.statusBarItem.setText(statusText);
  
  // Set click handler for status details
  plugin.statusBarItem.onclick = () => {
    new Notice(formatStatusSummary(status), 10000);
  };
}

// ============================================================================
// Settings Tab Integration
// ============================================================================

/**
 * Add these settings to your existing settings tab
 */
function addSchedulerSettings(containerEl: HTMLElement, plugin: PluginWithScheduler): void {
  // Auto-sync section header
  containerEl.createEl('h2', { text: 'Auto-Sync Configuration' });
  
  // Enable auto-sync
  new Setting(containerEl)
    .setName('Enable Auto-Sync')
    .setDesc('Automatically sync tickets at regular intervals')
    .addToggle(toggle => toggle
      .setValue(plugin.settings.autoSyncEnabled)
      .onChange(async (value) => {
        plugin.settings.autoSyncEnabled = value;
        await plugin.saveSettings();
        
        // Update scheduler
        if (plugin.schedulerIntegration) {
          await plugin.schedulerIntegration.updateSchedulerConfig({
            enableAutoSync: value
          });
        }
      }));
  
  // Sync interval
  new Setting(containerEl)
    .setName('Sync Interval')
    .setDesc('How often to sync tickets (in minutes)')
    .addSlider(slider => slider
      .setLimits(1, 60, 1)
      .setValue(plugin.settings.syncInterval)
      .setDynamicTooltip()
      .onChange(async (value) => {
        plugin.settings.syncInterval = value;
        await plugin.saveSettings();
        
        // Update scheduler
        if (plugin.schedulerIntegration) {
          await plugin.schedulerIntegration.updateSchedulerConfig({
            intervalMinutes: value
          });
        }
      }));
  
  // JQL Query
  new Setting(containerEl)
    .setName('JQL Query')
    .setDesc('Jira Query Language (JQL) query for tickets to sync')
    .addTextArea(text => text
      .setPlaceholder('assignee = currentUser() AND status NOT IN (Done, Closed)')
      .setValue(plugin.settings.jqlQuery)
      .onChange(async (value) => {
        plugin.settings.jqlQuery = value;
        await plugin.saveSettings();
        
        // Update scheduler
        if (plugin.schedulerIntegration) {
          await plugin.schedulerIntegration.updateSchedulerConfig({
            jql: value
          });
        }
      }));
  
  // Max results
  new Setting(containerEl)
    .setName('Max Results')
    .setDesc('Maximum number of tickets to sync (memory management)')
    .addText(text => text
      .setValue(plugin.settings.maxResults.toString())
      .onChange(async (value) => {
        const maxResults = parseInt(value) || 500;
        plugin.settings.maxResults = maxResults;
        await plugin.saveSettings();
        
        // Update scheduler
        if (plugin.schedulerIntegration) {
          await plugin.schedulerIntegration.updateSchedulerConfig({
            maxResults
          });
        }
      }));
  
  // Batch size
  new Setting(containerEl)
    .setName('Batch Size')
    .setDesc('Number of tickets to process in each batch')
    .addText(text => text
      .setValue(plugin.settings.batchSize.toString())
      .onChange(async (value) => {
        const batchSize = parseInt(value) || 25;
        plugin.settings.batchSize = batchSize;
        await plugin.saveSettings();
        
        // Update scheduler
        if (plugin.schedulerIntegration) {
          await plugin.schedulerIntegration.updateSchedulerConfig({
            batchSize
          });
        }
      }));
  
  // Manual sync button
  new Setting(containerEl)
    .setName('Manual Sync')
    .setDesc('Trigger a sync operation immediately')
    .addButton(button => button
      .setButtonText('Sync Now')
      .setClass('mod-cta')
      .onClick(async () => {
        if (!plugin.schedulerIntegration) {
          new Notice('Auto-sync scheduler not initialized');
          return;
        }
        
        try {
          button.setButtonText('Syncing...');
          button.setDisabled(true);
          
          const result = await plugin.schedulerIntegration.triggerManualSync();
          
          if (result.success) {
            new Notice(`✅ Manual sync completed: ${result.ticketsProcessed} tickets processed`);
          } else {
            new Notice(`❌ Manual sync failed: ${result.error?.message}`);
          }
        } catch (error) {
          new Notice(`❌ Failed to start manual sync: ${error.message}`);
        } finally {
          button.setButtonText('Sync Now');
          button.setDisabled(false);
        }
      }));
  
  // Sync status
  const statusContainer = containerEl.createEl('div');
  statusContainer.createEl('h3', { text: 'Sync Status' });
  
  const statusEl = statusContainer.createEl('div', { 
    cls: 'sync-status',
    text: 'Loading...'
  });
  
  // Update status display
  const updateStatus = () => {
    if (!plugin.schedulerIntegration) {
      statusEl.setText('Not initialized');
      return;
    }
    
    const status = plugin.schedulerIntegration.getStatus();
    if (status) {
      statusEl.setText(formatStatusSummary(status));
    } else {
      statusEl.setText('No status available');
    }
  };
  
  // Set up periodic status updates
  updateStatus();
  const statusUpdateInterval = setInterval(updateStatus, 2000);
  
  // Clean up interval when settings tab is closed
  plugin.register(() => {
    clearInterval(statusUpdateInterval);
  });
}

// ============================================================================
// Types and Interfaces
// ============================================================================

interface JiraSyncProSettings {
  // Existing settings
  jiraUrl: string;
  jiraUsername: string;
  jiraApiToken: string;
  
  // New scheduler settings
  autoSyncEnabled: boolean;
  syncInterval: number;      // in minutes
  jqlQuery: string;
  maxResults: number;
  batchSize: number;
}

// Export the functions for use in main plugin file
export {
  initializeSchedulerIntegration,
  cleanupSchedulerIntegration,
  registerSchedulerCommands,
  updateStatusBar,
  addSchedulerSettings,
  type PluginWithScheduler,
  type JiraSyncProSettings
};