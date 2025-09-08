import { CodeMetrics, MetricCalculation, ChecklistItem, RiskAssessment } from '../types/metric.types';
import { logger } from '@/shared/infrastructure/monitoring/logger';

export class MetricCalculatorService {
  calculateDependencyIndex(metrics: CodeMetrics): number {
    logger.debug({
      operation: 'calculate_dependency_index',
      totalLines: metrics.totalLines,
      linesFromAI: metrics.linesFromAI
    }, 'Calculating dependency index');

    if (metrics.totalLines === 0) {
      logger.debug({
        operation: 'dependency_index_zero_lines',
        result: 0
      }, 'No lines written, dependency index is 0');
      return 0;
    }
    
    const di = (metrics.linesFromAI / metrics.totalLines) * 100;
    const finalDI = Math.round(di * 100) / 100;
    
    logger.debug({
      operation: 'dependency_index_calculated',
      totalLines: metrics.totalLines,
      linesFromAI: metrics.linesFromAI,
      rawDI: di,
      finalDI,
      percentage: `${finalDI}%`
    }, 'Dependency index calculated');

    if (finalDI > 80) {
      logger.warn({
        dependencyIndex: finalDI,
        linesFromAI: metrics.linesFromAI,
        totalLines: metrics.totalLines,
        criticalDependency: true
      }, 'Critical AI dependency level detected');
    } else if (finalDI > 60) {
      logger.warn({
        dependencyIndex: finalDI,
        linesFromAI: metrics.linesFromAI,
        totalLines: metrics.totalLines,
        highDependency: true
      }, 'High AI dependency level detected');
    }

    return finalDI;
  }

  calculatePassRate(metrics: CodeMetrics): number {
    logger.debug({
      operation: 'calculate_pass_rate',
      testsTotal: metrics.testsTotal,
      testsPassed: metrics.testsPassed
    }, 'Calculating pass rate');

    if (metrics.testsTotal === 0) {
      logger.debug({
        operation: 'pass_rate_no_tests',
        result: 100
      }, 'No tests run, pass rate is 100%');
      return 100;
    }
    
    const pr = (metrics.testsPassed / metrics.testsTotal) * 100;
    const finalPR = Math.round(pr * 100) / 100;
    
    logger.debug({
      operation: 'pass_rate_calculated',
      testsTotal: metrics.testsTotal,
      testsPassed: metrics.testsPassed,
      rawPR: pr,
      finalPR,
      percentage: `${finalPR}%`
    }, 'Pass rate calculated');

    if (finalPR < 30) {
      logger.warn({
        passRate: finalPR,
        testsPassed: metrics.testsPassed,
        testsTotal: metrics.testsTotal,
        veryLowPassRate: true
      }, 'Very low test pass rate detected');
    } else if (finalPR < 50) {
      logger.warn({
        passRate: finalPR,
        testsPassed: metrics.testsPassed,
        testsTotal: metrics.testsTotal,
        lowPassRate: true
      }, 'Low test pass rate detected');
    } else if (finalPR > 90) {
      logger.info({
        passRate: finalPR,
        testsPassed: metrics.testsPassed,
        testsTotal: metrics.testsTotal,
        excellentPassRate: true
      }, 'Excellent test pass rate achieved');
    }

    return finalPR;
  }

  calculateChecklistScore(checklistItems: ChecklistItem[]): number {
    logger.debug({
      operation: 'calculate_checklist_score',
      itemsCount: checklistItems.length,
      itemsByCategory: checklistItems.reduce((acc, item) => {
        acc[item.category] = (acc[item.category] || 0) + 1;
        return acc;
      }, {} as Record<string, number>)
    }, 'Calculating checklist score');

    if (checklistItems.length === 0) {
      logger.debug({
        operation: 'checklist_score_no_items',
        result: 10
      }, 'No checklist items, score is 10');
      return 10;
    }
    
    const totalWeight = checklistItems.reduce((sum, item) => sum + item.weight, 0);
    const checkedWeight = checklistItems
      .filter(item => item.checked)
      .reduce((sum, item) => sum + item.weight, 0);
    
    if (totalWeight === 0) {
      logger.warn({
        operation: 'checklist_score_zero_weight',
        itemsCount: checklistItems.length,
        result: 10
      }, 'Total weight is zero, defaulting score to 10');
      return 10;
    }
    
    const score = (checkedWeight / totalWeight) * 10;
    const finalCS = Math.round(score * 100) / 100;
    
    const checkedByCategory = checklistItems
      .filter(item => item.checked)
      .reduce((acc, item) => {
        acc[item.category] = (acc[item.category] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
    
    logger.debug({
      operation: 'checklist_score_calculated',
      totalWeight,
      checkedWeight,
      rawScore: score,
      finalCS,
      checkedItems: checklistItems.filter(item => item.checked).length,
      totalItems: checklistItems.length,
      checkedByCategory
    }, 'Checklist score calculated');

    if (finalCS < 3) {
      logger.warn({
        checklistScore: finalCS,
        checkedWeight,
        totalWeight,
        criticalValidationGaps: true
      }, 'Critical validation gaps detected');
    } else if (finalCS < 5) {
      logger.warn({
        checklistScore: finalCS,
        checkedWeight,
        totalWeight,
        significantValidationGaps: true
      }, 'Significant validation gaps detected');
    } else if (finalCS > 8) {
      logger.info({
        checklistScore: finalCS,
        checkedWeight,
        totalWeight,
        excellentValidation: true
      }, 'Excellent validation practices detected');
    }

    return finalCS;
  }

  calculateAll(metrics: CodeMetrics, sessionTime: number): MetricCalculation {
    const startTime = Date.now();
    
    logger.info({
      operation: 'calculate_all_metrics',
      sessionTime,
      codeMetrics: {
        totalLines: metrics.totalLines,
        linesFromAI: metrics.linesFromAI,
        linesTyped: metrics.linesTyped,
        copyPasteEvents: metrics.copyPasteEvents,
        deleteEvents: metrics.deleteEvents,
        testRuns: metrics.testRuns,
        testsPassed: metrics.testsPassed,
        testsTotal: metrics.testsTotal,
        checklistItemsCount: metrics.checklistItems.length
      }
    }, 'Starting comprehensive metric calculation');

    try {
      const di = this.calculateDependencyIndex(metrics);
      const pr = this.calculatePassRate(metrics);
      const cs = this.calculateChecklistScore(metrics.checklistItems);

      const calculation: MetricCalculation = {
        dependencyIndex: di,
        passRate: pr,
        checklistScore: cs,
        timestamp: new Date(),
        sessionTime,
      };

      const processingTime = Date.now() - startTime;
      
      logger.info({
        operation: 'calculate_all_metrics_success',
        sessionTime,
        calculatedMetrics: {
          dependencyIndex: di,
          passRate: pr,
          checklistScore: cs
        },
        processingTime
      }, 'All metrics calculated successfully');

      logger.debug({ di, pr, cs }, 'Metrics calculated');

      return calculation;
    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      logger.error({
        operation: 'calculate_all_metrics_failed',
        sessionTime,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        processingTime
      }, 'Failed to calculate all metrics');
      
      throw error;
    }
  }

  assessRisk(calculation: MetricCalculation): RiskAssessment {
    const startTime = Date.now();
    
    logger.info({
      operation: 'assess_risk',
      dependencyIndex: calculation.dependencyIndex,
      passRate: calculation.passRate,
      checklistScore: calculation.checklistScore
    }, 'Starting risk assessment');

    try {
      const factors: string[] = [];
      const recommendations: string[] = [];
      let score = 0;

      // Dependency Index assessment
      if (calculation.dependencyIndex > 80) {
        factors.push('Extremely high AI dependency');
        recommendations.push('Try solving problems independently before using AI');
        score += 40;
      } else if (calculation.dependencyIndex > 60) {
        factors.push('High AI dependency');
        recommendations.push('Challenge yourself to write more code manually');
        score += 25;
      } else if (calculation.dependencyIndex > 40) {
        factors.push('Moderate AI dependency');
        recommendations.push('Good balance, but room for more independence');
        score += 10;
      }

      // Pass Rate assessment
      if (calculation.passRate < 30) {
        factors.push('Very low test pass rate');
        recommendations.push('Review your code carefully before running tests');
        score += 30;
      } else if (calculation.passRate < 50) {
        factors.push('Low test pass rate');
        recommendations.push('Debug more thoroughly before submissions');
        score += 20;
      } else if (calculation.passRate < 70) {
        factors.push('Moderate test pass rate');
        recommendations.push('Good progress, aim for first-try success');
        score += 10;
      }

      // Checklist Score assessment
      if (calculation.checklistScore < 3) {
        factors.push('Critical validation gaps');
        recommendations.push('Always validate AI outputs and follow best practices');
        score += 30;
      } else if (calculation.checklistScore < 5) {
        factors.push('Significant validation gaps');
        recommendations.push('Improve code review and security checks');
        score += 20;
      } else if (calculation.checklistScore < 7) {
        factors.push('Some validation gaps');
        recommendations.push('Focus on comprehensive testing and documentation');
        score += 10;
      }

      let level: RiskAssessment['level'];
      if (score >= 70) level = 'CRITICAL';
      else if (score >= 50) level = 'HIGH';
      else if (score >= 30) level = 'MEDIUM';
      else level = 'LOW';

      if (level === 'LOW' && recommendations.length === 0) {
        recommendations.push('Excellent work! Keep maintaining these standards');
      }

      const assessment: RiskAssessment = {
        level,
        factors,
        recommendations,
        score,
      };

      const processingTime = Date.now() - startTime;
      
      logger.info({
        operation: 'risk_assessment_completed',
        riskLevel: level,
        riskScore: score,
        factorsCount: factors.length,
        recommendationsCount: recommendations.length,
        metrics: {
          dependencyIndex: calculation.dependencyIndex,
          passRate: calculation.passRate,
          checklistScore: calculation.checklistScore
        },
        processingTime
      }, 'Risk assessment completed');

      if (level === 'CRITICAL') {
        logger.error({
          riskLevel: level,
          riskScore: score,
          factors,
          metrics: {
            dependencyIndex: calculation.dependencyIndex,
            passRate: calculation.passRate,
            checklistScore: calculation.checklistScore
          },
          criticalRisk: true
        }, 'CRITICAL risk level detected in metrics');
      } else if (level === 'HIGH') {
        logger.warn({
          riskLevel: level,
          riskScore: score,
          factors,
          metrics: {
            dependencyIndex: calculation.dependencyIndex,
            passRate: calculation.passRate,
            checklistScore: calculation.checklistScore
          },
          highRisk: true
        }, 'HIGH risk level detected in metrics');
      }

      return assessment;
    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      logger.error({
        operation: 'risk_assessment_failed',
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        metrics: {
          dependencyIndex: calculation.dependencyIndex,
          passRate: calculation.passRate,
          checklistScore: calculation.checklistScore
        },
        processingTime
      }, 'Risk assessment failed');
      
      throw error;
    }
  }

  generateInsights(
    current: MetricCalculation,
    previous: MetricCalculation | null
  ): string[] {
    const startTime = Date.now();
    
    logger.debug({
      operation: 'generate_insights',
      hasPrevious: !!previous,
      currentMetrics: {
        dependencyIndex: current.dependencyIndex,
        passRate: current.passRate,
        checklistScore: current.checklistScore
      },
      previousMetrics: previous ? {
        dependencyIndex: previous.dependencyIndex,
        passRate: previous.passRate,
        checklistScore: previous.checklistScore
      } : null
    }, 'Generating metric insights');

    try {
      const insights: string[] = [];

      if (!previous) {
        if (current.dependencyIndex < 30) {
          insights.push('Great start! You\'re coding independently');
        }
        if (current.passRate > 80) {
          insights.push('Excellent test performance from the beginning');
        }
        if (current.checklistScore > 8) {
          insights.push('Outstanding attention to best practices');
        }
        
        logger.debug({
          operation: 'initial_insights_generated',
          insightsCount: insights.length,
          currentMetrics: {
            dependencyIndex: current.dependencyIndex,
            passRate: current.passRate,
            checklistScore: current.checklistScore
          }
        }, 'Initial insights generated (no previous data)');
        
        return insights;
      }

      const diChange = current.dependencyIndex - previous.dependencyIndex;
      const prChange = current.passRate - previous.passRate;
      const csChange = current.checklistScore - previous.checklistScore;

      logger.debug({
        operation: 'metric_changes_calculated',
        changes: {
          dependencyIndex: diChange,
          passRate: prChange,
          checklistScore: csChange
        },
        thresholds: {
          significantChange: { di: 10, pr: 15, cs: 1 }
        }
      }, 'Metric changes calculated');

      if (Math.abs(diChange) > 10) {
        if (diChange < 0) {
          insights.push(`Dependency reduced by ${Math.abs(diChange).toFixed(1)}% - becoming more independent!`);
        } else {
          insights.push(`Dependency increased by ${diChange.toFixed(1)}% - try coding more manually`);
        }
      }

      if (Math.abs(prChange) > 15) {
        if (prChange > 0) {
          insights.push(`Pass rate improved by ${prChange.toFixed(1)}% - better testing!`);
        } else {
          insights.push(`Pass rate dropped by ${Math.abs(prChange).toFixed(1)}% - review more carefully`);
        }
      }

      if (Math.abs(csChange) > 1) {
        if (csChange > 0) {
          insights.push(`Checklist score up by ${csChange.toFixed(1)} - great validation!`);
        } else {
          insights.push(`Checklist score down by ${Math.abs(csChange).toFixed(1)} - don't skip validations`);
        }
      }

      const processingTime = Date.now() - startTime;
      
      logger.info({
        operation: 'insights_generated',
        insightsCount: insights.length,
        changes: {
          dependencyIndex: diChange,
          passRate: prChange,
          checklistScore: csChange
        },
        significantChanges: {
          dependency: Math.abs(diChange) > 10,
          passRate: Math.abs(prChange) > 15,
          checklist: Math.abs(csChange) > 1
        },
        processingTime
      }, 'Metric insights generated successfully');

      return insights;
    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      logger.error({
        operation: 'generate_insights_failed',
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        processingTime
      }, 'Failed to generate metric insights');
      
      return ['Unable to generate insights at this time'];
    }
  }
}