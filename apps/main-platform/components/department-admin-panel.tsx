"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { platformLinks } from "@vlworkhub/config";
import type { AdminUserRecord, DepartmentRecord } from "../lib/types";

type DepartmentForm = {
  id?: string;
  name: string;
  address: string;
  departmentType: "Community housing" | "Program";
  managerId: string;
};

function emptyForm(): DepartmentForm {
  return {
    name: "",
    address: "",
    departmentType: "Program",
    managerId: ""
  };
}

export function DepartmentAdminPanel() {
  const [departments, setDepartments] = useState<DepartmentRecord[]>([]);
  const [users, setUsers] = useState<AdminUserRecord[]>([]);
  const [form, setForm] = useState<DepartmentForm>(emptyForm());
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function loadDepartments() {
    const response = await fetch(`${platformLinks.api}/api/admin/departments`, { credentials: "include" });
    if (!response.ok) {
      throw new Error("Failed to load departments.");
    }
    const data = await response.json();
    setDepartments(data.items || []);
  }

  async function loadUsers() {
    const response = await fetch(`${platformLinks.api}/api/admin/users`, { credentials: "include" });
    if (!response.ok) {
      throw new Error("Failed to load users.");
    }
    const data = await response.json();
    setUsers(data.items || []);
  }

  async function loadAll() {
    await Promise.all([loadDepartments(), loadUsers()]);
  }

  useEffect(() => {
    void loadAll().catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Failed to load departments."));
  }, []);

  function openCreate() {
    setForm(emptyForm());
    setShowModal(true);
  }

  function startEdit(department: DepartmentRecord) {
    setForm({
      id: department.id,
      name: department.name,
      address: department.address || "",
      departmentType: department.department_type || "Program",
      managerId: department.manager_id || ""
    });
    setShowModal(true);
  }

  async function saveDepartment() {
    setSaving(true);
    setError("");
    try {
      const url = form.id ? `${platformLinks.api}/api/admin/departments/${form.id}` : `${platformLinks.api}/api/admin/departments`;
      const method = form.id ? "PUT" : "POST";
      const response = await fetch(url, {
        method,
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          address: form.address,
          departmentType: form.departmentType,
          managerId: form.managerId || null
        })
      });

      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "Failed to save department.");
      }

      setForm(emptyForm());
      setShowModal(false);
      await loadDepartments();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save department.");
    } finally {
      setSaving(false);
    }
  }

  async function removeDepartment(id: string) {
    try {
      setError("");
      const response = await fetch(`${platformLinks.api}/api/admin/departments/${id}`, {
        method: "DELETE",
        credentials: "include"
      });

      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "Failed to delete department.");
      }

      await loadDepartments();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Failed to delete department.");
    }
  }

  return (
    <div className="space-y-8">
      <section className="rounded-3xl border border-white/10 bg-slate-900/60 p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold text-white">Department Management</h2>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">Manage operational departments, assign managers, and prepare the platform for downstream HR reporting logic.</p>
          </div>
          <div className="flex gap-3">
            <Link href="/admin/users" className="rounded-2xl border border-white/10 px-5 py-3 text-sm font-medium text-white">Users</Link>
            <button type="button" onClick={openCreate} className="rounded-2xl bg-cyan-400 px-5 py-3 text-sm font-medium text-slate-950">Create Department</button>
          </div>
        </div>

        {error ? <p className="mt-5 text-sm text-rose-300">{error}</p> : null}

        <div className="mt-6 overflow-x-auto">
          <table className="min-w-full text-left text-sm text-slate-200">
            <thead className="text-xs uppercase tracking-[0.16em] text-slate-400">
              <tr>
                <th className="px-3 py-3">Department Name</th>
                <th className="px-3 py-3">Department Type</th>
                <th className="px-3 py-3">Address</th>
                <th className="px-3 py-3">Manager</th>
                <th className="px-3 py-3">Created</th>
                <th className="px-3 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {departments.map((department) => (
                <tr key={department.id} className="border-t border-white/10">
                  <td className="px-3 py-4 font-medium text-white">{department.name}</td>
                  <td className="px-3 py-4 text-slate-300">{department.department_type || "Program"}</td>
                  <td className="px-3 py-4 text-slate-300">{department.address || "-"}</td>
                  <td className="px-3 py-4 text-slate-300">{department.manager_name ? `${department.manager_name}${department.manager_email ? ` (${department.manager_email})` : ""}` : "Unassigned"}</td>
                  <td className="px-3 py-4 text-slate-400">{department.created_at ? new Date(department.created_at).toLocaleDateString() : "-"}</td>
                  <td className="px-3 py-4">
                    <div className="flex gap-3">
                      <button type="button" onClick={() => startEdit(department)} className="rounded-xl border border-white/10 px-4 py-2 text-sm text-white">Edit</button>
                      <button type="button" onClick={() => void removeDepartment(department.id)} className="rounded-xl border border-rose-400/30 px-4 py-2 text-sm text-rose-200">Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {showModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-6 py-10 backdrop-blur-sm">
          <div className="w-full max-w-3xl rounded-3xl border border-white/10 bg-slate-900 p-8 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-2xl font-semibold text-white">{form.id ? "Edit Department" : "Create Department"}</h3>
                <p className="mt-2 text-sm text-slate-300">Register a department, add the operating address, and assign the responsible manager.</p>
              </div>
              <button type="button" onClick={() => { setShowModal(false); setForm(emptyForm()); }} className="rounded-2xl border border-white/10 px-4 py-2 text-sm text-white">Close</button>
            </div>

            <div className="mt-8 grid gap-4 md:grid-cols-2">
              <label className="text-sm text-slate-300 md:col-span-2">Department Name<input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-white" /></label>
              <label className="text-sm text-slate-300 md:col-span-2">Department Type<select value={form.departmentType} onChange={(event) => setForm((current) => ({ ...current, departmentType: event.target.value as "Community housing" | "Program" }))} className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-white"><option value="Community housing">Community housing</option><option value="Program">Program</option></select></label>
              <label className="text-sm text-slate-300 md:col-span-2">Address<input value={form.address} onChange={(event) => setForm((current) => ({ ...current, address: event.target.value }))} className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-white" /></label>
              <label className="text-sm text-slate-300 md:col-span-2">Manager<select value={form.managerId} onChange={(event) => setForm((current) => ({ ...current, managerId: event.target.value }))} className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-white"><option value="">Unassigned</option>{users.map((user) => <option key={user.id} value={user.id}>{`${user.first_name} ${user.last_name}`.trim()} ({user.email})</option>)}</select></label>
            </div>

            <div className="mt-8 flex gap-3">
              <button type="button" onClick={() => void saveDepartment()} disabled={saving} className="rounded-2xl bg-cyan-400 px-5 py-3 font-medium text-slate-950 disabled:opacity-60">{saving ? "Saving..." : form.id ? "Update Department" : "Create Department"}</button>
              <button type="button" onClick={() => setForm(emptyForm())} className="rounded-2xl border border-white/10 px-5 py-3 text-white">Reset</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
