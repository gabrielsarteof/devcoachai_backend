import { z } from 'zod';
import { LeaderboardService } from '../../domain/services/leaderboard.service';
import { LeaderboardType, LeaderboardScope, LeaderboardPeriod } from '../../domain/enums/leaderboard.enum';
import { logger } from '@/shared/infrastructure/monitoring/logger';

export const GetLeaderboardSchema = z.object({
  type: z.nativeEnum(LeaderboardType),
  scope: z.nativeEnum(LeaderboardScope),
  scopeId: z.string().optional(),
  period: z.nativeEnum(LeaderboardPeriod).default(LeaderboardPeriod.ALL_TIME),
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(20),
  includeUser: z.string().cuid().optional(),
});

export type GetLeaderboardDTO = z.infer<typeof GetLeaderboardSchema>;

export interface GetLeaderboardResult {
  type: LeaderboardType;
  scope: LeaderboardScope;
  period: LeaderboardPeriod;
  rankings: Array<{
    position: number;
    userId: string;
    displayName: string;
    score: number;
    change?: number;
    avatar?: string;
    level: number;
    isAnonymous: boolean;
    lastActivity?: Date;
  }>;
  userRanking?: {
    position: number;
    score: number;
    percentile: number;
  };
  totalParticipants: number;
  lastUpdated: Date;
}

export class GetLeaderboardUseCase {
  constructor(private readonly leaderboardService: LeaderboardService) {}

  async execute(input: GetLeaderboardDTO): Promise<GetLeaderboardResult> {
    const validated = GetLeaderboardSchema.parse(input);
    const startTime = Date.now();

    logger.info({
      operation: 'get_leaderboard_usecase_started',
      type: validated.type,
      scope: validated.scope,
      page: validated.page
    }, 'Getting leaderboard');

    try {
      const serviceResult = await this.leaderboardService.getLeaderboard(
        validated.type,
        validated.scope,
        validated.period,
        validated.scopeId,
        validated.page,
        validated.limit,
        validated.includeUser
      );

      if (!serviceResult || !serviceResult.entries) {
        throw new Error('Invalid leaderboard result from service');
      }

      logger.info({
        operation: 'get_leaderboard_usecase_completed',
        type: validated.type,
        entriesCount: serviceResult.entries.length,
        totalParticipants: serviceResult.totalParticipants,
        processingTime: Date.now() - startTime
      }, 'Leaderboard retrieved');

      return {
        type: validated.type,
        scope: validated.scope,
        period: validated.period,
        rankings: serviceResult.entries.map(entry => entry.toJSON()),
        userRanking: serviceResult.userRanking,
        totalParticipants: serviceResult.totalParticipants,
        lastUpdated: serviceResult.lastUpdated,
      };
    } catch (error) {
      logger.error({
        operation: 'get_leaderboard_usecase_failed',
        error: error instanceof Error ? error.message : 'Unknown error',
        processingTime: Date.now() - startTime
      }, 'Failed to get leaderboard');
      throw error;
    }
  }
}