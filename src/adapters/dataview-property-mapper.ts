/**
 * Dataview Property Mapper
 * Transforms Jira issue data into Dataview-compatible YAML frontmatter properties
 *
 * Core responsibility: Convert complex Jira objects to flat, queryable properties
 * following Dataview conventions and performance requirements (<50ms per file update)
 */

import {
  JiraIssue,
  JiraUser,
  JiraOption,
  JiraStatus,
  JiraPriority,
  JiraProject,
  JiraComponent,
  JiraVersion,
} from '../types/jira-types';

export interface DataviewProperty {
  key: string;
  value: unknown;
  type: DataviewPropertyType;
}

export enum DataviewPropertyType {
  STRING = 'string',
  NUMBER = 'number',
  DATE = 'date',
  BOOLEAN = 'boolean',
  ARRAY = 'array',
  LINK = 'link',
  TAG = 'tag',
}

export interface DataviewMappingResult {
  properties: Record<string, unknown>;
  tags: string[];
  links: string[];
  processingTime: number;
  warnings: string[];
}

export interface DataviewMappingOptions {
  includeRawFields?: boolean;
  maxNestingDepth?: number;
  dateFormat?: 'iso' | 'obsidian' | 'custom';
  customDateFormat?: string;
  linkFormat?: 'wikilink' | 'markdown';
  tagPrefix?: string;
  arrayMaxLength?: number;
}

export class DataviewPropertyMapper {
  private readonly options: Required<DataviewMappingOptions>;
  private readonly performanceTarget = 50; // milliseconds

  constructor(options: DataviewMappingOptions = {}) {
    this.options = {
      includeRawFields: options.includeRawFields ?? false,
      maxNestingDepth: options.maxNestingDepth ?? 3,
      dateFormat: options.dateFormat ?? 'obsidian',
      customDateFormat: options.customDateFormat ?? 'YYYY-MM-DD',
      linkFormat: options.linkFormat ?? 'wikilink',
      tagPrefix: options.tagPrefix ?? 'jira',
      arrayMaxLength: options.arrayMaxLength ?? 50,
      ...options,
    };
  }

  /**
   * Transform Jira issue to Dataview-compatible properties
   */
  async mapJiraIssueToDataview(
    jiraIssue: JiraIssue
  ): Promise<DataviewMappingResult> {
    const startTime = performance.now();
    const warnings: string[] = [];
    const properties: Record<string, any> = {};
    const tags: string[] = [];
    const links: string[] = [];

    try {
      // Core issue properties
      properties.jira_key = jiraIssue.key;
      properties.jira_id = jiraIssue.id;
      properties.jira_url = jiraIssue.self;

      // Process fields with flattening
      await this.processJiraFields(
        jiraIssue.fields,
        properties,
        tags,
        links,
        warnings
      );

      // Add computed properties
      this.addComputedProperties(properties, jiraIssue);

      // Add tags for key categorization
      this.addStandardTags(properties, tags);

      const processingTime = performance.now() - startTime;

      // Performance warning
      if (processingTime > this.performanceTarget) {
        warnings.push(
          `Processing exceeded target time: ${processingTime.toFixed(2)}ms > ${this.performanceTarget}ms`
        );
      }

      return {
        properties,
        tags,
        links,
        processingTime,
        warnings,
      };
    } catch (error) {
      const processingTime = performance.now() - startTime;
      throw new DataviewMappingError(
        `Failed to map Jira issue ${jiraIssue.key}: ${error.message}`,
        'MAPPING_ERROR',
        processingTime,
        { jiraIssue, originalError: error }
      );
    }
  }

  /**
   * Process Jira fields and flatten them into Dataview properties
   */
  private async processJiraFields(
    fields: Record<string, any>,
    properties: Record<string, any>,
    tags: string[],
    links: string[],
    warnings: string[]
  ): Promise<void> {
    for (const [fieldKey, fieldValue] of Object.entries(fields)) {
      if (fieldValue === null || fieldValue === undefined) {
        continue;
      }

      try {
        const mappedProps = await this.mapFieldValue(fieldKey, fieldValue, 0);

        // Merge mapped properties
        for (const [key, value] of Object.entries(mappedProps.properties)) {
          properties[key] = value;
        }

        // Collect tags and links
        tags.push(...mappedProps.tags);
        links.push(...mappedProps.links);
      } catch (error) {
        warnings.push(`Failed to process field ${fieldKey}: ${error.message}`);

        // Fallback to string representation
        if (this.options.includeRawFields) {
          properties[`${fieldKey}_raw`] = String(fieldValue);
        }
      }
    }
  }

  /**
   * Map individual field values to Dataview-compatible format
   */
  private async mapFieldValue(
    fieldKey: string,
    fieldValue: any,
    depth: number
  ): Promise<{
    properties: Record<string, any>;
    tags: string[];
    links: string[];
  }> {
    const properties: Record<string, any> = {};
    const tags: string[] = [];
    const links: string[] = [];

    // Prevent excessive nesting
    if (depth > this.options.maxNestingDepth) {
      properties[fieldKey] = String(fieldValue);
      return { properties, tags, links };
    }

    // Handle different field types
    switch (typeof fieldValue) {
      case 'string':
        properties[fieldKey] = fieldValue;
        break;

      case 'number':
        properties[fieldKey] = fieldValue;
        break;

      case 'boolean':
        properties[fieldKey] = fieldValue;
        break;

      case 'object':
        if (Array.isArray(fieldValue)) {
          await this.mapArrayField(
            fieldKey,
            fieldValue,
            properties,
            tags,
            links,
            depth
          );
        } else {
          await this.mapObjectField(
            fieldKey,
            fieldValue,
            properties,
            tags,
            links,
            depth
          );
        }
        break;

      default:
        properties[fieldKey] = String(fieldValue);
    }

    return { properties, tags, links };
  }

  /**
   * Map array fields (components, labels, etc.)
   */
  private async mapArrayField(
    fieldKey: string,
    fieldValue: any[],
    properties: Record<string, any>,
    tags: string[],
    links: string[],
    depth: number
  ): Promise<void> {
    if (fieldValue.length === 0) {
      properties[fieldKey] = [];
      return;
    }

    // Truncate large arrays for performance
    const processArray = fieldValue.slice(0, this.options.arrayMaxLength);
    if (fieldValue.length > this.options.arrayMaxLength) {
      properties[`${fieldKey}_truncated`] = true;
      properties[`${fieldKey}_total_count`] = fieldValue.length;
    }

    const mappedArray: any[] = [];
    const arrayTags: string[] = [];
    const arrayLinks: string[] = [];

    for (const item of processArray) {
      if (typeof item === 'object' && item !== null) {
        // Handle complex objects in arrays
        if (this.isJiraUser(item)) {
          mappedArray.push(item.displayName);
          arrayTags.push(
            `${this.options.tagPrefix}/user/${this.sanitizeTagName(item.displayName)}`
          );
        } else if (this.isJiraOption(item)) {
          mappedArray.push(item.value);
          arrayTags.push(
            `${this.options.tagPrefix}/${fieldKey}/${this.sanitizeTagName(item.value)}`
          );
        } else if (this.isJiraComponent(item)) {
          mappedArray.push(item.name);
          arrayTags.push(
            `${this.options.tagPrefix}/component/${this.sanitizeTagName(item.name)}`
          );
        } else if (this.isJiraVersion(item)) {
          mappedArray.push(item.name);
          arrayTags.push(
            `${this.options.tagPrefix}/version/${this.sanitizeTagName(item.name)}`
          );
        } else {
          // Generic object handling
          const flattened = await this.mapFieldValue(
            `${fieldKey}_item`,
            item,
            depth + 1
          );
          mappedArray.push(flattened.properties[`${fieldKey}_item`]);
          arrayTags.push(...flattened.tags);
          arrayLinks.push(...flattened.links);
        }
      } else {
        mappedArray.push(item);
      }
    }

    properties[fieldKey] = mappedArray;
    properties[`${fieldKey}_count`] = mappedArray.length;

    // Add first item for easy querying
    if (mappedArray.length > 0) {
      properties[`${fieldKey}_first`] = mappedArray[0];
    }

    tags.push(...arrayTags);
    links.push(...arrayLinks);
  }

  /**
   * Map object fields (user, status, priority, etc.)
   */
  private async mapObjectField(
    fieldKey: string,
    fieldValue: any,
    properties: Record<string, any>,
    tags: string[],
    links: string[],
    depth: number
  ): Promise<void> {
    // Handle known Jira object types
    if (this.isJiraUser(fieldValue)) {
      this.mapJiraUser(fieldKey, fieldValue, properties, tags, links);
    } else if (this.isJiraStatus(fieldValue)) {
      this.mapJiraStatus(fieldKey, fieldValue, properties, tags);
    } else if (this.isJiraPriority(fieldValue)) {
      this.mapJiraPriority(fieldKey, fieldValue, properties, tags);
    } else if (this.isJiraProject(fieldValue)) {
      this.mapJiraProject(fieldKey, fieldValue, properties, tags, links);
    } else if (this.isJiraComponent(fieldValue)) {
      this.mapJiraComponent(fieldKey, fieldValue, properties, tags);
    } else if (this.isJiraVersion(fieldValue)) {
      this.mapJiraVersion(fieldKey, fieldValue, properties, tags);
    } else if (this.isDateString(fieldValue)) {
      properties[fieldKey] = this.formatDate(fieldValue);
    } else {
      // Generic object flattening
      await this.flattenGenericObject(
        fieldKey,
        fieldValue,
        properties,
        tags,
        links,
        depth
      );
    }
  }

  /**
   * Map Jira user object
   */
  private mapJiraUser(
    fieldKey: string,
    user: JiraUser,
    properties: Record<string, any>,
    tags: string[],
    links: string[]
  ): void {
    properties[fieldKey] = user.displayName;
    properties[`${fieldKey}_id`] = user.accountId;
    properties[`${fieldKey}_email`] = user.emailAddress || '';
    properties[`${fieldKey}_active`] = user.active;

    tags.push(
      `${this.options.tagPrefix}/user/${this.sanitizeTagName(user.displayName)}`
    );

    if (user.avatarUrls?.['32x32']) {
      properties[`${fieldKey}_avatar`] = user.avatarUrls['32x32'];
    }
  }

  /**
   * Map Jira status object
   */
  private mapJiraStatus(
    fieldKey: string,
    status: JiraStatus,
    properties: Record<string, any>,
    tags: string[]
  ): void {
    properties[fieldKey] = status.name;
    properties[`${fieldKey}_id`] = status.id;
    properties[`${fieldKey}_category`] = status.statusCategory.name;
    properties[`${fieldKey}_category_key`] = status.statusCategory.key;
    properties[`${fieldKey}_color`] = status.statusCategory.colorName;

    tags.push(
      `${this.options.tagPrefix}/status/${this.sanitizeTagName(status.name)}`
    );
    tags.push(
      `${this.options.tagPrefix}/status-category/${this.sanitizeTagName(status.statusCategory.name)}`
    );
  }

  /**
   * Map Jira priority object
   */
  private mapJiraPriority(
    fieldKey: string,
    priority: JiraPriority,
    properties: Record<string, any>,
    tags: string[]
  ): void {
    properties[fieldKey] = priority.name;
    properties[`${fieldKey}_id`] = priority.id;

    tags.push(
      `${this.options.tagPrefix}/priority/${this.sanitizeTagName(priority.name)}`
    );

    if (priority.iconUrl) {
      properties[`${fieldKey}_icon`] = priority.iconUrl;
    }
  }

  /**
   * Map Jira project object
   */
  private mapJiraProject(
    fieldKey: string,
    project: JiraProject,
    properties: Record<string, any>,
    tags: string[],
    links: string[]
  ): void {
    properties[fieldKey] = project.name;
    properties[`${fieldKey}_key`] = project.key;
    properties[`${fieldKey}_id`] = project.id;
    properties[`${fieldKey}_type`] = project.projectTypeKey;
    properties[`${fieldKey}_simplified`] = project.simplified;

    tags.push(
      `${this.options.tagPrefix}/project/${this.sanitizeTagName(project.key)}`
    );

    // Create project link
    const projectLink = this.formatLink(project.key, project.name);
    links.push(projectLink);
    properties[`${fieldKey}_link`] = projectLink;
  }

  /**
   * Map Jira component object
   */
  private mapJiraComponent(
    fieldKey: string,
    component: JiraComponent,
    properties: Record<string, any>,
    tags: string[]
  ): void {
    properties[fieldKey] = component.name;
    properties[`${fieldKey}_id`] = component.id;

    tags.push(
      `${this.options.tagPrefix}/component/${this.sanitizeTagName(component.name)}`
    );

    if (component.lead) {
      properties[`${fieldKey}_lead`] = component.lead.displayName;
      properties[`${fieldKey}_lead_id`] = component.lead.accountId;
    }
  }

  /**
   * Map Jira version object
   */
  private mapJiraVersion(
    fieldKey: string,
    version: JiraVersion,
    properties: Record<string, any>,
    tags: string[]
  ): void {
    properties[fieldKey] = version.name;
    properties[`${fieldKey}_id`] = version.id;
    properties[`${fieldKey}_released`] = version.released;
    properties[`${fieldKey}_archived`] = version.archived;

    if (version.releaseDate) {
      properties[`${fieldKey}_release_date`] = this.formatDate(
        version.releaseDate
      );
    }

    tags.push(
      `${this.options.tagPrefix}/version/${this.sanitizeTagName(version.name)}`
    );

    if (version.overdue) {
      tags.push(`${this.options.tagPrefix}/overdue`);
    }
  }

  /**
   * Flatten generic object properties
   */
  private async flattenGenericObject(
    fieldKey: string,
    obj: any,
    properties: Record<string, any>,
    tags: string[],
    links: string[],
    depth: number
  ): Promise<void> {
    // Handle objects with common Jira patterns
    if (obj.self) {
      properties[`${fieldKey}_url`] = obj.self;
    }

    if (obj.name && obj.value) {
      properties[fieldKey] = obj.name;
      properties[`${fieldKey}_value`] = obj.value;
    } else if (obj.displayName) {
      properties[fieldKey] = obj.displayName;
    } else if (obj.name) {
      properties[fieldKey] = obj.name;
    } else if (obj.value) {
      properties[fieldKey] = obj.value;
    } else {
      // Flatten all properties
      for (const [key, value] of Object.entries(obj)) {
        if (value !== null && value !== undefined) {
          const nestedResult = await this.mapFieldValue(
            `${fieldKey}_${key}`,
            value,
            depth + 1
          );
          Object.assign(properties, nestedResult.properties);
          tags.push(...nestedResult.tags);
          links.push(...nestedResult.links);
        }
      }
    }
  }

  /**
   * Add computed properties for enhanced querying
   */
  private addComputedProperties(
    properties: Record<string, any>,
    jiraIssue: JiraIssue
  ): void {
    // Age calculations
    if (properties.created) {
      const createdDate = new Date(properties.created);
      const now = new Date();
      properties.age_days = Math.floor(
        (now.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24)
      );
    }

    if (properties.updated) {
      const updatedDate = new Date(properties.updated);
      const now = new Date();
      properties.days_since_update = Math.floor(
        (now.getTime() - updatedDate.getTime()) / (1000 * 60 * 60 * 24)
      );
    }

    // Time in status
    if (properties.status && properties.updated) {
      properties.time_in_current_status_days = properties.days_since_update;
    }

    // Story points calculations
    if (properties.customfield_10020 || properties.story_points) {
      const storyPoints =
        properties.customfield_10020 || properties.story_points;
      properties.story_points = Number(storyPoints) || 0;
      properties.has_story_points = Boolean(storyPoints);
    }

    // Resolution time
    if (properties.created && properties.resolutiondate) {
      const created = new Date(properties.created);
      const resolved = new Date(properties.resolutiondate);
      properties.resolution_time_days = Math.floor(
        (resolved.getTime() - created.getTime()) / (1000 * 60 * 60 * 24)
      );
    }

    // Epic link handling
    if (properties.customfield_10014 || properties.epic_link) {
      const epicLink = properties.customfield_10014 || properties.epic_link;
      properties.epic_link = epicLink;
      properties.has_epic = Boolean(epicLink);
    }
  }

  /**
   * Add standard categorization tags
   */
  private addStandardTags(
    properties: Record<string, any>,
    tags: string[]
  ): void {
    // Always add the base jira tag
    tags.push(this.options.tagPrefix);

    // Issue type tag
    if (properties.issuetype) {
      tags.push(
        `${this.options.tagPrefix}/type/${this.sanitizeTagName(properties.issuetype)}`
      );
    }

    // Workflow state tags
    if (properties.status) {
      const statusName = this.sanitizeTagName(properties.status);
      tags.push(`${this.options.tagPrefix}/workflow/${statusName}`);
    }

    // Priority tags
    if (properties.priority) {
      tags.push(
        `${this.options.tagPrefix}/priority/${this.sanitizeTagName(properties.priority)}`
      );
    }

    // Time-based tags
    if (properties.age_days !== undefined) {
      if (properties.age_days > 30) {
        tags.push(`${this.options.tagPrefix}/age/old`);
      } else if (properties.age_days > 7) {
        tags.push(`${this.options.tagPrefix}/age/recent`);
      } else {
        tags.push(`${this.options.tagPrefix}/age/new`);
      }
    }

    // Resolution tags
    if (properties.resolution) {
      tags.push(`${this.options.tagPrefix}/resolved`);
    } else {
      tags.push(`${this.options.tagPrefix}/unresolved`);
    }
  }

  // Type guards and utility methods

  private isJiraUser(obj: any): obj is JiraUser {
    return (
      obj &&
      typeof obj === 'object' &&
      'accountId' in obj &&
      'displayName' in obj
    );
  }

  private isJiraStatus(obj: any): obj is JiraStatus {
    return (
      obj &&
      typeof obj === 'object' &&
      'id' in obj &&
      'name' in obj &&
      'statusCategory' in obj
    );
  }

  private isJiraPriority(obj: any): obj is JiraPriority {
    return (
      obj &&
      typeof obj === 'object' &&
      'id' in obj &&
      'name' in obj &&
      obj.iconUrl
    );
  }

  private isJiraProject(obj: any): obj is JiraProject {
    return (
      obj && typeof obj === 'object' && 'key' in obj && 'projectTypeKey' in obj
    );
  }

  private isJiraComponent(obj: any): obj is JiraComponent {
    return (
      obj &&
      typeof obj === 'object' &&
      'id' in obj &&
      'name' in obj &&
      'projectId' in obj
    );
  }

  private isJiraVersion(obj: any): obj is JiraVersion {
    return (
      obj &&
      typeof obj === 'object' &&
      'id' in obj &&
      'name' in obj &&
      'released' in obj
    );
  }

  private isJiraOption(obj: any): obj is JiraOption {
    return obj && typeof obj === 'object' && 'value' in obj && 'id' in obj;
  }

  private isDateString(value: any): boolean {
    return typeof value === 'string' && !isNaN(Date.parse(value));
  }

  private formatDate(dateValue: any): string {
    const date = new Date(dateValue);

    switch (this.options.dateFormat) {
      case 'iso':
        return date.toISOString();
      case 'obsidian':
        return date.toISOString().split('T')[0]; // YYYY-MM-DD
      case 'custom':
        // Simple custom format implementation
        return this.options.customDateFormat
          .replace('YYYY', date.getFullYear().toString())
          .replace('MM', (date.getMonth() + 1).toString().padStart(2, '0'))
          .replace('DD', date.getDate().toString().padStart(2, '0'));
      default:
        return date.toISOString().split('T')[0];
    }
  }

  private formatLink(key: string, name?: string): string {
    const linkText = name || key;

    switch (this.options.linkFormat) {
      case 'wikilink':
        return `[[${key}]]`;
      case 'markdown':
        return `[${linkText}](${key})`;
      default:
        return `[[${key}]]`;
    }
  }

  private sanitizeTagName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\-_]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }
}

export class DataviewMappingError extends Error {
  constructor(
    message: string,
    public code: string,
    public processingTime: number,
    public context?: any
  ) {
    super(message);
    this.name = 'DataviewMappingError';
  }
}

/**
 * Factory function to create a mapper with optimized settings
 */
export function createOptimizedDataviewMapper(): DataviewPropertyMapper {
  return new DataviewPropertyMapper({
    includeRawFields: false,
    maxNestingDepth: 2,
    dateFormat: 'obsidian',
    linkFormat: 'wikilink',
    tagPrefix: 'jira',
    arrayMaxLength: 25,
  });
}

/**
 * Factory function to create a mapper with comprehensive settings
 */
export function createComprehensiveDataviewMapper(): DataviewPropertyMapper {
  return new DataviewPropertyMapper({
    includeRawFields: true,
    maxNestingDepth: 4,
    dateFormat: 'obsidian',
    linkFormat: 'wikilink',
    tagPrefix: 'jira',
    arrayMaxLength: 100,
  });
}
