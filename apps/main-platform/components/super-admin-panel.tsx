"use client";

import { useEffect, useMemo, useState } from "react";
import { platformLinks } from "@vlworkhub/config";
import type { AdminUserRecord } from "../lib/types";

type FormState = {
  id?: string;
  name: string;
  email: string;
  password: string;
  enabled: boolean;
  role: "SUPER_ADMIN" | "ADMIN" | "USER";
  apps: Record<"HR" | "CARE" | "URSAFE", boolean>;
};

function emptyForm(): FormState {
  return {
    name: "",
    email: "",
    password: "",
    enabled: true,
    role: "USER",
    apps: { HR: false, CARE: false, URSAFE: false }
  };
}

export function SuperAdminPanel() {
  const [users, setUsers] = useState<AdminUserRecord[]>([]);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const appOptions = useMemo(() => ["HR", "CARE", "URSAFE"] as const, []);

  async function loadUsers() {
    const response = await fetch(`${platformLinks.api}/api/admin/users`, { credentials: "include" });
    if (!response.ok) {
      throw new Error("Failed to load users.");
    }
    const data = await response.json();
    setUsers(data.items || []);
  }

  useEffect(() => {
    void loadUsers().catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Failed to load users."));
  }, []);

  function startEdit(user: AdminUserRecord) {
    const appMap = { HR: false, CARE: false, URSAFE: false };
    for (const item of user.app_access || []) {
      if (item.enabled) {
        appMap[item.app] = true;
      }
    }

    setForm({
      id: user.id,
      name: `${user.first_name || ""} ${user.last_name || ""}`.trim() || user.name,
      email: user.email,
      password: "",
      enabled: user.enabled,
      role: user.role,
      apps: appMap
    });
  }

  async function saveUser() {
    setSaving(true);
    setError("");
    try {
      const payload = {
        name: form.name,
        email: form.email,
        password: form.password,
        enabled: form.enabled,
        role: form.role,
        apps: appOptions.map((app) => ({ app, enabled: form.apps[app] }))
      };

      const url = form.id ? `${platformLinks.api}/api/admin/users/${form.id}` : `${platformLinks.api}/api/admin/users`;
      const method = form.id ? "PUT" : "POST";
      const response = await fetch(url, {
        method,
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "Failed to save user.");
      }

      setForm(emptyForm());
      await loadUsers();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save user.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-8">
      <section className="rounded-3xl border border-white/10 bg-white/5 p-8">
        <h2 className="text-2xl font-semibold text-white">Platform User Management</h2>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">Create users, edit their account details, disable access, and assign Care, HR, and URSafe permissions from the platform UI.</p>
      </section>

      <section className="grid gap-8 lg:grid-cols-[0.95fr_1.05fr]">
        <div className="rounded-3xl border border-white/10 bg-slate-900/60 p-6">
          <h3 className="text-xl font-semibold text-white">{form.id ? "Edit User" : "Create User"}</h3>
          <div className="mt-6 grid gap-4">
            <label className="text-sm text-slate-300">Full name<input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-white" /></label>
            <label className="text-sm text-slate-300">Email<input value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-white" /></label>
            <label className="text-sm text-slate-300">Password<input type="password" value={form.password} onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))} className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-white" placeholder={form.id ? "Leave blank to keep current password" : "Set password"} /></label>
            <label className="text-sm text-slate-300">Platform role<select value={form.role} onChange={(event) => setForm((current) => ({ ...current, role: event.target.value as FormState["role"] }))} className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-white"><option value="USER">USER</option><option value="ADMIN">ADMIN</option><option value="SUPER_ADMIN">SUPER_ADMIN</option></select></label>
            <label className="inline-flex items-center gap-3 text-sm text-slate-300"><input type="checkbox" checked={form.enabled} onChange={(event) => setForm((current) => ({ ...current, enabled: event.target.checked }))} />Active account</label>
            <div>
              <p className="text-sm text-slate-300">Assign apps</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                {appOptions.map((app) => (
                  <label key={app} className="inline-flex items-center gap-3 rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-sm text-slate-200">
                    <input type="checkbox" checked={form.apps[app]} onChange={(event) => setForm((current) => ({ ...current, apps: { ...current.apps, [app]: event.target.checked } }))} />
                    {app}
                  </label>
                ))}
              </div>
            </div>
            {error ? <p className="text-sm text-rose-300">{error}</p> : null}
            <div className="flex gap-3">
              <button type="button" onClick={() => void saveUser()} disabled={saving} className="rounded-2xl bg-cyan-400 px-5 py-3 font-medium text-slate-950 disabled:opacity-60">{saving ? "Saving..." : form.id ? "Update User" : "Create User"}</button>
              <button type="button" onClick={() => setForm(emptyForm())} className="rounded-2xl border border-white/10 px-5 py-3 text-white">Reset</button>
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-white/10 bg-slate-900/60 p-6">
          <div className="flex items-center justify-between gap-4">
            <h3 className="text-xl font-semibold text-white">Users</h3>
            <span className="text-sm text-slate-400">{users.length} total</span>
          </div>
          <div className="mt-6 overflow-x-auto">
            <table className="min-w-full text-left text-sm text-slate-200">
              <thead className="text-xs uppercase tracking-[0.16em] text-slate-400">
                <tr>
                  <th className="px-3 py-3">First name</th>
                  <th className="px-3 py-3">Last name</th>
                  <th className="px-3 py-3">Email</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Role</th>
                  <th className="px-3 py-3">Organization</th>
                  <th className="px-3 py-3">Apps</th>
                  <th className="px-3 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} className="border-t border-white/10">
                    <td className="px-3 py-4">{user.first_name}</td>
                    <td className="px-3 py-4">{user.last_name}</td>
                    <td className="px-3 py-4">{user.email}</td>
                    <td className="px-3 py-4"><span className={`rounded-full px-3 py-1 text-xs ${user.status === "active" ? "bg-emerald-500/15 text-emerald-200" : "bg-rose-500/15 text-rose-200"}`}>{user.status}</span></td>
                    <td className="px-3 py-4 text-xs font-semibold text-cyan-300">{user.role}</td>
                    <td className="px-3 py-4 text-xs text-slate-400">{user.organization_id}</td>
                    <td className="px-3 py-4"><div className="flex flex-wrap gap-2">{(user.app_access || []).filter((item) => item.enabled).map((item) => (<span key={`${user.id}-${item.app}`} className="rounded-full bg-white/10 px-3 py-1 text-xs text-white">{item.app}</span>))}</div></td>
                    <td className="px-3 py-4"><button type="button" onClick={() => startEdit(user)} className="rounded-xl border border-white/10 px-4 py-2 text-sm text-white">Edit</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
