import { IChallengeContextService } from '../../domain/services/challenge-context.service.interface';
import { logger } from '@/shared/infrastructure/monitoring/logger';

export class GetGovernanceStatsUseCase {
  constructor(
    private readonly challengeContextService: IChallengeContextService
  ) {}

  async execute() {
    const startTime = Date.now();
    const requestId = crypto.randomUUID();

    logger.debug({
      requestId,
      operation: 'get_governance_stats',
    }, 'Retrieving governance context statistics');

    try {
      const stats = await this.challengeContextService.getContextStats();

      const executionTime = Date.now() - startTime;

      logger.info({
        requestId,
        cachedContexts: stats.cachedContexts,
        avgKeywords: stats.avgKeywords,
        avgForbiddenPatterns: stats.avgForbiddenPatterns,
        cacheHitRate: stats.cacheHitRate,
        executionTime,
      }, 'Governance stats retrieved successfully');

      return stats;
    } catch (error) {
      const executionTime = Date.now() - startTime;

      logger.error({
        requestId,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        executionTime,
      }, 'Failed to get governance stats');

      throw error;
    }
  }
}