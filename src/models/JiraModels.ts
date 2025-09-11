/**
 * JiraTicket - Core model representing a Jira ticket
 * Based on Jira XML/RSS format structure
 */
export interface JiraTicket {
  // Core fields
  key: string;                    // PROJ-123
  id: string;                     // Jira internal ID
  summary: string;                // Ticket title
  description?: string;           // Ticket description (can be HTML/markdown)
  type: JiraIssueType;           // Bug, Story, Task, etc.
  priority: JiraPriority;         // Priority object
  status: JiraStatus;            // Status object
  resolution?: JiraResolution;    // Resolution if resolved
  
  // People fields
  assignee?: JiraUser;           // Assigned user
  reporter: JiraUser;            // Reporter user
  creator?: JiraUser;            // Creator (if different from reporter)
  
  // Temporal fields
  created: Date;                 // Creation timestamp
  updated: Date;                 // Last update timestamp
  duedate?: Date;               // Due date if set
  resolutiondate?: Date;        // Resolution date if resolved
  
  // Time tracking
  timetracking?: JiraTimeTracking;
  timespent?: number;           // Time spent in seconds
  timeoriginalestimate?: number; // Original estimate in seconds
  timeestimate?: number;        // Remaining estimate in seconds
  aggregatetimespent?: number; // Total time spent including subtasks
  
  // Project and components
  project: JiraProject;
  components?: JiraComponent[];
  versions?: JiraVersion[];
  fixVersions?: JiraVersion[];
  
  // Metadata
  labels?: string[];
  environment?: string;
  
  // Custom fields (common ones)
  customFields?: {
    sprint?: JiraSprint;
    epicLink?: string;
    storyPoints?: number;
    rank?: string;
    team?: string;
    datacenter?: string;
    [key: string]: any;  // Allow arbitrary custom fields
  };
  
  // Relationships
  parent?: JiraTicketReference;
  subtasks?: JiraTicketReference[];
  links?: JiraLink[];
  
  // Comments and attachments
  comments?: JiraComment[];
  attachments?: JiraAttachment[];
  
  // Workflow
  transitions?: JiraTransition[];
  workflow?: string;
  
  // Additional metadata
  watches?: number;
  votes?: number;
  securityLevel?: string;
}

/**
 * Supporting interfaces
 */
export interface JiraIssueType {
  id: string;
  name: string;
  description?: string;
  iconUrl?: string;
  subtask?: boolean;
}

export interface JiraPriority {
  id: string;
  name: string;           // Highest, High, Medium, Low, Lowest
  iconUrl?: string;
  color?: string;
  rank?: number;
}

export interface JiraStatus {
  id: string;
  name: string;           // To Do, In Progress, Done, etc.
  description?: string;
  statusCategory?: {
    id: number;
    key: string;        // new, indeterminate, done
    name: string;
    colorName?: string;
  };
}

export interface JiraResolution {
  id: string;
  name: string;           // Fixed, Won't Fix, Duplicate, etc.
  description?: string;
}

export interface JiraUser {
  accountId: string;      // Modern Jira uses accountId
  displayName: string;
  emailAddress?: string;
  avatarUrls?: {
    '16x16'?: string;
    '24x24'?: string;
    '32x32'?: string;
    '48x48'?: string;
  };
  active?: boolean;
  timeZone?: string;
}

export interface JiraTimeTracking {
  originalEstimate?: string;      // "2d 4h"
  remainingEstimate?: string;     // "1d"
  timeSpent?: string;             // "1d 4h"
  originalEstimateSeconds?: number;
  remainingEstimateSeconds?: number;
  timeSpentSeconds?: number;
}

export interface JiraProject {
  id: string;
  key: string;            // PROJ
  name: string;
  projectTypeKey?: string;
  avatarUrls?: Record<string, string>;
  simplified?: boolean;
}

export interface JiraComponent {
  id: string;
  name: string;
  description?: string;
  lead?: JiraUser;
  assigneeType?: string;
  project?: string;
}

export interface JiraVersion {
  id: string;
  name: string;
  description?: string;
  archived?: boolean;
  released?: boolean;
  releaseDate?: string;
  startDate?: string;
  projectId?: number;
}

export interface JiraSprint {
  id: number;
  name: string;
  state: 'active' | 'closed' | 'future';
  boardId?: number;
  startDate?: Date;
  endDate?: Date;
  completeDate?: Date;
  goal?: string;
}

export interface JiraTicketReference {
  id: string;
  key: string;
  summary?: string;
  status?: JiraStatus;
  priority?: JiraPriority;
  issuetype?: JiraIssueType;
}

export interface JiraLink {
  id: string;
  type: {
    id: string;
    name: string;
    inward: string;     // "is blocked by"
    outward: string;    // "blocks"
  };
  inwardIssue?: JiraTicketReference;
  outwardIssue?: JiraTicketReference;
}

export interface JiraComment {
  id: string;
  author: JiraUser;
  body: string;
  created: Date;
  updated?: Date;
  updateAuthor?: JiraUser;
  visibility?: {
    type: 'group' | 'role';
    value: string;
  };
}

export interface JiraAttachment {
  id: string;
  filename: string;
  author: JiraUser;
  created: Date;
  size: number;
  mimeType?: string;
  content?: string;       // URL to download
  thumbnail?: string;     // URL to thumbnail
}

export interface JiraTransition {
  id: string;
  name: string;
  to: JiraStatus;
  hasScreen?: boolean;
  isGlobal?: boolean;
  isInitial?: boolean;
  isConditional?: boolean;
}

/**
 * Jira API response wrapper
 */
export interface JiraSearchResponse {
  expand?: string;
  startAt: number;
  maxResults: number;
  total: number;
  issues: JiraTicket[];
}

/**
 * Field mapping configuration
 */
export interface JiraFieldMapping {
  jiraField: string;
  obsidianField: string;
  transformer?: (value: any) => any;
  required?: boolean;
  defaultValue?: any;
}

/**
 * Custom field definition
 */
export interface JiraCustomField {
  id: string;              // customfield_10001
  name: string;           // Sprint, Story Points, etc.
  type: string;           // string, number, array, etc.
  schema?: {
    type: string;
    items?: string;
    custom?: string;
    customId?: number;
  };
}