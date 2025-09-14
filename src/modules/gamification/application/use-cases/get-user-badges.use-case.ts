import { z } from 'zod';
import { BadgeService } from '../../domain/services/badge.service';
import { BadgeEntity } from '../../domain/entities/badge.entity';
import { logger } from '@/shared/infrastructure/monitoring/logger';

export const GetUserBadgesSchema = z.object({
  userId: z.string().cuid(),
});

export type GetUserBadgesDTO = z.infer<typeof GetUserBadgesSchema>;

export interface UserBadgeStats {
  total: number;
  unlocked: number;
  byRarity: {
    COMMON: number;
    RARE: number;
    EPIC: number;
    LEGENDARY: number;
  };
  recentUnlocks: BadgeEntity[];
  nextToUnlock: BadgeEntity[];
}

export interface GetUserBadgesResult {
  unlocked: BadgeEntity[];
  locked: BadgeEntity[];
  stats: UserBadgeStats;
}

export class GetUserBadgesUseCase {
  constructor(private readonly badgeService: BadgeService) {}

  async execute(input: GetUserBadgesDTO): Promise<GetUserBadgesResult> {
    const { userId } = GetUserBadgesSchema.parse(input);
    const startTime = Date.now();
    
    logger.info({
      operation: 'get_user_badges_started',
      userId
    }, 'Getting user badges');

    try {
      const allBadges = await this.badgeService.getAllBadges();
      const userBadges = await this.badgeService.getUserBadges(userId);
      
      const unlockedBadgeIds = new Set(userBadges.map(b => b.getId()));
      
      const unlocked = userBadges;
      const locked = allBadges.filter(b => !unlockedBadgeIds.has(b.getId()));

      const stats = this.calculateStats(unlocked, locked);

      logger.info({
        operation: 'get_user_badges_completed',
        userId,
        unlockedCount: unlocked.length,
        lockedCount: locked.length,
        totalBadges: allBadges.length,
        processingTime: Date.now() - startTime
      }, 'User badges retrieved');

      return {
        unlocked,
        locked,
        stats
      };
    } catch (error) {
      logger.error({
        operation: 'get_user_badges_failed',
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
        processingTime: Date.now() - startTime
      }, 'Failed to get user badges');
      throw error;
    }
  }

  private calculateStats(unlocked: BadgeEntity[], locked: BadgeEntity[]): UserBadgeStats {
    const byRarity = {
      COMMON: 0,
      RARE: 0,
      EPIC: 0,
      LEGENDARY: 0,
    };

    unlocked.forEach(badge => {
      const rarity = badge.toJSON().rarity;
      if (rarity in byRarity) {
        byRarity[rarity as keyof typeof byRarity]++;
      }
    });

    const sortedUnlocked = [...unlocked].sort((a, b) => {
      const dateA = a.toJSON().unlockedAt?.getTime() || 0;
      const dateB = b.toJSON().unlockedAt?.getTime() || 0;
      return dateB - dateA;
    });

    return {
      total: unlocked.length + locked.length,
      unlocked: unlocked.length,
      byRarity,
      recentUnlocks: sortedUnlocked.slice(0, 5),
      nextToUnlock: locked.slice(0, 3),
    };
  }
}