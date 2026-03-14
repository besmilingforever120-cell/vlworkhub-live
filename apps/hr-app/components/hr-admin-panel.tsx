"use client";

import { useEffect, useMemo, useState } from "react";
import { Briefcase, Save, Shield, UserCog, Users } from "lucide-react";
import { getApiErrorMessage, getHrAssignments, getPlatformUsers, saveHrAssignment, type HrAssignment } from "../lib/hr-client";

type PlatformUser = { id: string; name: string; email: string };

export function HrAdminPanel() {
  const [users, setUsers] = useState<PlatformUser[]>([]);
  const [roles, setRoles] = useState<HrAssignment[]>([]);
  const [userId, setUserId] = useState("");
  const [role, setRole] = useState<"ADMIN" | "MANAGER" | "EMPLOYEE">("EMPLOYEE");
  const [managerId, setManagerId] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function load() {
    setError("");

    const [userData, roleRows] = await Promise.allSettled([getPlatformUsers(), getHrAssignments()]);

    if (userData.status === "fulfilled") {
      console.log("[HR Admin] GET /api/users response", userData.value);
      setUsers(userData.value.items || []);
    } else {
      console.error("[HR Admin] GET /api/users failed", userData.reason);
      setUsers([]);
      setError("Unable to load platform users.");
    }

    if (roleRows.status === "fulfilled") {
      console.log("[HR Admin] GET /hr/user-roles response", roleRows.value);
      setRoles(roleRows.value.items || []);
    } else {
      console.error("[HR Admin] GET /hr/user-roles failed", roleRows.reason);
      setRoles([]);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const assignments = useMemo(() => {
    return roles.map((item) => {
      const employee = users.find((candidate) => candidate.id === String(item.user_id ?? ""));
      const manager = users.find((candidate) => candidate.id === String(item.manager_id ?? ""));
      return {
        id: Number(item.id),
        employeeName: employee?.name || String(item.user_id ?? "Unknown user"),
        employeeEmail: employee?.email || "",
        role: String(item.hr_role ?? "EMPLOYEE"),
        managerName: manager?.name || "Not assigned"
      };
    });
  }, [roles, users]);

  const availableUsers = useMemo(() => users, [users]);
  const managerOptions = useMemo(() => users.filter((user) => user.id !== userId), [users, userId]);

  async function saveAssignment() {
    try {
      setError("");
      setSuccess("");
      if (!userId) {
        setError("Select an employee before saving.");
        return;
      }

      const result = await saveHrAssignment({
        userId,
        hrRole: role,
        managerId: managerId || null
      });

      setSuccess("HR assignment saved.");
      setUserId("");
      setRole("EMPLOYEE");
      setManagerId("");
      await load();
      console.log("[HR Admin] saved assignment", result.item);
    } catch (saveError) {
      setError(getApiErrorMessage(saveError));
    }
  }

  return (
    <div className="legacy-portal">
      <div className="legacy-header">
        <div>
          <h1 className="legacy-header__title">HR Permission Management</h1>
          <p className="legacy-header__subtitle">Assign HR roles and reporting hierarchy using the shared VLWorkHub platform user directory.</p>
          <div className="legacy-role"><Shield className="h-4 w-4" />Platform-linked HR administration</div>
        </div>
      </div>

      {error ? <div className="hr-card" style={{ marginBottom: 20, color: "#7f1d1d", borderColor: "#fecaca", background: "#fff1f2" }}>{error}</div> : null}
      {success ? <div className="hr-card" style={{ marginBottom: 20, color: "#14532d", borderColor: "#86efac", background: "#f0fdf4" }}>{success}</div> : null}

      <section className="legacy-stats-grid">
        <div className="legacy-stat-card blue"><div className="legacy-stat-icon"><Users className="h-5 w-5" /></div><div><p className="legacy-stat-value">{availableUsers.length}</p><p className="legacy-stat-title">Platform Users</p></div></div>
        <div className="legacy-stat-card amber"><div className="legacy-stat-icon"><Briefcase className="h-5 w-5" /></div><div><p className="legacy-stat-value">{assignments.filter((item) => item.role === "MANAGER").length}</p><p className="legacy-stat-title">Managers</p></div></div>
        <div className="legacy-stat-card green"><div className="legacy-stat-icon"><UserCog className="h-5 w-5" /></div><div><p className="legacy-stat-value">{assignments.filter((item) => item.role === "ADMIN").length}</p><p className="legacy-stat-title">HR Admins</p></div></div>
      </section>

      <section className="legacy-card-grid" style={{ display: "grid", gap: "24px", gridTemplateColumns: "minmax(340px, 0.95fr) minmax(480px, 1.05fr)" }}>
        <section className="legacy-card">
          <div className="legacy-card-header">
            <div>
              <h3 className="legacy-card-title">Assign HR Role</h3>
              <p className="legacy-card-copy">Select an employee, choose the HR role, and define the reporting manager.</p>
            </div>
          </div>
          <div className="legacy-modal-body" style={{ padding: 0 }}>
            <div className="legacy-form-grid">
              <div className="legacy-form-group legacy-form-group--full">
                <label>Employee Dropdown</label>
                <select value={userId} onChange={(event) => setUserId(event.target.value)}>
                  <option value="">Select employee</option>
                  {availableUsers.map((user) => <option key={user.id} value={user.id}>{user.name} ({user.email})</option>)}
                </select>
              </div>
              <div className="legacy-form-group">
                <label>Role Dropdown</label>
                <select value={role} onChange={(event) => setRole(event.target.value as "ADMIN" | "MANAGER" | "EMPLOYEE") }>
                  <option value="ADMIN">HR Admin</option>
                  <option value="MANAGER">Manager</option>
                  <option value="EMPLOYEE">Employee</option>
                </select>
              </div>
              <div className="legacy-form-group">
                <label>Reports To Dropdown</label>
                <select value={managerId} onChange={(event) => setManagerId(event.target.value)}>
                  <option value="">No manager selected</option>
                  {managerOptions.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
                </select>
              </div>
            </div>
          </div>
          <div className="legacy-modal-footer" style={{ padding: 0, marginTop: 20, borderTop: "none" }}>
            <button type="button" className="legacy-primary-btn" onClick={() => void saveAssignment()} disabled={!userId}><Save className="h-4 w-4" />Save HR Assignment</button>
          </div>
        </section>

        <section className="legacy-card">
          <div className="legacy-card-header">
            <div>
              <h3 className="legacy-card-title">Current HR Assignments</h3>
              <p className="legacy-card-copy">Employee reporting structure and HR roles sourced from shared platform users.</p>
            </div>
          </div>
          <div className="mt-5 overflow-x-auto">
            <table className="min-w-full text-left text-sm text-slate-200">
              <thead className="text-xs uppercase tracking-[0.16em] text-slate-400">
                <tr>
                  <th className="px-3 py-3">Employee</th>
                  <th className="px-3 py-3">Role</th>
                  <th className="px-3 py-3">Reports To</th>
                </tr>
              </thead>
              <tbody>
                {assignments.map((assignment) => (
                  <tr key={assignment.id} className="border-t border-white/10">
                    <td className="px-3 py-4">
                      <div className="font-medium text-white">{assignment.employeeName}</div>
                      <div className="text-xs text-slate-400">{assignment.employeeEmail}</div>
                    </td>
                    <td className="px-3 py-4">
                      <span className="legacy-filter-btn is-active" style={{ cursor: "default" }}>{assignment.role}</span>
                    </td>
                    <td className="px-3 py-4">{assignment.managerName}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!assignments.length ? <p className="mt-4 text-sm text-slate-400">No HR role assignments yet.</p> : null}
          </div>
        </section>
      </section>
    </div>
  );
}
