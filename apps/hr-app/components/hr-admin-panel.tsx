"use client";

import { useEffect, useMemo, useState } from "react";
import { createResource, getApiErrorMessage, getPlatformUsers, getResource, updateResource, type HrRecord } from "../lib/hr-client";

export function HrAdminPanel() {
  const [users, setUsers] = useState<Array<{ id: string; name: string; email: string }>>([]);
  const [roles, setRoles] = useState<HrRecord[]>([]);
  const [userId, setUserId] = useState("");
  const [role, setRole] = useState("employee");
  const [departmentId, setDepartmentId] = useState("");
  const [error, setError] = useState("");

  async function load() {
    try {
      setError("");
      const [userData, roleRows] = await Promise.all([getPlatformUsers(), getResource("hr_user_roles")]);
      setUsers(userData.items || []);
      setRoles(roleRows);
    } catch (loadError) {
      setError(getApiErrorMessage(loadError));
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const assignments = useMemo(() => {
    return roles.map((item) => {
      const user = users.find((candidate) => candidate.id === String(item.user_id ?? ""));
      return {
        id: Number(item.id),
        userName: user?.name || String(item.user_id ?? "Unknown user"),
        email: user?.email || "",
        role: String(item.role ?? "employee"),
        departmentId: String(item.department_id ?? "")
      };
    });
  }, [roles, users]);

  async function saveAssignment() {
    try {
      const existing = roles.find((item) => String(item.user_id ?? "") === userId);
      const payload = { user_id: userId, role, department_id: departmentId };
      if (existing) {
        await updateResource("hr_user_roles", Number(existing.id), payload);
      } else {
        await createResource("hr_user_roles", payload);
      }
      setUserId("");
      setRole("employee");
      setDepartmentId("");
      await load();
    } catch (saveError) {
      setError(getApiErrorMessage(saveError));
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-white/10 bg-white/5 p-6">
        <h2 className="text-xl font-semibold">HR Role Assignment</h2>
        <p className="mt-2 text-sm leading-6 text-slate-300">Assign HR-specific roles and departments to globally managed VLWorkHub users. HR does not create users locally.</p>
      </section>

      <section className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
          <h3 className="text-lg font-semibold">Assign Role</h3>
          <div className="mt-5 grid gap-4">
            <label className="text-sm text-slate-300">User<select value={userId} onChange={(event) => setUserId(event.target.value)} className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-white"><option value="">Select user</option>{users.map((user) => <option key={user.id} value={user.id}>{user.name} ({user.email})</option>)}</select></label>
            <label className="text-sm text-slate-300">HR Role<select value={role} onChange={(event) => setRole(event.target.value)} className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-white"><option value="admin">Admin</option><option value="manager">Manager</option><option value="employee">Employee</option></select></label>
            <label className="text-sm text-slate-300">Department<input value={departmentId} onChange={(event) => setDepartmentId(event.target.value)} className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-white" placeholder="people, operations, support" /></label>
            {error ? <p className="text-sm text-rose-300">{error}</p> : null}
            <button type="button" onClick={() => void saveAssignment()} className="rounded-2xl bg-cyan-400 px-5 py-3 font-medium text-slate-950">Save HR Assignment</button>
          </div>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
          <h3 className="text-lg font-semibold">Current HR Assignments</h3>
          <div className="mt-5 space-y-3">
            {assignments.map((assignment) => (
              <article key={assignment.id} className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="font-medium text-white">{assignment.userName}</div>
                    <div className="text-sm text-slate-400">{assignment.email}</div>
                  </div>
                  <div className="text-right text-sm text-slate-200">
                    <div>{assignment.role}</div>
                    <div className="text-slate-400">{assignment.departmentId || "No department"}</div>
                  </div>
                </div>
              </article>
            ))}
            {!assignments.length ? <p className="text-sm text-slate-400">No HR role assignments yet.</p> : null}
          </div>
        </div>
      </section>
    </div>
  );
}
