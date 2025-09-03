import { IMetricRepository } from '../../domain/repositories/metric.repository.interface';
import { MetricAggregatorService } from '../../domain/services/metric-aggregator.service';
import { logger } from '@/shared/infrastructure/monitoring/logger';
import { PrismaClient } from '@prisma/client';

export class GetSessionMetricsUseCase {
  constructor(
    private readonly repository: IMetricRepository,
    private readonly aggregator: MetricAggregatorService,
    private readonly prisma: PrismaClient
  ) {}

  async execute(userId: string, attemptId: string) {
    try {
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

      if (!attempt || attempt.userId !== userId) {
        throw new Error('Invalid attempt or unauthorized');
      }

      const metrics = await this.repository.findByAttempt(attemptId);
      
      const trends = await this.aggregator.calculateTrends(attemptId);
      
      const userAverages = await this.aggregator.getUserAverages(userId);

      const latestMetric = metrics[metrics.length - 1];
      const firstMetric = metrics[0];

      const summary = {
        totalTime: latestMetric?.sessionTime || 0,
        totalSnapshots: metrics.length,
        currentDI: latestMetric?.dependencyIndex || 0,
        currentPR: latestMetric?.passRate || 0,
        currentCS: latestMetric?.checklistScore || 0,
        initialDI: firstMetric?.dependencyIndex || 0,
        initialPR: firstMetric?.passRate || 0,
        initialCS: firstMetric?.checklistScore || 0,
        improvement: {
          DI: (firstMetric?.dependencyIndex || 0) - (latestMetric?.dependencyIndex || 0),
          PR: (latestMetric?.passRate || 0) - (firstMetric?.passRate || 0),
          CS: (latestMetric?.checklistScore || 0) - (firstMetric?.checklistScore || 0),
        },
      };

      logger.info({ userId, attemptId, metricsCount: metrics.length }, 'Session metrics retrieved');

      return {
        attempt: {
          id: attempt.id,
          challengeTitle: attempt.challenge.title,
          difficulty: attempt.challenge.difficulty,
          category: attempt.challenge.category,
          status: attempt.status,
          startedAt: attempt.startedAt,
        },
        metrics,
        trends,
        userAverages,
        summary,
      };
    } catch (error) {
      logger.error({ error, userId, attemptId }, 'Failed to get session metrics');
      throw error;
    }
  }
}