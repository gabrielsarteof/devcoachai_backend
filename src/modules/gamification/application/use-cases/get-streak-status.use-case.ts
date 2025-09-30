import { z } from 'zod';
import { StreakManagerService } from '../../domain/services/streak-manager.service';
import { logger } from '@/shared/infrastructure/monitoring/logger';

export const GetStreakStatusSchema = z.object({
  userId: z.string().min(1),
});

export type GetStreakStatusDTO = z.infer<typeof GetStreakStatusSchema>;

export class GetStreakStatusUseCase {
  constructor(private readonly streakManager: StreakManagerService) {}

  async execute(input: GetStreakStatusDTO) {
    const { userId } = GetStreakStatusSchema.parse(input);
    const startTime = Date.now();

    logger.debug({
      operation: 'get_streak_status_usecase_started',
      userId
    }, 'Getting streak status');

    try {
      const status = await this.streakManager.getStreakStatus(userId);

      logger.debug({
        operation: 'get_streak_status_usecase_completed',
        userId,
        currentStreak: status.currentStreak,
        processingTime: Date.now() - startTime
      }, 'Streak status retrieved');

      return status;
    } catch (error) {
      logger.error({
        operation: 'get_streak_status_usecase_failed',
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
        processingTime: Date.now() - startTime
      }, 'Failed to get streak status');
      throw error;
    }
  }
}