import * as React from 'react';
import { useState, useRef, useEffect, useCallback } from 'react';
import styles from './Notifications.module.scss';
import { Bell, X, Clock, AlertCircle, CheckCircle, Check} from 'lucide-react';
import { useNotifications } from '../../../../shared/hooks/useNotifications';
import { INotificationWithStatus } from '../../../../shared/models';

interface NotificationsProps {
  onClose?: () => void;
}

// ✅ Helper to normalize IDs (fixes reappearing notifications)
const idKey = (id: unknown): string => String(id);

// Helper functions for type-safe CSS class mapping
const getStatusClassName = (status?: string): string => {
  if (!status) return '';
  
  const statusMap: Record<string, string> = {
    'completed': styles.completed,
    'inprogress': styles.inprogress,
    'in progress': styles.inprogress,
    'notstarted': styles.notstarted,
    'not started': styles.notstarted
  };
  
  const key = status.toLowerCase().replace(/\s+/g, '');
  return statusMap[key] || '';
};

const getPriorityClassName = (priority?: string): string => {
  if (!priority) return '';
  
  const priorityMap: Record<string, string> = {
    'high': styles.high,
    'important': styles.important,
    'critical': styles.critical,
    'highlyimportant': styles.highlyimportant,
    'highly important': styles.highlyimportant,
  };
  
  const key = priority.toLowerCase().replace(/\s+/g, '');
  return priorityMap[key] || '';
};

// Add this helper function after getPriorityClassName
const getNotificationTypeClassName = (type: string): string => {
  const typeMap: Record<string, string> = {
    'announcement': styles.announcement,
    'task': styles.task
  };
  
  return typeMap[type] || '';
};

const Notifications: React.FC<NotificationsProps> = ({ onClose }) => {
  const {
    notifications,
    isLoading,
    totalCount,
    unreadCount,
    urgentUnreadCount,
    markAsRead,
    markAllAsRead,
    isMarkingAllAsRead,
    refresh, // ✅ Now available from the updated hook
  } = useNotifications();

  const [deletingIds, setDeletingIds] = useState<Set<string>>(() => new Set());
  const [deletedIds, setDeletedIds] = useState<Set<string>>(() => new Set());
  const modalRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent): void => {
      if (modalRef.current && !modalRef.current.contains(event.target as Node)) {
        onClose?.();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  // Auto-refresh when marking notifications - ensures instant list update
  useEffect(() => {
    if (!isLoading && notifications.length > 0) {
      setDeletedIds(prev => {
        const stillExists = new Set<string>();
        prev.forEach(id => {
          if (notifications.some(n => idKey(n.id) === id)) {
            stillExists.add(id);
          }
        });
        return stillExists;
      });
    }
  }, [notifications, isLoading]);

  // Handle single mark as read with deletion animation
  const handleMarkAsRead = useCallback(
    async (notification: INotificationWithStatus, event: React.MouseEvent): Promise<void> => {
      event.stopPropagation();

      const key = idKey(notification.id);
      if (notification.isRead || deletingIds.has(key)) {
        return;
      }

      // Start deletion animation
      setDeletingIds(prev => new Set(prev).add(key));

      try {
        await markAsRead(notification);

        if (refresh) {
          setTimeout(() => refresh(), 100);
        }

        // Wait for animation to complete before removing from view
        setTimeout(() => {
          setDeletedIds(prev => new Set(prev).add(key));
          setDeletingIds(prev => {
            const newSet = new Set(prev);
            newSet.delete(key);
            return newSet;
          });
        }, 500); // Match animation duration
      } catch (error) {
        console.error('Error marking notification as read:', error);
        setDeletingIds(prev => {
          const newSet = new Set(prev);
          newSet.delete(key);
          return newSet;
        });
      }
    },
    [markAsRead, deletingIds, refresh]
  );

  // Handle mark all as read with staggered deletion
  const handleMarkAllAsRead = useCallback(async (): Promise<void> => {
    if (isMarkingAllAsRead) return;

    const unreadNotifications = notifications.filter(n => !n.isRead && !deletedIds.has(idKey(n.id)));
    if (unreadNotifications.length === 0) return;

    try {
      // Start staggered deletion animation
      unreadNotifications.forEach((notification, index) => {
        const key = idKey(notification.id);
        setTimeout(() => {
          setDeletingIds(prev => new Set(prev).add(key));
        }, index * 100);
      });

      await markAllAsRead();

      if (refresh) {
        setTimeout(() => refresh(), unreadNotifications.length * 100);
      }

      setTimeout(() => {
        unreadNotifications.forEach(notification => {
          setDeletedIds(prev => new Set(prev).add(idKey(notification.id)));
        });
        setDeletingIds(new Set());
      }, unreadNotifications.length * 100 + 500);
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
      setDeletingIds(new Set());
    }
  }, [notifications, markAllAsRead, isMarkingAllAsRead, deletedIds, refresh]);

  
  // Filter out deleted notifications
  const visibleNotifications = notifications.filter(n => !deletedIds.has(idKey(n.id)));

  return (
    <>
      <div className={styles.notificationOverlay} onClick={onClose} />
      <div className={styles.notificationModal} ref={modalRef}>
        <div className={styles.notificationHeader}>
          <div className={styles.notificationTitle}>
            <Bell size={20} />
            <h3>Notifications</h3>
            <button className={styles.closeBtn} onClick={onClose}>
              <X size={18} />
            </button>
          </div>

          <div className={styles.notificationHeaderActions}>
            {totalCount > 0 && (
              <p className={styles.notificationCount}>
                {visibleNotifications.length} notification{visibleNotifications.length !== 1 ? 's' : ''}
                {unreadCount > 0 && (
                  <span className={styles.unreadText}> • {unreadCount} unread</span>
                )}
                {urgentUnreadCount > 0 && (
                  <span className={styles.urgentText}> • {urgentUnreadCount} urgent</span>
                )}
              </p>
            )}

            <div className={styles.actionButtons}>
              {unreadCount > 0 && (
                <button
                  className={styles.markAllReadBtn}
                  onClick={handleMarkAllAsRead}
                  disabled={isMarkingAllAsRead}
                  title="Mark all as read"
                >
                  <Check size={16} />
                  {isMarkingAllAsRead ? 'Marking...' : 'Mark all read'}
                </button>
              )}

            </div>
          </div>
        </div>

        <div className={styles.notificationContent}>
          {isLoading ? (
            <div className={styles.notificationLoading}>
              <div className={styles.spinner} />
              <p>Loading notifications...</p>
            </div>
          ) : visibleNotifications.length === 0 ? (
            <div className={styles.notificationEmpty}>
              <Bell size={32} />
              <p>No notifications</p>
            </div>
          ) : (
            <div className={styles.notificationList}>
              {visibleNotifications.map(notification => {
                const statusClass = getStatusClassName(notification.status);
                const priorityClass = getPriorityClassName(notification.priority);

                return (
                  <div
                    key={idKey(notification.id)}
                    className={`${styles.notificationItem} ${
                      notification.urgent ? styles.urgent : ''
                    } ${notification.isRead ? styles.read : styles.unread} ${
                      deletingIds.has(idKey(notification.id)) ? styles.deleting : ''
                    }`}
                  >
                    <div className={styles.notificationItemContent}>
                      <div className={`${styles.notificationIcon} ${getNotificationTypeClassName(notification.type)}`}>
                        {notification.type === 'announcement' ? (
                          <AlertCircle size={16} />
                        ) : (
                          <CheckCircle size={16} />
                        )}
                      </div>

                      <div className={styles.notificationText}>
                        <div className={styles.notificationItemTitle}>
                          <h4>{notification.title}</h4>
                          <div className={styles.notificationBadges}>
                            {notification.urgent && (
                              <span className={styles.urgentBadge}>Urgent</span>
                            )}
                            {!notification.isRead && (
                              <span className={styles.unreadBadge}>New</span>
                            )}
                          </div>
                        </div>

                        {notification.description && (
                          <p className={styles.notificationDescription}>
                            {notification.description}
                          </p>
                        )}

                        <div className={styles.notificationMeta}>
                          <span className={styles.notificationTime}>
                            <Clock size={12} />
                            {notification.time}
                          </span>
                          
                          {notification.status && (
                            <span className={`${styles.statusBadge} ${statusClass}`}>
                              {notification.status}
                            </span>
                          )}
                          
                          {notification.priority && notification.priority !== 'Normal' && (
                            <span className={`${styles.priorityBadge} ${priorityClass}`}>
                              {notification.priority}
                            </span>
                          )}
                          
                          {notification.isRead && notification.readDate && (
                            <span className={styles.readDate}>
                              Read {new Date(notification.readDate).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                      </div>

                      {!notification.isRead && (
                        <button
                          className={`${styles.markReadBtn} ${
                            deletingIds.has(idKey(notification.id)) ? styles.loading : ''
                          }`}
                          onClick={e => handleMarkAsRead(notification, e)}
                          disabled={deletingIds.has(idKey(notification.id))}
                          title="Mark as read"
                        >
                          {deletingIds.has(idKey(notification.id)) ? (
                            <div className={styles.miniSpinner} />
                          ) : (
                            <Check size={14} />
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default Notifications;
