import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import { apiRequestWithFallback } from "./api";

const TASK_NAME = "URSAFE_ACTIVE_SESSION_TASK";
const STATE_KEY = "ursafe.mobile.activeSession.state";

type SessionTaskState = {
  token: string;
  userId: string;
  sessionId: string;
};

let taskDefined = false;

async function readState() {
  const raw = await AsyncStorage.getItem(STATE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SessionTaskState;
  } catch {
    return null;
  }
}

async function writeState(state: SessionTaskState | null) {
  if (!state) {
    await AsyncStorage.removeItem(STATE_KEY);
    return;
  }
  await AsyncStorage.setItem(STATE_KEY, JSON.stringify(state));
}

function ensureTask() {
  if (taskDefined) return;

  TaskManager.defineTask(TASK_NAME, async ({ data, error }) => {
    if (error) return;
    const state = await readState();
    if (!state) return;

    const locations = (data as { locations?: Location.LocationObject[] })?.locations || [];
    const latest = locations[locations.length - 1];

    await apiRequestWithFallback(
      "/ursafe/sessions",
      "/ursafe/active-sessions",
      {
        method: "POST",
        body: JSON.stringify({
          sessionId: state.sessionId,
          userId: state.userId,
          status: "online",
          lastSeenAt: new Date().toISOString(),
          location: latest
            ? {
                latitude: latest.coords.latitude,
                longitude: latest.coords.longitude,
                accuracy: latest.coords.accuracy ?? undefined,
                timestamp: new Date(latest.timestamp).toISOString()
              }
            : undefined
        })
      },
      state.token
    ).catch(() => undefined);
  });

  taskDefined = true;
}

export async function startActiveSessionBackground(state: SessionTaskState) {
  ensureTask();
  await writeState(state);

  const running = await Location.hasStartedLocationUpdatesAsync(TASK_NAME);
  if (running) return true;

  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== "granted") return false;
  const bg = await Location.requestBackgroundPermissionsAsync();
  if (bg.status !== "granted") return false;

  await Location.startLocationUpdatesAsync(TASK_NAME, {
    accuracy: Location.Accuracy.Balanced,
    distanceInterval: 25,
    timeInterval: 15000,
    foregroundService: {
      notificationTitle: "URSafe Session Tracking",
      notificationBody: "Keeping your safety session online"
    }
  });

  return true;
}

export async function stopActiveSessionBackground() {
  ensureTask();
  await writeState(null);
  const running = await Location.hasStartedLocationUpdatesAsync(TASK_NAME);
  if (running) {
    await Location.stopLocationUpdatesAsync(TASK_NAME);
  }
}
