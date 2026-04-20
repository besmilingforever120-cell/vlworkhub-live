import React, { useState } from "react";
import { Alert, SafeAreaView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useAuth } from "../contexts/AuthContext";

export default function LoginScreen() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!email || !password) {
      Alert.alert("Missing fields", "Enter email and password.");
      return;
    }
    setLoading(true);
    try {
      await signIn(email.trim(), password);
    } catch (error) {
      Alert.alert("Login failed", error instanceof Error ? error.message : "Unable to sign in");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.card}>
        <Text style={styles.title}>URSafe Mobile</Text>
        <Text style={styles.subtitle}>Sign in to start mobile safety tracking</Text>

        <TextInput
          style={styles.input}
          placeholder="Email"
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />
        <TextInput
          style={styles.input}
          placeholder="Password"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />

        <TouchableOpacity style={[styles.button, loading ? styles.buttonDisabled : null]} onPress={submit} disabled={loading}>
          <Text style={styles.buttonText}>{loading ? "Signing in..." : "Sign in"}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#f3f4f6", padding: 16 },
  card: { width: "100%", maxWidth: 420, backgroundColor: "white", borderRadius: 12, padding: 20, shadowColor: "#000", shadowOpacity: 0.1, shadowRadius: 6, elevation: 2 },
  title: { fontSize: 24, fontWeight: "700", color: "#0f172a" },
  subtitle: { marginTop: 6, marginBottom: 18, fontSize: 14, color: "#475569" },
  input: { borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 10, fontSize: 16 },
  button: { marginTop: 8, backgroundColor: "#2563eb", borderRadius: 10, alignItems: "center", paddingVertical: 12 },
  buttonDisabled: { opacity: 0.7 },
  buttonText: { color: "white", fontSize: 16, fontWeight: "700" }
});
