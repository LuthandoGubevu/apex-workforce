import { describe, it, expect } from 'vitest';
import { computeDailyAttendance, formatDuration } from '../rules/attendance.js';
import vectors from '../test-vectors/attendance.json';

describe('computeDailyAttendance — test vectors', () => {
  for (const v of vectors) {
    it(v.description, () => {
      const result = computeDailyAttendance(v.input.partial, v.input.date, v.input.events);
      expect(result.minutesOnSite).toBe(v.expected.minutesOnSite);
      expect(result.missingClockOut).toBe(v.expected.missingClockOut);
      expect(result.missingClockIn).toBe(v.expected.missingClockIn);
      expect(result.eventCount).toBe(v.expected.eventCount);
    });
  }
});

describe('formatDuration', () => {
  it('zero minutes', () => expect(formatDuration(0)).toBe('0h 0m'));
  it('60 minutes = 1h 0m', () => expect(formatDuration(60)).toBe('1h 0m'));
  it('90 minutes = 1h 30m', () => expect(formatDuration(90)).toBe('1h 30m'));
  it('480 minutes = 8h 0m', () => expect(formatDuration(480)).toBe('8h 0m'));
});
