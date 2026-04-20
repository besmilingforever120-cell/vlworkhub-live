import React from "react";
import { ActivityIndicator, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { TripProvider } from "./contexts/TripContext";
import MainNavigator from "./navigation/MainNavigator";
import LoginScreen from "./screens/LoginScreen";

function AppContent() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  return user ? <MainNavigator /> : <LoginScreen />;
}

export default function App() {
  return (
    <AuthProvider>
      <TripProvider>
        <AppContent />
        <StatusBar style="auto" />
      </TripProvider>
    </AuthProvider>
  );
}
