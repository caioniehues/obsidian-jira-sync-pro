/**
 * Time String Parser for Jira Time Tracking
 * 
 * Handles parsing time strings like "2h30m", "90m", "1.5h" into seconds
 * and formatting time back to readable strings. Supports flexible input formats.
 */

/**
 * Parse time string into seconds
 * 
 * Supported formats:
 * - "2h" -> 7200 seconds (2 hours)
 * - "30m" -> 1800 seconds (30 minutes)  
 * - "2h30m" -> 9000 seconds (2 hours 30 minutes)
 * - "1.5h" -> 5400 seconds (1.5 hours)
 * - "90" -> 5400 seconds (90 minutes, plain number)
 * - "2h 30m" -> 9000 seconds (with spaces)
 * 
 * @param input - Time string to parse
 * @returns Time in seconds, or 0 if invalid
 */
export function parseTimeString(input: string): number {
  if (!input || typeof input !== 'string') return 0;
  
  // Clean input - remove extra whitespace and normalize
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
  
  // Match minutes (handles decimal minutes like 30.5m)
  const minutesMatch = cleaned.match(/(\d+(?:\.\d+)?)\s*m(?:in(?:utes?)?)?/i);
  if (minutesMatch) {
    const minutes = parseFloat(minutesMatch[1]);
    totalSeconds += minutes * 60;
  }
  
  // Match seconds (less common, but supported)
  const secondsMatch = cleaned.match(/(\d+(?:\.\d+)?)\s*s(?:ec(?:onds?)?)?/i);
  if (secondsMatch) {
    const seconds = parseFloat(secondsMatch[1]);
    totalSeconds += seconds;
  }
  
  return Math.round(totalSeconds);
}

/**
 * Format seconds into readable time string
 * 
 * Examples:
 * - 3600 seconds -> "1h"
 * - 1800 seconds -> "30m"  
 * - 5400 seconds -> "1h 30m"
 * - 7200 seconds -> "2h"
 * - 60 seconds -> "1m"
 * - 0 seconds -> "0m"
 * 
 * @param seconds - Time in seconds
 * @returns Formatted time string
 */
export function formatTime(seconds: number): string {
  if (!seconds || seconds <= 0) return '0m';
  
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;
  
  const parts: string[] = [];
  
  if (hours > 0) {
    parts.push(`${hours}h`);
  }
  
  if (minutes > 0) {
    parts.push(`${minutes}m`);
  }
  
  // Only show seconds if no hours/minutes, or if there are remaining seconds
  if (parts.length === 0 || (remainingSeconds > 0 && parts.length === 0)) {
    if (remainingSeconds > 0) {
      parts.push(`${remainingSeconds}s`);
    } else if (parts.length === 0) {
      parts.push('< 1m');
    }
  }
  
  return parts.join(' ');
}

/**
 * Format time for Jira worklog (always in minutes, rounded)
 * 
 * Jira expects time in minutes, so we convert seconds to minutes
 * and round to the nearest minute (or as configured).
 * 
 * @param seconds - Time in seconds
 * @param roundToMinutes - Round to nearest X minutes (default: 1)
 * @returns Time in minutes, rounded
 */
export function formatTimeForJira(seconds: number, roundToMinutes: number = 1): number {
  if (!seconds || seconds <= 0) return 0;
  
  const minutes = seconds / 60;
  
  if (roundToMinutes <= 1) {
    return Math.round(minutes);
  }
  
  // Round to nearest X minutes
  return Math.round(minutes / roundToMinutes) * roundToMinutes;
}

/**
 * Parse multiple time entries from text
 * 
 * Finds time entries in format "- 2h30m: description" or "- 1.5h: work done"
 * 
 * @param text - Text to search for time entries
 * @returns Array of time entries with parsed seconds
 */
export function parseTimeEntries(text: string): Array<{
  time: string;
  seconds: number;
  description: string;
  line: number;
}> {
  if (!text) return [];
  
  const entries: Array<{
    time: string;
    seconds: number;
    description: string;
    line: number;
  }> = [];
  
  const lines = text.split('\n');
  
  lines.forEach((line, index) => {
    // Match pattern: "- 2h30m: Description" or "- 1.5h: work done"
    const match = line.match(/^[\s\-\*]*\s*([0-9]+(?:\.[0-9]+)?[hms\s]*[0-9]*[hms]*)\s*:\s*(.+?)(?:\[.*\])?$/i);
    
    if (match) {
      const timeString = match[1].trim();
      const description = match[2].trim();
      const seconds = parseTimeString(timeString);
      
      if (seconds > 0) {
        entries.push({
          time: timeString,
          seconds,
          description,
          line: index
        });
      }
    }
  });
  
  return entries;
}

/**
 * Validate time string format
 * 
 * @param input - Time string to validate
 * @returns Object with validation result and parsed value
 */
export function validateTimeString(input: string): {
  valid: boolean;
  seconds: number;
  formatted: string;
  errors: string[];
} {
  const errors: string[] = [];
  
  if (!input || typeof input !== 'string') {
    errors.push('Time string is required');
    return {
      valid: false,
      seconds: 0,
      formatted: '0m',
      errors
    };
  }
  
  const trimmed = input.trim();
  if (!trimmed) {
    errors.push('Time string cannot be empty');
    return {
      valid: false,
      seconds: 0,
      formatted: '0m',
      errors
    };
  }
  
  const seconds = parseTimeString(trimmed);
  if (seconds <= 0) {
    errors.push('Invalid time format. Use formats like: 2h, 30m, 2h30m, 1.5h, or 90 (minutes)');
    return {
      valid: false,
      seconds: 0,
      formatted: '0m',
      errors
    };
  }
  
  // Check for reasonable limits
  const maxHours = 24;
  const maxSeconds = maxHours * 3600;
  
  if (seconds > maxSeconds) {
    errors.push(`Time cannot exceed ${maxHours} hours`);
    return {
      valid: false,
      seconds,
      formatted: formatTime(seconds),
      errors
    };
  }
  
  return {
    valid: true,
    seconds,
    formatted: formatTime(seconds),
    errors: []
  };
}

/**
 * Generate time suggestions based on partial input
 * 
 * @param input - Partial time string
 * @returns Array of suggested completions
 */
export function getTimeSuggestions(input: string): string[] {
  if (!input) {
    return ['15m', '30m', '1h', '1h30m', '2h', '2h30m', '4h', '8h'];
  }
  
  const cleaned = input.trim().toLowerCase();
  const suggestions: string[] = [];
  
  // If input is just numbers, suggest minute completions
  if (/^\d+$/.test(cleaned)) {
    const num = parseInt(cleaned);
    if (num <= 8) {
      suggestions.push(`${num}h`, `${num}h30m`);
    }
    if (num <= 480) {
      suggestions.push(`${num}m`);
    }
  }
  
  // If input has 'h' but no 'm', suggest minute additions
  if (/^\d+h$/.test(cleaned)) {
    const hours = cleaned.replace('h', '');
    suggestions.push(`${hours}h15m`, `${hours}h30m`, `${hours}h45m`);
  }
  
  // Common suggestions
  const common = ['15m', '30m', '45m', '1h', '1h30m', '2h', '2h30m', '4h', '8h'];
  
  common.forEach(suggestion => {
    if (suggestion.startsWith(cleaned) && !suggestions.includes(suggestion)) {
      suggestions.push(suggestion);
    }
  });
  
  return suggestions.slice(0, 8); // Limit to 8 suggestions
}

/**
 * Convert between different time units
 */
export const timeUtils = {
  /**
   * Convert seconds to various units
   */
  fromSeconds: {
    toMinutes: (seconds: number): number => seconds / 60,
    toHours: (seconds: number): number => seconds / 3600,
    toDays: (seconds: number): number => seconds / 86400
  },
  
  /**
   * Convert various units to seconds
   */
  toSeconds: {
    fromMinutes: (minutes: number): number => minutes * 60,
    fromHours: (hours: number): number => hours * 3600,
    fromDays: (days: number): number => days * 86400
  },
  
  /**
   * Round time to specified intervals
   */
  round: {
    toMinutes: (seconds: number, interval: number = 1): number => {
      const minutes = seconds / 60;
      return Math.round(minutes / interval) * interval;
    },
    
    toQuarterHour: (seconds: number): number => {
      const minutes = seconds / 60;
      return Math.round(minutes / 15) * 15;
    },
    
    toHalfHour: (seconds: number): number => {
      const minutes = seconds / 60;
      return Math.round(minutes / 30) * 30;
    }
  }
};

/**
 * Time formatting options
 */
export interface TimeFormatOptions {
  showSeconds?: boolean;
  compact?: boolean; // "2h30m" vs "2 hours 30 minutes"
  roundTo?: number; // Round to nearest X minutes
}

/**
 * Advanced time formatting with options
 */
export function formatTimeWithOptions(seconds: number, options: TimeFormatOptions = {}): string {
  const {
    showSeconds = false,
    compact = true,
    roundTo = 0
  } = options;
  
  let totalSeconds = seconds;
  
  // Apply rounding if specified
  if (roundTo > 0) {
    const minutes = totalSeconds / 60;
    const roundedMinutes = Math.round(minutes / roundTo) * roundTo;
    totalSeconds = roundedMinutes * 60;
  }
  
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  
  if (compact) {
    const parts: string[] = [];
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (showSeconds && secs > 0) parts.push(`${secs}s`);
    
    return parts.length > 0 ? parts.join(' ') : '0m';
  } else {
    const parts: string[] = [];
    if (hours > 0) parts.push(`${hours} hour${hours !== 1 ? 's' : ''}`);
    if (minutes > 0) parts.push(`${minutes} minute${minutes !== 1 ? 's' : ''}`);
    if (showSeconds && secs > 0) parts.push(`${secs} second${secs !== 1 ? 's' : ''}`);
    
    return parts.length > 0 ? parts.join(' ') : '0 minutes';
  }
}

/**
 * Create a time entry string for markdown
 */
export function createTimeEntry(seconds: number, description: string, isPushed: boolean = false): string {
  const timeStr = formatTime(seconds);
  const pushedIndicator = isPushed ? ' [✓ Pushed]' : '';
  return `- ${timeStr}: ${description}${pushedIndicator}`;
}