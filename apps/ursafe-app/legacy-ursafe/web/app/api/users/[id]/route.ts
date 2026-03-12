import { NextRequest, NextResponse } from 'next/server';
import { getConnectionPool } from '../../../../db/connection';
import { sendEmail, generateWelcomeEmail } from '@/lib/email';
// @ts-ignore
import bcrypt from 'bcrypt';

const normalizeRole = (value?: string) => {
  const role = (value || '').toLowerCase();
  if (['admin', 'manager', 'employee'].includes(role)) {
    return role;
  }
  if (
    role === 'super admin' ||
    role === 'super_admin' ||
    role === 'superadmin' ||
    role === 'supper admin' ||
    role === 'supper_admin' ||
    role === 'supperadmin'
  ) {
    return 'super_admin';
  }
  return 'employee';
};
const getRoleLookupNames = (role: string) =>
  role === 'super_admin' ? ['super admin', 'supper admin'] : [role];

const splitName = (fullName?: string) => {
  const parts = (fullName || '').trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] || '',
    lastName: parts.slice(1).join(' '),
  };
};

const toUserResponse = (row: any) => {
  const { firstName, lastName } = splitName(row.FullName ?? row.fullName);
  return {
    id: String(row.UserId ?? row.userId ?? ''),
    email: row.Email ?? row.email ?? '',
    role: normalizeRole(row.RoleName ?? row.role ?? row.Role ?? ''),
    firstName,
    lastName,
    department: row.Department ?? row.department ?? undefined,
    managerId: row.ManagerId ? String(row.ManagerId) : undefined,
    isActive: row.IsActive !== undefined ? Boolean(row.IsActive) : true,
    mustChangePassword: row.MustChangePassword !== undefined ? Boolean(row.MustChangePassword) : Boolean(row.mustChangePassword),
    createdAt: row.CreatedAt instanceof Date ? row.CreatedAt.toISOString() : row.CreatedAt,
    updatedAt: row.UpdatedAt instanceof Date ? row.UpdatedAt.toISOString() : row.UpdatedAt ?? row.CreatedAt,
  };
};

const generatePassword = () => {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@$%';
  const bytes = Array.from({ length: 12 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]);
  return bytes.join('');
};

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { firstName, lastName, email, role, department, managerId, isActive, password, generatePassword: shouldGenerate } = body;

    if (!firstName || !lastName || !email || !role) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const pool = await getConnectionPool();
    const existing = await pool.request()
      .input('UserId', id)
      .query(`
        SELECT u.UserId, u.Email, u.FullName, u.RoleId, u.ManagerId, u.Department, u.IsActive, u.MustChangePassword, u.CreatedAt, u.UpdatedAt,
               r.Name AS RoleName
        FROM Users u
        INNER JOIN Roles r ON u.RoleId = r.RoleId
        WHERE u.UserId = @UserId
      `);
    if (existing.recordset.length === 0) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    const normalizedRole = normalizeRole(role);
    const [roleName, roleAlias] = getRoleLookupNames(normalizedRole);
    const roleResult = await pool.request()
      .input('RoleName', roleName)
      .input('RoleAlias', roleAlias)
      .query('SELECT TOP 1 RoleId FROM Roles WHERE LOWER(Name) IN (@RoleName, @RoleAlias)');
    if (roleResult.recordset.length === 0) {
      return NextResponse.json(
        { error: 'Invalid role' },
        { status: 400 }
      );
    }

    const roleId = roleResult.recordset[0].RoleId;
    const managerIdValue = managerId === '' || managerId === null || managerId === undefined ? null : Number(managerId);
    const numericManagerId = Number.isFinite(managerIdValue) && managerIdValue > 0 ? managerIdValue : null;
    const nowIso = new Date().toISOString();
    const fullName = `${firstName} ${lastName}`.trim();
    const plainPassword = password || (shouldGenerate ? generatePassword() : null);
    const passwordHash = plainPassword ? await bcrypt.hash(plainPassword, 10) : null;
    const mustChangePassword = plainPassword ? Boolean(shouldGenerate && !password) : null;

    const result = await pool.request()
      .input('UserId', id)
      .input('Email', email)
      .input('FullName', fullName)
      .input('RoleId', roleId)
      .input('ManagerId', numericManagerId)
      .input('Department', department || null)
      .input('IsActive', isActive !== undefined ? isActive : 1)
      .input('UpdatedAt', nowIso)
      .input('PasswordHash', passwordHash)
      .input('MustChangePassword', mustChangePassword)
      .query(`UPDATE Users
              SET Email = @Email,
                  FullName = @FullName,
                  RoleId = @RoleId,
                  ManagerId = @ManagerId,
                  Department = @Department,
                  IsActive = @IsActive,
                  UpdatedAt = @UpdatedAt,
                  PasswordHash = COALESCE(@PasswordHash, PasswordHash),
                  MustChangePassword = COALESCE(@MustChangePassword, MustChangePassword)
              WHERE UserId = @UserId;
              SELECT u.UserId, u.Email, u.FullName, u.RoleId, u.ManagerId, u.Department, u.IsActive, u.MustChangePassword, u.CreatedAt, u.UpdatedAt,
                     r.Name AS RoleName
              FROM Users u
              INNER JOIN Roles r ON u.RoleId = r.RoleId
              WHERE u.UserId = @UserId;`);

    if (plainPassword) {
      const emailHtml = generateWelcomeEmail(firstName, email, plainPassword, normalizedRole, Boolean(mustChangePassword));
      await sendEmail({
        to: email,
        subject: 'Your URSafe App Password Has Been Reset',
        html: emailHtml,
      });
    }

    return NextResponse.json(toUserResponse(result.recordset[0]));
  } catch (error) {
    console.error('Error updating user:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const pool = await getConnectionPool();
    const userResult = await pool.request()
      .input('UserId', id)
      .query('SELECT UserId, Email FROM Users WHERE UserId = @UserId');

    if (userResult.recordset.length === 0) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    const dependencyResult = await pool.request()
      .input('UserId', id)
      .query(`
        SELECT
          (SELECT COUNT(1) FROM Trips WHERE UserId = @UserId) AS TripsCount,
          (SELECT COUNT(1) FROM Shifts WHERE UserId = @UserId) AS ShiftsCount,
          (SELECT COUNT(1) FROM CheckIns WHERE UserId = @UserId) AS CheckInsCount,
          (SELECT COUNT(1) FROM Emergencies WHERE UserId = @UserId) AS EmergenciesCount,
          (SELECT COUNT(1) FROM ActiveUserSessions WHERE UserId = @UserId) AS SessionsCount;
      `);

    const counts = dependencyResult.recordset[0] || {};
    const hasDependencies = Object.values(counts).some((value) => Number(value) > 0);

    const email = String(userResult.recordset[0].Email ?? '');
    const suffix = `.archived.${id}.${Date.now()}`;
    const maxPrefixLength = Math.max(1, 255 - suffix.length);
    const trimmedEmail = email.length > maxPrefixLength ? email.slice(0, maxPrefixLength) : email;
    const archivedEmail = `${trimmedEmail}${suffix}`;
    const nowIso = new Date().toISOString();

    await pool.request()
      .input('UserId', id)
      .input('ArchivedEmail', archivedEmail)
      .input('UpdatedAt', nowIso)
      .query(`
        UPDATE Users
        SET Email = @ArchivedEmail,
            IsActive = 0,
            MustChangePassword = 0,
            UpdatedAt = @UpdatedAt
        WHERE UserId = @UserId;
        DELETE FROM ActiveUserSessions WHERE UserId = @UserId;
      `);

    return NextResponse.json({
      message: hasDependencies
        ? 'User archived to preserve existing trips/shifts. You can now recreate or rehire with the original email.'
        : 'User archived successfully. You can now recreate or rehire with the original email.',
      archived: true,
    });
  } catch (error) {
    console.error('Error deleting user:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
