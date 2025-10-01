import { IMetricRepository } from '../../domain/repositories/metric.repository.interface';
import { MetricAggregatorService } from '../../domain/services/metric-aggregator.service';
import { logger } from '@/shared/infrastructure/monitoring/logger';
import { PrismaClient } from '@prisma/client';
import {
  AttemptNotFoundError,
  InvalidAttemptError,
  InvalidMetricsDataError
} from '../../domain/errors';

export class GetSessionMetricsUseCase {
  constructor(
    private readonly repository: IMetricRepository,
    private readonly aggregator: MetricAggregatorService,
    private readonly prisma: PrismaClient
  ) {}

  async execute(userId: string, attemptId: string) {
    try {
      logger.debug({ userId, attemptId }, 'Starting get session metrics execution');

      const attempt = await this.prisma.challengeAttempt.findUnique({
        where: { id: attemptId },
        include: {
          challenge: {
            select: {
              title: true,
              difficulty: true,
              category: true,
            },
          },
        },
      });

      logger.debug({
        userId,
        attemptId,
        attemptFound: !!attempt,
        attemptUserId: attempt?.userId
      }, 'Attempt lookup completed');

      if (!attempt) {
        throw new AttemptNotFoundError();
      }

      if (attempt.userId !== userId) {
        throw new InvalidAttemptError();
      }

      const metrics = await this.repository.findByAttempt(attemptId);

      if (!Array.isArray(metrics)) {
        throw new InvalidMetricsDataError('Failed to retrieve metrics data');
      }

      // Calcular tendências com fallback em caso de erro
      let trends: Record<string, any> = {};
      try {
        logger.debug({ attemptId, userId }, 'Starting trends calculation');
        trends = await this.aggregator.calculateTrends(attemptId);
        logger.debug({
          attemptId,
          userId,
          trends: trends ? Object.keys(trends) : null,
          trendsType: typeof trends
        }, 'Trends calculation completed');

        if (!trends || typeof trends !== 'object') {
          logger.warn({ attemptId, userId, trends, trendsType: typeof trends }, 'Trends calculation returned invalid data, using empty trends');
          trends = {};
        }
      } catch (error) {
        logger.error({
          error: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined,
          attemptId,
          userId
        }, 'Failed to calculate trends with error, continuing without trends data');
        trends = {};
      }

      // Obter médias do usuário com fallback para valores padrão
      let userAverages: { averageDI: number; averagePR: number; averageCS: number };
      try {
        const averagesResult = await this.aggregator.getUserAverages(userId);
        if (!averagesResult || typeof averagesResult !== 'object') {
          throw new Error('Invalid user averages data structure');
        }
        userAverages = {
          averageDI: typeof averagesResult.averageDI === 'number' ? averagesResult.averageDI : 0,
          averagePR: typeof averagesResult.averagePR === 'number' ? averagesResult.averagePR : 0,
          averageCS: typeof averagesResult.averageCS === 'number' ? averagesResult.averageCS : 0,
        };
      } catch (error) {
        logger.warn({
          error: error instanceof Error ? error.message : 'Unknown error',
          userId
        }, 'Failed to get user averages, using default values');
        userAverages = { averageDI: 0, averagePR: 0, averageCS: 0 };
      }

      const validMetrics = metrics.filter(metric =>
        metric &&
        typeof metric.dependencyIndex === 'number' &&
        typeof metric.passRate === 'number' &&
        typeof metric.checklistScore === 'number' &&
        typeof metric.sessionTime === 'number'
      );

      if (validMetrics.length === 0) {
        logger.info({ attemptId, userId, totalMetrics: metrics.length }, 'No valid metrics found for attempt');
      }

      const latestMetric = validMetrics.length > 0 ? validMetrics[validMetrics.length - 1] : null;
      const firstMetric = validMetrics.length > 0 ? validMetrics[0] : null;

      // Calcular resumo das métricas com validações
      let summary;
      try {
        const firstMetricDI = firstMetric?.dependencyIndex ?? 0;
        const latestMetricDI = latestMetric?.dependencyIndex ?? 0;
        const firstMetricPR = firstMetric?.passRate ?? 0;
        const latestMetricPR = latestMetric?.passRate ?? 0;
        const firstMetricCS = firstMetric?.checklistScore ?? 0;
        const latestMetricCS = latestMetric?.checklistScore ?? 0;

        logger.debug({
          attemptId,
          userId,
          metricsCount: metrics.length,
          validMetricsCount: validMetrics.length,
          firstMetric: firstMetric ? {
            dependencyIndex: firstMetricDI,
            passRate: firstMetricPR,
            checklistScore: firstMetricCS
          } : null,
          latestMetric: latestMetric ? {
            dependencyIndex: latestMetricDI,
            passRate: latestMetricPR,
            checklistScore: latestMetricCS
          } : null
        }, 'Summary calculation input values');

        summary = {
          totalTime: latestMetric?.sessionTime ?? 0,
          totalSnapshots: metrics.length,
          currentDI: latestMetricDI,
          currentPR: latestMetricPR,
          currentCS: latestMetricCS,
          initialDI: firstMetricDI,
          initialPR: firstMetricPR,
          initialCS: firstMetricCS,
          improvement: {
            DI: validMetrics.length >= 2 ? (firstMetricDI - latestMetricDI) : 0,
            PR: validMetrics.length >= 2 ? (latestMetricPR - firstMetricPR) : 0,
            CS: validMetrics.length >= 2 ? (latestMetricCS - firstMetricCS) : 0,
          },
        };

        logger.debug({
          attemptId,
          userId,
          calculatedSummary: summary
        }, 'Summary calculated successfully');

      } catch (summaryError) {
        logger.error({
          error: summaryError instanceof Error ? summaryError.message : 'Unknown summary error',
          stack: summaryError instanceof Error ? summaryError.stack : undefined,
          attemptId,
          userId,
          metricsCount: metrics.length,
          validMetricsCount: validMetrics.length
        }, 'Error calculating summary, using default values');

        summary = {
          totalTime: 0,
          totalSnapshots: metrics.length,
          currentDI: 0,
          currentPR: 0,
          currentCS: 0,
          initialDI: 0,
          initialPR: 0,
          initialCS: 0,
          improvement: {
            DI: 0,
            PR: 0,
            CS: 0,
          },
        };
      }

      logger.info({
        userId,
        attemptId,
        metricsCount: metrics.length,
        validMetricsCount: validMetrics.length,
        summary: {
          ...summary,
          improvementPresent: !!summary.improvement,
          improvementKeys: summary.improvement ? Object.keys(summary.improvement) : []
        }
      }, 'Session metrics retrieved with detailed info');

      // Processar dados do attempt com fallback para valores seguros
      let attemptData;
      try {
        attemptData = {
          id: attempt.id || '',
          challengeTitle: attempt.challenge?.title || '',
          difficulty: attempt.challenge?.difficulty || '',
          category: attempt.challenge?.category || '',
          status: attempt.status || '',
          startedAt: attempt.startedAt ? new Date(attempt.startedAt).toISOString() : null,
        };
        logger.debug({ attemptId, userId, attemptData }, 'Attempt data processed successfully');
      } catch (attemptError) {
        logger.error({
          error: attemptError instanceof Error ? attemptError.message : 'Unknown attempt error',
          attemptId,
          userId,
          attempt: attempt ? 'exists' : 'null'
        }, 'Error processing attempt data, using fallback');

        attemptData = {
          id: attemptId,
          challengeTitle: 'Unknown Challenge',
          difficulty: 'UNKNOWN',
          category: 'UNKNOWN',
          status: 'UNKNOWN',
          startedAt: null,
        };
      }

      const result = {
        attempt: attemptData,
        metrics: Array.isArray(metrics) ? metrics : [],
        trends: trends && typeof trends === 'object' ? trends : {},
        userAverages: userAverages && typeof userAverages === 'object' ? userAverages : { averageDI: 0, averagePR: 0, averageCS: 0 },
        summary: summary && typeof summary === 'object' ? summary : {
          totalTime: 0,
          totalSnapshots: 0,
          currentDI: 0,
          currentPR: 0,
          currentCS: 0,
          initialDI: 0,
          initialPR: 0,
          initialCS: 0,
          improvement: { DI: 0, PR: 0, CS: 0 }
        },
      };

      logger.debug({
        userId,
        attemptId,
        resultStructure: {
          hasAttempt: !!result.attempt,
          hasMetrics: !!result.metrics,
          hasTrends: !!result.trends,
          hasUserAverages: !!result.userAverages,
          hasSummary: !!result.summary,
          summaryImprovement: result.summary?.improvement ? Object.keys(result.summary.improvement) : null
        }
      }, 'Final result structure validation');

      return result;
    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        userId,
        attemptId
      }, 'Failed to get session metrics');
      throw error;
    }
  }
}