"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { platformLinks } from "@vlworkhub/config";
import type { SessionUser, UrsafeTrip, UrsafeUser } from "@vlworkhub/types";
import UrsafeAppHeader, { HeaderActionButton } from "./ursafe-app-header";
import {
  deleteTrip,
  getApiErrorMessage,
  getCurrentUser,
  getTrips,
  getUrsafeSettings,
  getUrsafeUsers,
  updateTrip
} from "../lib/ursafe-client";

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

const signOut = async () => {
  const response = await fetch(`/api/logout`, {
    method: "POST",
    credentials: "include"
  }).catch(() => null);

  if (!response?.ok) {
    throw new Error("Failed to sign out.");
  }
};

export default function MileageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const userIdFilter = searchParams.get("userId");

  const [user, setUser] = useState<SessionUser | null>(null);
  const [users, setUsers] = useState<UrsafeUser[]>([]);
  const [trips, setTrips] = useState<UrsafeTrip[]>([]);
  const [ratePerKm, setRatePerKm] = useState(0.68);
  const [searchName, setSearchName] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [startDateTime, setStartDateTime] = useState("");
  const [endDateTime, setEndDateTime] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { isSuperAdmin, isAdmin, isManager } = useMemo(() => resolveRoleState(user), [user]);
  const headerBadge = isAdmin ? "Operations" : "My Team";
  const headerSubtitle = isAdmin
    ? "Approve reimbursements, audit trip logs, and keep mileage policy tight"
    : "View trip activity for employees assigned to you";

  const fetchData = async () => {
    setLoading(true);
    try {
      setError(null);
      const [session, roster, tripItems, settings] = await Promise.all([
        getCurrentUser(),
        getUrsafeUsers(),
        getTrips(),
        getUrsafeSettings().catch(() => null)
      ]);

      setUser(session);
      setUsers(roster);
      setTrips(tripItems);

      if (settings) {
        const rateNumber = Number(settings.ratePerKm ?? 0.68);
        setRatePerKm(Number.isFinite(rateNumber) ? rateNumber : 0.68);
      }
    } catch (loadError) {
      setError(getApiErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchData();
  }, []);

  const userById = useMemo(() => new Map(users.map((item) => [item.id, item])), [users]);

  const resolveTripEmployee = (trip: UrsafeTrip) => {
    const tripLike = trip as UrsafeTrip & {
      first_name?: string;
      last_name?: string;
      email?: string;
    };
    const employee = userById.get(trip.userId);
    const fromTrip = `${tripLike.first_name || ""} ${tripLike.last_name || ""}`.trim();
    const fromRoster = employee ? `${employee.firstName || ""} ${employee.lastName || ""}`.trim() : "";
    const email = tripLike.email || employee?.email || "";
    const name = fromTrip || fromRoster || email || trip.userId;
    return { name, email };
  };

  const scopedTrips = useMemo(() => {
    const effectiveUserIdFilter = isSuperAdmin ? userIdFilter : null;
    if (effectiveUserIdFilter) {
      return trips.filter((trip) => trip.userId === effectiveUserIdFilter);
    }

    if (isAdmin) {
      return trips;
    }

    if (!user) return [];
    const managedIds = new Set(
      users
        .filter((candidate) => candidate.managerId === user.id && candidate.isActive)
        .map((candidate) => candidate.id)
    );
    managedIds.add(user.id);
    return trips.filter((trip) => managedIds.has(trip.userId));
  }, [trips, users, isAdmin, isSuperAdmin, user, userIdFilter]);

  const categoryOptions = useMemo(() => {
    return Array.from(new Set(scopedTrips.map((trip) => trip.category).filter(Boolean)));
  }, [scopedTrips]);

  const statusOptions = useMemo(() => {
    return Array.from(new Set(scopedTrips.map((trip) => trip.status).filter(Boolean)));
  }, [scopedTrips]);

  const filteredTrips = useMemo(() => {
    const query = searchName.trim().toLowerCase();
    const startTimestamp = startDateTime ? new Date(startDateTime).getTime() : null;
    const endTimestamp = endDateTime ? new Date(endDateTime).getTime() : null;

    return scopedTrips
      .filter((trip) => {
        if (userIdFilter && trip.userId !== userIdFilter) {
          return false;
        }
        const employeeInfo = resolveTripEmployee(trip);
        const employeeName = employeeInfo.name.toLowerCase();
        const employeeEmail = employeeInfo.email.toLowerCase();
        if (query && !employeeName.includes(query) && !employeeEmail.includes(query)) {
          return false;
        }
        if (categoryFilter !== "all" && trip.category !== categoryFilter) {
          return false;
        }
        if (statusFilter !== "all" && trip.status !== statusFilter) {
          return false;
        }
        const tripStart = trip.startTime ? new Date(trip.startTime).getTime() : 0;
        if (startTimestamp && tripStart < startTimestamp) return false;
        if (endTimestamp && tripStart > endTimestamp) return false;
        return true;
      })
      .sort((a, b) => {
        const aTime = a.startTime ? new Date(a.startTime).getTime() : 0;
        const bTime = b.startTime ? new Date(b.startTime).getTime() : 0;
        return bTime - aTime;
      });
  }, [scopedTrips, userById, searchName, categoryFilter, statusFilter, startDateTime, endDateTime, userIdFilter]);

  const clearFilters = () => {
    setSearchName("");
    setCategoryFilter("all");
    setStatusFilter("all");
    setStartDateTime("");
    setEndDateTime("");
  };

  const formatLabel = (value: string) => value.replace(/_/g, " ");

  const handleExport = () => {
    const headers = ["Date", "Time", "Employee", "Email", "Category", "DistanceKm", "RatePerKm", "ReimbursementCad", "Status"];

    const rows = filteredTrips.map((trip) => {
      const employeeInfo = resolveTripEmployee(trip);
      const distanceKm = (trip.distanceInMiles || 0) * 1.60934;
      const reimbursement = distanceKm * ratePerKm;
      return [
        trip.startTime ? new Date(trip.startTime).toLocaleDateString() : "",
        trip.startTime ? new Date(trip.startTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "",
        employeeInfo.name,
        employeeInfo.email,
        trip.category,
        distanceKm.toFixed(2),
        ratePerKm.toFixed(2),
        reimbursement.toFixed(2),
        trip.status
      ];
    });

    const escapeField = (value: string) => {
      const escaped = value.replace(/"/g, '""');
      return `"${escaped}"`;
    };

    const csv = [headers, ...rows]
      .map((row) => row.map((cell) => escapeField(String(cell))).join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `trips_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleApprove = async (tripId: string) => {
    try {
      await updateTrip(tripId, { status: "approved" });
      await fetchData();
    } catch (approveError) {
      setError(getApiErrorMessage(approveError));
    }
  };

  const handleReject = async (tripId: string) => {
    try {
      await updateTrip(tripId, { status: "rejected" });
      await fetchData();
    } catch (rejectError) {
      setError(getApiErrorMessage(rejectError));
    }
  };

  const handleDelete = async (tripId: string) => {
    if (!confirm("Are you sure you want to delete this trip? This action cannot be undone.")) {
      return;
    }

    try {
      await deleteTrip(tripId);
      await fetchData();
    } catch (deleteError) {
      setError(getApiErrorMessage(deleteError));
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
        eyebrow={headerBadge}
        title="Trips Management"
        subtitle={headerSubtitle}
        accent="blue"
        actions={
          <>
            <HeaderActionButton label="Refresh" icon="R" tone="primary" onClick={() => void fetchData()} />
            <HeaderActionButton label="Sign Out" icon="O" tone="danger" onClick={() => void handleSignOut()} />
          </>
        }
        meta={`Signed in as ${user?.fullName || "Unknown User"}`}
      />

      <main className="mx-auto max-w-[96rem] px-4 py-6 sm:px-6 lg:px-8">
        {error ? <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

        {isSuperAdmin && userIdFilter ? (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
            Viewing trips for archived user ID: {userIdFilter}
          </div>
        ) : null}

        <div className="bg-white shadow rounded-lg p-4 mb-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-gray-400">Filters</p>
              <p className="text-sm text-gray-600">Rate per km: ${ratePerKm.toFixed(2)}</p>
            </div>
            <button
              onClick={clearFilters}
              className="rounded-full border border-gray-300 px-4 py-1.5 text-sm font-semibold text-gray-600 hover:bg-gray-100"
            >
              Clear filters
            </button>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-5">
            <div>
              <label className="block text-xs font-semibold uppercase text-gray-500 mb-2">Employee</label>
              <input
                type="text"
                value={searchName}
                onChange={(event) => setSearchName(event.target.value)}
                placeholder="Search by name or email"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase text-gray-500 mb-2">Category</label>
              <select
                value={categoryFilter}
                onChange={(event) => setCategoryFilter(event.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500"
              >
                <option value="all">All categories</option>
                {categoryOptions.map((category) => (
                  <option key={category} value={category}>
                    {formatLabel(category)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase text-gray-500 mb-2">Status</label>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500"
              >
                <option value="all">All statuses</option>
                {statusOptions.map((status) => (
                  <option key={status} value={status}>
                    {formatLabel(status)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase text-gray-500 mb-2">From</label>
              <input
                type="datetime-local"
                value={startDateTime}
                onChange={(event) => setStartDateTime(event.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase text-gray-500 mb-2">To</label>
              <input
                type="datetime-local"
                value={endDateTime}
                onChange={(event) => setEndDateTime(event.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500"
              />
            </div>
          </div>
          <div className="mt-4 text-xs uppercase tracking-[0.2em] text-gray-500">
            Showing {filteredTrips.length} of {scopedTrips.length} trips
          </div>
        </div>

        <div className="bg-white shadow rounded-lg">
          <div className="px-6 py-4 border-b">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-xl font-bold">{isAdmin ? "All Trips" : "Team Trips"}</h2>
              <div className="flex flex-wrap items-center gap-3">
                {!isAdmin ? (
                  <p className="text-xs uppercase tracking-[0.2em] text-gray-500">{filteredTrips.length} active entries</p>
                ) : null}
                <button
                  onClick={handleExport}
                  className="rounded-full border border-gray-300 px-4 py-1.5 text-sm font-semibold text-gray-700 hover:bg-gray-100"
                >
                  Download CSV
                </button>
              </div>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-[1120px] divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="min-w-[120px] px-5 py-3 text-left text-xs font-medium uppercase text-gray-500">Date</th>
                  <th className="min-w-[110px] px-5 py-3 text-left text-xs font-medium uppercase text-gray-500">Time</th>
                  <th className="min-w-[220px] px-5 py-3 text-left text-xs font-medium uppercase text-gray-500">Employee</th>
                  <th className="min-w-[150px] px-5 py-3 text-left text-xs font-medium uppercase text-gray-500">Category</th>
                  <th className="min-w-[130px] px-5 py-3 text-left text-xs font-medium uppercase text-gray-500">Distance (km)</th>
                  <th className="min-w-[170px] px-5 py-3 text-left text-xs font-medium uppercase text-gray-500">Reimbursement (CAD)</th>
                  <th className="min-w-[130px] px-5 py-3 text-left text-xs font-medium uppercase text-gray-500">Status</th>
                  <th className="sticky right-0 min-w-[220px] bg-gray-50 px-5 py-3 text-left text-xs font-medium uppercase text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredTrips.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-6 text-center text-sm text-gray-500">
                      {isManager ? "No trips have been submitted by your team yet." : "There are no trips to display."}
                    </td>
                  </tr>
                ) : null}
                {filteredTrips.map((trip) => {
                  const employeeInfo = resolveTripEmployee(trip);
                  const distanceKm = (trip.distanceInMiles || 0) * 1.60934;
                  const reimbursement = distanceKm * ratePerKm;
                  return (
                    <tr key={trip.id}>
                      <td className="px-5 py-4 whitespace-nowrap text-sm">{new Date(trip.startTime).toLocaleDateString()}</td>
                      <td className="px-5 py-4 whitespace-nowrap text-sm">
                        {new Date(trip.startTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </td>
                      <td className="px-5 py-4 whitespace-nowrap text-sm font-medium text-gray-800">{employeeInfo.name}</td>
                      <td className="px-5 py-4 whitespace-nowrap text-sm capitalize">{trip.category}</td>
                      <td className="px-5 py-4 whitespace-nowrap text-sm">{distanceKm.toFixed(2)} km</td>
                      <td className="px-5 py-4 whitespace-nowrap text-sm">${reimbursement.toFixed(2)}</td>
                      <td className="px-5 py-4 whitespace-nowrap">
                        <span
                          className={`px-2 py-1 text-xs rounded-full ${
                            trip.status === "approved"
                              ? "bg-green-100 text-green-800"
                              : trip.status === "rejected"
                                ? "bg-red-100 text-red-800"
                                : trip.status === "pending_approval"
                                  ? "bg-yellow-100 text-yellow-800"
                                  : "bg-gray-100 text-gray-800"
                          }`}
                        >
                          {formatLabel(trip.status)}
                        </span>
                      </td>
                      <td className="sticky right-0 bg-white px-5 py-4 whitespace-nowrap text-sm">
                        <div className="flex items-center gap-3">
                          <Link href={`/trips/${trip.id}`} className="text-blue-600 hover:text-blue-900">
                            View
                          </Link>
                          {trip.status === "pending_approval" ? (
                            <>
                              <button onClick={() => void handleApprove(trip.id)} className="text-green-600 hover:text-green-900">
                                Approve
                              </button>
                              <button onClick={() => void handleReject(trip.id)} className="text-yellow-600 hover:text-yellow-900">
                                Reject
                              </button>
                            </>
                          ) : null}
                          <button onClick={() => void handleDelete(trip.id)} className="text-red-600 hover:text-red-900">
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
