import type { Response } from "express";
import { pool } from "../config/db";
import { hashPassword } from "../lib/passwords";
import type { AuthenticatedRequest } from "../middleware/auth";

type PlatformRole = "SUPER_ADMIN" | "ADMIN" | "USER";
type AppAccess = "HR" | "CARE" | "URSAFE";

type AppAccessInput = { app: AppAccess; enabled: boolean };

let ensureDepartmentsSchemaPromise: Promise<void> | null = null;

function isSuperAdmin(req: AuthenticatedRequest) {
  return req.user?.platform_role === "SUPER_ADMIN" || req.user?.role === "SUPER_ADMIN";
}

function ensureDepartmentsSchema() {
  if (!ensureDepartmentsSchemaPromise) {
    ensureDepartmentsSchemaPromise = (async () => {
      await pool.query(`ALTER TABLE departments ADD COLUMN IF NOT EXISTS department_type TEXT`);
      await pool.query(`UPDATE departments SET department_type = 'Program' WHERE department_type IS NULL`);
      await pool.query(`ALTER TABLE departments ALTER COLUMN department_type SET DEFAULT 'Program'`);
    })().catch((error) => {
      ensureDepartmentsSchemaPromise = null;
      throw error;
    });
  }

  return ensureDepartmentsSchemaPromise;
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
       LEFT JOIN user_app_access uaa ON uaa.user_id = u.id
       GROUP BY u.id, u.organization_id, u.department_id, u.first_name, u.last_name, u.email, u.status, u.role
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

  const { name, email, password, enabled = true, role = "USER", apps = [], departmentId = null } = req.body as {
    name: string;
    email: string;
    password: string;
    enabled?: boolean;
    role?: PlatformRole;
    apps?: AppAccessInput[];
    departmentId?: string | null;
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
    const passwordHash = await hashPassword(password);
    const result = await client.query(
      `INSERT INTO users (organization_id, department_id, email, password_hash, first_name, last_name, status, role)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [req.user?.organization_id, departmentId, email.trim().toLowerCase(), passwordHash, firstName, lastName || firstName, enabled ? "active" : "inactive", role]
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
  const { name, email, password, enabled, role = "USER", apps, departmentId = null } = req.body as {
    name: string;
    email: string;
    password?: string;
    enabled: boolean;
    role?: PlatformRole;
    apps?: AppAccessInput[];
    departmentId?: string | null;
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
      const passwordHash = await hashPassword(password);
      await client.query(
        `UPDATE users
         SET department_id = $1,
             email = $2,
             password_hash = $3,
             first_name = $4,
             last_name = $5,
             status = $6,
             role = $7
         WHERE id = $8`,
        [departmentId, email.trim().toLowerCase(), passwordHash, firstName, lastName || firstName, enabled ? "active" : "inactive", role, userId]
      );
    } else {
      await client.query(
        `UPDATE users
         SET department_id = $1,
             email = $2,
             first_name = $3,
             last_name = $4,
             status = $5,
             role = $6
         WHERE id = $7`,
        [departmentId, email.trim().toLowerCase(), firstName, lastName || firstName, enabled ? "active" : "inactive", role, userId]
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

export async function listDepartments(req: AuthenticatedRequest, res: Response) {
  try {
    if (!isSuperAdmin(req)) {
      return res.status(403).json({ message: "Access denied" });
    }

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
       ORDER BY d.created_at DESC, d.name ASC`,
      [req.user?.organization_id]
    );

    return res.json({ items: result.rows });
  } catch (error) {
    console.error("API error in GET /api/admin/departments", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

export async function createDepartment(req: AuthenticatedRequest, res: Response) {
  try {
    if (!isSuperAdmin(req)) {
      return res.status(403).json({ message: "Access denied" });
    }

    await ensureDepartmentsSchema();

    const { name, address, departmentType = "Program", managerId = null } = req.body as { name: string; address?: string; departmentType?: string; managerId?: string | null };

    if (!name) {
      return res.status(400).json({ message: "Department name is required" });
    }

    if (!["Community housing", "Program"].includes(String(departmentType))) {
      return res.status(400).json({ message: "departmentType must be Community housing or Program" });
    }

    const result = await pool.query(
      `INSERT INTO departments (organization_id, name, department_type, address, manager_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [req.user?.organization_id, name.trim(), String(departmentType), address?.trim() || null, managerId]
    );

    return res.status(201).json({ id: result.rows[0].id });
  } catch (error) {
    console.error("API error in POST /api/admin/departments", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

export async function updateDepartment(req: AuthenticatedRequest, res: Response) {
  try {
    if (!isSuperAdmin(req)) {
      return res.status(403).json({ message: "Access denied" });
    }

    await ensureDepartmentsSchema();

    const departmentId = String(req.params.id || "");
    const { name, address, departmentType = "Program", managerId = null } = req.body as { name: string; address?: string; departmentType?: string; managerId?: string | null };

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
      [name.trim(), String(departmentType), address?.trim() || null, managerId, departmentId, req.user?.organization_id]
    );

    return res.json({ success: true });
  } catch (error) {
    console.error("API error in PUT /api/admin/departments/:id", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

export async function deleteDepartment(req: AuthenticatedRequest, res: Response) {
  try {
    if (!isSuperAdmin(req)) {
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
