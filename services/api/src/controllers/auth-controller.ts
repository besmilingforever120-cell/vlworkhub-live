import crypto from "node:crypto";
import type { Request, Response } from "express";
import type { QueryResultRow } from "pg";
import { buildCookie, clearCookie, signAuthToken } from "@vlworkhub/auth";
import { env } from "../config/env";
import { pool } from "../config/db";
import type { AuthenticatedRequest } from "../middleware/auth";

type UserRole = "Admin" | "Manager" | "Employee" | "HR" | "IT";
type AppAccess = "main-platform" | "care" | "hr" | "ursafe";

type SessionUser = {
  id: string;
  fullName: string;
  email: string;
  organizationId: string;
  role: UserRole;
  roles: UserRole[];
  apps: AppAccess[];
};

const DEV_ORG_ID = "11111111-1111-1111-1111-111111111111";
const DEV_USER_ID = "22222222-2222-2222-2222-222222222222";

function hashPassword(password: string) {
  return crypto.createHash("sha256").update(password).digest("hex");
}

type UserRecord = QueryResultRow & {
  id: string;
  email: string;
  password_hash: string;
  first_name: string;
  last_name: string;
  organization_id: string;
  roles: UserRole[];
  apps: AppAccess[];
};

const devUser: UserRecord = {
  id: DEV_USER_ID,
  email: "admin@vlworkhub.ca",
  password_hash: hashPassword("Password123!"),
  first_name: "Platform",
  last_name: "Admin",
  organization_id: DEV_ORG_ID,
  roles: ["Admin"],
  apps: ["main-platform", "care", "hr", "ursafe"]
};

async function findUserByEmail(email: string) {
  try {
    const result = await pool.query<UserRecord>(
      `SELECT
         u.id,
         u.email,
         u.password_hash,
         u.first_name,
         u.last_name,
         u.organization_id,
         COALESCE(array_remove(array_agg(DISTINCT ur.role), NULL), '{}') AS roles,
         COALESCE(array_remove(array_agg(DISTINCT uaa.app), NULL), '{}') AS apps
       FROM users u
       LEFT JOIN user_roles ur ON ur.user_id = u.id
       LEFT JOIN user_app_access uaa ON uaa.user_id = u.id
       WHERE u.email = $1 AND u.status = 'active'
       GROUP BY u.id
       LIMIT 1`,
      [email]
    );

    return result.rows[0] || null;
  } catch (error) {
    if (env.nodeEnv !== "production" && email === devUser.email) {
      console.warn("Database unavailable, using development auth fallback.", error);
      return devUser;
    }

    throw error;
  }
}

function toSessionUser(user: UserRecord): SessionUser {
  const fullName = `${user.first_name} ${user.last_name}`.trim();
  return {
    id: user.id,
    fullName,
    email: user.email,
    organizationId: user.organization_id,
    role: user.roles[0] || "Employee",
    roles: user.roles,
    apps: user.apps
  };
}

export async function login(req: Request, res: Response) {
  const { email, password } = req.body as { email: string; password: string };

  if (!email || !password) {
    return res.status(400).json({ message: "Email and password are required" });
  }

  const user = await findUserByEmail(email);

  if (!user || user.password_hash !== hashPassword(password)) {
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
      full_name: sessionUser.fullName
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
      organizationId: req.user?.organization_id,
      role: roles[0],
      roles,
      apps: req.user?.apps || []
    }
  });
}
