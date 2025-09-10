import { TextInputSuggest, TFolder, TFile, App, normalizePath, Notice } from 'obsidian';

interface FolderSuggestion {
    folder: TFolder;
    path: string;
    displayName: string;
    depth: number;
    isRecent: boolean;
}

export class FolderPicker extends TextInputSuggest<FolderSuggestion> {
    private app: App;
    private recentFolders: string[] = [];
    private maxRecent = 5;
    private onFolderSelect?: (folder: TFolder) => void;
    private allowCreateNew = true;

    constructor(
        app: App, 
        inputEl: HTMLInputElement, 
        options: {
            onFolderSelect?: (folder: TFolder) => void;
            allowCreateNew?: boolean;
            maxRecent?: number;
        } = {}
    ) {
        super(app, inputEl);
        this.app = app;
        this.onFolderSelect = options.onFolderSelect;
        this.allowCreateNew = options.allowCreateNew ?? true;
        this.maxRecent = options.maxRecent ?? 5;
        this.loadRecentFolders();
        this.setupInputHandlers();
    }

    getSuggestions(query: string): FolderSuggestion[] {
        const folders = this.getAllFolders();
        const normalizedQuery = query.toLowerCase().trim();

        if (!normalizedQuery) {
            // Show recent folders first when no query
            return this.getRecentFolderSuggestions().concat(
                folders
                    .filter(f => !this.recentFolders.includes(f.path))
                    .slice(0, 20)
            );
        }

        // Filter folders based on query
        const filtered = folders.filter(folder => {
            const pathMatch = folder.path.toLowerCase().includes(normalizedQuery);
            const nameMatch = folder.name.toLowerCase().includes(normalizedQuery);
            return pathMatch || nameMatch;
        });

        // Sort by relevance
        filtered.sort((a, b) => {
            const aRecent = this.recentFolders.includes(a.path) ? 0 : 1;
            const bRecent = this.recentFolders.includes(b.path) ? 0 : 1;
            
            if (aRecent !== bRecent) return aRecent - bRecent;
            
            const aExactName = a.name.toLowerCase() === normalizedQuery ? 0 : 1;
            const bExactName = b.name.toLowerCase() === normalizedQuery ? 0 : 1;
            
            if (aExactName !== bExactName) return aExactName - bExactName;
            
            return a.path.length - b.path.length;
        });

        const suggestions = filtered.slice(0, 50).map(folder => this.createFolderSuggestion(folder));

        // Add "Create new folder" option if enabled and query doesn't match existing
        if (this.allowCreateNew && normalizedQuery && !filtered.find(f => f.path === normalizedQuery)) {
            suggestions.unshift({
                folder: null as any,
                path: normalizedQuery,
                displayName: `Create folder: ${normalizedQuery}`,
                depth: 0,
                isRecent: false
            });
        }

        return suggestions;
    }

    renderSuggestion(suggestion: FolderSuggestion, el: HTMLElement): void {
        el.empty();
        
        if (!suggestion.folder) {
            // Create new folder suggestion
            el.addClass('folder-picker-create');
            const icon = el.createDiv({ cls: 'folder-picker-icon' });
            icon.innerHTML = '📁+';
            el.createDiv({ 
                cls: 'folder-picker-name',
                text: suggestion.displayName 
            });
            return;
        }

        el.addClass('folder-picker-suggestion');
        
        if (suggestion.isRecent) {
            el.addClass('folder-picker-recent');
        }

        // Add indentation for folder hierarchy
        const indent = el.createDiv({ cls: 'folder-picker-indent' });
        indent.style.width = `${suggestion.depth * 16}px`;

        // Folder icon
        const icon = el.createDiv({ cls: 'folder-picker-icon' });
        icon.innerHTML = '📁';

        // Folder name
        const nameEl = el.createDiv({ cls: 'folder-picker-name' });
        nameEl.setText(suggestion.folder.name);

        // Path indicator for nested folders
        if (suggestion.depth > 0) {
            const pathEl = el.createDiv({ cls: 'folder-picker-path' });
            pathEl.setText(suggestion.path);
        }

        // Recent indicator
        if (suggestion.isRecent) {
            const recentEl = el.createDiv({ cls: 'folder-picker-recent-badge' });
            recentEl.setText('★');
        }

        // Hover tooltip with full path
        el.setAttribute('title', suggestion.path || '/');
    }

    selectSuggestion(suggestion: FolderSuggestion, evt: MouseEvent | KeyboardEvent): void {
        if (!suggestion.folder) {
            // Handle create new folder
            this.createNewFolder(suggestion.path);
            return;
        }

        this.inputEl.value = suggestion.path;
        this.addToRecentFolders(suggestion.path);
        
        if (this.onFolderSelect) {
            this.onFolderSelect(suggestion.folder);
        }

        this.close();
    }

    private getAllFolders(): TFolder[] {
        const folders: TFolder[] = [];
        
        const addFoldersRecursively = (folder: TFolder) => {
            folders.push(folder);
            for (const child of folder.children) {
                if (child instanceof TFolder) {
                    addFoldersRecursively(child);
                }
            }
        };

        // Add root folder
        const rootFolder = this.app.vault.getRoot();
        folders.push(rootFolder);
        
        // Add all subfolders
        for (const child of rootFolder.children) {
            if (child instanceof TFolder) {
                addFoldersRecursively(child);
            }
        }

        return folders;
    }

    private createFolderSuggestion(folder: TFolder): FolderSuggestion {
        const depth = folder.path.split('/').length - 1;
        return {
            folder,
            path: folder.path || '/',
            displayName: folder.name,
            depth,
            isRecent: this.recentFolders.includes(folder.path)
        };
    }

    private getRecentFolderSuggestions(): FolderSuggestion[] {
        return this.recentFolders
            .map(path => {
                const folder = this.app.vault.getAbstractFileByPath(path);
                return folder instanceof TFolder ? this.createFolderSuggestion(folder) : null;
            })
            .filter((suggestion): suggestion is FolderSuggestion => suggestion !== null);
    }

    private async createNewFolder(path: string): Promise<void> {
        try {
            const normalizedPath = normalizePath(path);
            
            // Check if folder already exists
            const existingFolder = this.app.vault.getAbstractFileByPath(normalizedPath);
            if (existingFolder) {
                new Notice(`Folder "${normalizedPath}" already exists`);
                return;
            }

            // Create the folder
            const newFolder = await this.app.vault.createFolder(normalizedPath);
            
            this.inputEl.value = normalizedPath;
            this.addToRecentFolders(normalizedPath);
            
            if (this.onFolderSelect) {
                this.onFolderSelect(newFolder);
            }

            new Notice(`Created folder: ${normalizedPath}`);
            this.close();
        } catch (error) {
            new Notice(`Failed to create folder: ${error.message}`);
        }
    }

    private addToRecentFolders(path: string): void {
        // Remove if already exists
        const index = this.recentFolders.indexOf(path);
        if (index > -1) {
            this.recentFolders.splice(index, 1);
        }

        // Add to beginning
        this.recentFolders.unshift(path);

        // Trim to max length
        if (this.recentFolders.length > this.maxRecent) {
            this.recentFolders.splice(this.maxRecent);
        }

        this.saveRecentFolders();
    }

    private loadRecentFolders(): void {
        try {
            const stored = localStorage.getItem('folder-picker-recent');
            if (stored) {
                this.recentFolders = JSON.parse(stored);
            }
        } catch (error) {
            console.warn('Failed to load recent folders:', error);
            this.recentFolders = [];
        }
    }

    private saveRecentFolders(): void {
        try {
            localStorage.setItem('folder-picker-recent', JSON.stringify(this.recentFolders));
        } catch (error) {
            console.warn('Failed to save recent folders:', error);
        }
    }

    private setupInputHandlers(): void {
        // Handle escape key to clear input
        this.inputEl.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && !this.isOpen()) {
                this.inputEl.value = '';
                if (this.onFolderSelect) {
                    this.onFolderSelect(this.app.vault.getRoot());
                }
            }
        });

        // Handle paste event to normalize paths
        this.inputEl.addEventListener('paste', (event) => {
            setTimeout(() => {
                const value = this.inputEl.value;
                if (value) {
                    this.inputEl.value = normalizePath(value);
                }
            }, 0);
        });
    }

    // Public method to clear recent folders
    clearRecentFolders(): void {
        this.recentFolders = [];
        this.saveRecentFolders();
    }

    // Public method to set current folder
    setCurrentFolder(folder: TFolder | string): void {
        const path = typeof folder === 'string' ? folder : folder.path;
        this.inputEl.value = path;
        this.inputEl.dispatchEvent(new Event('input'));
    }

    // Public method to refresh suggestions (useful after folder changes)
    refresh(): void {
        if (this.isOpen()) {
            this.updateSuggestions();
        }
    }
}

// CSS styles that should be added to the plugin's styles
export const FOLDER_PICKER_STYLES = `
.folder-picker-suggestion {
    display: flex;
    align-items: center;
    padding: 4px 8px;
    cursor: pointer;
    border-radius: 4px;
}

.folder-picker-suggestion:hover {
    background-color: var(--background-modifier-hover);
}

.folder-picker-suggestion.is-selected {
    background-color: var(--background-modifier-active-hover);
}

.folder-picker-recent {
    border-left: 3px solid var(--interactive-accent);
    padding-left: 5px;
}

.folder-picker-create {
    display: flex;
    align-items: center;
    padding: 4px 8px;
    cursor: pointer;
    border-radius: 4px;
    background-color: var(--background-modifier-form-field);
    border: 1px dashed var(--interactive-accent);
}

.folder-picker-create:hover {
    background-color: var(--background-modifier-hover);
}

.folder-picker-indent {
    flex-shrink: 0;
}

.folder-picker-icon {
    margin-right: 8px;
    font-size: 14px;
    flex-shrink: 0;
}

.folder-picker-name {
    flex-grow: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.folder-picker-path {
    font-size: 0.85em;
    color: var(--text-muted);
    margin-left: 8px;
    flex-shrink: 0;
}

.folder-picker-recent-badge {
    color: var(--interactive-accent);
    font-size: 12px;
    margin-left: 4px;
    flex-shrink: 0;
}
`;