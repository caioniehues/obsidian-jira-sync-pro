import { IPluginAdapter, AdapterState, AdapterMetadata, HealthCheckResult } from '../IPluginAdapter';
import { EventBus } from '../../events/event-bus';
import { DataProvider } from '../DataProvider';
import type JiraSyncProPlugin from '../../main';

export class DayPlannerAdapter implements IPluginAdapter {
  state: AdapterState = AdapterState.INACTIVE;
  
  readonly metadata: AdapterMetadata = {
    id: 'obsidian-day-planner',
    name: 'Day Planner Adapter',
    version: '1.0.0',
    author: 'Jira Sync Pro',
    description: 'Integrates Jira tasks with Day Planner time blocks',
    capabilities: {
      read: true,
      write: true,
      sync: true,
      realtime: false,
      bidirectional: false
    },
    priority: 40,
    dependencies: [],
    minJiraPluginVersion: '1.0.0'
  };

  async initialize(plugin: JiraSyncProPlugin, eventBus: EventBus, dataProvider: DataProvider): Promise<void> {
    this.state = AdapterState.INITIALIZED;
  }

  async activate(): Promise<void> {
    this.state = AdapterState.ACTIVE;
  }

  async deactivate(): Promise<void> {
    this.state = AdapterState.INACTIVE;
  }

  async cleanup(): Promise<void> {
    await this.deactivate();
  }

  async healthCheck(): Promise<HealthCheckResult> {
    return { healthy: true, errors: [], warnings: [], lastCheck: Date.now() };
  }

  async recover(): Promise<boolean> {
    return false;
  }

  getRequiredPermissions(): string[] {
    return ['dayplanner:write'];
  }
}