import React, { useState } from 'react';
import {
  Alert,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { useTrip } from '../contexts/TripContext';
import { useAuth } from '../contexts/AuthContext';
import { TripCategory } from '../types';

export default function HomeScreen() {
  const { user } = useAuth();
  const {
    currentTrip,
    isTracking,
    startTrip,
    stopTrip,
    trips,
    refreshTrips,
    pendingTripsCount,
    isSyncingPending,
    syncPendingTrips,
  } = useTrip();
  const [category, setCategory] = useState<TripCategory>(TripCategory.BUSINESS);
  const [vehicleInfo, setVehicleInfo] = useState('');
  const [purpose, setPurpose] = useState('');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await refreshTrips();
    setRefreshing(false);
  };

  const handleStartTrip = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      await startTrip(category, vehicleInfo, purpose);
      Alert.alert('Success', 'Trip started!');
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStopTrip = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      const { savedOffline } = await stopTrip(notes);
      if (savedOffline) {
        Alert.alert('Saved Offline', 'Trip saved locally. Will sync when online.');
      } else {
        Alert.alert('Success', 'Trip completed and saved!');
      }
      setNotes('');
      setVehicleInfo('');
      setPurpose('');
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSyncPendingTrips = async () => {
    if (isSyncingPending) return;
    await syncPendingTrips();
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <View style={styles.header}>
          <Text style={styles.title}>Trip Tracking</Text>
          <Text style={styles.subtitle}>Welcome, {user?.firstName}!</Text>
        </View>

        {pendingTripsCount > 0 ? (
          <View style={styles.pendingCard}>
            <View style={styles.pendingText}>
              <Text style={styles.pendingTitle}>
                {pendingTripsCount} trip{pendingTripsCount === 1 ? '' : 's'} pending sync
              </Text>
              <Text style={styles.pendingSubtitle}>
                Trips sync automatically when you're online.
              </Text>
            </View>
            <TouchableOpacity
              style={[
                styles.pendingButton,
                isSyncingPending ? styles.pendingButtonDisabled : null,
              ]}
              onPress={handleSyncPendingTrips}
              disabled={isSyncingPending}
              accessibilityRole="button"
              accessibilityLabel="Sync pending trips"
            >
              <Text style={styles.pendingButtonText}>
                {isSyncingPending ? 'Syncing...' : 'Sync now'}
              </Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {!isTracking ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Start New Trip</Text>
            
            <Text style={styles.label}>Category</Text>
            <Picker
              selectedValue={category}
              onValueChange={setCategory}
              style={styles.picker}
              itemStyle={styles.pickerItem}
              dropdownIconColor="#111827"
            >
              <Picker.Item label="Business" value={TripCategory.BUSINESS} color="#111827" />
              <Picker.Item label="Personal" value={TripCategory.PERSONAL} color="#111827" />
              <Picker.Item label="Commute" value={TripCategory.COMMUTE} color="#111827" />
            </Picker>
  
            <Text style={styles.label}>Vehicle Info (Optional)</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g., Toyota Camry - ABC 123"
              value={vehicleInfo}
              onChangeText={setVehicleInfo}
              editable={!isSubmitting}
              accessibilityLabel="Vehicle information"
            />
  
            <Text style={styles.label}>Purpose (Optional)</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g., Client meeting"
              value={purpose}
              onChangeText={setPurpose}
              editable={!isSubmitting}
              accessibilityLabel="Trip purpose"
            />
  
            <TouchableOpacity 
              style={[styles.startButton, isSubmitting ? styles.disabledButton : null]} 
              onPress={handleStartTrip}
              disabled={!!isSubmitting}
              accessibilityRole="button"
              accessibilityLabel="Start trip"
            >
              <Text style={styles.buttonText}>{isSubmitting ? 'Starting...' : 'Start Trip'}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Trip in Progress</Text>
            <View style={styles.tripInfo}>
              <Text style={styles.tripLabel}>Category:</Text>
              <Text style={styles.tripValue}>{currentTrip?.category}</Text>
            </View>
            <View style={styles.tripInfo}>
              <Text style={styles.tripLabel}>Started:</Text>
              <Text style={styles.tripValue}>
                {currentTrip?.startTime ? new Date(currentTrip.startTime).toLocaleTimeString() : ''}
              </Text>
            </View>
  
            <Text style={styles.label}>Notes (Optional)</Text>
            <TextInput
              style={styles.input}
              placeholder="Add any notes about this trip"
              value={notes}
              onChangeText={setNotes}
              multiline={true}
              editable={!isSubmitting}
              accessibilityLabel="Trip notes"
            />
  
            <TouchableOpacity 
              style={[styles.stopButton, isSubmitting ? styles.disabledButton : null]} 
              onPress={handleStopTrip}
              disabled={!!isSubmitting}
              accessibilityRole="button"
              accessibilityLabel="Stop trip"
            >
              <Text style={styles.buttonText}>{isSubmitting ? 'Saving...' : 'Stop Trip'}</Text>
            </TouchableOpacity>
          </View>
        )}
  
        <View style={styles.card}>
          <View style={styles.tripListHeader}>
            <Text style={styles.cardTitle}>Trip History</Text>
            <Text style={styles.tripCountLabel}>{trips.length} total</Text>
          </View>
          {trips.length === 0 ? (
            <Text style={styles.emptyStateText}>
              No trips recorded yet. Start a trip to see it listed here.
            </Text>
          ) : (
            trips.map((trip) => (
              <View key={trip.id} style={styles.tripItem}>
                <View style={styles.tripItemHeader}>
                  <Text style={styles.tripCategory}>{trip.category}</Text>
                  <Text style={styles.tripStatus}>{trip.status}</Text>
                </View>
                <Text style={styles.tripDistance}>
                  {((trip.distanceInMiles ?? 0) * 1.60934).toFixed(2)} km
                </Text>
                <Text style={styles.tripDate}>
                  {trip.startTime
                    ? `${new Date(trip.startTime).toLocaleDateString()} at ${new Date(trip.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                    : 'Start time not available'}
                </Text>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollContent: {
    paddingBottom: 16,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 12,
    backgroundColor: '#2563eb',
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
  card: {
    backgroundColor: 'white',
    margin: 20,
    padding: 20,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  tripListHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  pendingCard: {
    backgroundColor: '#eef2ff',
    marginHorizontal: 20,
    marginTop: 16,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#c7d2fe',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
  },
  pendingText: {
    flexShrink: 1,
    marginRight: 12,
  },
  pendingTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1e3a8a',
  },
  pendingSubtitle: {
    fontSize: 12,
    color: '#4338ca',
    marginTop: 2,
  },
  pendingButton: {
    backgroundColor: '#2563eb',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  pendingButtonDisabled: {
    backgroundColor: '#93c5fd',
  },
  pendingButtonText: {
    color: 'white',
    fontSize: 13,
    fontWeight: '700',
  },
  tripCountLabel: {
    fontSize: 14,
    color: '#6b7280',
  },
  emptyStateText: {
    fontSize: 14,
    color: '#6b7280',
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: 10,
    marginBottom: 5,
    color: '#333',
  },
  picker: {
    backgroundColor: '#f9f9f9',
    marginBottom: 15,
    color: '#111827',
  },
  pickerItem: {
    color: '#111827',
  },
  input: {
    backgroundColor: '#f9f9f9',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    marginBottom: 15,
  },
  startButton: {
    backgroundColor: '#10b981',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 10,
  },
  stopButton: {
    backgroundColor: '#ef4444',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 10,
  },
  disabledButton: {
    backgroundColor: '#9ca3af',
    opacity: 0.6,
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  tripInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  tripLabel: {
    fontSize: 14,
    color: '#666',
  },
  tripValue: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  tripItem: {
    borderTopWidth: 1,
    borderTopColor: '#eee',
    paddingTop: 15,
    marginTop: 15,
  },
  tripItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 5,
  },
  tripCategory: {
    fontSize: 16,
    fontWeight: 'bold',
    textTransform: 'capitalize',
  },
  tripStatus: {
    fontSize: 12,
    color: '#666',
    textTransform: 'capitalize',
  },
  tripDistance: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2563eb',
    marginVertical: 5,
  },
  tripDate: {
    fontSize: 12,
    color: '#999',
  },
});
