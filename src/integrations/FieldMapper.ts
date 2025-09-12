import { 
  JiraTicket, 
  JiraFieldMapping, 
  JiraCustomField,
  JiraUser,
  JiraPriority,
  JiraStatus,
  JiraIssueType,
  JiraTimeTracking,
  JiraSprint
} from '../models/JiraModels';
import { moment } from 'obsidian';

/**
 * Field transformation functions
 */
export class FieldTransformers {
  /**
   * Convert seconds to human-readable duration
   */
  static secondsToHumanReadable(seconds: number | undefined): string {
    if (!seconds) return '';
    
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    
    return parts.join(' ') || '0m';
  }
  
  /**
   * Parse Jira duration string to seconds
   */
  static jiraDurationToSeconds(duration: string | undefined): number {
    if (!duration) return 0;
    
    const regex = /(\d+)([wdhm])/g;
    let totalSeconds = 0;
    let match;
    
    while ((match = regex.exec(duration)) !== null) {
      const value = parseInt(match[1]);
      const unit = match[2];
      
      switch (unit) {
        case 'w': totalSeconds += value * 5 * 8 * 3600; break; // 5 days * 8 hours
        case 'd': totalSeconds += value * 8 * 3600; break;     // 8 hours
        case 'h': totalSeconds += value * 3600; break;
        case 'm': totalSeconds += value * 60; break;
      }
    }
    
    return totalSeconds;
  }
  
  /**
   * Convert JiraUser to string representation
   */
  static userToString(user: JiraUser | undefined): string {
    if (!user) return '';
    return user.displayName || user.emailAddress || user.accountId || '';
  }
  
  /**
   * Convert JiraUser to markdown link
   */
  static userToMarkdownLink(user: JiraUser | undefined, jiraUrl?: string): string {
    if (!user) return '';
    
    const displayName = user.displayName || user.emailAddress || 'Unknown';
    if (jiraUrl && user.accountId) {
      return `[${displayName}](${jiraUrl}/secure/ViewProfile.jspa?accountId=${user.accountId})`;
    }
    
    return displayName;
  }
  
  /**
   * Convert priority to emoji
   */
  static priorityToEmoji(priority: JiraPriority | undefined): string {
    if (!priority) return '';
    
    const emojiMap: Record<string, string> = {
      'Highest': '🔴',
      'High': '🟠',
      'Medium': '🟡',
      'Low': '🟢',
      'Lowest': '🔵'
    };
    
    return emojiMap[priority.name] || '⚪';
  }
  
  /**
   * Convert status to emoji
   */
  static statusToEmoji(status: JiraStatus | undefined): string {
    if (!status) return '';
    
    const category = status.statusCategory?.key;
    switch (category) {
      case 'done': return '✅';
      case 'indeterminate': return '🔄';
      case 'new': return '📋';
      default: return '⚡';
    }
  }
  
  /**
   * Convert issue type to emoji
   */
  static issueTypeToEmoji(type: JiraIssueType | undefined): string {
    if (!type) return '';
    
    const emojiMap: Record<string, string> = {
      'Bug': '🐛',
      'Story': '📖',
      'Task': '✏️',
      'Epic': '🎯',
      'Subtask': '📎',
      'Improvement': '💡',
      'New Feature': '✨',
      'Technical Debt': '🔧'
    };
    
    return emojiMap[type.name] || '📄';
  }
  
  /**
   * Format date to ISO 8601 with timezone
   */
  static formatDate(date: Date | string | undefined, includeTime: boolean = false): string {
    if (!date) return '';
    
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(dateObj.getTime())) return '';
    
    if (includeTime) {
      return dateObj.toISOString();
    }
    
    return dateObj.toISOString().split('T')[0];
  }
  
  /**
   * Convert sprint information to string
   */
  static sprintToString(sprint: JiraSprint | undefined): string {
    if (!sprint) return '';
    
    let result = sprint.name;
    if (sprint.state) {
      result += ` (${sprint.state})`;
    }
    if (sprint.startDate && sprint.endDate) {
      result += ` ${FieldTransformers.formatDate(sprint.startDate)} - ${FieldTransformers.formatDate(sprint.endDate)}`;
    }
    
    return result;
  }
  
  /**
   * Sanitize HTML content
   */
  static sanitizeHtml(html: string | undefined): string {
    if (!html) return '';
    
    // Basic HTML to markdown conversion
    let result = html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<p>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<strong>/gi, '**')
      .replace(/<\/strong>/gi, '**')
      .replace(/<b>/gi, '**')
      .replace(/<\/b>/gi, '**')
      .replace(/<em>/gi, '*')
      .replace(/<\/em>/gi, '*')
      .replace(/<i>/gi, '*')
      .replace(/<\/i>/gi, '*')
      .replace(/<code>/gi, '`')
      .replace(/<\/code>/gi, '`')
      .replace(/<pre>/gi, '```\n')
      .replace(/<\/pre>/gi, '\n```')
      .replace(/<ul>/gi, '\n')
      .replace(/<\/ul>/gi, '\n')
      .replace(/<ol>/gi, '\n')
      .replace(/<\/ol>/gi, '\n')
      .replace(/<li>/gi, '- ')
      .replace(/<\/li>/gi, '\n')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&amp;/gi, '&')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'");
    
    // Remove any remaining HTML tags
    result = result.replace(/<[^>]*>/g, '');
    
    // Clean up excessive newlines
    result = result.replace(/\n{3,}/g, '\n\n');
    
    return result.trim();
  }
}

/**
 * Field mapping configuration for Jira to Obsidian transformation
 */
export class FieldMapper {
  private readonly jiraUrl: string = '';
  private readonly customFieldMappings: Map<string, JiraFieldMapping> = new Map();
  private readonly customFieldRegistry: Map<string, JiraCustomField> = new Map();
  
  constructor(jiraUrl?: string) {
    if (jiraUrl) {
      this.jiraUrl = jiraUrl;
    }
    this.initializeCoreMappings();
    this.initializeTemporalMappings();
    this.initializeMetadataMappings();
  }
  
  /**
   * Initialize core field mappings (T004)
   */
  private initializeCoreMappings(): void {
    // Core fields
    this.customFieldMappings.set('key', {
      jiraField: 'key',
      obsidianField: 'key',
      required: true
    });
    
    this.customFieldMappings.set('summary', {
      jiraField: 'summary',
      obsidianField: 'summary',
      required: true,
      transformer: (value) => FieldTransformers.sanitizeHtml(value)
    });
    
    this.customFieldMappings.set('description', {
      jiraField: 'description',
      obsidianField: 'description',
      transformer: (value) => FieldTransformers.sanitizeHtml(value)
    });
    
    this.customFieldMappings.set('type', {
      jiraField: 'type',
      obsidianField: 'type',
      transformer: (type: JiraIssueType) => ({
        name: type?.name,
        emoji: FieldTransformers.issueTypeToEmoji(type)
      })
    });
    
    this.customFieldMappings.set('priority', {
      jiraField: 'priority',
      obsidianField: 'priority',
      transformer: (priority: JiraPriority) => ({
        name: priority?.name,
        emoji: FieldTransformers.priorityToEmoji(priority),
        rank: priority?.rank
      })
    });
    
    this.customFieldMappings.set('status', {
      jiraField: 'status',
      obsidianField: 'status',
      transformer: (status: JiraStatus) => ({
        name: status?.name,
        emoji: FieldTransformers.statusToEmoji(status),
        category: status?.statusCategory?.key
      })
    });
    
    // People fields
    this.customFieldMappings.set('assignee', {
      jiraField: 'assignee',
      obsidianField: 'assignee',
      transformer: (user: JiraUser) => ({
        displayName: FieldTransformers.userToString(user),
        link: FieldTransformers.userToMarkdownLink(user, this.jiraUrl),
        accountId: user?.accountId
      })
    });
    
    this.customFieldMappings.set('reporter', {
      jiraField: 'reporter',
      obsidianField: 'reporter',
      transformer: (user: JiraUser) => ({
        displayName: FieldTransformers.userToString(user),
        link: FieldTransformers.userToMarkdownLink(user, this.jiraUrl),
        accountId: user?.accountId
      })
    });
  }
  
  /**
   * Initialize temporal field mappings with timezone support (T005)
   */
  private initializeTemporalMappings(): void {
    this.customFieldMappings.set('created', {
      jiraField: 'created',
      obsidianField: 'created',
      transformer: (date) => FieldTransformers.formatDate(date, true),
      required: true
    });
    
    this.customFieldMappings.set('updated', {
      jiraField: 'updated',
      obsidianField: 'updated',
      transformer: (date) => FieldTransformers.formatDate(date, true),
      required: true
    });
    
    this.customFieldMappings.set('duedate', {
      jiraField: 'duedate',
      obsidianField: 'due',
      transformer: (date) => FieldTransformers.formatDate(date, false)
    });
    
    this.customFieldMappings.set('resolutiondate', {
      jiraField: 'resolutiondate',
      obsidianField: 'resolved',
      transformer: (date) => FieldTransformers.formatDate(date, true)
    });
    
    // Time tracking fields
    this.customFieldMappings.set('timespent', {
      jiraField: 'timespent',
      obsidianField: 'timeSpent',
      transformer: (seconds) => ({
        seconds: seconds,
        formatted: FieldTransformers.secondsToHumanReadable(seconds)
      })
    });
    
    this.customFieldMappings.set('timeoriginalestimate', {
      jiraField: 'timeoriginalestimate',
      obsidianField: 'originalEstimate',
      transformer: (seconds) => ({
        seconds: seconds,
        formatted: FieldTransformers.secondsToHumanReadable(seconds)
      })
    });
    
    this.customFieldMappings.set('timeestimate', {
      jiraField: 'timeestimate',
      obsidianField: 'remainingEstimate',
      transformer: (seconds) => ({
        seconds: seconds,
        formatted: FieldTransformers.secondsToHumanReadable(seconds)
      })
    });
  }
  
  /**
   * Initialize metadata and custom field mappings (T006)
   */
  private initializeMetadataMappings(): void {
    // Project and components
    this.customFieldMappings.set('project', {
      jiraField: 'project',
      obsidianField: 'project',
      transformer: (project) => ({
        key: project?.key,
        name: project?.name
      })
    });
    
    this.customFieldMappings.set('components', {
      jiraField: 'components',
      obsidianField: 'components',
      transformer: (components: any[]) => 
        components?.map(c => c.name) || []
    });
    
    this.customFieldMappings.set('versions', {
      jiraField: 'versions',
      obsidianField: 'affectsVersions',
      transformer: (versions: any[]) => 
        versions?.map(v => v.name) || []
    });
    
    this.customFieldMappings.set('fixVersions', {
      jiraField: 'fixVersions',
      obsidianField: 'fixVersions',
      transformer: (versions: any[]) => 
        versions?.map(v => v.name) || []
    });
    
    this.customFieldMappings.set('labels', {
      jiraField: 'labels',
      obsidianField: 'labels',
      transformer: (labels) => labels || []
    });
    
    this.customFieldMappings.set('environment', {
      jiraField: 'environment',
      obsidianField: 'environment',
      transformer: (env) => FieldTransformers.sanitizeHtml(env)
    });
  }
  
  /**
   * Register a custom field mapping
   */
  registerCustomField(customFieldId: string, definition: JiraCustomField, mapping?: JiraFieldMapping): void {
    this.customFieldRegistry.set(customFieldId, definition);
    
    if (mapping) {
      this.customFieldMappings.set(customFieldId, mapping);
    } else {
      // Create default mapping based on field type
      this.customFieldMappings.set(customFieldId, {
        jiraField: customFieldId,
        obsidianField: this.camelCase(definition.name),
        transformer: this.getDefaultTransformer(definition.type)
      });
    }
    
    console.log(`FieldMapper: Registered custom field ${customFieldId} (${definition.name})`);
  }
  
  /**
   * Discover and register common custom fields
   */
  discoverCustomFields(sampleTicket: any): void {
    const commonCustomFields = [
      { pattern: /customfield_\d+/, name: 'Sprint', type: 'sprint' },
      { pattern: /customfield_\d+/, name: 'Story Points', type: 'number' },
      { pattern: /customfield_\d+/, name: 'Epic Link', type: 'string' },
      { pattern: /customfield_\d+/, name: 'Rank', type: 'string' },
      { pattern: /customfield_\d+/, name: 'Team', type: 'string' },
      { pattern: /customfield_\d+/, name: 'Datacenter', type: 'string' }
    ];
    
    // Iterate through ticket fields to find custom fields
    for (const [key, value] of Object.entries(sampleTicket)) {
      if (key.startsWith('customfield_')) {
        // Try to determine field type and name
        const fieldType = this.inferFieldType(value);
        const fieldName = this.inferFieldName(key, value);
        
        this.registerCustomField(key, {
          id: key,
          name: fieldName,
          type: fieldType,
          schema: {
            type: fieldType,
            customId: parseInt(key.replace('customfield_', ''))
          }
        });
      }
    }
  }
  
  /**
   * Map a Jira ticket to Obsidian format
   */
  mapTicket(jiraTicket: JiraTicket): Record<string, any> {
    const mappedTicket: Record<string, any> = {};
    
    // Apply all registered mappings
    for (const [fieldKey, mapping] of this.customFieldMappings) {
      const jiraValue = this.getNestedValue(jiraTicket, mapping.jiraField);
      
      if (jiraValue !== undefined && jiraValue !== null) {
        const transformedValue = mapping.transformer 
          ? mapping.transformer(jiraValue)
          : jiraValue;
        
        mappedTicket[mapping.obsidianField] = transformedValue;
      } else if (mapping.required && mapping.defaultValue !== undefined) {
        mappedTicket[mapping.obsidianField] = mapping.defaultValue;
      }
    }
    
    // Map custom fields
    if (jiraTicket.customFields) {
      mappedTicket.customFields = {};
      
      for (const [key, value] of Object.entries(jiraTicket.customFields)) {
        if (value !== undefined && value !== null) {
          // Apply specific transformations for known custom fields
          switch (key) {
            case 'sprint':
              mappedTicket.customFields.sprint = FieldTransformers.sprintToString(value as JiraSprint);
              break;
            case 'storyPoints':
              mappedTicket.customFields.storyPoints = value;
              break;
            case 'epicLink':
              mappedTicket.customFields.epicLink = value;
              break;
            default:
              mappedTicket.customFields[key] = value;
          }
        }
      }
    }
    
    // Add computed fields
    mappedTicket._computed = {
      url: `${this.jiraUrl}/browse/${jiraTicket.key}`,
      lastSyncTime: new Date().toISOString(),
      hasAttachments: (jiraTicket.attachments?.length || 0) > 0,
      hasComments: (jiraTicket.comments?.length || 0) > 0,
      hasSubtasks: (jiraTicket.subtasks?.length || 0) > 0,
      isResolved: !!jiraTicket.resolution,
      isOverdue: this.isOverdue(jiraTicket.duedate),
      ageInDays: this.calculateAge(jiraTicket.created)
    };
    
    return mappedTicket;
  }
  
  /**
   * Map multiple tickets
   */
  mapTickets(jiraTickets: JiraTicket[]): Record<string, any>[] {
    return jiraTickets.map(ticket => this.mapTicket(ticket));
  }
  
  /**
   * Reverse map from Obsidian to Jira format
   */
  reverseMap(obsidianData: Record<string, any>): Partial<JiraTicket> {
    const jiraTicket: Partial<JiraTicket> = {};
    
    // Reverse map using registered mappings
    for (const [fieldKey, mapping] of this.customFieldMappings) {
      const obsidianValue = obsidianData[mapping.obsidianField];
      
      if (obsidianValue !== undefined && obsidianValue !== null) {
        // Apply reverse transformation if needed
        let jiraValue = obsidianValue;
        
        // Handle specific reverse transformations
        if (mapping.obsidianField === 'timeSpent' && typeof obsidianValue === 'object') {
          jiraValue = obsidianValue.seconds;
        } else if (mapping.obsidianField === 'assignee' && typeof obsidianValue === 'object') {
          jiraValue = { accountId: obsidianValue.accountId };
        }
        
        this.setNestedValue(jiraTicket, mapping.jiraField, jiraValue);
      }
    }
    
    return jiraTicket;
  }
  
  /**
   * Get field mapping configuration
   */
  getFieldMapping(fieldName: string): JiraFieldMapping | undefined {
    return this.customFieldMappings.get(fieldName);
  }
  
  /**
   * Get all field mappings
   */
  getAllFieldMappings(): Map<string, JiraFieldMapping> {
    return new Map(this.customFieldMappings);
  }
  
  /**
   * Helper methods
   */
  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((curr, prop) => curr?.[prop], obj);
  }
  
  private setNestedValue(obj: any, path: string, value: any): void {
    const parts = path.split('.');
    const last = parts.pop()!;
    const target = parts.reduce((curr, prop) => {
      if (!curr[prop]) curr[prop] = {};
      return curr[prop];
    }, obj);
    target[last] = value;
  }
  
  private camelCase(str: string): string {
    return str.replace(/(?:^\w|[A-Z]|\b\w|\s+)/g, (match, index) => {
      if (+match === 0) return '';
      return index === 0 ? match.toLowerCase() : match.toUpperCase();
    }).replace(/\s+/g, '');
  }
  
  private inferFieldType(value: any): string {
    if (value === null || value === undefined) return 'string';
    if (typeof value === 'number') return 'number';
    if (typeof value === 'boolean') return 'boolean';
    if (Array.isArray(value)) return 'array';
    if (typeof value === 'object') return 'object';
    return 'string';
  }
  
  private inferFieldName(fieldId: string, value: any): string {
    // Try to infer from value structure
    if (value && typeof value === 'object') {
      if ('name' in value && 'state' in value) return 'Sprint';
      if ('accountId' in value) return 'User Field';
    }
    
    // Default to field ID
    return fieldId.replace('customfield_', 'Custom Field ');
  }
  
  private getDefaultTransformer(fieldType: string): ((value: any) => any) | undefined {
    switch (fieldType) {
      case 'string':
        return (value) => FieldTransformers.sanitizeHtml(value);
      case 'number':
        return (value) => parseFloat(value) || 0;
      case 'boolean':
        return (value) => !!value;
      case 'array':
        return (value) => Array.isArray(value) ? value : [];
      default:
        return undefined;
    }
  }
  
  private isOverdue(dueDate: Date | undefined): boolean {
    if (!dueDate) return false;
    const now = new Date();
    const due = typeof dueDate === 'string' ? new Date(dueDate) : dueDate;
    return due < now;
  }
  
  private calculateAge(created: Date | string): number {
    const createdDate = typeof created === 'string' ? new Date(created) : created;
    const now = new Date();
    const diffMs = now.getTime() - createdDate.getTime();
    return Math.floor(diffMs / (1000 * 60 * 60 * 24));
  }
  
  /**
   * Export field mappings for documentation
   */
  exportMappings(): string {
    const mappings: any[] = [];
    
    for (const [key, mapping] of this.customFieldMappings) {
      mappings.push({
        jiraField: mapping.jiraField,
        obsidianField: mapping.obsidianField,
        required: mapping.required || false,
        hasTransformer: !!mapping.transformer,
        defaultValue: mapping.defaultValue
      });
    }
    
    return JSON.stringify(mappings, null, 2);
  }
}

// Export singleton instance
export const fieldMapper = new FieldMapper();