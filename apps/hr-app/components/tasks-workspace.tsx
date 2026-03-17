"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Calendar,
  CheckCircle,
  Edit,
  Filter,
  Play,
  Plus,
  Save,
  Search,
  Shield,
  Target,
  Trash2,
  Users,
  X
} from "lucide-react";
import type { SessionUser } from "@vlworkhub/types";
import {
  createResource,
  deleteResource,
  getApiErrorMessage,
  getCurrentUser,
  getDepartments,
  getHrAssignments,
  getPlatformUsers,
  getResource,
  updateResource,
  type DepartmentRecord,
  type HrAssignment,
  type HrRecord,
  type HrUser,
  type PlatformUserRecord
} from "../lib/hr-client";
import { api } from "../lib/api";
import { useHrRole } from "../lib/use-hr-role";
import { canCreateForHrRole, canEditForHrRole, formatDate, formatHrRoleLabel, getVisibleHrUserNames, isOverdue } from "../lib/workflow-utils";

const statusOptions = ["All", "Not Started", "In Progress", "Completed", "Blocked"] as const;
const priorityOptions = ["All", "Low", "Normal", "High", "Critical"] as const;

type TaskForm = {
  title: string;
  due_date: string;
  priority: string;
  status: string;
  description: string;
  userIds: string[];
  departmentNames: string[];
  allStaff: boolean;
};

type AssignmentType = "user" | "department" | "all_staff";

type TaskAssignmentRecord = {
  id: number;
  task_id: number;
  assignment_type: AssignmentType;
  assigned_user_id: string | null;
  assigned_user_name: string | null;
  assigned_department_name: string | null;
};

type TaskCompletionRecord = {
  id: number;
  task_id: number;
  user_id: string | null;
  user_name: string | null;
  status: string | null;
  started_at: string | null;
  completed_on: string | null;
};

type TaskUser = HrUser & {
  department_name?: string | null;
};

function emptyForm(): TaskForm {
  return {
    title: "",
    due_date: "",
    priority: "Normal",
    status: "Not Started",
    description: "",
    userIds: [],
    departmentNames: [],
    allStaff: false
  };
}

function asNumber(value: string | number | null | undefined) {
  return Number(value ?? 0);
}

function asString(value: string | number | null | undefined) {
  return String(value ?? "").trim();
}

function dedupeUsers(items: TaskUser[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (!item.id || seen.has(item.id)) {
      return false;
    }
    seen.add(item.id);
    return true;
  });
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

function getCompletionStatusLabel(status: string | null | undefined) {
  const normalized = asString(status).toUpperCase();
  if (normalized === "COMPLETED") return "Completed";
  if (normalized === "IN_PROGRESS") return "In Progress";
  return "Not Started";
}

function getTaskAssignmentsFor(taskId: number, assignments: TaskAssignmentRecord[]) {
  return assignments.filter((assignment) => assignment.task_id === taskId);
}

function getTaskCompletionsFor(taskId: number, completionRows: TaskCompletionRecord[]) {
  return completionRows.filter((row) => row.task_id === taskId);
}

function buildAssignedToSummary(form: TaskForm, users: TaskUser[]) {
  const tokens = [
    ...form.userIds
      .map((userId) => users.find((user) => user.id === userId)?.fullName || "")
      .filter(Boolean),
    ...form.departmentNames.map((name) => `Department:${name}`),
    ...(form.allStaff ? ["All Staff"] : [])
  ];

  return tokens.join(", ");
}

function getScopedUsers(hrRole: "admin" | "manager" | "employee", users: TaskUser[], visibleNames: string[]) {
  if (hrRole === "admin") {
    return users;
  }

  return users.filter((user) => visibleNames.includes(user.fullName));
}

function getResolvedAssignedUsers(taskId: number, assignments: TaskAssignmentRecord[], usersInScope: TaskUser[]) {
  const taskAssignments = getTaskAssignmentsFor(taskId, assignments);
  const explicitUsers = taskAssignments
    .filter((assignment) => assignment.assignment_type === "user")
    .map((assignment) => usersInScope.find((user) => user.id === assignment.assigned_user_id || user.fullName === assignment.assigned_user_name))
    .filter(Boolean) as TaskUser[];

  const departmentUsers = taskAssignments
    .filter((assignment) => assignment.assignment_type === "department")
    .flatMap((assignment) => usersInScope.filter((user) => user.department_name === assignment.assigned_department_name));

  const allStaffUsers = taskAssignments.some((assignment) => assignment.assignment_type === "all_staff") ? usersInScope : [];

  return dedupeUsers([...explicitUsers, ...departmentUsers, ...allStaffUsers]);
}

function getOverallTaskStatus(task: HrRecord, assignedUsers: TaskUser[], completions: TaskCompletionRecord[]) {
  const rawStatus = asString(task.status) || "Not Started";
  if (!assignedUsers.length) {
    return rawStatus;
  }

  const completedCount = assignedUsers.filter((user) => completions.some((completion) => completion.user_id === user.id && getCompletionStatusLabel(completion.status) === "Completed")).length;
  const startedCount = assignedUsers.filter((user) => completions.some((completion) => completion.user_id === user.id && ["Completed", "In Progress"].includes(getCompletionStatusLabel(completion.status)))).length;

  if (completedCount === assignedUsers.length) {
    return "Completed";
  }

  if (rawStatus === "Blocked") {
    return "Blocked";
  }

  if (startedCount > 0) {
    return "In Progress";
  }

  return "Not Started";
}

function normalizePlatformUsers(platformUsers: PlatformUserRecord[], session: SessionUser) {
  const mapped: TaskUser[] = platformUsers.map((platformUser) => ({
    id: String(platformUser.id),
    fullName: String(platformUser.name || platformUser.email || "User").trim(),
    email: String(platformUser.email || ""),
    roles: session.roles,
    status: "active",
    department_name: platformUser.department_name || null
  }));

  const hasCurrentUser = mapped.some((candidate) => candidate.id === session.id || candidate.email.toLowerCase() === session.email.toLowerCase());
  if (hasCurrentUser) {
    return mapped;
  }

  return [{
    id: session.id,
    fullName: session.fullName,
    email: session.email,
    roles: session.roles,
    status: "active"
  }, ...mapped];
}

export function TasksWorkspace() {
  const { role: hrRole } = useHrRole();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [users, setUsers] = useState<TaskUser[]>([]);
  const [departments, setDepartments] = useState<DepartmentRecord[]>([]);
  const [hrAssignments, setHrAssignments] = useState<HrAssignment[]>([]);
  const [tasks, setTasks] = useState<HrRecord[]>([]);
  const [taskAssignments, setTaskAssignments] = useState<TaskAssignmentRecord[]>([]);
  const [taskCompletion, setTaskCompletion] = useState<TaskCompletionRecord[]>([]);
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
      const [session, platformUsers, departmentData, assignments, taskItemsResponse, taskAssignmentItems, taskCompletionItems] = await Promise.all([
        getCurrentUser(),
        getPlatformUsers(),
        getDepartments(),
        getHrAssignments(),
        api.getTasks(),
        getResource("task_assignments"),
        getResource("task_completion")
      ]);

      setUser(session);
      setUsers(normalizePlatformUsers(platformUsers.items || [], session));
      setDepartments(departmentData.items || []);
      setHrAssignments(assignments.items || []);
      setTasks(taskItemsResponse.items || []);
      setTaskAssignments((taskAssignmentItems || []).map((item) => ({
        id: asNumber(item.id),
        task_id: asNumber(item.task_id),
        assignment_type: (asString(item.assignment_type).toLowerCase() || "user") as AssignmentType,
        assigned_user_id: asString(item.assigned_user_id) || null,
        assigned_user_name: asString(item.assigned_user_name) || null,
        assigned_department_name: asString(item.assigned_department_name) || null
      })));
      setTaskCompletion((taskCompletionItems || []).map((item) => ({
        id: asNumber(item.id),
        task_id: asNumber(item.task_id),
        user_id: asString(item.user_id) || null,
        user_name: asString(item.user_name) || null,
        status: asString(item.status) || null,
        started_at: asString(item.started_at) || null,
        completed_on: asString(item.completed_on) || null
      })));
    } catch (loadError) {
      setError(getApiErrorMessage(loadError));
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const canManage = canCreateForHrRole(hrRole);
  const canEdit = canEditForHrRole(hrRole);
  const visibleNames = useMemo(
    () => getVisibleHrUserNames(hrRole, user?.id || "", user?.fullName || "", hrAssignments, users),
    [hrAssignments, hrRole, user?.fullName, user?.id, users]
  );
  const scopeUsers = useMemo(() => getScopedUsers(hrRole, users, visibleNames), [hrRole, users, visibleNames]);

  const enrichedTasks = useMemo(() => {
    return tasks.map((task) => {
      const taskId = asNumber(task.id);
      const assignments = getTaskAssignmentsFor(taskId, taskAssignments);
      const resolvedUsers = getResolvedAssignedUsers(taskId, taskAssignments, scopeUsers);
      const completions = getTaskCompletionsFor(taskId, taskCompletion);
      const completedUsers = resolvedUsers.filter((assignedUser) => completions.some((row) => row.user_id === assignedUser.id && getCompletionStatusLabel(row.status) === "Completed"));
      const incompleteUsers = resolvedUsers.filter((assignedUser) => !completedUsers.some((completedUser) => completedUser.id === assignedUser.id));
      const progress = resolvedUsers.length ? Math.round((completedUsers.length / resolvedUsers.length) * 100) : 0;
      const overallStatus = getOverallTaskStatus(task, resolvedUsers, completions);
      const directlyAssigned = resolvedUsers.some((assignedUser) => assignedUser.id === user?.id);
      const rawDirectAssignment = assignments.some((assignment) => assignment.assignment_type === "user" && assignment.assigned_user_id === user?.id);
      const departmentAssigned = assignments.some((assignment) => assignment.assignment_type === "department" && assignment.assigned_department_name && users.find((candidate) => candidate.id === user?.id)?.department_name === assignment.assigned_department_name);
      const allStaffAssigned = assignments.some((assignment) => assignment.assignment_type === "all_staff");
      const assignedDepartments = Array.from(new Set(assignments.filter((assignment) => assignment.assignment_type === "department").map((assignment) => assignment.assigned_department_name).filter(Boolean))) as string[];
      const includesAllStaff = allStaffAssigned;
      const myCompletion = completions.find((completion) => completion.user_id === user?.id);
      const canStart = hrRole === "admin"
        ? true
        : rawDirectAssignment || directlyAssigned || departmentAssigned || allStaffAssigned;

      return {
        task,
        taskId,
        assignments,
        resolvedUsers,
        completedUsers,
        incompleteUsers,
        progress,
        overallStatus,
        directlyAssigned,
        assignedDepartments,
        includesAllStaff,
        myCompletion,
        canStart
      };
    });
  }, [hrRole, scopeUsers, taskAssignments, taskCompletion, tasks, user?.id, users]);

  const filtered = useMemo(() => {
    return enrichedTasks.filter((item) => {
      const matchesStatus = statusFilter === "All" || item.overallStatus === statusFilter;
      const matchesPriority = priorityFilter === "All" || asString(item.task.priority || "Normal") === priorityFilter;
      const haystack = [
        asString(item.task.title),
        asString(item.task.description),
        item.resolvedUsers.map((assignedUser) => assignedUser.fullName).join(" "),
        item.assignedDepartments.join(" "),
        item.includesAllStaff ? "All Staff" : ""
      ].join(" ").toLowerCase();

      return matchesStatus && matchesPriority && haystack.includes(query.toLowerCase());
    });
  }, [enrichedTasks, priorityFilter, query, statusFilter]);

  const stats = {
    total: filtered.length,
    progress: filtered.filter((item) => item.overallStatus === "In Progress").length,
    critical: filtered.filter((item) => ["High", "Critical"].includes(asString(item.task.priority))).length,
    completed: filtered.filter((item) => item.overallStatus === "Completed").length
  };

  function resetForm() {
    setEditingId(null);
    setForm(emptyForm());
    setShowForm(false);
  }

  async function onSaveSuccess() {
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm());
    await load();
  }

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm());
    setShowForm(true);
  }

  function openEdit(task: HrRecord) {
    const taskId = asNumber(task.id);
    const currentAssignments = getTaskAssignmentsFor(taskId, taskAssignments);
    setEditingId(taskId);
    setForm({
      title: asString(task.title),
      due_date: asString(task.due_date),
      priority: asString(task.priority) || "Normal",
      status: asString(task.status) || "Not Started",
      description: asString(task.description),
      userIds: currentAssignments.filter((assignment) => assignment.assignment_type === "user" && assignment.assigned_user_id).map((assignment) => String(assignment.assigned_user_id)),
      departmentNames: currentAssignments.filter((assignment) => assignment.assignment_type === "department" && assignment.assigned_department_name).map((assignment) => String(assignment.assigned_department_name)),
      allStaff: currentAssignments.some((assignment) => assignment.assignment_type === "all_staff")
    });
    setShowForm(true);
  }

  async function replaceAssignments(taskId: number) {
    const currentAssignments = getTaskAssignmentsFor(taskId, taskAssignments);
    await Promise.all(currentAssignments.map((assignment) => deleteResource("task_assignments", assignment.id)));

    const nextAssignments: Array<Record<string, string | null>> = [
      ...form.userIds.map((userId) => {
        const selectedUser = users.find((candidate) => candidate.id === userId);
        return {
          task_id: String(taskId),
          assignment_type: "user",
          assigned_user_id: userId,
          assigned_user_name: selectedUser?.fullName || "",
          assigned_department_name: null
        };
      }),
      ...form.departmentNames.map((departmentName) => ({
        task_id: String(taskId),
        assignment_type: "department",
        assigned_user_id: null,
        assigned_user_name: null,
        assigned_department_name: departmentName
      })),
      ...(form.allStaff
        ? [{
            task_id: String(taskId),
            assignment_type: "all_staff",
            assigned_user_id: null,
            assigned_user_name: null,
            assigned_department_name: null
          }]
        : [])
    ];

    await Promise.all(nextAssignments.map((payload) => createResource("task_assignments", payload)));
  }

  async function submit() {
    try {
      if (!form.title.trim()) {
        setError("Task title is required.");
        return;
      }

      if (!form.allStaff && form.userIds.length === 0 && form.departmentNames.length === 0) {
        setError("Select at least one user, one department, or All Staff.");
        return;
      }

      setError("");
      const payload = {
        title: form.title,
        assigned_to: buildAssignedToSummary(form, users),
        due_date: form.due_date,
        status: form.status,
        priority: form.priority,
        description: form.description
      };

      if (editingId) {
        await updateResource("tasks", editingId, payload);
        await replaceAssignments(editingId);
      } else {
        const created = await createResource("tasks", payload);
        await replaceAssignments(created.id);
      }

      await onSaveSuccess();
    } catch (submitError) {
      setError(getApiErrorMessage(submitError));
    }
  }

  async function updateMyTaskState(item: (typeof enrichedTasks)[number]) {
    try {
      if (!user?.id || !item.canStart) {
        return;
      }

      const currentStatus = getCompletionStatusLabel(item.myCompletion?.status);
      const nextStatus = currentStatus === "In Progress" ? "COMPLETED" : "IN_PROGRESS";
      const now = new Date().toISOString();
      const payload = {
        task_id: String(item.taskId),
        user_id: user.id,
        user_name: user.fullName,
        status: nextStatus,
        started_at: nextStatus === "IN_PROGRESS" ? now : asString(item.myCompletion?.started_at) || now,
        completed_on: nextStatus === "COMPLETED" ? now : ""
      };

      if (item.myCompletion?.id) {
        await updateResource("task_completion", item.myCompletion.id, payload);
      } else {
        await createResource("task_completion", payload);
      }

      const completedCount = item.completedUsers.length + (nextStatus === "COMPLETED" && currentStatus !== "Completed" ? 1 : 0);
      const startedCount = item.completedUsers.length + (nextStatus === "IN_PROGRESS" ? 1 : 0);
      const totalAssignableUsers = item.resolvedUsers.length || (hrRole === "admin" ? 1 : 0);
      const nextTaskStatus = completedCount > 0 && completedCount === totalAssignableUsers
        ? "Completed"
        : startedCount > 0
          ? "In Progress"
          : "Not Started";

      await updateResource("tasks", item.taskId, {
        title: asString(item.task.title),
        assigned_to: asString(item.task.assigned_to),
        due_date: asString(item.task.due_date),
        status: nextTaskStatus,
        priority: asString(item.task.priority) || "Normal",
        description: asString(item.task.description)
      });

      await load();
    } catch (stateError) {
      setError(getApiErrorMessage(stateError));
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
      {error ? <div className="hr-card" style={{ marginBottom: 20, color: "#b91c1c", borderColor: "#fecaca", background: "#fff1f2" }}>{error}</div> : null}

      <div className="legacy-header">
        <div>
          <h1 className="legacy-header__title">Task Management</h1>
          <p className="legacy-header__subtitle">Organize, track, and manage your team&apos;s tasks efficiently.</p>
          <div className="legacy-role"><Shield className="h-4 w-4" />HR Role: {formatHrRoleLabel(hrRole)}</div>
        </div>
        {canManage ? <button type="button" className="legacy-primary-btn" onClick={openCreate}><Plus className="h-4 w-4" />New Task</button> : null}
      </div>

      <section className="legacy-stats-grid">
        {[{ label: "Visible Tasks", value: stats.total, icon: Target, color: "blue" }, { label: "In Progress", value: stats.progress, icon: Play, color: "amber" }, { label: "High Priority", value: stats.critical, icon: AlertCircle, color: "red" }, { label: "Completed", value: stats.completed, icon: CheckCircle, color: "green" }].map((stat) => (
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
          {filtered.map((item) => {
            const overdue = isOverdue(item.task.due_date) && item.overallStatus !== "Completed";
            const myStatus = getCompletionStatusLabel(item.myCompletion?.status);

            return (
              <article key={String(item.task.id)} className={`legacy-card ${overdue ? "legacy-card--overdue" : ""}`}>
                <div className="legacy-card-header">
                  <div>
                    <h3 className="legacy-card-title">{asString(item.task.title) || "Task"}</h3>
                    {overdue ? <span className="legacy-badge legacy-status overdue" style={{ marginTop: 8 }}>Overdue</span> : null}
                  </div>
                  <div className="legacy-actions-row">
                    {canEdit ? <button type="button" className="legacy-icon-btn" onClick={() => openEdit(item.task)}><Edit className="h-4 w-4" /></button> : null}
                    {canEdit ? <button type="button" className="legacy-icon-btn" onClick={() => void remove(item.taskId)}><Trash2 className="h-4 w-4" /></button> : null}
                  </div>
                </div>
                <div className="legacy-meta-list">
                  <div className="legacy-meta-item"><span className={`legacy-status ${getStatusColor(item.overallStatus)}`}>{item.overallStatus}</span><span className={`legacy-priority ${getPriorityColor(asString(item.task.priority) || "Normal")}`}>{asString(item.task.priority) || "Normal"}</span></div>
                  <div className="legacy-meta-item"><Calendar className="h-4 w-4" />Due: {formatDate(item.task.due_date)}</div>
                  <div className="legacy-meta-item"><Users className="h-4 w-4" />{item.includesAllStaff ? "All Staff" : item.resolvedUsers.map((assignedUser) => assignedUser.fullName).join(", ") || "No assignees"}</div>
                  {item.assignedDepartments.length ? <div className="legacy-meta-item"><Shield className="h-4 w-4" />Departments: {item.assignedDepartments.join(", ")}</div> : null}
                </div>
                <div className="legacy-progress">
                  <div className="legacy-progress-header"><span>Progress: {item.completedUsers.length} of {item.resolvedUsers.length || 1} completed</span><span>{item.progress}%</span></div>
                  <div className="legacy-progress-bar"><div className="legacy-progress-fill" style={{ width: `${item.progress}%`, background: item.progress === 100 ? "#16a34a" : undefined }} /></div>
                </div>
                <div className="legacy-meta-list" style={{ marginTop: 12 }}>
                  <div className="legacy-meta-item"><strong>Completed by:</strong> {item.completedUsers.length ? item.completedUsers.map((assignedUser) => assignedUser.fullName).join(", ") : "-"}</div>
                  {hrRole !== "employee" ? <div className="legacy-meta-item"><strong>Incomplete:</strong> {item.incompleteUsers.length ? item.incompleteUsers.map((assignedUser) => assignedUser.fullName).join(", ") : "-"}</div> : null}
                </div>
                <p className="legacy-card-copy" style={{ marginTop: 14 }}>{asString(item.task.description)}</p>
                <div className="legacy-actions-row" style={{ marginTop: 16 }}>
                  {item.canStart && item.overallStatus !== "Completed" ? (
                    <button type="button" className="legacy-primary-btn" onClick={() => void updateMyTaskState(item)}>
                      {myStatus === "In Progress" ? <CheckCircle className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                      {myStatus === "In Progress" ? "Complete Task" : "Start Task"}
                    </button>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {showForm ? (
        <div className="legacy-modal-overlay">
          <div className="legacy-modal">
            <div className="legacy-modal-header"><h2>{editingId ? "Edit Task" : "Create New Task"}</h2><button type="button" className="legacy-icon-btn" onClick={resetForm}><X className="h-4 w-4" /></button></div>
            <div className="legacy-modal-body">
              <div className="legacy-form-grid">
                <div className="legacy-form-group legacy-form-group--full"><label>Task Title *</label><input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} /></div>
                <div className="legacy-form-group"><label>Due Date</label><input type="date" value={form.due_date} onChange={(event) => setForm((current) => ({ ...current, due_date: event.target.value }))} /></div>
                <div className="legacy-form-group"><label>Status</label><select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))}>{statusOptions.filter((value) => value !== "All").map((value) => <option key={value} value={value}>{value}</option>)}</select></div>
                <div className="legacy-form-group"><label>Priority</label><select value={form.priority} onChange={(event) => setForm((current) => ({ ...current, priority: event.target.value }))}>{priorityOptions.filter((value) => value !== "All").map((value) => <option key={value} value={value}>{value}</option>)}</select></div>
                <div className="legacy-form-group legacy-form-group--full"><label>Description</label><textarea value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} /></div>
                <div className="legacy-form-group legacy-form-group--full">
                  <label>Assign to Users</label>
                  <div className="legacy-chip-list">
                    {users.map((option) => {
                      const selected = form.userIds.includes(option.id);
                      return <button key={option.id} type="button" className={`legacy-filter-btn ${selected ? "is-active" : ""}`} onClick={() => setForm((current) => ({ ...current, userIds: selected ? current.userIds.filter((value) => value !== option.id) : [...current.userIds, option.id] }))}>{option.fullName}</button>;
                    })}
                  </div>
                </div>
                <div className="legacy-form-group legacy-form-group--full">
                  <label>Assign to Departments</label>
                  <div className="legacy-chip-list">
                    {departments.map((department) => {
                      const selected = form.departmentNames.includes(department.name);
                      return <button key={department.id} type="button" className={`legacy-filter-btn ${selected ? "is-active" : ""}`} onClick={() => setForm((current) => ({ ...current, departmentNames: selected ? current.departmentNames.filter((value) => value !== department.name) : [...current.departmentNames, department.name] }))}>{department.name}</button>;
                    })}
                  </div>
                </div>
                <div className="legacy-form-group legacy-form-group--full">
                  <label>All Staff</label>
                  <button type="button" className={`legacy-filter-btn ${form.allStaff ? "is-active" : ""}`} onClick={() => setForm((current) => ({ ...current, allStaff: !current.allStaff }))}>Assign to All Staff</button>
                </div>
              </div>
            </div>
            <div className="legacy-modal-footer"><button type="button" className="legacy-secondary-btn" onClick={resetForm}>Cancel</button><button type="button" className="legacy-primary-btn" onClick={() => void submit()}><Save className="h-4 w-4" />{editingId ? "Save Changes" : "Create Task"}</button></div>
          </div>
        </div>
      ) : null}
    </div>
  );
}


