# STM Task 14: Settings Interface Extension

## Task Definition
Extend JiraSyncProSettings interface with new PARA, time tracking, template, and custom field settings

## Size: Medium
## Priority: High
## Dependencies: None

## Implementation

```typescript
// Extended src/main.ts interface
interface JiraSyncProSettings {
  // Existing settings...
  jiraUrl: string;
  jiraUsername: string;
  jiraApiToken: string;
  
  // NEW: PARA Organization Settings
  usePARAStructure?: boolean;
  projectsFolder?: string;
  areasFolder?: string;
  resourcesFolder?: string;
  archivesFolder?: string;
  
  // NEW: Time Tracking Settings
  timeTrackingEnabled?: boolean;
  confirmBeforePush?: boolean;
  roundToMinutes?: number;
  
  // NEW: Template Settings
  useTemplates?: boolean;
  includeTimeLog?: boolean;
  
  // NEW: Custom Field Settings
  syncCustomFields?: boolean;
  customFieldMappings?: Record<string, string>;
}

const DEFAULT_SETTINGS: JiraSyncProSettings = {
  // ... existing defaults
  
  // NEW defaults
  usePARAStructure: false,
  projectsFolder: '01_Projects',
  areasFolder: '02_Areas', 
  resourcesFolder: '03_Resources',
  archivesFolder: '04_Archives',
  timeTrackingEnabled: true,
  confirmBeforePush: true,
  roundToMinutes: 5,
  useTemplates: true,
  includeTimeLog: true,
  syncCustomFields: false,
  customFieldMappings: {}
};
```

## Acceptance Criteria
- [x] Settings interface extended with all new features
- [x] Default values defined and appropriate
- [x] All new features have corresponding settings
- [x] Backwards compatible with existing settings

## Status: ✅ COMPLETED