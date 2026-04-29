export type AdminAppAccess = { app: "HR" | "CARE" | "URSAFE"; enabled: boolean };

export type AdminUserRecord = {
  id: string;
  organization_id: string;
  organization_name: string;
  department_id: string | null;
  first_name: string;
  last_name: string;
  name: string;
  email: string;
  status: string;
  enabled: boolean;
  role: "SUPER_ADMIN" | "ADMIN" | "USER";
  app_access: AdminAppAccess[];
};

export type OrganizationRecord = {
  id: string;
  name: string;
  enabled: boolean;
  disabled_at: string | null;
  created_at: string;
  user_count: number;
  department_count: number;
};

export type DepartmentRecord = {
  id: string;
  organization_id: string;
  name: string;
  address: string | null;
  department_type: "Community housing" | "Program";
  manager_id: string | null;
  manager_name: string | null;
  manager_email: string | null;
  created_at: string;
};
