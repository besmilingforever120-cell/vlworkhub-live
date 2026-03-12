import { NextRequest, NextResponse } from 'next/server';
import sql, { getConnectionPool } from '../../../db/connection';

const KM_PER_MILE = 1.60934;

const normalizeTripStatus = (value?: string) => {
  const status = (value || '').toLowerCase();
  if (['in_progress', 'completed', 'pending_approval', 'approved', 'rejected'].includes(status)) {
    return status;
  }
  return 'pending_approval';
};

const normalizeTripCategory = (value?: string) => (value || '').toLowerCase();

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

const toTripResponse = (row: any) => {
  const startLatitude = row.startLatitude ?? row.StartLatitude;
  const startLongitude = row.startLongitude ?? row.StartLongitude;
  const endLatitude = row.endLatitude ?? row.EndLatitude;
  const endLongitude = row.endLongitude ?? row.EndLongitude;
  const startAddress = row.startAddress ?? row.StartAddress ?? undefined;
  const endAddress = row.endAddress ?? row.EndAddress ?? undefined;
  const distanceKm = row.distanceKm ?? row.DistanceKm;
  const distanceInMiles = row.distanceInMiles ?? (Number.isFinite(distanceKm) ? Number(distanceKm) / KM_PER_MILE : 0);
  const startTime = row.startTime ?? row.StartTime ?? '';
  const endTime = row.endTime ?? row.EndTime ?? undefined;

  const startLocation = parseLocation(row.startLocation) ?? (Number.isFinite(startLatitude) && Number.isFinite(startLongitude)
    ? { latitude: Number(startLatitude), longitude: Number(startLongitude), timestamp: startTime, address: startAddress }
    : undefined);
  const endLocation = parseLocation(row.endLocation) ?? (Number.isFinite(endLatitude) && Number.isFinite(endLongitude)
    ? { latitude: Number(endLatitude), longitude: Number(endLongitude), timestamp: endTime || '', address: endAddress }
    : undefined);

  return {
    id: String(row.id ?? row.tripId ?? row.TripId ?? ''),
    userId: String(row.userId ?? row.UserId ?? ''),
    status: normalizeTripStatus(row.status ?? row.Status),
    category: normalizeTripCategory(row.category ?? row.Category),
    startLocation,
    endLocation,
    startTime,
    endTime,
    distanceInMiles: Number.isFinite(distanceInMiles) ? Number(distanceInMiles) : 0,
    route: row.route ?? row.Route ?? row.coordinates ?? [],
    notes: row.notes ?? row.Notes ?? undefined,
    vehicleInfo: row.vehicleInfo ?? row.VehicleInfo ?? undefined,
    purpose: row.purpose ?? row.Purpose ?? undefined,
    createdAt: row.createdAt ?? row.CreatedAt ?? undefined,
    updatedAt: row.updatedAt ?? row.UpdatedAt ?? undefined,
  };
};

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const tripId = searchParams.get('tripId') ?? searchParams.get('id');
    const pool = await getConnectionPool();
    let result;
    if (tripId) {
      result = await pool.request().input('TripId', tripId).query('SELECT * FROM Trips WHERE TripId = @TripId');
      if (result.recordset.length === 0) {
        return Response.json({ error: 'Trip not found' }, { status: 404 });
      }
      return Response.json(toTripResponse(result.recordset[0]));
    }
    if (userId) {
      result = await pool.request().input('UserId', userId).query('SELECT * FROM Trips WHERE UserId = @UserId');
    } else {
      result = await pool.request().query('SELECT * FROM Trips');
    }
    const trips = result.recordset.map(toTripResponse);
    return Response.json(trips);
  } catch (error) {
    console.error('Error fetching trips:', error);
    return Response.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const trip = await request.json();
    const startLocation = trip.startLocation ?? trip.start_location ?? undefined;
    const endLocation = trip.endLocation ?? trip.end_location ?? undefined;
    const startLatitude = trip.startLatitude ?? startLocation?.latitude;
    const startLongitude = trip.startLongitude ?? startLocation?.longitude;
    const endLatitude = trip.endLatitude ?? endLocation?.latitude;
    const endLongitude = trip.endLongitude ?? endLocation?.longitude;
    const startAddress = trip.startAddress ?? startLocation?.address ?? null;
    const endAddress = trip.endAddress ?? endLocation?.address ?? null;
    const distanceKm = trip.distanceKm ?? (Number.isFinite(trip.distanceInMiles) ? trip.distanceInMiles * KM_PER_MILE : undefined);
    const status = normalizeTripStatus(trip.status);
    const category = normalizeTripCategory(trip.category);
    const rawRoute = Array.isArray(trip.route)
      ? trip.route
      : Array.isArray(trip.coordinates)
        ? trip.coordinates
        : [];
    const sanitizedRoute = rawRoute
      .map((point: any) => ({
        latitude: Number(point?.latitude),
        longitude: Number(point?.longitude),
        timestamp: point?.timestamp ?? trip.startTime ?? new Date().toISOString(),
      }))
      .filter((point: { latitude: number; longitude: number }) => Number.isFinite(point.latitude) && Number.isFinite(point.longitude));

    if (!trip.userId || !trip.startTime || !trip.endTime || !Number.isFinite(startLatitude) || !Number.isFinite(startLongitude) || !Number.isFinite(endLatitude) || !Number.isFinite(endLongitude) || !Number.isFinite(distanceKm) || !category) {
      return Response.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }
    const pool = await getConnectionPool();
    const transaction = pool.transaction();
    await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    try {
      const duplicateCheck = await transaction.request()
        .input('UserId', trip.userId)
        .input('StartTime', trip.startTime)
        .input('EndTime', trip.endTime)
        .input('Category', category)
        .query(`SELECT TOP 1 * FROM Trips WITH (UPDLOCK, HOLDLOCK)
                WHERE UserId = @UserId
                  AND StartTime = @StartTime
                  AND EndTime = @EndTime
                  AND Category = @Category`);
      if (duplicateCheck.recordset.length > 0) {
        await transaction.commit();
        return Response.json(toTripResponse(duplicateCheck.recordset[0]), { status: 409 });
      }

      const result = await transaction.request()
        .input('UserId', trip.userId)
        .input('StartTime', trip.startTime)
        .input('EndTime', trip.endTime)
        .input('StartLatitude', Number(startLatitude))
        .input('StartLongitude', Number(startLongitude))
        .input('EndLatitude', Number(endLatitude))
        .input('EndLongitude', Number(endLongitude))
        .input('DistanceKm', Number(distanceKm))
        .input('Category', category)
        .input('Purpose', trip.purpose || null)
        .input('Notes', trip.notes || null)
        .input('Status', status || 'pending_approval')
        .input('StartAddress', startAddress)
        .input('EndAddress', endAddress)
        .query(`INSERT INTO Trips (UserId, StartTime, EndTime, StartLatitude, StartLongitude, EndLatitude, EndLongitude, DistanceKm, Category, Purpose, Notes, Status, StartAddress, EndAddress)
                OUTPUT INSERTED.*
                VALUES (@UserId, @StartTime, @EndTime, @StartLatitude, @StartLongitude, @EndLatitude, @EndLongitude, @DistanceKm, @Category, @Purpose, @Notes, @Status, @StartAddress, @EndAddress)`);
      const insertedTrip = result.recordset[0];
      const insertedTripId = insertedTrip?.TripId ?? insertedTrip?.tripId ?? insertedTrip?.id;

      if (insertedTripId && sanitizedRoute.length > 0) {
        const routeRequest = transaction.request().input('TripId', insertedTripId);
        const values = sanitizedRoute.map((point: any, index: number) => {
          routeRequest.input(`Lat${index}`, point.latitude);
          routeRequest.input(`Lng${index}`, point.longitude);
          routeRequest.input(`Timestamp${index}`, point.timestamp);
          return `(@TripId, @Lat${index}, @Lng${index}, @Timestamp${index})`;
        });
        await routeRequest.query(
          `INSERT INTO TripRoutePoints (TripId, Latitude, Longitude, Timestamp) VALUES ${values.join(',')}`
        );
      }

      await transaction.commit();
      return Response.json(toTripResponse({ ...insertedTrip, route: sanitizedRoute }), { status: 201 });
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  } catch (error) {
    console.error('Error creating trip:', error);
    return Response.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const { tripId, id, status } = await request.json();
    const resolvedTripId = tripId ?? id;
    if (!resolvedTripId || !status) {
      return Response.json(
        { error: 'Trip ID and status are required' },
        { status: 400 }
      );
    }
    const pool = await getConnectionPool();
    const result = await pool.request()
      .input('TripId', resolvedTripId)
      .input('Status', normalizeTripStatus(status))
      .query('UPDATE Trips SET Status = @Status WHERE TripId = @TripId; SELECT * FROM Trips WHERE TripId = @TripId');
    if (result.recordset.length === 0) {
      return Response.json(
        { error: 'Trip not found' },
        { status: 404 }
      );
    }
    return Response.json(toTripResponse(result.recordset[0]));
  } catch (error) {
    console.error('Error updating trip:', error);
    return Response.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const tripId = searchParams.get('tripId') ?? searchParams.get('id');
    if (!tripId) {
      return Response.json(
        { error: 'Trip ID is required' },
        { status: 400 }
      );
    }
    const pool = await getConnectionPool();
    const transaction = pool.transaction();
    await transaction.begin();
    try {
      await transaction.request().input('TripId', tripId).query('DELETE FROM TripRoutePoints WHERE TripId = @TripId');
      const result = await transaction.request().input('TripId', tripId).query('DELETE FROM Trips WHERE TripId = @TripId');
      if (result.rowsAffected[0] === 0) {
        await transaction.rollback();
        return Response.json(
          { error: 'Trip not found' },
          { status: 404 }
        );
      }
      await transaction.commit();
      return Response.json({ message: 'Trip deleted successfully' });
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  } catch (error) {
    console.error('Error deleting trip:', error);
    return Response.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
