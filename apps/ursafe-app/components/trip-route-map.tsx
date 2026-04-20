"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import type { DivIcon } from "leaflet";
import { MapContainer, Marker, Polyline, TileLayer, Tooltip } from "react-leaflet";
import type { UrsafeLocation } from "@vlworkhub/types";
import "leaflet/dist/leaflet.css";

type Props = {
  route: UrsafeLocation[];
  startLocation?: UrsafeLocation | null;
  endLocation?: UrsafeLocation | null;
};

const DEFAULT_CENTER: [number, number] = [14.5995, 120.9842];

function toPosition(point: UrsafeLocation | null | undefined): [number, number] | null {
  if (!point) return null;
  const latitude = Number(point.latitude);
  const longitude = Number(point.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return [latitude, longitude];
}

export default function TripRouteMap(props: Props) {
  const pathname = usePathname();
  const [isMounted, setIsMounted] = useState(false);
  const [icons, setIcons] = useState<{ start: DivIcon; waypoint: DivIcon; end: DivIcon } | null>(null);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadLeaflet = async () => {
      const leafletModule = await import("leaflet");
      const leaflet = leafletModule.default ?? leafletModule;

      const dotIcon = (color: string) => {
        return leaflet.divIcon({
          className: "trip-route-dot",
          html: `<span style="display:block;width:16px;height:16px;border-radius:999px;background:${color};border:2px solid #ffffff;box-shadow:0 2px 8px rgba(15,23,42,0.35);"></span>`,
          iconSize: [16, 16],
          iconAnchor: [8, 8]
        });
      };

      if (!cancelled) {
        setIcons({
          start: dotIcon("#16a34a"),
          waypoint: dotIcon("#2563eb"),
          end: dotIcon("#dc2626")
        });
      }
    };

    void loadLeaflet();

    return () => {
      cancelled = true;
    };
  }, []);
  const points = useMemo(() => {
    const routePoints = props.route
      .map((point) => ({ point, position: toPosition(point) }))
      .filter((entry): entry is { point: UrsafeLocation; position: [number, number] } => Boolean(entry.position));

    if (routePoints.length > 0) return routePoints;

    const fallback: Array<{ point: UrsafeLocation; position: [number, number] }> = [];
    const startPosition = toPosition(props.startLocation);
    const endPosition = toPosition(props.endLocation);

    if (props.startLocation && startPosition) {
      fallback.push({ point: props.startLocation, position: startPosition });
    }
    if (props.endLocation && endPosition) {
      fallback.push({ point: props.endLocation, position: endPosition });
    }

    return fallback;
  }, [props.route, props.startLocation, props.endLocation]);

  if (points.length === 0) {
    return (
      <div className="flex h-[300px] items-center justify-center rounded-lg border border-dashed border-gray-300 bg-gray-50 px-4 text-sm text-gray-600">
        No route coordinates are available for this trip.
      </div>
    );
  }

  const positions = points.map((entry) => entry.position);
  const center = positions[Math.floor(positions.length / 2)] || DEFAULT_CENTER;
  const start = points[0];
  const end = points[points.length - 1];
  const middle = points.slice(1, -1);

  if (!isMounted) {
    return <div className="h-[300px] rounded-lg border border-gray-200 bg-slate-100" />;
  }

  return (
    <div className="h-[300px] overflow-hidden rounded-lg border border-gray-200">
      <MapContainer
        key={`${pathname || "trip-route"}-trip-route-map`}
        center={center}
        zoom={13}
        scrollWheelZoom
        className="h-full w-full"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {positions.length > 1 ? <Polyline positions={positions} pathOptions={{ color: "#2563eb", weight: 5, opacity: 0.85 }} /> : null}

        <Marker position={start.position} icon={icons?.start}>
          <Tooltip>
            <div className="text-xs">
              <div className="font-semibold">Start</div>
              <div>{start.point.address || `${start.position[0].toFixed(5)}, ${start.position[1].toFixed(5)}`}</div>
            </div>
          </Tooltip>
        </Marker>

        {middle.map((entry, index) => (
          <Marker key={`waypoint-${index}-${entry.position[0]}-${entry.position[1]}`} position={entry.position} icon={icons?.waypoint}>
            <Tooltip>
              <div className="text-xs">
                <div className="font-semibold">Waypoint {index + 1}</div>
                <div>{entry.point.address || `${entry.position[0].toFixed(5)}, ${entry.position[1].toFixed(5)}`}</div>
              </div>
            </Tooltip>
          </Marker>
        ))}

        {points.length > 1 ? (
          <Marker position={end.position} icon={icons?.end}>
            <Tooltip>
              <div className="text-xs">
                <div className="font-semibold">End</div>
                <div>{end.point.address || `${end.position[0].toFixed(5)}, ${end.position[1].toFixed(5)}`}</div>
              </div>
            </Tooltip>
          </Marker>
        ) : null}
      </MapContainer>
    </div>
  );
}
