"use client";

import { useEffect, useMemo, useState } from "react";
import type { SessionUser, UrsafeEmergency, UrsafeShift, UrsafeUser } from "@vlworkhub/types";
import { EmptyState, ErrorBanner, MetricCard, SectionCard } from "./ursafe-ui";
import UrsafeAppHeader, { HeaderActionButton } from "./ursafe-app-header";

type ResolutionForm = {
  resolution: string;
  actionsTaken: string;
  employeeSafe: string;
  canResumeWork: string;
  followUpRequired: boolean;
  followUpNotes: string;
};

const initialResolution: ResolutionForm = {
  resolution: "",
  actionsTaken: "",
  employeeSafe: "unknown",
  canResumeWork: "pending_investigation",
  followUpRequired: false,
  followUpNotes: ""
};

const API_BASE_URL = process.env.API_BASE_URL || process.env.NEXT_PUBLIC_API_URL || "";

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    }
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "Request failed");
    throw new Error(detail || "Request failed");
  }

  return response.json() as Promise<T>;
}

function parseError(error: unknown) {
  if (error instanceof Error) return error.message;
  return "Safety Monitoring request failed.";
}

function resolveRoleState(user: SessionUser | null) {
  const roles = new Set([user?.role, user?.platformRole, ...(user?.roles ?? [])].filter(Boolean).map((item) => String(item).toUpperCase()));
  return {
    isSuperAdmin: roles.has("SUPER_ADMIN"),
    isAdmin: roles.has("ADMIN") || roles.has("SUPER_ADMIN"),
    isManager: roles.has("MANAGER")
  };
}

function resolveEmployeeName(user?: UrsafeUser, shift?: UrsafeShift) {
  const shiftLike = (shift || {}) as UrsafeShift & {
    first_name?: string;
    last_name?: string;
    email?: string;
    firstName?: string;
    lastName?: string;
  };

  const firstName = shiftLike.first_name || shiftLike.firstName || user?.firstName || "";
  const lastName = shiftLike.last_name || shiftLike.lastName || user?.lastName || "";
  const fullName = `${firstName} ${lastName}`.trim();

  return fullName || shiftLike.email || user?.email || shift?.userId || user?.id || "Unknown employee";
}

export default function SafetyMonitoringClient() {
  const [currentUser, setCurrentUser] = useState<SessionUser | null>(null);
  const [users, setUsers] = useState<UrsafeUser[]>([]);
  const [shifts, setShifts] = useState<UrsafeShift[]>([]);
  const [emergencies, setEmergencies] = useState<UrsafeEmergency[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [resolvingEmergencyId, setResolvingEmergencyId] = useState<string | null>(null);
  const [resolutionForm, setResolutionForm] = useState<ResolutionForm>(initialResolution);

  const { isSuperAdmin, isAdmin, isManager } = useMemo(() => resolveRoleState(currentUser), [currentUser]);

  async function load() {
    try {
      setError(null);
      setLoading(true);

      const [meResult, usersResult, shiftsResult, emergenciesResult] = await Promise.all([
        apiRequest<{ user: SessionUser }>("/auth/me"),
        apiRequest<{ items: UrsafeUser[] }>("/ursafe/users"),
        apiRequest<{ items: UrsafeShift[] }>("/ursafe/shifts"),
        apiRequest<{ items: UrsafeEmergency[] }>("/ursafe/emergencies")
      ]);

      const activeUsers = usersResult.items.filter((item) => item.isActive);
      const activeUserIds = new Set(activeUsers.map((item) => item.id));

      setCurrentUser(meResult.user);
      setUsers(activeUsers);
      setShifts(shiftsResult.items.filter((item) => activeUserIds.has(item.userId)));
      setEmergencies(emergenciesResult.items.filter((item) => activeUserIds.has(item.userId)));
    } catch (loadError) {
      setError(parseError(loadError));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = window.setInterval(() => {
      void load();
    }, 30000);

    return () => window.clearInterval(interval);
  }, [autoRefresh]);

  const userById = useMemo(() => new Map(users.map((item) => [item.id, item])), [users]);

  const unresolvedByUser = useMemo(() => {
    const map = new Map<string, UrsafeEmergency[]>();
    emergencies.forEach((item) => {
      if (item.resolved) return;
      const existing = map.get(item.userId) ?? [];
      existing.push(item);
      map.set(item.userId, existing);
    });
    return map;
  }, [emergencies]);

  const activeShiftByUser = useMemo(() => {
    const map = new Map<string, UrsafeShift>();
    shifts.forEach((item) => {
      if (item.status === "active") {
        map.set(item.userId, item);
      }
    });
    return map;
  }, [shifts]);

  const criticalUsers = useMemo(
    () => users.filter((user) => (unresolvedByUser.get(user.id)?.length ?? 0) > 0),
    [users, unresolvedByUser]
  );
  const activeUsers = useMemo(
    () => users.filter((user) => !criticalUsers.some((item) => item.id === user.id) && activeShiftByUser.has(user.id)),
    [users, criticalUsers, activeShiftByUser]
  );
  const safeUsers = useMemo(
    () => users.filter((user) => !criticalUsers.some((item) => item.id === user.id) && !activeShiftByUser.has(user.id)),
    [users, criticalUsers, activeShiftByUser]
  );

  async function resolveEmergency() {
    if (!resolvingEmergencyId) return;
    if (!resolutionForm.resolution.trim() || !resolutionForm.actionsTaken.trim()) {
      setError("Resolution summary and actions taken are required.");
      return;
    }

    try {
      const target = emergencies.find((item) => item.id === resolvingEmergencyId);
      await apiRequest<{ success: true }>(`/ursafe/emergencies/${resolvingEmergencyId}`, {
        method: "PUT",
        body: JSON.stringify({
          ...resolutionForm,
          resolvedAt: new Date().toISOString(),
          originalNotes: target?.notes || ""
        })
      });

      setResolvingEmergencyId(null);
      setResolutionForm(initialResolution);
      await load();
    } catch (resolveError) {
      setError(parseError(resolveError));
    }
  }

  const pageSubtitle = isAdmin || isManager
    ? "Watch critical alerts, shifts, and emergency resolutions in real time."
    : "Safety monitoring view";

  return (
    <div className="min-h-screen bg-gray-100 text-slate-900">
      <UrsafeAppHeader
        eyebrow="Safety Desk"
        title="Safety Monitoring Center"
        subtitle={pageSubtitle}
        accent="rose"
        actions={
          <>
            <HeaderActionButton
              label={autoRefresh ? "Auto refresh on" : "Auto refresh off"}
              icon={autoRefresh ? "R" : "P"}
              tone="primary"
              onClick={() => setAutoRefresh((previous) => !previous)}
            />
            <HeaderActionButton label="Refresh" icon="R" tone="primary" onClick={() => void load()} />
          </>
        }
        meta={`Signed in as ${currentUser?.fullName ?? "Unknown User"}`}
      />

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        {error ? <ErrorBanner message={error} /> : null}

        <section className="grid gap-4 md:grid-cols-3">
          <MetricCard label="Critical Alerts" value={String(criticalUsers.length)} helper="Immediate response needed" tone="rose" />
          <MetricCard label="Active Shifts" value={String(activeUsers.length)} helper="Live monitored workers" tone="emerald" />
          <MetricCard label="All Safe" value={String(safeUsers.length)} helper="No active emergencies" tone="blue" />
        </section>

        {loading ? (
          <SectionCard title="Loading" description="Pulling latest safety telemetry.">
            <p className="text-sm text-slate-500">Loading...</p>
          </SectionCard>
        ) : null}

        {criticalUsers.length > 0 ? (
          <SectionCard title="Critical Alerts" description="Unresolved incidents are prioritized first.">
            <div className="space-y-4">
              {criticalUsers.map((user) => {
                const unresolved = unresolvedByUser.get(user.id) ?? [];
                const shift = activeShiftByUser.get(user.id);
                const expanded = expandedUserId === user.id;
                const employeeName = resolveEmployeeName(user, shift);

                return (
                  <article key={user.id} className="overflow-hidden rounded-2xl border-2 border-rose-500 bg-rose-50">
                    <button
                      type="button"
                      onClick={() => setExpandedUserId(expanded ? null : user.id)}
                      className="flex w-full items-center justify-between px-4 py-3 text-left"
                    >
                      <div>
                        <p className="text-lg font-bold text-rose-900">{employeeName}</p>
                        <p className="text-sm text-rose-700">{unresolved.length} unresolved emergency{unresolved.length === 1 ? "" : "ies"}</p>
                      </div>
                      <span className="text-xs font-semibold uppercase text-rose-700">{expanded ? "Hide" : "Open"}</span>
                    </button>

                    {expanded ? (
                      <div className="space-y-4 border-t border-rose-200 bg-white p-4">
                        {shift ? (
                          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
                            Shift started {new Date(shift.startTime).toLocaleString()} · Check-ins: {shift.checkInCount}
                          </div>
                        ) : null}

                        {unresolved.map((emergency) => (
                          <div key={emergency.id} className="rounded-xl border border-rose-200 bg-rose-50 p-3">
                            <div className="flex items-center justify-between gap-3">
                              <p className="text-sm font-semibold uppercase text-rose-800">{emergency.type.replace(/_/g, " ")}</p>
                              <button
                                type="button"
                                onClick={() => setResolvingEmergencyId(emergency.id)}
                                className="rounded-full bg-emerald-600 px-3 py-1 text-xs font-semibold uppercase text-white"
                              >
                                Resolve
                              </button>
                            </div>
                            <p className="mt-2 text-sm text-rose-900">{emergency.notes || "No notes captured."}</p>
                            <p className="mt-2 text-xs text-rose-700">Triggered {new Date(emergency.timestamp).toLocaleString()}</p>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          </SectionCard>
        ) : null}

        <SectionCard title="Active Shifts" description="Employees currently on duty with no unresolved emergency.">
          {activeUsers.length === 0 ? (
            <EmptyState title="No active shifts" description="Active employees will appear here." />
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {activeUsers.map((user) => {
                const shift = activeShiftByUser.get(user.id);
                const employeeName = resolveEmployeeName(user, shift);
                return (
                  <article key={user.id} className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                    <p className="font-semibold text-emerald-900">{employeeName}</p>
                    <p className="text-sm text-emerald-800">{shift?.clientName || "No client recorded"}</p>
                    <p className="text-xs text-emerald-700">Started {shift ? new Date(shift.startTime).toLocaleString() : "--"}</p>
                  </article>
                );
              })}
            </div>
          )}
        </SectionCard>

        <SectionCard title={isAdmin ? "All Users" : "All Employees"} description="Users without active alerts.">
          {safeUsers.length === 0 ? (
            <EmptyState title="No safe users listed" description="Users appear when roster data is available." />
          ) : (
            <div className="grid gap-3 md:grid-cols-3">
              {safeUsers.map((user) => {
                const employeeName = resolveEmployeeName(user);
                return (
                  <article key={user.id} className="rounded-xl border border-gray-200 bg-white p-4">
                    <p className="font-semibold text-slate-900">{employeeName}</p>
                    <p className="text-sm text-slate-600">{user.department || "No department"}</p>
                  </article>
                );
              })}
            </div>
          )}
        </SectionCard>
      </main>

      {resolvingEmergencyId ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-6 text-slate-900 shadow-xl">
            <h2 className="text-2xl font-bold">Resolve Emergency</h2>
            <div className="mt-4 space-y-4">
              <textarea
                value={resolutionForm.resolution}
                onChange={(event) => setResolutionForm((current) => ({ ...current, resolution: event.target.value }))}
                className="min-h-[100px] w-full rounded-xl border border-gray-300 px-3 py-2"
                placeholder="Resolution summary"
              />
              <textarea
                value={resolutionForm.actionsTaken}
                onChange={(event) => setResolutionForm((current) => ({ ...current, actionsTaken: event.target.value }))}
                className="min-h-[90px] w-full rounded-xl border border-gray-300 px-3 py-2"
                placeholder="Actions taken"
              />
              <div className="grid gap-3 md:grid-cols-2">
                <select
                  value={resolutionForm.employeeSafe}
                  onChange={(event) => setResolutionForm((current) => ({ ...current, employeeSafe: event.target.value }))}
                  className="rounded-xl border border-gray-300 px-3 py-2"
                >
                  <option value="unknown">Employee safety unknown</option>
                  <option value="yes">Employee safe</option>
                  <option value="no">Employee not safe</option>
                </select>
                <select
                  value={resolutionForm.canResumeWork}
                  onChange={(event) => setResolutionForm((current) => ({ ...current, canResumeWork: event.target.value }))}
                  className="rounded-xl border border-gray-300 px-3 py-2"
                >
                  <option value="pending_investigation">Pending investigation</option>
                  <option value="yes">Can resume work</option>
                  <option value="no">Cannot resume work</option>
                  <option value="requires_medical">Requires medical clearance</option>
                </select>
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={resolutionForm.followUpRequired}
                  onChange={(event) => setResolutionForm((current) => ({ ...current, followUpRequired: event.target.checked }))}
                />
                Follow-up required
              </label>
              {resolutionForm.followUpRequired ? (
                <textarea
                  value={resolutionForm.followUpNotes}
                  onChange={(event) => setResolutionForm((current) => ({ ...current, followUpNotes: event.target.value }))}
                  className="min-h-[70px] w-full rounded-xl border border-gray-300 px-3 py-2"
                  placeholder="Follow-up notes"
                />
              ) : null}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => void resolveEmergency()}
                  className="flex-1 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white"
                >
                  Submit Resolution
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setResolvingEmergencyId(null);
                    setResolutionForm(initialResolution);
                  }}
                  className="flex-1 rounded-xl bg-gray-200 px-4 py-2 text-sm font-semibold text-slate-800"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}