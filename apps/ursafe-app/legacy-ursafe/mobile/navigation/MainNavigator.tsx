import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { NavigationContainer } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import HomeScreen from '../screens/HomeScreen';
import SafetyScreen from '../app/(tabs)/safety';
import ProfileScreen from '../screens/ProfileScreen';
import SosScreen from '../screens/SosScreen';
import { useAuth } from '../contexts/AuthContext';
import { UserRole } from '../types';

const Tab = createBottomTabNavigator();

export default function MainNavigator() {
  const { user } = useAuth();
  const roleLabel = user?.role ? user.role.toString().toLowerCase() : '';
  const showSosTab = roleLabel === UserRole.ADMIN || roleLabel === UserRole.MANAGER;

  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          tabBarIcon: ({ color, size, focused }) => {
            let iconName: keyof typeof Ionicons.glyphMap;
            switch (route.name) {
              case 'Trips':
                iconName = focused ? 'car' : 'car-outline';
                break;
              case 'Safety':
                iconName = focused ? 'shield-checkmark' : 'shield-checkmark-outline';
                break;
              case 'SOS':
                iconName = focused ? 'alert' : 'alert-circle-outline';
                break;
              case 'Profile':
                iconName = focused ? 'person-circle' : 'person-circle-outline';
                break;
              default:
                iconName = 'ellipse';
            }
            return <Ionicons name={iconName} size={size} color={color} />;
          },
          tabBarActiveTintColor: '#2563eb',
          tabBarInactiveTintColor: '#9ca3af',
          tabBarLabelStyle: { fontSize: 12 },
        })}
      >
        <Tab.Screen
          name="Trips"
          component={HomeScreen}
        />
        <Tab.Screen
          name="Safety"
          component={SafetyScreen}
        />
        {showSosTab && (
          <Tab.Screen
            name="SOS"
            component={SosScreen}
          />
        )}
        <Tab.Screen
          name="Profile"
          component={ProfileScreen}
        />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
