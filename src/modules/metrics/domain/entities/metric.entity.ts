import { MetricSnapshot as PrismaMetric } from '@prisma/client';
import { CalculateMetricsDTO } from '../schemas/metric.schema';

export class MetricEntity {
  private constructor(
    private readonly props: PrismaMetric,
    private readonly analysis: MetricAnalysis
  ) {}

  static calculate(data: CalculateMetricsDTO): MetricCalculation {
    const di =
      data.totalLines > 0 ? (data.linesFromAI / data.totalLines) * 100 : 0;

    const pr =
      data.testsTotal > 0 ? (data.testsPassed / data.testsTotal) * 100 : 0;

    const totalWeight = data.checklistItems.reduce(
      (sum, item) => sum + item.weight,
      0
    );
    const checkedWeight = data.checklistItems
      .filter((item) => item.checked)
      .reduce((sum, item) => sum + item.weight, 0);
    const cs = totalWeight > 0 ? (checkedWeight / totalWeight) * 10 : 0;

    return {
      dependencyIndex: Math.round(di * 100) / 100,
      passRate: Math.round(pr * 100) / 100,
      checklistScore: Math.round(cs * 100) / 100,
      analysis: {
        risk: di > 70 ? 'HIGH' : di > 40 ? 'MEDIUM' : 'LOW',
        recommendation: MetricEntity.generateRecommendation(di, pr, cs),
      },
    };
  }

  private static generateRecommendation(
    di: number,
    pr: number,
    cs: number
  ): string {
    const recommendations = [];

    if (di > 70) {
      recommendations.push(
        'Try solving more parts independently before using AI'
      );
    } else if (di < 20) {
      recommendations.push(
        'Great job coding independently! AI can help with boilerplate'
      );
    }

    if (pr < 50) {
      recommendations.push(
        'Review your code more carefully before running tests'
      );
    } else if (pr > 90) {
      recommendations.push('Excellent first-try success rate!');
    }

    if (cs < 5) {
      recommendations.push(
        'Remember to validate AI outputs and follow best practices'
      );
    } else if (cs > 8) {
      recommendations.push('Outstanding attention to quality and security!');
    }

    return recommendations.join('. ') || 'Keep up the good work!';
  }

  static fromPrisma(metric: PrismaMetric): MetricEntity {
    const analysis = {
      risk:
        metric.dependencyIndex > 70
          ? ('HIGH' as const)
          : metric.dependencyIndex > 40
            ? ('MEDIUM' as const)
            : ('LOW' as const),
      recommendation: 'Analysis pending',
    };

    return new MetricEntity(metric, analysis);
  }

  isHealthy(): boolean {
    return (
      this.props.dependencyIndex < 40 &&
      this.props.passRate > 70 &&
      this.props.checklistScore > 7
    );
  }

  getRiskLevel(): 'LOW' | 'MEDIUM' | 'HIGH' {
    return this.analysis.risk;
  }

  toPrisma(): PrismaMetric {
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
