export type AdminAppAccess = { app: "HR" | "CARE" | "URSAFE"; enabled: boolean };

export type AdminUserRecord = {
  id: string;
  name: string;
  email: string;
  enabled: boolean;
  role: "super_admin" | "user";
  app_access: AdminAppAccess[];
};
