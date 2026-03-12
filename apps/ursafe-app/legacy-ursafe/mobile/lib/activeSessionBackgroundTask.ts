import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { API_URL } from './api';

const TASK_NAME = 'ACTIVE_SESSION_LOCATION_TASK';
const STORAGE_KEY = '@active-session-tracking-state';

interface ActiveSessionTrackingState {
  userId: string;
  sessionId: string;
  deviceName?: string;
  platform?: string;
}

const readTrackingState = async (): Promise<ActiveSessionTrackingState | null> => {
  const stored = await AsyncStorage.getItem(STORAGE_KEY);
  if (!stored) {
    return null;
  }
  try {
    return JSON.parse(stored) as ActiveSessionTrackingState;
  } catch (error) {
    console.warn('Unable to parse active session tracking state', error);
    return null;
  }
};

const writeTrackingState = async (state: ActiveSessionTrackingState | null) => {
  if (!state) {
    await AsyncStorage.removeItem(STORAGE_KEY);
    return;
  }
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state));
};

const buildLocationPayload = (location?: Location.LocationObject) => {
  if (!location?.coords) {
    return undefined;
  }
  return {
    latitude: location.coords.latitude,
    longitude: location.coords.longitude,
    accuracy: location.coords.accuracy ?? undefined,
    timestamp: new Date(location.timestamp).toISOString(),
  };
};

const getConnectionStatus = async (): Promise<'online' | 'offline' | 'unknown'> => {
  try {
    const state = await NetInfo.fetch();
    if (state.isConnected && state.isInternetReachable !== false) {
      return 'online';
    }
    if (state.isConnected === false) {
      return 'offline';
    }
  } catch (error) {
    console.warn('Unable to read network status', error);
  }
  return 'unknown';
};

const sendBackgroundHeartbeat = async (
  state: ActiveSessionTrackingState,
  location?: Location.LocationObject,
) => {
  const locationPayload = buildLocationPayload(location);
  const connectionStatus = await getConnectionStatus();
  const notes = JSON.stringify({ connectionStatus });
  const payload = {
    userId: state.userId,
    sessionId: state.sessionId,
    status: 'online',
    deviceName: state.deviceName,
    platform: state.platform,
    lastSeenAt: new Date().toISOString(),
    lastKnownActivity: 'background',
    location: locationPayload,
    notes,
  };

  try {
    await fetch(`${API_URL}/api/active-users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    console.warn('Background active session heartbeat failed:', error);
  }
};

let taskDefined = false;

const ensureTaskDefinition = () => {
  if (taskDefined) {
    return;
  }

  TaskManager.defineTask(TASK_NAME, async ({ data, error }) => {
    if (error) {
      console.error('Active session background task error', error);
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

    await sendBackgroundHeartbeat(state, latestLocation);
  });

  taskDefined = true;
};

export const ensureActiveSessionTrackingTask = () => {
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
    console.warn('Unable to request background location permissions', error);
    return false;
  }
};

export const startActiveSessionTracking = async (
  state: ActiveSessionTrackingState,
): Promise<boolean> => {
  ensureTaskDefinition();
  await writeTrackingState(state);

  try {
    const hasPermission = await ensurePermissions();
    if (!hasPermission) {
      return false;
    }

    const alreadyRunning = await Location.hasStartedLocationUpdatesAsync(TASK_NAME);
    if (!alreadyRunning) {
      await Location.startLocationUpdatesAsync(TASK_NAME, {
        accuracy: Location.Accuracy.Balanced,
        timeInterval: 15000,
        distanceInterval: 25,
        showsBackgroundLocationIndicator: true,
        foregroundService: {
          notificationTitle: 'URSafe Safety Centre',
          notificationBody: 'Tracking location while you are signed in.',
        },
      });
    }

    return true;
  } catch (error) {
    console.warn('Unable to start background location tracking', error);
    return false;
  }
};

export const stopActiveSessionTracking = async (): Promise<void> => {
  ensureTaskDefinition();
  await writeTrackingState(null);
  const running = await Location.hasStartedLocationUpdatesAsync(TASK_NAME);
  if (running) {
    await Location.stopLocationUpdatesAsync(TASK_NAME);
  }
};
