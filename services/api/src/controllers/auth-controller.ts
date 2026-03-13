import crypto from "node:crypto";
import type { Request, Response } from "express";
import type { QueryResultRow } from "pg";
import { buildCookie, clearCookie, signAuthToken } from "@vlworkhub/auth";
import { env } from "../config/env";
import { pool } from "../config/db";
import type { AuthenticatedRequest } from "../middleware/auth";

type UserRole = "Admin" | "Manager" | "Employee" | "HR" | "IT";
type AppAccess = "HR" | "CARE" | "URSAFE";
type PlatformRole = "super_admin" | "user";

type SessionUser = {
  id: string;
  fullName: string;
  email: string;
  organizationId: string;
  role: UserRole;
  roles: UserRole[];
  apps: AppAccess[];
  platformRole: PlatformRole;
};

type UserRecord = QueryResultRow & {
  id: string;
  name: string | null;
  email: string;
  password_hash: string;
  enabled: boolean;
  role: PlatformRole;
  apps: AppAccess[];
};

const DEFAULT_ORG_ID = "00000000-0000-0000-0000-000000000001";

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
       u.name,
       u.email,
       u.password_hash,
       u.enabled,
       u.role,
       COALESCE(array_remove(array_agg(DISTINCT CASE WHEN uaa.enabled THEN UPPER(uaa.app) END), NULL), '{}') AS apps
     FROM users u
     LEFT JOIN user_app_access uaa ON uaa.user_id = u.id
     WHERE LOWER(u.email) = LOWER($1) AND u.enabled = TRUE
     GROUP BY u.id, u.name, u.email, u.password_hash, u.enabled, u.role
     LIMIT 1`,
    [email]
  );

  return result.rows[0] || null;
}

function toSessionUser(user: UserRecord): SessionUser {
  const fullName = String(user.name || user.email).trim();
  const fallbackRole: UserRole = user.role === "super_admin" ? "Admin" : "Employee";
  return {
    id: user.id,
    fullName,
    email: user.email,
    organizationId: DEFAULT_ORG_ID,
    role: fallbackRole,
    roles: [fallbackRole],
    apps: (user.apps || []).filter(Boolean),
    platformRole: user.role
  };
}

export async function login(req: Request, res: Response) {
  const { email, password } = req.body as { email: string; password: string };

  if (!email || !password) {
    return res.status(400).json({ message: "Email and password are required" });
  }

  const user = await findUserByEmail(email.trim().toLowerCase());

  if (!user || !passwordMatches(password, user.password_hash)) {
    return res.status(401).json({ message: "Invalid credentials" });
  }

  const sessionUser = toSessionUser(user);
  const token = signAuthToken(
    {
      user_id: sessionUser.id,
      organization_id: sessionUser.organizationId,
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
}

export async function logout(_: Request, res: Response) {
  res.setHeader("Set-Cookie", clearCookie(env.cookieDomain));
  return res.json({ success: true });
}

export async function me(req: AuthenticatedRequest, res: Response) {
  const roles = req.user?.roles || ["Employee"];
  return res.json({
    user: {
      id: req.user?.user_id,
      fullName: req.user?.full_name,
      email: req.user?.email,
      organizationId: req.user?.organization_id || DEFAULT_ORG_ID,
      role: req.user?.platform_role || "user",
      roles,
      apps: req.user?.apps || [],
      platformRole: req.user?.platform_role || "user"
    }
  });
}
