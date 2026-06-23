import { pool } from "../config/db";

type OrgUser = {
  userId: string;
  fullName: string;
  departmentName: string | null;
};

type UniqueFullName = {
  userId: string;
  rowCount: number;
};

function normalizeValue(value: unknown) {
  return String(value ?? "").trim();
}

function parseAssigneeTokens(value: string) {
  // Legacy assignee_name storage is comma-delimited; names containing commas are ambiguous.
  return String(value || "")
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean);
}

function normalizeDepartmentToken(token: string) {
  const normalized = normalizeValue(token);
  if (!normalized.toLowerCase().startsWith("department:")) {
    return null;
  }
  return normalizeValue(normalized.slice(normalized.indexOf(":") + 1));
}

function buildUniqueFullNameMap(users: OrgUser[]) {
  const fullNameCounts = new Map<string, UniqueFullName>();

  for (const user of users) {
    if (!user.fullName) {
      continue;
    }

    const current = fullNameCounts.get(user.fullName);
    if (!current) {
      fullNameCounts.set(user.fullName, { userId: user.userId, rowCount: 1 });
      continue;
    }

    fullNameCounts.set(user.fullName, {
      userId: current.userId,
      rowCount: current.rowCount + 1
    });
  }

  return fullNameCounts;
}

function resolveTrainingAssignmentUserIds(tokens: string[], users: OrgUser[]) {
  const userIds = new Set<string>();
  const uniqueFullNameMap = buildUniqueFullNameMap(users);

  for (const token of tokens) {
    if (token === "All Staff") {
      for (const user of users) {
        userIds.add(user.userId);
      }
      continue;
    }

    const departmentName = normalizeDepartmentToken(token);
    if (departmentName) {
      for (const user of users) {
        if (normalizeValue(user.departmentName) === departmentName) {
          userIds.add(user.userId);
        }
      }
      continue;
    }

    const matchedUser = uniqueFullNameMap.get(token);
    if (matchedUser?.rowCount === 1) {
      userIds.add(matchedUser.userId);
    }
  }

  return Array.from(userIds);
}

export async function syncTrainingAssignmentUsers(organizationId: string, assignmentId: number) {
  const assignmentResult = await pool.query(
    `SELECT assignee_name
     FROM hr.training_assignments
     WHERE organization_id = $1 AND id = $2
     LIMIT 1`,
    [organizationId, assignmentId]
  );

  if (!assignmentResult.rowCount) {
    await pool.query(
      `DELETE FROM hr.training_assignment_users
       WHERE organization_id = $1 AND assignment_id = $2`,
      [organizationId, assignmentId]
    );
    return;
  }

  const usersResult = await pool.query(
    `SELECT
       u.id::text AS user_id,
       BTRIM(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')) AS full_name,
       d.name AS department_name
     FROM public.users u
     LEFT JOIN public.departments d ON d.id = u.department_id
     WHERE u.organization_id = $1
       AND u.status = 'active'
     ORDER BY u.first_name ASC, u.last_name ASC, u.email ASC`,
    [organizationId]
  );

  const users = usersResult.rows.map((row) => ({
    userId: String(row.user_id),
    fullName: normalizeValue(row.full_name),
    departmentName: row.department_name ? normalizeValue(row.department_name) : null
  })) as OrgUser[];

  const rawAssigneeName = normalizeValue(assignmentResult.rows[0].assignee_name);
  const tokens = parseAssigneeTokens(rawAssigneeName);
  const userIds = resolveTrainingAssignmentUserIds(tokens, users);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query(
      `DELETE FROM hr.training_assignment_users
       WHERE organization_id = $1 AND assignment_id = $2`,
      [organizationId, assignmentId]
    );

    for (const userId of userIds) {
      await client.query(
        `INSERT INTO hr.training_assignment_users (organization_id, assignment_id, user_id)
         VALUES ($1, $2, $3)
         ON CONFLICT (organization_id, assignment_id, user_id) DO NOTHING`,
        [organizationId, assignmentId, userId]
      );
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}