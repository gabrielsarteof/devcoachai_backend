import { FastifyRequest, FastifyReply } from 'fastify';
import { GetDashboardUseCase, GetDashboardSchema } from '../../application/use-cases/get-dashboard.use-case';
import { GetUserBadgesUseCase } from '../../application/use-cases/get-user-badges.use-case';
import { GetLeaderboardUseCase } from '../../application/use-cases/get-leaderboard.use-case';
import { GetStreakStatusUseCase } from '../../application/use-cases/get-streak-status.use-case';
import { CreateNotificationUseCase, CreateNotificationSchema } from '../../application/use-cases/create-notification.use-case';
import { AcknowledgeNotificationUseCase, AcknowledgeNotificationSchema } from '../../application/use-cases/acknowledge-notification.use-case';
import { NotificationService } from '../../domain/services/notification.service';
import { GamificationError, ValidationError } from '../../domain/errors';
import { ZodError } from 'zod';
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

  private async getUserData(userId: string): Promise<{ companyId?: string } | null> {
    try {
      const { PrismaClient } = await import('@prisma/client');
      const prisma = new PrismaClient();
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { companyId: true }
      });
      await prisma.$disconnect();
      return user;
    } catch {
      return null;
    }
  }

  async getDashboard(request: AuthenticatedRequest, reply: FastifyReply): Promise<void> {
    const userId = request.user.id;

    try {
      const query = request.query as { includeDetails?: string; period?: string };
      const input = GetDashboardSchema.parse({
        userId,
        includeDetails: query.includeDetails === 'true',
        period: query.period || 'all-time'
      });

      const dashboard = await this.getDashboardUseCase.execute(input);

      return reply.status(200).send({
        success: true,
        data: dashboard
      });
    } catch (error) {
      if (error instanceof ZodError) {
        const validationError = new ValidationError(error);
        return reply.status(validationError.statusCode).send(validationError.toJSON());
      }

      if (error instanceof GamificationError) {
        return reply.status(error.statusCode).send(error.toJSON());
      }

      return reply.status(500).send({
        error: 'Internal server error',
        message: 'Failed to get dashboard',
      });
    }
  }

  async getUserBadges(request: AuthenticatedRequest, reply: FastifyReply): Promise<void> {
    const userId = request.user.id;

    try {
      const result = await this.getUserBadgesUseCase.execute({ userId });

      return reply.status(200).send({
        success: true,
        data: result
      });
    } catch (error) {
      if (error instanceof ZodError) {
        const validationError = new ValidationError(error);
        return reply.status(validationError.statusCode).send(validationError.toJSON());
      }

      if (error instanceof GamificationError) {
        return reply.status(error.statusCode).send(error.toJSON());
      }

      return reply.status(500).send({
        error: 'Internal server error',
        message: 'Failed to get badges',
      });
    }
  }

  async getLeaderboard(request: AuthenticatedRequest, reply: FastifyReply): Promise<void> {
    try {
      const query = (request.query || {}) as any;

      // Convert string query parameters to correct types
      const processedQuery = {
        ...query,
        page: query.page ? parseInt(query.page) : undefined,
        limit: query.limit ? parseInt(query.limit) : undefined,
      };

      // Auto-populate scopeId for COMPANY scope before validation
      if (processedQuery.scope === 'COMPANY' && !processedQuery.scopeId) {
        const userData = await this.getUserData(request.user.id);
        if (userData?.companyId) {
          processedQuery.scopeId = userData.companyId;
        }
      }

      const queryWithUser = {
        ...processedQuery,
        includeUser: request.user.id
      };

      const result = await this.getLeaderboardUseCase.execute(queryWithUser);

      return reply.status(200).send({
        success: true,
        data: result
      });
    } catch (error) {
      if (error instanceof ZodError) {
        const validationError = new ValidationError(error);
        return reply.status(validationError.statusCode).send(validationError.toJSON());
      }

      if (error instanceof GamificationError) {
        return reply.status(error.statusCode).send(error.toJSON());
      }

      return reply.status(500).send({
        error: 'Internal server error',
        message: 'Failed to get leaderboard',
      });
    }
  }

  async getStreakStatus(request: AuthenticatedRequest, reply: FastifyReply): Promise<void> {
    const userId = request.user.id;

    try {
      const result = await this.getStreakStatusUseCase.execute({ userId });

      return reply.status(200).send({
        success: true,
        data: result
      });
    } catch (error) {
      if (error instanceof ZodError) {
        const validationError = new ValidationError(error);
        return reply.status(validationError.statusCode).send(validationError.toJSON());
      }

      if (error instanceof GamificationError) {
        return reply.status(error.statusCode).send(error.toJSON());
      }

      return reply.status(500).send({
        error: 'Internal server error',
        message: 'Failed to get streak status',
      });
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

      return reply.status(200).send({
        success: true,
        data: {
          notifications: notifications.map(n => n.toJSON()),
          unreadCount,
          hasMore: notifications.length === (query.limit ? parseInt(query.limit) : 20)
        }
      });
    } catch (error) {
      if (error instanceof ZodError) {
        const validationError = new ValidationError(error);
        return reply.status(validationError.statusCode).send(validationError.toJSON());
      }

      if (error instanceof GamificationError) {
        return reply.status(error.statusCode).send(error.toJSON());
      }

      return reply.status(500).send({
        error: 'Internal server error',
        message: 'Failed to get notifications',
      });
    }
  }

  async acknowledgeNotification(request: AuthenticatedRequest, reply: FastifyReply): Promise<void> {
    const userId = request.user.id;
    const { notificationId } = request.params as { notificationId: string };

    try {
      const body = request.body as { actionTaken?: string } | null;
      const input = AcknowledgeNotificationSchema.parse({
        userId,
        notificationId,
        actionTaken: body?.actionTaken
      });

      await this.acknowledgeNotificationUseCase.execute(input);

      return reply.status(200).send({
        success: true,
        data: { message: 'Notification acknowledged' }
      });
    } catch (error) {
      if (error instanceof ZodError) {
        const validationError = new ValidationError(error);
        return reply.status(validationError.statusCode).send(validationError.toJSON());
      }

      if (error instanceof GamificationError) {
        return reply.status(error.statusCode).send(error.toJSON());
      }

      return reply.status(500).send({
        error: 'Internal server error',
        message: 'Failed to acknowledge notification',
      });
    }
  }

  async createNotification(request: AuthenticatedRequest, reply: FastifyReply): Promise<void> {
    if (request.user.role !== 'TECH_LEAD' && request.user.role !== 'SENIOR') {
      return reply.status(403).send({
        error: 'Forbidden',
        code: 'INSUFFICIENT_PERMISSIONS',
        statusCode: 403,
        message: 'Only admin users can create notifications'
      });
    }

    try {
      const input = CreateNotificationSchema.parse(request.body);
      const notification = await this.createNotificationUseCase.execute(input);

      return reply.status(201).send({
        success: true,
        data: notification.toJSON()
      });
    } catch (error) {
      if (error instanceof ZodError) {
        const validationError = new ValidationError(error);
        return reply.status(validationError.statusCode).send(validationError.toJSON());
      }

      if (error instanceof GamificationError) {
        return reply.status(error.statusCode).send(error.toJSON());
      }

      return reply.status(500).send({
        error: 'Internal server error',
        message: 'Failed to create notification',
      });
    }
  }
}