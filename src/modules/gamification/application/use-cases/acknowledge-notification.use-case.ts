import { z } from 'zod';
import { NotificationService } from '../../domain/services/notification.service';
import { logger } from '@/shared/infrastructure/monitoring/logger';

export const AcknowledgeNotificationSchema = z.object({
  notificationId: z.string().cuid(),
  userId: z.string().cuid(),
  actionTaken: z.string().optional(),
});

export type AcknowledgeNotificationDTO = z.infer<typeof AcknowledgeNotificationSchema>;

export class AcknowledgeNotificationUseCase {
  constructor(private readonly notificationService: NotificationService) {}

  async execute(input: AcknowledgeNotificationDTO): Promise<void> {
    const { notificationId, userId, actionTaken } = AcknowledgeNotificationSchema.parse(input);
    const startTime = Date.now();

    logger.info({ operation: 'acknowledge_notification_started', notificationId, userId, actionTaken }, 'Acknowledging notification');

    try {
      await this.notificationService.markAsRead(notificationId, userId);

      logger.info({
        operation: 'acknowledge_notification_completed',
        notificationId,
        userId,
        processingTime: Date.now() - startTime
      }, 'Notification acknowledged');
    } catch (error) {
      logger.error({
        operation: 'acknowledge_notification_failed',
        notificationId,
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
        processingTime: Date.now() - startTime
      }, 'Failed to acknowledge notification');
      throw error;
    }
  }
}