import { MetricSnapshot as PrismaMetric } from '@prisma/client';
import { CalculateMetricsDTO } from '../schemas/metric.schema';
import { logger } from '@/shared/infrastructure/monitoring/logger';

export class MetricEntity {
  private constructor(
    private readonly props: PrismaMetric,
    private readonly analysis: MetricAnalysis
  ) {}

  static calculate(data: CalculateMetricsDTO): MetricCalculation {
    const startTime = Date.now();
    
    logger.info({
      operation: 'metric_calculation',
      totalLines: data.totalLines,
      linesFromAI: data.linesFromAI,
      testsTotal: data.testsTotal,
      testsPassed: data.testsPassed,
      checklistItemsCount: data.checklistItems.length,
      checklistCheckedCount: data.checklistItems.filter(item => item.checked).length
    }, 'Starting metric calculation');

    try {
      const di = data.totalLines > 0 ? (data.linesFromAI / data.totalLines) * 100 : 0;
      const pr = data.testsTotal > 0 ? (data.testsPassed / data.testsTotal) * 100 : 0;

      const totalWeight = data.checklistItems.reduce((sum, item) => sum + item.weight, 0);
      const checkedWeight = data.checklistItems
        .filter((item) => item.checked)
        .reduce((sum, item) => sum + item.weight, 0);
      const cs = totalWeight > 0 ? (checkedWeight / totalWeight) * 10 : 0;

      const finalDI = Math.round(di * 100) / 100;
      const finalPR = Math.round(pr * 100) / 100;
      const finalCS = Math.round(cs * 100) / 100;

      const processingTime = Date.now() - startTime;
      
      logger.info({
        operation: 'metric_calculation_success',
        inputs: {
          totalLines: data.totalLines,
          linesFromAI: data.linesFromAI,
          testsTotal: data.testsTotal,
          testsPassed: data.testsPassed,
          totalWeight,
          checkedWeight
        },
        calculated: {
          dependencyIndex: finalDI,
          passRate: finalPR,
          checklistScore: finalCS
        },
        rawValues: { di, pr, cs },
        processingTime
      }, 'Metric calculation completed successfully');

      // Log warnings for concerning metrics
      if (finalDI > 80) {
        logger.warn({
          dependencyIndex: finalDI,
          linesFromAI: data.linesFromAI,
          totalLines: data.totalLines,
          highDependency: true
        }, 'Very high AI dependency detected in metrics');
      }

      if (finalPR < 30) {
        logger.warn({
          passRate: finalPR,
          testsPassed: data.testsPassed,
          testsTotal: data.testsTotal,
          lowPassRate: true
        }, 'Very low test pass rate detected');
      }

      if (finalCS < 3) {
        logger.warn({
          checklistScore: finalCS,
          checkedWeight,
          totalWeight,
          lowValidation: true
        }, 'Very low checklist score detected');
      }

      const analysis = {
        risk: finalDI > 70 ? ('HIGH' as const) : finalDI > 40 ? ('MEDIUM' as const) : ('LOW' as const),
        recommendation: MetricEntity.generateRecommendation(finalDI, finalPR, finalCS),
      };

      return {
        dependencyIndex: finalDI,
        passRate: finalPR,
        checklistScore: finalCS,
        analysis,
      };
    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      logger.error({
        operation: 'metric_calculation_failed',
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        inputs: data,
        processingTime
      }, 'Metric calculation failed');
      
      throw error;
    }
  }

  private static generateRecommendation(di: number, pr: number, cs: number): string {
    logger.debug({
      operation: 'generate_recommendation',
      dependencyIndex: di,
      passRate: pr,
      checklistScore: cs
    }, 'Generating metric recommendations');

    const recommendations = [];

    if (di > 70) {
      recommendations.push('Try solving more parts independently before using AI');
    } else if (di < 20) {
      recommendations.push('Great job coding independently! AI can help with boilerplate');
    }

    if (pr < 50) {
      recommendations.push('Review your code more carefully before running tests');
    } else if (pr > 90) {
      recommendations.push('Excellent first-try success rate!');
    }

    if (cs < 5) {
      recommendations.push('Remember to validate AI outputs and follow best practices');
    } else if (cs > 8) {
      recommendations.push('Outstanding attention to quality and security!');
    }

    const finalRecommendation = recommendations.join('. ') || 'Keep up the good work!';
    
    logger.debug({
      operation: 'recommendation_generated',
      recommendationCount: recommendations.length,
      recommendationLength: finalRecommendation.length,
      metrics: { di, pr, cs }
    }, 'Metric recommendation generated');

    return finalRecommendation;
  }

  static fromPrisma(metric: PrismaMetric): MetricEntity {
    logger.debug({
      operation: 'metric_entity_from_prisma',
      metricId: metric.id,
      attemptId: metric.attemptId,
      userId: metric.userId,
      sessionTime: metric.sessionTime,
      dependencyIndex: metric.dependencyIndex,
      passRate: metric.passRate,
      checklistScore: metric.checklistScore,
      timestamp: metric.timestamp
    }, 'Creating metric entity from Prisma model');

    try {
      const analysis = {
        risk: metric.dependencyIndex > 70
          ? ('HIGH' as const)
          : metric.dependencyIndex > 40
            ? ('MEDIUM' as const)
            : ('LOW' as const),
        recommendation: 'Analysis pending',
      };

      const entity = new MetricEntity(metric, analysis);
      
      logger.debug({
        metricId: metric.id,
        riskLevel: analysis.risk,
        isHealthy: entity.isHealthy()
      }, 'Metric entity created from Prisma successfully');
      
      return entity;
    } catch (error) {
      logger.error({
        operation: 'metric_entity_from_prisma_failed',
        metricId: metric.id,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      }, 'Failed to create metric entity from Prisma model');
      
      throw error;
    }
  }

  isHealthy(): boolean {
    const isHealthy = this.props.dependencyIndex < 40 &&
                     this.props.passRate > 70 &&
                     this.props.checklistScore > 7;
    
    logger.debug({
      operation: 'check_metric_health',
      metricId: this.props.id,
      dependencyIndex: this.props.dependencyIndex,
      passRate: this.props.passRate,
      checklistScore: this.props.checklistScore,
      thresholds: { maxDI: 40, minPR: 70, minCS: 7 },
      isHealthy
    }, 'Checking metric health status');

    if (!isHealthy) {
      const issues = [];
      if (this.props.dependencyIndex >= 40) issues.push('high dependency');
      if (this.props.passRate <= 70) issues.push('low pass rate');
      if (this.props.checklistScore <= 7) issues.push('low checklist score');
      
      logger.info({
        metricId: this.props.id,
        userId: this.props.userId,
        attemptId: this.props.attemptId,
        issues,
        dependencyIndex: this.props.dependencyIndex,
        passRate: this.props.passRate,
        checklistScore: this.props.checklistScore,
        unhealthyMetrics: true
      }, 'Unhealthy metrics detected');
    }

    return isHealthy;
  }

  getRiskLevel(): 'LOW' | 'MEDIUM' | 'HIGH' {
    const riskLevel = this.analysis.risk;
    
    logger.debug({
      operation: 'get_risk_level',
      metricId: this.props.id,
      dependencyIndex: this.props.dependencyIndex,
      riskLevel
    }, 'Getting metric risk level');

    return riskLevel;
  }

  toPrisma(): PrismaMetric {
    logger.debug({
      operation: 'metric_to_prisma',
      metricId: this.props.id,
      attemptId: this.props.attemptId,
      userId: this.props.userId,
      sessionTime: this.props.sessionTime
    }, 'Converting metric entity to Prisma model');

    return this.props;
  }
}

interface MetricAnalysis {
  risk: 'LOW' | 'MEDIUM' | 'HIGH';
  recommendation: string;
}

interface MetricCalculation {
  dependencyIndex: number;
  passRate: number;
  checklistScore: number;
  analysis: MetricAnalysis;
}