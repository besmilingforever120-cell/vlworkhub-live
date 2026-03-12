import * as React from 'react';
import { useState } from 'react';
import styles from './Layout.module.scss';
import { Bell, ChevronRight } from 'lucide-react';
import { useNotifications } from '../../../../shared/hooks/useNotifications';
import Notifications from '../notification/Notifications';

interface IHeaderProps {
  userDisplayName: string;
  currentPath?: string;
}

const today = (): string => {
  const d = new Date();
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
};

const initialsFromName = (name: string): string => {
  const parts = name.trim().split(' ');
  return (parts[0]?.[0] || '') + (parts[parts.length - 1]?.[0] || '');
};

const pageTitles: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/employees': 'Employees',
  '/onboarding': 'Onboarding',
  '/training': 'Training',
  '/documents': 'Documents',
  '/tasks': 'Tasks',
  '/announcements': 'Announcements',
  '/support': 'HR Support'
};

const Header: React.FC<IHeaderProps> = ({ userDisplayName, currentPath = '/dashboard' }) => {
  const activeTitle = pageTitles[currentPath] ?? '';
  const [showNotifications, setShowNotifications] = useState<boolean>(false);

  const { unreadCount, urgentUnreadCount } = useNotifications();

  const handleNotificationClick = (): void => setShowNotifications(prev => !prev);

  return (
    <>
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <span className={styles.appTitle}>
            <span style={{ color: '#6b7280', marginRight: '4px' }}>HR Portal</span>
            {activeTitle && (
              <>
                <ChevronRight size={18} style={{ color: '#9ca3af', margin: '0 4px' }} />
                <span style={{ color: '#6b7280' }}>{activeTitle}</span>
              </>
            )}
          </span>
        </div>

        <div className={styles.headerRight}>
          <button
            className={`${styles.iconBtn} ${showNotifications ? styles.active : ''}`}
            onClick={handleNotificationClick}
            title={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
          >
            <Bell size={20} />
            {unreadCount > 0 && (
              <span className={`${styles.badge} ${urgentUnreadCount > 0 ? styles.urgent : ''}`}>
                {unreadCount}
              </span>
            )}
          </button>

          <span className={styles.date}>{today()}</span>

          <div className={styles.user}>
            <div className={styles.avatar}>{initialsFromName(userDisplayName)}</div>
            <span className={styles.userName}>{userDisplayName}</span>
          </div>
        </div>
      </header>

      {showNotifications && <Notifications onClose={() => setShowNotifications(false)} />}
    </>
  );
};

export default Header;