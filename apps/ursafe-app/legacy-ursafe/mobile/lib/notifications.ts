import { Platform } from 'react-native';
import Constants from 'expo-constants';
import type { NotificationContentInput } from 'expo-notifications';

const SHIFT_NOTIFICATION_CHANNEL = 'active-shift-updates';
const EMERGENCY_NOTIFICATION_CHANNEL = 'emergency-alerts';
const DEFAULT_EXPECTED_DURATION_MINUTES = 60;
const isExpoGo = Constants.appOwnership === 'expo';
const shouldSkipAndroidExpoGo = Platform.OS === 'android' && isExpoGo;

type NotificationsModule = typeof import('expo-notifications');

const getNotifications = (): NotificationsModule | null => {
  if (shouldSkipAndroidExpoGo) {
    return null;
  }

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('expo-notifications') as NotificationsModule;
};

const notifications = getNotifications();

if (notifications) {
  notifications.setNotificationHandler({
    handleNotification: async (notification) => {
      const data = notification?.request?.content?.data as Record<string, unknown> | undefined;
      const isEmergency = data?.type === 'emergency-alarm';
      return {
        shouldShowAlert: true,
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: Boolean(isEmergency),
        shouldSetBadge: false,
      };
    },
  });
}

export interface ShiftNotificationContext {
  id: string;
  startTime: string;
  expectedDuration?: number;
  clientName?: string | null;
}

const ensureAndroidChannelAsync = async () => {
  if (Platform.OS !== 'android') {
    return;
  }

  const Notifications = getNotifications();
  if (!Notifications) {
    return;
  }

  await Notifications.setNotificationChannelAsync(SHIFT_NOTIFICATION_CHANNEL, {
    name: 'Active Shift Alerts',
    description: 'Reminds you when a shift is in progress.',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#FF231F7C',
    enableVibrate: true,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });

  await Notifications.setNotificationChannelAsync(EMERGENCY_NOTIFICATION_CHANNEL, {
    name: 'Emergency Alerts',
    description: 'Critical alerts that require immediate attention.',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 500, 500, 500, 500],
    lightColor: '#DC2626',
    enableVibrate: true,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });
};

const calculateTimeLeftLabel = (shift: ShiftNotificationContext) => {
  const expectedMinutes = Number.isFinite(shift.expectedDuration)
    ? shift.expectedDuration!
    : DEFAULT_EXPECTED_DURATION_MINUTES;
  const shiftStart = new Date(shift.startTime).getTime();
  const plannedEnd = shiftStart + expectedMinutes * 60000;
  const remainingMs = plannedEnd - Date.now();

  if (!Number.isFinite(shiftStart)) {
    return 'Shift schedule unavailable';
  }

  if (remainingMs <= 0) {
    return 'Shift scheduled end passed';
  }

  const totalMinutesLeft = Math.max(0, Math.floor(remainingMs / 60000));
  const hours = Math.floor(totalMinutesLeft / 60);
  const minutes = totalMinutesLeft % 60;

  return `${hours}h ${minutes}m`;
};

export const ensureShiftNotificationPermissions = async (): Promise<boolean> => {
  if (shouldSkipAndroidExpoGo) {
    return false;
  }

  const Notifications = getNotifications();
  if (!Notifications) {
    return false;
  }

  const existing = await Notifications.getPermissionsAsync();
  const iosGranted = existing.ios?.status === Notifications.IosAuthorizationStatus.AUTHORIZED;
  const iosProvisional = existing.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
  const granted = existing.granted || iosGranted || iosProvisional;

  if (granted) {
    await ensureAndroidChannelAsync();
    return true;
  }

  const requested = await Notifications.requestPermissionsAsync();
  const requestGranted =
    requested.granted ||
    requested.ios?.status === Notifications.IosAuthorizationStatus.AUTHORIZED ||
    requested.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;

  if (requestGranted) {
    await ensureAndroidChannelAsync();
  }

  return requestGranted;
};

export const showShiftOngoingNotification = async (
  shift: ShiftNotificationContext,
  previousNotificationId?: string | null,
): Promise<string | null> => {
  if (shouldSkipAndroidExpoGo) {
    return null;
  }

  const Notifications = getNotifications();
  if (!Notifications) {
    return null;
  }

  const hasPermission = await ensureShiftNotificationPermissions();
  if (!hasPermission) {
    return null;
  }

  if (previousNotificationId) {
    try {
      await Notifications.dismissNotificationAsync(previousNotificationId);
    } catch (error) {
      console.warn('Unable to dismiss previous shift notification', error);
    }
  }

  const timeLeftLabel = calculateTimeLeftLabel(shift);
  const content: NotificationContentInput = {
    title: 'You are on duty',
    body: timeLeftLabel.startsWith('Shift') ? timeLeftLabel : `Time left: ${timeLeftLabel}`,
    data: { type: 'shift-status', shiftId: shift.id },
  };

  if (Platform.OS === 'android') {
    content.sticky = true;
    content.priority = Notifications.AndroidNotificationPriority.MAX;
    content.color = '#007AFF';
  }

  const trigger = Platform.OS === 'android' ? { channelId: SHIFT_NOTIFICATION_CHANNEL } : null;

  const notificationId = await Notifications.scheduleNotificationAsync({
    content,
    trigger,
  });

  return notificationId;
};

export const dismissShiftNotification = async (notificationId?: string | null) => {
  if (!notificationId) {
    return;
  }

  const Notifications = getNotifications();
  if (!Notifications) {
    return;
  }

  try {
    await Notifications.dismissNotificationAsync(notificationId);
  } catch (error) {
    console.warn('Unable to dismiss shift notification', error);
  }
};

export const showEmergencyAlarmNotification = async (
  options?: {
    title?: string;
    body?: string;
    data?: Record<string, unknown>;
  },
): Promise<string | null> => {
  if (shouldSkipAndroidExpoGo) {
    return null;
  }

  const Notifications = getNotifications();
  if (!Notifications) {
    return null;
  }

  const hasPermission = await ensureShiftNotificationPermissions();
  if (!hasPermission) {
    return null;
  }

  const content: NotificationContentInput = {
    title: options?.title ?? 'Emergency Alert',
    body: options?.body ?? 'Immediate action required. Open URSafe App.',
    data: { type: 'emergency-alarm', ...(options?.data ?? {}) },
    sound: Platform.OS === 'ios' ? 'default' : undefined,
  };

  if (Platform.OS === 'android') {
    content.sticky = true;
    content.priority = Notifications.AndroidNotificationPriority.MAX;
    content.color = '#DC2626';
  }

  const trigger = Platform.OS === 'android' ? { channelId: EMERGENCY_NOTIFICATION_CHANNEL } : null;
  return Notifications.scheduleNotificationAsync({ content, trigger });
};

export const dismissEmergencyAlarmNotification = async (notificationId?: string | null) => {
  if (!notificationId) {
    return;
  }

  const Notifications = getNotifications();
  if (!Notifications) {
    return;
  }

  try {
    await Notifications.dismissNotificationAsync(notificationId);
  } catch (error) {
    console.warn('Unable to dismiss emergency notification', error);
  }
};
