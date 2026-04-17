"use client";

import { platformLinks } from "@vlworkhub/config";
import type {
  SessionUser,
  UrsafeActiveSession,
  UrsafeCheckIn,
  UrsafeEmergency,
  UrsafeLocation,
  UrsafeShift,
  UrsafeTrip,
  UrsafeUser
} from "@vlworkhub/types";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import UrsafeAppHeader, { HeaderActionButton } from "../../components/ursafe-app-header";
import {
  getActiveSessions,
  getApiErrorMessage,
  getCheckIns,
  getCurrentUser,
  getEmergencies,
  getShifts,
  getTrips,
  getUrsafeUsers,
  resolveEmergency
} from "../../lib/ursafe-client";

const LegacyMapView = dynamic(() => import("./legacy-map-view"), {
  ssr: false
});

type EmergencyResolution = {
  resolvedAt: string;
  resolvedBy: string;
  resolution: string;
  employeeSafe: "yes" | "no" | "unknown";
  canResumeWork: "yes" | "no" | "requires_medical" | "pending_investigation";
  actionsTaken: string;
  followUpRequired: boolean;
  followUpNotes?: string;
};

type EnrichedShift = UrsafeShift & {
  user?: UrsafeUser;
  checkInCount: number;
  lastCheckIn?: string;
  lastCheckInStatus?: string;
  hasUnresolvedEmergency: boolean;
};

type EnrichedTrip = UrsafeTrip & {
  user?: UrsafeUser;
};

type EmergencyWithUser = UrsafeEmergency & { user?: UrsafeUser };

type ActiveUserEntry = {
  key: string;
  isShift: boolean;
  activityData: EnrichedShift | EnrichedTrip;
  user?: UrsafeUser;
  userId: string;
  emergency?: EmergencyWithUser;
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

const fetchWithTimeout = async <T,>(callback: () => Promise<T>, timeoutMs = 8000) => {
  const timeout = new Promise<never>((_, reject) => {
    const id = window.setTimeout(() => {
      window.clearTimeout(id);
      reject(new Error("Timed out"));
    }, timeoutMs);
  });
  return Promise.race([callback(), timeout]);
};

const toRoleSet = (user: SessionUser | null) => {
  return new Set(
    [user?.role, user?.platformRole, ...(user?.roles ?? [])]
      .filter(Boolean)
      .map((value) => String(value).toUpperCase())
  );
};

const asKnownStatus = (value: string | undefined) => (value ?? "").toLowerCase();

const buildLocationFromSession = (session?: UrsafeActiveSession): UrsafeLocation | undefined => {
  if (!session?.location?.latitude || !session.location.longitude) {
    return undefined;
  }

  // Mirrors the mobile active-session payload shape: latitude/longitude/accuracy/timestamp.
  return {
    latitude: session.location.latitude,
    longitude: session.location.longitude,
    accuracy: session.location.accuracy,
    timestamp: session.location.timestamp || session.lastSeenAt,
    address: session.location.address
  };
};

const signOut = async () => {
  const response = await fetch(`${platformLinks.api}/auth/logout`, {
    method: "POST",
    credentials: "include"
  }).catch(() => null);

  if (!response?.ok) {
    throw new Error("Failed to sign out.");
  }
};

function HeaderToggleButton(props: {
  label: string;
  iconOn: string;
  iconOff: string;
  pressed: boolean;
  onToggle: () => void;
}) {
  return (
    <HeaderActionButton
      label={props.label}
      icon={props.pressed ? props.iconOn : props.iconOff}
      tone="primary"
      onClick={props.onToggle}
    />
  );
}

export default function LiveTrackingPage() {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [activeShifts, setActiveShifts] = useState<EnrichedShift[]>([]);
  const [activeTrips, setActiveTrips] = useState<EnrichedTrip[]>([]);
  const [emergencies, setEmergencies] = useState<EmergencyWithUser[]>([]);
  const [focusedEmergency, setFocusedEmergency] = useState<EmergencyWithUser | null>(null);
  const [selectedEmployee, setSelectedEmployee] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [resolvingEmergency, setResolvingEmergency] = useState<string | null>(null);
  const [resolutionForm, setResolutionForm] = useState<EmergencyResolution>({
    resolvedAt: new Date().toISOString(),
    resolvedBy: "",
    resolution: "",
    employeeSafe: "unknown",
    canResumeWork: "pending_investigation",
    actionsTaken: "",
    followUpRequired: false,
    followUpNotes: ""
  });

  const roleSet = useMemo(() => toRoleSet(user), [user]);
  const isAdmin = roleSet.has("ADMIN") || roleSet.has("SUPER_ADMIN");
  const isManager = roleSet.has("MANAGER");

  const fetchAllData = async () => {
    try {
      setError(null);

      const responses = await Promise.allSettled([
        fetchWithTimeout(() => getCurrentUser()),
        fetchWithTimeout(() => getUrsafeUsers()),
        fetchWithTimeout(() => getShifts()),
        fetchWithTimeout(() => getTrips()),
        fetchWithTimeout(() => getEmergencies(true)),
        fetchWithTimeout(() => getCheckIns()),
        fetchWithTimeout(() => getActiveSessions())
      ]);

      const getValue = <T,>(index: number, fallback: T) => {
        const response = responses[index];
        if (response?.status === "fulfilled") {
          return response.value as T;
        }
        return fallback;
      };

      const sessionUser = getValue<SessionUser | null>(0, null);
      const users = getValue<UrsafeUser[]>(1, []);
      const allShifts = getValue<UrsafeShift[]>(2, []);
      const allTrips = getValue<UrsafeTrip[]>(3, []);
      const emergencyData = getValue<UrsafeEmergency[]>(4, []);
      const checkIns = getValue<UrsafeCheckIn[]>(5, []);
      const sessions = getValue<UrsafeActiveSession[]>(6, []);

      setUser(sessionUser);

      const scopedUsers = users.filter((candidate) => candidate.isActive);
      const unresolvedEmergencies = emergencyData.filter((item) => !item.resolved && !item.resolvedAt);
      const sessionByUserId = new Map(sessions.map((item) => [item.userId, item]));

      const activeShiftsData: EnrichedShift[] = allShifts
        .filter((shift) => {
          if (shift.endTime) return false;
          const status = asKnownStatus(shift.status);
          if (status === "active") return true;
          if (status === "emergency") {
            return unresolvedEmergencies.some((emergency) => emergency.shiftId === shift.id);
          }
          return false;
        })
        .map((shift) => {
          const shiftUser = scopedUsers.find((candidate) => candidate.id === shift.userId);
          const shiftCheckIns = checkIns.filter((checkIn) => checkIn.shiftId === shift.id);
          const lastCheckIn = shiftCheckIns.length > 0 ? shiftCheckIns[shiftCheckIns.length - 1] : null;
          const sessionLocation = buildLocationFromSession(sessionByUserId.get(shift.userId));

          return {
            ...shift,
            user: shiftUser,
            currentLocation: shift.currentLocation || sessionLocation || undefined,
            checkInCount: shiftCheckIns.length,
            lastCheckIn: lastCheckIn?.timestamp ?? shift.lastCheckIn,
            lastCheckInStatus: lastCheckIn?.status,
            hasUnresolvedEmergency: unresolvedEmergencies.some((emergency) => emergency.shiftId === shift.id)
          };
        })
        .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());

      const activeTripsData: EnrichedTrip[] = allTrips
        .filter((trip) => asKnownStatus(trip.status) === "in_progress" && !trip.endTime)
        .map((trip) => {
          const tripUser = scopedUsers.find((candidate) => candidate.id === trip.userId);
          const sessionLocation = buildLocationFromSession(sessionByUserId.get(trip.userId));
          const route = trip.route && trip.route.length > 0 ? trip.route : sessionLocation ? [sessionLocation] : [];
          return { ...trip, route, user: tripUser };
        })
        .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());

      const emergenciesWithUsers = unresolvedEmergencies
        .map((emergency) => {
          const emergencyUser = scopedUsers.find((candidate) => candidate.id === emergency.userId);
          return { ...emergency, user: emergencyUser };
        })
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      // If live tables are empty, show one safe mock marker so the page never renders blank.
      if (activeShiftsData.length === 0 && activeTripsData.length === 0 && emergenciesWithUsers.length === 0) {
        const mockUser: UrsafeUser = {
          id: "mock-user",
          email: "mock@vlworkhub.local",
          firstName: "Demo",
          lastName: "Employee",
          department: "Operations",
          managerId: null,
          isActive: true,
          role: "Employee",
          roles: ["Employee"]
        };
        const now = new Date().toISOString();
        activeShiftsData.push({
          id: "mock-shift",
          userId: mockUser.id,
          startTime: now,
          status: "active",
          checkInCount: 0,
          currentLocation: {
            latitude: 49.2827,
            longitude: -123.1207,
            timestamp: now,
            address: "Vancouver, BC"
          },
          user: mockUser,
          hasUnresolvedEmergency: false
        });
      }

      setActiveShifts(activeShiftsData);
      setActiveTrips(activeTripsData);
      setEmergencies(emergenciesWithUsers);
      setFocusedEmergency((previous) => {
        if (emergenciesWithUsers.length === 0) {
          return null;
        }
        const newestEmergency = emergenciesWithUsers[0];
        if (!previous || previous.id !== newestEmergency.id) {
          return newestEmergency;
        }
        return previous;
      });
    } catch (loadError) {
      setError(getApiErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchAllData();
  }, []);

  useEffect(() => {
    if (!autoRefresh) return;
    const timer = window.setInterval(() => {
      void fetchAllData();
    }, 10000);
    return () => window.clearInterval(timer);
  }, [autoRefresh]);

  useEffect(() => {
    if (loading || !user) return;
    if (!isAdmin && !isManager) {
      router.push("/access-denied");
    }
  }, [loading, user, isAdmin, isManager, router]);

  const handleResolveEmergency = async (emergencyId: string) => {
    try {
      await resolveEmergency(emergencyId, {
        ...resolutionForm,
        resolvedBy: user?.id,
        resolvedAt: new Date().toISOString()
      });

      setResolvingEmergency(null);
      setResolutionForm({
        resolvedAt: new Date().toISOString(),
        resolvedBy: "",
        resolution: "",
        employeeSafe: "unknown",
        canResumeWork: "pending_investigation",
        actionsTaken: "",
        followUpRequired: false,
        followUpNotes: ""
      });

      await fetchAllData();
    } catch (resolveError) {
      setError(getApiErrorMessage(resolveError));
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch {
      // Keep redirect behavior even if logout request fails.
    }
    router.push("/");
    router.refresh();
  };

  const activeUserEntries = useMemo<ActiveUserEntry[]>(() => {
    const activeUsers = new Map<string, { type: "shift" | "trip"; data: EnrichedShift | EnrichedTrip; user?: UrsafeUser }>();

    activeShifts.forEach((shift) => {
      if (!activeUsers.has(shift.userId)) {
        activeUsers.set(shift.userId, { type: "shift", data: shift, user: shift.user });
      }
    });

    activeTrips.forEach((trip) => {
      if (!activeUsers.has(trip.userId)) {
        activeUsers.set(trip.userId, { type: "trip", data: trip, user: trip.user });
      }
    });

    return Array.from(activeUsers.values())
      .sort((a, b) => new Date(b.data.startTime).getTime() - new Date(a.data.startTime).getTime())
      .map((userActivity) => {
        const isShift = userActivity.type === "shift";
        const activityData = userActivity.data;
        const userId = activityData.userId;
        const emergency = emergencies.find((item) => item.userId === userId && !item.resolved && !item.resolvedAt);
        const shiftData = isShift ? (activityData as EnrichedShift) : undefined;
        const isEmergency = Boolean(shiftData?.hasUnresolvedEmergency || emergency);
        const hasCheckIns = Boolean(shiftData && shiftData.checkInCount > 0);
        const lastCheckInStatusLabel = hasCheckIns
          ? shiftData?.lastCheckInStatus?.replace(/_/g, " ") || "Unknown"
          : "Awaiting first check-in";
        const statusTextClass = hasCheckIns
          ? isEmergency
            ? "text-white font-bold"
            : "text-green-600 font-bold"
          : isEmergency
            ? "text-yellow-100 font-semibold"
            : "text-yellow-700 font-semibold";
        const dividerBorderClass = isEmergency ? "border-red-200" : "border-gray-300";
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
          minutes
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
      minutes
    } = entry;

    const tripData = !isShift ? (activityData as EnrichedTrip) : undefined;
    const shiftLocation = isShift ? shiftData?.currentLocation : undefined;

    return (
      <div
        key={key}
        className={`rounded-lg p-4 cursor-pointer transition-all ${
          isEmergency ? "bg-red-600 text-white border-4 border-red-900 shadow-2xl animate-pulse" : "bg-white border-2 border-gray-200 hover:shadow-lg"
        }`}
        onClick={() => setSelectedEmployee(userId)}
      >
        {isEmergency ? (
          <div className="text-center mb-2">
            <span className="text-2xl font-black">EMERGENCY</span>
          </div>
        ) : null}

        <div className="text-center mb-3">
          <h3 className={`text-lg font-bold ${isEmergency ? "text-white" : "text-gray-900"}`}>
            {user?.firstName} {user?.lastName}
          </h3>
          <p className={`text-sm ${isEmergency ? "text-red-100" : "text-gray-600"}`}>{user?.department}</p>
          <span
            className={`inline-block px-2 py-1 rounded text-xs font-bold mt-1 ${
              isShift
                ? isEmergency
                  ? "bg-red-800 text-white"
                  : "bg-blue-100 text-blue-800"
                : isEmergency
                  ? "bg-red-800 text-white"
                  : "bg-green-100 text-green-800"
            }`}
          >
            {isShift ? "On Shift" : "On Trip"}
          </span>
        </div>

        <div className={`text-sm space-y-1 ${isEmergency ? "text-white" : "text-gray-700"}`}>
          {isShift && shiftData?.clientName ? (
            <div className="flex justify-between">
              <span className="font-semibold">Client:</span>
              <span>{shiftData.clientName}</span>
            </div>
          ) : null}
          {!isShift && tripData ? (
            <>
              <div className="flex justify-between">
                <span className="font-semibold">From:</span>
                <span className="text-xs">{tripData.startLocation?.address || "Unknown"}</span>
              </div>
              {tripData.endLocation ? (
                <div className="flex justify-between">
                  <span className="font-semibold">To:</span>
                  <span className="text-xs">{tripData.endLocation.address || "Unknown"}</span>
                </div>
              ) : null}
            </>
          ) : null}
          <div className="flex justify-between">
            <span className="font-semibold">Started:</span>
            <span>{new Date(startTime).toLocaleTimeString()}</span>
          </div>
          <div className="flex justify-between">
            <span className="font-semibold">Duration:</span>
            <span className="font-mono">{hours}h {minutes}m</span>
          </div>
          {isShift && shiftData ? (
            <>
              <div className="flex justify-between">
                <span className="font-semibold">Check-ins:</span>
                <span className={statusTextClass}>{hasCheckIns ? shiftData.checkInCount : "0"}</span>
              </div>
              <div className={`flex justify-between text-xs pt-1 ${hasCheckIns ? "border-t" : ""} ${hasCheckIns ? dividerBorderClass : ""}`}>
                <span>{hasCheckIns ? "Last status:" : "Status:"}</span>
                <span className={statusTextClass}>{hasCheckIns ? lastCheckInStatusLabel.toUpperCase() : lastCheckInStatusLabel}</span>
              </div>
              {shiftData.lastCheckIn ? (
                <div className={`flex justify-between text-xs pt-1 border-t ${dividerBorderClass}`}>
                  <span>Last check-in:</span>
                  <span>{new Date(shiftData.lastCheckIn).toLocaleTimeString()}</span>
                </div>
              ) : null}
            </>
          ) : null}
        </div>

        {isShift && shiftLocation ? (
          <div className="mt-3 pt-3 border-t border-gray-300">
            <button
              onClick={(event) => {
                event.stopPropagation();
                window.open(`https://maps.google.com/?q=${shiftLocation.latitude},${shiftLocation.longitude}`, "_blank");
              }}
              className={`w-full text-center text-sm font-semibold ${isEmergency ? "text-yellow-300 hover:text-yellow-100" : "text-blue-600 hover:text-blue-800"}`}
            >
              View Location
            </button>
          </div>
        ) : null}

        {isEmergency && emergency ? (
          <div className="mt-3 pt-3 border-t border-red-300">
            <p className="text-xs mb-2"><strong>Time:</strong> {new Date(emergency.timestamp).toLocaleTimeString()}</p>
            {emergency.notes ? <p className="text-xs mb-2"><strong>Notes:</strong> {emergency.notes}</p> : null}
            <button
              onClick={(event) => {
                event.stopPropagation();
                setResolvingEmergency(emergency.id);
              }}
              className="w-full bg-white text-red-600 px-3 py-1 rounded font-bold hover:bg-gray-100"
            >
              RESOLVE
            </button>
          </div>
        ) : null}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-xl">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <UrsafeAppHeader
        eyebrow="Live Tracker"
        title="Live Employee Tracking"
        subtitle="Real-time GPS visibility for every active employee"
        accent="blue"
        actions={
          <>
            <HeaderToggleButton
              label="Auto-refresh (10s)"
              iconOn="R"
              iconOff="P"
              pressed={autoRefresh}
              onToggle={() => setAutoRefresh((previous) => !previous)}
            />
            <HeaderActionButton label="Refresh" icon="R" tone="primary" onClick={() => void fetchAllData()} />
            <HeaderActionButton label="Sign Out" icon="O" tone="danger" onClick={() => void handleSignOut()} />
          </>
        }
        meta={`Signed in as ${user?.fullName || "Unknown User"}`}
      />

      <main className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
        {error ? <div className="mb-6 rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

        {emergencyEntries.length > 0 ? (
          <section className="mb-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-red-400">Emergency Deck</p>
                <h2 className="text-2xl font-bold text-red-900">Immediate Response Required</h2>
                <p className="text-sm text-red-700">Prioritize every employee who just triggered the SOS</p>
              </div>
              <span className="text-sm font-semibold text-red-700">
                {emergencyEntries.length} active emergency{emergencyEntries.length === 1 ? "" : " situations"}
              </span>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">{emergencyEntries.map(renderActivityCard)}</div>
          </section>
        ) : null}

        <div className="bg-white shadow rounded-lg overflow-hidden mb-6" style={{ height: "500px" }}>
          <LegacyMapView
            trips={activeTrips}
            shifts={activeShifts}
            emergencies={emergencies}
            focusedEmergency={focusedEmergency}
            onMarkerClick={(userId) => setSelectedEmployee(userId)}
          />
        </div>

        {standardEntries.length > 0 ? (
          <section className="mt-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900">Active Employees</h2>
              <p className="text-sm text-gray-500">
                {standardEntries.length} on-duty employee{standardEntries.length === 1 ? "" : "s"}
              </p>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">{standardEntries.map(renderActivityCard)}</div>
          </section>
        ) : null}

        {activeUserEntries.length === 0 ? (
          <div className="text-center py-16 bg-gray-50 rounded-lg">
            <p className="text-2xl text-gray-400">No active employees</p>
            <p className="text-gray-500 mt-2">Employees will appear here when they start a shift or trip</p>
          </div>
        ) : null}

        <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-blue-900">Live Safety Monitoring</h3>
              <p className="text-sm text-blue-800">
                {new Set([...activeShifts.map((shift) => shift.userId), ...activeTrips.map((trip) => trip.userId)]).size} employee
                {new Set([...activeShifts.map((shift) => shift.userId), ...activeTrips.map((trip) => trip.userId)]).size !== 1 ? "s" : ""} active
                {emergencies.length > 0 ? (
                  <span className="text-red-600 font-bold ml-2">
                    {emergencies.length} UNRESOLVED EMERGENCY{emergencies.length !== 1 ? "IES" : ""}
                  </span>
                ) : (
                  <span className="text-green-600 font-bold ml-2">All Clear</span>
                )}
              </p>
              <p className="text-xs text-gray-600 mt-1">Tracking employees on shifts and trips with emergency escalation visibility.</p>
            </div>
            <div className="text-right text-sm text-gray-500">Auto-refresh: {autoRefresh ? "ON" : "OFF"}</div>
          </div>
        </div>
      </main>

      {resolvingEmergency ? (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[1000] p-4">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <h2 className="text-2xl font-bold mb-4">Resolve Emergency</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold mb-2">Resolution Summary *</label>
                <textarea
                  value={resolutionForm.resolution}
                  onChange={(event) => setResolutionForm({ ...resolutionForm, resolution: event.target.value })}
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
                  onChange={(event) =>
                    setResolutionForm({ ...resolutionForm, employeeSafe: event.target.value as EmergencyResolution["employeeSafe"] })
                  }
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
                  onChange={(event) =>
                    setResolutionForm({ ...resolutionForm, canResumeWork: event.target.value as EmergencyResolution["canResumeWork"] })
                  }
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
                  onChange={(event) => setResolutionForm({ ...resolutionForm, actionsTaken: event.target.value })}
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
                  onChange={(event) => setResolutionForm({ ...resolutionForm, followUpRequired: event.target.checked })}
                  className="rounded"
                />
                <label htmlFor="followUpRequired" className="text-sm font-semibold">Follow-up required</label>
              </div>

              {resolutionForm.followUpRequired ? (
                <div>
                  <label className="block text-sm font-semibold mb-2">Follow-up Notes</label>
                  <textarea
                    value={resolutionForm.followUpNotes}
                    onChange={(event) => setResolutionForm({ ...resolutionForm, followUpNotes: event.target.value })}
                    className="w-full px-3 py-2 border rounded-md"
                    rows={2}
                    placeholder="Describe required follow-up actions..."
                  />
                </div>
              ) : null}

              <div className="flex gap-4 pt-4">
                <button
                  onClick={() => {
                    if (!resolutionForm.resolution || !resolutionForm.actionsTaken) {
                      alert("Please fill in all required fields");
                      return;
                    }
                    void handleResolveEmergency(resolvingEmergency);
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
                      resolvedBy: "",
                      resolution: "",
                      employeeSafe: "unknown",
                      canResumeWork: "pending_investigation",
                      actionsTaken: "",
                      followUpRequired: false,
                      followUpNotes: ""
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
      ) : null}
    </div>
  );
}
