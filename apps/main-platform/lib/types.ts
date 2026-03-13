export type AdminAppAccess = { app: "HR" | "CARE" | "URSAFE"; enabled: boolean };

export type AdminUserRecord = {
  id: string;
  organization_id: string;
  first_name: string;
  last_name: string;
  name: string;
  email: string;
  status: string;
  enabled: boolean;
  role: "SUPER_ADMIN" | "ADMIN" | "USER";
  app_access: AdminAppAccess[];
};
