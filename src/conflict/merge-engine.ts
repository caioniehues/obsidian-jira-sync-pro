/**
 * Merge Engine for Intelligent Field Merging
 * Provides sophisticated algorithms for merging different data types
 * Handles text diff/merge, array merging, object merging, and custom field types
 */

export type MergeAlgorithm =
  | 'THREE_WAY_MERGE' // Best effort merge with common ancestor
  | 'UNION' // Combine all values
  | 'INTERSECTION' // Keep only common values
  | 'APPEND' // Append one to the other
  | 'SMART_TEXT_MERGE' // Intelligent text merging
  | 'TIMESTAMP_PRIORITY' // Use newer value
  | 'LENGTH_PRIORITY' // Use longer/more complete value
  | 'PRIORITY_BASED'; // Use priority rules for specific values

export interface MergeOptions {
  algorithm?: MergeAlgorithm;
  preserveFormatting?: boolean;
  caseSensitive?: boolean;
  ignoreWhitespace?: boolean;
  conflictMarkers?: {
    localStart?: string;
    remoteStart?: string;
    separator?: string;
    end?: string;
  };
  customRules?: {
    fieldSpecific?: Map<string, MergeAlgorithm>;
    priorityValues?: Map<string, number>; // For priority-based merging
    blacklistPatterns?: RegExp[]; // Values to exclude from merge
  };
}

export interface MergeResult {
  success: boolean;
  mergedValue: unknown;
  algorithm: MergeAlgorithm;
  confidence: number;
  conflictsResolved: number;
  conflictsRemaining: number;
  metadata: {
    hasConflictMarkers?: boolean;
    preservedLocalSections?: string[];
    preservedRemoteSections?: string[];
    removedContent?: string[];
    warnings?: string[];
  };
}

export class MergeEngine {
  private readonly DEFAULT_CONFLICT_MARKERS = {
    localStart: '<<<<<<< LOCAL',
    remoteStart: '>>>>>>> REMOTE',
    separator: '=======',
    end: '>>>>>>> MERGED',
  };

  /**
   * Merge two values using intelligent algorithm selection
   */
  merge(
    localValue: unknown,
    remoteValue: unknown,
    field: string,
    options: MergeOptions = {}
  ): MergeResult {
    const startTime = Date.now();

    try {
      // Handle identical values
      if (this.areValuesEqual(localValue, remoteValue, options)) {
        return {
          success: true,
          mergedValue: localValue,
          algorithm: 'UNION',
          confidence: 1.0,
          conflictsResolved: 0,
          conflictsRemaining: 0,
          metadata: { warnings: [] },
        };
      }

      // Handle null/undefined cases
      if (this.isNullOrEmpty(localValue) && !this.isNullOrEmpty(remoteValue)) {
        return {
          success: true,
          mergedValue: remoteValue,
          algorithm: 'UNION',
          confidence: 1.0,
          conflictsResolved: 1,
          conflictsRemaining: 0,
          metadata: { warnings: ['Local value was empty - used remote value'] },
        };
      }

      if (!this.isNullOrEmpty(localValue) && this.isNullOrEmpty(remoteValue)) {
        return {
          success: true,
          mergedValue: localValue,
          algorithm: 'UNION',
          confidence: 1.0,
          conflictsResolved: 1,
          conflictsRemaining: 0,
          metadata: { warnings: ['Remote value was empty - used local value'] },
        };
      }

      // Select algorithm based on field type and options
      const algorithm =
        options.algorithm ||
        this.selectMergeAlgorithm(localValue, remoteValue, field, options);

      // Apply algorithm-specific merge
      const result = this.applyMergeAlgorithm(
        algorithm,
        localValue,
        remoteValue,
        field,
        options
      );

      // Add performance metadata
      result.metadata.warnings = result.metadata.warnings || [];
      const duration = Date.now() - startTime;
      if (duration > 1000) {
        result.metadata.warnings.push(
          `Merge took ${duration}ms - consider simpler algorithm for field '${field}'`
        );
      }

      return result;
    } catch (error) {
      return {
        success: false,
        mergedValue: localValue, // Fallback to local value
        algorithm: 'TIMESTAMP_PRIORITY',
        confidence: 0.1,
        conflictsResolved: 0,
        conflictsRemaining: 1,
        metadata: {
          warnings: [
            `Merge failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          ],
        },
      };
    }
  }

  /**
   * Select optimal merge algorithm based on data types and field characteristics
   */
  private selectMergeAlgorithm(
    localValue: unknown,
    remoteValue: unknown,
    field: string,
    options: MergeOptions
  ): MergeAlgorithm {
    // Check for field-specific overrides
    const fieldSpecific = options.customRules?.fieldSpecific?.get(field);
    if (fieldSpecific) return fieldSpecific;

    const localType = this.getValueType(localValue);
    const remoteType = this.getValueType(remoteValue);

    // Type mismatch - use timestamp priority
    if (localType !== remoteType) {
      return 'TIMESTAMP_PRIORITY';
    }

    switch (localType) {
      case 'string':
        return this.selectTextMergeAlgorithm(localValue, remoteValue, field);

      case 'array':
        return this.selectArrayMergeAlgorithm(localValue, remoteValue, field);

      case 'object':
        return 'THREE_WAY_MERGE'; // Objects benefit from property-level merging

      case 'number':
        return this.selectNumericMergeAlgorithm(localValue, remoteValue, field);

      case 'boolean':
        return 'TIMESTAMP_PRIORITY'; // Boolean conflicts need priority decision

      default:
        return 'TIMESTAMP_PRIORITY';
    }
  }

  /**
   * Select text merge algorithm based on content analysis
   */
  private selectTextMergeAlgorithm(
    localText: string,
    remoteText: string,
    field: string
  ): MergeAlgorithm {
    const localLength = localText.length;
    const remoteLength = remoteText.length;
    const lengthRatio =
      Math.min(localLength, remoteLength) / Math.max(localLength, remoteLength);

    // If one text contains the other, use the longer one
    if (localText.includes(remoteText) || remoteText.includes(localText)) {
      return 'LENGTH_PRIORITY';
    }

    // For descriptions and long texts, try smart merge
    if (
      (field.toLowerCase().includes('description') ||
        field.toLowerCase().includes('comment')) &&
      localLength > 100 &&
      remoteLength > 100
    ) {
      return 'SMART_TEXT_MERGE';
    }

    // For short texts with similar lengths, try smart merge
    if (lengthRatio > 0.5 && Math.max(localLength, remoteLength) < 500) {
      return 'SMART_TEXT_MERGE';
    }

    // Default to appending for texts
    return 'APPEND';
  }

  /**
   * Select array merge algorithm based on content
   */
  private selectArrayMergeAlgorithm(
    localArray: unknown[],
    remoteArray: unknown[],
    field: string
  ): MergeAlgorithm {
    // For labels, tags, components - usually want union
    if (
      field.toLowerCase().includes('label') ||
      field.toLowerCase().includes('tag') ||
      field.toLowerCase().includes('component')
    ) {
      return 'UNION';
    }

    // For lists where order matters, try three-way merge
    if (
      field.toLowerCase().includes('step') ||
      field.toLowerCase().includes('order') ||
      field.toLowerCase().includes('sequence')
    ) {
      return 'THREE_WAY_MERGE';
    }

    // Default to union for arrays
    return 'UNION';
  }

  /**
   * Select numeric merge algorithm
   */
  private selectNumericMergeAlgorithm(
    localNum: number,
    remoteNum: number,
    field: string
  ): MergeAlgorithm {
    // For story points, estimates - use higher value (refinement)
    if (
      field.toLowerCase().includes('point') ||
      field.toLowerCase().includes('estimate') ||
      field.toLowerCase().includes('effort')
    ) {
      return 'PRIORITY_BASED'; // Will use higher number as priority
    }

    // For counts, use newer value
    return 'TIMESTAMP_PRIORITY';
  }

  /**
   * Apply specific merge algorithm
   */
  private applyMergeAlgorithm(
    algorithm: MergeAlgorithm,
    localValue: unknown,
    remoteValue: unknown,
    field: string,
    options: MergeOptions
  ): MergeResult {
    switch (algorithm) {
      case 'UNION':
        return this.mergeUnion(localValue, remoteValue, options);

      case 'INTERSECTION':
        return this.mergeIntersection(localValue, remoteValue, options);

      case 'APPEND':
        return this.mergeAppend(localValue, remoteValue, options);

      case 'SMART_TEXT_MERGE':
        return this.mergeSmartText(localValue, remoteValue, options);

      case 'THREE_WAY_MERGE':
        return this.mergeThreeWay(localValue, remoteValue, options);

      case 'TIMESTAMP_PRIORITY':
        return this.mergeTimestampPriority(localValue, remoteValue, options);

      case 'LENGTH_PRIORITY':
        return this.mergeLengthPriority(localValue, remoteValue, options);

      case 'PRIORITY_BASED':
        return this.mergePriorityBased(localValue, remoteValue, field, options);

      default:
        return this.mergeTimestampPriority(localValue, remoteValue, options);
    }
  }

  /**
   * Union merge - combine all unique elements
   */
  private mergeUnion(
    localValue: unknown,
    remoteValue: unknown,
    options: MergeOptions
  ): MergeResult {
    console.log('Merging with union algorithm:', {
      hasLocalValue: localValue !== null && localValue !== undefined,
      hasRemoteValue: remoteValue !== null && remoteValue !== undefined,
      optionsProvided: Object.keys(options).length > 0,
    });
    if (Array.isArray(localValue) && Array.isArray(remoteValue)) {
      const merged = [...new Set([...localValue, ...remoteValue])];
      const addedItems = remoteValue.filter(item => !localValue.includes(item));

      return {
        success: true,
        mergedValue: merged,
        algorithm: 'UNION',
        confidence: 0.9,
        conflictsResolved: addedItems.length,
        conflictsRemaining: 0,
        metadata: {
          preservedLocalSections: localValue.map(String),
          preservedRemoteSections: addedItems.map(String),
          warnings: [],
        },
      };
    }

    if (typeof localValue === 'object' && typeof remoteValue === 'object') {
      const merged = { ...localValue, ...remoteValue };
      const conflictKeys = Object.keys(localValue).filter(
        key => key in remoteValue && localValue[key] !== remoteValue[key]
      );

      return {
        success: true,
        mergedValue: merged,
        algorithm: 'UNION',
        confidence: conflictKeys.length === 0 ? 0.9 : 0.7,
        conflictsResolved: Object.keys(remoteValue).length,
        conflictsRemaining: 0,
        metadata: {
          warnings:
            conflictKeys.length > 0
              ? [
                  `Object merge overwrote ${conflictKeys.length} local properties with remote values`,
                ]
              : [],
        },
      };
    }

    // For other types, choose the non-null value
    const mergedValue = localValue || remoteValue;
    return {
      success: true,
      mergedValue,
      algorithm: 'UNION',
      confidence: 0.8,
      conflictsResolved: 1,
      conflictsRemaining: 0,
      metadata: { warnings: [] },
    };
  }

  /**
   * Intersection merge - keep only common elements
   */
  private mergeIntersection(
    localValue: unknown,
    remoteValue: unknown,
    options: MergeOptions
  ): MergeResult {
    console.log('Merging with intersection algorithm:', {
      hasLocalValue: localValue !== null && localValue !== undefined,
      hasRemoteValue: remoteValue !== null && remoteValue !== undefined,
      optionsProvided: Object.keys(options).length > 0,
    });
    if (Array.isArray(localValue) && Array.isArray(remoteValue)) {
      const common = localValue.filter(item => remoteValue.includes(item));
      const removedLocal = localValue.filter(
        item => !remoteValue.includes(item)
      );
      const removedRemote = remoteValue.filter(
        item => !localValue.includes(item)
      );

      return {
        success: true,
        mergedValue: common,
        algorithm: 'INTERSECTION',
        confidence: 0.7,
        conflictsResolved: removedLocal.length + removedRemote.length,
        conflictsRemaining: 0,
        metadata: {
          removedContent: [
            ...removedLocal.map(String),
            ...removedRemote.map(String),
          ],
          warnings:
            common.length === 0 ? ['Intersection resulted in empty array'] : [],
        },
      };
    }

    // For objects, keep only common properties with same values
    if (typeof localValue === 'object' && typeof remoteValue === 'object') {
      const common: Record<string, unknown> = {};
      for (const key in localValue) {
        if (key in remoteValue && localValue[key] === remoteValue[key]) {
          common[key] = localValue[key];
        }
      }

      return {
        success: true,
        mergedValue: common,
        algorithm: 'INTERSECTION',
        confidence: 0.6,
        conflictsResolved: 1,
        conflictsRemaining: 0,
        metadata: {
          warnings:
            Object.keys(common).length === 0
              ? ['Intersection resulted in empty object']
              : [],
        },
      };
    }

    // For other types, return null if different
    const success = localValue === remoteValue;
    return {
      success,
      mergedValue: success ? localValue : null,
      algorithm: 'INTERSECTION',
      confidence: success ? 1.0 : 0.3,
      conflictsResolved: success ? 0 : 1,
      conflictsRemaining: success ? 0 : 1,
      metadata: { warnings: success ? [] : ['No common value found'] },
    };
  }

  /**
   * Append merge - append remote content to local
   */
  private mergeAppend(
    localValue: unknown,
    remoteValue: unknown,
    options: MergeOptions
  ): MergeResult {
    if (typeof localValue === 'string' && typeof remoteValue === 'string') {
      const separator = options.preserveFormatting
        ? '\n\n--- Additional Content ---\n'
        : '\n';
      const merged = localValue + separator + remoteValue;

      return {
        success: true,
        mergedValue: merged,
        algorithm: 'APPEND',
        confidence: 0.8,
        conflictsResolved: 1,
        conflictsRemaining: 0,
        metadata: {
          preservedLocalSections: [localValue],
          preservedRemoteSections: [remoteValue],
          warnings: [],
        },
      };
    }

    if (Array.isArray(localValue) && Array.isArray(remoteValue)) {
      const merged = [...localValue, ...remoteValue];

      return {
        success: true,
        mergedValue: merged,
        algorithm: 'APPEND',
        confidence: 0.9,
        conflictsResolved: 1,
        conflictsRemaining: 0,
        metadata: {
          preservedLocalSections: localValue.map(String),
          preservedRemoteSections: remoteValue.map(String),
          warnings: [],
        },
      };
    }

    // For other types, fallback to timestamp priority
    return this.mergeTimestampPriority(localValue, remoteValue, options);
  }

  /**
   * Smart text merge with diff-based analysis
   */
  private mergeSmartText(
    localValue: string,
    remoteValue: string,
    options: MergeOptions
  ): MergeResult {
    const markers = options.conflictMarkers || this.DEFAULT_CONFLICT_MARKERS;

    // Split into paragraphs/sections for analysis
    const localSections = this.splitTextIntoSections(localValue);
    const remoteSections = this.splitTextIntoSections(remoteValue);

    const mergedSections: string[] = [];
    console.log('Smart text merge processing:', {
      localLength: localValue.length,
      remoteLength: remoteValue.length,
      markersProvided: !!options.conflictMarkers,
    });
    let conflictsResolved = 0;
    let conflictsRemaining = 0;

    // Find common sections and unique sections
    const commonSections = localSections.filter(local =>
      remoteSections.some(remote =>
        this.areSectionsEqual(local, remote, options)
      )
    );

    // Add unique local sections
    const uniqueLocal = localSections.filter(
      local =>
        !remoteSections.some(remote =>
          this.areSectionsEqual(local, remote, options)
        )
    );

    // Add unique remote sections
    const uniqueRemote = remoteSections.filter(
      remote =>
        !localSections.some(local =>
          this.areSectionsEqual(local, remote, options)
        )
    );

    // Build merged text
    mergedSections.push(...commonSections);

    if (uniqueLocal.length > 0) {
      mergedSections.push(...uniqueLocal);
      conflictsResolved += uniqueLocal.length;
    }

    if (uniqueRemote.length > 0) {
      if (options.preserveFormatting) {
        mergedSections.push('--- Remote Changes ---');
      }
      mergedSections.push(...uniqueRemote);
      conflictsResolved += uniqueRemote.length;
    }

    // Handle truly conflicting sections (similar but different)
    const conflictingSections = this.findConflictingSections(
      localSections,
      remoteSections,
      options
    );
    if (conflictingSections.length > 0) {
      conflictingSections.forEach(conflict => {
        const conflictMarker = `
${markers.localStart}
${conflict.local}
${markers.separator}
${conflict.remote}
${markers.end}
        `.trim();

        mergedSections.push(conflictMarker);
        conflictsRemaining++;
      });
    }

    const finalMerged = mergedSections.join('\n\n');
    const confidence = conflictsRemaining === 0 ? 0.85 : 0.6;

    return {
      success: true,
      mergedValue: finalMerged,
      algorithm: 'SMART_TEXT_MERGE',
      confidence,
      conflictsResolved,
      conflictsRemaining,
      metadata: {
        hasConflictMarkers: conflictsRemaining > 0,
        preservedLocalSections: uniqueLocal,
        preservedRemoteSections: uniqueRemote,
        warnings:
          conflictsRemaining > 0
            ? [`${conflictsRemaining} sections require manual resolution`]
            : [],
      },
    };
  }

  /**
   * Three-way merge (would need common ancestor for proper implementation)
   */
  private mergeThreeWay(
    localValue: unknown,
    remoteValue: unknown,
    options: MergeOptions
  ): MergeResult {
    // Simplified three-way merge without actual ancestor
    // In practice, this would need access to the common ancestor version

    if (typeof localValue === 'object' && typeof remoteValue === 'object') {
      const merged: Record<string, unknown> = {};
      const allKeys = new Set([
        ...Object.keys(localValue),
        ...Object.keys(remoteValue),
      ]);
      let conflictsResolved = 0;
      let conflictsRemaining = 0;

      for (const key of allKeys) {
        const localHas = key in localValue;
        const remoteHas = key in remoteValue;

        if (localHas && remoteHas) {
          if (localValue[key] === remoteValue[key]) {
            merged[key] = localValue[key]; // Same value
          } else {
            // Conflict - choose remote (or could mark for manual resolution)
            merged[key] = remoteValue[key];
            conflictsRemaining++;
          }
        } else if (localHas) {
          merged[key] = localValue[key]; // Only in local
          conflictsResolved++;
        } else {
          merged[key] = remoteValue[key]; // Only in remote
          conflictsResolved++;
        }
      }

      return {
        success: true,
        mergedValue: merged,
        algorithm: 'THREE_WAY_MERGE',
        confidence: conflictsRemaining === 0 ? 0.8 : 0.6,
        conflictsResolved,
        conflictsRemaining,
        metadata: { warnings: [] },
      };
    }

    // For non-objects, fallback to union merge
    return this.mergeUnion(localValue, remoteValue, options);
  }

  /**
   * Merge based on timestamp priority (needs timestamp context)
   */
  private mergeTimestampPriority(
    localValue: unknown,
    remoteValue: unknown,
    options: MergeOptions
  ): MergeResult {
    console.log('Merging with timestamp priority:', {
      hasLocalValue: localValue !== null && localValue !== undefined,
      hasRemoteValue: remoteValue !== null && remoteValue !== undefined,
      optionsProvided: Object.keys(options).length > 0,
    });
    // In a real implementation, this would need access to timestamps
    // For now, assume we want the "newer" value (simplified as remote)

    return {
      success: true,
      mergedValue: remoteValue, // Assuming remote is newer
      algorithm: 'TIMESTAMP_PRIORITY',
      confidence: 0.7,
      conflictsResolved: 1,
      conflictsRemaining: 0,
      metadata: {
        warnings: ['Used timestamp priority - assumed remote value is newer'],
      },
    };
  }

  /**
   * Merge based on length/completeness priority
   */
  private mergeLengthPriority(
    localValue: unknown,
    remoteValue: unknown,
    options: MergeOptions
  ): MergeResult {
    console.log('Merging with length priority:', {
      localLength: this.getValueLength(localValue),
      remoteLength: this.getValueLength(remoteValue),
      optionsProvided: Object.keys(options).length > 0,
    });
    const localLength = this.getValueLength(localValue);
    const remoteLength = this.getValueLength(remoteValue);

    const useLocal = localLength > remoteLength;
    const mergedValue = useLocal ? localValue : remoteValue;
    const reason = useLocal
      ? 'local value is more complete'
      : 'remote value is more complete';

    return {
      success: true,
      mergedValue,
      algorithm: 'LENGTH_PRIORITY',
      confidence: 0.75,
      conflictsResolved: 1,
      conflictsRemaining: 0,
      metadata: {
        warnings: [
          `Used length priority - ${reason} (${useLocal ? localLength : remoteLength} vs ${useLocal ? remoteLength : localLength} chars/items)`,
        ],
      },
    };
  }

  /**
   * Merge based on priority values
   */
  private mergePriorityBased(
    localValue: unknown,
    remoteValue: unknown,
    field: string,
    options: MergeOptions
  ): MergeResult {
    const priorityMap = options.customRules?.priorityValues;

    if (priorityMap) {
      const localPriority = priorityMap.get(String(localValue)) || 0;
      const remotePriority = priorityMap.get(String(remoteValue)) || 0;

      const useLocal = localPriority > remotePriority;
      const mergedValue = useLocal ? localValue : remoteValue;

      return {
        success: true,
        mergedValue,
        algorithm: 'PRIORITY_BASED',
        confidence: 0.8,
        conflictsResolved: 1,
        conflictsRemaining: 0,
        metadata: {
          warnings: [
            `Used priority-based resolution - ${useLocal ? 'local' : 'remote'} value has higher priority`,
          ],
        },
      };
    }

    // For numeric values without priority map, use higher value
    if (typeof localValue === 'number' && typeof remoteValue === 'number') {
      const useLocal = localValue > remoteValue;
      return {
        success: true,
        mergedValue: useLocal ? localValue : remoteValue,
        algorithm: 'PRIORITY_BASED',
        confidence: 0.7,
        conflictsResolved: 1,
        conflictsRemaining: 0,
        metadata: {
          warnings: [
            `Used numeric priority - chose higher value (${useLocal ? localValue : remoteValue})`,
          ],
        },
      };
    }

    // Fallback to timestamp priority
    return this.mergeTimestampPriority(localValue, remoteValue, options);
  }

  // Utility methods
  private areValuesEqual(
    value1: unknown,
    value2: unknown,
    options: MergeOptions
  ): boolean {
    if (value1 === value2) return true;

    if (typeof value1 === 'string' && typeof value2 === 'string') {
      let str1 = value1;
      let str2 = value2;

      if (!options.caseSensitive) {
        str1 = str1.toLowerCase();
        str2 = str2.toLowerCase();
      }

      if (options.ignoreWhitespace) {
        str1 = str1.replace(/\s+/g, ' ').trim();
        str2 = str2.replace(/\s+/g, ' ').trim();
      }

      return str1 === str2;
    }

    if (Array.isArray(value1) && Array.isArray(value2)) {
      return (
        value1.length === value2.length &&
        value1.every((item, index) => item === value2[index])
      );
    }

    return false;
  }

  private isNullOrEmpty(value: unknown): boolean {
    return (
      value === null ||
      value === undefined ||
      (typeof value === 'string' && value.trim() === '') ||
      (Array.isArray(value) && value.length === 0)
    );
  }

  private getValueType(value: unknown): string {
    if (Array.isArray(value)) return 'array';
    if (value === null) return 'null';
    return typeof value;
  }

  private getValueLength(value: unknown): number {
    if (typeof value === 'string') return value.length;
    if (Array.isArray(value)) return value.length;
    if (typeof value === 'object' && value !== null)
      return Object.keys(value).length;
    return String(value).length;
  }

  private splitTextIntoSections(text: string): string[] {
    return text
      .split(/\n\s*\n/)
      .map(section => section.trim())
      .filter(section => section.length > 0);
  }

  private areSectionsEqual(
    section1: string,
    section2: string,
    options: MergeOptions
  ): boolean {
    return this.areValuesEqual(section1, section2, options);
  }

  private findConflictingSections(
    localSections: string[],
    remoteSections: string[],
    options: MergeOptions
  ): Array<{ local: string; remote: string }> {
    const conflicts: Array<{ local: string; remote: string }> = [];

    // Simple implementation - find sections that are similar but not equal
    localSections.forEach(local => {
      remoteSections.forEach(remote => {
        if (!this.areSectionsEqual(local, remote, options)) {
          // Check if they're similar enough to be considered conflicting
          const similarity = this.calculateStringSimilarity(local, remote);
          if (similarity > 0.5 && similarity < 0.9) {
            conflicts.push({ local, remote });
          }
        }
      });
    });

    return conflicts;
  }

  private calculateStringSimilarity(str1: string, str2: string): number {
    // Simple similarity calculation - could use more sophisticated algorithms
    const longer = str1.length > str2.length ? str1 : str2;
    console.log('Calculating string similarity:', {
      str1Length: str1.length,
      str2Length: str2.length,
      longerLength: longer.length,
    });

    if (longer.length === 0) return 1.0;

    const editDistance = this.levenshteinDistance(str1, str2);
    return (longer.length - editDistance) / longer.length;
  }

  private levenshteinDistance(str1: string, str2: string): number {
    const matrix = [];

    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1, // substitution
            matrix[i][j - 1] + 1, // insertion
            matrix[i - 1][j] + 1 // deletion
          );
        }
      }
    }

    return matrix[str2.length][str1.length];
  }
}
