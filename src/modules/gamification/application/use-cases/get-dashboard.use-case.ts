import { z } from 'zod';
import { logger } from '@/shared/infrastructure/monitoring/logger';
import { BadgeService } from '../../domain/services/badge.service';
import { LeaderboardService } from '../../domain/services/leaderboard.service';
import { StreakManagerService } from '../../domain/services/streak-manager.service';
import { LevelProgressionService } from '../../domain/services/level-progression.service';
import { NotificationService } from '../../domain/services/notification.service';
import { IXPRepository } from '../../domain/repositories/xp.repository.interface';
import { ICacheService } from '../../infrastructure/services/cache.service';
import { LeaderboardType, LeaderboardScope, LeaderboardPeriod } from '../../domain/enums/leaderboard.enum';

export const GetDashboardSchema = z.object({
  userId: z.string().cuid(),
  includeDetails: z.boolean().default(true),
});

export type GetDashboardDTO = z.infer<typeof GetDashboardSchema>;

interface BadgeInfo {
  id: string;
  key: string;
  name: string;
  description: string;
  icon: string;
  rarity: string;
  unlockedAt?: Date;
}

interface BadgesData {
  recent: BadgeInfo[];
  total: number;
  unlocked: number;
}

interface RankingData {
  global: number;
  company: number;
  weeklyChange: number;
}

export interface DashboardResponse {
  user: {
    id: string;
    currentXP: number;
    level: number;
    levelTitle: string;
    nextLevelXP: number;
    nextLevelProgress: number;
    levelPerks: string[];
  };
  streak: {
    current: number;
    longest: number;
    status: string;
    nextMilestone: number;
    daysUntilMilestone: number;
    freezesAvailable: number;
    willExpireAt: Date;
  };
  badges: BadgesData;
  ranking: RankingData;
  dailyGoal: {
    xpTarget: number;
    xpEarned: number;
    completed: boolean;
    completionPercentage: number;
  };
  notifications: {
    unreadCount: number;
  };
}

export class GetDashboardUseCase {
  private readonly CACHE_TTL = 600; 

  constructor(
    private readonly badgeService: BadgeService,
    private readonly leaderboardService: LeaderboardService,
    private readonly streakManager: StreakManagerService,
    private readonly levelService: LevelProgressionService,
    private readonly notificationService: NotificationService,
    private readonly xpRepository: IXPRepository,
    private readonly cache: ICacheService
  ) {}

  async execute(input: GetDashboardDTO): Promise<DashboardResponse> {
    const { userId, includeDetails } = GetDashboardSchema.parse(input);
    const startTime = Date.now();

    logger.info({ operation: 'get_dashboard_started', userId }, 'Getting user dashboard');

    try {
      const cacheKey = `dashboard:${userId}:${includeDetails}`;
      const cached = await this.cache.get<DashboardResponse>(cacheKey);
      
      if (cached) {
        logger.debug({ userId, cacheKey }, 'Dashboard cache hit');
        return cached;
      }

      const [userLevelData, streakStatus, unreadCount] = await Promise.all([
        this.xpRepository.getUserLevelData(userId),
        this.streakManager.getStreakStatus(userId),
        this.notificationService.getUnreadCount(userId)
      ]);

      const levelProgress = this.levelService.calculateLevel(userLevelData.totalXp);

      let badgesData: BadgesData = { recent: [], total: 0, unlocked: 0 };
      let ranking: RankingData = { global: 0, company: 0, weeklyChange: 0 };

      if (includeDetails) {
        const [userBadges, allBadges, globalRanking] = await Promise.all([
          this.badgeService.getUserBadges(userId),
          this.badgeService.getAllBadges(),
          this.getGlobalRanking(userId)
        ]);

        badgesData = {
          recent: userBadges.slice(0, 3).map(b => ({
            id: b.getId(),
            key: b.getKey(),
            name: b.getName(),
            description: b.toJSON().description,
            icon: b.toJSON().icon,
            rarity: b.toJSON().rarity,
            unlockedAt: b.toJSON().unlockedAt
          })),
          total: allBadges.length,
          unlocked: userBadges.length
        };

        ranking = globalRanking;
      }

      const dashboard: DashboardResponse = {
        user: {
          id: userId,
          currentXP: userLevelData.totalXp,
          level: levelProgress.currentLevel.level,
          levelTitle: levelProgress.currentLevel.title,
          nextLevelXP: levelProgress.nextLevel?.requiredXP || levelProgress.currentLevel.requiredXP,
          nextLevelProgress: levelProgress.progress,
          levelPerks: levelProgress.currentLevel.perks
        },
        streak: {
          current: streakStatus.currentStreak,
          longest: streakStatus.longestStreak,
          status: streakStatus.status,
          nextMilestone: streakStatus.nextMilestone,
          daysUntilMilestone: streakStatus.daysUntilMilestone,
          freezesAvailable: streakStatus.freezesAvailable,
          willExpireAt: streakStatus.willExpireAt
        },
        badges: badgesData,
        ranking,
        dailyGoal: {
          xpTarget: Math.max(50, userLevelData.currentLevel * 25),
          xpEarned: 0, 
          completed: false,
          completionPercentage: 0
        },
        notifications: {
          unreadCount
        }
      };

      await this.cache.set(cacheKey, dashboard, this.CACHE_TTL);

      logger.info({
        operation: 'get_dashboard_completed',
        userId,
        level: dashboard.user.level,
        processingTime: Date.now() - startTime
      }, 'Dashboard retrieved successfully');

      return dashboard;
    } catch (error) {
      logger.error({
        operation: 'get_dashboard_failed',
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
        processingTime: Date.now() - startTime
      }, 'Failed to get dashboard');
      throw error;
    }
  }

  private async getGlobalRanking(userId: string): Promise<RankingData> {
    try {
      const result = await this.leaderboardService.getLeaderboard(
        LeaderboardType.XP_TOTAL,
        LeaderboardScope.GLOBAL,
        LeaderboardPeriod.ALL_TIME,
        undefined,
        1,
        100,
        userId
      );

      return {
        global: result.userRanking?.position || 0,
        company: 0, // Escalabilidade: implementar quando tiver companyId
        weeklyChange: 0 // Escalabilidade: implementar mudança semanal
      };
    } catch (error) {
      logger.error({ userId, error }, 'Failed to get global ranking');
      return { global: 0, company: 0, weeklyChange: 0 };
    }
  }
}