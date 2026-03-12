"use client";

import { useEffect, useState } from "react";
import { Shield, Users } from "lucide-react";
import type { SessionUser } from "@vlworkhub/types";
import { getApiErrorMessage, getCurrentUser, getSharedUsers, type HrUser } from "../lib/hr-client";
import { HrPortalHeader } from "./hr-portal-header";

export function EmployeeDirectory() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [users, setUsers] = useState<HrUser[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const [session, sharedUsers] = await Promise.all([getCurrentUser(), getSharedUsers()]);
        setUser(session);
        setUsers(sharedUsers);
      } catch (loadError) {
        setError(getApiErrorMessage(loadError));
      }
    }

    void load();
  }, []);

  return (
    <div className="hr-module">
      <HrPortalHeader
        title="Shared Identity Directory"
        description="The legacy Employees module has been retired from HR. Identity and access now come from the main VLWorkHub platform and shared session."
        breadcrumb="Identity"
      />
      {error ? <div className="hr-card" style={{ marginBottom: "20px", color: "#b91c1c", borderColor: "#fecaca", background: "#fff1f2" }}>{error}</div> : null}
      <div className="hr-module__layout">
        <section className="hr-module__panel">
          <div className="hr-module__panel-header"><div><h2>Platform Users</h2><p>This replaces the old HR-local employee directory.</p></div></div>
          <div className="hr-module__panel-body">
            <div className="hr-module__card-list">
              {users.map((item) => (
                <article key={item.id} className="hr-module__card">
                  <h3>{item.fullName}</h3>
                  <p>{item.email}</p>
                  <div className="hr-module__people"><span className="hr-module__person"><Users className="h-3 w-3" />{item.roles.join(", ") || "Employee"}</span></div>
                </article>
              ))}
            </div>
          </div>
        </section>
        <aside className="hr-module__panel">
          <div className="hr-module__panel-header"><div><h3>Session Context</h3><p>Authentication is centralized at the VLWorkHub platform domain.</p></div></div>
          <div className="hr-module__panel-body"><div className="hr-role-indicator"><Shield className="h-4 w-4" />Signed in as {user?.fullName || "Loading user"}</div></div>
        </aside>
      </div>
    </div>
  );
}
