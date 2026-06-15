"use client";

import Link from "next/link";
import type { Route } from "next";
import { Fragment, useEffect, useMemo, useState } from "react";
import {
  BookOpen,
  CheckCircle,
  ClipboardList,
  ExternalLink,
  FileSignature,
  Megaphone,
  Paperclip,
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
  resolveApiUploadUrl,
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

function normalizeDepartmentKey(value: string | null | undefined) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function dedupeStrings(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
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

async function openUrlInNewTab(rawUrl: string) {
  const url = resolveApiUploadUrl(rawUrl);
  if (!url || typeof window === "undefined") return;

  if (!url.startsWith("data:")) {
    window.open(url, "_blank", "noopener,noreferrer");
    return;
  }

  try {
    // Chrome can block direct top-level navigation to data URLs.
    const response = await fetch(url);
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const opened = window.open(objectUrl, "_blank", "noopener,noreferrer");
    if (!opened) {
      window.location.assign(objectUrl);
    }
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
  } catch {
    window.open(url, "_blank", "noopener,noreferrer");
  }
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

function getSurveyTargetNames(assignment: HrRecord, users: Array<{ id: string; fullName: string; department: string | null }>) {
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

function getCompletedSurveyNames(assignmentId: string, completions: HrRecord[]) {
  const names = new Set<string>();
  for (const completion of completions) {
    if (String(completion.assignment_id ?? "") !== assignmentId) continue;
    const userId = String(completion.user_id ?? "").trim();
    const userName = String(completion.user_name ?? "").trim();
    if (userName) names.add(userName);
    if (userId) names.add(userId);
  }
  return names;
}

function isExpiredAnnouncement(item: HrRecord) {
  const raw = String(item.end_date ?? "").trim();
  if (!raw) return false;
  const endDate = new Date(raw);
  if (Number.isNaN(endDate.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  endDate.setHours(0, 0, 0, 0);
  return endDate < today;
}

function isPublishedAnnouncement(item: HrRecord) {
  return String(item.status ?? "").trim().toLowerCase() === "published";
}

function announcementMatchesDepartment(item: HrRecord, departmentName: string | null) {
  const audience = String(item.audience ?? "").trim();
  if (!audience) return true;

  const tokens = audience.split(",").map((value) => value.trim().toLowerCase()).filter(Boolean);
  if (!tokens.length) return true;
  if (tokens.includes("all staff")) return true;

  const departmentToken = String(departmentName ?? "").trim().toLowerCase();
  if (!departmentToken) return false;
  return tokens.includes(departmentToken);
}

function getDocumentAssigneeStatuses(params: {
  document: HrDocumentRecord;
  role: HrAppRole;
  currentUserId: string;
  currentUserName: string;
  currentUserDepartment: string | null;
  directReportIds: Set<string>;
  sharedUsers: Array<{ id: string; fullName: string; department: string | null }>;
}) {
  const { document, role, currentUserId, currentUserName, currentUserDepartment, directReportIds, sharedUsers } = params;
  const sharedUsersById = new Map(sharedUsers.map((item) => [String(item.id), item]));
  const signedUserIds = new Set((document.signed_user_ids || []).map(String));
  const assignedUserIds = dedupeStrings((document.assigned_user_ids || []).map(String));
  const managerDepartmentKey = normalizeDepartmentKey(currentUserDepartment);

  const visibleAssignedUserIds = assignedUserIds.filter((userId) => {
    if (role === "admin") {
      return true;
    }

    if (role === "employee") {
      return Boolean(currentUserId) && userId === currentUserId;
    }

    if (userId === currentUserId || directReportIds.has(userId)) {
      return true;
    }

    const departmentKey = normalizeDepartmentKey(sharedUsersById.get(userId)?.department || null);
    return Boolean(managerDepartmentKey) && Boolean(departmentKey) && managerDepartmentKey === departmentKey;
  });

  const visibleStatuses = visibleAssignedUserIds.map((userId) => ({
    key: userId,
    name: String(sharedUsersById.get(userId)?.fullName || "").trim(),
    isSigned: signedUserIds.has(userId)
  })).filter((item) => item.name);

  if (visibleStatuses.length > 0) {
    return visibleStatuses;
  }

  const assignedUserNames = dedupeStrings((document.assigned_user_names || []).map((name) => String(name).trim()));
  const signedUserNames = new Set((document.signed_user_names || []).map((name) => String(name).trim()).filter(Boolean));

  if (role === "employee") {
    return currentUserName && assignedUserNames.includes(currentUserName)
      ? [{ key: currentUserId || currentUserName, name: currentUserName, isSigned: signedUserNames.has(currentUserName) }]
      : [];
  }

  return assignedUserNames.map((name) => ({
    key: name,
    name,
    isSigned: signedUserNames.has(name)
  }));
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
  const [surveyCompletions, setSurveyCompletions] = useState<HrRecord[]>([]);
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

    const [sessionResult, usersResult, hrRolesResult, announcementsResult, tasksResult, taskAssignmentsResult, taskCompletionResult, trainingResult, trainingCompletionResult, surveysResult, surveyCompletionResult, documentsResult] = await Promise.allSettled([
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
      getResource("survey_completions"),
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
    if (surveyCompletionResult.status === "fulfilled") setSurveyCompletions(surveyCompletionResult.value);
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
  const currentUserDepartment = useMemo(() => {
    if (!user) return null;
    return sharedUsers.find((item) => item.id === user.id)?.department || null;
  }, [sharedUsers, user]);
  const directReportIds = useMemo(() => new Set(hrRoles
    .filter((item) => String(item.manager_id ?? "") === String(user?.id || ""))
    .map((item) => String(item.user_id ?? ""))
    .filter(Boolean)), [hrRoles, user?.id]);
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

    return trainingAssignments.filter((assignment) => {
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
  const visibleSurveys = useMemo(() => {
    const visibleNameSet = new Set(access.visibleNames);
    const currentName = String(user?.fullName || "").trim();
    const currentUserId = String(user?.id || "").trim();

    return surveyAssignments.filter((assignment) => {
      if (String(assignment.status ?? "").trim().toLowerCase() === "archived") return false;

      const assignmentId = String(assignment.id ?? "");
      const targetNames = getSurveyTargetNames(assignment, sharedUsers);
      const completedMarkers = getCompletedSurveyNames(assignmentId, surveyCompletions);

      if (!targetNames.size) {
        return String(assignment.status ?? "").trim().toLowerCase() !== "completed";
      }

      if (access.role === "employee") {
        if (!currentName || !targetNames.has(currentName)) return false;
        return !completedMarkers.has(currentName) && !completedMarkers.has(currentUserId);
      }

      if (access.role === "manager") {
        const managedTargets = Array.from(targetNames).filter((name) => visibleNameSet.has(name));
        if (!managedTargets.length) return false;
        return managedTargets.some((name) => !completedMarkers.has(name));
      }

      return Array.from(targetNames).some((name) => !completedMarkers.has(name));
    });
  }, [access.role, access.visibleNames, sharedUsers, surveyAssignments, surveyCompletions, user?.fullName, user?.id]);
  const activeDocumentsRequiringSignature = useMemo(() => documents.filter((document) => !document.is_completed && document.requires_signature), [documents]);
  const announcementFeed = useMemo(() => announcements
    .filter((item) => {
      if (!isPublishedAnnouncement(item)) {
        return false;
      }

      if (isExpiredAnnouncement(item)) {
        return false;
      }

      if (access.role === "admin") {
        return true;
      }

      return announcementMatchesDepartment(item, currentUserDepartment);
    })
    .sort((left, right) => String(right.publish_date || "").localeCompare(String(left.publish_date || "")))
    .slice(0, 5), [access.role, announcements, currentUserDepartment]);

  const stats: StatCard[] = [
    { title: "Documents", value: String(activeDocumentsRequiringSignature.length), href: "/documents", color: "green", icon: FileSignature },
    { title: "Training", value: String(visibleTraining.length), href: "/training", color: "purple", icon: BookOpen },
    { title: "Tasks", value: String(activeTasks.length), href: "/tasks", color: "amber", icon: SquareCheckBig },
    { title: "Surveys", value: String(visibleSurveys.length), href: "/surveys", color: "blue", icon: ClipboardList }
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
          <div className="hr-activity-list hr-activity-list--scrollable">
            {activeDocumentsRequiringSignature.length ? activeDocumentsRequiringSignature.map((document) => {
              const dueDate = String(document.due_date || "");
              const overdue = dueDate ? (daysUntil(dueDate) ?? 0) < 0 : false;
              const assigneeStatuses = getDocumentAssigneeStatuses({
                document,
                role: access.role,
                currentUserId: String(user?.id || ""),
                currentUserName: String(user?.fullName || "").trim(),
                currentUserDepartment,
                directReportIds,
                sharedUsers
              });
              return (
                <div key={String(document.id)} className="hr-activity-item">
                  <div className="hr-activity-item__icon hr-activity-item__icon--signature"><FileSignature className="h-4 w-4" /></div>
                  <div className="hr-activity-item__body">
                    <p><strong>{String(document.file_name || "HR Document")}</strong>{overdue ? <span className="hr-status-chip is-overdue" style={{ marginLeft: "8px" }}>Overdue</span> : null}</p>
                    <div className="hr-activity-item__meta">
                      <span>Assigned to: </span>
                      {assigneeStatuses.length ? assigneeStatuses.map((assignee, index) => (
                        <Fragment key={assignee.key}>
                          {index ? <span>, </span> : null}
                          <span
                            className={`hr-signature-name ${assignee.isSigned ? "hr-signature-name--signed" : "hr-signature-name--pending"}`}
                            title={assignee.isSigned ? "Signed" : "Pending signature"}
                          >
                            {assignee.name}
                          </span>
                        </Fragment>
                      )) : <span>Unassigned</span>}
                      <span> · Due: {formatDueDate(dueDate)}</span>
                    </div>
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
            const eventImageUrl = String(item.event_image_url || "").trim();
            const attachmentUrl = String(item.attachment_url || "").trim();
            const eventImageHref = resolveApiUploadUrl(eventImageUrl);
            const attachmentHref = resolveApiUploadUrl(attachmentUrl);
            const attachmentName = String(item.attachment_name || "").trim() || "Attachment";
            const eventLinkUrl = String(item.event_link_url || "").trim();
            return (
              <div key={String(item.id)} className="hr-activity-item">
                <div className="hr-activity-item__icon hr-activity-item__icon--announcement"><Megaphone className="h-4 w-4" /></div>
                <div className="hr-activity-item__body">
                  <p><strong>{String(item.title || "Announcement")}</strong>{important ? <span className="hr-status-chip is-overdue" style={{ marginLeft: "8px" }}>{priority}</span> : null}</p>
                  <div className="hr-activity-item__meta">Audience: {audience} · Publish date: {formatDueDate(String(item.publish_date || ""))}</div>
                  <div className="hr-activity-item__pending">{String(item.body || "No description provided.")}</div>
                  {eventImageUrl ? (
                    <a
                      href={eventImageHref}
                      target="_blank"
                      rel="noreferrer"
                      style={{ display: "inline-block", marginTop: 10 }}
                      onClick={(event) => {
                        if (!eventImageUrl.startsWith("data:")) return;
                        event.preventDefault();
                        void openUrlInNewTab(eventImageUrl);
                      }}
                    >
                      <img
                        src={eventImageHref}
                        alt={`${String(item.title || "Announcement")} event image`}
                        style={{ width: "auto", height: "auto", maxWidth: "min(100%, 1200px)", maxHeight: "70vh", objectFit: "contain", borderRadius: 12, border: "1px solid #e5e7eb" }}
                      />
                    </a>
                  ) : null}
                  {attachmentUrl || eventLinkUrl ? (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
                      {attachmentUrl ? (
                        <button
                          type="button"
                          className="hr-status-chip"
                          style={{ cursor: "pointer", border: "1px solid #d1d5db", background: "#fff", color: "#0f172a" }}
                          onClick={() => {
                            void openUrlInNewTab(attachmentHref);
                          }}
                        >
                          <Paperclip className="h-3.5 w-3.5" style={{ marginRight: 6 }} />
                          {attachmentName}
                        </button>
                      ) : null}
                      {eventLinkUrl ? (
                        <button
                          type="button"
                          className="hr-status-chip"
                          style={{ cursor: "pointer", border: "1px solid #d1d5db", background: "#fff", color: "#0f172a" }}
                          onClick={() => {
                            void openUrlInNewTab(eventLinkUrl);
                          }}
                        >
                          <ExternalLink className="h-3.5 w-3.5" style={{ marginRight: 6 }} />
                          Event link
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>
            );
          }) : <div className="hr-empty"><Shield className="mx-auto mb-2 h-8 w-8" /><p>No announcements published yet.</p></div>}
        </div>
      </section>
    </div>
  );
}

