import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { TripProvider } from './contexts/TripContext';
import LoginScreen from './screens/LoginScreen';
import HomeScreen from './screens/HomeScreen';
import MainNavigator from './navigation/MainNavigator';
import { ActivityIndicator, View, StyleSheet } from 'react-native';

function AppContent() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
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

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
