import type { FastifyRequest, FastifyReply } from 'fastify';
import { TrackMetricsUseCase, TrackMetricsDTO } from '../../application/use-cases/track-metrics.use-case';
import { GetSessionMetricsUseCase } from '../../application/use-cases/get-session-metrics.use-case';
import { StreamMetricsUseCase, StreamMetricsDTO } from '../../application/use-cases/stream-metrics.use-case';
import { logger } from '@/shared/infrastructure/monitoring/logger';

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
    const user = request.user as { id: string };
    
    logger.info({
      requestId,
      operation: 'metrics_tracking_request',
      userId: user.id,
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
      ipAddress: request.ip
    }, 'Metrics tracking request received');

    try {
      const result = await this.trackMetricsUseCase.execute(user.id, request.body);
      
      const executionTime = Date.now() - startTime;
      
      logger.info({
        requestId,
        userId: user.id,
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
      
      return reply.send({
        success: true,
        data: result,
      });
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      if (error instanceof Error && error.message === 'Invalid attempt') {
        logger.warn({
          requestId,
          operation: 'metrics_tracking_invalid_attempt',
          userId: user.id,
          attemptId: request.body.attemptId,
          reason: 'invalid_attempt_or_unauthorized',
          executionTime
        }, 'Metrics tracking failed - invalid attempt');
        
        return reply.status(403).send({
          error: 'Forbidden',
          message: 'Invalid attempt or unauthorized',
        });
      }

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
    request: FastifyRequest<{ Params: { attemptId: string } }>,
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
      const result = await this.getSessionMetricsUseCase.execute(
        user.id,
        request.params.attemptId
      );
      
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
      
      return reply.send(result);
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      if (error instanceof Error && error.message.includes('Invalid attempt')) {
        logger.warn({
          requestId,
          operation: 'session_metrics_invalid_attempt',
          userId: user.id,
          attemptId: request.params.attemptId,
          reason: 'invalid_attempt_or_unauthorized',
          executionTime
        }, 'Session metrics failed - invalid attempt');
        
        return reply.status(403).send({
          error: 'Forbidden',
          message: 'Invalid attempt or unauthorized',
        });
      }

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
      
      return reply.send({
        success: true,
        message: 'Metrics stream started',
      });
    } catch (error) {
      const executionTime = Date.now() - startTime;
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
    request: FastifyRequest<{ Params: { attemptId: string } }>,
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
      this.streamMetricsUseCase.stopStream(user.id, request.params.attemptId);
      
      const executionTime = Date.now() - startTime;
      
      logger.info({
        requestId,
        userId: user.id,
        attemptId: request.params.attemptId,
        executionTime,
        streamStopped: true
      }, 'Metrics stream stopped successfully');
      
      return reply.send({
        success: true,
        message: 'Metrics stream stopped',
      });
    } catch (error) {
      const executionTime = Date.now() - startTime;
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