"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Calendar,
  CheckCircle,
  Clock,
  Edit,
  Filter,
  Pause,
  Play,
  Plus,
  Save,
  Search,
  Shield,
  Target,
  Trash2,
  User,
  X
} from "lucide-react";
import type { SessionUser } from "@vlworkhub/types";
import {
  createResource,
  deleteResource,
  getApiErrorMessage,
  getCurrentUser,
  getResource,
  getSharedUsers,
  updateResource,
  type HrRecord,
  type HrUser
} from "../lib/hr-client";
import { HrPortalHeader } from "./hr-portal-header";
import { formatDate, isHrAdmin, isHrManager, isOverdue, joinAssignees, splitAssignees } from "../lib/workflow-utils";

const statusOptions = ["All", "Not Started", "In Progress", "Completed", "Blocked"] as const;
const priorityOptions = ["All", "Low", "Normal", "High", "Critical"] as const;

type TaskForm = {
  title: string;
  due_date: string;
  priority: string;
  status: string;
  description: string;
  assignees: string[];
};

function emptyForm(): TaskForm {
  return {
    title: "",
    due_date: "",
    priority: "Normal",
    status: "Not Started",
    description: "",
    assignees: []
  };
}

function getStatusColor(status: string) {
  if (status === "Completed") return "completed";
  if (status === "In Progress") return "progress";
  if (status === "Blocked") return "overdue";
  return "default";
}

function getPriorityColor(priority: string) {
  const normalized = priority.toLowerCase();
  if (normalized === "high") return "high";
  if (normalized === "critical") return "critical";
  if (normalized === "low") return "low";
  return "normal";
}

function nextStatus(current: string) {
  if (current === "Not Started") return "In Progress";
  if (current === "In Progress") return "Completed";
  if (current === "Blocked") return "In Progress";
  return current;
}

export function TasksWorkspace() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [users, setUsers] = useState<HrUser[]>([]);
  const [tasks, setTasks] = useState<HrRecord[]>([]);
  const [taskStates, setTaskStates] = useState<HrRecord[]>([]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<(typeof statusOptions)[number]>("All");
  const [priorityFilter, setPriorityFilter] = useState<(typeof priorityOptions)[number]>("All");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<TaskForm>(emptyForm());
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    try {
      setError("");
      const [session, sharedUsers, taskItems, stateItems] = await Promise.all([
        getCurrentUser(),
        getSharedUsers(),
        getResource("tasks"),
        getResource("task_user_states")
      ]);
      setUser(session);
      setUsers(sharedUsers);
      setTasks(taskItems);
      setTaskStates(stateItems);
    } catch (loadError) {
      setError(getApiErrorMessage(loadError));
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const canManage = isHrManager(user);
  const canEdit = isHrAdmin(user);

  const stateMap = useMemo(() => taskStates.reduce<Record<string, HrRecord[]>>((acc, state) => {
    const key = String(state.task_id ?? "");
    acc[key] = [...(acc[key] || []), state];
    return acc;
  }, {}), [taskStates]);

  const filtered = useMemo(() => {
    const visibleByRole = canManage ? tasks : tasks.filter((task) => splitAssignees(task.assigned_to).includes(user?.fullName || ""));
    return visibleByRole.filter((task) => {
      const matchesStatus = statusFilter === "All" || String(task.status ?? "Not Started") === statusFilter;
      const matchesPriority = priorityFilter === "All" || String(task.priority ?? "Normal") === priorityFilter;
      const text = [task.title, task.description, task.assigned_to].map((value) => String(value ?? "").toLowerCase());
      return matchesStatus && matchesPriority && text.some((value) => value.includes(query.toLowerCase()));
    });
  }, [canManage, priorityFilter, query, statusFilter, tasks, user?.fullName]);

  const stats = {
    total: tasks.length,
    progress: tasks.filter((task) => String(task.status ?? "") === "In Progress").length,
    critical: tasks.filter((task) => ["High", "Critical"].includes(String(task.priority ?? ""))).length,
    completed: tasks.filter((task) => String(task.status ?? "") === "Completed").length
  };

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm());
    setShowForm(true);
  }

  function openEdit(task: HrRecord) {
    setEditingId(Number(task.id));
    setForm({
      title: String(task.title ?? ""),
      due_date: String(task.due_date ?? ""),
      priority: String(task.priority ?? "Normal"),
      status: String(task.status ?? "Not Started"),
      description: String(task.description ?? ""),
      assignees: splitAssignees(task.assigned_to)
    });
    setShowForm(true);
  }

  async function upsertTaskStates(taskId: number, assignees: string[]) {
    const existing = stateMap[String(taskId)] || [];
    for (const assignee of assignees) {
      const match = existing.find((item) => String(item.user_name ?? "") === assignee);
      if (!match) {
        await createResource("task_user_states", {
          task_id: String(taskId),
          user_name: assignee,
          status: "Not Started",
          completed_on: ""
        });
      }
    }
  }

  async function submit() {
    try {
      const payload = {
        title: form.title,
        assigned_to: joinAssignees(form.assignees),
        due_date: form.due_date,
        status: form.status,
        priority: form.priority,
        description: form.description
      };
      if (editingId) {
        await updateResource("tasks", editingId, payload);
        await upsertTaskStates(editingId, form.assignees);
      } else {
        const created = await createResource("tasks", payload);
        await upsertTaskStates(created.id, form.assignees);
      }
      setShowForm(false);
      setEditingId(null);
      setForm(emptyForm());
      await load();
    } catch (submitError) {
      setError(getApiErrorMessage(submitError));
    }
  }

  async function updateMine(task: HrRecord) {
    try {
      const current = (stateMap[String(task.id)] || []).find((item) => String(item.user_name ?? "") === user?.fullName);
      const next = String(current?.status ?? "Not Started") === "In Progress" ? "Completed" : "In Progress";
      const payload = {
        task_id: String(task.id),
        user_name: user?.fullName || "",
        status: next,
        completed_on: next === "Completed" ? new Date().toISOString() : ""
      };
      if (current) {
        await updateResource("task_user_states", Number(current.id), payload);
      } else {
        await createResource("task_user_states", payload);
      }
      if (next === "Completed") {
        await updateResource("tasks", Number(task.id), {
          title: String(task.title ?? ""),
          assigned_to: String(task.assigned_to ?? ""),
          due_date: String(task.due_date ?? ""),
          status: "Completed",
          priority: String(task.priority ?? "Normal"),
          description: String(task.description ?? "")
        });
      }
      await load();
    } catch (stateError) {
      setError(getApiErrorMessage(stateError));
    }
  }

  async function advance(task: HrRecord) {
    try {
      await updateResource("tasks", Number(task.id), {
        title: String(task.title ?? ""),
        assigned_to: String(task.assigned_to ?? ""),
        due_date: String(task.due_date ?? ""),
        status: nextStatus(String(task.status ?? "Not Started")),
        priority: String(task.priority ?? "Normal"),
        description: String(task.description ?? "")
      });
      await load();
    } catch (advanceError) {
      setError(getApiErrorMessage(advanceError));
    }
  }

  async function remove(id: number) {
    try {
      await deleteResource("tasks", id);
      await load();
    } catch (deleteError) {
      setError(getApiErrorMessage(deleteError));
    }
  }

  return (
    <div className="legacy-portal">
      <HrPortalHeader title="Task Management" description="The task module now follows the SharePoint card-grid structure, filter toolbar, modal editing flow, and assignee progress patterns." breadcrumb="Tasks" />
      {error ? <div className="hr-card" style={{ marginBottom: 20, color: "#b91c1c", borderColor: "#fecaca", background: "#fff1f2" }}>{error}</div> : null}

      <div className="legacy-header">
        <div>
          <h1 className="legacy-header__title">Task Management</h1>
          <p className="legacy-header__subtitle">Organize, track, and manage your team&apos;s tasks efficiently.</p>
          <div className="legacy-role"><Shield className="h-4 w-4" />Role: {user?.roles?.join(", ") || user?.role || "Employee"}</div>
        </div>
        {canManage ? <button type="button" className="legacy-primary-btn" onClick={openCreate}><Plus className="h-4 w-4" />{showForm ? "Edit Task" : "New Task"}</button> : null}
      </div>

      <section className="legacy-stats-grid">
        {[{ label: "Total Tasks", value: stats.total, icon: Target, color: "blue" }, { label: "In Progress", value: stats.progress, icon: Play, color: "amber" }, { label: "High Priority", value: stats.critical, icon: AlertCircle, color: "red" }, { label: "Completed", value: stats.completed, icon: CheckCircle, color: "green" }].map((stat) => (
          <div key={stat.label} className={`legacy-stat-card ${stat.color}`}>
            <div className="legacy-stat-icon"><stat.icon className="h-5 w-5" /></div>
            <div><p className="legacy-stat-value">{stat.value}</p><p className="legacy-stat-title">{stat.label}</p></div>
          </div>
        ))}
      </section>

      <section className="legacy-toolbar">
        <div className="legacy-toolbar__row">
          <div className="legacy-search"><Search className="h-4 w-4" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search tasks..." /></div>
          <div className="legacy-filter-group"><Filter className="h-4 w-4" /><span style={{ fontSize: 13, fontWeight: 500, color: "#475569" }}>Filters:</span>{statusOptions.map((status) => <button key={status} type="button" className={`legacy-filter-btn ${statusFilter === status ? "is-active" : ""}`} onClick={() => setStatusFilter(status)}>{status}</button>)}{priorityOptions.map((priority) => <button key={priority} type="button" className={`legacy-filter-btn ${priorityFilter === priority ? "is-active" : ""}`} onClick={() => setPriorityFilter(priority)}>{priority}</button>)}</div>
        </div>
      </section>

      {filtered.length === 0 ? <div className="legacy-empty">No tasks match the current search or filters.</div> : (
        <div className="legacy-grid-cards">
          {filtered.map((task) => {
            const myState = (stateMap[String(task.id)] || []).find((item) => String(item.user_name ?? "") === user?.fullName);
            const assigned = splitAssignees(task.assigned_to);
            const peopleStates = stateMap[String(task.id)] || [];
            const completed = peopleStates.filter((item) => String(item.status ?? "") === "Completed").length;
            const progress = assigned.length ? Math.round((completed / assigned.length) * 100) : 0;
            const overdue = isOverdue(task.due_date) && String(task.status ?? "") !== "Completed";
            return (
              <article key={String(task.id)} className={`legacy-card ${overdue ? "legacy-card--overdue" : ""}`}>
                <div className="legacy-card-header">
                  <div>
                    <h3 className="legacy-card-title">{String(task.title ?? "Task")}</h3>
                    {overdue ? <span className="legacy-badge legacy-status overdue" style={{ marginTop: 8 }}>Overdue</span> : null}
                  </div>
                  <div className="legacy-actions-row">
                    {canEdit ? <button type="button" className="legacy-icon-btn" onClick={() => openEdit(task)}><Edit className="h-4 w-4" /></button> : null}
                    {canEdit ? <button type="button" className="legacy-icon-btn" onClick={() => void remove(Number(task.id))}><Trash2 className="h-4 w-4" /></button> : null}
                  </div>
                </div>
                <div className="legacy-meta-list">
                  <div className="legacy-meta-item"><span className={`legacy-status ${getStatusColor(String(task.status ?? "Not Started"))}`}>{String(task.status ?? "Not Started")}</span><span className={`legacy-priority ${getPriorityColor(String(task.priority ?? "Normal"))}`}>{String(task.priority ?? "Normal")}</span></div>
                  <div className="legacy-meta-item"><Calendar className="h-4 w-4" />Due: {formatDate(task.due_date)}</div>
                  <div className="legacy-meta-item"><User className="h-4 w-4" />{assigned.length ? assigned.join(", ") : "No assignees"}</div>
                </div>
                <div className="legacy-progress">
                  <div className="legacy-progress-header"><span>Progress: {completed} of {assigned.length || 1} completed</span><span>{progress}%</span></div>
                  <div className="legacy-progress-bar"><div className="legacy-progress-fill" style={{ width: `${progress}%` }} /></div>
                </div>
                <div className="legacy-chip-list">
                  {assigned.map((name) => {
                    const status = peopleStates.find((item) => String(item.user_name ?? "") === name);
                    const state = String(status?.status ?? "Not Started");
                    return <span key={name} className={`legacy-chip ${state === "Completed" ? "complete" : state === "In Progress" ? "progress" : "pending"}`}>{name}</span>;
                  })}
                </div>
                <p className="legacy-card-copy" style={{ marginTop: 14 }}>{String(task.description ?? "")}</p>
                <div className="legacy-actions-row" style={{ marginTop: 16 }}>
                  {assigned.includes(user?.fullName || "") && String(task.status ?? "") !== "Completed" ? <button type="button" className="legacy-primary-btn" onClick={() => void updateMine(task)}>{String(myState?.status ?? "Not Started") === "In Progress" ? <CheckCircle className="h-4 w-4" /> : <Play className="h-4 w-4" />}{String(myState?.status ?? "Not Started") === "In Progress" ? "Mark Complete" : "Start Task"}</button> : null}
                  {canManage ? <button type="button" className="legacy-secondary-btn" onClick={() => void advance(task)}>{String(task.status ?? "") === "Blocked" ? <Pause className="h-4 w-4" /> : <Clock className="h-4 w-4" />}Advance</button> : null}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {showForm ? (
        <div className="legacy-modal-overlay">
          <div className="legacy-modal">
            <div className="legacy-modal-header"><h2>{editingId ? "Edit Task" : "Create New Task"}</h2><button type="button" className="legacy-icon-btn" onClick={() => setShowForm(false)}><X className="h-4 w-4" /></button></div>
            <div className="legacy-modal-body">
              <div className="legacy-form-grid">
                <div className="legacy-form-group legacy-form-group--full"><label>Task Title *</label><input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} /></div>
                <div className="legacy-form-group"><label>Due Date</label><input type="date" value={form.due_date} onChange={(event) => setForm((current) => ({ ...current, due_date: event.target.value }))} /></div>
                <div className="legacy-form-group"><label>Status</label><select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))}>{statusOptions.filter((value) => value !== "All").map((value) => <option key={value} value={value}>{value}</option>)}</select></div>
                <div className="legacy-form-group"><label>Priority</label><select value={form.priority} onChange={(event) => setForm((current) => ({ ...current, priority: event.target.value }))}>{priorityOptions.filter((value) => value !== "All").map((value) => <option key={value} value={value}>{value}</option>)}</select></div>
                <div className="legacy-form-group legacy-form-group--full"><label>Description</label><textarea value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} /></div>
                <div className="legacy-form-group legacy-form-group--full"><label>Assigned To</label><div className="legacy-chip-list">{users.map((option) => { const selected = form.assignees.includes(option.fullName); return <button key={option.id} type="button" className={`legacy-filter-btn ${selected ? "is-active" : ""}`} onClick={() => setForm((current) => ({ ...current, assignees: selected ? current.assignees.filter((name) => name !== option.fullName) : [...current.assignees, option.fullName] }))}>{option.fullName}</button>; })}</div></div>
              </div>
            </div>
            <div className="legacy-modal-footer"><button type="button" className="legacy-secondary-btn" onClick={() => setShowForm(false)}>Cancel</button><button type="button" className="legacy-primary-btn" onClick={() => void submit()}><Save className="h-4 w-4" />{editingId ? "Save Changes" : "Create Task"}</button></div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
