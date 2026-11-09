// All timestamps are ISO 8601 strings (Africa/Johannesburg) or Firestore Timestamp-shaped objects.
// The web layer converts to/from Firebase Timestamp; shared code stays Firebase-free.

export type EmploymentType = 'permanent' | 'contractor' | 'temporary';
export type EmployeeStatus = 'active' | 'suspended' | 'terminated';
export type StationDirection = 'IN' | 'OUT' | 'BOTH';
export type ClockDirection = 'IN' | 'OUT';
export type ClockResult = 'accepted' | 'denied';
export type UserRole = 'admin' | 'hr' | 'supervisor' | 'device';

export interface BiometricConsent {
  date: string;           // YYYY-MM-DD
  staffMemberId: string;
  staffMemberName: string;
}

export interface Employee {
  id: string;
  employeeNumber: string;      // unique, from SAB HR
  fullName: string;
  department: string;
  siteId: string;
  jobTitle?: string;
  employmentType: EmploymentType;
  status: EmployeeStatus;
  startDate: string;           // YYYY-MM-DD inclusive
  endDate?: string;            // YYYY-MM-DD inclusive; required for contractor/temporary
  fingerprintEnrolled: boolean;
  biometricConsent?: BiometricConsent;
  biometricDeclined: boolean;
  idNumber?: string;           // SA ID or passport — restricted (Admin/HR only)
  notes?: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
}

export interface Site {
  id: string;
  name: string;
  code: string;                // short uppercase identifier, e.g. "JNB"
  address?: string;
  city?: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export interface ClockingStation {
  id: string;
  siteId: string;
  name: string;
  direction: StationDirection;
  accessGroupIds: string[];
  deviceId?: string;           // PC app registers itself
  lastHeartbeat?: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export interface AccessGroup {
  id: string;
  siteId: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export interface EmployeeAccessGroup {
  id: string;
  employeeId: string;
  accessGroupId: string;
  grantedAt: string;
  grantedBy: string;
}

export interface ClockEvent {
  id: string;
  employeeId: string;
  employeeNumber: string;
  employeeName: string;
  stationId: string;
  stationName: string;
  siteId: string;
  direction: ClockDirection;
  result: ClockResult;
  deniedReason?: string;
  timestamp: string;
  templateMatchScore?: number;
  isCorrection: boolean;
  correctionReason?: string;
  correctedBy?: string;
  createdAt: string;
}

export interface DailyAttendance {
  employeeId: string;
  employeeName: string;
  employeeNumber: string;
  department: string;
  siteId: string;
  date: string;                // YYYY-MM-DD in Africa/Johannesburg
  firstIn?: string;
  lastOut?: string;
  minutesOnSite: number;
  missingClockOut: boolean;
  missingClockIn: boolean;
  eventCount: number;
}

export interface Correction {
  id: string;
  employeeId: string;
  date: string;
  direction: ClockDirection;
  timestamp: string;           // the corrected clock time
  reason: string;
  createdBy: string;
  createdAt: string;
}

export interface AuditEntry {
  id: string;
  timestamp: string;
  userId: string;
  userEmail: string;
  action: string;
  collection: string;
  documentId: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  note?: string;
}

export interface StaffUser {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  siteId?: string;
  departmentId?: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export interface EnrolmentRequest {
  id: string;
  employeeId: string;
  stationId: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled';
  requestedAt: string;
  requestedBy: string;
  completedAt?: string;
  errorMessage?: string;
}

export interface SystemSettings {
  relayPulseDurationMs: number;     // default 500
  fingerprintMatchThreshold: number; // default 70
  clockCooldownMs: number;           // default 2500
  dataRetentionDays: number;         // default 1095 (3 years)
  timezone: string;                  // Africa/Johannesburg
}
