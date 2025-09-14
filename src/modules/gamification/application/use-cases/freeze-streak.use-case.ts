import { z } from 'zod';
import { StreakManagerService } from '../../domain/services/streak-manager.service';
import { logger } from '@/shared/infrastructure/monitoring/logger';

export const FreezeStreakSchema = z.object({
  userId: z.string().cuid(),
});

export type FreezeStreakDTO = z.infer<typeof FreezeStreakSchema>;

export interface FreezeStreakResult {
  success: boolean;
  freezesRemaining: number;
  message: string;
}

export class FreezeStreakUseCase {
  constructor(private readonly streakManager: StreakManagerService) {}

  async execute(input: FreezeStreakDTO): Promise<FreezeStreakResult> {
    const { userId } = FreezeStreakSchema.parse(input);
    const startTime = Date.now();

    logger.info({
      operation: 'freeze_streak_usecase_started',
      userId
    }, 'Starting streak freeze use case');

    try {
      const result = await this.streakManager.freezeStreak(userId);
      
      const message = result.success 
        ? `Streak congelado com sucesso. ${result.freezesRemaining} congelamentos restantes.`
        : 'Não foi possível congelar o streak. Limite de congelamentos atingido.';

      logger.info({
        operation: 'freeze_streak_usecase_completed',
        userId,
        success: result.success,
        freezesRemaining: result.freezesRemaining,
        processingTime: Date.now() - startTime
      }, 'Streak freeze completed');

      return {
        ...result,
        message,
      };
    } catch (error) {
      logger.error({
        operation: 'freeze_streak_usecase_failed',
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
        processingTime: Date.now() - startTime
      }, 'Failed to freeze streak');
      throw error;
    }
  }
}