'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import AppHeader, { HeaderActionButton, HeaderToggleButton } from '@/components/AppHeader';
import { ActiveUserSession, User, UserRole } from '@/types';

const ActiveUsersMap = dynamic(() => import('@/components/ActiveUsersMap'), { ssr: false });

type EnrichedSession = ActiveUserSession & {
  user?: User;
  minutesSinceLastSeen: number;
  minutesOnline: number;
  isFlagged: boolean;
  isIdle: boolean;
  isDisconnected: boolean;
  connectionStatus: ConnectionStatus;
};

const REFRESH_INTERVAL_MS = 10000;
const LOST_CONNECTION_THRESHOLD_MINUTES = 5;

type ConnectionStatus = 'online' | 'offline' | 'unknown';

const parseConnectionStatus = (notes?: ActiveUserSession['notes']): ConnectionStatus => {
  if (!notes || typeof notes !== 'string') {
    return 'unknown';
  }
  try {
    const parsed = JSON.parse(notes);
    const status = parsed?.connectionStatus;
    if (status === 'online' || status === 'offline' || status === 'unknown') {
      return status;
    }
  } catch (error) {
    return 'unknown';
  }
  return 'unknown';
};

const dedupeSessionsByUser = (activeSessions: ActiveUserSession[]) => {
  const byUser = new Map<string, ActiveUserSession>();
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

export default function ActiveUsersPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [sessions, setSessions] = useState<EnrichedSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [hoveredUserId, setHoveredUserId] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [clearingUserId, setClearingUserId] = useState<string | null>(null);
  const { theme } = useTheme();
  const isDarkTheme = theme === 'dark';
  const isSuperAdmin = user?.role === UserRole.SUPER_ADMIN;
  const isAdmin = user?.role === UserRole.ADMIN || isSuperAdmin;
  const isManager = user?.role === UserRole.MANAGER;

  const pageBackgroundClass = isDarkTheme
    ? 'bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 text-white'
    : 'bg-gray-50 text-slate-900';
  const neutralPanelClass = isDarkTheme
    ? 'rounded-3xl border border-white/10 bg-slate-900/60 shadow-2xl shadow-slate-900/40'
    : 'rounded-3xl border border-gray-200 bg-white shadow-lg';
  const alertPanelClass = isDarkTheme
    ? 'rounded-3xl border border-white/10 bg-slate-900/60 shadow-2xl shadow-rose-900/30'
    : 'rounded-3xl border border-rose-200 bg-white shadow-lg';
  const mutedTextClass = isDarkTheme ? 'text-slate-300' : 'text-slate-500';
  const subtleTextClass = isDarkTheme ? 'text-slate-400' : 'text-slate-500';
  const tableDivideClass = isDarkTheme ? 'divide-white/5' : 'divide-gray-200';
  const tableTextClass = isDarkTheme ? 'text-slate-100' : 'text-slate-700';
  const tableHeadTextClass = isDarkTheme ? 'text-slate-300' : 'text-slate-500';
  const tableRowHoverClass = isDarkTheme ? 'hover:bg-white/5' : 'hover:bg-slate-50';

  const fetchSessions = useCallback(async () => {
    try {
      setLoading(true);
      const requestInit: RequestInit = {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
      };
      const [usersRes, sessionsRes] = await Promise.all([
        fetch('/api/users', requestInit),
        fetch('/api/active-users?includeStale=true', requestInit),
      ]);
      if (!usersRes.ok || !sessionsRes.ok) {
        throw new Error('Failed to load active user data');
      }
      const [users, activeSessions] = await Promise.all([
        usersRes.json() as Promise<User[]>,
        sessionsRes.json() as Promise<ActiveUserSession[]>,
      ]);
      const scopedUsers = users.filter((candidate) => candidate.isActive);

      const scopedSessions = dedupeSessionsByUser(isSuperAdmin
        ? activeSessions
        : activeSessions.filter((session) => scopedUsers.some((candidate) => candidate.id === session.userId)));

      const enriched: EnrichedSession[] = scopedSessions.map((session) => {
        const sessionUser = scopedUsers.find((candidate) => candidate.id === session.userId);
        const minutesSinceLastSeen = Math.max(
          0,
          Math.round((Date.now() - new Date(session.lastSeenAt).getTime()) / 60000),
        );
        const minutesOnline = Math.max(
          0,
          Math.round((new Date(session.lastSeenAt).getTime() - new Date(session.startedAt).getTime()) / 60000),
        );
        const connectionStatus = parseConnectionStatus(session.notes);
        const isDisconnected =
          minutesSinceLastSeen >= LOST_CONNECTION_THRESHOLD_MINUTES || connectionStatus === 'offline';
        const isIdle =
          !isDisconnected &&
          (session.lastKnownActivity === 'background' || session.status === 'idle');
        const derivedStatus: ActiveUserSession['status'] = isDisconnected
          ? 'stale'
          : isIdle
            ? 'idle'
            : 'online';
        const isFlagged = isDisconnected || !session.location;
        return {
          ...session,
          status: derivedStatus,
          user: sessionUser,
          minutesSinceLastSeen,
          minutesOnline,
          isFlagged,
          isIdle,
          isDisconnected,
          connectionStatus,
        };
      });

      setSessions(enriched);
      setLastUpdated(new Date());
    } catch (error) {
      console.error('Error fetching active sessions:', error);
    } finally {
      setLoading(false);
    }
  }, [isSuperAdmin]);

  useEffect(() => {
    if (authLoading) return;
    if (!user || (!isAdmin && !isManager)) {
      router.push('/login');
      return;
    }
    fetchSessions();
  }, [authLoading, fetchSessions, isAdmin, isManager, router, user]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      fetchSessions();
    }, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchSessions]);

  const handleForceRemove = async (targetUserId: string) => {
    if (!targetUserId) return;
    try {
      setClearingUserId(targetUserId);
      const response = await fetch(`/api/active-users/user/${targetUserId}`, {
        method: 'DELETE',
      });
      if (response.status === 404) {
        console.info('Session already removed for user', targetUserId);
      } else if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'Failed to clear active session');
      }
      await fetchSessions();
    } catch (error) {
      console.error('Unable to remove active session manually:', error);
      alert('Could not clear this session. Please try again.');
    } finally {
      setClearingUserId(null);
    }
  };

  const metrics = useMemo(() => {
    const total = sessions.length;
    const online = sessions.filter((session) => session.status === 'online').length;
    const idle = sessions.filter((session) => session.status === 'idle').length;
    const flagged = sessions.filter((session) => session.isFlagged).length;
    const avgMinutes =
      total > 0
        ? Math.round(sessions.reduce((sum, session) => sum + session.minutesSinceLastSeen, 0) / total)
        : 0;
    return { total, online, idle, flagged, avgMinutes };
  }, [sessions]);

  const flaggedSessions = useMemo(
    () => sessions.filter((session) => session.isFlagged),
    [sessions],
  );

  const statusTheme = (sessionStatus: ActiveUserSession['status']) =>
    getStatusTheme(sessionStatus, isDarkTheme);

  return (
    <div className={`min-h-screen ${pageBackgroundClass}`}>
      <AppHeader
        eyebrow="Active Presence Intel"
        title="Active Users"
        subtitle="Monitor every employee who is currently logged into the mobile app even if they have not started a shift."
        accent="emerald"
        actions={(
          <>
            <HeaderToggleButton
              label="Auto refresh"
              iconOn="🔁"
              iconOff="⏸"
              pressed={autoRefresh}
              onToggle={() => setAutoRefresh((prev) => !prev)}
              tone="primary"
            />
            <HeaderActionButton
              label={loading ? 'Refreshing...' : 'Refresh now'}
              icon="🔄"
              tone="primary"
              onClick={fetchSessions}
              disabled={loading}
            />
          </>
        )}
        meta={`Signed in as ${user?.firstName ?? ''} ${user?.lastName ?? ''}`}
      />

      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-8">
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard label="Total Active" value={metrics.total} accent="emerald" helper="Currently tracked" isDark={isDarkTheme} />
          <MetricCard label="Online" value={metrics.online} accent="sky" helper="Signed-in sessions" isDark={isDarkTheme} />
          <MetricCard label="Idle" value={metrics.idle} accent="amber" helper="Background mode" isDark={isDarkTheme} />
          <MetricCard
            label="Flags"
            value={metrics.flagged}
            accent="rose"
            helper={metrics.avgMinutes > 0 ? `Avg ping ${metrics.avgMinutes}m` : 'Fully responsive'}
            isDark={isDarkTheme}
          />
        </section>

        <section className="grid gap-6 lg:grid-cols-[2fr,1fr]">
          <div className={`${neutralPanelClass} p-4`}>
            <div className={`flex items-center justify-between border-b pb-4 ${isDarkTheme ? 'border-white/10' : 'border-gray-200'}`}>
              <div>
                <p className={`text-xs uppercase tracking-[0.4em] ${isDarkTheme ? 'text-emerald-200' : 'text-emerald-600'}`}>Live Map</p>
                <h2 className={`text-xl font-bold ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>Real-time locations</h2>
                <p className={`text-sm ${mutedTextClass}`}>
                  Hover over any dot to reveal who is moving, where they are, and when they were last seen.
                </p>
              </div>
              <div className={`text-right text-xs ${subtleTextClass}`}>
                <p>Updated {lastUpdated ? lastUpdated.toLocaleTimeString() : '--'}</p>
                <p>{loading ? 'Syncing...' : 'Fresh telemetry'}</p>
              </div>
            </div>
            <div className={`mt-4 h-[420px] overflow-hidden rounded-2xl border ${isDarkTheme ? 'border-white/5' : 'border-gray-200'}`}>
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
                <p className={`text-xs uppercase tracking-[0.4em] ${isDarkTheme ? 'text-rose-200' : 'text-rose-600'}`}>Watchlist</p>
                <h2 className={`text-xl font-bold ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>Potential issues</h2>
              </div>
              <span className={`rounded-full px-3 py-1 text-sm font-semibold ${isDarkTheme ? 'bg-rose-500/20 text-rose-100' : 'bg-rose-100 text-rose-700'}`}>
                {flaggedSessions.length} flagged
              </span>
            </div>
            <div className="mt-4 space-y-3">
              {flaggedSessions.length === 0 && (
                <p className={`rounded-2xl border px-4 py-6 text-sm ${mutedTextClass} ${isDarkTheme ? 'border-white/5 bg-white/5' : 'border-rose-100 bg-rose-50'}`}>
                  Everyone looks responsive. Alerts will populate here if anyone goes dark or stops sharing GPS.
                </p>
              )}
              {flaggedSessions.map((session) => (
                <button
                  key={session.id}
                  type="button"
                  onMouseEnter={() => setHoveredUserId(session.userId)}
                  onMouseLeave={() => setHoveredUserId(null)}
                  onClick={() => setHoveredUserId(session.userId)}
                  className={`w-full rounded-2xl border px-4 py-3 text-left text-sm transition ${
                    isDarkTheme
                      ? 'border-rose-400/50 bg-rose-500/10 text-rose-50 hover:border-rose-200 hover:bg-rose-500/20'
                      : 'border-rose-200 bg-rose-50 text-rose-900 hover:border-rose-300 hover:bg-rose-100'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold">
                        {session.user?.firstName} {session.user?.lastName}
                      </p>
                      <p className={`text-xs ${isDarkTheme ? 'text-rose-100' : 'text-rose-600'}`}>
                        {session.isDisconnected
                          ? `Lost connection - ${session.minutesSinceLastSeen}m since last ping`
                          : `${session.minutesSinceLastSeen}m since last ping - ${session.status.toUpperCase()}`}
                      </p>
                      {session.location && (
                        <div
                          className={`mt-2 inline-flex flex-wrap items-center gap-2 text-[11px] ${
                            isDarkTheme ? 'text-rose-100' : 'text-rose-700'
                          }`}
                        >
                          <span
                            className={`rounded-full px-2 py-0.5 font-semibold uppercase tracking-wide ${
                              isDarkTheme
                                ? 'bg-white/15 text-white'
                                : 'bg-white text-rose-700'
                            }`}
                          >
                            GPS
                          </span>
                          <span className="font-mono">
                            {session.location.address ||
                              `${session.location.latitude.toFixed(4)}, ${session.location.longitude.toFixed(4)}`}
                          </span>
                          {typeof session.location.accuracy === 'number' && (
                            <span className="opacity-80">+/-{Math.round(session.location.accuracy)}m</span>
                          )}
                          {session.isDisconnected && (
                            <span
                              className={`rounded-full px-2 py-0.5 font-semibold uppercase tracking-wide ${
                                isDarkTheme ? 'bg-rose-500/30 text-rose-100' : 'bg-rose-200 text-rose-800'
                              }`}
                            >
                              Lost connection
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    <span className={`text-xs uppercase tracking-wide ${isDarkTheme ? 'text-rose-200' : 'text-rose-600'}`}>
                      {session.isDisconnected ? 'Lost connection' : session.location ? 'GPS active' : 'No GPS'}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className={`${neutralPanelClass} p-6`}>
          <div className={`flex flex-col gap-3 border-b pb-4 md:flex-row md:items-center md:justify-between ${isDarkTheme ? 'border-white/10' : 'border-gray-200'}`}>
            <div>
              <p className={`text-xs uppercase tracking-[0.45em] ${mutedTextClass}`}>Roster</p>
              <h2 className={`text-xl font-semibold ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>Detailed presence log</h2>
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
                {sessions.length === 0 && !loading && (
                  <tr>
                    <td colSpan={7} className={`py-6 text-center ${mutedTextClass}`}>
                      No one is currently logged in. As soon as employees open the app, their live details will populate here.
                    </td>
                  </tr>
                )}
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
                      className={`transition ${tableRowHoverClass} ${
                        session.isFlagged
                          ? isDarkTheme
                            ? 'bg-rose-500/5'
                            : 'bg-rose-50'
                          : ''
                      }`}
                      onMouseEnter={() => setHoveredUserId(session.userId)}
                      onMouseLeave={() => setHoveredUserId(null)}
                    >
                      <td className="py-3 pr-4 font-semibold">
                        <div className="flex flex-col">
                          <span className="flex flex-wrap items-center gap-2">
                            <span>
                              {session.user?.firstName} {session.user?.lastName}
                            </span>
                            {session.userId === user?.id && (
                              <span
                                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                                  isDarkTheme ? 'bg-white/15 text-white' : 'bg-emerald-100 text-emerald-700'
                                }`}
                              >
                                Current user
                              </span>
                            )}
                          </span>
                          <span className={`text-xs font-normal ${mutedTextClass}`}>
                            {session.user?.department}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 pr-4">
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase ${statusBadge.bg} ${statusBadge.text}`}>
                          {session.status}
                        </span>
                      </td>
                      <td className="py-3 pr-4">
                        <p className="font-semibold">{session.deviceName || 'Unknown device'}</p>
                        <p className={`text-xs ${subtleTextClass}`}>{session.platform || '--'}</p>
                      </td>
                      <td className="py-3 pr-4">
                        <p className="font-semibold">{lastSeenLabel}</p>
                        <p className={`text-xs ${subtleTextClass}`}>Last ping {session.minutesSinceLastSeen}m ago</p>
                      </td>
                      <td className="py-3 pr-4">
                        <p className={`font-semibold ${isDarkTheme ? 'text-emerald-100' : 'text-emerald-700'}`}>
                          {locationLabel || 'No GPS'}
                        </p>
                        {session.location && (
                          <p className={`text-xs ${subtleTextClass}`}>
                            +/-{session.location.accuracy ?? 0}m accuracy
                          </p>
                        )}
                        {session.isDisconnected && (
                          <p className={`text-xs ${isDarkTheme ? 'text-rose-200' : 'text-rose-600'}`}>Lost connection</p>
                        )}
                      </td>
                      <td className="py-3 pr-4">
                        <p className="font-semibold">{startedLabel}</p>
                        <p className={`text-xs ${subtleTextClass}`}>on for {session.minutesOnline} minutes</p>
                      </td>
                      <td className="py-3 pr-4 text-right space-y-2">
                        {session.location ? (
                          <a
                            href={`https://maps.google.com/?q=${session.location.latitude},${session.location.longitude}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`block text-sm font-semibold ${
                              isDarkTheme
                                ? 'text-emerald-200 hover:text-emerald-100'
                                : 'text-emerald-600 hover:text-emerald-500'
                            }`}
                          >
                            Open map -&gt;
                          </a>
                        ) : (
                          <span className={`block text-xs ${mutedTextClass}`}>Awaiting ping</span>
                        )}
                        <button
                          type="button"
                          onClick={() => handleForceRemove(session.userId)}
                          disabled={clearingUserId === session.userId}
                          className={`w-full rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide ${
                            isDarkTheme
                              ? 'border-white/15 text-slate-200 hover:border-rose-400 hover:text-rose-200'
                              : 'border-gray-300 text-slate-700 hover:border-rose-300 hover:text-rose-600'
                          } ${clearingUserId === session.userId ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                          {clearingUserId === session.userId ? 'Clearing...' : 'Force clear'}
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

type MetricAccent = 'emerald' | 'sky' | 'amber' | 'rose';

function MetricCard({
  label,
  value,
  accent,
  helper,
  isDark,
}: {
  label: string;
  value: number;
  accent: MetricAccent;
  helper: string;
  isDark: boolean;
}) {
  const accentClasses: Record<MetricAccent, {
    borderDark: string;
    borderLight: string;
    textDark: string;
    textLight: string;
  }> = {
    emerald: {
      borderDark: 'border-emerald-400/40',
      borderLight: 'border-emerald-200/70',
      textDark: 'text-emerald-200',
      textLight: 'text-emerald-600',
    },
    sky: {
      borderDark: 'border-sky-400/40',
      borderLight: 'border-sky-200/70',
      textDark: 'text-sky-200',
      textLight: 'text-sky-600',
    },
    amber: {
      borderDark: 'border-amber-400/40',
      borderLight: 'border-amber-200/70',
      textDark: 'text-amber-200',
      textLight: 'text-amber-600',
    },
    rose: {
      borderDark: 'border-rose-400/40',
      borderLight: 'border-rose-200/70',
      textDark: 'text-rose-200',
      textLight: 'text-rose-600',
    },
  };

  const accentTokens = accentClasses[accent];
  const borderClass = isDark ? accentTokens.borderDark : accentTokens.borderLight;
  const valueTextClass = isDark ? accentTokens.textDark : accentTokens.textLight;
  const surfaceClass = isDark ? 'bg-slate-900/60 shadow-2xl' : 'bg-white shadow-lg';
  const labelTextClass = isDark ? 'text-white/70' : 'text-slate-500';
  const helperTextClass = isDark ? 'text-slate-300' : 'text-slate-500';

  return (
    <div className={`rounded-3xl border ${borderClass} ${surfaceClass} p-4`}>
      <p className={`text-xs uppercase tracking-[0.35em] ${labelTextClass}`}>{label}</p>
      <p className={`mt-2 text-4xl font-black ${valueTextClass}`}>{value}</p>
      <p className={`text-xs ${helperTextClass}`}>{helper}</p>
    </div>
  );
}

function getStatusTheme(status: ActiveUserSession['status'], isDark: boolean) {
  switch (status) {
    case 'online':
      return {
        bg: isDark ? 'bg-emerald-500/20' : 'bg-emerald-100',
        text: isDark ? 'text-emerald-200' : 'text-emerald-700',
      };
    case 'idle':
      return {
        bg: isDark ? 'bg-amber-500/20' : 'bg-amber-100',
        text: isDark ? 'text-amber-200' : 'text-amber-700',
      };
    case 'stale':
    default:
      return {
        bg: isDark ? 'bg-slate-500/20' : 'bg-slate-200',
        text: isDark ? 'text-slate-200' : 'text-slate-700',
      };
  }
}
