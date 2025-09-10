/**
 * Test to reproduce the pagination truncation issue
 * This tests the scenario where maxResults=1 but total=100 should show truncated=true
 */

import { JQLQueryEngine } from './src/enhanced-sync/jql-query-engine';
import { JiraClient } from './src/jira-bases-adapter/jira-client';
import { JiraFactory } from './tests/factories/jira-factory';

// Create mock
const mockJiraClient = {
  searchIssues: jest.fn()
} as unknown as jest.Mocked<JiraClient>;

const engine = new JQLQueryEngine(mockJiraClient);

async function testTruncationIssue() {
  console.log('Testing truncation issue...');
  
  const jql = 'project = ONE';
  const largeResult = JiraFactory.createSearchResponse({
    issueCount: 1,
    total: 100
  });
  
  console.log('Mock response:', JSON.stringify(largeResult, null, 2));
  
  mockJiraClient.searchIssues.mockResolvedValue(largeResult);

  const result = await engine.executeQuery({
    jql,
    maxResults: 1,
    batchSize: 50
  });
  
  console.log('Result:', JSON.stringify({
    issuesLength: result.issues.length,
    total: result.total,
    truncated: result.truncated,
    nextPageToken: result.nextPageToken
  }, null, 2));
  
  console.log('Expected truncated: true, Actual truncated:', result.truncated);
  
  if (!result.truncated) {
    console.log('BUG CONFIRMED: Should be truncated=true but got false');
    console.log('Issues returned:', result.issues.length);
    console.log('Total available:', result.total);
    console.log('maxResults:', 1);
  }
}

testTruncationIssue().catch(console.error);