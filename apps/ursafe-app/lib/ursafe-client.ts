"use client";

import { platformLinks } from "@vlworkhub/config";
import type {
  SessionUser,
  UrsafeActiveSession,
  UrsafeCheckIn,
  UrsafeEmergency,
  UrsafeSettings,
  UrsafeShift,
  UrsafeTrip,
  UrsafeUser
} from "@vlworkhub/types";

export type GenericRecord = Record<string, string | number | null>;

export class ApiOfflineError extends Error {
  constructor() {
    super(`URSafe cannot reach the shared API at ${platformLinks.api}. Start the API service and try again.`);
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
  return "The URSafe request failed.";
}

export async function getCurrentUser() {
  const data = await request<{ user: SessionUser }>("/auth/me");
  return data.user;
}

export async function getUrsafeUsers() {
  const data = await request<{ items: UrsafeUser[] }>("/ursafe/users");
  return data.items;
}

export async function getTrips(userId?: string) {
  const query = userId ? `?userId=${encodeURIComponent(userId)}` : "";
  const data = await request<{ items: UrsafeTrip[] }>(`/ursafe/trips${query}`);
  return data.items;
}

export async function getTrip(id: string) {
  const data = await request<{ item: UrsafeTrip }>(`/ursafe/trips/${id}`);
  return data.item;
}

export async function createTrip(payload: Record<string, unknown>) {
  const data = await request<{ item: UrsafeTrip }>("/ursafe/trips", {
    method: "POST",
    body: JSON.stringify(payload)
  });
  return data.item;
}

export async function updateTrip(id: string, payload: Record<string, unknown>) {
  return request<{ success: true }>(`/ursafe/trips/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload)
  });
}

export async function deleteTrip(id: string) {
  return request<{ success: true }>(`/ursafe/trips/${id}`, { method: "DELETE" });
}

export async function getShifts(params?: { userId?: string; activeOnly?: boolean }) {
  const search = new URLSearchParams();
  if (params?.userId) search.set("userId", params.userId);
  if (params?.activeOnly) search.set("activeOnly", "true");
  const suffix = search.size ? `?${search.toString()}` : "";
  const data = await request<{ items: UrsafeShift[] }>(`/ursafe/shifts${suffix}`);
  return data.items;
}

export async function createShift(payload: Record<string, unknown>) {
  const data = await request<{ item: UrsafeShift }>("/ursafe/shifts", {
    method: "POST",
    body: JSON.stringify(payload)
  });
  return data.item;
}

export async function updateShift(id: string, payload: Record<string, unknown>) {
  return request<{ success: true }>(`/ursafe/shifts/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload)
  });
}

export async function getCheckIns(shiftId?: string) {
  const query = shiftId ? `?shiftId=${encodeURIComponent(shiftId)}` : "";
  const data = await request<{ items: UrsafeCheckIn[] }>(`/ursafe/check-ins${query}`);
  return data.items;
}

export async function createCheckIn(payload: Record<string, unknown>) {
  const data = await request<{ item: UrsafeCheckIn }>("/ursafe/check-ins", {
    method: "POST",
    body: JSON.stringify(payload)
  });
  return data.item;
}

export async function getEmergencies(unresolvedOnly = false) {
  const query = unresolvedOnly ? "?unresolvedOnly=true" : "";
  const data = await request<{ items: UrsafeEmergency[] }>(`/ursafe/emergencies${query}`);
  return data.items;
}

export async function createEmergency(payload: Record<string, unknown>) {
  const data = await request<{ item: UrsafeEmergency }>("/ursafe/emergencies", {
    method: "POST",
    body: JSON.stringify(payload)
  });
  return data.item;
}

export async function resolveEmergency(id: string, payload: Record<string, unknown>) {
  return request<{ success: true }>(`/ursafe/emergencies/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload)
  });
}

export async function getActiveSessions() {
  const data = await request<{ items: UrsafeActiveSession[] }>("/ursafe/active-sessions");
  return data.items;
}

export async function clearActiveSession(userId: string) {
  return request<{ success: true }>(`/ursafe/active-sessions/user/${userId}`, {
    method: "DELETE"
  });
}

export async function getUrsafeSettings() {
  return request<UrsafeSettings>("/ursafe/settings");
}

export async function saveUrsafeSettings(payload: UrsafeSettings) {
  return request<UrsafeSettings>("/ursafe/settings", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function getEmergencyContacts() {
  const data = await request<{ items: GenericRecord[] }>("/resources/emergency_contacts");
  return data.items;
}

export async function getSafetyChecklists() {
  const data = await request<{ items: GenericRecord[] }>("/resources/safety_checklists");
  return data.items;
}
