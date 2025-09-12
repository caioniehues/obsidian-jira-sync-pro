---
schema: 1
id: 4
title: "[P2.1] Implement Tasks Plugin Adapter"
status: pending
created: "2025-09-12T14:02:21.004Z"
updated: "2025-09-12T14:02:21.004Z"
tags:
  - phase2
  - adapter
  - high-priority
  - large
dependencies:
  - 1
  - 2
---
## Description
Complete the Tasks plugin adapter with full sync functionality, task creation/updates, and proper Jira-to-Tasks mapping

## Details
Technical Requirements:
- Replace skeleton implementation with actual Tasks plugin interaction logic
- Convert Jira tickets to Tasks plugin format with proper priority and status mapping
- Handle task creation, updates, and finding existing tasks with idempotent operations
- Implement proper priority and status mapping between Jira and Tasks formats
- Add Jira-specific metadata and tags for filtering and identification

Implementation Steps:
1. Implement `handleTicketSync` method with actual Tasks plugin calls
2. Create `convertToTaskFormat` method for Jira to Tasks conversion
3. Implement `findTaskByJiraKey` for existing task lookup
4. Add task creation and update methods
5. Implement priority and status mapping functions
6. Add proper error handling for each operation

Complete Core Implementation:
```typescript
async handleTicketSync(tickets: JiraTicket[]): Promise<void> {
  if (!this.tasksPlugin || this.state !== AdapterState.ACTIVE) {
    return;
  }
  
  for (const ticket of tickets) {
    try {
      // Convert Jira ticket to Tasks format
      const taskFormat = this.convertToTaskFormat(ticket);
      
      // Find existing task or create new
      const existingTask = await this.findTaskByJiraKey(ticket.key);
      
      if (existingTask) {
        // Update existing task
        await this.updateTask(existingTask, taskFormat);
      } else {
        // Create new task
        await this.createTask(taskFormat);
      }
    } catch (error) {
      console.error(`Failed to sync ticket ${ticket.key}:`, error);
    }
  }
}

private convertToTaskFormat(ticket: JiraTicket): TaskFormat {
  const priority = this.mapPriorityToEmoji(ticket.fields.priority);
  const status = this.mapStatusToTaskStatus(ticket.fields.status);
  
  return {
    description: `${priority} [${ticket.key}] ${ticket.fields.summary}`,
    status: status,
    dueDate: ticket.fields.duedate,
    tags: [`#jira/${ticket.key}`, `#project/${ticket.fields.project.key}`],
    metadata: {
      jiraKey: ticket.key,
      jiraUrl: `${this.plugin.settings.jiraUrl}/browse/${ticket.key}`,
      lastSync: new Date().toISOString()
    }
  };
}
```

Additional Required Methods:
```typescript
// Search tasks by Jira key metadata
private async findTaskByJiraKey(jiraKey: string): Promise<Task | null> {
  const allTasks = await this.tasksPlugin.getTasks();
  return allTasks.find(task => 
    task.metadata?.jiraKey === jiraKey ||
    task.description.includes(`[${jiraKey}]`)
  ) || null;
}

// Create new task in Tasks plugin
private async createTask(taskFormat: TaskFormat): Promise<void> {
  await this.tasksPlugin.createTask({
    description: taskFormat.description,
    status: taskFormat.status,
    dueDate: taskFormat.dueDate,
    tags: taskFormat.tags,
    metadata: taskFormat.metadata
  });
}

// Update existing task
private async updateTask(existingTask: Task, taskFormat: TaskFormat): Promise<void> {
  await this.tasksPlugin.updateTask(existingTask.id, {
    description: taskFormat.description,
    status: taskFormat.status,
    dueDate: taskFormat.dueDate,
    tags: [...new Set([...existingTask.tags, ...taskFormat.tags])], // Merge tags
    metadata: { ...existingTask.metadata, ...taskFormat.metadata }
  });
}

// Convert Jira priority to emoji
private mapPriorityToEmoji(priority: JiraPriority): string {
  const priorityMap = {
    'Highest': '🔥',
    'High': '⚡',
    'Medium': '📋',
    'Low': '⬇️',
    'Lowest': '❄️'
  };
  return priorityMap[priority?.name] || '📋';
}

// Convert Jira status to Tasks status
private mapStatusToTaskStatus(status: JiraStatus): TaskStatus {
  const statusMap = {
    'To Do': 'todo',
    'In Progress': 'doing',
    'Done': 'done',
    'Closed': 'done',
    'Cancelled': 'cancelled'
  };
  return statusMap[status.name] || 'todo';
}
```

Key Implementation Notes:
- Task descriptions include priority emoji, Jira key, and summary
- Tags provide filtering by Jira key and project
- Metadata includes Jira URL and last sync timestamp for tracking
- Existing task lookup uses both metadata and description parsing
- Tag merging preserves existing tags while adding Jira-specific ones
- Error handling isolates individual ticket failures
- Tasks plugin state checking prevents operations on inactive plugin

## Validation
Acceptance Criteria:
- [ ] Tasks are created from Jira tickets with proper formatting
- [ ] Existing tasks are updated without duplication
- [ ] Priority mapping works for all Jira priority levels
- [ ] Status mapping covers all common Jira statuses
- [ ] Tags include Jira key and project for filtering
- [ ] Metadata includes Jira URL and last sync timestamp
- [ ] Error handling prevents one ticket failure from stopping others
- [ ] Tests cover task creation, updates, and mapping functions
- [ ] Tests verify Tasks plugin API integration

Test Scenarios:
1. New Jira ticket - creates new task with correct format
2. Updated Jira ticket - updates existing task without creating duplicate
3. All priority levels - each maps to correct emoji
4. All status types - each maps to correct Tasks status
5. Task with existing tags - preserves existing while adding new
6. Plugin not available - gracefully handles missing plugin
7. Invalid ticket data - error handling isolates failure
8. Large number of tickets - processes all without UI blocking

Priority Mapping Tests:
- Highest → 🔥, High → ⚡, Medium → 📋, Low → ⬇️, Lowest → ❄️
- Missing/null priority → default 📋

Status Mapping Tests:
- "To Do" → todo, "In Progress" → doing, "Done"/"Closed" → done
- "Cancelled" → cancelled, unknown status → todo

Task Format Tests:
- Description: "{emoji} [JIRA-123] Task Summary"
- Tags: ["#jira/JIRA-123", "#project/PROJ"] 
- Metadata: {jiraKey, jiraUrl, lastSync}

Validation Steps:
1. Mock Tasks plugin API for isolated testing
2. Test task creation with various ticket formats
3. Test task update scenarios with existing tasks
4. Verify priority and status mapping functions
5. Test error handling with invalid data
6. Verify metadata and tag generation
7. Test plugin availability checking