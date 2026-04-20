"use client";

import Link from "next/link";
import type { Route } from "next";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import type { SessionUser, UrsafeLocation, UrsafeTrip, UrsafeUser } from "@vlworkhub/types";
import { EmptyState, ErrorBanner } from "../../../components/ursafe-ui";
import {
  deleteTrip,
  getApiErrorMessage,
  getCurrentUser,
  getTrip,
  getUrsafeUsers,
  updateTrip
} from "../../../lib/ursafe-client";

const TripRouteMap = dynamic(() => import("../../../components/trip-route-map"), { ssr: false });

export default function TripDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<SessionUser | null>(null);
  const [trip, setTrip] = useState<UrsafeTrip | null>(null);
  const [users, setUsers] = useState<UrsafeUser[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      setError(null);
      const [sessionUser, tripItem, roster] = await Promise.all([
        getCurrentUser(),
        getTrip(params.id),
        getUrsafeUsers()
      ]);
      setCurrentUser(sessionUser);
      setTrip(tripItem);
      setUsers(roster);
    } catch (loadError) {
      setError(getApiErrorMessage(loadError));
    }
  }

  useEffect(() => {
    if (params?.id) {
      void load();
    }
  }, [params?.id]);

  const tripOwner = useMemo(() => users.find((item) => item.id === trip?.userId), [users, trip?.userId]);

  const tripEmployee = useMemo(() => {
    if (!trip) return "Unknown employee";
    const tripLike = trip as UrsafeTrip & {
      first_name?: string;
      last_name?: string;
      email?: string;
    };
    const fullName = `${tripLike.first_name || tripOwner?.firstName || ""} ${tripLike.last_name || tripOwner?.lastName || ""}`.trim();
    return fullName || tripLike.email || tripOwner?.email || trip.userId;
  }, [trip, tripOwner]);

  const routeTimeline = useMemo(() => {
    if (!trip) {
      return [] as UrsafeLocation[];
    }

    if (trip.route.length > 0) {
      return trip.route;
    }

    const fallback: UrsafeLocation[] = [];
    if (trip.startLocation) {
      fallback.push({
        ...trip.startLocation,
        timestamp: trip.startLocation.timestamp || trip.startTime
      });
    }
    if (trip.endLocation) {
      fallback.push({
        ...trip.endLocation,
        timestamp: trip.endLocation.timestamp || trip.endTime || trip.startTime
      });
    }

    return fallback;
  }, [trip]);

  const canApprove = currentUser?.roles.some((role) => role === "Admin" || role === "Manager" || role === "IT") ?? false;

  async function handleStatus(status: string) {
    if (!trip) return;
    try {
      await updateTrip(trip.id, { status });
      await load();
    } catch (statusError) {
      setError(getApiErrorMessage(statusError));
    }
  }

  async function handleDelete() {
    if (!trip) return;
    try {
      await deleteTrip(trip.id);
      router.push("/trips");
    } catch (deleteError) {
      setError(getApiErrorMessage(deleteError));
    }
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        {error ? <ErrorBanner message={error} /> : null}

        {!trip ? (
          <EmptyState title="Trip not found" description="The requested trip could not be loaded." />
        ) : (
          <>
            <section className="rounded-lg border border-gray-200 bg-white px-6 py-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Trip Detail</p>
                  <h1 className="mt-2 text-2xl font-bold text-gray-900">Trip {trip.id}</h1>
                </div>
                <span
                  className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.1em] ${
                    trip.status === "approved"
                      ? "bg-green-100 text-green-800"
                      : trip.status === "rejected"
                        ? "bg-red-100 text-red-800"
                        : "bg-amber-100 text-amber-800"
                  }`}
                >
                  {trip.status.replace(/_/g, " ")}
                </span>
              </div>
            </section>

            <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              <TripRouteMap route={trip.route} startLocation={trip.startLocation} endLocation={trip.endLocation} />
            </section>

            <section className="grid gap-6 lg:grid-cols-2">
              <article className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
                <h2 className="text-lg font-semibold text-gray-900">Trip Summary</h2>
                <div className="mt-4 grid gap-4 text-sm text-gray-700 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.15em] text-gray-500">Employee</p>
                    <p className="mt-1 text-gray-900">{tripEmployee}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.15em] text-gray-500">Category</p>
                    <p className="mt-1 capitalize text-gray-900">{trip.category}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.15em] text-gray-500">Distance</p>
                    <p className="mt-1 text-gray-900">{(trip.distanceInMiles * 1.60934).toFixed(2)} km</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.15em] text-gray-500">Started</p>
                    <p className="mt-1 text-gray-900">{new Date(trip.startTime).toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.15em] text-gray-500">Ended</p>
                    <p className="mt-1 text-gray-900">{trip.endTime ? new Date(trip.endTime).toLocaleString() : "In progress"}</p>
                  </div>
                  <div className="sm:col-span-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.15em] text-gray-500">Purpose</p>
                    <p className="mt-1 text-gray-900">{trip.purpose || "No purpose provided"}</p>
                  </div>
                  <div className="sm:col-span-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.15em] text-gray-500">Vehicle</p>
                    <p className="mt-1 text-gray-900">{trip.vehicleInfo || "Not specified"}</p>
                  </div>
                  <div className="sm:col-span-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.15em] text-gray-500">Notes</p>
                    <p className="mt-1 text-gray-900">{trip.notes || "No notes supplied"}</p>
                  </div>
                </div>

                <div className="mt-5 flex flex-wrap gap-2 border-t border-gray-100 pt-4">
                  <Link href={"/trips" as Route} className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
                    Back to Trips
                  </Link>
                  {canApprove && trip.status === "pending_approval" ? (
                    <>
                      <button
                        type="button"
                        onClick={() => void handleStatus("approved")}
                        className="rounded-md border border-green-300 px-3 py-2 text-sm font-medium text-green-700 hover:bg-green-50"
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleStatus("rejected")}
                        className="rounded-md border border-amber-300 px-3 py-2 text-sm font-medium text-amber-700 hover:bg-amber-50"
                      >
                        Reject
                      </button>
                    </>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => void handleDelete()}
                    className="rounded-md border border-red-300 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
                  >
                    Delete
                  </button>
                </div>
              </article>

              <article className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
                <h2 className="text-lg font-semibold text-gray-900">Route Timeline</h2>
                {routeTimeline.length === 0 ? (
                  <div className="mt-4 rounded-lg border border-dashed border-gray-300 p-6 text-sm text-gray-500">
                    No route points available for this trip.
                  </div>
                ) : (
                  <div className="mt-4 space-y-3">
                    {routeTimeline.map((point, index) => (
                      <div key={`${trip.id}-${index}-${point.timestamp}`} className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-sm font-semibold text-gray-900">
                            {index === 0 ? "Start point" : index === routeTimeline.length - 1 ? "End point" : `Waypoint ${index}`}
                          </p>
                          <p className="text-xs text-gray-500">{new Date(point.timestamp).toLocaleString()}</p>
                        </div>
                        <p className="mt-2 text-sm text-gray-700">{point.address || `${point.latitude}, ${point.longitude}`}</p>
                        <p className="mt-1 text-xs text-gray-500">{point.latitude.toFixed(5)}, {point.longitude.toFixed(5)}</p>
                      </div>
                    ))}
                  </div>
                )}
              </article>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
