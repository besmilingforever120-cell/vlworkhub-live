import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { AppState, AppStateStatus, Platform } from 'react-native';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { API_URL } from '../lib/api';
import {
  ensureActiveSessionTrackingTask,
  startActiveSessionTracking,
  stopActiveSessionTracking,
} from '../lib/activeSessionBackgroundTask';
import { ActiveUserSession, User } from '../types';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ user: User; mustChangePassword: boolean }>;
  signUp: (email: string, password: string, firstName: string, lastName: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const ACTIVE_SESSION_STORAGE_KEY = 'activeSessionId';
const HEARTBEAT_INTERVAL_MS = 15000;
type NavigatorLike = {
  platform?: string;
  userAgent?: string;
  userAgentData?: { platform?: string };
};
type ConnectionStatus = 'online' | 'offline' | 'unknown';

const getDeviceDescriptor = () => {
  if (Platform.OS === 'web') {
    const nav = (globalThis as { navigator?: NavigatorLike }).navigator;
    if (nav) {
      const fingerprint = `${nav.userAgentData?.platform ?? ''} ${nav.platform ?? ''} ${nav.userAgent ?? ''}`.toLowerCase();

      if (fingerprint.includes('windows')) {
        return { label: 'Windows', platform: 'windows' };
      }
      if (fingerprint.includes('mac')) {
        return { label: 'macOS', platform: 'macos' };
      }
      if (fingerprint.includes('android')) {
        return { label: 'Android (web)', platform: 'android-web' };
      }
      if (fingerprint.includes('iphone') || fingerprint.includes('ipad') || fingerprint.includes('ios')) {
        return { label: 'iOS (web)', platform: 'ios-web' };
      }
      if (fingerprint.includes('linux')) {
        return { label: 'Linux', platform: 'linux' };
      }
    }
    return { label: 'Web Browser', platform: 'web' };
  }

  const rawVersion = Platform.Version;
  const versionLabel =
    typeof rawVersion === 'string'
      ? rawVersion
      : typeof rawVersion === 'number'
        ? rawVersion.toString()
        : '';

  const platformStatics = Platform as typeof Platform & { isPad?: boolean };
  let friendlyName: string;
  let platformKey: string;

  switch (Platform.OS) {
    case 'ios': {
      friendlyName = platformStatics.isPad ? 'iPad' : 'iOS';
      platformKey = 'ios';
      break;
    }
    case 'android': {
      friendlyName = 'Android';
      platformKey = 'android';
      break;
    }
    case 'windows': {
      friendlyName = 'Windows';
      platformKey = 'windows';
      break;
    }
    case 'macos': {
      friendlyName = 'macOS';
      platformKey = 'macos';
      break;
    }
    default: {
      friendlyName = Platform.OS.toUpperCase();
      platformKey = Platform.OS;
    }
  }

  const label = versionLabel ? `${friendlyName} ${versionLabel}` : friendlyName;
  return { label, platform: platformKey };
};

async function ensureLocationPermission(shouldRequest: boolean) {
  try {
    const current = await Location.getForegroundPermissionsAsync();
    if (current.status === 'granted') {
      return true;
    }

    if (!shouldRequest) {
      return false;
    }

    const requested = await Location.requestForegroundPermissionsAsync();
    return requested.status === 'granted';
  } catch (error) {
    console.warn('Unable to check location permission for active session:', error);
    return false;
  }
}

async function getHeartbeatLocation(shouldRequestPermission: boolean) {
  const hasPermission = await ensureLocationPermission(shouldRequestPermission);
  if (!hasPermission) {
    return undefined;
  }

  try {
    const lastKnown = await Location.getLastKnownPositionAsync();
    const position =
      lastKnown ||
      (await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      }));

    if (!position) {
      return undefined;
    }

    return {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy ?? undefined,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.warn('Unable to obtain location for active user heartbeat:', error);
    return undefined;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const heartbeatIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeSessionIdRef = useRef<string | null>(null);
  const isSyncingSessionRef = useRef(false);
  const sessionTeardownRef = useRef(false);
  const activeRequestControllersRef = useRef<Set<AbortController>>(new Set());
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const connectionStatusRef = useRef<ConnectionStatus>('unknown');

  useEffect(() => {
    // Check if user is logged in from AsyncStorage
    loadUser();
    ensureActiveSessionTrackingTask();
  }, []);

  useEffect(() => {
    const updateConnectionStatus = (state: { isConnected?: boolean; isInternetReachable?: boolean | null }) => {
      const isOnline = state.isConnected && state.isInternetReachable !== false;
      connectionStatusRef.current = isOnline ? 'online' : state.isConnected === false ? 'offline' : 'unknown';
    };

    const unsubscribe = NetInfo.addEventListener(updateConnectionStatus);
    NetInfo.fetch()
      .then(updateConnectionStatus)
      .catch((error) => console.warn('Unable to read network status', error));

    return () => {
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    activeSessionIdRef.current = activeSessionId;
  }, [activeSessionId]);

  const loadUser = async () => {
    try {
      const [storedUser, storedSessionId] = await Promise.all([
        AsyncStorage.getItem('currentUser'),
        AsyncStorage.getItem(ACTIVE_SESSION_STORAGE_KEY),
      ]);
      if (storedUser) {
        const parsed = JSON.parse(storedUser);
        const normalizedRole =
          typeof parsed?.role === 'string' ? parsed.role.toLowerCase() : parsed?.role;
        setUser({ ...parsed, role: normalizedRole });
      }
      if (storedSessionId) {
        setActiveSessionId(storedSessionId);
      }
    } catch (error) {
      console.error('Error loading user:', error);
    } finally {
      setLoading(false);
    }
  };

  const persistSessionId = useCallback(async (sessionId: string | null) => {
    setActiveSessionId(sessionId);
    if (sessionId) {
      await AsyncStorage.setItem(ACTIVE_SESSION_STORAGE_KEY, sessionId);
    } else {
      await AsyncStorage.removeItem(ACTIVE_SESSION_STORAGE_KEY);
    }
  }, []);

  const stopHeartbeat = useCallback(() => {
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }
  }, []);

  const abortInFlightRequests = useCallback(() => {
    activeRequestControllersRef.current.forEach((controller) => controller.abort());
    activeRequestControllersRef.current.clear();
  }, []);

  const recordActiveSession = useCallback(
    async ({
      sessionId,
      requestPermission,
      status,
      lastKnownActivity,
    }: {
      sessionId?: string;
      requestPermission?: boolean;
      status?: ActiveUserSession['status'];
      lastKnownActivity?: string;
    } = {}) => {
      if (!user || sessionTeardownRef.current) {
        return null;
      }

      const locationPayload = await getHeartbeatLocation(Boolean(requestPermission));
      const { label: deviceLabel, platform: platformLabel } = getDeviceDescriptor();
      const connectionStatus = connectionStatusRef.current;
      const notes = JSON.stringify({ connectionStatus });

      const payload: Record<string, unknown> = {
        userId: user.id,
        sessionId,
        status: status ?? 'online',
        deviceName: deviceLabel,
        platform: platformLabel,
        lastSeenAt: new Date().toISOString(),
        lastKnownActivity: lastKnownActivity ?? null,
        notes,
      };

      if (!sessionId) {
        payload.startedAt = new Date().toISOString();
      }

      if (locationPayload) {
        payload.location = locationPayload;
      }

      const controller = new AbortController();
      activeRequestControllersRef.current.add(controller);

      try {
        const response = await fetch(`${API_URL}/api/active-users`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });

        if (response.status === 204) {
          return null;
        }

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(errorText || 'Failed to record active session');
        }

        if (sessionTeardownRef.current) {
          return null;
        }

        return (await response.json()) as ActiveUserSession;
      } catch (error) {
        if ((error as Error)?.name === 'AbortError') {
          return null;
        }
        throw error;
      } finally {
        activeRequestControllersRef.current.delete(controller);
      }
    },
    [user],
  );

  const syncActiveSession = useCallback(async () => {
    if (!user || isSyncingSessionRef.current || sessionTeardownRef.current) {
      return;
    }

    isSyncingSessionRef.current = true;
    try {
      const storedId =
        activeSessionIdRef.current ||
        (await AsyncStorage.getItem(ACTIVE_SESSION_STORAGE_KEY));

      let session: ActiveUserSession | null = null;

      if (storedId) {
        session = await recordActiveSession({
          sessionId: storedId,
          requestPermission: true,
        });

        if (!session) {
          await persistSessionId(null);
        }
      }

      if (!session) {
        session = await recordActiveSession({
          requestPermission: true,
        });
      }

      if (session?.id) {
        await persistSessionId(session.id);
        startHeartbeat(session.id);
        const deviceDescriptor = getDeviceDescriptor();
        const trackingEnabled = await startActiveSessionTracking({
          userId: user.id,
          sessionId: session.id,
          deviceName: deviceDescriptor.label,
          platform: deviceDescriptor.platform,
        });
        if (!trackingEnabled) {
          console.warn('Background location permission not granted. Presence will update only while the app is active.');
        }
      }
    } catch (error) {
      console.error('Error syncing active user session:', error);
    } finally {
      isSyncingSessionRef.current = false;
    }
  }, [persistSessionId, recordActiveSession, startHeartbeat, user]);

  const sendHeartbeat = useCallback(
    async (sessionId: string) => {
      if (!sessionId || sessionTeardownRef.current) {
        return;
      }

      try {
        await recordActiveSession({ sessionId, requestPermission: false });
      } catch (error) {
        console.warn('Active session heartbeat failed:', error);
      }
    },
    [recordActiveSession],
  );

  const startHeartbeat = useCallback(
    (sessionId: string) => {
      if (!sessionId) {
        return;
      }
      stopHeartbeat();
      heartbeatIntervalRef.current = setInterval(() => {
        sendHeartbeat(sessionId);
      }, HEARTBEAT_INTERVAL_MS);
    },
    [sendHeartbeat, stopHeartbeat],
  );

  const endActiveSession = useCallback(async () => {
    sessionTeardownRef.current = true;
    stopHeartbeat();
    abortInFlightRequests();
    try {
      const sessionId =
        activeSessionIdRef.current ||
        (await AsyncStorage.getItem(ACTIVE_SESSION_STORAGE_KEY));
      if (sessionId) {
        await fetch(`${API_URL}/api/active-users/${sessionId}`, {
          method: 'DELETE',
        });
      }
    } catch (error) {
      console.warn('Failed to end active session:', error);
    } finally {
      await stopActiveSessionTracking();
      await persistSessionId(null);
      activeSessionIdRef.current = null;
    }
  }, [abortInFlightRequests, persistSessionId, stopHeartbeat]);

  useEffect(() => {
    if (!user) {
      sessionTeardownRef.current = true;
      abortInFlightRequests();
      stopHeartbeat();
      stopActiveSessionTracking().catch((error) =>
        console.warn('Failed to stop background tracking', error),
      );
      return;
    }

    sessionTeardownRef.current = false;
    syncActiveSession();

    return () => {
      stopHeartbeat();
    };
  }, [abortInFlightRequests, stopHeartbeat, syncActiveSession, user]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', async (nextState) => {
      const sessionId = activeSessionIdRef.current;
      if (!user || !sessionId || sessionTeardownRef.current) {
        appStateRef.current = nextState;
        return;
      }

      const isActive = nextState === 'active';
      if (appStateRef.current === nextState) {
        return;
      }

      appStateRef.current = nextState;

      try {
        await recordActiveSession({
          sessionId,
          requestPermission: isActive,
          status: 'online',
          lastKnownActivity: isActive ? 'foreground' : 'background',
        });
      } catch (error) {
        console.warn('Failed to update active session state:', error);
      }
    });

    return () => {
      subscription.remove();
    };
  }, [recordActiveSession, user]);

  const signIn = async (email: string, password: string) => {
    const response = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Login failed');
    }

    const payload = await response.json();
    const authenticatedUser = payload.user as User;
    const mustChangePassword = Boolean(authenticatedUser?.mustChangePassword || payload.mustChangePassword);
    if (!mustChangePassword) {
      setUser(authenticatedUser);
      await AsyncStorage.setItem('currentUser', JSON.stringify(authenticatedUser));
    }
    return { user: authenticatedUser, mustChangePassword };
  };

  const signUp = async (email: string, password: string, firstName: string, lastName: string) => {
    // For now, signup is not implemented with JSON file storage
    // You would need to create an API endpoint for this
    throw new Error('Signup not yet implemented with local storage');
  };

  const signOut = async () => {
    await endActiveSession();
    await AsyncStorage.removeItem('currentUser');
    setUser(null);
    setActiveSessionId(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
