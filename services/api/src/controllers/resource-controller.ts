import type { Response } from "express";
import { pool } from "../config/db";
import type { AuthenticatedRequest } from "../middleware/auth";
import { resourceMap, type ResourceKey } from "../services/resource-config";
import {
  createDevResource,
  deleteDevResource,
  listDevResource,
  shouldUseDevStore,
  updateDevResource
} from "../services/dev-store";
import {
  canActOnOwn,
  canManageDefinitions,
  filterHrResourceRows,
  getHrPermissionContext,
  isHrProtectedResource,
  logHrPermissionFailure
} from "../lib/hr-permissions";
import { sendAssignmentNotifications } from "../services/assignment-email-service";

const tableOrgColumnCache = new Map<string, boolean>();
let tasksArchivedColumnPromise: Promise<boolean> | null = null;

class ClientInputError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "ClientInputError";
    this.statusCode = statusCode;
  }
}

function asParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value || "";
}

function resolveResource(name: string) {
  return resourceMap[name as ResourceKey];
}

function normalizeNullable(value: unknown) {
  const normalized = String(value ?? "").trim();
  return normalized ? normalized : null;
}

function normalizeTaskAssignmentPayload(body: Record<string, unknown>) {
  const assignmentType = String(body.assignment_type ?? "user").toLowerCase();
  const taskId = Number(body.task_id ?? 0);
  const userId = normalizeNullable(body.assigned_user_id ?? body.user_id);
  const departmentName = normalizeNullable(body.assigned_department_name ?? body.department);

  if (assignmentType === "all_staff") {
    return {
      taskId,
      userId: null,
      department: "All Staff"
    };
  }

  if (assignmentType === "department") {
    return {
      taskId,
      userId: null,
      department: departmentName
    };
  }

  return {
    taskId,
    userId,
    department: null
  };
}

function normalizeTaskCompletionPayload(body: Record<string, unknown>, sessionUserId: string) {
  return {
    taskId: Number(body.task_id ?? 0),
    userId: normalizeNullable(body.user_id) || sessionUserId,
    status: normalizeNullable(body.status) || "NOT_STARTED",
    startedAt: normalizeNullable(body.started_at),
    completedAt: normalizeNullable(body.completed_on ?? body.completed_at)
  };
}

function normalizeSurveyPayload(body: Record<string, unknown>, sessionUserId: string) {
  return {
    title: normalizeNullable(body.title),
    url: normalizeNullable(body.url),
    dueDate: normalizeNullable(body.due_date),
    status: normalizeNullable(body.status) || "Active",
    createdBy: normalizeNullable(body.created_by) || sessionUserId
  };
}

function normalizeSurveyAssignmentPayload(body: Record<string, unknown>) {
  const allStaff = body.all_staff === true || String(body.all_staff ?? "").toLowerCase() === "true";
  const userId = normalizeNullable(body.user_id);
  const departmentId = normalizeNullable(body.department_id);
  const assignmentType = String(body.assignment_type ?? "").toLowerCase();

  const normalizedUserId = assignmentType === "user" ? (normalizeNullable(body.assigned_user_id) || userId) : userId;
  const normalizedDepartmentId = assignmentType === "department" ? (normalizeNullable(body.assigned_department_id) || departmentId) : departmentId;

  return {
    title: normalizeNullable(body.title),
    surveyId: Number(body.survey_id ?? 0),
    dueDate: normalizeNullable(body.due_date),
    status: normalizeNullable(body.status) || "Assigned",
    userId: allStaff ? null : normalizedUserId,
    departmentId: allStaff ? null : normalizedDepartmentId,
    allStaff
  };
}

function normalizeSurveyCompletionPayload(body: Record<string, unknown>, sessionUserId: string) {
  return {
    assignmentId: Number(body.assignment_id ?? 0),
    completedOn: normalizeNullable(body.completed_on) || new Date().toISOString(),
    userId: normalizeNullable(body.user_id) || sessionUserId
  };
}

async function ensureTaskExists(taskId: number, organizationId: string) {
  const result = await pool.query(
    `SELECT id FROM tasks WHERE id = $1 AND organization_id = $2 LIMIT 1`,
    [taskId, organizationId]
  );

  if (!result.rowCount) {
    throw new ClientInputError("Selected task was not found", 400);
  }
}

async function listTaskAssignmentRows(organizationId: string) {
  const result = await pool.query(
    `SELECT
       ta.id,
       ta.task_id,
       CASE
         WHEN ta.department = 'All Staff' THEN 'all_staff'
         WHEN ta.department IS NOT NULL AND ta.department <> '' THEN 'department'
         ELSE 'user'
       END AS assignment_type,
       NULLIF(ta.user_id, '') AS assigned_user_id,
       COALESCE(NULLIF(TRIM(u.first_name || ' ' || u.last_name), ''), NULLIF(ta.user_id, '')) AS assigned_user_name,
       CASE
         WHEN ta.department = 'All Staff' THEN NULL
         ELSE NULLIF(ta.department, '')
       END AS assigned_department_name,
       ta.assigned_at
     FROM task_assignments ta
     LEFT JOIN users u ON u.id::text = ta.user_id
     INNER JOIN tasks t ON t.id = ta.task_id
     WHERE t.organization_id = $1
     ORDER BY ta.id DESC`,
    [organizationId]
  );

  return result.rows as Array<Record<string, string | number | null>>;
}

async function listTaskCompletionRows(organizationId: string) {
  const result = await pool.query(
    `SELECT
       tc.id,
       tc.task_id,
       tc.user_id,
       COALESCE(NULLIF(TRIM(u.first_name || ' ' || u.last_name), ''), tc.user_id::text) AS user_name,
       tc.status,
       tc.started_at,
       tc.completed_at AS completed_on
     FROM task_completion tc
     LEFT JOIN users u ON u.id = tc.user_id
     INNER JOIN tasks t ON t.id = tc.task_id
     WHERE t.organization_id = $1
     ORDER BY tc.id DESC`,
    [organizationId]
  );

  return result.rows as Array<Record<string, string | number | null>>;
}

async function ensureSurveyExists(surveyId: number, organizationId: string) {
  const result = await pool.query(
    `SELECT id FROM surveys WHERE id = $1 AND organization_id = $2 LIMIT 1`,
    [surveyId, organizationId]
  );

  if (!result.rowCount) {
    throw new ClientInputError("Selected survey was not found", 400);
  }
}

async function ensureSurveyAssignmentExists(assignmentId: number, organizationId: string) {
  const result = await pool.query(
    `SELECT id FROM survey_assignments WHERE id = $1 AND organization_id = $2 LIMIT 1`,
    [assignmentId, organizationId]
  );

  if (!result.rowCount) {
    throw new ClientInputError("Selected survey assignment was not found", 400);
  }
}

async function listSurveyRows(organizationId: string) {
  const result = await pool.query(
    `SELECT
       s.id,
       s.organization_id,
       s.title,
       s.url,
       s.due_date,
       s.status,
       s.created_at,
       s.created_by
     FROM surveys s
     WHERE s.organization_id = $1
     ORDER BY s.id DESC`,
    [organizationId]
  );

  return result.rows as Array<Record<string, string | number | null>>;
}

async function listSurveyAssignmentRows(organizationId: string) {
  const result = await pool.query(
    `SELECT
       sa.id,
       sa.organization_id,
       sa.title,
       sa.survey_id,
       sa.due_date,
       sa.status,
       sa.created_at,
       sa.user_id,
       sa.department_id,
       COALESCE(sa.all_staff, false) AS all_staff,
       CASE
         WHEN COALESCE(sa.all_staff, false) THEN 'all_staff'
         WHEN sa.department_id IS NOT NULL THEN 'department'
         ELSE 'user'
       END AS assignment_type,
       COALESCE(NULLIF(TRIM(u.first_name || ' ' || u.last_name), ''), NULLIF(sa.user_id::text, '')) AS user_name,
       d.name AS department_name,
       CASE
         WHEN COALESCE(sa.all_staff, false) THEN 'All Staff'
         WHEN sa.department_id IS NOT NULL THEN 'Department: ' || COALESCE(d.name, '')
         ELSE COALESCE(NULLIF(TRIM(u.first_name || ' ' || u.last_name), ''), NULLIF(sa.user_id::text, ''))
       END AS assignee_name
     FROM survey_assignments sa
     LEFT JOIN users u ON u.id = sa.user_id
     LEFT JOIN departments d ON d.id = sa.department_id
     INNER JOIN surveys s ON s.id = sa.survey_id
     WHERE sa.organization_id = $1
       AND s.organization_id = $1
     ORDER BY sa.id DESC`,
    [organizationId]
  );

  return result.rows as Array<Record<string, string | number | null>>;
}

async function listSurveyCompletionRows(organizationId: string) {
  const result = await pool.query(
    `SELECT
       sc.id,
       sc.organization_id,
       sc.assignment_id,
       sc.completed_on,
       sc.created_at,
       sc.user_id,
       COALESCE(NULLIF(TRIM(u.first_name || ' ' || u.last_name), ''), NULLIF(sc.user_id::text, '')) AS user_name
     FROM survey_completions sc
     INNER JOIN survey_assignments sa ON sa.id = sc.assignment_id AND sa.organization_id = sc.organization_id
     INNER JOIN surveys s ON s.id = sa.survey_id AND s.organization_id = sa.organization_id
     LEFT JOIN users u ON u.id = sc.user_id
     WHERE sc.organization_id = $1
     ORDER BY sc.id DESC`,
    [organizationId]
  );

  return result.rows as Array<Record<string, string | number | null>>;
}

async function insertTaskAssignment(req: AuthenticatedRequest) {
  const payload = normalizeTaskAssignmentPayload(req.body as Record<string, unknown>);
  const params = [payload.taskId, payload.userId, payload.department, new Date().toISOString()];

  const result = await pool.query(
    `INSERT INTO task_assignments (task_id, user_id, department, assigned_at)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    params
  );

  return Number(result.rows[0].id);
}

async function insertTaskCompletion(req: AuthenticatedRequest, organizationId: string) {
  const payload = normalizeTaskCompletionPayload(req.body as Record<string, unknown>, String(req.user?.user_id || ""));
  await ensureTaskExists(payload.taskId, organizationId);
  const params = [payload.taskId, payload.userId, payload.status, payload.startedAt, payload.completedAt];

  const result = await pool.query(
    `INSERT INTO task_completion (task_id, user_id, status, started_at, completed_at)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    params
  );

  return Number(result.rows[0].id);
}

async function updateTaskAssignment(req: AuthenticatedRequest, recordId: number, organizationId: string) {
  const payload = normalizeTaskAssignmentPayload(req.body as Record<string, unknown>);
  const params = [payload.taskId, payload.userId, payload.department, recordId, organizationId];

  await pool.query(
    `UPDATE task_assignments ta
     SET task_id = $1,
         user_id = $2,
         department = $3
     FROM tasks t
     WHERE ta.id = $4
       AND t.id = ta.task_id
       AND t.organization_id = $5`,
    params
  );
}

async function updateTaskCompletion(req: AuthenticatedRequest, recordId: number, organizationId: string) {
  const payload = normalizeTaskCompletionPayload(req.body as Record<string, unknown>, String(req.user?.user_id || ""));
  await ensureTaskExists(payload.taskId, organizationId);
  const params = [payload.taskId, payload.userId, payload.status, payload.startedAt, payload.completedAt, recordId, organizationId];

  await pool.query(
    `UPDATE task_completion tc
     SET task_id = $1,
         user_id = $2,
         status = $3,
         started_at = $4,
         completed_at = $5
     FROM tasks t
     WHERE tc.id = $6
       AND t.id = tc.task_id
       AND t.organization_id = $7`,
    params
  );
}

async function insertSurvey(req: AuthenticatedRequest, organizationId: string) {
  const payload = normalizeSurveyPayload(req.body as Record<string, unknown>, String(req.user?.user_id || ""));
  if (!payload.title) {
    throw new ClientInputError("Survey title is required", 400);
  }

  const result = await pool.query(
    `INSERT INTO surveys (organization_id, title, url, due_date, status, created_by)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [organizationId, payload.title, payload.url, payload.dueDate, payload.status, payload.createdBy]
  );

  return Number(result.rows[0].id);
}

async function updateSurvey(req: AuthenticatedRequest, recordId: number, organizationId: string) {
  const payload = normalizeSurveyPayload(req.body as Record<string, unknown>, String(req.user?.user_id || ""));
  if (!payload.title) {
    throw new ClientInputError("Survey title is required", 400);
  }

  await pool.query(
    `UPDATE surveys
     SET title = $1,
         url = $2,
         due_date = $3,
         status = $4,
         created_by = COALESCE($5, created_by)
     WHERE id = $6 AND organization_id = $7`,
    [payload.title, payload.url, payload.dueDate, payload.status, payload.createdBy, recordId, organizationId]
  );
}

async function insertSurveyAssignment(req: AuthenticatedRequest, organizationId: string) {
  const payload = normalizeSurveyAssignmentPayload(req.body as Record<string, unknown>);
  if (!payload.surveyId) {
    throw new ClientInputError("survey_id is required", 400);
  }
  await ensureSurveyExists(payload.surveyId, organizationId);

  if (!payload.allStaff && !payload.userId && !payload.departmentId) {
    throw new ClientInputError("user_id, department_id, or all_staff is required", 400);
  }

  const result = await pool.query(
    `INSERT INTO survey_assignments (organization_id, title, survey_id, due_date, status, user_id, department_id, all_staff)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id`,
    [organizationId, payload.title, payload.surveyId, payload.dueDate, payload.status, payload.userId, payload.departmentId, payload.allStaff]
  );

  return Number(result.rows[0].id);
}

async function updateSurveyAssignment(req: AuthenticatedRequest, recordId: number, organizationId: string) {
  const payload = normalizeSurveyAssignmentPayload(req.body as Record<string, unknown>);
  if (!payload.surveyId) {
    throw new ClientInputError("survey_id is required", 400);
  }
  await ensureSurveyExists(payload.surveyId, organizationId);

  if (!payload.allStaff && !payload.userId && !payload.departmentId) {
    throw new ClientInputError("user_id, department_id, or all_staff is required", 400);
  }

  await pool.query(
    `UPDATE survey_assignments
     SET title = $1,
         survey_id = $2,
         due_date = $3,
         status = $4,
         user_id = $5,
         department_id = $6,
         all_staff = $7
     WHERE id = $8 AND organization_id = $9`,
    [payload.title, payload.surveyId, payload.dueDate, payload.status, payload.userId, payload.departmentId, payload.allStaff, recordId, organizationId]
  );
}

async function insertSurveyCompletion(req: AuthenticatedRequest, organizationId: string) {
  const payload = normalizeSurveyCompletionPayload(req.body as Record<string, unknown>, String(req.user?.user_id || ""));
  if (!payload.assignmentId) {
    throw new ClientInputError("assignment_id is required", 400);
  }
  await ensureSurveyAssignmentExists(payload.assignmentId, organizationId);

  const result = await pool.query(
    `INSERT INTO survey_completions (organization_id, assignment_id, completed_on, user_id)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [organizationId, payload.assignmentId, payload.completedOn, payload.userId]
  );

  return Number(result.rows[0].id);
}

async function updateSurveyCompletion(req: AuthenticatedRequest, recordId: number, organizationId: string) {
  const payload = normalizeSurveyCompletionPayload(req.body as Record<string, unknown>, String(req.user?.user_id || ""));
  if (!payload.assignmentId) {
    throw new ClientInputError("assignment_id is required", 400);
  }
  await ensureSurveyAssignmentExists(payload.assignmentId, organizationId);

  await pool.query(
    `UPDATE survey_completions
     SET assignment_id = $1,
         completed_on = $2,
         user_id = $3
     WHERE id = $4 AND organization_id = $5`,
    [payload.assignmentId, payload.completedOn, payload.userId, recordId, organizationId]
  );
}

const isTaskAssignmentResource = (resourceName: string) => resourceName === "task_assignments";
const isTaskCompletionResource = (resourceName: string) => resourceName === "task_completion";
const isSurveyResource = (resourceName: string) => resourceName === "surveys";
const isSurveyAssignmentResource = (resourceName: string) => resourceName === "survey_assignments";
const isSurveyCompletionResource = (resourceName: string) => resourceName === "survey_completions";

async function ensureTasksArchivedColumn() {
  if (tasksArchivedColumnPromise) {
    return tasksArchivedColumnPromise;
  }
  tasksArchivedColumnPromise = (async () => {
    const existing = await pool.query(`SELECT 1 FROM information_schema.columns WHERE table_name = 'tasks' AND column_name = 'archived' LIMIT 1`);
    if (existing.rowCount) {
      return true;
    }
    await pool.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS archived BOOLEAN DEFAULT false`);
    return true;
  })();
  return tasksArchivedColumnPromise;
}

async function tasksTableHasArchivedColumn() {
  const result = await pool.query(`SELECT 1 FROM information_schema.columns WHERE table_name = 'tasks' AND column_name = 'archived' LIMIT 1`);
  return Number(result.rowCount || 0) > 0;
}

async function tableHasOrganizationId(tableName: string) {
  if (tableOrgColumnCache.has(tableName)) {
    return tableOrgColumnCache.get(tableName) as boolean;
  }

  const result = await pool.query(
    `SELECT 1
     FROM information_schema.columns
     WHERE table_schema IN ('hr', 'care', 'ursafe', 'public')
       AND table_name = $1
       AND column_name = 'organization_id'
     LIMIT 1`,
    [tableName]
  );

  const hasColumn = Number(result.rowCount || 0) > 0;
  tableOrgColumnCache.set(tableName, hasColumn);
  return hasColumn;
}

async function withFallback<T>(resourceName: string, operation: () => Promise<T>, fallback: () => T) {
  try {
    return await operation();
  } catch (error) {
    if (shouldUseDevStore() && !isHrProtectedResource(resourceName)) {
      console.warn(`Database unavailable for ${resourceName}; using development store.`, error);
      return fallback();
    }

    throw error;
  }
}

async function getContextForResource(req: AuthenticatedRequest, resourceName: string) {
  if (!isHrProtectedResource(resourceName)) {
    return null;
  }

  return getHrPermissionContext(
    String(req.user?.user_id || ""),
    String(req.user?.organization_id || ""),
    String(req.user?.platform_role || req.user?.role || "USER"),
    String(req.user?.full_name || "")
  );
}

function isDefinitionResource(resourceName: string) {
  return ["tasks", "task_assignments", "training", "training_assignments", "surveys", "survey_assignments", "documents", "announcements"].includes(resourceName);
}

function isOwnActionResource(resourceName: string) {
  return ["task_completion", "task_user_states", "training_completions", "survey_completions", "document_signatures"].includes(resourceName);
}

function getActorField(resourceName: string) {
  switch (resourceName) {
    case "task_completion":
      return "user_id";
    case "task_user_states":
    case "training_completions":
      return "user_name";
    case "survey_completions":
      return "user_id";
    case "document_signatures":
      return "signer_name";
    default:
      return null;
  }
}

async function selectExistingRecord(table: string, recordId: number, organizationId: string) {
  if (table === "tasks") {
    if (await tasksTableHasArchivedColumn()) {
      const result = await pool.query(`SELECT * FROM tasks WHERE id = $1 AND organization_id = $2 AND COALESCE(archived, false) = false LIMIT 1`, [recordId, organizationId]);
      return result.rows[0] || null;
    }
    const result = await pool.query(`SELECT * FROM tasks WHERE id = $1 AND organization_id = $2 LIMIT 1`, [recordId, organizationId]);
    return result.rows[0] || null;
  }
  if (table === "task_assignments") {
    const result = await pool.query(
      `SELECT ta.*
       FROM task_assignments ta
       INNER JOIN tasks t ON t.id = ta.task_id
       WHERE ta.id = $1 AND t.organization_id = $2
       LIMIT 1`,
      [recordId, organizationId]
    );
    return result.rows[0] || null;
  }

  if (table === "task_completion") {
    const result = await pool.query(
      `SELECT tc.*
       FROM task_completion tc
       INNER JOIN tasks t ON t.id = tc.task_id
       WHERE tc.id = $1 AND t.organization_id = $2
       LIMIT 1`,
      [recordId, organizationId]
    );
    return result.rows[0] || null;
  }

  if (table === "survey_assignments") {
    const result = await pool.query(
      `SELECT
         sa.*,
         COALESCE(NULLIF(TRIM(u.first_name || ' ' || u.last_name), ''), NULLIF(sa.user_id::text, '')) AS user_name,
         d.name AS department_name,
         CASE
           WHEN COALESCE(sa.all_staff, false) THEN 'All Staff'
           WHEN sa.department_id IS NOT NULL THEN 'Department: ' || COALESCE(d.name, '')
           ELSE COALESCE(NULLIF(TRIM(u.first_name || ' ' || u.last_name), ''), NULLIF(sa.user_id::text, ''))
         END AS assignee_name
       FROM survey_assignments sa
       LEFT JOIN users u ON u.id = sa.user_id
       LEFT JOIN departments d ON d.id = sa.department_id
       INNER JOIN surveys s ON s.id = sa.survey_id
       WHERE sa.id = $1 AND sa.organization_id = $2 AND s.organization_id = $2
       LIMIT 1`,
      [recordId, organizationId]
    );
    return result.rows[0] || null;
  }

  if (table === "survey_completions") {
    const result = await pool.query(
      `SELECT
         sc.*,
         COALESCE(NULLIF(TRIM(u.first_name || ' ' || u.last_name), ''), NULLIF(sc.user_id::text, '')) AS user_name
       FROM survey_completions sc
       INNER JOIN survey_assignments sa ON sa.id = sc.assignment_id AND sa.organization_id = sc.organization_id
       INNER JOIN surveys s ON s.id = sa.survey_id AND s.organization_id = sa.organization_id
       LEFT JOIN users u ON u.id = sc.user_id
       WHERE sc.id = $1 AND sc.organization_id = $2
       LIMIT 1`,
      [recordId, organizationId]
    );
    return result.rows[0] || null;
  }

  const hasOrgColumn = await tableHasOrganizationId(table);
  if (hasOrgColumn) {
    const result = await pool.query(`SELECT * FROM ${table} WHERE id = $1 AND organization_id = $2 LIMIT 1`, [recordId, organizationId]);
    return result.rows[0] || null;
  }

  const result = await pool.query(`SELECT * FROM ${table} WHERE id = $1 LIMIT 1`, [recordId]);
  return result.rows[0] || null;
}

async function listTableRows(table: string, organizationId: string) {
  if (table === "tasks") {
    if (await tasksTableHasArchivedColumn()) {
      const result = await pool.query(`SELECT * FROM tasks WHERE organization_id = $1 AND COALESCE(archived, false) = false ORDER BY id DESC LIMIT 100`, [organizationId]);
      return result.rows as Array<Record<string, string | number | null>>;
    }
    const result = await pool.query(`SELECT * FROM tasks WHERE organization_id = $1 ORDER BY id DESC LIMIT 100`, [organizationId]);
    return result.rows as Array<Record<string, string | number | null>>;
  }
  if (table === "task_assignments") {
    return listTaskAssignmentRows(organizationId);
  }

  if (table === "task_completion") {
    return listTaskCompletionRows(organizationId);
  }

  if (table === "surveys") {
    return listSurveyRows(organizationId);
  }

  if (table === "survey_assignments") {
    return listSurveyAssignmentRows(organizationId);
  }

  if (table === "survey_completions") {
    return listSurveyCompletionRows(organizationId);
  }

  const hasOrgColumn = await tableHasOrganizationId(table);
  if (hasOrgColumn) {
    const result = await pool.query(`SELECT * FROM ${table} WHERE organization_id = $1 ORDER BY id DESC LIMIT 100`, [organizationId]);
    return result.rows as Array<Record<string, string | number | null>>;
  }

  const result = await pool.query(`SELECT * FROM ${table} ORDER BY id DESC LIMIT 100`);
  return result.rows as Array<Record<string, string | number | null>>;
}

async function insertRow(table: string, fields: readonly string[], values: Array<string | number | null>, organizationId: string) {
  const hasOrgColumn = await tableHasOrganizationId(table);
  const insertFields = hasOrgColumn ? ["organization_id", ...fields] : [...fields];
  const insertValues = hasOrgColumn ? [organizationId, ...values] : values;
  const placeholders = insertFields.map((_, index) => `$${index + 1}`).join(", ");
  const result = await pool.query(
    `INSERT INTO ${table} (${insertFields.join(", ")}) VALUES (${placeholders}) RETURNING id`,
    insertValues
  );
  return Number(result.rows[0].id);
}

async function updateRow(table: string, fields: readonly string[], values: Array<string | number | null>, recordId: number, organizationId: string) {
  const assignments = fields.map((field, index) => `${field} = $${index + 1}`).join(", ");
  const hasOrgColumn = await tableHasOrganizationId(table);

  if (hasOrgColumn) {
    await pool.query(
      `UPDATE ${table} SET ${assignments} WHERE id = $${fields.length + 1} AND organization_id = $${fields.length + 2}`,
      [...values, recordId, organizationId]
    );
    return;
  }

  await pool.query(
    `UPDATE ${table} SET ${assignments} WHERE id = $${fields.length + 1}`,
    [...values, recordId]
  );
}

async function deleteRow(table: string, recordId: number, organizationId: string) {
  if (table === "task_assignments") {
    await pool.query(
      `DELETE FROM task_assignments ta
       USING tasks t
       WHERE ta.id = $1
         AND t.id = ta.task_id
         AND t.organization_id = $2`,
      [recordId, organizationId]
    );
    return;
  }

  if (table === "task_completion") {
    await pool.query(
      `DELETE FROM task_completion tc
       USING tasks t
       WHERE tc.id = $1
         AND t.id = tc.task_id
         AND t.organization_id = $2`,
      [recordId, organizationId]
    );
    return;
  }

  const hasOrgColumn = await tableHasOrganizationId(table);
  if (hasOrgColumn) {
    await pool.query(`DELETE FROM ${table} WHERE id = $1 AND organization_id = $2`, [recordId, organizationId]);
    return;
  }

  await pool.query(`DELETE FROM ${table} WHERE id = $1`, [recordId]);
}

async function enforceCreatePermissions(req: AuthenticatedRequest, res: Response, resourceName: string, organizationId: string) {
  const context = await getContextForResource(req, resourceName);
  if (!context) return { ok: true as const, context: null };

  if (isDefinitionResource(resourceName) && !canManageDefinitions(context.role)) {
    logHrPermissionFailure(context.userId, req.originalUrl, context.role, `create blocked for resource ${resourceName}`);
    res.status(403).json({ message: "Forbidden" });
    return { ok: false as const, context };
  }

  if (isOwnActionResource(resourceName) && !canManageDefinitions(context.role)) {
    const actorField = getActorField(resourceName);
    const actorValue = actorField ? String(req.body[actorField] ?? "") : "";
    const expectedActor = actorField === "user_id" ? context.userId : context.fullName;

    if (!canActOnOwn(context.role) || actorValue !== expectedActor) {
      logHrPermissionFailure(context.userId, req.originalUrl, context.role, `create blocked for resource ${resourceName} with actor ${actorValue}`);
      res.status(403).json({ message: "Forbidden" });
      return { ok: false as const, context };
    }

    if (resourceName === "document_signatures") {
      const documentId = Number(req.body.document_id ?? 0);
      const assignment = await pool.query(
        `SELECT id
         FROM document_signatures
         WHERE organization_id = $1 AND document_id = $2 AND signer_name = $3
         LIMIT 1`,
        [organizationId, documentId, context.fullName]
      );

      if (!assignment.rowCount) {
        logHrPermissionFailure(context.userId, req.originalUrl, context.role, `document signature not assigned to current user for document ${documentId}`);
        res.status(403).json({ message: "Forbidden" });
        return { ok: false as const, context };
      }
    }
  }

  return { ok: true as const, context };
}

async function enforceUpdateOrDeletePermissions(req: AuthenticatedRequest, res: Response, resourceName: string, organizationId: string, recordId: number) {
  const context = await getContextForResource(req, resourceName);
  if (!context) return { ok: true as const, context: null, existing: null as Record<string, string | number | null> | null };

  const resource = resolveResource(resourceName);
  if (!resource) {
    res.status(404).json({ message: "Unknown resource" });
    return { ok: false as const, context, existing: null };
  }

  const existing = await selectExistingRecord(resource.table, recordId, organizationId) as Record<string, string | number | null> | null;

  if (!existing) {
    res.status(404).json({ message: "Record not found" });
    return { ok: false as const, context, existing: null };
  }

  if (isDefinitionResource(resourceName) && !canManageDefinitions(context.role)) {
    logHrPermissionFailure(context.userId, req.originalUrl, context.role, `update/delete blocked for resource ${resourceName}`);
    res.status(403).json({ message: "Forbidden" });
    return { ok: false as const, context, existing };
  }

  if (isOwnActionResource(resourceName) && !canManageDefinitions(context.role)) {
    const actorField = getActorField(resourceName);
    const existingActor = actorField ? String(existing[actorField] ?? "") : "";
    const requestActor = actorField ? String(req.body[actorField] ?? existingActor) : "";
    const expectedActor = actorField === "user_id" ? context.userId : context.fullName;

    if (!canActOnOwn(context.role) || existingActor !== expectedActor || requestActor !== expectedActor) {
      logHrPermissionFailure(context.userId, req.originalUrl, context.role, `update/delete blocked for resource ${resourceName} with actor ${existingActor}`);
      res.status(403).json({ message: "Forbidden" });
      return { ok: false as const, context, existing };
    }
  }

  return { ok: true as const, context, existing };
}

export async function listResources(req: AuthenticatedRequest, res: Response) {
  try {
    const resourceName = asParam(req.params.resource);
    const resource = resolveResource(resourceName);
    const organizationId = String(req.user?.organization_id || "");

    if (!resource) {
      return res.status(404).json({ message: "Unknown resource" });
    }

    const context = await getContextForResource(req, resourceName);

    const items = await withFallback(
      resourceName,
      async () => {
        const rows = await listTableRows(resource.table, organizationId);
        return context ? filterHrResourceRows(resourceName, rows, context) : rows;
      },
      () => {
        const rows = listDevResource(resourceName as never, organizationId) as Array<Record<string, string | number | null>>;
        return context ? filterHrResourceRows(resourceName, rows, context) : rows;
      }
    );

    return res.json({ items });
  } catch (error) {
    if (error instanceof ClientInputError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error(`Task query failed in GET ${req.originalUrl}`, error);
    return res.status(500).json({ error: "Task query failed" });
  }
}

export async function getResourceById(req: AuthenticatedRequest, res: Response) {
  try {
    const resourceName = asParam(req.params.resource);
    const resource = resolveResource(resourceName);
    const organizationId = String(req.user?.organization_id || "");
    const recordId = Number(asParam(req.params.id));
    if (!resource) {
      return res.status(404).json({ message: "Unknown resource" });
    }
    const context = await getContextForResource(req, resourceName);
    const item = await withFallback(
      resourceName,
      async () => {
        const row = await selectExistingRecord(resource.table, recordId, organizationId);
        if (!row) {
          return null;
        }
        if (!context) {
          return row as Record<string, string | number | null>;
        }
        const visibleRows = filterHrResourceRows(resourceName, [row as Record<string, string | number | null>], context);
        return visibleRows[0] || null;
      },
      () => {
        const rows = listDevResource(resourceName as never, organizationId) as Array<Record<string, string | number | null>>;
        const row = rows.find((candidate) => Number(candidate.id ?? 0) === recordId) || null;
        if (!row) {
          return null;
        }
        if (!context) {
          return row;
        }
        const visibleRows = filterHrResourceRows(resourceName, [row], context);
        return visibleRows[0] || null;
      }
    );
    if (!item) {
      return res.status(404).json({ message: "Record not found" });
    }
    return res.json(item);
  } catch (error) {
    if (error instanceof ClientInputError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error(`Task query failed in GET ${req.originalUrl}`, error);
    return res.status(500).json({ error: "Task query failed" });
  }
}

export async function archiveTask(req: AuthenticatedRequest, res: Response) {
  try {
    const organizationId = String(req.user?.organization_id || "");
    const recordId = Number(asParam(req.params.id));
    const context = await getContextForResource(req, "tasks");

    if (context && !canManageDefinitions(context.role)) {
      logHrPermissionFailure(context.userId, req.originalUrl, context.role, "archive blocked for task");
      return res.status(403).json({ message: "Forbidden" });
    }

    await ensureTasksArchivedColumn();

    const existing = await pool.query(
      "SELECT id, status FROM tasks WHERE id = $1 AND organization_id = $2 AND COALESCE(archived, false) = false LIMIT 1",
      [recordId, organizationId]
    );

    if (!existing.rowCount) {
      return res.status(404).json({ message: "Record not found" });
    }

    await pool.query(
      "UPDATE tasks SET archived = true WHERE id = $1 AND organization_id = $2",
      [recordId, organizationId]
    );

    return res.json({ success: true });
  } catch (error) {
    console.error(`Task archive failed in POST ${req.originalUrl}`, error);
    return res.status(500).json({ error: "Task archive failed" });
  }
}

export async function listArchivedTasks(req: AuthenticatedRequest, res: Response) {
  try {
    const organizationId = String(req.user?.organization_id || "");
    const context = await getContextForResource(req, "tasks");

    if (context && !canManageDefinitions(context.role)) {
      logHrPermissionFailure(context.userId, req.originalUrl, context.role, "list archived tasks blocked");
      return res.status(403).json({ message: "Forbidden" });
    }

    const items = await withFallback(
      "tasks",
      async () => {
        await ensureTasksArchivedColumn();
        const result = await pool.query(
          `SELECT *
           FROM tasks
           WHERE organization_id = $1
             AND COALESCE(archived, false) = true
           ORDER BY due_date DESC NULLS LAST, id DESC`,
          [organizationId]
        );
        return result.rows as Array<Record<string, string | number | null>>;
      },
      () => (listDevResource("tasks", organizationId) as Array<Record<string, string | number | null>>).filter((row) => String(row.archived ?? "").toLowerCase() === "true")
    );

    return res.json({ items });
  } catch (error) {
    console.error(`Task query failed in GET ${req.originalUrl}`, error);
    return res.status(500).json({ error: "Task query failed" });
  }
}

export async function createResource(req: AuthenticatedRequest, res: Response) {
  try {
    const resourceName = asParam(req.params.resource);
    const resource = resolveResource(resourceName);
    const organizationId = String(req.user?.organization_id || "");

    if (!resource) {
      return res.status(404).json({ message: "Unknown resource" });
    }

    const permission = await enforceCreatePermissions(req, res, resourceName, organizationId);
    if (!permission.ok) {
      return;
    }

    const valueMap = Object.fromEntries(resource.fields.map((field) => [field, req.body[field] ?? null]));
    const values = resource.fields.map((field) => req.body[field] ?? null);

    const id = await withFallback(
      resourceName,
      async () => {
        if (isSurveyResource(resourceName)) {
          return insertSurvey(req, organizationId);
        }
        if (isSurveyAssignmentResource(resourceName)) {
          return insertSurveyAssignment(req, organizationId);
        }
        if (isSurveyCompletionResource(resourceName)) {
          return insertSurveyCompletion(req, organizationId);
        }
        if (isTaskAssignmentResource(resourceName)) {
          return insertTaskAssignment(req);
        }
        if (isTaskCompletionResource(resourceName)) {
          return insertTaskCompletion(req, organizationId);
        }
        return insertRow(resource.table, resource.fields, values, organizationId);
      },
      () => createDevResource(resourceName as never, organizationId, valueMap).id
    );

    // ─── Assignment notifications (best-effort, non-blocking) ──────────────
    void (async () => {
      try {
        const body = req.body as Record<string, unknown>;

        if (isTaskAssignmentResource(resourceName)) {
          const payload = normalizeTaskAssignmentPayload(body);
          const taskRow = await pool.query(
            "SELECT title FROM tasks WHERE id = $1 LIMIT 1",
            [payload.taskId]
          );
          const taskTitle = String(taskRow.rows[0]?.title || "Task");
          await sendAssignmentNotifications({
            organizationId,
            type: "task",
            title: taskTitle,
            userId: payload.userId,
            allStaff: payload.department === "All Staff",
            departmentName: payload.department && payload.department !== "All Staff" ? payload.department : null,
          });
        } else if (isSurveyAssignmentResource(resourceName)) {
          const payload = normalizeSurveyAssignmentPayload(body);
          await sendAssignmentNotifications({
            organizationId,
            type: "survey",
            title: payload.title || "Survey",
            userId: payload.userId,
            departmentId: payload.departmentId,
            allStaff: payload.allStaff,
            dueDate: payload.dueDate,
          });
        } else if (resourceName === "training_assignments") {
          const assigneeName = String(body.assignee_name ?? "");
          const tokens = assigneeName.split(",").map((t) => t.trim()).filter(Boolean);
          const isAllStaff = tokens.includes("All Staff");
          const deptToken = tokens.find((t) => t.startsWith("Department: "));
          const deptName = deptToken ? deptToken.slice("Department: ".length).trim() : null;
          const nameTokens = tokens.filter((t) => t !== "All Staff" && !t.startsWith("Department: "));
          await sendAssignmentNotifications({
            organizationId,
            type: "training",
            title: String(body.title ?? "Training"),
            allStaff: isAllStaff,
            departmentName: deptName,
            assigneeNames: nameTokens,
            dueDate: String(body.due_date ?? "") || null,
          });
        } else if (resourceName === "announcements") {
          const audience = String(body.audience ?? "");
          await sendAssignmentNotifications({
            organizationId,
            type: "announcement",
            title: String(body.title ?? "Announcement"),
            allStaff: audience === "All Staff",
            departmentName: audience && audience !== "All Staff" ? audience : null,
          });
        }
      } catch (notifErr) {
        console.warn("[AssignmentEmail] Notification dispatch error:", notifErr);
      }
    })();
    // ───────────────────────────────────────────────────────────────────────

    return res.status(201).json({ id });
  } catch (error) {
    if (error instanceof ClientInputError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error(`Task query failed in POST ${req.originalUrl}`, error);
    return res.status(500).json({ error: "Task query failed" });
  }
}

export async function updateResource(req: AuthenticatedRequest, res: Response) {
  try {
    const resourceName = asParam(req.params.resource);
    const resource = resolveResource(resourceName);
    const organizationId = String(req.user?.organization_id || "");
    const recordId = Number(asParam(req.params.id));

    if (!resource) {
      return res.status(404).json({ message: "Unknown resource" });
    }

    const permission = await enforceUpdateOrDeletePermissions(req, res, resourceName, organizationId, recordId);
    if (!permission.ok) {
      return;
    }

    const valueMap = Object.fromEntries(resource.fields.map((field) => [field, req.body[field] ?? null]));
    const values = resource.fields.map((field) => req.body[field] ?? null);

    await withFallback(
      resourceName,
      async () => {
        if (isSurveyResource(resourceName)) {
          await updateSurvey(req, recordId, organizationId);
        } else if (isSurveyAssignmentResource(resourceName)) {
          await updateSurveyAssignment(req, recordId, organizationId);
        } else if (isSurveyCompletionResource(resourceName)) {
          await updateSurveyCompletion(req, recordId, organizationId);
        } else if (isTaskAssignmentResource(resourceName)) {
          await updateTaskAssignment(req, recordId, organizationId);
        } else if (isTaskCompletionResource(resourceName)) {
          await updateTaskCompletion(req, recordId, organizationId);
        } else {
          await updateRow(resource.table, resource.fields, values, recordId, organizationId);
        }
        return true;
      },
      () => Boolean(updateDevResource(resourceName as never, organizationId, recordId, valueMap))
    );

    return res.json({ success: true });
  } catch (error) {
    if (error instanceof ClientInputError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error(`Task query failed in PUT ${req.originalUrl}`, error);
    return res.status(500).json({ error: "Task query failed" });
  }
}

export async function deleteResource(req: AuthenticatedRequest, res: Response) {
  try {
    const resourceName = asParam(req.params.resource);
    const resource = resolveResource(resourceName);
    const organizationId = String(req.user?.organization_id || "");
    const recordId = Number(asParam(req.params.id));

    if (!resource) {
      return res.status(404).json({ message: "Unknown resource" });
    }

    const permission = await enforceUpdateOrDeletePermissions(req, res, resourceName, organizationId, recordId);
    if (!permission.ok) {
      return;
    }

    await withFallback(
      resourceName,
      async () => {
        await deleteRow(resource.table, recordId, organizationId);
        return true;
      },
      () => deleteDevResource(resourceName as never, organizationId, recordId)
    );

    return res.json({ success: true });
  } catch (error) {
    if (error instanceof ClientInputError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error(`Task query failed in DELETE ${req.originalUrl}`, error);
    return res.status(500).json({ error: "Task query failed" });
  }
}











