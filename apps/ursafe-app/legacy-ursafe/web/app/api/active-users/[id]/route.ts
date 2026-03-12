import { NextRequest, NextResponse } from 'next/server';
import { getConnectionPool } from '../../../../db/connection';

const parseLocation = (value: any) => {
  if (!value) return undefined;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return undefined;
    }
  }
  return value;
};

const toSessionResponse = (row: any) => ({
  id: String(row.SessionId ?? row.sessionId ?? row.id ?? ''),
  userId: String(row.UserId ?? row.userId ?? ''),
  status: (row.Status ?? row.status ?? 'online').toLowerCase(),
  deviceName: row.DeviceName ?? row.deviceName ?? null,
  platform: row.Platform ?? row.platform ?? null,
  startedAt: row.StartedAt ?? row.startedAt ?? '',
  lastSeenAt: row.LastSeenAt ?? row.lastSeenAt ?? row.StartedAt ?? row.startedAt ?? '',
  location: parseLocation(row.Location ?? row.location),
  lastKnownActivity: row.LastKnownActivity ?? row.lastKnownActivity ?? null,
  batteryLevel: row.BatteryLevel ?? row.batteryLevel ?? null,
  notes: row.Notes ?? row.notes ?? null,
});

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const pool = await getConnectionPool();
    const result = await pool.request()
      .input('SessionId', id)
      .query('DELETE FROM ActiveUserSessions WHERE SessionId = @SessionId');
    if (result.rowsAffected[0] === 0) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting active session:', error);
    return NextResponse.json({ error: 'Failed to delete session' }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const updates = await req.json();
    const locationPayload = updates?.location ? JSON.stringify(updates.location) : null;
    const pool = await getConnectionPool();
    const result = await pool.request()
      .input('SessionId', id)
      .input('Status', updates?.status ?? null)
      .input('DeviceName', updates?.deviceName ?? null)
      .input('Platform', updates?.platform ?? null)
      .input('StartedAt', updates?.startedAt ?? null)
      .input('LastSeenAt', updates?.lastSeenAt ?? null)
      .input('Location', locationPayload)
      .input('LastKnownActivity', updates?.lastKnownActivity ?? null)
      .input('BatteryLevel', updates?.batteryLevel ?? null)
      .input('Notes', updates?.notes ?? null)
      .query(`UPDATE ActiveUserSessions
              SET Status = COALESCE(@Status, Status),
                  DeviceName = COALESCE(@DeviceName, DeviceName),
                  Platform = COALESCE(@Platform, Platform),
                  StartedAt = COALESCE(@StartedAt, StartedAt),
                  LastSeenAt = COALESCE(@LastSeenAt, LastSeenAt),
                  Location = COALESCE(@Location, Location),
                  LastKnownActivity = COALESCE(@LastKnownActivity, LastKnownActivity),
                  BatteryLevel = COALESCE(@BatteryLevel, BatteryLevel),
                  Notes = COALESCE(@Notes, Notes)
              WHERE SessionId = @SessionId;
              SELECT * FROM ActiveUserSessions WHERE SessionId = @SessionId;`);

    if (result.recordset.length === 0) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }
    return NextResponse.json(toSessionResponse(result.recordset[0]));
  } catch (error) {
    console.error('Error updating active session:', error);
    return NextResponse.json({ error: 'Failed to update session' }, { status: 500 });
  }
}
