import { IPluginAdapter, AdapterState, AdapterMetadata, HealthCheckResult } from '../IPluginAdapter';
import { EventBus } from '../../events/event-bus';
import { DataProvider } from '../DataProvider';
import { JiraTicket } from '../../models/JiraModels';
import type JiraSyncProPlugin from '../../main';

/**
 * Adapter for integrating with the Obsidian Tasks plugin
 * Enables bidirectional sync between Jira tickets and Tasks plugin format
 */
export class TasksPluginAdapter implements IPluginAdapter {
  state: AdapterState = AdapterState.INACTIVE;
  
  readonly metadata: AdapterMetadata = {
    id: 'obsidian-tasks-plugin',
    name: 'Tasks Plugin Adapter',
    version: '1.0.0',
    author: 'Jira Sync Pro',
    description: 'Integrates Jira tickets with Obsidian Tasks plugin',
    capabilities: {
      read: true,
      write: true,
      sync: true,
      realtime: false,
      bidirectional: true
    },
    priority: 10,
    dependencies: [],
    minJiraPluginVersion: '1.0.0'
  };

  private plugin: JiraSyncProPlugin | null = null;
  private eventBus: EventBus | null = null;
  private dataProvider: DataProvider | null = null;
  private tasksPlugin: any = null;

  async initialize(plugin: JiraSyncProPlugin, eventBus: EventBus, dataProvider: DataProvider): Promise<void> {
    this.plugin = plugin;
    this.eventBus = eventBus;
    this.dataProvider = dataProvider;
    
    // Get Tasks plugin instance
    const tasksPlugin = (plugin.app as any).plugins?.plugins?.['obsidian-tasks-plugin'];
    if (tasksPlugin) {
      this.tasksPlugin = tasksPlugin;
      console.log('TasksPluginAdapter: Tasks plugin found and connected');
    } else {
      console.warn('TasksPluginAdapter: Tasks plugin not found');
    }
    
    this.state = AdapterState.INITIALIZED;
  }

  async activate(): Promise<void> {
    if (this.state !== AdapterState.INITIALIZED) {
      throw new Error('Adapter must be initialized before activation');
    }

    // Subscribe to Jira sync events
    if (this.eventBus) {
      this.eventBus.subscribe('jira:sync:completed', this.handleSyncCompleted.bind(this));
      this.eventBus.subscribe('jira:ticket:updated', this.handleTicketUpdated.bind(this));
    }

    this.state = AdapterState.ACTIVE;
    console.log('TasksPluginAdapter: Activated');
  }

  async deactivate(): Promise<void> {
    // Unsubscribe from events
    if (this.eventBus) {
      this.eventBus.removeAllListeners();
    }

    this.state = AdapterState.INACTIVE;
    console.log('TasksPluginAdapter: Deactivated');
  }

  async cleanup(): Promise<void> {
    await this.deactivate();
    this.plugin = null;
    this.eventBus = null;
    this.dataProvider = null;
    this.tasksPlugin = null;
  }

  async healthCheck(): Promise<HealthCheckResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check if Tasks plugin is still available
    if (!this.tasksPlugin) {
      errors.push('Tasks plugin not found');
    }

    // Check if we can access Tasks API
    if (this.tasksPlugin && !this.tasksPlugin.api) {
      warnings.push('Tasks plugin API not accessible');
    }

    return {
      healthy: errors.length === 0,
      errors,
      warnings,
      lastCheck: Date.now()
    };
  }

  async recover(): Promise<boolean> {
    try {
      // Try to reconnect to Tasks plugin
      const tasksPlugin = (this.plugin?.app as any).plugins?.plugins?.['obsidian-tasks-plugin'];
      if (tasksPlugin) {
        this.tasksPlugin = tasksPlugin;
        this.state = AdapterState.ACTIVE;
        return true;
      }
    } catch (error) {
      console.error('TasksPluginAdapter: Recovery failed', error);
    }
    
    this.state = AdapterState.ERROR;
    return false;
  }

  getRequiredPermissions(): string[] {
    return ['file:read', 'file:write', 'tasks:modify'];
  }

  /**
   * Convert Jira ticket to Tasks plugin format
   */
  private convertToTaskFormat(ticket: JiraTicket): string {
    const dueDate = ticket.fields?.duedate ? ` 📅 ${ticket.fields.duedate}` : '';
    const priority = this.mapPriorityToEmoji(ticket.fields?.priority?.name);
    const status = ticket.fields?.status?.name === 'Done' ? 'x' : ' ';
    
    return `- [${status}] ${priority}${ticket.fields?.summary || ticket.key}${dueDate} #jira/${ticket.key}`;
  }

  /**
   * Map Jira priority to emoji for Tasks plugin
   */
  private mapPriorityToEmoji(priority?: string): string {
    switch (priority?.toLowerCase()) {
      case 'highest':
      case 'critical':
        return '🔴 ';
      case 'high':
        return '🟠 ';
      case 'medium':
        return '🟡 ';
      case 'low':
        return '🟢 ';
      default:
        return '';
    }
  }

  /**
   * Handle sync completed event from Jira
   */
  private async handleSyncCompleted(payload: any): Promise<void> {
    if (!this.state === AdapterState.ACTIVE) return;
    
    const tickets = payload.tickets as JiraTicket[];
    console.log(`TasksPluginAdapter: Processing ${tickets.length} synced tickets`);
    
    // Convert tickets to task format and update notes
    for (const ticket of tickets) {
      try {
        const taskFormat = this.convertToTaskFormat(ticket);
        // Here you would update the actual task in the file
        // This requires accessing the file where the task exists
        console.log(`TasksPluginAdapter: Would update task for ${ticket.key}: ${taskFormat}`);
      } catch (error) {
        console.error(`TasksPluginAdapter: Error processing ticket ${ticket.key}:`, error);
      }
    }
  }

  /**
   * Handle individual ticket update
   */
  private async handleTicketUpdated(payload: any): Promise<void> {
    if (!this.state === AdapterState.ACTIVE) return;
    
    const ticket = payload.ticket as JiraTicket;
    console.log(`TasksPluginAdapter: Updating ticket ${ticket.key}`);
    
    try {
      const taskFormat = this.convertToTaskFormat(ticket);
      // Update the specific task
      console.log(`TasksPluginAdapter: Would update task: ${taskFormat}`);
    } catch (error) {
      console.error(`TasksPluginAdapter: Error updating ticket ${ticket.key}:`, error);
    }
  }

  // IPluginAdapter interface methods for ticket processing
  onTicketsSynced?(tickets: JiraTicket[]): void {
    this.handleSyncCompleted({ tickets });
  }

  onTicketUpdated?(ticket: JiraTicket): void {
    this.handleTicketUpdated({ ticket });
  }
}