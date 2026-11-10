import { formatInTimeZone } from 'date-fns-tz';
import type { DailyRecord } from './attendance';
import { fmtTime } from './attendance';

const TZ = 'Africa/Johannesburg';

function esc(val: string | number | boolean | undefined): string {
  if (val === undefined || val === null) return '';
  const s = String(val);
  return s.includes(',') || s.includes('"') || s.includes('\n')
    ? `"${s.replace(/"/g, '""')}"`
    : s;
}

function csvRow(cells: (string | number | boolean | undefined)[]): string {
  return cells.map(esc).join(',');
}

function download(content: string, filename: string, type: string) {
  const blob = new Blob(['﻿' + content], { type });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), { href: url, download: filename });
  a.click();
  URL.revokeObjectURL(url);
}

export function exportAttendanceCsv(records: DailyRecord[]) {
  const lines = [
    csvRow(['Date','Employee Number','Full Name','Department','First IN','Last OUT','Hours on Site','Missing Clock-out','Missing Clock-in']),
    ...records.map(r => csvRow([
      r.date, r.employeeNumber, r.employeeName, r.department,
      fmtTime(r.firstIn), fmtTime(r.lastOut),
      (r.minutesOnSite / 60).toFixed(2),
      r.missingClockOut ? 'YES' : '',
      r.missingClockIn  ? 'YES' : '',
    ])),
  ];
  download(lines.join('\r\n'), 'attendance.csv', 'text/csv');
}

export function exportPayrollCsv(records: DailyRecord[]) {
  const lines = [
    csvRow(['employeeNumber','fullName','department','date','hoursOnSite','firstIn','lastOut','missingClockOut','missingClockIn']),
    ...records.map(r => csvRow([
      r.employeeNumber, r.employeeName, r.department, r.date,
      (r.minutesOnSite / 60).toFixed(4),
      r.firstIn ? formatInTimeZone(new Date(r.firstIn), TZ, "yyyy-MM-dd'T'HH:mm:ss") : '',
      r.lastOut ? formatInTimeZone(new Date(r.lastOut), TZ, "yyyy-MM-dd'T'HH:mm:ss") : '',
      r.missingClockOut, r.missingClockIn,
    ])),
  ];
  download(lines.join('\r\n'), 'payroll-export.csv', 'text/csv');
}

export async function exportAttendanceExcel(records: DailyRecord[]) {
  const XLSX = await import('xlsx');
  const rows = [
    ['Date','Employee #','Full Name','Department','First IN','Last OUT','Hours','Missing Clock-out','Missing Clock-in'],
    ...records.map(r => [
      r.date, r.employeeNumber, r.employeeName, r.department,
      fmtTime(r.firstIn), fmtTime(r.lastOut),
      parseFloat((r.minutesOnSite / 60).toFixed(2)),
      r.missingClockOut ? 'YES' : '',
      r.missingClockIn  ? 'YES' : '',
    ]),
  ];
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [12,14,26,18,10,10,10,18,16].map(w => ({ wch: w }));
  XLSX.utils.book_append_sheet(wb, ws, 'Attendance');
  XLSX.writeFile(wb, 'attendance.xlsx');
}
