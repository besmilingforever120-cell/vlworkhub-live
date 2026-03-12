import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { useAuth } from '../contexts/AuthContext';
import { API_URL } from '../lib/api';
import { EmergencyAlert, User, UserRole } from '../types';
import {
  dismissEmergencyAlarmNotification,
  ensureShiftNotificationPermissions,
  showEmergencyAlarmNotification,
} from '../lib/notifications';

interface EmergencyResolution {
  resolvedAt: string;
  resolvedBy: string;
  resolution: string;
  employeeSafe: 'yes' | 'no' | 'unknown';
  canResumeWork: 'yes' | 'no' | 'requires_medical' | 'pending_investigation';
  actionsTaken: string;
  followUpRequired: boolean;
  followUpNotes?: string;
}

const defaultResolution = (): EmergencyResolution => ({
  resolvedAt: new Date().toISOString(),
  resolvedBy: '',
  resolution: '',
  employeeSafe: 'unknown',
  canResumeWork: 'pending_investigation',
  actionsTaken: '',
  followUpRequired: false,
  followUpNotes: '',
});

const normalizeEmergency = (emergency: any): EmergencyAlert => {
  const rawLocation = emergency?.location ?? emergency?.Location;
  let location = rawLocation;
  if (typeof rawLocation === 'string') {
    try {
      location = JSON.parse(rawLocation);
    } catch {
      location = undefined;
    }
  }

  return {
    id: String(emergency?.id ?? emergency?.EmergencyId ?? emergency?.emergencyId ?? ''),
    userId: String(emergency?.userId ?? emergency?.UserId ?? ''),
    shiftId: emergency?.shiftId ?? emergency?.ShiftId ?? undefined,
    type: emergency?.type ?? emergency?.Type ?? '',
    location,
    timestamp: emergency?.timestamp ?? emergency?.Timestamp ?? '',
    resolved: Boolean(emergency?.resolved ?? emergency?.Resolved),
    resolvedBy: emergency?.resolvedBy ?? emergency?.ResolvedBy ?? undefined,
    resolvedAt: emergency?.resolvedAt ?? emergency?.ResolvedAt ?? undefined,
    notes: emergency?.notes ?? emergency?.Notes ?? '',
    resolution: emergency?.resolution,
    employeeSafe: emergency?.employeeSafe,
    canResumeWork: emergency?.canResumeWork,
    actionsTaken: emergency?.actionsTaken,
    followUpRequired: emergency?.followUpRequired,
    followUpNotes: emergency?.followUpNotes,
  };
};

const formatLocationLabel = (location?: EmergencyAlert['location']) => {
  if (!location) {
    return 'Location unavailable';
  }
  if (location.address) {
    return location.address;
  }
  if (Number.isFinite(location.latitude) && Number.isFinite(location.longitude)) {
    return `${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)}`;
  }
  return 'Location unavailable';
};

const buildMapUrl = (location?: EmergencyAlert['location']) => {
  if (!location) {
    return null;
  }
  if (Number.isFinite(location.latitude) && Number.isFinite(location.longitude)) {
    return `https://maps.google.com/?q=${location.latitude},${location.longitude}`;
  }
  if (location.address) {
    return `https://maps.google.com/?q=${encodeURIComponent(location.address)}`;
  }
  return null;
};

export default function SosScreen() {
  const { user } = useAuth();
  const isAuthorized = user?.role === UserRole.ADMIN || user?.role === UserRole.MANAGER;
  const [emergencies, setEmergencies] = useState<EmergencyAlert[]>([]);
  const [usersById, setUsersById] = useState<Record<string, User>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [resolvingEmergency, setResolvingEmergency] = useState<EmergencyAlert | null>(null);
  const [resolutionForm, setResolutionForm] = useState<EmergencyResolution>(defaultResolution);
  const notificationIdsRef = useRef<Record<string, string>>({});
  const notifiedEmergencyIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    ensureShiftNotificationPermissions();
  }, []);

  const refreshEmergencies = useCallback(
    async (silent?: boolean) => {
      if (!isAuthorized) {
        return;
      }

      if (!silent) {
        setLoading(true);
      }

      try {
        const [emergenciesRes, usersRes] = await Promise.all([
          fetch(`${API_URL}/api/emergencies?unresolvedOnly=true`),
          fetch(`${API_URL}/api/users`),
        ]);

        if (!emergenciesRes.ok || !usersRes.ok) {
          throw new Error('Failed to fetch emergencies');
        }

        const emergenciesPayload = await emergenciesRes.json();
        const usersPayload = await usersRes.json();

        const normalized = Array.isArray(emergenciesPayload)
          ? emergenciesPayload.map(normalizeEmergency)
          : [];

        normalized.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        setEmergencies(normalized);

        const userMap: Record<string, User> = {};
        if (Array.isArray(usersPayload)) {
          usersPayload.forEach((item: any) => {
            const id = String(item?.id ?? item?.UserId ?? item?.userId ?? '');
            if (id) {
              userMap[id] = {
                id,
                email: item?.email ?? item?.Email ?? '',
                role: item?.role ?? item?.Role ?? UserRole.EMPLOYEE,
                firstName: item?.firstName ?? item?.FirstName ?? '',
                lastName: item?.lastName ?? item?.LastName ?? '',
                department: item?.department ?? item?.Department ?? undefined,
                managerId: item?.managerId ?? item?.ManagerId ?? undefined,
                isActive: Boolean(item?.isActive ?? item?.IsActive ?? true),
                createdAt: item?.createdAt ?? item?.CreatedAt ?? '',
                updatedAt: item?.updatedAt ?? item?.UpdatedAt ?? '',
              };
            }
          });
        }
        setUsersById(userMap);

        const activeIds = new Set(normalized.map((emergency) => emergency.id));
        for (const [emergencyId, notificationId] of Object.entries(notificationIdsRef.current)) {
          if (!activeIds.has(emergencyId)) {
            dismissEmergencyAlarmNotification(notificationId);
            delete notificationIdsRef.current[emergencyId];
          }
        }

        for (const emergency of normalized) {
          if (!emergency.id || notifiedEmergencyIdsRef.current.has(emergency.id)) {
            continue;
          }

          const employee = userMap[emergency.userId];
          const employeeName = employee
            ? `${employee.firstName} ${employee.lastName}`.trim()
            : 'Unknown Employee';
          const locationLabel = formatLocationLabel(emergency.location);

          const notificationId = await showEmergencyAlarmNotification({
            title: `Emergency: ${employeeName}`,
            body: `Location: ${locationLabel}`,
            data: {
              emergencyId: emergency.id,
              userId: emergency.userId,
            },
          });

          if (notificationId) {
            notificationIdsRef.current[emergency.id] = notificationId;
            notifiedEmergencyIdsRef.current.add(emergency.id);
          }
        }
      } catch (error) {
        console.error('Error loading emergencies:', error);
      } finally {
        setLoading(false);
      }
    },
    [isAuthorized],
  );

  useEffect(() => {
    if (!isAuthorized) {
      return;
    }
    refreshEmergencies();
    const interval = setInterval(() => {
      refreshEmergencies(true);
    }, 15000);

    return () => clearInterval(interval);
  }, [isAuthorized, refreshEmergencies]);

  const handleResolveSubmit = async () => {
    if (!resolvingEmergency || !user?.id) {
      return;
    }

    if (!resolutionForm.resolution.trim() || !resolutionForm.actionsTaken.trim()) {
      Alert.alert('Required', 'Please fill in Resolution Summary and Actions Taken.');
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch(`${API_URL}/api/emergencies/${resolvingEmergency.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...resolutionForm,
          resolvedBy: user.id,
          resolvedAt: new Date().toISOString(),
        }),
      });

      if (!response.ok) {
        Alert.alert('Error', 'Failed to resolve emergency. Please try again.');
        return;
      }

      const notificationId = notificationIdsRef.current[resolvingEmergency.id];
      if (notificationId) {
        await dismissEmergencyAlarmNotification(notificationId);
        delete notificationIdsRef.current[resolvingEmergency.id];
      }

      notifiedEmergencyIdsRef.current.delete(resolvingEmergency.id);
      setResolvingEmergency(null);
      setResolutionForm(defaultResolution());
      await refreshEmergencies(true);
    } catch (error) {
      console.error('Error resolving emergency:', error);
      Alert.alert('Error', 'Failed to resolve emergency.');
    } finally {
      setSubmitting(false);
    }
  };

  const openMaps = async (location?: EmergencyAlert['location']) => {
    const url = buildMapUrl(location);
    if (!url) {
      Alert.alert('Unavailable', 'No location data is available.');
      return;
    }

    const supported = await Linking.canOpenURL(url);
    if (!supported) {
      Alert.alert('Unavailable', 'Unable to open maps on this device.');
      return;
    }

    Linking.openURL(url);
  };

  const hasEmergencies = emergencies.length > 0;
  const bannerText = hasEmergencies
    ? 'Emergency detected. Immediate response required.'
    : 'Monitoring for incoming emergencies.';

  if (!isAuthorized) {
    return (
      <View style={styles.restrictedContainer}>
        <Text style={styles.restrictedTitle}>SOS Access Restricted</Text>
        <Text style={styles.restrictedText}>
          SOS controls are available only to admins and managers.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.banner, hasEmergencies && styles.bannerActive]}>
        <Text style={styles.bannerTitle}>Emergency SOS</Text>
        <Text style={styles.bannerSubtitle}>{bannerText}</Text>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#dc2626" />
          <Text style={styles.loadingText}>Loading emergencies...</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {!hasEmergencies && (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>No Active Emergencies</Text>
              <Text style={styles.emptyText}>You will be notified immediately when an SOS is triggered.</Text>
            </View>
          )}

          {emergencies.map((emergency) => {
            const employee = usersById[emergency.userId];
            const employeeName = employee
              ? `${employee.firstName} ${employee.lastName}`.trim()
              : 'Unknown Employee';
            const locationLabel = formatLocationLabel(emergency.location);
            const timestampLabel = emergency.timestamp
              ? new Date(emergency.timestamp).toLocaleString()
              : 'Unknown time';

            return (
              <View key={emergency.id} style={styles.emergencyCard}>
                <View style={styles.emergencyHeader}>
                  <View>
                    <Text style={styles.emergencyName}>{employeeName}</Text>
                    <Text style={styles.emergencyMeta}>
                      {emergency.type?.toUpperCase()} • {timestampLabel}
                    </Text>
                  </View>
                  <View style={styles.emergencyBadge}>
                    <Text style={styles.emergencyBadgeText}>URGENT</Text>
                  </View>
                </View>

                <Text style={styles.emergencyLabel}>Location</Text>
                <Text style={styles.emergencyValue}>{locationLabel}</Text>

                <TouchableOpacity
                  style={styles.mapButton}
                  onPress={() => openMaps(emergency.location)}
                >
                  <Text style={styles.mapButtonText}>Open in Maps</Text>
                </TouchableOpacity>

                {emergency.notes ? (
                  <>
                    <Text style={styles.emergencyLabel}>Notes</Text>
                    <Text style={styles.emergencyValue}>{emergency.notes}</Text>
                  </>
                ) : null}

                <TouchableOpacity
                  style={styles.resolveButton}
                  onPress={() => {
                    setResolvingEmergency(emergency);
                    setResolutionForm(defaultResolution());
                  }}
                >
                  <Text style={styles.resolveButtonText}>Resolve Emergency</Text>
                </TouchableOpacity>
              </View>
            );
          })}
        </ScrollView>
      )}

      <Modal
        visible={Boolean(resolvingEmergency)}
        transparent
        animationType="slide"
        onRequestClose={() => setResolvingEmergency(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <ScrollView contentContainerStyle={styles.modalContent}>
              <Text style={styles.modalTitle}>Resolve Emergency</Text>

              <Text style={styles.modalLabel}>Resolution Summary *</Text>
              <TextInput
                style={[styles.modalInput, styles.modalTextArea]}
                value={resolutionForm.resolution}
                onChangeText={(value) =>
                  setResolutionForm((prev) => ({ ...prev, resolution: value }))
                }
                placeholder="Describe how the emergency was resolved..."
                multiline
              />

              <Text style={styles.modalLabel}>Is the employee safe? *</Text>
              <View style={styles.pickerWrapper}>
                <Picker
                  selectedValue={resolutionForm.employeeSafe}
                  onValueChange={(value) =>
                    setResolutionForm((prev) => ({
                      ...prev,
                      employeeSafe: value as EmergencyResolution['employeeSafe'],
                    }))
                  }
                >
                  <Picker.Item label="Unknown" value="unknown" />
                  <Picker.Item label="Yes - Employee is safe" value="yes" />
                  <Picker.Item label="No - Employee needs assistance" value="no" />
                </Picker>
              </View>

              <Text style={styles.modalLabel}>Can employee resume work? *</Text>
              <View style={styles.pickerWrapper}>
                <Picker
                  selectedValue={resolutionForm.canResumeWork}
                  onValueChange={(value) =>
                    setResolutionForm((prev) => ({
                      ...prev,
                      canResumeWork: value as EmergencyResolution['canResumeWork'],
                    }))
                  }
                >
                  <Picker.Item label="Pending Investigation" value="pending_investigation" />
                  <Picker.Item label="Yes - Can resume immediately" value="yes" />
                  <Picker.Item label="No - Cannot resume work" value="no" />
                  <Picker.Item label="Requires Medical Clearance" value="requires_medical" />
                </Picker>
              </View>

              <Text style={styles.modalLabel}>Actions Taken *</Text>
              <TextInput
                style={[styles.modalInput, styles.modalTextArea]}
                value={resolutionForm.actionsTaken}
                onChangeText={(value) =>
                  setResolutionForm((prev) => ({ ...prev, actionsTaken: value }))
                }
                placeholder="List all actions taken..."
                multiline
              />

              <View style={styles.switchRow}>
                <Text style={styles.modalLabel}>Follow-up required</Text>
                <Switch
                  value={resolutionForm.followUpRequired}
                  onValueChange={(value) =>
                    setResolutionForm((prev) => ({ ...prev, followUpRequired: value }))
                  }
                />
              </View>

              {resolutionForm.followUpRequired ? (
                <>
                  <Text style={styles.modalLabel}>Follow-up Notes</Text>
                  <TextInput
                    style={[styles.modalInput, styles.modalTextArea]}
                    value={resolutionForm.followUpNotes}
                    onChangeText={(value) =>
                      setResolutionForm((prev) => ({ ...prev, followUpNotes: value }))
                    }
                    placeholder="Describe required follow-up actions..."
                    multiline
                  />
                </>
              ) : null}

              <View style={styles.modalButtonRow}>
                <TouchableOpacity
                  style={[styles.modalButton, styles.modalButtonPrimary]}
                  onPress={handleResolveSubmit}
                  disabled={submitting}
                >
                  <Text style={styles.modalButtonText}>
                    {submitting ? 'Submitting...' : 'Submit Resolution'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalButton, styles.modalButtonSecondary]}
                  onPress={() => setResolvingEmergency(null)}
                >
                  <Text style={styles.modalButtonSecondaryText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  banner: {
    backgroundColor: '#dc2626',
    padding: 20,
  },
  bannerActive: {
    borderBottomWidth: 3,
    borderBottomColor: '#991b1b',
  },
  bannerTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 6,
  },
  bannerSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.9)',
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#6b7280',
  },
  emptyState: {
    backgroundColor: '#fff',
    padding: 24,
    borderRadius: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 6,
  },
  emptyText: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
  },
  emergencyCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#fecaca',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  emergencyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  emergencyName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  emergencyMeta: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 4,
  },
  emergencyBadge: {
    backgroundColor: '#dc2626',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  emergencyBadgeText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 11,
  },
  emergencyLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6b7280',
    marginTop: 10,
  },
  emergencyValue: {
    fontSize: 14,
    color: '#111827',
    marginTop: 4,
  },
  mapButton: {
    marginTop: 10,
    alignSelf: 'flex-start',
    backgroundColor: '#1d4ed8',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  mapButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  resolveButton: {
    marginTop: 16,
    backgroundColor: '#16a34a',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  resolveButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  restrictedContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#f5f5f5',
  },
  restrictedTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
  },
  restrictedText: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.7)',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    maxHeight: '90%',
  },
  modalContent: {
    padding: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 16,
  },
  modalLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 6,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    padding: 10,
    fontSize: 14,
    color: '#111827',
    backgroundColor: '#f9fafb',
    marginBottom: 14,
  },
  modalTextArea: {
    minHeight: 90,
    textAlignVertical: 'top',
  },
  pickerWrapper: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    overflow: 'hidden',
    marginBottom: 14,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  modalButtonRow: {
    marginTop: 12,
  },
  modalButton: {
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 10,
  },
  modalButtonPrimary: {
    backgroundColor: '#16a34a',
  },
  modalButtonSecondary: {
    backgroundColor: '#e5e7eb',
  },
  modalButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
  modalButtonSecondaryText: {
    color: '#111827',
    fontWeight: '600',
    fontSize: 15,
  },
});
