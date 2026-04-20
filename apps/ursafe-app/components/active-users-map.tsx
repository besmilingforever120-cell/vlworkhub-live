"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { MapContainer, Marker, TileLayer, Tooltip, useMap } from "react-leaflet";
import type { DivIcon } from "leaflet";
import "leaflet/dist/leaflet.css";
import type { UrsafeActiveSession, UrsafeUser } from "@vlworkhub/types";

type ActivePresenceStatus = "online" | "idle" | "stale";

type DecoratedSession = UrsafeActiveSession & {
  user?: UrsafeUser;
  status: ActivePresenceStatus;
  isDisconnected: boolean;
  minutesSinceLastSeen: number;
};

type Props = {
  sessions: DecoratedSession[];
  highlightedUserId?: string | null;
  onMarkerEnter?: (session: DecoratedSession) => void;
  onMarkerLeave?: (session: DecoratedSession) => void;
  onMarkerClick?: (session: DecoratedSession) => void;
};

const defaultCenter: [number, number] = [14.5995, 120.9842];

function getStatusColor(status: ActivePresenceStatus) {
  switch (status) {
    case "online":
      return "#10b981";
    case "idle":
      return "#f59e0b";
    case "stale":
    default:
      return "#6b7280";
  }
}

function buildMarkerIcon(session: DecoratedSession, highlighted: boolean) {
  return { color: getStatusColor(session.status), highlighted };
}

function KeepCentered({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, map.getZoom(), { animate: true });
  }, [center, map]);
  return null;
}

export default function ActiveUsersMap(props: Props) {
  const pathname = usePathname();
  const [isMounted, setIsMounted] = useState(false);
  const [leafletIcons, setLeafletIcons] = useState<{ create: (color: string, highlighted: boolean, disconnected: boolean) => DivIcon } | null>(null);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadLeaflet = async () => {
      const leafletModule = await import("leaflet");
      const leaflet = leafletModule.default ?? leafletModule;

      if (!cancelled) {
        setLeafletIcons({
          create: (color: string, highlighted: boolean, disconnected: boolean) => {
            const pulse = highlighted ? "pulse" : "";
            const disconnectedRing = disconnected
              ? "box-shadow:0 0 0 6px rgba(244,63,94,0.28),0 0 0 12px rgba(244,63,94,0.15);"
              : "";

            return leaflet.divIcon({
              className: "active-user-div-icon",
              html: `<div style="width:${highlighted ? 30 : 22}px;height:${highlighted ? 30 : 22}px;border-radius:999px;background:${color};border:3px solid white;${disconnectedRing}animation:${pulse ? "pulse 1.2s ease-in-out infinite" : "none"};"></div>`,
              iconSize: highlighted ? [30, 30] : [22, 22],
              iconAnchor: highlighted ? [15, 15] : [11, 11]
            });
          }
        });
      }
    };

    void loadLeaflet();

    return () => {
      cancelled = true;
    };
  }, []);

  const markers = useMemo(() => {
    return props.sessions.filter((session) => Boolean(session.location?.latitude) && Boolean(session.location?.longitude));
  }, [props.sessions]);

  const highlightedMarker = useMemo(
    () => markers.find((session) => session.userId === props.highlightedUserId),
    [markers, props.highlightedUserId]
  );

  const center: [number, number] = highlightedMarker?.location
    ? [highlightedMarker.location.latitude, highlightedMarker.location.longitude]
    : markers[0]?.location
      ? [markers[0].location.latitude, markers[0].location.longitude]
      : defaultCenter;

  if (!isMounted) {
    return <div className="h-full w-full bg-slate-100" />;
  }

  return (
    <div className="h-full w-full">
      <MapContainer
        key={`${pathname || "active-users"}-active-users-map-mounted`}
        center={center}
        zoom={12}
        scrollWheelZoom
        className="h-full w-full"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <KeepCentered center={center} />
        {markers.map((session) => {
          if (!session.location) return null;
          const highlighted = session.userId === props.highlightedUserId;
          const markerTheme = buildMarkerIcon(session, highlighted);
          const icon = leafletIcons?.create(markerTheme.color, markerTheme.highlighted, session.isDisconnected);
          const employeeName = session.user
            ? `${session.user.firstName ?? ""} ${session.user.lastName ?? ""}`.trim()
            : session.userId;

          return (
            <Marker
              key={session.id}
              position={[session.location.latitude, session.location.longitude]}
              icon={icon}
              eventHandlers={{
                mouseover: () => props.onMarkerEnter?.(session),
                mouseout: () => props.onMarkerLeave?.(session),
                click: () => props.onMarkerClick?.(session)
              }}
            >
              <Tooltip direction="top" offset={[0, -8]} opacity={1}>
                <div className="max-w-xs">
                  <div className="font-semibold text-slate-900">{employeeName}</div>
                  <div className="text-xs text-slate-600">{session.status.toUpperCase()}</div>
                  <div className="mt-1 text-xs text-slate-500">{session.location.address || `${session.location.latitude.toFixed(5)}, ${session.location.longitude.toFixed(5)}`}</div>
                  <div className="text-xs text-slate-500">{session.minutesSinceLastSeen}m since last ping</div>
                </div>
              </Tooltip>
            </Marker>
          );
        })}
      </MapContainer>

      <style jsx global>{`
        @keyframes pulse {
          0% {
            transform: scale(1);
          }
          50% {
            transform: scale(1.18);
          }
          100% {
            transform: scale(1);
          }
        }
      `}</style>
    </div>
  );
}
