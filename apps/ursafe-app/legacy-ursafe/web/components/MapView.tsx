'use client';

import { useEffect, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Trip, User, Shift, EmergencyAlert } from '@/types';

// Fix for default marker icons in Leaflet
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Create custom icons for different types
const createCustomIcon = (color: string) => {
  return L.divIcon({
    className: 'custom-div-icon',
    html: `<div style="background-color: ${color}; width: 30px; height: 30px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 5px rgba(0,0,0,0.3);"></div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });
};

const tripIcon = createCustomIcon('#3b82f6'); // Blue for trips
const shiftIcon = createCustomIcon('#10b981'); // Green for shifts
const emergencyIcon = createCustomIcon('#ef4444'); // Red for emergencies

interface MapViewProps {
  trips: (Trip & { user?: User })[];
  shifts?: (Shift & { user?: User; hasUnresolvedEmergency?: boolean; checkInCount?: number; lastCheckIn?: string; lastCheckInStatus?: string })[];
  emergencies?: (EmergencyAlert & { user?: User })[];
  focusedEmergency?: (EmergencyAlert & { user?: User }) | null;
  onMarkerClick?: (userId: string) => void;
}

function MapUpdater({ center, disabled }: { center: [number, number]; disabled?: boolean }) {
  const map = useMap();
  useEffect(() => {
    if (disabled) return;
    map.setView(center, map.getZoom());
  }, [center, disabled, map]);
  return null;
}

function EmergencyFocus({ emergency }: { emergency?: (EmergencyAlert & { user?: User }) | null }) {
  const map = useMap();
  useEffect(() => {
    if (!emergency) return;
    const { latitude, longitude } = emergency.location;
    map.setView([latitude, longitude], 15, { animate: true });
  }, [emergency, map]);
  return null;
}

export default function MapView({
  trips,
  shifts = [],
  emergencies = [],
  focusedEmergency,
  onMarkerClick,
}: MapViewProps) {
  const defaultCenter: [number, number] = [49.2827, -123.1207]; // Vancouver, BC
  const markerRefs = useRef<Record<string, L.Marker>>({});

  const registerMarker = (userId: string) => (marker: L.Marker | null) => {
    if (!marker) {
      delete markerRefs.current[userId];
      return;
    }
    markerRefs.current[userId] = marker;
  };

  const emergencyByUserId = useMemo(() => {
    const map = new Map<string, (EmergencyAlert & { user?: User })>();
    emergencies.forEach((emergency) => {
      map.set(emergency.userId, emergency);
    });
    return map;
  }, [emergencies]);

  const representedUsers = useMemo(() => {
    const userIds = new Set<string>();
    shifts.forEach((shift) => {
      if (shift.currentLocation) {
        userIds.add(shift.userId);
      }
    });
    trips.forEach((trip) => {
      if (trip.route && trip.route.length > 0) {
        userIds.add(trip.userId);
      }
    });
    return userIds;
  }, [shifts, trips]);

  const fallbackEmergencies = useMemo(() => {
    return emergencies.filter((emergency) => !representedUsers.has(emergency.userId));
  }, [emergencies, representedUsers]);

  const mapCenter = useMemo<[number, number]>(() => {
    const allPositions: { latitude: number; longitude: number }[] = [];

    trips.forEach((trip) => {
      if (trip.route && trip.route.length > 0) {
        allPositions.push(trip.route[trip.route.length - 1]);
      }
    });

    shifts.forEach((shift) => {
      if (shift.currentLocation) {
        allPositions.push(shift.currentLocation);
      }
    });

    emergencies.forEach((emergency) => {
      if (emergency.location) {
        allPositions.push(emergency.location);
      }
    });

    if (allPositions.length === 0) return defaultCenter;

    const avgLat = allPositions.reduce((sum, pos) => sum + pos.latitude, 0) / allPositions.length;
    const avgLng = allPositions.reduce((sum, pos) => sum + pos.longitude, 0) / allPositions.length;

    return [avgLat, avgLng];
  }, [trips, shifts, emergencies]);

  useEffect(() => {
    if (!focusedEmergency) return;
    const marker = markerRefs.current[focusedEmergency.userId];
    marker?.openPopup();
  }, [focusedEmergency]);

  return (
    <MapContainer
      center={mapCenter}
      zoom={12}
      style={{ height: '100%', width: '100%' }}
    >
      <MapUpdater center={mapCenter} disabled={Boolean(focusedEmergency)} />
      <EmergencyFocus emergency={focusedEmergency} />
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      
      {/* Render shift markers */}
      {shifts.map((shift) => {
        if (!shift.currentLocation) return null;
        const emergencyForShift = emergencyByUserId.get(shift.userId);
        const markerIcon = emergencyForShift ? emergencyIcon : shiftIcon;
        
        const duration = Math.floor((new Date().getTime() - new Date(shift.startTime).getTime()) / 60000);
        const hours = Math.floor(duration / 60);
        const minutes = duration % 60;

        return (
          <Marker 
            key={`shift-${shift.id}`}
            position={[shift.currentLocation.latitude, shift.currentLocation.longitude]}
            icon={markerIcon}
            ref={registerMarker(shift.userId)}
            eventHandlers={{
              click: () => onMarkerClick?.(shift.userId),
            }}
          >
            <Popup>
              <div className="p-2 min-w-[200px]">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-bold">
                    {shift.user?.firstName} {shift.user?.lastName}
                  </h3>
                  <span className="px-2 py-1 bg-green-100 text-green-800 text-xs font-bold rounded">
                    ON SHIFT
                  </span>
                </div>
                <div className="text-sm space-y-1">
                  {shift.clientName && <p><strong>Client:</strong> {shift.clientName}</p>}
                  {shift.clientAddress && <p><strong>Address:</strong> {shift.clientAddress}</p>}
                  <p><strong>Started:</strong> {new Date(shift.startTime).toLocaleString()}</p>
                  <p><strong>Duration:</strong> {hours}h {minutes}m</p>
                  <p><strong>Check-ins:</strong> {shift.checkInCount || 0}</p>
                  {shift.lastCheckIn && (
                    <p><strong>Last Check-in:</strong> {new Date(shift.lastCheckIn).toLocaleTimeString()}</p>
                  )}
                  {shift.user?.department && (
                    <p><strong>Department:</strong> {shift.user.department}</p>
                  )}
                  {emergencyForShift && (
                    <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800">
                      <p className="font-bold text-red-700">🚨 Emergency: {emergencyForShift.type.replace(/_/g, ' ')}</p>
                      <p><strong>Triggered:</strong> {new Date(emergencyForShift.timestamp).toLocaleTimeString()}</p>
                      {emergencyForShift.notes && (
                        <p className="mt-1"><strong>Notes:</strong> {emergencyForShift.notes}</p>
                      )}
                      <a
                        href={`https://maps.google.com/?q=${emergencyForShift.location.latitude},${emergencyForShift.location.longitude}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 inline-flex items-center text-red-600 hover:underline"
                      >
                        Open in Maps ↗
                      </a>
                    </div>
                  )}
                </div>
                <button
                  onClick={() => onMarkerClick?.(shift.userId)}
                  className="mt-2 w-full bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700"
                >
                  View Full Details
                </button>
              </div>
            </Popup>
          </Marker>
        );
      })}
      
      {/* Render trip markers and routes */}
      {trips.map((trip) => {
        if (!trip.route || trip.route.length === 0) return null;
        
        const lastPosition = trip.route[trip.route.length - 1];
        const routeCoordinates: [number, number][] = trip.route.map(point => [
          point.latitude,
          point.longitude,
        ]);

        return (
          <div key={`trip-${trip.id}`}>
            {/* Route line */}
            <Polyline
              positions={routeCoordinates}
              color="#3b82f6"
              weight={3}
              opacity={0.6}
            />
            
            {/* Current position marker */}
            <Marker 
              position={[lastPosition.latitude, lastPosition.longitude]}
              icon={tripIcon}
              eventHandlers={{
                click: () => onMarkerClick?.(trip.userId),
              }}
            >
              <Popup>
                <div className="p-2 min-w-[200px]">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-bold">
                      {trip.user?.firstName} {trip.user?.lastName}
                    </h3>
                    <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs font-bold rounded">
                      ON TRIP
                    </span>
                  </div>
                  <div className="text-sm space-y-1">
                    <p><strong>Started:</strong> {new Date(trip.startTime).toLocaleString()}</p>
                    <p><strong>Distance:</strong> {((trip.distanceInMiles || 0) * 1.60934).toFixed(2)} km</p>
                    <p><strong>Category:</strong> {trip.category}</p>
                    {trip.user?.department && (
                      <p><strong>Department:</strong> {trip.user.department}</p>
                    )}
                    <p><strong>Last Update:</strong> {new Date(lastPosition.timestamp).toLocaleTimeString()}</p>
                    <p><strong>Route Points:</strong> {trip.route.length}</p>
                  </div>
                  <button
                    onClick={() => onMarkerClick?.(trip.userId)}
                    className="mt-2 w-full bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700"
                  >
                    View Full Details
                  </button>
                </div>
              </Popup>
            </Marker>
          </div>
        );
      })}

      {/* Emergency-only markers (if no active shift/trip location available) */}
      {fallbackEmergencies.map((emergency) => (
        <Marker
          key={`emergency-${emergency.id}`}
          position={[emergency.location.latitude, emergency.location.longitude]}
          icon={emergencyIcon}
          ref={registerMarker(emergency.userId)}
          eventHandlers={{
            click: () => onMarkerClick?.(emergency.userId),
          }}
        >
          <Popup autoClose={false} closeButton>
            <div className="p-2 min-w-[220px]">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="font-bold">
                  {emergency.user?.firstName} {emergency.user?.lastName}
                </h3>
                <span className="rounded-full bg-red-100 px-2 py-1 text-xs font-bold text-red-700">
                  EMERGENCY
                </span>
              </div>
              <div className="space-y-1 text-sm">
                <p><strong>Type:</strong> {emergency.type.replace(/_/g, ' ')}</p>
                <p><strong>Triggered:</strong> {new Date(emergency.timestamp).toLocaleString()}</p>
                {emergency.notes && <p><strong>Notes:</strong> {emergency.notes}</p>}
                <a
                  href={`https://maps.google.com/?q=${emergency.location.latitude},${emergency.location.longitude}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center text-red-600 hover:underline"
                >
                  Open in Maps ↗
                </a>
              </div>
              <button
                onClick={() => onMarkerClick?.(emergency.userId)}
                className="mt-3 w-full rounded bg-red-600 px-3 py-1 text-sm font-semibold text-white hover:bg-red-700"
              >
                View Full Profile
              </button>
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
