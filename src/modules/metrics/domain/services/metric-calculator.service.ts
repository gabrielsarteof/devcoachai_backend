import { CodeMetrics, MetricCalculation, ChecklistItem, RiskAssessment } from '../types/metric.types';
import { logger } from '@/shared/infrastructure/monitoring/logger';

export class MetricCalculatorService {
  calculateDependencyIndex(metrics: CodeMetrics): number {
    if (metrics.totalLines === 0) return 0;
    
    const di = (metrics.linesFromAI / metrics.totalLines) * 100;
    return Math.round(di * 100) / 100;
  }

  calculatePassRate(metrics: CodeMetrics): number {
    if (metrics.testsTotal === 0) return 100;
    
    const pr = (metrics.testsPassed / metrics.testsTotal) * 100;
    return Math.round(pr * 100) / 100;
  }

  calculateChecklistScore(checklistItems: ChecklistItem[]): number {
    if (checklistItems.length === 0) return 10;
    
    const totalWeight = checklistItems.reduce((sum, item) => sum + item.weight, 0);
    const checkedWeight = checklistItems
      .filter(item => item.checked)
      .reduce((sum, item) => sum + item.weight, 0);
    
    if (totalWeight === 0) return 10;
    
    const score = (checkedWeight / totalWeight) * 10;
    return Math.round(score * 100) / 100;
  }

  calculateAll(metrics: CodeMetrics, sessionTime: number): MetricCalculation {
    const di = this.calculateDependencyIndex(metrics);
    const pr = this.calculatePassRate(metrics);
    const cs = this.calculateChecklistScore(metrics.checklistItems);

    logger.debug({ di, pr, cs }, 'Metrics calculated');

    return {
      dependencyIndex: di,
      passRate: pr,
      checklistScore: cs,
      timestamp: new Date(),
      sessionTime,
    };
  }

  assessRisk(calculation: MetricCalculation): RiskAssessment {
    const factors: string[] = [];
    const recommendations: string[] = [];
    let score = 0;

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

    return {
      level,
      factors,
      recommendations,
      score,
    };
  }

  generateInsights(
    current: MetricCalculation,
    previous: MetricCalculation | null
  ): string[] {
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
      return insights;
    }

    const diChange = current.dependencyIndex - previous.dependencyIndex;
    const prChange = current.passRate - previous.passRate;
    const csChange = current.checklistScore - previous.checklistScore;

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

    return insights;
  }
}