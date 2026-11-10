// Re-export all shared types for use inside the web package.
// When @apex/shared is properly linked via workspaces, replace with:
//   export * from '@apex/shared';
// Until then, copy the essential interfaces here so the app compiles.

export type EmploymentType = 'permanent' | 'contractor' | 'temporary';
export type EmployeeStatus = 'active' | 'suspended' | 'terminated';
export type StationDirection = 'IN' | 'OUT' | 'BOTH';
export type ClockDirection = 'IN' | 'OUT';
export type ClockResult = 'accepted' | 'denied';
export type UserRole = 'admin' | 'hr' | 'supervisor' | 'device';

export interface BiometricConsent {
  date: string;
  staffMemberId: string;
  staffMemberName: string;
}

export interface Employee {
  id: string;
  employeeNumber: string;
  fullName: string;
  department: string;
  siteId: string;
  jobTitle?: string;
  employmentType: EmploymentType;
  status: EmployeeStatus;
  startDate: string;
  endDate?: string;
  fingerprintEnrolled: boolean;
  biometricConsent?: BiometricConsent;
  biometricDeclined: boolean;
  idNumber?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
}

export interface Site {
  id: string;
  name: string;
  code: string;
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
  deviceId?: string;
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
