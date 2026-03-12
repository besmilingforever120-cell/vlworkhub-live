"use client";

import { useEffect, useMemo, useState } from "react";
import type { SessionUser, UrsafeTrip, UrsafeUser } from "@vlworkhub/types";
import { EmptyState, ErrorBanner, SectionCard, ShellHero } from "../../components/ursafe-ui";
import { createTrip, deleteTrip, getApiErrorMessage, getCurrentUser, getTrips, getUrsafeUsers, updateTrip } from "../../lib/ursafe-client";

const DEFAULT_ROUTE = [
  { latitude: 49.2827, longitude: -123.1207, timestamp: new Date().toISOString(), address: "VLWorkHub Hub" },
  { latitude: 49.2636, longitude: -123.1386, timestamp: new Date().toISOString(), address: "Client destination" }
];

export default function MileagePage() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [users, setUsers] = useState<UrsafeUser[]>([]);
  const [trips, setTrips] = useState<UrsafeTrip[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ category: "business", vehicleInfo: "", purpose: "", notes: "", distanceKm: "12.5" });

  const canApprove = user?.roles.some((role) => role === "Admin" || role === "Manager" || role === "IT") ?? false;

  async function load() {
    try {
      setError(null);
      const [session, roster, tripItems] = await Promise.all([getCurrentUser(), getUrsafeUsers(), getTrips()]);
      setUser(session);
      setUsers(roster);
      setTrips(tripItems);
    } catch (loadError) {
      setError(getApiErrorMessage(loadError));
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const userById = useMemo(() => new Map(users.map((item) => [item.id, item])), [users]);
  const pendingTrips = trips.filter((trip) => trip.status === "pending_approval");

  async function handleCreateTrip(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) return;

    try {
      setSaving(true);
      setError(null);
      const now = new Date();
      const startTime = new Date(now.getTime() - 45 * 60000).toISOString();
      const endTime = now.toISOString();
      const distanceInMiles = Number(form.distanceKm) / 1.60934;
      await createTrip({
        userId: user.id,
        category: form.category,
        vehicleInfo: form.vehicleInfo,
        purpose: form.purpose,
        notes: form.notes,
        startTime,
        endTime,
        distanceInMiles,
        startLocation: DEFAULT_ROUTE[0],
        endLocation: DEFAULT_ROUTE[1],
        route: DEFAULT_ROUTE.map((point, index) => ({ ...point, timestamp: index === 0 ? startTime : endTime }))
      });
      setForm({ category: "business", vehicleInfo: "", purpose: "", notes: "", distanceKm: "12.5" });
      await load();
    } catch (saveError) {
      setError(getApiErrorMessage(saveError));
    } finally {
      setSaving(false);
    }
  }

  async function updateStatus(id: string, status: string) {
    try {
      await updateTrip(id, { status });
      await load();
    } catch (statusError) {
      setError(getApiErrorMessage(statusError));
    }
  }

  async function removeTrip(id: string) {
    try {
      await deleteTrip(id);
      await load();
    } catch (deleteError) {
      setError(getApiErrorMessage(deleteError));
    }
  }

  return (
    <div className="space-y-8">
      <ShellHero
        eyebrow="Mileage Tracking"
        title="Trips, reimbursements, and mileage approval"
        description="This page merges the legacy URSafe trip review workflow with the mobile start-and-stop trip experience. Employees can log a trip here, and managers keep the original pending approval flow intact."
        badge={pendingTrips.length > 0 ? `${pendingTrips.length} pending approval` : "No pending approvals"}
      />

      {error ? <ErrorBanner message={error} /> : null}

      <section className="grid gap-6 xl:grid-cols-[0.95fr,1.35fr]">
        <SectionCard title="Start or submit a trip" description="Mirrors the standalone mobile trip workflow inside the integrated web app.">
          <form onSubmit={handleCreateTrip} className="space-y-4">
            <label className="block text-sm text-slate-200">
              Category
              <select className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white" value={form.category} onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))}>
                <option value="business">Business</option>
                <option value="personal">Personal</option>
                <option value="commute">Commute</option>
              </select>
            </label>
            <label className="block text-sm text-slate-200">
              Vehicle info
              <input className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white" value={form.vehicleInfo} onChange={(event) => setForm((current) => ({ ...current, vehicleInfo: event.target.value }))} placeholder="Toyota RAV4 or fleet van" />
            </label>
            <label className="block text-sm text-slate-200">
              Purpose
              <input className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white" value={form.purpose} onChange={(event) => setForm((current) => ({ ...current, purpose: event.target.value }))} placeholder="Client visit or medication pickup" />
            </label>
            <label className="block text-sm text-slate-200">
              Distance (km)
              <input className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white" value={form.distanceKm} onChange={(event) => setForm((current) => ({ ...current, distanceKm: event.target.value }))} inputMode="decimal" />
            </label>
            <label className="block text-sm text-slate-200">
              Notes
              <textarea className="mt-2 min-h-[110px] w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white" value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Context that approvers should see" />
            </label>
            <button disabled={saving} className="w-full rounded-2xl bg-cyan-400 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:opacity-60">
              {saving ? "Submitting trip..." : "Submit Trip"}
            </button>
          </form>
        </SectionCard>

        <SectionCard title="Approval queue" description="Pending approvals, reimbursement values, and the original manager actions remain visible here.">
          {trips.length === 0 ? (
            <EmptyState title="No trips yet" description="As employees submit mileage, their trip records will appear here." />
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm text-slate-200">
                <thead className="text-xs uppercase tracking-[0.25em] text-slate-400">
                  <tr>
                    <th className="pb-3 pr-4">Employee</th>
                    <th className="pb-3 pr-4">Category</th>
                    <th className="pb-3 pr-4">Distance</th>
                    <th className="pb-3 pr-4">Vehicle</th>
                    <th className="pb-3 pr-4">Status</th>
                    <th className="pb-3 pr-4">Purpose</th>
                    <th className="pb-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {trips.map((trip) => {
                    const owner = userById.get(trip.userId);
                    const reimbursement = trip.distanceInMiles * 1.60934 * 0.68;
                    return (
                      <tr key={trip.id} className="border-t border-white/10">
                        <td className="py-4 pr-4">
                          <p className="font-semibold text-white">{owner ? `${owner.firstName} ${owner.lastName}` : trip.userId}</p>
                          <p className="text-xs text-slate-400">{new Date(trip.startTime).toLocaleString()}</p>
                        </td>
                        <td className="py-4 pr-4 capitalize">{trip.category}</td>
                        <td className="py-4 pr-4">{(trip.distanceInMiles * 1.60934).toFixed(2)} km<br /><span className="text-xs text-slate-400">${reimbursement.toFixed(2)} CAD</span></td>
                        <td className="py-4 pr-4">{trip.vehicleInfo || "Not specified"}</td>
                        <td className="py-4 pr-4"><span className="rounded-full border border-white/10 px-3 py-1 text-xs uppercase tracking-[0.2em]">{trip.status.replace(/_/g, " ")}</span></td>
                        <td className="py-4 pr-4 text-slate-300">{trip.purpose || trip.notes || "No context supplied"}</td>
                        <td className="py-4 text-right">
                          <div className="flex flex-wrap justify-end gap-2">
                            {canApprove && trip.status === "pending_approval" ? (
                              <>
                                <button onClick={() => void updateStatus(trip.id, "approved")} className="rounded-full border border-emerald-400/30 px-3 py-1 text-xs font-semibold text-emerald-200">Approve</button>
                                <button onClick={() => void updateStatus(trip.id, "rejected")} className="rounded-full border border-amber-400/30 px-3 py-1 text-xs font-semibold text-amber-200">Reject</button>
                              </>
                            ) : null}
                            <button onClick={() => void removeTrip(trip.id)} className="rounded-full border border-rose-400/30 px-3 py-1 text-xs font-semibold text-rose-200">Delete</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      </section>
    </div>
  );
}
