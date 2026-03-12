export interface IUserNotificationStatus {
  Id: number;
  UserId: number;
  NotificationId: string;
  NotificationType: string;
  IsRead: boolean;
  ReadDate?: string;
  Created: string;
}

export interface INotificationWithStatus {
  id: string;
  type: string;
  title: string;
  description?: string;
  time: string;
  priority?: string;
  status?: string;
  urgent: boolean;
  isRead: boolean;
  readDate?: string;
  timestamp?: number; // ✅ Add this line
}