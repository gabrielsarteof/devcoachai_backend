import type { FastifyRequest, FastifyReply } from 'fastify';
import { TrackMetricsUseCase } from '../../application/use-cases/track-metrics.use-case';
import { GetSessionMetricsUseCase } from '../../application/use-cases/get-session-metrics.use-case';
import { StreamMetricsUseCase } from '../../application/use-cases/stream-metrics.use-case';
import { logger } from '@/shared/infrastructure/monitoring/logger';
import { ZodError } from 'zod';
import {
  TrackMetricsDTO,
  StreamMetricsDTO,
  AttemptParamsDTO,
  AttemptParamsSchema
} from '../../domain/schemas/metric.schema';
import {
  MetricError,
  ValidationError
} from '../../domain/errors';

export class MetricController {
  constructor(
    private readonly trackMetricsUseCase: TrackMetricsUseCase,
    private readonly getSessionMetricsUseCase: GetSessionMetricsUseCase,
    private readonly streamMetricsUseCase: StreamMetricsUseCase
  ) {}

  trackMetrics = async (
    request: FastifyRequest<{ Body: TrackMetricsDTO }>,
    reply: FastifyReply
  ): Promise<void> => {
    const startTime = Date.now();
    const requestId = crypto.randomUUID();
    const user = request.user as { id: string; email: string; role: string };

    logger.info({
      requestId,
      operation: 'metrics_tracking_request',
      userId: user.id,
      userRole: user.role,
      attemptId: request.body.attemptId,
      sessionTime: request.body.sessionTime,
      metrics: {
        totalLines: request.body.totalLines,
        linesFromAI: request.body.linesFromAI,
        linesTyped: request.body.linesTyped,
        copyPasteEvents: request.body.copyPasteEvents,
        deleteEvents: request.body.deleteEvents,
        testRuns: request.body.testRuns,
        testsPassed: request.body.testsPassed,
        testsTotal: request.body.testsTotal,
        checklistItemsCount: request.body.checklistItems.length,
        checklistCheckedCount: request.body.checklistItems.filter(item => item.checked).length
      },
      timeBreakdown: {
        aiUsageTime: request.body.aiUsageTime,
        manualCodingTime: request.body.manualCodingTime,
        debugTime: request.body.debugTime
      },
      ipAddress: request.ip,
      userAgent: request.headers['user-agent']
    }, 'Metrics tracking request received');

    try {
      const result = await this.trackMetricsUseCase.execute(user.id, request.body);

      const executionTime = Date.now() - startTime;

      logger.info({
        requestId,
        userId: user?.id,
        userRole: user?.role,
        attemptId: request.body.attemptId,
        metricSnapshotId: result.metricSnapshot.id,
        calculatedMetrics: {
          dependencyIndex: result.calculation.dependencyIndex,
          passRate: result.calculation.passRate,
          checklistScore: result.calculation.checklistScore
        },
        riskAssessment: {
          level: result.riskAssessment.level,
          score: result.riskAssessment.score,
          factorsCount: result.riskAssessment.factors.length,
          recommendationsCount: result.riskAssessment.recommendations.length
        },
        insightsCount: result.insights.length,
        sessionTime: request.body.sessionTime,
        executionTime,
        metricsTracked: true
      }, 'Metrics tracked successfully');

      // Log critical risk events
      if (result.riskAssessment.level === 'CRITICAL') {
        logger.error({
          userId: user.id,
          attemptId: request.body.attemptId,
          riskLevel: result.riskAssessment.level,
          riskScore: result.riskAssessment.score,
          riskFactors: result.riskAssessment.factors,
          dependencyIndex: result.calculation.dependencyIndex,
          passRate: result.calculation.passRate,
          checklistScore: result.calculation.checklistScore,
          criticalRiskDetected: true
        }, 'CRITICAL risk level detected in metrics tracking');
      } else if (result.riskAssessment.level === 'HIGH') {
        logger.warn({
          userId: user.id,
          attemptId: request.body.attemptId,
          riskLevel: result.riskAssessment.level,
          riskScore: result.riskAssessment.score,
          riskFactors: result.riskAssessment.factors,
          highRiskDetected: true
        }, 'HIGH risk level detected in metrics tracking');
      }

      // Log concerning dependency patterns
      if (result.calculation.dependencyIndex > 80) {
        logger.warn({
          userId: user.id,
          attemptId: request.body.attemptId,
          dependencyIndex: result.calculation.dependencyIndex,
          linesFromAI: request.body.linesFromAI,
          totalLines: request.body.totalLines,
          extremeAIDependency: true
        }, 'Extreme AI dependency detected in metrics');
      }

      // Log poor performance patterns
      if (result.calculation.passRate < 30) {
        logger.warn({
          userId: user.id,
          attemptId: request.body.attemptId,
          passRate: result.calculation.passRate,
          testsPassed: request.body.testsPassed,
          testsTotal: request.body.testsTotal,
          poorTestPerformance: true
        }, 'Poor test performance detected in metrics');
      }

      // Log validation concerns
      if (result.calculation.checklistScore < 3) {
        logger.warn({
          userId: user.id,
          attemptId: request.body.attemptId,
          checklistScore: result.calculation.checklistScore,
          checkedItems: request.body.checklistItems.filter(item => item.checked).length,
          totalItems: request.body.checklistItems.length,
          criticalValidationGaps: true
        }, 'Critical validation gaps detected in metrics');
      }
      
      return reply.status(201).send({
        success: true,
        data: result,
      });
    } catch (error) {
      const executionTime = Date.now() - startTime;

      if (error instanceof ZodError) {
        const validationError = new ValidationError(error);
        logger.warn({
          requestId,
          operation: 'metrics_tracking_validation_failed',
          userId: user.id,
          validationErrors: validationError.details,
          executionTime
        }, 'Metrics tracking failed - validation error');
        return reply.status(validationError.statusCode).send(validationError.toJSON());
      }

      if (error instanceof MetricError) {
        logger.warn({
          requestId,
          operation: 'metrics_tracking_domain_error',
          userId: user.id,
          attemptId: request.body.attemptId,
          errorCode: error.code,
          executionTime
        }, 'Metrics tracking failed - domain error');
        return reply.status(error.statusCode).send(error.toJSON());
      }

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error({
        requestId,
        operation: 'metrics_tracking_failed',
        userId: user.id,
        attemptId: request.body.attemptId,
        sessionTime: request.body.sessionTime,
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
        executionTime
      }, 'Metrics tracking failed');

      return reply.status(500).send({
        error: 'Internal server error',
        message: 'Failed to track metrics',
      });
    }
  };

  getSessionMetrics = async (
    request: FastifyRequest<{ Params: AttemptParamsDTO }>,
    reply: FastifyReply
  ): Promise<void> => {
    const startTime = Date.now();
    const requestId = crypto.randomUUID();
    const user = request.user as { id: string };

    logger.debug({
      requestId,
      operation: 'session_metrics_request',
      userId: user.id,
      attemptId: request.params.attemptId,
      ipAddress: request.ip
    }, 'Session metrics request received');

    try {
      logger.info({
        requestId,
        userId: user.id,
        attemptId: request.params.attemptId,
        operation: 'calling_use_case'
      }, 'About to call GetSessionMetricsUseCase');

      const result = await this.getSessionMetricsUseCase.execute(
        user.id,
        request.params.attemptId
      );

      logger.info({
        requestId,
        userId: user.id,
        attemptId: request.params.attemptId,
        operation: 'use_case_completed',
        resultType: typeof result,
        hasResult: !!result,
        resultKeys: result ? Object.keys(result) : null
      }, 'GetSessionMetricsUseCase completed successfully');

      // Log detalhado da estrutura do resultado antes de enviar
      logger.debug({
        requestId,
        userId: user.id,
        attemptId: request.params.attemptId,
        resultStructure: {
          hasAttempt: !!result.attempt,
          attemptKeys: result.attempt ? Object.keys(result.attempt) : [],
          hasMetrics: !!result.metrics,
          metricsLength: Array.isArray(result.metrics) ? result.metrics.length : 0,
          hasTrends: !!result.trends,
          trendsKeys: result.trends ? Object.keys(result.trends) : [],
          hasUserAverages: !!result.userAverages,
          userAveragesKeys: result.userAverages ? Object.keys(result.userAverages) : [],
          hasSummary: !!result.summary,
          summaryKeys: result.summary ? Object.keys(result.summary) : [],
          summaryImprovement: result.summary?.improvement ? Object.keys(result.summary.improvement) : null
        }
      }, 'Detailed result structure in controller');
      
      const executionTime = Date.now() - startTime;
      
      logger.info({
        requestId,
        userId: user.id,
        attemptId: request.params.attemptId,
        challenge: {
          title: result.attempt.challengeTitle,
          difficulty: result.attempt.difficulty,
          category: result.attempt.category,
          status: result.attempt.status
        },
        metricsCount: result.metrics.length,
        summary: {
          totalTime: result.summary.totalTime,
          totalSnapshots: result.summary.totalSnapshots,
          currentMetrics: {
            DI: result.summary.currentDI,
            PR: result.summary.currentPR,
            CS: result.summary.currentCS
          },
          improvement: result.summary.improvement
        },
        userAverages: result.userAverages,
        executionTime,
        sessionMetricsRetrieved: true
      }, 'Session metrics retrieved successfully');

      // Log performance insights
      if (result.summary.improvement.DI < -20) {
        logger.info({
          userId: user.id,
          attemptId: request.params.attemptId,
          dependencyImprovement: Math.abs(result.summary.improvement.DI),
          significantImprovement: true
        }, 'Significant dependency index improvement detected');
      }

      if (result.summary.improvement.PR > 30) {
        logger.info({
          userId: user.id,
          attemptId: request.params.attemptId,
          passRateImprovement: result.summary.improvement.PR,
          excellentProgress: true
        }, 'Excellent pass rate improvement detected');
      }
      
      // Validação final antes do envio
      const responseData = {
        attempt: result.attempt || {
          id: request.params.attemptId,
          challengeTitle: 'Unknown',
          difficulty: 'UNKNOWN',
          category: 'UNKNOWN',
          status: 'UNKNOWN',
          startedAt: null,
        },
        metrics: Array.isArray(result.metrics) ? result.metrics : [],
        trends: result.trends || {},
        userAverages: result.userAverages || { averageDI: 0, averagePR: 0, averageCS: 0 },
        summary: result.summary || {
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
        requestId,
        userId: user.id,
        attemptId: request.params.attemptId,
        finalResponse: {
          hasAttempt: !!responseData.attempt,
          hasMetrics: !!responseData.metrics,
          metricsLength: Array.isArray(responseData.metrics) ? responseData.metrics.length : 0,
          hasSummary: !!responseData.summary,
          summaryKeys: responseData.summary ? Object.keys(responseData.summary) : [],
          hasImprovement: !!(responseData.summary && responseData.summary.improvement),
          improvementKeys: responseData.summary?.improvement ? Object.keys(responseData.summary.improvement) : []
        }
      }, 'Final response validation before send');

      // Força serialização controlada para evitar problemas de enumerabilidade
      const serializedData = JSON.parse(JSON.stringify(responseData));

      logger.debug({
        requestId,
        serializedCheck: {
          originalHasAttempt: !!responseData.attempt,
          serializedHasAttempt: !!serializedData.attempt,
          originalAttemptKeys: responseData.attempt ? Object.keys(responseData.attempt) : [],
          serializedAttemptKeys: serializedData.attempt ? Object.keys(serializedData.attempt) : [],
          originalHasSummary: !!responseData.summary,
          serializedHasSummary: !!serializedData.summary,
          originalSummaryKeys: responseData.summary ? Object.keys(responseData.summary) : [],
          serializedSummaryKeys: serializedData.summary ? Object.keys(serializedData.summary) : []
        }
      }, 'Serialization check completed');

      return reply.send(serializedData);
    } catch (error) {
      const executionTime = Date.now() - startTime;

      if (error instanceof ZodError) {
        const validationError = new ValidationError(error);
        logger.warn({
          requestId,
          operation: 'session_metrics_validation_failed',
          userId: user.id,
          validationErrors: validationError.details,
          executionTime
        }, 'Session metrics failed - validation error');
        return reply.status(validationError.statusCode).send(validationError.toJSON());
      }

      if (error instanceof MetricError) {
        logger.warn({
          requestId,
          operation: 'session_metrics_domain_error',
          userId: user.id,
          attemptId: request.params.attemptId,
          errorCode: error.code,
          executionTime
        }, 'Session metrics failed - domain error');
        return reply.status(error.statusCode).send(error.toJSON());
      }

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error({
        requestId,
        operation: 'session_metrics_failed',
        userId: user.id,
        attemptId: request.params.attemptId,
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
        executionTime
      }, 'Failed to retrieve session metrics');

      return reply.status(500).send({
        error: 'Internal server error',
        message: 'Failed to retrieve session metrics',
      });
    }
  };

  startStream = async (
    request: FastifyRequest<{ Body: StreamMetricsDTO }>,
    reply: FastifyReply
  ): Promise<void> => {
    const startTime = Date.now();
    const requestId = crypto.randomUUID();
    const user = request.user as { id: string };

    logger.info({
      requestId,
      operation: 'metrics_stream_start_request',
      userId: user.id,
      attemptId: request.body.attemptId,
      interval: request.body.interval,
      ipAddress: request.ip
    }, 'Metrics stream start request received');

    try {
      await this.streamMetricsUseCase.startStream(user.id, request.body);
      
      const executionTime = Date.now() - startTime;
      
      logger.info({
        requestId,
        userId: user.id,
        attemptId: request.body.attemptId,
        interval: request.body.interval,
        executionTime,
        streamStarted: true
      }, 'Metrics stream started successfully');
      
      return reply.status(201).send({
        success: true,
        message: 'Metrics stream started',
      });
    } catch (error) {
      const executionTime = Date.now() - startTime;

      if (error instanceof ZodError) {
        const validationError = new ValidationError(error);
        logger.warn({
          requestId,
          operation: 'metrics_stream_start_validation_failed',
          userId: user.id,
          validationErrors: validationError.details,
          executionTime
        }, 'Stream start failed - validation error');
        return reply.status(validationError.statusCode).send(validationError.toJSON());
      }

      if (error instanceof MetricError) {
        logger.warn({
          requestId,
          operation: 'metrics_stream_start_domain_error',
          userId: user.id,
          attemptId: request.body.attemptId,
          errorCode: error.code,
          executionTime
        }, 'Stream start failed - domain error');
        return reply.status(error.statusCode).send(error.toJSON());
      }

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error({
        requestId,
        operation: 'metrics_stream_start_failed',
        userId: user.id,
        attemptId: request.body.attemptId,
        interval: request.body.interval,
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
        executionTime
      }, 'Failed to start metrics stream');

      return reply.status(500).send({
        error: 'Internal server error',
        message: 'Failed to start metrics stream',
      });
    }
  };

  stopStream = async (
    request: FastifyRequest<{ Params: AttemptParamsDTO }>,
    reply: FastifyReply
  ): Promise<void> => {
    const startTime = Date.now();
    const requestId = crypto.randomUUID();
    const user = request.user as { id: string };

    logger.info({
      requestId,
      operation: 'metrics_stream_stop_request',
      userId: user.id,
      attemptId: request.params.attemptId,
      ipAddress: request.ip
    }, 'Metrics stream stop request received');

    try {
      // Validate attemptId format
      const validatedParams = AttemptParamsSchema.parse(request.params);

      this.streamMetricsUseCase.stopStream(user.id, validatedParams.attemptId);
      
      const executionTime = Date.now() - startTime;
      
      logger.info({
        requestId,
        userId: user.id,
        attemptId: request.params.attemptId,
        executionTime,
        streamStopped: true
      }, 'Metrics stream stopped successfully');
      
      return reply.status(204).send();
    } catch (error) {
      const executionTime = Date.now() - startTime;

      if (error instanceof ZodError) {
        const validationError = new ValidationError(error);
        logger.warn({
          requestId,
          operation: 'metrics_stream_stop_validation_failed',
          userId: user.id,
          attemptId: request.params.attemptId,
          validationErrors: validationError.details,
          executionTime
        }, 'Stream stop failed - validation error');
        return reply.status(validationError.statusCode).send(validationError.toJSON());
      }

      if (error instanceof MetricError) {
        logger.warn({
          requestId,
          operation: 'metrics_stream_stop_domain_error',
          userId: user.id,
          attemptId: request.params.attemptId,
          errorCode: error.code,
          executionTime
        }, 'Stream stop failed - domain error');
        return reply.status(error.statusCode).send(error.toJSON());
      }

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error({
        requestId,
        operation: 'metrics_stream_stop_failed',
        userId: user.id,
        attemptId: request.params.attemptId,
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
        executionTime
      }, 'Failed to stop metrics stream');

      return reply.status(500).send({
        error: 'Internal server error',
        message: 'Failed to stop metrics stream',
      });
    }
  };
};