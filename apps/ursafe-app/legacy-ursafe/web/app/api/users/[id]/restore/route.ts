import { NextRequest, NextResponse } from 'next/server';
import { getConnectionPool } from '../../../../../db/connection';

const extractOriginalEmail = (email: string) => {
  const marker = '.archived.';
  const index = email.indexOf(marker);
  if (index > 0) {
    return email.slice(0, index);
  }
  return email;
};

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const pool = await getConnectionPool();

    const userResult = await pool.request()
      .input('UserId', id)
      .query('SELECT UserId, Email, IsActive FROM Users WHERE UserId = @UserId');

    if (userResult.recordset.length === 0) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    const email = String(userResult.recordset[0].Email ?? '');
    const originalEmail = extractOriginalEmail(email).trim();

    if (!originalEmail) {
      return NextResponse.json(
        { error: 'Unable to restore email for this user' },
        { status: 400 }
      );
    }

    const conflict = await pool.request()
      .input('Email', originalEmail)
      .input('UserId', id)
      .query('SELECT TOP 1 UserId FROM Users WHERE Email = @Email AND UserId <> @UserId');

    if (conflict.recordset.length > 0) {
      return NextResponse.json(
        { error: 'Email is already in use. Remove or archive the existing account before rehiring.' },
        { status: 409 }
      );
    }

    const nowIso = new Date().toISOString();
    await pool.request()
      .input('UserId', id)
      .input('Email', originalEmail)
      .input('UpdatedAt', nowIso)
      .query(`
        UPDATE Users
        SET Email = @Email,
            IsActive = 1,
            UpdatedAt = @UpdatedAt
        WHERE UserId = @UserId;
      `);

    return NextResponse.json({ message: 'User reactivated successfully.' });
  } catch (error) {
    console.error('Error restoring user:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
