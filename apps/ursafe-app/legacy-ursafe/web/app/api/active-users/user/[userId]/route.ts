import { NextRequest, NextResponse } from 'next/server';
import { getConnectionPool } from '../../../../../db/connection';

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  try {
    const { userId } = await params;
    const pool = await getConnectionPool();
    const result = await pool.request()
      .input('UserId', userId)
      .query('DELETE FROM ActiveUserSessions WHERE UserId = @UserId');
    if (result.rowsAffected[0] === 0) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting session by user id:', error);
    return NextResponse.json({ error: 'Failed to delete session' }, { status: 500 });
  }
}
