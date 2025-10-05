import { ILeaderboardRepository, LeaderboardResult } from '../repositories/leaderboard.repository.interface';
import { LeaderboardKeyVO } from '../value-objects/leaderboard-key.vo';
import { LeaderboardType, LeaderboardScope, LeaderboardPeriod } from '../enums/leaderboard.enum';
import { LeaderboardEntryEntity } from '../entities/leaderboard-entry.entity';
import { ICacheService } from '../../infrastructure/services/cache.service';
import { logger } from '@/shared/infrastructure/monitoring/logger';

export interface UpdateLeaderboardData {
  userId: string;
  companyId?: string;
  teamId?: string;
  xpGained?: number;
  badgeUnlocked?: boolean;
  currentStreak?: number;
}

export class LeaderboardService {
  private readonly CACHE_TTL = {
    realtime: 300,
    periodic: 3600,
  };

  constructor(
    private readonly repository: ILeaderboardRepository,
    private readonly cache: ICacheService
  ) {}

  async updateUserRankings(data: UpdateLeaderboardData): Promise<void> {
    const startTime = Date.now();
    
    logger.info({
      operation: 'update_user_rankings_started',
      userId: data.userId,
      data
    }, 'Starting user rankings update');

    try {
      const updates: Array<{ key: LeaderboardKeyVO; score: number }> = [];

      if (data.xpGained) {
        updates.push(...this.generateXPUpdates(data.xpGained, data.companyId, data.teamId));
      }

      if (data.badgeUnlocked) {
        updates.push(...this.generateBadgeUpdates());
      }

      if (data.currentStreak !== undefined) {
        updates.push(...this.generateStreakUpdates(data.currentStreak));
      }

      for (const update of updates) {
        await this.repository.updateUserScore(update.key, data.userId, update.score);
        await this.invalidateCache(update.key);
      }

      logger.info({
        operation: 'update_user_rankings_completed',
        userId: data.userId,
        updatesCount: updates.length,
        processingTime: Date.now() - startTime
      }, 'User rankings updated successfully');
    } catch (error) {
      logger.error({
        operation: 'update_user_rankings_failed',
        userId: data.userId,
        error: error instanceof Error ? error.message : 'Unknown error',
        processingTime: Date.now() - startTime
      }, 'Failed to update user rankings');
      throw error;
    }
  }

  async getLeaderboard(
    type: LeaderboardType,
    scope: LeaderboardScope,
    period: LeaderboardPeriod,
    scopeId?: string,
    page: number = 1,
    limit: number = 20,
    includeUser?: string
  ): Promise<LeaderboardResult> {
    const startTime = Date.now();

    // Handle COMPANY scope without scopeId - return empty leaderboard
    if (scope === LeaderboardScope.COMPANY && !scopeId) {
      return {
        entries: [],
        totalParticipants: 0,
        lastUpdated: new Date(),
        userRanking: null,
      };
    }

    const key = LeaderboardKeyVO.create({
      type,
      scope,
      scopeId,
      period,
      periodValue: this.getCurrentPeriodValue(period),
    });

    const cacheKey = `${key.toCacheKey()}:page:${page}:limit:${limit}`;
    
    logger.debug({
      operation: 'get_leaderboard_service',
      cacheKey,
      type,
      scope,
      page,
      limit
    }, 'Getting leaderboard from service');

    try {
      interface CachedLeaderboardData {
        entries: Array<{
          userId: string;
          name: string;
          avatarUrl: string | null;
          score: number;
          position: number;
          metadata: Record<string, unknown>;
        }>;
        totalParticipants: number;
        userRanking?: {
          userId: string;
          position: number;
          score: number;
          percentile: number;
        };
        lastUpdated: string;
      }

      const cachedData = await this.cache.get<CachedLeaderboardData>(cacheKey);

      if (cachedData) {
        logger.debug({ cacheKey }, 'Leaderboard service cache hit');

        const result: LeaderboardResult = {
          entries: cachedData.entries.map(entry =>
            LeaderboardEntryEntity.fromCacheData(entry)
          ),
          totalParticipants: cachedData.totalParticipants,
          userRanking: cachedData.userRanking,
          lastUpdated: new Date(cachedData.lastUpdated),
        };

        return result;
      }

      const result = await this.repository.getLeaderboard({
        key,
        page,
        limit,
        includeUser,
      });

      const cacheData: CachedLeaderboardData = {
        entries: result.entries.map(entry => entry.toCacheData()),
        totalParticipants: result.totalParticipants,
        userRanking: result.userRanking,
        lastUpdated: result.lastUpdated.toISOString(),
      };

      const ttl = this.getCacheTTL(period);
      await this.cache.set(cacheKey, cacheData, ttl);

      logger.debug({
        operation: 'get_leaderboard_service_completed',
        entriesCount: result.entries.length,
        totalParticipants: result.totalParticipants,
        processingTime: Date.now() - startTime
      }, 'Leaderboard retrieved from service');

      return result;
    } catch (error) {
      logger.error({
        operation: 'get_leaderboard_service_failed',
        type,
        scope,
        error: error instanceof Error ? error.message : 'Unknown error',
        processingTime: Date.now() - startTime
      }, 'Failed to get leaderboard from service');
      throw error;
    }
  }

  private generateXPUpdates(
    xpGained: number,
    companyId?: string,
    teamId?: string
  ): Array<{ key: LeaderboardKeyVO; score: number }> {
    const updates = [];

    updates.push({
      key: LeaderboardKeyVO.create({
        type: LeaderboardType.XP_TOTAL,
        scope: LeaderboardScope.GLOBAL,
        period: LeaderboardPeriod.ALL_TIME,
      }),
      score: xpGained,
    });

    updates.push({
      key: LeaderboardKeyVO.create({
        type: LeaderboardType.XP_WEEKLY,
        scope: LeaderboardScope.GLOBAL,
        period: LeaderboardPeriod.WEEKLY,
        periodValue: this.getCurrentWeek(),
      }),
      score: xpGained,
    });

    if (companyId) {
      updates.push({
        key: LeaderboardKeyVO.create({
          type: LeaderboardType.XP_TOTAL,
          scope: LeaderboardScope.COMPANY,
          scopeId: companyId,
          period: LeaderboardPeriod.ALL_TIME,
        }),
        score: xpGained,
      });
    }

    if (teamId) {
      updates.push({
        key: LeaderboardKeyVO.create({
          type: LeaderboardType.XP_TOTAL,
          scope: LeaderboardScope.TEAM,
          scopeId: teamId,
          period: LeaderboardPeriod.ALL_TIME,
        }),
        score: xpGained,
      });
    }

    return updates;
  }

  private generateBadgeUpdates(): Array<{ key: LeaderboardKeyVO; score: number }> {
    return [
      {
        key: LeaderboardKeyVO.create({
          type: LeaderboardType.BADGES_COUNT,
          scope: LeaderboardScope.GLOBAL,
          period: LeaderboardPeriod.ALL_TIME,
        }),
        score: 1,
      },
    ];
  }

  private generateStreakUpdates(currentStreak: number): Array<{ key: LeaderboardKeyVO; score: number }> {
    return [
      {
        key: LeaderboardKeyVO.create({
          type: LeaderboardType.STREAK_CURRENT,
          scope: LeaderboardScope.GLOBAL,
          period: LeaderboardPeriod.ALL_TIME,
        }),
        score: currentStreak,
      },
    ];
  }

  private getCurrentPeriodValue(period: LeaderboardPeriod): string {
    const now = new Date();
    
    switch (period) {
      case LeaderboardPeriod.DAILY:
        return now.toISOString().split('T')[0];
      case LeaderboardPeriod.WEEKLY:
        return this.getCurrentWeek();
      case LeaderboardPeriod.MONTHLY:
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      default:
        return 'all-time';
    }
  }

  private getCurrentWeek(): string {
    const now = new Date();
    const year = now.getFullYear();
    const week = this.getWeekNumber(now);
    return `${year}-W${String(week).padStart(2, '0')}`;
  }

  private getWeekNumber(date: Date): number {
    const d = new Date(date);
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
    return weekNo;
  }

  private getCacheTTL(period: LeaderboardPeriod): number {
    switch (period) {
      case LeaderboardPeriod.DAILY:
      case LeaderboardPeriod.WEEKLY:
        return this.CACHE_TTL.realtime;
      default:
        return this.CACHE_TTL.periodic;
    }
  }

  private async invalidateCache(key: LeaderboardKeyVO): Promise<void> {
    const pattern = `${key.toCacheKey()}:*`;
    const keys = await this.cache.keys(pattern);
    
    for (const cacheKey of keys) {
      await this.cache.del(cacheKey.replace('gamification:', ''));
    }
  }
}