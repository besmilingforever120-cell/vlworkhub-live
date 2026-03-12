'use client';

import dynamic from 'next/dynamic';
import { useRouter, useParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Location, Trip, User, UserRole } from '@/types';
import AppHeader, { HeaderActionButton } from '@/components/AppHeader';

const TripRouteMap = dynamic(() => import('@/components/TripRouteMap'), { ssr: false });

export default function TripDetailsPage() {
  const { user, loading: authLoading, signOut } = useAuth();
  const router = useRouter();
  const params = useParams();
  const tripId = Array.isArray(params?.id) ? params.id[0] : params?.id;
  const [trip, setTrip] = useState<Trip | null>(null);
  const [routePoints, setRoutePoints] = useState<Location[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [ratePerKm, setRatePerKm] = useState(0.68);
  const [loading, setLoading] = useState(true);
  const isSuperAdmin = user?.role === UserRole.SUPER_ADMIN;

  useEffect(() => {
    if (authLoading) return;

    if (!user || (user.role !== UserRole.ADMIN && user.role !== UserRole.MANAGER && user.role !== UserRole.SUPER_ADMIN)) {
      router.push('/login');
      return;
    }

    if (!tripId) return;

    const fetchTripDetails = async () => {
      setLoading(true);
      try {
        const [tripResponse, routeResponse, usersResponse, settingsResponse] = await Promise.all([
          fetch(`/api/trips?tripId=${tripId}`),
          fetch(`/api/trips/route-points?tripId=${tripId}`),
          fetch('/api/users'),
          fetch('/api/settings'),
        ]);

        if (!tripResponse.ok) throw new Error('Failed to load trip');
        const tripData = await tripResponse.json();
        const routeData = routeResponse.ok ? await routeResponse.json() : [];
        const usersData = usersResponse.ok ? await usersResponse.json() : [];
        const settingsData = settingsResponse.ok ? await settingsResponse.json() : null;

        if (settingsData) {
          const rateValue = settingsData.ratePerKm ?? settingsData.RatePerKm ?? 0.68;
          const rateNumber = Number(rateValue);
          setRatePerKm(Number.isFinite(rateNumber) ? rateNumber : 0.68);
        }

        if (user?.role === 'manager') {
          const tripOwner = usersData.find((entry: User) => entry.id === tripData.userId);
          const isOwner = tripData.userId === user.id;
          const isManaged = tripOwner?.managerId === user.id;
          if (!isOwner && !isManaged) {
            router.push('/trips');
            return;
          }
        }

        setTrip(tripData);
        setRoutePoints(routeData);
        const scopedUsers = isSuperAdmin ? usersData : usersData.filter((candidate: User) => candidate.isActive);
        setUsers(scopedUsers);
      } catch (error) {
        console.error('Error fetching trip details:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchTripDetails();
  }, [authLoading, user, router, tripId]);

  const employee = useMemo(() => {
    return users.find((entry) => entry.id === trip?.userId);
  }, [users, trip]);

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

  if (!trip) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-xl text-gray-500">Trip not found.</div>
      </div>
    );
  }

  const distanceKm = (trip.distanceInMiles || 0) * 1.60934;
  const reimbursement = distanceKm * ratePerKm;
  const startLocation = trip.startLocation;
  const endLocation = trip.endLocation;
  const startAddress = startLocation?.address ?? null;
  const endAddress = endLocation?.address ?? null;
  const routeForMap = routePoints.length > 0 ? routePoints : trip.route || [];

  return (
    <div className="min-h-screen bg-gray-100">
      <AppHeader
        eyebrow="Trip Detail"
        title="Trip Audit"
        subtitle="Review route points, distance, and reimbursement details."
        accent="slate"
        actions={(
          <>
            <HeaderActionButton
              label="Back to Trips"
              icon="⬅"
              tone="neutral"
              href="/trips"
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

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <div className="h-[420px] rounded-lg border border-gray-200 bg-white p-4 shadow">
              <TripRouteMap route={routeForMap} startLocation={startLocation} endLocation={endLocation} />
            </div>
            <div className="mt-4 flex flex-wrap gap-3 text-xs uppercase tracking-[0.2em] text-gray-500">
              <span>{routePoints.length} route points</span>
              <span>Status: {trip.status.replace(/_/g, ' ')}</span>
              <span>Category: {trip.category}</span>
            </div>
          </div>
          <div className="space-y-4">
            <div className="rounded-lg border border-gray-200 bg-white p-4 shadow">
              <h2 className="text-lg font-semibold text-gray-900">Trip Summary</h2>
              <div className="mt-3 space-y-2 text-sm text-gray-700">
                <p><strong>Employee:</strong> {employee ? `${employee.firstName} ${employee.lastName}` : 'Unknown'}</p>
                <p><strong>Start:</strong> {new Date(trip.startTime).toLocaleString()}</p>
                {trip.endTime && <p><strong>End:</strong> {new Date(trip.endTime).toLocaleString()}</p>}
                <p><strong>Distance:</strong> {distanceKm.toFixed(2)} km</p>
                <p><strong>Rate:</strong> ${ratePerKm.toFixed(2)} per km</p>
                <p><strong>Reimbursement:</strong> ${reimbursement.toFixed(2)}</p>
                {trip.purpose && <p><strong>Purpose:</strong> {trip.purpose}</p>}
                {trip.notes && <p><strong>Notes:</strong> {trip.notes}</p>}
              </div>
            </div>

            <div className="rounded-lg border border-gray-200 bg-white p-4 shadow">
              <h2 className="text-lg font-semibold text-gray-900">Locations</h2>
              <div className="mt-3 space-y-2 text-sm text-gray-700">
                {startLocation && (
                  <p>
                    <strong>Start:</strong> {startAddress || `${startLocation.latitude.toFixed(5)}, ${startLocation.longitude.toFixed(5)}`}
                  </p>
                )}
                {endLocation && (
                  <p>
                    <strong>End:</strong> {endAddress || `${endLocation.latitude.toFixed(5)}, ${endLocation.longitude.toFixed(5)}`}
                  </p>
                )}
                {startLocation && (
                  <a
                    href={`https://maps.google.com/?q=${startLocation.latitude},${startLocation.longitude}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center text-blue-600 hover:underline"
                  >
                    Open start location in maps
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
