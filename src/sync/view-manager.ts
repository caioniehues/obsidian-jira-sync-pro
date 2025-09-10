import { Plugin, WorkspaceLeaf } from 'obsidian';
import { SyncStatusView, SYNC_STATUS_VIEW_TYPE } from './sync-status-view';
import { AutoSyncScheduler } from '../enhanced-sync/auto-sync-scheduler';
import { BulkImportManager } from '../enhanced-sync/bulk-import-manager';
import { JQLQueryEngine } from '../enhanced-sync/jql-query-engine';

/**
 * Manages the registration and lifecycle of sync-related views
 */
export class SyncViewManager {
  private plugin: Plugin;
  private statusView: SyncStatusView | null = null;

  constructor(plugin: Plugin) {
    this.plugin = plugin;
  }

  /**
   * Registers all sync views with the workspace
   */
  registerViews(): void {
    // Register the sync status view type
    this.plugin.registerView(
      SYNC_STATUS_VIEW_TYPE,
      (leaf) => {
        this.statusView = new SyncStatusView(leaf, this.plugin);
        return this.statusView;
      }
    );

    // Add ribbon icon to open the status view
    this.plugin.addRibbonIcon('activity', 'Jira Sync Status', () => {
      this.activateSyncStatusView();
    });

    // Add command to open sync status
    this.plugin.addCommand({
      id: 'open-sync-status',
      name: 'Open Sync Status Dashboard',
      callback: () => {
        this.activateSyncStatusView();
      }
    });
  }

  /**
   * Updates the status view with new component instances
   */
  updateComponents(
    scheduler?: AutoSyncScheduler,
    bulkImportManager?: BulkImportManager,
    queryEngine?: JQLQueryEngine
  ): void {
    if (this.statusView) {
      this.statusView.updateComponents(scheduler, bulkImportManager, queryEngine);
    }
  }

  /**
   * Activates the sync status view
   */
  async activateSyncStatusView(): Promise<void> {
    const { workspace } = this.plugin.app;

    let leaf: WorkspaceLeaf | null = null;
    const leaves = workspace.getLeavesOfType(SYNC_STATUS_VIEW_TYPE);

    if (leaves.length > 0) {
      // View already exists, activate it
      leaf = leaves[0];
    } else {
      // Create new view in right sidebar
      leaf = workspace.getRightLeaf(false);
      if (leaf) {
        await leaf.setViewState({ type: SYNC_STATUS_VIEW_TYPE, active: true });
      }
    }

    if (leaf) {
      workspace.revealLeaf(leaf);
    }
  }

  /**
   * Closes the sync status view
   */
  async closeSyncStatusView(): Promise<void> {
    const { workspace } = this.plugin.app;
    const leaves = workspace.getLeavesOfType(SYNC_STATUS_VIEW_TYPE);

    for (const leaf of leaves) {
      await leaf.detach();
    }

    this.statusView = null;
  }

  /**
   * Gets the current status view instance
   */
  getStatusView(): SyncStatusView | null {
    return this.statusView;
  }

  /**
   * Checks if the sync status view is open
   */
  isStatusViewOpen(): boolean {
    const { workspace } = this.plugin.app;
    return workspace.getLeavesOfType(SYNC_STATUS_VIEW_TYPE).length > 0;
  }

  /**
   * Cleanup when plugin is disabled
   */
  onunload(): void {
    this.closeSyncStatusView();
  }
}