import { formatInTimeZone } from 'date-fns-tz';
import type { DailyAttendance } from '../types/index.js';

const TZ = 'Africa/Johannesburg';

export interface ClockEventForAttendance {
  id: string;
  direction: 'IN' | 'OUT';
  timestamp: string; // ISO string
  isCorrection: boolean;
}

export function computeDailyAttendance(
  partial: Pick<DailyAttendance, 'employeeId' | 'employeeName' | 'employeeNumber' | 'department' | 'siteId'>,
  date: string, // YYYY-MM-DD in Africa/Johannesburg
  events: ClockEventForAttendance[]
): DailyAttendance {
  const sorted = [...events].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  // Include only events whose local SA date matches `date`
  const dayEvents = sorted.filter(e =>
    formatInTimeZone(new Date(e.timestamp), TZ, 'yyyy-MM-dd') === date
  );

  const inEvents  = dayEvents.filter(e => e.direction === 'IN');
  const outEvents = dayEvents.filter(e => e.direction === 'OUT');

  const firstIn  = inEvents[0]?.timestamp;
  const lastOut  = outEvents[outEvents.length - 1]?.timestamp;

  let minutesOnSite = 0;
  let missingClockOut = false;
  let missingClockIn  = false;

  if (!firstIn && outEvents.length > 0) {
    missingClockIn = true;
  } else if (firstIn && !lastOut) {
    missingClockOut = true;
  } else if (firstIn && lastOut) {
    const diff = new Date(lastOut).getTime() - new Date(firstIn).getTime();
    if (diff > 0) minutesOnSite = Math.floor(diff / 60_000);
  }

  return {
    ...partial,
    date,
    firstIn,
    lastOut,
    minutesOnSite,
    missingClockOut,
    missingClockIn,
    eventCount: dayEvents.length,
  };
}

export function formatDuration(minutes: number): string {
  if (minutes === 0) return '0h 0m';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${m}m`;
}
