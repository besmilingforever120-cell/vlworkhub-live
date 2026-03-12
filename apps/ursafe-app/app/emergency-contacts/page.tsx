"use client";

import { useEffect, useMemo, useState } from "react";
import type { GenericRecord } from "../../lib/ursafe-client";
import type { SessionUser, UrsafeActiveSession, UrsafeUser } from "@vlworkhub/types";
import { EmptyState, ErrorBanner, SectionCard, ShellHero } from "../../components/ursafe-ui";
import { clearActiveSession, getActiveSessions, getApiErrorMessage, getCurrentUser, getEmergencyContacts, getUrsafeUsers } from "../../lib/ursafe-client";

export default function EmergencyContactsPage() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [users, setUsers] = useState<UrsafeUser[]>([]);
  const [contacts, setContacts] = useState<GenericRecord[]>([]);
  const [sessions, setSessions] = useState<UrsafeActiveSession[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      setError(null);
      const [session, roster, contactItems, sessionItems] = await Promise.all([
        getCurrentUser(),
        getUrsafeUsers(),
        getEmergencyContacts(),
        getActiveSessions()
      ]);
      setUser(session);
      setUsers(roster);
      setContacts(contactItems);
      setSessions(sessionItems);
    } catch (loadError) {
      setError(getApiErrorMessage(loadError));
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const userById = useMemo(() => new Map(users.map((item) => [item.id, item])), [users]);
  const staleSessions = sessions.filter((item) => item.status !== "online");

  async function clearSession(userId: string) {
    try {
      await clearActiveSession(userId);
      await load();
    } catch (clearError) {
      setError(getApiErrorMessage(clearError));
    }
  }

  return (
    <div className="space-y-8">
      <ShellHero
        eyebrow="Emergency Directory"
        title="Emergency contacts and live mobile presence"
        description="The integrated URSafe app keeps emergency contacts beside device telemetry so supervisors can act immediately when a worker goes stale or stops broadcasting location."
        badge={user ? `Supervisor view for ${user.fullName}` : undefined}
      />

      {error ? <ErrorBanner message={error} /> : null}

      <section className="grid gap-6 xl:grid-cols-[0.95fr,1.05fr]">
        <SectionCard title="Connection watchlist" description="Highlights people whose devices are stale, idle, or need manual cleanup.">
          {sessions.length === 0 ? <EmptyState title="No active devices" description="Mobile sessions will appear here once employees sign in." /> : null}
          <div className="space-y-4">
            {sessions.map((session) => {
              const employee = userById.get(session.userId);
              const tone = session.status === "online" ? "border-emerald-400/20 bg-emerald-400/10" : "border-amber-400/20 bg-amber-400/10";
              return (
                <div key={session.id} className={`rounded-3xl border p-5 ${tone}`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-[0.3em] text-slate-300">{session.status}</p>
                      <h3 className="mt-2 text-lg font-semibold text-white">{employee ? `${employee.firstName} ${employee.lastName}` : session.userId}</h3>
                      <p className="mt-2 text-sm text-slate-300">{session.location?.address || "No GPS address"}</p>
                    </div>
                    <button onClick={() => void clearSession(session.userId)} className="rounded-full border border-white/15 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-100">
                      Force clear
                    </button>
                  </div>
                  <div className="mt-4 grid gap-3 text-sm text-slate-300 md:grid-cols-3">
                    <div>Device: {session.deviceName || "Unknown"}</div>
                    <div>Platform: {session.platform || "Unknown"}</div>
                    <div>Last seen: {new Date(session.lastSeenAt).toLocaleString()}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </SectionCard>

        <SectionCard title="Emergency contact list" description="Preserves operational access to contact details for field staff.">
          {contacts.length === 0 ? <EmptyState title="No contacts on file" description="Emergency contacts will appear here after roster setup." /> : null}
          <div className="grid gap-4 md:grid-cols-2">
            {contacts.map((item) => (
              <div key={String(item.id)} className="rounded-3xl border border-white/10 bg-slate-950/40 p-5">
                <p className="text-xs uppercase tracking-[0.3em] text-slate-400">{String(item.relation || "Contact")}</p>
                <h3 className="mt-2 text-lg font-semibold text-white">{String(item.full_name || "Unknown contact")}</h3>
                <p className="mt-2 text-sm text-slate-300">Employee: {String(item.employee_name || "Not linked")}</p>
                <p className="mt-2 text-sm text-cyan-200">{String(item.phone || "No phone")}</p>
              </div>
            ))}
          </div>
        </SectionCard>
      </section>

      <SectionCard title="Escalation summary" description="A compact summary for supervisors deciding whether to contact the employee, their manager, or an emergency contact first.">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
            <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Active mobile sessions</p>
            <p className="mt-3 text-3xl font-black text-white">{sessions.length}</p>
          </div>
          <div className="rounded-3xl border border-amber-400/20 bg-amber-400/10 p-5">
            <p className="text-xs uppercase tracking-[0.3em] text-amber-100">Attention needed</p>
            <p className="mt-3 text-3xl font-black text-white">{staleSessions.length}</p>
          </div>
          <div className="rounded-3xl border border-cyan-400/20 bg-cyan-400/10 p-5">
            <p className="text-xs uppercase tracking-[0.3em] text-cyan-100">Contacts on file</p>
            <p className="mt-3 text-3xl font-black text-white">{contacts.length}</p>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
