import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import * as Location from 'expo-location';
import { API_URL } from '../lib/api';
import {
  appendTripRoutePoint,
  clearTripRoute,
  ensureTripTrackingTask,
  readTripRoute,
  startTripTracking,
  stopTripTracking,
  writeTripRoute,
} from '../lib/tripBackgroundTask';
import { Trip, TripStatus, TripCategory, Location as LocationType } from '../types';
import { useAuth } from './AuthContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';

interface TripContextType {
  currentTrip: Trip | null;
  isTracking: boolean;
  startTrip: (category: TripCategory, vehicleInfo?: string, purpose?: string) => Promise<void>;
  stopTrip: (notes?: string) => Promise<{ savedOffline: boolean }>;
  trips: Trip[];
  loading: boolean;
  refreshTrips: () => Promise<void>;
  pendingTripsCount: number;
  isSyncingPending: boolean;
  syncPendingTrips: () => Promise<void>;
}

const TripContext = createContext<TripContextType | undefined>(undefined);

const formatGeocodedAddress = (geo: Location.LocationGeocodedAddress): string => {
  const primaryLine = geo.name || [geo.streetNumber, geo.street].filter(Boolean).join(' ');
  const cityLine = geo.city || geo.subregion;
  const regionLine = geo.region || geo.postalCode;
  const country = geo.country;
  return [primaryLine, cityLine, regionLine, country].filter(Boolean).join(', ');
};

const getAddressForCoordinates = async (latitude: number, longitude: number) => {
  try {
    const results = await Location.reverseGeocodeAsync({ latitude, longitude });
    if (results && results.length > 0) {
      return formatGeocodedAddress(results[0]);
    }
  } catch (error) {
    console.warn('Unable to reverse geocode trip location', error);
  }
  return undefined;
};

const getBestAvailablePosition = async () => {
  try {
    return await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.BestForNavigation,
    });
  } catch (error) {
    const lastKnown = await Location.getLastKnownPositionAsync();
    if (lastKnown) {
      return lastKnown;
    }
    throw error;
  }
};

const getResponseErrorMessage = async (response: Response) => {
  const contentType = response.headers?.get?.('content-type') ?? '';
  if (contentType.includes('application/json')) {
    const payload = await response.json().catch(() => null);
    if (payload?.error) {
      return payload.error as string;
    }
    if (payload?.message) {
      return payload.message as string;
    }
  }
  const text = await response.text().catch(() => '');
  return text || `Failed to save trip (${response.status})`;
};

const isLikelyNetworkError = (error: unknown) => {
  if (!error) return false;
  const message = (error as Error)?.message ?? '';
  return (
    /network request failed/i.test(message) ||
    /failed to fetch/i.test(message) ||
    /networkerror/i.test(message) ||
    /timed out/i.test(message) ||
    (error as Error)?.name === 'AbortError'
  );
};

export function TripProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [currentTrip, setCurrentTrip] = useState<Trip | null>(null);
  const [isTracking, setIsTracking] = useState(false);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(false);
  const [pendingTripsCount, setPendingTripsCount] = useState(0);
  const [isSyncingPending, setIsSyncingPending] = useState(false);
  const syncInFlightRef = useRef(false);
  const locationSubscription = useRef<Location.LocationSubscription | null>(null);
  const routePoints = useRef<LocationType[]>([]);

  useEffect(() => {
    if (user) {
      loadCurrentTrip();
      refreshTrips();
      updatePendingTripsCount();
    }
  }, [user]);

  useEffect(() => {
    ensureTripTrackingTask();
  }, []);

  // Load any in-progress trip (for UI continuity)
  const loadCurrentTrip = async () => {
    try {
      const savedTrip = await AsyncStorage.getItem('currentTrip');
      if (savedTrip) {
        const trip = JSON.parse(savedTrip);
        setCurrentTrip(trip);
        setIsTracking(true);
        const storedRoute = await readTripRoute();
        const routeSeed = storedRoute.length ? storedRoute : Array.isArray(trip.route) ? trip.route : [];
        if (!storedRoute.length && routeSeed.length) {
          await writeTripRoute(routeSeed);
        }
        routePoints.current = routeSeed;
        const resolvedUserId = trip.userId || user?.id;
        if (trip.id && resolvedUserId) {
          const trackingStarted = await startTripTracking({
            tripId: trip.id,
            userId: resolvedUserId,
          });
          if (!trackingStarted) {
            startLocationTracking();
          }
        } else {
          startLocationTracking();
        }
      } else {
        setCurrentTrip(null);
        setIsTracking(false);
      }
    } catch (error) {
      console.error('Error loading current trip:', error);
    }
  };

  const readPendingTrips = async () => {
    const pending = await AsyncStorage.getItem('pendingTrips');
    if (!pending) return [] as Trip[];
    try {
      const parsed = JSON.parse(pending) as Trip[];
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      console.warn('Unable to read pending trips', error);
      return [];
    }
  };

  const updatePendingTripsCount = async () => {
    const pendingTrips = await readPendingTrips();
    setPendingTripsCount(pendingTrips.length);
  };

  // Sync all pending trips when online
  const syncPendingTrips = async () => {
    if (syncInFlightRef.current) return;
    syncInFlightRef.current = true;
    setIsSyncingPending(true);
    try {
      const networkState = await NetInfo.fetch();
      const isOnline = networkState.isConnected && networkState.isInternetReachable !== false;
      if (!isOnline) {
        return;
      }
      const pendingTrips = await readPendingTrips();
      if (!pendingTrips.length) {
        setPendingTripsCount(0);
        return;
      }
      const syncedTrips: Trip[] = [];
      for (const trip of pendingTrips) {
        let timeoutId: ReturnType<typeof setTimeout> | null = null;
        try {
          const controller = new AbortController();
          timeoutId = setTimeout(() => controller.abort(), 8000);
          const response = await fetch(`${API_URL}/api/trips`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(trip),
            signal: controller.signal,
          });
          if (response.ok || response.status === 409) {
            syncedTrips.push(trip);
          } else {
            const errorMessage = await getResponseErrorMessage(response);
            console.warn('Trip sync rejected:', errorMessage);
          }
        } catch (e) {
          if (isLikelyNetworkError(e)) {
            // Network error, stop trying
            break;
          }
          console.warn('Trip sync failed:', e);
        } finally {
          if (timeoutId) {
            clearTimeout(timeoutId);
          }
        }
      }
      // Remove successfully synced trips
      if (syncedTrips.length) {
        const remaining = pendingTrips.filter(t => !syncedTrips.some(s => s.id === t.id));
        await AsyncStorage.setItem('pendingTrips', JSON.stringify(remaining));
        if (!remaining.length) await AsyncStorage.removeItem('pendingTrips');
        setPendingTripsCount(remaining.length);
        await refreshTrips();
      } else {
        setPendingTripsCount(pendingTrips.length);
      }
    } catch (e) {
      // Ignore errors
    } finally {
      syncInFlightRef.current = false;
      setIsSyncingPending(false);
    }
  };

  // Listen for network changes to trigger sync
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      if (state.isConnected) {
        syncPendingTrips();
      }
    });
    // Also try syncing on mount
    syncPendingTrips();
    return () => unsubscribe();
  }, []);

  const refreshTrips = async () => {
    if (!user) return;
    
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/trips?userId=${user.id}`);
      if (!response.ok) throw new Error('Failed to fetch trips');
      
      const data = await response.json();
      const sortedTrips = (data as Trip[]).sort((a, b) => {
        const aTime = a.startTime ? new Date(a.startTime).getTime() : 0;
        const bTime = b.startTime ? new Date(b.startTime).getTime() : 0;
        return bTime - aTime;
      });
      setTrips(sortedTrips);
    } catch (error) {
      console.error('Error fetching trips:', error);
    } finally {
      setLoading(false);
    }
  };

  const startLocationTracking = async () => {
    if (locationSubscription.current) {
      return;
    }
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      throw new Error('Location permission not granted');
    }

    locationSubscription.current = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.BestForNavigation,
        timeInterval: 5000, // Update every 5 seconds
        distanceInterval: 10, // Or every 10 meters
      },
      (location) => {
        const newPoint: LocationType = {
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          timestamp: new Date().toISOString(),
          accuracy: location.coords.accuracy || undefined,
        };
        routePoints.current.push(newPoint);
        appendTripRoutePoint(newPoint).catch((error) =>
          console.warn('Unable to persist trip route point', error),
        );
      }
    );
  };

  const startTrip = async (category: TripCategory, vehicleInfo?: string, purpose?: string) => {
    if (!user) throw new Error('User not authenticated');

    // Request location permissions first
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      throw new Error('Location permission is required to track trips. Please enable location access in your device settings.');
    }

    // Prevent starting a new trip if one is in progress
    if (currentTrip) throw new Error('A trip is already in progress. Please end it before starting a new one.');

    let location;
    try {
      location = await getBestAvailablePosition();
    } catch (error) {
      throw new Error('Unable to read your location. Please check GPS and try again.');
    }

    const startAddress = await getAddressForCoordinates(location.coords.latitude, location.coords.longitude);

    const startLocation: LocationType = {
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
      address: startAddress,
      timestamp: new Date().toISOString(),
      accuracy: location.coords.accuracy || undefined,
    };

    const tripId = `trip-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const newTrip: Partial<Trip> = {
      id: tripId,
      userId: user.id,
      status: TripStatus.IN_PROGRESS,
      category,
      startLocation,
      startTime: new Date().toISOString(),
      distanceInMiles: 0,
      route: [startLocation],
      vehicleInfo,
      purpose,
    };

    // Save to local storage for offline support
    await AsyncStorage.setItem('currentTrip', JSON.stringify(newTrip));
    await writeTripRoute([startLocation]);
    setCurrentTrip(newTrip as Trip);
    setIsTracking(true);
    routePoints.current = [startLocation];
    const trackingStarted = await startTripTracking({
      tripId,
      userId: user.id,
    });
    if (!trackingStarted) {
      await startLocationTracking();
    }
  };

  const calculateDistance = (route: LocationType[]): number => {
    if (route.length < 2) return 0;

    let totalDistance = 0;
    for (let i = 0; i < route.length - 1; i++) {
      const lat1 = route[i].latitude;
      const lon1 = route[i].longitude;
      const lat2 = route[i + 1].latitude;
      const lon2 = route[i + 1].longitude;

      // Haversine formula
      const R = 3959; // Earth's radius in miles
      const dLat = (lat2 - lat1) * Math.PI / 180;
      const dLon = (lon2 - lon1) * Math.PI / 180;
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      totalDistance += R * c;
    }

    return Math.round(totalDistance * 100) / 100; // Round to 2 decimal places
  };

  const stopTrip = async (notes?: string) => {
    if (!currentTrip) throw new Error('No active trip');

    // Stop location tracking
    if (locationSubscription.current) {
      locationSubscription.current.remove();
      locationSubscription.current = null;
    }

    let location;
    try {
      location = await getBestAvailablePosition();
    } catch (error) {
      throw new Error('Unable to read your location. Please check GPS and try again.');
    }

    const endAddress = await getAddressForCoordinates(location.coords.latitude, location.coords.longitude);

    const endLocation: LocationType = {
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
      address: endAddress,
      timestamp: new Date().toISOString(),
      accuracy: location.coords.accuracy || undefined,
    };

    const storedRoute = await readTripRoute();
    const baseRoute = storedRoute.length
      ? storedRoute
      : routePoints.current.length
        ? routePoints.current
        : Array.isArray(currentTrip.route)
          ? currentTrip.route
          : [currentTrip.startLocation];
    const finalRoute = [...baseRoute, endLocation];
    const distance = calculateDistance(finalRoute);

    const completedTrip = {
      ...currentTrip,
      endLocation,
      endTime: new Date().toISOString(),
      distanceInMiles: distance,
      route: finalRoute,
      coordinates: finalRoute,
      status: TripStatus.PENDING_APPROVAL,
      notes,
    };

    let uploaded = false;
    let savedOffline = false;

    try {
      const networkState = await NetInfo.fetch();
      const isOnline = networkState.isConnected && networkState.isInternetReachable !== false;

      if (!isOnline) {
        savedOffline = true;
      } else {
        let timeoutId: ReturnType<typeof setTimeout> | null = null;
        try {
          const controller = new AbortController();
          timeoutId = setTimeout(() => controller.abort(), 8000);
          const response = await fetch(`${API_URL}/api/trips`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(completedTrip),
            signal: controller.signal,
          });
          if (response.ok || response.status === 409) {
            uploaded = true;
          } else {
            const message = await getResponseErrorMessage(response);
            throw new Error(message);
          }
        } catch (error) {
          if (isLikelyNetworkError(error)) {
            savedOffline = true;
          } else {
            throw error;
          }
        } finally {
          if (timeoutId) {
            clearTimeout(timeoutId);
          }
        }
      }

    if (!uploaded && savedOffline) {
      // Save to pendingTrips array
      const pendingTrips = await readPendingTrips();
      if (!pendingTrips.some((trip) => trip.id === completedTrip.id)) {
        pendingTrips.push(completedTrip);
        await AsyncStorage.setItem('pendingTrips', JSON.stringify(pendingTrips));
        setPendingTripsCount(pendingTrips.length);
      }
    }

      // Clear local storage for currentTrip
      await AsyncStorage.removeItem('currentTrip');
      setCurrentTrip(null);
      setIsTracking(false);
      routePoints.current = [];
      await stopTripTracking();
      await clearTripRoute();
      await refreshTrips();
      await updatePendingTripsCount();
      return { savedOffline };
    } catch (error) {
      console.error('Error saving trip:', error);
      throw error;
    }
  };

  return (
    <TripContext.Provider value={{
      currentTrip,
      isTracking,
      startTrip,
      stopTrip,
      trips,
      loading,
      refreshTrips,
      pendingTripsCount,
      isSyncingPending,
      syncPendingTrips,
    }}>
      {children}
    </TripContext.Provider>
  );
}

export const useTrip = () => {
  const context = useContext(TripContext);
  if (context === undefined) {
    throw new Error('useTrip must be used within a TripProvider');
  }
  return context;
};
