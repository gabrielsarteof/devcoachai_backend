import { NotificationEntity } from '../entities/notification.entity';
export interface NotificationQuery {
  userId: string;
  type?: string[];
  priority?: string[];
  category?: string;
  unreadOnly?: boolean;
  limit?: number;
  offset?: number;
}

export interface INotificationRepository {
  create(notification: NotificationEntity): Promise<void>;
  findById(id: string): Promise<NotificationEntity | null>;
  findByUserId(query: NotificationQuery): Promise<NotificationEntity[]>;
  markAsRead(id: string, userId: string): Promise<void>;
  markAllAsRead(userId: string): Promise<void>;
  deleteExpired(): Promise<number>;
  countUnread(userId: string): Promise<number>;
}