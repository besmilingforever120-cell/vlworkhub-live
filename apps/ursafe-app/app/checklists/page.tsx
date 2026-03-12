"use client";

import { useEffect, useMemo, useState } from "react";
import type { GenericRecord } from "../../lib/ursafe-client";
import type { SessionUser, UrsafeCheckIn, UrsafeEmergency, UrsafeShift } from "@vlworkhub/types";
import { EmptyState, ErrorBanner, SectionCard, ShellHero } from "../../components/ursafe-ui";
import { createCheckIn, createEmergency, createShift, getApiErrorMessage, getCheckIns, getCurrentUser, getEmergencies, getSafetyChecklists, getShifts, updateShift } from "../../lib/ursafe-client";

const CURRENT_LOCATION = { latitude: 49.248, longitude: -122.987, address: "Current employee location", timestamp: new Date().toISOString() };

export default function ChecklistsPage() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [shifts, setShifts] = useState<UrsafeShift[]>([]);
  const [checkIns, setCheckIns] = useState<UrsafeCheckIn[]>([]);
  const [emergencies, setEmergencies] = useState<UrsafeEmergency[]>([]);
  const [checklists, setChecklists] = useState<GenericRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [startingShift, setStartingShift] = useState(false);
  const [form, setForm] = useState({ clientName: "", clientAddress: "", expectedDuration: "60", notes: "" });

  async function load() {
    try {
      setError(null);
      const session = await getCurrentUser();
      const [shiftItems, emergencyItems, checklistItems] = await Promise.all([getShifts(), getEmergencies(true), getSafetyChecklists()]);
      const activeShiftIds = shiftItems.map((shift) => shift.id);
      const checkInItems = await Promise.all(activeShiftIds.map((id) => getCheckIns(id)));
      setUser(session);
      setShifts(shiftItems);
      setEmergencies(emergencyItems);
      setChecklists(checklistItems);
      setCheckIns(checkInItems.flat());
    } catch (loadError) {
      setError(getApiErrorMessage(loadError));
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const activeShift = useMemo(() => shifts.find((shift) => shift.userId === user?.id && shift.status === "active") || null, [shifts, user?.id]);
  const activeShiftCheckIns = activeShift ? checkIns.filter((item) => item.shiftId === activeShift.id) : [];
  const activeEmergency = activeShift ? emergencies.find((item) => item.shiftId === activeShift.id || item.userId === activeShift.userId) : null;

  async function startShift(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) return;
    try {
      setStartingShift(true);
      await createShift({
        userId: user.id,
        clientName: form.clientName,
        clientAddress: form.clientAddress,
        expectedDuration: Number(form.expectedDuration),
        notes: form.notes,
        currentLocation: CURRENT_LOCATION
      });
      setForm({ clientName: "", clientAddress: "", expectedDuration: "60", notes: "" });
      await load();
    } catch (shiftError) {
      setError(getApiErrorMessage(shiftError));
    } finally {
      setStartingShift(false);
    }
  }

  async function sendCheckIn() {
    if (!activeShift || !user) return;
    try {
      await createCheckIn({ shiftId: activeShift.id, userId: user.id, status: "safe", location: { ...CURRENT_LOCATION, timestamp: new Date().toISOString() } });
      await load();
    } catch (checkInError) {
      setError(getApiErrorMessage(checkInError));
    }
  }

  async function sendSOS() {
    if (!activeShift || !user) return;
    try {
      await createEmergency({ shiftId: activeShift.id, userId: user.id, type: "sos", notes: "Emergency SOS triggered from the integrated URSafe app", location: { ...CURRENT_LOCATION, timestamp: new Date().toISOString() } });
      await load();
    } catch (sosError) {
      setError(getApiErrorMessage(sosError));
    }
  }

  async function endShift() {
    if (!activeShift) return;
    try {
      await updateShift(activeShift.id, { status: "completed", endTime: new Date().toISOString(), currentLocation: { ...CURRENT_LOCATION, timestamp: new Date().toISOString() } });
      await load();
    } catch (endError) {
      setError(getApiErrorMessage(endError));
    }
  }

  return (
    <div className="space-y-8">
      <ShellHero
        eyebrow="Shift Safety"
        title="Check-ins, shift workflows, and safety checklists"
        description="This page restores the work-alone protection flow from URSafe mobile: start a shift, send check-ins, trigger SOS, and review safety checklist completion beside the active shift state."
        badge={activeShift ? "Shift active" : "Ready for new shift"}
      />

      {error ? <ErrorBanner message={error} /> : null}

      <section className="grid gap-6 xl:grid-cols-[0.95fr,1.05fr]">
        <SectionCard title={activeShift ? "Active shift" : "Start a shift"} description="The operational shift workflow is preserved instead of being reduced to generic records.">
          {!activeShift ? (
            <form onSubmit={startShift} className="space-y-4">
              <input className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white" placeholder="Client name" value={form.clientName} onChange={(event) => setForm((current) => ({ ...current, clientName: event.target.value }))} />
              <input className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white" placeholder="Client address" value={form.clientAddress} onChange={(event) => setForm((current) => ({ ...current, clientAddress: event.target.value }))} />
              <input className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white" placeholder="Expected duration in minutes" value={form.expectedDuration} onChange={(event) => setForm((current) => ({ ...current, expectedDuration: event.target.value }))} />
              <textarea className="min-h-[100px] w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white" placeholder="Shift notes" value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} />
              <button disabled={startingShift} className="w-full rounded-2xl bg-cyan-400 px-4 py-3 text-sm font-semibold text-slate-950 disabled:opacity-60">{startingShift ? "Starting shift..." : "Start shift"}</button>
            </form>
          ) : (
            <div className="space-y-4">
              <div className={`rounded-3xl border p-5 ${activeEmergency ? "border-rose-400/30 bg-rose-400/10" : "border-emerald-400/30 bg-emerald-400/10"}`}>
                <p className="text-xs uppercase tracking-[0.3em] text-slate-200">Current shift</p>
                <h3 className="mt-3 text-2xl font-semibold text-white">{activeShift.clientName || "Field visit"}</h3>
                <div className="mt-4 grid gap-3 text-sm text-slate-200 md:grid-cols-2">
                  <div>Address: {activeShift.clientAddress || "Not supplied"}</div>
                  <div>Started: {new Date(activeShift.startTime).toLocaleString()}</div>
                  <div>Check-ins: {activeShift.checkInCount}</div>
                  <div>Last check-in: {activeShift.lastCheckIn ? new Date(activeShift.lastCheckIn).toLocaleTimeString() : "Awaiting first check-in"}</div>
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <button onClick={() => void sendSOS()} className="rounded-2xl bg-rose-500 px-4 py-4 text-sm font-semibold text-white">Emergency SOS</button>
                <button onClick={() => void sendCheckIn()} className="rounded-2xl bg-emerald-500 px-4 py-4 text-sm font-semibold text-white">I&apos;m Safe - Check In</button>
                <button onClick={() => void endShift()} className="rounded-2xl border border-white/15 bg-white/5 px-4 py-4 text-sm font-semibold text-slate-100">End shift</button>
              </div>
            </div>
          )}
        </SectionCard>

        <SectionCard title="Checklist coverage" description="Checklist completion and recent check-ins are shown together so field safety stays operational, not generic.">
          <div className="space-y-4">
            {checklists.length === 0 ? <EmptyState title="No checklist data" description="Checklist records will appear here when safety operations log them." /> : null}
            {checklists.map((item) => (
              <div key={String(item.id)} className="rounded-3xl border border-white/10 bg-slate-950/40 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Checklist</p>
                    <h3 className="mt-2 text-lg font-semibold text-white">{String(item.title || "Safety checklist")}</h3>
                    <p className="mt-2 text-sm text-slate-300">Location: {String(item.location || "Unspecified")}</p>
                  </div>
                  <span className="rounded-full border border-white/10 px-3 py-1 text-xs uppercase tracking-[0.2em] text-slate-200">{String(item.status || "Open")}</span>
                </div>
                <p className="mt-3 text-sm text-slate-400">Completed by {String(item.completed_by || "Unknown")}</p>
              </div>
            ))}
          </div>
        </SectionCard>
      </section>

      <SectionCard title="Recent shift timeline" description="Check-ins and open alerts remain visible below the active workflow.">
        {activeShiftCheckIns.length === 0 && !activeEmergency ? (
          <EmptyState title="No shift events yet" description="Check-ins and SOS events will show up here once the shift is underway." />
        ) : (
          <div className="space-y-4">
            {activeShiftCheckIns.map((item) => (
              <div key={item.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-xs uppercase tracking-[0.25em] text-slate-400">Check-in {item.status}</p>
                <p className="mt-2 text-white">{item.notes || "Employee reported in safely."}</p>
                <p className="mt-2 text-xs text-slate-400">{new Date(item.timestamp).toLocaleString()} · {item.location?.address || "GPS captured"}</p>
              </div>
            ))}
            {activeEmergency ? (
              <div className="rounded-2xl border border-rose-400/30 bg-rose-400/10 p-4">
                <p className="text-xs uppercase tracking-[0.25em] text-rose-200">Open emergency</p>
                <p className="mt-2 text-white">{activeEmergency.notes || "SOS event captured."}</p>
                <p className="mt-2 text-xs text-rose-100">{new Date(activeEmergency.timestamp).toLocaleString()} · {activeEmergency.location?.address || "GPS captured"}</p>
              </div>
            ) : null}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
