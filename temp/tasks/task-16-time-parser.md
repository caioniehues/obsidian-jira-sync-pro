# STM Task 16: Time String Parser

## Task Definition
Parse time strings like "2h30m", "90m", "1.5h" into seconds and format back to readable strings

## Size: Small
## Priority: High
## Dependencies: None (can run parallel with Task 15)

## Implementation

```typescript
// src/time/time-parser.ts
export function parseTimeString(input: string): number {
  if (!input || typeof input !== 'string') return 0;
  
  const cleaned = input.trim().toLowerCase();
  if (!cleaned) return 0;
  
  // Handle pure numbers as minutes
  if (/^\d+(\.\d+)?$/.test(cleaned)) {
    const minutes = parseFloat(cleaned);
    return Math.round(minutes * 60);
  }
  
  let totalSeconds = 0;
  
  // Match hours (handles decimal hours like 1.5h)
  const hoursMatch = cleaned.match(/(\d+(?:\.\d+)?)\s*h(?:ours?)?/i);
  if (hoursMatch) {
    const hours = parseFloat(hoursMatch[1]);
    totalSeconds += hours * 3600;
  }
  
  // Match minutes
  const minutesMatch = cleaned.match(/(\d+(?:\.\d+)?)\s*m(?:in(?:utes?)?)?/i);
  if (minutesMatch) {
    const minutes = parseFloat(minutesMatch[1]);
    totalSeconds += minutes * 60;
  }
  
  return Math.round(totalSeconds);
}

export function formatTime(seconds: number): string {
  if (!seconds || seconds <= 0) return '0m';
  
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  
  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  
  return parts.length > 0 ? parts.join(' ') : '< 1m';
}

export function parseTimeEntries(text: string): Array<{
  time: string;
  seconds: number;
  description: string;
  line: number;
}> {
  const entries = [];
  const lines = text.split('\n');
  
  lines.forEach((line, index) => {
    const match = line.match(/^[\s\-\*]*\s*([0-9]+(?:\.[0-9]+)?[hms\s]*[0-9]*[hms]*)\s*:\s*(.+?)(?:\[.*\])?$/i);
    
    if (match) {
      const timeString = match[1].trim();
      const description = match[2].trim();
      const seconds = parseTimeString(timeString);
      
      if (seconds > 0) {
        entries.push({ time: timeString, seconds, description, line: index });
      }
    }
  });
  
  return entries;
}
```

## Test Coverage
- Parses "2h", "30m", "2h30m", "1.5h", "90" (minutes)
- Handles decimal hours and spaces
- Returns 0 for invalid input
- Extracts multiple time entries from markdown

## Acceptance Criteria
- [x] Parses all supported time formats correctly
- [x] Handles edge cases (decimals, spaces, invalid input)
- [x] Plain numbers treated as minutes
- [x] Bidirectional conversion (parse → format → parse)
- [x] Extracts time entries from markdown text

## Status: ✅ COMPLETED