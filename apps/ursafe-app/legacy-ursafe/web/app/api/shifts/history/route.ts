import { NextRequest, NextResponse } from 'next/server';
import { getConnectionPool } from '../../../../db/connection';
import { CheckIn, EmergencyAlert, Shift, ShiftHistoryEntry, ShiftStatus, ShiftTimelineEvent, User } from '@/types';
import { parseEmergencyNotes } from '@/lib/emergency-notes';

const isValidStatus = (value: string | null): value is ShiftStatus | 'all' => {
  if (!value) {
    return false;
  }
  return value === 'all' || value === ShiftStatus.ACTIVE || value === ShiftStatus.COMPLETED || value === ShiftStatus.EMERGENCY;
};

const normalizeNumericId = (value?: string | null) => {
  if (!value) {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined;
  }
  return parsed;
};

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = normalizeNumericId(searchParams.get('userId'));
    const managerId = normalizeNumericId(searchParams.get('managerId'));
    const status = isValidStatus(searchParams.get('status')) ? searchParams.get('status') : undefined;
    const startDate = searchParams.get('startDate') || undefined;
    const endDate = searchParams.get('endDate') || undefined;
    const includeArchived = searchParams.get('includeArchived') === 'true';

    const pool = await getConnectionPool();
    const startBoundary = normalizeBoundary(startDate);
    const endBoundary = normalizeBoundary(endDate, true);
    const statusFilter = status && status !== 'all' ? status.toUpperCase() : null;

    const shiftRequest = pool.request()
      .input('UserId', userId ?? null)
      .input('ManagerId', managerId ?? null)
      .input('Status', statusFilter)
      .input('StartDate', startBoundary ? new Date(startBoundary) : null)
      .input('EndDate', endBoundary ? new Date(endBoundary) : null)
      .input('IncludeArchived', includeArchived ? 1 : 0);

    const shiftsResult = await shiftRequest.query(`
      SELECT s.*
      FROM Shifts s
      INNER JOIN Users u ON s.UserId = u.UserId
      WHERE (@UserId IS NULL OR s.UserId = @UserId)
        AND (@ManagerId IS NULL OR u.ManagerId = @ManagerId OR u.UserId = @ManagerId)
        AND (@Status IS NULL OR UPPER(s.Status) = @Status)
        AND (@StartDate IS NULL OR s.StartTime >= @StartDate)
        AND (@EndDate IS NULL OR s.StartTime <= @EndDate)
        AND (@IncludeArchived = 1 OR u.IsActive = 1)
      ORDER BY s.StartTime DESC;
    `);

    const shifts = shiftsResult.recordset.map(toShift);
    if (shifts.length === 0) {
      return NextResponse.json([]);
    }

    const shiftIds = shifts
      .map((shift) => Number(shift.id))
      .filter((value) => Number.isFinite(value));
    const userIds = shifts
      .map((shift) => Number(shift.userId))
      .filter((value) => Number.isFinite(value));

    const checkIns = shiftIds.length
      ? await pool.request().query(`SELECT * FROM CheckIns WHERE ShiftId IN (${shiftIds.join(',')})`)
      : { recordset: [] as any[] };
    const shiftCheckIns = checkIns.recordset.map(toCheckIn);

    const shiftStartTimes = shifts.map((shift) => toTimestamp(shift.startTime)).filter((value) => value > 0);
    const minStart = shiftStartTimes.length ? new Date(Math.min(...shiftStartTimes)) : new Date();
    const maxEnd = new Date(
      Math.max(
        ...shifts.map((shift) => shift.endTime ? toTimestamp(shift.endTime) : Date.now()),
      ),
    );

    let emergencies: EmergencyAlert[] = [];
    if (shiftIds.length || userIds.length) {
      const emergencyRequest = pool.request()
        .input('MinStart', minStart)
        .input('MaxEnd', maxEnd);
      const shiftClause = shiftIds.length ? `ShiftId IN (${shiftIds.join(',')})` : '1 = 0';
      const userClause = userIds.length ? `UserId IN (${userIds.join(',')})` : '1 = 0';
      const emergencyResult = await emergencyRequest.query(`
        SELECT * FROM Emergencies
        WHERE (${shiftClause})
           OR (${userClause} AND Timestamp >= @MinStart AND Timestamp <= @MaxEnd);
      `);
      emergencies = emergencyResult.recordset.map(toEmergency);
    }

    const usersResult = await pool.request().query('SELECT UserId, FullName, Department FROM Users');
    const users = usersResult.recordset.map(toUser);

    const entries = shifts.map<ShiftHistoryEntry>((shift) => {
      const checkInsForShift = shiftCheckIns.filter((c) => c.shiftId === shift.id);
      const emergenciesForShift = emergencies.filter((e) => emergencyMatchesShift(shift, e));
      const timeline = buildTimeline(shift, checkInsForShift, emergenciesForShift);
      const idleMinutes = calculateIdleMinutes(timeline);
      const durationMinutes = Math.round(
        ((shift.endTime ? toTimestamp(shift.endTime) : Date.now()) - toTimestamp(shift.startTime)) / 60000,
      );

      const employee = users.find((u) => u.id === shift.userId);

      return {
        shift,
        employee: employee
          ? {
              id: employee.id,
              firstName: employee.firstName,
              lastName: employee.lastName,
              department: employee.department,
            }
          : undefined,
        checkIns: checkInsForShift,
        emergencies: emergenciesForShift,
        timeline,
        durationMinutes,
        totalInactiveMinutes: idleMinutes,
        riskLevel: determineRisk(shift, emergenciesForShift, checkInsForShift, idleMinutes),
      };
    });

    return NextResponse.json(entries);
  } catch (error) {
    console.error('Error fetching shift history:', error);
    return NextResponse.json({ error: 'Failed to fetch shift history' }, { status: 500 });
  }
}

const normalizeBoundary = (value?: string, endOfDay = false): number | undefined => {
  if (!value) {
    return undefined;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }
  if (endOfDay) {
    date.setUTCHours(23, 59, 59, 999);
  } else {
    date.setUTCHours(0, 0, 0, 0);
  }
  return date.getTime();
};

const toTimestamp = (value: string | undefined): number => {
  if (!value) {
    return 0;
  }
  return new Date(value).getTime();
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

const normalizeShiftStatus = (value?: string) => {
  const status = (value || '').toLowerCase();
  if ([ShiftStatus.ACTIVE, ShiftStatus.COMPLETED, ShiftStatus.EMERGENCY].includes(status as ShiftStatus)) {
    return status as ShiftStatus;
  }
  return ShiftStatus.ACTIVE;
};

const toShift = (row: any): Shift => ({
  id: String(row.ShiftId ?? row.shiftId ?? row.id ?? ''),
  userId: String(row.UserId ?? row.userId ?? ''),
  startTime: row.StartTime ?? row.startTime ?? '',
  endTime: row.EndTime ?? row.endTime ?? undefined,
  status: normalizeShiftStatus(row.Status ?? row.status),
  lastCheckIn: row.LastCheckIn ?? row.lastCheckIn ?? undefined,
  checkInCount: row.CheckInCount ?? row.checkInCount ?? 0,
  startLocation: parseLocation(row.StartLocation ?? row.startLocation),
  endLocation: parseLocation(row.EndLocation ?? row.endLocation),
  currentLocation: parseLocation(row.CurrentLocation ?? row.currentLocation),
  clientName: row.ClientName ?? row.clientName ?? undefined,
  clientAddress: row.ClientAddress ?? row.clientAddress ?? undefined,
  expectedDuration: row.ExpectedDuration ?? row.expectedDuration ?? undefined,
  notes: row.Notes ?? row.notes ?? undefined,
  createdAt: row.CreatedAt ?? row.createdAt ?? '',
  updatedAt: row.UpdatedAt ?? row.updatedAt ?? '',
});

const toCheckIn = (row: any): CheckIn => ({
  id: String(row.CheckInId ?? row.checkInId ?? row.id ?? ''),
  shiftId: String(row.ShiftId ?? row.shiftId ?? ''),
  userId: String(row.UserId ?? row.userId ?? ''),
  timestamp: row.Timestamp ?? row.timestamp ?? '',
  location: parseLocation(row.Location ?? row.location),
  status: row.Status ?? row.status ?? 'safe',
  notes: row.Notes ?? row.notes ?? undefined,
});

const toEmergency = (row: any): EmergencyAlert => {
  const base = {
    id: String(row.EmergencyId ?? row.emergencyId ?? row.id ?? ''),
    userId: String(row.UserId ?? row.userId ?? ''),
    shiftId: row.ShiftId ?? row.shiftId ?? undefined,
    type: (row.Type ?? row.type ?? '').toLowerCase(),
    location: parseLocation(row.Location ?? row.location),
    timestamp: row.Timestamp ?? row.timestamp ?? '',
    resolved: Boolean(row.Resolved ?? row.resolved),
    resolvedBy: row.ResolvedBy ?? row.resolvedBy ?? undefined,
    resolvedAt: row.ResolvedAt ?? row.resolvedAt ?? undefined,
    notes: row.Notes ?? row.notes ?? undefined,
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
  } as EmergencyAlert;
};

const toUser = (row: any): User => {
  const fullName = (row.FullName ?? '').trim();
  const [firstName, ...rest] = fullName.split(/\s+/);
  return {
    id: String(row.UserId ?? row.userId ?? ''),
    email: '',
    role: 'employee',
    firstName: firstName || '',
    lastName: rest.join(' '),
    department: row.Department ?? row.department ?? undefined,
    isActive: true,
    createdAt: '',
    updatedAt: '',
  };
};

const toCoordinateString = (latitude?: number, longitude?: number): string | undefined => {
  if (typeof latitude !== 'number' || typeof longitude !== 'number') {
    return undefined;
  }
  return `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
};

const buildLocationMetadata = (
  location?: { latitude?: number; longitude?: number; address?: string },
): Record<string, string | number | boolean | undefined> => {
  if (!location) {
    return {};
  }

  const { latitude, longitude, address } = location;
  const coordinates = toCoordinateString(latitude, longitude);
  const metadata: Record<string, string | number | boolean | undefined> = {};

  if (address) {
    metadata.address = address;
  }
  if (coordinates) {
    metadata.coordinates = coordinates;
    metadata.mapUrl = `https://www.google.com/maps?q=${latitude},${longitude}`;
  }

  return metadata;
};

const buildTimeline = (
  shift: Shift,
  checkIns: CheckIn[],
  emergencies: EmergencyAlert[],
): ShiftTimelineEvent[] => {
  const events: ShiftTimelineEvent[] = [];
  const startLocation = shift.startLocation ?? (!shift.endTime ? shift.currentLocation : undefined);
  const endLocation = shift.endLocation ?? (shift.endTime ? shift.currentLocation : undefined);

  events.push({
    id: `${shift.id}-start`,
    shiftId: shift.id,
    timestamp: shift.startTime,
    type: 'shift_start',
    label: 'Shift started',
    description: shift.clientName ? `Arrived for ${shift.clientName}` : 'On duty',
    severity: 'info',
    metadata: {
      ...(shift.clientAddress ? { entered_address: shift.clientAddress } : {}),
      ...buildLocationMetadata(startLocation),
    },
  });

  checkIns.forEach((checkIn) => {
    events.push({
      id: checkIn.id,
      shiftId: shift.id,
      timestamp: checkIn.timestamp,
      type: 'check_in',
      label: 'Check-in',
      description: checkIn.notes || undefined,
      severity: checkIn.status === 'safe' ? 'info' : checkIn.status === 'concern' ? 'warning' : 'critical',
      metadata: {
        status: checkIn.status,
        ...buildLocationMetadata(checkIn.location),
      },
    });
  });

  emergencies.forEach((emergency) => {
    events.push({
      id: emergency.id,
      shiftId: shift.id,
      timestamp: emergency.timestamp,
      type: 'emergency',
      label: emergency.type.toUpperCase(),
      description: emergency.notes || 'Emergency alert triggered',
      severity: emergency.resolved ? 'warning' : 'critical',
      metadata: {
        resolved: emergency.resolved,
        resolvedAt: emergency.resolvedAt,
        ...buildLocationMetadata(emergency.location),
      },
    });
  });

  if (shift.endTime) {
    events.push({
      id: `${shift.id}-end`,
      shiftId: shift.id,
      timestamp: shift.endTime,
      type: 'shift_end',
      label: 'Shift completed',
      description: shift.notes || undefined,
      severity: 'info',
      metadata: buildLocationMetadata(endLocation),
    });
  }

  return events.sort((a, b) => toTimestamp(a.timestamp) - toTimestamp(b.timestamp));
};

const calculateIdleMinutes = (timeline: ShiftTimelineEvent[]): number => {
  if (timeline.length < 2) {
    return 0;
  }

  let idle = 0;
  for (let i = 1; i < timeline.length; i += 1) {
    const prev = toTimestamp(timeline[i - 1].timestamp);
    const current = toTimestamp(timeline[i].timestamp);
    const gapMinutes = (current - prev) / 60000;
    if (gapMinutes > 45) {
      idle += gapMinutes;
    }
  }
  return Math.round(idle);
};

const determineRisk = (
  shift: Shift,
  emergencies: EmergencyAlert[],
  checkIns: CheckIn[],
  idleMinutes: number,
): 'low' | 'medium' | 'high' => {
  if (emergencies.length > 0) {
    return 'high';
  }

  const durationMinutes = Math.max(
    0,
    Math.round(
      ((shift.endTime ? toTimestamp(shift.endTime) : Date.now()) - toTimestamp(shift.startTime)) / 60000,
    ),
  );
  const expectedCheckIns = shift.expectedDuration
    ? Math.max(1, Math.floor((shift.expectedDuration || 60) / 30))
    : 0;
  const missedCheckIns = Math.max(0, expectedCheckIns - checkIns.length);

  if (missedCheckIns >= 2 || idleMinutes >= 120) {
    return 'high';
  }
  if (missedCheckIns === 1 || idleMinutes >= 60) {
    return 'medium';
  }
  return 'low';
};

const emergencyMatchesShift = (shift: Shift, emergency: EmergencyAlert): boolean => {
  if (emergency.shiftId && emergency.shiftId === shift.id) {
    return true;
  }
  const start = toTimestamp(shift.startTime);
  const end = shift.endTime ? toTimestamp(shift.endTime) : Date.now();
  const ts = toTimestamp(emergency.timestamp);
  return emergency.userId === shift.userId && ts >= start && ts <= end;
};
