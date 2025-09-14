import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { WebSocketServer } from '@/shared/infrastructure/websocket/socket.server';
import { RedisCacheService } from '../services/cache.service';
import { BadgeRepository } from '../repositories/badge.repository';
import { XPRepository } from '../repositories/xp.repository';
import { LeaderboardRepository } from '../repositories/leaderboard.repository';
import { XPCalculatorService } from '../../domain/services/xp-calculator.service';
import { LevelProgressionService } from '../../domain/services/level-progression.service';
import { BadgeService } from '../../domain/services/badge.service';
import { LeaderboardService } from '../../domain/services/leaderboard.service';
import { AwardXPUseCase } from '../../application/use-cases/award-xp.use-case';
import { CalculateLevelUseCase } from '../../application/use-cases/calculate-level.use-case';
import { UnlockBadgeUseCase } from '../../application/use-cases/unlock-badge.use-case';
import { GetUserBadgesUseCase } from '../../application/use-cases/get-user-badges.use-case';
import { GetLeaderboardUseCase } from '../../application/use-cases/get-leaderboard.use-case'; 
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
  
  // Services
  const xpCalculator = new XPCalculatorService();
  const levelService = new LevelProgressionService();
  
  // Repositories
  const xpRepository = new XPRepository(options.prisma, levelService);
  const badgeRepository = new BadgeRepository(options.prisma, cacheService);
  const leaderboardRepository = new LeaderboardRepository(options.prisma);

  const badgeService = new BadgeService(badgeRepository, cacheService);
  const leaderboardService = new LeaderboardService(leaderboardRepository, cacheService);

  // Use Cases
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

  gamificationEvents.initialize(badgeService, unlockBadgeUseCase, leaderboardService, options.wsServer);

  fastify.decorate('gamification', {
    awardXP: awardXPUseCase,
    calculateLevel: calculateLevelUseCase,
    unlockBadge: unlockBadgeUseCase,
    getUserBadges: getUserBadgesUseCase,
    getLeaderboard: getLeaderboardUseCase,
    badgeService,
    leaderboardService
  });

  fastify.log.info('Gamification plugin registered successfully');
};

export default fp(gamificationPlugin, {
  name: 'gamification-plugin',
  dependencies: ['auth-plugin', 'websocket-plugin'],
});