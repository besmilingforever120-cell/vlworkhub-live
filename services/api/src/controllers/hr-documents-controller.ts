import type { Response } from "express";
import fs from "node:fs/promises";
import path from "node:path";
import { pool } from "../config/db";
import type { AuthenticatedRequest } from "../middleware/auth";
import { getHrPermissionContext, listVisibleHrEmployees, type VisibleHrEmployee } from "../lib/hr-permissions";
import { sendAssignmentNotifications } from "../services/assignment-email-service";

type DocumentRecord = Record<string, string | number | boolean | string[] | null>;

type CreateDocumentBody = {
  initials?: string | null;
  signatureData?: string | null;
  title?: string;
  fileName?: string;
  fileUrl?: string | null;
  fileData?: string | null;
  category?: string;
  categoryOther?: string | null;
  departmentId?: string | null;
  description?: string | null;
  dueDate?: string | null;
  requiresSignature?: boolean;
  status?: string | null;
  sensitive?: boolean;
  allowDownload?: boolean;
  userIds?: string[];
  assignedUserIds?: string[];
  departmentIds?: string[];
  assignedDepartmentIds?: string[];
  allStaff?: boolean;
  signatureId?: string | null;
  signedAt?: string | null;
  signedBy?: string | null;
  assignedBy?: string | null;
  signedFileUrl?: string | null;
  files?: Array<{
    fileName?: string | null;
    fileData?: string | null;
    documentType?: string | null;
    expiryDate?: string | null;
  }>;
  fileId?: string;
  userId?: string;
  documentType?: string | null;
  expiryDate?: string | null;
};

type OrganizationUser = {
  id: string;
  full_name: string;
  department_id: string | null;
  department_name: string | null;
};

let ensureDocumentsSchemaPromise: Promise<void> | null = null;
let ensureOnboardingUploadsSchemaPromise: Promise<void> | null = null;
const EXPIRY_TASK_WINDOW_DAYS = 30;
const EXPIRY_SWEEP_INTERVAL_MS = Number(process.env.HR_ONBOARDING_EXPIRY_SWEEP_INTERVAL_MS || 6 * 60 * 60 * 1000);
const EXPIRY_SWEEP_ENABLED = String(process.env.HR_ONBOARDING_EXPIRY_SWEEP_ENABLED || "true").toLowerCase() !== "false";
let onboardingExpirySweepTimer: NodeJS.Timeout | null = null;
let onboardingExpirySweepInProgress = false;

const ALLOWED_UPLOAD_MIME_TYPES: Record<string, string[]> = {
  "application/pdf": [".pdf"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/jpg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "text/plain": [".txt"]
};

const ALLOWED_UPLOAD_MIME_LIST = Object.keys(ALLOWED_UPLOAD_MIME_TYPES).join(", ");

class UploadValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UploadValidationError";
  }
}

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

function normalizeDepartmentKey(value: string | null | undefined) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function getSharePointFileUrl(fileName: string) {
  return `https://sharepoint.vlworkhub.local/sites/hr/Shared%20Documents/${encodeURIComponent(fileName)}`;
}

function getUploadsRoot() {
  return path.resolve(__dirname, "../../uploads");
}

function getSignedUploadsRoot() {
  return path.join(getUploadsRoot(), "signed");
}

function getOriginalUploadsRoot() {
  return path.join(getUploadsRoot(), "original");
}

function getOnboardingUploadsRoot() {
  return path.join(getUploadsRoot(), "onboarding");
}

function getApiBaseUrl() {
  return String(process.env.API_BASE_URL || "")
    .trim()
    .replace(/\/+$/, "");
}

function getLocalUploadsBaseUrl() {
  const apiBaseUrl = getApiBaseUrl();
  if (!apiBaseUrl) {
    return "/uploads";
  }
  return `${apiBaseUrl}/uploads`;
}

function safeUnlinkLocalUpload(fileUrl: string | null | undefined): void {
  const raw = String(fileUrl || "").trim();
  if (!raw) return;

  let pathname: string;
  try {
    pathname = new URL(raw).pathname;
  } catch {
    pathname = raw;
  }

  const marker = "/uploads/";
  const idx = pathname.indexOf(marker);
  if (idx < 0) {
    console.warn("[safeUnlinkLocalUpload] Not an uploads path, skipping:", raw);
    return;
  }

  const rel = pathname.slice(idx + marker.length);
  const uploadsRoot = getUploadsRoot();
  const absPath = path.resolve(uploadsRoot, rel);

  if (!absPath.startsWith(uploadsRoot + path.sep)) {
    console.warn("[safeUnlinkLocalUpload] Path traversal detected, skipping:", absPath);
    return;
  }

  fs.unlink(absPath).catch((err: unknown) => {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      console.warn("[safeUnlinkLocalUpload] Could not delete file:", absPath, err);
    }
  });
}

function normalizeFileUrlForApi(fileUrl: string | null | undefined) {
  const normalized = String(fileUrl || "").trim();
  if (!normalized) {
    return "";
  }

  const apiBaseUrl = getApiBaseUrl();
  let next = normalized;

  const coerceToPublicUploadsUrl = (value: string) => {
    const trimmed = String(value || "").trim();
    if (!trimmed) return trimmed;

    const fromUploadsPath = (pathname: string) => {
      const marker = "/uploads/";
      const markerIndex = pathname.indexOf(marker);
      if (markerIndex < 0) return null;
      const suffix = pathname.slice(markerIndex + marker.length).replace(/^\/+/, "");
      if (!suffix) return null;
      return apiBaseUrl ? `${apiBaseUrl}/uploads/${suffix}` : `/uploads/${suffix}`;
    };

    try {
      const parsed = new URL(trimmed);
      return fromUploadsPath(parsed.pathname) || trimmed;
    } catch {
      return fromUploadsPath(trimmed) || trimmed;
    }
  };

  if (apiBaseUrl && /^https?:\/\/(localhost|127\.0\.0\.1):8080/i.test(next)) {
    next = next.replace(/^https?:\/\/(localhost|127\.0\.0\.1):8080/i, apiBaseUrl);
  }

  if (apiBaseUrl && /^https?:\/\/(192\.168\.1\.(47|50))(?::8080)?/i.test(next)) {
    next = next.replace(/^https?:\/\/(192\.168\.1\.(47|50))(?::8080)?/i, apiBaseUrl);
  }

  // Migrate any legacy absolute uploads URL (old host/IP/protocol) to the canonical public API base.
  next = coerceToPublicUploadsUrl(next);

  if (next.startsWith("/uploads/")) {
    return apiBaseUrl ? `${apiBaseUrl}${next}` : next;
  }

  if (next.startsWith("uploads/")) {
    return apiBaseUrl ? `${apiBaseUrl}/${next}` : `/${next}`;
  }

  return next;
}

function extractUploadsRelativePath(fileUrl: string | null | undefined) {
  const normalized = normalizeFileUrlForApi(fileUrl);
  if (!normalized) {
    return null;
  }

  const fromPathname = (pathname: string) => {
    if (!pathname.startsWith("/uploads/")) {
      return null;
    }

    const raw = pathname.slice("/uploads/".length);
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  };

  try {
    const parsed = new URL(normalized);
    return fromPathname(parsed.pathname);
  } catch {
    return fromPathname(normalized);
  }
}

function resolveSafeUploadsPath(relativePath: string) {
  const normalized = String(relativePath || "").trim();
  if (!normalized || normalized.includes("\0")) {
    return null;
  }

  const uploadsRoot = path.resolve(getUploadsRoot());
  const resolvedPath = path.resolve(uploadsRoot, normalized);
  const relativeToRoot = path.relative(uploadsRoot, resolvedPath);

  if (!relativeToRoot || relativeToRoot.startsWith("..") || path.isAbsolute(relativeToRoot)) {
    return null;
  }

  return resolvedPath;
}

function sanitizePathSegment(value: string) {
  const normalized = String(value || "")
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return normalized || "user";
}

function getUserFolderName(userId: string, userName: string) {
  const safeName = sanitizePathSegment(userName || userId);
  const safeId = sanitizePathSegment(userId);
  return `${safeName}-${safeId}`;
}

function parseDataUrl(dataUrl: string) {
  const match = /^data:([^;]+);base64,(.+)$/i.exec(String(dataUrl || ""));
  if (!match) {
    return null;
  }

  return {
    mimeType: String(match[1] || "").toLowerCase(),
    buffer: Buffer.from(match[2], "base64")
  };
}

function getNormalizedFileExtension(fileName: string) {
  const normalized = String(fileName || "").trim().toLowerCase();
  if (!normalized.includes(".")) {
    return "";
  }

  return normalized.slice(normalized.lastIndexOf("."));
}

function assertAllowedUploadMimeType(fileName: string, mimeType: string) {
  const normalizedMime = String(mimeType || "").trim().toLowerCase();
  const allowedExtensions = ALLOWED_UPLOAD_MIME_TYPES[normalizedMime];
  if (!allowedExtensions) {
    throw new UploadValidationError(
      `Unsupported file type (${normalizedMime || "unknown"}). Allowed MIME types: ${ALLOWED_UPLOAD_MIME_LIST}`
    );
  }

  const extension = getNormalizedFileExtension(fileName);
  if (!extension) {
    throw new UploadValidationError(
      `File extension is required. Allowed extensions for ${normalizedMime}: ${allowedExtensions.join(", ")}`
    );
  }

  if (!allowedExtensions.includes(extension)) {
    throw new UploadValidationError(
      `File extension ${extension} does not match MIME type ${normalizedMime}. Allowed extensions: ${allowedExtensions.join(", ")}`
    );
  }
}

function assertSignedPdfMimeType(mimeType: string) {
  const normalizedMime = String(mimeType || "").trim().toLowerCase();
  if (normalizedMime !== "application/pdf") {
    throw new UploadValidationError(
      `Signed document payload must be application/pdf. Received: ${normalizedMime || "unknown"}`
    );
  }
}

function assertAllowedUploadPayload(fileName: string, fileData: string, invalidPayloadMessage: string) {
  const parsed = parseDataUrl(fileData);
  if (!parsed) {
    throw new UploadValidationError(invalidPayloadMessage);
  }

  assertAllowedUploadMimeType(fileName, parsed.mimeType);
}

function getFileExtension(fileName: string, mimeType: string) {
  const normalized = String(fileName || "").trim();
  const fromName = normalized.includes(".") ? normalized.slice(normalized.lastIndexOf(".")).toLowerCase() : "";
  if (fromName) return fromName;
  if (mimeType === "application/pdf") return ".pdf";
  return ".bin";
}

function parseDateOnly(value: string | null | undefined) {
  const normalized = asString(value);
  if (!normalized) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(normalized);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const day = Number(match[3]);
  if (!Number.isInteger(year) || !Number.isInteger(monthIndex) || !Number.isInteger(day)) {
    return null;
  }

  const parsed = new Date(Date.UTC(year, monthIndex, day));
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}

function getTodayUtcDateOnly() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function getDayDiff(fromDate: Date, toDate: Date) {
  const dayMs = 24 * 60 * 60 * 1000;
  return Math.floor((toDate.getTime() - fromDate.getTime()) / dayMs);
}

function formatUsDate(date: Date) {
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const year = String(date.getUTCFullYear());
  return `${month}/${day}/${year}`;
}

function shouldCreateExpiryTask(expiryDateValue: string | null | undefined) {
  const expiryDate = parseDateOnly(expiryDateValue);
  if (!expiryDate) {
    return false;
  }

  const dayDiff = getDayDiff(getTodayUtcDateOnly(), expiryDate);
  return dayDiff >= 0 && dayDiff <= EXPIRY_TASK_WINDOW_DAYS;
}

function toDateOnlyIso(date: Date) {
  const year = String(date.getUTCFullYear());
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getDocumentTypeKey(value: string) {
  return asString(value).toLowerCase() || "other";
}

async function listTableColumns(db: { query: (text: string, values?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }> }, tableName: string) {
  const result = await db.query(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_name = $1
       AND table_schema IN ('hr', 'care', 'ursafe', 'public')`,
    [tableName]
  );

  return new Set(result.rows.map((row) => String(row.column_name || "").toLowerCase()).filter(Boolean));
}

async function insertTaskAssignmentForUser(params: {
  db: { query: (text: string, values?: unknown[]) => Promise<unknown> };
  organizationId: string;
  taskId: number;
  userId: string;
  userName: string;
}) {
  const columns = await listTableColumns(params.db as { query: (text: string, values?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }> }, "task_assignments");
  const fieldNames: string[] = [];
  const values: Array<string | number | null> = [];

  if (columns.has("organization_id")) {
    fieldNames.push("organization_id");
    values.push(params.organizationId);
  }

  if (columns.has("task_id")) {
    fieldNames.push("task_id");
    values.push(params.taskId);
  }

  if (columns.has("assignment_type")) {
    fieldNames.push("assignment_type");
    values.push("user");
  }

  if (columns.has("assigned_user_id")) {
    fieldNames.push("assigned_user_id");
    values.push(params.userId);
  }

  if (columns.has("assigned_user_name")) {
    fieldNames.push("assigned_user_name");
    values.push(params.userName);
  }

  if (columns.has("assigned_department_name")) {
    fieldNames.push("assigned_department_name");
    values.push(null);
  }

  if (columns.has("user_id")) {
    fieldNames.push("user_id");
    values.push(params.userId);
  }

  if (columns.has("department")) {
    fieldNames.push("department");
    values.push("");
  }

  if (columns.has("assigned_at")) {
    fieldNames.push("assigned_at");
    values.push(new Date().toISOString());
  }

  if (!fieldNames.includes("task_id")) {
    throw new Error("task_assignments schema is missing task_id");
  }

  const placeholders = fieldNames.map((_, index) => `$${index + 1}`).join(", ");
  await params.db.query(`INSERT INTO task_assignments (${fieldNames.join(", ")}) VALUES (${placeholders})`, values);
}

async function createOnboardingExpiryTask(params: {
  organizationId: string;
  userId: string;
  userName: string;
  documentType: string;
  originalFileName: string;
  storedFileName: string;
  fileUrl: string;
  expiryDate: string;
  uploadedAt: string;
}) {
  // Defensive guard: only create expiry tasks when a valid expiry date exists
  // and it falls within the configured window from today.
  if (!shouldCreateExpiryTask(params.expiryDate)) {
    return;
  }

  const parsedExpiryDate = parseDateOnly(params.expiryDate);
  if (!parsedExpiryDate) {
    return;
  }

  const formattedExpiry = formatUsDate(parsedExpiryDate);
  const expiryDateIso = toDateOnlyIso(parsedExpiryDate);
  const titleBase = asString(params.documentType) || asString(params.originalFileName) || "Document";
  const taskTitle = `${titleBase} is expiring on ${formattedExpiry}`;
  const documentTypeKey = getDocumentTypeKey(params.documentType);

  const description = [
    "This onboarding document is expiring soon and must be renewed.",
    `Document type: ${params.documentType}`,
    `Original file name: ${params.originalFileName}`,
    `Stored file name: ${params.storedFileName}`,
    `File link: ${params.fileUrl}`,
    `Uploaded at: ${params.uploadedAt}`,
    `Expiry date: ${formattedExpiry}`,
    "Action: Retake this document/certification and upload the updated file before expiry."
  ].join("\n");

  let createdTaskId: number | null = null;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const existingDedup = await client.query(
      `SELECT id::text AS id, task_id::text AS task_id
       FROM hr_onboarding_expiry_tasks
       WHERE organization_id = $1
         AND user_id = $2
         AND document_type_key = $3
         AND expiry_date = $4
       FOR UPDATE`,
      [params.organizationId, params.userId, documentTypeKey, expiryDateIso]
    );

    if (existingDedup.rowCount && existingDedup.rows[0]?.task_id) {
      const existingTaskId = Number(existingDedup.rows[0].task_id);
      if (existingTaskId) {
        const existingTask = await client.query(
          `SELECT id
           FROM tasks
           WHERE id = $1 AND organization_id = $2
           LIMIT 1`,
          [existingTaskId, params.organizationId]
        );

        if ((existingTask.rowCount ?? 0) > 0) {
          await client.query("COMMIT");
          return;
        }

        // Stale task reference: clear it so a new task can be created below.
        await client.query(
          `UPDATE hr_onboarding_expiry_tasks
           SET task_id = NULL
           WHERE id = $1`,
          [existingDedup.rows[0].id]
        );
      }
    }

    let dedupRowId = String(existingDedup.rows[0]?.id || "");
    if (!dedupRowId) {
      const insertedDedup = await client.query(
        `INSERT INTO hr_onboarding_expiry_tasks (
           organization_id,
           user_id,
           document_type_key,
           expiry_date
         )
         VALUES ($1, $2, $3, $4)
         RETURNING id::text AS id`,
        [params.organizationId, params.userId, documentTypeKey, expiryDateIso]
      );
      dedupRowId = String(insertedDedup.rows[0]?.id || "");
    }

    if (!dedupRowId) {
      await client.query("ROLLBACK");
      return;
    }

    const taskInsert = await client.query(
      `INSERT INTO tasks (organization_id, title, assigned_to, due_date, status, priority, description)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [
        params.organizationId,
        taskTitle,
        params.userName,
        expiryDateIso,
        "Not Started",
        "High",
        description
      ]
    );

    const taskId = Number(taskInsert.rows[0]?.id || 0);
    if (!taskId) {
      await client.query("ROLLBACK");
      return;
    }
    createdTaskId = taskId;

    await insertTaskAssignmentForUser({
      db: client,
      organizationId: params.organizationId,
      taskId,
      userId: params.userId,
      userName: params.userName
    });

    await client.query(
      `UPDATE hr_onboarding_expiry_tasks
       SET task_id = $1
       WHERE id = $2`,
      [taskId, dedupRowId]
    );

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  if (createdTaskId) {
    void sendAssignmentNotifications({
      organizationId: params.organizationId,
      type: "task",
      title: taskTitle,
      dueDate: expiryDateIso,
      assignedBy: "Onboarding Expiry Automation",
      userId: params.userId
    });
  }
}

async function createUpcomingOnboardingExpiryTasks(params: {
  organizationId: string;
  userId: string;
  userName: string;
  items: Array<{
    document_type?: string;
    original_file_name?: string;
    file_name?: string;
    file_url?: string;
    expiry_date?: string | null;
    uploaded_at?: string;
  }>;
}) {
  for (const item of params.items) {
    const expiryDate = asNullableString(item.expiry_date);
    if (!shouldCreateExpiryTask(expiryDate)) {
      continue;
    }

    try {
      await createOnboardingExpiryTask({
        organizationId: params.organizationId,
        userId: params.userId,
        userName: params.userName,
        documentType: asString(item.document_type) || "Other",
        originalFileName: asString(item.original_file_name) || asString(item.file_name) || "Uploaded file",
        storedFileName: asString(item.file_name) || asString(item.original_file_name) || "file",
        fileUrl: asString(item.file_url),
        expiryDate: String(expiryDate),
        uploadedAt: asString(item.uploaded_at) || new Date().toISOString()
      });
    } catch (taskError) {
      console.warn("Failed to create onboarding expiry task", {
        organizationId: params.organizationId,
        userId: params.userId,
        documentType: item.document_type,
        originalFileName: item.original_file_name,
        error: taskError
      });
    }
  }
}

type UpcomingOnboardingExpiryRow = {
  organization_id: string;
  user_id: string;
  user_name: string;
  document_type: string;
  original_file_name: string;
  file_name: string;
  file_url: string;
  expiry_date: string;
  uploaded_at: string;
};

async function listUpcomingOnboardingExpiryRows() {
  await ensureOnboardingUploadsSchema();
  const result = await pool.query(
    `SELECT
       h.organization_id::text AS organization_id,
       h.user_id::text AS user_id,
       TRIM(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')) AS user_name,
       h.document_type,
       h.original_file_name,
       h.stored_file_name AS file_name,
       h.file_url,
       h.expiry_date::text AS expiry_date,
       h.uploaded_at::text AS uploaded_at
     FROM hr_onboarding_uploads h
     LEFT JOIN users u ON u.id = h.user_id
     WHERE h.expiry_date IS NOT NULL
       AND h.expiry_date >= CURRENT_DATE
       AND h.expiry_date <= (CURRENT_DATE + ($1::int * INTERVAL '1 day'))
     ORDER BY h.expiry_date ASC, h.uploaded_at DESC`,
    [EXPIRY_TASK_WINDOW_DAYS]
  );

  return result.rows.map((row) => ({
    ...row,
    file_url: normalizeFileUrlForApi(String(row.file_url || ""))
  })) as UpcomingOnboardingExpiryRow[];
}

export async function runOnboardingExpiryTaskSweep() {
  if (onboardingExpirySweepInProgress) {
    return;
  }

  onboardingExpirySweepInProgress = true;
  try {
    const rows = await listUpcomingOnboardingExpiryRows();
    for (const row of rows) {
      if (!shouldCreateExpiryTask(row.expiry_date)) {
        continue;
      }

      try {
        await createOnboardingExpiryTask({
          organizationId: String(row.organization_id),
          userId: String(row.user_id),
          userName: asString(row.user_name) || String(row.user_id),
          documentType: String(row.document_type || "Other"),
          originalFileName: String(row.original_file_name || row.file_name || "Uploaded file"),
          storedFileName: String(row.file_name || row.original_file_name || "file"),
          fileUrl: normalizeFileUrlForApi(String(row.file_url || "")),
          expiryDate: String(row.expiry_date || ""),
          uploadedAt: String(row.uploaded_at || new Date().toISOString())
        });
      } catch (taskError) {
        console.warn("Failed to create onboarding expiry task during sweep", {
          organizationId: row.organization_id,
          userId: row.user_id,
          documentType: row.document_type,
          originalFileName: row.original_file_name,
          error: taskError
        });
      }
    }
  } catch (error) {
    console.error("Onboarding expiry task sweep failed", error);
  } finally {
    onboardingExpirySweepInProgress = false;
  }
}

export function startOnboardingExpiryTaskScheduler() {
  if (!EXPIRY_SWEEP_ENABLED) {
    console.log("Onboarding expiry task scheduler disabled via HR_ONBOARDING_EXPIRY_SWEEP_ENABLED=false");
    return;
  }

  if (onboardingExpirySweepTimer) {
    return;
  }

  if (!Number.isFinite(EXPIRY_SWEEP_INTERVAL_MS) || EXPIRY_SWEEP_INTERVAL_MS <= 0) {
    console.warn("Invalid HR_ONBOARDING_EXPIRY_SWEEP_INTERVAL_MS value. Scheduler not started.");
    return;
  }

  void runOnboardingExpiryTaskSweep();
  onboardingExpirySweepTimer = setInterval(() => {
    void runOnboardingExpiryTaskSweep();
  }, EXPIRY_SWEEP_INTERVAL_MS);

  onboardingExpirySweepTimer.unref?.();
  console.log(`Onboarding expiry task scheduler started (interval: ${EXPIRY_SWEEP_INTERVAL_MS}ms)`);
}

async function saveOriginalFileLocally(documentId: number, fileName: string, fileData: string | null) {
  if (!fileData) {
    return null;
  }

  const parsed = parseDataUrl(fileData);
  if (!parsed) {
    throw new UploadValidationError("Invalid fileData payload. Expected base64 data URL.");
  }

  assertAllowedUploadMimeType(fileName, parsed.mimeType);

  const uploadsRoot = getOriginalUploadsRoot();
  await fs.mkdir(uploadsRoot, { recursive: true });

  const timestamp = Date.now();
  const extension = getFileExtension(fileName, parsed.mimeType);
  const storedFileName = `original-${documentId}-${timestamp}${extension}`;
  const filePath = path.join(uploadsRoot, storedFileName);
  await fs.writeFile(filePath, parsed.buffer);

  return `${getLocalUploadsBaseUrl()}/original/${storedFileName}`;
}

async function saveSignedPdfLocally(documentId: number, userId: string, userName: string, signedFileUrl: string | null) {
  if (!signedFileUrl) {
    return null;
  }

  const parsed = parseDataUrl(signedFileUrl);
  if (!parsed) {
    throw new UploadValidationError("Invalid signedFileUrl payload. Expected base64 data URL.");
  }

  assertSignedPdfMimeType(parsed.mimeType);

  const folderName = sanitizePathSegment(userName || userId);
  const uploadsRoot = path.join(getSignedUploadsRoot(), folderName);
  await fs.mkdir(uploadsRoot, { recursive: true });

  const timestamp = Date.now();
  const fileName = `signed-${documentId}-${sanitizePathSegment(userId)}-${timestamp}.pdf`;
  const filePath = path.join(uploadsRoot, fileName);
  await fs.writeFile(filePath, parsed.buffer);

  return `${getLocalUploadsBaseUrl()}/signed/${encodeURIComponent(folderName)}/${fileName}`;
}

async function ensureOnboardingUserFolder(userId: string, userName: string) {
  const folderName = getUserFolderName(userId, userName);
  const folderPath = path.join(getOnboardingUploadsRoot(), folderName);
  await fs.mkdir(folderPath, { recursive: true });
  return { folderName, folderPath };
}

async function saveOnboardingFileLocally(userId: string, userName: string, fileName: string, fileData: string | null, documentType: string, expiryDate?: string | null) {
  if (!fileData) {
    return null;
  }

  const parsed = parseDataUrl(fileData);
  if (!parsed) {
    throw new UploadValidationError("Invalid onboarding fileData payload. Expected base64 data URL.");
  }

  assertAllowedUploadMimeType(fileName, parsed.mimeType);

  const { folderName, folderPath } = await ensureOnboardingUserFolder(userId, userName);
  const timestamp = Date.now();
  const extension = getFileExtension(fileName, parsed.mimeType);
  const safeDocumentType = sanitizePathSegment(documentType);
  const storedFileName = `${safeDocumentType}_${timestamp}${extension}`;
  const filePath = path.join(folderPath, storedFileName);
  await fs.writeFile(filePath, parsed.buffer);

  const metadataPath = path.join(folderPath, `${storedFileName}.json`);
  const metadata = {
    documentType,
    originalFileName: fileName,
    uploadedAt: new Date().toISOString(),
    expiryDate: asNullableString(expiryDate),
    fileUrl: `${getLocalUploadsBaseUrl()}/onboarding/${encodeURIComponent(folderName)}/${storedFileName}`
  };
  await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2), "utf8");

  return {
    id: `${userId}/${storedFileName}`,
    user_id: userId,
    user_name: userName,
    file_name: storedFileName,
    original_file_name: fileName,
    document_type: documentType,
    uploaded_at: metadata.uploadedAt,
    expiry_date: metadata.expiryDate,
    file_url: metadata.fileUrl
  };
}

async function listOnboardingFilesForUser(userId: string, userName: string) {
  const { folderPath } = await ensureOnboardingUserFolder(userId, userName);
  const entries = await fs.readdir(folderPath, { withFileTypes: true });
  const items: Array<{
    id: string;
    user_id: string;
    user_name: string;
    file_name: string;
    original_file_name: string;
    document_type: string;
    uploaded_at: string;
    expiry_date: string | null;
    file_url: string;
  }> = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    try {
      const metadataRaw = await fs.readFile(path.join(folderPath, entry.name), "utf8");
      const metadata = JSON.parse(metadataRaw) as {
        documentType?: string;
        originalFileName?: string;
        uploadedAt?: string;
        expiryDate?: string | null;
        fileUrl?: string;
      };
      const fileName = entry.name.slice(0, -5);
      items.push({
        id: `${userId}/${fileName}`,
        user_id: userId,
        user_name: userName,
        file_name: fileName,
        original_file_name: String(metadata.originalFileName || fileName),
        document_type: String(metadata.documentType || "Other"),
        uploaded_at: String(metadata.uploadedAt || ""),
        expiry_date: metadata.expiryDate ? String(metadata.expiryDate) : null,
        file_url: String(metadata.fileUrl || "")
      });
    } catch {
      continue;
    }
  }

  return items.sort((left, right) => String(right.uploaded_at).localeCompare(String(left.uploaded_at)));
}

async function ensureOnboardingUploadsSchema() {
  if (ensureOnboardingUploadsSchemaPromise) {
    return ensureOnboardingUploadsSchemaPromise;
  }

  ensureOnboardingUploadsSchemaPromise = (async () => {
    await pool.query(
      `CREATE TABLE IF NOT EXISTS hr_onboarding_uploads (
         id BIGSERIAL PRIMARY KEY,
         organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
         user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
         stored_file_name TEXT NOT NULL,
         original_file_name TEXT NOT NULL,
         document_type TEXT NOT NULL,
         file_url TEXT NOT NULL,
         expiry_date DATE NULL,
         uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
       )`
    );
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_hr_onboarding_uploads_user ON hr_onboarding_uploads(user_id, uploaded_at DESC)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_hr_onboarding_uploads_org ON hr_onboarding_uploads(organization_id, user_id)`);

    await pool.query(
      `CREATE TABLE IF NOT EXISTS hr_onboarding_expiry_tasks (
         id BIGSERIAL PRIMARY KEY,
         organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
         user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
         document_type_key TEXT NOT NULL,
         expiry_date DATE NOT NULL,
         task_id BIGINT REFERENCES tasks(id) ON DELETE SET NULL,
         created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
       )`
    );
    await pool.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_hr_onboarding_expiry_tasks_dedupe
       ON hr_onboarding_expiry_tasks(organization_id, user_id, document_type_key, expiry_date)`
    );
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_hr_onboarding_expiry_tasks_task
       ON hr_onboarding_expiry_tasks(task_id)`
    );
  })();

  return ensureOnboardingUploadsSchemaPromise;
}

function isAdminPlatformUser(req: AuthenticatedRequest) {
  const platformRole = String(req.user?.platform_role || req.user?.role || "USER").toUpperCase();
  return platformRole === "SUPER_ADMIN" || platformRole === "ADMIN" || platformRole === "IT_ADMIN";
}

async function insertOnboardingUploadRecord(params: {
  organizationId: string;
  userId: string;
  storedFileName: string;
  originalFileName: string;
  documentType: string;
  fileUrl: string;
  expiryDate?: string | null;
}) {
  const result = await pool.query(
    `INSERT INTO hr_onboarding_uploads (
       organization_id,
       user_id,
       stored_file_name,
       original_file_name,
       document_type,
       file_url,
       expiry_date
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id::text AS id, uploaded_at::text AS uploaded_at, expiry_date::text AS expiry_date`,
    [
      params.organizationId,
      params.userId,
      params.storedFileName,
      params.originalFileName,
      params.documentType,
      params.fileUrl,
      asNullableString(params.expiryDate)
    ]
  );

  return result.rows[0];
}

async function listOnboardingFilesForUserFromDb(organizationId: string, userId: string, userName: string, userEmail?: string | null) {
  await ensureOnboardingUploadsSchema();
  const result = await pool.query(
    `SELECT
       id::text AS id,
       user_id::text AS user_id,
       stored_file_name AS file_name,
       original_file_name,
       document_type,
       file_url,
       expiry_date::text AS expiry_date,
       uploaded_at::text AS uploaded_at
     FROM hr_onboarding_uploads
     WHERE organization_id = $1 AND user_id = $2
     ORDER BY uploaded_at DESC, id DESC`,
    [organizationId, userId]
  );

  if (result.rows.length) {
    return result.rows.map((row) => ({
      id: String(row.id),
      user_id: userId,
      user_name: userName,
      user_email: userEmail || "",
      file_name: String(row.file_name),
      original_file_name: String(row.original_file_name),
      document_type: String(row.document_type),
      uploaded_at: String(row.uploaded_at),
      expiry_date: row.expiry_date ? String(row.expiry_date) : null,
      file_url: normalizeFileUrlForApi(String(row.file_url || ""))
    }));
  }

  const legacyItems = await listOnboardingFilesForUser(userId, userName);
  return legacyItems.map((item) => ({
    ...item,
    user_email: userEmail || ""
  }));
}

function resolveStoredFileUrl(fileName: string, incomingFileUrl: string | null) {
  if (incomingFileUrl) {
    return incomingFileUrl;
  }

  const sharePointConfigured = Boolean(process.env.SHAREPOINT_BASE_URL || process.env.SHAREPOINT_SITE_URL);
  if (sharePointConfigured) {
    return getSharePointFileUrl(fileName);
  }

  return null;
}

function parseOnboardingFileId(fileId: string) {
  const normalized = asString(fileId);
  if (!normalized) {
    return null;
  }

  if (/^\d+$/.test(normalized)) {
    return { kind: "db" as const, dbId: Number(normalized) };
  }

  const separator = normalized.indexOf("/");
  if (separator <= 0 || separator >= normalized.length - 1) {
    return null;
  }

  return {
    kind: "legacy" as const,
    userId: normalized.slice(0, separator),
    fileName: normalized.slice(separator + 1)
  };
}

function parseOnboardingLocalFilePath(fileUrl: string | null | undefined) {
  const raw = asString(fileUrl);
  if (!raw) {
    return null;
  }

  let pathname = "";
  try {
    pathname = new URL(raw).pathname;
  } catch {
    pathname = raw;
  }

  const marker = "/uploads/onboarding/";
  const markerIndex = pathname.indexOf(marker);
  if (markerIndex < 0) {
    return null;
  }

  const relativeRaw = pathname.slice(markerIndex + marker.length);
  const parts = relativeRaw.split("/").filter(Boolean).map((part) => decodeURIComponent(part));
  if (parts.length < 2) {
    return null;
  }

  const folderName = parts[0];
  const fileName = parts.slice(1).join("/");
  const folderPath = path.join(getOnboardingUploadsRoot(), folderName);
  const filePath = path.join(folderPath, fileName);
  const metadataPath = path.join(folderPath, `${fileName}.json`);

  return { folderName, fileName, folderPath, filePath, metadataPath };
}

async function readLegacyOnboardingMetadata(fileUrl: string) {
  const localPath = parseOnboardingLocalFilePath(fileUrl);
  if (!localPath) {
    return null;
  }

  try {
    const metadataRaw = await fs.readFile(localPath.metadataPath, "utf8");
    return {
      localPath,
      metadata: JSON.parse(metadataRaw) as {
        documentType?: string;
        originalFileName?: string;
        uploadedAt?: string;
        expiryDate?: string | null;
        fileUrl?: string;
      }
    };
  } catch {
    return null;
  }
}

async function writeLegacyOnboardingMetadata(fileUrl: string, nextMetadata: {
  documentType: string;
  originalFileName: string;
  uploadedAt: string;
  expiryDate: string | null;
  fileUrl: string;
}) {
  const localPath = parseOnboardingLocalFilePath(fileUrl);
  if (!localPath) {
    return;
  }

  await fs.writeFile(localPath.metadataPath, JSON.stringify(nextMetadata, null, 2), "utf8");
}

async function deleteOnboardingLocalArtifacts(fileUrl: string) {
  const localPath = parseOnboardingLocalFilePath(fileUrl);
  if (!localPath) {
    return;
  }

  await Promise.allSettled([
    fs.unlink(localPath.filePath),
    fs.unlink(localPath.metadataPath)
  ]);
}

function hasOwnProperty(value: object, key: string) {
  return Object.prototype.hasOwnProperty.call(value, key);
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
    await pool.query(`ALTER TABLE documents ADD COLUMN IF NOT EXISTS allow_download BOOLEAN NOT NULL DEFAULT false`);
    await pool.query(`ALTER TABLE documents ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL`);

    const requiresSignatureType = await pool.query(
      `SELECT data_type
       FROM information_schema.columns
       WHERE table_name = 'documents' AND column_name = 'requires_signature'
         AND table_schema IN ('hr', 'care', 'ursafe', 'public')
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
       COALESCE(d.allow_download, false) AS allow_download,
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
    GROUP BY d.id, d.organization_id, d.file_name, d.title, d.file_url, d.category, d.category_other, d.department_id, dep.name, d.description, d.due_date, d.requires_signature, d.status, d.sensitive, d.allow_download, d.created_by, d.created_at
     ORDER BY d.created_at DESC, d.id DESC`,
    [organizationId]
  );

  return result.rows.map((row) => ({
    ...row,
    file_url: normalizeFileUrlForApi(String(row.file_url || ""))
  })) as DocumentRecord[];
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

function getUnsignedEffectiveAssigneeIds(row: DocumentRecord, effectiveAssigneeIds: string[]) {
  const signedUserIds = new Set(Array.isArray(row.signed_user_ids) ? row.signed_user_ids.map((value) => String(value)) : []);
  return effectiveAssigneeIds.filter((userId) => !signedUserIds.has(userId));
}

function canViewDocument(row: DocumentRecord, context: Awaited<ReturnType<typeof getHrPermissionContext>>, organizationUsers: OrganizationUser[]) {
  const assignment = resolveEffectiveAssignees(row, organizationUsers);

  if (context.role === "admin") {
    return true;
  }

  if (context.role === "manager") {
    if (assignment.effectiveUserIds.includes(context.userId)) {
      return true;
    }

    // Visible if any assigned user is one of the manager's direct reports
    if (assignment.effectiveUserIds.some((id) => context.visibleUserIds.includes(id))) {
      return true;
    }

    const visibleDepartmentNameKeys = new Set((context.visibleDepartmentNames || []).map((name) => normalizeDepartmentKey(name)));
    return assignment.departmentNames.some((departmentName) => {
      const key = normalizeDepartmentKey(departmentName);
      return Boolean(key) && visibleDepartmentNameKeys.has(key);
    });
  }

  return assignment.effectiveUserIds.includes(context.userId);
}

function canCurrentUserSign(row: DocumentRecord, context: Awaited<ReturnType<typeof getHrPermissionContext>>, organizationUsers: OrganizationUser[]) {
  const assignment = resolveEffectiveAssignees(row, organizationUsers);
  const signedUserIds = Array.isArray(row.signed_user_ids) ? row.signed_user_ids.map((value) => String(value)) : [];
  
  if (Boolean(row.sensitive)) {
    return assignment.effectiveUserIds.includes(context.userId) && !signedUserIds.includes(context.userId);
  }
  return assignment.effectiveUserIds.includes(context.userId) && !signedUserIds.includes(context.userId);
}

function canCurrentUserOpenSignaturePanel(row: DocumentRecord, context: Awaited<ReturnType<typeof getHrPermissionContext>>, organizationUsers: OrganizationUser[]) {
  const assignment = resolveEffectiveAssignees(row, organizationUsers);
  if (context.role === "admin") {
    return true;
  }
  if (context.role === "manager") {
    if (assignment.effectiveUserIds.includes(context.userId)) {
      return true;
    }

    if (Boolean(row.sensitive)) {
      return false;
    }

    return assignment.effectiveUserIds.some((userId) => context.visibleUserIds.includes(userId));
  }
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
    const platformRole = String(req.user?.platform_role || req.user?.role || "USER").toUpperCase();
    const context = await getHrPermissionContext(
      String(req.user?.user_id || ""),
      organizationId,
      platformRole,
      String(req.user?.full_name || "")
    );
    const [rows, organizationUsers] = await Promise.all([getDocumentRows(organizationId), listOrganizationUsers(organizationId)]);
    const items = rows.filter((row) => canViewDocument(row, context, organizationUsers)).map((row) => decorateDocument(row, context, organizationUsers));
    console.log("[HR Documents Visibility]", {
      userId: context.userId,
      platformRole,
      hrRole: context.role,
      totalDocuments: rows.length,
      returnedDocuments: items.length
    });
    return res.json({ items });
  } catch (error) {
    console.error("API error in GET /hr/documents", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

export async function listHrOnboardingFiles(req: AuthenticatedRequest, res: Response) {
  try {
    await ensureOnboardingUploadsSchema();
    const organizationId = String(req.user?.organization_id || "");
    const userId = String(req.user?.user_id || "");
    const userName = String(req.user?.full_name || userId);
    const userEmail = String(req.user?.email || "");
    const items = await listOnboardingFilesForUserFromDb(organizationId, userId, userName, userEmail);

    await createUpcomingOnboardingExpiryTasks({
      organizationId,
      userId,
      userName,
      items
    });

    return res.json({ items });
  } catch (error) {
    console.error("API error in GET /hr/onboarding/files", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

export async function listAdminHrOnboardingFiles(req: AuthenticatedRequest, res: Response) {
  try {
    if (!isAdminPlatformUser(req)) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const organizationId = String(req.user?.organization_id || "");
    const requestedUserId = asString(req.query.userId);
    if (!requestedUserId) {
      return res.status(400).json({ message: "userId is required" });
    }

    const userResult = await pool.query(
      `SELECT
         u.id::text AS id,
         TRIM(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')) AS full_name,
         u.email
       FROM users u
       WHERE u.organization_id = $1 AND u.id = $2
       LIMIT 1`,
      [organizationId, requestedUserId]
    );

    const selectedUser = userResult.rows[0];
    if (!selectedUser) {
      return res.status(404).json({ message: "User not found" });
    }

    const items = await listOnboardingFilesForUserFromDb(
      organizationId,
      String(selectedUser.id),
      String(selectedUser.full_name || selectedUser.id),
      String(selectedUser.email || "")
    );
    return res.json({ items });
  } catch (error) {
    console.error("API error in GET /hr/onboarding/files/admin", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

export async function uploadHrOnboardingFiles(req: AuthenticatedRequest, res: Response) {
  try {
    await ensureOnboardingUploadsSchema();
    const organizationId = String(req.user?.organization_id || "");
    const userId = String(req.user?.user_id || "");
    const userName = String(req.user?.full_name || userId);
    const userEmail = String(req.user?.email || "");
    const body = (req.body || {}) as CreateDocumentBody;
    const files = Array.isArray(body.files) ? body.files : [];

    if (!files.length) {
      return res.status(400).json({ message: "At least one file is required" });
    }

    const uploaded = [];
    for (const file of files) {
      const fileName = asString(file.fileName);
      const fileData = asNullableString(file.fileData);
      const documentType = asString(file.documentType) || "Other";
      const expiryDate = asNullableString(file.expiryDate);
      if (!fileName || !fileData) {
        return res.status(400).json({ message: "Each upload requires fileName and fileData" });
      }

      const saved = await saveOnboardingFileLocally(userId, userName, fileName, fileData, documentType, expiryDate);
      if (saved) {
        const inserted = await insertOnboardingUploadRecord({
          organizationId,
          userId,
          storedFileName: saved.file_name,
          originalFileName: saved.original_file_name,
          documentType: saved.document_type,
          fileUrl: saved.file_url,
          expiryDate
        });

        uploaded.push({
          ...saved,
          id: String(inserted.id),
          user_email: userEmail,
          uploaded_at: String(inserted.uploaded_at || saved.uploaded_at),
          expiry_date: inserted.expiry_date ? String(inserted.expiry_date) : saved.expiry_date || null
        });

      }
    }

    await createUpcomingOnboardingExpiryTasks({
      organizationId,
      userId,
      userName,
      items: uploaded
    });

    return res.status(201).json({ items: uploaded });
  } catch (error) {
    if (error instanceof UploadValidationError) {
      return res.status(400).json({ message: error.message });
    }

    console.error("API error in POST /hr/onboarding/files", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

export async function updateHrOnboardingFile(req: AuthenticatedRequest, res: Response) {
  try {
    await ensureOnboardingUploadsSchema();
    const organizationId = String(req.user?.organization_id || "");
    const userId = String(req.user?.user_id || "");
    const userName = String(req.user?.full_name || userId);
    const userEmail = String(req.user?.email || "");
    const body = (req.body || {}) as CreateDocumentBody;
    const fileId = asString(body.fileId);
    const parsedFileId = parseOnboardingFileId(fileId);

    if (!parsedFileId) {
      return res.status(400).json({ message: "fileId is required" });
    }

    const hasDocumentType = hasOwnProperty(body, "documentType");
    const hasExpiryDate = hasOwnProperty(body, "expiryDate");
    if (!hasDocumentType && !hasExpiryDate) {
      return res.status(400).json({ message: "documentType or expiryDate is required" });
    }

    if (parsedFileId.kind === "db") {
      const existingResult = await pool.query(
        `SELECT
           id::text AS id,
           user_id::text AS user_id,
           stored_file_name AS file_name,
           original_file_name,
           document_type,
           file_url,
           expiry_date::text AS expiry_date,
           uploaded_at::text AS uploaded_at
         FROM hr_onboarding_uploads
         WHERE organization_id = $1 AND user_id = $2 AND id = $3
         LIMIT 1`,
        [organizationId, userId, parsedFileId.dbId]
      );

      const existing = existingResult.rows[0];
      if (!existing) {
        return res.status(404).json({ message: "Onboarding file not found" });
      }

      const nextDocumentType = hasDocumentType ? (asString(body.documentType) || "Other") : String(existing.document_type || "Other");
      const nextExpiryDate = hasExpiryDate ? asNullableString(body.expiryDate) : (existing.expiry_date ? String(existing.expiry_date) : null);

      await pool.query(
        `UPDATE hr_onboarding_uploads
         SET document_type = $1,
             expiry_date = $2
         WHERE organization_id = $3 AND user_id = $4 AND id = $5`,
        [nextDocumentType, nextExpiryDate, organizationId, userId, parsedFileId.dbId]
      );

      const legacyMetadata = await readLegacyOnboardingMetadata(String(existing.file_url || ""));
      if (legacyMetadata) {
        await writeLegacyOnboardingMetadata(String(existing.file_url || ""), {
          documentType: nextDocumentType,
          originalFileName: String(existing.original_file_name || existing.file_name || "Uploaded file"),
          uploadedAt: String(existing.uploaded_at || new Date().toISOString()),
          expiryDate: nextExpiryDate,
          fileUrl: String(existing.file_url || "")
        });
      }

      const item = {
        id: String(existing.id),
        user_id: userId,
        user_name: userName,
        user_email: userEmail,
        file_name: String(existing.file_name),
        original_file_name: String(existing.original_file_name),
        document_type: nextDocumentType,
        uploaded_at: String(existing.uploaded_at),
        expiry_date: nextExpiryDate,
        file_url: String(existing.file_url)
      };

      await createUpcomingOnboardingExpiryTasks({
        organizationId,
        userId,
        userName,
        items: [item]
      });

      return res.json({ item });
    }

    if (parsedFileId.userId !== userId) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const legacyItems = await listOnboardingFilesForUser(userId, userName);
    const existingLegacy = legacyItems.find((item) => item.id === fileId);
    if (!existingLegacy) {
      return res.status(404).json({ message: "Onboarding file not found" });
    }

    const nextLegacyDocumentType = hasDocumentType ? (asString(body.documentType) || "Other") : String(existingLegacy.document_type || "Other");
    const nextLegacyExpiryDate = hasExpiryDate ? asNullableString(body.expiryDate) : (existingLegacy.expiry_date ? String(existingLegacy.expiry_date) : null);

    await writeLegacyOnboardingMetadata(String(existingLegacy.file_url || ""), {
      documentType: nextLegacyDocumentType,
      originalFileName: String(existingLegacy.original_file_name || existingLegacy.file_name || "Uploaded file"),
      uploadedAt: String(existingLegacy.uploaded_at || new Date().toISOString()),
      expiryDate: nextLegacyExpiryDate,
      fileUrl: String(existingLegacy.file_url || "")
    });

    const item = {
      ...existingLegacy,
      document_type: nextLegacyDocumentType,
      expiry_date: nextLegacyExpiryDate,
      user_email: userEmail
    };

    return res.json({ item });
  } catch (error) {
    console.error("API error in PUT /hr/onboarding/files/item", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

export async function deleteHrOnboardingFile(req: AuthenticatedRequest, res: Response) {
  try {
    await ensureOnboardingUploadsSchema();
    const organizationId = String(req.user?.organization_id || "");
    const userId = String(req.user?.user_id || "");
    const userName = String(req.user?.full_name || userId);
    const fileId = asString(req.query.fileId);
    const parsedFileId = parseOnboardingFileId(fileId);

    if (!parsedFileId) {
      return res.status(400).json({ message: "fileId is required" });
    }

    if (parsedFileId.kind === "db") {
      const existingResult = await pool.query(
        `SELECT id::text AS id, file_url
         FROM hr_onboarding_uploads
         WHERE organization_id = $1 AND user_id = $2 AND id = $3
         LIMIT 1`,
        [organizationId, userId, parsedFileId.dbId]
      );

      const existing = existingResult.rows[0];
      if (!existing) {
        return res.status(404).json({ message: "Onboarding file not found" });
      }

      await pool.query(
        `DELETE FROM hr_onboarding_uploads
         WHERE organization_id = $1 AND user_id = $2 AND id = $3`,
        [organizationId, userId, parsedFileId.dbId]
      );

      await deleteOnboardingLocalArtifacts(String(existing.file_url || ""));
      return res.json({ success: true });
    }

    if (parsedFileId.userId !== userId) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const legacyItems = await listOnboardingFilesForUser(userId, userName);
    const existingLegacy = legacyItems.find((item) => item.id === fileId);
    if (!existingLegacy) {
      return res.status(404).json({ message: "Onboarding file not found" });
    }

    await deleteOnboardingLocalArtifacts(String(existingLegacy.file_url || ""));
    return res.json({ success: true });
  } catch (error) {
    console.error("API error in DELETE /hr/onboarding/files/item", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

export async function updateAdminHrOnboardingFile(req: AuthenticatedRequest, res: Response) {
  try {
    if (!isAdminPlatformUser(req)) {
      return res.status(403).json({ message: "Forbidden" });
    }

    await ensureOnboardingUploadsSchema();
    const organizationId = String(req.user?.organization_id || "");
    const body = (req.body || {}) as CreateDocumentBody;
    const targetUserId = asString(body.userId);
    const fileId = asString(body.fileId);
    const parsedFileId = parseOnboardingFileId(fileId);

    if (!targetUserId) {
      return res.status(400).json({ message: "userId is required" });
    }

    if (!parsedFileId) {
      return res.status(400).json({ message: "fileId is required" });
    }

    const userResult = await pool.query(
      `SELECT
         u.id::text AS id,
         TRIM(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')) AS full_name,
         u.email
       FROM users u
       WHERE u.organization_id = $1 AND u.id = $2
       LIMIT 1`,
      [organizationId, targetUserId]
    );

    const selectedUser = userResult.rows[0];
    if (!selectedUser) {
      return res.status(404).json({ message: "User not found" });
    }

    const targetUserName = asString(selectedUser.full_name) || String(selectedUser.id);
    const targetUserEmail = asString(selectedUser.email);

    const hasDocumentType = hasOwnProperty(body, "documentType");
    const hasExpiryDate = hasOwnProperty(body, "expiryDate");
    if (!hasDocumentType && !hasExpiryDate) {
      return res.status(400).json({ message: "documentType or expiryDate is required" });
    }

    if (parsedFileId.kind === "db") {
      const existingResult = await pool.query(
        `SELECT
           id::text AS id,
           user_id::text AS user_id,
           stored_file_name AS file_name,
           original_file_name,
           document_type,
           file_url,
           expiry_date::text AS expiry_date,
           uploaded_at::text AS uploaded_at
         FROM hr_onboarding_uploads
         WHERE organization_id = $1 AND user_id = $2 AND id = $3
         LIMIT 1`,
        [organizationId, targetUserId, parsedFileId.dbId]
      );

      const existing = existingResult.rows[0];
      if (!existing) {
        return res.status(404).json({ message: "Onboarding file not found" });
      }

      const nextDocumentType = hasDocumentType ? (asString(body.documentType) || "Other") : String(existing.document_type || "Other");
      const nextExpiryDate = hasExpiryDate ? asNullableString(body.expiryDate) : (existing.expiry_date ? String(existing.expiry_date) : null);

      await pool.query(
        `UPDATE hr_onboarding_uploads
         SET document_type = $1,
             expiry_date = $2
         WHERE organization_id = $3 AND user_id = $4 AND id = $5`,
        [nextDocumentType, nextExpiryDate, organizationId, targetUserId, parsedFileId.dbId]
      );

      const legacyMetadata = await readLegacyOnboardingMetadata(String(existing.file_url || ""));
      if (legacyMetadata) {
        await writeLegacyOnboardingMetadata(String(existing.file_url || ""), {
          documentType: nextDocumentType,
          originalFileName: String(existing.original_file_name || existing.file_name || "Uploaded file"),
          uploadedAt: String(existing.uploaded_at || new Date().toISOString()),
          expiryDate: nextExpiryDate,
          fileUrl: String(existing.file_url || "")
        });
      }

      const item = {
        id: String(existing.id),
        user_id: targetUserId,
        user_name: targetUserName,
        user_email: targetUserEmail,
        file_name: String(existing.file_name),
        original_file_name: String(existing.original_file_name),
        document_type: nextDocumentType,
        uploaded_at: String(existing.uploaded_at),
        expiry_date: nextExpiryDate,
        file_url: String(existing.file_url)
      };

      await createUpcomingOnboardingExpiryTasks({
        organizationId,
        userId: targetUserId,
        userName: targetUserName,
        items: [item]
      });

      return res.json({ item });
    }

    if (parsedFileId.userId !== targetUserId) {
      return res.status(400).json({ message: "fileId does not match userId" });
    }

    const legacyItems = await listOnboardingFilesForUser(targetUserId, targetUserName);
    const existingLegacy = legacyItems.find((item) => item.id === fileId);
    if (!existingLegacy) {
      return res.status(404).json({ message: "Onboarding file not found" });
    }

    const nextLegacyDocumentType = hasDocumentType ? (asString(body.documentType) || "Other") : String(existingLegacy.document_type || "Other");
    const nextLegacyExpiryDate = hasExpiryDate ? asNullableString(body.expiryDate) : (existingLegacy.expiry_date ? String(existingLegacy.expiry_date) : null);

    await writeLegacyOnboardingMetadata(String(existingLegacy.file_url || ""), {
      documentType: nextLegacyDocumentType,
      originalFileName: String(existingLegacy.original_file_name || existingLegacy.file_name || "Uploaded file"),
      uploadedAt: String(existingLegacy.uploaded_at || new Date().toISOString()),
      expiryDate: nextLegacyExpiryDate,
      fileUrl: String(existingLegacy.file_url || "")
    });

    const item = {
      ...existingLegacy,
      document_type: nextLegacyDocumentType,
      expiry_date: nextLegacyExpiryDate,
      user_email: targetUserEmail
    };

    return res.json({ item });
  } catch (error) {
    console.error("API error in PUT /hr/onboarding/files/admin/item", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

export async function deleteAdminHrOnboardingFile(req: AuthenticatedRequest, res: Response) {
  try {
    if (!isAdminPlatformUser(req)) {
      return res.status(403).json({ message: "Forbidden" });
    }

    await ensureOnboardingUploadsSchema();
    const organizationId = String(req.user?.organization_id || "");
    const targetUserId = asString(req.query.userId);
    const fileId = asString(req.query.fileId);
    const parsedFileId = parseOnboardingFileId(fileId);

    if (!targetUserId) {
      return res.status(400).json({ message: "userId is required" });
    }

    if (!parsedFileId) {
      return res.status(400).json({ message: "fileId is required" });
    }

    const userResult = await pool.query(
      `SELECT
         u.id::text AS id,
         TRIM(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')) AS full_name
       FROM users u
       WHERE u.organization_id = $1 AND u.id = $2
       LIMIT 1`,
      [organizationId, targetUserId]
    );

    const selectedUser = userResult.rows[0];
    if (!selectedUser) {
      return res.status(404).json({ message: "User not found" });
    }

    const targetUserName = asString(selectedUser.full_name) || String(selectedUser.id);

    if (parsedFileId.kind === "db") {
      const existingResult = await pool.query(
        `SELECT id::text AS id, file_url
         FROM hr_onboarding_uploads
         WHERE organization_id = $1 AND user_id = $2 AND id = $3
         LIMIT 1`,
        [organizationId, targetUserId, parsedFileId.dbId]
      );

      const existing = existingResult.rows[0];
      if (!existing) {
        return res.status(404).json({ message: "Onboarding file not found" });
      }

      await pool.query(
        `DELETE FROM hr_onboarding_uploads
         WHERE organization_id = $1 AND user_id = $2 AND id = $3`,
        [organizationId, targetUserId, parsedFileId.dbId]
      );

      await deleteOnboardingLocalArtifacts(String(existing.file_url || ""));
      return res.json({ success: true });
    }

    if (parsedFileId.userId !== targetUserId) {
      return res.status(400).json({ message: "fileId does not match userId" });
    }

    const legacyItems = await listOnboardingFilesForUser(targetUserId, targetUserName);
    const existingLegacy = legacyItems.find((item) => item.id === fileId);
    if (!existingLegacy) {
      return res.status(404).json({ message: "Onboarding file not found" });
    }

    await deleteOnboardingLocalArtifacts(String(existingLegacy.file_url || ""));
    return res.json({ success: true });
  } catch (error) {
    console.error("API error in DELETE /hr/onboarding/files/admin/item", error);
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
    const requestedFileUrl = resolveStoredFileUrl(fileName, asNullableString(body.fileUrl));
    const fileData = asNullableString(body.fileData);
    const dueDate = asNullableString(body.dueDate);
    const description = asNullableString(body.description);
    const departmentId = asNullableString(body.departmentId);
    const requiresSignature = asBoolean(body.requiresSignature, true);
    const sensitive = asBoolean(body.sensitive, false);
    const allowDownload = asBoolean(body.allowDownload, false);
    const status = asNullableString(body.status) || (requiresSignature ? "Pending Signature" : "In Progress");

    // Validate upload payload before creating DB rows to avoid partial persistence on rejection.
    if (fileData) {
      assertAllowedUploadPayload(fileName, fileData, "Invalid fileData payload. Expected base64 data URL.");
    }

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
         allow_download,
         created_by
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING id`,
      [organizationId, fileName, fileName, requestedFileUrl, category, categoryOther, departmentId, description, dueDate, requiresSignature, status, sensitive, allowDownload, context.userId]
    );

    const documentId = Number(created.rows[0].id);
  const localOriginalFileUrl = await saveOriginalFileLocally(documentId, fileName, fileData);
    const finalFileUrl = localOriginalFileUrl || requestedFileUrl;
    if (!finalFileUrl) {
      await pool.query(`DELETE FROM documents WHERE organization_id = $1 AND id = $2`, [organizationId, documentId]);
      return res.status(400).json({ message: "fileData is required when SharePoint is not configured" });
    }

    await pool.query(`UPDATE documents SET file_url = $3 WHERE organization_id = $1 AND id = $2`, [organizationId, documentId, finalFileUrl]);
    await replaceDocumentAssignments(organizationId, documentId, userIds, departmentIds, allStaff);

    // Send assignment notifications (best-effort, non-blocking)
    void sendAssignmentNotifications({
      organizationId,
      type: "document",
      title: fileName,
      userIds,
      departmentIds,
      allStaff,
      dueDate,
      assignedBy: context.fullName,
    });

    return res.status(201).json({ id: documentId });
  } catch (error) {
    if (error instanceof UploadValidationError) {
      return res.status(400).json({ message: error.message });
    }

    console.error("API error in POST /hr/documents", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

async function updateDocumentRecord(documentId: number, organizationId: string, body: CreateDocumentBody) {
  const fileName = asString(body.fileName || body.title);
  const category = asString(body.category);
  const userIds = dedupeStrings(normalizeIds(body.userIds ?? body.assignedUserIds));
  const departmentIds = dedupeStrings(normalizeIds(body.departmentIds ?? body.assignedDepartmentIds));
  const allStaff = asBoolean(body.allStaff, false);

  if (!fileName) {
    return { ok: false as const, message: "fileName is required" };
  }

  if (!userIds.length && !departmentIds.length && !allStaff) {
    return { ok: false as const, message: "At least one assignment target is required" };
  }

  if (asBoolean(body.sensitive, false) && !userIds.length) {
    return { ok: false as const, message: "Sensitive documents must be assigned directly to at least one user" };
  }

  const validation = await validateAssignments(organizationId, userIds, departmentIds);
  if (!validation.ok) {
    return { ok: false as const, message: validation.message };
  }

  const categoryOther = category === "Other" ? asNullableString(body.categoryOther) : null;
  const requestedFileUrl = resolveStoredFileUrl(fileName, asNullableString(body.fileUrl));
  const dueDate = asNullableString(body.dueDate);
  const description = asNullableString(body.description);
  const departmentId = asNullableString(body.departmentId);
  const requiresSignature = asBoolean(body.requiresSignature, true);
  const sensitive = asBoolean(body.sensitive, false);
  const allowDownload = asBoolean(body.allowDownload, false);
  const status = asNullableString(body.status) || (requiresSignature ? "Pending Signature" : "In Progress");

  const localOriginalFileUrl = await saveOriginalFileLocally(documentId, fileName, asNullableString(body.fileData));
  const fileUrl = localOriginalFileUrl || requestedFileUrl;

  await pool.query(
    `UPDATE documents
     SET title = $3,
         file_name = $4,
         file_url = COALESCE($5, file_url),
         category = $6,
         category_other = $7,
         department_id = $8,
         description = $9,
         due_date = $10,
         requires_signature = $11,
         status = $12,
         sensitive = $13,
         allow_download = $14
     WHERE id = $1 AND organization_id = $2`,
    [documentId, organizationId, fileName, fileName, fileUrl, category, categoryOther, departmentId, description, dueDate, requiresSignature, status, sensitive, allowDownload]
  );

  await replaceDocumentAssignments(organizationId, documentId, userIds, departmentIds, allStaff);
  return { ok: true as const };
}

export async function updateHrDocument(req: AuthenticatedRequest, res: Response) {
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

    const documentId = Number(req.params.id || 0);
    const existing = await getDocumentById(documentId, organizationId);
    if (!existing) {
      return res.status(404).json({ message: "Document not found" });
    }

    const result = await updateDocumentRecord(documentId, organizationId, (req.body || {}) as CreateDocumentBody);
    if (!result.ok) {
      return res.status(400).json({ message: result.message });
    }

    return res.json({ success: true });
  } catch (error) {
    if (error instanceof UploadValidationError) {
      return res.status(400).json({ message: error.message });
    }

    console.error("API error in PUT /hr/documents/:id", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

export async function archiveHrDocument(req: AuthenticatedRequest, res: Response) {
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

    const documentId = Number(req.params.id || 0);
    const existing = await getDocumentById(documentId, organizationId);
    if (!existing) {
      return res.status(404).json({ message: "Document not found" });
    }

    await pool.query(`UPDATE documents SET status = 'Archived' WHERE id = $1 AND organization_id = $2`, [documentId, organizationId]);
    return res.json({ success: true });
  } catch (error) {
    console.error("API error in POST /hr/documents/:id/archive", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

export async function deleteHrDocument(req: AuthenticatedRequest, res: Response) {
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

    const documentId = Number(req.params.id || 0);

    const [docResult, sigResult] = await Promise.all([
      pool.query<{ file_url: string | null }>(
        `SELECT file_url FROM documents WHERE organization_id = $1 AND id = $2 LIMIT 1`,
        [organizationId, documentId]
      ),
      pool.query<{ note: string | null }>(
        `SELECT note FROM document_signatures WHERE organization_id = $1 AND document_id = $2`,
        [organizationId, documentId]
      )
    ]);

    const originalFileUrl = docResult.rows[0]?.file_url ?? null;
    const signedFileUrls = sigResult.rows.map((row) => {
      try {
        const note = row.note ? JSON.parse(row.note) : {};
        return typeof note.fileUrl === "string" ? note.fileUrl : null;
      } catch {
        return null;
      }
    }).filter((u): u is string => u !== null);

    await pool.query(`DELETE FROM document_assignments WHERE organization_id = $1 AND document_id = $2`, [organizationId, documentId]);
    await pool.query(`DELETE FROM document_signatures WHERE organization_id = $1 AND document_id = $2`, [organizationId, documentId]);
    await pool.query(`DELETE FROM documents WHERE organization_id = $1 AND id = $2`, [organizationId, documentId]);

    safeUnlinkLocalUpload(originalFileUrl);
    for (const url of signedFileUrls) {
      safeUnlinkLocalUpload(url);
    }

    return res.json({ success: true });
  } catch (error) {
    console.error("API error in DELETE /hr/documents/:id", error);
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
    const body = (req.body || {}) as CreateDocumentBody;

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

    const localSignedFileUrl = await saveSignedPdfLocally(documentId, userId, String(req.user?.full_name || userId), asNullableString(body.signedFileUrl));

    const signatureNote = JSON.stringify({
      signatureData: asNullableString(body.signatureData),
      signatureId: asNullableString(body.signatureId),
      signedAt: asNullableString(body.signedAt),
      signedBy: asNullableString(body.signedBy),
      assignedBy: asNullableString(body.assignedBy),
      fileUrl: localSignedFileUrl
    });

    await pool.query(
      `INSERT INTO document_signatures (organization_id, document_id, user_id, signer_name, status, signed_at, note)
       SELECT $1, $2, $3, TRIM(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')), 'Signed', NOW(), $4
       FROM users u
       WHERE u.id = $3
       ON CONFLICT (document_id, user_id)
       DO UPDATE SET status = 'Signed', signed_at = EXCLUDED.signed_at, signer_name = EXCLUDED.signer_name, note = EXCLUDED.note`,
      [organizationId, documentId, userId, signatureNote]
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
    if (error instanceof UploadValidationError) {
      return res.status(400).json({ message: error.message });
    }

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











export async function listHrSignedDocumentFiles(req: AuthenticatedRequest, res: Response) {
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

    const result = await pool.query(
      `SELECT
         ds.id,
         ds.document_id,
         ds.user_id::text AS user_id,
         COALESCE(NULLIF(TRIM(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')), ''), ds.signer_name, 'Unknown User') AS signer_name,
         COALESCE(u.email, '') AS signer_email,
         COALESCE(d.file_name, d.title, 'Signed Document') AS document_name,
         COALESCE(d.status, 'Unknown') AS document_status,
         ds.signed_at,
         ds.note
       FROM document_signatures ds
       LEFT JOIN users u ON u.id = ds.user_id
       LEFT JOIN documents d ON d.id = ds.document_id AND d.organization_id = ds.organization_id
       WHERE ds.organization_id = $1
       ORDER BY signer_name ASC, ds.signed_at DESC, ds.id DESC`,
      [organizationId]
    );

    const items = result.rows.map((row) => {
      let noteData: Record<string, unknown> = {};
      try {
        noteData = row.note ? JSON.parse(String(row.note)) : {};
      } catch {
        noteData = {};
      }

      const signedFileUrl = typeof noteData.fileUrl === "string" ? noteData.fileUrl : null;
      const signatureId = typeof noteData.signatureId === "string" ? noteData.signatureId : null;

      return {
        id: Number(row.id),
        document_id: Number(row.document_id),
        user_id: row.user_id ? String(row.user_id) : null,
        signer_name: String(row.signer_name || "Unknown User"),
        signer_email: String(row.signer_email || ""),
        document_name: String(row.document_name || "Signed Document"),
        document_status: String(row.document_status || "Unknown"),
        signed_at: row.signed_at,
        signature_id: signatureId,
        signed_file_url: signedFileUrl ? normalizeFileUrlForApi(signedFileUrl) : null,
        archived: String(row.document_status || "").trim().toLowerCase() === "archived"
      };
    });

    return res.json({ items });
  } catch (error) {
    console.error("API error in GET /hr/documents/signed-files", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}


export async function downloadHrDocument(req: AuthenticatedRequest, res: Response) {
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
      return res.status(403).json({ message: "Forbidden" });
    }

    if (!Boolean(access.row.allow_download)) {
      return res.status(403).json({ message: "Download is not allowed for this document" });
    }

    const fileUrl = asNullableString(access.row.file_url);
    if (!fileUrl) {
      return res.status(404).json({ message: "Document file not found" });
    }

    const normalizedFileUrl = normalizeFileUrlForApi(fileUrl);
    const relativePath = extractUploadsRelativePath(normalizedFileUrl);

    if (relativePath) {
      const filePath = resolveSafeUploadsPath(relativePath);
      if (!filePath) {
        return res.status(403).json({ message: "Forbidden" });
      }
      return res.download(filePath, String(access.row.file_name || `document-${documentId}.pdf`));
    }

    return res.redirect(normalizedFileUrl);
  } catch (error) {
    console.error("API error in GET /hr/documents/:id/download", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

// ─── Admin Employee Audit Endpoint ───────────────────────────────────────────

export async function buildEmployeeAuditPayload(params: {
  organizationId: string;
  targetUserId: string;
  employee: VisibleHrEmployee;
}) {
  const { organizationId, targetUserId, employee } = params;
  const targetName = String(employee.displayName || "").trim();

  const [allDocRows, orgUsers] = await Promise.all([
    getDocumentRows(organizationId),
    listOrganizationUsers(organizationId)
  ]);

  type AuditDocument = {
    id: number;
    file_name: string;
    category: string;
    category_other: string | null;
    due_date: string | null;
    status: string;
    signed_at: string | null;
    requires_signature: boolean;
    assigned_department_names: string[];
  };

  const docsForUser: AuditDocument[] = [];
  for (const row of allDocRows) {
    const assignment = resolveEffectiveAssignees(row, orgUsers);
    if (!assignment.effectiveUserIds.includes(targetUserId)) continue;
    const signedUserIds = Array.isArray(row.signed_user_ids) ? row.signed_user_ids.map(String) : [];
    const isSigned = signedUserIds.includes(targetUserId);
    const rawStatus = asString(row.status).toLowerCase();
    const status = rawStatus === "archived" ? "archived" : isSigned ? "signed" : "pending";
    const docSignatureResult = await pool.query(
      `SELECT signed_at::text AS signed_at FROM document_signatures WHERE document_id = $1 AND user_id = $2 ORDER BY id DESC LIMIT 1`,
      [Number(row.id), targetUserId]
    );
    const signedAt = docSignatureResult.rows[0]?.signed_at ? String(docSignatureResult.rows[0].signed_at) : null;
    docsForUser.push({
      id: Number(row.id),
      file_name: asString(row.file_name),
      category: asString(row.category),
      category_other: asNullableString(row.category_other),
      due_date: asNullableString(row.due_date),
      status,
      signed_at: signedAt,
      requires_signature: Boolean(row.requires_signature),
      assigned_department_names: Array.isArray(row.assigned_department_names) ? row.assigned_department_names.map(String) : []
    });
  }

  const pendingDocs = docsForUser.filter((d) => d.status === "pending");
  const signedDocs = docsForUser.filter((d) => d.status === "signed");
  const archivedDocs = docsForUser.filter((d) => d.status === "archived");

  const tasksResult = await pool.query(
    `SELECT
       t.id,
       t.title,
       t.description,
       t.due_date,
       t.status,
       t.priority,
       t.assigned_to,
       COALESCE(t.archived, false) AS archived,
       tc.status AS completion_status,
       tc.completed_at::text AS completed_on
     FROM tasks t
     LEFT JOIN task_completion tc ON tc.task_id = t.id AND tc.user_id = $2
     WHERE t.organization_id = $1
       AND (
         t.assigned_to ILIKE '%' || $3 || '%'
         OR EXISTS (
           SELECT 1 FROM task_assignments ta
           WHERE ta.task_id = t.id
             AND (ta.user_id = $2::text OR ta.department = 'All Staff')
         )
       )
     ORDER BY t.id DESC`,
    [organizationId, targetUserId, targetName]
  );

  type AuditTask = {
    id: number;
    title: string;
    description: string | null;
    due_date: string | null;
    status: string;
    priority: string | null;
    completion_status: string | null;
    completed_on: string | null;
    is_archived: boolean;
  };

  const allTasks: AuditTask[] = tasksResult.rows.map((row) => ({
    id: Number(row.id),
    title: asString(row.title) || "Task",
    description: asNullableString(row.description),
    due_date: asNullableString(row.due_date),
    status: asString(row.status) || "Pending",
    priority: asNullableString(row.priority),
    completion_status: asNullableString(row.completion_status),
    completed_on: asNullableString(row.completed_on),
    is_archived: Boolean(row.archived)
  }));

  const pendingTasks = allTasks.filter((t) => {
    const cs = (t.completion_status || "").toUpperCase();
    return !t.is_archived && cs !== "COMPLETED";
  });
  const completedTasks = allTasks.filter((t) => {
    const cs = (t.completion_status || "").toUpperCase();
    return t.is_archived || cs === "COMPLETED";
  });

  type AuditTraining = {
    id: number;
    title: string;
    category: string | null;
    due_date: string | null;
    status: string;
    is_completed: boolean;
    completed_on: string | null;
    progress_percent: number;
  };

  let allTraining: AuditTraining[] = [];
  try {
    const trainingResult = await pool.query(
      `SELECT
         ta.id,
         COALESCE(tr.training_name, ta.title, 'Training') AS title,
         ta.due_date,
         ta.status,
         ta.assignee_name,
         NULL::text AS category,
         tc.progress_percent,
         tc.completed_on::text AS completed_on
       FROM training_assignments ta
       LEFT JOIN training tr ON tr.id = ta.training_id
       LEFT JOIN training_completions tc ON tc.assignment_id = ta.id AND tc.user_name = $2
       WHERE ta.organization_id = $1
         AND (
           ta.assignee_name ILIKE '%' || $2 || '%'
           OR ta.assignee_name ILIKE '%All Staff%'
         )
       ORDER BY ta.id DESC`,
      [organizationId, targetName]
    );

    allTraining = trainingResult.rows.map((row) => {
      const progress = Number(row.progress_percent || 0);
      const completedOn = asNullableString(row.completed_on);
      const isCompleted = progress >= 100 || Boolean(completedOn);
      return {
        id: Number(row.id),
        title: asString(row.title) || "Training",
        category: asNullableString(row.category),
        due_date: asNullableString(row.due_date),
        status: asString(row.status) || "Assigned",
        is_completed: isCompleted,
        completed_on: completedOn,
        progress_percent: progress
      };
    });
  } catch (trainingError) {
    console.warn("[HR Audit] Training section unavailable; returning empty arrays", trainingError);
    allTraining = [];
  }

  const pendingTraining = allTraining.filter((t) => !t.is_completed && asString(t.status).toLowerCase() !== "archived");
  const completedTraining = allTraining.filter((t) => t.is_completed || asString(t.status).toLowerCase() === "archived");

  const surveysResult = await pool.query(
    `SELECT
       sa.id,
       sa.title,
       sa.due_date,
       sa.status,
       sa.user_id,
       sa.department_id,
       COALESCE(sa.all_staff, false) AS all_staff,
       sc.completed_on::text AS completed_on
     FROM survey_assignments sa
     INNER JOIN surveys s ON s.id = sa.survey_id AND s.organization_id = sa.organization_id
     LEFT JOIN survey_completions sc ON sc.assignment_id = sa.id AND sc.user_id = $2
     WHERE sa.organization_id = $1
       AND (
         sa.user_id = $2
         OR COALESCE(sa.all_staff, false) = true
         OR EXISTS (
           SELECT 1 FROM users u2
           WHERE u2.id = $2
             AND u2.department_id = sa.department_id
             AND u2.organization_id = sa.organization_id
         )
       )
     ORDER BY sa.id DESC`,
    [organizationId, targetUserId]
  );

  type AuditSurvey = {
    id: number;
    title: string;
    due_date: string | null;
    status: string;
    is_completed: boolean;
    completed_on: string | null;
  };

  const allSurveys: AuditSurvey[] = surveysResult.rows.map((row) => {
    const completedOn = asNullableString(row.completed_on);
    return {
      id: Number(row.id),
      title: asString(row.title) || "Survey",
      due_date: asNullableString(row.due_date),
      status: asString(row.status) || "Assigned",
      is_completed: Boolean(completedOn),
      completed_on: completedOn
    };
  });

  const pendingSurveys = allSurveys.filter((survey) => !survey.is_completed && asString(survey.status).toLowerCase() !== "archived");
  const completedSurveys = allSurveys.filter((survey) => survey.is_completed || asString(survey.status).toLowerCase() === "archived");

  return {
    employee: {
      user_id: employee.userId,
      display_name: employee.displayName,
      email: employee.email,
      department: employee.departmentName || "",
      hr_role: employee.hrRole,
      reports_to: employee.reportsToName || ""
    },
    documents: {
      pending: pendingDocs,
      signed: [...signedDocs, ...archivedDocs]
    },
    tasks: {
      pending: pendingTasks,
      completed: completedTasks
    },
    training: {
      pending: pendingTraining,
      completed: completedTraining
    },
    surveys: {
      pending: pendingSurveys,
      completed: completedSurveys
    }
  };
}

export async function listHrEmployees(req: AuthenticatedRequest, res: Response) {
  try {
    const userId = String(req.user?.user_id || "");
    const organizationId = String(req.user?.organization_id || "");
    const platformRole = String(req.user?.platform_role || req.user?.role || "USER");
    const fullName = String(req.user?.full_name || "");

    const employees = await listVisibleHrEmployees({
      userId,
      organizationId,
      platformRole,
      fullName
    });

    return res.json({
      employees: employees.map((employee) => ({
        user_id: employee.userId,
        display_name: employee.displayName,
        email: employee.email,
        department_id: employee.departmentId,
        department: employee.departmentName || "",
        hr_role: employee.hrRole,
        reports_to_user_id: employee.reportsToUserId,
        reports_to: employee.reportsToName || ""
      }))
    });
  } catch (error) {
    console.error("API error in GET /hr/employees", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

export async function getHrEmployeeAudit(req: AuthenticatedRequest, res: Response) {
  try {
    const userId = String(req.user?.user_id || "");
    const organizationId = String(req.user?.organization_id || "");
    const platformRole = String(req.user?.platform_role || req.user?.role || "USER");
    const fullName = String(req.user?.full_name || "");
    const targetUserId = asString(req.params.userId);

    if (!targetUserId) {
      return res.status(400).json({ message: "userId is required" });
    }

    const visibleEmployees = await listVisibleHrEmployees({
      userId,
      organizationId,
      platformRole,
      fullName
    });

    const targetEmployee = visibleEmployees.find((employee) => employee.userId === targetUserId);
    if (!targetEmployee) {
      const isAdmin = isAdminPlatformUser(req);
      return res.status(isAdmin ? 404 : 403).json({ message: isAdmin ? "User not found" : "Forbidden" });
    }

    const payload = await buildEmployeeAuditPayload({
      organizationId,
      targetUserId,
      employee: targetEmployee
    });

    return res.json(payload);
  } catch (error) {
    console.error("API error in GET /hr/employees/:userId/audit", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

export async function getAdminEmployeeAudit(req: AuthenticatedRequest, res: Response) {
  try {
    if (!isAdminPlatformUser(req)) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const organizationId = String(req.user?.organization_id || "");
    const targetUserId = asString(req.params.userId);

    if (!targetUserId) {
      return res.status(400).json({ message: "userId is required" });
    }

    const visibleEmployees = await listVisibleHrEmployees({
      userId: String(req.user?.user_id || ""),
      organizationId,
      platformRole: String(req.user?.platform_role || req.user?.role || "USER"),
      fullName: String(req.user?.full_name || "")
    });
    const targetEmployee = visibleEmployees.find((employee) => employee.userId === targetUserId);

    if (!targetEmployee) {
      return res.status(404).json({ message: "User not found" });
    }

    const payload = await buildEmployeeAuditPayload({
      organizationId,
      targetUserId,
      employee: targetEmployee
    });

    return res.json(payload);
  } catch (error) {
    console.error("API error in GET /hr/admin/employees/:userId/audit", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

export async function getAdminDepartmentAudit(req: AuthenticatedRequest, res: Response) {
  try {
    if (!isAdminPlatformUser(req)) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const organizationId = String(req.user?.organization_id || "");
    const requestedDepartment = asNullableString(req.query.department);

    const visibleEmployees = await listVisibleHrEmployees({
      userId: String(req.user?.user_id || ""),
      organizationId,
      platformRole: String(req.user?.platform_role || req.user?.role || "USER"),
      fullName: String(req.user?.full_name || "")
    });

    const departmentsResult = await pool.query(
      `SELECT name
       FROM departments
       WHERE organization_id = $1
       ORDER BY name ASC`,
      [organizationId]
    );

    const tableDepartments = departmentsResult.rows
      .map((row) => asString(row.name))
      .filter(Boolean);
    const fallbackDepartments = Array.from(
      new Set(
        visibleEmployees
          .map((employee) => asString(employee.departmentName))
          .filter(Boolean)
      )
    ).sort((a, b) => a.localeCompare(b));
    const departments = tableDepartments.length ? tableDepartments : fallbackDepartments;

    const selectedDepartment = requestedDepartment
      ? departments.find((department) => normalizeDepartmentKey(department) === normalizeDepartmentKey(requestedDepartment)) || null
      : null;

    const roleRank: Record<string, number> = {
      ADMIN: 0,
      MANAGER: 1,
      EMPLOYEE: 2
    };

    const selectedEmployees = (selectedDepartment
      ? visibleEmployees.filter((employee) => normalizeDepartmentKey(employee.departmentName) === normalizeDepartmentKey(selectedDepartment))
      : []
    ).sort((a, b) => {
      const roleDiff = (roleRank[a.hrRole] ?? 9) - (roleRank[b.hrRole] ?? 9);
      if (roleDiff !== 0) return roleDiff;
      return a.displayName.localeCompare(b.displayName);
    });

    const rows = await Promise.all(
      selectedEmployees.map(async (employee) => {
        const payload = await buildEmployeeAuditPayload({
          organizationId,
          targetUserId: employee.userId,
          employee
        });

        return {
          user_id: employee.userId,
          employee_name: employee.displayName,
          email: employee.email,
          hr_role: employee.hrRole,
          department: employee.departmentName,
          reports_to: employee.reportsToName || null,
          counts: {
            tasks: {
              pending: payload.tasks.pending.length,
              completed: payload.tasks.completed.length
            },
            training: {
              pending: payload.training.pending.length,
              completed: payload.training.completed.length
            },
            surveys: {
              pending: payload.surveys.pending.length,
              completed: payload.surveys.completed.length
            },
            documents: {
              pending: payload.documents.pending.length,
              completed: payload.documents.signed.length
            }
          }
        };
      })
    );

    return res.json({
      departments,
      selected_department: selectedDepartment,
      rows
    });
  } catch (error) {
    console.error("API error in GET /hr/admin/department-audit", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
