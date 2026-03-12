'use client';

import { useAuth } from '@/contexts/AuthContext';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { Trip, TripStatus, User, UserRole } from '@/types';
import AppHeader, { HeaderActionButton } from '@/components/AppHeader';

export default function TripsPage() {
  const { user, loading: authLoading, signOut } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const userIdFilter = searchParams.get('userId');
  const [trips, setTrips] = useState<Trip[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [ratePerKm, setRatePerKm] = useState(0.68);
  const [searchName, setSearchName] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [startDateTime, setStartDateTime] = useState('');
  const [endDateTime, setEndDateTime] = useState('');
  const isSuperAdmin = user?.role === UserRole.SUPER_ADMIN;
  const isAdmin = user?.role === UserRole.ADMIN || isSuperAdmin;
  const isManager = user?.role === UserRole.MANAGER;
  const headerBadge = isAdmin ? 'Operations' : 'My Team';
  const headerSubtitle = isAdmin
    ? 'Approve reimbursements, audit trip logs, and keep mileage policy tight'
    : 'View trip activity for employees assigned to you';
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;

    if (!user || (!isAdmin && !isManager)) {
      router.push('/login');
      return;
    }

    fetchData();
  }, [user, authLoading]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [tripsResponse, usersResponse, settingsResponse] = await Promise.all([
        fetch('/api/trips'),
        fetch('/api/users'),
        fetch('/api/settings'),
      ]);
      if (!tripsResponse.ok) throw new Error('Failed to fetch trips');
      if (!usersResponse.ok) throw new Error('Failed to fetch users');

      const tripsData = await tripsResponse.json();
      const usersData = await usersResponse.json();
      const settingsData = settingsResponse.ok ? await settingsResponse.json() : null;

      const typedTrips = tripsData as Trip[];
      const typedUsers = usersData as User[];
      const scopedUsers = typedUsers;

      if (settingsData) {
        const rateValue = settingsData.ratePerKm ?? settingsData.RatePerKm ?? 0.68;
        const rateNumber = Number(rateValue);
        setRatePerKm(Number.isFinite(rateNumber) ? rateNumber : 0.68);
      }

      setTrips(typedTrips);
      setUsers(scopedUsers);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const userById = useMemo(() => {
    return new Map(users.map((entry) => [entry.id, entry]));
  }, [users]);

  const scopedTrips = useMemo(() => {
    const effectiveUserIdFilter = isSuperAdmin ? userIdFilter : null;
    if (effectiveUserIdFilter) {
      return trips.filter((trip) => trip.userId === effectiveUserIdFilter);
    }

    const activeUserIds = new Set(users.filter((candidate) => candidate.isActive).map((candidate) => candidate.id));

    if (isAdmin) {
      return trips.filter((trip) => activeUserIds.has(trip.userId));
    }

    if (!user) return [];
    const managedIds = new Set(
      users
        .filter((candidate) => candidate.managerId === user.id && candidate.isActive)
        .map((candidate) => candidate.id)
    );
    if (user.isActive) {
      managedIds.add(user.id);
    }
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
        const employee = userById.get(trip.userId);
        const employeeName = employee ? `${employee.firstName} ${employee.lastName}`.trim().toLowerCase() : '';
        const employeeEmail = employee?.email?.toLowerCase() ?? '';
        if (query && !employeeName.includes(query) && !employeeEmail.includes(query)) {
          return false;
        }
        if (categoryFilter !== 'all' && trip.category !== categoryFilter) {
          return false;
        }
        if (statusFilter !== 'all' && trip.status !== statusFilter) {
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
    setSearchName('');
    setCategoryFilter('all');
    setStatusFilter('all');
    setStartDateTime('');
    setEndDateTime('');
  };

  const formatLabel = (value: string) => value.replace(/_/g, ' ');

  const handleExport = () => {
    const headers = [
      'Date',
      'Time',
      'Employee',
      'Email',
      'Category',
      'DistanceKm',
      'RatePerKm',
      'ReimbursementCad',
      'Status',
    ];

    const rows = filteredTrips.map((trip) => {
      const employee = userById.get(trip.userId);
      const distanceKm = (trip.distanceInMiles || 0) * 1.60934;
      const reimbursement = distanceKm * ratePerKm;
      return [
        trip.startTime ? new Date(trip.startTime).toLocaleDateString() : '',
        trip.startTime
          ? new Date(trip.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          : '',
        employee ? `${employee.firstName} ${employee.lastName}` : 'Unknown',
        employee?.email ?? '',
        trip.category,
        distanceKm.toFixed(2),
        ratePerKm.toFixed(2),
        reimbursement.toFixed(2),
        trip.status,
      ];
    });

    const escapeField = (value: string) => {
      const escaped = value.replace(/"/g, '""');
      return `"${escaped}"`;
    };

    const csv = [headers, ...rows]
      .map((row) => row.map((cell) => escapeField(String(cell))).join(','))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `trips_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleApprove = async (tripId: string) => {
    try {
      const response = await fetch('/api/trips', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: tripId, status: TripStatus.APPROVED }),
      });

      if (!response.ok) throw new Error('Failed to approve trip');
      fetchData();
    } catch (error) {
      console.error('Error approving trip:', error);
    }
  };

  const handleReject = async (tripId: string) => {
    try {
      const response = await fetch('/api/trips', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: tripId, status: TripStatus.REJECTED }),
      });

      if (!response.ok) throw new Error('Failed to reject trip');
      fetchData();
    } catch (error) {
      console.error('Error rejecting trip:', error);
    }
  };

  const handleDelete = async (tripId: string) => {
    if (!confirm('Are you sure you want to delete this trip? This action cannot be undone.')) {
      return;
    }

    try {
      const response = await fetch(`/api/trips?id=${tripId}`, {
        method: 'DELETE',
      });

      if (!response.ok) throw new Error('Failed to delete trip');
      fetchData();
    } catch (error) {
      console.error('Error deleting trip:', error);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    router.push('/login');
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
        eyebrow={headerBadge}
        title="Trips Management"
        subtitle={headerSubtitle}
        accent="blue"
        actions={(
          <>
            <HeaderActionButton
              label="Refresh"
              icon="🔄"
              tone="primary"
              onClick={fetchData}
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
        {isSuperAdmin && userIdFilter && (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
            Viewing trips for archived user ID: {userIdFilter}
          </div>
        )}
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
              <label className="block text-xs font-semibold uppercase text-gray-500 mb-2">
                Employee
              </label>
              <input
                type="text"
                value={searchName}
                onChange={(event) => setSearchName(event.target.value)}
                placeholder="Search by name or email"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase text-gray-500 mb-2">
                Category
              </label>
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
              <label className="block text-xs font-semibold uppercase text-gray-500 mb-2">
                Status
              </label>
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
              <label className="block text-xs font-semibold uppercase text-gray-500 mb-2">
                From
              </label>
              <input
                type="datetime-local"
                value={startDateTime}
                onChange={(event) => setStartDateTime(event.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase text-gray-500 mb-2">
                To
              </label>
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

        {/* Trips Table */}
        <div className="bg-white shadow rounded-lg">
          <div className="px-6 py-4 border-b">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-xl font-bold">{isAdmin ? 'All Trips' : 'Team Trips'}</h2>
              <div className="flex flex-wrap items-center gap-3">
                {!isAdmin && (
                  <p className="text-xs uppercase tracking-[0.2em] text-gray-500">
                    {filteredTrips.length} active entries
                  </p>
                )}
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
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Time</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Employee</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Distance (km)</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Reimbursement (CAD)</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredTrips.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-6 py-6 text-center text-sm text-gray-500">
                      {isManager
                        ? 'No trips have been submitted by your team yet.'
                        : 'There are no trips to display.'}
                    </td>
                  </tr>
                )}
                {filteredTrips.map((trip) => {
                  const employee = userById.get(trip.userId);
                  const distanceKm = (trip.distanceInMiles || 0) * 1.60934;
                  const reimbursement = distanceKm * ratePerKm;
                  return (
                    <tr key={trip.id}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {new Date(trip.startTime).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {new Date(trip.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {employee ? `${employee.firstName} ${employee.lastName}` : 'Unknown'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap capitalize">{trip.category}</td>
                      <td className="px-6 py-4 whitespace-nowrap">{distanceKm.toFixed(2)} km</td>
                      <td className="px-6 py-4 whitespace-nowrap">${reimbursement.toFixed(2)}</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 text-xs rounded-full ${
                          trip.status === TripStatus.APPROVED ? 'bg-green-100 text-green-800' :
                          trip.status === TripStatus.REJECTED ? 'bg-red-100 text-red-800' :
                          trip.status === TripStatus.PENDING_APPROVAL ? 'bg-yellow-100 text-yellow-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {formatLabel(trip.status)}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <div className="flex gap-2">
                          <Link
                            href={`/trips/${trip.id}`}
                            className="text-blue-600 hover:text-blue-900"
                          >
                            View
                          </Link>
                          {trip.status === TripStatus.PENDING_APPROVAL && (
                            <>
                              <button
                                onClick={() => handleApprove(trip.id)}
                                className="text-green-600 hover:text-green-900"
                              >
                                Approve
                              </button>
                              <button
                                onClick={() => handleReject(trip.id)}
                                className="text-yellow-600 hover:text-yellow-900"
                              >
                                Reject
                              </button>
                            </>
                          )}
                          <button
                            onClick={() => handleDelete(trip.id)}
                            className="text-red-600 hover:text-red-900"
                          >
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
