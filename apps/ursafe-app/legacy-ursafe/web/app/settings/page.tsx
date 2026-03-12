'use client';

export const dynamic = 'force-dynamic';

import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import AppHeader, { HeaderActionButton } from '@/components/AppHeader';
import { useRouter } from 'next/navigation';
import { ChangeEvent, useEffect, useState } from 'react';
import { UserRole } from '@/types';

export default function SettingsPage() {
  const { user, loading: authLoading, signOut } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [ratePerKm, setRatePerKm] = useState('0.68');
  const [smtpEmail, setSmtpEmail] = useState('');
  const [smtpPassword, setSmtpPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const { theme } = useTheme();
  const isDarkTheme = theme === 'dark';
  const isSuperAdmin = user?.role === UserRole.SUPER_ADMIN;
  const canManageSettings = isSuperAdmin;
  const headerRoleLabel = 'Super Admin';
  const headerSubtitle = 'Manage reimbursement rates, notifications, and branding';

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      router.push('/login');
      return;
    }

    if (!canManageSettings) {
      router.push('/dashboard');
      return;
    }

    fetchSettings();
  }, [user, authLoading, canManageSettings]);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/settings');
      if (response.ok) {
        const data = await response.json();
        const rateValue = data.ratePerKm ?? data.RatePerKm;
        setRatePerKm(rateValue !== undefined && rateValue !== null ? String(rateValue) : '0.68');
        setSmtpEmail(data.smtpEmail ?? data.SmtpEmail ?? '');
        setSmtpPassword(data.smtpPassword ?? data.SmtpPassword ?? '');
        setLogoPreview((data.logoData ?? data.LogoData ?? null) || null);
      }
    } catch (error) {
      console.error('Error fetching settings:', error);
    } finally {
      setLoading(false);
    }
  };
  const handleSave = async () => {
    setSaving(true);
    try {
      const parsedRate = Number.parseFloat(ratePerKm);
      const normalizedRate = Number.isFinite(parsedRate) ? parsedRate : 0.68;
      const response = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          ratePerKm: normalizedRate,
          smtpEmail: smtpEmail.trim(),
          smtpPassword,
          logoData: logoPreview ?? '',
        }),
      });

      if (!response.ok) throw new Error('Failed to save settings');
      window.dispatchEvent(new Event('settings-updated'));
      alert('Settings saved successfully!');
    } catch (error) {
      console.error('Error saving settings:', error);
      alert('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleLogoChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      setLogoPreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveLogo = () => {
    setLogoPreview(null);
  };

  const handleSignOut = async () => {
    await signOut();
    router.push('/login');
  };

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-xl">Loading...</div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen ${isDarkTheme ? 'bg-slate-950 text-slate-100' : 'bg-gray-100 text-gray-900'}`}>
      <AppHeader
        eyebrow={headerRoleLabel}
        title="Settings"
        subtitle={headerSubtitle}
        accent="slate"
        actions={(
          <HeaderActionButton
            label="Sign Out"
            icon="🚪"
            tone="danger"
            onClick={handleSignOut}
          />
        )}
        meta={`Signed in as ${user?.firstName ?? ''} ${user?.lastName ?? ''}`}
      />

      <main className="max-w-4xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
        {canManageSettings && (
          <>
            {/* Branding */}
            <div className="bg-white shadow rounded-lg p-6 mb-6">
              <h2 className="text-xl font-bold mb-6">Branding</h2>
              <div className="flex flex-col gap-6 md:flex-row md:items-center">
                <div className="flex h-32 w-32 items-center justify-center overflow-hidden rounded-2xl border border-dashed border-gray-300 bg-gray-50">
                  {logoPreview ? (
                    <img
                      src={logoPreview}
                      alt="Organization logo preview"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="text-sm font-semibold text-gray-400">Logo Preview</span>
                  )}
                </div>
                <div className="flex-1 space-y-3">
                  <p className="text-sm text-gray-600">
                    Upload your organization logo (PNG or JPG, max 1MB). It will appear in the sidebar next to the Safety Center title.
                  </p>
                  <div className="flex flex-wrap gap-3">
                    <label className="cursor-pointer rounded-full border border-gray-300 px-4 py-1.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-50">
                      <input type="file" accept="image/*" className="hidden" onChange={handleLogoChange} />
                      Upload Logo
                    </label>
                    {logoPreview && (
                      <button
                        type="button"
                        onClick={handleRemoveLogo}
                        className="rounded-full border border-gray-200 px-4 py-1.5 text-sm font-semibold text-gray-500 transition hover:bg-gray-50"
                      >
                        Remove Logo
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-gray-500">Recommended size: 200x200 px or larger square image.</p>
                </div>
              </div>
            </div>

            {/* Rate Settings */}
            <div className="bg-white shadow rounded-lg p-6 mb-6">
              <h2 className="text-xl font-bold mb-6">Mileage Rate Configuration</h2>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Rate per Kilometer (CAD)
                  </label>
                  <div className="flex items-center gap-4">
                    <span className="text-2xl font-bold text-gray-500">$</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={ratePerKm}
                      onChange={(e) => setRatePerKm(e.target.value)}
                      className="block w-40 px-4 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-lg"
                    />
                    <span className="text-gray-600">per km</span>
                  </div>
                  <p className="mt-2 text-sm text-gray-500">
                    This rate will be used to calculate trip reimbursements: Distance (km) x Rate = Total Amount
                  </p>
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <h3 className="font-semibold text-blue-900 mb-2">Example Calculation:</h3>
                  <p className="text-blue-800">
                    100 km x ${ratePerKm} = ${(100 * parseFloat(ratePerKm || '0')).toFixed(2)} CAD
                  </p>
                </div>
              </div>
            </div>

            {/* SMTP Email Settings */}
            <div className="bg-white shadow rounded-lg p-6 mb-6">
              <h2 className="text-xl font-bold mb-6">Email Configuration (SMTP)</h2>
              
              <div className="space-y-4">
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-4">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="font-semibold text-gray-700">SMTP Server:</span>
                      <span className="ml-2 text-gray-900">smtp.office365.com</span>
                    </div>
                    <div>
                      <span className="font-semibold text-gray-700">Port:</span>
                      <span className="ml-2 text-gray-900">587</span>
                    </div>
                    <div>
                      <span className="font-semibold text-gray-700">Security:</span>
                      <span className="ml-2 text-gray-900">STARTTLS</span>
                    </div>
                    <div>
                      <span className="font-semibold text-gray-700">Provider:</span>
                      <span className="ml-2 text-gray-900">Microsoft Office 365</span>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Email Address *
                  </label>
                  <input
                    type="email"
                    value={smtpEmail}
                    onChange={(e) => setSmtpEmail(e.target.value)}
                    placeholder="noreply@yourcompany.com"
                    className="block w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                  />
                  <p className="mt-1 text-sm text-gray-500">
                    The email address used to send welcome emails to new users
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Email Password *
                  </label>
                  <input
                    type="password"
                    value={smtpPassword}
                    onChange={(e) => setSmtpPassword(e.target.value)}
                    placeholder="Enter your email password or app password"
                    className="block w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                  />
                  <p className="mt-1 text-sm text-gray-500">
                    For Office 365, you may need to use an app-specific password
                  </p>
                </div>

                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <h3 className="font-semibold text-yellow-900 mb-2">Security Note:</h3>
                  <p className="text-yellow-800 text-sm">
                    Your email credentials are stored securely. For Office 365, consider using an app password instead of your main password.
                    Enable multi-factor authentication and create an app password in your Microsoft account settings.
                  </p>
                </div>
              </div>
            </div>

            {/* Save Button */}
            <div className="bg-white shadow rounded-lg p-6">
              <button
                onClick={handleSave}
                disabled={saving}
                className="w-full bg-blue-600 text-white px-6 py-3 rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed font-semibold"
              >
                {saving ? 'Saving Settings...' : 'Save All Settings'}
              </button>
            </div>

            {/* Additional Info */}
            <div className="mt-6 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <h3 className="font-semibold text-yellow-900 mb-2">Note:</h3>
              <p className="text-yellow-800 text-sm">
                The CRA (Canada Revenue Agency) 2025 automobile allowance rate is $0.70 per km for the first 5,000 km 
                and $0.64 for each additional kilometer. Adjust the rate according to your company policy.
              </p>
            </div>
          </>
        )}

      </main>
    </div>
  );
}
