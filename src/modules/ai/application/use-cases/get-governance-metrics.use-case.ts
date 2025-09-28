import { IPromptValidatorService } from '../../domain/services/prompt-validator.service.interface';
import { logger } from '@/shared/infrastructure/monitoring/logger';

export interface GetGovernanceMetricsDTO {
  challengeId?: string;
  startDate?: string;
  endDate?: string;
}

export class GetGovernanceMetricsUseCase {
  constructor(
    private readonly promptValidator: IPromptValidatorService
  ) {}

  async execute(data: GetGovernanceMetricsDTO) {
    const startTime = Date.now();
    const requestId = crypto.randomUUID();

    logger.debug({
      requestId,
      operation: 'get_governance_metrics',
      challengeId: data.challengeId,
      hasDateRange: !!(data.startDate && data.endDate),
    }, 'Retrieving governance validation metrics');

    try {
      const timeRange = data.startDate && data.endDate ? {
        start: new Date(data.startDate),
        end: new Date(data.endDate),
      } : undefined;

      const metrics = await this.promptValidator.getValidationMetrics(
        data.challengeId,
        timeRange
      );

      const executionTime = Date.now() - startTime;

      logger.info({
        requestId,
        challengeId: data.challengeId,
        timeRange: timeRange ? {
          start: timeRange.start.toISOString(),
          end: timeRange.end.toISOString(),
        } : 'all_time',
        totalValidations: metrics.totalValidations,
        blockedCount: metrics.blockedCount,
        avgRiskScore: metrics.avgRiskScore,
        executionTime,
      }, 'Governance metrics retrieved successfully');

      // Estrutura de resposta padronizada para métricas de governança
      return {
        metrics: {
          validationStats: {
            totalValidations: metrics.totalValidations,
            blockedCount: metrics.blockedCount,
            throttledCount: metrics.throttledCount,
            allowedCount: metrics.allowedCount,
            avgRiskScore: metrics.avgRiskScore,
            avgConfidence: metrics.avgConfidence
          },
          blockingStats: {
            topBlockedPatterns: metrics.topBlockedPatterns,
            riskDistribution: metrics.riskDistribution
          },
          performanceMetrics: {
            avgProcessingTime: metrics.avgProcessingTime
          }
        }
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;

      logger.error({
        requestId,
        challengeId: data.challengeId,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        executionTime,
      }, 'Failed to get governance metrics');

      throw error;
    }
  }
}