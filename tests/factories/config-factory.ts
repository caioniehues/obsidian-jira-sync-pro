/**
 * Factory for creating plugin configuration objects
 * Provides realistic test configurations with customization options and preset scenarios
 */

import { JiraSyncProSettings } from '../../src/main';
import { AutoSyncConfig } from '../../src/enhanced-sync/auto-sync-scheduler';
import { BulkImportOptions } from '../../src/enhanced-sync/bulk-import-manager';
import { JQLQueryOptions } from '../../src/enhanced-sync/jql-query-engine';

/**
 * Options for customizing plugin settings
 */
export interface PluginSettingsOptions {
  jiraUrl?: string;
  jiraUsername?: string;
  jiraApiToken?: string;
  jqlQuery?: string;
  syncInterval?: number;
  autoSyncEnabled?: boolean;
  maxResults?: number;
  batchSize?: number;
  syncFolder?: string;
}

/**
 * Options for customizing auto-sync configuration
 */
export interface AutoSyncConfigOptions {
  enabled?: boolean;
  jqlQuery?: string;
  syncInterval?: number;
  maxResults?: number;
  batchSize?: number;
}

/**
 * Options for customizing bulk import configuration
 */
export interface BulkImportOptionsCustom {
  jqlQuery?: string;
  batchSize?: number;
  skipExisting?: boolean;
  organizeByProject?: boolean;
  enableResume?: boolean;
  includeCallbacks?: boolean;
}

/**
 * Preset configuration scenarios
 */
export type ConfigScenario = 
  | 'development'
  | 'production'
  | 'testing'
  | 'minimal'
  | 'maximal'
  | 'disabled'
  | 'invalid'
  | 'cloud-instance'
  | 'server-instance'
  | 'team-lead'
  | 'developer'
  | 'qa-engineer';

/**
 * Factory class for creating configuration test data
 */
export class ConfigFactory {
  
  /**
   * Creates default plugin settings with optional overrides
   */
  static createPluginSettings(options: PluginSettingsOptions = {}): JiraSyncProSettings {
    return {
      jiraUrl: options.jiraUrl || 'https://test-company.atlassian.net',
      jiraUsername: options.jiraUsername || 'test.user@company.com',
      jiraApiToken: options.jiraApiToken || 'ATATT3xFfGF0T_fake_token_for_testing_1234567890',
      jqlQuery: options.jqlQuery || 'assignee = currentUser() AND status NOT IN (Done, Closed)',
      syncInterval: options.syncInterval || 5,
      autoSyncEnabled: options.autoSyncEnabled !== undefined ? options.autoSyncEnabled : true,
      maxResults: options.maxResults || 1000,
      batchSize: options.batchSize || 50,
      syncFolder: options.syncFolder || 'Areas/Work/Jira Tickets'
    };
  }

  /**
   * Creates plugin settings based on preset scenarios
   */
  static createScenarioSettings(scenario: ConfigScenario): JiraSyncProSettings {
    const scenarios: Record<ConfigScenario, PluginSettingsOptions> = {
      'development': {
        jiraUrl: 'https://dev-company.atlassian.net',
        jiraUsername: 'dev.user@company.com',
        jqlQuery: 'project = DEV AND assignee = currentUser()',
        syncInterval: 2, // More frequent for dev
        maxResults: 100,
        batchSize: 25,
        syncFolder: 'Development/Jira Issues'
      },
      'production': {
        jiraUrl: 'https://company.atlassian.net',
        jiraUsername: 'prod.user@company.com',
        jqlQuery: 'assignee = currentUser() AND status NOT IN (Done, Closed, Resolved)',
        syncInterval: 15, // Less frequent for prod
        maxResults: 500,
        batchSize: 50,
        syncFolder: 'Work/Current Issues'
      },
      'testing': {
        jiraUrl: 'https://test-company.atlassian.net',
        jiraUsername: 'test.user@company.com',
        jiraApiToken: 'fake-token-for-testing',
        jqlQuery: 'project = TEST',
        syncInterval: 1, // Very frequent for testing
        maxResults: 10,
        batchSize: 5,
        syncFolder: 'Test/Jira'
      },
      'minimal': {
        jiraUrl: 'https://minimal.atlassian.net',
        jiraUsername: 'user@test.com',
        jiraApiToken: 'token',
        jqlQuery: 'assignee = currentUser()',
        syncInterval: 5,
        autoSyncEnabled: false,
        maxResults: 50,
        batchSize: 10,
        syncFolder: 'Jira'
      },
      'maximal': {
        jiraUrl: 'https://enterprise.atlassian.net',
        jiraUsername: 'enterprise.user@bigcorp.com',
        jiraApiToken: 'ATATT3xFfGF0T_enterprise_token_with_all_permissions_1234567890abcdef',
        jqlQuery: 'project IN (PROJ1, PROJ2, PROJ3) AND assignee = currentUser() AND status IN ("To Do", "In Progress", "Code Review", "Testing") ORDER BY priority DESC, updated DESC',
        syncInterval: 30,
        maxResults: 1000,
        batchSize: 100,
        syncFolder: 'Enterprise/Projects/Jira Issues/Current Sprint'
      },
      'disabled': {
        jiraUrl: '',
        jiraUsername: '',
        jiraApiToken: '',
        jqlQuery: '',
        syncInterval: 5,
        autoSyncEnabled: false,
        maxResults: 50,
        batchSize: 25,
        syncFolder: 'Jira'
      },
      'invalid': {
        jiraUrl: 'not-a-valid-url',
        jiraUsername: 'invalid-email',
        jiraApiToken: 'too-short',
        jqlQuery: 'invalid JQL syntax here',
        syncInterval: 0, // Invalid
        maxResults: -1, // Invalid
        batchSize: 0, // Invalid
        syncFolder: '/invalid/absolute/path'
      },
      'cloud-instance': {
        jiraUrl: 'https://mycompany.atlassian.net',
        jiraUsername: 'cloud.user@company.com',
        jiraApiToken: 'ATATT3xFfGF0T_cloud_instance_token_1234567890',
        jqlQuery: 'assignee = currentUser() AND created >= -30d',
        syncInterval: 10,
        maxResults: 200,
        batchSize: 50,
        syncFolder: 'Cloud Jira/Current'
      },
      'server-instance': {
        jiraUrl: 'https://jira.internal.company.com',
        jiraUsername: 'server.user@company.com',
        jiraApiToken: 'server_instance_basic_auth_token_1234567890',
        jqlQuery: 'project = INTERNAL AND assignee = currentUser()',
        syncInterval: 20,
        maxResults: 300,
        batchSize: 30,
        syncFolder: 'Internal Jira/Issues'
      },
      'team-lead': {
        jiraUrl: 'https://team.atlassian.net',
        jiraUsername: 'team.lead@company.com',
        jqlQuery: 'project = TEAM AND (assignee = currentUser() OR reporter = currentUser()) AND status != Closed',
        syncInterval: 5,
        maxResults: 500,
        batchSize: 50,
        syncFolder: 'Team Management/Jira/All Issues'
      },
      'developer': {
        jiraUrl: 'https://dev.atlassian.net',
        jiraUsername: 'developer@company.com',
        jqlQuery: 'assignee = currentUser() AND type IN (Bug, Task, Story) AND status IN ("To Do", "In Progress")',
        syncInterval: 3,
        maxResults: 100,
        batchSize: 25,
        syncFolder: 'Development/My Tasks'
      },
      'qa-engineer': {
        jiraUrl: 'https://qa.atlassian.net',
        jiraUsername: 'qa.engineer@company.com',
        jqlQuery: 'status IN ("Ready for Testing", "In Testing") AND (assignee = currentUser() OR tester = currentUser())',
        syncInterval: 2,
        maxResults: 150,
        batchSize: 30,
        syncFolder: 'QA/Testing Queue'
      }
    };

    return this.createPluginSettings(scenarios[scenario]);
  }

  /**
   * Creates auto-sync configuration with optional overrides
   */
  static createAutoSyncConfig(options: AutoSyncConfigOptions = {}): AutoSyncConfig {
    return {
      enabled: options.enabled !== undefined ? options.enabled : true,
      jqlQuery: options.jqlQuery || 'assignee = currentUser() AND status NOT IN (Done, Closed)',
      syncInterval: options.syncInterval || 5,
      maxResults: options.maxResults || 1000,
      batchSize: options.batchSize || 50
    };
  }

  /**
   * Creates bulk import options with optional overrides
   */
  static createBulkImportOptions(options: BulkImportOptionsCustom = {}): BulkImportOptions {
    const baseOptions: BulkImportOptions = {
      jqlQuery: options.jqlQuery || 'project = TEST AND created >= -7d',
      batchSize: options.batchSize || 25,
      skipExisting: options.skipExisting !== undefined ? options.skipExisting : false,
      organizeByProject: options.organizeByProject !== undefined ? options.organizeByProject : true,
      enableResume: options.enableResume !== undefined ? options.enableResume : true
    };

    if (options.includeCallbacks) {
      baseOptions.onProgress = jest.fn();
      baseOptions.onError = jest.fn();
    }

    return baseOptions;
  }

  /**
   * Creates JQL query options with optional overrides
   */
  static createJQLQueryOptions(options: Partial<JQLQueryOptions> = {}): JQLQueryOptions {
    const baseOptions: JQLQueryOptions = {
      jql: options.jql || 'assignee = currentUser() AND status != Done',
      maxResults: options.maxResults || 100,
      batchSize: options.batchSize || 50,
      fields: options.fields || ['summary', 'status', 'assignee', 'priority', 'created', 'updated'],
      enableRetry: options.enableRetry !== undefined ? options.enableRetry : true
    };

    if (options.onProgress) {
      baseOptions.onProgress = options.onProgress;
    }

    if (options.signal) {
      baseOptions.signal = options.signal;
    }

    return baseOptions;
  }

  /**
   * Creates configuration for different environments
   */
  static createEnvironmentConfig(env: 'dev' | 'test' | 'staging' | 'prod'): {
    settings: JiraSyncProSettings;
    autoSync: AutoSyncConfig;
    bulkImport: BulkImportOptions;
  } {
    const envConfigs = {
      dev: {
        urlSuffix: 'dev-company.atlassian.net',
        userSuffix: 'dev.user@company.com',
        syncInterval: 1,
        maxResults: 50,
        batchSize: 10,
        folder: 'Dev/Jira'
      },
      test: {
        urlSuffix: 'test-company.atlassian.net',
        userSuffix: 'test.user@company.com',
        syncInterval: 2,
        maxResults: 25,
        batchSize: 5,
        folder: 'Test/Jira'
      },
      staging: {
        urlSuffix: 'staging-company.atlassian.net',
        userSuffix: 'staging.user@company.com',
        syncInterval: 10,
        maxResults: 200,
        batchSize: 25,
        folder: 'Staging/Jira'
      },
      prod: {
        urlSuffix: 'company.atlassian.net',
        userSuffix: 'prod.user@company.com',
        syncInterval: 30,
        maxResults: 500,
        batchSize: 50,
        folder: 'Production/Jira'
      }
    };

    const config = envConfigs[env];
    
    const settings = this.createPluginSettings({
      jiraUrl: `https://${config.urlSuffix}`,
      jiraUsername: config.userSuffix,
      syncInterval: config.syncInterval,
      maxResults: config.maxResults,
      batchSize: config.batchSize,
      syncFolder: config.folder
    });

    const autoSync = this.createAutoSyncConfig({
      syncInterval: config.syncInterval,
      maxResults: config.maxResults,
      batchSize: config.batchSize
    });

    const bulkImport = this.createBulkImportOptions({
      batchSize: config.batchSize
    });

    return { settings, autoSync, bulkImport };
  }

  /**
   * Creates invalid configuration for testing error handling
   */
  static createInvalidConfigurations(): {
    emptyUrl: JiraSyncProSettings;
    invalidUrl: JiraSyncProSettings;
    missingToken: JiraSyncProSettings;
    invalidEmail: JiraSyncProSettings;
    invalidJQL: JiraSyncProSettings;
    invalidInterval: JiraSyncProSettings;
    invalidBatchSize: JiraSyncProSettings;
    invalidMaxResults: JiraSyncProSettings;
    invalidFolder: JiraSyncProSettings;
  } {
    return {
      emptyUrl: this.createPluginSettings({ jiraUrl: '' }),
      invalidUrl: this.createPluginSettings({ jiraUrl: 'not-a-url' }),
      missingToken: this.createPluginSettings({ jiraApiToken: '' }),
      invalidEmail: this.createPluginSettings({ jiraUsername: 'not-an-email' }),
      invalidJQL: this.createPluginSettings({ jqlQuery: 'invalid JQL syntax here' }),
      invalidInterval: this.createPluginSettings({ syncInterval: 0 }),
      invalidBatchSize: this.createPluginSettings({ batchSize: 0 }),
      invalidMaxResults: this.createPluginSettings({ maxResults: -1 }),
      invalidFolder: this.createPluginSettings({ syncFolder: '/absolute/path' })
    };
  }

  /**
   * Creates configuration with security-focused settings
   */
  static createSecureConfig(): JiraSyncProSettings {
    return this.createPluginSettings({
      jiraUrl: 'https://secure-company.atlassian.net',
      jiraUsername: 'secure.user@company.com',
      jiraApiToken: 'ATATT3xFfGF0T_secure_token_with_minimal_permissions_1234567890',
      jqlQuery: 'assignee = currentUser() AND project = SECURE AND created >= -7d',
      syncInterval: 30, // Less frequent for security
      maxResults: 100, // Smaller batches
      batchSize: 10,
      syncFolder: 'Secure/Jira/Current'
    });
  }

  /**
   * Creates performance-optimized configuration
   */
  static createPerformanceConfig(): JiraSyncProSettings {
    return this.createPluginSettings({
      jiraUrl: 'https://fast-company.atlassian.net',
      jiraUsername: 'performance.user@company.com',
      jqlQuery: 'assignee = currentUser() AND updated >= -1d', // Only recent updates
      syncInterval: 60, // Less frequent to reduce load
      maxResults: 50, // Smaller result set
      batchSize: 10, // Smaller batches
      syncFolder: 'Performance/Jira'
    });
  }

  /**
   * Creates configuration for bulk operations testing
   */
  static createBulkTestConfig(): {
    small: BulkImportOptions;
    medium: BulkImportOptions;
    large: BulkImportOptions;
    withResume: BulkImportOptions;
    withCallbacks: BulkImportOptions;
  } {
    return {
      small: this.createBulkImportOptions({
        jqlQuery: 'project = TEST AND created >= -1d',
        batchSize: 5,
        skipExisting: false,
        organizeByProject: false,
        enableResume: false
      }),
      medium: this.createBulkImportOptions({
        jqlQuery: 'project IN (TEST1, TEST2) AND created >= -7d',
        batchSize: 25,
        skipExisting: true,
        organizeByProject: true,
        enableResume: true
      }),
      large: this.createBulkImportOptions({
        jqlQuery: 'assignee was currentUser() AND created >= -30d',
        batchSize: 50,
        skipExisting: true,
        organizeByProject: true,
        enableResume: true
      }),
      withResume: this.createBulkImportOptions({
        jqlQuery: 'project = RESUME AND created >= -14d',
        batchSize: 20,
        skipExisting: false,
        organizeByProject: true,
        enableResume: true
      }),
      withCallbacks: this.createBulkImportOptions({
        jqlQuery: 'project = CALLBACK AND created >= -7d',
        batchSize: 15,
        includeCallbacks: true
      })
    };
  }

  /**
   * Creates configuration presets for different user roles
   */
  static createRoleBasedConfigs(): Record<string, JiraSyncProSettings> {
    return {
      admin: this.createPluginSettings({
        jiraUsername: 'admin@company.com',
        jqlQuery: 'project in projectsWhereUserHasRole("Administrators") AND status != Closed',
        syncInterval: 15,
        maxResults: 1000,
        batchSize: 100,
        syncFolder: 'Administration/All Projects'
      }),
      projectManager: this.createPluginSettings({
        jiraUsername: 'pm@company.com',
        jqlQuery: 'project in projectsWhereUserHasRole("Project Lead") AND (assignee = currentUser() OR reporter = currentUser())',
        syncInterval: 10,
        maxResults: 500,
        batchSize: 50,
        syncFolder: 'Project Management/Issues'
      }),
      developer: this.createPluginSettings({
        jiraUsername: 'dev@company.com',
        jqlQuery: 'assignee = currentUser() AND type IN (Bug, Task, Story, Sub-task)',
        syncInterval: 5,
        maxResults: 200,
        batchSize: 25,
        syncFolder: 'Development/My Work'
      }),
      tester: this.createPluginSettings({
        jiraUsername: 'tester@company.com',
        jqlQuery: 'status IN ("Ready for Testing", "In Testing", "Failed Testing") AND (assignee = currentUser() OR tester = currentUser())',
        syncInterval: 3,
        maxResults: 150,
        batchSize: 20,
        syncFolder: 'Testing/Queue'
      }),
      viewer: this.createPluginSettings({
        jiraUsername: 'viewer@company.com',
        jqlQuery: 'project = PUBLIC AND created >= -7d',
        syncInterval: 30,
        maxResults: 50,
        batchSize: 10,
        syncFolder: 'Read Only/Public Issues'
      })
    };
  }

  /**
   * Creates default settings for the application (matches main.ts)
   */
  static createDefaultSettings(): JiraSyncProSettings {
    return {
      jiraUrl: '',
      jiraUsername: '',
      jiraApiToken: '',
      jqlQuery: 'assignee = currentUser() AND status NOT IN (Done, Closed)',
      syncInterval: 5,
      autoSyncEnabled: false,
      maxResults: 1000,
      batchSize: 50,
      syncFolder: 'Areas/Work/Jira Tickets'
    };
  }
}