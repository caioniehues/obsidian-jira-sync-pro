import { Modal, App, TFolder, TFile, Setting, normalizePath, Notice } from 'obsidian';

interface FolderNode {
    folder: TFolder;
    children: FolderNode[];
    isExpanded: boolean;
    isSelected: boolean;
    depth: number;
}

export class FolderBrowserModal extends Modal {
    private onFolderSelect: (folder: TFolder) => void;
    private selectedFolder: TFolder | null = null;
    private folderTree: FolderNode;
    private treeContainer: HTMLElement;
    private searchInput: HTMLInputElement;
    private breadcrumbContainer: HTMLElement;
    private searchQuery = '';
    private allowCreateNew: boolean;

    constructor(
        app: App, 
        initialFolder: TFolder | null = null,
        options: {
            onFolderSelect: (folder: TFolder) => void;
            allowCreateNew?: boolean;
            title?: string;
        }
    ) {
        super(app);
        this.onFolderSelect = options.onFolderSelect;
        this.allowCreateNew = options.allowCreateNew ?? true;
        this.selectedFolder = initialFolder;
        
        if (options.title) {
            this.setTitle(options.title);
        } else {
            this.setTitle('Select Folder');
        }
    }

    onOpen(): void {
        this.buildModal();
        this.buildFolderTree();
        this.renderTree();
        this.updateBreadcrumb();
        
        // Focus search input
        this.searchInput?.focus();
    }

    onClose(): void {
        // Cleanup
    }

    private buildModal(): void {
        const { contentEl } = this;
        contentEl.empty();

        // Search section
        const searchContainer = contentEl.createDiv({ cls: 'folder-browser-search' });
        
        this.searchInput = searchContainer.createEl('input', {
            type: 'text',
            placeholder: 'Search folders...',
            cls: 'folder-browser-search-input'
        });

        this.searchInput.addEventListener('input', () => {
            this.searchQuery = this.searchInput.value.toLowerCase();
            this.renderTree();
        });

        // Create new folder button
        if (this.allowCreateNew) {
            const createButton = searchContainer.createEl('button', {
                text: 'Create Folder',
                cls: 'mod-cta folder-browser-create-btn'
            });
            
            createButton.addEventListener('click', () => {
                this.showCreateFolderDialog();
            });
        }

        // Breadcrumb navigation
        this.breadcrumbContainer = contentEl.createDiv({ cls: 'folder-browser-breadcrumb' });

        // Tree container
        this.treeContainer = contentEl.createDiv({ cls: 'folder-browser-tree' });

        // Action buttons
        const buttonContainer = contentEl.createDiv({ cls: 'folder-browser-actions' });
        
        const selectButton = buttonContainer.createEl('button', {
            text: 'Select',
            cls: 'mod-cta'
        });
        
        selectButton.addEventListener('click', () => {
            if (this.selectedFolder) {
                this.onFolderSelect(this.selectedFolder);
                this.close();
            } else {
                new Notice('Please select a folder');
            }
        });

        const cancelButton = buttonContainer.createEl('button', {
            text: 'Cancel',
            cls: 'mod-cancel'
        });
        
        cancelButton.addEventListener('click', () => {
            this.close();
        });
    }

    private buildFolderTree(): void {
        const rootFolder = this.app.vault.getRoot();
        this.folderTree = this.createFolderNode(rootFolder, 0);
        this.expandToSelected(this.folderTree);
    }

    private createFolderNode(folder: TFolder, depth: number): FolderNode {
        const node: FolderNode = {
            folder,
            children: [],
            isExpanded: depth === 0, // Root is always expanded
            isSelected: this.selectedFolder === folder,
            depth
        };

        // Add child folders
        for (const child of folder.children) {
            if (child instanceof TFolder) {
                node.children.push(this.createFolderNode(child, depth + 1));
            }
        }

        // Sort children by name
        node.children.sort((a, b) => a.folder.name.localeCompare(b.folder.name));

        return node;
    }

    private expandToSelected(node: FolderNode): void {
        if (!this.selectedFolder) return;

        // Check if selected folder is descendant of this node
        const selectedPath = this.selectedFolder.path;
        const nodePath = node.folder.path;

        if (selectedPath.startsWith(nodePath)) {
            node.isExpanded = true;
            
            // Recursively expand children
            for (const child of node.children) {
                this.expandToSelected(child);
            }
        }
    }

    private renderTree(): void {
        this.treeContainer.empty();
        this.renderNode(this.folderTree, this.treeContainer);
    }

    private renderNode(node: FolderNode, container: HTMLElement): void {
        // Filter based on search query
        const matchesSearch = this.searchQuery === '' || 
            node.folder.name.toLowerCase().includes(this.searchQuery) ||
            node.folder.path.toLowerCase().includes(this.searchQuery) ||
            this.hasMatchingChild(node);

        if (!matchesSearch) return;

        // Create node element
        const nodeEl = container.createDiv({ cls: 'folder-browser-node' });
        
        if (node.isSelected) {
            nodeEl.addClass('is-selected');
        }

        // Indentation
        const indent = nodeEl.createDiv({ cls: 'folder-browser-indent' });
        indent.style.width = `${node.depth * 20}px`;

        // Expand/collapse button
        const expandButton = nodeEl.createDiv({ cls: 'folder-browser-expand' });
        if (node.children.length > 0) {
            expandButton.setText(node.isExpanded ? '▼' : '▶');
            expandButton.addClass('clickable');
            expandButton.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleNode(node);
            });
        } else {
            expandButton.setText('  '); // Spacer for alignment
        }

        // Folder icon
        const icon = nodeEl.createDiv({ cls: 'folder-browser-icon' });
        icon.innerHTML = node.isExpanded && node.children.length > 0 ? '📂' : '📁';

        // Folder name
        const nameEl = nodeEl.createDiv({ cls: 'folder-browser-name' });
        nameEl.setText(node.folder.name || '/');

        // File count
        const fileCount = this.getFolderFileCount(node.folder);
        if (fileCount > 0) {
            const countEl = nodeEl.createDiv({ cls: 'folder-browser-count' });
            countEl.setText(`(${fileCount})`);
        }

        // Click handler for selection
        nodeEl.addEventListener('click', () => {
            this.selectNode(node);
        });

        // Double-click handler for expand/collapse
        nodeEl.addEventListener('dblclick', () => {
            if (node.children.length > 0) {
                this.toggleNode(node);
            }
        });

        // Render children if expanded
        if (node.isExpanded) {
            for (const child of node.children) {
                this.renderNode(child, container);
            }
        }
    }

    private hasMatchingChild(node: FolderNode): boolean {
        if (this.searchQuery === '') return true;

        for (const child of node.children) {
            const childMatches = child.folder.name.toLowerCase().includes(this.searchQuery) ||
                child.folder.path.toLowerCase().includes(this.searchQuery);
                
            if (childMatches || this.hasMatchingChild(child)) {
                return true;
            }
        }
        return false;
    }

    private toggleNode(node: FolderNode): void {
        node.isExpanded = !node.isExpanded;
        this.renderTree();
    }

    private selectNode(node: FolderNode): void {
        // Clear previous selection
        this.clearSelection(this.folderTree);
        
        // Set new selection
        node.isSelected = true;
        this.selectedFolder = node.folder;
        
        this.renderTree();
        this.updateBreadcrumb();
    }

    private clearSelection(node: FolderNode): void {
        node.isSelected = false;
        for (const child of node.children) {
            this.clearSelection(child);
        }
    }

    private updateBreadcrumb(): void {
        this.breadcrumbContainer.empty();

        if (!this.selectedFolder) {
            this.breadcrumbContainer.createSpan({ 
                text: 'No folder selected',
                cls: 'folder-browser-breadcrumb-empty'
            });
            return;
        }

        const pathParts = this.selectedFolder.path.split('/').filter(Boolean);
        
        // Root breadcrumb
        const rootCrumb = this.breadcrumbContainer.createSpan({ 
            text: '/',
            cls: 'folder-browser-breadcrumb-item clickable'
        });
        
        rootCrumb.addEventListener('click', () => {
            const rootFolder = this.app.vault.getRoot();
            const rootNode = this.findNode(this.folderTree, rootFolder);
            if (rootNode) {
                this.selectNode(rootNode);
            }
        });

        // Path breadcrumbs
        let currentPath = '';
        for (let i = 0; i < pathParts.length; i++) {
            currentPath += (currentPath ? '/' : '') + pathParts[i];
            
            this.breadcrumbContainer.createSpan({ 
                text: ' / ',
                cls: 'folder-browser-breadcrumb-separator'
            });

            const crumbText = pathParts[i];
            const crumb = this.breadcrumbContainer.createSpan({ 
                text: crumbText,
                cls: 'folder-browser-breadcrumb-item clickable'
            });

            const breadcrumbPath = currentPath;
            crumb.addEventListener('click', () => {
                const folder = this.app.vault.getAbstractFileByPath(breadcrumbPath);
                if (folder instanceof TFolder) {
                    const node = this.findNode(this.folderTree, folder);
                    if (node) {
                        this.selectNode(node);
                    }
                }
            });
        }
    }

    private findNode(root: FolderNode, targetFolder: TFolder): FolderNode | null {
        if (root.folder === targetFolder) return root;
        
        for (const child of root.children) {
            const found = this.findNode(child, targetFolder);
            if (found) return found;
        }
        
        return null;
    }

    private getFolderFileCount(folder: TFolder): number {
        let count = 0;
        for (const child of folder.children) {
            if (child instanceof TFile) {
                count++;
            }
        }
        return count;
    }

    private async showCreateFolderDialog(): Promise<void> {
        const modal = new CreateFolderModal(this.app, this.selectedFolder, async (newFolder) => {
            // Refresh the tree
            this.buildFolderTree();
            this.renderTree();
            
            // Select the newly created folder
            const newNode = this.findNode(this.folderTree, newFolder);
            if (newNode) {
                this.selectNode(newNode);
            }
        });
        
        modal.open();
    }
}

class CreateFolderModal extends Modal {
    private parentFolder: TFolder | null;
    private onFolderCreated: (folder: TFolder) => void;
    private nameInput: HTMLInputElement;

    constructor(app: App, parentFolder: TFolder | null, onFolderCreated: (folder: TFolder) => void) {
        super(app);
        this.parentFolder = parentFolder;
        this.onFolderCreated = onFolderCreated;
        this.setTitle('Create New Folder');
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();

        // Parent folder display
        if (this.parentFolder) {
            const parentInfo = contentEl.createDiv({ cls: 'create-folder-parent' });
            parentInfo.createSpan({ text: 'Parent folder: ' });
            parentInfo.createSpan({ 
                text: this.parentFolder.path || '/',
                cls: 'create-folder-parent-path'
            });
        }

        // Folder name input
        new Setting(contentEl)
            .setName('Folder name')
            .setDesc('Enter the name for the new folder')
            .addText(text => {
                this.nameInput = text.inputEl;
                text.setPlaceholder('My New Folder')
                    .onChange(() => {
                        // Auto-validate name
                        this.validateFolderName();
                    });
                
                // Focus and select all
                setTimeout(() => {
                    this.nameInput.focus();
                }, 100);
            });

        // Action buttons
        const buttonContainer = contentEl.createDiv({ cls: 'create-folder-actions' });
        
        const createButton = buttonContainer.createEl('button', {
            text: 'Create',
            cls: 'mod-cta'
        });
        
        createButton.addEventListener('click', () => {
            this.createFolder();
        });

        const cancelButton = buttonContainer.createEl('button', {
            text: 'Cancel'
        });
        
        cancelButton.addEventListener('click', () => {
            this.close();
        });

        // Enter key handler
        this.nameInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                this.createFolder();
            } else if (event.key === 'Escape') {
                this.close();
            }
        });
    }

    private validateFolderName(): void {
        const name = this.nameInput.value.trim();
        const isValid = name.length > 0 && !/[\\/:*?"<>|]/.test(name);
        
        this.nameInput.classList.toggle('is-invalid', !isValid);
        return isValid;
    }

    private async createFolder(): Promise<void> {
        if (!this.validateFolderName()) {
            new Notice('Please enter a valid folder name');
            return;
        }

        try {
            const folderName = this.nameInput.value.trim();
            const parentPath = this.parentFolder ? this.parentFolder.path : '';
            const fullPath = parentPath ? `${parentPath}/${folderName}` : folderName;
            const normalizedPath = normalizePath(fullPath);

            // Check if folder already exists
            const existingFolder = this.app.vault.getAbstractFileByPath(normalizedPath);
            if (existingFolder) {
                new Notice(`Folder "${normalizedPath}" already exists`);
                return;
            }

            // Create the folder
            const newFolder = await this.app.vault.createFolder(normalizedPath);
            
            new Notice(`Created folder: ${normalizedPath}`);
            this.onFolderCreated(newFolder);
            this.close();
        } catch (error) {
            new Notice(`Failed to create folder: ${error.message}`);
        }
    }
}

// CSS styles that should be added to the plugin's styles
export const FOLDER_BROWSER_STYLES = `
.folder-browser-search {
    display: flex;
    gap: 8px;
    margin-bottom: 16px;
    align-items: center;
}

.folder-browser-search-input {
    flex-grow: 1;
    padding: 6px 12px;
    border: 1px solid var(--background-modifier-border);
    border-radius: 4px;
    background: var(--background-primary);
}

.folder-browser-create-btn {
    white-space: nowrap;
}

.folder-browser-breadcrumb {
    margin-bottom: 12px;
    padding: 8px 12px;
    background: var(--background-secondary);
    border-radius: 4px;
    font-size: 0.9em;
    border: 1px solid var(--background-modifier-border);
}

.folder-browser-breadcrumb-item {
    color: var(--interactive-accent);
    cursor: pointer;
}

.folder-browser-breadcrumb-item:hover {
    text-decoration: underline;
}

.folder-browser-breadcrumb-separator {
    color: var(--text-muted);
}

.folder-browser-breadcrumb-empty {
    color: var(--text-muted);
    font-style: italic;
}

.folder-browser-tree {
    max-height: 400px;
    overflow-y: auto;
    border: 1px solid var(--background-modifier-border);
    border-radius: 4px;
    background: var(--background-primary);
}

.folder-browser-node {
    display: flex;
    align-items: center;
    padding: 4px 8px;
    cursor: pointer;
    border-bottom: 1px solid transparent;
}

.folder-browser-node:hover {
    background-color: var(--background-modifier-hover);
}

.folder-browser-node.is-selected {
    background-color: var(--background-modifier-active-hover);
    border-color: var(--interactive-accent);
}

.folder-browser-indent {
    flex-shrink: 0;
}

.folder-browser-expand {
    width: 16px;
    text-align: center;
    font-size: 12px;
    margin-right: 4px;
    flex-shrink: 0;
}

.folder-browser-expand.clickable:hover {
    color: var(--interactive-accent);
}

.folder-browser-icon {
    margin-right: 8px;
    font-size: 14px;
    flex-shrink: 0;
}

.folder-browser-name {
    flex-grow: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.folder-browser-count {
    font-size: 0.85em;
    color: var(--text-muted);
    margin-left: 8px;
    flex-shrink: 0;
}

.folder-browser-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 16px;
    padding-top: 16px;
    border-top: 1px solid var(--background-modifier-border);
}

.create-folder-parent {
    margin-bottom: 16px;
    padding: 8px 12px;
    background: var(--background-secondary);
    border-radius: 4px;
    border: 1px solid var(--background-modifier-border);
}

.create-folder-parent-path {
    font-family: var(--font-monospace);
    color: var(--interactive-accent);
}

.create-folder-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 16px;
}

input.is-invalid {
    border-color: var(--color-red);
    background-color: var(--color-red-alpha);
}
`;