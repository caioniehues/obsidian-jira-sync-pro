import { jest } from '@jest/globals';
import { App, Plugin, Workspace, WorkspaceLeaf } from 'obsidian';
import { SyncViewManager } from '../../src/sync/view-manager';
import { SYNC_STATUS_VIEW_TYPE } from '../../src/sync/sync-status-view';
import { AutoSyncScheduler } from '../../src/enhanced-sync/auto-sync-scheduler';
import { BulkImportManager } from '../../src/enhanced-sync/bulk-import-manager';
import { JQLQueryEngine } from '../../src/enhanced-sync/jql-query-engine';

describe('SyncViewManager', () => {
  let mockApp: jest.Mocked<App>;
  let mockWorkspace: jest.Mocked<Workspace>;
  let mockPlugin: jest.Mocked<Plugin>;
  let mockLeaf: jest.Mocked<WorkspaceLeaf>;
  let mockScheduler: jest.Mocked<AutoSyncScheduler>;
  let mockBulkImportManager: jest.Mocked<BulkImportManager>;
  let mockQueryEngine: jest.Mocked<JQLQueryEngine>;
  let viewManager: SyncViewManager;

  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();
    
    // Setup mock workspace
    mockWorkspace = {
      getLeavesOfType: jest.fn(),
      getRightLeaf: jest.fn(),
      revealLeaf: jest.fn()
    } as jest.Mocked<Workspace>;
    
    // Setup mock app
    mockApp = {
      workspace: mockWorkspace
    } as jest.Mocked<App>;
    
    // Setup mock leaf
    mockLeaf = {
      setViewState: jest.fn(),
      detach: jest.fn()
    } as jest.Mocked<WorkspaceLeaf>;
    
    // Setup mock plugin
    mockPlugin = {
      app: mockApp,
      registerView: jest.fn(),
      addRibbonIcon: jest.fn(),
      addCommand: jest.fn()
    } as jest.Mocked<Plugin>;
    
    // Setup mock components
    mockScheduler = {} as jest.Mocked<AutoSyncScheduler>;
    mockBulkImportManager = {} as jest.Mocked<BulkImportManager>;
    mockQueryEngine = {} as jest.Mocked<JQLQueryEngine>;
    
    viewManager = new SyncViewManager(mockPlugin);
  });

  describe('View Registration', () => {
    it('should register sync status view type', () => {
      viewManager.registerViews();
      
      expect(mockPlugin.registerView).toHaveBeenCalledWith(
        SYNC_STATUS_VIEW_TYPE,
        expect.any(Function)
      );
    });

    it('should add ribbon icon for sync status', () => {
      viewManager.registerViews();
      
      expect(mockPlugin.addRibbonIcon).toHaveBeenCalledWith(
        'activity',
        'Jira Sync Status',
        expect.any(Function)
      );
    });

    it('should add command to open sync status', () => {
      viewManager.registerViews();
      
      expect(mockPlugin.addCommand).toHaveBeenCalledWith({
        id: 'open-sync-status',
        name: 'Open Sync Status Dashboard',
        callback: expect.any(Function)
      });
    });

    it('should create sync status view when view factory is called', () => {
      viewManager.registerViews();
      
      // Get the factory function
      const registerViewCall = (mockPlugin.registerView as jest.Mock).mock.calls[0];
      const viewFactory = registerViewCall[1];
      
      // Call factory function
      const view = viewFactory(mockLeaf);
      
      expect(view).toBeDefined();
      expect(viewManager.getStatusView()).toBe(view);
    });
  });

  describe('View Activation', () => {
    beforeEach(() => {
      viewManager.registerViews();
    });

    it('should activate existing sync status view', async () => {
      // Mock existing leaf
      mockWorkspace.getLeavesOfType.mockReturnValue([mockLeaf]);
      
      await viewManager.activateSyncStatusView();
      
      expect(mockWorkspace.getLeavesOfType).toHaveBeenCalledWith(SYNC_STATUS_VIEW_TYPE);
      expect(mockWorkspace.revealLeaf).toHaveBeenCalledWith(mockLeaf);
      expect(mockLeaf.setViewState).not.toHaveBeenCalled();
    });

    it('should create new sync status view in right sidebar', async () => {
      // Mock no existing leaves
      mockWorkspace.getLeavesOfType.mockReturnValue([]);
      mockWorkspace.getRightLeaf.mockReturnValue(mockLeaf);
      mockLeaf.setViewState.mockResolvedValue();
      
      await viewManager.activateSyncStatusView();
      
      expect(mockWorkspace.getRightLeaf).toHaveBeenCalledWith(false);
      expect(mockLeaf.setViewState).toHaveBeenCalledWith({
        type: SYNC_STATUS_VIEW_TYPE,
        active: true
      });
      expect(mockWorkspace.revealLeaf).toHaveBeenCalledWith(mockLeaf);
    });

    it('should handle case when right leaf is not available', async () => {
      mockWorkspace.getLeavesOfType.mockReturnValue([]);
      mockWorkspace.getRightLeaf.mockReturnValue(null);
      
      await viewManager.activateSyncStatusView();
      
      expect(mockWorkspace.revealLeaf).not.toHaveBeenCalled();
    });
  });

  describe('View Closing', () => {
    beforeEach(() => {
      viewManager.registerViews();
    });

    it('should close all sync status views', async () => {
      const mockLeaf1 = { detach: jest.fn() } as jest.Mocked<WorkspaceLeaf>;
      const mockLeaf2 = { detach: jest.fn() } as jest.Mocked<WorkspaceLeaf>;
      
      mockWorkspace.getLeavesOfType.mockReturnValue([mockLeaf1, mockLeaf2]);
      
      await viewManager.closeSyncStatusView();
      
      expect(mockLeaf1.detach).toHaveBeenCalled();
      expect(mockLeaf2.detach).toHaveBeenCalled();
      expect(viewManager.getStatusView()).toBeNull();
    });

    it('should handle closing when no views are open', async () => {
      mockWorkspace.getLeavesOfType.mockReturnValue([]);
      
      await viewManager.closeSyncStatusView();
      
      expect(viewManager.getStatusView()).toBeNull();
    });
  });

  describe('Component Updates', () => {
    it('should update components when status view exists', () => {
      // Create a mock status view
      const mockStatusView = {
        updateComponents: jest.fn()
      };
      
      // Set the status view
      viewManager.registerViews();
      (viewManager as any).statusView = mockStatusView;
      
      viewManager.updateComponents(mockScheduler, mockBulkImportManager, mockQueryEngine);
      
      expect(mockStatusView.updateComponents).toHaveBeenCalledWith(
        mockScheduler,
        mockBulkImportManager,
        mockQueryEngine
      );
    });

    it('should handle update when no status view exists', () => {
      // This should not throw an error
      expect(() => {
        viewManager.updateComponents(mockScheduler);
      }).not.toThrow();
    });
  });

  describe('View State Queries', () => {
    beforeEach(() => {
      viewManager.registerViews();
    });

    it('should return true when sync status view is open', () => {
      mockWorkspace.getLeavesOfType.mockReturnValue([mockLeaf]);
      
      expect(viewManager.isStatusViewOpen()).toBe(true);
      expect(mockWorkspace.getLeavesOfType).toHaveBeenCalledWith(SYNC_STATUS_VIEW_TYPE);
    });

    it('should return false when sync status view is not open', () => {
      mockWorkspace.getLeavesOfType.mockReturnValue([]);
      
      expect(viewManager.isStatusViewOpen()).toBe(false);
    });

    it('should return current status view instance', () => {
      const mockStatusView = {};
      (viewManager as any).statusView = mockStatusView;
      
      expect(viewManager.getStatusView()).toBe(mockStatusView);
    });

    it('should return null when no status view exists', () => {
      expect(viewManager.getStatusView()).toBeNull();
    });
  });

  describe('Ribbon Icon and Command Callbacks', () => {
    it('should call activateSyncStatusView when ribbon icon is clicked', () => {
      const activateSpy = jest.spyOn(viewManager, 'activateSyncStatusView').mockResolvedValue();
      
      viewManager.registerViews();
      
      // Get the ribbon icon callback
      const ribbonCall = (mockPlugin.addRibbonIcon as jest.Mock).mock.calls[0];
      const ribbonCallback = ribbonCall[2];
      
      ribbonCallback();
      
      expect(activateSpy).toHaveBeenCalled();
    });

    it('should call activateSyncStatusView when command is executed', () => {
      const activateSpy = jest.spyOn(viewManager, 'activateSyncStatusView').mockResolvedValue();
      
      viewManager.registerViews();
      
      // Get the command callback
      const commandCall = (mockPlugin.addCommand as jest.Mock).mock.calls[0];
      const commandCallback = commandCall[0].callback;
      
      commandCallback();
      
      expect(activateSpy).toHaveBeenCalled();
    });
  });

  describe('Cleanup', () => {
    it('should close sync status view on unload', async () => {
      const closeSpy = jest.spyOn(viewManager, 'closeSyncStatusView').mockResolvedValue();
      
      viewManager.onunload();
      
      expect(closeSpy).toHaveBeenCalled();
    });
  });

  describe('Integration with Components', () => {
    it('should pass components to view when creating new view', () => {
      // First set up components
      viewManager.updateComponents(mockScheduler, mockBulkImportManager, mockQueryEngine);
      
      // Register views (which sets up the factory)
      viewManager.registerViews();
      
      // Create a new view through the factory
      const registerViewCall = (mockPlugin.registerView as jest.Mock).mock.calls[0];
      const viewFactory = registerViewCall[1];
      const view = viewFactory(mockLeaf);
      
      // Verify the view was created with components
      expect(view).toBeDefined();
      
      // Verify updateComponents was called on the new view
      const statusView = viewManager.getStatusView();
      expect(statusView).toBe(view);
    });

    it('should handle partial component updates', () => {
      const mockStatusView = {
        updateComponents: jest.fn()
      };
      
      viewManager.registerViews();
      (viewManager as any).statusView = mockStatusView;
      
      // Update with only scheduler
      viewManager.updateComponents(mockScheduler);
      
      expect(mockStatusView.updateComponents).toHaveBeenCalledWith(
        mockScheduler,
        undefined,
        undefined
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle setViewState errors gracefully', async () => {
      mockWorkspace.getLeavesOfType.mockReturnValue([]);
      mockWorkspace.getRightLeaf.mockReturnValue(mockLeaf);
      mockLeaf.setViewState.mockRejectedValue(new Error('Failed to set view state'));
      
      // This should not throw but will propagate error
      await expect(viewManager.activateSyncStatusView()).rejects.toThrow('Failed to set view state');
    });

    it('should handle detach errors gracefully', async () => {
      const mockLeaf1 = { 
        detach: jest.fn().mockRejectedValue(new Error('Detach failed'))
      } as jest.Mocked<WorkspaceLeaf>;
      
      mockWorkspace.getLeavesOfType.mockReturnValue([mockLeaf1]);
      
      // This should not throw but will propagate error  
      await expect(viewManager.closeSyncStatusView()).rejects.toThrow('Detach failed');
    });
  });
});