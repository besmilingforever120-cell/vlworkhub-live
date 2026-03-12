'use client';

import { useEffect, useMemo } from 'react';
import { MapContainer, Marker, TileLayer, Tooltip, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { ActiveUserSession, User } from '@/types';

const DEFAULT_CENTER: [number, number] = [49.2827, -123.1207];

const buildIcon = (color: string, size = 28) =>
  L.divIcon({
    className: 'active-user-marker',
    html: `<div style="background:${color};width:${size}px;height:${size}px;border-radius:50%;border:3px solid white;box-shadow:0 6px 18px rgba(0,0,0,0.25);"></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });

const ICONS = {
  online: buildIcon('#16a34a'),
  idle: buildIcon('#f97316'),
  stale: buildIcon('#9ca3af'),
};

const HIGHLIGHT_ICONS = {
  online: buildIcon('#22c55e', 34),
  idle: buildIcon('#fb923c', 34),
  stale: buildIcon('#d1d5db', 34),
};

function MapCenterFollower({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, map.getZoom(), { animate: true });
  }, [center, map]);
  return null;
}

export interface SessionWithUser extends ActiveUserSession {
  user?: User;
  minutesSinceLastSeen: number;
}

interface ActiveUsersMapProps {
  sessions: SessionWithUser[];
  highlightedUserId?: string | null;
  onMarkerEnter?: (session: SessionWithUser) => void;
  onMarkerLeave?: () => void;
  onMarkerClick?: (session: SessionWithUser) => void;
}

export default function ActiveUsersMap({
  sessions,
  highlightedUserId,
  onMarkerEnter,
  onMarkerLeave,
  onMarkerClick,
}: ActiveUsersMapProps) {
  const sessionsWithLocation = sessions.filter((session) => session.location);

  const mapCenter = useMemo<[number, number]>(() => {
    if (sessionsWithLocation.length === 0) {
      return DEFAULT_CENTER;
    }

    if (highlightedUserId) {
      const focused = sessionsWithLocation.find((session) => session.userId === highlightedUserId);
      if (focused && focused.location) {
        return [focused.location.latitude, focused.location.longitude];
      }
    }

    const avgLat =
      sessionsWithLocation.reduce((sum, session) => sum + (session.location?.latitude || 0), 0) /
      sessionsWithLocation.length;
    const avgLng =
      sessionsWithLocation.reduce((sum, session) => sum + (session.location?.longitude || 0), 0) /
      sessionsWithLocation.length;
    return [avgLat, avgLng];
  }, [sessionsWithLocation, highlightedUserId]);

  return (
    <MapContainer center={mapCenter} zoom={12} style={{ width: '100%', height: '100%' }}>
      <MapCenterFollower center={mapCenter} />
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {sessionsWithLocation.map((session) => {
        const { location } = session;
        if (!location) return null;
        const isHighlighted = session.userId === highlightedUserId;
        const iconSet = isHighlighted ? HIGHLIGHT_ICONS : ICONS;
        const icon = iconSet[session.status] || iconSet.online;
        const lastSeenLabel = new Date(session.lastSeenAt).toLocaleTimeString();

        return (
          <Marker
            key={session.id}
            position={[location.latitude, location.longitude]}
            icon={icon}
            eventHandlers={{
              click: () => onMarkerClick?.(session),
              mouseover: () => onMarkerEnter?.(session),
              mouseout: () => onMarkerLeave?.(),
            }}
          >
            <Tooltip direction="top" offset={[0, -10]} opacity={0.95} sticky>
              <div className="space-y-1 text-xs text-slate-900">
                <p className="text-sm font-bold text-slate-900">
                  {session.user?.firstName} {session.user?.lastName}
                </p>
                {session.user?.department && <p className="text-slate-700">{session.user.department}</p>}
                <p>
                  <span className="font-semibold text-slate-700">Status:</span>{' '}
                  <span className="uppercase tracking-wide text-slate-900">{session.status}</span>
                </p>
                <p>
                  <span className="font-semibold text-slate-700">Last seen:</span> {lastSeenLabel}
                </p>
                {location.address && <p className="text-slate-700">{location.address}</p>}
              </div>
            </Tooltip>
          </Marker>
        );
      })}
    </MapContainer>
  );
}
