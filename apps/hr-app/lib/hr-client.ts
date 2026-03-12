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
  | "document_signatures";

export type HrRecord = Record<string, string | number | null>;

export type HrUser = {
  id: string;
  fullName: string;
  email: string;
  roles: string[];
  status: string;
};

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
    const detail = await response.text().catch(() => "Request failed");
    throw new Error(detail || "Request failed");
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export async function getCurrentUser() {
  const data = await request<{ user: SessionUser }>("/auth/me");
  return data.user;
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

export async function updateResource(
  resource: HrResourceName,
  id: number,
  payload: Record<string, string>
) {
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
  const [users, session] = await Promise.all([getResource("users"), getCurrentUser()]);
  const currentUser: HrUser = {
    id: session.id,
    fullName: session.fullName,
    email: session.email,
    roles: session.roles,
    status: "active"
  };

  const mapped = users.map((item) => ({
    id: String(item.id ?? ""),
    fullName: [String(item.first_name ?? "").trim(), String(item.last_name ?? "").trim()].filter(Boolean).join(" ") || String(item.email ?? "User"),
    email: String(item.email ?? ""),
    roles: String(item.role ?? item.roles ?? "Employee").split(",").map((value) => value.trim()).filter(Boolean),
    status: String(item.status ?? "active")
  }));

  const existing = mapped.find((item) => item.email.toLowerCase() === currentUser.email.toLowerCase() || item.id === currentUser.id);
  return existing ? mapped : [currentUser, ...mapped];
}
