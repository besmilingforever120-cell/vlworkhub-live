'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import AppHeader, { HeaderActionButton, HeaderToggleButton } from '@/components/AppHeader';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { User, EmergencyAlert, Shift, UserRole } from '@/types';

interface EmergencyResolution {
  resolvedAt: string;
  resolvedBy: string;
  resolution: string;
  employeeSafe: 'yes' | 'no' | 'unknown';
  canResumeWork: 'yes' | 'no' | 'requires_medical' | 'pending_investigation';
  actionsTaken: string;
  followUpRequired: boolean;
  followUpNotes?: string;
}

export default function SafetyMonitoringPage() {
  const { user, loading: authLoading, signOut } = useAuth();
  const { theme } = useTheme();
  const router = useRouter();
  const searchParams = useSearchParams();
  const userIdFilter = searchParams.get('userId');
  const [employees, setEmployees] = useState<User[]>([]);
  const [emergencies, setEmergencies] = useState<EmergencyAlert[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [expandedEmployee, setExpandedEmployee] = useState<string | null>(null);
  const [resolvingEmergency, setResolvingEmergency] = useState<string | null>(null);
  const [resolutionForm, setResolutionForm] = useState<EmergencyResolution>({
    resolvedAt: new Date().toISOString(),
    resolvedBy: '',
    resolution: '',
    employeeSafe: 'unknown',
    canResumeWork: 'pending_investigation',
    actionsTaken: '',
    followUpRequired: false,
    followUpNotes: '',
  });
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const isDarkTheme = theme === 'dark';
  const isSuperAdmin = user?.role === UserRole.SUPER_ADMIN;
  const isAdmin = user?.role === UserRole.ADMIN || isSuperAdmin;
  const isManager = user?.role === UserRole.MANAGER;
  const includeArchived = isSuperAdmin && Boolean(userIdFilter);
  const allUsersLabel = isAdmin ? 'All Users' : 'All Employees';
  const modalCardClass = isDarkTheme
    ? 'bg-slate-950/95 text-slate-100 border border-white/10'
    : 'bg-white text-slate-900 shadow-xl';
  const labelClass = isDarkTheme ? 'text-slate-200' : 'text-gray-700';
  const controlBaseClass = 'w-full rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-400';
  const textControlClass = `${controlBaseClass} ${
    isDarkTheme
      ? 'border border-white/20 bg-slate-900/60 text-slate-100 placeholder-slate-400'
      : 'border border-gray-300 bg-white text-gray-900 placeholder-gray-500'
  }`;
  const selectControlClass = `${textControlClass} appearance-none`;
  const checkboxClass = isDarkTheme
    ? 'rounded border-white/30 bg-slate-900/60 text-emerald-400 focus:ring-emerald-500'
    : 'rounded border-gray-300 text-blue-600 focus:ring-blue-500';
  const modalButtonSecondary = isDarkTheme
    ? 'bg-slate-700 text-white hover:bg-slate-600'
    : 'bg-gray-600 text-white hover:bg-gray-700';

  useEffect(() => {
    if (!authLoading) {
      if (!user || (!isAdmin && !isManager)) {
        router.push('/login');
      } else {
        fetchData();
      }
    }
  }, [user, authLoading, isAdmin, isManager, userIdFilter]);

  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      fetchData();
    }, 30000); // Refresh every 30 seconds

    return () => clearInterval(interval);
  }, [autoRefresh, userIdFilter]);

  const fetchData = async () => {
    try {
      const [usersRes, emergenciesRes, shiftsRes] = await Promise.all([
        fetch('/api/users'),
        fetch('/api/emergencies'),
        fetch('/api/shifts'),
      ]);

      if (!usersRes.ok || !emergenciesRes.ok || !shiftsRes.ok) {
        throw new Error('Failed to fetch data');
      }

      const usersData = await usersRes.json() as User[];
      const emergenciesData = await emergenciesRes.json() as EmergencyAlert[];
      const shiftsData = await shiftsRes.json() as Shift[];

      const visibleUsers = usersData
        .filter((entry) => {
          if (!isAdmin && entry.role !== UserRole.EMPLOYEE) {
            return false;
          }
          if (includeArchived && userIdFilter) {
            return entry.id === userIdFilter;
          }
          return entry.isActive;
        });
      const visibleUserIds = new Set(visibleUsers.map((entry) => entry.id));

      setEmployees(visibleUsers);
      setEmergencies(emergenciesData.filter((entry) => visibleUserIds.has(entry.userId)));
      setShifts(shiftsData.filter((entry) => visibleUserIds.has(entry.userId)));
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getEmployeeEmergencies = (employeeId: string) => {
    return emergencies.filter(e => e.userId === employeeId);
  };

  const getUnresolvedEmergencies = (employeeId: string) => {
    return emergencies.filter(e => e.userId === employeeId && !e.resolvedAt);
  };

  const getActiveShift = (employeeId: string) => {
    return shifts.find(s => s.userId === employeeId && s.status === 'active');
  };

  const handleResolveEmergency = async (emergencyId: string) => {
    try {
      const response = await fetch(`/api/emergencies/${emergencyId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...resolutionForm,
          resolvedBy: user?.id,
          resolvedAt: new Date().toISOString(),
        }),
      });

      if (response.ok) {
        setResolvingEmergency(null);
        setResolutionForm({
          resolvedAt: new Date().toISOString(),
          resolvedBy: '',
          resolution: '',
          employeeSafe: 'unknown',
          canResumeWork: 'pending_investigation',
          actionsTaken: '',
          followUpRequired: false,
          followUpNotes: '',
        });
        await fetchData();
      } else {
        alert('Failed to resolve emergency. Please try again.');
      }
    } catch (error) {
      console.error('Error resolving emergency:', error);
      alert('An error occurred. Please try again.');
    }
  };

  const handleSignOut = async () => {
    await signOut();
    router.push('/login');
  };

  const getEmployeeStatus = (employee: User) => {
    const unresolvedCount = getUnresolvedEmergencies(employee.id).length;
    const activeShift = getActiveShift(employee.id);
    
    if (unresolvedCount > 0) return { status: 'critical', label: 'CRITICAL', color: 'red' };
    if (activeShift) return { status: 'active', label: 'ON SHIFT', color: 'green' };
    return { status: 'safe', label: 'SAFE', color: 'gray' };
  };

  const renderEmployeeCard = (employee: User, isCritical: boolean) => {
    const employeeEmergencies = getEmployeeEmergencies(employee.id);
    const unresolvedEmergencies = getUnresolvedEmergencies(employee.id);
    const activeShift = getActiveShift(employee.id);
    const isExpanded = expandedEmployee === employee.id;
    const statusInfo = getEmployeeStatus(employee);

    const currentShiftCardClass = isDarkTheme
      ? 'mb-6 rounded-lg border border-emerald-400/40 bg-emerald-950/40 p-4'
      : 'mb-6 rounded-lg border border-green-300 bg-green-50 p-4';
    const currentShiftHeadingClass = isDarkTheme ? 'text-emerald-200' : 'text-green-900';
    const currentShiftTextClass = isDarkTheme ? 'text-emerald-50' : 'text-green-900';
    const expandedPanelClass = isDarkTheme
      ? 'border-t-2 border-white/10 bg-slate-950/70 p-6 text-slate-100'
      : 'border-t-2 border-gray-300 bg-white p-6';
    const sectionHeadingClass = isDarkTheme ? 'text-slate-100' : 'text-gray-900';
    const mutedTextClass = isDarkTheme ? 'text-slate-300' : 'text-gray-600';
    const emergencyResolvedCard = isDarkTheme
      ? 'bg-slate-900/60 border-white/15'
      : 'bg-gray-50 border-gray-300';
    const emergencyActiveCard = isDarkTheme
      ? 'bg-rose-500/15 border-rose-400/70'
      : 'bg-red-50 border-red-600';
    const emergencyLinkClass = isDarkTheme
      ? 'text-emerald-200 underline-offset-4 hover:text-emerald-100'
      : 'text-blue-600 hover:underline';

    return (
      <div
        key={employee.id}
        className={`mb-4 rounded-lg border-2 overflow-hidden ${
          isCritical
            ? 'bg-red-50 border-red-600 shadow-lg'
            : statusInfo.status === 'active'
            ? 'bg-green-50 border-green-300'
            : 'bg-white border-gray-200'
        }`}
      >
        {/* Employee Header */}
        <div
          onClick={() => setExpandedEmployee(isExpanded ? null : employee.id)}
          className="p-4 cursor-pointer hover:bg-opacity-80 transition-colors"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-xl ${
                isCritical ? 'bg-red-600 animate-pulse' : statusInfo.status === 'active' ? 'bg-green-600' : 'bg-gray-600'
              }`}>
                {employee.firstName[0]}{employee.lastName[0]}
              </div>
              <div>
                <h3 className="text-lg font-bold">
                  {employee.firstName} {employee.lastName}
                </h3>
                <p className="text-sm text-gray-600">{employee.email}</p>
                <p className="text-sm text-gray-600">{employee.department || 'No department'}</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              {unresolvedEmergencies.length > 0 && (
                <div className="bg-red-600 text-white px-4 py-2 rounded-full font-bold text-sm">
                  {unresolvedEmergencies.length} UNRESOLVED EMERGENCY{unresolvedEmergencies.length > 1 ? 'IES' : ''}
                </div>
              )}
              {activeShift && unresolvedEmergencies.length === 0 && (
                <div className="bg-green-600 text-white px-4 py-2 rounded-full font-bold text-sm">
                  ON SHIFT
                </div>
              )}
              {!activeShift && unresolvedEmergencies.length === 0 && (
                <div className="bg-gray-400 text-white px-4 py-2 rounded-full font-bold text-sm">
                  OFF DUTY
                </div>
              )}
              <span className="text-2xl">{isExpanded ? '▲' : '▼'}</span>
            </div>
          </div>
        </div>

        {/* Expanded Details */}
        {isExpanded && (
          <div className={expandedPanelClass}>
            {/* Active Shift Info */}
            {activeShift && (
              <div className={currentShiftCardClass}>
                <h4 className={`mb-2 font-bold ${currentShiftHeadingClass}`}>Current Shift</h4>
                <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                  {activeShift.clientName && (
                    <p className={currentShiftTextClass}>
                      <span className="font-semibold">Client:</span> {activeShift.clientName}
                    </p>
                  )}
                  {activeShift.clientAddress && (
                    <p className={currentShiftTextClass}>
                      <span className="font-semibold">Address:</span> {activeShift.clientAddress}
                    </p>
                  )}
                  <p className={currentShiftTextClass}>
                    <span className="font-semibold">Started:</span> {new Date(activeShift.startTime).toLocaleString()}
                  </p>
                  <p className={currentShiftTextClass}>
                    <span className="font-semibold">Check-ins:</span> {activeShift.checkInCount || 0}
                  </p>
                  {activeShift.lastCheckIn && (
                    <p className={currentShiftTextClass}>
                      <span className="font-semibold">Last Check-in:</span> {new Date(activeShift.lastCheckIn).toLocaleTimeString()}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Emergencies */}
            <div>
              <h4 className={`mb-3 text-lg font-bold ${sectionHeadingClass}`}>
                Emergency History ({employeeEmergencies.length})
              </h4>
              {employeeEmergencies.length === 0 ? (
                <div className={`rounded-lg py-8 text-center ${isDarkTheme ? 'bg-slate-900/40' : 'bg-green-50'}`}>
                  <span className="text-6xl">✅</span>
                  <p className={`mt-2 text-xl font-bold ${sectionHeadingClass}`}>No Emergencies</p>
                  <p className={mutedTextClass}>This employee has a clean safety record</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {employeeEmergencies
                    .sort((a, b) => {
                      // Unresolved emergencies first
                      if (!a.resolvedAt && b.resolvedAt) return -1;
                      if (a.resolvedAt && !b.resolvedAt) return 1;
                      // Then sort by timestamp (most recent first)
                      return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
                    })
                    .map((emergency) => (
                    <div
                      key={emergency.id}
                      className={`rounded-lg border-2 p-4 ${
                        emergency.resolvedAt ? emergencyResolvedCard : emergencyActiveCard
                      }`}
                    >
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <span className={`px-3 py-1 rounded-full text-sm font-bold ${
                            emergency.resolvedAt
                              ? 'bg-gray-400 text-white'
                              : 'bg-red-600 text-white'
                          }`}>
                            {emergency.type.toUpperCase()}
                          </span>
                          <p className={`mt-2 text-sm ${mutedTextClass}`}>
                            {new Date(emergency.timestamp).toLocaleString()}
                          </p>
                        </div>
                        {!emergency.resolvedAt && (
                          <button
                            onClick={() => setResolvingEmergency(emergency.id)}
                            className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 font-bold"
                          >
                            RESOLVE
                          </button>
                        )}
                      </div>

                      {emergency.location && (
                        <p className={`mb-2 text-sm ${sectionHeadingClass}`}>
                          <span className="font-semibold">Location:</span>{' '}
                          <a
                            href={`https://maps.google.com/?q=${emergency.location.latitude},${emergency.location.longitude}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={emergencyLinkClass}
                          >
                            {emergency.location.latitude.toFixed(6)}, {emergency.location.longitude.toFixed(6)}
                          </a>
                        </p>
                      )}

                      {emergency.notes && (
                        <p className={`mb-2 text-sm ${sectionHeadingClass}`}>
                          <span className="font-semibold">Notes:</span> {emergency.notes}
                        </p>
                      )}

                      {emergency.resolvedAt && (
                        <div className={`mt-3 border-t pt-3 text-sm ${isDarkTheme ? 'border-white/10 text-slate-200' : 'border-gray-300 text-gray-800'}`}>
                          <p className="mb-2 font-bold text-green-600">✅ RESOLVED</p>
                          <p>
                            <span className="font-semibold">Resolved:</span> {new Date(emergency.resolvedAt).toLocaleString()}
                          </p>
                          {(emergency as any).resolution && (
                            <>
                              <p className="mt-2">
                                <span className="font-semibold">Resolution:</span> {(emergency as any).resolution}
                              </p>
                              <p>
                                <span className="font-semibold">Employee Safe:</span> {(emergency as any).employeeSafe === 'yes' ? '✅ Yes' : (emergency as any).employeeSafe === 'no' ? '❌ No' : '❓ Unknown'}
                              </p>
                              <p>
                                <span className="font-semibold">Can Resume Work:</span>{' '}
                                { (emergency as any).canResumeWork === 'yes'
                                  ? '✅ Yes'
                                  : (emergency as any).canResumeWork === 'no'
                                    ? '❌ No'
                                    : (emergency as any).canResumeWork === 'requires_medical'
                                      ? '🏥 Requires Medical'
                                      : '⏳ Pending Investigation'
                                }
                              </p>
                              {(emergency as any).actionsTaken && (
                                <p className="mt-2">
                                  <span className="font-semibold">Actions Taken:</span> {(emergency as any).actionsTaken}
                                </p>
                              )}
                              {(emergency as any).followUpRequired && (
                                <p className="mt-2 text-orange-400">
                                  <span className="font-semibold">⚠️ Follow-up Required:</span> {(emergency as any).followUpNotes}
                                </p>
                              )}
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-xl">Loading...</div>
      </div>
    );
  }

  // Sort employees: Critical (with emergencies) first, then Active Shifts, then Safe
  const criticalEmployees = employees
    .filter(e => getUnresolvedEmergencies(e.id).length > 0)
    .sort((a, b) => getUnresolvedEmergencies(b.id).length - getUnresolvedEmergencies(a.id).length); // Most emergencies first
  
  const activeEmployees = employees
    .filter(e => getActiveShift(e.id) && getUnresolvedEmergencies(e.id).length === 0)
    .sort((a, b) => {
      const aName = `${a.firstName} ${a.lastName}`;
      const bName = `${b.firstName} ${b.lastName}`;
      return aName.localeCompare(bName);
    });
  
  const safeEmployees = employees
    .filter(e => !getActiveShift(e.id) && getUnresolvedEmergencies(e.id).length === 0)
    .sort((a, b) => {
      const aName = `${a.firstName} ${a.lastName}`;
      const bName = `${b.firstName} ${b.lastName}`;
      return aName.localeCompare(bName);
    });

  return (
    <div className="min-h-screen bg-gray-100">
      <AppHeader
        eyebrow="Safety Desk"
        title="Safety Monitoring Center"
        subtitle="Watch critical alerts, employee shifts, and emergency resolutions in real time"
        accent="rose"
        actions={(
          <>
            <HeaderToggleButton
              label="Auto-refresh (30s)"
              iconOn="🔁"
              iconOff="⏸"
              pressed={autoRefresh}
              onToggle={() => setAutoRefresh((prev) => !prev)}
              tone="primary"
            />
            <HeaderActionButton
              label="Refresh"
              icon="🔄"
              tone="primary"
              onClick={fetchData}
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

      <main className={`max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8 ${isDarkTheme ? 'text-slate-100' : 'text-slate-900'}`}>
        {includeArchived && userIdFilter && (
          <div className={`mb-4 rounded-lg border px-4 py-3 text-sm ${isDarkTheme ? 'border-amber-400/40 bg-amber-500/10 text-amber-100' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>
            Viewing emergencies for archived user ID: {userIdFilter}
          </div>
        )}
        {/* Summary Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          <div className="bg-red-50 border-2 border-red-500 rounded-lg p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-red-900">Critical Alerts</p>
                <p className="text-4xl font-bold text-red-600">{criticalEmployees.length}</p>
              </div>
              <div className="text-5xl">🚨</div>
            </div>
          </div>
          <div className="bg-green-50 border-2 border-green-500 rounded-lg p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-green-900">Active Shifts</p>
                <p className="text-4xl font-bold text-green-600">{activeEmployees.length}</p>
              </div>
              <div className="text-5xl">✅</div>
            </div>
          </div>
          <div className="bg-gray-50 border-2 border-gray-300 rounded-lg p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-gray-900">All Safe</p>
                <p className="text-4xl font-bold text-gray-600">{safeEmployees.length}</p>
              </div>
              <div className="text-5xl">🛡️</div>
            </div>
          </div>
        </div>

        {/* Critical Employees - Priority Section */}
        {criticalEmployees.length > 0 && (
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-red-900 mb-4 flex items-center gap-2">
              <span className="animate-pulse">🚨</span> CRITICAL ALERTS - IMMEDIATE ACTION REQUIRED
            </h2>
            {criticalEmployees.map((employee) => renderEmployeeCard(employee, true))}
          </div>
        )}

        {/* Active Shifts */}
        {activeEmployees.length > 0 && (
          <div className="mb-6">
            <h2 className="text-xl font-bold text-green-900 mb-4">Active Shifts - Monitoring</h2>
            {activeEmployees.map((employee) => renderEmployeeCard(employee, false))}
          </div>
        )}

        {/* Safe Employees */}
        <div className="mb-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">{allUsersLabel}</h2>
          {safeEmployees.map((employee) => renderEmployeeCard(employee, false))}
        </div>
      </main>

      {/* Resolution Modal */}
      {resolvingEmergency && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur flex items-center justify-center z-50 p-4">
          <div className={`${modalCardClass} rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto`}>
            <h2 className="text-2xl font-bold mb-4">Resolve Emergency</h2>
            
            <div className="space-y-4">
              <div>
                <label className={`block text-sm font-semibold mb-2 ${labelClass}`}>Resolution Summary *</label>
                <textarea
                  value={resolutionForm.resolution}
                  onChange={(e) => setResolutionForm({ ...resolutionForm, resolution: e.target.value })}
                  className={`${textControlClass} min-h-[120px]`}
                  rows={3}
                  placeholder="Describe how the emergency was resolved..."
                  required
                />
              </div>

              <div>
                <label className={`block text-sm font-semibold mb-2 ${labelClass}`}>Is the employee safe? *</label>
                <select
                  value={resolutionForm.employeeSafe}
                  onChange={(e) => setResolutionForm({ ...resolutionForm, employeeSafe: e.target.value as any })}
                  className={selectControlClass}
                  required
                >
                  <option value="unknown">Unknown</option>
                  <option value="yes">Yes - Employee is safe</option>
                  <option value="no">No - Employee requires assistance</option>
                </select>
              </div>

              <div>
                <label className={`block text-sm font-semibold mb-2 ${labelClass}`}>Can employee resume work? *</label>
                <select
                  value={resolutionForm.canResumeWork}
                  onChange={(e) => setResolutionForm({ ...resolutionForm, canResumeWork: e.target.value as any })}
                  className={selectControlClass}
                  required
                >
                  <option value="pending_investigation">Pending Investigation</option>
                  <option value="yes">Yes - Can resume immediately</option>
                  <option value="no">No - Cannot resume work</option>
                  <option value="requires_medical">Requires Medical Clearance</option>
                </select>
              </div>

              <div>
                <label className={`block text-sm font-semibold mb-2 ${labelClass}`}>Actions Taken *</label>
                <textarea
                  value={resolutionForm.actionsTaken}
                  onChange={(e) => setResolutionForm({ ...resolutionForm, actionsTaken: e.target.value })}
                  className={`${textControlClass} min-h-[100px]`}
                  rows={3}
                  placeholder="List all actions taken to address this emergency..."
                  required
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="followUpRequired"
                  checked={resolutionForm.followUpRequired}
                  onChange={(e) => setResolutionForm({ ...resolutionForm, followUpRequired: e.target.checked })}
                  className={checkboxClass}
                />
                <label htmlFor="followUpRequired" className={`text-sm font-semibold ${labelClass}`}>
                  Follow-up required
                </label>
              </div>

              {resolutionForm.followUpRequired && (
                <div>
                  <label className={`block text-sm font-semibold mb-2 ${labelClass}`}>Follow-up Notes</label>
                  <textarea
                    value={resolutionForm.followUpNotes}
                    onChange={(e) => setResolutionForm({ ...resolutionForm, followUpNotes: e.target.value })}
                    className={textControlClass}
                    rows={2}
                    placeholder="Describe required follow-up actions..."
                  />
                </div>
              )}

              <div className="flex gap-4 pt-4">
                <button
                  onClick={() => {
                    if (!resolutionForm.resolution || !resolutionForm.actionsTaken) {
                      alert('Please fill in all required fields');
                      return;
                    }
                    handleResolveEmergency(resolvingEmergency);
                  }}
                  className="flex-1 bg-green-600 text-white px-6 py-3 rounded-md hover:bg-green-700 font-bold"
                >
                  Submit Resolution
                </button>
                <button
                  onClick={() => {
                    setResolvingEmergency(null);
                    setResolutionForm({
                      resolvedAt: new Date().toISOString(),
                      resolvedBy: '',
                      resolution: '',
                      employeeSafe: 'unknown',
                      canResumeWork: 'pending_investigation',
                      actionsTaken: '',
                      followUpRequired: false,
                      followUpNotes: '',
                    });
                  }}
                  className={`flex-1 px-6 py-3 rounded-md ${modalButtonSecondary}`}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
