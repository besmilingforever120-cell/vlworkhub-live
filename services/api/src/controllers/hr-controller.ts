import type { Response } from "express";
import { pool } from "../config/db";
import type { AuthenticatedRequest } from "../middleware/auth";

type HrAssignmentRow = {
  id: number;
  user_id: string;
  hr_role: "ADMIN" | "MANAGER" | "EMPLOYEE";
  manager_id: string | null;
  created_at?: string;
  updated_at?: string;
};

type HrRoleSummary = {
  userId: string;
  role: "admin" | "manager" | "employee";
  managerId: string | null;
};

async function countForOrg(table: string, organizationId: string) {
  const result = await pool.query(`SELECT COUNT(*)::int AS count FROM ${table} WHERE organization_id = $1`, [organizationId]);
  return Number(result.rows[0]?.count || 0);
}

async function getCurrentHrRole(userId: string, organizationId?: string) {
  const params = organizationId ? [userId, organizationId] : [userId];
  const where = organizationId ? "user_id = $1 AND organization_id = $2" : "user_id = $1";
  const result = await pool.query(
    `SELECT role, department_id
     FROM hr_user_roles
     WHERE ${where}
     ORDER BY id DESC
     LIMIT 1`,
    params
  );

  return result.rows[0] || null;
}

async function resolveHrRoleSummary(req: AuthenticatedRequest): Promise<HrRoleSummary> {
  const userId = String(req.user?.user_id || "");
  const organizationId = String(req.user?.organization_id || "");
  const platformRole = String(req.user?.platform_role || req.user?.role || "USER").toUpperCase();

  if (platformRole === "SUPER_ADMIN") {
    return { userId, role: "admin", managerId: null };
  }

  const currentHrRole = await getCurrentHrRole(userId, organizationId);
  if (!currentHrRole) {
    return { userId, role: "employee", managerId: null };
  }

  const normalizedRole = String(currentHrRole.role || "employee").toLowerCase();
  return {
    userId,
    role: normalizedRole === "admin" || normalizedRole === "manager" ? normalizedRole : "employee",
    managerId: currentHrRole.department_id ? String(currentHrRole.department_id) : null
  };
}

export async function getMyHrRole(req: AuthenticatedRequest, res: Response) {
  try {
    const summary = await resolveHrRoleSummary(req);
    console.log("[HR API] GET /hr/my-role", summary);
    return res.status(200).json(summary);
  } catch (error) {
    console.error("API error in GET /hr/my-role", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

export async function getHrDashboard(req: AuthenticatedRequest, res: Response) {
  try {
    const organizationId = String(req.user?.organization_id || "");
    const currentUserId = String(req.user?.user_id || "");
    const currentHrRole = await resolveHrRoleSummary(req);
    const totalHrAssignments = await pool.query(`SELECT COUNT(*)::int AS count FROM hr_user_roles WHERE organization_id = $1`, [organizationId]);

    const payload = {
      documents: await countForOrg("documents", organizationId),
      training: await countForOrg("training_assignments", organizationId),
      tasks: await countForOrg("tasks", organizationId),
      surveys: await countForOrg("survey_assignments", organizationId)
    };

    console.log("[HR API] GET /hr/dashboard", {
      userId: currentUserId,
      hasHrRole: currentHrRole.role !== "employee" || Boolean(currentHrRole.managerId),
      currentHrRole: currentHrRole.role,
      currentManagerId: currentHrRole.managerId,
      hrAssignmentCount: Number(totalHrAssignments.rows[0]?.count || 0),
      payload
    });

    return res.status(200).json(payload);
  } catch (error) {
    console.error("API error in GET /hr/dashboard", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

export async function listHrAssignments(req: AuthenticatedRequest, res: Response) {
  try {
    const organizationId = String(req.user?.organization_id || "");
    const result = await pool.query<HrAssignmentRow>(
      `SELECT
         id,
         user_id,
         UPPER(role) AS hr_role,
         NULLIF(department_id, '') AS manager_id,
         created_at,
         NULL::text AS updated_at
       FROM hr_user_roles
       WHERE organization_id = $1
       ORDER BY id DESC`,
      [organizationId]
    );

    return res.json({ items: result.rows });
  } catch (error) {
    console.error("API error in GET /hr/user-roles", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

export async function saveHrAssignment(req: AuthenticatedRequest, res: Response) {
  try {
    const organizationId = String(req.user?.organization_id || "");
    const { userId, hrRole, managerId } = req.body as {
      userId?: string;
      hrRole?: string;
      managerId?: string | null;
    };

    const normalizedRole = String(hrRole || "").toUpperCase();
    const normalizedManagerId = managerId ? String(managerId) : null;

    console.log("[HR API] POST /hr/user-roles payload", { userId, hrRole: normalizedRole, managerId: normalizedManagerId });

    if (!userId || !normalizedRole) {
      return res.status(400).json({ message: "userId and hrRole are required" });
    }

    if (!["ADMIN", "MANAGER", "EMPLOYEE"].includes(normalizedRole)) {
      return res.status(400).json({ message: "hrRole must be ADMIN, MANAGER, or EMPLOYEE" });
    }

    if (normalizedManagerId && normalizedManagerId === userId) {
      return res.status(400).json({ message: "managerId cannot equal userId" });
    }

    const userResult = await pool.query(
      `SELECT id FROM users WHERE id = $1 AND organization_id = $2 AND status = 'active' LIMIT 1`,
      [userId, organizationId]
    );

    if (userResult.rowCount === 0) {
      return res.status(400).json({ message: "Selected user was not found in the platform users list" });
    }

    if (normalizedManagerId) {
      const managerResult = await pool.query(
        `SELECT id FROM users WHERE id = $1 AND organization_id = $2 AND status = 'active' LIMIT 1`,
        [normalizedManagerId, organizationId]
      );

      if (managerResult.rowCount === 0) {
        return res.status(400).json({ message: "Selected manager was not found in the platform users list" });
      }
    }

    const existing = await pool.query(
      `SELECT id
       FROM hr_user_roles
       WHERE organization_id = $1 AND user_id = $2
       LIMIT 1`,
      [organizationId, userId]
    );

    let saved;
    if (existing.rowCount) {
      saved = await pool.query<HrAssignmentRow>(
        `UPDATE hr_user_roles
         SET role = LOWER($1),
             department_id = $2
         WHERE id = $3
         RETURNING id, user_id, UPPER(role) AS hr_role, NULLIF(department_id, '') AS manager_id, created_at, NULL::text AS updated_at`,
        [normalizedRole, normalizedManagerId, existing.rows[0].id]
      );
    } else {
      saved = await pool.query<HrAssignmentRow>(
        `INSERT INTO hr_user_roles (organization_id, user_id, role, department_id)
         VALUES ($1, $2, LOWER($3), $4)
         RETURNING id, user_id, UPPER(role) AS hr_role, NULLIF(department_id, '') AS manager_id, created_at, NULL::text AS updated_at`,
        [organizationId, userId, normalizedRole, normalizedManagerId]
      );
    }

    return res.json({ success: true, item: saved.rows[0] });
  } catch (error) {
    console.error("API error in POST /hr/user-roles", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
