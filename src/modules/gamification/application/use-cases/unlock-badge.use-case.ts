import { z } from 'zod';
import { BadgeService } from '../../domain/services/badge.service';
import { AwardXPUseCase } from './award-xp.use-case';
import { WebSocketServer } from '@/shared/infrastructure/websocket/socket.server';
import { XPSource } from '@/shared/domain/enums';
import { logger } from '@/shared/infrastructure/monitoring/logger';

export const UnlockBadgeSchema = z.object({
  userId: z.string().cuid(),
  badgeId: z.string().cuid(),
});

export type UnlockBadgeDTO = z.infer<typeof UnlockBadgeSchema>;

export interface UnlockBadgeResult {
  badgeId: string;
  badgeKey: string;
  badgeName: string;
  xpAwarded: number;
  isFirstTime: boolean;
}

export class UnlockBadgeUseCase {
  constructor(
    private readonly badgeService: BadgeService,
    private readonly awardXPUseCase: AwardXPUseCase,
    private readonly wsServer?: WebSocketServer
  ) {}

  async execute(input: UnlockBadgeDTO): Promise<UnlockBadgeResult> {
    const { userId, badgeId } = UnlockBadgeSchema.parse(input);
    const startTime = Date.now();

    logger.info({ operation: 'unlock_badge_started', userId, badgeId }, 'Starting badge unlock');

    try {
      const badge = await this.badgeService.unlockBadge(userId, badgeId);
      
      const xpAwarded = badge.getXPReward();
      if (xpAwarded > 0) {
        await this.awardXPUseCase.execute({
          userId,
          source: XPSource.BADGE,
          sourceId: badgeId,
          baseAmount: xpAwarded,
          metadata: {
            badgeKey: badge.getKey(),
            badgeName: badge.getName(),
          },
        });
      }

      const result: UnlockBadgeResult = {
        badgeId: badge.getId(),
        badgeKey: badge.getKey(),
        badgeName: badge.getName(),
        xpAwarded,
        isFirstTime: true,
      };

      if (this.wsServer) {
        this.wsServer.emitToUser(userId, 'badge:unlocked', {
          badge: {
            id: badge.getId(),
            key: badge.getKey(),
            name: badge.getName(),
            description: badge.toJSON().description,
            rarity: badge.toJSON().rarity,
          },
          xpAwarded,
          timestamp: new Date(),
        });
      }

      logger.info({
        operation: 'unlock_badge_completed',
        userId,
        badgeKey: badge.getKey(),
        xpAwarded,
        processingTime: Date.now() - startTime,
      }, 'Badge unlocked successfully');

      return result;
    } catch (error) {
      logger.error({
        operation: 'unlock_badge_failed',
        userId,
        badgeId,
        error: error instanceof Error ? error.message : 'Unknown error',
        processingTime: Date.now() - startTime,
      }, 'Failed to unlock badge');
      throw error;
    }
  }
}