import { formatInTimeZone } from 'date-fns-tz';
import type { Employee, ClockingStation, StationDirection } from '../types/index.js';

const TZ = 'Africa/Johannesburg';

export interface AccessCheckInput {
  employee: Pick<Employee, 'status' | 'startDate' | 'endDate' | 'siteId' | 'biometricDeclined' | 'fingerprintEnrolled'>;
  station: Pick<ClockingStation, 'siteId' | 'accessGroupIds'>;
  employeeAccessGroupIds: string[];
  now: Date;
}

export type AccessCheckResult =
  | { allowed: true }
  | { allowed: false; reason: string };

export function checkAccess(input: AccessCheckInput): AccessCheckResult {
  const { employee, station, employeeAccessGroupIds, now } = input;
  const today = formatInTimeZone(now, TZ, 'yyyy-MM-dd');

  if (employee.status === 'suspended') {
    return { allowed: false, reason: 'Employee suspended' };
  }

  if (employee.status === 'terminated') {
    return { allowed: false, reason: 'Employee no longer active' };
  }

  if (employee.endDate && today > employee.endDate) {
    return { allowed: false, reason: `Access ended ${formatDisplayDate(employee.endDate)}` };
  }

  if (today < employee.startDate) {
    return { allowed: false, reason: `Access starts ${formatDisplayDate(employee.startDate)}` };
  }

  const hasStationAccess = station.accessGroupIds.some(gid =>
    employeeAccessGroupIds.includes(gid)
  );

  if (!hasStationAccess) {
    // Cross-site: if the employee's home site doesn't match and they have no group access, say "not registered"
    if (employee.siteId !== station.siteId) {
      return { allowed: false, reason: 'Not registered at this site' };
    }
    return { allowed: false, reason: 'No access to this entry' };
  }

  return { allowed: true };
}

export function getClockDirection(
  stationDirection: StationDirection,
  lastEventDirection: 'IN' | 'OUT' | null
): 'IN' | 'OUT' {
  if (stationDirection === 'IN') return 'IN';
  if (stationDirection === 'OUT') return 'OUT';
  // BOTH: alternate
  return lastEventDirection === 'IN' ? 'OUT' : 'IN';
}

function formatDisplayDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${d} ${months[parseInt(m, 10) - 1]} ${y}`;
}
