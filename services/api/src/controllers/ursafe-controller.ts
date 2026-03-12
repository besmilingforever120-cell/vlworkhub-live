import type { Response } from "express";
import { pool } from "../config/db";
import type { AuthenticatedRequest } from "../middleware/auth";
import {
  createDevResource,
  deleteDevResource,
  listDevResource,
  shouldUseDevStore,
  updateDevResource
} from "../services/dev-store";

const DEV_ORG_ID = "11111111-1111-1111-1111-111111111111";
const DEV_USERS = [
  {
    id: "33333333-3333-3333-3333-333333333333",
    email: "manager@vlworkhub.ca",
    first_name: "Casey",
    last_name: "Morgan",
    department: "Field Operations",
    manager_user_id: null,
    is_active: true,
    roles: ["Manager"]
  },
  {
    id: "44444444-4444-4444-4444-444444444444",
    email: "employee@vlworkhub.ca",
    first_name: "Jordan",
    last_name: "Lee",
    department: "Community Support",
    manager_user_id: "33333333-3333-3333-3333-333333333333",
    is_active: true,
    roles: ["Employee"]
  }
] as const;

function parseJson<T>(value: unknown, fallback: T): T {
  if (!value) return fallback;
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return value as T;
}

function parseEmergencyNotes(value: unknown) {
  if (!value || typeof value !== "string") {
    return { notes: "" } as Record<string, unknown>;
  }

  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    if (parsed && typeof parsed === "object") {
      return parsed;
    }
  } catch {
    return { notes: value };
  }

  return { notes: value };
}

function toTrip(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    status: String(row.status || "pending_approval"),
    category: String(row.category || "business"),
    startLocation: parseJson(row.start_location, null),
    endLocation: parseJson(row.end_location, null),
    startTime: String(row.start_time || ""),
    endTime: row.end_time ? String(row.end_time) : undefined,
    distanceInMiles: Number(row.distance_miles || 0),
    route: parseJson(row.route, []),
    notes: row.notes ? String(row.notes) : undefined,
    vehicleInfo: row.vehicle_info ? String(row.vehicle_info) : undefined,
    purpose: row.purpose ? String(row.purpose) : undefined
  };
}

function toShift(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    startTime: String(row.start_time || ""),
    endTime: row.end_time ? String(row.end_time) : undefined,
    status: String(row.status || "active"),
    lastCheckIn: row.last_check_in ? String(row.last_check_in) : undefined,
    checkInCount: Number(row.check_in_count || 0),
    startLocation: parseJson(row.start_location, null),
    endLocation: parseJson(row.end_location, null),
    currentLocation: parseJson(row.current_location, null),
    clientName: row.client_name ? String(row.client_name) : undefined,
    clientAddress: row.client_address ? String(row.client_address) : undefined,
    expectedDuration: row.expected_duration ? Number(row.expected_duration) : undefined,
    notes: row.notes ? String(row.notes) : undefined
  };
}

function toCheckIn(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    shiftId: String(row.shift_id),
    userId: String(row.user_id),
    timestamp: String(row.timestamp || ""),
    location: parseJson(row.location, null),
    status: String(row.status || "safe"),
    notes: row.notes ? String(row.notes) : undefined
  };
}

function toEmergency(row: Record<string, unknown>) {
  const details = parseEmergencyNotes(row.notes);
  return {
    id: String(row.id),
    userId: String(row.user_id),
    shiftId: row.shift_id ? String(row.shift_id) : undefined,
    type: String(row.type || "sos"),
    location: parseJson(row.location, null),
    timestamp: String(row.timestamp || ""),
    resolved: Boolean(row.resolved),
    resolvedBy: row.resolved_by ? String(row.resolved_by) : undefined,
    resolvedAt: row.resolved_at ? String(row.resolved_at) : undefined,
    notes: typeof details.notes === "string" ? details.notes : "",
    resolution: details.resolution,
    employeeSafe: details.employeeSafe,
    canResumeWork: details.canResumeWork,
    actionsTaken: details.actionsTaken,
    followUpRequired: details.followUpRequired,
    followUpNotes: details.followUpNotes
  };
}

function toActiveSession(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    status: String(row.status || "online"),
    deviceName: row.device_name ? String(row.device_name) : undefined,
    platform: row.platform ? String(row.platform) : undefined,
    startedAt: String(row.started_at || ""),
    lastSeenAt: String(row.last_seen_at || ""),
    location: parseJson(row.location, null),
    lastKnownActivity: row.last_known_activity ? String(row.last_known_activity) : undefined,
    batteryLevel: row.battery_level ? Number(row.battery_level) : undefined,
    notes: row.notes ? String(row.notes) : undefined
  };
}

async function withFallback<T>(operation: () => Promise<T>, fallback: () => T) {
  try {
    return await operation();
  } catch (error) {
    if (shouldUseDevStore()) {
      console.warn("Falling back to URSafe development store.", error);
      return fallback();
    }
    throw error;
  }
}

function orgId(req: AuthenticatedRequest) {
  return String(req.user?.organization_id || DEV_ORG_ID);
}

export async function listUsers(req: AuthenticatedRequest, res: Response) {
  const organizationId = orgId(req);
  const users = await withFallback(
    async () => {
      const result = await pool.query(
        `SELECT u.id, u.email, u.first_name, u.last_name, p.department, p.manager_user_id, COALESCE(p.is_active, TRUE) AS is_active,
                COALESCE(array_remove(array_agg(DISTINCT ur.role), NULL), '{}') AS roles
         FROM users u
         INNER JOIN user_app_access uaa ON uaa.user_id = u.id AND uaa.app = 'ursafe'
         LEFT JOIN user_roles ur ON ur.user_id = u.id
         LEFT JOIN ursafe_user_profiles p ON p.user_id = u.id
         WHERE u.organization_id = $1 AND u.status = 'active'
         GROUP BY u.id, p.department, p.manager_user_id, p.is_active
         ORDER BY u.first_name, u.last_name`,
        [organizationId]
      );
      return result.rows.map((row) => ({
        id: row.id,
        email: row.email,
        firstName: row.first_name,
        lastName: row.last_name,
        department: row.department,
        managerId: row.manager_user_id,
        isActive: row.is_active,
        role: row.roles[0] || "Employee",
        roles: row.roles
      }));
    },
    () => DEV_USERS.map((user) => ({
      id: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      department: user.department,
      managerId: user.manager_user_id,
      isActive: user.is_active,
      role: user.roles[0],
      roles: [...user.roles]
    }))
  );

  return res.json({ items: users });
}

export async function listTrips(req: AuthenticatedRequest, res: Response) {
  const organizationId = orgId(req);
  const userId = typeof req.query.userId === "string" ? req.query.userId : undefined;
  const items = await withFallback(
    async () => {
      const result = await pool.query(
        `SELECT * FROM ursafe_trips
         WHERE organization_id = $1 AND ($2::uuid IS NULL OR user_id = $2::uuid)
         ORDER BY start_time DESC`,
        [organizationId, userId || null]
      );
      return result.rows.map((row) => toTrip(row));
    },
    () => listDevResource("ursafe_trips", organizationId)
      .filter((row) => !userId || String(row.user_id) === userId)
      .map((row) => toTrip(row))
  );

  return res.json({ items });
}

export async function getTrip(req: AuthenticatedRequest, res: Response) {
  const organizationId = orgId(req);
  const tripId = Number(req.params.id);
  const trip = await withFallback(
    async () => {
      const result = await pool.query(
        `SELECT * FROM ursafe_trips WHERE organization_id = $1 AND id = $2 LIMIT 1`,
        [organizationId, tripId]
      );
      return result.rows[0] ? toTrip(result.rows[0]) : null;
    },
    () => {
      const row = listDevResource("ursafe_trips", organizationId).find((item) => item.id === tripId);
      return row ? toTrip(row) : null;
    }
  );

  if (!trip) {
    return res.status(404).json({ message: "Trip not found" });
  }

  return res.json({ item: trip });
}

export async function createTrip(req: AuthenticatedRequest, res: Response) {
  const organizationId = orgId(req);
  const payload = req.body as Record<string, unknown>;
  const values = {
    user_id: String(payload.userId || req.user?.user_id || ""),
    status: String(payload.status || "pending_approval"),
    category: String(payload.category || "business"),
    start_location: JSON.stringify(payload.startLocation || null),
    end_location: JSON.stringify(payload.endLocation || null),
    start_time: String(payload.startTime || new Date().toISOString()),
    end_time: payload.endTime ? String(payload.endTime) : null,
    distance_miles: Number(payload.distanceInMiles || 0),
    route: JSON.stringify(payload.route || []),
    notes: payload.notes ? String(payload.notes) : null,
    vehicle_info: payload.vehicleInfo ? String(payload.vehicleInfo) : null,
    purpose: payload.purpose ? String(payload.purpose) : null
  };

  const created = await withFallback(
    async () => {
      const result = await pool.query(
        `INSERT INTO ursafe_trips (
          organization_id, user_id, status, category, start_location, end_location, start_time, end_time,
          distance_miles, route, notes, vehicle_info, purpose
        ) VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7,$8,$9,$10::jsonb,$11,$12,$13)
        RETURNING *`,
        [
          organizationId,
          values.user_id,
          values.status,
          values.category,
          values.start_location,
          values.end_location,
          values.start_time,
          values.end_time,
          values.distance_miles,
          values.route,
          values.notes,
          values.vehicle_info,
          values.purpose
        ]
      );
      return toTrip(result.rows[0]);
    },
    () => toTrip(createDevResource("ursafe_trips", organizationId, values))
  );

  return res.status(201).json({ item: created });
}

export async function updateTrip(req: AuthenticatedRequest, res: Response) {
  const organizationId = orgId(req);
  const tripId = Number(req.params.id);
  const payload = req.body as Record<string, unknown>;
  const updates = {
    status: payload.status ? String(payload.status) : null,
    notes: payload.notes ? String(payload.notes) : null,
    end_time: payload.endTime ? String(payload.endTime) : null,
    end_location: payload.endLocation ? JSON.stringify(payload.endLocation) : null,
    distance_miles: payload.distanceInMiles ? Number(payload.distanceInMiles) : null,
    route: payload.route ? JSON.stringify(payload.route) : null
  };

  await withFallback(
    async () => {
      await pool.query(
        `UPDATE ursafe_trips
         SET status = COALESCE($1, status),
             notes = COALESCE($2, notes),
             end_time = COALESCE($3, end_time),
             end_location = COALESCE($4::jsonb, end_location),
             distance_miles = COALESCE($5, distance_miles),
             route = COALESCE($6::jsonb, route),
             updated_at = NOW()
         WHERE organization_id = $7 AND id = $8`,
        [updates.status, updates.notes, updates.end_time, updates.end_location, updates.distance_miles, updates.route, organizationId, tripId]
      );
      return true;
    },
    () => Boolean(updateDevResource("ursafe_trips", organizationId, tripId, updates))
  );

  return res.json({ success: true });
}

export async function deleteTrip(req: AuthenticatedRequest, res: Response) {
  const organizationId = orgId(req);
  const tripId = Number(req.params.id);

  await withFallback(
    async () => {
      await pool.query(`DELETE FROM ursafe_trips WHERE organization_id = $1 AND id = $2`, [organizationId, tripId]);
      return true;
    },
    () => deleteDevResource("ursafe_trips", organizationId, tripId)
  );

  return res.json({ success: true });
}

export async function listShifts(req: AuthenticatedRequest, res: Response) {
  const organizationId = orgId(req);
  const userId = typeof req.query.userId === "string" ? req.query.userId : undefined;
  const activeOnly = req.query.activeOnly === "true";

  const items = await withFallback(
    async () => {
      const result = await pool.query(
        `SELECT * FROM ursafe_shifts
         WHERE organization_id = $1
           AND ($2::uuid IS NULL OR user_id = $2::uuid)
           AND ($3::boolean = FALSE OR status = 'active')
         ORDER BY start_time DESC`,
        [organizationId, userId || null, activeOnly]
      );
      return result.rows.map((row) => toShift(row));
    },
    () => listDevResource("ursafe_shifts", organizationId)
      .filter((row) => (!userId || String(row.user_id) === userId) && (!activeOnly || row.status === "active"))
      .map((row) => toShift(row))
  );

  return res.json({ items });
}

export async function createShift(req: AuthenticatedRequest, res: Response) {
  const organizationId = orgId(req);
  const payload = req.body as Record<string, unknown>;
  const values = {
    user_id: String(payload.userId || req.user?.user_id || ""),
    start_time: String(payload.startTime || new Date().toISOString()),
    end_time: null,
    status: "active",
    last_check_in: null,
    check_in_count: 0,
    start_location: JSON.stringify(payload.currentLocation || payload.startLocation || null),
    end_location: null,
    current_location: JSON.stringify(payload.currentLocation || null),
    client_name: payload.clientName ? String(payload.clientName) : null,
    client_address: payload.clientAddress ? String(payload.clientAddress) : null,
    expected_duration: payload.expectedDuration ? Number(payload.expectedDuration) : null,
    notes: payload.notes ? String(payload.notes) : null
  };

  const item = await withFallback(
    async () => {
      const result = await pool.query(
        `INSERT INTO ursafe_shifts (
          organization_id, user_id, start_time, status, start_location, current_location,
          client_name, client_address, expected_duration, notes, check_in_count
        ) VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7,$8,$9,$10,$11)
        RETURNING *`,
        [organizationId, values.user_id, values.start_time, values.status, values.start_location, values.current_location, values.client_name, values.client_address, values.expected_duration, values.notes, values.check_in_count]
      );
      return toShift(result.rows[0]);
    },
    () => toShift(createDevResource("ursafe_shifts", organizationId, values))
  );

  return res.status(201).json({ item });
}

export async function updateShift(req: AuthenticatedRequest, res: Response) {
  const organizationId = orgId(req);
  const shiftId = Number(req.params.id);
  const payload = req.body as Record<string, unknown>;
  const currentLocation = payload.currentLocation ? JSON.stringify(payload.currentLocation) : null;
  const status = payload.status ? String(payload.status) : null;
  const endTime = payload.endTime ? String(payload.endTime) : null;

  await withFallback(
    async () => {
      await pool.query(
        `UPDATE ursafe_shifts
         SET status = COALESCE($1, status),
             end_time = COALESCE($2, end_time),
             current_location = COALESCE($3::jsonb, current_location),
             end_location = CASE WHEN $2 IS NOT NULL THEN COALESCE($3::jsonb, end_location) ELSE end_location END,
             updated_at = NOW()
         WHERE organization_id = $4 AND id = $5`,
        [status, endTime, currentLocation, organizationId, shiftId]
      );
      return true;
    },
    () => Boolean(updateDevResource("ursafe_shifts", organizationId, shiftId, {
      status,
      end_time: endTime,
      current_location: currentLocation,
      end_location: endTime ? currentLocation : null
    }))
  );

  return res.json({ success: true });
}

export async function listCheckIns(req: AuthenticatedRequest, res: Response) {
  const organizationId = orgId(req);
  const shiftId = typeof req.query.shiftId === "string" ? Number(req.query.shiftId) : null;
  const items = await withFallback(
    async () => {
      const result = await pool.query(
        `SELECT * FROM ursafe_check_ins
         WHERE organization_id = $1 AND ($2::bigint IS NULL OR shift_id = $2)
         ORDER BY timestamp DESC`,
        [organizationId, shiftId]
      );
      return result.rows.map((row) => toCheckIn(row));
    },
    () => listDevResource("ursafe_check_ins", organizationId)
      .filter((row) => !shiftId || row.shift_id === shiftId)
      .map((row) => toCheckIn(row))
  );

  return res.json({ items });
}

export async function createCheckIn(req: AuthenticatedRequest, res: Response) {
  const organizationId = orgId(req);
  const payload = req.body as Record<string, unknown>;
  const location = JSON.stringify(payload.location || null);
  const values = {
    shift_id: Number(payload.shiftId),
    user_id: String(payload.userId || req.user?.user_id || ""),
    timestamp: String(payload.timestamp || new Date().toISOString()),
    location,
    status: String(payload.status || "safe"),
    notes: payload.notes ? String(payload.notes) : null
  };

  const item = await withFallback(
    async () => {
      const result = await pool.query(
        `INSERT INTO ursafe_check_ins (organization_id, shift_id, user_id, timestamp, location, status, notes)
         VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7)
         RETURNING *`,
        [organizationId, values.shift_id, values.user_id, values.timestamp, values.location, values.status, values.notes]
      );
      await pool.query(
        `UPDATE ursafe_shifts
         SET check_in_count = check_in_count + 1,
             last_check_in = $1,
             current_location = $2::jsonb,
             updated_at = NOW()
         WHERE organization_id = $3 AND id = $4`,
        [values.timestamp, values.location, organizationId, values.shift_id]
      );
      return toCheckIn(result.rows[0]);
    },
    () => {
      const created = createDevResource("ursafe_check_ins", organizationId, values);
      const shift = listDevResource("ursafe_shifts", organizationId).find((entry) => entry.id === values.shift_id);
      if (shift) {
        updateDevResource("ursafe_shifts", organizationId, values.shift_id, {
          check_in_count: Number(shift.check_in_count || 0) + 1,
          last_check_in: values.timestamp,
          current_location: values.location
        });
      }
      return toCheckIn(created);
    }
  );

  return res.status(201).json({ item });
}

export async function listEmergencies(req: AuthenticatedRequest, res: Response) {
  const organizationId = orgId(req);
  const unresolvedOnly = req.query.unresolvedOnly === "true";
  const items = await withFallback(
    async () => {
      const result = await pool.query(
        `SELECT * FROM ursafe_emergencies
         WHERE organization_id = $1 AND ($2::boolean = FALSE OR resolved = FALSE)
         ORDER BY timestamp DESC`,
        [organizationId, unresolvedOnly]
      );
      return result.rows.map((row) => toEmergency(row));
    },
    () => listDevResource("ursafe_emergencies", organizationId)
      .filter((row) => !unresolvedOnly || !row.resolved)
      .map((row) => toEmergency(row))
  );

  return res.json({ items });
}

export async function createEmergency(req: AuthenticatedRequest, res: Response) {
  const organizationId = orgId(req);
  const payload = req.body as Record<string, unknown>;
  const values = {
    user_id: String(payload.userId || req.user?.user_id || ""),
    shift_id: payload.shiftId ? Number(payload.shiftId) : null,
    type: String(payload.type || "sos"),
    location: JSON.stringify(payload.location || null),
    timestamp: String(payload.timestamp || new Date().toISOString()),
    resolved: false,
    resolved_by: null,
    resolved_at: null,
    notes: JSON.stringify({ notes: String(payload.notes || "") })
  };

  const item = await withFallback(
    async () => {
      const result = await pool.query(
        `INSERT INTO ursafe_emergencies (organization_id, user_id, shift_id, type, location, timestamp, resolved, notes)
         VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8)
         RETURNING *`,
        [organizationId, values.user_id, values.shift_id, values.type, values.location, values.timestamp, values.resolved, values.notes]
      );
      return toEmergency(result.rows[0]);
    },
    () => toEmergency(createDevResource("ursafe_emergencies", organizationId, values))
  );

  return res.status(201).json({ item });
}

export async function resolveEmergency(req: AuthenticatedRequest, res: Response) {
  const organizationId = orgId(req);
  const emergencyId = Number(req.params.id);
  const payload = req.body as Record<string, unknown>;
  const notes = JSON.stringify({
    notes: String(payload.notes || payload.originalNotes || ""),
    resolution: payload.resolution,
    employeeSafe: payload.employeeSafe,
    canResumeWork: payload.canResumeWork,
    actionsTaken: payload.actionsTaken,
    followUpRequired: Boolean(payload.followUpRequired),
    followUpNotes: payload.followUpNotes
  });

  await withFallback(
    async () => {
      await pool.query(
        `UPDATE ursafe_emergencies
         SET resolved = TRUE,
             resolved_by = $1,
             resolved_at = $2,
             notes = $3
         WHERE organization_id = $4 AND id = $5`,
        [String(req.user?.user_id || ""), String(payload.resolvedAt || new Date().toISOString()), notes, organizationId, emergencyId]
      );
      return true;
    },
    () => Boolean(updateDevResource("ursafe_emergencies", organizationId, emergencyId, {
      resolved: true,
      resolved_by: String(req.user?.user_id || ""),
      resolved_at: String(payload.resolvedAt || new Date().toISOString()),
      notes
    }))
  );

  return res.json({ success: true });
}

export async function listActiveSessions(req: AuthenticatedRequest, res: Response) {
  const organizationId = orgId(req);
  const items = await withFallback(
    async () => {
      const result = await pool.query(
        `SELECT * FROM ursafe_active_sessions WHERE organization_id = $1 ORDER BY last_seen_at DESC`,
        [organizationId]
      );
      return result.rows.map((row) => toActiveSession(row));
    },
    () => listDevResource("ursafe_active_sessions", organizationId).map((row) => toActiveSession(row))
  );

  return res.json({ items });
}

export async function clearActiveSession(req: AuthenticatedRequest, res: Response) {
  const organizationId = orgId(req);
  const userId = req.params.userId;

  await withFallback(
    async () => {
      await pool.query(`DELETE FROM ursafe_active_sessions WHERE organization_id = $1 AND user_id = $2`, [organizationId, userId]);
      return true;
    },
    () => {
      const session = listDevResource("ursafe_active_sessions", organizationId).find((entry) => String(entry.user_id) === userId);
      return session ? deleteDevResource("ursafe_active_sessions", organizationId, session.id) : false;
    }
  );

  return res.json({ success: true });
}
