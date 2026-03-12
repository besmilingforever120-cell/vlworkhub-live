import React, { useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { API_URL } from '../lib/api';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showChangeModal, setShowChangeModal] = useState(false);
  const [changeForm, setChangeForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const { signIn, signUp } = useAuth();
  const lastNameInputRef = useRef<TextInput | null>(null);
  const emailInputRef = useRef<TextInput | null>(null);
  const passwordInputRef = useRef<TextInput | null>(null);

  const handleSubmit = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    if (isSignUp && (!firstName || !lastName)) {
      Alert.alert('Error', 'Please enter your name');
      return;
    }

    setLoading(true);
    try {
      if (isSignUp) {
        await signUp(email, password, firstName, lastName);
        Alert.alert('Success', 'Account created! Please check your email to verify.');
      } else {
        const result = await signIn(email, password);
        if (result.mustChangePassword) {
          setChangeForm({
            currentPassword: password,
            newPassword: '',
            confirmPassword: '',
          });
          setShowChangeModal(true);
        }
      }
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.container}
      >
        <View style={styles.card}>
          <Text style={styles.title}>URSafe</Text>
          <Text style={styles.subtitle}>{isSignUp ? 'Create your account' : 'Sign in to continue'}</Text>

          {isSignUp && (
            <>
              <TextInput
                style={styles.input}
                placeholder="First Name"
                value={firstName}
                onChangeText={setFirstName}
                autoCapitalize="words"
                autoComplete="name-given"
                textContentType="givenName"
                returnKeyType="next"
                editable={!loading}
                onSubmitEditing={() => lastNameInputRef.current?.focus()}
                accessibilityLabel="First name"
              />
              <TextInput
                ref={lastNameInputRef}
                style={styles.input}
                placeholder="Last Name"
                value={lastName}
                onChangeText={setLastName}
                autoCapitalize="words"
                autoComplete="name-family"
                textContentType="familyName"
                returnKeyType="next"
                editable={!loading}
                onSubmitEditing={() => emailInputRef.current?.focus()}
                accessibilityLabel="Last name"
              />
            </>
          )}

          <TextInput
            ref={emailInputRef}
            style={styles.input}
            placeholder="Email"
            placeholderTextColor="#9ca3af"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            textContentType="emailAddress"
            returnKeyType="next"
            editable={!loading}
            onSubmitEditing={() => passwordInputRef.current?.focus()}
            accessibilityLabel="Email address"
          />

          <View style={styles.passwordRow}>
            <TextInput
              ref={passwordInputRef}
              style={styles.passwordInput}
              placeholder="Password"
              placeholderTextColor="#9ca3af"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              autoComplete={isSignUp ? 'new-password' : 'password'}
              textContentType={isSignUp ? 'newPassword' : 'password'}
              returnKeyType="done"
              editable={!loading}
              onSubmitEditing={handleSubmit}
              accessibilityLabel="Password"
            />
            <TouchableOpacity
              onPress={() => setShowPassword((prev) => !prev)}
              style={styles.passwordToggle}
              accessibilityRole="button"
              accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
            >
              <Text style={styles.passwordToggleText}>{showPassword ? '🙈' : '👁️'}</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[styles.button, loading ? styles.buttonDisabled : null]}
            onPress={handleSubmit}
            disabled={!!loading}
            accessibilityRole="button"
            accessibilityLabel={isSignUp ? 'Create account' : 'Sign in'}
          >
            <Text style={styles.buttonText}>
              {loading ? 'Loading...' : isSignUp ? 'Sign Up' : 'Sign In'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setIsSignUp(!isSignUp)}
            disabled={!!loading}
            accessibilityRole="button"
            accessibilityLabel={isSignUp ? 'Switch to sign in' : 'Switch to sign up'}
          >
            <Text style={styles.switchText}>
              {isSignUp ? 'Already have an account? Sign In' : "Don't have an account? Sign Up"}
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      <Modal
        transparent
        visible={showChangeModal}
        animationType="fade"
        onRequestClose={() => setShowChangeModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Update Password</Text>
            <Text style={styles.modalSubtitle}>
              Your temporary password needs to be updated before you continue.
            </Text>

            <TextInput
              style={styles.input}
              placeholder="Current password"
              placeholderTextColor="#9ca3af"
              value={changeForm.currentPassword}
              onChangeText={(value) => setChangeForm({ ...changeForm, currentPassword: value })}
              secureTextEntry
              autoComplete="password"
              textContentType="password"
            />
            <TextInput
              style={styles.input}
              placeholder="New password"
              placeholderTextColor="#9ca3af"
              value={changeForm.newPassword}
              onChangeText={(value) => setChangeForm({ ...changeForm, newPassword: value })}
              secureTextEntry
              autoComplete="new-password"
              textContentType="newPassword"
            />
            <TextInput
              style={styles.input}
              placeholder="Confirm new password"
              placeholderTextColor="#9ca3af"
              value={changeForm.confirmPassword}
              onChangeText={(value) => setChangeForm({ ...changeForm, confirmPassword: value })}
              secureTextEntry
              autoComplete="new-password"
              textContentType="newPassword"
            />

            <TouchableOpacity
              style={[styles.button, loading ? styles.buttonDisabled : null]}
              onPress={async () => {
                if (!changeForm.currentPassword || !changeForm.newPassword || !changeForm.confirmPassword) {
                  Alert.alert('Error', 'Please fill in all fields');
                  return;
                }
                if (changeForm.newPassword !== changeForm.confirmPassword) {
                  Alert.alert('Error', 'New password and confirmation do not match');
                  return;
                }

                setLoading(true);
                try {
                  const response = await fetch(`${API_URL}/api/auth/change-password`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      email,
                      currentPassword: changeForm.currentPassword,
                      newPassword: changeForm.newPassword,
                    }),
                  });
                  if (!response.ok) {
                    const payload = await response.json();
                    throw new Error(payload.error || 'Failed to update password');
                  }
                  setShowChangeModal(false);
                  const result = await signIn(email, changeForm.newPassword);
                  if (result.mustChangePassword) {
                    setShowChangeModal(true);
                  }
                } catch (error: any) {
                  Alert.alert('Error', error.message);
                } finally {
                  setLoading(false);
                }
              }}
              disabled={!!loading}
              accessibilityRole="button"
              accessibilityLabel="Update password"
            >
              <Text style={styles.buttonText}>
                {loading ? 'Updating...' : 'Update Password'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setShowChangeModal(false)}
              disabled={!!loading}
              accessibilityRole="button"
              accessibilityLabel="Back to sign in"
            >
              <Text style={styles.switchText}>Back to sign in</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
    backgroundColor: '#f5f5f5',
  },
  container: {
    flex: 1,
    justifyContent: 'center',
  },
  card: {
    backgroundColor: 'white',
    padding: 20,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 10,
    color: '#2563eb',
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 30,
    color: '#666',
  },
  input: {
    backgroundColor: '#f9fafb',
    padding: 15,
    borderRadius: 8,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: '#ddd',
    color: '#111827',
  },
  passwordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    backgroundColor: '#f9fafb',
  },
  passwordInput: {
    flex: 1,
    padding: 15,
    color: '#111827',
  },
  passwordToggle: {
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  passwordToggleText: {
    fontSize: 18,
  },
  button: {
    backgroundColor: '#2563eb',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 10,
  },
  buttonDisabled: {
    backgroundColor: '#9ca3af',
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  switchText: {
    color: '#2563eb',
    textAlign: 'center',
    marginTop: 20,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#111827',
  },
  modalSubtitle: {
    marginTop: 8,
    marginBottom: 16,
    color: '#6b7280',
  },
});
