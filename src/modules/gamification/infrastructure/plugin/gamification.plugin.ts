import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { WebSocketServer } from '@/shared/infrastructure/websocket/socket.server';
import { RedisCacheService } from '../services/cache.service';
import { BadgeRepository } from '../repositories/badge.repository';
import { XPRepository } from '../repositories/xp.repository';
import { LeaderboardRepository } from '../repositories/leaderboard.repository';
import { NotificationRepository } from '../repositories/notification.repository';
import { StreakRepository } from '../repositories/streak.repository';
import { XPCalculatorService } from '../../domain/services/xp-calculator.service';
import { LevelProgressionService } from '../../domain/services/level-progression.service';
import { BadgeService } from '../../domain/services/badge.service';
import { LeaderboardService } from '../../domain/services/leaderboard.service';
import { NotificationService } from '../../domain/services/notification.service';
import { StreakManagerService } from '../../domain/services/streak-manager.service';
import { AwardXPUseCase } from '../../application/use-cases/award-xp.use-case';
import { CalculateLevelUseCase } from '../../application/use-cases/calculate-level.use-case';
import { UnlockBadgeUseCase } from '../../application/use-cases/unlock-badge.use-case';
import { GetUserBadgesUseCase } from '../../application/use-cases/get-user-badges.use-case';
import { GetLeaderboardUseCase } from '../../application/use-cases/get-leaderboard.use-case';
import { GetDashboardUseCase } from '../../application/use-cases/get-dashboard.use-case';
import { CreateNotificationUseCase } from '../../application/use-cases/create-notification.use-case';
import { AcknowledgeNotificationUseCase } from '../../application/use-cases/acknowledge-notification.use-case';
import { GetStreakStatusUseCase } from '../../application/use-cases/get-streak-status.use-case';
import { UpdateStreakUseCase } from '../../application/use-cases/update-streak.use-case';  
import { FreezeStreakUseCase } from '../../application/use-cases/freeze-streak.use-case';
import { GamificationGateway } from '../../presentation/gateways/gamification.gateway';
import { GamificationController } from '../../presentation/controllers/gamification.controller';
import { gamificationEvents } from '../events/gamification-events';

export interface GamificationPluginOptions {
  prisma: PrismaClient;
  redis: Redis;
  wsServer: WebSocketServer;
}

const gamificationPlugin: FastifyPluginAsync<GamificationPluginOptions> = async function (
  fastify: FastifyInstance,
  options: GamificationPluginOptions
): Promise<void> {
  const cacheService = new RedisCacheService(options.redis);
  
  const xpCalculator = new XPCalculatorService();
  const levelService = new LevelProgressionService();
  
  const xpRepository = new XPRepository(options.prisma, levelService);
  const badgeRepository = new BadgeRepository(options.prisma, cacheService);
  const leaderboardRepository = new LeaderboardRepository(options.prisma);
  const notificationRepository = new NotificationRepository(options.prisma);
  const streakRepository = new StreakRepository(options.prisma);

  const badgeService = new BadgeService(badgeRepository, cacheService);
  const leaderboardService = new LeaderboardService(leaderboardRepository, cacheService);
  const notificationService = new NotificationService(notificationRepository, cacheService);
  const streakManager = new StreakManagerService(streakRepository, cacheService);

  const awardXPUseCase = new AwardXPUseCase(
    xpRepository,
    xpCalculator,
    options.wsServer
  );

  const calculateLevelUseCase = new CalculateLevelUseCase(
    levelService,
    xpRepository
  );

  const unlockBadgeUseCase = new UnlockBadgeUseCase(
    badgeService,
    awardXPUseCase,
    options.wsServer
  );

  const getUserBadgesUseCase = new GetUserBadgesUseCase(badgeService);
  const getLeaderboardUseCase = new GetLeaderboardUseCase(leaderboardService);
  
  const getDashboardUseCase = new GetDashboardUseCase(
    badgeService,
    leaderboardService,
    streakManager,
    levelService,
    notificationService,
    xpRepository,
    cacheService
  );

  const createNotificationUseCase = new CreateNotificationUseCase(notificationService, options.wsServer);
  const acknowledgeNotificationUseCase = new AcknowledgeNotificationUseCase(notificationService);

  const getStreakStatusUseCase = new GetStreakStatusUseCase(streakManager);
  const updateStreakUseCase = new UpdateStreakUseCase(streakManager);
  const freezeStreakUseCase = new FreezeStreakUseCase(streakManager);

  const controller = new GamificationController(
    getDashboardUseCase,
    getUserBadgesUseCase,
    getLeaderboardUseCase,
    getStreakStatusUseCase,
    createNotificationUseCase,
    acknowledgeNotificationUseCase,
    notificationService
  );

  new GamificationGateway(
    options.wsServer.getIO(),
    getDashboardUseCase,
    acknowledgeNotificationUseCase,
    notificationService
  );

  gamificationEvents.initialize(badgeService, unlockBadgeUseCase, leaderboardService, options.wsServer);

  await fastify.register(async function (fastify) {
    fastify.get('/dashboard', {
      preHandler: fastify.authenticate,
      handler: controller.getDashboard.bind(controller)
    });

    fastify.get('/badges', {
      preHandler: fastify.authenticate,
      handler: controller.getUserBadges.bind(controller)
    });

    fastify.get('/leaderboard', {
      preHandler: fastify.authenticate,
      handler: controller.getLeaderboard.bind(controller)
    });

    fastify.get('/streak', {
      preHandler: fastify.authenticate,
      handler: controller.getStreakStatus.bind(controller)
    });

    fastify.get('/notifications', {
      preHandler: fastify.authenticate,
      handler: controller.getUserNotifications.bind(controller)
    });

    fastify.post('/notifications/:notificationId/acknowledge', {
      preHandler: fastify.authenticate,
      handler: controller.acknowledgeNotification.bind(controller)
    });

    fastify.post('/notifications', {
      preHandler: fastify.authenticate,
      handler: controller.createNotification.bind(controller)
    });
  }, { prefix: '/gamification' });

  // Decorações para uso em outros módulos
  fastify.decorate('gamification', {
    awardXP: awardXPUseCase,
    calculateLevel: calculateLevelUseCase,
    unlockBadge: unlockBadgeUseCase,
    getUserBadges: getUserBadgesUseCase,
    getLeaderboard: getLeaderboardUseCase,
    getDashboard: getDashboardUseCase,
    createNotification: createNotificationUseCase,
    acknowledgeNotification: acknowledgeNotificationUseCase,
    getStreakStatus: getStreakStatusUseCase,
    updateStreak: updateStreakUseCase,
    freezeStreak: freezeStreakUseCase,
    
    // Services para uso direto
    badgeService,
    leaderboardService,
    notificationService,
    streakManager,
    controller
  });

  fastify.log.info('Gamification plugin registered successfully with WebSocket integration');
};

export default fp(gamificationPlugin, {
  name: 'gamification-plugin',
});