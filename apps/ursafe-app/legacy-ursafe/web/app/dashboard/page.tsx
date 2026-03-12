'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Trip, TripStatus, User, UserRole } from '@/types';
import AppHeader, { HeaderActionButton } from '@/components/AppHeader';

export default function DashboardPage() {
  const { user, loading: authLoading, signOut } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalTrips: 0,
    totalMiles: 0,
    pendingApproval: 0,
    approvedMiles: 0,
  });
  const isSuperAdmin = user?.role === UserRole.SUPER_ADMIN;
  const isAdmin = user?.role === UserRole.ADMIN || isSuperAdmin;
  const isManager = user?.role === UserRole.MANAGER;
  const canViewDashboard = isAdmin || isManager;

  useEffect(() => {
    if (!authLoading) {
      if (!user || !canViewDashboard) {
        router.push('/login');
      } else {
        fetchData();
      }
    }
  }, [user, authLoading, canViewDashboard]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [tripsResponse, usersResponse] = await Promise.all([
        fetch('/api/trips'),
        fetch('/api/users'),
      ]);
      if (!tripsResponse.ok) throw new Error('Failed to fetch trips');
      if (!usersResponse.ok) throw new Error('Failed to fetch users');
      const tripsData = await tripsResponse.json();
      const usersData = await usersResponse.json();
      let scopedTrips = tripsData as Trip[];
      const activeUsers = (usersData as User[]).filter((candidate) => candidate.isActive);
      const activeUserIds = new Set(activeUsers.map((candidate) => candidate.id));

      if (isManager && user) {
        const managedIds = new Set(
          activeUsers
            .filter((candidate) => candidate.managerId === user.id)
            .map((candidate) => candidate.id)
        );
        if (user.isActive) {
          managedIds.add(user.id);
        }
        scopedTrips = scopedTrips.filter((trip) => managedIds.has(trip.userId));
      } else {
        scopedTrips = scopedTrips.filter((trip) => activeUserIds.has(trip.userId));
      }

      // Calculate stats (convert miles to kilometers)
      const totalTrips = scopedTrips.length;
      const totalKm = scopedTrips.reduce((sum, trip) => sum + (trip.distanceInMiles || 0), 0) * 1.60934;
      const pendingApproval = scopedTrips.filter((t) => t.status === TripStatus.PENDING_APPROVAL).length;
      const approvedKm = scopedTrips
        .filter((t: Trip) => t.status === TripStatus.APPROVED)
        .reduce((sum, trip) => sum + (trip.distanceInMiles || 0), 0) * 1.60934;

      setStats({ totalTrips, totalMiles: totalKm, pendingApproval, approvedMiles: approvedKm });
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
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
        title="URSafe App Dashboard"
        badge={isManager ? 'My Team' : undefined}
        badgeTone="blue"
        actions={(
          <HeaderActionButton
            label="Sign Out"
            icon="🚪"
            tone="danger"
            onClick={handleSignOut}
          />
        )}
        meta={`Signed in as ${user?.firstName ?? ''} ${user?.lastName ?? ''}`}
      />

      <main className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white p-6 rounded-lg shadow">
            <div className="text-sm text-gray-600">Total Trips</div>
            <div className="text-3xl font-bold text-blue-600">{stats.totalTrips}</div>
          </div>
          <div className="bg-white p-6 rounded-lg shadow">
            <div className="text-sm text-gray-600">Total Kilometers</div>
            <div className="text-3xl font-bold text-green-600">{stats.totalMiles.toFixed(2)}</div>
          </div>
          <div className="bg-white p-6 rounded-lg shadow">
            <div className="text-sm text-gray-600">Pending Approval</div>
            <div className="text-3xl font-bold text-yellow-600">{stats.pendingApproval}</div>
          </div>
          <div className="bg-white p-6 rounded-lg shadow">
            <div className="text-sm text-gray-600">Approved Kilometers</div>
            <div className="text-3xl font-bold text-purple-600">{stats.approvedMiles.toFixed(2)}</div>
          </div>
        </div>

        {/* Quick Links */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <button
            onClick={() => router.push('/live-tracking')}
            className="bg-white p-8 rounded-lg shadow hover:shadow-lg transition-shadow border-2 border-green-500"
          >
            <div className="flex items-center justify-between">
              <div className="text-left">
                <h3 className="text-2xl font-bold text-gray-900 mb-2">Live Tracking</h3>
                <p className="text-gray-600">Monitor employees in real-time</p>
              </div>
              <div className="text-4xl text-green-600">🗺️</div>
            </div>
          </button>

          <button
            onClick={() => router.push('/users')}
            className="bg-white p-8 rounded-lg shadow hover:shadow-lg transition-shadow"
          >
            <div className="flex items-center justify-between">
              <div className="text-left">
                <h3 className="text-2xl font-bold text-gray-900 mb-2">Users</h3>
                <p className="text-gray-600">View and manage all users</p>
              </div>
              <div className="text-4xl text-purple-600">👥</div>
            </div>
          </button>

          <button
            onClick={() => router.push('/trips')}
            className="bg-white p-8 rounded-lg shadow hover:shadow-lg transition-shadow"
          >
            <div className="flex items-center justify-between">
              <div className="text-left">
                <h3 className="text-2xl font-bold text-gray-900 mb-2">Trips</h3>
                <p className="text-gray-600">View and approve trips</p>
              </div>
              <div className="text-4xl text-blue-600">🚗</div>
            </div>
          </button>

          <button
            onClick={() => router.push('/safety-monitoring')}
            className="bg-white p-8 rounded-lg shadow hover:shadow-lg transition-shadow border-2 border-red-500"
          >
            <div className="flex items-center justify-between">
              <div className="text-left">
                <h3 className="text-2xl font-bold text-gray-900 mb-2">Safety Center</h3>
                <p className="text-gray-600">Manage emergencies & incidents</p>
              </div>
              <div className="text-4xl text-red-600">🛡️</div>
            </div>
          </button>

          <button
            onClick={() => router.push('/safety-monitoring/history')}
            className="bg-white p-8 rounded-lg shadow hover:shadow-lg transition-shadow border-2 border-indigo-500"
          >
            <div className="flex items-center justify-between">
              <div className="text-left">
                <h3 className="text-2xl font-bold text-gray-900 mb-2">Shift History</h3>
                <p className="text-gray-600">Review timelines & check-ins</p>
              </div>
              <div className="text-4xl text-indigo-600">🕒</div>
            </div>
          </button>

          {isSuperAdmin && (
            <button
              onClick={() => router.push('/settings')}
              className="bg-white p-8 rounded-lg shadow hover:shadow-lg transition-shadow"
            >
              <div className="flex items-center justify-between">
                <div className="text-left">
                  <h3 className="text-2xl font-bold text-gray-900 mb-2">Settings</h3>
                  <p className="text-gray-600">Configure system settings</p>
                </div>
                <div className="text-4xl text-gray-600">⚙️</div>
              </div>
            </button>
          )}
        </div>
      </main>
    </div>
  );
}
