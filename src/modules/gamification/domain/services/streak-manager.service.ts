import { StreakEntity, StreakActivityData, StreakConfig } from '../entities/streak.entity';
import { IStreakRepository } from '../repositories/streak.repository.interface';
import { ICacheService } from '../../infrastructure/services/cache.service';
import { logger } from '@/shared/infrastructure/monitoring/logger';

export class StreakManagerService {
  private readonly config: StreakConfig = {
    minXpForStreak: 5,
    minTimeForStreak: 300,
    graceHours: 4,
    freezeLimit: 2,
    weekendProtection: true,
  };

  private readonly CACHE_TTL = 3600; 

  constructor(
    private readonly repository: IStreakRepository,
    private readonly cache: ICacheService
  ) {}

  async updateStreak(userId: string, activityData: StreakActivityData): Promise<StreakEntity> {
    const startTime = Date.now();
    
    logger.info({
      operation: 'update_streak_started',
      userId,
      activityData
    }, 'Starting streak update');

    try {
      let streak = await this.getOrCreateStreak(userId);
      
      const wasUpdated = streak.updateActivity(activityData, this.config);
      
      if (wasUpdated) {
        await this.repository.save(streak);
        await this.invalidateCache(userId);

        logger.info({
          operation: 'streak_updated_successfully',
          userId,
          currentStreak: streak.getCurrentStreak(),
          processingTime: Date.now() - startTime
        }, 'Streak updated successfully');
      }

      return streak;
    } catch (error) {
      logger.error({
        operation: 'update_streak_failed',
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
        processingTime: Date.now() - startTime
      }, 'Failed to update streak');
      throw error;
    }
  }

  async freezeStreak(userId: string): Promise<{ success: boolean; freezesRemaining: number }> {
    const startTime = Date.now();
    
    logger.info({
      operation: 'freeze_streak_started',
      userId
    }, 'Starting streak freeze');

    try {
      const streak = await this.repository.findByUserId(userId);
      
      if (!streak) {
        throw new Error('Streak not found');
      }

      const success = streak.freeze();
      
      if (success) {
        await this.repository.save(streak);
        await this.invalidateCache(userId);
      }

      const freezesRemaining = streak.getFreezesAvailable();

      logger.info({
        operation: 'freeze_streak_completed',
        userId,
        success,
        freezesRemaining,
        processingTime: Date.now() - startTime
      }, 'Streak freeze completed');

      return { success, freezesRemaining };
    } catch (error) {
      logger.error({
        operation: 'freeze_streak_failed',
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
        processingTime: Date.now() - startTime
      }, 'Failed to freeze streak');
      throw error;
    }
  }

  async getStreakStatus(userId: string): Promise<{
    currentStreak: number;
    longestStreak: number;
    status: string;
    nextMilestone: number;
    daysUntilMilestone: number;
    freezesAvailable: number;
    willExpireAt: Date;
    lastActivityDate: Date;
  }> {
    const streak = await this.getOrCreateStreak(userId);
    
    return {
      currentStreak: streak.getCurrentStreak(),
      longestStreak: streak.toJSON().longestStreak,
      status: streak.toJSON().status,
      nextMilestone: streak.getNextMilestone(),
      daysUntilMilestone: streak.getDaysUntilMilestone(),
      freezesAvailable: streak.getFreezesAvailable(),
      willExpireAt: streak.willExpireAt(this.config),
      lastActivityDate: streak.toJSON().lastActivityDate,
    };
  }

  async processStreakReset(): Promise<{ processed: number; broken: number }> {
    const startTime = Date.now();
    
    logger.info({
      operation: 'process_streak_reset_started'
    }, 'Starting daily streak reset process');

    try {
      const streaksAtRisk = await this.repository.findStreaksAtRisk(this.config.graceHours);
      let brokenCount = 0;

      for (const streak of streaksAtRisk) {
        streak.markBroken();
        await this.repository.save(streak);
        await this.invalidateCache(streak.getUserId());
        brokenCount++;
      }

      logger.info({
        operation: 'process_streak_reset_completed',
        processed: streaksAtRisk.length,
        broken: brokenCount,
        processingTime: Date.now() - startTime
      }, 'Daily streak reset completed');

      return { processed: streaksAtRisk.length, broken: brokenCount };
    } catch (error) {
      logger.error({
        operation: 'process_streak_reset_failed',
        error: error instanceof Error ? error.message : 'Unknown error',
        processingTime: Date.now() - startTime
      }, 'Failed to process streak reset');
      throw error;
    }
  }

  private async getOrCreateStreak(userId: string): Promise<StreakEntity> {
    const cacheKey = `user:${userId}:streak`;
    let streak = await this.cache.get<StreakEntity>(cacheKey);
    
    if (!streak) {
      streak = await this.repository.findByUserId(userId);
      
      if (!streak) {
        streak = StreakEntity.create({
          userId,
          currentStreak: 0,
          longestStreak: 0,
          lastActivityDate: new Date(),
          freezesUsed: 0,
          weekendProtected: this.config.weekendProtection,
          status: 'ACTIVE',
        });
        
        await this.repository.create(streak);
      }
      
      await this.cache.set(cacheKey, streak, this.CACHE_TTL);
    }
    
    return streak;
  }

  private async invalidateCache(userId: string): Promise<void> {
    await this.cache.del(`user:${userId}:streak`);
  }
}