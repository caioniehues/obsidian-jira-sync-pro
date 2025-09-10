import { Vault, TFile, normalizePath } from 'obsidian';
import { JiraIssue } from '../models/jql-search-result';

export interface NoteCreationResult {
  success: boolean;
  action: 'created' | 'updated' | 'skipped' | 'error';
  filePath?: string;
  error?: string;
}

export interface NoteCreationOptions {
  overwriteExisting?: boolean;
  organizationStrategy?: 'flat' | 'by-project' | 'by-status';
  preserveLocalNotes?: boolean;
}

export class SimpleNoteService {
  constructor(
    private vault: Vault,
    private baseFolder: string
  ) {}

  /**
   * Create or update a note for a Jira ticket
   */
  async processTicket(
    ticket: JiraIssue,
    options: NoteCreationOptions = {}
  ): Promise<NoteCreationResult> {
    try {
      // Determine file path based on organization strategy
      const filePath = await this.getFilePath(ticket, options.organizationStrategy || 'by-project');
      
      // Ensure folder exists
      await this.ensureFolderExists(filePath);
      
      // Check if file already exists
      const existingFile = this.vault.getAbstractFileByPath(filePath);
      
      if (existingFile instanceof TFile) {
        // File exists - decide whether to update
        if (!options.overwriteExisting) {
          return {
            success: true,
            action: 'skipped',
            filePath
          };
        }
        
        // Update existing file
        const updatedContent = await this.generateNoteContent(ticket, existingFile, options.preserveLocalNotes);
        await this.vault.modify(existingFile, updatedContent);
        
        return {
          success: true,
          action: 'updated',
          filePath
        };
      } else {
        // Create new file
        const content = this.generateNoteContent(ticket);
        await this.vault.create(filePath, content);
        
        return {
          success: true,
          action: 'created',
          filePath
        };
      }
    } catch (error) {
      console.error(`Failed to process ticket ${ticket.key}:`, error);
      return {
        success: false,
        action: 'error',
        error: error.message
      };
    }
  }

  /**
   * Generate the markdown content for a Jira ticket note
   */
  private generateNoteContent(
    ticket: JiraIssue,
    existingFile?: TFile,
    preserveLocal: boolean = false
  ): string | Promise<string> {
    // Extract key information
    const key = ticket.key;
    const summary = ticket.fields.summary;
    const description = this.convertJiraToMarkdown(ticket.fields.description || '');
    const status = ticket.fields.status?.name || 'Unknown';
    const assignee = ticket.fields.assignee?.displayName || 'Unassigned';
    const reporter = ticket.fields.reporter?.displayName || 'Unknown';
    const priority = ticket.fields.priority?.name || 'None';
    const issueType = ticket.fields.issuetype?.name || 'Unknown';
    const project = ticket.fields.project?.name || 'Unknown';
    const created = this.formatDate(ticket.fields.created);
    const updated = this.formatDate(ticket.fields.updated);
    
    // Generate Jira URL
    const jiraUrl = this.getJiraUrl(ticket);
    
    // Build the note content
    let content = `---
ticket: ${key}
title: ${summary}
status: ${status}
assignee: ${assignee}
priority: ${priority}
type: ${issueType}
project: ${project}
created: ${created}
updated: ${updated}
jira_url: ${jiraUrl}
sync_date: ${new Date().toISOString()}
tags:
  - jira
  - ${project.toLowerCase().replace(/\s+/g, '-')}
  - ${status.toLowerCase().replace(/\s+/g, '-')}
---

# [${key}] ${summary}

## 📊 Status Information
- **Status**: ${status}
- **Priority**: ${priority} ${this.getPriorityEmoji(priority)}
- **Type**: ${issueType}
- **Assignee**: [[${assignee}]]
- **Reporter**: [[${reporter}]]
- **Project**: [[${project}]]

## 📝 Description
${description || '*No description provided*'}

`;

    // Add comments section if available
    if (ticket.fields.comment && ticket.fields.comment.comments.length > 0) {
      content += `## 💬 Comments\n`;
      
      // Show last 5 comments
      const recentComments = ticket.fields.comment.comments.slice(-5);
      for (const comment of recentComments) {
        const commentDate = this.formatDate(comment.created);
        const commentBody = this.convertJiraToMarkdown(comment.body);
        content += `
### ${comment.author.displayName} - ${commentDate}
${commentBody}
`;
      }
      
      if (ticket.fields.comment.comments.length > 5) {
        content += `\n*... and ${ticket.fields.comment.comments.length - 5} more comments in Jira*\n`;
      }
    }

    // Add subtasks if available
    if (ticket.fields.subtasks && ticket.fields.subtasks.length > 0) {
      content += `\n## ✅ Subtasks\n`;
      for (const subtask of ticket.fields.subtasks) {
        const checkbox = subtask.fields.status.name === 'Done' ? 'x' : ' ';
        content += `- [${checkbox}] **${subtask.key}**: ${subtask.fields.summary} (${subtask.fields.status.name})\n`;
      }
    }

    // Add links section
    content += `
## 🔗 Links
- [View in Jira](${jiraUrl})
- [Add Comment](${jiraUrl}?focusedCommentId=&page=com.atlassian.jira.plugin.system.issuetabpanels%3Acomment-tabpanel#action_comment)

---
*Last synchronized: ${new Date().toLocaleString()}*

## 📌 Local Notes
<!-- Add your personal notes below this line. They will be preserved during sync. -->

`;

    // If preserving local notes and we have an existing file, extract and append them
    if (preserveLocal && existingFile) {
      return this.preserveLocalSection(content, existingFile);
    }

    return content;
  }

  /**
   * Preserve the local notes section from existing file
   */
  private async preserveLocalSection(newContent: string, existingFile: TFile): Promise<string> {
    const existingContent = await this.vault.read(existingFile);
    
    // Find the local notes marker
    const marker = '<!-- Add your personal notes below this line. They will be preserved during sync. -->';
    const markerIndex = existingContent.indexOf(marker);
    
    if (markerIndex !== -1) {
      // Extract everything after the marker
      const localNotes = existingContent.substring(markerIndex + marker.length).trim();
      
      if (localNotes) {
        // Replace the marker section in new content with marker + preserved notes
        const newMarkerIndex = newContent.indexOf(marker);
        if (newMarkerIndex !== -1) {
          return newContent.substring(0, newMarkerIndex + marker.length) + '\n\n' + localNotes;
        }
      }
    }
    
    return newContent;
  }

  /**
   * Convert Jira markup to Markdown
   */
  private convertJiraToMarkdown(text: any): string {
    // Handle null, undefined, or empty values
    if (!text) return '';
    
    // Handle object descriptions (Jira sometimes returns structured content)
    if (typeof text === 'object') {
      // If it's an ADF (Atlassian Document Format) object, try to extract text
      if (text.content) {
        // Recursively extract text from content blocks
        return this.extractTextFromADF(text);
      }
      // Otherwise convert to JSON string as fallback
      return JSON.stringify(text, null, 2);
    }
    
    // Convert to string if it's not already (handles numbers, booleans, etc.)
    let markdown = String(text);
    
    // Convert headers
    markdown = markdown.replace(/^h1\.\s+(.+)$/gm, '# $1');
    markdown = markdown.replace(/^h2\.\s+(.+)$/gm, '## $1');
    markdown = markdown.replace(/^h3\.\s+(.+)$/gm, '### $1');
    markdown = markdown.replace(/^h4\.\s+(.+)$/gm, '#### $1');
    
    // Convert bold (Jira uses *text* for bold)
    markdown = markdown.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '**$1**');
    
    // Convert italic (Jira uses _text_ for italic)
    markdown = markdown.replace(/(?<!_)_([^_]+)_(?!_)/g, '*$1*');
    
    // Convert code blocks
    markdown = markdown.replace(/\{code(?::(\w+))?\}([\s\S]*?)\{code\}/g, '```$1\n$2\n```');
    markdown = markdown.replace(/\{noformat\}([\s\S]*?)\{noformat\}/g, '```\n$1\n```');
    
    // Convert inline code
    markdown = markdown.replace(/\{\{([^}]+)\}\}/g, '`$1`');
    
    // Convert links [text|url] to [text](url)
    markdown = markdown.replace(/\[([^|]+)\|([^\]]+)\]/g, '[$1]($2)');
    
    // Convert lists
    markdown = markdown.replace(/^\*\s+(.+)$/gm, '- $1');
    markdown = markdown.replace(/^#\s+(.+)$/gm, '1. $1');
    
    // Convert quotes
    markdown = markdown.replace(/^bq\.\s+(.+)$/gm, '> $1');
    
    return markdown;
  }

  /**
   * Extract text from Atlassian Document Format (ADF) object
   */
  private extractTextFromADF(adf: any): string {
    if (!adf || typeof adf !== 'object') return '';
    
    let text = '';
    
    // Handle content array
    if (Array.isArray(adf.content)) {
      for (const node of adf.content) {
        text += this.extractTextFromADFNode(node) + '\n';
      }
    }
    
    return text.trim();
  }

  /**
   * Extract text from a single ADF node
   */
  private extractTextFromADFNode(node: any): string {
    if (!node || typeof node !== 'object') return '';
    
    let text = '';
    
    // Handle different node types
    switch (node.type) {
      case 'paragraph':
      case 'heading':
        if (Array.isArray(node.content)) {
          text = node.content.map((n: any) => this.extractTextFromADFNode(n)).join('');
        }
        break;
      
      case 'text':
        text = node.text || '';
        break;
      
      case 'hardBreak':
        text = '\n';
        break;
      
      case 'mention':
        text = `@${node.attrs?.text || 'user'}`;
        break;
      
      case 'emoji':
        text = node.attrs?.shortName || '';
        break;
      
      case 'inlineCard':
      case 'link':
        text = node.attrs?.url || '';
        break;
      
      case 'codeBlock':
        if (Array.isArray(node.content)) {
          const code = node.content.map((n: any) => this.extractTextFromADFNode(n)).join('');
          text = `\`\`\`\n${code}\n\`\`\``;
        }
        break;
      
      case 'bulletList':
      case 'orderedList':
        if (Array.isArray(node.content)) {
          text = node.content.map((n: any) => this.extractTextFromADFNode(n)).join('\n');
        }
        break;
      
      case 'listItem':
        if (Array.isArray(node.content)) {
          text = '- ' + node.content.map((n: any) => this.extractTextFromADFNode(n)).join('');
        }
        break;
      
      default:
        // For unknown types, try to extract content recursively
        if (Array.isArray(node.content)) {
          text = node.content.map((n: any) => this.extractTextFromADFNode(n)).join('');
        }
    }
    
    return text;
  }

  /**
   * Get the file path for a ticket based on organization strategy
   */
  private async getFilePath(
    ticket: JiraIssue,
    strategy: 'flat' | 'by-project' | 'by-status'
  ): Promise<string> {
    const safeKey = this.sanitizeFileName(ticket.key);
    const baseFolder = normalizePath(this.baseFolder);
    
    switch (strategy) {
      case 'flat':
        return `${baseFolder}/${safeKey}.md`;
        
      case 'by-project':
        const project = this.sanitizeFileName(ticket.fields.project.key);
        return `${baseFolder}/${project}/${safeKey}.md`;
        
      case 'by-status':
        const status = this.sanitizeFileName(ticket.fields.status.name);
        return `${baseFolder}/${status}/${safeKey}.md`;
        
      default:
        return `${baseFolder}/${safeKey}.md`;
    }
  }

  /**
   * Ensure the folder structure exists for a file path
   */
  private async ensureFolderExists(filePath: string): Promise<void> {
    const folderPath = filePath.substring(0, filePath.lastIndexOf('/'));
    
    // Check if folder already exists
    const folder = this.vault.getAbstractFileByPath(folderPath);
    if (folder) return;
    
    // Create folder hierarchy
    const parts = folderPath.split('/');
    let currentPath = '';
    
    for (const part of parts) {
      if (!part) continue;
      
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      
      if (!this.vault.getAbstractFileByPath(currentPath)) {
        await this.vault.createFolder(currentPath);
      }
    }
  }

  /**
   * Sanitize a string for use as a file or folder name
   */
  private sanitizeFileName(name: string): string {
    return name
      .replace(/[\\/:*?"<>|]/g, '-')  // Replace invalid characters
      .replace(/\s+/g, '_')            // Replace spaces with underscores
      .replace(/^\.+/, '')             // Remove leading dots
      .replace(/\.+$/, '')             // Remove trailing dots
      .trim();
  }

  /**
   * Format a date string for display
   */
  private formatDate(dateString: string): string {
    if (!dateString) return 'Unknown';
    
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  /**
   * Get the Jira web URL for a ticket
   */
  private getJiraUrl(ticket: JiraIssue): string {
    // Extract base URL from the self link
    if (ticket.self) {
      const baseUrl = ticket.self.split('/rest/')[0];
      return `${baseUrl}/browse/${ticket.key}`;
    }
    
    // Fallback - construct from key (won't work without base URL)
    return `https://jira.atlassian.net/browse/${ticket.key}`;
  }

  /**
   * Get an emoji for the priority level
   */
  private getPriorityEmoji(priority: string): string {
    const emojis: Record<string, string> = {
      'Highest': '🔴',
      'High': '🟠',
      'Medium': '🟡',
      'Low': '🟢',
      'Lowest': '⚪',
      'Critical': '🚨',
      'Major': '⚠️',
      'Minor': 'ℹ️',
      'Trivial': '💭'
    };
    
    return emojis[priority] || '📌';
  }
}