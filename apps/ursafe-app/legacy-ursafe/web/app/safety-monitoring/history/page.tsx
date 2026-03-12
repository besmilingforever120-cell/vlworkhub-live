'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import AppHeader, { HeaderActionButton } from '@/components/AppHeader';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ShiftHistoryEntry, ShiftStatus, UserRole } from '@/types';

const STATUS_OPTIONS: Array<{ label: string; value: 'all' | ShiftStatus }> = [
  { label: 'All statuses', value: 'all' },
  { label: 'Active', value: ShiftStatus.ACTIVE },
  { label: 'Completed', value: ShiftStatus.COMPLETED },
  { label: 'Emergency', value: ShiftStatus.EMERGENCY },
];

const RISK_BADGES: Record<'low' | 'medium' | 'high', string> = {
  low: 'bg-green-50 text-green-700 border-green-200',
  medium: 'bg-amber-50 text-amber-700 border-amber-200',
  high: 'bg-rose-50 text-rose-700 border-rose-200',
};

const RISK_BADGES_DARK: Record<'low' | 'medium' | 'high', string> = {
  low: 'bg-emerald-500/10 text-emerald-200 border-emerald-400/40',
  medium: 'bg-amber-500/10 text-amber-200 border-amber-400/40',
  high: 'bg-rose-500/10 text-rose-200 border-rose-400/40',
};

const EVENT_ICONS: Record<'shift_start' | 'check_in' | 'emergency' | 'shift_end', string> = {
  shift_start: '🟢',
  check_in: '📍',
  emergency: '🚨',
  shift_end: '🏁',
};

const LOCATION_METADATA_KEYS = new Set(['address', 'coordinates', 'mapUrl', 'entered_address']);

const formatMinutes = (minutes: number): string => {
  if (!Number.isFinite(minutes)) {
    return '0:00';
  }
  const safe = Math.max(0, Math.round(minutes));
  const hours = Math.floor(safe / 60);
  const mins = safe % 60;
  return `${hours}:${mins.toString().padStart(2, '0')}`;
};

const toISODate = (offsetDays = 0) => {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return date.toISOString().split('T')[0];
};

export default function ShiftHistoryPage() {
  const { user, loading: authLoading, signOut } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const userIdFilter = searchParams.get('userId');
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState<ShiftHistoryEntry[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | ShiftStatus>('all');
  const [startDate, setStartDate] = useState(() => toISODate(-7));
  const [endDate, setEndDate] = useState(() => toISODate(0));
  const [expanded, setExpanded] = useState<string | null>(null);
  const { theme } = useTheme();
  const isDarkTheme = theme === 'dark';
  const isSuperAdmin = user?.role === UserRole.SUPER_ADMIN;
  const isAdmin = user?.role === UserRole.ADMIN || isSuperAdmin;
  const isManager = user?.role === UserRole.MANAGER;
  const effectiveUserIdFilter = isSuperAdmin ? userIdFilter : null;

  const styles = useMemo(() => {
    const borderColor = isDarkTheme ? 'border-white/10' : 'border-gray-200';
    const subtleBorder = isDarkTheme ? 'border-white/5' : 'border-gray-100';
    return {
      pageBg: isDarkTheme ? 'bg-slate-950 text-slate-100' : 'bg-gray-100 text-gray-900',
      card: `rounded-2xl border ${borderColor} ${isDarkTheme ? 'bg-slate-900/70 shadow-[0_20px_50px_rgba(0,0,0,0.35)]' : 'bg-white shadow-sm'}`,
      raisedCard: `rounded-xl border ${subtleBorder} ${isDarkTheme ? 'bg-slate-900/40' : 'bg-gray-50'}`,
      input: `mt-2 rounded-xl px-4 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-400 ${
        isDarkTheme
          ? 'border border-white/15 bg-slate-900/70 text-slate-100 placeholder:text-slate-400'
          : 'border border-gray-200 bg-white text-gray-900 placeholder:text-gray-400'
      }`,
      label: isDarkTheme ? 'text-slate-200' : 'text-gray-700',
      quickButton: isDarkTheme
        ? 'rounded-full border border-white/10 bg-slate-900/60 px-4 py-1.5 font-semibold text-slate-100 transition hover:border-emerald-400 hover:text-emerald-300'
        : 'rounded-full border border-gray-200 bg-gray-50 px-4 py-1.5 font-semibold text-gray-700 transition hover:border-blue-300 hover:text-blue-600',
      quickButtonDanger: isDarkTheme
        ? 'rounded-full border border-rose-400/40 bg-rose-500/10 px-4 py-1.5 font-semibold text-rose-200 hover:bg-rose-500/20'
        : 'rounded-full border border-gray-200 bg-gray-50 px-4 py-1.5 font-semibold text-rose-600 transition hover:border-rose-300 hover:text-rose-600',
      mutedText: isDarkTheme ? 'text-slate-300' : 'text-gray-500',
      headingText: isDarkTheme ? 'text-white' : 'text-gray-900',
      divider: isDarkTheme ? 'border-white/10' : 'border-gray-100',
      timelineRail: isDarkTheme
        ? 'absolute left-4 top-0 h-full w-0.5 bg-gradient-to-b from-emerald-400/40 via-white/15 to-transparent'
        : 'absolute left-4 top-0 h-full w-0.5 bg-gradient-to-b from-blue-200 via-gray-200 to-transparent',
      timelineDot: isDarkTheme
        ? 'border-white/30 bg-slate-950 text-lg text-emerald-300'
        : 'border-gray-200 bg-white text-lg',
      timelineEvent: isDarkTheme
        ? 'rounded-xl border border-white/10 bg-slate-900/50'
        : 'rounded-xl border border-gray-100 bg-gray-50',
      neutralBadge: isDarkTheme
        ? 'rounded-full border border-white/15 px-3 py-1 text-slate-300'
        : 'rounded-full border border-gray-200 px-3 py-1 text-gray-600',
      noResults: isDarkTheme
        ? 'rounded-2xl border border-dashed border-white/15 bg-slate-950/40 p-12 text-center text-slate-300 shadow-inner'
        : 'rounded-2xl border border-dashed border-gray-300 bg-white p-12 text-center text-gray-500 shadow-sm',
      locationChip: isDarkTheme
        ? 'border border-white/15 bg-transparent text-slate-100'
        : 'border border-gray-200 bg-white text-gray-800',
      metadataCard: isDarkTheme
        ? 'border border-white/10 bg-slate-900/40 text-slate-100'
        : 'border border-gray-200 bg-white text-gray-900',
    };
  }, [isDarkTheme]);

  const riskBadges = useMemo(() => (isDarkTheme ? RISK_BADGES_DARK : RISK_BADGES), [isDarkTheme]);

  useEffect(() => {
    if (!authLoading && (!user || (!isAdmin && !isManager))) {
      router.push('/login');
    }
  }, [user, authLoading, router, isAdmin, isManager]);

  const fetchHistory = useCallback(async () => {
    if (!user) {
      return;
    }

    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') {
        params.set('status', statusFilter);
      }
      if (effectiveUserIdFilter) {
        params.set('userId', effectiveUserIdFilter);
        params.set('includeArchived', 'true');
      }
      if (startDate) {
        params.set('startDate', startDate);
      }
      if (endDate) {
        params.set('endDate', endDate);
      }

      if (user.role === 'manager') {
        params.set('managerId', user.id);
      }

      const response = await fetch(`/api/shifts/history${params.size ? `?${params.toString()}` : ''}`);
      if (!response.ok) {
        throw new Error('Failed to load history');
      }
      const payload = (await response.json()) as ShiftHistoryEntry[];
      setHistory(payload);
    } catch (error) {
      console.error('Unable to fetch shift history', error);
    } finally {
      setLoading(false);
    }
  }, [user, statusFilter, startDate, endDate, effectiveUserIdFilter]);

  useEffect(() => {
    if (user) {
      fetchHistory();
    }
  }, [user, statusFilter, startDate, endDate, effectiveUserIdFilter, fetchHistory]);

  const filteredHistory = useMemo(() => {
    if (!search.trim()) {
      return history;
    }
    const needle = search.trim().toLowerCase();
    return history.filter((entry) => {
      const employeeName = `${entry.employee?.firstName ?? ''} ${entry.employee?.lastName ?? ''}`.toLowerCase();
      const individual = (entry.shift.clientName || '').toLowerCase();
      const address = entry.shift.clientAddress?.toLowerCase() || '';
      return (
        employeeName.includes(needle) ||
        individual.includes(needle) ||
        address.includes(needle) ||
        entry.shift.id.toLowerCase().includes(needle)
      );
    });
  }, [history, search]);

  const metrics = useMemo(() => {
    const uniqueEmergencyIds = new Set<string>();
    filteredHistory.forEach((entry) => {
      entry.emergencies.forEach((emergency) => uniqueEmergencyIds.add(emergency.id));
    });
    const totalEmergencies = uniqueEmergencyIds.size;
    const totalHours = filteredHistory.reduce((sum, entry) => sum + entry.durationMinutes, 0) / 60;
    const highRisk = filteredHistory.filter((entry) => entry.riskLevel === 'high').length;
    return {
      totalShifts: filteredHistory.length,
      totalEmergencies,
      totalHours,
      highRisk,
    };
  }, [filteredHistory]);

  const quickRange = (days: number) => {
    setStartDate(toISODate(-days));
    setEndDate(toISODate(0));
  };

  const handleSignOut = async () => {
    await signOut();
    router.push('/login');
  };

  if (authLoading || loading) {
    return (
      <div className={`flex min-h-screen items-center justify-center ${styles.pageBg}`}>
        <div className={`${styles.card} px-6 py-4 text-lg font-semibold`}>Loading shift history…</div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen ${styles.pageBg}`}>
      <AppHeader
        eyebrow="Safety Intelligence"
        title="Shift History & Timelines"
        subtitle="Review every shift, check-in, and emergency in one place."
        accent="emerald"
        actions={(
          <>
            <HeaderActionButton
              label="Refresh"
              icon="🔄"
              tone="primary"
              onClick={fetchHistory}
            />
            <HeaderActionButton
              label="Sign Out"
              icon="🚪"
              tone="danger"
              onClick={handleSignOut}
            />
          </>
        )}
        meta={`Signed in as ${user?.firstName ?? ''} ${user?.lastName ?? ''}`}
      />

      <main className="mx-auto max-w-7xl px-6 py-8 space-y-8">
        {effectiveUserIdFilter && (
          <div className={`${styles.card} px-4 py-3 text-sm`}>
            Viewing shift history for archived user ID: {effectiveUserIdFilter}
          </div>
        )}
        <section className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          <div className={`${styles.card} p-5`}>
            <p className={`text-xs uppercase tracking-widest ${styles.mutedText}`}>Shifts reviewed</p>
            <p className={`mt-2 text-3xl font-black ${styles.headingText}`}>{metrics.totalShifts}</p>
          </div>
          <div className={`${styles.card} p-5`}>
            <p className={`text-xs uppercase tracking-widest ${styles.mutedText}`}>Hours covered</p>
            <p className={`mt-2 text-3xl font-black ${styles.headingText}`}>{metrics.totalHours.toFixed(1)}h</p>
          </div>
          <div className={`${styles.card} p-5`}>
            <p className={`text-xs uppercase tracking-widest ${styles.mutedText}`}>Emergency alerts</p>
            <p className="mt-2 text-3xl font-black text-rose-500">{metrics.totalEmergencies}</p>
          </div>
          <div className={`${styles.card} p-5`}>
            <p className={`text-xs uppercase tracking-widest ${styles.mutedText}`}>High-risk shifts</p>
            <p className="mt-2 text-3xl font-black text-amber-500">{metrics.highRisk}</p>
          </div>
        </section>

        <section className={`${styles.card} p-6`}>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
            <label className={`flex flex-col text-sm font-medium ${styles.label}`}>
              Search employee or individual
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="e.g. Angela or Individual 1"
                className={styles.input}
              />
            </label>

            <label className={`flex flex-col text-sm font-medium ${styles.label}`}>
              Status
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as 'all' | ShiftStatus)}
                className={styles.input}
              >
                {STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className={`flex flex-col text-sm font-medium ${styles.label}`}>
              Start date
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className={styles.input}
              />
            </label>

            <label className={`flex flex-col text-sm font-medium ${styles.label}`}>
              End date
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className={styles.input}
              />
            </label>
          </div>

          <div className={`mt-4 flex flex-wrap gap-3 text-xs font-semibold ${styles.mutedText}`}>
            <button
              onClick={() => quickRange(7)}
              className={styles.quickButton}
            >
              Last 7 days
            </button>
            <button
              onClick={() => quickRange(30)}
              className={styles.quickButton}
            >
              Last 30 days
            </button>
            <button
              onClick={() => {
                setStartDate('');
                setEndDate('');
              }}
              className={styles.quickButtonDanger}
            >
              Clear dates
            </button>
          </div>
        </section>

        <section className="space-y-6">
          {filteredHistory.length === 0 && (
            <div className={styles.noResults}>
              No shifts found for the current filters.
            </div>
          )}

          {filteredHistory.map((entry) => {
            const isExpanded = expanded === entry.shift.id;
            return (
              <article key={entry.shift.id} className={`${styles.card} p-6`}>
                <div className={`flex flex-wrap items-center justify-between gap-4 border-b ${styles.divider} pb-4`}>
                  <div>
                    <p className={`text-xs uppercase tracking-[0.3em] ${styles.mutedText}`}>
                      Shift {entry.shift.id.slice(-6)}
                    </p>
                    <h2 className={`text-2xl font-bold ${styles.headingText}`}>
                      {entry.employee ? `${entry.employee.firstName} ${entry.employee.lastName}` : 'Unknown employee'}
                    </h2>
                    <p className={`text-sm ${styles.mutedText}`}>
                      Individual: <span className={`font-semibold ${styles.headingText}`}>{entry.shift.clientName || 'Not recorded'}</span>
                      {entry.shift.clientAddress && <span className={styles.mutedText}> · {entry.shift.clientAddress}</span>}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-sm">
                    <span className={`rounded-full border px-3 py-1 font-semibold ${riskBadges[entry.riskLevel]}`}>
                      Risk: {entry.riskLevel.toUpperCase()}
                    </span>
                    <span className={styles.neutralBadge}>
                      On duty {formatMinutes(entry.durationMinutes)} hrs
                    </span>
                    <span className={styles.neutralBadge}>
                      {entry.checkIns.length} check-in{entry.checkIns.length === 1 ? '' : 's'}
                    </span>
                    <button
                      onClick={() => setExpanded(isExpanded ? null : entry.shift.id)}
                      className={styles.quickButton}
                    >
                      {isExpanded ? 'Hide timeline' : 'View timeline'}
                    </button>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-4 text-sm md:grid-cols-4">
                  <div className={`${styles.raisedCard} p-4`}>
                    <p className={`text-xs uppercase tracking-widest ${styles.mutedText}`}>Started</p>
                    <p className={`mt-1 font-semibold ${styles.headingText}`}>{new Date(entry.shift.startTime).toLocaleString()}</p>
                  </div>
                  <div className={`${styles.raisedCard} p-4`}>
                    <p className={`text-xs uppercase tracking-widest ${styles.mutedText}`}>Ended</p>
                    <p className={`mt-1 font-semibold ${styles.headingText}`}>
                      {entry.shift.endTime ? new Date(entry.shift.endTime).toLocaleString() : 'Still active'}
                    </p>
                  </div>
                  <div className={`${styles.raisedCard} p-4`}>
                    <p className={`text-xs uppercase tracking-widest ${styles.mutedText}`}>Idle time</p>
                    <p className={`mt-1 font-semibold ${styles.headingText}`}>{formatMinutes(entry.totalInactiveMinutes)} hrs</p>
                  </div>
                  <div className={`${styles.raisedCard} p-4`}>
                    <p className={`text-xs uppercase tracking-widest ${styles.mutedText}`}>Emergencies</p>
                    <p className={`mt-1 font-semibold ${styles.headingText}`}>{entry.emergencies.length}</p>
                  </div>
                </div>

                {isExpanded && (
                  <div className={`mt-6 border-t ${styles.divider} pt-6`}>
                    <p className={`mb-4 text-xs font-semibold uppercase tracking-[0.4em] ${styles.mutedText}`}>Timeline</p>
                    <div className="relative">
                      <div className={styles.timelineRail} />
                      <div className="space-y-6">
                        {entry.timeline.map((event) => {
                          const locationAddress = (event.metadata?.address as string | undefined) ?? (event.metadata?.coordinates as string | undefined);
                          const mapUrl = event.metadata?.mapUrl as string | undefined;
                          const enteredAddress = event.metadata?.entered_address as string | undefined;
                          const otherMetadata = event.metadata
                            ? Object.entries(event.metadata).filter(
                                ([key, value]) =>
                                  !LOCATION_METADATA_KEYS.has(key) && value !== undefined && value !== null && value !== '',
                              )
                            : [];

                          return (
                            <div key={`${entry.shift.id}-${event.type}-${event.id}`} className="relative flex gap-4 pl-8">
                              <div className={`absolute left-0 top-1.5 flex h-8 w-8 items-center justify-center rounded-full border ${styles.timelineDot}`}>
                                {EVENT_ICONS[event.type]}
                              </div>
                              <div className={`${styles.timelineEvent} flex-1 p-4`}>
                                <div className={`flex flex-wrap items-center justify-between text-sm ${styles.mutedText}`}>
                                  <span className={`font-semibold ${styles.headingText}`}>{event.label}</span>
                                  <span>{new Date(event.timestamp).toLocaleString()}</span>
                                </div>
                                {event.description && <p className={`mt-2 ${styles.headingText}`}>{event.description}</p>}
                                {(locationAddress || mapUrl || enteredAddress) && (
                                  <div className={`mt-3 flex flex-wrap items-center gap-3 text-xs ${styles.mutedText}`}>
                                    {locationAddress && (
                                      <div className={`rounded-lg px-3 py-1 font-semibold ${styles.locationChip}`}>
                                        {enteredAddress ? `Actual: ${locationAddress}` : locationAddress}
                                      </div>
                                    )}
                                    {enteredAddress && (
                                      <div className={`rounded-lg px-3 py-1 font-semibold ${styles.locationChip}`}>
                                        Entered: {enteredAddress}
                                      </div>
                                    )}
                                    {mapUrl && (
                                      <a
                                        href={mapUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                        className={styles.quickButton}
                                      >
                                        Open in Maps ↗
                                      </a>
                                    )}
                                  </div>
                                )}
                                {otherMetadata.length > 0 && (
                                  <div className={`mt-3 grid grid-cols-2 gap-2 text-xs ${styles.mutedText}`}>
                                    {otherMetadata.map(([key, value]) => (
                                      <div key={`${event.id}-${key}`} className={`rounded px-2 py-1 ${styles.metadataCard}`}>
                                        <span className={`block text-[10px] font-semibold uppercase tracking-widest ${styles.mutedText}`}>
                                          {key}
                                        </span>
                                        <p className={`font-semibold ${styles.headingText}`}>{String(value)}</p>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </section>
      </main>
    </div>
  );
}
