"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { platformLinks } from "@vlworkhub/config";
import type { SessionUser, UrsafeTrip, UrsafeUser } from "@vlworkhub/types";
import { ErrorBanner } from "../../components/ursafe-ui";
import UrsafeAppHeader, { HeaderActionButton } from "../../components/ursafe-app-header";
import { getApiErrorMessage, getCurrentUser, getTrips, getUrsafeUsers } from "../../lib/ursafe-client";

type DashboardStats = {
  totalTrips: number;
  totalKilometers: number;
  pendingApproval: number;
  approvedKilometers: number;
};

const defaultStats: DashboardStats = {
  totalTrips: 0,
  totalKilometers: 0,
  pendingApproval: 0,
  approvedKilometers: 0
};

function resolveRole(user: SessionUser | null) {
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

function getScopedTrips(trips: UrsafeTrip[], users: UrsafeUser[], user: SessionUser | null, isManager: boolean) {
  const activeUsers = users.filter((candidate) => candidate.isActive);
  const activeUserIds = new Set(activeUsers.map((candidate) => candidate.id));

  if (!user) {
    return trips.filter((trip) => activeUserIds.has(trip.userId));
  }

  if (!isManager) {
    return trips.filter((trip) => activeUserIds.has(trip.userId));
  }

  const managedIds = new Set(
    activeUsers.filter((candidate) => candidate.managerId === user.id).map((candidate) => candidate.id)
  );

  if (activeUserIds.has(user.id)) {
    managedIds.add(user.id);
  }

  return trips.filter((trip) => managedIds.has(trip.userId));
}

function formatKilometers(value: number) {
  return value.toFixed(2);
}

async function signOut() {
  const response = await fetch(`${platformLinks.api}/auth/logout`, {
    method: "POST",
    credentials: "include"
  }).catch(() => null);

  if (!response?.ok) {
    throw new Error("Failed to sign out.");
  }
}

function QuickLinkCard(props: {
  title: string;
  description: string;
  emoji: string;
  href: Route;
  borderClassName?: string;
  onClick: (href: Route) => void;
}) {
  return (
    <button
      onClick={() => props.onClick(props.href)}
      className={`rounded-lg border bg-white p-8 text-left shadow transition-shadow hover:shadow-lg ${props.borderClassName ?? "border-slate-200"}`}
      type="button"
    >
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="mb-2 text-2xl font-bold text-slate-900">{props.title}</h3>
          <p className="text-sm text-slate-600">{props.description}</p>
        </div>
        <div className="text-4xl">{props.emoji}</div>
      </div>
    </button>
  );
}

export default function UrsafeDashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [stats, setStats] = useState<DashboardStats>(defaultStats);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { isSuperAdmin, isAdmin } = resolveRole(user);

  useEffect(() => {
    async function load() {
      try {
        setError(null);
        setLoading(true);

        const [session, tripsData, usersData] = await Promise.all([getCurrentUser(), getTrips(), getUrsafeUsers()]);
        setUser(session);

        const sessionRoleState = resolveRole(session);
        const scopedTrips = getScopedTrips(tripsData, usersData, session, sessionRoleState.isManager);
        const totalTrips = scopedTrips.length;
        const totalKilometers = scopedTrips.reduce((sum, trip) => sum + (trip.distanceInMiles || 0), 0) * 1.60934;
        const pendingApproval = scopedTrips.filter((trip) => trip.status === "pending_approval").length;
        const approvedKilometers =
          scopedTrips.filter((trip) => trip.status === "approved").reduce((sum, trip) => sum + (trip.distanceInMiles || 0), 0) * 1.60934;

        setStats({
          totalTrips,
          totalKilometers,
          pendingApproval,
          approvedKilometers
        });
      } catch (loadError) {
        setError(getApiErrorMessage(loadError));
        setStats(defaultStats);
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, []);

  const signedInLabel = user ? `Signed in as ${user.fullName}` : "Signed in";

  return (
    <div className="min-h-screen bg-gray-100">
      <UrsafeAppHeader
        title="URSafe App Dashboard"
        badge={isAdmin ? "Admin" : "My Team"}
        badgeTone="blue"
        meta={signedInLabel}
        actions={
          <HeaderActionButton
            label="Sign Out"
            icon="🚪"
            tone="danger"
            onClick={async () => {
              try {
                await signOut();
              } catch {
                // keep redirect behavior even if logout request fails
              }
              router.push("/");
              router.refresh();
            }}
          />
        }
      />

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {error ? <ErrorBanner message={error} /> : null}

        {loading ? (
          <div className="flex min-h-[320px] items-center justify-center rounded-lg bg-white shadow">
            <div className="text-xl text-slate-700">Loading...</div>
          </div>
        ) : (
          <>
            <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-lg bg-white p-6 shadow">
                <div className="text-sm text-slate-600">Total Trips</div>
                <div className="text-3xl font-bold text-blue-600">{stats.totalTrips}</div>
              </div>
              <div className="rounded-lg bg-white p-6 shadow">
                <div className="text-sm text-slate-600">Total Kilometers</div>
                <div className="text-3xl font-bold text-green-600">{formatKilometers(stats.totalKilometers)}</div>
              </div>
              <div className="rounded-lg bg-white p-6 shadow">
                <div className="text-sm text-slate-600">Pending Approval</div>
                <div className="text-3xl font-bold text-yellow-600">{stats.pendingApproval}</div>
              </div>
              <div className="rounded-lg bg-white p-6 shadow">
                <div className="text-sm text-slate-600">Approved Kilometers</div>
                <div className="text-3xl font-bold text-purple-600">{formatKilometers(stats.approvedKilometers)}</div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
              <QuickLinkCard
                title="Live Tracking"
                description="Monitor employees in real-time"
                emoji="🗺️"
                href="/live-tracking"
                borderClassName="border-2 border-green-500"
                onClick={(href) => router.push(href)}
              />

              <QuickLinkCard
                title="Trips"
                description="View and approve trips"
                emoji="🚗"
                href="/trips"
                onClick={(href) => router.push(href)}
              />

              <QuickLinkCard
                title="Safety Center"
                description="Manage emergencies and incidents"
                emoji="🛡️"
                href="/safety-monitoring"
                borderClassName="border-2 border-red-500"
                onClick={(href) => router.push(href)}
              />

              <QuickLinkCard
                title="Shift History"
                description="Review timelines and check-ins"
                emoji="🕒"
                href="/shift-history"
                borderClassName="border-2 border-indigo-500"
                onClick={(href) => router.push(href)}
              />

              {isSuperAdmin || isAdmin ? (
                <QuickLinkCard
                  title="Settings"
                  description="Configure system settings"
                  emoji="⚙️"
                  href="/settings"
                  onClick={(href) => router.push(href)}
                />
              ) : null}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
