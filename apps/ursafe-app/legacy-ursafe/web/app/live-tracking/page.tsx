'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { User, Shift, EmergencyAlert, Trip, TripStatus, ShiftStatus, CheckIn, UserRole } from '@/types';
import dynamic from 'next/dynamic';
import AppHeader, { HeaderActionButton, HeaderToggleButton } from '@/components/AppHeader';

// Dynamically import map component to avoid SSR issues
const MapView = dynamic(() => import('@/components/MapView'), { ssr: false });

interface EmergencyResolution {
  resolvedAt: string;
  resolvedBy: string;
  resolution: string;
  employeeSafe: 'yes' | 'no' | 'unknown';
  canResumeWork: 'yes' | 'no' | 'requires_medical' | 'pending_investigation';
  actionsTaken: string;
  followUpRequired: boolean;
  followUpNotes?: string;
}

type EnrichedShift = Shift & {
  user?: User;
  checkInCount: number;
  lastCheckIn?: string;
  lastCheckInStatus?: string;
  hasUnresolvedEmergency: boolean;
};

type EnrichedTrip = Trip & {
  user?: User;
};

type ActiveUserEntry = {
  key: string;
  isShift: boolean;
  activityData: EnrichedShift | EnrichedTrip;
  user?: User;
  userId: string;
  emergency?: (EmergencyAlert & { user?: User });
  shiftData?: EnrichedShift;
  isEmergency: boolean;
  hasCheckIns: boolean;
  lastCheckInStatusLabel: string;
  statusTextClass: string;
  dividerBorderClass: string;
  startTime: string;
  hours: number;
  minutes: number;
};

const fetchWithTimeout = async (input: RequestInfo, init: RequestInit, timeoutMs = 5000) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
};

export default function LiveTrackingPage() {
  const { user, loading: authLoading, signOut } = useAuth();
  const router = useRouter();
  const [activeShifts, setActiveShifts] = useState<EnrichedShift[]>([]);
  const [activeTrips, setActiveTrips] = useState<EnrichedTrip[]>([]);
  const [emergencies, setEmergencies] = useState<(EmergencyAlert & { user?: User })[]>([]);
  const [focusedEmergency, setFocusedEmergency] = useState<(EmergencyAlert & { user?: User }) | null>(null);
  const [selectedEmployee, setSelectedEmployee] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [resolvingEmergency, setResolvingEmergency] = useState<string | null>(null);
  const [resolutionForm, setResolutionForm] = useState<EmergencyResolution>({
    resolvedAt: new Date().toISOString(),
    resolvedBy: '',
    resolution: '',
    employeeSafe: 'unknown',
    canResumeWork: 'pending_investigation',
    actionsTaken: '',
    followUpRequired: false,
    followUpNotes: '',
  });
  const isSuperAdmin = user?.role === UserRole.SUPER_ADMIN;
  const isAdmin = user?.role === UserRole.ADMIN || isSuperAdmin;
  const isManager = user?.role === UserRole.MANAGER;

  useEffect(() => {
    if (!authLoading) {
      if (!user || (!isAdmin && !isManager)) {
        router.push('/login');
      } else {
        fetchAllData();
      }
    }
  }, [user, authLoading, isAdmin, isManager]);

  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      fetchAllData();
    }, 10000); // Refresh every 10 seconds

    return () => clearInterval(interval);
  }, [autoRefresh]);

  const fetchAllData = async () => {
    try {
      const requestInit: RequestInit = {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache',
          Pragma: 'no-cache',
        },
      };

      const responses = await Promise.allSettled([
        fetchWithTimeout('/api/users', requestInit),
        fetchWithTimeout('/api/shifts', requestInit),
        fetchWithTimeout('/api/trips', requestInit),
        fetchWithTimeout('/api/emergencies', requestInit),
        fetchWithTimeout('/api/check-ins', requestInit),
      ]);

      const getJson = async <T,>(index: number, fallback: T) => {
        const response = responses[index];
        if (response?.status === 'fulfilled' && response.value.ok) {
          return response.value.json() as Promise<T>;
        }
        console.error('Live tracking request failed', response);
        return fallback;
      };

      const users = await getJson<User[]>(0, []);
      const scopedUsers = users.filter((candidate) => candidate.isActive);
      const allShifts = await getJson<Shift[]>(1, []);
      const allTrips = await getJson<Trip[]>(2, []);
      const emergencyData = await getJson<EmergencyAlert[]>(3, []);
      const checkIns = await getJson<CheckIn[]>(4, []);

      const unresolvedEmergencies = emergencyData.filter(e => !e.resolvedAt);

      // Filter for ONLY active shifts (no endTime and status is active or emergency)
      const activeShiftsData = allShifts
        .filter(shift => {
          if (shift.endTime) return false;
          if (shift.status === ShiftStatus.ACTIVE) return true;
          if (shift.status === ShiftStatus.EMERGENCY) {
            return unresolvedEmergencies.some(e => e.shiftId === shift.id);
          }
          return false;
        })
        .map(shift => {
          const shiftUser = scopedUsers.find(u => u.id === shift.userId);
          // Count check-ins for this shift
          const shiftCheckIns = checkIns.filter((ci: CheckIn) => ci.shiftId === shift.id);
          const lastCheckIn = shiftCheckIns.length > 0 ? shiftCheckIns[shiftCheckIns.length - 1] : null;
          return { 
            ...shift, 
            user: shiftUser,
            checkInCount: shiftCheckIns.length,
            lastCheckIn: lastCheckIn?.timestamp ?? shift.lastCheckIn,
            lastCheckInStatus: lastCheckIn?.status,
            hasUnresolvedEmergency: unresolvedEmergencies.some(e => e.shiftId === shift.id)
          };
        })
        .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());

      // Filter for ONLY active trips (in_progress status)
      const activeTripsData = allTrips
        .filter(trip => trip.status === TripStatus.IN_PROGRESS && !trip.endTime)
        .map(trip => {
          const tripUser = scopedUsers.find(u => u.id === trip.userId);
          return { ...trip, user: tripUser };
        })
        .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());

      // Add user info to emergencies
      const emergenciesWithUsers = unresolvedEmergencies
        .map(emergency => {
          const emergencyUser = scopedUsers.find(u => u.id === emergency.userId);
          return { ...emergency, user: emergencyUser };
        })
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      setActiveShifts(activeShiftsData);
      setActiveTrips(activeTripsData);
      setEmergencies(emergenciesWithUsers);
      setFocusedEmergency((prev) => {
        if (emergenciesWithUsers.length === 0) {
          return null;
        }
        const newestEmergency = emergenciesWithUsers[0];
        if (!prev || prev.id !== newestEmergency.id) {
          return newestEmergency;
        }
        return prev;
      });
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleResolveEmergency = async (emergencyId: string) => {
    try {
      const response = await fetch(`/api/emergencies/${emergencyId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...resolutionForm,
          resolvedBy: user?.id,
          resolvedAt: new Date().toISOString(),
        }),
      });

      if (response.ok) {
        setResolvingEmergency(null);
        setResolutionForm({
          resolvedAt: new Date().toISOString(),
          resolvedBy: '',
          resolution: '',
          employeeSafe: 'unknown',
          canResumeWork: 'pending_investigation',
          actionsTaken: '',
          followUpRequired: false,
          followUpNotes: '',
        });
        await fetchAllData();
      } else {
        alert('Failed to resolve emergency. Please try again.');
      }
    } catch (error) {
      console.error('Error resolving emergency:', error);
      alert('An error occurred. Please try again.');
    }
  };

  const handleSignOut = async () => {
    await signOut();
    router.push('/login');
  };

  const activeUserEntries = useMemo<ActiveUserEntry[]>(() => {
    const activeUsers = new Map<string, { type: 'shift' | 'trip'; data: any; user?: User }>();

    activeShifts.forEach((shift) => {
      if (!activeUsers.has(shift.userId)) {
        activeUsers.set(shift.userId, { type: 'shift', data: shift, user: shift.user });
      }
    });

    activeTrips.forEach((trip) => {
      if (!activeUsers.has(trip.userId)) {
        activeUsers.set(trip.userId, { type: 'trip', data: trip, user: trip.user });
      }
    });

    return Array.from(activeUsers.values())
      .sort((a, b) => new Date(b.data.startTime).getTime() - new Date(a.data.startTime).getTime())
      .map((userActivity) => {
        const isShift = userActivity.type === 'shift';
        const activityData = userActivity.data as EnrichedShift | EnrichedTrip;
        const userId = activityData.userId;
        const emergency = emergencies.find((e) => e.userId === userId && !e.resolvedAt);
        const shiftData = isShift ? (activityData as EnrichedShift) : undefined;
        const isEmergency = Boolean((shiftData?.hasUnresolvedEmergency) || emergency);
        const hasCheckIns = Boolean(shiftData && shiftData.checkInCount > 0);
        const lastCheckInStatusLabel = hasCheckIns
          ? (shiftData?.lastCheckInStatus?.replace(/_/g, ' ') || 'Unknown')
          : 'Awaiting first check-in';
        const statusTextClass = hasCheckIns
          ? (isEmergency ? 'text-white font-bold' : 'text-green-600 font-bold')
          : (isEmergency ? 'text-yellow-100 font-semibold' : 'text-yellow-700 font-semibold');
        const dividerBorderClass = isEmergency ? 'border-red-200' : 'border-gray-300';
        const startTime = activityData.startTime;
        const duration = Math.floor((Date.now() - new Date(startTime).getTime()) / 60000);
        const hours = Math.floor(duration / 60);
        const minutes = duration % 60;

        return {
          key: `${userActivity.type}-${activityData.id}`,
          isShift,
          activityData,
          user: userActivity.user,
          userId,
          emergency,
          shiftData,
          isEmergency,
          hasCheckIns,
          lastCheckInStatusLabel,
          statusTextClass,
          dividerBorderClass,
          startTime,
          hours,
          minutes,
        };
      });
  }, [activeShifts, activeTrips, emergencies]);

  const emergencyEntries = activeUserEntries.filter((entry) => entry.isEmergency);
  const standardEntries = activeUserEntries.filter((entry) => !entry.isEmergency);

  const renderActivityCard = (entry: ActiveUserEntry) => {
    const {
      key,
      isShift,
      activityData,
      user,
      userId,
      emergency,
      shiftData,
      isEmergency,
      hasCheckIns,
      lastCheckInStatusLabel,
      statusTextClass,
      dividerBorderClass,
      startTime,
      hours,
      minutes,
    } = entry;

    const tripData = !isShift ? (activityData as EnrichedTrip) : undefined;
    const shiftLocation = isShift ? shiftData?.currentLocation : undefined;

    return (
      <div
        key={key}
        className={`rounded-lg p-4 cursor-pointer transition-all ${
          isEmergency
            ? 'bg-red-600 text-white border-4 border-red-900 shadow-2xl animate-pulse'
            : 'bg-white border-2 border-gray-200 hover:shadow-lg'
        }`}
        onClick={() => setSelectedEmployee(userId)}
      >
        {isEmergency && (
          <div className="text-center mb-2">
            <span className="text-2xl font-black">🚨 EMERGENCY 🚨</span>
          </div>
        )}

        <div className="text-center mb-3">
          <h3 className={`text-lg font-bold ${isEmergency ? 'text-white' : 'text-gray-900'}`}>
            {user?.firstName} {user?.lastName}
          </h3>
          <p className={`text-sm ${isEmergency ? 'text-red-100' : 'text-gray-600'}`}>
            {user?.department}
          </p>
          <span
            className={`inline-block px-2 py-1 rounded text-xs font-bold mt-1 ${
              isShift
                ? isEmergency
                  ? 'bg-red-800 text-white'
                  : 'bg-blue-100 text-blue-800'
                : isEmergency
                ? 'bg-red-800 text-white'
                : 'bg-green-100 text-green-800'
            }`}
          >
            {isShift ? '🏢 On Shift' : '🚗 On Trip'}
          </span>
        </div>

        <div className={`text-sm space-y-1 ${isEmergency ? 'text-white' : 'text-gray-700'}`}>
          {isShift && shiftData?.clientName && (
            <div className="flex justify-between">
              <span className="font-semibold">Client:</span>
              <span>{shiftData.clientName}</span>
            </div>
          )}
          {!isShift && tripData && (
            <>
              <div className="flex justify-between">
                <span className="font-semibold">From:</span>
                <span className="text-xs">{tripData.startLocation?.address || 'Unknown'}</span>
              </div>
              {tripData.endLocation && (
                <div className="flex justify-between">
                  <span className="font-semibold">To:</span>
                  <span className="text-xs">{tripData.endLocation.address || 'Unknown'}</span>
                </div>
              )}
            </>
          )}
          <div className="flex justify-between">
            <span className="font-semibold">Started:</span>
            <span>{new Date(startTime).toLocaleTimeString()}</span>
          </div>
          <div className="flex justify-between">
            <span className="font-semibold">Duration:</span>
            <span className="font-mono">{hours}h {minutes}m</span>
          </div>
          {isShift && shiftData && (
            <>
              <div className="flex justify-between">
                <span className="font-semibold">Check-ins:</span>
                <span className={statusTextClass}>{hasCheckIns ? shiftData.checkInCount : '0'}</span>
              </div>
              <div
                className={`flex justify-between text-xs pt-1 ${hasCheckIns ? 'border-t' : ''} ${
                  hasCheckIns ? dividerBorderClass : ''
                }`}
              >
                <span>{hasCheckIns ? 'Last status:' : 'Status:'}</span>
                <span className={statusTextClass}>
                  {hasCheckIns ? lastCheckInStatusLabel.toUpperCase() : lastCheckInStatusLabel}
                </span>
              </div>
              {shiftData.lastCheckIn && (
                <div className={`flex justify-between text-xs pt-1 border-t ${dividerBorderClass}`}>
                  <span>Last check-in:</span>
                  <span>{new Date(shiftData.lastCheckIn).toLocaleTimeString()}</span>
                </div>
              )}
            </>
          )}
        </div>

        {isShift && shiftLocation && (
          <div className="mt-3 pt-3 border-t border-gray-300">
            <button
              onClick={(e) => {
                e.stopPropagation();
                window.open(
                  `https://maps.google.com/?q=${shiftLocation.latitude},${shiftLocation.longitude}`,
                  '_blank'
                );
              }}
              className={`w-full text-center text-sm font-semibold ${
                isEmergency ? 'text-yellow-300 hover:text-yellow-100' : 'text-blue-600 hover:text-blue-800'
              }`}
            >
              📍 View Location
            </button>
          </div>
        )}

        {isEmergency && emergency && (
          <div className="mt-3 pt-3 border-t border-red-300">
            <p className="text-xs mb-2">
              <strong>Time:</strong> {new Date(emergency.timestamp).toLocaleTimeString()}
            </p>
            {emergency.notes && (
              <p className="text-xs mb-2">
                <strong>Notes:</strong> {emergency.notes}
              </p>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                setResolvingEmergency(emergency.id);
              }}
              className="w-full bg-white text-red-600 px-3 py-1 rounded font-bold hover:bg-gray-100"
            >
              RESOLVE
            </button>
          </div>
        )}
      </div>
    );
  };

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-xl">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <AppHeader
        eyebrow="Live Tracker"
        title="Live Employee Tracking"
        subtitle="Real-time GPS visibility for every active employee"
        accent="blue"
        actions={(
          <>
            <HeaderToggleButton
              label="Auto-refresh (10s)"
              iconOn="🔁"
              iconOff="⏸"
              pressed={autoRefresh}
              onToggle={() => setAutoRefresh((prev) => !prev)}
              tone="primary"
            />
            <HeaderActionButton
              label="Refresh"
              icon="🔄"
              tone="primary"
              onClick={fetchAllData}
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

      <main className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
        {emergencyEntries.length > 0 && (
          <section className="mb-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-red-400">Emergency Deck</p>
                <h2 className="text-2xl font-bold text-red-900">Immediate Response Required</h2>
                <p className="text-sm text-red-700">Prioritize every employee who just triggered the SOS</p>
              </div>
              <span className="text-sm font-semibold text-red-700">
                {emergencyEntries.length} active emergency{emergencyEntries.length === 1 ? '' : ' situations'}
              </span>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {emergencyEntries.map(renderActivityCard)}
            </div>
          </section>
        )}

        {/* Map View - Primary Focus */}
        <div className="bg-white shadow rounded-lg overflow-hidden mb-6" style={{ height: '500px' }}>
          <MapView 
            trips={activeTrips}
            shifts={activeShifts}
            emergencies={emergencies}
            focusedEmergency={focusedEmergency}
            onMarkerClick={(userId) => setSelectedEmployee(userId)}
          />
        </div>

        {standardEntries.length > 0 && (
          <section className="mt-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900">Active Employees</h2>
              <p className="text-sm text-gray-500">
                {standardEntries.length} on-duty employee{standardEntries.length === 1 ? '' : 's'}
              </p>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
              {standardEntries.map(renderActivityCard)}
            </div>
          </section>
        )}

        {activeUserEntries.length === 0 && (
          <div className="text-center py-16 bg-gray-50 rounded-lg">
            <p className="text-2xl text-gray-400">No active employees</p>
            <p className="text-gray-500 mt-2">Employees will appear here when they start a shift or trip</p>
          </div>
        )}

        {/* Info Bar */}
        <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-blue-900">Live Safety Monitoring</h3>
              <p className="text-sm text-blue-800">
                {new Set([...activeShifts.map(s => s.userId), ...activeTrips.map(t => t.userId)]).size} employee{new Set([...activeShifts.map(s => s.userId), ...activeTrips.map(t => t.userId)]).size !== 1 ? 's' : ''} active • 
                {emergencies.length > 0 && <span className="text-red-600 font-bold ml-2">⚠️ {emergencies.length} UNRESOLVED EMERGENCY{emergencies.length !== 1 ? 'IES' : ''}</span>}
                {emergencies.length === 0 && <span className="text-green-600 font-bold ml-2">✓ All Clear</span>}
              </p>
              <p className="text-xs text-gray-600 mt-1">
                Tracking employees on shifts and trips • Emergency alerts send emails to all managers & admins automatically
              </p>
            </div>
            <div className="text-right text-sm text-gray-500">
              Auto-refresh: {autoRefresh ? '✓ ON' : '✗ OFF'} | Last update: {new Date().toLocaleTimeString()}
            </div>
          </div>
        </div>
      </main>

      {/* Resolution Modal */}
      {resolvingEmergency && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[1000] p-4">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <h2 className="text-2xl font-bold mb-4">Resolve Emergency</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold mb-2">Resolution Summary *</label>
                <textarea
                  value={resolutionForm.resolution}
                  onChange={(e) => setResolutionForm({ ...resolutionForm, resolution: e.target.value })}
                  className="w-full px-3 py-2 border rounded-md"
                  rows={3}
                  placeholder="Describe how the emergency was resolved..."
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-semibold mb-2">Is the employee safe? *</label>
                <select
                  value={resolutionForm.employeeSafe}
                  onChange={(e) => setResolutionForm({ ...resolutionForm, employeeSafe: e.target.value as any })}
                  className="w-full px-3 py-2 border rounded-md"
                  required
                >
                  <option value="unknown">Unknown</option>
                  <option value="yes">Yes - Employee is safe</option>
                  <option value="no">No - Employee requires assistance</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold mb-2">Can employee resume work? *</label>
                <select
                  value={resolutionForm.canResumeWork}
                  onChange={(e) => setResolutionForm({ ...resolutionForm, canResumeWork: e.target.value as any })}
                  className="w-full px-3 py-2 border rounded-md"
                  required
                >
                  <option value="pending_investigation">Pending Investigation</option>
                  <option value="yes">Yes - Can resume immediately</option>
                  <option value="no">No - Cannot resume work</option>
                  <option value="requires_medical">Requires Medical Clearance</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold mb-2">Actions Taken *</label>
                <textarea
                  value={resolutionForm.actionsTaken}
                  onChange={(e) => setResolutionForm({ ...resolutionForm, actionsTaken: e.target.value })}
                  className="w-full px-3 py-2 border rounded-md"
                  rows={3}
                  placeholder="List all actions taken to address this emergency..."
                  required
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="followUpRequired"
                  checked={resolutionForm.followUpRequired}
                  onChange={(e) => setResolutionForm({ ...resolutionForm, followUpRequired: e.target.checked })}
                  className="rounded"
                />
                <label htmlFor="followUpRequired" className="text-sm font-semibold">
                  Follow-up required
                </label>
              </div>

              {resolutionForm.followUpRequired && (
                <div>
                  <label className="block text-sm font-semibold mb-2">Follow-up Notes</label>
                  <textarea
                    value={resolutionForm.followUpNotes}
                    onChange={(e) => setResolutionForm({ ...resolutionForm, followUpNotes: e.target.value })}
                    className="w-full px-3 py-2 border rounded-md"
                    rows={2}
                    placeholder="Describe required follow-up actions..."
                  />
                </div>
              )}

              <div className="flex gap-4 pt-4">
                <button
                  onClick={() => {
                    if (!resolutionForm.resolution || !resolutionForm.actionsTaken) {
                      alert('Please fill in all required fields');
                      return;
                    }
                    handleResolveEmergency(resolvingEmergency);
                  }}
                  className="flex-1 bg-green-600 text-white px-6 py-3 rounded-md hover:bg-green-700 font-bold"
                >
                  Submit Resolution
                </button>
                <button
                  onClick={() => {
                    setResolvingEmergency(null);
                    setResolutionForm({
                      resolvedAt: new Date().toISOString(),
                      resolvedBy: '',
                      resolution: '',
                      employeeSafe: 'unknown',
                      canResumeWork: 'pending_investigation',
                      actionsTaken: '',
                      followUpRequired: false,
                      followUpNotes: '',
                    });
                  }}
                  className="flex-1 bg-gray-600 text-white px-6 py-3 rounded-md hover:bg-gray-700"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
