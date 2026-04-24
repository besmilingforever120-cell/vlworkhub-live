import { pool } from "../config/db";
import { listDevResource, shouldUseDevStore } from "./dev-store";

export type NotificationType = "task" | "training" | "survey" | "document";

export type NotificationItem = {
  type: NotificationType;
  title: string;
  link: string;
  created_at: string;
};

export type NotificationSummary = {
  count: number;
  items: NotificationItem[];
};

type HrScope = {
  role: "admin" | "manager" | "employee";
  departmentId: string | null;
  fullName: string;
  visibleNames: string[];
};

type GenericRow = Record<string, string | number | null>;

function splitNames(value: string | null | undefined) {
  return String(value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function isVisibleAssignment(value: string | null | undefined, visibleNames: string[]) {
  const names = splitNames(value);
  return names.some((name) => visibleNames.includes(name));
}

async function resolveScopeFromDb(userId: string, organizationId: string): Promise<HrScope> {
  const userResult = await pool.query(
    `SELECT u.id, COALESCE(u.first_name || ' ' || u.last_name, u.email) AS full_name, hur.role, hur.department_id
     FROM users u
     LEFT JOIN hr_user_roles hur ON hur.user_id = u.id AND hur.organization_id = u.organization_id
     WHERE u.id = $1 AND u.organization_id = $2
     LIMIT 1`,
    [userId, organizationId]
  );

  const current = userResult.rows[0];
  const fullName = String(current?.full_name ?? "Unknown User").trim();
  const role = String(current?.role ?? "employee") as HrScope["role"];
  const departmentId = current?.department_id ? String(current.department_id) : null;

  let visibleNames: string[] = [fullName];
  if (role === "admin") {
    const result = await pool.query(
      `SELECT COALESCE(first_name || ' ' || last_name, email) AS full_name
       FROM users
       WHERE organization_id = $1`,
      [organizationId]
    );
    visibleNames = result.rows.map((row) => String(row.full_name).trim()).filter(Boolean);
  } else if (role === "manager" && departmentId) {
    const result = await pool.query(
      `SELECT COALESCE(u.first_name || ' ' || u.last_name, u.email) AS full_name
       FROM hr_user_roles hur
       INNER JOIN users u ON u.id = hur.user_id AND u.organization_id = hur.organization_id
       WHERE hur.organization_id = $1 AND hur.department_id = $2`,
      [organizationId, departmentId]
    );
    visibleNames = result.rows.map((row) => String(row.full_name).trim()).filter(Boolean);
    if (!visibleNames.includes(fullName)) visibleNames.unshift(fullName);
  }

  return { role, departmentId, fullName, visibleNames };
}

function resolveScopeFromDevStore(userId: string, organizationId: string): HrScope {
  const users = listDevResource("users", organizationId);
  const roles = listDevResource("hr_user_roles", organizationId);
  const currentUser = users.find((item) => String(item.id) === userId || String(item.user_id ?? "") === userId);
  const currentRole = roles.find((item) => String(item.user_id) === userId);
  const fullName = `${String(currentUser?.first_name ?? "").trim()} ${String(currentUser?.last_name ?? "").trim()}`.trim() || String(currentUser?.email ?? "Unknown User");
  const role = String(currentRole?.role ?? "employee") as HrScope["role"];
  const departmentId = currentRole?.department_id ? String(currentRole.department_id) : null;

  let visibleNames = [fullName];
  if (role === "admin") {
    visibleNames = users
      .map((item) => `${String(item.first_name ?? "").trim()} ${String(item.last_name ?? "").trim()}`.trim() || String(item.email ?? ""))
      .filter(Boolean);
  } else if (role === "manager" && departmentId) {
    const deptUserIds = roles.filter((item) => String(item.department_id ?? "") === departmentId).map((item) => String(item.user_id));
    visibleNames = users
      .filter((item) => deptUserIds.includes(String(item.id)))
      .map((item) => `${String(item.first_name ?? "").trim()} ${String(item.last_name ?? "").trim()}`.trim() || String(item.email ?? ""))
      .filter(Boolean);
    if (!visibleNames.includes(fullName)) visibleNames.unshift(fullName);
  }

  return { role, departmentId, fullName, visibleNames };
}

async function getScope(userId: string, organizationId: string) {
  try {
    return await resolveScopeFromDb(userId, organizationId);
  } catch (error) {
    if (shouldUseDevStore()) {
      console.warn("Database unavailable for notifications scope; using development store.", error);
      return resolveScopeFromDevStore(userId, organizationId);
    }

    throw error;
  }
}

function sortNotifications(items: NotificationItem[]) {
  return items.sort((left, right) => String(right.created_at).localeCompare(String(left.created_at)));
}

export async function getUserNotifications(userId: string, organizationId: string): Promise<NotificationSummary> {
  const scope = await getScope(userId, organizationId);

  try {
    const [tasks, trainingAssignments, surveyAssignments, signatures] = await Promise.all([
      pool.query(`SELECT id, title, assigned_to, due_date, status, created_at FROM tasks WHERE organization_id = $1`, [organizationId]),
      pool.query(`SELECT id, title, assignee_name, due_date, status, created_at FROM training_assignments WHERE organization_id = $1`, [organizationId]),
      pool.query(
        `SELECT
           sa.id,
           sa.title,
           sa.due_date,
           sa.status,
           sa.created_at,
           CASE
             WHEN COALESCE(sa.all_staff, false) THEN 'All Staff'
             WHEN sa.department_id IS NOT NULL THEN 'Department: ' || COALESCE(d.name, '')
             ELSE COALESCE(NULLIF(TRIM(u.first_name || ' ' || u.last_name), ''), NULLIF(sa.user_id::text, ''))
           END AS assignee_name
         FROM survey_assignments sa
         LEFT JOIN users u ON u.id = sa.user_id
         LEFT JOIN departments d ON d.id = sa.department_id
         INNER JOIN surveys s ON s.id = sa.survey_id AND s.organization_id = sa.organization_id
         WHERE sa.organization_id = $1`,
        [organizationId]
      ),
      pool.query(
        `SELECT ds.id, ds.signer_name, ds.status, ds.created_at, d.title AS document_title
         FROM document_signatures ds
         LEFT JOIN documents d ON d.id = ds.document_id AND d.organization_id = ds.organization_id
         WHERE ds.organization_id = $1`,
        [organizationId]
      )
    ]);

    const items: NotificationItem[] = [];

    for (const row of tasks.rows) {
      if (String(row.status ?? "").toLowerCase() === "completed") continue;
      if (!isVisibleAssignment(row.assigned_to, scope.visibleNames)) continue;
      items.push({ type: "task", title: `${String(row.title ?? "Task")} - Due ${row.due_date ? new Date(String(row.due_date)).toLocaleDateString() : "No due date"}`, link: "/tasks", created_at: String(row.created_at ?? row.due_date ?? new Date().toISOString()) });
    }

    for (const row of trainingAssignments.rows) {
      if (String(row.status ?? "").toLowerCase() === "completed") continue;
      if (!isVisibleAssignment(row.assignee_name, scope.visibleNames)) continue;
      items.push({ type: "training", title: `${String(row.title ?? "Training")} - ${row.due_date ? `Due ${new Date(String(row.due_date)).toLocaleDateString()}` : "Assigned"}`, link: "/training", created_at: String(row.created_at ?? row.due_date ?? new Date().toISOString()) });
    }

    for (const row of surveyAssignments.rows) {
      if (String(row.status ?? "").toLowerCase() === "completed") continue;
      if (!isVisibleAssignment(row.assignee_name, scope.visibleNames)) continue;
      items.push({ type: "survey", title: `${String(row.title ?? "Survey")} - ${row.due_date ? `Due ${new Date(String(row.due_date)).toLocaleDateString()}` : "Assigned"}`, link: "/surveys", created_at: String(row.created_at ?? row.due_date ?? new Date().toISOString()) });
    }

    for (const row of signatures.rows) {
      if (String(row.status ?? "").toLowerCase() === "signed") continue;
      if (!scope.visibleNames.includes(String(row.signer_name ?? ""))) continue;
      items.push({ type: "document", title: `${String(row.document_title ?? "Document")} - Signature required`, link: "/documents", created_at: String(row.created_at ?? new Date().toISOString()) });
    }

    const sorted = sortNotifications(items);
    return { count: sorted.length, items: sorted };
  } catch (error) {
    if (!shouldUseDevStore()) {
      throw error;
    }

    console.warn("Database unavailable for notifications list; using development store.", error);
    const tasks = listDevResource("tasks", organizationId);
    const trainingAssignments = listDevResource("training_assignments", organizationId);
    const surveyAssignments = listDevResource("survey_assignments", organizationId);
    const signatures = listDevResource("document_signatures", organizationId);
    const documents = listDevResource("documents", organizationId);
    const documentMap = new Map(documents.map((item) => [String(item.id), item]));

    const items: NotificationItem[] = [];

    for (const row of tasks) {
      if (String(row.status ?? "").toLowerCase() === "completed") continue;
      if (!isVisibleAssignment(String(row.assigned_to ?? ""), scope.visibleNames)) continue;
      items.push({ type: "task", title: `${String(row.title ?? "Task")} - Due ${row.due_date ? new Date(String(row.due_date)).toLocaleDateString() : "No due date"}`, link: "/tasks", created_at: String(row.created_at ?? row.due_date ?? new Date().toISOString()) });
    }

    for (const row of trainingAssignments) {
      if (String(row.status ?? "").toLowerCase() === "completed") continue;
      if (!isVisibleAssignment(String(row.assignee_name ?? ""), scope.visibleNames)) continue;
      items.push({ type: "training", title: `${String(row.title ?? "Training")} - ${row.due_date ? `Due ${new Date(String(row.due_date)).toLocaleDateString()}` : "Assigned"}`, link: "/training", created_at: String(row.created_at ?? row.due_date ?? new Date().toISOString()) });
    }

    for (const row of surveyAssignments) {
      if (String(row.status ?? "").toLowerCase() === "completed") continue;
      if (!isVisibleAssignment(String(row.assignee_name ?? ""), scope.visibleNames)) continue;
      items.push({ type: "survey", title: `${String(row.title ?? "Survey")} - ${row.due_date ? `Due ${new Date(String(row.due_date)).toLocaleDateString()}` : "Assigned"}`, link: "/surveys", created_at: String(row.created_at ?? row.due_date ?? new Date().toISOString()) });
    }

    for (const row of signatures) {
      if (String(row.status ?? "").toLowerCase() === "signed") continue;
      if (!scope.visibleNames.includes(String(row.signer_name ?? ""))) continue;
      const linkedDocument = documentMap.get(String(row.document_id));
      items.push({ type: "document", title: `${String(linkedDocument?.title ?? "Document")} - Signature required`, link: "/documents", created_at: String(row.created_at ?? new Date().toISOString()) });
    }

    const sorted = sortNotifications(items);
    return { count: sorted.length, items: sorted };
  }
}
