"use client";

import Link from "next/link";
import type { Route } from "next";
import { useEffect, useMemo, useState } from "react";
import {
  BookOpen,
  CheckCircle,
  ClipboardList,
  FileSignature,
  Megaphone,
  PlayCircle,
  Shield,
  SquareCheckBig
} from "lucide-react";
import type { SessionUser } from "@vlworkhub/types";
import {
  getCurrentUser,
  getDashboardSummary,
  getHrAssignments,
  getHrDocuments,
  getPlatformUsers,
  getResource,
  type HrDashboardSummary,
  type HrDocumentRecord,
  type HrRecord
} from "../lib/hr-client";
import { getVisibleTasks } from "../lib/task-visibility";
import { HrPortalHeader } from "./hr-portal-header";

type StatCard = {
  title: string;
  value: string;
  href: Route;
  color: "green" | "purple" | "amber" | "blue";
  icon: React.ComponentType<{ className?: string }>;
};

type HrAppRole = "admin" | "manager" | "employee";

type HrAccessContext = {
  role: HrAppRole;
  managerId: string | null;
  visibleNames: string[];
};

type DashboardTaskAssignment = {
  task_id: string | number | null;
  assigned_user_name: string | null;
  assigned_department_name: string | null;
  assignment_type: string | null;
  assigned_user_manager: string | null;
};

type DashboardTaskCompletion = {
  task_id: string | number | null;
  user_id: string | null;
  status: string | null;
};

type DashboardVisibleTask = HrRecord & {
  overallStatus: string;
  assignments?: DashboardTaskAssignment[];
};

function toTaskRole(role: HrAppRole): "ADMIN" | "MANAGER" | "EMPLOYEE" {
  if (role === "admin") return "ADMIN";
  if (role === "manager") return "MANAGER";
  return "EMPLOYEE";
}

function splitNames(value: string | null | undefined) {
  return String(value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function formatDueDate(value: string) {
  if (!value) return "No due date";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString();
}

function daysUntil(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  const ms = parsed.getTime() - Date.now();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

function resolveAccessContext(user: SessionUser | null, sharedUsers: Array<{ id: string; fullName: string }>, hrRoles: HrRecord[]): HrAccessContext {
  if (!user) {
    return { role: "employee", managerId: null, visibleNames: [] };
  }

  const platformRole = String(user.platformRole || user.role || "USER").toUpperCase();
  if (platformRole === "SUPER_ADMIN" || platformRole === "ADMIN") {
    return { role: "admin", managerId: null, visibleNames: sharedUsers.map((item) => item.fullName) };
  }

  const currentRole = hrRoles.find((item) => String(item.user_id ?? "") === user.id);
  if (!currentRole) {
    return { role: "employee", managerId: null, visibleNames: [user.fullName] };
  }

  const role = String(currentRole.hr_role ?? currentRole.role ?? "employee").toLowerCase() as HrAppRole;
  const managerId = currentRole.manager_id ? String(currentRole.manager_id) : null;
  const namesByUserId = new Map(sharedUsers.map((item) => [item.id, item.fullName]));

  if (role === "manager") {
    const visibleNames = hrRoles
      .filter((item) => String(item.manager_id ?? "") === user.id)
      .map((item) => String(namesByUserId.get(String(item.user_id ?? "")) ?? ""))
      .filter(Boolean);
    if (!visibleNames.includes(user.fullName)) visibleNames.unshift(user.fullName);
    return { role, managerId, visibleNames };
  }

  return { role, managerId, visibleNames: [user.fullName] };
}

function filterByAssignees(items: HrRecord[], field: string, visibleNames: string[]) {
  return items.filter((item) => splitNames(String(item[field] ?? "")).some((name) => visibleNames.includes(name)));
}

function getSectionTitle(role: HrAppRole, singular: string, plural = singular) {
  if (role === "admin") return `All ${plural}`;
  if (role === "manager") return `Department ${plural}`;
  return `Your ${singular}`;
}

function dedupeUsers(items: Array<{ id: string; fullName: string; department: string | null }>) {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (!item.id || seen.has(item.id)) {
      return false;
    }
    seen.add(item.id);
    return true;
  });
}

function getCompletionStatusLabel(status: string | null | undefined) {
  const normalized = String(status ?? "").trim().toUpperCase();
  if (normalized === "COMPLETED") return "Completed";
  if (normalized === "IN_PROGRESS") return "In Progress";
  return "Not Started";
}

function getResolvedDashboardUsers(taskId: string, assignments: DashboardTaskAssignment[], usersInScope: Array<{ id: string; fullName: string; department: string | null }>) {
  const taskAssignments = assignments.filter((assignment) => String(assignment.task_id ?? "") === taskId);
  const explicitUsers = taskAssignments
    .filter((assignment) => String(assignment.assignment_type ?? "").toLowerCase() === "user")
    .map((assignment) => usersInScope.find((user) => user.fullName === assignment.assigned_user_name))
    .filter(Boolean) as Array<{ id: string; fullName: string; department: string | null }>;
  const departmentUsers = taskAssignments
    .filter((assignment) => String(assignment.assignment_type ?? "").toLowerCase() === "department")
    .flatMap((assignment) => usersInScope.filter((user) => user.department === assignment.assigned_department_name));
  const allStaffUsers = taskAssignments.some((assignment) => String(assignment.assignment_type ?? "").toLowerCase() === "all_staff") ? usersInScope : [];
  return dedupeUsers([...explicitUsers, ...departmentUsers, ...allStaffUsers]);
}

function getOverallDashboardTaskStatus(task: HrRecord, assignedUsers: Array<{ id: string; fullName: string; department: string | null }>, completions: DashboardTaskCompletion[]) {
  const rawStatus = String(task.status ?? "").trim() || "Not Started";
  if (!assignedUsers.length) {
    return rawStatus;
  }
  const completedCount = assignedUsers.filter((user) => completions.some((completion) => completion.user_id === user.id && getCompletionStatusLabel(completion.status) === "Completed")).length;
  const startedCount = assignedUsers.filter((user) => completions.some((completion) => completion.user_id === user.id && ["Completed", "In Progress"].includes(getCompletionStatusLabel(completion.status)))).length;
  if (completedCount === assignedUsers.length) return "Completed";
  if (rawStatus === "Blocked") return "Blocked";
  if (startedCount > 0) return "In Progress";
  return "Not Started";
}

function isTrainingCompletionDone(item: HrRecord) {
  return Number(item.progress_percent ?? 0) >= 100 || Boolean(String(item.completed_on ?? "").trim());
}

function getTrainingTargetNames(assignment: HrRecord, users: Array<{ id: string; fullName: string; department: string | null }>) {
  const tokens = splitNames(String(assignment.assignee_name ?? ""));
  const names = new Set<string>();

  if (tokens.includes("All Staff")) {
    users.forEach((user) => {
      if (user.fullName) names.add(user.fullName);
    });
  }

  for (const token of tokens) {
    if (!token || token === "All Staff") continue;
    if (token.startsWith("Department:")) {
      const departmentName = token.replace("Department:", "").trim();
      users.forEach((user) => {
        if (user.department && user.department === departmentName) {
          names.add(user.fullName);
        }
      });
      continue;
    }

    names.add(token);
  }

  return names;
}

function getCompletedTrainingNames(assignmentId: string, completions: HrRecord[]) {
  const names = new Set<string>();
  for (const completion of completions) {
    if (String(completion.assignment_id ?? "") !== assignmentId) continue;
    if (!isTrainingCompletionDone(completion)) continue;
    const userName = String(completion.user_name ?? "").trim();
    if (userName) names.add(userName);
  }
  return names;
}

export function HrDashboard() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [sharedUsers, setSharedUsers] = useState<Array<{ id: string; fullName: string; department: string | null }>>([]);
  const [hrRoles, setHrRoles] = useState<HrRecord[]>([]);
  const [announcements, setAnnouncements] = useState<HrRecord[]>([]);
  const [tasks, setTasks] = useState<HrRecord[]>([]);
  const [taskAssignments, setTaskAssignments] = useState<HrRecord[]>([]);
  const [taskCompletion, setTaskCompletion] = useState<DashboardTaskCompletion[]>([]);
  const [trainingAssignments, setTrainingAssignments] = useState<HrRecord[]>([]);
  const [trainingCompletions, setTrainingCompletions] = useState<HrRecord[]>([]);
  const [surveyAssignments, setSurveyAssignments] = useState<HrRecord[]>([]);
  const [documents, setDocuments] = useState<HrDocumentRecord[]>([]);
  const [summary, setSummary] = useState<HrDashboardSummary>({ documents: 0, training: 0, tasks: 0, surveys: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");

    const summaryResult = await getDashboardSummary().catch((loadError) => {
      console.error("[HR Dashboard] GET /hr/dashboard failed", loadError);
      return null;
    });

    if (!summaryResult) {
      setError("Unable to load dashboard data.");
      return;
    }

    setSummary({
      documents: Number(summaryResult.documents || 0),
      training: Number(summaryResult.training || 0),
      tasks: Number(summaryResult.tasks || 0),
      surveys: Number(summaryResult.surveys || 0)
    });

    const [sessionResult, usersResult, hrRolesResult, announcementsResult, tasksResult, taskAssignmentsResult, taskCompletionResult, trainingResult, trainingCompletionResult, surveysResult, documentsResult] = await Promise.allSettled([
      getCurrentUser(),
      getPlatformUsers(),
      getHrAssignments(),
      getResource("announcements"),
      getResource("tasks"),
      getResource("task_assignments"),
      getResource("task_completion"),
      getResource("training_assignments"),
      getResource("training_completions"),
      getResource("survey_assignments"),
      getHrDocuments()
    ]);

    if (sessionResult.status === "fulfilled") setUser(sessionResult.value);
    else console.error("[HR Dashboard] GET /auth/me failed", sessionResult.reason);

    if (usersResult.status === "fulfilled") setSharedUsers((usersResult.value.items || []).map((item) => ({ id: String(item.id), fullName: String(item.name || item.email || "User").trim(), department: item.department_name || null })));
    else console.error("[HR Dashboard] platform users failed", usersResult.reason);

    if (hrRolesResult.status === "fulfilled") setHrRoles((hrRolesResult.value.items || []) as unknown as HrRecord[]);
    else {
      console.error("[HR Dashboard] GET /hr/user-roles failed", hrRolesResult.reason);
      setHrRoles([]);
    }

    if (announcementsResult.status === "fulfilled") setAnnouncements(announcementsResult.value);
    if (tasksResult.status === "fulfilled") setTasks(tasksResult.value);
    if (taskAssignmentsResult.status === "fulfilled") setTaskAssignments(taskAssignmentsResult.value);
    if (taskCompletionResult.status === "fulfilled") setTaskCompletion(taskCompletionResult.value.map((item) => ({ task_id: item.task_id ? String(item.task_id) : null, user_id: item.user_id ? String(item.user_id) : null, status: item.status ? String(item.status) : null })));
    if (trainingResult.status === "fulfilled") setTrainingAssignments(trainingResult.value);
    if (trainingCompletionResult.status === "fulfilled") setTrainingCompletions(trainingCompletionResult.value);
    if (surveysResult.status === "fulfilled") setSurveyAssignments(surveysResult.value);
    if (documentsResult.status === "fulfilled") setDocuments(documentsResult.value.items || []);
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  const access = useMemo(() => resolveAccessContext(user, sharedUsers, hrRoles), [user, sharedUsers, hrRoles]);
  const currentTaskUser = useMemo(() => {
    if (!user) return null;
    return {
      id: user.id,
      name: user.fullName,
      department: sharedUsers.find((item) => item.id === user.id)?.department || null,
      role: toTaskRole(access.role)
    };
  }, [access.role, sharedUsers, user]);
  const scopeUsers = useMemo(() => {
    if (access.role === "admin") {
      return sharedUsers;
    }
    return sharedUsers.filter((item) => access.visibleNames.includes(item.fullName));
  }, [access.role, access.visibleNames, sharedUsers]);
  const tasksWithAssignments = useMemo(() => {
    const namesByUserId = new Map(sharedUsers.map((item) => [item.id, item.fullName]));
    const managerNameByUserId = new Map(
      hrRoles.map((role) => [
        String(role.user_id ?? ""),
        role.manager_id ? String(namesByUserId.get(String(role.manager_id)) ?? "") : null
      ])
    );

    return tasks.map((task) => ({
      ...task,
      assignments: taskAssignments
        .filter((assignment) => String(assignment.task_id ?? "") === String(task.id ?? ""))
        .map((assignment) => ({
          task_id: assignment.task_id ? String(assignment.task_id) : null,
          assigned_user_name: assignment.assigned_user_name ? String(assignment.assigned_user_name) : null,
          assigned_department_name: assignment.assigned_department_name ? String(assignment.assigned_department_name) : null,
          assignment_type: assignment.assignment_type ? String(assignment.assignment_type) : null,
          assigned_user_manager: assignment.assigned_user_id ? (managerNameByUserId.get(String(assignment.assigned_user_id)) || null) : null
        })) as DashboardTaskAssignment[]
    }));
  }, [hrRoles, sharedUsers, taskAssignments, tasks]);
  const visibleTasks = useMemo(() => {
    if (!currentTaskUser || !tasksWithAssignments.length) {
      return [] as DashboardVisibleTask[];
    }

    const nextVisibleTasks = getVisibleTasks(tasksWithAssignments, {
      name: currentTaskUser.name,
      department: currentTaskUser.department,
      role: currentTaskUser.role
    });

    return nextVisibleTasks.map((task) => {
      const taskId = String((task as unknown as HrRecord).id ?? "");
      const assignments = (task.assignments || []) as DashboardTaskAssignment[];
      const resolvedUsers = getResolvedDashboardUsers(taskId, assignments, scopeUsers);
      const completions = taskCompletion.filter((item) => String(item.task_id ?? "") === taskId);
      const overallStatus = getOverallDashboardTaskStatus(task as unknown as HrRecord, resolvedUsers, completions);
      return {
        ...(task as unknown as HrRecord),
        overallStatus
      };
    });
  }, [currentTaskUser, scopeUsers, taskCompletion, tasksWithAssignments]);
  const activeTasks = useMemo(() => visibleTasks.filter((item) => item.overallStatus !== "Completed"), [visibleTasks]) as DashboardVisibleTask[];
  const visibleTraining = useMemo(() => {
    const visibleNameSet = new Set(access.visibleNames);
    const currentName = String(user?.fullName || "").trim();

    return filterByAssignees(trainingAssignments, "assignee_name", access.visibleNames).filter((assignment) => {
      if (String(assignment.status ?? "").trim().toLowerCase() === "archived") return false;

      const assignmentId = String(assignment.id ?? "");
      const targetNames = getTrainingTargetNames(assignment, sharedUsers);
      const completedNames = getCompletedTrainingNames(assignmentId, trainingCompletions);

      if (!targetNames.size) {
        return String(assignment.status ?? "").trim().toLowerCase() !== "completed";
      }

      if (access.role === "employee") {
        if (!currentName || !targetNames.has(currentName)) return false;
        return !completedNames.has(currentName);
      }

      if (access.role === "manager") {
        const managedTargets = Array.from(targetNames).filter((name) => visibleNameSet.has(name));
        if (!managedTargets.length) return false;
        return managedTargets.some((name) => !completedNames.has(name));
      }

      return Array.from(targetNames).some((name) => !completedNames.has(name));
    });
  }, [access.role, access.visibleNames, sharedUsers, trainingAssignments, trainingCompletions, user?.fullName]);
  const visibleSurveys = useMemo(() => filterByAssignees(surveyAssignments, "assignee_name", access.visibleNames).filter((item) => String(item.status ?? "").toLowerCase() !== "completed"), [surveyAssignments, access.visibleNames]);
  const activeDocumentsRequiringSignature = useMemo(() => documents.filter((document) => !document.is_completed && document.requires_signature), [documents]);
  const announcementFeed = useMemo(() => announcements.slice().sort((left, right) => String(right.publish_date || "").localeCompare(String(left.publish_date || ""))).slice(0, 5), [announcements]);

  const stats: StatCard[] = [
    { title: "Documents", value: String(activeDocumentsRequiringSignature.length), href: "/documents", color: "green", icon: FileSignature },
    { title: "Training", value: String(visibleTraining.length), href: "/training", color: "purple", icon: BookOpen },
    { title: "Tasks", value: String(activeTasks.length), href: "/tasks", color: "amber", icon: SquareCheckBig },
    { title: "Surveys", value: String(summary.surveys), href: "/surveys", color: "blue", icon: ClipboardList }
  ];

  return (
    <div className="hr-dashboard">
      <HrPortalHeader
        title={`Welcome back, ${user?.fullName || "HR Team"}`}
        description="The HR dashboard now reflects the user context from shared platform identity and HR-specific application permissions."
        breadcrumb="Dashboard"
        showBreadcrumb={false}
      />

      {error ? <div className="hr-card" style={{ marginBottom: "20px", color: "#7f1d1d", borderColor: "#fecaca", background: "#fff1f2" }}>{error}</div> : null}

      <section className="hr-dashboard__stats">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Link key={stat.title} href={stat.href} className={`hr-stat-card hr-stat-card--${stat.color} hr-stat-card--compact`}>
              <div className="hr-stat-card__icon"><Icon className="h-6 w-6" /></div>
              <div>
                <p className="hr-stat-card__value">{stat.value}</p>
                <p className="hr-stat-card__title hr-stat-card__title--primary">{stat.title}</p>
              </div>
            </Link>
          );
        })}
      </section>

      <section className="hr-dashboard__grid">
        <div className="hr-card">
          <div className="hr-card__header"><div><h2 className="hr-card__title">Documents requiring signature</h2><p className="hr-card__subtitle">Only active documents visible to your HR role are shown here.</p></div></div>
          <div className="hr-activity-list">
            {activeDocumentsRequiringSignature.length ? activeDocumentsRequiringSignature.slice(0, 5).map((document) => {
              const dueDate = String(document.due_date || "");
              const overdue = dueDate ? (daysUntil(dueDate) ?? 0) < 0 : false;
              return (
                <div key={String(document.id)} className="hr-activity-item">
                  <div className="hr-activity-item__icon hr-activity-item__icon--signature"><FileSignature className="h-4 w-4" /></div>
                  <div className="hr-activity-item__body">
                    <p><strong>{String(document.file_name || "HR Document")}</strong>{overdue ? <span className="hr-status-chip is-overdue" style={{ marginLeft: "8px" }}>Overdue</span> : null}</p>
                    <div className="hr-activity-item__meta">Assigned to: {document.assigned_user_names.join(", ") || "Unassigned"} · Due: {formatDueDate(dueDate)}</div>
                  </div>
                </div>
              );
            }) : <div className="hr-empty"><CheckCircle className="mx-auto mb-2 h-8 w-8" /><p>No documents require signature.</p></div>}
          </div>
        </div>

        <div className="hr-card">
          <div className="hr-card__header"><div><h2 className="hr-card__title">{getSectionTitle(access.role, "Task", "Tasks")}</h2><p className="hr-card__subtitle">Assignments respect your HR application role and department visibility.</p></div></div>
          <div className="hr-task-list">
            {loading || !currentTaskUser ? <div className="hr-empty"><CheckCircle className="mx-auto mb-2 h-8 w-8" /><p>Loading tasks...</p></div> : activeTasks.length ? activeTasks.slice(0, 5).map((task) => {
              const priority = String(task.priority || "normal").toLowerCase();
              return (
                <div key={String(task.id)} className="hr-task-item">
                  <div>
                    <p className="hr-task-item__title">{String(task.title || "Task")}</p>
                    <div className="hr-task-item__meta"><span className={`hr-priority hr-priority--${priority}`}>{String(task.priority || "Normal")}</span><span className="hr-activity-item__meta">Due: {formatDueDate(String(task.due_date || ""))}</span></div>
                    <div className="hr-activity-item__pending">Assigned to: {String(task.assigned_to || "HR team")}</div>
                  </div>
                  <span className="hr-status-chip">{String(task.overallStatus || task.status || "Pending")}</span>
                </div>
              );
            }) : <div className="hr-empty"><CheckCircle className="mx-auto mb-2 h-8 w-8" /><p>No active tasks.</p></div>}
          </div>
        </div>

        <div className="hr-card">
          <div className="hr-card__header"><div><h2 className="hr-card__title">{getSectionTitle(access.role, "Training", "Training")}</h2><p className="hr-card__subtitle">Training assignments shown here match your HR permission scope.</p></div></div>
          <div className="hr-activity-list">
            {visibleTraining.length ? visibleTraining.slice(0, 5).map((assignment) => {
              const overdue = String(assignment.due_date || "") ? (daysUntil(String(assignment.due_date || "")) ?? 0) < 0 : false;
              return (
                <div key={String(assignment.id)} className="hr-activity-item">
                  <div className="hr-activity-item__icon hr-activity-item__icon--training"><PlayCircle className="h-4 w-4" /></div>
                  <div className="hr-activity-item__body">
                    <p><strong>{String(assignment.title || "Training assignment")}</strong>{overdue ? <span className="hr-status-chip is-overdue" style={{ marginLeft: "8px" }}>Overdue</span> : null}</p>
                    <div className="hr-activity-item__meta">Assignee: {String(assignment.assignee_name || "Unknown")} · Due: {formatDueDate(String(assignment.due_date || ""))}</div>
                  </div>
                </div>
              );
            }) : <div className="hr-empty"><CheckCircle className="mx-auto mb-2 h-8 w-8" /><p>No visible training assignments.</p></div>}
          </div>
        </div>

        <div className="hr-card">
          <div className="hr-card__header"><div><h2 className="hr-card__title">{getSectionTitle(access.role, "Survey", "Surveys")}</h2><p className="hr-card__subtitle">Survey assignments shown here follow the same HR visibility rules.</p></div></div>
          <div className="hr-activity-list">
            {visibleSurveys.length ? visibleSurveys.slice(0, 5).map((assignment) => {
              const overdue = String(assignment.due_date || "") ? (daysUntil(String(assignment.due_date || "")) ?? 0) < 0 : false;
              return (
                <div key={String(assignment.id)} className="hr-activity-item">
                  <div className="hr-activity-item__icon hr-activity-item__icon--task"><ClipboardList className="h-4 w-4" /></div>
                  <div className="hr-activity-item__body">
                    <p><strong>{String(assignment.title || "Survey assignment")}</strong>{overdue ? <span className="hr-status-chip is-overdue" style={{ marginLeft: "8px" }}>Overdue</span> : null}</p>
                    <div className="hr-activity-item__meta">Assignee: {String(assignment.assignee_name || "Unknown")} · Due: {formatDueDate(String(assignment.due_date || ""))}</div>
                  </div>
                </div>
              );
            }) : <div className="hr-empty"><CheckCircle className="mx-auto mb-2 h-8 w-8" /><p>No visible survey assignments.</p></div>}
          </div>
        </div>
      </section>

      <section className="hr-dashboard__announcements">
        <div className="hr-card__header">
          <div><h2 className="hr-section-title">Announcements feed</h2><p className="hr-card__subtitle">Published communications remain visible as a passive feed on the dashboard.</p></div>
        </div>
        <div className="hr-announcement-list">
          {announcementFeed.length ? announcementFeed.map((item) => {
            const priority = String(item.priority || "Normal");
            const important = priority.toLowerCase().includes("important");
            const audience = String(item.audience || "All Staff");
            return (
              <div key={String(item.id)} className="hr-activity-item">
                <div className="hr-activity-item__icon hr-activity-item__icon--announcement"><Megaphone className="h-4 w-4" /></div>
                <div className="hr-activity-item__body">
                  <p><strong>{String(item.title || "Announcement")}</strong>{important ? <span className="hr-status-chip is-overdue" style={{ marginLeft: "8px" }}>{priority}</span> : null}</p>
                  <div className="hr-activity-item__meta">Audience: {audience} · Publish date: {formatDueDate(String(item.publish_date || ""))}</div>
                  <div className="hr-activity-item__pending">{String(item.body || "No description provided.")}</div>
                </div>
              </div>
            );
          }) : <div className="hr-empty"><Shield className="mx-auto mb-2 h-8 w-8" /><p>No announcements published yet.</p></div>}
        </div>
      </section>
    </div>
  );
}

