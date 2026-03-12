import { NextRequest, NextResponse } from 'next/server';
import { getConnectionPool } from '../../../../db/connection';
import { getUserByEmail } from '@/lib/db';
// @ts-ignore
import bcrypt from 'bcrypt';

async function buildResponseFromLocalUser(email: string, password: string) {
  const user = getUserByEmail(email);
  if (!user || !user.password) {
    return null;
  }

  const passwordMatches =
    user.password === password ||
    await bcrypt.compare(password, user.password).catch(() => false);

  if (!passwordMatches) {
    return null;
  }

  if (user.isActive === false) {
    return NextResponse.json(
      { error: 'Account is disabled. Contact your administrator.' },
      { status: 403 }
    );
  }

  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      firstName: user.firstName,
      lastName: user.lastName,
      managerId: user.managerId,
      isActive: user.isActive ?? true,
      mustChangePassword: false,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    },
    message: 'Login successful'
  });
}

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    try {
      const pool = await getConnectionPool();
      const result = await pool
        .request()
        .input('Email', email)
        .query(`SELECT TOP 1
          u.UserId,
          u.Email,
          u.PasswordHash,
          u.FullName,
          u.RoleId,
          u.ManagerId,
          u.IsActive,
          u.MustChangePassword,
          u.CreatedAt,
          r.Name AS RoleName
        FROM Users u
        INNER JOIN Roles r ON u.RoleId = r.RoleId
        WHERE u.Email = @Email`);

      if (result.recordset.length > 0) {
        const user = result.recordset[0];
        const passwordMatches = await bcrypt.compare(password, user.PasswordHash);

        if (passwordMatches) {
          const fullName = (user.FullName || '').trim();
          const nameParts = fullName ? fullName.split(/\s+/) : [];
          const firstName = nameParts[0] || '';
          const lastName = nameParts.slice(1).join(' ');
          const roleName = (user.RoleName || '').toLowerCase();
          const normalizedRole = roleName === 'super admin' ||
            roleName === 'super_admin' ||
            roleName === 'superadmin' ||
            roleName === 'supper admin' ||
            roleName === 'supper_admin' ||
            roleName === 'supperadmin'
            ? 'super_admin'
            : roleName === 'admin' || roleName === 'manager' || roleName === 'employee'
              ? roleName
              : 'employee';

          if (user.IsActive === false || user.IsActive === 0) {
            return NextResponse.json(
              { error: 'Account is disabled. Contact your administrator.' },
              { status: 403 }
            );
          }

          return NextResponse.json({
            user: {
              id: String(user.UserId),
              email: user.Email,
              role: normalizedRole,
              firstName,
              lastName,
              managerId: user.ManagerId ? String(user.ManagerId) : undefined,
              isActive: user.IsActive !== undefined ? Boolean(user.IsActive) : true,
              mustChangePassword: user.MustChangePassword !== undefined ? Boolean(user.MustChangePassword) : false,
              createdAt: user.CreatedAt instanceof Date ? user.CreatedAt.toISOString() : String(user.CreatedAt),
              updatedAt: user.CreatedAt instanceof Date ? user.CreatedAt.toISOString() : String(user.CreatedAt),
            },
            message: 'Login successful'
          });
        }
      }
    } catch (error) {
      console.error('SQL login failed, falling back to local users:', error);
    }

    const localResponse = await buildResponseFromLocalUser(email, password);
    if (localResponse) {
      return localResponse;
    }

    return NextResponse.json(
      { error: 'Invalid credentials' },
      { status: 401 }
    );
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
