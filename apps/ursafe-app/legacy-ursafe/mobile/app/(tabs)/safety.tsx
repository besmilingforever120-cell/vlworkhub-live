import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, Alert, ActivityIndicator } from 'react-native';
import * as Location from 'expo-location';
import { useAuth } from '../../contexts/AuthContext';
import { API_URL } from '../../lib/api';
import { Shift, ShiftStatus, EmergencyType, EmergencyAlert } from '../../types';
import {
  ensureShiftNotificationPermissions,
  showShiftOngoingNotification,
  dismissShiftNotification,
  ShiftNotificationContext,
} from '../../lib/notifications';
import {
  updateShiftTimerBackgroundTask,
  clearShiftTimerBackgroundTask,
} from '../../lib/shiftBackgroundTask';

const toShiftNotificationContext = (shift: Shift): ShiftNotificationContext => ({
  id: shift.id,
  startTime: shift.startTime,
  expectedDuration: shift.expectedDuration,
  clientName: shift.clientName,
});

const formatGeocodedAddress = (geo: Location.LocationGeocodedAddress): string => {
  const primaryLine = geo.name || [geo.streetNumber, geo.street].filter(Boolean).join(' ');
  const cityLine = geo.city || geo.subregion;
  const regionLine = geo.region || geo.postalCode;
  const country = geo.country;
  return [primaryLine, cityLine, regionLine, country].filter(Boolean).join(', ');
};

const normalizeShift = (shift: any): Shift => {
  const rawStatus = (shift?.status ?? shift?.Status ?? ShiftStatus.ACTIVE).toString().toLowerCase();
  const status = (rawStatus === ShiftStatus.ACTIVE || rawStatus === ShiftStatus.COMPLETED || rawStatus === ShiftStatus.EMERGENCY)
    ? rawStatus
    : ShiftStatus.ACTIVE;

  const rawLocation = shift?.currentLocation ?? shift?.CurrentLocation;
  let currentLocation = rawLocation;
  if (typeof rawLocation === 'string') {
    try {
      currentLocation = JSON.parse(rawLocation);
    } catch {
      currentLocation = undefined;
    }
  }

  return {
    id: String(shift?.id ?? shift?.ShiftId ?? shift?.shiftId ?? ''),
    userId: String(shift?.userId ?? shift?.UserId ?? ''),
    startTime: shift?.startTime ?? shift?.StartTime ?? '',
    endTime: shift?.endTime ?? shift?.EndTime ?? undefined,
    status: status as ShiftStatus,
    lastCheckIn: shift?.lastCheckIn ?? shift?.LastCheckIn ?? undefined,
    checkInCount: shift?.checkInCount ?? shift?.CheckInCount ?? 0,
    currentLocation,
    clientName: shift?.clientName ?? shift?.ClientName ?? '',
    clientAddress: shift?.clientAddress ?? shift?.ClientAddress ?? '',
    expectedDuration: shift?.expectedDuration ?? shift?.ExpectedDuration ?? undefined,
    notes: shift?.notes ?? shift?.Notes ?? '',
    createdAt: shift?.createdAt ?? shift?.CreatedAt ?? '',
    updatedAt: shift?.updatedAt ?? shift?.UpdatedAt ?? '',
  };
};

export default function SafetyScreen() {
  const { user } = useAuth();
  const [activeShift, setActiveShift] = useState<Shift | null>(null);
  const [loading, setLoading] = useState(false);
  const [clientName, setClientName] = useState('');
  const [clientAddress, setClientAddress] = useState('');
  const [expectedDuration, setExpectedDuration] = useState('60');
  const [notes, setNotes] = useState('');
  const [shiftDuration, setShiftDuration] = useState('');
  const [hasActiveEmergency, setHasActiveEmergency] = useState(false);
  const notificationIdRef = useRef<string | null>(null);

  useEffect(() => {
    ensureShiftNotificationPermissions();
  }, []);

  const updateShiftNotification = useCallback(async (shift: Shift) => {
    const context = toShiftNotificationContext(shift);
    const notificationId = await showShiftOngoingNotification(context, notificationIdRef.current);
    if (notificationId) {
      notificationIdRef.current = notificationId;
    }
    await updateShiftTimerBackgroundTask(context, notificationIdRef.current);
  }, []);

  const clearShiftNotification = useCallback(async () => {
    if (!notificationIdRef.current) {
      return;
    }
    await dismissShiftNotification(notificationIdRef.current);
    notificationIdRef.current = null;
  }, []);

  useEffect(() => {
    loadActiveShift();
    checkActiveEmergency();
  }, []);

  useEffect(() => {
    if (activeShift) {
      const interval = setInterval(() => {
        const start = new Date(activeShift.startTime);
        const now = new Date();
        const diffMs = now.getTime() - start.getTime();
        const hours = Math.floor(diffMs / 3600000);
        const minutes = Math.floor((diffMs % 3600000) / 60000);
        setShiftDuration(`${hours}h ${minutes}m`);
      }, 1000);

      return () => clearInterval(interval);
    }
  }, [activeShift]);

  useEffect(() => {
    if (!activeShift) {
      clearShiftNotification();
      return;
    }

    let cancelled = false;

    const pushUpdate = () => {
      if (cancelled) {
        return;
      }
      updateShiftNotification(activeShift).catch((error) => {
        console.warn('Unable to update shift notification', error);
      });
    };

    pushUpdate();
    const interval = setInterval(pushUpdate, 60000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [activeShift, updateShiftNotification, clearShiftNotification]);

  useEffect(() => {
    if (!user?.id) return;
    const interval = setInterval(() => {
      checkActiveEmergency();
    }, 15000);

    return () => clearInterval(interval);
  }, [user?.id]);

  const loadActiveShift = async () => {
    if (!user?.id) {
      return;
    }
    try {
      const response = await fetch(`${API_URL}/api/shifts?userId=${user?.id}&activeOnly=true`);
      if (!response.ok) {
        console.warn('Failed to load shifts', response.status);
        setActiveShift(null);
        return;
      }

      const payload = await response.json();
      const shiftList = Array.isArray(payload) ? payload : [];
      if (!Array.isArray(payload)) {
        console.warn('Unexpected shifts payload', payload);
      }

      const normalized = shiftList.map(normalizeShift);
      const userActiveShift = normalized.find((s) => s.userId === user?.id && s.status === ShiftStatus.ACTIVE);
      setActiveShift(userActiveShift || null);
    } catch (error) {
      console.error('Error loading active shift:', error);
    }
  };

  const checkActiveEmergency = async () => {
    if (!user?.id) return;
    try {
      const response = await fetch(`${API_URL}/api/emergencies?unresolvedOnly=true`);
      if (!response.ok) return;
      const payload = await response.json();
      const emergencies = Array.isArray(payload) ? payload : [];
      const userHasEmergency = emergencies.some((e: EmergencyAlert) => e.userId === user.id);
      setHasActiveEmergency(userHasEmergency);
    } catch (error) {
      console.error('Error checking emergency status:', error);
    }
  };

  const getCurrentLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission denied', 'Location permission is required for safety tracking.');
        return null;
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.BestForNavigation,
      });

      let address: string | undefined;
      try {
        const results = await Location.reverseGeocodeAsync({
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
        });
        if (results && results.length > 0) {
          address = formatGeocodedAddress(results[0]);
        }
      } catch (geoError) {
        console.warn('Unable to reverse geocode location', geoError);
      }

      return {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        address,
        timestamp: new Date(location.timestamp ?? Date.now()).toISOString(),
      };
    } catch (error) {
      console.error('Error getting location:', error);
      return null;
    }
  };

  const startShift = async () => {
    if (!clientName.trim()) {
      Alert.alert('Required', 'Please enter client name');
      return;
    }

    setLoading(true);
    try {
      const location = await getCurrentLocation();

      const response = await fetch(`${API_URL}/api/shifts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user?.id,
          clientName: clientName.trim(),
          clientAddress: clientAddress.trim(),
          expectedDuration: parseInt(expectedDuration) || 60,
          notes: notes.trim(),
          currentLocation: location,
        }),
      });

      if (response.ok) {
        const newShift = await response.json();
        setActiveShift(normalizeShift(newShift));
        setClientName('');
        setClientAddress('');
        setExpectedDuration('60');
        setNotes('');
        Alert.alert('Success', 'Shift started successfully');
      } else {
        Alert.alert('Error', 'Failed to start shift');
      }
    } catch (error) {
      console.error('Error starting shift:', error);
      Alert.alert('Error', 'Failed to start shift');
    } finally {
      setLoading(false);
    }
  };

  const endShift = async () => {
    if (!activeShift) return;

    Alert.alert(
      'End Shift',
      'Are you sure you want to end this shift?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'End Shift',
          style: 'destructive',
          onPress: async () => {
            setLoading(true);
            try {
              const location = await getCurrentLocation();

              const response = await fetch(`${API_URL}/api/shifts/${activeShift.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  status: ShiftStatus.COMPLETED,
                  endTime: new Date().toISOString(),
                  currentLocation: location,
                }),
              });

              if (response.ok) {
                setActiveShift(null);
                setHasActiveEmergency(false);
                await clearShiftNotification();
                Alert.alert('Success', 'Shift ended successfully');
              } else {
                Alert.alert('Error', 'Failed to end shift');
              }
            } catch (error) {
              console.error('Error ending shift:', error);
              Alert.alert('Error', 'Failed to end shift');
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  const sendCheckIn = async () => {
    if (!activeShift) return;

    setLoading(true);
    try {
      const location = await getCurrentLocation();

      const response = await fetch(`${API_URL}/api/check-ins`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shiftId: activeShift.id,
          userId: user?.id,
          location,
          status: 'safe',
        }),
      });

      if (response.ok) {
        await loadActiveShift();
        Alert.alert('Success', 'Check-in recorded');
      } else {
        Alert.alert('Error', 'Failed to record check-in');
      }
    } catch (error) {
      console.error('Error sending check-in:', error);
      Alert.alert('Error', 'Failed to record check-in');
    } finally {
      setLoading(false);
    }
  };

  const sendSOS = async () => {
    Alert.alert(
      '🚨 EMERGENCY SOS',
      'This will alert all managers immediately. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'SEND SOS',
          style: 'destructive',
          onPress: async () => {
            setLoading(true);
            try {
              const location = await getCurrentLocation();

              const response = await fetch(`${API_URL}/api/emergencies`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  userId: user?.id,
                  shiftId: activeShift?.id,
                  type: EmergencyType.SOS,
                  location,
                  notes: 'Emergency SOS triggered from mobile app',
                }),
              });

              if (response.ok) {
                Alert.alert('SOS Sent', 'Emergency alert sent to all managers');
                setHasActiveEmergency(true);
                checkActiveEmergency();
              } else {
                Alert.alert('Error', 'Failed to send SOS');
              }
            } catch (error) {
              console.error('Error sending SOS:', error);
              Alert.alert('Error', 'Failed to send SOS');
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>🛡️ Safety Monitoring</Text>
        <Text style={styles.subtitle}>Work Alone Protection</Text>
      </View>

      {activeShift ? (
        <View style={styles.activeShiftContainer}>
          <View style={styles.statusRow}>
            <View style={styles.statusBadge}>
              <Text style={styles.statusText}>● SHIFT ACTIVE</Text>
            </View>
            {hasActiveEmergency && (
              <View style={styles.emergencyBadge}>
                <Text style={styles.emergencyBadgeText}>EMERGENCY ON</Text>
              </View>
            )}
          </View>

          <View style={[styles.shiftInfoCard, hasActiveEmergency && styles.shiftInfoCardEmergency]}>
            <Text style={[styles.cardTitle, hasActiveEmergency && styles.cardTitleEmergency]}>Current Shift</Text>
            <View style={styles.infoRow}>
              <Text style={[styles.label, hasActiveEmergency && styles.labelEmergency]}>Client:</Text>
              <Text style={[styles.value, hasActiveEmergency && styles.valueEmergency]}>{activeShift.clientName}</Text>
            </View>
            {activeShift.clientAddress && (
              <View style={styles.infoRow}>
                <Text style={[styles.label, hasActiveEmergency && styles.labelEmergency]}>Address:</Text>
                <Text style={[styles.value, hasActiveEmergency && styles.valueEmergency]}>{activeShift.clientAddress}</Text>
              </View>
            )}
            <View style={styles.infoRow}>
              <Text style={[styles.label, hasActiveEmergency && styles.labelEmergency]}>Started:</Text>
              <Text style={[styles.value, hasActiveEmergency && styles.valueEmergency]}>{new Date(activeShift.startTime).toLocaleTimeString()}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={[styles.label, hasActiveEmergency && styles.labelEmergency]}>Duration:</Text>
              <Text style={[styles.value, hasActiveEmergency && styles.valueEmergency]}>{shiftDuration}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={[styles.label, hasActiveEmergency && styles.labelEmergency]}>Check-ins:</Text>
              <Text style={[styles.value, hasActiveEmergency && styles.valueEmergency]}>{activeShift.checkInCount || 0}</Text>
            </View>
            {activeShift.lastCheckIn && (
              <View style={styles.infoRow}>
                <Text style={[styles.label, hasActiveEmergency && styles.labelEmergency]}>Last Check-in:</Text>
                <Text style={[styles.value, hasActiveEmergency && styles.valueEmergency]}>
                  {new Date(activeShift.lastCheckIn).toLocaleTimeString()}
                </Text>
              </View>
            )}
          </View>

          <TouchableOpacity
            style={styles.sosButton}
            onPress={sendSOS}
            disabled={!!loading}
          >
            <Text style={styles.sosButtonText}>🚨 EMERGENCY SOS</Text>
            <Text style={styles.sosSubtext}>Tap to alert all managers</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.checkInButton}
            onPress={sendCheckIn}
            disabled={!!loading}
          >
            <Text style={styles.checkInButtonText}>✓ I'm Safe - Check In</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.endShiftButton}
            onPress={endShift}
            disabled={!!loading}
          >
            <Text style={styles.endShiftButtonText}>End Shift</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.startShiftContainer}>
          <Text style={styles.sectionTitle}>Start New Shift</Text>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Client Name *</Text>
            <TextInput
              style={styles.input}
              value={clientName}
              onChangeText={setClientName}
              placeholder="Enter client name"
              placeholderTextColor="#999"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Client Address</Text>
            <TextInput
              style={styles.input}
              value={clientAddress}
              onChangeText={setClientAddress}
              placeholder="Enter client address"
              placeholderTextColor="#999"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Expected Duration (minutes)</Text>
            <TextInput
              style={styles.input}
              value={expectedDuration}
              onChangeText={setExpectedDuration}
              placeholder="60"
              placeholderTextColor="#999"
              keyboardType="numeric"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Notes</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={notes}
              onChangeText={setNotes}
              placeholder="Any additional notes..."
              placeholderTextColor="#999"
              multiline={true}
              numberOfLines={3}
            />
          </View>

          <TouchableOpacity
            style={styles.startShiftButton}
            onPress={startShift}
            disabled={!!loading}
          >
            <Text style={styles.startShiftButtonText}>▶ Start Shift</Text>
          </TouchableOpacity>

          <View style={styles.infoBox}>
            <Text style={styles.infoText}>
              🛡️ Starting a shift enables safety monitoring and allows you to send check-ins and emergency alerts.
            </Text>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  header: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 4,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 5,
  },
  subtitle: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.9)',
  },
  activeShiftContainer: {
    padding: 20,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
    flexWrap: 'wrap',
  },
  statusBadge: {
    backgroundColor: '#34C759',
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 20,
  },
  statusText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 14,
  },
  emergencyBadge: {
    backgroundColor: '#DC2626',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#7F1D1D',
  },
  emergencyBadgeText: {
    color: '#fff5f5',
    fontWeight: 'bold',
    fontSize: 14,
    letterSpacing: 0.5,
  },
  shiftInfoCard: {
    backgroundColor: 'white',
    padding: 20,
    borderRadius: 12,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  shiftInfoCardEmergency: {
    backgroundColor: '#FEF2F2',
    borderWidth: 2,
    borderColor: '#DC2626',
    shadowColor: '#DC2626',
    shadowOpacity: 0.2,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 15,
    color: '#333',
  },
  cardTitleEmergency: {
    color: '#B91C1C',
  },
  infoRow: {
    flexDirection: 'row',
    marginBottom: 10,
  },
  label: {
    fontSize: 14,
    color: '#666',
    width: 110,
  },
  labelEmergency: {
    color: '#7F1D1D',
  },
  value: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
    flex: 1,
  },
  valueEmergency: {
    color: '#991B1B',
  },
  sosButton: {
    backgroundColor: '#FF3B30',
    padding: 25,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 15,
    shadowColor: '#FF3B30',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  sosButtonText: {
    color: 'white',
    fontSize: 24,
    fontWeight: 'bold',
  },
  sosSubtext: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 12,
    marginTop: 5,
  },
  checkInButton: {
    backgroundColor: '#34C759',
    padding: 18,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 15,
  },
  checkInButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  endShiftButton: {
    backgroundColor: '#8E8E93',
    padding: 15,
    borderRadius: 12,
    alignItems: 'center',
  },
  endShiftButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  startShiftContainer: {
    padding: 20,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 20,
    color: '#333',
  },
  inputGroup: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
    color: '#333',
  },
  input: {
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#333',
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  startShiftButton: {
    backgroundColor: '#007AFF',
    padding: 18,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 20,
  },
  startShiftButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  infoBox: {
    backgroundColor: '#E8F4FD',
    padding: 15,
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#007AFF',
  },
  infoText: {
    fontSize: 14,
    color: '#555',
    lineHeight: 20,
  },
});
