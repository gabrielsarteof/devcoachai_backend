import { IChallengeContextService } from '../../domain/services/challenge-context.service.interface';
import { logger } from '@/shared/infrastructure/monitoring/logger';

export interface RefreshChallengeCacheDTO {
  challengeId: string;
}

export class RefreshChallengeCacheUseCase {
  constructor(
    private readonly challengeContextService: IChallengeContextService
  ) {}

  async execute(data: RefreshChallengeCacheDTO) {
    const startTime = Date.now();
    const requestId = crypto.randomUUID();
    const { challengeId } = data;

    logger.info({
      requestId,
      operation: 'refresh_challenge_cache',
      challengeId,
    }, 'Refreshing challenge context cache');

    try {
      await this.challengeContextService.refreshChallengeContext(challengeId);

      const executionTime = Date.now() - startTime;

      logger.info({
        requestId,
        challengeId,
        executionTime,
      }, 'Challenge context cache refreshed successfully');

      return {
        success: true,
        message: `Context cache refreshed for challenge ${challengeId}`,
        challengeId,
        refreshedAt: new Date().toISOString(),
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;

      logger.error({
        requestId,
        challengeId,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        executionTime,
      }, 'Failed to refresh challenge cache');

      throw error;
    }
  }
}