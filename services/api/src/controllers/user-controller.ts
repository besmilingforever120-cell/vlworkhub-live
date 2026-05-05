import type { Response } from "express";
import path from "node:path";
import { pool } from "../config/db";
import { env } from "../config/env";
import { hashPassword } from "../lib/passwords";
import { generateTemporaryPassword } from "../lib/password-policy";
import type { AuthenticatedRequest } from "../middleware/auth";
import { getSmtpTransporter, getStoredEmailSettings } from "../services/email-settings-service";

type PlatformRole = "SUPER_ADMIN" | "IT_ADMIN" | "ADMIN" | "USER";
type AppAccess = "HR" | "CARE" | "URSAFE";

type AppAccessInput = { app: AppAccess; enabled: boolean };

let ensureDepartmentsSchemaPromise: Promise<void> | null = null;
let ensureUserSecuritySchemaPromise: Promise<void> | null = null;
let ensureOrganizationsSchemaPromise: Promise<void> | null = null;
const ALL_APPS: AppAccess[] = ["HR", "CARE", "URSAFE"];

function isSuperAdmin(req: AuthenticatedRequest) {
  return req.user?.platform_role === "SUPER_ADMIN" || req.user?.role === "SUPER_ADMIN";
}

function isItAdmin(req: AuthenticatedRequest) {
  return req.user?.platform_role === "IT_ADMIN" || req.user?.role === "IT_ADMIN";
}

function canManageTenantUsers(req: AuthenticatedRequest) {
  return isSuperAdmin(req) || isItAdmin(req);
}

function ensureDepartmentsSchema() {
  if (!ensureDepartmentsSchemaPromise) {
    ensureDepartmentsSchemaPromise = (async () => {
      await pool.query(`ALTER TABLE departments ADD COLUMN IF NOT EXISTS department_type TEXT`);
      await pool.query(`ALTER TABLE departments ADD COLUMN IF NOT EXISTS image_url TEXT`);
      await pool.query(`UPDATE departments SET department_type = 'Program' WHERE department_type IS NULL`);
      await pool.query(`ALTER TABLE departments ALTER COLUMN department_type SET DEFAULT 'Program'`);
    })().catch((error) => {
      ensureDepartmentsSchemaPromise = null;
      throw error;
    });
  }

  return ensureDepartmentsSchemaPromise;
}

function ensureUserSecuritySchema() {
  if (!ensureUserSecuritySchemaPromise) {
    ensureUserSecuritySchemaPromise = (async () => {
      await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE`);
      await pool.query(
        `CREATE TABLE IF NOT EXISTS user_password_history (
          id BIGSERIAL PRIMARY KEY,
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          password_hash TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`
      );
      await pool.query(
        `CREATE INDEX IF NOT EXISTS idx_user_password_history_user_created
         ON user_password_history (user_id, created_at DESC)`
      );
    })().catch((error) => {
      ensureUserSecuritySchemaPromise = null;
      throw error;
    });
  }

  return ensureUserSecuritySchemaPromise;
}

function ensureOrganizationsSchema() {
  if (!ensureOrganizationsSchemaPromise) {
    ensureOrganizationsSchemaPromise = (async () => {
      await pool.query(`ALTER TABLE organizations ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE`);
      await pool.query(`ALTER TABLE organizations ADD COLUMN IF NOT EXISTS disabled_at TIMESTAMPTZ`);
      await pool.query(`ALTER TABLE organizations ADD COLUMN IF NOT EXISTS assigned_admin_id UUID`);
      await pool.query(`ALTER TABLE organizations ADD COLUMN IF NOT EXISTS logo_url TEXT`);
      await pool.query(
        `CREATE TABLE IF NOT EXISTS organization_app_access (
          id BIGSERIAL PRIMARY KEY,
          organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
          app TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE (organization_id, app)
        )`
      );
      await pool.query(
        `DO $$
         BEGIN
           IF NOT EXISTS (
             SELECT 1
             FROM pg_constraint
             WHERE conname = 'organizations_assigned_admin_id_fkey'
           ) THEN
             ALTER TABLE organizations
             ADD CONSTRAINT organizations_assigned_admin_id_fkey
             FOREIGN KEY (assigned_admin_id)
             REFERENCES users(id)
             ON DELETE SET NULL;
           END IF;
         END
         $$;`
      );
    })().catch((error) => {
      ensureOrganizationsSchemaPromise = null;
      throw error;
    });
  }

  return ensureOrganizationsSchemaPromise;
}

function resolveLoginUrl() {
  return env.mainPlatformUrl;
}

function normalizeRole(value: string | undefined): PlatformRole | null {
  const candidate = String(value || "USER").toUpperCase();
  if (["SUPER_ADMIN", "IT_ADMIN", "ADMIN", "USER"].includes(candidate)) {
    return candidate as PlatformRole;
  }

  return null;
}

function normalizeApps(apps: AppAccessInput[] = []): AppAccess[] {
  return apps
    .filter((entry) => entry.enabled)
    .map((entry) => String(entry.app || "").toUpperCase())
    .filter((app): app is AppAccess => ALL_APPS.includes(app as AppAccess));
}

function normalizeAppCodesFromUnknown(rawApps: unknown) {
  if (Array.isArray(rawApps)) {
    return rawApps
      .map((app) => String(app || "").toUpperCase())
      .filter((app): app is AppAccess => ALL_APPS.includes(app as AppAccess));
  }

  if (typeof rawApps === "string") {
    const trimmed = rawApps.trim();
    if (!trimmed) {
      return [] as AppAccess[];
    }

    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed
          .map((app) => String(app || "").toUpperCase())
          .filter((app): app is AppAccess => ALL_APPS.includes(app as AppAccess));
      }
    } catch {
      // Fall through to comma-separated parsing.
    }

    return trimmed
      .split(",")
      .map((app) => app.trim().toUpperCase())
      .filter((app): app is AppAccess => ALL_APPS.includes(app as AppAccess));
  }

  return [] as AppAccess[];
}

function getUploadedFile(req: AuthenticatedRequest, fieldNames: string[]) {
  const files = req.files as Record<string, Express.Multer.File[]> | undefined;
  for (const fieldName of fieldNames) {
    const candidate = files?.[fieldName]?.[0];
    if (candidate) {
      return candidate;
    }
  }
  return null;
}

function toUploadsRelativePath(filePath: string) {
  const uploadsRoot = path.resolve(__dirname, "../../uploads");
  const relative = path.relative(uploadsRoot, filePath);
  const normalized = relative.split(path.sep).join("/").replace(/^\/+/, "");
  if (!normalized || normalized.startsWith("..")) {
    throw new Error("Invalid upload path");
  }
  return `/uploads/${normalized}`;
}

async function getOrganizationEnabledApps(client: { query: typeof pool.query }, organizationId: string) {
  await ensureOrganizationsSchema();
  const result = await client.query<{ app: string }>(
    `SELECT UPPER(app) AS app
     FROM organization_app_access
     WHERE organization_id = $1
     ORDER BY UPPER(app) ASC`,
    [organizationId]
  );

  if ((result.rowCount ?? 0) === 0) {
    return [...ALL_APPS];
  }

  return result.rows
    .map((row) => String(row.app || "").toUpperCase())
    .filter((app): app is AppAccess => ALL_APPS.includes(app as AppAccess));
}

async function getOrganizationById(client: { query: typeof pool.query }, organizationId: string) {
  const result = await client.query<{ id: string; name: string }>(
    `SELECT id, name
     FROM organizations
     WHERE id = $1
     LIMIT 1`,
    [organizationId]
  );

  return result.rows[0] ?? null;
}

async function getExistingUserApps(client: { query: typeof pool.query }, userId: string): Promise<AppAccess[]> {
  const result = await client.query<{ app: string }>(
    `SELECT UPPER(app) AS app
     FROM user_app_access
     WHERE user_id = $1`,
    [userId]
  );

  return result.rows
    .map((row) => String(row.app || "").toUpperCase())
    .filter((app): app is AppAccess => ALL_APPS.includes(app as AppAccess));
}

async function departmentBelongsToOrganization(
  client: { query: typeof pool.query },
  departmentId: string | null | undefined,
  organizationId: string
) {
  if (!departmentId) {
    return true;
  }

  const result = await client.query<{ id: string }>(
    `SELECT id
     FROM departments
     WHERE id = $1 AND organization_id = $2
     LIMIT 1`,
    [departmentId, organizationId]
  );

  return (result.rowCount ?? 0) > 0;
}

async function clearInvalidAssignedOrganizations(
  client: { query: typeof pool.query },
  userId: string,
  organizationId: string,
  keepAssignment: boolean
) {
  if (keepAssignment) {
    await client.query(
      `UPDATE organizations
       SET assigned_admin_id = NULL
       WHERE assigned_admin_id = $1
         AND id <> $2`,
      [userId, organizationId]
    );
    return;
  }

  await client.query(
    `UPDATE organizations
     SET assigned_admin_id = NULL
     WHERE assigned_admin_id = $1`,
    [userId]
  );
}

function assertAppsWithinOrganizationEntitlements(requestedApps: AppAccess[], allowedApps: AppAccess[]) {
  const disallowed = requestedApps.filter((app) => !allowedApps.includes(app));
  if (disallowed.length > 0) {
    throw new Error(`App access not enabled for this organization: ${disallowed.join(", ")}`);
  }
}

async function sendWelcomeOnboardingEmail(params: {
  organizationId: string;
  organizationName: string;
  recipientEmail: string;
  fullName: string;
  temporaryPassword: string;
}) {
  const transporter = await getSmtpTransporter(params.organizationId);
  const settings = await getStoredEmailSettings(params.organizationId);

  if (!transporter || !settings?.email) {
    throw new Error("SMTP settings are not configured for onboarding emails");
  }

  const loginUrl = resolveLoginUrl().replace(/\/$/, "");
  const text = [
    `Welcome to ${params.organizationName} on VLWorkHub, ${params.fullName}.`,
    "",
    `Login URL: ${loginUrl}/login`,
    `Username: ${params.recipientEmail}`,
    `Temporary password: ${params.temporaryPassword}`,
    "",
    "For security, you must change your password immediately after first login."
  ].join("\n");

  await transporter.sendMail({
    from: String(settings.email),
    to: params.recipientEmail,
    subject: `Welcome to ${params.organizationName} - Temporary Login Credentials`,
    text
  });
}

export async function listUsers(req: AuthenticatedRequest, res: Response) {
  try {
    const result = await pool.query(
      `SELECT
         u.id,
         TRIM(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')) AS name,
         u.email,
         u.department_id,
         d.name AS department_name
       FROM users u
       LEFT JOIN departments d ON d.id = u.department_id
       WHERE u.status = 'active'
         AND u.organization_id = $1
       ORDER BY u.first_name ASC, u.last_name ASC, u.email ASC`,
      [req.user?.organization_id]
    );

    return res.json({ items: result.rows });
  } catch (error) {
    console.error("API error in GET /api/users", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

export async function listAccessibleDepartments(req: AuthenticatedRequest, res: Response) {
  try {
    await ensureDepartmentsSchema();

    const result = await pool.query(
      `SELECT
         d.id,
         d.organization_id,
         d.name,
         d.department_type,
         d.address,
         d.manager_id,
         TRIM(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')) AS manager_name,
         u.email AS manager_email,
         d.created_at
       FROM departments d
       LEFT JOIN users u ON u.id = d.manager_id
       WHERE d.organization_id = $1
       ORDER BY d.name ASC`,
      [req.user?.organization_id]
    );

    return res.json({ items: result.rows });
  } catch (error) {
    console.error("API error in GET /api/departments", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

export async function getMyAppAccess(req: AuthenticatedRequest, res: Response) {
  try {
    await ensureOrganizationsSchema();

    const result = await pool.query(
      `SELECT UPPER(uaa.app) AS app, TRUE AS enabled
       FROM user_app_access uaa
       INNER JOIN users u ON u.id = uaa.user_id
       LEFT JOIN organization_app_access oaa
         ON oaa.organization_id = u.organization_id
        AND UPPER(oaa.app) = UPPER(uaa.app)
       WHERE uaa.user_id = $1
         AND u.status = 'active'
         AND (
           NOT EXISTS (
             SELECT 1
             FROM organization_app_access oaa2
             WHERE oaa2.organization_id = u.organization_id
           )
           OR oaa.id IS NOT NULL
         )
       ORDER BY UPPER(uaa.app) ASC`,
      [req.user?.user_id]
    );

    return res.json(result.rows);
  } catch (error) {
    console.error("API error in GET /api/apps/my-access", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

export async function listAdminUsers(req: AuthenticatedRequest, res: Response) {
  try {
    if (!canManageTenantUsers(req)) {
      return res.status(403).json({ message: "Access denied" });
    }

    await ensureOrganizationsSchema();

    const organizationId = String(req.user?.organization_id || "");
    const isGlobal = isSuperAdmin(req);
    const params = isGlobal ? [] : [organizationId];

    const result = await pool.query(
      `SELECT
         u.id,
         u.organization_id,
         o.name AS organization_name,
         u.department_id,
         u.first_name,
         u.last_name,
         TRIM(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')) AS name,
         u.email,
         u.status,
         (u.status = 'active') AS enabled,
         COALESCE(u.role, 'USER') AS role,
         COALESCE(
           json_agg(
             json_build_object('app', UPPER(uaa.app), 'enabled', TRUE)
             ORDER BY UPPER(uaa.app)
           ) FILTER (WHERE uaa.id IS NOT NULL),
           '[]'::json
         ) AS app_access
       FROM users u
       INNER JOIN organizations o ON o.id = u.organization_id
       LEFT JOIN user_app_access uaa ON uaa.user_id = u.id
       ${isGlobal ? "" : "WHERE u.organization_id = $1"}
       GROUP BY u.id, u.organization_id, o.name, u.department_id, u.first_name, u.last_name, u.email, u.status, u.role
       ORDER BY u.first_name ASC, u.last_name ASC, u.email ASC`,
      params
    );

    return res.json({ items: result.rows });
  } catch (error) {
    console.error("API error in GET /api/admin/users", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

export async function createAdminUser(req: AuthenticatedRequest, res: Response) {
  if (!canManageTenantUsers(req)) {
    return res.status(403).json({ message: "Access denied" });
  }

  const { name, email, enabled = true, role = "USER", apps = [], departmentId = null, organizationId } = req.body as {
    name: string;
    email: string;
    enabled?: boolean;
    role?: PlatformRole;
    apps?: AppAccessInput[];
    departmentId?: string | null;
    organizationId?: string;
  };

  if (!name || !email) {
    return res.status(400).json({ message: "Name and email are required" });
  }

  const normalizedRole = normalizeRole(role);

  if (!normalizedRole) {
    return res.status(400).json({ message: "Invalid platform role" });
  }

  if (normalizedRole === "SUPER_ADMIN" && !isSuperAdmin(req)) {
    return res.status(403).json({ message: "Only SUPER_ADMIN can create SUPER_ADMIN users" });
  }

  if (normalizedRole === "IT_ADMIN" && !isSuperAdmin(req)) {
    return res.status(403).json({ message: "Only SUPER_ADMIN can create IT_ADMIN users" });
  }

  await ensureUserSecuritySchema();
  await ensureOrganizationsSchema();

  const targetOrganizationId = isSuperAdmin(req)
    ? String(organizationId || req.user?.organization_id || "")
    : String(req.user?.organization_id || "");

  if (!targetOrganizationId) {
    return res.status(400).json({ message: "Organization is required" });
  }

  const normalizedApps = normalizeApps(apps);

  const parts = name.trim().split(/\s+/);
  const firstName = parts.shift() || name.trim();
  const lastName = parts.join(" ");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const organization = await getOrganizationById(client, targetOrganizationId);
    if (!organization) {
      await client.query("ROLLBACK").catch(() => undefined);
      return res.status(400).json({ message: "Selected organization was not found" });
    }

    if (!(await departmentBelongsToOrganization(client, departmentId, targetOrganizationId))) {
      await client.query("ROLLBACK").catch(() => undefined);
      return res.status(400).json({ message: "Selected department does not belong to the chosen organization" });
    }

    const enabledOrgApps = await getOrganizationEnabledApps(client, targetOrganizationId);
    assertAppsWithinOrganizationEntitlements(normalizedApps, enabledOrgApps);

    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await hashPassword(temporaryPassword);
    const result = await client.query(
      `INSERT INTO users (organization_id, department_id, email, password_hash, first_name, last_name, status, role, must_change_password)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE)
       RETURNING id`,
      [targetOrganizationId, departmentId, email.trim().toLowerCase(), passwordHash, firstName, lastName || firstName, enabled ? "active" : "inactive", normalizedRole]
    );

    for (const app of normalizedApps) {
      await client.query(
        `INSERT INTO user_app_access (user_id, app)
         VALUES ($1, $2)`,
        [result.rows[0].id, app]
      );
    }

    await client.query("COMMIT");

    try {
      await sendWelcomeOnboardingEmail({
        organizationId: targetOrganizationId,
        organizationName: organization.name,
        recipientEmail: email.trim().toLowerCase(),
        fullName: `${firstName} ${lastName}`.trim() || firstName,
        temporaryPassword
      });
    } catch (mailError) {
      console.warn("Welcome email skipped after user creation", {
        organizationId: targetOrganizationId,
        recipientEmail: email.trim().toLowerCase(),
        error: mailError instanceof Error ? mailError.message : String(mailError)
      });
    }

    return res.status(201).json({ id: result.rows[0].id });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    console.error("API error in POST /api/admin/users", error);
    return res.status(500).json({ error: "Internal server error" });
  } finally {
    client.release();
  }
}

export async function updateAdminUser(req: AuthenticatedRequest, res: Response) {
  if (!canManageTenantUsers(req)) {
    return res.status(403).json({ message: "Access denied" });
  }

  const userId = String(req.params.id || "");
  const { name, email, password, enabled, role = "USER", apps, departmentId = null, organizationId } = req.body as {
    name: string;
    email: string;
    password?: string;
    enabled: boolean;
    role?: PlatformRole;
    apps?: AppAccessInput[];
    departmentId?: string | null;
    organizationId?: string;
  };

  if (!userId || !name || !email) {
    return res.status(400).json({ message: "User id, name, and email are required" });
  }

  const normalizedRole = normalizeRole(role);

  if (!normalizedRole) {
    return res.status(400).json({ message: "Invalid platform role" });
  }

  if (normalizedRole === "SUPER_ADMIN" && !isSuperAdmin(req)) {
    return res.status(403).json({ message: "Only SUPER_ADMIN can assign the SUPER_ADMIN role" });
  }

  if (normalizedRole === "IT_ADMIN" && !isSuperAdmin(req)) {
    return res.status(403).json({ message: "Only SUPER_ADMIN can assign the IT_ADMIN role" });
  }

  await ensureUserSecuritySchema();
  await ensureOrganizationsSchema();

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const userRecord = await client.query<{ organization_id: string }>(
      `SELECT organization_id
       FROM users
       WHERE id = $1
       LIMIT 1`,
      [userId]
    );

    if ((userRecord.rowCount ?? 0) === 0) {
      await client.query("ROLLBACK").catch(() => undefined);
      return res.status(404).json({ message: "User not found" });
    }

    const currentOrganizationId = String(userRecord.rows[0].organization_id || "");
    if (!isSuperAdmin(req) && currentOrganizationId !== String(req.user?.organization_id || "")) {
      await client.query("ROLLBACK").catch(() => undefined);
      return res.status(403).json({ message: "Access denied" });
    }

    const nextOrganizationId = isSuperAdmin(req)
      ? String(organizationId || currentOrganizationId)
      : currentOrganizationId;

    const organization = await getOrganizationById(client, nextOrganizationId);
    if (!organization) {
      await client.query("ROLLBACK").catch(() => undefined);
      return res.status(400).json({ message: "Selected organization was not found" });
    }

    if (!(await departmentBelongsToOrganization(client, departmentId, nextOrganizationId))) {
      await client.query("ROLLBACK").catch(() => undefined);
      return res.status(400).json({ message: "Selected department does not belong to the chosen organization" });
    }

    const normalizedApps = apps ? normalizeApps(apps) : undefined;
    const effectiveApps = normalizedApps ?? await getExistingUserApps(client, userId);
    const enabledOrgApps = await getOrganizationEnabledApps(client, nextOrganizationId);
    assertAppsWithinOrganizationEntitlements(effectiveApps, enabledOrgApps);

    const parts = name.trim().split(/\s+/);
    const firstName = parts.shift() || name.trim();
    const lastName = parts.join(" ");

    if (password) {
      const existing = await client.query<{ password_hash: string }>(
        `SELECT password_hash
         FROM users
         WHERE id = $1
         LIMIT 1`,
        [userId]
      );

      if ((existing.rowCount ?? 0) > 0) {
        await client.query(
          `INSERT INTO user_password_history (user_id, password_hash)
           VALUES ($1, $2)`,
          [userId, existing.rows[0].password_hash]
        );
      }

      const passwordHash = await hashPassword(password);
      await client.query(
        `UPDATE users
         SET organization_id = $1,
             department_id = $2,
             email = $3,
             password_hash = $4,
             first_name = $5,
             last_name = $6,
             status = $7,
             role = $8
         WHERE id = $9`,
        [nextOrganizationId, departmentId, email.trim().toLowerCase(), passwordHash, firstName, lastName || firstName, enabled ? "active" : "inactive", normalizedRole, userId]
      );
    } else {
      await client.query(
        `UPDATE users
         SET organization_id = $1,
             department_id = $2,
             email = $3,
             first_name = $4,
             last_name = $5,
             status = $6,
             role = $7
         WHERE id = $8`,
        [nextOrganizationId, departmentId, email.trim().toLowerCase(), firstName, lastName || firstName, enabled ? "active" : "inactive", normalizedRole, userId]
      );
    }

    if (normalizedApps) {
      await client.query(`DELETE FROM user_app_access WHERE user_id = $1`, [userId]);
      for (const app of normalizedApps) {
        await client.query(
          `INSERT INTO user_app_access (user_id, app)
           VALUES ($1, $2)`,
          [userId, app]
        );
      }
    }

    await clearInvalidAssignedOrganizations(
      client,
      userId,
      nextOrganizationId,
      normalizedRole === "IT_ADMIN" && Boolean(enabled)
    );

    await client.query("COMMIT");
    return res.json({ success: true });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    console.error("API error in PUT /api/admin/users/:id", error);
    return res.status(500).json({ error: "Internal server error" });
  } finally {
    client.release();
  }
}

export async function upsertUserAppAccess(req: AuthenticatedRequest, res: Response) {
  try {
    if (!canManageTenantUsers(req)) {
      return res.status(403).json({ message: "Access denied" });
    }

    const { userId, app, enabled } = req.body as {
      userId: string;
      app: AppAccess;
      enabled: boolean;
    };

    if (!userId || !app || typeof enabled !== "boolean") {
      return res.status(400).json({ message: "userId, app, and enabled are required" });
    }

    const normalizedApp = String(app).toUpperCase() as AppAccess;

    const userOrg = await pool.query<{ organization_id: string }>(
      `SELECT organization_id
       FROM users
       WHERE id = $1
       LIMIT 1`,
      [userId]
    );

    if ((userOrg.rowCount ?? 0) === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    const targetOrganizationId = String(userOrg.rows[0].organization_id || "");
    if (!isSuperAdmin(req) && targetOrganizationId !== String(req.user?.organization_id || "")) {
      return res.status(403).json({ message: "Access denied" });
    }

    const enabledOrgApps = await getOrganizationEnabledApps(pool, targetOrganizationId);
    if (!enabledOrgApps.includes(normalizedApp)) {
      return res.status(400).json({ message: `App access not enabled for this organization: ${normalizedApp}` });
    }

    if (!enabled) {
      await pool.query(`DELETE FROM user_app_access WHERE user_id = $1 AND UPPER(app) = $2`, [userId, normalizedApp]);
      return res.json({ success: true });
    }

    const existing = await pool.query(
      `SELECT id
       FROM user_app_access
       WHERE user_id = $1 AND UPPER(app) = $2
       LIMIT 1`,
      [userId, normalizedApp]
    );

    if (existing.rowCount === 0) {
      await pool.query(
        `INSERT INTO user_app_access (user_id, app)
         VALUES ($1, $2)`,
        [userId, normalizedApp]
      );
    }

    return res.json({ success: true });
  } catch (error) {
    console.error("API error in POST /api/admin/user-access", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

export async function listDepartments(req: AuthenticatedRequest, res: Response) {
  try {
    if (!canManageTenantUsers(req)) {
      return res.status(403).json({ message: "Access denied" });
    }

    await ensureDepartmentsSchema();

    const isGlobal = isSuperAdmin(req);
    const params = isGlobal ? [] : [req.user?.organization_id];

    const result = await pool.query(
      `SELECT
         d.id,
         d.organization_id,
         o.name AS organization_name,
         d.name,
        d.department_type,
        d.image_url,
         d.address,
         d.manager_id,
         TRIM(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')) AS manager_name,
         u.email AS manager_email,
         d.created_at
       FROM departments d
       INNER JOIN organizations o ON o.id = d.organization_id
       LEFT JOIN users u ON u.id = d.manager_id
       ${isGlobal ? "" : "WHERE d.organization_id = $1"}
       ORDER BY d.created_at DESC, d.name ASC`,
      params
    );

    return res.json({ items: result.rows });
  } catch (error) {
    console.error("API error in GET /api/admin/departments", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

export async function listOrganizations(req: AuthenticatedRequest, res: Response) {
  try {
    if (!isSuperAdmin(req)) {
      return res.status(403).json({ message: "Access denied" });
    }

    await ensureOrganizationsSchema();

    const result = await pool.query(
      `SELECT
         o.id,
         o.name,
        o.logo_url,
         COALESCE(o.is_active, TRUE) AS enabled,
         o.assigned_admin_id,
         TRIM(COALESCE(au.first_name, '') || ' ' || COALESCE(au.last_name, '')) AS assigned_admin_name,
         au.email AS assigned_admin_email,
         o.disabled_at,
         o.created_at,
         COUNT(DISTINCT u.id) AS user_count,
         COUNT(DISTINCT d.id) AS department_count,
         COALESCE(
           json_agg(DISTINCT UPPER(oaa.app)) FILTER (WHERE oaa.id IS NOT NULL),
           '[]'::json
         ) AS apps
       FROM organizations o
       LEFT JOIN users au ON au.id = o.assigned_admin_id
       LEFT JOIN organization_app_access oaa ON oaa.organization_id = o.id
       LEFT JOIN users u ON u.organization_id = o.id
       LEFT JOIN departments d ON d.organization_id = o.id
       GROUP BY o.id, o.name, o.logo_url, o.is_active, o.assigned_admin_id, au.first_name, au.last_name, au.email, o.disabled_at, o.created_at
       ORDER BY o.created_at DESC, o.name ASC`
    );

    return res.json({ items: result.rows });
  } catch (error) {
    console.error("API error in GET /api/admin/organizations", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

export async function createOrganization(req: AuthenticatedRequest, res: Response) {
  try {
    if (!isSuperAdmin(req)) {
      return res.status(403).json({ message: "Access denied" });
    }

    await ensureOrganizationsSchema();

    const body = req.body as {
      name: string;
      assignedAdminId?: string | null;
      apps?: string[] | string;
    };

    const name = String(body.name || "");
    const assignedAdminId = body.assignedAdminId ? String(body.assignedAdminId) : null;
    const requestedApps = normalizeAppCodesFromUnknown(body.apps);
    const uploadedLogo = getUploadedFile(req, ["logo"]);
    const logoUrl = uploadedLogo ? toUploadsRelativePath(uploadedLogo.path) : null;

    if (!name || !name.trim()) {
      return res.status(400).json({ message: "Organization name is required" });
    }

    const normalizedApps = Array.from(new Set((requestedApps.length > 0 ? requestedApps : ALL_APPS)
      .map((app) => String(app || "").toUpperCase())
      .filter((app): app is AppAccess => ALL_APPS.includes(app as AppAccess))));

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      if (assignedAdminId) {
        await client.query("ROLLBACK").catch(() => undefined);
        return res.status(400).json({ message: "Create the organization first, then assign an active IT_ADMIN who belongs to that organization" });
      }

      const result = await client.query(
        `INSERT INTO organizations (name, logo_url, is_active, assigned_admin_id)
         VALUES ($1, $2, TRUE, $3)
         RETURNING id, logo_url`,
        [name.trim(), logoUrl, null]
      );

      for (const app of normalizedApps) {
        await client.query(
          `INSERT INTO organization_app_access (organization_id, app)
           VALUES ($1, $2)
           ON CONFLICT (organization_id, app) DO NOTHING`,
          [result.rows[0].id, app]
        );
      }

      await client.query("COMMIT");
      return res.status(201).json({ id: result.rows[0].id, logo_url: result.rows[0].logo_url || null });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("API error in POST /api/admin/organizations", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

export async function updateOrganization(req: AuthenticatedRequest, res: Response) {
  try {
    if (!isSuperAdmin(req)) {
      return res.status(403).json({ message: "Access denied" });
    }

    await ensureOrganizationsSchema();

    const organizationId = String(req.params.id || "");
    const { name, enabled = true, assignedAdminId, apps } = req.body as {
      name: string;
      enabled?: boolean;
      assignedAdminId?: string | null;
      apps?: string[];
    };

    if (!organizationId || !name || !name.trim()) {
      return res.status(400).json({ message: "Organization id and name are required" });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const current = await client.query<{ assigned_admin_id: string | null }>(
        `SELECT assigned_admin_id
         FROM organizations
         WHERE id = $1
         LIMIT 1`,
        [organizationId]
      );

      if ((current.rowCount ?? 0) === 0) {
        await client.query("ROLLBACK").catch(() => undefined);
        return res.status(404).json({ message: "Organization not found" });
      }

      const nextAssignedAdminId = assignedAdminId === undefined
        ? current.rows[0].assigned_admin_id
        : assignedAdminId;

      if (nextAssignedAdminId) {
        const owner = await client.query<{ id: string }>(
          `SELECT id
           FROM users
           WHERE id = $1
             AND status = 'active'
             AND COALESCE(role, 'USER') = 'IT_ADMIN'
             AND organization_id = $2
           LIMIT 1`,
          [nextAssignedAdminId, organizationId]
        );

        if ((owner.rowCount ?? 0) === 0) {
          await client.query("ROLLBACK").catch(() => undefined);
          return res.status(400).json({ message: "Assigned To must be an active IT_ADMIN user who belongs to this organization" });
        }
      }

      await client.query(
        `UPDATE organizations
         SET name = $1,
             is_active = $2,
             assigned_admin_id = $3,
             disabled_at = CASE
               WHEN $2 THEN NULL
               ELSE COALESCE(disabled_at, NOW())
             END
         WHERE id = $4`,
        [name.trim(), Boolean(enabled), nextAssignedAdminId || null, organizationId]
      );

      if (Array.isArray(apps)) {
        const normalizedApps = Array.from(new Set(apps
          .map((app) => String(app || "").toUpperCase())
          .filter((app): app is AppAccess => ALL_APPS.includes(app as AppAccess))));

        await client.query(`DELETE FROM organization_app_access WHERE organization_id = $1`, [organizationId]);
        for (const app of normalizedApps) {
          await client.query(
            `INSERT INTO organization_app_access (organization_id, app)
             VALUES ($1, $2)
             ON CONFLICT (organization_id, app) DO NOTHING`,
            [organizationId, app]
          );
        }
      }

      await client.query("COMMIT");
      return res.json({ success: true });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("API error in PUT /api/admin/organizations/:id", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

export async function listAssignableItAdmins(req: AuthenticatedRequest, res: Response) {
  try {
    if (!isSuperAdmin(req)) {
      return res.status(403).json({ message: "Access denied" });
    }

    const result = await pool.query(
      `SELECT
         u.id,
         u.organization_id,
         TRIM(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')) AS name,
         u.email
       FROM users u
       WHERE COALESCE(u.role, 'USER') = 'IT_ADMIN'
         AND u.status = 'active'
       ORDER BY u.first_name ASC, u.last_name ASC, u.email ASC`
    );

    return res.json({ items: result.rows });
  } catch (error) {
    console.error("API error in GET /api/admin/it-admins", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

export async function createDepartment(req: AuthenticatedRequest, res: Response) {
  try {
    if (!canManageTenantUsers(req)) {
      return res.status(403).json({ message: "Access denied" });
    }

    await ensureDepartmentsSchema();

    const { name, address, departmentType = "Program", managerId = null } = req.body as { name: string; address?: string; departmentType?: string; managerId?: string | null };
    const uploadedImage = getUploadedFile(req, ["image", "logo"]);
    const imageUrl = uploadedImage ? toUploadsRelativePath(uploadedImage.path) : null;
    const normalizedManagerId = managerId ? String(managerId) : null;

    if (!name) {
      return res.status(400).json({ message: "Department name is required" });
    }

    if (!["Community housing", "Program"].includes(String(departmentType))) {
      return res.status(400).json({ message: "departmentType must be Community housing or Program" });
    }

    const result = await pool.query(
      `INSERT INTO departments (organization_id, name, department_type, address, manager_id, image_url)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, image_url`,
      [req.user?.organization_id, name.trim(), String(departmentType), address?.trim() || null, normalizedManagerId, imageUrl]
    );

    return res.status(201).json({ id: result.rows[0].id, image_url: result.rows[0].image_url || null });
  } catch (error) {
    console.error("API error in POST /api/admin/departments", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

export async function updateDepartment(req: AuthenticatedRequest, res: Response) {
  try {
    if (!canManageTenantUsers(req)) {
      return res.status(403).json({ message: "Access denied" });
    }

    await ensureDepartmentsSchema();

    const departmentId = String(req.params.id || "");
    const { name, address, departmentType = "Program", managerId = null } = req.body as { name: string; address?: string; departmentType?: string; managerId?: string | null };
    const normalizedManagerId = managerId ? String(managerId) : null;

    if (!departmentId || !name) {
      return res.status(400).json({ message: "Department id and name are required" });
    }

    if (!["Community housing", "Program"].includes(String(departmentType))) {
      return res.status(400).json({ message: "departmentType must be Community housing or Program" });
    }

    await pool.query(
      `UPDATE departments
       SET name = $1,
           department_type = $2,
           address = $3,
           manager_id = $4
       WHERE id = $5 AND organization_id = $6`,
      [name.trim(), String(departmentType), address?.trim() || null, normalizedManagerId, departmentId, req.user?.organization_id]
    );

    return res.json({ success: true });
  } catch (error) {
    console.error("API error in PUT /api/admin/departments/:id", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

export async function deleteDepartment(req: AuthenticatedRequest, res: Response) {
  try {
    if (!canManageTenantUsers(req)) {
      return res.status(403).json({ message: "Access denied" });
    }

    const departmentId = String(req.params.id || "");
    if (!departmentId) {
      return res.status(400).json({ message: "Department id is required" });
    }

    await pool.query(`DELETE FROM departments WHERE id = $1 AND organization_id = $2`, [departmentId, req.user?.organization_id]);
    return res.json({ success: true });
  } catch (error) {
    console.error("API error in DELETE /api/admin/departments/:id", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
