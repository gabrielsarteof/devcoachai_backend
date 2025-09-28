import { IChallengeContextService } from '../../domain/services/challenge-context.service.interface';
import { logger } from '@/shared/infrastructure/monitoring/logger';

export interface RefreshChallengeCacheDTO {
  challengeIds: string[];
}

export class RefreshChallengeCacheUseCase {
  constructor(
    private readonly challengeContextService: IChallengeContextService
  ) {}

  async execute(data: RefreshChallengeCacheDTO) {
    const startTime = Date.now();
    const requestId = crypto.randomUUID();
    const { challengeIds } = data;

    logger.info({
      requestId,
      operation: 'refresh_challenge_cache',
      challengeIds: challengeIds.length,
    }, 'Refreshing challenge context cache');

    try {
      const refreshedChallenges: string[] = [];
      const errors: { challengeId: string; error: string }[] = [];

      for (const challengeId of challengeIds) {
        try {
          await this.challengeContextService.refreshChallengeContext(challengeId);
          refreshedChallenges.push(challengeId);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          errors.push({ challengeId, error: errorMessage });
          logger.warn({
            requestId,
            challengeId,
            error: errorMessage,
          }, 'Failed to refresh individual challenge cache');
        }
      }

      const executionTime = Date.now() - startTime;

      logger.info({
        requestId,
        refreshedCount: refreshedChallenges.length,
        errorCount: errors.length,
        executionTime,
      }, 'Challenge context cache refresh completed');

      return {
        success: true,
        refreshedChallenges,
        errors: errors.length > 0 ? errors : undefined,
        message: `Refreshed ${refreshedChallenges.length} of ${challengeIds.length} challenge contexts`,
        refreshedAt: new Date().toISOString(),
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;

      logger.error({
        requestId,
        challengeIds: challengeIds.length,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        executionTime,
      }, 'Failed to refresh challenge cache');

      throw error;
    }
  }
}