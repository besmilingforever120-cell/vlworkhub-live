import { NextRequest, NextResponse } from 'next/server';
import { getConnectionPool } from '../../../../db/connection';

const buildNotesPayload = (existingNotes: string | null, resolution: Record<string, unknown>) => {
  if (!existingNotes) {
    return JSON.stringify({ resolution });
  }

  try {
    const parsed = JSON.parse(existingNotes);
    if (parsed && typeof parsed === 'object') {
      return JSON.stringify({ ...parsed, resolution });
    }
  } catch {
    // Fall back to wrapping the legacy notes string.
  }

  return JSON.stringify({ initialNotes: existingNotes, resolution });
};

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const {
      resolvedAt,
      resolvedBy,
      resolution,
      employeeSafe,
      canResumeWork,
      actionsTaken,
      followUpRequired,
      followUpNotes,
    } = body;

    if (!id) {
      return NextResponse.json({ error: 'Emergency ID is required' }, { status: 400 });
    }

    const pool = await getConnectionPool();
    const existing = await pool.request()
      .input('EmergencyId', id)
      .query('SELECT Notes FROM Emergencies WHERE EmergencyId = @EmergencyId');

    if (existing.recordset.length === 0) {
      return NextResponse.json({ error: 'Emergency not found' }, { status: 404 });
    }

    const resolutionPayload = {
      resolvedAt,
      resolvedBy,
      resolution,
      employeeSafe,
      canResumeWork,
      actionsTaken,
      followUpRequired,
      followUpNotes,
    };

    const updatedNotes = buildNotesPayload(existing.recordset[0].Notes ?? null, resolutionPayload);
    const resolvedAtValue = resolvedAt ? new Date(resolvedAt).toISOString() : new Date().toISOString();
    const resolvedByValue = resolvedBy ? Number(resolvedBy) : null;

    const result = await pool.request()
      .input('EmergencyId', id)
      .input('Resolved', 1)
      .input('ResolvedAt', resolvedAtValue)
      .input('ResolvedBy', resolvedByValue)
      .input('Notes', updatedNotes)
      .query(`UPDATE Emergencies
              SET Resolved = @Resolved,
                  ResolvedAt = @ResolvedAt,
                  ResolvedBy = @ResolvedBy,
                  Notes = @Notes
              WHERE EmergencyId = @EmergencyId;
              SELECT * FROM Emergencies WHERE EmergencyId = @EmergencyId;`);

    return NextResponse.json(result.recordset[0]);
  } catch (error) {
    console.error('Error resolving emergency:', error);
    return NextResponse.json({ error: 'Failed to resolve emergency' }, { status: 500 });
  }
}
