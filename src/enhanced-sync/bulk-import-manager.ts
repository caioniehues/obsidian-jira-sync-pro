import { Plugin, Notice, TFile, normalizePath } from 'obsidian';
import { JQLQueryEngine, JiraIssue } from './jql-query-engine';

/**
 * Options for bulk import operation
 */
export interface BulkImportOptions {
  jqlQuery: string;
  batchSize?: number;
  skipExisting?: boolean;
  organizeByProject?: boolean;
  enableResume?: boolean;
  onProgress?: (current: number, total: number, phase: ImportPhase, details?: any) => void;
  onError?: (ticketKey: string, error: string) => void;
}

/**
 * Result of bulk import operation
 */
export interface BulkImportResult {
  totalImported: number;
  failedImports: number;
  skipped: number;
  updated: number;
  batches: number;
  errors: ImportError[];
  duration: number;
  averageTimePerTicket: number;
  cancelled?: boolean;
  resumedFrom?: string;
}

/**
 * Import error details
 */
export interface ImportError {
  ticketKey: string;
  error: string;
  category?: 'network' | 'validation' | 'filesystem' | 'unknown';
}

/**
 * Saved import state for resume capability
 */
export interface BulkImportState {
  lastImportedKey: string;
  totalProcessed: number;
  query: string;
  timestamp: string;
  errors: ImportError[];
}

/**
 * Import phase for progress reporting
 */
export type ImportPhase = 'fetching' | 'importing' | 'complete' | 'cancelled' | 'error';

/**
 * Manages bulk import of Jira tickets with progress tracking and resume capability
 */
export class BulkImportManager {
  private readonly plugin: Plugin;
  private readonly queryEngine: JQLQueryEngine;
  private readonly syncFolder: string;
  private isImporting: boolean = false;
  private shouldCancel: boolean = false;
  private errors: ImportError[] = [];
  private readonly importState: BulkImportState | null = null;
  private startTime: number = 0;
  private processedCount: number = 0;

  constructor(plugin: Plugin, queryEngine: JQLQueryEngine, syncFolder: string) {
    this.plugin = plugin;
    this.queryEngine = queryEngine;
    this.syncFolder = syncFolder;
  }

  /**
   * Starts a bulk import operation
   */
  async startImport(options: BulkImportOptions): Promise<BulkImportResult | null> {
    // Prevent concurrent imports
    if (this.isImporting) {
      new Notice('Import already in progress');
      return null;
    }

    this.isImporting = true;
    this.shouldCancel = false;
    this.errors = [];
    this.processedCount = 0;
    this.startTime = Date.now();

    try {
      // Ensure sync folder exists
      await this.ensureSyncFolder();

      // Report fetching phase
      this.reportProgress(options.onProgress, 0, 0, 'fetching');

      // Fetch all tickets using JQL query
      const queryResult = await this.queryEngine.executeQuery({
        jql: options.jqlQuery,
        maxResults: 1000, // Maximum allowed
        batchSize: 50, // API batch size
        onProgress: (current, total) => {
          this.reportProgress(options.onProgress, current, total, 'fetching');
        }
      });

      const tickets = queryResult.issues;
      const total = tickets.length;

      if (total === 0) {
        this.reportProgress(options.onProgress, 0, 0, 'complete');
        return this.createResult(0, 0, 0, 0, 0);
      }

      // Process tickets in batches
      const batchSize = options.batchSize || 25;
      const batches = Math.ceil(total / batchSize);
      let imported = 0;
      let failed = 0;
      let skipped = 0;
      let updated = 0;

      for (let batch = 0; batch < batches; batch++) {
        if (this.shouldCancel) {
          this.reportProgress(options.onProgress, imported, total, 'cancelled');
          return this.createResult(imported, failed, skipped, updated, batch + 1, true);
        }

        const start = batch * batchSize;
        const end = Math.min(start + batchSize, total);
        const batchTickets = tickets.slice(start, end);

        // Process batch
        for (const ticket of batchTickets) {
          if (this.shouldCancel) {
            break;
          }

          try {
            const result = await this.processTicket(ticket, options);
            
            if (result === 'created') {
              imported++;
            } else if (result === 'updated') {
              updated++;
              imported++;
            } else if (result === 'skipped') {
              skipped++;
            }
            
            this.processedCount++;
          } catch (error) {
            failed++;
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.addError(ticket.key, errorMessage, 'filesystem');
            
            if (options.onError) {
              options.onError(ticket.key, errorMessage);
            }
          }

          // Report progress
          const current = imported + failed + skipped;
          this.reportProgress(
            options.onProgress,
            current,
            total,
            current < total ? 'importing' : 'complete',
            { batch: batch + 1, batches }
          );
        }

        // Save state after each batch for resume capability
        if (options.enableResume && batchTickets.length > 0) {
          await this.saveImportState({
            lastImportedKey: batchTickets[batchTickets.length - 1].key,
            totalProcessed: imported + failed + skipped,
            query: options.jqlQuery,
            timestamp: new Date().toISOString(),
            errors: this.errors
          });
        }
      }

      // Clear state on successful completion
      if (options.enableResume) {
        await this.clearImportState();
      }

      this.reportProgress(options.onProgress, total, total, 'complete');
      return this.createResult(imported, failed, skipped, updated, batches);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.reportProgress(options.onProgress, this.processedCount, 0, 'error');
      throw new Error(`Bulk import failed: ${errorMessage}`);
    } finally {
      this.isImporting = false;
      this.shouldCancel = false;
    }
  }

  /**
   * Resumes a previously interrupted import
   */
  async resumeImport(options: Omit<BulkImportOptions, 'jqlQuery'>): Promise<BulkImportResult | null> {
    const state = await this.loadImportState();
    if (!state) {
      new Notice('No import to resume');
      return null;
    }

    // Modify JQL to fetch only remaining tickets
    const resumeQuery = `${state.query} AND key > ${state.lastImportedKey} ORDER BY key ASC`;
    
    const result = await this.startImport({
      ...options,
      jqlQuery: resumeQuery,
      enableResume: true
    });

    if (result) {
      result.resumedFrom = state.lastImportedKey;
    }

    return result;
  }

  /**
   * Cancels the current import operation
   */
  cancelImport(): void {
    if (this.isImporting) {
      this.shouldCancel = true;
      new Notice('Import cancellation requested');
    }
  }

  /**
   * Processes a single ticket
   */
  private async processTicket(
    ticket: JiraIssue,
    options: BulkImportOptions
  ): Promise<'created' | 'updated' | 'skipped'> {
    // Validate ticket data
    if (!ticket.fields?.summary) {
      throw new Error('Invalid ticket data: missing fields or summary');
    }

    // Determine file path
    const folder = options.organizeByProject && ticket.fields.project
      ? `${this.syncFolder}/${ticket.fields.project.key}`
      : this.syncFolder;
    
    await this.ensureFolder(folder);
    
    const fileName = `${ticket.key}.md`;
    const filePath = normalizePath(`${folder}/${fileName}`);

    // Check if file exists
    const existingFile = this.plugin.app.vault.getAbstractFileByPath(filePath);
    
    if (existingFile && options.skipExisting) {
      return 'skipped';
    }

    // Create note content
    const content = this.createNoteContent(ticket);

    if (existingFile instanceof TFile) {
      // Update existing file
      await this.plugin.app.vault.modify(existingFile, content);
      return 'updated';
    } else {
      // Create new file
      await this.plugin.app.vault.create(filePath, content);
      return 'created';
    }
  }

  /**
   * Creates note content from Jira ticket
   */
  private createNoteContent(ticket: JiraIssue): string {
    const fields = ticket.fields;
    const frontmatter = [
      '---',
      `jira-key: ${ticket.key}`,
      `status: ${fields.status?.name || 'Unknown'}`,
      `assignee: ${fields.assignee?.displayName || 'Unassigned'}`,
      `priority: ${fields.priority?.name || 'None'}`,
      `created: ${fields.created || ''}`,
      `updated: ${fields.updated || ''}`,
      `type: ${fields.issuetype?.name || 'Unknown'}`,
      `project: ${fields.project?.key || 'Unknown'}`,
      '---',
      ''
    ].join('\n');

    const content = [
      `# ${ticket.key}: ${fields.summary}`,
      '',
      '## Description',
      fields.description || '*No description provided*',
      '',
      '## Details',
      `- **Status**: ${fields.status?.name || 'Unknown'}`,
      `- **Assignee**: ${fields.assignee?.displayName || 'Unassigned'}`,
      `- **Priority**: ${fields.priority?.name || 'None'}`,
      `- **Type**: ${fields.issuetype?.name || 'Unknown'}`,
      `- **Project**: ${fields.project?.name || 'Unknown'}`,
      '',
      '## Notes',
      '',
      '*Add your notes here*',
      '',
      '---',
      `*Imported from Jira on ${new Date().toLocaleDateString()}*`
    ].join('\n');

    return frontmatter + content;
  }

  /**
   * Ensures sync folder exists
   */
  private async ensureSyncFolder(): Promise<void> {
    await this.ensureFolder(this.syncFolder);
  }

  /**
   * Ensures a folder exists
   */
  private async ensureFolder(folderPath: string): Promise<void> {
    const folder = this.plugin.app.vault.getAbstractFileByPath(folderPath);
    if (!folder) {
      await this.plugin.app.vault.createFolder(folderPath);
    }
  }

  /**
   * Reports progress to callback
   */
  private reportProgress(
    callback: ((current: number, total: number, phase: ImportPhase, details?: any) => void) | undefined,
    current: number,
    total: number,
    phase: ImportPhase,
    details?: any
  ): void {
    if (callback) {
      try {
        callback(current, total, phase, details);
      } catch (error) {
        console.error('Progress callback error:', error);
      }
    }
  }

  /**
   * Creates import result
   */
  private createResult(
    imported: number,
    failed: number,
    skipped: number,
    updated: number,
    batches: number,
    cancelled: boolean = false
  ): BulkImportResult {
    const duration = Date.now() - this.startTime;
    const total = imported + failed + skipped;
    const averageTime = total > 0 ? duration / total : 0;

    return {
      totalImported: imported,
      failedImports: failed,
      skipped,
      updated,
      batches,
      errors: [...this.errors],
      duration,
      averageTimePerTicket: averageTime,
      cancelled
    };
  }

  /**
   * Adds an error to the collection
   */
  addError(ticketKey: string, error: string, category?: ImportError['category']): void {
    this.errors.push({
      ticketKey,
      error,
      category: category || 'unknown'
    });
  }

  /**
   * Gets a formatted error report
   */
  getErrorReport(): string {
    if (this.errors.length === 0) {
      return 'No errors occurred during import';
    }

    const categoryCounts = this.errors.reduce((acc, error) => {
      const cat = error.category || 'unknown';
      acc[cat] = (acc[cat] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const lines = [
      `Total Errors: ${this.errors.length}`,
      '',
      'Error Categories:'
    ];

    for (const [category, count] of Object.entries(categoryCounts)) {
      lines.push(`- ${category.charAt(0).toUpperCase() + category.slice(1)} Errors: ${count}`);
    }

    lines.push('', 'Error Details:');
    for (const error of this.errors) {
      lines.push(`- ${error.ticketKey}: ${error.error}`);
    }

    return lines.join('\n');
  }

  /**
   * Saves import state for resume capability
   */
  private async saveImportState(state: BulkImportState): Promise<void> {
    const data = await this.plugin.loadData() || {};
    data.bulkImportState = state;
    await this.plugin.saveData(data);
  }

  /**
   * Loads saved import state
   */
  private async loadImportState(): Promise<BulkImportState | null> {
    const data = await this.plugin.loadData() || {};
    return data.bulkImportState || null;
  }

  /**
   * Clears saved import state
   */
  private async clearImportState(): Promise<void> {
    const data = await this.plugin.loadData() || {};
    delete data.bulkImportState;
    await this.plugin.saveData(data);
  }
}