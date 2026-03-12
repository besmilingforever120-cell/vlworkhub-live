import { NextRequest, NextResponse } from 'next/server';
import { getConnectionPool } from '../../../db/connection';
import { parseEmergencyNotes } from '@/lib/emergency-notes';

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

const toEmergencyResponse = (row: any) => {
  const base = {
    id: String(row.id ?? row.emergencyId ?? row.EmergencyId ?? ''),
    userId: String(row.userId ?? row.UserId ?? ''),
    shiftId: row.shiftId ?? row.ShiftId ?? undefined,
    type: row.type ?? row.Type ?? '',
    location: parseLocation(row.location ?? row.Location),
    timestamp: row.timestamp ?? row.Timestamp ?? '',
    resolved: Boolean(row.resolved ?? row.Resolved),
    resolvedAt: row.resolvedAt ?? row.ResolvedAt ?? undefined,
    resolvedBy: row.resolvedBy ?? row.ResolvedBy ?? undefined,
    notes: row.notes ?? row.Notes ?? '',
  };
  const parsed = parseEmergencyNotes(base.notes);
  return {
    ...base,
    notes: parsed.notes || base.notes,
    resolution: parsed.resolution,
    employeeSafe: parsed.employeeSafe,
    canResumeWork: parsed.canResumeWork,
    actionsTaken: parsed.actionsTaken,
    followUpRequired: parsed.followUpRequired,
    followUpNotes: parsed.followUpNotes,
  };
};

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const unresolvedOnly = searchParams.get('unresolvedOnly') === 'true';
    const pool = await getConnectionPool();
    let result;
    if (unresolvedOnly) {
      result = await pool.request().query('SELECT * FROM Emergencies WHERE Resolved = 0');
    } else {
      result = await pool.request().query('SELECT * FROM Emergencies');
    }
    const emergencies = result.recordset.map(toEmergencyResponse);
    return Response.json(emergencies);
  } catch (error) {
    console.error('Error fetching emergencies:', error);
    return Response.json({ error: 'Failed to fetch emergencies' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const data = await req.json();
    const { userId, shiftId, type, location, notes } = data;
    if (!userId || !type) {
      return Response.json({ error: 'User ID and type are required' }, { status: 400 });
    }
    const timestamp = new Date().toISOString();
    const pool = await getConnectionPool();
    const locationPayload = location ? JSON.stringify(location) : null;
    const result = await pool.request()
      .input('UserId', userId)
      .input('ShiftId', shiftId || null)
      .input('Type', type)
      .input('Location', locationPayload)
      .input('Timestamp', timestamp)
      .input('Resolved', 0)
      .input('Notes', notes || '')
      .query(`INSERT INTO Emergencies (UserId, ShiftId, Type, Location, Timestamp, Resolved, Notes)
              OUTPUT INSERTED.*
              VALUES (@UserId, @ShiftId, @Type, @Location, @Timestamp, @Resolved, @Notes)`);
    // Placeholder: Email notification logic can be added here
    return Response.json(toEmergencyResponse(result.recordset[0]), { status: 201 });
  } catch (error) {
    console.error('Error creating emergency:', error);
    return Response.json({ error: 'Failed to create emergency' }, { status: 500 });
  }
}
