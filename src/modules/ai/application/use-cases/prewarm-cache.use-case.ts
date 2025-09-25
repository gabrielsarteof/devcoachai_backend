import { IChallengeContextService } from '../../domain/services/challenge-context.service.interface';
import { logger } from '@/shared/infrastructure/monitoring/logger';

export interface PrewarmCacheDTO {
  challengeIds: string[];
}

export class PrewarmCacheUseCase {
  constructor(
    private readonly challengeContextService: IChallengeContextService
  ) {}

  async execute(data: PrewarmCacheDTO) {
    const startTime = Date.now();
    const requestId = crypto.randomUUID();
    const { challengeIds } = data;

    logger.info({
      requestId,
      operation: 'prewarm_cache',
      challengeIdsCount: challengeIds.length,
      challengeIds,
    }, 'Prewarming cache for multiple challenges');

    try {
      await this.challengeContextService.prewarmCache(challengeIds);

      const executionTime = Date.now() - startTime;

      logger.info({
        requestId,
        challengeIdsCount: challengeIds.length,
        challengeIds,
        executionTime,
      }, 'Cache prewarmed successfully for all challenges');

      return {
        success: true,
        message: 'Cache prewarm initiated',
        processed: challengeIds.length,
        challengeIds,
        initiatedAt: new Date().toISOString(),
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;

      logger.error({
        requestId,
        challengeIds,
        challengeIdsCount: challengeIds.length,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        executionTime,
      }, 'Failed to prewarm cache');

      throw error;
    }
  }
}