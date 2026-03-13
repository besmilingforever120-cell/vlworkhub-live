import crypto from "node:crypto";
import type { Request, Response } from "express";
import type { QueryResultRow } from "pg";
import { buildCookie, clearCookie, signAuthToken } from "@vlworkhub/auth";
import { env } from "../config/env";
import { pool } from "../config/db";
import type { AuthenticatedRequest } from "../middleware/auth";

type UserRole = "Admin" | "Manager" | "Employee" | "HR" | "IT";
type AppAccess = "HR" | "CARE" | "URSAFE";
type PlatformRole = "SUPER_ADMIN" | "ADMIN" | "USER";

type SessionUser = {
  id: string;
  fullName: string;
  email: string;
  organizationId: string;
  role: PlatformRole;
  roles: UserRole[];
  apps: AppAccess[];
  platformRole: PlatformRole;
};

type UserRecord = QueryResultRow & {
  id: string;
  organization_id: string;
  email: string;
  password_hash: string;
  first_name: string | null;
  last_name: string | null;
  status: string | null;
  role: PlatformRole | null;
};

function hashPassword(password: string) {
  return crypto.createHash("sha256").update(password).digest("hex");
}

function passwordMatches(password: string, storedPasswordHash: string) {
  return storedPasswordHash === password || storedPasswordHash === hashPassword(password);
}

async function findUserByEmail(email: string) {
  const result = await pool.query<UserRecord>(
    `SELECT
       u.id,
       u.organization_id,
       u.email,
       u.password_hash,
       u.first_name,
       u.last_name,
       u.status,
       COALESCE(u.role, 'USER') AS role
     FROM users u
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
    platformRole
  };
}

export async function login(req: Request, res: Response) {
  try {
    const { email, password } = req.body as { email: string; password: string };

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    const user = await findUserByEmail(email.trim());

    if (!user || user.status !== "active" || !passwordMatches(password, user.password_hash)) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

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

    res.setHeader("Set-Cookie", buildCookie(token, env.cookieDomain));
    return res.json({ token, user: sessionUser });
  } catch (error) {
    console.error("API error in POST /auth/login", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

export async function logout(_: Request, res: Response) {
  try {
    res.setHeader("Set-Cookie", clearCookie(env.cookieDomain));
    return res.json({ success: true });
  } catch (error) {
    console.error("API error in POST /auth/logout", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

export async function me(req: AuthenticatedRequest, res: Response) {
  try {
    const roles = req.user?.roles || ["Employee"];
    const platformRole = req.user?.platform_role || req.user?.role || "USER";
    return res.json({
      user: {
        id: req.user?.user_id,
        fullName: req.user?.full_name,
        email: req.user?.email,
        organizationId: req.user?.organization_id,
        role: platformRole,
        roles,
        apps: req.user?.apps || [],
        platformRole
      }
    });
  } catch (error) {
    console.error("API error in GET /auth/me", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
