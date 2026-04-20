import React from "react";
import { Alert, SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { API_URL } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";

export default function ProfileScreen() {
  const { user, signOut } = useAuth();

  const onSignOut = async () => {
    try {
      await signOut();
    } catch (error) {
      Alert.alert("Sign out failed", error instanceof Error ? error.message : "Unknown error");
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>Profile</Text>
        <Text style={styles.label}>Name</Text>
        <Text style={styles.value}>{user?.fullName || "-"}</Text>
        <Text style={styles.label}>Email</Text>
        <Text style={styles.value}>{user?.email || "-"}</Text>
        <Text style={styles.label}>API</Text>
        <Text style={styles.value}>{API_URL}</Text>

        <TouchableOpacity style={styles.button} onPress={onSignOut}>
          <Text style={styles.buttonText}>Sign out</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f3f4f6", padding: 16 },
  card: { backgroundColor: "white", borderRadius: 12, borderWidth: 1, borderColor: "#e2e8f0", padding: 16 },
  title: { fontSize: 22, fontWeight: "700", marginBottom: 12, color: "#0f172a" },
  label: { marginTop: 10, fontSize: 12, textTransform: "uppercase", color: "#64748b", fontWeight: "700" },
  value: { marginTop: 2, color: "#111827" },
  button: { marginTop: 20, backgroundColor: "#dc2626", borderRadius: 8, alignItems: "center", paddingVertical: 11 },
  buttonText: { color: "white", fontWeight: "700" }
});
