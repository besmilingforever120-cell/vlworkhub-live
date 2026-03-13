import crypto from "node:crypto";
import type { Response } from "express";
import { pool } from "../config/db";
import type { AuthenticatedRequest } from "../middleware/auth";

type PlatformRole = "SUPER_ADMIN" | "ADMIN" | "USER";
type AppAccess = "HR" | "CARE" | "URSAFE";

type AppAccessInput = { app: AppAccess; enabled: boolean };

function hashPassword(password: string) {
  return crypto.createHash("sha256").update(password).digest("hex");
}

function isSuperAdmin(req: AuthenticatedRequest) {
  return req.user?.platform_role === "SUPER_ADMIN" || req.user?.role === "SUPER_ADMIN";
}

export async function listUsers(_: AuthenticatedRequest, res: Response) {
  try {
    const result = await pool.query(
      `SELECT
         id,
         TRIM(COALESCE(first_name, '') || ' ' || COALESCE(last_name, '')) AS name,
         email
       FROM users
       WHERE status = 'active'
       ORDER BY first_name ASC, last_name ASC, email ASC`
    );

    return res.json({ items: result.rows });
  } catch (error) {
    console.error("API error in GET /api/users", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

export async function getMyAppAccess(req: AuthenticatedRequest, res: Response) {
  try {
    const result = await pool.query(
      `SELECT UPPER(uaa.app) AS app, TRUE AS enabled
       FROM user_app_access uaa
       INNER JOIN users u ON u.id = uaa.user_id
       WHERE uaa.user_id = $1
         AND u.status = 'active'
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
    if (!isSuperAdmin(req)) {
      return res.status(403).json({ message: "Access denied" });
    }

    const result = await pool.query(
      `SELECT
         u.id,
         u.organization_id,
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
       LEFT JOIN user_app_access uaa ON uaa.user_id = u.id
       GROUP BY u.id, u.organization_id, u.first_name, u.last_name, u.email, u.status, u.role
       ORDER BY u.first_name ASC, u.last_name ASC, u.email ASC`
    );

    return res.json({ items: result.rows });
  } catch (error) {
    console.error("API error in GET /api/admin/users", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

export async function createAdminUser(req: AuthenticatedRequest, res: Response) {
  if (!isSuperAdmin(req)) {
    return res.status(403).json({ message: "Access denied" });
  }

  const { name, email, password, enabled = true, role = "USER", apps = [] } = req.body as {
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

  const parts = name.trim().split(/\s+/);
  const firstName = parts.shift() || name.trim();
  const lastName = parts.join(" ");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `INSERT INTO users (organization_id, email, password_hash, first_name, last_name, status, role)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [req.user?.organization_id, email.trim().toLowerCase(), hashPassword(password), firstName, lastName || firstName, enabled ? "active" : "inactive", role]
    );

    for (const item of apps.filter((entry) => entry.enabled)) {
      await client.query(
        `INSERT INTO user_app_access (user_id, app)
         VALUES ($1, $2)`,
        [result.rows[0].id, item.app]
      );
    }

    await client.query("COMMIT");
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
  if (!isSuperAdmin(req)) {
    return res.status(403).json({ message: "Access denied" });
  }

  const userId = String(req.params.id || "");
  const { name, email, password, enabled, role = "USER", apps } = req.body as {
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

  const parts = name.trim().split(/\s+/);
  const firstName = parts.shift() || name.trim();
  const lastName = parts.join(" ");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    if (password) {
      await client.query(
        `UPDATE users
         SET email = $1,
             password_hash = $2,
             first_name = $3,
             last_name = $4,
             status = $5,
             role = $6
         WHERE id = $7`,
        [email.trim().toLowerCase(), hashPassword(password), firstName, lastName || firstName, enabled ? "active" : "inactive", role, userId]
      );
    } else {
      await client.query(
        `UPDATE users
         SET email = $1,
             first_name = $2,
             last_name = $3,
             status = $4,
             role = $5
         WHERE id = $6`,
        [email.trim().toLowerCase(), firstName, lastName || firstName, enabled ? "active" : "inactive", role, userId]
      );
    }

    if (apps) {
      await client.query(`DELETE FROM user_app_access WHERE user_id = $1`, [userId]);
      for (const item of apps.filter((entry) => entry.enabled)) {
        await client.query(
          `INSERT INTO user_app_access (user_id, app)
           VALUES ($1, $2)`,
          [userId, item.app]
        );
      }
    }

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
