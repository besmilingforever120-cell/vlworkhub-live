import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { Location as LocationType } from '../types';

const TASK_NAME = 'TRIP_ROUTE_TRACKING_TASK';
const STATE_KEY = '@trip-route-tracking-state';
const ROUTE_KEY = '@trip-route-points';

interface TripTrackingState {
  tripId: string;
  userId: string;
}

const readTrackingState = async (): Promise<TripTrackingState | null> => {
  const stored = await AsyncStorage.getItem(STATE_KEY);
  if (!stored) {
    return null;
  }
  try {
    return JSON.parse(stored) as TripTrackingState;
  } catch (error) {
    console.warn('Unable to parse trip tracking state', error);
    return null;
  }
};

const writeTrackingState = async (state: TripTrackingState | null) => {
  if (!state) {
    await AsyncStorage.removeItem(STATE_KEY);
    return;
  }
  await AsyncStorage.setItem(STATE_KEY, JSON.stringify(state));
};

export const readTripRoute = async (): Promise<LocationType[]> => {
  const stored = await AsyncStorage.getItem(ROUTE_KEY);
  if (!stored) {
    return [];
  }
  try {
    return JSON.parse(stored) as LocationType[];
  } catch (error) {
    console.warn('Unable to parse trip route points', error);
    return [];
  }
};

export const writeTripRoute = async (points: LocationType[]) => {
  await AsyncStorage.setItem(ROUTE_KEY, JSON.stringify(points));
};

export const clearTripRoute = async () => {
  await AsyncStorage.removeItem(ROUTE_KEY);
};

const buildRoutePoint = (location: Location.LocationObject): LocationType | null => {
  if (!location?.coords) {
    return null;
  }
  return {
    latitude: location.coords.latitude,
    longitude: location.coords.longitude,
    accuracy: location.coords.accuracy ?? undefined,
    timestamp: new Date(location.timestamp).toISOString(),
  };
};

const isDuplicatePoint = (last: LocationType, next: LocationType) => {
  const latDiff = Math.abs(last.latitude - next.latitude);
  const lonDiff = Math.abs(last.longitude - next.longitude);
  const timeDiff = Math.abs(new Date(last.timestamp).getTime() - new Date(next.timestamp).getTime());
  return latDiff < 0.00001 && lonDiff < 0.00001 && timeDiff < 10000;
};

export const appendTripRoutePoint = async (point: LocationType) => {
  const route = await readTripRoute();
  const lastPoint = route[route.length - 1];
  if (lastPoint && isDuplicatePoint(lastPoint, point)) {
    return;
  }
  route.push(point);
  await writeTripRoute(route);
};

let taskDefined = false;

const ensureTaskDefinition = () => {
  if (taskDefined) {
    return;
  }

  TaskManager.defineTask(TASK_NAME, async ({ data, error }) => {
    if (error) {
      console.error('Trip route background task error', error);
      return;
    }

    const state = await readTrackingState();
    if (!state) {
      return;
    }

    const locations = (data as { locations?: Location.LocationObject[] })?.locations;
    const latestLocation =
      Array.isArray(locations) && locations.length > 0
        ? locations[locations.length - 1]
        : undefined;
    if (!latestLocation) {
      return;
    }

    const point = buildRoutePoint(latestLocation);
    if (!point) {
      return;
    }

    await appendTripRoutePoint(point);
  });

  taskDefined = true;
};

export const ensureTripTrackingTask = () => {
  ensureTaskDefinition();
};

const ensurePermissions = async () => {
  try {
    const foreground = await Location.getForegroundPermissionsAsync();
    if (foreground.status !== 'granted') {
      const requested = await Location.requestForegroundPermissionsAsync();
      if (requested.status !== 'granted') {
        return false;
      }
    }

    const background = await Location.getBackgroundPermissionsAsync();
    if (background.status !== 'granted') {
      const requested = await Location.requestBackgroundPermissionsAsync();
      if (requested.status !== 'granted') {
        return false;
      }
    }

    return true;
  } catch (error) {
    console.warn('Unable to request background location permissions for trip tracking', error);
    return false;
  }
};

export const startTripTracking = async (
  state: TripTrackingState,
): Promise<boolean> => {
  ensureTaskDefinition();
  await writeTrackingState(state);

  const hasPermission = await ensurePermissions();
  if (!hasPermission) {
    return false;
  }

  try {
    const running = await Location.hasStartedLocationUpdatesAsync(TASK_NAME);
    if (!running) {
      await Location.startLocationUpdatesAsync(TASK_NAME, {
        accuracy: Location.Accuracy.BestForNavigation,
        timeInterval: 5000,
        distanceInterval: 10,
        showsBackgroundLocationIndicator: true,
        foregroundService: {
          notificationTitle: 'URSafe Safety Centre',
          notificationBody: 'Tracking trip location in the background.',
        },
      });
    }
    return true;
  } catch (error) {
    console.warn('Unable to start trip background tracking', error);
    return false;
  }
};

export const stopTripTracking = async (): Promise<void> => {
  ensureTaskDefinition();
  await writeTrackingState(null);
  const running = await Location.hasStartedLocationUpdatesAsync(TASK_NAME);
  if (running) {
    await Location.stopLocationUpdatesAsync(TASK_NAME);
  }
};
