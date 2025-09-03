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
    try {
      const attempt = await this.prisma.challengeAttempt.findUnique({
        where: { id: data.attemptId },
      });

      if (!attempt || attempt.userId !== userId) {
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

      logger.info({ 
        userId, 
        attemptId: data.attemptId,
        metrics: calculation 
      }, 'Metrics tracked');

      return {
        metricSnapshot,
        calculation,
        riskAssessment,
        insights,
      };
    } catch (error) {
      logger.error({ error, userId, data }, 'Failed to track metrics');
      throw error;
    }
  }
}