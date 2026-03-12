"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { platformLinks } from "@vlworkhub/config";
import type { SessionUser, UrsafeActiveSession, UrsafeEmergency, UrsafeShift, UrsafeTrip, UrsafeUser } from "@vlworkhub/types";
import { ErrorBanner, MetricCard, ShellHero, SectionCard } from "../../components/ursafe-ui";
import { getActiveSessions, getApiErrorMessage, getCurrentUser, getEmergencies, getShifts, getTrips, getUrsafeUsers } from "../../lib/ursafe-client";

export default function UrsafeDashboardPage() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [users, setUsers] = useState<UrsafeUser[]>([]);
  const [trips, setTrips] = useState<UrsafeTrip[]>([]);
  const [shifts, setShifts] = useState<UrsafeShift[]>([]);
  const [emergencies, setEmergencies] = useState<UrsafeEmergency[]>([]);
  const [sessions, setSessions] = useState<UrsafeActiveSession[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        setError(null);
        const [session, userItems, tripItems, shiftItems, emergencyItems, activeSessions] = await Promise.all([
          getCurrentUser(),
          getUrsafeUsers(),
          getTrips(),
          getShifts(),
          getEmergencies(true),
          getActiveSessions()
        ]);
        setUser(session);
        setUsers(userItems);
        setTrips(tripItems);
        setShifts(shiftItems);
        setEmergencies(emergencyItems);
        setSessions(activeSessions);
      } catch (loadError) {
        setError(getApiErrorMessage(loadError));
      }
    }

    void load();
  }, []);

  const pendingTrips = trips.filter((trip) => trip.status === "pending_approval").length;
  const activeShifts = shifts.filter((shift) => shift.status === "active").length;
  const kmsToday = trips.reduce((sum, trip) => sum + trip.distanceInMiles * 1.60934, 0);

  return (
    <div className="space-y-8">
      <ShellHero
        eyebrow="URSafe Operations"
        title="Field safety and mileage command center"
        description="This integrated URSafe workspace preserves the real operating flows from the legacy app: trip review, active shift monitoring, emergency response, and mobile presence tracking."
        ctaHref={`${platformLinks.root}/dashboard`}
        ctaLabel="Back to VLWorkHub"
        badge={user ? `Signed in as ${user.fullName}` : undefined}
      />

      {error ? <ErrorBanner message={error} /> : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Mileage Logs" value={String(trips.length)} helper="Trips captured across the org" tone="blue" />
        <MetricCard label="Pending Approval" value={String(pendingTrips)} helper="Trips waiting for manager review" tone="amber" />
        <MetricCard label="Active Shifts" value={String(activeShifts)} helper="Employees currently on duty" tone="emerald" />
        <MetricCard label="Open Emergencies" value={String(emergencies.length)} helper="Critical events needing response" tone="rose" />
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.3fr,1fr]">
        <SectionCard title="Operations Snapshot" description="The same URSafe workflow pillars from the legacy system are available here as first-class pages.">
          <div className="grid gap-4 md:grid-cols-2">
            <Link href="/mileage" className="rounded-3xl border border-sky-400/20 bg-sky-400/10 p-5 transition hover:border-sky-300">
              <p className="text-xs uppercase tracking-[0.3em] text-sky-200">Mileage Tracking</p>
              <h3 className="mt-3 text-2xl font-semibold text-white">Trips and reimbursements</h3>
              <p className="mt-2 text-sm text-slate-300">Start a trip, review mileage, approve submissions, and export operating totals.</p>
            </Link>
            <Link href="/incidents" className="rounded-3xl border border-rose-400/20 bg-rose-400/10 p-5 transition hover:border-rose-300">
              <p className="text-xs uppercase tracking-[0.3em] text-rose-200">Safety Incidents</p>
              <h3 className="mt-3 text-2xl font-semibold text-white">Emergency monitoring</h3>
              <p className="mt-2 text-sm text-slate-300">Monitor unresolved alerts, resolve incidents, and review team safety posture.</p>
            </Link>
            <Link href="/checklists" className="rounded-3xl border border-emerald-400/20 bg-emerald-400/10 p-5 transition hover:border-emerald-300">
              <p className="text-xs uppercase tracking-[0.3em] text-emerald-200">Shift Checklists</p>
              <h3 className="mt-3 text-2xl font-semibold text-white">Check-ins and shift safety</h3>
              <p className="mt-2 text-sm text-slate-300">Preserve the work-alone safety workflow with shift start, check-ins, and SOS escalation.</p>
            </Link>
            <Link href="/emergency-contacts" className="rounded-3xl border border-white/10 bg-white/5 p-5 transition hover:border-cyan-300">
              <p className="text-xs uppercase tracking-[0.3em] text-cyan-200">Emergency Contacts</p>
              <h3 className="mt-3 text-2xl font-semibold text-white">Contact and device watchlist</h3>
              <p className="mt-2 text-sm text-slate-300">Keep emergency contacts visible beside live mobile presence and device status.</p>
            </Link>
          </div>
        </SectionCard>

        <SectionCard title="Live Status" description="Immediate signal from active sessions, shifts, and emergency volume.">
          <div className="space-y-4">
            <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Connected Sessions</p>
              <p className="mt-2 text-3xl font-black text-white">{sessions.length}</p>
              <p className="mt-2 text-sm text-slate-400">{sessions.filter((session) => session.status === "online").length} broadcasting live location data.</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Mileage Volume</p>
              <p className="mt-2 text-3xl font-black text-white">{kmsToday.toFixed(1)} km</p>
              <p className="mt-2 text-sm text-slate-400">Total recorded distance from the shared PostgreSQL-backed API.</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Active Roster</p>
              <p className="mt-2 text-3xl font-black text-white">{users.filter((item) => item.isActive).length}</p>
              <p className="mt-2 text-sm text-slate-400">URSafe-enabled staff available to web and mobile workflows.</p>
            </div>
          </div>
        </SectionCard>
      </section>
    </div>
  );
}
