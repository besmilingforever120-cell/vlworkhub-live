
import { NextRequest, NextResponse } from 'next/server';
import { getConnectionPool } from '../../../db/connection';
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

export async function GET(request: NextRequest) {
  try {
    const pool = await getConnectionPool();
    const result = await pool.request().query(`
      SELECT u.UserId, u.Email, u.FullName, u.RoleId, u.ManagerId, u.Department, u.IsActive, u.MustChangePassword, u.CreatedAt, u.UpdatedAt,
             r.Name AS RoleName
      FROM Users u
      INNER JOIN Roles r ON u.RoleId = r.RoleId
    `);
    return NextResponse.json(result.recordset.map(toUserResponse));
  } catch (error) {
    console.error('Error fetching users:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, firstName, lastName, role, department, managerId, password, generatePassword: shouldGenerate } = body;

    if (!email || !firstName || !lastName || !role) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const pool = await getConnectionPool();
    // Check if user already exists
    const existing = await pool.request().input('Email', email).query('SELECT UserId FROM Users WHERE Email = @Email');
    if (existing.recordset.length > 0) {
      return NextResponse.json(
        { error: 'User with this email already exists' },
        { status: 409 }
      );
    }

    // Hash the password before saving
    const plainPassword = password || (shouldGenerate ? generatePassword() : null);
    if (!plainPassword) {
      return NextResponse.json(
        { error: 'Password is required or enable auto-generate' },
        { status: 400 }
      );
    }
    const passwordHash = await bcrypt.hash(plainPassword, 10);
    const mustChangePassword = Boolean(shouldGenerate && !password);

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
    const numericManagerId = managerIdValue !== null && Number.isFinite(managerIdValue) && managerIdValue > 0 ? managerIdValue : null;
    const nowIso = new Date().toISOString();
    const fullName = `${firstName} ${lastName}`.trim();

    const result = await pool.request()
      .input('Email', email)
      .input('PasswordHash', passwordHash)
      .input('FullName', fullName)
      .input('RoleId', roleId)
      .input('ManagerId', numericManagerId)
      .input('Department', department || null)
      .input('IsActive', 1)
      .input('MustChangePassword', mustChangePassword ? 1 : 0)
      .input('CreatedAt', nowIso)
      .input('UpdatedAt', nowIso)
      .query(`INSERT INTO Users (Email, PasswordHash, FullName, RoleId, ManagerId, Department, IsActive, MustChangePassword, CreatedAt, UpdatedAt)
              OUTPUT INSERTED.UserId, INSERTED.Email, INSERTED.FullName, INSERTED.RoleId, INSERTED.ManagerId, INSERTED.Department, INSERTED.IsActive, INSERTED.MustChangePassword, INSERTED.CreatedAt, INSERTED.UpdatedAt
              VALUES (@Email, @PasswordHash, @FullName, @RoleId, @ManagerId, @Department, @IsActive, @MustChangePassword, @CreatedAt, @UpdatedAt)`);

    const emailHtml = generateWelcomeEmail(firstName, email, plainPassword, normalizedRole, mustChangePassword);
    await sendEmail({
      to: email,
      subject: 'Your URSafe App Account',
      html: emailHtml,
    });

    return NextResponse.json(toUserResponse({ ...result.recordset[0], RoleName: normalizedRole }), { status: 201 });
  } catch (error) {
    console.error('Error creating user:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
