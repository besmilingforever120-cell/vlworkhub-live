'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import AppHeader, { HeaderActionButton } from '@/components/AppHeader';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { User, UserRole } from '@/types';

export default function UsersPage() {
  const { user, loading: authLoading, signOut } = useAuth();
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [resetPassword, setResetPassword] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'active' | 'archived' | 'all'>('active');
  const [formData, setFormData] = useState({
    email: '',
    firstName: '',
    lastName: '',
    role: UserRole.EMPLOYEE,
    department: '',
    managerId: '',
    isActive: true,
    password: '',
    generatePassword: true,
  });
  const [submitting, setSubmitting] = useState(false);
  const { theme } = useTheme();
  const isDarkTheme = theme === 'dark';
  const isSuperAdmin = user?.role === UserRole.SUPER_ADMIN;
  const isAdminUser = user?.role === UserRole.ADMIN;
  const isManagerUser = user?.role === UserRole.MANAGER;
  const hasSuperAdmin = users.some((candidate) => candidate.role === UserRole.SUPER_ADMIN);
  const isAdminLike = isAdminUser || isSuperAdmin;
  const canModifyUsers = isSuperAdmin || (!hasSuperAdmin && isAdminUser);
  const canAssignSuperAdminRole = isSuperAdmin || (!hasSuperAdmin && isAdminUser);
  const canToggleActive = isSuperAdmin;
  const canViewArchived = isSuperAdmin;
  const roleLabel = isSuperAdmin ? 'Super Admin' : isAdminUser ? 'Admin' : isManagerUser ? 'Manager' : 'User';
  const headerDescription = isSuperAdmin
    ? 'Manage users, access, and system roles across the organization.'
    : isAdminUser
    ? 'Review all users and assignments across the organization.'
    : 'Review the employees assigned directly to you.';

  const styles = useMemo(() => {
    const pageBg = isDarkTheme ? 'bg-slate-950 text-slate-100' : 'bg-gray-100 text-gray-900';
    const subtext = isDarkTheme ? 'text-slate-300' : 'text-gray-500';
    const card = isDarkTheme ? 'rounded-lg border border-white/10 bg-slate-900/70 backdrop-blur' : 'bg-white shadow rounded-lg';
    const tableCard = isDarkTheme ? 'rounded-lg border border-white/10 bg-slate-950/50' : 'bg-white shadow rounded-lg';
    const tableHeadBg = isDarkTheme ? 'bg-slate-900/60' : 'bg-gray-50';
    const tableHeadText = isDarkTheme ? 'text-slate-300' : 'text-gray-500';
    const divider = isDarkTheme ? 'divide-white/10' : 'divide-gray-200';
    const inputBase = 'w-full rounded-md px-4 py-2 focus:ring-2 focus:ring-emerald-400';
    const input = isDarkTheme
      ? `${inputBase} border border-white/20 bg-slate-900/60 text-slate-100 placeholder-slate-400`
      : `${inputBase} border border-gray-300 bg-white text-gray-900 placeholder-gray-500`;
    const select = `${input} appearance-none`;
    const label = isDarkTheme ? 'text-slate-200' : 'text-gray-700';
    const overlay = 'fixed inset-0 bg-black/70 backdrop-blur flex items-center justify-center p-4 z-50';
    const modalCard = isDarkTheme ? 'bg-slate-950 text-slate-100 border border-white/10' : 'bg-white text-gray-900';
    const cancelBtn = isDarkTheme
      ? 'bg-slate-700 text-white hover:bg-slate-600'
      : 'bg-gray-200 text-gray-700 hover:bg-gray-300';
    const modalCancelBtn = isDarkTheme
      ? 'bg-slate-800 text-white hover:bg-slate-700'
      : 'bg-gray-600 text-white hover:bg-gray-700';
    const infoPanel = isDarkTheme
      ? 'rounded-lg border border-blue-400/30 bg-blue-500/10 text-blue-100'
      : 'bg-blue-50 border border-blue-200 text-blue-800 rounded-lg';

    return {
      pageBg,
      subtext,
      card,
      tableCard,
      tableHeadBg,
      tableHeadText,
      divider,
      input,
      select,
      label,
      overlay,
      modalCard,
      cancelBtn,
      modalCancelBtn,
      infoPanel,
    };
  }, [isDarkTheme]);

  const managerOptions = useMemo(() => {
    return users
      .filter((candidate) =>
        candidate.isActive &&
        (candidate.role === UserRole.MANAGER ||
          candidate.role === UserRole.ADMIN ||
          candidate.role === UserRole.SUPER_ADMIN)
      )
      .sort((a, b) => {
        const nameA = `${a.firstName} ${a.lastName}`.toLowerCase();
        const nameB = `${b.firstName} ${b.lastName}`.toLowerCase();
        return nameA.localeCompare(nameB);
      });
  }, [users]);

  const isArchivedUser = (candidate: User) => {
    return !candidate.isActive && candidate.email.includes('.archived.');
  };

  const getDisplayEmail = (candidate: User) => {
    if (!isArchivedUser(candidate)) {
      return candidate.email;
    }
    const marker = '.archived.';
    const index = candidate.email.indexOf(marker);
    return index > 0 ? candidate.email.slice(0, index) : candidate.email;
  };

  const visibleUsers = useMemo(() => {
    if (!user) {
      return [] as User[];
    }

    if (isSuperAdmin) {
      if (statusFilter === 'active') {
        return users.filter((candidate) => candidate.isActive);
      }
      if (statusFilter === 'archived') {
        return users.filter((candidate) => isArchivedUser(candidate));
      }
      return users;
    }

    if (isAdminUser) {
      return users.filter((candidate) => candidate.isActive);
    }

    return users.filter(
      (candidate) =>
        candidate.isActive &&
        candidate.role === UserRole.EMPLOYEE &&
        candidate.managerId === user.id,
    );
  }, [user, users, isAdminUser, isSuperAdmin, statusFilter]);

  useEffect(() => {
    if (authLoading) return;

    if (!user || (!isAdminLike && !isManagerUser)) {
      router.push('/login');
      return;
    }

    fetchUsers();
  }, [user, authLoading, isAdminLike, isManagerUser]);

  useEffect(() => {
    if (canModifyUsers) {
      return;
    }
    setShowAddForm(false);
    setShowEditModal(false);
    setEditingUser(null);
  }, [canModifyUsers]);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/users');
      if (!response.ok) throw new Error('Failed to fetch users');
      const data = await response.json();
      setUsers(data as User[]);
    } catch (error) {
      console.error('Error fetching users:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const response = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create user');
      }

      alert('User created successfully! Email notification sent.');
      setShowAddForm(false);
      setFormData({
        email: '',
        firstName: '',
        lastName: '',
        role: UserRole.EMPLOYEE,
        department: '',
        managerId: '',
        isActive: true,
        password: '',
        generatePassword: true,
      });
      fetchUsers();
    } catch (error: any) {
      alert(error.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    router.push('/login');
  };

  const handleEditUser = (selectedUser: User) => {
    setEditingUser(selectedUser);
    setResetPassword(false);
    setFormData({
      email: selectedUser.email,
      firstName: selectedUser.firstName,
      lastName: selectedUser.lastName,
      role: selectedUser.role,
      department: selectedUser.department || '',
      managerId: selectedUser.managerId || '',
      isActive: selectedUser.isActive ?? true,
      password: '',
      generatePassword: false,
    });
    setShowEditModal(true);
  };

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;

    setSubmitting(true);
    try {
      const payload = resetPassword
        ? formData
        : { ...formData, password: '', generatePassword: false };
      const response = await fetch(`/api/users/${editingUser.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update user');
      }

      alert('User updated successfully!');
      setShowEditModal(false);
      setEditingUser(null);
      setFormData({
        email: '',
        firstName: '',
        lastName: '',
        role: UserRole.EMPLOYEE,
        department: '',
        managerId: '',
        isActive: true,
        password: '',
        generatePassword: true,
      });
      fetchUsers();
    } catch (error: any) {
      alert(error.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteUser = async (userId: string, userName: string) => {
    if (!confirm(`Archive ${userName}? This will preserve history but remove login access.`)) {
      return;
    }

    try {
      const response = await fetch(`/api/users/${userId}`, {
        method: 'DELETE',
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to delete user');
      }

      alert(payload.message || 'User deleted successfully!');
      fetchUsers();
    } catch (error: any) {
      alert(error.message);
    }
  };

  const handleRestoreUser = async (userId: string, userName: string) => {
    if (!confirm(`Rehire ${userName}? This will reactivate their account.`)) {
      return;
    }

    try {
      const response = await fetch(`/api/users/${userId}/restore`, {
        method: 'POST',
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to restore user');
      }
      alert(payload.message || 'User reactivated successfully!');
      fetchUsers();
    } catch (error: any) {
      alert(error.message);
    }
  };

  const handlePurgeUser = async (userId: string, userName: string) => {
    if (!confirm(`Permanently delete ${userName} and all related data? This cannot be undone.`)) {
      return;
    }

    try {
      const response = await fetch(`/api/users/${userId}/purge`, {
        method: 'DELETE',
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to delete user');
      }
      alert(payload.message || 'User deleted permanently.');
      fetchUsers();
    } catch (error: any) {
      alert(error.message);
    }
  };

  const handleViewTrips = (userId: string) => {
    router.push(`/trips?userId=${encodeURIComponent(userId)}`);
  };

  const handleViewShiftHistory = (userId: string) => {
    router.push(`/safety-monitoring/history?userId=${encodeURIComponent(userId)}`);
  };

  if (authLoading || loading) {
    return (
      <div className={`flex min-h-screen items-center justify-center ${styles.pageBg}`}>
        <div className="text-xl">Loading...</div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen ${styles.pageBg}`}>
      <AppHeader
        eyebrow={roleLabel}
        title="Users Management"
        subtitle={headerDescription}
        accent="slate"
        actions={(
          <>
            <HeaderActionButton
              label="Refresh"
              icon="🔄"
              tone="primary"
              onClick={fetchUsers}
            />
            <HeaderActionButton
              label="Sign Out"
              icon="🚪"
              tone="danger"
              onClick={handleSignOut}
            />
          </>
        )}
        meta={`Signed in as ${user?.firstName ?? ''} ${user?.lastName ?? ''}`}
      />

      <main className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
        {canModifyUsers && (
          <div className="mb-6">
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className="bg-blue-600 text-white px-6 py-3 rounded-md hover:bg-blue-700 font-semibold"
            >
              {showAddForm ? '− Cancel' : '+ Add New User'}
            </button>
          </div>
        )}

        {canModifyUsers && showAddForm && (
          <div className={`${styles.card} mb-8 p-6`}>
            <h2 className="text-xl font-bold mb-6">Create New User</h2>
            <form onSubmit={handleAddUser} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={`mb-2 block text-sm font-medium ${styles.label}`}>First Name *</label>
                  <input
                    type="text"
                    required
                    value={formData.firstName}
                    onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                    className={styles.input}
                  />
                </div>

                <div>
                  <label className={`mb-2 block text-sm font-medium ${styles.label}`}>Last Name *</label>
                  <input
                    type="text"
                    required
                    value={formData.lastName}
                    onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                    className={styles.input}
                  />
                </div>

                <div>
                  <label className={`mb-2 block text-sm font-medium ${styles.label}`}>Email *</label>
                  <input
                    type="email"
                    required
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className={styles.input}
                  />
                </div>

                <div>
                  <label className={`mb-2 block text-sm font-medium ${styles.label}`}>Temporary Password</label>
                  <input
                    type="text"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value, generatePassword: false })}
                    className={styles.input}
                    placeholder="Leave blank to auto-generate"
                  />
                  <label className={`mt-2 flex items-center gap-2 text-xs ${styles.subtext}`}>
                    <input
                      type="checkbox"
                      checked={formData.generatePassword}
                      onChange={(e) => setFormData({ ...formData, generatePassword: e.target.checked })}
                    />
                    Auto-generate a temporary password
                  </label>
                </div>

                <div>
                  <label className={`mb-2 block text-sm font-medium ${styles.label}`}>Role *</label>
                  <select
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value as UserRole })}
                    className={styles.select}
                  >
                    {canAssignSuperAdminRole && (
                      <option value={UserRole.SUPER_ADMIN}>Super Admin</option>
                    )}
                    <option value={UserRole.EMPLOYEE}>Employee</option>
                    <option value={UserRole.MANAGER}>Manager</option>
                    <option value={UserRole.ADMIN}>Admin</option>
                  </select>
                </div>

                <div>
                  <label className={`mb-2 block text-sm font-medium ${styles.label}`}>Department</label>
                  <input
                    type="text"
                    value={formData.department}
                    onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                    className={styles.input}
                    placeholder="e.g., Sales, IT, HR"
                  />
                </div>

                {formData.role === UserRole.EMPLOYEE && (
                  <div>
                    <label className={`mb-2 block text-sm font-medium ${styles.label}`}>
                      Manager / Admin
                    </label>
                    <select
                      value={formData.managerId}
                      onChange={(e) => setFormData({ ...formData, managerId: e.target.value })}
                      className={styles.select}
                    >
                      <option value="">No Manager</option>
                      {managerOptions.map((manager) => (
                        <option key={manager.id} value={manager.id}>
                          {manager.firstName} {manager.lastName} ({manager.role})
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <div className={`p-4 ${styles.infoPanel}`}>
                <p className="text-sm">
                  <strong>Note:</strong> A temporary password will be auto-generated and sent to the user via email, and they will be prompted to update it on first sign-in.
                  {!formData.generatePassword && formData.password
                    ? ' The password above will be sent instead of a generated one.'
                    : ''}
                  {formData.role === UserRole.EMPLOYEE && ' Employees can only access the mobile app.'}
                  {formData.role === UserRole.MANAGER && ' Managers can approve trips for their department employees.'}
                  {formData.role === UserRole.ADMIN && ' Admins can review users, trips, and safety activity.'}
                  {formData.role === UserRole.SUPER_ADMIN && ' Super admins have full access to user management and system settings.'}
                </p>
              </div>

              <div className="flex gap-4">
                <button
                  type="submit"
                  disabled={submitting}
                  className="bg-green-600 text-white px-6 py-2 rounded-md hover:bg-green-700 disabled:bg-gray-400"
                >
                  {submitting ? 'Creating...' : 'Create User'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className={`px-6 py-2 rounded-md ${styles.cancelBtn}`}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        <div className={`${styles.tableCard} overflow-hidden`}>
          <div className={`flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-b ${isDarkTheme ? 'border-white/10' : 'border-gray-100'}`}>
            <h2 className="text-xl font-bold">All Users</h2>
            {canViewArchived && (
              <div className="flex items-center gap-2 text-sm">
                <span className={styles.subtext}>Showing</span>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as 'active' | 'archived' | 'all')}
                  className={styles.select}
                >
                  <option value="active">Active</option>
                  <option value="archived">Archived</option>
                  <option value="all">All</option>
                </select>
              </div>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className={`min-w-full divide-y ${styles.divider}`}>
              <thead className={styles.tableHeadBg}>
                <tr>
                  <th className={`px-6 py-3 text-left text-xs font-medium uppercase ${styles.tableHeadText}`}>Name</th>
                  <th className={`px-6 py-3 text-left text-xs font-medium uppercase ${styles.tableHeadText}`}>Email</th>
                  <th className={`px-6 py-3 text-left text-xs font-medium uppercase ${styles.tableHeadText}`}>Role</th>
                  <th className={`px-6 py-3 text-left text-xs font-medium uppercase ${styles.tableHeadText}`}>Department</th>
                  <th className={`px-6 py-3 text-left text-xs font-medium uppercase ${styles.tableHeadText}`}>Status</th>
                  {canModifyUsers && (
                    <th className={`px-6 py-3 text-left text-xs font-medium uppercase ${styles.tableHeadText}`}>
                      Actions
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className={`divide-y ${styles.divider} ${isDarkTheme ? 'bg-slate-950/10' : 'bg-white'}`}>
                {visibleUsers.length === 0 && (
                  <tr>
                    <td
                      className="px-6 py-6 text-center text-sm text-gray-500"
                      colSpan={canModifyUsers ? 6 : 5}
                    >
                      {isManagerUser
                        ? 'You do not have any assigned employees yet.'
                        : 'No users available.'}
                    </td>
                  </tr>
                )}
                {visibleUsers.map((mappedUser) => {
                  const archived = isArchivedUser(mappedUser);
                  const statusLabel = archived ? 'Archived' : mappedUser.isActive ? 'Active' : 'Disabled';
                  const statusClass = archived
                    ? 'bg-slate-200 text-slate-800'
                    : mappedUser.isActive
                      ? 'bg-green-100 text-green-800'
                      : 'bg-red-100 text-red-800';
                  return (
                  <tr key={mappedUser.id || mappedUser.email}>
                    <td className="px-6 py-4 whitespace-nowrap">{mappedUser.firstName} {mappedUser.lastName}</td>
                    <td className="px-6 py-4 whitespace-nowrap" title={mappedUser.email}>
                      {getDisplayEmail(mappedUser)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs rounded-full ${
                        mappedUser.role === 'super_admin' ? 'bg-indigo-100 text-indigo-800' :
                        mappedUser.role === 'admin' ? 'bg-purple-100 text-purple-800' : 
                        mappedUser.role === 'manager' ? 'bg-blue-100 text-blue-800' :
                        'bg-green-100 text-green-800'
                      }`}>
                        {mappedUser.role === UserRole.SUPER_ADMIN ? 'super admin' : mappedUser.role}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">{mappedUser.department || '-'}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs rounded-full ${statusClass}`}>
                        {statusLabel}
                      </span>
                    </td>
                    {canModifyUsers && (
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex gap-2">
                          {!archived && (
                            <button
                              onClick={() => handleEditUser(mappedUser)}
                              className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700"
                            >
                              Edit
                            </button>
                          )}
                          {archived ? (
                            <>
                              <button
                                onClick={() => handleViewTrips(mappedUser.id)}
                                className="bg-slate-600 text-white px-3 py-1 rounded text-sm hover:bg-slate-700"
                              >
                                Trips
                              </button>
                              <button
                                onClick={() => handleViewShiftHistory(mappedUser.id)}
                                className="bg-slate-600 text-white px-3 py-1 rounded text-sm hover:bg-slate-700"
                              >
                                Shifts
                              </button>
                              <button
                                onClick={() => router.push(`/safety-monitoring?userId=${encodeURIComponent(mappedUser.id)}`)}
                                className="bg-slate-600 text-white px-3 py-1 rounded text-sm hover:bg-slate-700"
                              >
                                Emergencies
                              </button>
                              <button
                                onClick={() => handleRestoreUser(mappedUser.id, `${mappedUser.firstName} ${mappedUser.lastName}`)}
                                className="bg-emerald-600 text-white px-3 py-1 rounded text-sm hover:bg-emerald-700"
                              >
                                Rehire
                              </button>
                              <button
                                onClick={() => handlePurgeUser(mappedUser.id, `${mappedUser.firstName} ${mappedUser.lastName}`)}
                                className="bg-rose-700 text-white px-3 py-1 rounded text-sm hover:bg-rose-800"
                              >
                                Delete
                              </button>
                            </>
                          ) : (
                            <button
                              onClick={() => handleDeleteUser(mappedUser.id, `${mappedUser.firstName} ${mappedUser.lastName}`)}
                              className="bg-rose-600 text-white px-3 py-1 rounded text-sm hover:bg-rose-700"
                            >
                              Archive
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {canModifyUsers && showEditModal && editingUser && (
          <div className={styles.overlay}>
            <div className={`${styles.modalCard} rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto`}>
              <div className="p-6">
                <h2 className="text-xl font-bold mb-6">Edit User</h2>
                <form onSubmit={handleUpdateUser} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className={`mb-2 block text-sm font-medium ${styles.label}`}>
                        First Name *
                      </label>
                      <input
                        type="text"
                        required
                        value={formData.firstName}
                        onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                        className={styles.input}
                      />
                    </div>

                    <div>
                      <label className={`mb-2 block text-sm font-medium ${styles.label}`}>
                        Last Name *
                      </label>
                      <input
                        type="text"
                        required
                        value={formData.lastName}
                        onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                        className={styles.input}
                      />
                    </div>

                    <div>
                      <label className={`mb-2 block text-sm font-medium ${styles.label}`}>
                        Email *
                      </label>
                      <input
                        type="email"
                        required
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        className={styles.input}
                      />
                    </div>

                    <div>
                      <label className={`mb-2 block text-sm font-medium ${styles.label}`}>
                        Reset Password
                      </label>
                      <label className={`flex items-center gap-2 text-sm ${styles.subtext}`}>
                        <input
                          type="checkbox"
                          checked={resetPassword}
                          onChange={(e) => {
                            setResetPassword(e.target.checked);
                            if (!e.target.checked) {
                              setFormData({ ...formData, password: '', generatePassword: false });
                            }
                          }}
                        />
                        Generate or set a new password
                      </label>
                      {resetPassword && (
                        <div className="mt-3 space-y-2">
                          <input
                            type="text"
                            value={formData.password}
                            onChange={(e) => setFormData({ ...formData, password: e.target.value, generatePassword: false })}
                            className={styles.input}
                            placeholder="Leave blank to auto-generate"
                          />
                          <label className={`flex items-center gap-2 text-xs ${styles.subtext}`}>
                            <input
                              type="checkbox"
                              checked={formData.generatePassword}
                              onChange={(e) => setFormData({ ...formData, generatePassword: e.target.checked })}
                            />
                            Auto-generate a new password
                          </label>
                        </div>
                      )}
                    </div>

                    <div>
                      <label className={`mb-2 block text-sm font-medium ${styles.label}`}>
                        Role *
                      </label>
                      <select
                        value={formData.role}
                        onChange={(e) => setFormData({ ...formData, role: e.target.value as UserRole })}
                        className={styles.select}
                      >
                        {canAssignSuperAdminRole && (
                          <option value={UserRole.SUPER_ADMIN}>Super Admin</option>
                        )}
                        <option value={UserRole.EMPLOYEE}>Employee</option>
                        <option value={UserRole.MANAGER}>Manager</option>
                        <option value={UserRole.ADMIN}>Admin</option>
                      </select>
                    </div>

                    {canToggleActive && (
                      <div>
                        <label className={`mb-2 block text-sm font-medium ${styles.label}`}>
                          Disable User
                        </label>
                        <label className={`flex items-center gap-2 text-sm ${styles.subtext}`}>
                          <input
                            type="checkbox"
                            checked={!formData.isActive}
                            onChange={(e) => setFormData({ ...formData, isActive: !e.target.checked })}
                          />
                          Prevent this user from logging in to web or mobile apps
                        </label>
                      </div>
                    )}

                    <div>
                      <label className={`mb-2 block text-sm font-medium ${styles.label}`}>
                        Department
                      </label>
                      <input
                        type="text"
                        value={formData.department}
                        onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                        className={styles.input}
                        placeholder="e.g., Sales, IT, HR"
                      />
                    </div>

                    {formData.role === UserRole.EMPLOYEE && (
                      <div>
                        <label className={`mb-2 block text-sm font-medium ${styles.label}`}>
                          Manager / Admin
                        </label>
                        <select
                          value={formData.managerId}
                          onChange={(e) => setFormData({ ...formData, managerId: e.target.value })}
                          className={styles.select}
                        >
                          <option value="">No Manager</option>
                          {managerOptions.map((manager) => (
                            <option key={manager.id} value={manager.id}>
                              {manager.firstName} {manager.lastName} ({manager.role})
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>

                  <div className="flex gap-4 pt-4">
                    <button
                      type="submit"
                      disabled={submitting}
                      className="bg-green-600 text-white px-6 py-2 rounded-md hover:bg-green-700 disabled:bg-gray-400"
                    >
                      {submitting ? 'Updating...' : 'Update User'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowEditModal(false);
                        setEditingUser(null);
                        setResetPassword(false);
                        setFormData({
                          email: '',
                          firstName: '',
                          lastName: '',
                          role: UserRole.EMPLOYEE,
                          department: '',
                          managerId: '',
                          password: '',
                          generatePassword: true,
                        });
                      }}
                      className={`px-6 py-2 rounded-md ${styles.modalCancelBtn}`}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
