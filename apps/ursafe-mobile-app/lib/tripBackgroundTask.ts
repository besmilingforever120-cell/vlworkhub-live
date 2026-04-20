import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import type { MobileLocation } from "../types";

const TASK_NAME = "URSAFE_TRIP_ROUTE_TASK";
const ROUTE_KEY = "ursafe.mobile.trip.route";

let taskDefined = false;

export async function readTripRoute(): Promise<MobileLocation[]> {
  const raw = await AsyncStorage.getItem(ROUTE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as MobileLocation[];
  } catch {
    return [];
  }
}

export async function writeTripRoute(points: MobileLocation[]) {
  await AsyncStorage.setItem(ROUTE_KEY, JSON.stringify(points));
}

export async function appendTripRoutePoint(point: MobileLocation) {
  const existing = await readTripRoute();
  const last = existing[existing.length - 1];
  if (last && Math.abs(last.latitude - point.latitude) < 0.00001 && Math.abs(last.longitude - point.longitude) < 0.00001) {
    return;
  }
  existing.push(point);
  await writeTripRoute(existing);
}

export async function clearTripRoute() {
  await AsyncStorage.removeItem(ROUTE_KEY);
}

function ensureTask() {
  if (taskDefined) return;

  TaskManager.defineTask(TASK_NAME, async ({ data, error }) => {
    if (error) return;
    const locations = (data as { locations?: Location.LocationObject[] })?.locations || [];
    const latest = locations[locations.length - 1];
    if (!latest) return;

    await appendTripRoutePoint({
      latitude: latest.coords.latitude,
      longitude: latest.coords.longitude,
      accuracy: latest.coords.accuracy ?? undefined,
      timestamp: new Date(latest.timestamp).toISOString()
    });
  });

  taskDefined = true;
}

export async function startTripTracking() {
  ensureTask();
  const running = await Location.hasStartedLocationUpdatesAsync(TASK_NAME);
  if (running) return true;

  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== "granted") return false;

  const bg = await Location.requestBackgroundPermissionsAsync();
  if (bg.status !== "granted") return false;

  await Location.startLocationUpdatesAsync(TASK_NAME, {
    accuracy: Location.Accuracy.BestForNavigation,
    distanceInterval: 10,
    timeInterval: 5000,
    foregroundService: {
      notificationTitle: "URSafe Trip Tracking",
      notificationBody: "Tracking trip route in background"
    }
  });

  return true;
}

export async function stopTripTracking() {
  ensureTask();
  const running = await Location.hasStartedLocationUpdatesAsync(TASK_NAME);
  if (running) {
    await Location.stopLocationUpdatesAsync(TASK_NAME);
  }
}
