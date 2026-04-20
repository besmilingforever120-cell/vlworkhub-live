"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { SessionUser, UrsafeActiveSession, UrsafeUser } from "@vlworkhub/types";
import UrsafeAppHeader, { HeaderActionButton } from "./ursafe-app-header";
import {
  clearActiveSession,
  getActiveSessions,
  getApiErrorMessage,
  getCurrentUser,
  getUrsafeUsers
} from "../lib/ursafe-client";

const ActiveUsersMap = dynamic(() => import("./active-users-map"), { ssr: false });

type DecoratedSession = UrsafeActiveSession & {
  user?: UrsafeUser;
  minutesSinceLastSeen: number;
  minutesOnline: number;
  isFlagged: boolean;
  isIdle: boolean;
  isDisconnected: boolean;
  connectionStatus: ConnectionStatus;
  status: ActivePresenceStatus;
};

const REFRESH_INTERVAL_MS = 10000;
const LOST_CONNECTION_THRESHOLD_MINUTES = 5;

type ConnectionStatus = "online" | "offline" | "unknown";
type ActivePresenceStatus = "online" | "idle" | "stale";

function resolveRoleState(user: SessionUser | null) {
  const normalizedRoles = new Set(
    [user?.role, user?.platformRole, ...(user?.roles ?? [])]
      .filter(Boolean)
      .map((value) => String(value).toUpperCase())
  );

  return {
    isSuperAdmin: normalizedRoles.has("SUPER_ADMIN"),
    isAdmin: normalizedRoles.has("ADMIN") || normalizedRoles.has("SUPER_ADMIN"),
    isManager: normalizedRoles.has("MANAGER")
  };
}

const parseConnectionStatus = (notes?: UrsafeActiveSession["notes"]): ConnectionStatus => {
  if (!notes || typeof notes !== "string") {
    return "unknown";
  }

  try {
    const parsed = JSON.parse(notes);
    const status = parsed?.connectionStatus;
    if (status === "online" || status === "offline" || status === "unknown") {
      return status;
    }
  } catch {
    return "unknown";
  }

  return "unknown";
};

const dedupeSessionsByUser = (activeSessions: UrsafeActiveSession[]) => {
  const byUser = new Map<string, UrsafeActiveSession>();

  activeSessions.forEach((session) => {
    const existing = byUser.get(session.userId);
    if (!existing) {
      byUser.set(session.userId, session);
      return;
    }

    const existingTime = new Date(existing.lastSeenAt).getTime();
    const candidateTime = new Date(session.lastSeenAt).getTime();

    if (candidateTime > existingTime) {
      byUser.set(session.userId, session);
      return;
    }

    if (candidateTime === existingTime) {
      const existingStarted = new Date(existing.startedAt).getTime();
      const candidateStarted = new Date(session.startedAt).getTime();
      if (candidateStarted > existingStarted || (!existing.location && session.location)) {
        byUser.set(session.userId, session);
      }
    }
  });

  return Array.from(byUser.values());
};

function ShellHero(props: {
  eyebrow: string;
  title: string;
  description: string;
  badge?: string;
}) {
  return (
    <section className="rounded-[2rem] border border-white/10 bg-gradient-to-br from-white/8 via-white/4 to-cyan-400/10 p-8">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.35em] text-cyan-300">{props.eyebrow}</p>
          <h1 className="mt-4 text-3xl font-semibold text-white">{props.title}</h1>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300">{props.description}</p>
        </div>
        {props.badge ? (
          <div className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.25em] text-emerald-200">
            {props.badge}
          </div>
        ) : null}
      </div>
    </section>
  );
}


function SectionCard(props: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[1.75rem] border border-white/10 bg-white/5 p-6">
      <div className="mb-5">
        <h2 className="text-xl font-semibold text-white">{props.title}</h2>
        {props.description ? <p className="mt-2 text-sm text-slate-300">{props.description}</p> : null}
      </div>
      {props.children}
    </section>
  );
}

function EmptyState(props: { title: string; description: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-white/15 bg-slate-950/40 px-6 py-10 text-center">
      <p className="text-lg font-semibold text-white">{props.title}</p>
      <p className="mt-2 text-sm text-slate-400">{props.description}</p>
    </div>
  );
}

function getMinutesSince(date: string) {
  const timestamp = new Date(date).getTime();
  if (!Number.isFinite(timestamp)) return 0;
  return Math.max(0, Math.round((Date.now() - timestamp) / 60000));
}

export default function ActiveUsersClient() {
  const [currentUser, setCurrentUser] = useState<SessionUser | null>(null);
  const [sessions, setSessions] = useState<DecoratedSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [hoveredUserId, setHoveredUserId] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [clearingUserId, setClearingUserId] = useState<string | null>(null);

  const { isSuperAdmin, isAdmin, isManager } = useMemo(() => resolveRoleState(currentUser), [currentUser]);

  const pageBackgroundClass = "bg-gray-50 text-slate-900";
  const neutralPanelClass = "rounded-3xl border border-gray-200 bg-white shadow-lg";
  const alertPanelClass = "rounded-3xl border border-rose-200 bg-white shadow-lg";
  const mutedTextClass = "text-slate-500";
  const subtleTextClass = "text-slate-500";
  const tableDivideClass = "divide-gray-200";
  const tableTextClass = "text-slate-700";
  const tableHeadTextClass = "text-slate-500";
  const tableRowHoverClass = "hover:bg-slate-50";

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [sessionUser, users, activeSessions] = await Promise.all([
        getCurrentUser(),
        getUrsafeUsers(),
        getActiveSessions()
      ]);

      const scopedUsers = users.filter((candidate) => candidate.isActive);
      const scopedSessions = dedupeSessionsByUser(
        isSuperAdmin
          ? activeSessions
          : activeSessions.filter((session) => scopedUsers.some((candidate) => candidate.id === session.userId))
      );

      const decorated: DecoratedSession[] = scopedSessions
        .map((item) => {
          const sessionUser = scopedUsers.find((candidate) => candidate.id === item.userId);
          const minutesSinceLastSeen = Math.max(0, Math.round((Date.now() - new Date(item.lastSeenAt).getTime()) / 60000));
          const minutesOnline = Math.max(0, Math.round((new Date(item.lastSeenAt).getTime() - new Date(item.startedAt).getTime()) / 60000));
          const connectionStatus = parseConnectionStatus(item.notes);
          const isDisconnected =
            minutesSinceLastSeen >= LOST_CONNECTION_THRESHOLD_MINUTES || connectionStatus === "offline";
          const isIdle = !isDisconnected && (item.lastKnownActivity === "background" || item.status === "idle");
          const derivedStatus: ActivePresenceStatus = isDisconnected ? "stale" : isIdle ? "idle" : "online";

          return {
            ...item,
            user: sessionUser,
            minutesSinceLastSeen,
            minutesOnline,
            isFlagged: isDisconnected || !item.location,
            isIdle,
            isDisconnected,
            connectionStatus,
            status: derivedStatus
          };
        })
        .sort((a, b) => a.minutesSinceLastSeen - b.minutesSinceLastSeen);

      setCurrentUser(sessionUser);
      setSessions(decorated);
      setLastUpdated(new Date());
    } catch (loadError) {
      setError(getApiErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, [isSuperAdmin]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = window.setInterval(() => {
      void load();
    }, REFRESH_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [autoRefresh, load]);

  async function handleForceRemove(targetUserId: string) {
    if (!targetUserId) return;

    try {
      setClearingUserId(targetUserId);
      await clearActiveSession(targetUserId);
      await load();
    } catch (removeError) {
      setError(getApiErrorMessage(removeError));
    } finally {
      setClearingUserId(null);
    }
  }

  const metrics = useMemo(() => {
    const total = sessions.length;
    const online = sessions.filter((session) => session.status === "online").length;
    const idle = sessions.filter((session) => session.status === "idle").length;
    const flagged = sessions.filter((session) => session.isFlagged).length;
    const avgMinutes = total > 0 ? Math.round(sessions.reduce((sum, session) => sum + session.minutesSinceLastSeen, 0) / total) : 0;
    return { total, online, idle, flagged, avgMinutes };
  }, [sessions]);

  const flaggedSessions = useMemo(() => sessions.filter((session) => session.isFlagged), [sessions]);

  const statusTheme = (sessionStatus: ActivePresenceStatus) => getStatusTheme(sessionStatus);

  return (
    <div className={`min-h-screen ${pageBackgroundClass}`}>
      <UrsafeAppHeader
        eyebrow="Active Presence Intel"
        title="Active Users"
        subtitle="Monitor every employee currently logged into the mobile app, even before shift start."
        accent="emerald"
        actions={
          <>
            <HeaderActionButton
              label={autoRefresh ? "Auto refresh on" : "Auto refresh off"}
              icon={autoRefresh ? "R" : "P"}
              tone="primary"
              onClick={() => setAutoRefresh((previous) => !previous)}
            />
            <HeaderActionButton label={loading ? "Refreshing..." : "Refresh now"} icon="R" tone="primary" onClick={() => void load()} disabled={loading} />
          </>
        }
        meta={`Signed in as ${currentUser?.fullName ?? "Unknown User"}`}
      />

      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-8">
        {error ? <ErrorBanner message={error} /> : null}

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard label="Total Active" value={metrics.total} accent="emerald" helper="Currently tracked" />
          <MetricCard label="Online" value={metrics.online} accent="sky" helper="Signed-in sessions" />
          <MetricCard label="Idle" value={metrics.idle} accent="amber" helper="Background mode" />
          <MetricCard label="Flags" value={metrics.flagged} accent="rose" helper={metrics.avgMinutes > 0 ? `Avg ping ${metrics.avgMinutes}m` : "Fully responsive"} />
        </section>

        <section className="grid gap-6 lg:grid-cols-[2fr,1fr]">
          <div className={`${neutralPanelClass} p-4`}>
            <div className="flex items-center justify-between border-b border-gray-200 pb-4">
              <div>
                <p className="text-xs uppercase tracking-[0.4em] text-emerald-600">Live Map</p>
                <h2 className="text-xl font-bold text-slate-900">Real-time locations</h2>
                <p className={`text-sm ${mutedTextClass}`}>
                  Hover over markers to see who is moving, where they are, and when they were last seen.
                </p>
              </div>
              <div className={`text-right text-xs ${subtleTextClass}`}>
                <p>Updated {lastUpdated ? lastUpdated.toLocaleTimeString() : "--"}</p>
                <p>{loading ? "Syncing..." : "Fresh telemetry"}</p>
              </div>
            </div>
            <div className="mt-4 h-[420px] overflow-hidden rounded-2xl border border-gray-200">
              <ActiveUsersMap
                sessions={sessions}
                highlightedUserId={hoveredUserId}
                onMarkerEnter={(session) => setHoveredUserId(session.userId)}
                onMarkerLeave={() => setHoveredUserId(null)}
                onMarkerClick={(session) => setHoveredUserId(session.userId)}
              />
            </div>
          </div>

          <div className={`${alertPanelClass} p-4`}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.4em] text-rose-600">Watchlist</p>
                <h2 className="text-xl font-bold text-slate-900">Potential issues</h2>
              </div>
              <span className="rounded-full bg-rose-100 px-3 py-1 text-sm font-semibold text-rose-700">
                {flaggedSessions.length} flagged
              </span>
            </div>
            <div className="mt-4 space-y-3">
              {flaggedSessions.length === 0 ? (
                <p className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-6 text-sm text-slate-500">
                  Everyone looks responsive. Alerts will appear here if anyone goes dark or stops sharing GPS.
                </p>
              ) : null}
              {flaggedSessions.map((session) => (
                <button
                  key={session.id}
                  type="button"
                  onMouseEnter={() => setHoveredUserId(session.userId)}
                  onMouseLeave={() => setHoveredUserId(null)}
                  onClick={() => setHoveredUserId(session.userId)}
                  className="w-full rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-left text-sm text-rose-900 transition hover:border-rose-300 hover:bg-rose-100"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold">
                        {session.user?.firstName} {session.user?.lastName}
                      </p>
                      <p className="text-xs text-rose-600">
                        {session.isDisconnected
                          ? `Lost connection - ${session.minutesSinceLastSeen}m since last ping`
                          : `${session.minutesSinceLastSeen}m since last ping - ${session.status.toUpperCase()}`}
                      </p>
                      {session.location ? (
                        <div className="mt-2 inline-flex flex-wrap items-center gap-2 text-[11px] text-rose-700">
                          <span className="rounded-full bg-white px-2 py-0.5 font-semibold uppercase tracking-wide text-rose-700">GPS</span>
                          <span className="font-mono">
                            {session.location.address || `${session.location.latitude.toFixed(4)}, ${session.location.longitude.toFixed(4)}`}
                          </span>
                          {typeof session.location.accuracy === "number" ? (
                            <span className="opacity-80">+/-{Math.round(session.location.accuracy)}m</span>
                          ) : null}
                          {session.isDisconnected ? (
                            <span className="rounded-full bg-rose-200 px-2 py-0.5 font-semibold uppercase tracking-wide text-rose-800">Lost connection</span>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                    <span className="text-xs uppercase tracking-wide text-rose-600">
                      {session.isDisconnected ? "Lost connection" : session.location ? "GPS active" : "No GPS"}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className={`${neutralPanelClass} p-6`}>
          <div className="flex flex-col gap-3 border-b border-gray-200 pb-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className={`text-xs uppercase tracking-[0.45em] ${mutedTextClass}`}>Roster</p>
              <h2 className="text-xl font-semibold text-slate-900">Detailed presence log</h2>
            </div>
            <p className={`text-xs ${mutedTextClass}`}>{sessions.length} users broadcasting now</p>
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className={`min-w-full divide-y text-left text-sm ${tableDivideClass} ${tableTextClass}`}>
              <thead>
                <tr className={`text-xs uppercase tracking-wider ${tableHeadTextClass}`}>
                  <th className="py-3 pr-4">Employee</th>
                  <th className="py-3 pr-4">Status</th>
                  <th className="py-3 pr-4">Device</th>
                  <th className="py-3 pr-4">Last seen</th>
                  <th className="py-3 pr-4">Location</th>
                  <th className="py-3 pr-4">Tracking since</th>
                  <th className="py-3 pr-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className={`divide-y ${tableDivideClass}`}>
                {sessions.length === 0 && !loading ? (
                  <tr>
                    <td colSpan={7} className={`py-6 text-center ${mutedTextClass}`}>
                      No one is currently logged in. As soon as employees open the app, their live details will populate here.
                    </td>
                  </tr>
                ) : null}
                {sessions.map((session) => {
                  const statusBadge = statusTheme(session.status);
                  const lastSeenLabel = new Date(session.lastSeenAt).toLocaleTimeString();
                  const startedLabel = new Date(session.startedAt).toLocaleTimeString();
                  const locationLabel = session.location
                    ? session.location.address || `${session.location.latitude.toFixed(4)}, ${session.location.longitude.toFixed(4)}`
                    : undefined;

                  return (
                    <tr
                      key={session.id}
                      className={`transition ${tableRowHoverClass} ${session.isFlagged ? "bg-rose-50" : ""}`}
                      onMouseEnter={() => setHoveredUserId(session.userId)}
                      onMouseLeave={() => setHoveredUserId(null)}
                    >
                      <td className="py-3 pr-4 font-semibold">
                        <div className="flex flex-col">
                          <span className="flex flex-wrap items-center gap-2">
                            <span>
                              {session.user?.firstName} {session.user?.lastName}
                            </span>
                            {session.userId === currentUser?.id ? (
                              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
                                Current user
                              </span>
                            ) : null}
                          </span>
                          <span className={`text-xs font-normal ${mutedTextClass}`}>{session.user?.department}</span>
                        </div>
                      </td>
                      <td className="py-3 pr-4">
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase ${statusBadge.bg} ${statusBadge.text}`}>
                          {session.status}
                        </span>
                      </td>
                      <td className="py-3 pr-4">
                        <p className="font-semibold">{session.deviceName || "Unknown device"}</p>
                        <p className={`text-xs ${subtleTextClass}`}>{session.platform || "--"}</p>
                      </td>
                      <td className="py-3 pr-4">
                        <p className="font-semibold">{lastSeenLabel}</p>
                        <p className={`text-xs ${subtleTextClass}`}>Last ping {session.minutesSinceLastSeen}m ago</p>
                      </td>
                      <td className="py-3 pr-4">
                        <p className="font-semibold text-emerald-700">{locationLabel || "No GPS"}</p>
                        {session.location ? (
                          <p className={`text-xs ${subtleTextClass}`}>+/-{session.location.accuracy ?? 0}m accuracy</p>
                        ) : null}
                        {session.isDisconnected ? <p className="text-xs text-rose-600">Lost connection</p> : null}
                      </td>
                      <td className="py-3 pr-4">
                        <p className="font-semibold">{startedLabel}</p>
                        <p className={`text-xs ${subtleTextClass}`}>on for {session.minutesOnline} minutes</p>
                      </td>
                      <td className="space-y-2 py-3 pr-4 text-right">
                        {session.location ? (
                          <a
                            href={`https://maps.google.com/?q=${session.location.latitude},${session.location.longitude}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block text-sm font-semibold text-emerald-600 hover:text-emerald-500"
                          >
                            Open map -&gt;
                          </a>
                        ) : (
                          <span className={`block text-xs ${mutedTextClass}`}>Awaiting ping</span>
                        )}
                        <button
                          type="button"
                          onClick={() => void handleForceRemove(session.userId)}
                          disabled={clearingUserId === session.userId}
                          className={`w-full rounded-full border border-gray-300 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-700 hover:border-rose-300 hover:text-rose-600 ${clearingUserId === session.userId ? "cursor-not-allowed opacity-50" : ""}`}
                        >
                          {clearingUserId === session.userId ? "Clearing..." : "Force clear"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}

type MetricAccent = "emerald" | "sky" | "amber" | "rose";

function MetricCard(props: {
  label: string;
  value: number;
  accent: MetricAccent;
  helper: string;
}) {
  const accentClasses: Record<
    MetricAccent,
    {
      borderLight: string;
      textLight: string;
    }
  > = {
    emerald: {
      borderLight: "border-emerald-200/70",
      textLight: "text-emerald-600"
    },
    sky: {
      borderLight: "border-sky-200/70",
      textLight: "text-sky-600"
    },
    amber: {
      borderLight: "border-amber-200/70",
      textLight: "text-amber-600"
    },
    rose: {
      borderLight: "border-rose-200/70",
      textLight: "text-rose-600"
    }
  };

  const accentTokens = accentClasses[props.accent];

  return (
    <div className={`rounded-3xl border ${accentTokens.borderLight} bg-white p-4 shadow-lg`}>
      <p className="text-xs uppercase tracking-[0.35em] text-slate-500">{props.label}</p>
      <p className={`mt-2 text-4xl font-black ${accentTokens.textLight}`}>{props.value}</p>
      <p className="text-xs text-slate-500">{props.helper}</p>
    </div>
  );
}

function ErrorBanner(props: { message: string }) {
  return <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{props.message}</div>;
}

function getStatusTheme(status: ActivePresenceStatus) {
  switch (status) {
    case "online":
      return {
        bg: "bg-emerald-100",
        text: "text-emerald-700"
      };
    case "idle":
      return {
        bg: "bg-amber-100",
        text: "text-amber-700"
      };
    case "stale":
    default:
      return {
        bg: "bg-slate-200",
        text: "text-slate-700"
      };
  }
}