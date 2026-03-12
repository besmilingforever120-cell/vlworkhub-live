import { CheckIn, EmergencyAlert, Shift, ShiftHistoryEntry, ShiftTimelineEvent, ShiftStatus, User } from '@/types';
import {
  getAllCheckIns,
  getAllEmergencies,
  getAllShifts,
  getAllUsers,
} from './db';

export interface ShiftHistoryFilters {
  userId?: string;
  status?: ShiftStatus | 'all';
  startDate?: string;
  endDate?: string;
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

  events.push({
    id: `${shift.id}-start`,
    shiftId: shift.id,
    timestamp: shift.startTime,
    type: 'shift_start',
    label: 'Shift started',
    description: shift.clientName ? `Arrived for ${shift.clientName}` : 'On duty',
    severity: 'info',
    metadata: {
      location: shift.clientAddress,
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

export const getShiftHistory = (filters: ShiftHistoryFilters = {}): ShiftHistoryEntry[] => {
  const [users, shifts, checkIns, emergencies] = [
    getAllUsers(),
    getAllShifts(),
    getAllCheckIns(),
    getAllEmergencies(),
  ];

  const startBoundary = normalizeBoundary(filters.startDate);
  const endBoundary = normalizeBoundary(filters.endDate, true);

  const filteredShifts = shifts.filter((shift) => {
    if (filters.userId && shift.userId !== filters.userId) {
      return false;
    }
    if (filters.status && filters.status !== 'all' && shift.status !== filters.status) {
      return false;
    }
    const shiftStartTs = toTimestamp(shift.startTime);
    if (startBoundary && shiftStartTs < startBoundary) {
      return false;
    }
    if (endBoundary && shiftStartTs > endBoundary) {
      return false;
    }
    return true;
  });

  const entries = filteredShifts.map<ShiftHistoryEntry>((shift) => {
    const shiftCheckIns = checkIns.filter((c) => c.shiftId === shift.id);
    const shiftEmergencies = emergencies.filter((e) => emergencyMatchesShift(shift, e));
    const timeline = buildTimeline(shift, shiftCheckIns, shiftEmergencies);
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
      checkIns: shiftCheckIns,
      emergencies: shiftEmergencies,
      timeline,
      durationMinutes,
      totalInactiveMinutes: idleMinutes,
      riskLevel: determineRisk(shift, shiftEmergencies, shiftCheckIns, idleMinutes),
    };
  });

  return entries.sort(
    (a, b) => toTimestamp(b.shift.startTime) - toTimestamp(a.shift.startTime),
  );
};
