import type { HrAssignment, HrDocumentRecord, PlatformUserRecord } from "./hr-client";

export type ViewerRole = "ADMIN" | "MANAGER" | "EMPLOYEE";

export type DocumentViewerContext = {
  id: string;
  role: ViewerRole;
  reportIds: string[];
};

type ManagerDepartmentContext = {
  id?: string | null;
  name?: string | null;
};

export function normalizeDepartmentKey(value: string | null | undefined) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function normalizeDocumentRole(role: string): ViewerRole {
  if (role === "admin") return "ADMIN";
  if (role === "manager") return "MANAGER";
  return "EMPLOYEE";
}

export function getEffectiveAssignedUserIds(document: HrDocumentRecord, users: PlatformUserRecord[]) {
  const directIds = (document.direct_user_ids || []).map(String);
  const departmentIds = new Set((document.assigned_department_ids || []).map(String));
  const departmentNameKeys = new Set((document.assigned_department_names || []).map((name) => normalizeDepartmentKey(name)));
  const effective = new Set<string>(directIds);

  if (document.all_staff) {
    users.forEach((candidate) => effective.add(candidate.id));
  }

  users.forEach((candidate) => {
    const userDepartmentId = String(candidate.department_id || "");
    const userDepartmentNameKey = normalizeDepartmentKey(candidate.department_name);
    if ((userDepartmentId && departmentIds.has(userDepartmentId)) || (userDepartmentNameKey && departmentNameKeys.has(userDepartmentNameKey))) {
      effective.add(candidate.id);
    }
  });

  return Array.from(effective);
}

export function isAssignedToCurrentUser(document: HrDocumentRecord, currentViewer: DocumentViewerContext, users: PlatformUserRecord[]) {
  return getEffectiveAssignedUserIds(document, users).includes(currentViewer.id);
}

export function hasDirectReportAssignment(document: HrDocumentRecord, currentViewer: DocumentViewerContext, users: PlatformUserRecord[]) {
  const reportIds = new Set(currentViewer.reportIds);
  return getEffectiveAssignedUserIds(document, users).some((userId) => reportIds.has(userId));
}

export function canViewDocument(document: HrDocumentRecord, currentViewer: DocumentViewerContext | null, users: PlatformUserRecord[]) {
  if (!currentViewer) return false;
  if (currentViewer.role === "ADMIN") return true;
  return isAssignedToCurrentUser(document, currentViewer, users) || hasDirectReportAssignment(document, currentViewer, users);
}

export function canOpenDocument(document: HrDocumentRecord, currentViewer: DocumentViewerContext | null, users: PlatformUserRecord[]) {
  if (!currentViewer) return false;
  if (currentViewer.role === "ADMIN") return true;
  if (currentViewer.role === "MANAGER") {
    if (document.sensitive) return isAssignedToCurrentUser(document, currentViewer, users);
    return isAssignedToCurrentUser(document, currentViewer, users) || hasDirectReportAssignment(document, currentViewer, users);
  }
  return isAssignedToCurrentUser(document, currentViewer, users);
}

export function canSignDocument(document: HrDocumentRecord, currentViewer: DocumentViewerContext | null, users: PlatformUserRecord[]) {
  if (!currentViewer) return false;
  return getEffectiveAssignedUserIds(document, users).includes(currentViewer.id) && getDocumentStatus(document) === "pending";
}

export function getDocumentStatus(document: HrDocumentRecord) {
  const normalized = String(document.status || "").trim().toLowerCase();
  if (normalized === "archived") return "archived" as const;
  if (document.is_completed || normalized === "signed") return "signed" as const;
  return "pending" as const;
}

export function getStatusBadgeClass(status: "pending" | "signed" | "archived") {
  if (status === "signed") return "legacy-status completed";
  if (status === "archived") return "legacy-status archived";
  return "legacy-status";
}

export function assignmentSummary(document: HrDocumentRecord) {
  const tokens = [
    ...(document.direct_user_names || []),
    ...(document.assigned_department_names || []).map((name) => `Department: ${name}`),
    ...(document.all_staff ? ["All Staff"] : [])
  ].filter(Boolean);

  return tokens.length ? tokens.join(", ") : "-";
}

export function isDocumentInManagerTeamScope(
  document: HrDocumentRecord,
  currentViewer: DocumentViewerContext | null,
  users: PlatformUserRecord[],
  managerDepartment: ManagerDepartmentContext
) {
  if (!currentViewer || currentViewer.role !== "MANAGER") {
    return false;
  }

  const reportIdSet = new Set((currentViewer.reportIds || []).map(String));
  const managerDepartmentId = String(managerDepartment.id || "").trim();
  const managerDepartmentNameKey = normalizeDepartmentKey(managerDepartment.name);
  const assignedUserIds = getEffectiveAssignedUserIds(document, users);
  const assignedDepartmentIds = new Set((document.assigned_department_ids || []).map(String));
  const assignedDepartmentNameKeys = new Set((document.assigned_department_names || []).map((name) => normalizeDepartmentKey(name)));

  const usersById = new Map(users.map((candidate) => [candidate.id, candidate]));
  const isManagerDepartmentUser = (userId: string) => {
    const candidate = usersById.get(String(userId));
    if (!candidate) {
      return false;
    }

    const candidateDepartmentId = String(candidate.department_id || "").trim();
    const candidateDepartmentNameKey = normalizeDepartmentKey(candidate.department_name);
    if (managerDepartmentId && candidateDepartmentId === managerDepartmentId) {
      return true;
    }

    return Boolean(managerDepartmentNameKey) && Boolean(candidateDepartmentNameKey) && candidateDepartmentNameKey === managerDepartmentNameKey;
  };

  const hasReportAssignment = assignedUserIds.some((userId) => reportIdSet.has(String(userId)));
  const hasManagerDepartmentUserAssignment = assignedUserIds.some((userId) => isManagerDepartmentUser(userId));
  const hasManagerDepartmentTarget =
    (managerDepartmentId && assignedDepartmentIds.has(managerDepartmentId)) ||
    (managerDepartmentNameKey && assignedDepartmentNameKeys.has(managerDepartmentNameKey));

  return Boolean(hasReportAssignment || hasManagerDepartmentUserAssignment || hasManagerDepartmentTarget);
}

export function buildDocumentViewer(userId: string, hrRole: string, assignments: HrAssignment[]) {
  return {
    id: userId,
    role: normalizeDocumentRole(hrRole),
    reportIds: assignments.filter((assignment) => String(assignment.manager_id || "") === userId).map((assignment) => String(assignment.user_id))
  } satisfies DocumentViewerContext;
}
