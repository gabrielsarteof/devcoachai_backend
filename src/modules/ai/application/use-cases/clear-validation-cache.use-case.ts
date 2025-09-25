import { IPromptValidatorService } from '../../domain/services/prompt-validator.service.interface';
import { logger } from '@/shared/infrastructure/monitoring/logger';

export interface ClearValidationCacheDTO {
  challengeId?: string;
}

export class ClearValidationCacheUseCase {
  constructor(
    private readonly promptValidator: IPromptValidatorService
  ) {}

  async execute(data: ClearValidationCacheDTO = {}) {
    const startTime = Date.now();
    const requestId = crypto.randomUUID();
    const { challengeId } = data;

    logger.info({
      requestId,
      operation: 'clear_validation_cache',
      challengeId: challengeId || 'all',
      scope: challengeId ? 'specific_challenge' : 'all_challenges',
    }, challengeId ? 'Clearing validation cache for specific challenge' : 'Clearing all validation cache');

    try {
      await this.promptValidator.clearCache(challengeId);

      const executionTime = Date.now() - startTime;

      const message = challengeId
        ? `Cache cleared for challenge ${challengeId}`
        : 'All validation cache cleared';

      logger.info({
        requestId,
        challengeId: challengeId || 'all',
        scope: challengeId ? 'specific_challenge' : 'all_challenges',
        executionTime,
      }, 'Validation cache cleared successfully');

      return {
        success: true,
        message,
        challengeId,
        clearedAt: new Date().toISOString(),
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;

      logger.error({
        requestId,
        challengeId: challengeId || 'all',
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        executionTime,
      }, 'Failed to clear validation cache');

      throw error;
    }
  }
}