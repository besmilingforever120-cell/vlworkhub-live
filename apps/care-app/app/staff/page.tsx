"use client";

import { useEffect, useMemo, useState } from "react";
import { ArchiveRestore, Pencil, Plus, Search, UserCog, X } from "lucide-react";
import type { SessionUser } from "@vlworkhub/types";
import {
  createResource,
  getApiErrorMessage,
  getCurrentUser,
  getResource,
  updateResource,
  type CareRecord
} from "../../lib/care-client";

type StaffStatusFilter = "all" | "active" | "archived";

type StaffForm = {
  full_name: string;
  role: string;
  email: string;
  phone: string;
  department: string;
  manager_name: string;
  status: string;
};

function emptyForm(): StaffForm {
  return {
    full_name: "",
    role: "Life Skills Worker",
    email: "",
    phone: "",
    department: "Community Inclusion",
    manager_name: "",
    status: "Active"
  };
}

function isArchived(record: CareRecord) {
  return String(record.status || "").toLowerCase() === "archived";
}

export default function StaffPage() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [staff, setStaff] = useState<CareRecord[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StaffStatusFilter>("active");
  const [selectedStaffId, setSelectedStaffId] = useState<number | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<StaffForm>(emptyForm());
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function load() {
    try {
      setError(null);
      const [session, staffItems] = await Promise.all([getCurrentUser(), getResource("staff")]);
      setUser(session);
      setStaff(staffItems);
      setSelectedStaffId((current) => current ?? Number(staffItems[0]?.id ?? null));
    } catch (loadError) {
      setError(getApiErrorMessage(loadError));
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const managerOptions = useMemo(() => {
    return staff
      .filter((record) => !isArchived(record))
      .filter((record) => {
        const role = String(record.role || "").toLowerCase();
        return role.includes("manager") || role.includes("supervisor") || role.includes("coordinator") || role.includes("administrator");
      })
      .map((record) => String(record.full_name || ""))
      .filter(Boolean)
      .sort((left, right) => left.localeCompare(right));
  }, [staff]);

  const filteredStaff = useMemo(() => {
    const query = search.trim().toLowerCase();
    return staff.filter((record) => {
      const archived = isArchived(record);
      if (statusFilter === "active" && archived) return false;
      if (statusFilter === "archived" && !archived) return false;
      if (!query) return true;
      return [record.full_name, record.role, record.department, record.email, record.manager_name]
        .map((value) => String(value || "").toLowerCase())
        .some((value) => value.includes(query));
    });
  }, [staff, search, statusFilter]);

  const selectedStaff = useMemo(
    () => filteredStaff.find((record) => Number(record.id) === selectedStaffId) || filteredStaff[0] || null,
    [filteredStaff, selectedStaffId]
  );

  const archivedCount = staff.filter((record) => isArchived(record)).length;
  const activeCount = staff.length - archivedCount;
  const departments = new Set(staff.map((record) => String(record.department || "")).filter(Boolean)).size;

  function openCreateModal() {
    setEditingId(null);
    setForm(emptyForm());
    setIsModalOpen(true);
  }

  function openEditModal(record: CareRecord) {
    setEditingId(Number(record.id));
    setForm({
      full_name: String(record.full_name || ""),
      role: String(record.role || "Life Skills Worker"),
      email: String(record.email || ""),
      phone: String(record.phone || ""),
      department: String(record.department || ""),
      manager_name: String(record.manager_name || ""),
      status: String(record.status || "Active")
    });
    setIsModalOpen(true);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      setIsSaving(true);
      if (editingId) {
        await updateResource("staff", editingId, form);
      } else {
        await createResource("staff", form);
      }
      setIsModalOpen(false);
      setEditingId(null);
      setForm(emptyForm());
      await load();
    } catch (submitError) {
      setError(getApiErrorMessage(submitError));
    } finally {
      setIsSaving(false);
    }
  }

  async function toggleArchive(record: CareRecord) {
    try {
      const nextStatus = isArchived(record) ? "Active" : "Archived";
      await updateResource("staff", Number(record.id), {
        full_name: String(record.full_name || ""),
        role: String(record.role || ""),
        email: String(record.email || ""),
        phone: String(record.phone || ""),
        department: String(record.department || ""),
        manager_name: String(record.manager_name || ""),
        status: nextStatus
      });
      await load();
    } catch (archiveError) {
      setError(getApiErrorMessage(archiveError));
    }
  }

  return (
    <div className="care-page">
      <header className="care-topbar">
        <div className="care-topbar__brand">
          <div className="care-logo">VC</div>
          <div>
            <p className="care-topbar__system">Site Administrator</p>
            <p className="care-topbar__organization">Staff Management</p>
          </div>
        </div>
        <div className="care-topbar__meta">
          <span className="care-live-dot" />
          <span>Shared API connected</span>
          <span className="care-user-pill">{user ? user.fullName : "Loading session"}</span>
        </div>
      </header>

      <div className="care-content">
        {error ? <div className="care-error">{error}</div> : null}

        <section className="care-card care-card--full">
          <div className="care-headline">
            <div>
              <h2>Employees Management</h2>
              <p>Legacy site-admin structure restored with shared platform CRUD underneath.</p>
            </div>
            <button type="button" className="care-primary-btn" onClick={openCreateModal}>
              + Add New User
            </button>
          </div>
          <div className="care-metrics">
            <div className="care-metric">
              <p className="care-metric__label">Active Staff</p>
              <p className="care-metric__value">{activeCount}</p>
              <p className="care-metric__helper">Enabled staff records available to care operations</p>
            </div>
            <div className="care-metric">
              <p className="care-metric__label">Archived Staff</p>
              <p className="care-metric__value">{archivedCount}</p>
              <p className="care-metric__helper">Historical records kept for reference and rehiring</p>
            </div>
            <div className="care-metric">
              <p className="care-metric__label">Departments</p>
              <p className="care-metric__value">{departments}</p>
              <p className="care-metric__helper">Program areas represented across the roster</p>
            </div>
          </div>
        </section>

        <div className="care-data-layout">
          <section className="care-card">
            <div className="care-toolbar">
              <div className="care-searchbar">
                <Search className="h-4 w-4 text-slate-500" />
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by name, department, role, or manager" />
              </div>
              <div className="care-filterbar">
                {[
                  { key: "active", label: "Active" },
                  { key: "archived", label: "Archived" },
                  { key: "all", label: "All" }
                ].map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => setStatusFilter(option.key as StaffStatusFilter)}
                    className={`care-filter-btn ${statusFilter === option.key ? "is-selected" : ""}`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="care-table-wrapper">
              <table className="care-table">
                <thead>
                  <tr>
                    <th>Staff</th>
                    <th>Role</th>
                    <th>Department</th>
                    <th>Manager</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStaff.map((record) => {
                    const recordId = Number(record.id);
                    const archived = isArchived(record);
                    const selected = selectedStaff?.id === record.id;
                    return (
                      <tr key={recordId} className={`${selected ? "is-selected" : ""} ${archived ? "is-archived" : ""}`.trim()}>
                        <td>
                          <button type="button" onClick={() => setSelectedStaffId(recordId)} className="text-left">
                            <p className="care-name">{String(record.full_name || "Unnamed User")}</p>
                            <span className="care-subtext">{String(record.email || "No email")}</span>
                          </button>
                        </td>
                        <td>{String(record.role || "Unassigned")}</td>
                        <td>{String(record.department || "Unassigned")}</td>
                        <td>{String(record.manager_name || "Unassigned")}</td>
                        <td>
                          <span className={`care-status-pill ${archived ? "is-archived" : "is-active"}`}>
                            {String(record.status || "Unknown")}
                          </span>
                        </td>
                        <td>
                          <div className="care-filterbar" style={{ justifyContent: "flex-end" }}>
                            <button type="button" className="care-mini-btn" onClick={() => openEditModal(record)}>
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button type="button" className="care-mini-btn" onClick={() => void toggleArchive(record)}>
                              <ArchiveRestore className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredStaff.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="care-muted">No staff records match the current filters.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>

          <section className="care-card">
            <div className="care-card__header">
              <div>
                <p className="care-panel-note">Selected User</p>
                <h3>Detail Pane</h3>
              </div>
            </div>
            {selectedStaff ? (
              <div className="care-detail-stack">
                <div className="care-detail-box">
                  <p className="care-subtext">Staff Member</p>
                  <h3>{String(selectedStaff.full_name || "Unnamed User")}</h3>
                  <p>{String(selectedStaff.role || "Unassigned")} · {String(selectedStaff.department || "No department")}</p>
                </div>
                <div className="care-detail-box">
                  <p className="care-subtext">Manager</p>
                  <p>{String(selectedStaff.manager_name || "Unassigned")}</p>
                </div>
                <div className="care-detail-box">
                  <p className="care-subtext">Contact</p>
                  <p>{String(selectedStaff.email || "No email")}</p>
                  <p>{String(selectedStaff.phone || "No phone")}</p>
                </div>
                <div className="care-detail-box">
                  <p className="care-subtext">Lifecycle</p>
                  <p>{isArchived(selectedStaff) ? "Archived and retained for historical reference or rehiring." : "Active and available to care operations."}</p>
                </div>
                <button type="button" className="care-primary-btn is-dark" onClick={() => openEditModal(selectedStaff)}>
                  Edit Staff Record
                </button>
              </div>
            ) : (
              <div className="care-detail-box">
                <p>Select a staff member to inspect the record details.</p>
              </div>
            )}
          </section>
        </div>
      </div>

      {isModalOpen ? (
        <div className="care-modal">
          <div className="care-modal__backdrop" onClick={() => setIsModalOpen(false)} aria-hidden="true" />
          <section className="care-modal__panel" role="dialog" aria-modal="true" aria-labelledby="careStaffModalTitle">
            <div className="care-card__header">
              <div>
                <p className="care-panel-note">{editingId ? "Update User" : "Create User"}</p>
                <h3 id="careStaffModalTitle">{editingId ? "Edit staff record" : "Add a new staff record"}</h3>
              </div>
              <button type="button" className="care-modal__close" onClick={() => setIsModalOpen(false)}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="care-form-grid">
              <label className="care-field">
                <span>Full Name</span>
                <input value={form.full_name} onChange={(event) => setForm((current) => ({ ...current, full_name: event.target.value }))} required />
              </label>
              <label className="care-field">
                <span>Role</span>
                <input value={form.role} onChange={(event) => setForm((current) => ({ ...current, role: event.target.value }))} required />
              </label>
              <label className="care-field">
                <span>Email</span>
                <input type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} required />
              </label>
              <label className="care-field">
                <span>Phone</span>
                <input value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} />
              </label>
              <label className="care-field">
                <span>Department</span>
                <input value={form.department} onChange={(event) => setForm((current) => ({ ...current, department: event.target.value }))} required />
              </label>
              <label className="care-field">
                <span>Manager</span>
                <select value={form.manager_name} onChange={(event) => setForm((current) => ({ ...current, manager_name: event.target.value }))}>
                  <option value="">Unassigned</option>
                  {managerOptions.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </label>
              <label className="care-field care-field--full">
                <span>Status</span>
                <select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))}>
                  <option value="Active">Active</option>
                  <option value="Archived">Archived</option>
                </select>
              </label>
              <div className="care-field care-field--full">
                <div className="care-callout">
                  <UserCog className="mt-0.5 h-5 w-5 text-cyan-300" />
                  <p>
                    This migrated form keeps the legacy site-admin workflow emphasis on manager assignment and lifecycle state,
                    but writes directly to the shared Care API instead of local JSON state.
                  </p>
                </div>
              </div>
              <div className="care-form-actions">
                <button type="button" onClick={() => setIsModalOpen(false)}>Cancel</button>
                <button type="submit" className="care-primary-btn">{isSaving ? "Saving..." : editingId ? "Update User" : "Create User"}</button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </div>
  );
}
