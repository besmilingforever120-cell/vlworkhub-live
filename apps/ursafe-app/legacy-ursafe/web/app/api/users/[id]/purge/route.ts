import { NextRequest, NextResponse } from 'next/server';
import { getConnectionPool } from '../../../../../db/connection';

export async function DELETE(
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
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const record = userResult.recordset[0];
    const isActive = Boolean(record.IsActive ?? true);
    const email = String(record.Email ?? '');
    const isArchivedEmail = email.includes('.archived.');
    if (isActive || !isArchivedEmail) {
      return NextResponse.json(
        { error: 'User must be archived before permanent deletion.' },
        { status: 400 }
      );
    }

    const transaction = pool.transaction();
    await transaction.begin();
    try {
      await transaction.request()
        .input('UserId', id)
        .query('UPDATE Users SET ManagerId = NULL WHERE ManagerId = @UserId');

      await transaction.request()
        .input('UserId', id)
        .query('UPDATE Emergencies SET ResolvedBy = NULL WHERE ResolvedBy = @UserId');

      await transaction.request()
        .input('UserId', id)
        .query('DELETE FROM ActiveUserSessions WHERE UserId = @UserId');

      await transaction.request()
        .input('UserId', id)
        .query(`
          DELETE FROM CheckIns
          WHERE UserId = @UserId
             OR ShiftId IN (SELECT ShiftId FROM Shifts WHERE UserId = @UserId);
        `);

      await transaction.request()
        .input('UserId', id)
        .query(`
          DELETE FROM Emergencies
          WHERE UserId = @UserId
             OR ShiftId IN (SELECT ShiftId FROM Shifts WHERE UserId = @UserId);
        `);

      await transaction.request()
        .input('UserId', id)
        .query('DELETE FROM Shifts WHERE UserId = @UserId');

      await transaction.request()
        .input('UserId', id)
        .query(`
          DELETE trp
          FROM TripRoutePoints trp
          INNER JOIN Trips t ON trp.TripId = t.TripId
          WHERE t.UserId = @UserId;
        `);

      await transaction.request()
        .input('UserId', id)
        .query('DELETE FROM Trips WHERE UserId = @UserId');

      await transaction.request()
        .input('UserId', id)
        .query('DELETE FROM Users WHERE UserId = @UserId');

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }

    return NextResponse.json({ message: 'User and all associated data deleted permanently.' });
  } catch (error) {
    console.error('Error permanently deleting user:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
