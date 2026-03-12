import { getConnectionPool } from '../../../../db/connection';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const tripId = searchParams.get('tripId') ?? searchParams.get('id');

    if (!tripId) {
      return Response.json({ error: 'Trip ID is required' }, { status: 400 });
    }

    const pool = await getConnectionPool();
    const result = await pool.request()
      .input('TripId', tripId)
      .query('SELECT Latitude, Longitude, Timestamp FROM TripRoutePoints WHERE TripId = @TripId ORDER BY Timestamp ASC');

    const routePoints = result.recordset
      .map((row: any) => ({
        latitude: Number(row.Latitude ?? row.latitude),
        longitude: Number(row.Longitude ?? row.longitude),
        timestamp: row.Timestamp instanceof Date ? row.Timestamp.toISOString() : row.Timestamp ?? row.timestamp ?? '',
      }))
      .filter((point) => Number.isFinite(point.latitude) && Number.isFinite(point.longitude));

    return Response.json(routePoints);
  } catch (error) {
    console.error('Error fetching trip route points:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
