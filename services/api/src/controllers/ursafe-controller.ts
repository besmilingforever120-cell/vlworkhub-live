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
  const firstName = row.first_name ? String(row.first_name) : "";
  const lastName = row.last_name ? String(row.last_name) : "";
  const distanceKm = row.distance_km !== undefined && row.distance_km !== null
    ? Number(row.distance_km)
    : Number(row.distance_miles || 0) * 1.60934;
  const distanceMiles = row.distance_miles !== undefined && row.distance_miles !== null
    ? Number(row.distance_miles)
    : (distanceKm / 1.60934);

  return {
    id: String(row.id),
    userId: String(row.user_id),
    user_id: String(row.user_id),
    first_name: firstName || undefined,
    last_name: lastName || undefined,
    email: row.email ? String(row.email) : undefined,
    status: String(row.status || "pending_approval"),
    category: String(row.category || "business"),
    start_time: String(row.start_time || ""),
    end_time: row.end_time ? String(row.end_time) : undefined,
    distance_km: distanceKm,
    startLocation: parseJson(row.start_location, null),
    endLocation: parseJson(row.end_location, null),
    startTime: String(row.start_time || ""),
    endTime: row.end_time ? String(row.end_time) : undefined,
    distanceInMiles: Number.isFinite(distanceMiles) ? distanceMiles : 0,
    route: parseJson(row.route, []),
    notes: row.notes ? String(row.notes) : undefined,
    vehicleInfo: row.vehicle_info ? String(row.vehicle_info) : undefined,
    purpose: row.purpose ? String(row.purpose) : undefined
  };
}

function toShift(row: Record<string, unknown>) {
  const shiftStart = row.shift_start ? String(row.shift_start) : String(row.start_time || "");
  const shiftEnd = row.shift_end ? String(row.shift_end) : (row.end_time ? String(row.end_time) : undefined);
  const computedDurationMinutes = (() => {
    if (typeof row.duration === "number") return Number(row.duration);
    const start = new Date(shiftStart).getTime();
    const end = shiftEnd ? new Date(shiftEnd).getTime() : Date.now();
    if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
    return Math.max(0, Math.round((end - start) / 60000));
  })();
  const firstName = row.first_name ? String(row.first_name) : "";
  const lastName = row.last_name ? String(row.last_name) : "";
  const employeeName = `${firstName} ${lastName}`.trim() || undefined;

  return {
    id: String(row.id),
    userId: String(row.user_id),
    user_id: String(row.user_id),
    shift_start: shiftStart,
    shift_end: shiftEnd,
    duration: computedDurationMinutes,
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
    notes: row.notes ? String(row.notes) : undefined,
    employeeName,
    email: row.email ? String(row.email) : undefined,
    firstName: firstName || undefined,
    lastName: lastName || undefined
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
  const firstName = row.first_name ? String(row.first_name) : "";
  const lastName = row.last_name ? String(row.last_name) : "";
  const employeeName = `${firstName} ${lastName}`.trim() || undefined;
  const createdAt = row.created_at ? String(row.created_at) : String(row.timestamp || "");
  const status = row.status
    ? String(row.status)
    : (Boolean(row.resolved) ? "resolved" : "open");

  return {
    id: String(row.id),
    userId: String(row.user_id),
    user_id: String(row.user_id),
    shiftId: row.shift_id ? String(row.shift_id) : undefined,
    type: String(row.type || "sos"),
    status,
    created_at: createdAt,
    location: parseJson(row.location, null),
    timestamp: String(row.timestamp || createdAt),
    resolved: Boolean(row.resolved),
    resolvedBy: row.resolved_by ? String(row.resolved_by) : undefined,
    resolvedAt: row.resolved_at ? String(row.resolved_at) : undefined,
    notes: typeof details.notes === "string" ? details.notes : "",
    resolution: details.resolution,
    employeeSafe: details.employeeSafe,
    canResumeWork: details.canResumeWork,
    actionsTaken: details.actionsTaken,
    followUpRequired: details.followUpRequired,
    followUpNotes: details.followUpNotes,
    employeeName,
    email: row.email ? String(row.email) : undefined,
    firstName: firstName || undefined,
    lastName: lastName || undefined
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

function toSettings(row: Record<string, unknown>) {
  return {
    ratePerKm: Number(row.rate_per_km || 0.68),
    smtpEmail: row.smtp_email ? String(row.smtp_email) : "",
    smtpPassword: row.smtp_password ? String(row.smtp_password) : "",
    logoData: row.logo_data ? String(row.logo_data) : null
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

  const users = result.rows.map((row) => ({
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

  return res.json({ items: users });
}

export async function listTrips(req: AuthenticatedRequest, res: Response) {
  const organizationId = orgId(req);
  const userId = typeof req.query.userId === "string" ? req.query.userId : undefined;
  const items = await withFallback(
    async () => {
      const result = await pool.query(
        `SELECT t.*, u.first_name, u.last_name, u.email,
                COALESCE(t.distance_km, t.distance_miles * 1.60934) AS distance_km
         FROM ursafe.ursafe_trips t
         LEFT JOIN public.users u ON u.id = t.user_id
         WHERE t.organization_id = $1 AND ($2::uuid IS NULL OR t.user_id = $2::uuid)
         ORDER BY t.start_time DESC`,
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
        `SELECT t.*, u.first_name, u.last_name, u.email,
                COALESCE(t.distance_km, t.distance_miles * 1.60934) AS distance_km
         FROM ursafe.ursafe_trips t
         LEFT JOIN public.users u ON u.id = t.user_id
         WHERE t.organization_id = $1 AND t.id = $2 LIMIT 1`,
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
        `INSERT INTO ursafe.ursafe_trips (
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
        `UPDATE ursafe.ursafe_trips
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
      await pool.query(`DELETE FROM ursafe.ursafe_trips WHERE organization_id = $1 AND id = $2`, [organizationId, tripId]);
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

  const result = await pool.query(
    `SELECT s.id,
            s.user_id,
            s.start_time,
            s.end_time,
            s.start_time AS shift_start,
            s.end_time AS shift_end,
            ROUND(EXTRACT(EPOCH FROM (COALESCE(s.end_time, NOW()) - s.start_time)) / 60.0)::int AS duration,
            s.status,
            s.last_check_in,
            s.check_in_count,
            s.start_location,
            s.end_location,
            s.current_location,
            s.current_location AS location,
            s.client_name,
            s.client_address,
            s.expected_duration,
            s.notes,
            u.first_name,
            u.last_name,
            u.email
     FROM ursafe.ursafe_shifts s
     LEFT JOIN public.users u ON u.id = s.user_id
     WHERE s.organization_id = $1
       AND ($2::uuid IS NULL OR s.user_id = $2::uuid)
       AND ($3::boolean = FALSE OR s.status = 'active')
     ORDER BY s.start_time DESC`,
    [organizationId, userId || null, activeOnly]
  );

  const items = result.rows.map((row) => toShift(row));

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
  const result = await pool.query(
    `SELECT e.id,
            e.user_id,
            e.shift_id,
            e.type,
            CASE WHEN e.resolved THEN 'resolved' ELSE 'open' END AS status,
            COALESCE(e.timestamp, e.created_at) AS created_at,
            e.location,
            e.timestamp,
            e.resolved,
            e.resolved_by,
            e.resolved_at,
            e.notes,
            u.first_name,
            u.last_name,
            u.email
     FROM ursafe.ursafe_emergencies e
     LEFT JOIN public.users u ON u.id = e.user_id
     WHERE e.organization_id = $1
       AND ($2::boolean = FALSE OR e.resolved = FALSE)
     ORDER BY COALESCE(e.timestamp, e.created_at) DESC`,
    [organizationId, unresolvedOnly]
  );

  const items = result.rows.map((row) => toEmergency(row));

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
  const result = await pool.query(
    `SELECT id,
            user_id,
            status,
            device AS device_name,
            NULL::text AS platform,
            tracking_since AS started_at,
            last_seen AS last_seen_at,
            CASE
              WHEN latitude IS NOT NULL AND longitude IS NOT NULL THEN
                jsonb_build_object('latitude', latitude, 'longitude', longitude, 'timestamp', last_seen)
              ELSE NULL
            END AS location,
            NULL::text AS last_known_activity,
            NULL::integer AS battery_level,
            notes
     FROM ursafe.active_sessions
     WHERE organization_id = $1
     ORDER BY last_seen DESC`,
    [organizationId]
  );

  const items = result.rows.map((row) => toActiveSession(row));

  return res.json({ items });
}

export async function clearActiveSession(req: AuthenticatedRequest, res: Response) {
  const organizationId = orgId(req);
  const userId = req.params.userId;

  await pool.query(`DELETE FROM ursafe.active_sessions WHERE organization_id = $1 AND user_id = $2`, [organizationId, userId]);

  return res.json({ success: true });
}

export async function getSettings(req: AuthenticatedRequest, res: Response) {
  const organizationId = orgId(req);
  const settings = await withFallback(
    async () => {
      const result = await pool.query(
        `SELECT rate_per_km, smtp_email, smtp_password, logo_data
         FROM ursafe_settings
         WHERE organization_id = $1
         LIMIT 1`,
        [organizationId]
      );
      return result.rows[0] ? toSettings(result.rows[0]) : { ratePerKm: 0.68, smtpEmail: "", smtpPassword: "", logoData: null };
    },
    () => {
      const row = listDevResource("ursafe_settings", organizationId)[0];
      return row ? toSettings(row) : { ratePerKm: 0.68, smtpEmail: "", smtpPassword: "", logoData: null };
    }
  );

  return res.json(settings);
}

export async function saveSettings(req: AuthenticatedRequest, res: Response) {
  const organizationId = orgId(req);
  const payload = req.body as Record<string, unknown>;
  const values = {
    rate_per_km: Number(payload.ratePerKm || 0.68),
    smtp_email: payload.smtpEmail ? String(payload.smtpEmail) : "",
    smtp_password: payload.smtpPassword ? String(payload.smtpPassword) : "",
    logo_data: payload.logoData ? String(payload.logoData) : null
  };

  const saved = await withFallback(
    async () => {
      const result = await pool.query(
        `INSERT INTO ursafe_settings (organization_id, rate_per_km, smtp_email, smtp_password, logo_data)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (organization_id)
         DO UPDATE SET
           rate_per_km = EXCLUDED.rate_per_km,
           smtp_email = EXCLUDED.smtp_email,
           smtp_password = EXCLUDED.smtp_password,
           logo_data = EXCLUDED.logo_data
         RETURNING rate_per_km, smtp_email, smtp_password, logo_data`,
        [organizationId, values.rate_per_km, values.smtp_email, values.smtp_password, values.logo_data]
      );
      return toSettings(result.rows[0]);
    },
    () => {
      const existing = listDevResource("ursafe_settings", organizationId)[0];
      if (existing) {
        const updated = updateDevResource("ursafe_settings", organizationId, existing.id, values);
        return toSettings(updated || existing);
      }
      return toSettings(createDevResource("ursafe_settings", organizationId, values));
    }
  );

  return res.json(saved);
}
