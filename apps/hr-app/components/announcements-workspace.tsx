"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Calendar, CheckCircle, Edit, Info, Megaphone, Plus, Save, Search, Shield, Trash2, X } from "lucide-react";
import type { SessionUser } from "@vlworkhub/types";
import {
  createResource,
  deleteResource,
  getApiErrorMessage,
  getCurrentUser,
  getDepartments,
  getResource,
  updateResource,
  type DepartmentRecord,
  type HrRecord
} from "../lib/hr-client";
import { useHrRole } from "../lib/use-hr-role";
import { canCreateForHrRole, canEditForHrRole, formatDate, formatHrRoleLabel } from "../lib/workflow-utils";

const priorities = ["All", "Highly Important", "Important", "Normal"] as const;

type FormState = {
  title: string;
  body: string;
  audience: string;
  publish_date: string;
  start_date: string;
  end_date: string;
  priority: string;
  status: string;
};

function emptyForm(): FormState {
  return {
    title: "",
    body: "",
    audience: "All Staff",
    publish_date: "",
    start_date: "",
    end_date: "",
    priority: "Normal",
    status: "Draft"
  };
}

function isExpired(item: HrRecord) {
  const raw = String(item.end_date ?? "").trim();
  if (!raw) return false;
  const endDate = new Date(raw);
  if (Number.isNaN(endDate.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  endDate.setHours(0, 0, 0, 0);
  return endDate < today;
}

export function AnnouncementsWorkspace() {
  const { role: hrRole } = useHrRole();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [items, setItems] = useState<HrRecord[]>([]);
  const [departments, setDepartments] = useState<DepartmentRecord[]>([]);
  const [query, setQuery] = useState("");
  const [priorityFilter, setPriorityFilter] = useState<(typeof priorities)[number]>("All");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    try {
      setError("");
      const [session, announcementData, departmentData] = await Promise.all([getCurrentUser(), getResource("announcements"), getDepartments()]);
      setUser(session);
      setItems(announcementData);
      setDepartments(departmentData.items || []);
    } catch (loadError) {
      setError(getApiErrorMessage(loadError));
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const canManage = canCreateForHrRole(hrRole);
  const canEdit = canEditForHrRole(hrRole);

  const filtered = useMemo(() => items.filter((item) => {
    const matchesPriority = priorityFilter === "All" || String(item.priority ?? "Normal") === priorityFilter;
    const text = [item.title, item.body, item.audience].map((value) => String(value ?? "").toLowerCase());
    return matchesPriority && text.some((value) => value.includes(query.toLowerCase()));
  }), [items, priorityFilter, query]);

  const stats = {
    total: items.length,
    important: items.filter((item) => String(item.priority ?? "").includes("Important")).length,
    published: items.filter((item) => String(item.status ?? "").toLowerCase() === "published").length
  };

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm());
    setShowForm(true);
  }

  function openEdit(item: HrRecord) {
    setEditingId(Number(item.id));
    setForm({
      title: String(item.title ?? ""),
      body: String(item.body ?? ""),
      audience: String(item.audience ?? "All Staff"),
      publish_date: String(item.publish_date ?? ""),
      start_date: String(item.start_date ?? ""),
      end_date: String(item.end_date ?? ""),
      priority: String(item.priority ?? "Normal"),
      status: String(item.status ?? "Draft")
    });
    setShowForm(true);
  }

  async function save() {
    try {
      const payload = {
        title: form.title,
        body: form.body,
        audience: form.audience,
        publish_date: form.publish_date || null,
        start_date: form.start_date || null,
        end_date: form.end_date || null,
        priority: form.priority,
        status: form.status
      };

      if (editingId) {
        await updateResource("announcements", editingId, payload);
      } else {
        await createResource("announcements", payload);
      }
      setShowForm(false);
      setEditingId(null);
      setForm(emptyForm());
      await load();
    } catch (saveError) {
      setError(getApiErrorMessage(saveError));
    }
  }

  async function remove(id: number) {
    try {
      await deleteResource("announcements", id);
      await load();
    } catch (deleteError) {
      setError(getApiErrorMessage(deleteError));
    }
  }

  return (
    <div className="legacy-portal" style={{ maxWidth: 1200 }}>
      {error ? <div className="hr-card" style={{ marginBottom: 20, color: "#b91c1c", borderColor: "#fecaca", background: "#fff1f2" }}>{error}</div> : null}

      <div className="legacy-header">
        <div>
          <h1 className="legacy-header__title">Announcements</h1>
          <p className="legacy-header__subtitle">Stay updated with the latest company news and updates.</p>
          <div className="legacy-role"><Shield className="h-4 w-4" />HR Role: {formatHrRoleLabel(hrRole)}</div>
        </div>
        {canManage ? <button type="button" className="legacy-primary-btn" onClick={openCreate}><Plus className="h-4 w-4" />New Announcement</button> : null}
      </div>

      {!canManage ? <div className="legacy-panel" style={{ marginBottom: 20 }}><div className="legacy-panel-body" style={{ color: "#1e40af", background: "#eff6ff" }}><div className="flex items-start gap-2"><Info className="mt-0.5 h-4 w-4 shrink-0" /><p className="m-0 leading-6">You have read-only access to announcements. Publishing remains limited to HR admins.</p></div></div></div> : null}

      <section className="legacy-stats-grid">
        {[{ label: "All Announcements", value: stats.total, icon: Megaphone, color: "blue" }, { label: "Important", value: stats.important, icon: AlertTriangle, color: "amber" }, { label: "Published", value: stats.published, icon: CheckCircle, color: "green" }].map((stat) => <div key={stat.label} className={`legacy-stat-card ${stat.color}`}><div className="legacy-stat-icon"><stat.icon className="h-5 w-5" /></div><div><p className="legacy-stat-value">{stat.value}</p><p className="legacy-stat-title">{stat.label}</p></div></div>)}
      </section>

      <section className="legacy-toolbar">
        <div className="legacy-search"><Search className="h-4 w-4" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search announcements..." /></div>
        <div className="legacy-filter-group"><Info className="h-4 w-4" />{priorities.map((priority) => <button key={priority} type="button" className={`legacy-filter-btn ${priorityFilter === priority ? "is-active" : ""}`} onClick={() => setPriorityFilter(priority)}>{priority}<span className="legacy-count">{priority === "All" ? items.length : items.filter((item) => String(item.priority ?? "Normal") === priority).length}</span></button>)}</div>
      </section>

      <div className="legacy-grid-cards" style={{ gridTemplateColumns: "1fr" }}>
        {filtered.length ? filtered.map((item) => {
          const priority = String(item.priority ?? "Normal");
          const expired = isExpired(item);
          const status = String(item.status ?? "Draft");
          return (
            <article key={String(item.id)} className="legacy-card legacy-card--compact">
              <div className="legacy-card-header">
                <div style={{ flex: 1 }}>
                  <h3 className="legacy-card-title">{String(item.title ?? "Announcement")}</h3>
                </div>
                <div className="legacy-actions-row">
                  {expired ? <span className="legacy-status overdue">EXPIRED</span> : null}
                  <span className={`legacy-priority ${priority === "Highly Important" ? "high" : priority === "Important" ? "normal" : "low"}`}>{priority === "Highly Important" ? <AlertTriangle className="h-3 w-3" /> : priority === "Important" ? <Info className="h-3 w-3" /> : <CheckCircle className="h-3 w-3" />}{priority}</span>
                  {canManage ? <span className={`legacy-status ${status.toLowerCase() === "published" ? "completed" : status.toLowerCase() === "draft" ? "default" : "overdue"}`}>{status.toUpperCase()}</span> : null}
                </div>
              </div>
              <div className="legacy-card-copy" style={{ marginBottom: 16 }}>{String(item.body ?? "No announcement content provided.").slice(0, 240)}{String(item.body ?? "").length > 240 ? "..." : ""}</div>
              <div className="legacy-meta-list">
                <div className="legacy-meta-item"><strong>Audience:</strong> {String(item.audience ?? "All Staff")}</div>
                <div className="legacy-meta-item"><Calendar className="h-4 w-4" />Publish: {formatDate(item.publish_date)} · Start: {formatDate(item.start_date)} · End: {formatDate(item.end_date)}</div>
                <div className="legacy-meta-item"><strong>Author:</strong> {user?.fullName || "HR Team"}</div>
              </div>
              {canManage ? <div className="legacy-actions-row" style={{ justifyContent: "flex-end", borderTop: "1px solid #e5e7eb", paddingTop: 14 }}><button type="button" className="legacy-icon-btn" onClick={() => openEdit(item)}><Edit className="h-4 w-4" /></button><button type="button" className="legacy-icon-btn" onClick={() => void remove(Number(item.id))}><Trash2 className="h-4 w-4" /></button></div> : null}
            </article>
          );
        }) : <div className="legacy-empty">No announcements match the current search or priority filter.</div>}
      </div>

      {showForm ? (
        <div className="legacy-modal-overlay">
          <div className="legacy-modal" style={{ maxWidth: 600 }}>
            <div className="legacy-modal-header"><h2>{editingId ? "Edit Announcement" : "Create New Announcement"}</h2><button type="button" className="legacy-icon-btn" onClick={() => setShowForm(false)}><X className="h-4 w-4" /></button></div>
            <div className="legacy-modal-body">
              <div className="legacy-form-grid">
                <div className="legacy-form-group legacy-form-group--full"><label>Title *</label><input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} /></div>
                <div className="legacy-form-group"><label>Priority</label><select value={form.priority} onChange={(event) => setForm((current) => ({ ...current, priority: event.target.value }))}>{["Normal", "Important", "Highly Important"].map((value) => <option key={value} value={value}>{value}</option>)}</select></div>
                <div className="legacy-form-group"><label>Status</label><select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))}>{["Draft", "Published", "Blocked", "Unpublished", "Archived"].map((value) => <option key={value} value={value}>{value}</option>)}</select></div>
                <div className="legacy-form-group"><label>Publish Date</label><input type="date" value={form.publish_date} onChange={(event) => setForm((current) => ({ ...current, publish_date: event.target.value }))} /></div>
                <div className="legacy-form-group"><label>Start Date</label><input type="date" value={form.start_date} onChange={(event) => setForm((current) => ({ ...current, start_date: event.target.value }))} /></div>
                <div className="legacy-form-group"><label>End Date</label><input type="date" value={form.end_date} onChange={(event) => setForm((current) => ({ ...current, end_date: event.target.value }))} /></div>
                <div className="legacy-form-group legacy-form-group--full"><label>Audience</label><select value={form.audience} onChange={(event) => setForm((current) => ({ ...current, audience: event.target.value }))}><option value="All Staff">All Staff</option>{departments.map((department) => <option key={department.id} value={department.name}>{department.name}</option>)}</select></div>
                <div className="legacy-form-group legacy-form-group--full"><label>Content</label><textarea value={form.body} onChange={(event) => setForm((current) => ({ ...current, body: event.target.value }))} /></div>
              </div>
            </div>
            <div className="legacy-modal-footer"><button type="button" className="legacy-secondary-btn" onClick={() => setShowForm(false)}>Cancel</button><button type="button" className="legacy-primary-btn" onClick={() => void save()}><Save className="h-4 w-4" />{editingId ? "Update" : "Create"}</button></div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
