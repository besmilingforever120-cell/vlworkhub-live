import { getConnectionPool } from '../../../db/connection';

const normalizeShiftStatus = (value?: string) => {
  const status = (value || '').toLowerCase();
  if (['active', 'completed', 'emergency'].includes(status)) {
    return status;
  }
  return 'active';
};

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

const toShiftResponse = (row: any) => ({
  id: String(row.id ?? row.shiftId ?? row.ShiftId ?? ''),
  userId: String(row.userId ?? row.UserId ?? ''),
  startTime: row.startTime ?? row.StartTime ?? '',
  endTime: row.endTime ?? row.EndTime ?? undefined,
  status: normalizeShiftStatus(row.status ?? row.Status),
  lastCheckIn: row.lastCheckIn ?? row.LastCheckIn ?? undefined,
  checkInCount: row.checkInCount ?? row.CheckInCount ?? 0,
  startLocation: parseLocation(row.startLocation ?? row.StartLocation),
  endLocation: parseLocation(row.endLocation ?? row.EndLocation),
  currentLocation: parseLocation(row.currentLocation ?? row.CurrentLocation),
  clientName: row.clientName ?? row.ClientName ?? '',
  clientAddress: row.clientAddress ?? row.ClientAddress ?? '',
  expectedDuration: row.expectedDuration ?? row.ExpectedDuration ?? undefined,
  notes: row.notes ?? row.Notes ?? '',
  createdAt: row.createdAt ?? row.CreatedAt ?? undefined,
  updatedAt: row.updatedAt ?? row.UpdatedAt ?? undefined,
});

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');
    const activeOnly = searchParams.get('activeOnly') === 'true';
    const pool = await getConnectionPool();
    let result;
    if (activeOnly && userId) {
      result = await pool.request()
        .input('UserId', userId)
        .query(`SELECT * FROM Shifts WHERE Status = 'ACTIVE' AND UserId = @UserId`);
    } else if (activeOnly) {
      result = await pool.request().query(`SELECT * FROM Shifts WHERE Status = 'ACTIVE'`);
    } else if (userId) {
      result = await pool.request()
        .input('UserId', userId)
        .query('SELECT * FROM Shifts WHERE UserId = @UserId');
    } else {
      result = await pool.request().query('SELECT * FROM Shifts');
    }
    const shifts = result.recordset.map(toShiftResponse);
    return Response.json(shifts);
  } catch (error) {
    console.error('Error fetching shifts:', error);
    return Response.json({ error: 'Failed to fetch shifts' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const data = await req.json();
    const { userId, clientName, clientAddress, expectedDuration, notes, currentLocation, startLocation } = data;
    if (!userId) {
      return Response.json({ error: 'User ID is required' }, { status: 400 });
    }
    const now = new Date().toISOString();
    const pool = await getConnectionPool();
    const startLocationValue = startLocation ?? currentLocation;
    const locationPayload = currentLocation ? JSON.stringify(currentLocation) : null;
    const startLocationPayload = startLocationValue ? JSON.stringify(startLocationValue) : null;
    const result = await pool.request()
      .input('UserId', userId)
      .input('StartTime', now)
      .input('Status', 'ACTIVE')
      .input('CheckInCount', 0)
      .input('ClientName', clientName || '')
      .input('ClientAddress', clientAddress || '')
      .input('ExpectedDuration', expectedDuration || 60)
      .input('Notes', notes || '')
      .input('CurrentLocation', locationPayload)
      .input('StartLocation', startLocationPayload)
      .input('LastCheckIn', null)
      .input('EndTime', null)
      .input('CreatedAt', now)
      .input('UpdatedAt', now)
      .query(`INSERT INTO Shifts (UserId, StartTime, Status, CheckInCount, ClientName, ClientAddress, ExpectedDuration, Notes, CurrentLocation, StartLocation, LastCheckIn, EndTime, CreatedAt, UpdatedAt)
              OUTPUT INSERTED.*
              VALUES (@UserId, @StartTime, @Status, @CheckInCount, @ClientName, @ClientAddress, @ExpectedDuration, @Notes, @CurrentLocation, @StartLocation, @LastCheckIn, @EndTime, @CreatedAt, @UpdatedAt)`);
    return Response.json(toShiftResponse(result.recordset[0]), { status: 201 });
  } catch (error) {
    console.error('Error creating shift:', error);
    return Response.json({ error: 'Failed to create shift' }, { status: 500 });
  }
}
