import { z } from 'zod';
import { NotificationEntity } from '../../domain/entities/notification.entity';
import { NotificationService } from '../../domain/services/notification.service';
import { WebSocketServer } from '@/shared/infrastructure/websocket/socket.server';
import { logger } from '@/shared/infrastructure/monitoring/logger';
import { GamificationEvents } from '../../domain/enums/websocket-events.enum';

export const CreateNotificationSchema = z.object({
  userId: z.string().cuid(),
  type: z.enum(['achievement', 'reminder', 'milestone', 'level_up', 'badge_unlock', 'streak_risk']),
  title: z.string().min(1).max(100),
  message: z.string().min(1).max(500),
  icon: z.string(),
  priority: z.enum(['low', 'medium', 'high']).default('medium'),
  category: z.string().optional(),
  metadata: z.record(z.any()).optional(),
  expiresAt: z.date().optional(),
});

export type CreateNotificationDTO = z.infer<typeof CreateNotificationSchema>;

export class CreateNotificationUseCase {
  constructor(
    private readonly notificationService: NotificationService,
    private readonly wsServer?: WebSocketServer
  ) {}

  async execute(input: CreateNotificationDTO): Promise<NotificationEntity> {
    const validated = CreateNotificationSchema.parse(input);
    const startTime = Date.now();

    logger.info({
      operation: 'create_notification_usecase_started',
      userId: validated.userId,
      type: validated.type
    }, 'Creating notification via use case');

    try {
      const notification = await this.notificationService.createNotification(validated);

      if (this.wsServer) {
        this.wsServer.emitToUser(validated.userId, GamificationEvents.NOTIFICATION, {
          notification: notification.toJSON(),
          timestamp: new Date()
        });
      }

      logger.info({
        operation: 'create_notification_usecase_completed',
        notificationId: notification.getId(),
        userId: validated.userId,
        processingTime: Date.now() - startTime
      }, 'Notification created and emitted');

      return notification;
    } catch (error) {
      logger.error({
        operation: 'create_notification_usecase_failed',
        userId: validated.userId,
        error: error instanceof Error ? error.message : 'Unknown error',
        processingTime: Date.now() - startTime
      }, 'Failed to create notification');
      throw error;
    }
  }
}