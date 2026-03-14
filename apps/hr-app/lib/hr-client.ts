"use client";

import { platformLinks } from "@vlworkhub/config";
import type { SessionUser } from "@vlworkhub/types";

export type HrResourceName =
  | "users"
  | "announcements"
  | "tasks"
  | "task_user_states"
  | "training"
  | "training_assignments"
  | "training_completions"
  | "surveys"
  | "survey_assignments"
  | "survey_completions"
  | "documents"
  | "document_signatures"
  | "hr_user_roles";

export type HrRecord = Record<string, string | number | null>;

export type HrUser = {
  id: string;
  fullName: string;
  email: string;
  roles: string[];
  status: string;
};

export type HrNotification = {
  type: "task" | "training" | "survey" | "document";
  title: string;
  link: string;
  created_at: string;
};

export type HrNotificationSummary = {
  count: number;
  items: HrNotification[];
};

export type HrDashboardSummary = {
  documents: number;
  training: number;
  tasks: number;
  surveys: number;
};

export type HrAssignment = {
  id: number;
  user_id: string;
  hr_role: "ADMIN" | "MANAGER" | "EMPLOYEE";
  manager_id: string | null;
  created_at?: string;
  updated_at?: string;
};

export type HrRoleSummary = {
  userId: string;
  role: "admin" | "manager" | "employee";
  managerId: string | null;
};

let hrRoleCache: Promise<HrRoleSummary> | null = null;

export class ApiOfflineError extends Error {
  constructor() {
    super(`The HR portal cannot reach the API at ${platformLinks.api}. Start the API server and try again.`);
    this.name = "ApiOfflineError";
  }
}

export function getApiErrorMessage(error: unknown) {
  if (error instanceof ApiOfflineError) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "The HR portal request failed.";
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);

  let response: Response;

  try {
    response = await fetch(`${platformLinks.api}${path}`, {
      ...init,
      credentials: "include",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers || {})
      }
    });
  } catch (error) {
    clearTimeout(timer);
    if (error instanceof TypeError || (error instanceof Error && error.name === "AbortError")) {
      throw new ApiOfflineError();
    }
    throw error;
  }

  clearTimeout(timer);

  if (!response.ok) {
    let detail = "Request failed";
    try {
      const contentType = response.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        const body = await response.json();
        detail = String(body.message || body.error || detail);
      } else {
        detail = await response.text();
      }
    } catch {
      detail = "Request failed";
    }

    throw new Error(detail || "Request failed");
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export function invalidateHrRoleCache() {
  hrRoleCache = null;
}

export async function getCurrentUser() {
  const data = await request<{ user: SessionUser }>("/auth/me");
  return data.user;
}

export async function getNotifications() {
  return request<HrNotificationSummary>("/notifications");
}

export async function getDashboardSummary() {
  return request<HrDashboardSummary>("/hr/dashboard");
}

export async function getMyHrRole(forceRefresh = false) {
  if (forceRefresh || !hrRoleCache) {
    hrRoleCache = request<HrRoleSummary>("/hr/my-role");
  }
  return hrRoleCache;
}

export async function getPlatformUsers() {
  return request<{ items: Array<{ id: string; name: string; email: string }> }>("/api/users");
}

export async function getHrAssignments() {
  return request<{ items: HrAssignment[] }>("/hr/user-roles");
}

export async function saveHrAssignment(payload: { userId: string; hrRole: "ADMIN" | "MANAGER" | "EMPLOYEE"; managerId: string | null }) {
  console.log("[HR Admin] POST /hr/user-roles payload", payload);
  const response = await request<{ success: true; item: HrAssignment }>("/hr/user-roles", {
    method: "POST",
    body: JSON.stringify(payload)
  });
  invalidateHrRoleCache();
  return response;
}

export async function getResource(resource: HrResourceName) {
  const data = await request<{ items: HrRecord[] }>(`/resources/${resource}`);
  return data.items;
}

export async function createResource(resource: HrResourceName, payload: Record<string, string>) {
  return request<{ id: number }>(`/resources/${resource}`, {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function updateResource(resource: HrResourceName, id: number, payload: Record<string, string>) {
  return request<{ success: true }>(`/resources/${resource}/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload)
  });
}

export async function deleteResource(resource: HrResourceName, id: number) {
  return request<{ success: true }>(`/resources/${resource}/${id}`, {
    method: "DELETE"
  });
}

export async function getSharedUsers() {
  const [userData, session] = await Promise.all([getPlatformUsers(), getCurrentUser()]);
  const currentUser: HrUser = {
    id: session.id,
    fullName: session.fullName,
    email: session.email,
    roles: session.roles,
    status: "active"
  };

  const mapped = (userData.items || []).map((item) => ({
    id: String(item.id ?? ""),
    fullName: String(item.name ?? "User").trim() || String(item.email ?? "User"),
    email: String(item.email ?? ""),
    roles: session.roles,
    status: "active"
  }));

  const existing = mapped.find((item) => item.email.toLowerCase() === currentUser.email.toLowerCase() || item.id === currentUser.id);
  return existing ? mapped : [currentUser, ...mapped];
}
