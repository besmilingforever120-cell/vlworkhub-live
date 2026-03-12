import { NextRequest, NextResponse } from 'next/server';
import { getConnectionPool } from '../../../../db/connection';

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

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: 'Shift ID is required' }, { status: 400 });
    }

    const body = await request.json();
    const status = body?.status ? normalizeShiftStatus(body.status) : null;
    const endTime = body?.endTime ?? null;
    const lastCheckIn = body?.lastCheckIn ?? null;
    const checkInCount = Number.isFinite(body?.checkInCount) ? body.checkInCount : null;
    const currentLocation = body?.currentLocation ? JSON.stringify(body.currentLocation) : null;
    const shouldSetEndLocation = Boolean(endTime || status === 'completed');
    const endLocationValue = body?.endLocation ?? (shouldSetEndLocation ? body?.currentLocation : null);
    const endLocation = endLocationValue ? JSON.stringify(endLocationValue) : null;
    const updatedAt = new Date().toISOString();

    const pool = await getConnectionPool();
    const result = await pool.request()
      .input('ShiftId', id)
      .input('Status', status)
      .input('EndTime', endTime)
      .input('LastCheckIn', lastCheckIn)
      .input('CheckInCount', checkInCount)
      .input('CurrentLocation', currentLocation)
      .input('EndLocation', endLocation)
      .input('UpdatedAt', updatedAt)
      .query(`UPDATE Shifts
              SET Status = COALESCE(@Status, Status),
                  EndTime = COALESCE(@EndTime, EndTime),
                  LastCheckIn = COALESCE(@LastCheckIn, LastCheckIn),
                  CheckInCount = COALESCE(@CheckInCount, CheckInCount),
                  CurrentLocation = COALESCE(@CurrentLocation, CurrentLocation),
                  EndLocation = COALESCE(@EndLocation, EndLocation),
                  UpdatedAt = @UpdatedAt
              WHERE ShiftId = @ShiftId;
              SELECT * FROM Shifts WHERE ShiftId = @ShiftId;`);

    if (result.recordset.length === 0) {
      return NextResponse.json({ error: 'Shift not found' }, { status: 404 });
    }

    return NextResponse.json(toShiftResponse(result.recordset[0]));
  } catch (error) {
    console.error('Error updating shift:', error);
    return NextResponse.json({ error: 'Failed to update shift' }, { status: 500 });
  }
}
