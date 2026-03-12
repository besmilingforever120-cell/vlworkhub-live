import { BaseSharePointService } from '../core/BaseSharePointService';
import { IUserNotificationStatus, INotificationWithStatus, IAnnouncement, ITaskItem } from '../../models';
import { stripHtml, getTimeAgo } from '../../utils/htmlHelpers';

export class NotificationService extends BaseSharePointService {
  private statusListTitle = 'UserNotificationStatus';

  async markAsRead(
    notificationId: string,
    notificationType: string,
    currentUserId: number
  ): Promise<void> {
    const existing = await this.get<{ value: IUserNotificationStatus[] }>(
      `${this.baseUrl}/_api/web/lists/getbytitle('${this.statusListTitle}')/items` +
        `?$filter=(UserId eq ${currentUserId}) and (NotificationId eq '${notificationId}')`
    );

    const readDate = new Date().toISOString();

    if (existing.value.length > 0) {
      await this.postWithoutResponse(
        `${this.baseUrl}/_api/web/lists/getbytitle('${this.statusListTitle}')/items(${existing.value[0].Id})`,
        { IsRead: true, ReadDate: readDate },
        { 'IF-MATCH': '*', 'X-HTTP-Method': 'MERGE' }
      );
    } else {
      await this.post<IUserNotificationStatus>(
        `${this.baseUrl}/_api/web/lists/getbytitle('${this.statusListTitle}')/items`,
        {
          UserId: currentUserId,
          NotificationId: notificationId,
          NotificationType: notificationType,
          IsRead: true,
          ReadDate: readDate
        }
      );
    }
  }

  async markMultipleAsRead(
    notifications: Array<{ id: string; type: string }>,
    currentUserId: number
  ): Promise<void> {
    const batchSize = 10;
    for (let i = 0; i < notifications.length; i += batchSize) {
      const batch = notifications.slice(i, i + batchSize);
      await Promise.all(batch.map(n => this.markAsRead(n.id, n.type, currentUserId)));
      if (i + batchSize < notifications.length) {
        await new Promise(r => setTimeout(r, 100));
      }
    }
  }

  async getUserStatuses(currentUserId: number): Promise<IUserNotificationStatus[]> {
    const url =
      `${this.baseUrl}/_api/web/lists/getbytitle('${this.statusListTitle}')/items` +
      `?$filter=UserId eq ${currentUserId}` +
      `&$select=Id,UserId,NotificationId,NotificationType,IsRead,ReadDate,Created` +
      `&$top=1000`;

    try {
      const data = await this.get<{ value: IUserNotificationStatus[] }>(url);
      return data.value;
    } catch (error) {
      console.warn('Could not fetch notification statuses (list may not exist):', error);
      return [];
    }
  }

  async getStats(currentUserId: number, notifications: INotificationWithStatus[]): Promise<{
    total: number;
    unread: number;
    urgent: number;
    byType: Record<string, number>;
  }> {
    return {
      total: notifications.length,
      unread: notifications.filter(n => !n.isRead).length,
      urgent: notifications.filter(n => n.urgent && !n.isRead).length,
      byType: notifications.reduce(
        (acc, n) => {
          acc[n.type] = (acc[n.type] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>
      )
    };
  }

  async cleanupOld(daysToKeep: number = 90): Promise<void> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysToKeep);
    const filter = `(IsRead eq true) and (ReadDate lt datetime'${cutoff.toISOString()}')`;

    const oldStatuses = await this.get<{ value: IUserNotificationStatus[] }>(
      `${this.baseUrl}/_api/web/lists/getbytitle('${this.statusListTitle}')/items?$filter=${encodeURIComponent(
        filter
      )}&$top=100`
    );

    for (const status of oldStatuses.value) {
      await this.postWithoutResponse(
        `${this.baseUrl}/_api/web/lists/getbytitle('${this.statusListTitle}')/items(${status.Id})`,
        undefined,
        { 'IF-MATCH': '*', 'X-HTTP-Method': 'DELETE' }
      );
    }
  }

  buildNotifications(
    announcements: IAnnouncement[],
    tasks: ITaskItem[],
    statuses: IUserNotificationStatus[],
    maxNotifications: number,
    autoHideReadAfterMinutes: number = 30
  ): INotificationWithStatus[] {
    const statusMap = new Map<string, IUserNotificationStatus>();
    statuses.forEach(s => statusMap.set(s.NotificationId, s));

    const notifications: INotificationWithStatus[] = [];
    const now = new Date();

    announcements.forEach(a => {
      const id = `announcement-${a.Id}`;
      const st = statusMap.get(id);
      const clean = stripHtml(a.Body || '');
      
      // Skip notifications that were read more than X minutes ago
      if (st?.IsRead && st.ReadDate && autoHideReadAfterMinutes > 0) {
        const readDate = new Date(st.ReadDate);
        const minutesSinceRead = (now.getTime() - readDate.getTime()) / (1000 * 60);
        if (minutesSinceRead > autoHideReadAfterMinutes) {
          return;
        }
      }

      notifications.push({
        id,
        type: 'announcement',
        title: a.Title,
        description: clean.substring(0, 100) + (clean.length > 100 ? '...' : ''),
        time: getTimeAgo(a.Created),
        priority: a.Priority,
        urgent: a.Priority === 'Highly Important',
        isRead: st?.IsRead ?? false,
        readDate: st?.ReadDate,
        timestamp: new Date(a.Created).getTime() // ✅ Add timestamp for sorting
      });
    });

    tasks.forEach(t => {
      const id = `task-${t.Id}`;
      const st = statusMap.get(id);
      const clean = stripHtml(t.Description || '');
      const isOverdue = t.DueDate && new Date(t.DueDate) < new Date();
      
      // Skip notifications that were read more than X minutes ago
      if (st?.IsRead && st.ReadDate && autoHideReadAfterMinutes > 0) {
        const readDate = new Date(st.ReadDate);
        const minutesSinceRead = (now.getTime() - readDate.getTime()) / (1000 * 60);
        if (minutesSinceRead > autoHideReadAfterMinutes) {
          return;
        }
      }

      notifications.push({
        id,
        type: 'task',
        title: t.Title,
        description: clean.substring(0, 100) + (clean.length > 100 ? '...' : ''),
        time: t.DueDate ? `Due ${getTimeAgo(t.DueDate)}` : 'No due date',
        status: t.Status,
        urgent: isOverdue || t.Priority === 'High' || t.Priority === 'Critical',
        isRead: st?.IsRead ?? false,
        readDate: st?.ReadDate,
        timestamp: new Date(t.Created || t.DueDate || now).getTime() // ✅ Add timestamp for sorting
      });
    });

    // ✅ UPDATED SORTING: Recent first, then by priority
    return notifications
      .sort((a, b) => {
        // 1. Unread first
        if (a.isRead !== b.isRead) return a.isRead ? 1 : -1;
        
        // 2. Within unread/read groups, urgent first
        if (a.urgent !== b.urgent) return a.urgent ? -1 : 1;
        
        // 3. Then by priority weight
        const weight = (n: INotificationWithStatus) =>
          n.priority === 'Highly Important' || n.priority === 'Critical'
            ? 3
            : n.priority === 'Important' || n.priority === 'High'
            ? 2
            : 1;
        const priorityDiff = weight(b) - weight(a);
        if (priorityDiff !== 0) return priorityDiff;
        
        // 4. ✅ FINALLY: Most recent first (higher timestamp = more recent)
        return (b.timestamp || 0) - (a.timestamp || 0);
      })
      .slice(0, maxNotifications);
  }
}