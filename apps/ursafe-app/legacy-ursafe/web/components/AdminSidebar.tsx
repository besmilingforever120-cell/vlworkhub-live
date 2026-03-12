'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { UserRole } from '@/types';

interface NavItem {
  label: string;
  href: string;
  icon: string;
  roles?: UserRole[];
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: '📊' },
  { label: 'Live Tracker', href: '/live-tracking', icon: '🛰️' },
  { label: 'Active Users', href: '/active-users', icon: '🧭' },
  { label: 'Users', href: '/users', icon: '👥' },
  { label: 'Trips', href: '/trips', icon: '🚗' },
  { label: 'Safety Monitoring', href: '/safety-monitoring', icon: '🛡️' },
  { label: 'Shift History', href: '/safety-monitoring/history', icon: '🕒' },
  { label: 'Settings', href: '/settings', icon: '⚙️', roles: [UserRole.SUPER_ADMIN] },
];

export default function AdminSidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [logoSrc, setLogoSrc] = useState<string | null>(null);
  const { theme } = useTheme();
  const isDarkTheme = theme === 'dark';
  const { user } = useAuth();

  const activeHref = useMemo(() => pathname || '', [pathname]);
  const visibleItems = useMemo(() => {
    return NAV_ITEMS.filter((item) => {
      if (!item.roles || item.roles.length === 0) return true;
      if (!user) return false;
      return item.roles.includes(user.role);
    });
  }, [user]);

  useEffect(() => {
    const fetchLogo = async () => {
      try {
        const response = await fetch('/api/settings', { cache: 'no-store' });
        if (!response.ok) return;
        const data = await response.json();
        const logoData = data.logoData ?? data.LogoData ?? null;
        if (typeof logoData === 'string' && logoData.length > 0) {
          setLogoSrc(logoData);
        } else {
          setLogoSrc(null);
        }
      } catch (error) {
        console.error('Failed to load logo', error);
      }
    };

    const handleSettingsUpdated = () => {
      fetchLogo();
    };

    fetchLogo();
    window.addEventListener('settings-updated', handleSettingsUpdated);

    return () => {
      window.removeEventListener('settings-updated', handleSettingsUpdated);
    };
  }, []);

  const handleBrandClick = () => {
    if (collapsed) {
      setCollapsed(false);
    }
  };

  return (
    <aside
      className={`flex h-screen flex-col border-r shadow-xl transition-all duration-300 ${
        collapsed ? 'w-20' : 'w-64'
      } ${isDarkTheme ? 'border-slate-800 bg-slate-900/80 text-slate-100' : 'border-gray-100 bg-white text-slate-900'}`}
    >
      <div className={`flex items-center justify-between gap-3 border-b px-4 py-4 ${isDarkTheme ? 'border-slate-800' : 'border-gray-100'}`}>
        <div
          role={collapsed ? 'button' : undefined}
          tabIndex={collapsed ? 0 : -1}
          aria-label="Expand sidebar"
          onClick={handleBrandClick}
          onKeyDown={(event) => {
            if (collapsed && (event.key === 'Enter' || event.key === ' ')) {
              event.preventDefault();
              handleBrandClick();
            }
          }}
          className={`flex flex-1 items-center gap-4 transition-all ${
            collapsed ? 'cursor-pointer justify-center' : 'flex-row text-left'
          }`}
        >
          <div
            className={`flex h-12 w-12 flex-none items-center justify-center overflow-hidden rounded-2xl ${
              isDarkTheme ? 'bg-slate-800' : 'bg-gray-100'
            }`}
          >
            {logoSrc ? (
              <img src={logoSrc} alt="Organization logo" className="h-full w-full object-cover" />
            ) : (
              <span className="text-2xl" role="img" aria-label="Logo placeholder">🛡️</span>
            )}
          </div>
          {!collapsed && (
            <div className="flex flex-col text-left">
              <p className={`text-base font-semibold ${isDarkTheme ? 'text-slate-100' : 'text-gray-900'}`}>
                URSafe Safety Centre
              </p>
            </div>
          )}
        </div>
        <button
          type="button"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className={`rounded-lg border p-2 transition ${
            isDarkTheme
              ? 'border-slate-700 text-slate-300 hover:bg-slate-800'
              : 'border-gray-200 text-gray-600 hover:bg-gray-50'
          }`}
          onClick={() => setCollapsed((prev) => !prev)}
        >
          {collapsed ? '>' : '<'}
        </button>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {visibleItems.map((item) => {
          const isActive = activeHref === item.href || activeHref.startsWith(`${item.href}/`);
          const activeClasses = isDarkTheme
            ? 'border-emerald-400/40 bg-emerald-400/10 text-emerald-100'
            : 'border-blue-200 bg-blue-50 text-blue-700';
          const idleClasses = isDarkTheme
            ? 'border-transparent text-slate-300 hover:border-slate-800 hover:bg-slate-900'
            : 'border-transparent text-gray-600 hover:border-gray-200 hover:bg-gray-50';

          return (
            <Link key={item.href} href={item.href} className="block">
              <span
                className={`flex items-center gap-3 rounded-xl border px-3 py-2 text-sm font-semibold transition-colors ${
                  isActive ? activeClasses : idleClasses
                }`}
                title={item.label}
              >
                <span className="text-lg" aria-hidden="true">
                  {item.icon}
                </span>
                {!collapsed && <span>{item.label}</span>}
              </span>
            </Link>
          );
        })}
      </nav>

      <div className={`border-t px-4 py-4 text-xs ${isDarkTheme ? 'border-slate-800 text-slate-400' : 'border-gray-100 text-gray-500'}`}>
        {!collapsed && (
          <p className="leading-tight">
            Stay alert: monitor the Live Tracker first when you log in to ensure every active employee is safe.
          </p>
        )}
      </div>
    </aside>
  );
}
