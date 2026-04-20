import React, { useMemo, useState } from "react";
import { Alert, RefreshControl, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useAuth } from "../contexts/AuthContext";
import { useTrip } from "../contexts/TripContext";

export default function HomeScreen() {
  const { user } = useAuth();
  const { currentTrip, isTracking, trips, loading, startTrip, stopTrip, createEmergency, refreshTrips } = useTrip();

  const [category, setCategory] = useState("business");
  const [vehicleInfo, setVehicleInfo] = useState("");
  const [purpose, setPurpose] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const sortedTrips = useMemo(
    () => [...trips].sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime()),
    [trips]
  );

  const onStart = async () => {
    setSubmitting(true);
    try {
      await startTrip(category, vehicleInfo || undefined, purpose || undefined);
      Alert.alert("Trip started", "Mobile route tracking is active.");
    } catch (error) {
      Alert.alert("Unable to start trip", error instanceof Error ? error.message : "Unknown error");
    } finally {
      setSubmitting(false);
    }
  };

  const onStop = async () => {
    setSubmitting(true);
    try {
      await stopTrip(notes || undefined);
      setNotes("");
      setPurpose("");
      setVehicleInfo("");
      Alert.alert("Trip saved", "Trip uploaded to URSafe backend.");
    } catch (error) {
      Alert.alert("Unable to stop trip", error instanceof Error ? error.message : "Unknown error");
    } finally {
      setSubmitting(false);
    }
  };

  const onEmergency = async () => {
    try {
      await createEmergency("sos", "Emergency triggered from URSafe mobile app");
      Alert.alert("Emergency sent", "SOS alert was posted to URSafe emergencies.");
    } catch (error) {
      Alert.alert("Emergency failed", error instanceof Error ? error.message : "Unknown error");
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void refreshTrips()} />}
      >
        <View style={styles.header}>
          <Text style={styles.title}>URSafe Mobile</Text>
          <Text style={styles.subtitle}>Signed in as {user?.fullName || user?.email}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Session Status</Text>
          <Text style={styles.cardText}>{isTracking ? "Online - trip in progress" : "Online - ready"}</Text>
          <TouchableOpacity style={styles.emergencyButton} onPress={onEmergency}>
            <Text style={styles.emergencyButtonText}>Trigger SOS</Text>
          </TouchableOpacity>
        </View>

        {!isTracking ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Start Trip</Text>
            <TextInput value={category} onChangeText={setCategory} style={styles.input} placeholder="Category (business/personal)" />
            <TextInput value={vehicleInfo} onChangeText={setVehicleInfo} style={styles.input} placeholder="Vehicle info" />
            <TextInput value={purpose} onChangeText={setPurpose} style={styles.input} placeholder="Purpose" />
            <TouchableOpacity disabled={submitting} onPress={onStart} style={[styles.button, submitting ? styles.buttonDisabled : null]}>
              <Text style={styles.buttonText}>{submitting ? "Starting..." : "Start Trip"}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Trip In Progress</Text>
            <Text style={styles.cardText}>Category: {currentTrip?.category}</Text>
            <Text style={styles.cardText}>Started: {currentTrip?.startTime ? new Date(currentTrip.startTime).toLocaleString() : "--"}</Text>
            <TextInput value={notes} onChangeText={setNotes} style={styles.input} placeholder="Trip notes" multiline />
            <TouchableOpacity disabled={submitting} onPress={onStop} style={[styles.buttonStop, submitting ? styles.buttonDisabled : null]}>
              <Text style={styles.buttonText}>{submitting ? "Saving..." : "Stop Trip"}</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Recent Trips</Text>
          {sortedTrips.length === 0 ? <Text style={styles.cardText}>No trips yet.</Text> : null}
          {sortedTrips.map((trip) => (
            <View key={trip.id} style={styles.tripRow}>
              <Text style={styles.tripTitle}>{trip.category}</Text>
              <Text style={styles.tripMeta}>{new Date(trip.startTime).toLocaleString()}</Text>
              <Text style={styles.tripMeta}>{(trip.distanceInMiles * 1.60934).toFixed(2)} km • {trip.status}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f3f4f6" },
  content: { padding: 16, paddingBottom: 30 },
  header: { marginBottom: 12 },
  title: { fontSize: 24, fontWeight: "700", color: "#0f172a" },
  subtitle: { marginTop: 4, color: "#475569" },
  card: { backgroundColor: "white", borderRadius: 12, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: "#e2e8f0" },
  cardTitle: { fontSize: 18, fontWeight: "700", marginBottom: 8, color: "#111827" },
  cardText: { color: "#475569", marginBottom: 6 },
  input: { borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9, marginBottom: 8, backgroundColor: "#fff" },
  button: { backgroundColor: "#2563eb", borderRadius: 8, alignItems: "center", paddingVertical: 11, marginTop: 4 },
  buttonStop: { backgroundColor: "#dc2626", borderRadius: 8, alignItems: "center", paddingVertical: 11, marginTop: 4 },
  emergencyButton: { backgroundColor: "#b91c1c", borderRadius: 8, alignItems: "center", paddingVertical: 10, marginTop: 6 },
  emergencyButtonText: { color: "white", fontWeight: "700" },
  buttonDisabled: { opacity: 0.7 },
  buttonText: { color: "white", fontWeight: "700" },
  tripRow: { borderTopWidth: 1, borderTopColor: "#e5e7eb", paddingTop: 8, marginTop: 8 },
  tripTitle: { fontWeight: "700", color: "#111827" },
  tripMeta: { color: "#64748b", fontSize: 12, marginTop: 2 }
});
