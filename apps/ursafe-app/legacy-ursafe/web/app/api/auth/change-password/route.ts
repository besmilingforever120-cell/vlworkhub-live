import { NextRequest, NextResponse } from 'next/server';
import { getConnectionPool } from '../../../../db/connection';
import { generatePasswordUpdatedEmail, sendEmail } from '@/lib/email';
// @ts-ignore
import bcrypt from 'bcrypt';

const splitName = (fullName?: string) => {
  const parts = (fullName || '').trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] || '',
    lastName: parts.slice(1).join(' '),
  };
};

export async function POST(request: NextRequest) {
  try {
    const { email, currentPassword, newPassword } = await request.json();

    if (!email || !currentPassword || !newPassword) {
      return NextResponse.json(
        { error: 'Email, current password, and new password are required' },
        { status: 400 }
      );
    }

    const pool = await getConnectionPool();
    const result = await pool
      .request()
      .input('Email', email)
      .query(`SELECT TOP 1 UserId, Email, FullName, PasswordHash, IsActive FROM Users WHERE Email = @Email`);

    if (result.recordset.length === 0) {
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      );
    }

    const user = result.recordset[0];
    if (user.IsActive === false || user.IsActive === 0) {
      return NextResponse.json(
        { error: 'Account is disabled. Contact your administrator.' },
        { status: 403 }
      );
    }

    const passwordMatches = await bcrypt.compare(currentPassword, user.PasswordHash);
    if (!passwordMatches) {
      return NextResponse.json(
        { error: 'Current password is incorrect' },
        { status: 401 }
      );
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    const nowIso = new Date().toISOString();

    await pool.request()
      .input('UserId', user.UserId)
      .input('PasswordHash', passwordHash)
      .input('UpdatedAt', nowIso)
      .query(`UPDATE Users
              SET PasswordHash = @PasswordHash,
                  MustChangePassword = 0,
                  UpdatedAt = @UpdatedAt
              WHERE UserId = @UserId`);

    const { firstName } = splitName(user.FullName);
    const emailHtml = generatePasswordUpdatedEmail(firstName || 'there');
    await sendEmail({
      to: user.Email,
      subject: 'Your URSafe App Password Was Updated',
      html: emailHtml,
    });

    return NextResponse.json({ message: 'Password updated successfully' });
  } catch (error) {
    console.error('Error updating password:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
