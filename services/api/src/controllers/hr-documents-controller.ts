import type { Response } from "express";
import { pool } from "../config/db";
import type { AuthenticatedRequest } from "../middleware/auth";
import { getHrPermissionContext } from "../lib/hr-permissions";

type DocumentRecord = Record<string, string | number | boolean | string[] | null>;

type CreateDocumentBody = {
  title?: string;
  fileName?: string;
  fileUrl?: string | null;
  category?: string;
  categoryOther?: string | null;
  departmentId?: string | null;
  description?: string | null;
  dueDate?: string | null;
  requiresSignature?: boolean;
  status?: string | null;
  sensitive?: boolean;
  userIds?: string[];
  assignedUserIds?: string[];
  departmentIds?: string[];
  assignedDepartmentIds?: string[];
  allStaff?: boolean;
};

type OrganizationUser = {
  id: string;
  full_name: string;
  department_id: string | null;
  department_name: string | null;
};

let ensureDocumentsSchemaPromise: Promise<void> | null = null;

function asString(value: unknown) {
  return String(value ?? "").trim();
}

function asNullableString(value: unknown) {
  const normalized = asString(value);
  return normalized || null;
}

function asBoolean(value: unknown, defaultValue: boolean) {
  if (typeof value === "boolean") return value;
  const normalized = asString(value).toLowerCase();
  if (["true", "yes", "1", "signed", "required"].includes(normalized)) return true;
  if (["false", "no", "0", "not_required"].includes(normalized)) return false;
  return defaultValue;
}

function normalizeIds(values: unknown) {
  if (!Array.isArray(values)) return [] as string[];
  return values.map((value) => asString(value)).filter(Boolean);
}

function dedupeStrings(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function dedupeUsers(values: OrganizationUser[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    if (!value.id || seen.has(value.id)) {
      return false;
    }
    seen.add(value.id);
    return true;
  });
}

function getSharePointFileUrl(fileName: string) {
  return `https://sharepoint.vlworkhub.local/sites/hr/Shared%20Documents/${encodeURIComponent(fileName)}`;
}

async function ensureDocumentsSchema() {
  if (ensureDocumentsSchemaPromise) {
    return ensureDocumentsSchemaPromise;
  }

  ensureDocumentsSchemaPromise = (async () => {
    await pool.query(`ALTER TABLE documents ADD COLUMN IF NOT EXISTS file_name TEXT`);
    await pool.query(`ALTER TABLE documents ADD COLUMN IF NOT EXISTS file_url TEXT`);
    await pool.query(`ALTER TABLE documents ADD COLUMN IF NOT EXISTS category_other TEXT`);
    await pool.query(`ALTER TABLE documents ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES departments(id) ON DELETE SET NULL`);
    await pool.query(`ALTER TABLE documents ADD COLUMN IF NOT EXISTS description TEXT`);
    await pool.query(`ALTER TABLE documents ADD COLUMN IF NOT EXISTS sensitive BOOLEAN NOT NULL DEFAULT false`);
    await pool.query(`ALTER TABLE documents ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL`);

    const requiresSignatureType = await pool.query(
      `SELECT data_type
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'documents' AND column_name = 'requires_signature'
       LIMIT 1`
    );

    if (requiresSignatureType.rows[0]?.data_type && requiresSignatureType.rows[0].data_type !== "boolean") {
      await pool.query(
        `ALTER TABLE documents
         ALTER COLUMN requires_signature TYPE BOOLEAN
         USING CASE
           WHEN LOWER(COALESCE(requires_signature::text, '')) IN ('yes', 'true', '1', 'required') THEN true
           WHEN LOWER(COALESCE(requires_signature::text, '')) IN ('no', 'false', '0', 'not_required') THEN false
           ELSE true
         END`
      );
    }

    await pool.query(`ALTER TABLE documents ALTER COLUMN requires_signature SET DEFAULT true`);

    await pool.query(
      `CREATE TABLE IF NOT EXISTS document_assignments (
         id BIGSERIAL PRIMARY KEY,
         organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
         document_id BIGINT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
         user_id UUID REFERENCES users(id) ON DELETE CASCADE,
         department_id UUID REFERENCES departments(id) ON DELETE CASCADE,
         all_staff BOOLEAN NOT NULL DEFAULT false,
         created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
       )`
    );

    await pool.query(`ALTER TABLE document_assignments ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES departments(id) ON DELETE CASCADE`);
    await pool.query(`ALTER TABLE document_assignments ADD COLUMN IF NOT EXISTS all_staff BOOLEAN NOT NULL DEFAULT false`);
    await pool.query(`ALTER TABLE document_assignments ALTER COLUMN user_id DROP NOT NULL`);

    await pool.query(`ALTER TABLE document_signatures ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE`);
    await pool.query(
      `UPDATE document_signatures ds
       SET user_id = u.id
       FROM users u
       WHERE ds.user_id IS NULL
         AND ds.organization_id = u.organization_id
         AND TRIM(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')) = COALESCE(ds.signer_name, '')`
    );

    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_document_assignments_user_unique ON document_assignments(document_id, user_id) WHERE user_id IS NOT NULL`);
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_document_assignments_department_unique ON document_assignments(document_id, department_id) WHERE department_id IS NOT NULL`);
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_document_assignments_all_staff_unique ON document_assignments(document_id) WHERE all_staff = true`);
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_document_signatures_unique ON document_signatures(document_id, user_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_document_assignments_document ON document_assignments(document_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_document_assignments_user ON document_assignments(user_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_document_assignments_department ON document_assignments(department_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_document_signatures_document ON document_signatures(document_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_document_signatures_user ON document_signatures(user_id)`);
  })();

  return ensureDocumentsSchemaPromise;
}

async function listOrganizationUsers(organizationId: string) {
  const result = await pool.query(
    `SELECT
       u.id::text AS id,
       TRIM(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')) AS full_name,
       u.department_id::text AS department_id,
       d.name AS department_name
     FROM users u
     LEFT JOIN departments d ON d.id = u.department_id
     WHERE u.organization_id = $1 AND u.status = 'active'
     ORDER BY u.first_name ASC, u.last_name ASC, u.email ASC`,
    [organizationId]
  );

  return result.rows.map((row) => ({
    id: String(row.id),
    full_name: String(row.full_name || row.id),
    department_id: row.department_id ? String(row.department_id) : null,
    department_name: row.department_name ? String(row.department_name) : null
  })) as OrganizationUser[];
}

async function validateAssignments(organizationId: string, userIds: string[], departmentIds: string[]) {
  if (userIds.length) {
    const users = await pool.query(
      `SELECT id::text AS id FROM users WHERE organization_id = $1 AND status = 'active' AND id = ANY($2::uuid[])`,
      [organizationId, userIds]
    );
    if (users.rows.length !== userIds.length) {
      return { ok: false as const, message: "One or more selected users were not found" };
    }
  }

  if (departmentIds.length) {
    const departments = await pool.query(
      `SELECT id::text AS id FROM departments WHERE organization_id = $1 AND id = ANY($2::uuid[])`,
      [organizationId, departmentIds]
    );
    if (departments.rows.length !== departmentIds.length) {
      return { ok: false as const, message: "One or more selected departments were not found" };
    }
  }

  return { ok: true as const };
}

async function getDocumentRows(organizationId: string) {
  const result = await pool.query(
    `SELECT
       d.id,
       d.organization_id,
       COALESCE(d.file_name, d.title) AS file_name,
       d.title,
       d.file_url,
       d.category,
       d.category_other,
       d.department_id::text AS department_id,
       dep.name AS department_name,
       d.description,
       d.due_date,
       COALESCE(d.requires_signature, true) AS requires_signature,
       d.status,
       COALESCE(d.sensitive, false) AS sensitive,
       d.created_by::text AS created_by,
       d.created_at,
       COALESCE(array_remove(array_agg(DISTINCT da.user_id::text), NULL), ARRAY[]::text[]) AS direct_user_ids,
       COALESCE(array_remove(array_agg(DISTINCT TRIM(COALESCE(au.first_name, '') || ' ' || COALESCE(au.last_name, ''))), ''), ARRAY[]::text[]) AS direct_user_names,
       COALESCE(array_remove(array_agg(DISTINCT da.department_id::text), NULL), ARRAY[]::text[]) AS assigned_department_ids,
       COALESCE(array_remove(array_agg(DISTINCT ad.name), NULL), ARRAY[]::text[]) AS assigned_department_names,
       COALESCE(BOOL_OR(da.all_staff), false) AS all_staff,
       COALESCE(array_remove(array_agg(DISTINCT ds.user_id::text), NULL), ARRAY[]::text[]) AS signed_user_ids,
       COALESCE(array_remove(array_agg(DISTINCT TRIM(COALESCE(su.first_name, '') || ' ' || COALESCE(su.last_name, ''))), ''), ARRAY[]::text[]) AS signed_user_names
     FROM documents d
     LEFT JOIN departments dep ON dep.id = d.department_id
     LEFT JOIN document_assignments da ON da.document_id = d.id AND da.organization_id = d.organization_id
     LEFT JOIN users au ON au.id = da.user_id
     LEFT JOIN departments ad ON ad.id = da.department_id
     LEFT JOIN document_signatures ds ON ds.document_id = d.id AND ds.organization_id = d.organization_id
     LEFT JOIN users su ON su.id = ds.user_id
     WHERE d.organization_id = $1
     GROUP BY d.id, dep.name
     ORDER BY d.created_at DESC, d.id DESC`,
    [organizationId]
  );

  return result.rows as DocumentRecord[];
}

function resolveEffectiveAssignees(row: DocumentRecord, organizationUsers: OrganizationUser[]) {
  const directUserIds = Array.isArray(row.direct_user_ids) ? row.direct_user_ids.map((value) => String(value)) : [];
  const departmentIds = Array.isArray(row.assigned_department_ids) ? row.assigned_department_ids.map((value) => String(value)) : [];
  const departmentNames = Array.isArray(row.assigned_department_names) ? row.assigned_department_names.map((value) => String(value)) : [];
  const allStaff = Boolean(row.all_staff);

  const directUsers = organizationUsers.filter((user) => directUserIds.includes(user.id));
  const departmentUsers = organizationUsers.filter((user) => {
    if (!user.department_id && !user.department_name) {
      return false;
    }
    return departmentIds.includes(String(user.department_id || "")) || departmentNames.includes(String(user.department_name || ""));
  });
  const allStaffUsers = allStaff ? organizationUsers : [];
  const effectiveUsers = dedupeUsers([...directUsers, ...departmentUsers, ...allStaffUsers]);

  return {
    directUserIds,
    departmentIds,
    departmentNames,
    allStaff,
    effectiveUsers,
    effectiveUserIds: effectiveUsers.map((user) => user.id),
    effectiveUserNames: effectiveUsers.map((user) => user.full_name)
  };
}

function isDocumentCompleted(row: DocumentRecord, effectiveAssigneeIds: string[]) {
  const requiresSignature = Boolean(row.requires_signature);
  const signedUserIds = Array.isArray(row.signed_user_ids) ? row.signed_user_ids.map((value) => String(value)) : [];
  if (requiresSignature && effectiveAssigneeIds.length > 0) {
    return effectiveAssigneeIds.every((userId) => signedUserIds.includes(userId));
  }
  return asString(row.status).toLowerCase() === "signed";
}

function canViewDocument(row: DocumentRecord, context: Awaited<ReturnType<typeof getHrPermissionContext>>, organizationUsers: OrganizationUser[]) {
  const assignment = resolveEffectiveAssignees(row, organizationUsers);
  const sensitive = Boolean(row.sensitive);
  const directlyAssigned = assignment.directUserIds.includes(context.userId);

  if (sensitive) {
    return directlyAssigned;
  }

  if (context.role === "admin") {
    return assignment.effectiveUserIds.length > 0 || assignment.allStaff;
  }

  return assignment.effectiveUserIds.some((userId) => context.visibleUserIds.includes(userId));
}

function canCurrentUserSign(row: DocumentRecord, context: Awaited<ReturnType<typeof getHrPermissionContext>>, organizationUsers: OrganizationUser[]) {
  const assignment = resolveEffectiveAssignees(row, organizationUsers);
  const signedUserIds = Array.isArray(row.signed_user_ids) ? row.signed_user_ids.map((value) => String(value)) : [];
  if (Boolean(row.sensitive)) {
    return assignment.directUserIds.includes(context.userId) && !signedUserIds.includes(context.userId);
  }
  return assignment.effectiveUserIds.includes(context.userId) && !signedUserIds.includes(context.userId);
}

function canCurrentUserOpenSignaturePanel(row: DocumentRecord, context: Awaited<ReturnType<typeof getHrPermissionContext>>, organizationUsers: OrganizationUser[]) {
  const assignment = resolveEffectiveAssignees(row, organizationUsers);
  if (Boolean(row.sensitive)) {
    return assignment.directUserIds.includes(context.userId);
  }
  return assignment.effectiveUserIds.includes(context.userId);
}

function decorateDocument(row: DocumentRecord, context: Awaited<ReturnType<typeof getHrPermissionContext>>, organizationUsers: OrganizationUser[]) {
  const assignment = resolveEffectiveAssignees(row, organizationUsers);
  const signedUserIds = Array.isArray(row.signed_user_ids) ? row.signed_user_ids.map((value) => String(value)) : [];
  const completed = isDocumentCompleted(row, assignment.effectiveUserIds);
  const canSign = canCurrentUserSign(row, context, organizationUsers);
  const canViewActions = canCurrentUserOpenSignaturePanel(row, context, organizationUsers);

  return {
    ...row,
    assigned_user_ids: assignment.effectiveUserIds,
    assigned_user_names: assignment.effectiveUserNames,
    direct_user_ids: assignment.directUserIds,
    direct_user_names: Array.isArray(row.direct_user_names) ? row.direct_user_names.map((value) => String(value)).filter(Boolean) : [],
    assigned_department_ids: assignment.departmentIds,
    assigned_department_names: assignment.departmentNames,
    all_staff: assignment.allStaff,
    signed_user_ids: signedUserIds,
    signed_user_names: Array.isArray(row.signed_user_names) ? row.signed_user_names.map((value) => String(value)).filter(Boolean) : [],
    is_completed: completed,
    can_sign: canSign,
    can_complete: canViewActions && completed,
    can_view_actions: canViewActions
  };
}

async function replaceDocumentAssignments(organizationId: string, documentId: number, userIds: string[], departmentIds: string[], allStaff: boolean) {
  await pool.query(`DELETE FROM document_assignments WHERE organization_id = $1 AND document_id = $2`, [organizationId, documentId]);

  for (const userId of userIds) {
    await pool.query(
      `INSERT INTO document_assignments (organization_id, document_id, user_id, department_id, all_staff)
       VALUES ($1, $2, $3, NULL, false)
       ON CONFLICT DO NOTHING`,
      [organizationId, documentId, userId]
    );
  }

  for (const departmentId of departmentIds) {
    await pool.query(
      `INSERT INTO document_assignments (organization_id, document_id, user_id, department_id, all_staff)
       VALUES ($1, $2, NULL, $3, false)
       ON CONFLICT DO NOTHING`,
      [organizationId, documentId, departmentId]
    );
  }

  if (allStaff) {
    await pool.query(
      `INSERT INTO document_assignments (organization_id, document_id, user_id, department_id, all_staff)
       VALUES ($1, $2, NULL, NULL, true)
       ON CONFLICT DO NOTHING`,
      [organizationId, documentId]
    );
  }
}

async function getDocumentById(documentId: number, organizationId: string) {
  const rows = await getDocumentRows(organizationId);
  return rows.find((row) => Number(row.id) === documentId) || null;
}

export async function listHrDocuments(req: AuthenticatedRequest, res: Response) {
  try {
    await ensureDocumentsSchema();
    const organizationId = String(req.user?.organization_id || "");
    const context = await getHrPermissionContext(
      String(req.user?.user_id || ""),
      organizationId,
      String(req.user?.platform_role || req.user?.role || "USER"),
      String(req.user?.full_name || "")
    );
    const [rows, organizationUsers] = await Promise.all([getDocumentRows(organizationId), listOrganizationUsers(organizationId)]);
    const items = rows.filter((row) => canViewDocument(row, context, organizationUsers)).map((row) => decorateDocument(row, context, organizationUsers));
    return res.json({ items });
  } catch (error) {
    console.error("API error in GET /hr/documents", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

export async function createHrDocument(req: AuthenticatedRequest, res: Response) {
  try {
    await ensureDocumentsSchema();
    const organizationId = String(req.user?.organization_id || "");
    const context = await getHrPermissionContext(
      String(req.user?.user_id || ""),
      organizationId,
      String(req.user?.platform_role || req.user?.role || "USER"),
      String(req.user?.full_name || "")
    );

    if (context.role !== "admin") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const body = (req.body || {}) as CreateDocumentBody;
    const fileName = asString(body.fileName || body.title);
    const category = asString(body.category);
    const userIds = dedupeStrings(normalizeIds(body.userIds ?? body.assignedUserIds));
    const departmentIds = dedupeStrings(normalizeIds(body.departmentIds ?? body.assignedDepartmentIds));
    const allStaff = asBoolean(body.allStaff, false);

    if (!fileName) {
      return res.status(400).json({ message: "fileName is required" });
    }

    if (!userIds.length && !departmentIds.length && !allStaff) {
      return res.status(400).json({ message: "At least one assignment target is required" });
    }

    if (asBoolean(body.sensitive, false) && !userIds.length) {
      return res.status(400).json({ message: "Sensitive documents must be assigned directly to at least one user" });
    }

    const validation = await validateAssignments(organizationId, userIds, departmentIds);
    if (!validation.ok) {
      return res.status(400).json({ message: validation.message });
    }

    const categoryOther = category === "Other" ? asNullableString(body.categoryOther) : null;
    const fileUrl = asNullableString(body.fileUrl) || getSharePointFileUrl(fileName);
    const dueDate = asNullableString(body.dueDate);
    const description = asNullableString(body.description);
    const departmentId = asNullableString(body.departmentId);
    const requiresSignature = asBoolean(body.requiresSignature, true);
    const sensitive = asBoolean(body.sensitive, false);
    const status = asNullableString(body.status) || (requiresSignature ? "Pending Signature" : "In Progress");

    const created = await pool.query(
      `INSERT INTO documents (
         organization_id,
         title,
         file_name,
         file_url,
         category,
         category_other,
         department_id,
         description,
         due_date,
         requires_signature,
         status,
         sensitive,
         created_by
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING id`,
      [organizationId, fileName, fileName, fileUrl, category, categoryOther, departmentId, description, dueDate, requiresSignature, status, sensitive, context.userId]
    );

    const documentId = Number(created.rows[0].id);
    await replaceDocumentAssignments(organizationId, documentId, userIds, departmentIds, allStaff);

    return res.status(201).json({ id: documentId });
  } catch (error) {
    console.error("API error in POST /hr/documents", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

async function isUserAllowedForDocument(documentId: number, organizationId: string, userId: string, platformRole: string, fullName: string) {
  const [row, organizationUsers, context] = await Promise.all([
    getDocumentById(documentId, organizationId),
    listOrganizationUsers(organizationId),
    getHrPermissionContext(userId, organizationId, platformRole, fullName)
  ]);

  if (!row) {
    return { allowed: false as const, reason: "not_found", row: null, organizationUsers, context };
  }

  return {
    allowed: canCurrentUserOpenSignaturePanel(row, context, organizationUsers),
    reason: "ok",
    row,
    organizationUsers,
    context
  };
}

export async function signHrDocument(req: AuthenticatedRequest, res: Response) {
  try {
    await ensureDocumentsSchema();
    const organizationId = String(req.user?.organization_id || "");
    const userId = String(req.user?.user_id || "");
    const documentId = Number(req.params.id || 0);

    const access = await isUserAllowedForDocument(
      documentId,
      organizationId,
      userId,
      String(req.user?.platform_role || req.user?.role || "USER"),
      String(req.user?.full_name || "")
    );

    if (!access.row) {
      return res.status(404).json({ message: "Document not found" });
    }

    if (!access.allowed || !canCurrentUserSign(access.row, access.context, access.organizationUsers)) {
      return res.status(403).json({ message: "Only assigned users can sign this document" });
    }

    await pool.query(
      `INSERT INTO document_signatures (organization_id, document_id, user_id, signer_name, status, signed_at, note)
       SELECT $1, $2, $3, TRIM(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')), 'Signed', NOW(), 'Signed in VLWorkHub'
       FROM users u
       WHERE u.id = $3
       ON CONFLICT (document_id, user_id)
       DO UPDATE SET status = 'Signed', signed_at = EXCLUDED.signed_at, signer_name = EXCLUDED.signer_name`,
      [organizationId, documentId, userId]
    );

    const refreshed = await getDocumentById(documentId, organizationId);
    const completed = refreshed ? isDocumentCompleted(refreshed, resolveEffectiveAssignees(refreshed, access.organizationUsers).effectiveUserIds) : false;

    await pool.query(
      `UPDATE documents
       SET status = $3
       WHERE id = $1 AND organization_id = $2`,
      [documentId, organizationId, completed ? "Signed" : "In Progress"]
    );

    return res.json({ success: true });
  } catch (error) {
    console.error("API error in POST /hr/documents/:id/sign", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

export async function completeHrDocument(req: AuthenticatedRequest, res: Response) {
  try {
    await ensureDocumentsSchema();
    const organizationId = String(req.user?.organization_id || "");
    const userId = String(req.user?.user_id || "");
    const documentId = Number(req.params.id || 0);

    const access = await isUserAllowedForDocument(
      documentId,
      organizationId,
      userId,
      String(req.user?.platform_role || req.user?.role || "USER"),
      String(req.user?.full_name || "")
    );

    if (!access.row) {
      return res.status(404).json({ message: "Document not found" });
    }

    if (!access.allowed) {
      return res.status(403).json({ message: "Only assigned users can complete this document" });
    }

    const effectiveAssigneeIds = resolveEffectiveAssignees(access.row, access.organizationUsers).effectiveUserIds;
    const completed = isDocumentCompleted(access.row, effectiveAssigneeIds);

    if (!completed) {
      return res.status(400).json({ message: "All assigned users must sign before completion" });
    }

    await pool.query(
      `UPDATE documents
       SET status = 'Signed'
       WHERE id = $1 AND organization_id = $2`,
      [documentId, organizationId]
    );

    return res.json({ success: true });
  } catch (error) {
    console.error("API error in POST /hr/documents/:id/complete", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

