import { z } from 'zod';
import { IMetricRepository } from '../../domain/repositories/metric.repository.interface';
import { MetricCalculatorService } from '../../domain/services/metric-calculator.service';
import { WebSocketServer } from '@/shared/infrastructure/websocket/socket.server';
import { CodeMetrics, ChecklistItem } from '../../domain/types/metric.types';
import { logger } from '@/shared/infrastructure/monitoring/logger';
import { PrismaClient } from '@prisma/client';

export const TrackMetricsSchema = z.object({
  attemptId: z.string().cuid(),
  totalLines: z.number().int().min(0),
  linesFromAI: z.number().int().min(0),
  linesTyped: z.number().int().min(0),
  copyPasteEvents: z.number().int().min(0),
  deleteEvents: z.number().int().min(0),
  testRuns: z.number().int().min(0),
  testsPassed: z.number().int().min(0),
  testsTotal: z.number().int().min(0),
  checklistItems: z.array(z.object({
    id: z.string(),
    label: z.string(),
    checked: z.boolean(),
    weight: z.number().default(1),
    category: z.enum(['validation', 'security', 'testing', 'documentation']),
  })),
  sessionTime: z.number().int().min(0),
  aiUsageTime: z.number().int().min(0).optional(),
  manualCodingTime: z.number().int().min(0).optional(),
  debugTime: z.number().int().min(0).optional(),
});

export type TrackMetricsDTO = z.infer<typeof TrackMetricsSchema>;

export class TrackMetricsUseCase {
  constructor(
    private readonly repository: IMetricRepository,
    private readonly calculator: MetricCalculatorService,
    private readonly wsServer: WebSocketServer,
    private readonly prisma: PrismaClient
  ) {}

  async execute(userId: string, data: TrackMetricsDTO) {
    const startTime = Date.now();
    
    logger.info({
      operation: 'metrics_tracking',
      userId,
      attemptId: data.attemptId,
      sessionTime: data.sessionTime,
      totalLines: data.totalLines,
      linesFromAI: data.linesFromAI,
      linesTyped: data.linesTyped,
      testRuns: data.testRuns,
      testsPassed: data.testsPassed,
      testsTotal: data.testsTotal,
      checklistItemsCount: data.checklistItems.length
    }, 'Metrics tracking initiated');

    try {
      const attempt = await this.prisma.challengeAttempt.findUnique({
        where: { id: data.attemptId },
      });

      if (!attempt || attempt.userId !== userId) {
        logger.warn({
          userId,
          attemptId: data.attemptId,
          reason: 'invalid_attempt_or_unauthorized',
          executionTime: Date.now() - startTime
        }, 'Metrics tracking failed - invalid attempt');
        throw new Error('Invalid attempt');
      }

      const codeMetrics: CodeMetrics = {
        totalLines: data.totalLines,
        linesFromAI: data.linesFromAI,
        linesTyped: data.linesTyped,
        copyPasteEvents: data.copyPasteEvents,
        deleteEvents: data.deleteEvents,
        testRuns: data.testRuns,
        testsPassed: data.testsPassed,
        testsTotal: data.testsTotal,
        checklistItems: data.checklistItems as ChecklistItem[],
      };

      const calculation = this.calculator.calculateAll(codeMetrics, data.sessionTime);
      const riskAssessment = this.calculator.assessRisk(calculation);

      const previousMetric = await this.repository.findLatest(data.attemptId);
      const previousCalculation = previousMetric ? {
        dependencyIndex: previousMetric.dependencyIndex,
        passRate: previousMetric.passRate,
        checklistScore: previousMetric.checklistScore,
        timestamp: previousMetric.timestamp,
        sessionTime: previousMetric.sessionTime,
      } : null;

      const insights = this.calculator.generateInsights(calculation, previousCalculation);

      const metricSnapshot = await this.repository.create({
        attemptId: data.attemptId,
        userId,
        sessionTime: data.sessionTime,
        dependencyIndex: calculation.dependencyIndex,
        passRate: calculation.passRate,
        checklistScore: calculation.checklistScore,
        aiUsageTime: data.aiUsageTime,
        manualCodingTime: data.manualCodingTime,
        debugTime: data.debugTime,
      });

      this.wsServer.emitToAttempt(data.attemptId, 'metrics:update', {
        attemptId: data.attemptId,
        metrics: {
          dependencyIndex: calculation.dependencyIndex,
          passRate: calculation.passRate,
          checklistScore: calculation.checklistScore,
        },
        riskAssessment,
        insights,
        timestamp: calculation.timestamp,
      });

      await this.prisma.challengeAttempt.update({
        where: { id: data.attemptId },
        data: {
          lastActivity: new Date(),
        },
      });

      const executionTime = Date.now() - startTime;

      logger.info({
        userId,
        attemptId: data.attemptId,
        metricSnapshotId: metricSnapshot.id,
        metrics: {
          dependencyIndex: calculation.dependencyIndex,
          passRate: calculation.passRate,
          checklistScore: calculation.checklistScore
        },
        riskLevel: riskAssessment.level,
        insightsCount: insights.length,
        executionTime
      }, 'Metrics tracking completed successfully');

      if (riskAssessment.level === 'CRITICAL') {
        logger.error({
          userId,
          attemptId: data.attemptId,
          riskLevel: riskAssessment.level,
          riskScore: riskAssessment.score,
          riskFactors: riskAssessment.factors,
          dependencyIndex: calculation.dependencyIndex,
          passRate: calculation.passRate,
          checklistScore: calculation.checklistScore
        }, 'CRITICAL risk level detected in metrics');
      } else if (riskAssessment.level === 'HIGH') {
        logger.warn({
          userId,
          attemptId: data.attemptId,
          riskLevel: riskAssessment.level,
          riskScore: riskAssessment.score,
          riskFactors: riskAssessment.factors,
          dependencyIndex: calculation.dependencyIndex
        }, 'HIGH risk level detected in metrics');
      }

      if (calculation.dependencyIndex > 80) {
        logger.warn({
          userId,
          attemptId: data.attemptId,
          dependencyIndex: calculation.dependencyIndex,
          linesFromAI: data.linesFromAI,
          totalLines: data.totalLines,
          highDependency: true
        }, 'Very high AI dependency detected');
      }

      if (calculation.passRate < 30) {
        logger.warn({
          userId,
          attemptId: data.attemptId,
          passRate: calculation.passRate,
          testsPassed: data.testsPassed,
          testsTotal: data.testsTotal,
          lowPassRate: true
        }, 'Low test pass rate detected');
      }

      return {
        metricSnapshot,
        calculation,
        riskAssessment,
        insights,
      };
    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : 'Unknown error',
        userId,
        attemptId: data.attemptId,
        sessionTime: data.sessionTime,
        executionTime: Date.now() - startTime
      }, 'Metrics tracking use case failed');
      throw error;
    }
  }
}