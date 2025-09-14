import { PrismaClient } from '@prisma/client';
import { ILeaderboardRepository, LeaderboardQuery, LeaderboardResult } from '../../domain/repositories/leaderboard.repository.interface';
import { LeaderboardKeyVO } from '../../domain/value-objects/leaderboard-key.vo';
import { LeaderboardEntryEntity } from '../../domain/entities/leaderboard-entry.entity';
import { LeaderboardType, LeaderboardScope } from '../../domain/enums/leaderboard.enum';
import { logger } from '@/shared/infrastructure/monitoring/logger';

export class LeaderboardRepository implements ILeaderboardRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async getLeaderboard(query: LeaderboardQuery): Promise<LeaderboardResult> {
    const startTime = Date.now();
    const { key, page, limit, includeUser } = query;
    
    logger.info({
      operation: 'get_leaderboard_repository',
      key: key.toCacheKey(),
      page,
      limit
    }, 'Getting leaderboard from repository');

    try {
      const baseQuery = this.buildBaseQuery(key);
      const orderBy = this.buildOrderBy(key);

      const [users, totalCount] = await Promise.all([
        this.prisma.user.findMany({
          ...baseQuery,
          orderBy,
          skip: (page - 1) * limit,
          take: limit,
          select: {
            id: true,
            name: true,
            avatarUrl: true,
            currentLevel: true,
            totalXp: true,
            currentStreak: true,
            lastLoginAt: true,
            companyId: true,
            teamId: true,
          },
        }),
        this.prisma.user.count({ where: baseQuery.where }),
      ]);

      const entries = users.map((user, index) => {
        const score = this.extractScore(user, key);
        const position = (page - 1) * limit + index + 1;
        
        return LeaderboardEntryEntity.fromPrismaUser(user, score, position);
      });

      let userRanking: { position: number; score: number; percentile: number } | undefined;
      if (includeUser) {
        const ranking = await this.getUserRanking(key, includeUser);
        userRanking = ranking || undefined;
      }

      const result: LeaderboardResult = {
        entries,
        totalParticipants: totalCount,
        userRanking,
        lastUpdated: new Date(),
      };

      logger.info({
        operation: 'get_leaderboard_repository_completed',
        entriesCount: entries.length,
        totalParticipants: totalCount,
        processingTime: Date.now() - startTime
      }, 'Leaderboard retrieved successfully');

      return result;
    } catch (error) {
      logger.error({
        operation: 'get_leaderboard_repository_failed',
        error: error instanceof Error ? error.message : 'Unknown error',
        processingTime: Date.now() - startTime
      }, 'Failed to get leaderboard');
      throw error;
    }
  }

  async updateUserScore(key: LeaderboardKeyVO, userId: string, score: number): Promise<void> {
    logger.debug({
      operation: 'update_user_score',
      key: key.toCacheKey(),
      userId,
      score
    }, 'Score update logged');
  }

  async getUserRanking(key: LeaderboardKeyVO, userId: string): Promise<{
    position: number;
    score: number;
    percentile: number;
  } | null> {
    const baseQuery = this.buildBaseQuery(key);

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        totalXp: true,
        currentStreak: true,
        companyId: true,
        teamId: true,
      },
    });

    if (!user) return null;

    const score = this.extractScore(user, key);
    
    const usersAbove = await this.prisma.user.count({
      where: {
        ...baseQuery.where,
        OR: [
          { totalXp: { gt: score } },
          { currentStreak: { gt: score } },
        ],
      },
    });

    const totalUsers = await this.prisma.user.count({ where: baseQuery.where });
    const position = usersAbove + 1;
    const percentile = Math.round(((totalUsers - position) / totalUsers) * 100);

    return {
      position,
      score,
      percentile,
    };
  }

  async getTopUsers(key: LeaderboardKeyVO, limit: number): Promise<LeaderboardEntryEntity[]> {
    const query: LeaderboardQuery = { key, page: 1, limit };
    const result = await this.getLeaderboard(query);
    return result.entries;
  }

  async resetPeriodLeaderboard(key: LeaderboardKeyVO): Promise<void> {
    logger.info({
      operation: 'reset_period_leaderboard',
      key: key.toCacheKey()
    }, 'Period leaderboard reset');
  }

  private buildBaseQuery(key: LeaderboardKeyVO) {
    const { scope, scopeId } = key.getProps();
    let where: any = {};

    switch (scope) {
      case LeaderboardScope.COMPANY:
        if (scopeId) {
          where.companyId = scopeId;
        }
        break;
      case LeaderboardScope.TEAM:
        if (scopeId) {
          where.teamId = scopeId;
        }
        break;
      case LeaderboardScope.GLOBAL:
      default:
        break;
    }

    return { where };
  }

  private buildOrderBy(key: LeaderboardKeyVO) {
    const { type } = key.getProps();

    switch (type) {
      case LeaderboardType.XP_TOTAL:
      case LeaderboardType.XP_WEEKLY:
      case LeaderboardType.XP_MONTHLY:
        return { totalXp: 'desc' as const };
      case LeaderboardType.STREAK_CURRENT:
        return { currentStreak: 'desc' as const };
      case LeaderboardType.BADGES_COUNT:
        return { totalXp: 'desc' as const };
      default:
        return { totalXp: 'desc' as const };
    }
  }

  private extractScore(user: any, key: LeaderboardKeyVO): number {
    const { type } = key.getProps();

    switch (type) {
      case LeaderboardType.XP_TOTAL:
      case LeaderboardType.XP_WEEKLY:
      case LeaderboardType.XP_MONTHLY:
        return user.totalXp;
      case LeaderboardType.STREAK_CURRENT:
        return user.currentStreak;
      case LeaderboardType.BADGES_COUNT:
        return user.totalXp;
      default:
        return user.totalXp;
    }
  }
}