/**
 * Mock Data for Testing
 * Provides realistic test fixtures for Jira and Base data structures
 */

import {
  BaseRecord,
  BaseSchema,
  BaseProperty,
  BasePropertyType,
  SelectOption,
  QueryFilter,
  FilterOperator
} from '../../src/types/base-types';
import type { Mock, Mocked, MockedFunction } from 'vitest';
  JiraIssue,
  JiraField,
  JiraFieldType,
  JiraFieldSchema,
  JiraUser,
  JiraProject,
  JiraStatus,
  JiraPriority,
  JiraComponent,
  JiraVersion,
  JiraSearchResult
} from '../../src/types/jira-types';
import { FieldMapping, FieldMappingConfig } from '../../src/utils/field-mappings';
import { TaskItem, TaskStatus, TaskPriority } from '../../src/types/tasks-types';
// Mock Jira Data
export const mockJiraUser: JiraUser = {
  accountId: 'user123',
  displayName: 'John Doe',
  emailAddress: 'john.doe@example.com',
  avatarUrls: {
    '16x16': 'https://example.com/avatar/16.png',
    '24x24': 'https://example.com/avatar/24.png',
    '32x32': 'https://example.com/avatar/32.png',
    '48x48': 'https://example.com/avatar/48.png'
  },
  active: true,
  timeZone: 'America/New_York'
};
export const mockJiraProject: JiraProject = {
  id: 'proj123',
  key: 'TEST',
  name: 'Test Project',
  description: 'A test project for development',
  projectTypeKey: 'software',
  simplified: false,
  self: 'https://example.atlassian.net/rest/api/2/project/proj123'
export const mockJiraStatus: JiraStatus = {
  id: 'status123',
  name: 'In Progress',
  description: 'Work is actively being done',
  iconUrl: 'https://example.com/status-icon.png',
  statusCategory: {
    id: 2,
    key: 'indeterminate',
    colorName: 'yellow',
    name: 'In Progress',
    self: 'https://example.atlassian.net/rest/api/2/statuscategory/2'
  self: 'https://example.atlassian.net/rest/api/2/status/status123'
export const mockJiraPriority: JiraPriority = {
  id: 'priority123',
  name: 'High',
  description: 'High priority issue',
  iconUrl: 'https://example.com/priority-high.png',
  self: 'https://example.atlassian.net/rest/api/2/priority/priority123'
export const mockJiraComponent: JiraComponent = {
  id: 'comp123',
  name: 'Backend',
  description: 'Backend component',
  lead: mockJiraUser,
  assigneeType: 'PROJECT_LEAD',
  assignee: mockJiraUser,
  realAssigneeType: 'PROJECT_LEAD',
  realAssignee: mockJiraUser,
  isAssigneeTypeValid: true,
  project: 'TEST',
  projectId: 123,
  self: 'https://example.atlassian.net/rest/api/2/component/comp123'
export const mockJiraVersion: JiraVersion = {
  id: 'version123',
  name: '1.0.0',
  description: 'First release version',
  archived: false,
  released: false,
  startDate: '2024-01-01',
  releaseDate: '2024-06-01',
  overdue: false,
  userStartDate: '2024-01-01',
  userReleaseDate: '2024-06-01',
  operations: [],
  remotelinks: [],
  self: 'https://example.atlassian.net/rest/api/2/version/version123'
export const mockJiraFields: JiraField[] = [
  {
    id: 'summary',
    name: 'Summary',
    custom: false,
    orderable: true,
    navigable: true,
    searchable: true,
    clauseNames: ['summary'],
    schema: {
      type: JiraFieldType.STRING,
      system: 'summary'
    }
    id: 'description',
    name: 'Description',
    orderable: false,
    clauseNames: ['description'],
      system: 'description'
    id: 'assignee',
    name: 'Assignee',
    clauseNames: ['assignee'],
      type: JiraFieldType.USER,
      system: 'assignee'
    id: 'priority',
    name: 'Priority',
    clauseNames: ['priority'],
      type: JiraFieldType.PRIORITY,
      system: 'priority'
    id: 'customfield_10001',
    name: 'Story Points',
    custom: true,
    clauseNames: ['cf[10001]', 'Story Points'],
      type: JiraFieldType.NUMBER,
      custom: 'com.atlassian.jira.plugin.system.customfieldtypes:float',
      customId: 10001
  }
];
export const mockJiraIssue: JiraIssue = {
  id: 'issue123',
  key: 'TEST-123',
  self: 'https://example.atlassian.net/rest/api/2/issue/issue123',
  fields: {
    summary: 'Test Issue Summary',
    description: 'This is a test issue description with **markdown** formatting.',
    assignee: mockJiraUser,
    reporter: mockJiraUser,
    priority: mockJiraPriority,
    status: mockJiraStatus,
    project: mockJiraProject,
    issuetype: {
      id: 'type123',
      name: 'Story',
      description: 'A user story',
      iconUrl: 'https://example.com/story-icon.png',
      subtask: false,
      self: 'https://example.atlassian.net/rest/api/2/issuetype/type123'
    },
    components: [mockJiraComponent],
    fixVersions: [mockJiraVersion],
    labels: ['backend', 'api', 'critical'],
    created: '2024-01-01T10:00:00.000+0000',
    updated: '2024-01-15T14:30:00.000+0000',
    duedate: '2024-02-01',
    customfield_10001: 8.5 // Story Points
export const mockJiraSearchResult: JiraSearchResult = {
  expand: 'schema,names',
  startAt: 0,
  maxResults: 50,
  total: 1,
  issues: [mockJiraIssue],
  names: {
    summary: 'Summary',
    description: 'Description',
    assignee: 'Assignee'
  schema: {
    summary: {
    description: {
    assignee: {
// Mock Base Data
export const mockSelectOptions: SelectOption[] = [
  { id: 'high', name: 'High', color: 'red' },
  { id: 'medium', name: 'Medium', color: 'yellow' },
  { id: 'low', name: 'Low', color: 'green' }
export const mockBaseProperties: BaseProperty[] = [
    id: 'title',
    name: 'Title',
    type: BasePropertyType.TEXT,
    required: true,
    constraints: {
      maxLength: 255
    type: BasePropertyType.RICH_TEXT,
    required: false,
      maxLength: 10000
    type: BasePropertyType.USER,
    required: false
    type: BasePropertyType.SELECT,
      options: mockSelectOptions
    id: 'status',
    name: 'Status',
      options: [
        { id: 'todo', name: 'To Do', color: 'gray' },
        { id: 'in_progress', name: 'In Progress', color: 'blue' },
        { id: 'done', name: 'Done', color: 'green' }
      ]
    defaultValue: 'todo'
    id: 'labels',
    name: 'Labels',
    type: BasePropertyType.MULTI_SELECT,
        { id: 'backend', name: 'Backend' },
        { id: 'frontend', name: 'Frontend' },
        { id: 'api', name: 'API' },
        { id: 'critical', name: 'Critical' }
    id: 'story_points',
    type: BasePropertyType.NUMBER,
      min: 0,
      max: 100
    id: 'due_date',
    name: 'Due Date',
    type: BasePropertyType.DATE,
export const mockBaseSchema: BaseSchema = {
  id: 'base123',
  name: 'Jira Issues',
  description: 'Synchronized Jira issues in Obsidian Base',
  properties: mockBaseProperties,
  version: 1,
  createdAt: new Date('2024-01-01T10:00:00Z'),
  updatedAt: new Date('2024-01-15T14:30:00Z')
export const mockBaseRecord: BaseRecord = {
  id: 'jira_test-123',
  baseId: 'base123',
  properties: {
    title: 'Test Issue Summary',
      id: 'user123',
      name: 'John Doe',
      email: 'john.doe@example.com'
    priority: 'high',
    status: 'in_progress',
    story_points: 8.5,
    due_date: new Date('2024-02-01T00:00:00Z')
  updatedAt: new Date('2024-01-15T14:30:00Z'),
  createdBy: 'user123',
  lastModifiedBy: 'user123'
// Mock Tasks Data
export const mockTaskItem: TaskItem = {
  id: 'task-test-123',
  description: 'Test task from Jira issue TEST-123 [TEST-123](https://example.atlassian.net/browse/TEST-123)',
  status: TaskStatus.TODO,
  priority: TaskPriority.HIGH,
  dueDate: new Date('2024-02-01'),
  scheduledDate: undefined,
  startDate: undefined,
  cancelledDate: undefined,
  doneDate: undefined,
  created: new Date('2024-01-01'),
  recurrence: undefined,
  tags: ['backend', 'api', 'critical', 'TEST-123'],
  originalMarkdown: '- [ ] ⏫ Test task from Jira issue TEST-123 [TEST-123](https://example.atlassian.net/browse/TEST-123) 📅 2024-02-01 #backend #api #critical #TEST-123',
  filePath: 'Tasks/Jira Issues.md',
  lineNumber: 5,
  heading: '## Test Project',
  sectionIndex: 0,
  precedingHeader: undefined,
  blockLink: undefined
// Mock Field Mappings
export const mockFieldMappings: FieldMapping[] = [
    jiraFieldId: 'summary',
    jiraFieldName: 'Summary',
    basePropertyId: 'title',
    basePropertyName: 'Title',
    bidirectional: true
    jiraFieldId: 'description',
    jiraFieldName: 'Description',
    basePropertyId: 'description',
    basePropertyName: 'Description',
    bidirectional: true,
    transformFunction: 'string_to_rich_text'
    jiraFieldId: 'assignee',
    jiraFieldName: 'Assignee',
    basePropertyId: 'assignee',
    basePropertyName: 'Assignee',
    transformFunction: 'user_to_user'
    jiraFieldId: 'priority',
    jiraFieldName: 'Priority',
    basePropertyId: 'priority',
    basePropertyName: 'Priority',
    transformFunction: 'option_to_select'
    jiraFieldId: 'status',
    jiraFieldName: 'Status',
    basePropertyId: 'status',
    basePropertyName: 'Status',
    bidirectional: false,
    jiraFieldId: 'labels',
    jiraFieldName: 'Labels',
    basePropertyId: 'labels',
    basePropertyName: 'Labels',
    transformFunction: 'array_to_multi_select'
    jiraFieldId: 'customfield_10001',
    jiraFieldName: 'Story Points',
    basePropertyId: 'story_points',
    basePropertyName: 'Story Points',
    transformFunction: 'number_to_number'
    jiraFieldId: 'duedate',
    jiraFieldName: 'Due Date',
    basePropertyId: 'due_date',
    basePropertyName: 'Due Date',
    transformFunction: 'date_to_date'
export const mockFieldMappingConfig: FieldMappingConfig = {
  version: '1.0.0',
  mappings: mockFieldMappings,
  customTransformers: {
    'project_to_select': 'function(ctx) { return ctx.sourceValue?.key || ctx.sourceValue?.name || ctx.sourceValue; }',
    'votes_to_number': 'function(ctx) { return ctx.sourceValue?.votes || 0; }',
    'watches_to_number': 'function(ctx) { return ctx.sourceValue?.watchCount || 0; }'
  validationRules: {
    'title': {
      'maxLength': 255,
      'required': true
    'description': {
      'maxLength': 10000
// Mock Queries and Filters
export const mockQueryFilters: QueryFilter[] = [
    property: 'status',
    operator: FilterOperator.EQUALS,
    value: 'in_progress'
    property: 'priority',
    value: 'high'
    property: 'assignee',
    operator: FilterOperator.IS_NOT_EMPTY,
    value: null
// Factory Functions for Test Data
export function createMockJiraIssue(overrides: Partial<JiraIssue> = {}): JiraIssue {
  return {
    ...mockJiraIssue,
    ...overrides,
    fields: {
      ...mockJiraIssue.fields,
      ...(overrides.fields || {})
  };
}
export function createMockBaseRecord(overrides: Partial<BaseRecord> = {}): BaseRecord {
    ...mockBaseRecord,
    properties: {
      ...mockBaseRecord.properties,
      ...(overrides.properties || {})
export function createMockJiraUser(overrides: Partial<JiraUser> = {}): JiraUser {
    ...mockJiraUser,
    ...overrides
export function createMockBaseProperty(overrides: Partial<BaseProperty> = {}): BaseProperty {
    id: 'test_property',
    name: 'Test Property',
export function createMockFieldMapping(overrides: Partial<FieldMapping> = {}): FieldMapping {
    jiraFieldId: 'test_field',
    jiraFieldName: 'Test Field',
    basePropertyId: 'test_property',
    basePropertyName: 'Test Property',
// Test Data Collections
export const mockJiraIssues: JiraIssue[] = [
  createMockJiraIssue({ id: 'issue1', key: 'TEST-1' }),
  createMockJiraIssue({ 
    id: 'issue2', 
    key: 'TEST-2',
      summary: 'Second Test Issue',
      priority: { ...mockJiraPriority, name: 'Medium' }
  }),
    id: 'issue3', 
    key: 'TEST-3',
      summary: 'Third Test Issue',
      status: { ...mockJiraStatus, name: 'Done' }
  })
export const mockBaseRecords: BaseRecord[] = [
  createMockBaseRecord({ id: 'jira_test-1' }),
  createMockBaseRecord({ 
    id: 'jira_test-2',
      title: 'Second Test Issue',
      priority: 'medium'
    id: 'jira_test-3',
      title: 'Third Test Issue',
      status: 'done'
// Error Scenarios for Testing
export const mockApiErrors = {
  networkError: new Error('Network connection failed'),
  authError: { code: 'UNAUTHORIZED', message: 'Invalid credentials' },
  rateLimitError: { code: 'RATE_LIMITED', message: 'Too many requests' },
  validationError: { code: 'VALIDATION_ERROR', message: 'Invalid field value' },
  notFoundError: { code: 'NOT_FOUND', message: 'Resource not found' }
// Performance Test Data
export function generateLargeDataSet(size: number): {
  jiraIssues: JiraIssue[];
  baseRecords: BaseRecord[];
} {
  const jiraIssues: JiraIssue[] = [];
  const baseRecords: BaseRecord[] = [];
  for (let i = 1; i <= size; i++) {
    jiraIssues.push(createMockJiraIssue({
      id: `issue${i}`,
      key: `PERF-${i}`,
      fields: {
        ...mockJiraIssue.fields,
        summary: `Performance Test Issue ${i}`,
        description: `This is performance test issue number ${i}`.repeat(10) // Larger description
      }
    }));
    baseRecords.push(createMockBaseRecord({
      id: `jira_perf-${i}`,
      properties: {
        ...mockBaseRecord.properties,
        title: `Performance Test Issue ${i}`,
        description: `This is performance test issue number ${i}`.repeat(10)
  return { jiraIssues, baseRecords };
// Export all mock data as a single object for easy importing
export const MockData = {
  jira: {
    user: mockJiraUser,
    component: mockJiraComponent,
    version: mockJiraVersion,
    fields: mockJiraFields,
    issue: mockJiraIssue,
    issues: mockJiraIssues,
    searchResult: mockJiraSearchResult
  base: {
    properties: mockBaseProperties,
    schema: mockBaseSchema,
    record: mockBaseRecord,
    records: mockBaseRecords,
    selectOptions: mockSelectOptions
  tasks: {
    taskItem: mockTaskItem
  mapping: {
    fieldMappings: mockFieldMappings,
    config: mockFieldMappingConfig
  queries: {
    filters: mockQueryFilters
  errors: mockApiErrors,
  factories: {
    createJiraIssue: createMockJiraIssue,
    createBaseRecord: createMockBaseRecord,
    createJiraUser: createMockJiraUser,
    createBaseProperty: createMockBaseProperty,
    createFieldMapping: createMockFieldMapping,
    generateLargeDataSet
