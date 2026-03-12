'use client';

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { User } from '@/types';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ user: User; mustChangePassword: boolean }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const INACTIVITY_TIMEOUT_MS = 10 * 60 * 1000;
const WARNING_DURATION_SECONDS = 60;
const WARNING_TIMEOUT_MS = INACTIVITY_TIMEOUT_MS - WARNING_DURATION_SECONDS * 1000;

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [showIdleWarning, setShowIdleWarning] = useState(false);
  const [countdownSeconds, setCountdownSeconds] = useState(WARNING_DURATION_SECONDS);
  const warningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const logoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const signIn = async (email: string, password: string) => {
    const response = await fetch('/api/auth/login', {
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
      localStorage.setItem('currentUser', JSON.stringify(authenticatedUser));
    }
    return { user: authenticatedUser, mustChangePassword };
  };

  const clearIdleTimers = useCallback(() => {
    if (warningTimerRef.current) {
      clearTimeout(warningTimerRef.current);
      warningTimerRef.current = null;
    }
    if (logoutTimerRef.current) {
      clearTimeout(logoutTimerRef.current);
      logoutTimerRef.current = null;
    }
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
  }, []);

  const signOut = useCallback(async () => {
    clearIdleTimers();
    setShowIdleWarning(false);
    setCountdownSeconds(WARNING_DURATION_SECONDS);
    const currentUser = user;
    if (currentUser) {
      try {
        await fetch(`/api/active-users/user/${currentUser.id}`, {
          method: 'DELETE',
        });
      } catch (error) {
        console.warn('Failed to clear active session on sign out', error);
      }
    }

    setUser(null);
    localStorage.removeItem('currentUser');
  }, [clearIdleTimers, user]);

  const startWarningCountdown = useCallback(() => {
    setShowIdleWarning(true);
    setCountdownSeconds(WARNING_DURATION_SECONDS);
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
    }
    countdownIntervalRef.current = setInterval(() => {
      setCountdownSeconds((current) => {
        if (current <= 1) {
          if (countdownIntervalRef.current) {
            clearInterval(countdownIntervalRef.current);
            countdownIntervalRef.current = null;
          }
          return 0;
        }
        return current - 1;
      });
    }, 1000);
  }, []);

  const resetIdleTimers = useCallback(() => {
    clearIdleTimers();
    setShowIdleWarning(false);
    setCountdownSeconds(WARNING_DURATION_SECONDS);
    warningTimerRef.current = setTimeout(() => {
      startWarningCountdown();
    }, WARNING_TIMEOUT_MS);
    logoutTimerRef.current = setTimeout(() => {
      void signOut();
    }, INACTIVITY_TIMEOUT_MS);
  }, [clearIdleTimers, signOut, startWarningCountdown]);

  useEffect(() => {
    // Check if user is logged in from localStorage
    const storedUser = localStorage.getItem('currentUser');
    if (storedUser) {
      setUser(JSON.parse(storedUser));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.visibilityState !== 'visible' || !user) {
        return;
      }
      try {
        const response = await fetch('/api/auth/me');
        if (response.ok) {
          const data = await response.json();
          if (!data?.user) {
            setUser(null);
            localStorage.removeItem('currentUser');
          }
        }
      } catch (error) {
        console.error('Failed to sync auth state', error);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [user]);

  useEffect(() => {
    if (!user) {
      clearIdleTimers();
      setShowIdleWarning(false);
      setCountdownSeconds(WARNING_DURATION_SECONDS);
      return;
    }

    const activityEvents: Array<keyof WindowEventMap> = [
      'mousedown',
      'keydown',
      'touchstart',
      'scroll',
    ];

    resetIdleTimers();
    activityEvents.forEach((event) => {
      window.addEventListener(event, resetIdleTimers, { passive: true });
    });

    return () => {
      activityEvents.forEach((event) => {
        window.removeEventListener(event, resetIdleTimers);
      });
      clearIdleTimers();
    };
  }, [clearIdleTimers, resetIdleTimers, user]);

  const formatCountdown = (remainingSeconds: number) => {
    const minutes = Math.floor(remainingSeconds / 60);
    const seconds = remainingSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
  };

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signOut }}>
      {children}
      {showIdleWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-lg">
            <h2 className="text-xl font-semibold text-gray-900">
              You&apos;re about to be logged out
            </h2>
            <p className="mt-2 text-gray-700">
              Your session will end in{' '}
              <span className="font-semibold">{formatCountdown(countdownSeconds)}</span> due to inactivity.
            </p>
            <p className="mt-4 text-sm text-gray-600">
              Click anywhere on the screen to stay logged in.
            </p>
          </div>
        </div>
      )}
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
