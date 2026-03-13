import crypto from "node:crypto";
import type { Response } from "express";
import { pool } from "../config/db";
import type { AuthenticatedRequest } from "../middleware/auth";

type PlatformRole = "super_admin" | "user";
type AppAccess = "HR" | "CARE" | "URSAFE";

type AppAccessInput = { app: AppAccess; enabled: boolean };

function hashPassword(password: string) {
  return crypto.createHash("sha256").update(password).digest("hex");
}

function isSuperAdmin(req: AuthenticatedRequest) {
  return req.user?.platform_role === "super_admin";
}

export async function listUsers(_: AuthenticatedRequest, res: Response) {
  const result = await pool.query(
    `SELECT id, name, email
     FROM users
     WHERE enabled = TRUE
     ORDER BY name ASC, email ASC`
  );

  return res.json({ items: result.rows });
}

export async function getMyAppAccess(req: AuthenticatedRequest, res: Response) {
  const result = await pool.query(
    `SELECT UPPER(app) AS app, enabled
     FROM user_app_access
     WHERE user_id = $1 AND enabled = TRUE
     ORDER BY app ASC`,
    [req.user?.user_id]
  );

  return res.json(result.rows);
}

export async function listAdminUsers(req: AuthenticatedRequest, res: Response) {
  if (!isSuperAdmin(req)) {
    return res.status(403).json({ message: "Access denied" });
  }

  const result = await pool.query(
    `SELECT
       u.id,
       u.name,
       u.email,
       u.enabled,
       u.role,
       COALESCE(
         json_agg(
           json_build_object('app', UPPER(uaa.app), 'enabled', uaa.enabled)
           ORDER BY UPPER(uaa.app)
         ) FILTER (WHERE uaa.id IS NOT NULL),
         '[]'::json
       ) AS app_access
     FROM users u
     LEFT JOIN user_app_access uaa ON uaa.user_id = u.id
     GROUP BY u.id, u.name, u.email, u.enabled, u.role
     ORDER BY u.name ASC, u.email ASC`
  );

  return res.json({ items: result.rows });
}

export async function createAdminUser(req: AuthenticatedRequest, res: Response) {
  if (!isSuperAdmin(req)) {
    return res.status(403).json({ message: "Access denied" });
  }

  const { name, email, password, enabled = true, role = "user", apps = [] } = req.body as {
    name: string;
    email: string;
    password: string;
    enabled?: boolean;
    role?: PlatformRole;
    apps?: AppAccessInput[];
  };

  if (!name || !email || !password) {
    return res.status(400).json({ message: "Name, email, and password are required" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `INSERT INTO users (name, email, password_hash, role, enabled)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [name.trim(), email.trim().toLowerCase(), hashPassword(password), role, enabled]
    );

    for (const item of apps.filter((entry) => entry.enabled)) {
      await client.query(
        `INSERT INTO user_app_access (user_id, app, enabled)
         VALUES ($1, $2, $3)`,
        [result.rows[0].id, item.app, true]
      );
    }

    await client.query("COMMIT");
    return res.status(201).json({ id: result.rows[0].id });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function updateAdminUser(req: AuthenticatedRequest, res: Response) {
  if (!isSuperAdmin(req)) {
    return res.status(403).json({ message: "Access denied" });
  }

  const userId = String(req.params.id || "");
  const { name, email, password, enabled, role = "user", apps } = req.body as {
    name: string;
    email: string;
    password?: string;
    enabled: boolean;
    role?: PlatformRole;
    apps?: AppAccessInput[];
  };

  if (!userId || !name || !email) {
    return res.status(400).json({ message: "User id, name, and email are required" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    if (password) {
      await client.query(
        `UPDATE users
         SET name = $1,
             email = $2,
             password_hash = $3,
             role = $4,
             enabled = $5
         WHERE id = $6`,
        [name.trim(), email.trim().toLowerCase(), hashPassword(password), role, enabled, userId]
      );
    } else {
      await client.query(
        `UPDATE users
         SET name = $1,
             email = $2,
             role = $3,
             enabled = $4
         WHERE id = $5`,
        [name.trim(), email.trim().toLowerCase(), role, enabled, userId]
      );
    }

    if (apps) {
      await client.query(`DELETE FROM user_app_access WHERE user_id = $1`, [userId]);
      for (const item of apps.filter((entry) => entry.enabled)) {
        await client.query(
          `INSERT INTO user_app_access (user_id, app, enabled)
           VALUES ($1, $2, $3)`,
          [userId, item.app, true]
        );
      }
    }

    await client.query("COMMIT");
    return res.json({ success: true });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function upsertUserAppAccess(req: AuthenticatedRequest, res: Response) {
  if (!isSuperAdmin(req)) {
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
  const updateResult = await pool.query(
    `UPDATE user_app_access
     SET enabled = $1
     WHERE user_id = $2 AND UPPER(app) = $3`,
    [enabled, userId, normalizedApp]
  );

  if (updateResult.rowCount === 0) {
    await pool.query(
      `INSERT INTO user_app_access (user_id, app, enabled)
       VALUES ($1, $2, $3)`,
      [userId, normalizedApp, enabled]
    );
  }

  return res.json({ success: true });
}
