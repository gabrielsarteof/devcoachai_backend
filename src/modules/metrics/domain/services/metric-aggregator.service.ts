import { PrismaClient, MetricSnapshot } from '@prisma/client';
import { Redis } from 'ioredis';
import { MetricTrend } from '../types/metric.types';
import { logger } from '@/shared/infrastructure/monitoring/logger';

export class MetricAggregatorService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly redis: Redis
  ) {}

  async getSessionMetrics(attemptId: string): Promise<MetricSnapshot[]> {
    const startTime = Date.now();
    const cacheKey = `metrics:session:${attemptId}`;
    
    logger.debug({
      operation: 'get_session_metrics',
      attemptId,
      cacheKey
    }, 'Retrieving session metrics');

    try {
      const cached = await this.redis.get(cacheKey);
      
      if (cached) {
        const metrics = JSON.parse(cached);
        
        logger.info({
          operation: 'session_metrics_cache_hit',
          attemptId,
          metricsCount: metrics.length,
          processingTime: Date.now() - startTime
        }, 'Session metrics retrieved from cache');
        
        return metrics;
      }

      const metrics = await this.prisma.metricSnapshot.findMany({
        where: { attemptId },
        orderBy: { timestamp: 'asc' },
      });

      await this.redis.setex(cacheKey, 600, JSON.stringify(metrics));
      
      const processingTime = Date.now() - startTime;
      
      logger.info({
        operation: 'session_metrics_db_retrieved',
        attemptId,
        metricsCount: metrics.length,
        timeRange: metrics.length > 0 ? {
          start: metrics[0].timestamp,
          end: metrics[metrics.length - 1].timestamp
        } : null,
        processingTime
      }, 'Session metrics retrieved from database and cached');

      return metrics;
    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      logger.error({
        operation: 'get_session_metrics_failed',
        attemptId,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        processingTime
      }, 'Failed to retrieve session metrics');
      
      throw error;
    }
  }

  async getUserAverages(userId: string): Promise<{
    averageDI: number;
    averagePR: number;
    averageCS: number;
  }> {
    const startTime = Date.now();
    
    logger.debug({
      operation: 'get_user_averages',
      userId
    }, 'Retrieving user metric averages');

    try {
      const userMetrics = await this.prisma.userMetrics.findUnique({
        where: { userId },
      });

      const processingTime = Date.now() - startTime;

      if (!userMetrics) {
        logger.info({
          operation: 'user_averages_not_found',
          userId,
          result: { averageDI: 0, averagePR: 0, averageCS: 0 },
          processingTime
        }, 'No user metrics found, returning default averages');
        
        return { averageDI: 0, averagePR: 0, averageCS: 0 };
      }

      // Sanitizar e validar valores numéricos para evitar NaN
      const averages = {
        averageDI: typeof userMetrics.averageDI === 'number' && !isNaN(userMetrics.averageDI)
          ? userMetrics.averageDI
          : 0,
        averagePR: typeof userMetrics.averagePR === 'number' && !isNaN(userMetrics.averagePR)
          ? userMetrics.averagePR
          : 0,
        averageCS: typeof userMetrics.averageCS === 'number' && !isNaN(userMetrics.averageCS)
          ? userMetrics.averageCS
          : 0,
      };
      
      logger.info({
        operation: 'user_averages_retrieved',
        userId,
        averages,
        updatedAt: userMetrics.updatedAt,
        processingTime
      }, 'User metric averages retrieved successfully');

      return averages;
    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      logger.error({
        operation: 'get_user_averages_failed',
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        processingTime
      }, 'Failed to retrieve user averages');
      
      throw error;
    }
  }

  async calculateTrends(
    attemptId: string,
    windowSize: number = 5
  ): Promise<Record<string, MetricTrend>> {
    const startTime = Date.now();
    
    logger.debug({
      operation: 'calculate_trends',
      attemptId,
      windowSize
    }, 'Calculating metric trends');

    try {
      const metrics = await this.getSessionMetrics(attemptId);
      
      if (metrics.length < 2) {
        const emptyTrends = {
          DI: this.createEmptyTrend('DI'),
          PR: this.createEmptyTrend('PR'),
          CS: this.createEmptyTrend('CS'),
        };
        
        logger.info({
          operation: 'trends_insufficient_data',
          attemptId,
          metricsCount: metrics.length,
          result: 'empty_trends',
          processingTime: Date.now() - startTime
        }, 'Insufficient data for trend calculation');
        
        return emptyTrends;
      }

      // Calcular tendências individuais com tratamento de erro
      let trends: Record<string, MetricTrend>;
      try {
        trends = {
          DI: this.calculateTrend(metrics, 'dependencyIndex', 'DI', windowSize),
          PR: this.calculateTrend(metrics, 'passRate', 'PR', windowSize),
          CS: this.calculateTrend(metrics, 'checklistScore', 'CS', windowSize),
        };

        if (!trends.DI || !trends.PR || !trends.CS) {
          throw new Error('Some trends could not be calculated');
        }
      } catch (trendError) {
        logger.warn({
          error: trendError instanceof Error ? trendError.message : 'Unknown trend calculation error',
          attemptId,
          metricsCount: metrics.length
        }, 'Error in trend calculation, falling back to empty trends');

        trends = {
          DI: this.createEmptyTrend('DI'),
          PR: this.createEmptyTrend('PR'),
          CS: this.createEmptyTrend('CS'),
        };
      }

      const processingTime = Date.now() - startTime;
      
      logger.info({
        operation: 'trends_calculated',
        attemptId,
        metricsCount: metrics.length,
        windowSize,
        trends: {
          DI: { trend: trends.DI.trend, changePercent: trends.DI.changePercent },
          PR: { trend: trends.PR.trend, changePercent: trends.PR.changePercent },
          CS: { trend: trends.CS.trend, changePercent: trends.CS.changePercent }
        },
        processingTime
      }, 'Metric trends calculated successfully');

      // Log significant trends
      Object.entries(trends).forEach(([metric, trend]) => {
        if (Math.abs(trend.changePercent) > 20) {
          logger.info({
            attemptId,
            metric,
            trend: trend.trend,
            changePercent: trend.changePercent,
            significantTrend: true
          }, `Significant ${metric} trend detected`);
        }
      });

      // Validação final do objeto de tendências
      if (!trends || typeof trends !== 'object' || !trends.DI || !trends.PR || !trends.CS) {
        logger.error({
          attemptId,
          trends,
          error: 'Invalid trends object structure'
        }, 'Final validation failed, returning empty trends');

        return {
          DI: this.createEmptyTrend('DI'),
          PR: this.createEmptyTrend('PR'),
          CS: this.createEmptyTrend('CS'),
        };
      }

      return trends;
    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      logger.error({
        operation: 'calculate_trends_failed',
        attemptId,
        windowSize,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        processingTime
      }, 'Failed to calculate metric trends');
      
      throw error;
    }
  }

  private calculateTrend(
    metrics: MetricSnapshot[],
    field: keyof MetricSnapshot,
    metricName: 'DI' | 'PR' | 'CS',
    windowSize: number
  ): MetricTrend {
    logger.debug({
      operation: 'calculate_individual_trend',
      field,
      metricName,
      metricsCount: metrics.length,
      windowSize
    }, 'Calculating individual metric trend');

    try {
      const values = metrics.map(m => ({
        timestamp: m.timestamp,
        value: Number(m[field]) || 0,
      }));

      if (values.length < 2) {
        logger.debug({
          metricName,
          valuesCount: values.length,
          result: 'empty_trend'
        }, 'Insufficient values for trend calculation');
        
        return this.createEmptyTrend(metricName);
      }

      const recent = values.slice(-windowSize);
      const older = values.slice(Math.max(0, values.length - windowSize * 2), -windowSize);
      
      if (older.length === 0) {
        logger.debug({
          metricName,
          recentCount: recent.length,
          olderCount: older.length,
          result: 'stable_trend'
        }, 'No older data available, trend is stable');
        
        return {
          metric: metricName,
          values,
          trend: 'stable',
          changePercent: 0,
        };
      }

      const recentAvg = recent.reduce((sum, v) => sum + v.value, 0) / recent.length;
      const olderAvg = older.reduce((sum, v) => sum + v.value, 0) / older.length;
      const changePercent = ((recentAvg - olderAvg) / olderAvg) * 100;

      let trend: MetricTrend['trend'];
      if (metricName === 'DI') {
        // For Dependency Index, lower is better
        trend = changePercent < -5 ? 'improving' : changePercent > 5 ? 'declining' : 'stable';
      } else {
        // For Pass Rate and Checklist Score, higher is better
        trend = changePercent > 5 ? 'improving' : changePercent < -5 ? 'declining' : 'stable';
      }

      const result = {
        metric: metricName,
        values,
        trend,
        changePercent: Math.round(changePercent * 100) / 100,
      };

      logger.debug({
        metricName,
        recentAvg,
        olderAvg,
        changePercent: result.changePercent,
        trend,
        recentCount: recent.length,
        olderCount: older.length
      }, 'Individual trend calculated');

      return result;
    } catch (error) {
      logger.error({
        operation: 'calculate_individual_trend_failed',
        metricName,
        field,
        error: error instanceof Error ? error.message : 'Unknown error'
      }, 'Failed to calculate individual trend');
      
      return this.createEmptyTrend(metricName);
    }
  }

  private createEmptyTrend(metricName: 'DI' | 'PR' | 'CS'): MetricTrend {
    logger.debug({
      operation: 'create_empty_trend',
      metricName
    }, 'Creating empty trend');

    return {
      metric: metricName,
      values: [],
      trend: 'stable',
      changePercent: 0,
    };
  }

  async updateUserAverages(userId: string): Promise<void> {
    const startTime = Date.now();
    
    logger.info({
      operation: 'update_user_averages',
      userId
    }, 'Updating user metric averages');

    try {
      const attempts = await this.prisma.challengeAttempt.findMany({
        where: {
          userId,
          status: 'COMPLETED',
        },
        select: {
          finalDI: true,
          finalPR: true,
          finalCS: true,
        },
      });

      if (attempts.length === 0) {
        logger.info({
          operation: 'update_user_averages_no_attempts',
          userId,
          processingTime: Date.now() - startTime
        }, 'No completed attempts found, skipping average update');
        return;
      }

      const avgDI = attempts.reduce((sum, a) => sum + (a.finalDI || 0), 0) / attempts.length;
      const avgPR = attempts.reduce((sum, a) => sum + (a.finalPR || 0), 0) / attempts.length;
      const avgCS = attempts.reduce((sum, a) => sum + (a.finalCS || 0), 0) / attempts.length;

      const roundedAverages = {
        avgDI: Math.round(avgDI * 100) / 100,
        avgPR: Math.round(avgPR * 100) / 100,
        avgCS: Math.round(avgCS * 100) / 100,
      };

      await this.prisma.userMetrics.upsert({
        where: { userId },
        update: {
          averageDI: roundedAverages.avgDI,
          averagePR: roundedAverages.avgPR,
          averageCS: roundedAverages.avgCS,
          updatedAt: new Date(),
        },
        create: {
          userId,
          averageDI: roundedAverages.avgDI,
          averagePR: roundedAverages.avgPR,
          averageCS: roundedAverages.avgCS,
          weeklyTrends: [],
          metricsByCategory: {},
          strongAreas: [],
          weakAreas: [],
        },
      });

      const processingTime = Date.now() - startTime;
      
      logger.info({
        operation: 'user_averages_updated',
        userId,
        attemptsCount: attempts.length,
        averages: roundedAverages,
        processingTime
      }, 'User averages updated successfully');

      // Log performance insights
      if (roundedAverages.avgDI < 30) {
        logger.info({
          userId,
          averageDI: roundedAverages.avgDI,
          lowDependency: true
        }, 'User shows low AI dependency on average');
      } else if (roundedAverages.avgDI > 70) {
        logger.warn({
          userId,
          averageDI: roundedAverages.avgDI,
          highDependency: true
        }, 'User shows high AI dependency on average');
      }

      if (roundedAverages.avgPR > 80) {
        logger.info({
          userId,
          averagePR: roundedAverages.avgPR,
          highPassRate: true
        }, 'User shows excellent test pass rate on average');
      } else if (roundedAverages.avgPR < 50) {
        logger.warn({
          userId,
          averagePR: roundedAverages.avgPR,
          lowPassRate: true
        }, 'User shows low test pass rate on average');
      }

      if (roundedAverages.avgCS > 8) {
        logger.info({
          userId,
          averageCS: roundedAverages.avgCS,
          excellentValidation: true
        }, 'User shows excellent validation practices on average');
      } else if (roundedAverages.avgCS < 5) {
        logger.warn({
          userId,
          averageCS: roundedAverages.avgCS,
          poorValidation: true
        }, 'User shows poor validation practices on average');
      }
    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      logger.error({
        operation: 'update_user_averages_failed',
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        processingTime
      }, 'Failed to update user averages');
      
      throw error;
    }
  }
}