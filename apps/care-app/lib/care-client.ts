"use client";

import { platformLinks } from "@vlworkhub/config";
import type { SessionUser } from "@vlworkhub/types";

export type CareResourceName = "clients" | "staff" | "notes" | "incidents" | "documents";
export type CareRecord = Record<string, string | number | null>;

export class ApiOfflineError extends Error {
  constructor() {
    super(`The Care app cannot reach the shared API at ${platformLinks.api}. Start the API service and try again.`);
    this.name = "ApiOfflineError";
  }
}

function isOfflineError(error: unknown) {
  return error instanceof TypeError || (error instanceof Error && error.name === "AbortError");
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(`${platformLinks.api}${path}`, {
      ...init,
      credentials: "include",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers || {})
      }
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "Request failed");
      throw new Error(detail || "Request failed");
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return response.json() as Promise<T>;
  } catch (error) {
    if (isOfflineError(error)) {
      throw new ApiOfflineError();
    }

    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export function getApiErrorMessage(error: unknown) {
  if (error instanceof ApiOfflineError) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "The Care app request failed.";
}

export async function getCurrentUser() {
  const data = await request<{ user: SessionUser }>("/auth/me");
  return data.user;
}

export async function getResource(resource: CareResourceName) {
  const data = await request<{ items: CareRecord[] }>(`/resources/${resource}`);
  return data.items;
}

export async function createResource(resource: CareResourceName, payload: Record<string, string>) {
  return request<{ id: number }>(`/resources/${resource}`, {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function updateResource(resource: CareResourceName, id: number, payload: Record<string, string>) {
  return request<{ success: true }>(`/resources/${resource}/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload)
  });
}

export async function deleteResource(resource: CareResourceName, id: number) {
  return request<{ success: true }>(`/resources/${resource}/${id}`, {
    method: "DELETE"
  });
}
