import * as React from 'react';
import { HashRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { WebPartContext } from '@microsoft/sp-webpart-base';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Sidebar from './layout/Sidebar';
import Header from './layout/Header';
import styles from './layout/Layout.module.scss';
import Dashboard from './dashboard/Dashboard';
import Onboarding from './onboarding/Onboarding';
import Training from './training/Training';
import Documents from './documents/Documents';
import Tasks from './tasks/Tasks';
import Announcements from './announcements/Announcements';
import HrSupport from './support/HrSupport';

export interface AppProps {
  userDisplayName: string;
  context: WebPartContext;
}

export const AppContext = React.createContext<WebPartContext | null>(null);

/* ================================ REACT QUERY SETUP ================================ */

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      cacheTime: 1000 * 60 * 30,
      refetchOnWindowFocus: false,
      retry: 1,
      refetchOnMount: true,
    },
    mutations: {
      retry: 0,
    },
  },
});

/* ================================ APP CONTENT COMPONENT ================================ */

const AppContent: React.FC<{
  userDisplayName: string;
  context: WebPartContext;
}> = ({ userDisplayName, context }) => {
  const [collapsed, setCollapsed] = React.useState(false);
  const location = useLocation();

  return (
    <div className={`${styles.appShell} ${collapsed ? styles.collapsed : ''}`}>
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />
      
      <div className={styles.mainArea}>
        <Header userDisplayName={userDisplayName} currentPath={location.pathname} />
        
        <div className={styles.content}>
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Dashboard userDisplayName={userDisplayName} />} />
            <Route path="/onboarding" element={<Onboarding />} />
            <Route path="/training" element={<Training />} />
            <Route
              path="/documents"
              element={<Documents libraryUrl="HR Documents" signaturesUrl="Signatures" />}
            />
            <Route path="/tasks" element={<Tasks />} />
            <Route path="/announcements" element={<Announcements />} />
            <Route path="/support" element={<HrSupport />} />
          </Routes>
        </div>
      </div>
    </div>
  );
};

/* ================================ MAIN APP COMPONENT ================================ */

const App: React.FC<AppProps> = ({ userDisplayName, context }) => {
  return (
    <QueryClientProvider client={queryClient}>
      <AppContext.Provider value={context}>
        <HashRouter>
          <AppContent userDisplayName={userDisplayName} context={context} />
        </HashRouter>
      </AppContext.Provider>
    </QueryClientProvider>
  );
};

export default App;