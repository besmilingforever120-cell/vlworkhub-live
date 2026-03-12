import { getConnectionPool } from '../../../db/connection';

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

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const includeStale = searchParams.get('includeStale') === 'true';
    const staleMinutes = Number(searchParams.get('staleMinutes') || 15);
    const cutoff = Date.now() - staleMinutes * 60000;
    const pool = await getConnectionPool();
    let result = await pool.request().query('SELECT * FROM ActiveUserSessions');
    let sessions = result.recordset.map(toSessionResponse);
    if (!includeStale) {
      sessions = sessions.filter((session: any) => new Date(session.lastSeenAt).getTime() >= cutoff);
    }
    sessions.sort((a: any, b: any) => new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime());
    return Response.json(sessions, { status: 200 });
  } catch (error) {
    console.error('Error fetching active users:', error);
    return Response.json({ error: 'Failed to fetch active users' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { userId, status, location, deviceName, platform, sessionId, startedAt, lastSeenAt, batteryLevel, notes, lastKnownActivity } = body;
    if (!userId) {
      return Response.json({ error: 'userId is required' }, { status: 400 });
    }
    const nowIso = new Date().toISOString();
    const pool = await getConnectionPool();
    const numericSessionId = Number.isFinite(Number(sessionId)) ? Number(sessionId) : null;
    const locationPayload = location ? JSON.stringify(location) : null;
    const startedAtUpdate = startedAt ?? null;
    const startedAtInsert = startedAt ?? nowIso;
    const result = await pool.request()
      .input('SessionId', numericSessionId)
      .input('UserId', userId)
      .input('Status', status || 'online')
      .input('DeviceName', deviceName || null)
      .input('Platform', platform || null)
      .input('StartedAtUpdate', startedAtUpdate)
      .input('StartedAtInsert', startedAtInsert)
      .input('LastSeenAt', lastSeenAt || nowIso)
      .input('Location', locationPayload)
      .input('LastKnownActivity', lastKnownActivity || null)
      .input('BatteryLevel', batteryLevel)
      .input('Notes', notes || null)
      .query(`DECLARE @ResolvedSessionId INT;
        IF @SessionId IS NOT NULL AND EXISTS (SELECT 1 FROM ActiveUserSessions WHERE SessionId = @SessionId)
        BEGIN
          SET @ResolvedSessionId = @SessionId;
          UPDATE ActiveUserSessions
          SET UserId=@UserId,
              Status=@Status,
              DeviceName=@DeviceName,
              Platform=@Platform,
              StartedAt=COALESCE(@StartedAtUpdate, StartedAt),
              LastSeenAt=@LastSeenAt,
              Location=@Location,
              LastKnownActivity=@LastKnownActivity,
              BatteryLevel=@BatteryLevel,
              Notes=@Notes
          WHERE SessionId=@SessionId;
        END
        ELSE IF EXISTS (SELECT 1 FROM ActiveUserSessions WHERE UserId = @UserId)
        BEGIN
          SELECT TOP 1 @ResolvedSessionId = SessionId
          FROM ActiveUserSessions
          WHERE UserId = @UserId
          ORDER BY LastSeenAt DESC;
          UPDATE ActiveUserSessions
          SET Status=@Status,
              DeviceName=@DeviceName,
              Platform=@Platform,
              StartedAt=COALESCE(@StartedAtUpdate, StartedAt),
              LastSeenAt=@LastSeenAt,
              Location=@Location,
              LastKnownActivity=@LastKnownActivity,
              BatteryLevel=@BatteryLevel,
              Notes=@Notes
          WHERE SessionId=@ResolvedSessionId;
        END
        ELSE
        BEGIN
          INSERT INTO ActiveUserSessions (UserId, Status, DeviceName, Platform, StartedAt, LastSeenAt, Location, LastKnownActivity, BatteryLevel, Notes)
          VALUES (@UserId, @Status, @DeviceName, @Platform, @StartedAtInsert, @LastSeenAt, @Location, @LastKnownActivity, @BatteryLevel, @Notes);
          SET @ResolvedSessionId = SCOPE_IDENTITY();
        END

        DELETE FROM ActiveUserSessions
        WHERE UserId = @UserId AND SessionId <> @ResolvedSessionId;

        SELECT * FROM ActiveUserSessions WHERE SessionId = @ResolvedSessionId;`);
    return Response.json(toSessionResponse(result.recordset[0]), { status: 201 });
  } catch (error) {
    console.error('Error recording active user session:', error);
    return Response.json({ error: 'Failed to record active session' }, { status: 500 });
  }
}
