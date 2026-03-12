import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useContext, useMemo } from 'react';
import { AppContext } from '../../webparts/hrWebPart/components/App';
import { SharePointServiceFactory } from '../services';
import { INotificationWithStatus } from '../models';

// Query Keys
const notificationKeys = {
  all: ['notifications'] as const,
  list: (userId: number) => [...notificationKeys.all, 'list', userId] as const,
};

// Configuration
const NOTIFICATION_CONFIG = {
  maxNotifications: 20,
  autoHideReadAfterMinutes: 30, // Auto-hide read notifications after 30 minutes (0 = never)
  staleTime: 30 * 1000, // 30 seconds
  refetchInterval: 60 * 1000, // 1 minute
} as const;

/**
 * Hook to fetch and manage notifications with auto-hide for read items
 * 
 * Features:
 * - Automatic fetching and caching with React Query
 * - Optimistic updates for better UX
 * - Auto-hide read notifications after 30 minutes (configurable)
 * - Real-time refresh capability
 * - Error handling with rollback
 */
export function useNotifications() {
  const context = useContext(AppContext);
  const queryClient = useQueryClient();
  
  const services = useMemo(
    () => SharePointServiceFactory.getInstance(context!),
    [context]
  );

  // Fetch current user ID
  const { data: currentUserId } = useQuery({
    queryKey: ['currentUser', 'id'],
    queryFn: () => services.user.getCurrentUserId(),
    staleTime: Infinity,
    cacheTime: Infinity, // Using cacheTime for React Query v4 compatibility
  });

  // Fetch notifications with auto-hide for old read items
  const {
    data: notifications = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: notificationKeys.list(currentUserId || 0),
    queryFn: async () => {
      if (!currentUserId) return [];

      const isOwner = services.roles.isCurrentUserOwner();

      // Fetch all data in parallel
      const [announcements, tasks, notificationStatuses] = await Promise.all([
        services.announcements.getActive(NOTIFICATION_CONFIG.maxNotifications).catch(() => []),
        isOwner
          ? services.tasks.getAll(NOTIFICATION_CONFIG.maxNotifications).catch(() => [])
          : services.membership
              .getVisiblePrincipalIds(currentUserId)
              .then(ids => services.tasks.getByPrincipalIds(ids, NOTIFICATION_CONFIG.maxNotifications))
              .catch(() => []),
        services.notifications.getUserStatuses(currentUserId).catch(() => []),
      ]);

      // Build notifications with auto-hide feature
      // Read notifications older than autoHideReadAfterMinutes will be automatically filtered out
      return services.notifications.buildNotifications(
        announcements,
        tasks,
        notificationStatuses,
        NOTIFICATION_CONFIG.maxNotifications,
        NOTIFICATION_CONFIG.autoHideReadAfterMinutes // 🆕 Auto-hide after 30 minutes
      );
    },
    enabled: !!currentUserId,
    staleTime: NOTIFICATION_CONFIG.staleTime,
    refetchInterval: NOTIFICATION_CONFIG.refetchInterval,
    refetchOnWindowFocus: true,
    refetchOnMount: true,
  });

  // Mark single notification as read with optimistic update
  const markAsReadMutation = useMutation({
    mutationFn: async (notification: INotificationWithStatus) => {
      if (!currentUserId) {
        throw new Error('User not authenticated');
      }
      
      await services.notifications.markAsRead(
        notification.id,
        notification.type,
        currentUserId
      );
      
      return notification.id;
    },
    onMutate: async (notification) => {
      // Cancel outgoing refetches to prevent race conditions
      await queryClient.cancelQueries(notificationKeys.list(currentUserId || 0));

      // Snapshot previous value for rollback
      const previousNotifications = queryClient.getQueryData<INotificationWithStatus[]>(
        notificationKeys.list(currentUserId || 0)
      );

      // Optimistically update the cache
      if (previousNotifications) {
        queryClient.setQueryData<INotificationWithStatus[]>(
          notificationKeys.list(currentUserId || 0),
          previousNotifications.map(n =>
            n.id === notification.id
              ? { ...n, isRead: true, readDate: new Date().toISOString() }
              : n
          )
        );
      }

      return { previousNotifications };
    },
    onError: (err, _notification, context) => {
      console.error('Error marking notification as read:', err);
      
      // Rollback optimistic update on error
      if (context?.previousNotifications) {
        queryClient.setQueryData(
          notificationKeys.list(currentUserId || 0),
          context.previousNotifications
        );
      }
    },
    onSuccess: () => {
      // Invalidate and refetch to sync with server
      // This ensures we get fresh data including any server-side changes
      queryClient.invalidateQueries(notificationKeys.list(currentUserId || 0));
    },
  });

  // Mark all unread notifications as read with optimistic update
  const markAllAsReadMutation = useMutation({
    mutationFn: async () => {
      if (!currentUserId) {
        throw new Error('User not authenticated');
      }

      const unreadNotifications = notifications.filter(n => !n.isRead);
      
      if (unreadNotifications.length === 0) {
        return [];
      }

      await services.notifications.markMultipleAsRead(
        unreadNotifications.map(n => ({ id: n.id, type: n.type })),
        currentUserId
      );

      return unreadNotifications.map(n => n.id);
    },
    onMutate: async () => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries(notificationKeys.list(currentUserId || 0));

      // Snapshot previous value
      const previousNotifications = queryClient.getQueryData<INotificationWithStatus[]>(
        notificationKeys.list(currentUserId || 0)
      );

      // Optimistically mark all as read
      if (previousNotifications) {
        const now = new Date().toISOString();
        queryClient.setQueryData<INotificationWithStatus[]>(
          notificationKeys.list(currentUserId || 0),
          previousNotifications.map(n => ({
            ...n,
            isRead: true,
            readDate: n.isRead ? n.readDate : now,
          }))
        );
      }

      return { previousNotifications };
    },
    onError: (err, _variables, context) => {
      console.error('Error marking all notifications as read:', err);
      
      // Rollback on error
      if (context?.previousNotifications) {
        queryClient.setQueryData(
          notificationKeys.list(currentUserId || 0),
          context.previousNotifications
        );
      }
    },
    onSuccess: () => {
      // Invalidate and refetch to sync with server
      queryClient.invalidateQueries(notificationKeys.list(currentUserId || 0));
    },
  });

  // Computed values
  const unreadCount = useMemo(
    () => notifications.filter(n => !n.isRead).length,
    [notifications]
  );

  const urgentUnreadCount = useMemo(
    () => notifications.filter(n => !n.isRead && n.urgent).length,
    [notifications]
  );

  const totalCount = notifications.length;

  // Public API
  return {
    // Data
    notifications,
    isLoading,
    error,
    
    // Stats
    totalCount,
    unreadCount,
    urgentUnreadCount,
    
    // Actions
    markAsRead: markAsReadMutation.mutateAsync,
    markAllAsRead: markAllAsReadMutation.mutateAsync,
    refresh: refetch, // 🆕 Alias for refetch - triggers instant refresh
    
    // Status flags
    isMarkingAsRead: markAsReadMutation.isLoading,
    isMarkingAllAsRead: markAllAsReadMutation.isLoading,
    isRefreshing: isLoading,
  };
}

/**
 * Configuration notes:
 * 
 * To change auto-hide duration:
 * - Edit NOTIFICATION_CONFIG.autoHideReadAfterMinutes
 * - Set to 0 to disable auto-hide (keep all read notifications)
 * - Set to 60 for 1 hour, 1440 for 1 day, etc.
 * 
 * The auto-hide feature:
 * - Filters out notifications marked as read older than X minutes
 * - Runs on every data fetch (page load, auto-refresh, manual refresh)
 * - Does NOT delete data from SharePoint, only hides from view
 * - Works in combination with the "Clear Read" button for immediate hiding
 */