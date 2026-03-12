'use client';

import './globals.css';
import { usePathname } from 'next/navigation';
import AdminSidebar from '@/components/AdminSidebar';
import { AuthProvider } from '@/contexts/AuthContext';
import { ThemeProvider, useTheme } from '@/contexts/ThemeContext';

const SIDEBAR_ROUTES = [
  '/dashboard',
  '/live-tracking',
  '/active-users',
  '/users',
  '/trips',
  '/safety-monitoring',
  '/safety-monitoring/history',
  '/settings',
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased">
        <ThemeProvider>
          <AuthProvider>
            <AppShell>{children}</AppShell>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { theme } = useTheme();
  const showSidebar = pathname ? SIDEBAR_ROUTES.some((route) => pathname.startsWith(route)) : false;
  const isDark = theme === 'dark';
  const baseBgClass = isDark ? 'bg-slate-950 text-slate-100' : 'bg-gray-100 text-slate-900';
  const mainBgClass = isDark ? 'bg-slate-950' : 'bg-gray-100';

  if (!showSidebar) {
    return <div className={`min-h-screen transition-colors duration-300 ${baseBgClass}`}>{children}</div>;
  }

  return (
    <div className={`flex min-h-screen transition-colors duration-300 ${baseBgClass}`}>
      <AdminSidebar />
      <main className={`flex-1 min-h-screen overflow-y-auto ${mainBgClass}`}>{children}</main>
    </div>
  );
}
