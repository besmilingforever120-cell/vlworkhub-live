import type { Request, Response } from "express";
import type { QueryResultRow } from "pg";
import { buildCookie, clearCookie, getCookieName, signAuthToken, verifyAuthToken } from "@vlworkhub/auth";
import { env } from "../config/env";
import { pool } from "../config/db";
import { hashPassword, migrateLegacyPasswordHashOnLogin, verifyPassword } from "../lib/passwords";
import { validatePasswordPolicy } from "../lib/password-policy";
import { revokeTokenByJti } from "../lib/token-revocation";
import type { AuthenticatedRequest } from "../middleware/auth";

type UserRole = "Admin" | "Manager" | "Employee" | "HR" | "IT";
type AppAccess = "HR" | "CARE" | "URSAFE";
type PlatformRole = "SUPER_ADMIN" | "IT_ADMIN" | "ADMIN" | "USER";

type SessionUser = {
  id: string;
  fullName: string;
  email: string;
  organizationId: string;
  role: PlatformRole;
  roles: UserRole[];
  apps: AppAccess[];
  platformRole: PlatformRole;
  mustChangePassword: boolean;
};

type UserRecord = QueryResultRow & {
  id: string;
  organization_id: string;
  organization_enabled: boolean;
  organization_name: string | null;
  email: string;
  password_hash: string;
  first_name: string | null;
  last_name: string | null;
  status: string | null;
  role: PlatformRole | null;
  must_change_password: boolean;
  failed_login_attempts: number;
  locked_until: Date | null;
};

const PASSWORD_HISTORY_COUNT = 5;
const MAX_FAILED_LOGIN_ATTEMPTS = 5;
const ACCOUNT_LOCKOUT_MINUTES = 20;
let ensureSecuritySchemaPromise: Promise<void> | null = null;
let ensureOrganizationsSchemaPromise: Promise<void> | null = null;

function ensureSecuritySchema() {
  if (!ensureSecuritySchemaPromise) {
    ensureSecuritySchemaPromise = (async () => {
      await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE`);
      await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER NOT NULL DEFAULT 0`);
      await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ`);
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
      ensureSecuritySchemaPromise = null;
      throw error;
    });
  }

  return ensureSecuritySchemaPromise;
}

function ensureOrganizationsSchema() {
  if (!ensureOrganizationsSchemaPromise) {
    ensureOrganizationsSchemaPromise = (async () => {
      await pool.query(`ALTER TABLE organizations ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE`);
      await pool.query(`ALTER TABLE organizations ADD COLUMN IF NOT EXISTS disabled_at TIMESTAMPTZ`);
    })().catch((error) => {
      ensureOrganizationsSchemaPromise = null;
      throw error;
    });
  }

  return ensureOrganizationsSchemaPromise;
}

function buildLegacyClearCookie(name: string, domain?: string) {
  const parts = [
    `${name}=`,
    "Path=/",
    "HttpOnly",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
    "SameSite=Lax",
    env.nodeEnv === "production" ? "Secure" : ""
  ].filter(Boolean);

  if (domain) {
    parts.push(`Domain=${domain}`);
  }

  return parts.join("; ");
}

function resolveCookieDomain(_: Request) {
  if (env.cookieDomain) {
    return env.cookieDomain;
  }

  if (env.nodeEnv !== "production") {
    return undefined;
  }

  return undefined;
}

function appendSessionCleanupHeaders(res: Response, domain?: string) {
  const headers = [clearCookie(), buildLegacyClearCookie("token")];

  if (domain) {
    headers.push(clearCookie(domain), buildLegacyClearCookie("token", domain));
  }

  for (const header of headers) {
    res.append("Set-Cookie", header);
  }
}

async function findUserByEmail(email: string) {
  await ensureSecuritySchema();
  await ensureOrganizationsSchema();

  const result = await pool.query<UserRecord>(
    `SELECT
       u.id,
       u.organization_id,
       COALESCE(o.is_active, TRUE) AS organization_enabled,
       o.name AS organization_name,
       u.email,
       u.password_hash,
       u.first_name,
       u.last_name,
       u.status,
       COALESCE(u.role, 'USER') AS role,
       COALESCE(u.must_change_password, FALSE) AS must_change_password,
       COALESCE(u.failed_login_attempts, 0) AS failed_login_attempts,
       u.locked_until
     FROM users u
     INNER JOIN organizations o ON o.id = u.organization_id
     WHERE u.email = $1`,
    [email]
  );

  return result.rows[0] || null;
}

async function findUserApps(userId: string) {
  const result = await pool.query<{ app: AppAccess }>(
    `SELECT UPPER(app) AS app
     FROM user_app_access
     WHERE user_id = $1
     ORDER BY UPPER(app) ASC`,
    [userId]
  );

  return result.rows.map((row) => row.app);
}

function buildDisplayName(user: UserRecord) {
  return `${String(user.first_name || "").trim()} ${String(user.last_name || "").trim()}`.trim() || user.email;
}

type LoginResult = {
  user: SessionUser;
  token: string;
};

type AuthenticateResult =
  | { status: "ok"; loginResult: LoginResult }
  | { status: "invalid" }
  | { status: "organization-disabled"; organizationName: string | null }
  | { status: "locked"; lockedUntil: Date };

async function toSessionUser(user: UserRecord): Promise<SessionUser> {
  const platformRole = user.role || "USER";
  return {
    id: user.id,
    fullName: buildDisplayName(user),
    email: user.email,
    organizationId: user.organization_id,
    role: platformRole,
    roles: ["Employee"],
    apps: await findUserApps(user.id),
    platformRole,
    mustChangePassword: Boolean(user.must_change_password)
  };
}

async function getMustChangePassword(userId: string) {
  await ensureSecuritySchema();
  const result = await pool.query<{ must_change_password: boolean }>(
    `SELECT COALESCE(must_change_password, FALSE) AS must_change_password
     FROM users
     WHERE id = $1`,
    [userId]
  );

  return Boolean(result.rows[0]?.must_change_password);
}

async function resetFailedLoginState(userId: string) {
  await ensureSecuritySchema();
  await pool.query(
    `UPDATE users
     SET failed_login_attempts = 0,
         locked_until = NULL
     WHERE id = $1`,
    [userId]
  );
}

async function recordFailedLoginAttempt(user: UserRecord) {
  await ensureSecuritySchema();

  const nextAttempts = Number(user.failed_login_attempts || 0) + 1;
  if (nextAttempts >= MAX_FAILED_LOGIN_ATTEMPTS) {
    const result = await pool.query<{ locked_until: Date }>(
      `UPDATE users
       SET failed_login_attempts = $2,
           locked_until = NOW() + ($3 * interval '1 minute')
       WHERE id = $1
       RETURNING locked_until`,
      [user.id, nextAttempts, ACCOUNT_LOCKOUT_MINUTES]
    );

    return result.rows[0]?.locked_until || null;
  }

  await pool.query(
    `UPDATE users
     SET failed_login_attempts = $2
     WHERE id = $1`,
    [user.id, nextAttempts]
  );

  return null;
}

async function authenticate(email: string, password: string): Promise<AuthenticateResult> {
  const user = await findUserByEmail(email.trim());

  if (!user || user.status !== "active") {
    return { status: "invalid" };
  }

  if (!user.organization_enabled) {
    return { status: "organization-disabled", organizationName: user.organization_name };
  }

  if (user.locked_until && new Date(user.locked_until).getTime() > Date.now()) {
    return { status: "locked", lockedUntil: new Date(user.locked_until) };
  }

  if (user.locked_until && new Date(user.locked_until).getTime() <= Date.now()) {
    await resetFailedLoginState(user.id);
    user.failed_login_attempts = 0;
    user.locked_until = null;
  }

  const passwordMatches = await verifyPassword(password, user.password_hash);
  if (!passwordMatches) {
    const lockedUntil = await recordFailedLoginAttempt(user);
    if (lockedUntil) {
      return { status: "locked", lockedUntil: new Date(lockedUntil) };
    }

    return { status: "invalid" };
  }

  await resetFailedLoginState(user.id);
  await migrateLegacyPasswordHashOnLogin(user.id, password, user.password_hash);

  const sessionUser = await toSessionUser(user);
  const token = signAuthToken(
    {
      user_id: sessionUser.id,
      organization_id: sessionUser.organizationId,
      role: sessionUser.role,
      roles: sessionUser.roles,
      apps: sessionUser.apps,
      email: sessionUser.email,
      full_name: sessionUser.fullName,
      platform_role: sessionUser.platformRole
    },
    env.jwtSecret
  );

  return { status: "ok", loginResult: { user: sessionUser, token } };
}

export async function login(req: Request, res: Response) {
  try {
    const { email, password } = req.body as { email: string; password: string };

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    const authResult = await authenticate(email, password);
    if (authResult.status === "locked") {
      return res.status(423).json({
        message: "Account temporarily locked due to failed login attempts",
        lockedUntil: authResult.lockedUntil.toISOString()
      });
    }

    if (authResult.status === "organization-disabled") {
      return res.status(403).json({
        message: "This organization is currently disabled. Please contact your system administrator."
      });
    }

    if (authResult.status !== "ok") {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const { loginResult } = authResult;
    const cookieDomain = resolveCookieDomain(req);
    appendSessionCleanupHeaders(res, cookieDomain);
    res.append("Set-Cookie", buildCookie(loginResult.token, cookieDomain));
    return res.json({ user: loginResult.user, mustChangePassword: loginResult.user.mustChangePassword });
  } catch (error) {
    console.error("API error in POST /auth/login", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

export async function mobileLogin(req: Request, res: Response) {
  try {
    const { email, password } = req.body as { email: string; password: string };

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    const authResult = await authenticate(email, password);
    if (authResult.status === "locked") {
      return res.status(423).json({
        message: "Account temporarily locked due to failed login attempts",
        lockedUntil: authResult.lockedUntil.toISOString()
      });
    }

    if (authResult.status === "organization-disabled") {
      return res.status(403).json({
        message: "This organization is currently disabled. Please contact your system administrator."
      });
    }

    if (authResult.status !== "ok") {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const { loginResult } = authResult;
    return res.json({ token: loginResult.token, user: loginResult.user, mustChangePassword: loginResult.user.mustChangePassword });
  } catch (error) {
    console.error("API error in POST /auth/mobile-login", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

export async function logout(req: Request, res: Response) {
  try {
    const bearer = req.headers.authorization?.replace("Bearer ", "");
    const token = bearer || req.cookies[getCookieName()];

    if (token) {
      try {
        const payload = verifyAuthToken(token, env.jwtSecret);
        if (payload.jti && payload.exp) {
          await revokeTokenByJti(payload.jti, payload.exp);
        }
      } catch {
        // Keep logout idempotent even when token is missing/invalid.
      }
    }

    appendSessionCleanupHeaders(res, env.cookieDomain);
    return res.json({ success: true });
  } catch (error) {
    console.error("API error in POST /auth/logout", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

export async function me(req: AuthenticatedRequest, res: Response) {
  try {
    const userId = String(req.user?.user_id || "");
    const mustChangePassword = userId ? await getMustChangePassword(userId) : false;
    const roles = req.user?.roles || ["Employee"];
    const platformRole = req.user?.platform_role || req.user?.role || "USER";
    return res.json({
      user: {
        id: userId,
        fullName: req.user?.full_name,
        email: req.user?.email,
        organizationId: req.user?.organization_id,
        role: platformRole,
        roles,
        apps: req.user?.apps || [],
        platformRole,
        mustChangePassword
      }
    });
  } catch (error) {
    console.error("API error in GET /auth/me", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

export async function changePassword(req: AuthenticatedRequest, res: Response) {
  try {
    await ensureSecuritySchema();

    const userId = String(req.user?.user_id || "");
    const { currentPassword, newPassword } = req.body as { currentPassword: string; newPassword: string };

    if (!userId) {
      return res.status(401).json({ message: "Missing session token" });
    }

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: "Current password and new password are required" });
    }

    const policy = validatePasswordPolicy(newPassword);
    if (!policy.valid) {
      return res.status(400).json({ message: policy.message });
    }

    const userResult = await pool.query<{ id: string; password_hash: string; status: string }>(
      `SELECT id, password_hash, status
       FROM users
       WHERE id = $1`,
      [userId]
    );

    if (userResult.rowCount === 0 || userResult.rows[0].status !== "active") {
      return res.status(404).json({ message: "User not found" });
    }

    const user = userResult.rows[0];
    const currentPasswordValid = await verifyPassword(currentPassword, user.password_hash);
    if (!currentPasswordValid) {
      return res.status(401).json({ message: "Current password is incorrect" });
    }

    const recentHistory = await pool.query<{ password_hash: string }>(
      `SELECT password_hash
       FROM user_password_history
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [userId, Math.max(PASSWORD_HISTORY_COUNT - 1, 1)]
    );

    const disallowedHashes = [user.password_hash, ...recentHistory.rows.map((item) => item.password_hash)];
    for (const hash of disallowedHashes) {
      if (await verifyPassword(newPassword, hash)) {
        return res.status(400).json({ message: "New password cannot reuse the last 5 passwords" });
      }
    }

    const nextPasswordHash = await hashPassword(newPassword);

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO user_password_history (user_id, password_hash)
         VALUES ($1, $2)`,
        [userId, user.password_hash]
      );
      await client.query(
        `UPDATE users
         SET password_hash = $1,
             must_change_password = FALSE
         WHERE id = $2`,
        [nextPasswordHash, userId]
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }

    return res.json({ success: true });
  } catch (error) {
    console.error("API error in POST /auth/change-password", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
