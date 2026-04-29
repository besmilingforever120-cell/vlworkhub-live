"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { platformLinks } from "@vlworkhub/config";
import type { AdminUserRecord, DepartmentRecord, OrganizationRecord } from "../lib/types";

type FormState = {
  id?: string;
  organizationId: string;
  name: string;
  email: string;
  password: string;
  enabled: boolean;
  role: "SUPER_ADMIN" | "IT_ADMIN" | "ADMIN" | "USER";
  departmentId: string;
  apps: Record<"HR" | "CARE" | "URSAFE", boolean>;
};

type OrganizationForm = {
  id?: string;
  name: string;
  enabled: boolean;
  assignedAdminId: string;
  apps: Record<"HR" | "CARE" | "URSAFE", boolean>;
};

type AssignableItAdmin = {
  id: string;
  organization_id: string;
  name: string;
  email: string;
};

function emptyForm(): FormState {
  return {
    organizationId: "",
    name: "",
    email: "",
    password: "",
    enabled: true,
    role: "USER",
    departmentId: "",
    apps: { HR: false, CARE: false, URSAFE: false }
  };
}

function emptyOrganizationForm(): OrganizationForm {
  return {
    name: "",
    enabled: true,
    assignedAdminId: "",
    apps: { HR: true, CARE: true, URSAFE: true }
  };
}

export function SuperAdminPanel({ viewerRole, viewerOrganizationId }: { viewerRole: "SUPER_ADMIN" | "IT_ADMIN" | "ADMIN" | "USER"; viewerOrganizationId?: string }) {
  const [users, setUsers] = useState<AdminUserRecord[]>([]);
  const [departments, setDepartments] = useState<DepartmentRecord[]>([]);
  const [organizations, setOrganizations] = useState<OrganizationRecord[]>([]);
  const [itAdmins, setItAdmins] = useState<AssignableItAdmin[]>([]);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [organizationForm, setOrganizationForm] = useState<OrganizationForm>(emptyOrganizationForm());
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [savingOrganization, setSavingOrganization] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [showOrganizationModal, setShowOrganizationModal] = useState(false);

  const appOptions = useMemo(() => ["HR", "CARE", "URSAFE"] as const, []);
  const canManageOrganizations = viewerRole === "SUPER_ADMIN";
  const canAssignAdminRoles = viewerRole === "SUPER_ADMIN";

  function getOrganizationById(organizationId: string) {
    return organizations.find((item) => item.id === organizationId);
  }

  function getEnabledAppsForOrganization(organizationId: string) {
    const organization = getOrganizationById(organizationId);
    if (!organization || (organization.apps || []).length === 0) {
      return [...appOptions];
    }

    return (organization.apps || []).filter((app): app is (typeof appOptions)[number] => appOptions.includes(app));
  }

  async function loadUsers() {
    const response = await fetch(`${platformLinks.api}/api/admin/users`, { credentials: "include" });
    if (!response.ok) {
      throw new Error("Failed to load users.");
    }
    const data = await response.json();
    setUsers(data.items || []);
  }

  async function loadDepartments() {
    const response = await fetch(`${platformLinks.api}/api/admin/departments`, { credentials: "include" });
    if (!response.ok) {
      throw new Error("Failed to load departments.");
    }
    const data = await response.json();
    setDepartments(data.items || []);
  }

  async function loadOrganizations() {
    const response = await fetch(`${platformLinks.api}/api/admin/organizations`, { credentials: "include" });
    if (!response.ok) {
      throw new Error("Failed to load organizations.");
    }
    const data = await response.json();
    setOrganizations(data.items || []);
  }

  async function loadItAdmins() {
    const response = await fetch(`${platformLinks.api}/api/admin/it-admins`, { credentials: "include" });
    if (!response.ok) {
      throw new Error("Failed to load IT administrators.");
    }
    const data = await response.json();
    setItAdmins(data.items || []);
  }

  async function loadAll() {
    await Promise.all([
      loadUsers(),
      loadDepartments(),
      canManageOrganizations ? loadOrganizations() : Promise.resolve(),
      canManageOrganizations ? loadItAdmins() : Promise.resolve()
    ]);
  }

  useEffect(() => {
    void loadAll().catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Failed to load admin data."));
  }, [canManageOrganizations]);

  function openCreate() {
    const base = emptyForm();
    setForm({
      ...base,
      organizationId: canManageOrganizations ? (organizations[0]?.id || "") : String(viewerOrganizationId || "")
    });
    setShowModal(true);
  }

  function openCreateOrganization() {
    setOrganizationForm(emptyOrganizationForm());
    setShowOrganizationModal(true);
  }

  function startEdit(user: AdminUserRecord) {
    const appMap = { HR: false, CARE: false, URSAFE: false };
    for (const item of user.app_access || []) {
      if (item.enabled) {
        appMap[item.app] = true;
      }
    }

    setForm({
      id: user.id,
      organizationId: user.organization_id,
      name: `${user.first_name || ""} ${user.last_name || ""}`.trim() || user.name,
      email: user.email,
      password: "",
      enabled: user.enabled,
      role: user.role,
      departmentId: user.department_id || "",
      apps: appMap
    });
    setShowModal(true);
  }

  function startEditOrganization(organization: OrganizationRecord) {
    const appMap = { HR: false, CARE: false, URSAFE: false };
    const configuredApps = (organization.apps || []).length > 0 ? organization.apps : appOptions;
    for (const app of configuredApps) {
      appMap[app] = true;
    }

    setOrganizationForm({
      id: organization.id,
      name: organization.name,
      enabled: organization.enabled,
      assignedAdminId: organization.assigned_admin_id || "",
      apps: appMap
    });
    setShowOrganizationModal(true);
  }

  function handleUserOrganizationChange(organizationId: string) {
    const enabledApps = getEnabledAppsForOrganization(organizationId);
    setForm((current) => ({
      ...current,
      organizationId,
      apps: {
        HR: enabledApps.includes("HR") ? current.apps.HR : false,
        CARE: enabledApps.includes("CARE") ? current.apps.CARE : false,
        URSAFE: enabledApps.includes("URSAFE") ? current.apps.URSAFE : false
      }
    }));
  }

  async function saveUser() {
    setSaving(true);
    setError("");
    try {
      const payload = {
        ...(canManageOrganizations ? { organizationId: form.organizationId || null } : {}),
        name: form.name,
        email: form.email,
        ...(form.id && form.password ? { password: form.password } : {}),
        enabled: form.enabled,
        role: form.role,
        departmentId: form.departmentId || null,
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
      setShowModal(false);
      await loadUsers();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save user.");
    } finally {
      setSaving(false);
    }
  }

  async function saveOrganization() {
    setSavingOrganization(true);
    setError("");
    try {
      const url = organizationForm.id ? `${platformLinks.api}/api/admin/organizations/${organizationForm.id}` : `${platformLinks.api}/api/admin/organizations`;
      const method = organizationForm.id ? "PUT" : "POST";
      const response = await fetch(url, {
        method,
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: organizationForm.name,
          enabled: organizationForm.enabled,
          assignedAdminId: organizationForm.assignedAdminId || null,
          apps: appOptions.filter((app) => organizationForm.apps[app])
        })
      });

      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "Failed to save organization.");
      }

      setOrganizationForm(emptyOrganizationForm());
      setShowOrganizationModal(false);
      await loadOrganizations();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save organization.");
    } finally {
      setSavingOrganization(false);
    }
  }

  async function toggleOrganization(organization: OrganizationRecord, enabled: boolean) {
    setSavingOrganization(true);
    setError("");
    try {
      const response = await fetch(`${platformLinks.api}/api/admin/organizations/${organization.id}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: organization.name,
          enabled,
          assignedAdminId: organization.assigned_admin_id || null
        })
      });

      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "Failed to update organization.");
      }

      await Promise.all([loadOrganizations(), loadUsers()]);
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Failed to update organization.");
    } finally {
      setSavingOrganization(false);
    }
  }

  return (
    <div className="space-y-8">
      {canManageOrganizations ? (
      <section className="rounded-3xl border border-white/10 bg-slate-900/60 p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold text-white">Organization Management</h2>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">Create organizations, edit organization details, and disable access safely without a destructive hard delete.</p>
          </div>
          <button type="button" onClick={openCreateOrganization} className="rounded-2xl bg-cyan-400 px-5 py-3 text-sm font-medium text-slate-950">Create Organization</button>
        </div>

        {error ? <p className="mt-5 text-sm text-rose-300">{error}</p> : null}

        <div className="mt-4 rounded-2xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
          Hard delete is intentionally not exposed here because organizations own users and operational data through foreign-key dependencies.
        </div>

        <div className="mt-6 overflow-x-auto">
          <table className="min-w-full text-left text-sm text-slate-200">
            <thead className="text-xs uppercase tracking-[0.16em] text-slate-400">
              <tr>
                <th className="px-3 py-3">Organization</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3">Assigned To</th>
                <th className="px-3 py-3">Apps</th>
                <th className="px-3 py-3">Users</th>
                <th className="px-3 py-3">Departments</th>
                <th className="px-3 py-3">Created</th>
                <th className="px-3 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {organizations.map((organization) => (
                <tr key={organization.id} className="border-t border-white/10">
                  <td className="px-3 py-4 font-medium text-white">{organization.name}</td>
                  <td className="px-3 py-4"><span className={`rounded-full px-3 py-1 text-xs ${organization.enabled ? "bg-emerald-500/15 text-emerald-200" : "bg-rose-500/15 text-rose-200"}`}>{organization.enabled ? "active" : "disabled"}</span></td>
                  <td className="px-3 py-4 text-slate-300">{organization.assigned_admin_name ? `${organization.assigned_admin_name}${organization.assigned_admin_email ? ` (${organization.assigned_admin_email})` : ""}` : "Unassigned"}</td>
                  <td className="px-3 py-4"><div className="flex flex-wrap gap-2">{((organization.apps || []).length > 0 ? organization.apps : appOptions).map((app) => (<span key={`${organization.id}-${app}`} className="rounded-full bg-white/10 px-3 py-1 text-xs text-white">{app}</span>))}</div></td>
                  <td className="px-3 py-4 text-slate-300">{organization.user_count}</td>
                  <td className="px-3 py-4 text-slate-300">{organization.department_count}</td>
                  <td className="px-3 py-4 text-slate-400">{organization.created_at ? new Date(organization.created_at).toLocaleDateString() : "-"}</td>
                  <td className="px-3 py-4">
                    <div className="flex gap-3">
                      <button type="button" onClick={() => startEditOrganization(organization)} className="rounded-xl border border-white/10 px-4 py-2 text-sm text-white">Edit</button>
                      <button type="button" disabled={savingOrganization} onClick={() => void toggleOrganization(organization, !organization.enabled)} className={`rounded-xl px-4 py-2 text-sm ${organization.enabled ? "border border-rose-400/30 text-rose-200" : "border border-emerald-400/30 text-emerald-200"}`}>
                        {organization.enabled ? "Disable" : "Enable"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      ) : null}

      <section className="rounded-3xl border border-white/10 bg-slate-900/60 p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold text-white">Platform User Management</h2>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">Create users, edit account details, assign departments, and manage access to Care, HR, and URSafe from the platform UI.</p>
          </div>
          <div className="flex gap-3">
            <Link href="/admin/departments" className="rounded-2xl border border-white/10 px-5 py-3 text-sm font-medium text-white">Departments</Link>
            <button type="button" onClick={openCreate} className="rounded-2xl bg-cyan-400 px-5 py-3 text-sm font-medium text-slate-950">Create User</button>
          </div>
        </div>

        {error ? <p className="mt-5 text-sm text-rose-300">{error}</p> : null}

        <div className="mt-6 overflow-x-auto">
          <table className="min-w-full text-left text-sm text-slate-200">
            <thead className="text-xs uppercase tracking-[0.16em] text-slate-400">
              <tr>
                <th className="px-3 py-3">First name</th>
                <th className="px-3 py-3">Last name</th>
                <th className="px-3 py-3">Email</th>
                <th className="px-3 py-3">Department</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3">Role</th>
                <th className="px-3 py-3">Organization</th>
                <th className="px-3 py-3">Apps</th>
                <th className="px-3 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => {
                const department = departments.find((item) => item.id === user.department_id);
                return (
                  <tr key={user.id} className="border-t border-white/10">
                    <td className="px-3 py-4">{user.first_name}</td>
                    <td className="px-3 py-4">{user.last_name}</td>
                    <td className="px-3 py-4">{user.email}</td>
                    <td className="px-3 py-4 text-xs text-slate-300">{department?.name || "Unassigned"}</td>
                    <td className="px-3 py-4"><span className={`rounded-full px-3 py-1 text-xs ${user.status === "active" ? "bg-emerald-500/15 text-emerald-200" : "bg-rose-500/15 text-rose-200"}`}>{user.status}</span></td>
                    <td className="px-3 py-4 text-xs font-semibold text-cyan-300">{user.role}</td>
                    <td className="px-3 py-4 text-xs text-slate-400">{user.organization_name || "Unknown organization"}</td>
                    <td className="px-3 py-4"><div className="flex flex-wrap gap-2">{(user.app_access || []).filter((item) => item.enabled).map((item) => (<span key={`${user.id}-${item.app}`} className="rounded-full bg-white/10 px-3 py-1 text-xs text-white">{item.app}</span>))}</div></td>
                    <td className="px-3 py-4"><button type="button" onClick={() => startEdit(user)} className="rounded-xl border border-white/10 px-4 py-2 text-sm text-white">Edit</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {showModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-6 py-10 backdrop-blur-sm">
          <div className="w-full max-w-3xl rounded-3xl border border-white/10 bg-slate-900 p-8 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-2xl font-semibold text-white">Create Platform User</h3>
                <p className="mt-2 text-sm text-slate-300">Provision a platform user, assign apps, and attach the account to a department.</p>
              </div>
              <button type="button" onClick={() => { setShowModal(false); setForm(emptyForm()); }} className="rounded-2xl border border-white/10 px-4 py-2 text-sm text-white">Close</button>
            </div>

            <div className="mt-8 grid gap-4 md:grid-cols-2">
              <label className="text-sm text-slate-300">Full name<input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-white" /></label>
              <label className="text-sm text-slate-300">Email<input value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-white" /></label>
              {form.id ? (
                <label className="text-sm text-slate-300">Reset password<input type="password" value={form.password} onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))} className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-white" placeholder="Leave blank to keep current password" /></label>
              ) : (
                <div className="rounded-2xl border border-cyan-400/30 bg-cyan-400/10 px-4 py-3 text-sm text-cyan-100">
                  A strong temporary password will be generated automatically and sent by email. The user will be required to change it at first login.
                </div>
              )}
              {canManageOrganizations ? (
                <label className="text-sm text-slate-300">Organization<select value={form.organizationId} onChange={(event) => handleUserOrganizationChange(event.target.value)} className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-white"><option value="">Select organization</option>{organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}</select></label>
              ) : null}
              <label className="text-sm text-slate-300">Platform role<select value={form.role} onChange={(event) => setForm((current) => ({ ...current, role: event.target.value as FormState["role"] }))} className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-white"><option value="USER">USER</option><option value="ADMIN">ADMIN</option><option value="IT_ADMIN" disabled={!canAssignAdminRoles}>IT_ADMIN</option><option value="SUPER_ADMIN" disabled={!canAssignAdminRoles}>SUPER_ADMIN</option></select></label>
              <label className="text-sm text-slate-300 md:col-span-2">Department<select value={form.departmentId} onChange={(event) => setForm((current) => ({ ...current, departmentId: event.target.value }))} className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-white"><option value="">Unassigned</option>{departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select></label>
              <label className="inline-flex items-center gap-3 text-sm text-slate-300 md:col-span-2"><input type="checkbox" checked={form.enabled} onChange={(event) => setForm((current) => ({ ...current, enabled: event.target.checked }))} />Active account</label>
              <div className="md:col-span-2">
                <p className="text-sm text-slate-300">Assign apps</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  {appOptions.map((app) => (
                    <label key={app} className="inline-flex items-center gap-3 rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-sm text-slate-200">
                      <input type="checkbox" disabled={!getEnabledAppsForOrganization(form.organizationId || String(viewerOrganizationId || "")).includes(app)} checked={form.apps[app]} onChange={(event) => setForm((current) => ({ ...current, apps: { ...current.apps, [app]: event.target.checked } }))} />
                      {app}
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-8 flex gap-3">
              <button type="button" onClick={() => void saveUser()} disabled={saving} className="rounded-2xl bg-cyan-400 px-5 py-3 font-medium text-slate-950 disabled:opacity-60">{saving ? "Saving..." : form.id ? "Update User" : "Create User"}</button>
              <button type="button" onClick={() => setForm(emptyForm())} className="rounded-2xl border border-white/10 px-5 py-3 text-white">Reset</button>
            </div>
          </div>
        </div>
      ) : null}

      {canManageOrganizations && showOrganizationModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-6 py-10 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-3xl border border-white/10 bg-slate-900 p-8 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-2xl font-semibold text-white">{organizationForm.id ? "Edit Organization" : "Create Organization"}</h3>
                <p className="mt-2 text-sm text-slate-300">Manage the organization record and whether its users are allowed to log in.</p>
              </div>
              <button type="button" onClick={() => { setShowOrganizationModal(false); setOrganizationForm(emptyOrganizationForm()); }} className="rounded-2xl border border-white/10 px-4 py-2 text-sm text-white">Close</button>
            </div>

            <div className="mt-8 grid gap-4">
              <label className="text-sm text-slate-300">Organization name<input value={organizationForm.name} onChange={(event) => setOrganizationForm((current) => ({ ...current, name: event.target.value }))} className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-white" /></label>
              <label className="text-sm text-slate-300">Assigned To<select value={organizationForm.assignedAdminId} onChange={(event) => setOrganizationForm((current) => ({ ...current, assignedAdminId: event.target.value }))} className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-white"><option value="">Unassigned</option>{itAdmins.map((admin) => <option key={admin.id} value={admin.id}>{admin.name} ({admin.email})</option>)}</select></label>
              <div>
                <p className="text-sm text-slate-300">App Access</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  {appOptions.map((app) => (
                    <label key={app} className="inline-flex items-center gap-3 rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-sm text-slate-200">
                      <input type="checkbox" checked={organizationForm.apps[app]} onChange={(event) => setOrganizationForm((current) => ({ ...current, apps: { ...current.apps, [app]: event.target.checked } }))} />
                      {app}
                    </label>
                  ))}
                </div>
              </div>
              <label className="inline-flex items-center gap-3 text-sm text-slate-300"><input type="checkbox" checked={organizationForm.enabled} onChange={(event) => setOrganizationForm((current) => ({ ...current, enabled: event.target.checked }))} />Organization is active</label>
            </div>

            <div className="mt-8 flex gap-3">
              <button type="button" onClick={() => void saveOrganization()} disabled={savingOrganization} className="rounded-2xl bg-cyan-400 px-5 py-3 font-medium text-slate-950 disabled:opacity-60">{savingOrganization ? "Saving..." : organizationForm.id ? "Update Organization" : "Create Organization"}</button>
              <button type="button" onClick={() => setOrganizationForm(emptyOrganizationForm())} className="rounded-2xl border border-white/10 px-5 py-3 text-white">Reset</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
