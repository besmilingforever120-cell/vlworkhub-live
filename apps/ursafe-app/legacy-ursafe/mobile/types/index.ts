export enum UserRole {
  ADMIN = 'admin',
  MANAGER = 'manager',
  EMPLOYEE = 'employee',
}

export interface User {
  id: string;
  email: string;
  role: UserRole;
  firstName: string;
  lastName: string;
  department?: string;
  managerId?: string;
  isActive: boolean;
  mustChangePassword?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UserProfile extends User {
  phoneNumber?: string;
  department?: string;
  employeeId?: string;
}

export enum TripStatus {
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  PENDING_APPROVAL = 'pending_approval',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

export enum TripCategory {
  BUSINESS = 'business',
  PERSONAL = 'personal',
  COMMUTE = 'commute',
}

export interface Location {
  latitude: number;
  longitude: number;
  timestamp: string;
  accuracy?: number;
  address?: string;
}

export interface Trip {
  id: string;
  userId: string;
  status: TripStatus;
  category: TripCategory;
  startLocation: Location;
  endLocation?: Location;
  startTime: string;
  endTime?: string;
  distanceInMiles: number;
  route: Location[];
  notes?: string;
  vehicleInfo?: string;
  purpose?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TripSummary {
  totalTrips: number;
  totalMiles: number;
  approvedMiles: number;
  pendingMiles: number;
  rejectedMiles: number;
}

// Safety & Shift Management Types
export enum ShiftStatus {
  ACTIVE = 'active',
  COMPLETED = 'completed',
  EMERGENCY = 'emergency',
}

export interface Shift {
  id: string;
  userId: string;
  startTime: string;
  endTime?: string;
  status: ShiftStatus;
  lastCheckIn?: string;
  checkInCount: number;
  currentLocation?: Location;
  clientName?: string;
  clientAddress?: string;
  expectedDuration?: number; // in minutes
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CheckIn {
  id: string;
  shiftId: string;
  userId: string;
  timestamp: string;
  location: Location;
  status: 'safe' | 'concern' | 'emergency';
  notes?: string;
}

export enum EmergencyType {
  SOS = 'sos',
  ASSISTANCE_NEEDED = 'assistance_needed',
  MEDICAL = 'medical',
  SAFETY_CONCERN = 'safety_concern',
}

export interface EmergencyAlert {
  id: string;
  userId: string;
  shiftId?: string;
  type: EmergencyType;
  location: Location;
  timestamp: string;
  resolved: boolean;
  resolvedBy?: string;
  resolvedAt?: string;
  notes?: string;
  respondedBy?: string[];
  resolution?: string;
  employeeSafe?: 'yes' | 'no' | 'unknown';
  canResumeWork?: 'yes' | 'no' | 'requires_medical' | 'pending_investigation';
  actionsTaken?: string;
  followUpRequired?: boolean;
  followUpNotes?: string;
}

export interface Incident {
  id: string;
  userId: string;
  shiftId?: string;
  timestamp: string;
  location?: Location;
  type: 'aggressive_behavior' | 'safety_concern' | 'equipment_issue' | 'other';
  severity: 'low' | 'medium' | 'high';
  description: string;
  actionTaken?: string;
  reportedTo?: string;
  createdAt: string;
}

export type ShiftTimelineEventType = 'shift_start' | 'check_in' | 'emergency' | 'shift_end';

export interface ShiftTimelineEvent {
  id: string;
  shiftId: string;
  timestamp: string;
  type: ShiftTimelineEventType;
  label: string;
  description?: string;
  severity?: 'info' | 'warning' | 'critical';
  metadata?: Record<string, string | number | boolean | undefined>;
}

export interface ShiftHistoryEntry {
  shift: Shift;
  employee?: Pick<User, 'id' | 'firstName' | 'lastName' | 'department'>;
  checkIns: CheckIn[];
  emergencies: EmergencyAlert[];
  timeline: ShiftTimelineEvent[];
  durationMinutes: number;
  totalInactiveMinutes: number;
  riskLevel: 'low' | 'medium' | 'high';
}

export type ActiveUserStatus = 'online' | 'idle' | 'stale';

export interface ActiveUserSession {
  id: string;
  userId: string;
  status: ActiveUserStatus;
  deviceName?: string;
  platform?: string;
  startedAt: string;
  lastSeenAt: string;
  location?: Location;
  lastKnownActivity?: string;
  batteryLevel?: number;
  notes?: string;
}
