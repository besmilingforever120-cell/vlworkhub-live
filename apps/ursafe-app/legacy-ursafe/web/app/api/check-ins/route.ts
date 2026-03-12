import { NextRequest, NextResponse } from 'next/server';
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

const toCheckInResponse = (row: any) => ({
  id: String(row.id ?? row.checkInId ?? row.CheckInId ?? ''),
  shiftId: String(row.shiftId ?? row.ShiftId ?? ''),
  userId: String(row.userId ?? row.UserId ?? ''),
  timestamp: row.timestamp ?? row.Timestamp ?? '',
  location: parseLocation(row.location ?? row.Location),
  status: row.status ?? row.Status ?? 'safe',
  notes: row.notes ?? row.Notes ?? '',
});

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const shiftId = searchParams.get('shiftId');
    const pool = await getConnectionPool();
    let result;
    if (shiftId) {
      result = await pool.request().input('ShiftId', shiftId).query('SELECT * FROM CheckIns WHERE ShiftId = @ShiftId');
    } else {
      result = await pool.request().query('SELECT * FROM CheckIns');
    }
    const checkIns = result.recordset.map(toCheckInResponse);
    return Response.json(checkIns);
  } catch (error) {
    console.error('Error fetching check-ins:', error);
    return Response.json({ error: 'Failed to fetch check-ins' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const data = await req.json();
    const { shiftId, userId, location, status, notes } = data;
    if (!shiftId || !userId) {
      return Response.json({ error: 'Shift ID and User ID are required' }, { status: 400 });
    }
    const timestamp = new Date().toISOString();
    const pool = await getConnectionPool();
    const locationPayload = location ? JSON.stringify(location) : null;
    const result = await pool.request()
      .input('ShiftId', shiftId)
      .input('UserId', userId)
      .input('Timestamp', timestamp)
      .input('Location', locationPayload)
      .input('Status', status || 'safe')
      .input('Notes', notes || '')
      .query(`INSERT INTO CheckIns (ShiftId, UserId, Timestamp, Location, Status, Notes)
              OUTPUT INSERTED.*
              VALUES (@ShiftId, @UserId, @Timestamp, @Location, @Status, @Notes)`);
    // Update shift with latest check-in info
    await pool.request()
      .input('ShiftId', shiftId)
      .input('Timestamp', timestamp)
      .input('Location', locationPayload)
      .query(`UPDATE Shifts SET LastCheckIn = @Timestamp, CurrentLocation = @Location, CheckInCount = ISNULL(CheckInCount,0) + 1 WHERE ShiftId = @ShiftId`);
    return Response.json(toCheckInResponse(result.recordset[0]), { status: 201 });
  } catch (error) {
    console.error('Error creating check-in:', error);
    return Response.json({ error: 'Failed to create check-in' }, { status: 500 });
  }
}
