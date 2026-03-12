export type UserRole = "Admin" | "Manager" | "Employee" | "HR" | "IT";

export interface SessionUser {
  id: number;
  fullName: string;
  email: string;
  organizationId: number;
  role: UserRole;
}

export interface AuthPayload {
  user_id: number;
  organization_id: number;
  role: UserRole;
  email: string;
  full_name: string;
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
