'use client';

import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { UserRole } from '@/types';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showChangeModal, setShowChangeModal] = useState(false);
  const [changeError, setChangeError] = useState('');
  const [changing, setChanging] = useState(false);
  const [changeForm, setChangeForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const { signIn } = useAuth();
  const router = useRouter();

  const resolveDestination = (role: UserRole) => {
    return role === UserRole.ADMIN ||
      role === UserRole.SUPER_ADMIN ||
      role === UserRole.MANAGER
      ? '/dashboard'
      : '/users';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const { user: authenticatedUser, mustChangePassword } = await signIn(email, password);
      if (mustChangePassword) {
        setChangeForm({
          currentPassword: password,
          newPassword: '',
          confirmPassword: '',
        });
        setShowChangeModal(true);
        return;
      }
      router.push(resolveDestination(authenticatedUser.role));
    } catch (err: any) {
      setError(err.message || 'Failed to sign in');
    } finally {
      setLoading(false);
    }
  };

  const handleChangePassword = async () => {
    setChangeError('');
    if (!changeForm.currentPassword || !changeForm.newPassword || !changeForm.confirmPassword) {
      setChangeError('Please fill in all fields.');
      return;
    }
    if (changeForm.newPassword !== changeForm.confirmPassword) {
      setChangeError('New password and confirmation do not match.');
      return;
    }

    setChanging(true);
    try {
      const response = await fetch('/api/auth/change-password', {
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
      setChangeError('');
      const { user: authenticatedUser, mustChangePassword } = await signIn(email, changeForm.newPassword);
      if (mustChangePassword) {
        setShowChangeModal(true);
        setChangeError('Please update your password before continuing.');
        return;
      }
      router.push(resolveDestination(authenticatedUser.role));
    } catch (err: any) {
      setChangeError(err.message || 'Failed to update password');
    } finally {
      setChanging(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center">
      <div className="bg-white p-8 rounded-lg shadow-md w-96">
        <h1 className="text-2xl font-bold mb-6 text-center text-blue-600">
          URSafe Safety Centre
        </h1>
        <form onSubmit={handleSubmit}>
          {error && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
              {error}
            </div>
          )}
          <div className="mb-4">
            <label className="block text-gray-700 text-sm font-bold mb-2">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
          <div className="mb-6">
            <label className="block text-gray-700 text-sm font-bold mb-2">
              Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                👁️
              </button>
            </div>
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:bg-gray-400"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
        <p className="mt-4 text-sm text-gray-600 text-center">
          Admins see everything. Managers see only their team.
        </p>
      </div>

      {showChangeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <h2 className="text-xl font-bold text-gray-900">Update Password</h2>
            <p className="mt-2 text-sm text-gray-600">
              Your temporary password needs to be updated before you continue.
            </p>
            {changeError && (
              <div className="mt-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {changeError}
              </div>
            )}
            <div className="mt-4 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Current password
                </label>
                <input
                  type="password"
                  value={changeForm.currentPassword}
                  onChange={(e) => setChangeForm({ ...changeForm, currentPassword: e.target.value })}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  New password
                </label>
                <input
                  type="password"
                  value={changeForm.newPassword}
                  onChange={(e) => setChangeForm({ ...changeForm, newPassword: e.target.value })}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Confirm new password
                </label>
                <input
                  type="password"
                  value={changeForm.confirmPassword}
                  onChange={(e) => setChangeForm({ ...changeForm, confirmPassword: e.target.value })}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowChangeModal(false);
                  setChangeError('');
                  setChangeForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
                }}
                className="flex-1 rounded-md border border-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-50"
                disabled={changing}
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleChangePassword}
                className="flex-1 rounded-md bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700 disabled:bg-gray-400"
                disabled={changing}
              >
                {changing ? 'Updating...' : 'Update Password'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
