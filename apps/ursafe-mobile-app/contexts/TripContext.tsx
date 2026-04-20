import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { apiRequest } from "../lib/api";
import { appendTripRoutePoint, clearTripRoute, readTripRoute, startTripTracking, stopTripTracking, writeTripRoute } from "../lib/tripBackgroundTask";
import type { MobileLocation, UrsafeTrip } from "../types";
import { useAuth } from "./AuthContext";

type TripContextType = {
  trips: UrsafeTrip[];
  currentTrip: UrsafeTrip | null;
  isTracking: boolean;
  loading: boolean;
  startTrip: (category: string, vehicleInfo?: string, purpose?: string) => Promise<void>;
  stopTrip: (notes?: string) => Promise<void>;
  createEmergency: (type: string, notes?: string) => Promise<void>;
  refreshTrips: () => Promise<void>;
};

const STORAGE_CURRENT_TRIP = "ursafe.mobile.currentTrip";
const TripContext = createContext<TripContextType | undefined>(undefined);

function toLocation(position: Location.LocationObject): MobileLocation {
  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    accuracy: position.coords.accuracy ?? undefined,
    timestamp: new Date(position.timestamp).toISOString()
  };
}

function haversineMiles(route: MobileLocation[]) {
  if (route.length < 2) return 0;
  let total = 0;
  for (let i = 0; i < route.length - 1; i += 1) {
    const a = route[i];
    const b = route[i + 1];
    const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
    const dLon = ((b.longitude - a.longitude) * Math.PI) / 180;
    const lat1 = (a.latitude * Math.PI) / 180;
    const lat2 = (b.latitude * Math.PI) / 180;
    const r = 3959;
    const x = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    total += 2 * r * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  }
  return Number(total.toFixed(2));
}

export function TripProvider(props: { children: React.ReactNode }) {
  const { user, token, activeShiftId } = useAuth();
  const [trips, setTrips] = useState<UrsafeTrip[]>([]);
  const [currentTrip, setCurrentTrip] = useState<UrsafeTrip | null>(null);
  const [loading, setLoading] = useState(false);
  const watchRef = useRef<Location.LocationSubscription | null>(null);

  const isTracking = useMemo(() => Boolean(currentTrip), [currentTrip]);

  useEffect(() => {
    const restore = async () => {
      const raw = await AsyncStorage.getItem(STORAGE_CURRENT_TRIP);
      if (!raw) return;
      try {
        const parsed = JSON.parse(raw) as UrsafeTrip;
        setCurrentTrip(parsed);
      } catch {
        await AsyncStorage.removeItem(STORAGE_CURRENT_TRIP);
      }
    };
    void restore();
  }, []);

  useEffect(() => {
    if (user && token) {
      void refreshTrips();
    }
  }, [token, user]);

  const refreshTrips = async () => {
    if (!token || !user) return;
    setLoading(true);
    try {
      const response = await apiRequest<{ items: UrsafeTrip[] }>(`/ursafe/trips?userId=${encodeURIComponent(user.id)}`, undefined, token);
      setTrips(response.items || []);
    } finally {
      setLoading(false);
    }
  };

  const ensureWatch = async () => {
    if (watchRef.current) return;
    const permission = await Location.requestForegroundPermissionsAsync();
    if (permission.status !== "granted") return;

    watchRef.current = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.BestForNavigation, distanceInterval: 10, timeInterval: 5000 },
      (position) => {
        const point = toLocation(position);
        appendTripRoutePoint(point).catch(() => undefined);
      }
    );
  };

  const stopWatch = () => {
    if (watchRef.current) {
      watchRef.current.remove();
      watchRef.current = null;
    }
  };

  const startTrip = async (category: string, vehicleInfo?: string, purpose?: string) => {
    if (!user) throw new Error("You must be signed in");

    const permission = await Location.requestForegroundPermissionsAsync();
    if (permission.status !== "granted") {
      throw new Error("Location permission is required");
    }

    const now = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    const start = toLocation(now);

    const trip: UrsafeTrip = {
      id: `mobile-${Date.now()}`,
      userId: user.id,
      status: "in_progress",
      category,
      startTime: new Date().toISOString(),
      distanceInMiles: 0,
      startLocation: start,
      route: [start],
      vehicleInfo,
      purpose
    };

    await writeTripRoute([start]);
    await AsyncStorage.setItem(STORAGE_CURRENT_TRIP, JSON.stringify(trip));
    setCurrentTrip(trip);
    await startTripTracking();
    await ensureWatch();
  };

  const stopTrip = async (notes?: string) => {
    if (!currentTrip || !token || !user) throw new Error("No active trip");

    const last = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    const end = toLocation(last);

    const route = await readTripRoute();
    const finalRoute = [...(route.length ? route : currentTrip.route), end];
    const distanceInMiles = haversineMiles(finalRoute);

    const payload = {
      userId: user.id,
      status: "pending_approval",
      category: currentTrip.category,
      startLocation: currentTrip.startLocation,
      endLocation: end,
      startTime: currentTrip.startTime,
      endTime: new Date().toISOString(),
      distanceInMiles,
      route: finalRoute,
      notes,
      vehicleInfo: currentTrip.vehicleInfo,
      purpose: currentTrip.purpose,
      shiftId: activeShiftId ? Number(activeShiftId) : undefined
    };

    await apiRequest<{ item: UrsafeTrip }>("/ursafe/trips", { method: "POST", body: JSON.stringify(payload) }, token);

    if (activeShiftId) {
      await apiRequest(
        "/ursafe/check-ins",
        {
          method: "POST",
          body: JSON.stringify({
            shiftId: Number(activeShiftId),
            userId: user.id,
            timestamp: new Date().toISOString(),
            status: "safe",
            location: end,
            notes: "Trip completed"
          })
        },
        token
      ).catch(() => undefined);
    }

    await stopTripTracking();
    stopWatch();
    await clearTripRoute();
    await AsyncStorage.removeItem(STORAGE_CURRENT_TRIP);
    setCurrentTrip(null);
    await refreshTrips();
  };

  const createEmergency = async (type: string, notes?: string) => {
    if (!token || !user) throw new Error("You must be signed in");

    const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }).catch(() => null);
    await apiRequest(
      "/ursafe/emergencies",
      {
        method: "POST",
        body: JSON.stringify({
          userId: user.id,
          shiftId: activeShiftId ? Number(activeShiftId) : undefined,
          type,
          timestamp: new Date().toISOString(),
          location: location ? toLocation(location) : undefined,
          notes: notes || "Emergency triggered from mobile"
        })
      },
      token
    );
  };

  return (
    <TripContext.Provider value={{ trips, currentTrip, isTracking, loading, startTrip, stopTrip, createEmergency, refreshTrips }}>
      {props.children}
    </TripContext.Provider>
  );
}

export function useTrip() {
  const context = useContext(TripContext);
  if (!context) throw new Error("useTrip must be used inside TripProvider");
  return context;
}
