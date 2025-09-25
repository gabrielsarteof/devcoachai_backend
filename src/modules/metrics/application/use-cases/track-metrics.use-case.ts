import { IMetricRepository } from '../../domain/repositories/metric.repository.interface';
import { MetricCalculatorService } from '../../domain/services/metric-calculator.service';
import { WebSocketServer } from '@/shared/infrastructure/websocket/socket.server';
import { CodeMetrics, ChecklistItem } from '../../domain/types/metric.types';
import { TrackMetricsDTO } from '../../domain/schemas/metric.schema';
import { logger } from '@/shared/infrastructure/monitoring/logger';

export class TrackMetricsUseCase {
  constructor(
    private readonly repository: IMetricRepository,
    private readonly calculator: MetricCalculatorService,
    private readonly wsServer: WebSocketServer
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
      // Validação 1: Propriedade do attempt
      const isValidAttempt = await this.repository.validateAttemptOwnership(data.attemptId, userId);

      if (!isValidAttempt) {
        logger.warn({
          userId,
          attemptId: data.attemptId,
          reason: 'invalid_attempt_or_unauthorized',
          executionTime: Date.now() - startTime
        }, 'Metrics tracking failed - invalid attempt');
        throw new Error('Invalid attempt');
      }

      // Validação 2: Consistência dos dados
      if (data.linesFromAI > data.totalLines) {
        logger.warn({
          userId,
          attemptId: data.attemptId,
          linesFromAI: data.linesFromAI,
          totalLines: data.totalLines,
          reason: 'invalid_lines_ratio',
          executionTime: Date.now() - startTime
        }, 'Metrics tracking failed - AI lines exceed total lines');
        throw new Error('Lines from AI cannot exceed total lines');
      }

      // Validação 3: Consistência dos resultados de testes
      if (data.testsPassed > data.testsTotal) {
        logger.warn({
          userId,
          attemptId: data.attemptId,
          testsPassed: data.testsPassed,
          testsTotal: data.testsTotal,
          reason: 'invalid_test_ratio',
          executionTime: Date.now() - startTime
        }, 'Metrics tracking failed - passed tests exceed total tests');
        throw new Error('Tests passed cannot exceed total tests');
      }

      // Validação 4: Consistência do tempo de sessão
      const totalTimeBreakdown = (data.aiUsageTime || 0) + (data.manualCodingTime || 0) + (data.debugTime || 0);
      if (totalTimeBreakdown > data.sessionTime) {
        logger.warn({
          userId,
          attemptId: data.attemptId,
          sessionTime: data.sessionTime,
          totalTimeBreakdown,
          reason: 'invalid_time_breakdown',
          executionTime: Date.now() - startTime
        }, 'Metrics tracking failed - time breakdown exceeds session time');
        throw new Error('Time breakdown cannot exceed session time');
      }

      // Validação 5: Validação dos itens de checklist
      const invalidChecklistItems = data.checklistItems.filter(item =>
        !item.id || !item.label || item.weight < 0 || item.weight > 10
      );
      if (invalidChecklistItems.length > 0) {
        logger.warn({
          userId,
          attemptId: data.attemptId,
          invalidItemsCount: invalidChecklistItems.length,
          reason: 'invalid_checklist_items',
          executionTime: Date.now() - startTime
        }, 'Metrics tracking failed - invalid checklist items');
        throw new Error('Invalid checklist items found');
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