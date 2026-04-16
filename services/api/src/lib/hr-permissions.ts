import { pool } from "../config/db";

export type HrPermissionRole = "admin" | "manager" | "employee";

export type HrPermissionContext = {
  userId: string;
  organizationId: string;
  role: HrPermissionRole;
  managerId: string | null;
  fullName: string;
  visibleUserIds: string[];
  visibleUserNames: string[];
  userDepartmentName: string | null;
  visibleDepartmentNames: string[];
};

function splitNames(value: string | number | null | undefined) {
  return String(value ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function isPublishedStatus(value: string | number | null | undefined) {
  return String(value ?? "").toLowerCase() === "published";
}

function parseDate(value: string | number | null | undefined) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isActiveAnnouncement(row: Record<string, string | number | null>) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const startDate = parseDate(row.start_date);
  const endDate = parseDate(row.end_date);

  if (!isPublishedStatus(row.status)) {
    return false;
  }

  if (startDate && startDate > today) {
    return false;
  }

  if (endDate && endDate < today) {
    return false;
  }

  return true;
}

function splitTaskTokens(value: string | number | null | undefined) {
  return splitNames(value);
}

function hasTaskAudienceMatch(tokens: string[], context: HrPermissionContext) {
  return tokens.some((token) => {
    if (token === "All Staff") {
      return true;
    }

    if (token.startsWith("Department:")) {
      const departmentName = token.replace(/^Department:/, "").trim();
      return context.visibleDepartmentNames.includes(departmentName);
    }

    return context.visibleUserNames.includes(token);
  });
}

export async function getUserHrRole(userId: string, organizationId: string, platformRole?: string): Promise<{ role: HrPermissionRole; managerId: string | null }> {
  const normalizedPlatformRole = String(platformRole || "USER").toUpperCase();
  if (normalizedPlatformRole === "SUPER_ADMIN" || normalizedPlatformRole === "ADMIN") {
    return { role: "admin" as const, managerId: null };
  }

  const result = await pool.query(
    `SELECT role, NULLIF(department_id, '') AS manager_id
     FROM hr_user_roles
     WHERE user_id = $1 AND organization_id = $2
     ORDER BY id DESC
     LIMIT 1`,
    [userId, organizationId]
  );

  if (!result.rowCount) {
    return { role: "employee" as const, managerId: null };
  }

  const normalizedRole = String(result.rows[0].role || "employee").toLowerCase();
  return {
    role: normalizedRole === "admin" || normalizedRole === "manager" ? normalizedRole : "employee",
    managerId: result.rows[0].manager_id ? String(result.rows[0].manager_id) : null
  };
}

export function canManageDefinitions(role: HrPermissionRole) {
  return role === "admin";
}

export function canViewAll(role: HrPermissionRole) {
  return role === "admin";
}

export function canViewReports(role: HrPermissionRole) {
  return role === "manager";
}

export function canActOnOwn(role: HrPermissionRole) {
  return role === "admin" || role === "manager" || role === "employee";
}

export async function getHrPermissionContext(userId: string, organizationId: string, platformRole: string | undefined, fullName: string | undefined): Promise<HrPermissionContext> {
  const roleInfo = await getUserHrRole(userId, organizationId, platformRole);
  const currentFullName = String(fullName || "").trim();
  const currentUserResult = await pool.query(
    `SELECT d.name AS department_name
     FROM users u
     LEFT JOIN departments d ON d.id = u.department_id
     WHERE u.id = $1 AND u.organization_id = $2
     LIMIT 1`,
    [userId, organizationId]
  );
  const userDepartmentName = currentUserResult.rows[0]?.department_name ? String(currentUserResult.rows[0].department_name) : null;

  if (roleInfo.role === "admin") {
    const users = await pool.query(
      `SELECT u.id, TRIM(u.first_name || ' ' || u.last_name) AS full_name, COALESCE(d.name, '') AS department_name
       FROM users u
       LEFT JOIN departments d ON d.id = u.department_id
       WHERE u.organization_id = $1 AND u.status = 'active'`,
      [organizationId]
    );

    return {
      userId,
      organizationId,
      role: roleInfo.role,
      managerId: roleInfo.managerId,
      fullName: currentFullName,
      visibleUserIds: users.rows.map((row) => String(row.id)),
      visibleUserNames: users.rows.map((row) => String(row.full_name)).filter(Boolean),
      userDepartmentName,
      visibleDepartmentNames: Array.from(new Set(users.rows.map((row) => String(row.department_name || "").trim()).filter(Boolean)))
    } satisfies HrPermissionContext;
  }

  if (roleInfo.role === "manager") {
    const reports = await pool.query(
      `SELECT u.id, TRIM(u.first_name || ' ' || u.last_name) AS full_name, COALESCE(d.name, '') AS department_name
       FROM hr_user_roles hur
       INNER JOIN users u ON u.id = hur.user_id
       LEFT JOIN departments d ON d.id = u.department_id
       WHERE hur.organization_id = $1
         AND NULLIF(hur.department_id, '') = $2
         AND u.status = 'active'`,
      [organizationId, userId]
    );

    const visibleUserIds = reports.rows.map((row) => String(row.id));
    const visibleUserNames = reports.rows.map((row) => String(row.full_name)).filter(Boolean);
    const visibleDepartmentNames = Array.from(new Set(reports.rows.map((row) => String(row.department_name || "").trim()).filter(Boolean)));

    if (userId && !visibleUserIds.includes(userId)) {
      visibleUserIds.unshift(userId);
    }

    if (currentFullName && !visibleUserNames.includes(currentFullName)) {
      visibleUserNames.unshift(currentFullName);
    }

    if (userDepartmentName && !visibleDepartmentNames.includes(userDepartmentName)) {
      visibleDepartmentNames.unshift(userDepartmentName);
    }

    return {
      userId,
      organizationId,
      role: roleInfo.role,
      managerId: roleInfo.managerId,
      fullName: currentFullName,
      visibleUserIds,
      visibleUserNames,
      userDepartmentName,
      visibleDepartmentNames
    } satisfies HrPermissionContext;
  }

  return {
    userId,
    organizationId,
    role: roleInfo.role,
    managerId: roleInfo.managerId,
    fullName: currentFullName,
    visibleUserIds: userId ? [userId] : [],
    visibleUserNames: currentFullName ? [currentFullName] : [],
    userDepartmentName,
    visibleDepartmentNames: userDepartmentName ? [userDepartmentName] : []
  } satisfies HrPermissionContext;
}

export function filterHrResourceRows(resourceName: string, rows: Array<Record<string, string | number | null>>, context: HrPermissionContext) {
  if (canViewAll(context.role)) {
    return rows;
  }

  switch (resourceName) {
    case "announcements":
      return rows.filter((row) => {
        if (!isActiveAnnouncement(row)) {
          return false;
        }

        const audience = String(row.audience ?? "").trim();
        return audience === "All Staff" || audience === context.userDepartmentName;
      });
    case "tasks":
      return rows.filter((row) => hasTaskAudienceMatch(splitTaskTokens(row.assigned_to), context));
    case "task_assignments":
      return rows.filter((row) => {
        const assignmentType = String(row.assignment_type ?? "").toLowerCase();
        if (assignmentType === "all_staff") {
          return true;
        }
        if (assignmentType === "department") {
          return context.visibleDepartmentNames.includes(String(row.assigned_department_name ?? ""));
        }
        return context.visibleUserIds.includes(String(row.assigned_user_id ?? "")) || context.visibleUserNames.includes(String(row.assigned_user_name ?? ""));
      });
    case "task_completion":
    case "task_user_states":
      return rows.filter((row) => context.visibleUserIds.includes(String(row.user_id ?? "")) || context.visibleUserNames.includes(String(row.user_name ?? "")));
    case "training_assignments":
      return rows.filter((row) => hasTaskAudienceMatch(splitNames(row.assignee_name), context));
    case "training_completions":
      return rows.filter((row) => context.visibleUserNames.includes(String(row.user_name ?? "")));
    case "survey_assignments":
      return rows.filter((row) => {
        const allStaff = String(row.all_staff ?? "").toLowerCase() === "true";
        if (allStaff) {
          return true;
        }

        const departmentName = String(row.department_name ?? "").trim();
        if (departmentName && context.visibleDepartmentNames.includes(departmentName)) {
          return true;
        }

        const userId = String(row.user_id ?? "").trim();
        const userName = String(row.user_name ?? "").trim();
        return (userId && context.visibleUserIds.includes(userId)) || (userName && context.visibleUserNames.includes(userName));
      });
    case "survey_completions":
      return rows.filter((row) => {
        const userId = String(row.user_id ?? "").trim();
        const userName = String(row.user_name ?? "").trim();
        return (userId && context.visibleUserIds.includes(userId)) || (userName && context.visibleUserNames.includes(userName));
      });
    case "documents":
      return rows.filter((row) => {
        const owners = splitNames(row.owner_name);
        return owners.length === 0 || owners.some((name) => context.visibleUserNames.includes(name));
      });
    case "document_signatures":
      return rows.filter((row) => context.visibleUserNames.includes(String(row.signer_name ?? "")));
    default:
      return rows;
  }
}

export function logHrPermissionFailure(userId: string, endpoint: string, role: HrPermissionRole, reason: string) {
  console.warn("[HR Permission Denied]", { userId, endpoint, role, reason });
}

export function isHrProtectedResource(resourceName: string) {
  return [
    "announcements",
    "tasks",
    "task_assignments",
    "task_completion",
    "task_user_states",
    "training",
    "training_assignments",
    "training_completions",
    "surveys",
    "survey_assignments",
    "survey_completions",
    "documents",
    "document_signatures"
  ].includes(resourceName);
}
