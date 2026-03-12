import crypto from "node:crypto";
import type { Request, Response } from "express";
import type { RowDataPacket } from "mysql2";
import { buildCookie, clearCookie, signAuthToken } from "@vlworkhub/auth";
import { env } from "../config/env";
import { pool } from "../config/db";
import type { AuthenticatedRequest } from "../middleware/auth";

function hashPassword(password: string) {
  return crypto.createHash("sha256").update(password).digest("hex");
}

const devUser = {
  id: 1,
  full_name: "Platform Admin",
  email: "admin@vlworkhub.ca",
  password_hash: hashPassword("Password123!"),
  organization_id: 1,
  role: "Admin"
};

async function findUserByEmail(email: string) {
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      "SELECT id, full_name, email, password_hash, organization_id, role FROM users WHERE email = ? LIMIT 1",
      [email]
    );

    return rows[0] || null;
  } catch (error) {
    if (env.nodeEnv !== "production" && email === devUser.email) {
      console.warn("Database unavailable, using development auth fallback.", error);
      return devUser;
    }

    throw error;
  }
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

  const token = signAuthToken(
    {
      user_id: user.id,
      organization_id: user.organization_id,
      role: user.role,
      email: user.email,
      full_name: user.full_name
    },
    env.jwtSecret
  );

  res.setHeader("Set-Cookie", buildCookie(token, env.cookieDomain));
  return res.json({
    token,
    user: {
      id: user.id,
      fullName: user.full_name,
      email: user.email,
      organizationId: user.organization_id,
      role: user.role
    }
  });
}

export async function logout(_: Request, res: Response) {
  res.setHeader("Set-Cookie", clearCookie(env.cookieDomain));
  return res.json({ success: true });
}

export async function me(req: AuthenticatedRequest, res: Response) {
  return res.json({
    user: {
      id: req.user?.user_id,
      fullName: req.user?.full_name,
      email: req.user?.email,
      organizationId: req.user?.organization_id,
      role: req.user?.role
    }
  });
}
