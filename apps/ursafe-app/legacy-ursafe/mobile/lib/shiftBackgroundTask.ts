import AsyncStorage from '@react-native-async-storage/async-storage';
import * as TaskManager from 'expo-task-manager';
import * as BackgroundFetch from 'expo-background-fetch';
import {
  ShiftNotificationContext,
  showShiftOngoingNotification,
  dismissShiftNotification,
} from './notifications';

const TASK_NAME = 'SHIFT_TIMER_REFRESH_TASK';
const STORAGE_KEY = '@shift-timer-task-state';

interface StoredShiftState {
  shift: ShiftNotificationContext;
  notificationId?: string | null;
}

let taskDefined = false;

const ensureTaskDefinition = () => {
  if (taskDefined) {
    return;
  }

  TaskManager.defineTask(TASK_NAME, async () => {
    try {
      const serialized = await AsyncStorage.getItem(STORAGE_KEY);
      if (!serialized) {
        return BackgroundFetch.BackgroundFetchResult.NoData;
      }

      const payload: StoredShiftState = JSON.parse(serialized);
      if (!payload?.shift) {
        return BackgroundFetch.BackgroundFetchResult.NoData;
      }

      const notificationId = await showShiftOngoingNotification(payload.shift, payload.notificationId);
      if (notificationId && notificationId !== payload.notificationId) {
        await AsyncStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ ...payload, notificationId }),
        );
      }

      return BackgroundFetch.BackgroundFetchResult.NewData;
    } catch (error) {
      console.error('Shift timer background task error', error);
      return BackgroundFetch.BackgroundFetchResult.Failed;
    }
  });

  taskDefined = true;
};

const persistStateAsync = async (state: StoredShiftState | null) => {
  if (!state) {
    await AsyncStorage.removeItem(STORAGE_KEY);
    return;
  }

  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state));
};

export const updateShiftTimerBackgroundTask = async (
  shift: ShiftNotificationContext,
  notificationId?: string | null,
): Promise<boolean> => {
  ensureTaskDefinition();
  await persistStateAsync({ shift, notificationId: notificationId ?? null });

  const status = await BackgroundFetch.getStatusAsync();
  if (
    status === BackgroundFetch.BackgroundFetchStatus.Restricted ||
    status === BackgroundFetch.BackgroundFetchStatus.Denied
  ) {
    return false;
  }

  const isRegistered = await TaskManager.isTaskRegisteredAsync(TASK_NAME);
  if (!isRegistered) {
    await BackgroundFetch.registerTaskAsync(TASK_NAME, {
      minimumInterval: 60,
      stopOnTerminate: false,
      startOnBoot: true,
    });
  }

  return true;
};

export const clearShiftTimerBackgroundTask = async (): Promise<void> => {
  ensureTaskDefinition();

  const serialized = await AsyncStorage.getItem(STORAGE_KEY);
  if (serialized) {
    try {
      const payload: StoredShiftState = JSON.parse(serialized);
      if (payload.notificationId) {
        await dismissShiftNotification(payload.notificationId);
      }
    } catch (error) {
      console.warn('Unable to parse stored shift notification state', error);
    }
  }

  await persistStateAsync(null);

  const isRegistered = await TaskManager.isTaskRegisteredAsync(TASK_NAME);
  if (isRegistered) {
    await BackgroundFetch.unregisterTaskAsync(TASK_NAME);
  }
};
