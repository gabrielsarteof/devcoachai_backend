import { FastifyRequest, FastifyReply } from 'fastify';
import { GetDashboardUseCase, GetDashboardSchema } from '../../application/use-cases/get-dashboard.use-case';
import { GetUserBadgesUseCase } from '../../application/use-cases/get-user-badges.use-case';
import { GetLeaderboardUseCase } from '../../application/use-cases/get-leaderboard.use-case';
import { GetStreakStatusUseCase } from '../../application/use-cases/get-streak-status.use-case';
import { CreateNotificationUseCase, CreateNotificationSchema } from '../../application/use-cases/create-notification.use-case';
import { AcknowledgeNotificationUseCase, AcknowledgeNotificationSchema } from '../../application/use-cases/acknowledge-notification.use-case';
import { NotificationService } from '../../domain/services/notification.service';
import { logger } from '@/shared/infrastructure/monitoring/logger';

interface AuthenticatedRequest extends FastifyRequest {
  user: { id: string; email: string; role: string; };
}

export class GamificationController {
  constructor(
    private readonly getDashboardUseCase: GetDashboardUseCase,
    private readonly getUserBadgesUseCase: GetUserBadgesUseCase,
    private readonly getLeaderboardUseCase: GetLeaderboardUseCase,
    private readonly getStreakStatusUseCase: GetStreakStatusUseCase,
    private readonly createNotificationUseCase: CreateNotificationUseCase,
    private readonly acknowledgeNotificationUseCase: AcknowledgeNotificationUseCase,
    private readonly notificationService: NotificationService
  ) {}

  async getDashboard(request: AuthenticatedRequest, reply: FastifyReply): Promise<void> {
    const startTime = Date.now();
    const userId = request.user.id;

    try {
      const query = request.query as { includeDetails?: string; period?: string };
      const input = GetDashboardSchema.parse({ 
        userId, 
        includeDetails: query.includeDetails === 'true',
        period: query.period || 'all-time'
      });
      
      const dashboard = await this.getDashboardUseCase.execute(input);

      logger.info({ 
        operation: 'get_dashboard_controller_completed', 
        userId, 
        processingTime: Date.now() - startTime 
      }, 'Dashboard retrieved via REST API');

      reply.send({ success: true, data: dashboard, timestamp: new Date() });
    } catch (error) {
      logger.error({ 
        operation: 'get_dashboard_controller_failed', 
        userId, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }, 'Failed to get dashboard via REST API');
      reply.status(500).send({ success: false, error: 'Failed to get dashboard', timestamp: new Date() });
    }
  }

  async getUserBadges(request: AuthenticatedRequest, reply: FastifyReply): Promise<void> {
    const userId = request.user.id;

    try {
      const result = await this.getUserBadgesUseCase.execute({ userId });
      reply.send({ success: true, data: result, timestamp: new Date() });
    } catch (error) {
      logger.error({ operation: 'get_user_badges_controller_failed', userId, error: error instanceof Error ? error.message : 'Unknown error' }, 'Failed to get user badges');
      reply.status(500).send({ success: false, error: 'Failed to get badges', timestamp: new Date() });
    }
  }

  async getLeaderboard(request: AuthenticatedRequest, reply: FastifyReply): Promise<void> {
    try {
      const query = (request.query || {}) as any;
      const result = await this.getLeaderboardUseCase.execute(query);
      reply.send({ success: true, data: result, timestamp: new Date() });
    } catch (error) {
      logger.error({ operation: 'get_leaderboard_controller_failed', error: error instanceof Error ? error.message : 'Unknown error' }, 'Failed to get leaderboard');
      reply.status(500).send({ success: false, error: 'Failed to get leaderboard', timestamp: new Date() });
    }
  }

  async getStreakStatus(request: AuthenticatedRequest, reply: FastifyReply): Promise<void> {
    const userId = request.user.id;

    try {
      const result = await this.getStreakStatusUseCase.execute({ userId });
      reply.send({ success: true, data: result, timestamp: new Date() });
    } catch (error) {
      logger.error({ operation: 'get_streak_status_controller_failed', userId, error: error instanceof Error ? error.message : 'Unknown error' }, 'Failed to get streak status');
      reply.status(500).send({ success: false, error: 'Failed to get streak status', timestamp: new Date() });
    }
  }

  async getUserNotifications(request: AuthenticatedRequest, reply: FastifyReply): Promise<void> {
    const userId = request.user.id;
    const query = request.query as any;

    try {
      const notifications = await this.notificationService.getUserNotifications(userId, {
        unreadOnly: query.unreadOnly === 'true',
        limit: query.limit ? parseInt(query.limit) : 20,
        offset: query.offset ? parseInt(query.offset) : 0
      });

      const unreadCount = await this.notificationService.getUnreadCount(userId);

      reply.send({
        success: true,
        data: {
          notifications: notifications.map(n => n.toJSON()),
          unreadCount,
          hasMore: notifications.length === (query.limit ? parseInt(query.limit) : 20)
        },
        timestamp: new Date()
      });
    } catch (error) {
      logger.error({ operation: 'get_user_notifications_controller_failed', userId, error: error instanceof Error ? error.message : 'Unknown error' }, 'Failed to get user notifications');
      reply.status(500).send({ success: false, error: 'Failed to get notifications', timestamp: new Date() });
    }
  }

  async acknowledgeNotification(request: AuthenticatedRequest, reply: FastifyReply): Promise<void> {
    const userId = request.user.id;
    const { notificationId } = request.params as { notificationId: string };

    try {
      const input = AcknowledgeNotificationSchema.parse({
        userId,
        notificationId,
        actionTaken: (request.body as any)?.actionTaken
      });

      await this.acknowledgeNotificationUseCase.execute(input);
      reply.send({ success: true, message: 'Notification acknowledged', timestamp: new Date() });
    } catch (error) {
      logger.error({ operation: 'acknowledge_notification_controller_failed', userId, notificationId, error: error instanceof Error ? error.message : 'Unknown error' }, 'Failed to acknowledge notification');
      reply.status(500).send({ success: false, error: 'Failed to acknowledge notification', timestamp: new Date() });
    }
  }

  async createNotification(request: AuthenticatedRequest, reply: FastifyReply): Promise<void> {
    try {
      const input = CreateNotificationSchema.parse(request.body);
      const notification = await this.createNotificationUseCase.execute(input);
      reply.status(201).send({ success: true, data: notification.toJSON(), timestamp: new Date() });
    } catch (error) {
      logger.error({ operation: 'create_notification_controller_failed', error: error instanceof Error ? error.message : 'Unknown error' }, 'Failed to create notification');
      reply.status(500).send({ success: false, error: 'Failed to create notification', timestamp: new Date() });
    }
  }
}