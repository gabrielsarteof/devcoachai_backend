import { Server as SocketServer, Socket } from 'socket.io';
import { GetDashboardUseCase, GetDashboardSchema } from '../../application/use-cases/get-dashboard.use-case';
import { AcknowledgeNotificationUseCase, AcknowledgeNotificationSchema } from '../../application/use-cases/acknowledge-notification.use-case';
import { NotificationService } from '../../domain/services/notification.service';
import { GamificationEvents } from '../../domain/enums/websocket-events.enum';
import { logger } from '@/shared/infrastructure/monitoring/logger';

export class GamificationGateway {
  constructor(
    private readonly io: SocketServer,
    private readonly getDashboardUseCase: GetDashboardUseCase,
    private readonly acknowledgeNotificationUseCase: AcknowledgeNotificationUseCase,
    private readonly notificationService: NotificationService
  ) {
    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.io.on('connection', (socket: Socket) => {
      const userId = socket.data?.userId;
      if (!userId) {
        logger.warn({ socketId: socket.id }, 'Socket connected without userId');
        return;
      }

      logger.info({ operation: 'gamification_socket_connected', socketId: socket.id, userId }, 'Gamification socket connected');

      socket.on(GamificationEvents.SUBSCRIBE_UPDATES, async () => {
        try {
          socket.join(`gamification:${userId}`);
          socket.emit('subscribed', { timestamp: new Date() });

          const unreadNotifications = await this.notificationService.getUserNotifications(userId, { unreadOnly: true, limit: 10 });
          for (const notification of unreadNotifications) {
            socket.emit(GamificationEvents.NOTIFICATION, {
              notification: notification.toJSON(),
              timestamp: new Date()
            });
          }

          logger.info({ socketId: socket.id, userId, unreadNotifications: unreadNotifications.length }, 'User subscribed to gamification updates');
        } catch (error) {
          logger.error({ socketId: socket.id, userId, error: error instanceof Error ? error.message : 'Unknown error' }, 'Failed to handle subscribe updates');
          socket.emit('error', { event: GamificationEvents.SUBSCRIBE_UPDATES, message: 'Failed to subscribe to updates' });
        }
      });

      socket.on(GamificationEvents.GET_DASHBOARD, async (data) => {
        try {
          const validated = GetDashboardSchema.parse({ userId, ...data });
          const dashboard = await this.getDashboardUseCase.execute(validated);
          socket.emit('dashboard', { dashboard, timestamp: new Date() });
          logger.debug({ socketId: socket.id, userId }, 'Dashboard data sent to client');
        } catch (error) {
          logger.error({ socketId: socket.id, userId, error: error instanceof Error ? error.message : 'Unknown error' }, 'Failed to handle get dashboard');
          socket.emit('error', { event: GamificationEvents.GET_DASHBOARD, message: 'Failed to get dashboard' });
        }
      });

      socket.on(GamificationEvents.ACKNOWLEDGE_NOTIFICATION, async (data) => {
        try {
          const validated = AcknowledgeNotificationSchema.parse({ userId, ...data });
          await this.acknowledgeNotificationUseCase.execute(validated);
          socket.emit('notification_acknowledged', { notificationId: validated.notificationId, timestamp: new Date() });
          logger.info({ socketId: socket.id, userId, notificationId: validated.notificationId }, 'Notification acknowledged via WebSocket');
        } catch (error) {
          logger.error({ socketId: socket.id, userId, error: error instanceof Error ? error.message : 'Unknown error' }, 'Failed to acknowledge notification');
          socket.emit('error', { event: GamificationEvents.ACKNOWLEDGE_NOTIFICATION, message: 'Failed to acknowledge notification' });
        }
      });

      socket.on('disconnect', () => {
        logger.info({ socketId: socket.id, userId }, 'Gamification socket disconnected');
      });
    });
  }
}