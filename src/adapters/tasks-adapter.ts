/**
 * TasksAdapter - Obsidian Tasks Plugin Integration
 * Converts Jira issues to Tasks format with bidirectional sync support
 */

import { TFile, Vault, MetadataCache, App } from 'obsidian';
import {
  PluginAdapterBase,
  ConversionResult,
  SyncContext,
} from './plugin-adapter-base';
import { JiraIssue } from '../types/jira-types';
import {
  TaskItem,
  TaskStatus,
  TasksAdapterConfig,
  JiraTaskMapping,
  TasksBulkResult,
} from '../types/tasks-types';
import { TaskFormatConverter } from '../utils/task-format-converter';
import { EventBus } from '../events/event-bus';

export class TasksAdapter extends PluginAdapterBase<
  TaskItem,
  TasksAdapterConfig
> {
  private readonly converter: TaskFormatConverter;
  private tasksPlugin: unknown; // Tasks plugin instance
  private readonly vault: Vault;
  private readonly metadataCache: MetadataCache;
  private readonly taskMappings: Map<string, JiraTaskMapping> = new Map();
  private readonly app: App;

  constructor(config: TasksAdapterConfig, eventBus: EventBus, app: App) {
    super(config, eventBus);
    this.app = app;
    this.vault = app.vault;
    this.metadataCache = app.metadataCache;
    this.converter = new TaskFormatConverter({
      preserveJiraKey: config.useJiraKeyAsId,
      includeJiraUrl: config.includeJiraUrl,
      defaultFilePath: config.defaultFilePath,
      mapJiraLabelsToTags: config.mapJiraLabelsToTags,
      statusMappings: new Map(Object.entries(config.statusMappings)),
      priorityMappings: new Map(Object.entries(config.priorityMappings)),
      dateFormat: config.dateFormat,
    });
    this.validateConfig();
  }

  /**
   * Initialize the adapter
   */
  async initialize(): Promise<void> {
    try {
      this.logger.log('Initializing TasksAdapter...');

      // Get Tasks plugin instance
      this.tasksPlugin = this.app.plugins.plugins['obsidian-tasks-plugin'];

      if (!this.tasksPlugin) {
        throw new Error('Tasks plugin not found or not enabled');
      }

      // Load existing task mappings
      await this.loadTaskMappings();

      // Set up event listeners
      this.setupEventListeners();

      this.logger.log('TasksAdapter initialized successfully');
    } catch (error) {
      throw new Error(`Failed to initialize TasksAdapter: ${error.message}`);
    }
  }

  /**
   * Clean up resources
   */
  async dispose(): Promise<void> {
    try {
      // Save task mappings
      await this.saveTaskMappings();

      // Clean up event listeners
      this.cleanupEventListeners();

      this.logger.log('TasksAdapter disposed');
    } catch (error) {
      this.logger.error('Error disposing TasksAdapter:', error);
    }
  }

  /**
   * Check if Tasks plugin is available
   */
  async isPluginAvailable(): Promise<boolean> {
    return !!this.app.plugins.plugins['obsidian-tasks-plugin']?.enabled;
  }

  /**
   * Convert Jira issue to Tasks format
   */
  async convertFromJira(
    issue: JiraIssue,
    context?: SyncContext
  ): Promise<ConversionResult<TaskItem>> {
    const startTime = performance.now();

    try {
      const conversionResult = this.converter.convertJiraToTask(issue);

      // Set file path based on configuration
      const filePath = this.determineFilePath(issue);
      conversionResult.task.filePath = filePath;

      // Add Jira metadata
      const metadata = {
        jiraKey: issue.key,
        jiraUrl: issue.self,
        lastSynced: new Date().toISOString(),
        syncContext: context,
      };

      const conversionTime = performance.now() - startTime;

      return {
        success: true,
        data: conversionResult.task,
        warnings: conversionResult.warnings,
        metadata: {
          ...metadata,
          conversionTime,
          mappedFields: conversionResult.mappedFields,
          unmappedFields: conversionResult.unmappedFields,
          requiresManualReview: conversionResult.requiresManualReview,
        },
      };
    } catch (error) {
      return {
        success: false,
        errors: [
          {
            code: 'CONVERSION_ERROR',
            message: `Failed to convert issue ${issue.key}: ${error.message}`,
            retryable: false,
            context: { issueKey: issue.key, error },
          },
        ],
      };
    }
  }

  /**
   * Convert Tasks format back to Jira
   */
  async convertToJira(
    task: TaskItem,
    context?: SyncContext
  ): Promise<ConversionResult<Partial<JiraIssue>>> {
    try {
      const jiraUpdate = this.converter.convertTaskToJira(task);

      return {
        success: true,
        data: jiraUpdate,
        metadata: {
          taskFilePath: task.filePath,
          taskLineNumber: task.lineNumber,
          syncContext: context,
        },
      };
    } catch (error) {
      return {
        success: false,
        errors: [
          {
            code: 'REVERSE_CONVERSION_ERROR',
            message: `Failed to convert task to Jira format: ${error.message}`,
            retryable: false,
            context: { task, error },
          },
        ],
      };
    }
  }

  /**
   * Apply converted task to Tasks plugin
   */
  async applyToPlugin(
    task: TaskItem,
    context?: SyncContext
  ): Promise<ConversionResult<void>> {
    try {
      const startTime = performance.now();

      // Ensure target file exists
      const file = await this.ensureFileExists(task.filePath);

      // Check if task already exists (for updates)
      const existingMapping = this.findTaskMapping(context?.issueKey);

      if (existingMapping) {
        // Update existing task
        await this.updateExistingTask(existingMapping, task, file);
      } else {
        // Create new task
        await this.createNewTask(task, file, context?.issueKey);
      }

      const processingTime = performance.now() - startTime;

      // Emit event
      this.eventBus.emit('tasks:task:synced', {
        jiraKey: context?.issueKey,
        taskFilePath: task.filePath,
        operation: existingMapping ? 'update' : 'create',
        processingTime,
      });

      return {
        success: true,
        metadata: {
          operation: existingMapping ? 'update' : 'create',
          filePath: task.filePath,
          processingTime,
        },
      };
    } catch (error) {
      return {
        success: false,
        errors: [
          {
            code: 'APPLY_ERROR',
            message: `Failed to apply task to plugin: ${error.message}`,
            retryable: true,
            context: { task, error },
          },
        ],
      };
    }
  }

  /**
   * Bulk sync multiple issues
   */
  async syncBulkIssues(
    issues: JiraIssue[],
    context?: SyncContext
  ): Promise<TasksBulkResult> {
    const startTime = performance.now();
    const result: TasksBulkResult = {
      successful: [],
      failed: [],
      totalProcessed: issues.length,
      duration: 0,
    };

    const batchSize = this.config.batchSize;

    for (let i = 0; i < issues.length; i += batchSize) {
      const batch = issues.slice(i, i + batchSize);
      const batchPromises = batch.map(async issue => {
        try {
          const syncResult = await this.syncIssueToPlugin(issue, context);
          if (syncResult.success) {
            const taskResult = await this.convertFromJira(issue, context);
            if (taskResult.success) {
              result.successful.push({
                taskId: issue.key,
                task: taskResult.data!,
              });
            }
          } else {
            result.failed.push({
              taskId: issue.key,
              error: syncResult.errors?.[0]?.message || 'Unknown error',
              context: { issue },
            });
          }
        } catch (error) {
          result.failed.push({
            taskId: issue.key,
            error: error.message,
            context: { issue, error },
          });
        }
      });

      await Promise.all(batchPromises);
    }

    result.duration = performance.now() - startTime;

    // Emit bulk sync event
    this.eventBus.emit('tasks:bulk:completed', {
      totalProcessed: result.totalProcessed,
      successful: result.successful.length,
      failed: result.failed.length,
      duration: result.duration,
    });

    return result;
  }

  /**
   * Search for tasks based on criteria
   */
  async findTasksByJiraKeys(jiraKeys: string[]): Promise<TaskItem[]> {
    const foundTasks: TaskItem[] = [];

    for (const jiraKey of jiraKeys) {
      const mapping = this.taskMappings.get(jiraKey);
      if (mapping) {
        try {
          const task = await this.getTaskFromFile(
            mapping.filePath,
            mapping.lineNumber
          );
          if (task) {
            foundTasks.push(task);
          }
        } catch (error) {
          this.logger.warn(`Failed to load task for ${jiraKey}:`, error);
        }
      }
    }

    return foundTasks;
  }

  /**
   * Toggle task status and sync back to Jira
   */
  async toggleTaskStatus(jiraKey: string): Promise<ConversionResult<TaskItem>> {
    try {
      const mapping = this.taskMappings.get(jiraKey);
      if (!mapping) {
        return {
          success: false,
          errors: [
            {
              code: 'TASK_NOT_FOUND',
              message: `No task mapping found for ${jiraKey}`,
              retryable: false,
            },
          ],
        };
      }

      const task = await this.getTaskFromFile(
        mapping.filePath,
        mapping.lineNumber
      );
      if (!task) {
        return {
          success: false,
          errors: [
            {
              code: 'TASK_NOT_FOUND',
              message: `Task not found at ${mapping.filePath}:${mapping.lineNumber}`,
              retryable: false,
            },
          ],
        };
      }

      // Toggle status
      const newStatus =
        task.status === TaskStatus.DONE ? TaskStatus.TODO : TaskStatus.DONE;
      task.status = newStatus;

      if (newStatus === TaskStatus.DONE) {
        task.doneDate = new Date();
      } else {
        task.doneDate = undefined;
      }

      // Update task in file
      await this.updateTaskInFile(task, mapping.filePath, mapping.lineNumber);

      // Update mapping
      mapping.lastSynced = new Date();
      mapping.syncStatus = 'pending';

      // Emit event for Jira sync
      this.eventBus.emit('tasks:status:changed', {
        jiraKey,
        oldStatus:
          task.status === TaskStatus.DONE ? TaskStatus.TODO : TaskStatus.DONE,
        newStatus,
        task,
      });

      return {
        success: true,
        data: task,
      };
    } catch (error) {
      return {
        success: false,
        errors: [
          {
            code: 'TOGGLE_ERROR',
            message: `Failed to toggle task status: ${error.message}`,
            retryable: true,
            context: { jiraKey, error },
          },
        ],
      };
    }
  }

  // Private helper methods

  private determineFilePath(issue: JiraIssue): string {
    if (this.config.useProjectFolders && issue.fields?.project?.key) {
      const projectPath = this.config.projectFolderTemplate
        .replace('{projectKey}', issue.fields.project.key)
        .replace(
          '{projectName}',
          issue.fields.project.name || issue.fields.project.key
        );
      return `${projectPath}/${issue.key}.md`;
    }

    return this.config.defaultFilePath;
  }

  private async ensureFileExists(filePath: string): Promise<TFile> {
    let file = this.vault.getAbstractFileByPath(filePath) as TFile;

    if (!file) {
      // Create directory structure if needed
      const dirPath = filePath.substring(0, filePath.lastIndexOf('/'));
      if (dirPath && !this.vault.getAbstractFileByPath(dirPath)) {
        await this.vault.createFolder(dirPath);
      }

      // Create file
      const initialContent = this.config.createInCurrentFile
        ? ''
        : `# Tasks from Jira\n\nSynced on ${new Date().toISOString()}\n\n`;

      file = await this.vault.create(filePath, initialContent);
    }

    return file;
  }

  private async createNewTask(
    task: TaskItem,
    file: TFile,
    jiraKey?: string
  ): Promise<void> {
    const content = await this.vault.read(file);
    const lines = content.split('\n');

    // Find insertion point (end of file or before first empty line)
    let insertLine = lines.length;
    if (this.config.appendToExistingFile) {
      insertLine = lines.length;
    } else {
      // Insert after heading if found
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].startsWith('#')) {
          insertLine = i + 1;
          break;
        }
      }
    }

    // Insert task
    const taskMarkdown = this.converter.formatTaskAsMarkdown(task);
    lines.splice(insertLine, 0, taskMarkdown);

    // Write back to file
    await this.vault.modify(file, lines.join('\n'));

    // Create mapping if Jira key provided
    if (jiraKey) {
      const mapping: JiraTaskMapping = {
        jiraKey,
        taskId: undefined,
        filePath: file.path,
        lineNumber: insertLine,
        lastSynced: new Date(),
        syncDirection: this.config.syncDirection,
        syncStatus: 'synced',
      };
      this.taskMappings.set(jiraKey, mapping);
    }

    task.lineNumber = insertLine;
  }

  private async updateExistingTask(
    mapping: JiraTaskMapping,
    task: TaskItem,
    file: TFile
  ): Promise<void> {
    const content = await this.vault.read(file);
    const lines = content.split('\n');

    if (mapping.lineNumber < lines.length) {
      // Update the specific line
      const taskMarkdown = this.converter.formatTaskAsMarkdown(task);
      lines[mapping.lineNumber] = taskMarkdown;

      await this.vault.modify(file, lines.join('\n'));

      // Update mapping
      mapping.lastSynced = new Date();
      mapping.syncStatus = 'synced';
    } else {
      // Line number is invalid, create new task
      await this.createNewTask(task, file, mapping.jiraKey);
    }
  }

  private async getTaskFromFile(
    filePath: string,
    lineNumber: number
  ): Promise<TaskItem | null> {
    try {
      const file = this.vault.getAbstractFileByPath(filePath) as TFile;
      if (!file) return null;

      const content = await this.vault.read(file);
      const lines = content.split('\n');

      if (lineNumber >= lines.length) return null;

      const line = lines[lineNumber];
      const parsedLine = this.converter.parseTaskLine(line);

      if (!parsedLine) return null;

      // Convert to TaskItem
      const task: TaskItem = {
        description: parsedLine.description,
        status: parsedLine.status as TaskStatus,
        priority: (parsedLine.priority as string) || undefined,
        dueDate: parsedLine.due ? new Date(parsedLine.due) : undefined,
        created: parsedLine.created ? new Date(parsedLine.created) : undefined,
        tags: parsedLine.tags,
        originalMarkdown: line,
        filePath,
        lineNumber,
      };

      return task;
    } catch (error) {
      this.logger.error(
        `Failed to get task from ${filePath}:${lineNumber}:`,
        error
      );
      return null;
    }
  }

  private async updateTaskInFile(
    task: TaskItem,
    filePath: string,
    lineNumber: number
  ): Promise<void> {
    const file = this.vault.getAbstractFileByPath(filePath) as TFile;
    if (!file) return;

    const content = await this.vault.read(file);
    const lines = content.split('\n');

    if (lineNumber < lines.length) {
      const taskMarkdown = this.converter.formatTaskAsMarkdown(task);
      lines[lineNumber] = taskMarkdown;
      await this.vault.modify(file, lines.join('\n'));
    }
  }

  private findTaskMapping(jiraKey?: string): JiraTaskMapping | undefined {
    if (!jiraKey) return undefined;
    return this.taskMappings.get(jiraKey);
  }

  private async loadTaskMappings(): Promise<void> {
    try {
      const mappingFile = `${this.vault.configDir}/plugins/obsidian-jira-sync-pro/task-mappings.json`;
      const file = this.vault.getAbstractFileByPath(mappingFile);

      if (file instanceof TFile) {
        const content = await this.vault.read(file);
        const mappings = JSON.parse(content);

        Object.entries(mappings).forEach(([jiraKey, mapping]) => {
          this.taskMappings.set(jiraKey, mapping as JiraTaskMapping);
        });
      }
    } catch (error) {
      this.logger.warn('Failed to load task mappings:', error);
    }
  }

  private async saveTaskMappings(): Promise<void> {
    try {
      const mappingFile = `${this.vault.configDir}/plugins/obsidian-jira-sync-pro/task-mappings.json`;
      const mappingsObj: Record<string, JiraTaskMapping> = {};

      this.taskMappings.forEach((mapping, jiraKey) => {
        mappingsObj[jiraKey] = mapping;
      });

      await this.vault.adapter.write(
        mappingFile,
        JSON.stringify(mappingsObj, null, 2)
      );
    } catch (error) {
      this.logger.error('Failed to save task mappings:', error);
    }
  }

  private setupEventListeners(): void {
    // Listen for task toggle events from Tasks plugin
    this.eventBus.on('tasks:task:toggled', this.handleTaskToggled.bind(this));

    // Listen for Jira issue updates
    this.eventBus.on(
      'jira:issue:updated',
      this.handleJiraIssueUpdated.bind(this)
    );
  }

  private cleanupEventListeners(): void {
    this.eventBus.off('tasks:task:toggled', this.handleTaskToggled.bind(this));
    this.eventBus.off(
      'jira:issue:updated',
      this.handleJiraIssueUpdated.bind(this)
    );
  }

  private async handleTaskToggled(event: unknown): Promise<void> {
    // Implementation for handling task toggle events
    console.log('Handling task toggled event:', {
      hasEvent: !!event,
      eventType: typeof event,
    });
    this.logger.log('Task toggled:', event);
  }

  private async handleJiraIssueUpdated(event: unknown): Promise<void> {
    // Implementation for handling Jira issue updates
    console.log('Handling Jira issue updated event:', {
      hasEvent: !!event,
      eventType: typeof event,
    });
    this.logger.log('Jira issue updated:', event);
  }
}
