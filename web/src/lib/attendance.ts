import { formatInTimeZone } from 'date-fns-tz';

const TZ = 'Africa/Johannesburg';

export interface AttEvent {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeNumber: string;
  department: string;
  siteId: string;
  direction: 'IN' | 'OUT';
  timestamp: string;
  result: 'accepted' | 'denied';
  isCorrection: boolean;
}

export interface DailyRecord {
  employeeId: string;
  employeeName: string;
  employeeNumber: string;
  department: string;
  siteId: string;
  date: string;
  firstIn?: string;
  lastOut?: string;
  minutesOnSite: number;
  missingClockOut: boolean;
  missingClockIn: boolean;
  eventCount: number;
}

export function buildDailyRecords(
  events: AttEvent[],
  from: string,
  to: string
): DailyRecord[] {
  const accepted = events.filter(e => e.result === 'accepted');
  const groups = new Map<string, AttEvent[]>();

  for (const e of accepted) {
    const date = formatInTimeZone(new Date(e.timestamp), TZ, 'yyyy-MM-dd');
    if (date < from || date > to) continue;
    const key = `${e.employeeId}|${date}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(e);
  }

  const records: DailyRecord[] = [];

  for (const [key, evts] of groups) {
    const [employeeId, date] = key.split('|');
    const sorted = [...evts].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
    const ins  = sorted.filter(e => e.direction === 'IN');
    const outs = sorted.filter(e => e.direction === 'OUT');
    const firstIn = ins[0]?.timestamp;
    const lastOut = outs[outs.length - 1]?.timestamp;

    let minutesOnSite = 0;
    let missingClockOut = false;
    let missingClockIn  = false;

    if (!firstIn && outs.length > 0)  { missingClockIn  = true; }
    else if (firstIn && !lastOut)      { missingClockOut = true; }
    else if (firstIn && lastOut) {
      const diff = new Date(lastOut).getTime() - new Date(firstIn).getTime();
      if (diff > 0) minutesOnSite = Math.floor(diff / 60_000);
    }

    const emp = evts[0];
    records.push({
      employeeId, employeeName: emp.employeeName,
      employeeNumber: emp.employeeNumber,
      department: emp.department,
      siteId: emp.siteId, date, firstIn, lastOut,
      minutesOnSite, missingClockOut, missingClockIn,
      eventCount: evts.length,
    });
  }

  return records.sort((a, b) =>
    a.date !== b.date
      ? a.date.localeCompare(b.date)
      : a.employeeName.localeCompare(b.employeeName)
  );
}

export function fmtDuration(minutes: number): string {
  if (minutes === 0) return '—';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

export function fmtTime(iso?: string): string {
  if (!iso) return '—';
  return formatInTimeZone(new Date(iso), TZ, 'HH:mm');
}

export function fmtDateTime(iso?: string): string {
  if (!iso) return '—';
  return formatInTimeZone(new Date(iso), TZ, 'dd MMM yyyy HH:mm');
}
