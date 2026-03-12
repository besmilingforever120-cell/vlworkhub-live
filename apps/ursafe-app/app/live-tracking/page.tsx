"use client";

import { useEffect, useMemo, useState } from "react";
import type { SessionUser, UrsafeActiveSession, UrsafeEmergency, UrsafeShift, UrsafeUser } from "@vlworkhub/types";
import { EmptyState, ErrorBanner, SectionCard, ShellHero } from "../../components/ursafe-ui";
import { getActiveSessions, getApiErrorMessage, getCurrentUser, getEmergencies, getShifts, getUrsafeUsers } from "../../lib/ursafe-client";

export default function LiveTrackingPage() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [users, setUsers] = useState<UrsafeUser[]>([]);
  const [sessions, setSessions] = useState<UrsafeActiveSession[]>([]);
  const [shifts, setShifts] = useState<UrsafeShift[]>([]);
  const [emergencies, setEmergencies] = useState<UrsafeEmergency[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      setError(null);
      const [session, roster, sessionItems, shiftItems, emergencyItems] = await Promise.all([
        getCurrentUser(),
        getUrsafeUsers(),
        getActiveSessions(),
        getShifts({ activeOnly: true }),
        getEmergencies(true)
      ]);
      setUser(session);
      setUsers(roster);
      setSessions(sessionItems);
      setShifts(shiftItems);
      setEmergencies(emergencyItems);
    } catch (loadError) {
      setError(getApiErrorMessage(loadError));
    }
  }

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 10000);
    return () => window.clearInterval(timer);
  }, []);

  const userById = useMemo(() => new Map(users.map((item) => [item.id, item])), [users]);

  return (
    <div className="space-y-8">
      <ShellHero
        eyebrow="Live Tracking"
        title="Real-time employee presence and shift telemetry"
        description="The legacy live tracking flow is preserved here as an operations board. Active sessions, active shifts, and open emergencies are refreshed continuously through the shared API."
        badge={user ? `Watching as ${user.fullName}` : undefined}
      />

      {error ? <ErrorBanner message={error} /> : null}

      <section className="grid gap-6 lg:grid-cols-[1.2fr,0.8fr]">
        <SectionCard title="Active employees" description="Employees with live sessions or active shifts stay visible in one queue.">
          {sessions.length === 0 && shifts.length === 0 ? <EmptyState title="No active employees" description="People appear here when their device is connected or their shift is active." /> : null}
          <div className="grid gap-4 md:grid-cols-2">
            {Array.from(new Set([...sessions.map((item) => item.userId), ...shifts.map((item) => item.userId)])).map((userId) => {
              const employee = userById.get(userId);
              const session = sessions.find((item) => item.userId === userId);
              const shift = shifts.find((item) => item.userId === userId);
              const emergency = emergencies.find((item) => item.userId === userId);
              return (
                <div key={userId} className={`rounded-3xl border p-5 ${emergency ? "border-rose-400/30 bg-rose-400/10" : "border-white/10 bg-white/5"}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-[0.3em] text-slate-400">{emergency ? "Emergency" : session?.status || shift?.status || "idle"}</p>
                      <h3 className="mt-2 text-xl font-semibold text-white">{employee ? `${employee.firstName} ${employee.lastName}` : userId}</h3>
                      <p className="mt-2 text-sm text-slate-300">{employee?.department || "Department unavailable"}</p>
                    </div>
                    <span className="rounded-full border border-white/10 px-3 py-1 text-xs uppercase tracking-[0.2em] text-slate-200">{shift ? "On shift" : "Device only"}</span>
                  </div>
                  <div className="mt-4 space-y-2 text-sm text-slate-300">
                    <p>Last seen: {session?.lastSeenAt ? new Date(session.lastSeenAt).toLocaleString() : "No device heartbeat"}</p>
                    <p>Location: {session?.location?.address || shift?.currentLocation?.address || "GPS unavailable"}</p>
                    <p>Client: {shift?.clientName || "No active client"}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </SectionCard>

        <SectionCard title="Emergency deck" description="Immediate-response view for any unresolved incidents.">
          {emergencies.length === 0 ? <EmptyState title="All clear" description="No unresolved safety events are active right now." /> : null}
          <div className="space-y-4">
            {emergencies.map((item) => {
              const employee = userById.get(item.userId);
              return (
                <div key={item.id} className="rounded-3xl border border-rose-400/30 bg-rose-400/10 p-5">
                  <p className="text-xs uppercase tracking-[0.3em] text-rose-200">{item.type.replace(/_/g, " ")}</p>
                  <h3 className="mt-2 text-lg font-semibold text-white">{employee ? `${employee.firstName} ${employee.lastName}` : item.userId}</h3>
                  <p className="mt-2 text-sm text-rose-100">{item.location?.address || "GPS coordinates captured"}</p>
                  <p className="mt-2 text-xs text-rose-100">Triggered {new Date(item.timestamp).toLocaleString()}</p>
                </div>
              );
            })}
          </div>
        </SectionCard>
      </section>
    </div>
  );
}
