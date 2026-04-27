export type UserRole = "Admin" | "Manager" | "Employee" | "HR" | "IT";
export type PlatformRole = "SUPER_ADMIN" | "ADMIN" | "USER";
export type AppAccess = "HR" | "CARE" | "URSAFE";

export interface SessionUser {
  id: string;
  fullName: string;
  email: string;
  organizationId: string;
  role: PlatformRole | UserRole;
  roles: UserRole[];
  apps: AppAccess[];
  platformRole: PlatformRole;
  mustChangePassword?: boolean;
}

export interface AuthPayload {
  user_id: string;
  organization_id: string;
  role: PlatformRole;
  roles: UserRole[];
  apps: AppAccess[];
  email: string;
  full_name: string;
  platform_role: PlatformRole;
}

export interface NavItem {
  label: string;
  href: string;
}

export interface AppLink {
  name: string;
  description: string;
  href: string;
}

export interface ResourceColumn {
  key: string;
  label: string;
}

export interface ResourceConfig {
  title: string;
  description: string;
  resource: string;
  columns: ResourceColumn[];
  fields: string[];
}

export interface UrsafeUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  department?: string | null;
  managerId?: string | null;
  isActive: boolean;
  role: UserRole;
  roles: UserRole[];
}

export interface UrsafeLocation {
  latitude: number;
  longitude: number;
  timestamp: string;
  address?: string;
  accuracy?: number;
}

export interface UrsafeTrip {
  id: string;
  userId: string;
  status: string;
  category: string;
  startLocation?: UrsafeLocation | null;
  endLocation?: UrsafeLocation | null;
  startTime: string;
  endTime?: string;
  distanceInMiles: number;
  route: UrsafeLocation[];
  notes?: string;
  vehicleInfo?: string;
  purpose?: string;
}

export interface UrsafeShift {
  id: string;
  userId: string;
  startTime: string;
  endTime?: string;
  status: string;
  lastCheckIn?: string;
  checkInCount: number;
  startLocation?: UrsafeLocation | null;
  endLocation?: UrsafeLocation | null;
  currentLocation?: UrsafeLocation | null;
  clientName?: string;
  clientAddress?: string;
  expectedDuration?: number;
  notes?: string;
}

export interface UrsafeCheckIn {
  id: string;
  shiftId: string;
  userId: string;
  timestamp: string;
  location?: UrsafeLocation | null;
  status: string;
  notes?: string;
}

export interface UrsafeEmergency {
  id: string;
  userId: string;
  shiftId?: string;
  type: string;
  location?: UrsafeLocation | null;
  timestamp: string;
  resolved: boolean;
  resolvedBy?: string;
  resolvedAt?: string;
  notes?: string;
  resolution?: string;
  employeeSafe?: string;
  canResumeWork?: string;
  actionsTaken?: string;
  followUpRequired?: boolean;
  followUpNotes?: string;
}

export interface UrsafeActiveSession {
  id: string;
  userId: string;
  status: string;
  deviceName?: string;
  platform?: string;
  startedAt: string;
  lastSeenAt: string;
  location?: UrsafeLocation | null;
  lastKnownActivity?: string;
  batteryLevel?: number;
  notes?: string;
}

export interface UrsafeSettings {
  ratePerKm: number;
  smtpEmail?: string;
  smtpPassword?: string;
  logoData?: string | null;
}
