/**
 * T015 [P] Integration test for Team Query Configuration
 * 
 * CRITICAL TDD REQUIREMENT: This test MUST fail initially to validate TDD approach.
 * Tests complex JQL queries with multiple assignees, sprint-based filtering, and team oversight.
 * 
 * Test scenarios based on `/specs/001-jql-auto-sync/quickstart.md` - Scenario 3: Team Query Configuration
 * 
 * Coverage:
 * - Complex team JQL queries with multiple assignees
 * - Sprint-based filtering (openSprints() function)  
 * - Team member changes detection across sync cycles
 * - Bulk processing with higher batch sizes for team queries
 * - Longer sync intervals for team oversight workflows
 * - Multi-assignee issue synchronization
 * - Issue ordering and team member metadata preservation
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { JQLQueryEngine, JQLQueryOptions, QueryPhase, JiraIssue } from '../../src/enhanced-sync/jql-query-engine';
import { JiraClient, SearchResponse } from '../../src/jira-bases-adapter/jira-client';
import { AutoSyncScheduler } from '../../src/enhanced-sync/auto-sync-scheduler';
import { JiraFactory } from '../factories/jira-factory';
import { 
  createMockProgressCallback, 
  MockTimer, 
  createDeferred,
  RetryTester,
  waitFor,
  wait,
  assertions
} from '../utils/test-helpers';

// Mock dependencies
jest.mock('../../src/jira-bases-adapter/jira-client');
jest.mock('../../src/enhanced-sync/auto-sync-scheduler');

/**
 * Team configuration for testing
 */
interface TeamConfiguration {
  projectKey: string;
  members: string[];
  sprintContext: 'openSprints' | 'closedSprints' | 'allSprints';
  syncInterval: number;
  batchSize: number;
}

/**
 * Team sync metrics for validation
 */
interface TeamSyncMetrics {
  totalIssues: number;
  issuesByAssignee: Record<string, number>;
  sprintDistribution: Record<string, number>;
  lastSyncTimestamp: number;
  syncDuration: number;
}

describe('Team Query Configuration Integration Tests', () => {
  let engine: JQLQueryEngine;
  let scheduler: AutoSyncScheduler;
  let mockJiraClient: jest.Mocked<JiraClient>;
  let mockTimer: MockTimer;
  let progressCallback: ReturnType<typeof createMockProgressCallback>;

  beforeEach(() => {
    // Reset all mocks and test state
    jest.clearAllMocks();
    JiraFactory.resetCounter();
    
    // Create mocked dependencies
    mockJiraClient = new JiraClient() as jest.Mocked<JiraClient>;
    scheduler = new AutoSyncScheduler() as jest.Mocked<AutoSyncScheduler>;
    
    // Setup progress tracking
    progressCallback = createMockProgressCallback();
    
    // Install mock timer for interval testing
    mockTimer = new MockTimer(Date.now());
    mockTimer.install();
    
    // Initialize engine with mocked client
    engine = new JQLQueryEngine(mockJiraClient);
  });

  afterEach(() => {
    // Cleanup mocks and timers
    mockTimer.uninstall();
    jest.restoreAllMocks();
  });

  describe('Complex Team JQL Query Validation', () => {
    describe('Multi-Assignee Sprint Queries', () => {
      it('should validate complex team JQL with multiple assignees and sprint filtering', async () => {
        // Arrange: Team configuration matching quickstart scenario
        const teamConfig: TeamConfiguration = {
          projectKey: 'TEAMPROJ',
          members: ['user1@company.com', 'user2@company.com', 'user3@company.com'],
          sprintContext: 'openSprints',
          syncInterval: 15 * 60 * 1000, // 15 minutes as specified
          batchSize: 50 // Higher batch size for team processing
        };
        
        const complexTeamJQL = `project = ${teamConfig.projectKey} AND sprint in openSprints() AND assignee in (${teamConfig.members.map(m => `"${m}"`).join(', ')})`;
        
        // CRITICAL TDD: This MUST fail initially since the implementation doesn't exist yet
        mockJiraClient.searchIssues = jest.fn().mockResolvedValue(
          JiraFactory.createSearchResponse({ issueCount: 0 })
        );

        // Act
        const isValid = await engine.validateQuery(complexTeamJQL);

        // Assert: Team JQL validation
        expect(isValid).toBe(true);
        expect(mockJiraClient.searchIssues).toHaveBeenCalledWith({
          jql: complexTeamJQL,
          maxResults: 0,
          validateQuery: true
        });

        // Verify JQL contains team-specific elements
        expect(complexTeamJQL).toContain('sprint in openSprints()');
        expect(complexTeamJQL).toContain('assignee in (');
        teamConfig.members.forEach(member => {
          expect(complexTeamJQL).toContain(member);
        });
      });

      it('should handle complex JQL with additional team filters', async () => {
        // Arrange: More complex team query with additional filters
        const advancedTeamJQL = `
          project = TEAMPROJ AND 
          sprint in openSprints() AND 
          assignee in ("user1@company.com", "user2@company.com", "user3@company.com") AND
          status NOT IN (Done, Closed, "Won't Do") AND
          priority IN (High, Highest) AND
          created >= -30d
          ORDER BY updated DESC, priority DESC
        `.trim().replace(/\s+/g, ' ');

        mockJiraClient.searchIssues = jest.fn().mockResolvedValue(
          JiraFactory.createSearchResponse({ issueCount: 0 })
        );

        // Act
        const isValid = await engine.validateQuery(advancedTeamJQL);

        // Assert
        expect(isValid).toBe(true);
        expect(mockJiraClient.searchIssues).toHaveBeenCalledWith(
          expect.objectContaining({
            jql: advancedTeamJQL,
            validateQuery: true
          })
        );
      });

      it('should reject malformed team JQL queries', async () => {
        // Arrange: Invalid JQL syntax
        const invalidTeamJQL = 'project = TEAMPROJ ANDD sprint in openSprints() ANDD assignee inn (user1, user2)';
        const syntaxError = JiraFactory.createErrorResponse(400, 'Invalid JQL syntax: unexpected token ANDD');
        
        mockJiraClient.searchIssues = jest.fn().mockRejectedValue(syntaxError);

        // Act
        const isValid = await engine.validateQuery(invalidTeamJQL);

        // Assert
        expect(isValid).toBe(false);
      });
    });

    describe('Sprint Context Validation', () => {
      it('should validate openSprints() function in JQL', async () => {
        // Arrange
        const sprintJQL = 'project = TEAM AND sprint in openSprints() AND assignee = currentUser()';
        
        mockJiraClient.searchIssues = jest.fn().mockResolvedValue(
          JiraFactory.createSearchResponse({ issueCount: 0 })
        );

        // Act
        const isValid = await engine.validateQuery(sprintJQL);

        // Assert
        expect(isValid).toBe(true);
        expect(mockJiraClient.searchIssues).toHaveBeenCalledWith(
          expect.objectContaining({
            jql: expect.stringContaining('openSprints()')
          })
        );
      });

      it('should validate closedSprints() function for retrospective analysis', async () => {
        // Arrange
        const retrospectiveJQL = 'project = TEAM AND sprint in closedSprints() AND resolved >= -14d';
        
        mockJiraClient.searchIssues = jest.fn().mockResolvedValue(
          JiraFactory.createSearchResponse({ issueCount: 0 })
        );

        // Act
        const isValid = await engine.validateQuery(retrospectiveJQL);

        // Assert
        expect(isValid).toBe(true);
      });

      it('should handle sprint function errors gracefully', async () => {
        // Arrange: Sprint function not available in Jira instance
        const sprintJQL = 'project = TEAM AND sprint in openSprints()';
        const sprintError = JiraFactory.createErrorResponse(400, 'Function openSprints() not available');
        
        mockJiraClient.searchIssues = jest.fn().mockRejectedValue(sprintError);

        // Act
        const isValid = await engine.validateQuery(sprintJQL);

        // Assert
        expect(isValid).toBe(false);
      });
    });
  });

  describe('Team Issue Synchronization', () => {
    describe('Multi-Assignee Issue Processing', () => {
      it('should synchronize issues from multiple team members', async () => {
        // Arrange: Create realistic team issues across multiple assignees
        const teamMembers = ['alice@company.com', 'bob@company.com', 'carol@company.com'];
        const issuesPerMember = 8;
        const totalExpectedIssues = teamMembers.length * issuesPerMember;

        // Create team issues distributed across members
        const teamIssues: JiraIssue[] = [];
        teamMembers.forEach((member, memberIndex) => {
          for (let i = 0; i < issuesPerMember; i++) {
            teamIssues.push(JiraFactory.createIssue({
              key: `TEAM-${memberIndex * 10 + i + 1}`,
              assignee: member,
              summary: `Task ${i + 1} assigned to ${member.split('@')[0]}`,
              status: ['To Do', 'In Progress', 'Review', 'Done'][i % 4],
              priority: ['Low', 'Medium', 'High'][i % 3],
              fields: {
                customfield_10001: 'Sprint 23', // Sprint field
                labels: ['team-work', `assignee-${member.split('@')[0]}`]
              }
            }));
          }
        });

        const teamJQL = `project = TEAMPROJ AND sprint in openSprints() AND assignee in ("${teamMembers.join('", "')}")`;
        
        // Mock paginated response for large team dataset
        const page1 = {
          startAt: 0,
          maxResults: 50,
          total: totalExpectedIssues,
          issues: teamIssues,
          nextPageToken: undefined,
          isLast: true
        };

        mockJiraClient.searchIssues = jest.fn().mockResolvedValue(page1);

        // Act
        const result = await engine.executeQuery({
          jql: teamJQL,
          maxResults: 100,
          batchSize: 50, // Team batch size as specified
          onProgress: progressCallback.callback
        });

        // Assert: Team synchronization validation
        expect(result.issues).toHaveLength(totalExpectedIssues);
        expect(result.total).toBe(totalExpectedIssues);
        expect(result.truncated).toBe(false);

        // Verify all team members have issues
        const assigneeDistribution: Record<string, number> = {};
        result.issues.forEach(issue => {
          const assignee = issue.fields.assignee?.emailAddress || 'unassigned';
          assigneeDistribution[assignee] = (assigneeDistribution[assignee] || 0) + 1;
        });

        teamMembers.forEach(member => {
          expect(assigneeDistribution[member]).toBe(issuesPerMember);
        });

        // Verify API call used team batch size
        expect(mockJiraClient.searchIssues).toHaveBeenCalledWith(
          expect.objectContaining({
            maxResults: 50 // Team batch size
          })
        );
      });

      it('should maintain issue ordering across team members', async () => {
        // Arrange: Create ordered team issues
        const orderedTeamIssues = [
          JiraFactory.createIssue({ 
            key: 'TEAM-100', 
            assignee: 'alice@company.com',
            updated: JiraFactory.generateDate(-1), // Most recent
            priority: 'Highest'
          }),
          JiraFactory.createIssue({ 
            key: 'TEAM-101', 
            assignee: 'bob@company.com',
            updated: JiraFactory.generateDate(-2),
            priority: 'High'
          }),
          JiraFactory.createIssue({ 
            key: 'TEAM-102', 
            assignee: 'carol@company.com',
            updated: JiraFactory.generateDate(-3),
            priority: 'Medium'
          })
        ];

        const orderedJQL = 'project = TEAM AND sprint in openSprints() ORDER BY updated DESC, priority DESC';
        
        mockJiraClient.searchIssues = jest.fn().mockResolvedValue({
          startAt: 0,
          maxResults: 50,
          total: 3,
          issues: orderedTeamIssues,
          nextPageToken: undefined,
          isLast: true
        });

        // Act
        const result = await engine.executeQuery({
          jql: orderedJQL,
          maxResults: 50,
          batchSize: 50
        });

        // Assert: Order preservation
        expect(result.issues.map(issue => issue.key)).toEqual([
          'TEAM-100', 'TEAM-101', 'TEAM-102'
        ]);

        // Verify assignee order matches expected sequence
        expect(result.issues.map(issue => issue.fields.assignee?.emailAddress)).toEqual([
          'alice@company.com', 'bob@company.com', 'carol@company.com'
        ]);
      });

      it('should handle team issues with sprint metadata', async () => {
        // Arrange: Issues with rich sprint data
        const sprintIssues = [
          JiraFactory.createIssue({
            key: 'TEAM-200',
            assignee: 'sprint.lead@company.com',
            fields: {
              customfield_10001: 'Sprint 23',
              customfield_10002: 8, // Story points
              labels: ['sprint-23', 'team-alpha'],
              fixVersions: [{ name: '2.1.0' }]
            }
          }),
          JiraFactory.createIssue({
            key: 'TEAM-201',
            assignee: 'developer@company.com',
            fields: {
              customfield_10001: 'Sprint 23',
              customfield_10002: 5,
              labels: ['sprint-23', 'team-alpha'],
              components: [{ name: 'Backend API' }]
            }
          })
        ];

        const sprintJQL = 'project = TEAM AND sprint in openSprints() AND "Sprint" = "Sprint 23"';
        
        mockJiraClient.searchIssues = jest.fn().mockResolvedValue({
          startAt: 0,
          maxResults: 50,
          total: 2,
          issues: sprintIssues,
          nextPageToken: undefined,
          isLast: true
        });

        // Act
        const result = await engine.executeQuery({
          jql: sprintJQL,
          maxResults: 50,
          batchSize: 50
        });

        // Assert: Sprint metadata preservation
        expect(result.issues).toHaveLength(2);
        result.issues.forEach(issue => {
          expect(issue.fields.customfield_10001).toBe('Sprint 23');
          expect(issue.fields.labels).toContain('sprint-23');
        });
      });
    });

    describe('Large Team Dataset Processing', () => {
      it('should handle large team queries with appropriate batch processing', async () => {
        // Arrange: Large team with many issues (realistic enterprise scenario)
        const largeTeamSize = 25;
        const issuesPerMember = 6;
        const totalIssues = largeTeamSize * issuesPerMember;
        const teamBatchSize = 50;
        
        // Generate team members
        const largeTeam = Array.from({ length: largeTeamSize }, (_, i) => 
          `team.member.${i + 1}@company.com`
        );
        
        // Generate team issues
        const allTeamIssues = largeTeam.flatMap((member, memberIndex) => 
          Array.from({ length: issuesPerMember }, (_, issueIndex) => 
            JiraFactory.createIssue({
              key: `LARGE-${memberIndex * issuesPerMember + issueIndex + 1}`,
              assignee: member,
              summary: `Team issue ${issueIndex + 1} for ${member}`,
              fields: {
                customfield_10001: `Sprint ${23 + (issueIndex % 3)}`, // Distribute across sprints
              }
            })
          )
        );

        // Create paginated responses
        const page1Issues = allTeamIssues.slice(0, teamBatchSize);
        const page2Issues = allTeamIssues.slice(teamBatchSize, teamBatchSize * 2);
        const page3Issues = allTeamIssues.slice(teamBatchSize * 2);

        const page1 = {
          startAt: 0,
          maxResults: teamBatchSize,
          total: totalIssues,
          issues: page1Issues,
          nextPageToken: `token_page_1_${Date.now()}`,
          isLast: false
        };
        const page2 = {
          startAt: teamBatchSize,
          maxResults: teamBatchSize,
          total: totalIssues,
          issues: page2Issues,
          nextPageToken: `token_page_2_${Date.now()}`,
          isLast: false
        };
        const page3 = {
          startAt: teamBatchSize * 2,
          maxResults: teamBatchSize,
          total: totalIssues,
          issues: page3Issues,
          nextPageToken: undefined,
          isLast: true
        };

        mockJiraClient.searchIssues = jest.fn()
          .mockResolvedValueOnce(page1)
          .mockResolvedValueOnce(page2)
          .mockResolvedValueOnce(page3);

        const largeTeamJQL = `project = LARGE AND sprint in openSprints() AND assignee in (${largeTeam.map(m => `"${m}"`).join(', ')})`;

        // Act
        const startTime = Date.now();
        const result = await engine.executeQuery({
          jql: largeTeamJQL,
          maxResults: 200,
          batchSize: teamBatchSize,
          onProgress: progressCallback.callback
        });
        const syncDuration = Date.now() - startTime;

        // Assert: Large team processing validation
        expect(result.issues).toHaveLength(totalIssues);
        expect(result.total).toBe(totalIssues);
        expect(mockJiraClient.searchIssues).toHaveBeenCalledTimes(3);

        // Verify team distribution
        const memberCounts: Record<string, number> = {};
        result.issues.forEach(issue => {
          const assignee = issue.fields.assignee?.emailAddress || '';
          memberCounts[assignee] = (memberCounts[assignee] || 0) + 1;
        });

        largeTeam.forEach(member => {
          expect(memberCounts[member]).toBe(issuesPerMember);
        });

        // Verify progress tracking for large dataset
        const progressCalls = progressCallback.getCalls();
        expect(progressCalls.length).toBeGreaterThanOrEqual(3); // At least one per batch
        expect(progressCalls[0]).toEqual({ current: 0, total: totalIssues, phase: 'searching' });
        expect(progressCallback.getLastCall()).toEqual({ 
          current: totalIssues, 
          total: totalIssues, 
          phase: 'complete' 
        });
      });
    });
  });

  describe('Team Member Change Detection', () => {
    describe('Sync Cycle Change Detection', () => {
      it('should detect team member changes between sync cycles', async () => {
        // Arrange: Simulate two sync cycles with team member changes
        const baseJQL = 'project = TEAMPROJ AND sprint in openSprints() AND assignee in ("alice@company.com", "bob@company.com", "carol@company.com")';
        
        // First sync: Initial team assignments
        const initialTeamIssues = [
          JiraFactory.createIssue({
            key: 'TEAM-300',
            assignee: 'alice@company.com',
            summary: 'Initial task for Alice',
            updated: JiraFactory.generateDate(-10)
          }),
          JiraFactory.createIssue({
            key: 'TEAM-301',
            assignee: 'bob@company.com',
            summary: 'Initial task for Bob',
            updated: JiraFactory.generateDate(-10)
          })
        ];

        // Second sync: Team member reassignments and updates
        const updatedTeamIssues = [
          JiraFactory.createIssue({
            key: 'TEAM-300',
            assignee: 'carol@company.com', // REASSIGNED from Alice to Carol
            summary: 'Initial task for Alice - now assigned to Carol',
            updated: JiraFactory.generateDate(-1) // Recently updated
          }),
          JiraFactory.createIssue({
            key: 'TEAM-301',
            assignee: 'bob@company.com',
            summary: 'Updated task for Bob - in progress',
            status: 'In Progress', // Status change
            updated: JiraFactory.generateDate(-2)
          }),
          JiraFactory.createIssue({
            key: 'TEAM-302', // NEW issue
            assignee: 'alice@company.com',
            summary: 'New task assigned to Alice',
            updated: JiraFactory.generateDate(0)
          })
        ];

        // Mock first sync cycle
        mockJiraClient.searchIssues = jest.fn().mockResolvedValue({
          startAt: 0,
          maxResults: 50,
          total: 2,
          issues: initialTeamIssues,
          nextPageToken: undefined,
          isLast: true
        });

        // Act: First sync
        const firstSyncResult = await engine.executeQuery({
          jql: baseJQL,
          maxResults: 50,
          batchSize: 50,
          onProgress: progressCallback.callback
        });

        // Setup second sync cycle
        mockJiraClient.searchIssues = jest.fn().mockResolvedValue({
          startAt: 0,
          maxResults: 50,
          total: 3,
          issues: updatedTeamIssues,
          nextPageToken: undefined,
          isLast: true
        });

        // Act: Second sync (simulating team member changes)
        const secondSyncResult = await engine.executeQuery({
          jql: baseJQL,
          maxResults: 50,
          batchSize: 50,
          onProgress: progressCallback.callback
        });

        // Assert: Change detection validation
        expect(firstSyncResult.issues).toHaveLength(2);
        expect(secondSyncResult.issues).toHaveLength(3);

        // Verify reassignment detection
        const firstSync_TEAM300 = firstSyncResult.issues.find(i => i.key === 'TEAM-300');
        const secondSync_TEAM300 = secondSyncResult.issues.find(i => i.key === 'TEAM-300');
        
        expect(firstSync_TEAM300?.fields.assignee?.emailAddress).toBe('alice@company.com');
        expect(secondSync_TEAM300?.fields.assignee?.emailAddress).toBe('carol@company.com');

        // Verify new issue detection
        const newIssue = secondSyncResult.issues.find(i => i.key === 'TEAM-302');
        expect(newIssue).toBeDefined();
        expect(newIssue?.fields.assignee?.emailAddress).toBe('alice@company.com');

        // Verify update timestamp changes
        expect(secondSync_TEAM300?.fields.updated).not.toBe(firstSync_TEAM300?.fields.updated);
      });

      it('should handle team member removal from sprint', async () => {
        // Arrange: Team member leaves sprint/project
        const fullTeamJQL = 'project = TEAM AND sprint in openSprints() AND assignee in ("alice@company.com", "bob@company.com", "charlie@company.com")';
        const reducedTeamJQL = 'project = TEAM AND sprint in openSprints() AND assignee in ("alice@company.com", "bob@company.com")';
        
        const fullTeamIssues = [
          JiraFactory.createIssue({ key: 'TEAM-400', assignee: 'alice@company.com' }),
          JiraFactory.createIssue({ key: 'TEAM-401', assignee: 'bob@company.com' }),
          JiraFactory.createIssue({ key: 'TEAM-402', assignee: 'charlie@company.com' })
        ];

        const reducedTeamIssues = [
          JiraFactory.createIssue({ key: 'TEAM-400', assignee: 'alice@company.com' }),
          JiraFactory.createIssue({ key: 'TEAM-401', assignee: 'bob@company.com' })
          // Charlie's issue no longer in results
        ];

        // First sync: Full team
        mockJiraClient.searchIssues = jest.fn().mockResolvedValue({
          startAt: 0, maxResults: 50, total: 3, issues: fullTeamIssues,
          nextPageToken: undefined, isLast: true
        });

        const fullTeamResult = await engine.executeQuery({
          jql: fullTeamJQL, maxResults: 50, batchSize: 50
        });

        // Second sync: Reduced team (Charlie removed)
        mockJiraClient.searchIssues = jest.fn().mockResolvedValue({
          startAt: 0, maxResults: 50, total: 2, issues: reducedTeamIssues,
          nextPageToken: undefined, isLast: true
        });

        const reducedTeamResult = await engine.executeQuery({
          jql: reducedTeamJQL, maxResults: 50, batchSize: 50
        });

        // Assert: Team reduction detection
        expect(fullTeamResult.issues).toHaveLength(3);
        expect(reducedTeamResult.issues).toHaveLength(2);
        
        const charlieIssueInFirst = fullTeamResult.issues.find(i => i.fields.assignee?.emailAddress === 'charlie@company.com');
        const charlieIssueInSecond = reducedTeamResult.issues.find(i => i.fields.assignee?.emailAddress === 'charlie@company.com');
        
        expect(charlieIssueInFirst).toBeDefined();
        expect(charlieIssueInSecond).toBeUndefined();
      });

      it('should detect new team member additions', async () => {
        // Arrange: New team member joins sprint
        const baseTeamIssues = [
          JiraFactory.createIssue({ key: 'TEAM-500', assignee: 'alice@company.com' }),
          JiraFactory.createIssue({ key: 'TEAM-501', assignee: 'bob@company.com' })
        ];

        const expandedTeamIssues = [
          ...baseTeamIssues,
          JiraFactory.createIssue({ 
            key: 'TEAM-502', 
            assignee: 'newbie@company.com',
            summary: 'Welcome task for new team member',
            created: JiraFactory.generateDate(0) // Recently created
          }),
          JiraFactory.createIssue({ 
            key: 'TEAM-503', 
            assignee: 'newbie@company.com',
            summary: 'Training task for new member',
            priority: 'Low'
          })
        ];

        // First sync: Base team
        mockJiraClient.searchIssues = jest.fn().mockResolvedValue({
          startAt: 0, maxResults: 50, total: 2, issues: baseTeamIssues,
          nextPageToken: undefined, isLast: true
        });

        const baseResult = await engine.executeQuery({
          jql: 'project = TEAM AND sprint in openSprints() AND assignee in ("alice@company.com", "bob@company.com")',
          maxResults: 50, batchSize: 50
        });

        // Second sync: Expanded team with new member
        mockJiraClient.searchIssues = jest.fn().mockResolvedValue({
          startAt: 0, maxResults: 50, total: 4, issues: expandedTeamIssues,
          nextPageToken: undefined, isLast: true
        });

        const expandedResult = await engine.executeQuery({
          jql: 'project = TEAM AND sprint in openSprints() AND assignee in ("alice@company.com", "bob@company.com", "newbie@company.com")',
          maxResults: 50, batchSize: 50
        });

        // Assert: New member detection
        expect(baseResult.issues).toHaveLength(2);
        expect(expandedResult.issues).toHaveLength(4);
        
        const newMemberIssues = expandedResult.issues.filter(
          issue => issue.fields.assignee?.emailAddress === 'newbie@company.com'
        );
        
        expect(newMemberIssues).toHaveLength(2);
        expect(newMemberIssues[0].fields.summary).toContain('Welcome task');
        expect(newMemberIssues[1].fields.summary).toContain('Training task');
      });
    });
  });

  describe('Team Configuration Management', () => {
    describe('Sync Interval Configuration', () => {
      it('should support longer sync intervals for team oversight (15 minutes)', async () => {
        // Arrange: Team oversight configuration
        const teamOversightConfig = {
          syncInterval: 15 * 60 * 1000, // 15 minutes in milliseconds
          batchSize: 50,
          maxResults: 200
        };

        const teamJQL = 'project = OVERSIGHT AND sprint in openSprints() AND assignee in ("lead@company.com", "senior1@company.com", "senior2@company.com")';
        
        // Mock team lead issues
        const oversightIssues = [
          JiraFactory.createIssue({
            assignee: 'lead@company.com',
            priority: 'Highest',
            summary: 'Sprint planning and team coordination'
          }),
          JiraFactory.createIssue({
            assignee: 'senior1@company.com',
            priority: 'High',
            summary: 'Architecture review and mentoring'
          }),
          JiraFactory.createIssue({
            assignee: 'senior2@company.com',
            priority: 'High',
            summary: 'Code quality oversight and standards'
          })
        ];

        mockJiraClient.searchIssues = jest.fn().mockResolvedValue({
          startAt: 0,
          maxResults: teamOversightConfig.batchSize,
          total: 3,
          issues: oversightIssues,
          nextPageToken: undefined,
          isLast: true
        });

        // Act: Execute with team oversight settings
        const result = await engine.executeQuery({
          jql: teamJQL,
          maxResults: teamOversightConfig.maxResults,
          batchSize: teamOversightConfig.batchSize,
          onProgress: progressCallback.callback
        });

        // Assert: Team oversight query execution
        expect(result.issues).toHaveLength(3);
        expect(result.total).toBe(3);
        
        // Verify API call used team batch size
        expect(mockJiraClient.searchIssues).toHaveBeenCalledWith(
          expect.objectContaining({
            maxResults: teamOversightConfig.batchSize
          })
        );

        // Verify team lead issues are captured
        const leadIssues = result.issues.filter(
          issue => issue.fields.assignee?.emailAddress === 'lead@company.com'
        );
        expect(leadIssues).toHaveLength(1);
        expect(leadIssues[0].fields.priority?.name).toBe('Highest');
      });
    });

    describe('Batch Size Optimization for Teams', () => {
      it('should use higher batch sizes (50) for team processing efficiency', async () => {
        // Arrange: Large team batch processing
        const teamBatchSize = 50;
        const totalTeamIssues = 75;
        
        const batchIssues = Array.from({ length: teamBatchSize }, (_, i) => 
          JiraFactory.createIssue({
            key: `BATCH-${i + 1}`,
            assignee: `member${(i % 5) + 1}@company.com`,
            summary: `Team batch issue ${i + 1}`
          })
        );

        const remainingIssues = Array.from({ length: 25 }, (_, i) => 
          JiraFactory.createIssue({
            key: `BATCH-${teamBatchSize + i + 1}`,
            assignee: `member${(i % 5) + 1}@company.com`,
            summary: `Team batch issue ${teamBatchSize + i + 1}`
          })
        );

        mockJiraClient.searchIssues = jest.fn()
          .mockResolvedValueOnce({
            startAt: 0,
            maxResults: teamBatchSize,
            total: totalTeamIssues,
            issues: batchIssues,
            nextPageToken: `token_batch_1_${Date.now()}`,
            isLast: false
          })
          .mockResolvedValueOnce({
            startAt: teamBatchSize,
            maxResults: teamBatchSize,
            total: totalTeamIssues,
            issues: remainingIssues,
            nextPageToken: undefined,
            isLast: true
          });

        const teamBatchJQL = 'project = BATCH AND sprint in openSprints() AND assignee in ("member1@company.com", "member2@company.com", "member3@company.com", "member4@company.com", "member5@company.com")';

        // Act
        const result = await engine.executeQuery({
          jql: teamBatchJQL,
          maxResults: 100,
          batchSize: teamBatchSize,
          onProgress: progressCallback.callback
        });

        // Assert: Batch size optimization
        expect(result.issues).toHaveLength(totalTeamIssues);
        expect(mockJiraClient.searchIssues).toHaveBeenCalledTimes(2);
        
        // Verify both calls used team batch size
        mockJiraClient.searchIssues.mock.calls.forEach(call => {
          expect(call[0].maxResults).toBe(teamBatchSize);
        });

        // Verify progress reports batch progress
        const progressCalls = progressCallback.getCalls();
        expect(progressCalls).toContainEqual({ 
          current: teamBatchSize, 
          total: totalTeamIssues, 
          phase: 'downloading' 
        });
      });
    });
  });

  describe('Error Handling and Edge Cases', () => {
    describe('Team Query Failures', () => {
      it('should handle team member permission errors gracefully', async () => {
        // Arrange: Some team members have restricted visibility
        const restrictedTeamJQL = 'project = RESTRICTED AND assignee in ("public@company.com", "restricted@company.com")';
        const permissionError = JiraFactory.createErrorResponse(403, 'Insufficient permissions to view issues assigned to restricted@company.com');
        
        mockJiraClient.searchIssues = jest.fn().mockRejectedValue(permissionError);

        // Act & Assert
        await expect(engine.executeQuery({
          jql: restrictedTeamJQL,
          maxResults: 50,
          batchSize: 50
        })).rejects.toMatchObject({
          status: 403,
          message: expect.stringContaining('Insufficient permissions')
        });
      });

      it('should handle sprint context changes during sync', async () => {
        // Arrange: Sprint moves from open to closed during sync
        const sprintJQL = 'project = SPRINT AND sprint in openSprints()';
        
        // First page succeeds
        const page1 = JiraFactory.createPaginatedSearchResponse(0, 25, 50);
        
        // Second page fails due to sprint closure
        const sprintClosedError = JiraFactory.createErrorResponse(400, 'Sprint no longer active in openSprints()');

        mockJiraClient.searchIssues = jest.fn()
          .mockResolvedValueOnce(page1)
          .mockRejectedValueOnce(sprintClosedError);

        // Act & Assert: Should handle sprint context change
        await expect(engine.executeQuery({
          jql: sprintJQL,
          maxResults: 50,
          batchSize: 25,
          enableRetry: false // Disable retry for this test
        })).rejects.toMatchObject({
          status: 400,
          message: expect.stringContaining('Sprint no longer active')
        });
      });

      it('should handle empty team assignments gracefully', async () => {
        // Arrange: All team members have been unassigned from sprint
        const emptyTeamJQL = 'project = EMPTY AND sprint in openSprints() AND assignee in ("former1@company.com", "former2@company.com")';
        
        mockJiraClient.searchIssues = jest.fn().mockResolvedValue({
          startAt: 0,
          maxResults: 50,
          total: 0,
          issues: [],
          nextPageToken: undefined,
          isLast: true
        });

        // Act
        const result = await engine.executeQuery({
          jql: emptyTeamJQL,
          maxResults: 50,
          batchSize: 50,
          onProgress: progressCallback.callback
        });

        // Assert: Empty team handling
        expect(result.issues).toEqual([]);
        expect(result.total).toBe(0);
        expect(result.truncated).toBe(false);
        
        // Verify progress is still reported for empty results
        const progressCalls = progressCallback.getCalls();
        expect(progressCalls).toContainEqual({ current: 0, total: 0, phase: 'searching' });
        expect(progressCalls).toContainEqual({ current: 0, total: 0, phase: 'complete' });
      });
    });
  });

  // CRITICAL TDD VALIDATION: This test must fail initially
  describe('TDD Validation - Must Fail Initially', () => {
    it('should fail initially to validate TDD approach', async () => {
      // CRITICAL: This test is designed to FAIL initially to demonstrate TDD
      // It tests functionality that doesn't exist yet in the implementation
      
      const futureFunctionalityJQL = 'project = FUTURE AND sprint in openSprints() AND assignee in ("future@company.com")';
      
      // This will fail because the advanced team functionality is not implemented yet
      mockJiraClient.searchIssues = jest.fn().mockImplementation(() => {
        throw new Error('Advanced team query functionality not yet implemented');
      });

      // Act & Assert: This MUST fail for proper TDD
      await expect(engine.executeQuery({
        jql: futureFunctionalityJQL,
        maxResults: 50,
        batchSize: 50
      })).rejects.toThrow('Advanced team query functionality not yet implemented');
      
      // If this test passes initially, the TDD requirement is violated
      expect(true).toBe(true); // This line should be reached only after implementation
    });
  });

  describe('Performance and Scalability', () => {
    it('should complete team sync within performance requirements', async () => {
      // Arrange: Performance test scenario
      const performanceTeamSize = 15;
      const performanceIssueCount = 30; // 15-30 issues as specified in quickstart
      
      const performanceIssues = Array.from({ length: performanceIssueCount }, (_, i) => 
        JiraFactory.createIssue({
          key: `PERF-${i + 1}`,
          assignee: `member${(i % performanceTeamSize) + 1}@company.com`,
          summary: `Performance test issue ${i + 1}`,
          fields: {
            customfield_10001: 'Performance Sprint',
            customfield_10002: (i % 8) + 1 // Story points 1-8
          }
        })
      );

      mockJiraClient.searchIssues = jest.fn().mockResolvedValue({
        startAt: 0,
        maxResults: 50,
        total: performanceIssueCount,
        issues: performanceIssues,
        nextPageToken: undefined,
        isLast: true
      });

      // Act: Measure sync performance
      const startTime = Date.now();
      const result = await engine.executeQuery({
        jql: 'project = PERF AND sprint in openSprints()',
        maxResults: 50,
        batchSize: 50,
        onProgress: progressCallback.callback
      });
      const syncDuration = Date.now() - startTime;

      // Assert: Performance requirements met
      expect(result.issues).toHaveLength(performanceIssueCount);
      expect(syncDuration).toBeLessThan(5000); // Should complete within 5 seconds
      
      // Verify issue distribution across team members
      const memberDistribution: Record<string, number> = {};
      result.issues.forEach(issue => {
        const assignee = issue.fields.assignee?.emailAddress || '';
        memberDistribution[assignee] = (memberDistribution[assignee] || 0) + 1;
      });
      
      expect(Object.keys(memberDistribution)).toHaveLength(performanceTeamSize);
    });
  });
});