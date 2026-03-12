"use client";

import { useEffect, useMemo, useState } from "react";
import type { SessionUser, UrsafeEmergency, UrsafeShift, UrsafeUser } from "@vlworkhub/types";
import { EmptyState, ErrorBanner, SectionCard, ShellHero } from "../../components/ursafe-ui";
import { getApiErrorMessage, getCurrentUser, getEmergencies, getShifts, getUrsafeUsers, resolveEmergency } from "../../lib/ursafe-client";

export default function IncidentsPage() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [users, setUsers] = useState<UrsafeUser[]>([]);
  const [shifts, setShifts] = useState<UrsafeShift[]>([]);
  const [emergencies, setEmergencies] = useState<UrsafeEmergency[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [resolution, setResolution] = useState({ resolution: "", actionsTaken: "", employeeSafe: "unknown", canResumeWork: "pending_investigation", followUpRequired: false, followUpNotes: "" });

  async function load() {
    try {
      setError(null);
      const [session, roster, shiftItems, emergencyItems] = await Promise.all([
        getCurrentUser(),
        getUrsafeUsers(),
        getShifts(),
        getEmergencies(false)
      ]);
      setUser(session);
      setUsers(roster);
      setShifts(shiftItems);
      setEmergencies(emergencyItems);
    } catch (loadError) {
      setError(getApiErrorMessage(loadError));
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const userById = useMemo(() => new Map(users.map((item) => [item.id, item])), [users]);
  const unresolved = emergencies.filter((item) => !item.resolved);

  async function handleResolve() {
    if (!resolvingId || !resolution.resolution || !resolution.actionsTaken) {
      return;
    }

    try {
      await resolveEmergency(resolvingId, {
        ...resolution,
        resolvedAt: new Date().toISOString(),
        originalNotes: emergencies.find((item) => item.id === resolvingId)?.notes || ""
      });
      setResolvingId(null);
      setResolution({ resolution: "", actionsTaken: "", employeeSafe: "unknown", canResumeWork: "pending_investigation", followUpRequired: false, followUpNotes: "" });
      await load();
    } catch (resolveError) {
      setError(getApiErrorMessage(resolveError));
    }
  }

  return (
    <div className="space-y-8">
      <ShellHero
        eyebrow="Safety Desk"
        title="Emergency monitoring and incident resolution"
        description="This workspace keeps the legacy URSafe emergency workflow intact: unresolved alerts rise to the top, shifts stay visible, and managers record formal resolution details before clearing an incident."
        badge={`${unresolved.length} unresolved`}
      />

      {error ? <ErrorBanner message={error} /> : null}

      <section className="grid gap-6 lg:grid-cols-[0.85fr,1.15fr]">
        <SectionCard title="Critical incidents" description="Every unresolved event is prioritized here before standard shift monitoring.">
          {unresolved.length === 0 ? (
            <EmptyState title="No critical incidents" description="Open emergency alerts will appear here immediately." />
          ) : (
            <div className="space-y-4">
              {unresolved.map((item) => {
                const employee = userById.get(item.userId);
                return (
                  <div key={item.id} className="rounded-3xl border border-rose-400/30 bg-rose-400/10 p-5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-xs uppercase tracking-[0.3em] text-rose-200">{item.type.replace(/_/g, " ")}</p>
                        <h3 className="mt-2 text-xl font-semibold text-white">{employee ? `${employee.firstName} ${employee.lastName}` : item.userId}</h3>
                        <p className="mt-2 text-sm text-rose-100">{item.notes || "No notes captured."}</p>
                      </div>
                      <button onClick={() => setResolvingId(item.id)} className="rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-white">
                        Resolve
                      </button>
                    </div>
                    <div className="mt-4 grid gap-3 text-sm text-rose-100 md:grid-cols-2">
                      <div>Triggered: {new Date(item.timestamp).toLocaleString()}</div>
                      <div>Location: {item.location?.address || "GPS unavailable"}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </SectionCard>

        <SectionCard title="Shift watchlist" description="Real-time employee shift context stays beside the emergency queue.">
          <div className="space-y-4">
            {shifts.length === 0 ? <EmptyState title="No shifts available" description="Shifts appear here when staff start work-alone monitoring." /> : null}
            {shifts.map((shift) => {
              const employee = userById.get(shift.userId);
              const openIncident = unresolved.find((item) => item.shiftId === shift.id || item.userId === shift.userId);
              return (
                <div key={shift.id} className={`rounded-3xl border p-5 ${openIncident ? "border-rose-400/30 bg-rose-400/10" : "border-white/10 bg-white/5"}`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Shift {shift.status}</p>
                      <h3 className="mt-2 text-xl font-semibold text-white">{employee ? `${employee.firstName} ${employee.lastName}` : shift.userId}</h3>
                      <p className="mt-2 text-sm text-slate-300">{shift.clientName || "No client recorded"}{shift.clientAddress ? ` · ${shift.clientAddress}` : ""}</p>
                    </div>
                    {openIncident ? <span className="rounded-full border border-rose-400/30 px-3 py-1 text-xs uppercase tracking-[0.2em] text-rose-100">Emergency linked</span> : <span className="rounded-full border border-emerald-400/30 px-3 py-1 text-xs uppercase tracking-[0.2em] text-emerald-100">Monitoring only</span>}
                  </div>
                  <div className="mt-4 grid gap-3 text-sm text-slate-300 md:grid-cols-3">
                    <div>Started: {new Date(shift.startTime).toLocaleString()}</div>
                    <div>Check-ins: {shift.checkInCount}</div>
                    <div>Last check-in: {shift.lastCheckIn ? new Date(shift.lastCheckIn).toLocaleTimeString() : "Awaiting first check-in"}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </SectionCard>
      </section>

      <SectionCard title="Resolved history" description="Past incidents remain searchable and visible for audit purposes.">
        {emergencies.filter((item) => item.resolved).length === 0 ? (
          <EmptyState title="No resolved incidents yet" description="Completed emergency resolutions will accumulate here." />
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {emergencies.filter((item) => item.resolved).map((item) => {
              const employee = userById.get(item.userId);
              return (
                <div key={item.id} className="rounded-3xl border border-white/10 bg-slate-950/40 p-5">
                  <p className="text-xs uppercase tracking-[0.3em] text-slate-400">{item.type.replace(/_/g, " ")}</p>
                  <h3 className="mt-2 text-lg font-semibold text-white">{employee ? `${employee.firstName} ${employee.lastName}` : item.userId}</h3>
                  <p className="mt-3 text-sm text-slate-300">{item.resolution || item.notes || "Resolution details unavailable."}</p>
                  <p className="mt-3 text-xs text-slate-400">Resolved {item.resolvedAt ? new Date(item.resolvedAt).toLocaleString() : "recently"}</p>
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>

      {resolvingId ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4">
          <div className="w-full max-w-2xl rounded-[2rem] border border-white/10 bg-slate-900 p-6">
            <h2 className="text-2xl font-semibold text-white">Resolve incident</h2>
            <div className="mt-5 space-y-4">
              <textarea className="min-h-[110px] w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white" placeholder="Resolution summary" value={resolution.resolution} onChange={(event) => setResolution((current) => ({ ...current, resolution: event.target.value }))} />
              <textarea className="min-h-[100px] w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white" placeholder="Actions taken" value={resolution.actionsTaken} onChange={(event) => setResolution((current) => ({ ...current, actionsTaken: event.target.value }))} />
              <div className="grid gap-4 md:grid-cols-2">
                <select className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white" value={resolution.employeeSafe} onChange={(event) => setResolution((current) => ({ ...current, employeeSafe: event.target.value }))}>
                  <option value="unknown">Employee safety unknown</option>
                  <option value="yes">Employee safe</option>
                  <option value="no">Employee not yet safe</option>
                </select>
                <select className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white" value={resolution.canResumeWork} onChange={(event) => setResolution((current) => ({ ...current, canResumeWork: event.target.value }))}>
                  <option value="pending_investigation">Pending investigation</option>
                  <option value="yes">Can resume work</option>
                  <option value="no">Cannot resume work</option>
                  <option value="requires_medical">Needs medical clearance</option>
                </select>
              </div>
              <label className="flex items-center gap-3 text-sm text-slate-300">
                <input type="checkbox" checked={resolution.followUpRequired} onChange={(event) => setResolution((current) => ({ ...current, followUpRequired: event.target.checked }))} />
                Follow-up required
              </label>
              {resolution.followUpRequired ? <textarea className="min-h-[80px] w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white" placeholder="Follow-up notes" value={resolution.followUpNotes} onChange={(event) => setResolution((current) => ({ ...current, followUpNotes: event.target.value }))} /> : null}
              <div className="flex flex-wrap justify-end gap-3">
                <button onClick={() => setResolvingId(null)} className="rounded-full border border-white/15 px-4 py-2 text-sm font-semibold text-slate-200">Cancel</button>
                <button onClick={() => void handleResolve()} className="rounded-full bg-emerald-400 px-5 py-2 text-sm font-semibold text-slate-950">Submit resolution</button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
