import { PrismaClient, MetricSnapshot } from '@prisma/client';
import { IMetricRepository, CreateMetricData } from '../../domain/repositories/metric.repository.interface';
import { logger } from '@/shared/infrastructure/monitoring/logger';

export class MetricRepository implements IMetricRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(data: CreateMetricData): Promise<MetricSnapshot> {
    const startTime = Date.now();
    
    logger.info({
      operation: 'create_metric_snapshot',
      attemptId: data.attemptId,
      userId: data.userId,
      sessionTime: data.sessionTime,
      dependencyIndex: data.dependencyIndex,
      passRate: data.passRate,
      checklistScore: data.checklistScore,
      hasCodeQuality: data.codeQuality !== undefined,
      hasDebugTime: data.debugTime !== undefined,
      hasAiUsageTime: data.aiUsageTime !== undefined,
      hasManualCodingTime: data.manualCodingTime !== undefined
    }, 'Creating metric snapshot');

    try {
      const metricSnapshot = await this.prisma.metricSnapshot.create({
        data: {
          ...data,
          timestamp: new Date(),
        },
      });

      const processingTime = Date.now() - startTime;
      
      logger.info({
        operation: 'create_metric_snapshot_success',
        metricId: metricSnapshot.id,
        attemptId: data.attemptId,
        userId: data.userId,
        sessionTime: data.sessionTime,
        metrics: {
          dependencyIndex: data.dependencyIndex,
          passRate: data.passRate,
          checklistScore: data.checklistScore,
          codeQuality: data.codeQuality
        },
        processingTime
      }, 'Metric snapshot created successfully');

      if (data.dependencyIndex > 80) {
        logger.warn({
          metricId: metricSnapshot.id,
          userId: data.userId,
          attemptId: data.attemptId,
          dependencyIndex: data.dependencyIndex,
          highDependency: true
        }, 'High AI dependency detected in metric snapshot');
      }

      if (data.passRate < 30) {
        logger.warn({
          metricId: metricSnapshot.id,
          userId: data.userId,
          attemptId: data.attemptId,
          passRate: data.passRate,
          lowPassRate: true
        }, 'Low pass rate detected in metric snapshot');
      }

      if (data.checklistScore < 3) {
        logger.warn({
          metricId: metricSnapshot.id,
          userId: data.userId,
          attemptId: data.attemptId,
          checklistScore: data.checklistScore,
          poorValidation: true
        }, 'Poor validation practices detected in metric snapshot');
      }

      return metricSnapshot;
      
    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      logger.error({
        operation: 'create_metric_snapshot_failed',
        attemptId: data.attemptId,
        userId: data.userId,
        sessionTime: data.sessionTime,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        processingTime
      }, 'Failed to create metric snapshot');
      
      throw error;
    }
  }

  async findByAttempt(attemptId: string): Promise<MetricSnapshot[]> {
    const startTime = Date.now();
    
    logger.debug({
      operation: 'find_metrics_by_attempt',
      attemptId
    }, 'Finding metrics by attempt ID');

    try {
      const metrics = await this.prisma.metricSnapshot.findMany({
        where: { attemptId },
        orderBy: { timestamp: 'asc' },
      });

      const processingTime = Date.now() - startTime;
      
      logger.info({
        operation: 'find_metrics_by_attempt_success',
        attemptId,
        metricsFound: metrics.length,
        timeRange: metrics.length > 0 ? {
          start: metrics[0].timestamp,
          end: metrics[metrics.length - 1].timestamp,
          durationSeconds: Math.floor((metrics[metrics.length - 1].timestamp.getTime() - metrics[0].timestamp.getTime()) / 1000)
        } : null,
        sessionTimeRange: metrics.length > 0 ? {
          start: metrics[0].sessionTime,
          end: metrics[metrics.length - 1].sessionTime
        } : null,
        processingTime
      }, 'Metrics found by attempt ID');

      return metrics;
      
    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      logger.error({
        operation: 'find_metrics_by_attempt_failed',
        attemptId,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        processingTime
      }, 'Failed to find metrics by attempt');
      
      throw error;
    }
  }

  async findLatest(attemptId: string): Promise<MetricSnapshot | null> {
    const startTime = Date.now();
    
    logger.debug({
      operation: 'find_latest_metric',
      attemptId
    }, 'Finding latest metric for attempt');

    try {
      const metric = await this.prisma.metricSnapshot.findFirst({
        where: { attemptId },
        orderBy: { timestamp: 'desc' },
      });

      const processingTime = Date.now() - startTime;
      
      if (metric) {
        logger.debug({
          operation: 'find_latest_metric_success',
          metricId: metric.id,
          attemptId,
          timestamp: metric.timestamp,
          sessionTime: metric.sessionTime,
          metrics: {
            dependencyIndex: metric.dependencyIndex,
            passRate: metric.passRate,
            checklistScore: metric.checklistScore
          },
          processingTime
        }, 'Latest metric found');
      } else {
        logger.info({
          operation: 'find_latest_metric_not_found',
          attemptId,
          processingTime
        }, 'No metrics found for attempt');
      }

      return metric;
      
    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      logger.error({
        operation: 'find_latest_metric_failed',
        attemptId,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        processingTime
      }, 'Failed to find latest metric');
      
      throw error;
    }
  }

  async findByUser(userId: string, limit: number = 100): Promise<MetricSnapshot[]> {
    const startTime = Date.now();
    
    logger.debug({
      operation: 'find_metrics_by_user',
      userId,
      limit
    }, 'Finding metrics by user ID');

    try {
      const metrics = await this.prisma.metricSnapshot.findMany({
        where: { userId },
        orderBy: { timestamp: 'desc' },
        take: limit,
      });

      const processingTime = Date.now() - startTime;
      
      logger.info({
        operation: 'find_metrics_by_user_success',
        userId,
        metricsFound: metrics.length,
        limit,
        averageMetrics: metrics.length > 0 ? {
          dependencyIndex: Math.round((metrics.reduce((sum, m) => sum + m.dependencyIndex, 0) / metrics.length) * 100) / 100,
          passRate: Math.round((metrics.reduce((sum, m) => sum + m.passRate, 0) / metrics.length) * 100) / 100,
          checklistScore: Math.round((metrics.reduce((sum, m) => sum + m.checklistScore, 0) / metrics.length) * 100) / 100
        } : null,
        timeRange: metrics.length > 0 ? {
          latest: metrics[0].timestamp,
          oldest: metrics[metrics.length - 1].timestamp
        } : null,
        processingTime
      }, 'User metrics found successfully');

      return metrics;
      
    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      logger.error({
        operation: 'find_metrics_by_user_failed',
        userId,
        limit,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        processingTime
      }, 'Failed to find metrics by user');
      
      throw error;
    }
  }

  async deleteByAttempt(attemptId: string): Promise<void> {
    const startTime = Date.now();
    
    logger.warn({
      operation: 'delete_metrics_by_attempt',
      attemptId
    }, 'Deleting metrics by attempt ID');

    try {
      const deleteResult = await this.prisma.metricSnapshot.deleteMany({
        where: { attemptId },
      });

      const processingTime = Date.now() - startTime;
      
      logger.warn({
        operation: 'delete_metrics_by_attempt_success',
        attemptId,
        deletedCount: deleteResult.count,
        processingTime
      }, 'Metrics deleted by attempt ID');
      
    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      logger.error({
        operation: 'delete_metrics_by_attempt_failed',
        attemptId,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        processingTime
      }, 'Failed to delete metrics by attempt');
      
      throw error;
    }
  }

  async createBatch(data: CreateMetricData[]): Promise<MetricSnapshot[]> {
    const startTime = Date.now();
    
    logger.info({
      operation: 'create_metric_batch',
      batchSize: data.length,
      attemptIds: [...new Set(data.map(d => d.attemptId))],
      userIds: [...new Set(data.map(d => d.userId))]
    }, 'Creating batch of metric snapshots');

    try {
      const created = await this.prisma.$transaction(
        data.map(item =>
          this.prisma.metricSnapshot.create({
            data: {
              ...item,
              timestamp: new Date(),
            },
          })
        )
      );

      const processingTime = Date.now() - startTime;
      
      logger.info({
        operation: 'create_metric_batch_success',
        batchSize: data.length,
        createdCount: created.length,
        attemptIds: [...new Set(data.map(d => d.attemptId))],
        userIds: [...new Set(data.map(d => d.userId))],
        averageMetrics: {
          dependencyIndex: Math.round((data.reduce((sum, d) => sum + d.dependencyIndex, 0) / data.length) * 100) / 100,
          passRate: Math.round((data.reduce((sum, d) => sum + d.passRate, 0) / data.length) * 100) / 100,
          checklistScore: Math.round((data.reduce((sum, d) => sum + d.checklistScore, 0) / data.length) * 100) / 100
        },
        processingTime
      }, 'Batch metrics created successfully');

      const highDependencyCount = data.filter(d => d.dependencyIndex > 80).length;
      const lowPassRateCount = data.filter(d => d.passRate < 30).length;
      const poorValidationCount = data.filter(d => d.checklistScore < 3).length;

      if (highDependencyCount > 0) {
        logger.warn({
          operation: 'batch_metrics_high_dependency',
          highDependencyCount,
          batchSize: data.length,
          percentage: Math.round((highDependencyCount / data.length) * 100)
        }, 'High dependency metrics detected in batch');
      }

      if (lowPassRateCount > 0) {
        logger.warn({
          operation: 'batch_metrics_low_pass_rate',
          lowPassRateCount,
          batchSize: data.length,
          percentage: Math.round((lowPassRateCount / data.length) * 100)
        }, 'Low pass rate metrics detected in batch');
      }

      if (poorValidationCount > 0) {
        logger.warn({
          operation: 'batch_metrics_poor_validation',
          poorValidationCount,
          batchSize: data.length,
          percentage: Math.round((poorValidationCount / data.length) * 100)
        }, 'Poor validation metrics detected in batch');
      }

      return created;
      
    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      logger.error({
        operation: 'create_metric_batch_failed',
        batchSize: data.length,
        attemptIds: [...new Set(data.map(d => d.attemptId))],
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        processingTime
      }, 'Failed to create batch metrics');
      
      throw error;
    }
  }

  async validateAttemptOwnership(attemptId: string, userId: string): Promise<boolean> {
    const startTime = Date.now();

    logger.debug({
      operation: 'validate_attempt_ownership',
      attemptId,
      userId
    }, 'Validating attempt ownership');

    try {
      const attempt = await this.prisma.challengeAttempt.findUnique({
        where: { id: attemptId },
        select: {
          userId: true,
          status: true
        },
      });

      const processingTime = Date.now() - startTime;

      // Validate ownership and that attempt is still in progress
      const isOwner = attempt ? attempt.userId === userId : false;
      const isInProgress = attempt ? attempt.status === 'IN_PROGRESS' : false;
      const isValid = isOwner && isInProgress;

      logger.info({
        operation: 'validate_attempt_ownership_result',
        attemptId,
        userId,
        isValid,
        isOwner,
        isInProgress,
        attemptExists: !!attempt,
        attemptStatus: attempt?.status,
        processingTime
      }, isValid ? 'Attempt ownership and status validated' : 'Attempt ownership or status validation failed');

      return isValid;

    } catch (error) {
      const processingTime = Date.now() - startTime;

      logger.error({
        operation: 'validate_attempt_ownership_failed',
        attemptId,
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        processingTime
      }, 'Failed to validate attempt ownership');

      throw error;
    }
  }
}