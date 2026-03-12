'use client';

import { useEffect, useMemo } from 'react';
import { MapContainer, Marker, Polyline, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Location } from '@/types';

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const createDotIcon = (color: string) =>
  L.divIcon({
    className: 'trip-route-dot',
    html: `<div style="background-color:${color};width:16px;height:16px;border-radius:50%;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.25);"></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });

const startIcon = createDotIcon('#22c55e');
const endIcon = createDotIcon('#ef4444');

function MapCenter({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, map.getZoom());
  }, [center, map]);
  return null;
}

interface TripRouteMapProps {
  route: Location[];
  startLocation?: Location;
  endLocation?: Location;
}

export default function TripRouteMap({ route, startLocation, endLocation }: TripRouteMapProps) {
  const routePoints = useMemo(() => {
    if (route.length > 0) {
      return route;
    }
    const fallback: Location[] = [];
    if (startLocation) fallback.push(startLocation);
    if (endLocation) fallback.push(endLocation);
    return fallback;
  }, [route, startLocation, endLocation]);

  if (routePoints.length === 0) {
    return (
      <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-gray-300 text-sm text-gray-500">
        No route points available for this trip yet.
      </div>
    );
  }

  const positions: [number, number][] = routePoints.map((point) => [point.latitude, point.longitude]);
  const fallbackPolyline: [number, number][] =
    positions.length > 1 || !startLocation || !endLocation
      ? positions
      : [
          [startLocation.latitude, startLocation.longitude],
          [endLocation.latitude, endLocation.longitude],
        ];
  const center: [number, number] = positions[Math.floor(positions.length / 2)];
  const startPoint = routePoints[0];
  const endPoint = routePoints[routePoints.length - 1];

  return (
    <MapContainer center={center} zoom={13} style={{ height: '100%', width: '100%' }}>
      <MapCenter center={center} />
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {fallbackPolyline.length > 1 && (
        <Polyline positions={fallbackPolyline} color="#2563eb" weight={4} opacity={0.75} />
      )}
      <Marker position={[startPoint.latitude, startPoint.longitude]} icon={startIcon} />
      <Marker position={[endPoint.latitude, endPoint.longitude]} icon={endIcon} />
    </MapContainer>
  );
}
