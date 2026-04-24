import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import * as Location from "expo-location";
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { apiRequest, apiRequestWithFallback } from "../lib/api";
import { startActiveSessionBackground, stopActiveSessionBackground } from "../lib/activeSessionBackgroundTask";
import type { SessionUser, UrsafeShift } from "../types";

type AuthContextType = {
  user: SessionUser | null;
  token: string | null;
  loading: boolean;
  activeShiftId: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const STORAGE_USER = "ursafe.mobile.user";
const STORAGE_TOKEN = "ursafe.mobile.token";
const STORAGE_SESSION_ID = "ursafe.mobile.sessionId";
const STORAGE_SHIFT_ID = "ursafe.mobile.shiftId";

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function sessionStatusFromAppState(appState: AppStateStatus, connected: boolean): "online" | "idle" | "lost" {
  if (!connected) return "lost";
  return appState === "active" ? "online" : "idle";
}

export function AuthProvider(props: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeShiftId, setActiveShiftId] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const isConnectedRef = useRef(true);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const updatePresence = useCallback(async () => {
    if (!user || !token || !sessionId) return;

    let locationPayload: Record<string, unknown> | undefined;
    try {
      const permission = await Location.getForegroundPermissionsAsync();
      if (permission.status === "granted") {
        const location = await Location.getLastKnownPositionAsync();
        if (location) {
          locationPayload = {
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
            accuracy: location.coords.accuracy ?? undefined,
            timestamp: new Date(location.timestamp).toISOString()
          };
        }
      }
    } catch {
      // Non-blocking: presence still updates without coordinates.
    }

    const status = sessionStatusFromAppState(appStateRef.current, isConnectedRef.current);

    await apiRequestWithFallback(
      "/ursafe/sessions",
      "/ursafe/active-sessions",
      {
        method: "POST",
        body: JSON.stringify({
          sessionId,
          userId: user.id,
          status,
          lastSeenAt: new Date().toISOString(),
          location: locationPayload
        })
      },
      token
    );

    if (activeShiftId) {
      await apiRequestWithFallback(
        "/ursafe/checkins",
        "/ursafe/check-ins",
        {
          method: "POST",
          body: JSON.stringify({
            shiftId: Number(activeShiftId),
            userId: user.id,
            timestamp: new Date().toISOString(),
            status: status === "lost" ? "concern" : "safe",
            location: locationPayload,
            notes: "Mobile heartbeat check-in"
          })
        },
        token
      ).catch(() => undefined);
    }
  }, [activeShiftId, sessionId, token, user]);

  const startSessionAndShift = useCallback(async (sessionUser: SessionUser, sessionToken: string) => {
    const created = await apiRequestWithFallback<{ item?: { id?: string }; id?: string }>(
      "/ursafe/sessions",
      "/ursafe/active-sessions",
      {
        method: "POST",
        body: JSON.stringify({
          userId: sessionUser.id,
          status: "online",
          startedAt: new Date().toISOString(),
          lastSeenAt: new Date().toISOString()
        })
      },
      sessionToken
    );

    const createdSessionId = String(created?.item?.id || created?.id || `${Date.now()}`);
    setSessionId(createdSessionId);
    await AsyncStorage.setItem(STORAGE_SESSION_ID, createdSessionId);

    const shift = await apiRequest<{ item: UrsafeShift }>(
      "/ursafe/shifts",
      {
        method: "POST",
        body: JSON.stringify({ userId: sessionUser.id, startTime: new Date().toISOString(), status: "active" })
      },
      sessionToken
    );
    const shiftId = String(shift.item.id);
    setActiveShiftId(shiftId);
    await AsyncStorage.setItem(STORAGE_SHIFT_ID, shiftId);

    await startActiveSessionBackground({ token: sessionToken, userId: sessionUser.id, sessionId: createdSessionId });
  }, []);

  const clearHeartbeat = () => {
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
  };

  useEffect(() => {
    const boot = async () => {
      try {
        const [storedUser, storedToken, storedShiftId, storedSessionId] = await Promise.all([
          AsyncStorage.getItem(STORAGE_USER),
          AsyncStorage.getItem(STORAGE_TOKEN),
          AsyncStorage.getItem(STORAGE_SHIFT_ID),
          AsyncStorage.getItem(STORAGE_SESSION_ID)
        ]);

        if (!storedUser || !storedToken) return;

        const me = await apiRequest<{ user: SessionUser }>("/auth/me", undefined, storedToken);
        setUser(me.user);
        setToken(storedToken);
        setActiveShiftId(storedShiftId || null);
        setSessionId(storedSessionId || null);
      } catch {
        await AsyncStorage.multiRemove([STORAGE_USER, STORAGE_TOKEN, STORAGE_SESSION_ID, STORAGE_SHIFT_ID]);
      } finally {
        setLoading(false);
      }
    };

    void boot();
  }, []);

  useEffect(() => {
    if (!user || !token) {
      clearHeartbeat();
      return;
    }

    const netUnsub = NetInfo.addEventListener((state) => {
      isConnectedRef.current = Boolean(state.isConnected && state.isInternetReachable !== false);
      void updatePresence();
    });

    const appStateSub = AppState.addEventListener("change", (next) => {
      appStateRef.current = next;
      void updatePresence();
    });

    clearHeartbeat();
    heartbeatRef.current = setInterval(() => {
      void updatePresence();
    }, 15000);

    void updatePresence();

    return () => {
      netUnsub();
      appStateSub.remove();
      clearHeartbeat();
    };
  }, [token, updatePresence, user]);

  const signIn = async (email: string, password: string) => {
    const login = await apiRequest<{ token: string; user: SessionUser }>("/auth/mobile-login", {
      method: "POST",
      body: JSON.stringify({ email, password })
    });

    setUser(login.user);
    setToken(login.token);
    await AsyncStorage.setItem(STORAGE_USER, JSON.stringify(login.user));
    await AsyncStorage.setItem(STORAGE_TOKEN, login.token);

    await startSessionAndShift(login.user, login.token);
  };

  const signOut = async () => {
    try {
      if (token && sessionId && user) {
        await apiRequestWithFallback(
          `/ursafe/sessions/${sessionId}`,
          `/ursafe/active-sessions/user/${user.id}`,
          { method: "DELETE" },
          token
        ).catch(() => undefined);
      }

      if (token && activeShiftId) {
        await apiRequest(
          `/ursafe/shifts/${activeShiftId}`,
          { method: "PUT", body: JSON.stringify({ status: "completed", endTime: new Date().toISOString() }) },
          token
        ).catch(() => undefined);
      }

      if (token) {
        await apiRequest("/auth/logout", { method: "POST" }, token).catch(() => undefined);
      }
    } finally {
      await stopActiveSessionBackground().catch(() => undefined);
      await AsyncStorage.multiRemove([STORAGE_USER, STORAGE_TOKEN, STORAGE_SESSION_ID, STORAGE_SHIFT_ID]);
      setUser(null);
      setToken(null);
      setSessionId(null);
      setActiveShiftId(null);
      clearHeartbeat();
    }
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, activeShiftId, signIn, signOut }}>
      {props.children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
