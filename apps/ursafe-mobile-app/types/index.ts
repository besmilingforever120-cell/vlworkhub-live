export type PlatformRole = "SUPER_ADMIN" | "ADMIN" | "USER";

export interface SessionUser {
  id: string;
  fullName: string;
  email: string;
  organizationId: string;
  role: PlatformRole;
  roles: string[];
  apps: string[];
  platformRole: PlatformRole;
}

export interface MobileLocation {
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
  startTime: string;
  endTime?: string;
  distanceInMiles: number;
  startLocation?: MobileLocation;
  endLocation?: MobileLocation;
  route: MobileLocation[];
  notes?: string;
  vehicleInfo?: string;
  purpose?: string;
}

export interface UrsafeShift {
  id: string;
  userId: string;
  status: string;
}
