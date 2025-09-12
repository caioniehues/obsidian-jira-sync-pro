/**
 * JiraBasesAdapter - Core Adapter Class
 * Bridges Jira fields to Obsidian Base properties with full CRUD operations
 */

import {
  BaseSchema,
  BaseRecord,
  BaseQuery,
  BaseQueryResult,
  BaseOperationResult,
} from '../types/base-types';

import {
  JiraIssue,
  JiraField,
  JiraSearchRequest,
  JiraSearchResult,
  JiraCreateIssueRequest,
  JiraUpdateIssueRequest,
} from '../types/jira-types';

import {
  PropertyMapper,
  FieldMapping,
  PropertyMappingResult,
} from '../utils/property-mapper';

import {
  SchemaValidator,
  ValidationResult,
  SchemaValidationOptions,
} from '../utils/schema-validator';

import {
  getDefaultMappingConfig,
  createCustomFieldMapping,
  detectCustomFieldType,
} from '../config/default-mappings';

export interface JiraBasesConfig {
  jiraBaseUrl: string;
  username: string;
  apiToken: string;
  baseId: string;
  fieldMappings: Record<string, string>;
  defaultProject?: string;
  defaultIssueType?: string;
  enableWebhooks?: boolean;
  batchSize?: number;
  retryAttempts?: number;
  timeout?: number;
}

export interface SyncOptions {
  direction: 'jira-to-base' | 'base-to-jira' | 'bidirectional';
  conflictResolution: 'jira-wins' | 'base-wins' | 'merge' | 'prompt';
  batchSize?: number;
  dryRun?: boolean;
  includeDeleted?: boolean;
}

export interface SyncResult {
  totalProcessed: number;
  successful: number;
  failed: number;
  conflicts: number;
  errors: Array<{
    id: string;
    error: string;
    data?: unknown;
  }>;
  warnings: string[];
  duration: number;
}

export class JiraBasesAdapterError extends Error {
  constructor(
    message: string,
    public code: string,
    public retryable: boolean = false,
    public context?: unknown
  ) {
    super(message);
    this.name = 'JiraBasesAdapterError';
  }
}

export class JiraBasesAdapter {
  private readonly config: JiraBasesConfig;
  private baseSchema?: BaseSchema;
  private jiraFields?: JiraField[];
  private readonly logger: Console;
  private readonly propertyMapper: PropertyMapper;
  private readonly schemaValidator: SchemaValidator;
  private isInitialized: boolean = false;

  constructor(config: JiraBasesConfig) {
    this.config = config;
    this.logger = console;
    this.validateConfig();

    // Initialize mapper with default configuration
    const defaultConfig = getDefaultMappingConfig();
    this.propertyMapper = new PropertyMapper(
      defaultConfig.fieldMappings,
      defaultConfig.customTransformers
    );

    // Initialize validator with default rules
    this.schemaValidator = new SchemaValidator(defaultConfig.validationRules);

    // Override with custom field mappings if provided
    this.loadCustomFieldMappings();
  }

  /**
   * Initialize the adapter by loading base schema and Jira fields
   */
  async initialize(): Promise<void> {
    try {
      this.logger.log('Initializing JiraBasesAdapter...');

      // Load base schema
      await this.loadBaseSchema();

      // Load Jira field definitions
      await this.loadJiraFields();

      // Update mapper and validator with loaded schemas
      if (this.baseSchema?.properties !== undefined && this.baseSchema?.properties !== null) {
        this.propertyMapper.setBaseProperties(this.baseSchema.properties);
        this.schemaValidator.setBaseProperties(this.baseSchema.properties);
      }

      if (this.jiraFields !== undefined && this.jiraFields !== null) {
        this.propertyMapper.setJiraFields(this.jiraFields);
        this.schemaValidator.setJiraFields(this.jiraFields);

        // Auto-detect and configure custom fields
        await this.configureCustomFields();
      }

      // Validate field mappings
      this.validateFieldMappings();

      this.isInitialized = true;
      this.logger.log('JiraBasesAdapter initialized successfully');
    } catch (error) {
      throw new JiraBasesAdapterError(
        `Failed to initialize adapter: ${error.message}`,
        'INIT_ERROR',
        false,
        { originalError: error }
      );
    }
  }

  /**
   * Create a new Base record from Jira issue data
   */
  async createFromJira(
    jiraIssue: JiraIssue
  ): Promise<BaseOperationResult<BaseRecord>> {
    try {
      this.validateJiraIssue(jiraIssue);

      const mappedProperties = await this.mapJiraToBase(jiraIssue.fields);
      const validationResult =
        await this.validateBaseProperties(mappedProperties);

      if (!validationResult.success) {
        return {
          success: false,
          errors: validationResult.errors,
        };
      }

      const baseRecord: BaseRecord = {
        id: this.generateBaseRecordId(jiraIssue.key),
        baseId: this.config.baseId,
        properties: mappedProperties,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // TODO: Implement actual Base API call
      const createdRecord = await this.createBaseRecord(baseRecord);

      return {
        success: true,
        data: createdRecord,
      };
    } catch (error) {
      return this.handleError('CREATE_FROM_JIRA', error);
    }
  }

  /**
   * Update a Base record with Jira issue data
   */
  async updateFromJira(
    baseRecordId: string,
    jiraIssue: JiraIssue
  ): Promise<BaseOperationResult<BaseRecord>> {
    try {
      const existingRecord = await this.getBaseRecord(baseRecordId);
      if (!existingRecord) {
        throw new JiraBasesAdapterError(
          `Base record not found: ${baseRecordId}`,
          'RECORD_NOT_FOUND'
        );
      }

      const mappedProperties = await this.mapJiraToBase(jiraIssue.fields);
      const mergedProperties = this.mergeProperties(
        existingRecord.properties,
        mappedProperties
      );

      const validationResult =
        await this.validateBaseProperties(mergedProperties);
      if (!validationResult.success) {
        return {
          success: false,
          errors: validationResult.errors,
        };
      }

      const updatedRecord: BaseRecord = {
        ...existingRecord,
        properties: mergedProperties,
        updatedAt: new Date(),
      };

      // TODO: Implement actual Base API call
      const savedRecord = await this.updateBaseRecord(updatedRecord);

      return {
        success: true,
        data: savedRecord,
      };
    } catch (error) {
      return this.handleError('UPDATE_FROM_JIRA', error);
    }
  }

  /**
   * Create a Jira issue from Base record data
   */
  async createInJira(
    baseRecord: BaseRecord
  ): Promise<BaseOperationResult<JiraIssue>> {
    try {
      const mappedFields = await this.mapBaseToJira(baseRecord.properties);
      const createRequest: JiraCreateIssueRequest = {
        fields: {
          ...mappedFields,
          project: { key: this.config.defaultProject },
          issuetype: { name: this.config.defaultIssueType },
        },
      };

      // TODO: Implement actual Jira API call
      const jiraIssue = await this.createJiraIssue(createRequest);

      return {
        success: true,
        data: jiraIssue,
      };
    } catch (error) {
      return this.handleError('CREATE_IN_JIRA', error);
    }
  }

  /**
   * Update a Jira issue with Base record data
   */
  async updateInJira(
    jiraKey: string,
    baseRecord: BaseRecord
  ): Promise<BaseOperationResult<JiraIssue>> {
    try {
      const mappedFields = await this.mapBaseToJira(baseRecord.properties);
      const updateRequest: JiraUpdateIssueRequest = {
        fields: mappedFields,
      };

      // TODO: Implement actual Jira API call
      const updatedIssue = await this.updateJiraIssue(jiraKey, updateRequest);

      return {
        success: true,
        data: updatedIssue,
      };
    } catch (error) {
      return this.handleError('UPDATE_IN_JIRA', error);
    }
  }

  /**
   * Query Base records with filters
   */
  async queryBase(query: BaseQuery): Promise<BaseQueryResult> {
    try {
      // TODO: Implement actual Base API query
      return await this.executeBaseQuery(query);
    } catch (error) {
      throw new JiraBasesAdapterError(
        `Failed to query Base: ${error.message}`,
        'QUERY_BASE_ERROR',
        true,
        { query }
      );
    }
  }

  /**
   * Query Jira issues with JQL
   */
  async queryJira(searchRequest: JiraSearchRequest): Promise<JiraSearchResult> {
    try {
      // TODO: Implement actual Jira API search
      return await this.executeJiraSearch(searchRequest);
    } catch (error) {
      throw new JiraBasesAdapterError(
        `Failed to query Jira: ${error.message}`,
        'QUERY_JIRA_ERROR',
        true,
        { searchRequest }
      );
    }
  }

  /**
   * Perform bulk synchronization between Jira and Base
   */
  async sync(options: SyncOptions): Promise<SyncResult> {
    const startTime = Date.now();
    const result: SyncResult = {
      totalProcessed: 0,
      successful: 0,
      failed: 0,
      conflicts: 0,
      errors: [],
      warnings: [],
      duration: 0,
    };

    try {
      this.logger.log(`Starting sync with direction: ${options.direction}`);

      // TODO: Implement sync logic based on direction
      switch (options.direction) {
        case 'jira-to-base':
          await this.syncJiraToBase(options, result);
          break;
        case 'base-to-jira':
          await this.syncBaseToJira(options, result);
          break;
        case 'bidirectional':
          await this.syncBidirectional(options, result);
          break;
      }

      result.duration = Date.now() - startTime;
      this.logger.log(`Sync completed in ${result.duration}ms`);

      return result;
    } catch (error) {
      result.errors.push({
        id: 'SYNC_ERROR',
        error: error.message,
        data: { options },
      });
      result.duration = Date.now() - startTime;
      return result;
    }
  }

  // Private methods - placeholder implementations

  private validateConfig(): void {
    const required = ['jiraBaseUrl', 'username', 'apiToken', 'baseId'];
    for (const field of required) {
      if (!this.config[field as keyof JiraBasesConfig]) {
        throw new JiraBasesAdapterError(
          `Missing required configuration: ${field}`,
          'CONFIG_ERROR'
        );
      }
    }
  }

  private async loadBaseSchema(): Promise<void> {
    // TODO: Load actual base schema from Obsidian Base API
    this.baseSchema = {
      id: this.config.baseId,
      name: 'Jira Issues',
      description: 'Synchronized Jira issues',
      properties: [],
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  private async loadJiraFields(): Promise<void> {
    // TODO: Load actual Jira fields from Jira API
    this.jiraFields = [];
  }

  private validateFieldMappings(): void {
    try {
      const mappings = this.propertyMapper.getFieldMappings();
      const errors: string[] = [];

      for (const mapping of mappings) {
        // Check if Jira field exists (if we have field definitions)
        if (
          this.jiraFields &&
          !this.jiraFields.some(f => f.id === mapping.jiraFieldId)
        ) {
          // Only warn for non-standard fields
          if (
            !mapping.jiraFieldId.startsWith('customfield_') &&
            !['key', 'summary', 'description', 'status', 'priority'].includes(
              mapping.jiraFieldId
            )
          ) {
            this.logger.warn(
              `Jira field not found: ${mapping.jiraFieldId} (${mapping.jiraFieldName})`
            );
          }
        }

        // Check if Base property exists (if we have schema)
        if (
          this.baseSchema?.properties &&
          !this.baseSchema.properties.some(p => p.id === mapping.basePropertyId)
        ) {
          this.logger.warn(
            `Base property not found: ${mapping.basePropertyId} (${mapping.basePropertyName})`
          );
        }

        // Validate required field constraints
        if (mapping.required && !mapping.defaultValue) {
          // Check if we have a way to provide this required field
          if (!mapping.jiraFieldId) {
            errors.push(
              `Required mapping missing source field: ${mapping.basePropertyName}`
            );
          }
        }
      }

      if (errors.length > 0) {
        throw new JiraBasesAdapterError(
          `Field mapping validation failed: ${errors.join(', ')}`,
          'MAPPING_VALIDATION_ERROR',
          false,
          { errors }
        );
      }

      this.logger.log(
        `Validated ${mappings.length} field mappings successfully`
      );
    } catch (error) {
      if (error instanceof JiraBasesAdapterError) {
        throw error;
      }

      throw new JiraBasesAdapterError(
        `Field mapping validation error: ${error.message}`,
        'MAPPING_VALIDATION_ERROR',
        false,
        { originalError: error }
      );
    }
  }

  private validateJiraIssue(jiraIssue: JiraIssue): void {
    if (!jiraIssue.id || !jiraIssue.key) {
      throw new JiraBasesAdapterError(
        'Invalid Jira issue: missing id or key',
        'INVALID_JIRA_ISSUE'
      );
    }
  }

  private async mapJiraToBase(
    jiraFields: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    this.ensureInitialized();

    try {
      const mappingResult = await this.propertyMapper.mapJiraToBase(jiraFields);

      if (!mappingResult.success) {
        this.logger.warn('Field mapping warnings:', mappingResult.warnings);
        if (mappingResult.errors?.length) {
          this.logger.error('Field mapping errors:', mappingResult.errors);
          throw new JiraBasesAdapterError(
            `Field mapping failed: ${mappingResult.errors.map(e => e.message).join(', ')}`,
            'FIELD_MAPPING_ERROR',
            false,
            { errors: mappingResult.errors, jiraFields }
          );
        }
      }

      return mappingResult.value || {};
    } catch (error) {
      if (error instanceof JiraBasesAdapterError) {
        throw error;
      }

      throw new JiraBasesAdapterError(
        `Failed to map Jira fields to Base properties: ${error.message}`,
        'MAPPING_ERROR',
        true,
        { jiraFields, originalError: error }
      );
    }
  }

  private async mapBaseToJira(
    baseProperties: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    this.ensureInitialized();

    try {
      const mappingResult =
        await this.propertyMapper.mapBaseToJira(baseProperties);

      if (!mappingResult.success) {
        this.logger.warn(
          'Reverse field mapping warnings:',
          mappingResult.warnings
        );
        if (mappingResult.errors?.length) {
          this.logger.error(
            'Reverse field mapping errors:',
            mappingResult.errors
          );
          throw new JiraBasesAdapterError(
            `Reverse field mapping failed: ${mappingResult.errors.map(e => e.message).join(', ')}`,
            'REVERSE_MAPPING_ERROR',
            false,
            { errors: mappingResult.errors, baseProperties }
          );
        }
      }

      return mappingResult.value || {};
    } catch (error) {
      if (error instanceof JiraBasesAdapterError) {
        throw error;
      }

      throw new JiraBasesAdapterError(
        `Failed to map Base properties to Jira fields: ${error.message}`,
        'REVERSE_MAPPING_ERROR',
        true,
        { baseProperties, originalError: error }
      );
    }
  }

  private async validateBaseProperties(
    properties: Record<string, unknown>
  ): Promise<BaseOperationResult> {
    this.ensureInitialized();

    try {
      const validationOptions: SchemaValidationOptions = {
        allowUnknownProperties: true,
        normalizeValues: true,
        strictMode: false,
      };

      const validationResult = this.schemaValidator.validateBaseProperties(
        properties,
        validationOptions
      );

      if (!validationResult.valid) {
        return {
          success: false,
          errors: validationResult.errors,
        };
      }

      // Log any warnings
      if (validationResult.warnings.length > 0) {
        this.logger.warn(
          'Property validation warnings:',
          validationResult.warnings
        );
      }

      return {
        success: true,
        data: validationResult.normalizedValue || properties,
      };
    } catch (error) {
      return {
        success: false,
        errors: [
          {
            property: 'validation',
            message: `Validation failed: ${error.message}`,
            code: 'VALIDATION_ERROR',
            value: properties,
          },
        ],
      };
    }
  }

  private generateBaseRecordId(jiraKey: string): string {
    return `jira_${jiraKey.toLowerCase()}`;
  }

  private mergeProperties(
    existing: Record<string, unknown>,
    updated: Record<string, unknown>
  ): Record<string, unknown> {
    console.log('Merging properties:', {
      existingKeys: Object.keys(existing).length,
      updatedKeys: Object.keys(updated).length,
    });
    return { ...existing, ...updated };
  }

  private async createBaseRecord(record: BaseRecord): Promise<BaseRecord> {
    // TODO: Implement actual Base API create call
    console.log('Creating Base record:', {
      recordId: record.id,
      baseId: record.baseId,
      propertiesCount: Object.keys(record.properties).length,
    });
    return record;
  }

  private async updateBaseRecord(record: BaseRecord): Promise<BaseRecord> {
    // TODO: Implement actual Base API update call
    console.log('Updating Base record:', {
      recordId: record.id,
      baseId: record.baseId,
      propertiesCount: Object.keys(record.properties).length,
    });
    return record;
  }

  private async getBaseRecord(id: string): Promise<BaseRecord | null> {
    // TODO: Implement actual Base API get call
    console.log('Getting Base record:', { recordId: id });
    return null;
  }

  private async createJiraIssue(
    request: JiraCreateIssueRequest
  ): Promise<JiraIssue> {
    // TODO: Implement actual Jira API create call
    console.log('Creating Jira issue:', {
      hasFields: !!request.fields,
      fieldsCount: Object.keys(request.fields || {}).length,
    });
    return {} as JiraIssue;
  }

  private async updateJiraIssue(
    key: string,
    request: JiraUpdateIssueRequest
  ): Promise<JiraIssue> {
    // TODO: Implement actual Jira API update call
    console.log('Updating Jira issue:', {
      issueKey: key,
      hasFields: !!request.fields,
      fieldsCount: Object.keys(request.fields || {}).length,
    });
    return {} as JiraIssue;
  }

  private async executeBaseQuery(query: BaseQuery): Promise<BaseQueryResult> {
    // TODO: Implement actual Base API query
    console.log('Executing Base query:', {
      hasFilters: !!query.filters,
      filtersCount: query.filters?.length || 0,
      limit: query.limit || 'unlimited',
    });
    return {
      records: [],
      hasMore: false,
      totalCount: 0,
    };
  }

  private async executeJiraSearch(
    request: JiraSearchRequest
  ): Promise<JiraSearchResult> {
    // TODO: Implement actual Jira API search
    console.log('Executing Jira search:', {
      jql: request.jql || 'no JQL provided',
      maxResults: request.maxResults || 'default',
      startAt: request.startAt || 0,
    });
    return {
      expand: '',
      startAt: 0,
      maxResults: 0,
      total: 0,
      issues: [],
    };
  }

  private async syncJiraToBase(
    options: SyncOptions,
    result: SyncResult
  ): Promise<void> {
    // TODO: Implement Jira to Base sync logic
    console.log('Syncing Jira to Base:', {
      direction: options.direction,
      batchSize: options.batchSize || 'default',
      dryRun: options.dryRun || false,
      currentErrors: result.errors.length,
    });
  }

  private async syncBaseToJira(
    options: SyncOptions,
    result: SyncResult
  ): Promise<void> {
    // TODO: Implement Base to Jira sync logic
    console.log('Syncing Base to Jira:', {
      direction: options.direction,
      batchSize: options.batchSize || 'default',
      dryRun: options.dryRun || false,
      currentErrors: result.errors.length,
    });
  }

  private async syncBidirectional(
    options: SyncOptions,
    result: SyncResult
  ): Promise<void> {
    // TODO: Implement bidirectional sync logic
    console.log('Syncing bidirectionally:', {
      direction: options.direction,
      conflictResolution: options.conflictResolution,
      batchSize: options.batchSize || 'default',
      dryRun: options.dryRun || false,
      currentErrors: result.errors.length,
    });
  }

  private handleError(operation: string, error: unknown): BaseOperationResult {
    console.log('Handling error for operation:', {
      operation,
      hasError: !!error,
    });
    this.logger.error(`${operation} failed:`, error);
    return {
      success: false,
      errors: [
        {
          property: 'operation',
          message: (error as Error)?.message || 'Unknown error',
          code: (error as { code?: string })?.code || 'UNKNOWN_ERROR',
          value: operation,
        },
      ],
    };
  }

  /**
   * Load custom field mappings from configuration
   */
  private loadCustomFieldMappings(): void {
    if (this.config.fieldMappings) {
      for (const [jiraFieldId, basePropertyId] of Object.entries(
        this.config.fieldMappings
      )) {
        const existingMapping = this.propertyMapper.getJiraMapping(jiraFieldId);
        if (!existingMapping) {
          // Create new mapping for unmapped field
          const customMapping = createCustomFieldMapping(
            jiraFieldId,
            jiraFieldId, // Use field ID as name initially
            basePropertyId,
            basePropertyId
              .replace(/_/g, ' ')
              .replace(/\b\w/g, l => l.toUpperCase())
          );
          this.propertyMapper.setFieldMapping(customMapping);
        }
      }
    }
  }

  /**
   * Auto-configure custom fields based on field definitions
   */
  private async configureCustomFields(): Promise<void> {
    if (!this.jiraFields) return;

    const customFields = this.jiraFields.filter(field => field.custom);
    let configuredCount = 0;

    for (const field of customFields) {
      const existingMapping = this.propertyMapper.getJiraMapping(field.id);
      if (existingMapping) {
        continue; // Already configured
      }

      // Detect field type and create mapping
      const detection = detectCustomFieldType(field.name, field.id);

      const basePropertyId = field.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_|_$/g, '');

      const customMapping = createCustomFieldMapping(
        field.id,
        field.name,
        basePropertyId,
        field.name,
        {
          transformFunction: detection.transformFunction,
          required: false,
          bidirectional: !field.schema?.system, // Only system fields are typically read-only
        }
      );

      this.propertyMapper.setFieldMapping(customMapping);
      configuredCount++;
    }

    if (configuredCount > 0) {
      this.logger.log(
        `Auto-configured ${configuredCount} custom field mappings`
      );
    }
  }

  /**
   * Ensure adapter is initialized before operations
   */
  private ensureInitialized(): void {
    if (!this.isInitialized) {
      throw new JiraBasesAdapterError(
        'Adapter not initialized. Call initialize() first.',
        'NOT_INITIALIZED',
        false
      );
    }
  }

  /**
   * Get current field mappings
   */
  getFieldMappings(): FieldMapping[] {
    return this.propertyMapper.getFieldMappings();
  }

  /**
   * Add or update field mapping
   */
  setFieldMapping(mapping: FieldMapping): void {
    this.propertyMapper.setFieldMapping(mapping);
  }

  /**
   * Remove field mapping
   */
  removeFieldMapping(jiraFieldId: string): boolean {
    return this.propertyMapper.removeFieldMapping(jiraFieldId);
  }

  /**
   * Validate properties without persisting
   */
  async validateProperties(
    properties: Record<string, unknown>
  ): Promise<ValidationResult> {
    this.ensureInitialized();

    const validationOptions: SchemaValidationOptions = {
      allowUnknownProperties: true,
      normalizeValues: false,
      strictMode: false,
    };

    return this.schemaValidator.validateBaseProperties(
      properties,
      validationOptions
    );
  }

  /**
   * Test field mapping without persisting
   */
  async testFieldMapping(
    jiraFields: Record<string, unknown>
  ): Promise<PropertyMappingResult> {
    this.ensureInitialized();
    return await this.propertyMapper.mapJiraToBase(jiraFields);
  }

  /**
   * Get schema information
   */
  getSchemaInfo(): {
    baseSchema?: BaseSchema;
    jiraFields?: JiraField[];
    mappingCount: number;
  } {
    return {
      baseSchema: this.baseSchema,
      jiraFields: this.jiraFields,
      mappingCount: this.propertyMapper.getFieldMappings().length,
    };
  }
}
