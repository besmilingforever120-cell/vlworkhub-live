"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { SessionUser, UrsafeCheckIn, UrsafeEmergency, UrsafeShift, UrsafeUser } from "@vlworkhub/types";
import UrsafeAppHeader, { HeaderActionButton } from "./ursafe-app-header";
import { EmptyState, ErrorBanner, SectionCard } from "./ursafe-ui";

type TimelineEntry = {
  id: string;
  timestamp: string;
  label: string;
  details: string;
};

type ShiftHistoryRecord = {
  shift: UrsafeShift;
  employee?: UrsafeUser;
  checkIns: UrsafeCheckIn[];
  emergencies: UrsafeEmergency[];
  timeline: TimelineEntry[];
  durationMinutes: number;
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

function minutesBetween(start: string, end?: string) {
  const startTime = new Date(start).getTime();
  const endTime = end ? new Date(end).getTime() : Date.now();
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime)) return 0;
  return Math.max(0, Math.round((endTime - startTime) / 60000));
}

function parseError(error: unknown) {
  if (error instanceof Error) return error.message;
  return "Shift History request failed.";
}

function resolveEmployeeName(shift: UrsafeShift, employee?: UrsafeUser) {
  const shiftLike = shift as UrsafeShift & {
    first_name?: string;
    last_name?: string;
    email?: string;
    firstName?: string;
    lastName?: string;
  };

  const shiftFirstName = shiftLike.first_name || shiftLike.firstName || "";
  const shiftLastName = shiftLike.last_name || shiftLike.lastName || "";
  const fullNameFromShift = `${shiftFirstName} ${shiftLastName}`.trim();

  const userFullName = employee ? `${employee.firstName || ""} ${employee.lastName || ""}`.trim() : "";

  return fullNameFromShift || userFullName || shiftLike.email || employee?.email || shift.userId;
}

export default function ShiftHistoryClient() {
  const searchParams = useSearchParams();
  const userIdFilter = searchParams.get("userId");

  const [currentUser, setCurrentUser] = useState<SessionUser | null>(null);
  const [records, setRecords] = useState<ShiftHistoryRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [expandedShiftId, setExpandedShiftId] = useState<string | null>(null);

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

      const users = usersResult.items.filter((item) => item.isActive || item.id === userIdFilter);
      const shifts = shiftsResult.items.filter((item) => !userIdFilter || item.userId === userIdFilter);
      const emergencies = emergenciesResult.items.filter((item) => !userIdFilter || item.userId === userIdFilter);
      const userById = new Map(users.map((item) => [item.id, item]));

      const checkInGroups = await Promise.all(
        shifts.map(async (item) => {
          const result = await apiRequest<{ items: UrsafeCheckIn[] }>(`/ursafe/check-ins?shiftId=${encodeURIComponent(item.id)}`);
          return result.items;
        })
      );

      const history: ShiftHistoryRecord[] = shifts
        .map((shift, index) => {
          const checkIns = checkInGroups[index] || [];
          const shiftEmergencies = emergencies.filter((item) => item.shiftId === shift.id || item.userId === shift.userId);

          const timeline: TimelineEntry[] = [
            {
              id: `${shift.id}-start`,
              timestamp: shift.startTime,
              label: "Shift started",
              details: shift.clientName || "Shift opened"
            },
            ...checkIns.map((item) => ({
              id: item.id,
              timestamp: item.timestamp,
              label: `Check-in · ${item.status}`,
              details: item.notes || item.location?.address || "Employee confirmed safe"
            })),
            ...shiftEmergencies.map((item) => ({
              id: item.id,
              timestamp: item.timestamp,
              label: `Emergency · ${item.type.replace(/_/g, " ")}`,
              details: item.notes || item.location?.address || "Emergency recorded"
            })),
            ...(shift.endTime
              ? [
                  {
                    id: `${shift.id}-end`,
                    timestamp: shift.endTime,
                    label: "Shift ended",
                    details: shift.clientAddress || "Shift closed"
                  }
                ]
              : [])
          ].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

          return {
            shift,
            employee: userById.get(shift.userId),
            checkIns,
            emergencies: shiftEmergencies,
            timeline,
            durationMinutes: minutesBetween(shift.startTime, shift.endTime)
          };
        })
        .sort((a, b) => new Date(b.shift.startTime).getTime() - new Date(a.shift.startTime).getTime());

      setCurrentUser(meResult.user);
      setRecords(history);
    } catch (loadError) {
      setError(parseError(loadError));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [userIdFilter]);

  const filtered = useMemo(() => {
    return records.filter((item) => {
      const term = search.trim().toLowerCase();
      const employeeName = item.employee ? `${item.employee.firstName} ${item.employee.lastName}`.toLowerCase() : "";
      const clientName = item.shift.clientName?.toLowerCase() || "";
      const address = item.shift.clientAddress?.toLowerCase() || "";
      const matchesSearch = !term || employeeName.includes(term) || clientName.includes(term) || address.includes(term);

      const matchesStatus = statusFilter === "all" || item.shift.status === statusFilter;

      const startTime = new Date(item.shift.startTime).getTime();
      const startBoundary = startDate ? new Date(`${startDate}T00:00:00`).getTime() : Number.NEGATIVE_INFINITY;
      const endBoundary = endDate ? new Date(`${endDate}T23:59:59.999`).getTime() : Number.POSITIVE_INFINITY;
      const matchesDate = startTime >= startBoundary && startTime <= endBoundary;

      return matchesSearch && matchesStatus && matchesDate;
    });
  }, [records, search, statusFilter, startDate, endDate]);

  const totalHours = useMemo(
    () => (filtered.reduce((sum, item) => sum + item.durationMinutes, 0) / 60).toFixed(1),
    [filtered]
  );

  const allStatuses = useMemo(() => {
    const statuses = new Set(records.map((item) => item.shift.status));
    return Array.from(statuses);
  }, [records]);

  return (
    <div className="min-h-screen bg-gray-100 text-slate-900">
      <UrsafeAppHeader
        eyebrow="Safety Intelligence"
        title="Shift History & Timelines"
        subtitle="Review every shift, check-in, and emergency in one place."
        accent="emerald"
        actions={<HeaderActionButton label="Refresh" icon="R" tone="primary" onClick={() => void load()} />}
        meta={`Signed in as ${currentUser?.fullName ?? "Unknown User"}`}
      />

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        {error ? <ErrorBanner message={error} /> : null}

        <section className="grid gap-4 md:grid-cols-4">
          <SummaryCard title="Shifts" value={String(filtered.length)} />
          <SummaryCard title="Hours Covered" value={`${totalHours}h`} />
          <SummaryCard title="Emergencies" value={String(filtered.reduce((sum, item) => sum + item.emergencies.length, 0))} />
          <SummaryCard title="Check-ins" value={String(filtered.reduce((sum, item) => sum + item.checkIns.length, 0))} />
        </section>

        <SectionCard title="History Filters" description="Search and slice by status and date range.">
          <div className="grid gap-4 md:grid-cols-4">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search employee, client, address"
              className="rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm"
            />
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm"
            >
              <option value="all">All statuses</option>
              {allStatuses.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
            <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} className="rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm" />
            <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} className="rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm" />
          </div>
        </SectionCard>

        <SectionCard title="Shift Timelines" description="Session history with check-ins, emergencies, and shift duration.">
          {loading ? <p className="text-sm text-slate-500">Loading shift history...</p> : null}
          {!loading && filtered.length === 0 ? (
            <EmptyState title="No shift history found" description="Matching shifts will appear here once URSafe records them." />
          ) : null}

          <div className="space-y-5">
            {filtered.map((entry) => {
              const expanded = expandedShiftId === entry.shift.id;
              const employeeName = resolveEmployeeName(entry.shift, entry.employee);
              return (
                <article key={entry.shift.id} className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 pb-3">
                    <div>
                      <p className="text-xs uppercase tracking-[0.25em] text-slate-500">Shift {entry.shift.id.slice(-6)}</p>
                      <h3 className="text-lg font-semibold text-slate-900">{employeeName}</h3>
                      <p className="text-sm text-slate-600">{entry.shift.clientName || "No client recorded"}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-gray-300 px-3 py-1 text-xs font-semibold uppercase text-slate-600">{entry.shift.status}</span>
                      <span className="rounded-full border border-gray-300 px-3 py-1 text-xs font-semibold text-slate-600">{entry.durationMinutes} min</span>
                      <button
                        type="button"
                        onClick={() => setExpandedShiftId(expanded ? null : entry.shift.id)}
                        className="rounded-full border border-blue-300 px-3 py-1 text-xs font-semibold text-blue-700"
                      >
                        {expanded ? "Hide Timeline" : "View Timeline"}
                      </button>
                    </div>
                  </div>

                  {expanded ? (
                    <div className="mt-4 space-y-3">
                      {entry.timeline.map((event, index) => (
                        <div key={`${event.id}-${event.timestamp}-${index}`} className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                          <div className="flex items-center justify-between gap-3">
                            <p className="font-semibold text-slate-900">{event.label}</p>
                            <p className="text-xs text-slate-500">{new Date(event.timestamp).toLocaleString()}</p>
                          </div>
                          <p className="mt-1 text-sm text-slate-700">{event.details}</p>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        </SectionCard>
      </main>
    </div>
  );
}

function SummaryCard(props: { title: string; value: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{props.title}</p>
      <p className="mt-1 text-3xl font-black text-slate-900">{props.value}</p>
    </div>
  );
}