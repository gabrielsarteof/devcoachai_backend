import { NotificationEntity } from '../entities/notification.entity';
import { INotificationRepository } from '../repositories/notification.repository.interface';
import { ICacheService } from '../../infrastructure/services/cache.service';
import { logger } from '@/shared/infrastructure/monitoring/logger';

export interface CreateNotificationData {
  userId: string;
  type: 'achievement' | 'reminder' | 'milestone' | 'level_up' | 'badge_unlock' | 'streak_risk';
  title: string;
  message: string;
  icon: string;
  priority?: 'low' | 'medium' | 'high';
  category?: string;
  metadata?: Record<string, any>;
  actions?: Array<{
    id: string;
    label: string;
    type: 'button' | 'link';
    action: string;
    style: 'primary' | 'secondary' | 'danger';
  }>;
  expiresAt?: Date;
}

export class NotificationService {
  private readonly CACHE_TTL = 1800;

  constructor(
    private readonly repository: INotificationRepository,
    private readonly cache: ICacheService
  ) {}

  async createNotification(data: CreateNotificationData): Promise<NotificationEntity> {
    const startTime = Date.now();
    logger.info({ operation: 'create_notification_started', userId: data.userId, type: data.type }, 'Creating notification');

    try {
      const notification = NotificationEntity.create({
        ...data,
        priority: data.priority || 'medium',
      });

      await this.repository.create(notification);
      await this.invalidateUserCache(data.userId);

      logger.info({
        operation: 'create_notification_completed',
        notificationId: notification.getId(),
        userId: data.userId,
        processingTime: Date.now() - startTime
      }, 'Notification created successfully');

      return notification;
    } catch (error) {
      logger.error({
        operation: 'create_notification_failed',
        userId: data.userId,
        error: error instanceof Error ? error.message : 'Unknown error',
        processingTime: Date.now() - startTime
      }, 'Failed to create notification');
      throw error;
    }
  }

  async getUserNotifications(userId: string, options: {
    unreadOnly?: boolean;
    limit?: number;
    offset?: number;
  } = {}): Promise<NotificationEntity[]> {
    const cacheKey = `user:${userId}:notifications:${JSON.stringify(options)}`;
    let notifications = await this.cache.get<NotificationEntity[]>(cacheKey);
    
    if (!notifications) {
      notifications = await this.repository.findByUserId({
        userId,
        unreadOnly: options.unreadOnly,
        limit: options.limit || 20,
        offset: options.offset || 0,
      });
      
      await this.cache.set(cacheKey, notifications, this.CACHE_TTL);
    }
    
    return notifications.filter(n => n.shouldShow());
  }

  async markAsRead(notificationId: string, userId: string): Promise<void> {
    await this.repository.markAsRead(notificationId, userId);
    await this.invalidateUserCache(userId);
  }

  async getUnreadCount(userId: string): Promise<number> {
    const cacheKey = `user:${userId}:unread_count`;
    let count = await this.cache.get<number>(cacheKey);
    
    if (count === null) {
      count = await this.repository.countUnread(userId);
      await this.cache.set(cacheKey, count, 300);
    }
    
    return count;
  }

  async cleanupExpiredNotifications(): Promise<number> {
    return this.repository.deleteExpired();
  }

  async createLevelUpNotification(userId: string, level: number, perks: string[]): Promise<NotificationEntity> {
    return this.createNotification({
      userId,
      type: 'level_up',
      title: `Parabéns! Nível ${level} alcançado!`,
      message: `Você desbloqueou: ${perks.join(', ')}`,
      icon: 'trophy',
      priority: 'high',
      category: 'progression',
      metadata: { level, perks },
    });
  }

  async createBadgeUnlockedNotification(userId: string, badgeData: {
    name: string;
    description: string;
    rarity: string;
    xpReward: number;
  }): Promise<NotificationEntity> {
    return this.createNotification({
      userId,
      type: 'badge_unlock',
      title: `Badge Desbloqueado: ${badgeData.name}`,
      message: `${badgeData.description} (+${badgeData.xpReward} XP)`,
      icon: 'badge',
      priority: badgeData.rarity === 'LEGENDARY' ? 'high' : 'medium',
      category: 'achievement',
      metadata: badgeData,
    });
  }

  private async invalidateUserCache(userId: string): Promise<void> {
    const patterns = [`user:${userId}:notifications*`, `user:${userId}:unread_count`];
    
    for (const pattern of patterns) {
      const keys = await this.cache.keys(pattern);
      for (const key of keys) {
        await this.cache.del(key.replace('gamification:', ''));
      }
    }
  }
}