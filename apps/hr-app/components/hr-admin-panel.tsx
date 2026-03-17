"use client";

import { useEffect, useMemo, useState } from "react";
import { Briefcase, Edit, Plus, Shield, Trash2, UserCog, Users, X } from "lucide-react";
import {
  createHrAssignment,
  deleteHrAssignment,
  getApiErrorMessage,
  getDepartments,
  getHrAssignments,
  getPlatformUsers,
  updateHrAssignment,
  type DepartmentRecord,
  type HrAssignment,
  type PlatformUserRecord
} from "../lib/hr-client";

type HrRoleValue = "ADMIN" | "MANAGER" | "EMPLOYEE";

type FormState = {
  userId: string;
  role: HrRoleValue;
  managerId: string;
  departmentId: string;
};

type AssignmentView = {
  id: number;
  userId: string;
  employeeName: string;
  employeeEmail: string;
  role: HrRoleValue;
  managerId: string;
  managerName: string;
  departmentId: string;
  departmentName: string;
};

function emptyForm(): FormState {
  return {
    userId: "",
    role: "EMPLOYEE",
    managerId: "",
    departmentId: ""
  };
}

function roleBadgeStyles(role: string) {
  if (role === "ADMIN") return "inline-flex px-2 py-1 text-xs font-semibold bg-green-100 text-green-700 rounded-full";
  if (role === "MANAGER") return "inline-flex px-2 py-1 text-xs font-semibold bg-orange-100 text-orange-700 rounded-full";
  return "inline-flex px-2 py-1 text-xs font-semibold bg-blue-100 text-blue-700 rounded-full";
}

export function HrAdminPanel() {
  const [users, setUsers] = useState<PlatformUserRecord[]>([]);
  const [departments, setDepartments] = useState<DepartmentRecord[]>([]);
  const [roles, setRoles] = useState<HrAssignment[]>([]);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ userId: string; employeeName: string } | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function load() {
    const [userData, departmentData, roleRows] = await Promise.allSettled([getPlatformUsers(), getDepartments(), getHrAssignments()]);
    const nextErrors: string[] = [];

    if (userData.status === "fulfilled") {
      console.log("[HR Admin] GET /api/users response", userData.value);
      setUsers(userData.value.items || []);
    } else {
      console.error("[HR Admin] GET /api/users failed", userData.reason);
      setUsers([]);
      nextErrors.push("Unable to load platform users.");
    }

    if (departmentData.status === "fulfilled") {
      setDepartments(departmentData.value.items || []);
    } else {
      console.error("[HR Admin] GET /api/departments failed", departmentData.reason);
      setDepartments([]);
      nextErrors.push("Unable to load departments.");
    }

    if (roleRows.status === "fulfilled") {
      console.log("[HR Admin] GET /api/hr/roles response", roleRows.value);
      setRoles(roleRows.value.items || []);
    } else {
      console.error("[HR Admin] GET /api/hr/roles failed", roleRows.reason);
      setRoles([]);
      nextErrors.push("Unable to load HR assignments.");
    }

    setError(nextErrors[0] ?? "");
  }

  useEffect(() => {
    void load();
  }, []);

  const departmentNameById = useMemo(() => new Map(departments.map((department) => [department.id, department.name])), [departments]);

  const assignments = useMemo<AssignmentView[]>(() => {
    return roles.map((item) => {
      const employee = users.find((candidate) => candidate.id === String(item.user_id ?? ""));
      const manager = users.find((candidate) => candidate.id === String(item.manager_id ?? ""));
      const departmentId = String(employee?.department_id ?? "");
      return {
        id: Number(item.id),
        userId: String(item.user_id ?? ""),
        employeeName: employee?.name || String(item.user_id ?? "Unknown user"),
        employeeEmail: employee?.email || "",
        role: String(item.hr_role ?? "EMPLOYEE") as HrRoleValue,
        managerId: item.manager_id ? String(item.manager_id) : "",
        managerName: manager?.name || "-",
        departmentId,
        departmentName: departmentId ? departmentNameById.get(departmentId) || "Unassigned" : "Unassigned"
      };
    });
  }, [departmentNameById, roles, users]);

  const stats = {
    totalUsers: users.length,
    managers: assignments.filter((item) => item.role === "MANAGER").length,
    admins: assignments.filter((item) => item.role === "ADMIN").length
  };

  const managerOptions = useMemo(() => users.filter((user) => user.id !== form.userId), [users, form.userId]);

  function resetModal() {
    setShowModal(false);
    setEditingUserId(null);
    setForm(emptyForm());
  }

  function openCreateModal() {
    setError("");
    setSuccess("");
    setEditingUserId(null);
    setForm(emptyForm());
    setShowModal(true);
  }

  function openEditModal(assignment: AssignmentView) {
    setError("");
    setSuccess("");
    setForm({
      userId: assignment.userId,
      role: assignment.role,
      managerId: assignment.managerId,
      departmentId: assignment.departmentId
    });
    setEditingUserId(assignment.userId);
    setShowModal(true);
  }

  async function saveAssignment() {
    try {
      setSaving(true);
      setError("");
      setSuccess("");

      if (!form.userId) {
        setError("Select an employee before saving.");
        return;
      }

      if (editingUserId) {
        await updateHrAssignment(editingUserId, {
          role: form.role,
          managerId: form.managerId || null,
          departmentId: form.departmentId || null
        });
        setSuccess("HR assignment updated.");
      } else {
        await createHrAssignment({
          userId: form.userId,
          role: form.role,
          managerId: form.managerId || null,
          departmentId: form.departmentId || null
        });
        setSuccess("HR assignment saved.");
      }

      resetModal();
      await load();
    } catch (saveError) {
      setError(getApiErrorMessage(saveError));
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;

    try {
      setDeleting(true);
      setError("");
      setSuccess("");
      await deleteHrAssignment(deleteTarget.userId);
      setDeleteTarget(null);
      setSuccess("HR assignment removed.");
      await load();
    } catch (deleteError) {
      setError(getApiErrorMessage(deleteError));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="legacy-portal">
      <div className="legacy-header">
        <div>
          <h1 className="legacy-header__title">HR Permission Management</h1>
          <p className="legacy-header__subtitle">Assign HR roles, departments, and reporting hierarchy using the shared VLWorkHub platform user directory.</p>
          <div className="legacy-role"><Shield className="h-4 w-4" />Platform-linked HR administration</div>
        </div>
      </div>

      {error ? <div className="hr-card" style={{ marginBottom: 20, color: "#7f1d1d", borderColor: "#fecaca", background: "#fff1f2" }}>{error}</div> : null}
      {success ? <div className="hr-card" style={{ marginBottom: 20, color: "#14532d", borderColor: "#86efac", background: "#f0fdf4" }}>{success}</div> : null}

      <section className="legacy-stats-grid">
        <div className="legacy-stat-card blue"><div className="legacy-stat-icon"><Users className="h-5 w-5" /></div><div><p className="legacy-stat-value">{stats.totalUsers}</p><p className="legacy-stat-title">Platform Users</p></div></div>
        <div className="legacy-stat-card amber"><div className="legacy-stat-icon"><Briefcase className="h-5 w-5" /></div><div><p className="legacy-stat-value">{stats.managers}</p><p className="legacy-stat-title">Managers</p></div></div>
        <div className="legacy-stat-card green"><div className="legacy-stat-icon"><UserCog className="h-5 w-5" /></div><div><p className="legacy-stat-value">{stats.admins}</p><p className="legacy-stat-title">HR Admins</p></div></div>
      </section>

      <section className="legacy-card">
        <div className="legacy-card-header">
          <div>
            <h3 className="legacy-card-title">Current HR Assignments</h3>
            <p className="legacy-card-copy">Employee reporting structure, departments, and HR roles sourced from shared platform users.</p>
          </div>
          <button type="button" className="legacy-primary-btn" onClick={openCreateModal}><Plus className="h-4 w-4" />Assign HR Role</button>
        </div>

        <div className="mt-5 overflow-x-auto">
          <table className="min-w-full text-left text-sm text-gray-700">
            <thead className="text-xs uppercase tracking-[0.16em] text-gray-500">
              <tr>
                <th className="px-3 py-3">Employee</th>
                <th className="px-3 py-3">Role</th>
                <th className="px-3 py-3">Department</th>
                <th className="px-3 py-3">Reports To</th>
                <th className="px-3 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {assignments.map((assignment) => (
                <tr key={assignment.id} className="border-t border-gray-200">
                  <td className="px-3 py-4">
                    <div className="text-sm font-semibold text-gray-900">{assignment.employeeEmail || assignment.employeeName}</div>
                    <div className="text-xs text-gray-500">{assignment.employeeName}</div>
                  </td>
                  <td className="px-3 py-4">
                    <span className={roleBadgeStyles(assignment.role)}>{assignment.role}</span>
                  </td>
                  <td className="px-3 py-4 text-sm text-gray-700">{assignment.departmentName}</td>
                  <td className="px-3 py-4 text-sm text-gray-700">{assignment.managerName}</td>
                  <td className="px-3 py-4">
                    <div className="flex items-center gap-2">
                      <button type="button" className="legacy-icon-btn" onClick={() => openEditModal(assignment)} aria-label={`Edit HR assignment for ${assignment.employeeName}`}>
                        <Edit className="h-4 w-4" />
                      </button>
                      <button type="button" className="legacy-icon-btn" onClick={() => setDeleteTarget({ userId: assignment.userId, employeeName: assignment.employeeName })} aria-label={`Delete HR assignment for ${assignment.employeeName}`}>
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!assignments.length ? <p className="mt-4 text-sm text-gray-700">No HR role assignments yet.</p> : null}
        </div>
      </section>

      {showModal ? (
        <div className="legacy-modal-overlay">
          <div className="legacy-modal" style={{ maxWidth: 640 }}>
            <div className="legacy-modal-header">
              <h2>{editingUserId ? "Edit HR Assignment" : "Assign HR Role"}</h2>
              <button type="button" className="legacy-icon-btn" onClick={resetModal}><X className="h-4 w-4" /></button>
            </div>
            <div className="legacy-modal-body">
              <div className="legacy-form-grid">
                <div className="legacy-form-group legacy-form-group--full">
                  <label>Employee</label>
                  <select value={form.userId} onChange={(event) => {
                    const selectedUserId = event.target.value;
                    const selectedUser = users.find((user) => user.id === selectedUserId);
                    setForm((current) => ({
                      ...current,
                      userId: selectedUserId,
                      managerId: current.managerId === selectedUserId ? "" : current.managerId,
                      departmentId: selectedUser?.department_id ? String(selectedUser.department_id) : current.departmentId
                    }));
                  }} disabled={Boolean(editingUserId)}>
                    <option value="">Select employee</option>
                    {users.map((user) => <option key={user.id} value={user.id}>{user.name} ({user.email})</option>)}
                  </select>
                </div>
                <div className="legacy-form-group">
                  <label>Role</label>
                  <select value={form.role} onChange={(event) => setForm((current) => ({ ...current, role: event.target.value as HrRoleValue }))}>
                    <option value="EMPLOYEE">Employee</option>
                    <option value="MANAGER">Manager</option>
                    <option value="ADMIN">Admin</option>
                  </select>
                </div>
                <div className="legacy-form-group">
                  <label>Department</label>
                  <select value={form.departmentId} onChange={(event) => setForm((current) => ({ ...current, departmentId: event.target.value }))}>
                    <option value="">Unassigned</option>
                    {departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
                  </select>
                </div>
                <div className="legacy-form-group legacy-form-group--full">
                  <label>Reports To</label>
                  <select value={form.managerId} onChange={(event) => setForm((current) => ({ ...current, managerId: event.target.value }))}>
                    <option value="">Select manager</option>
                    {managerOptions.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
                  </select>
                </div>
              </div>
            </div>
            <div className="legacy-modal-footer">
              <button type="button" className="legacy-secondary-btn" onClick={resetModal}>Cancel</button>
              <button type="button" className="legacy-primary-btn" onClick={() => void saveAssignment()} disabled={!form.userId || saving}>{saving ? "Saving..." : editingUserId ? "Update Assignment" : "Save HR Assignment"}</button>
            </div>
          </div>
        </div>
      ) : null}

      {deleteTarget ? (
        <div className="legacy-modal-overlay">
          <div className="legacy-modal" style={{ maxWidth: 520 }}>
            <div className="legacy-modal-header">
              <h2>Remove HR Assignment</h2>
              <button type="button" className="legacy-icon-btn" onClick={() => setDeleteTarget(null)}><X className="h-4 w-4" /></button>
            </div>
            <div className="legacy-modal-body">
              <p className="text-sm text-gray-700">Are you sure you want to remove this HR assignment?</p>
              <p className="mt-3 text-sm font-medium text-gray-900">{deleteTarget.employeeName}</p>
            </div>
            <div className="legacy-modal-footer">
              <button type="button" className="legacy-secondary-btn" onClick={() => setDeleteTarget(null)}>Cancel</button>
              <button type="button" onClick={() => void confirmDelete()} disabled={deleting} className="legacy-secondary-btn disabled:opacity-60" style={{ backgroundColor: "#dc2626", color: "#ffffff", border: "1.5px solid #dc2626" }}>{deleting ? "Deleting..." : "Delete"}</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
