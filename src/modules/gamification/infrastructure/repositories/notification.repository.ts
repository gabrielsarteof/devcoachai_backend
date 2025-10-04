import { PrismaClient } from '@prisma/client';
import { NotificationEntity } from '../../domain/entities/notification.entity';
import { INotificationRepository, NotificationQuery } from '../../domain/repositories/notification.repository.interface';
import { NotificationNotFoundError } from '../../domain/errors';
import { logger } from '@/shared/infrastructure/monitoring/logger';

export class NotificationRepository implements INotificationRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(notification: NotificationEntity): Promise<void> {
    const data = notification.toPrismaCreate();
    await this.prisma.notification.create({ data });
    logger.info({ notificationId: notification.getId(), userId: notification.getUserId() }, 'Notification created in database');
  }

  async findById(id: string): Promise<NotificationEntity | null> {
    const notification = await this.prisma.notification.findUnique({ where: { id } });
    return notification ? NotificationEntity.fromPersistence(notification) : null;
  }

  async findByUserId(query: NotificationQuery): Promise<NotificationEntity[]> {
    const whereClause: any = { userId: query.userId };

    if (query.type?.length) whereClause.type = { in: query.type };
    if (query.priority?.length) whereClause.priority = { in: query.priority };
    if (query.category) whereClause.category = query.category;
    if (query.unreadOnly) whereClause.readAt = null;

    whereClause.OR = [
      { expiresAt: null },
      { expiresAt: { gt: new Date() } }
    ];

    const notifications = await this.prisma.notification.findMany({
      where: whereClause,
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
      take: query.limit || 20,
      skip: query.offset || 0,
    });

    return notifications.map(n => NotificationEntity.fromPersistence(n));
  }

  async markAsRead(id: string, userId: string): Promise<void> {
    const notification = await this.prisma.notification.findFirst({
      where: { id, userId }
    });

    if (!notification) {
      throw new NotificationNotFoundError();
    }

    await this.prisma.notification.updateMany({
      where: { id, userId, readAt: null },
      data: { readAt: new Date() },
    });
  }

  async markAllAsRead(userId: string): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
  }

  async deleteExpired(): Promise<number> {
    const result = await this.prisma.notification.deleteMany({
      where: { expiresAt: { lt: new Date() } }
    });
    logger.info({ count: result.count }, 'Expired notifications deleted');
    return result.count;
  }

  async countUnread(userId: string): Promise<number> {
    return this.prisma.notification.count({
      where: {
        userId,
        readAt: null,
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } }
        ]
      }
    });
  }
}