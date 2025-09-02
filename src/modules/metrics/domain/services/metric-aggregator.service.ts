import { PrismaClient, MetricSnapshot } from '@prisma/client';
import { Redis } from 'ioredis';
import { MetricTrend } from '../types/metric.types';
import { logger } from '@/shared/infrastructure/monitoring/logger';

export class MetricAggregatorService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly redis: Redis
  ) {}

  async getSessionMetrics(attemptId: string): Promise<MetricSnapshot[]> {
    const cacheKey = `metrics:session:${attemptId}`;
    const cached = await this.redis.get(cacheKey);
    
    if (cached) {
      return JSON.parse(cached);
    }

    const metrics = await this.prisma.metricSnapshot.findMany({
      where: { attemptId },
      orderBy: { timestamp: 'asc' },
    });

    await this.redis.setex(cacheKey, 600, JSON.stringify(metrics));
    return metrics;
  }

  async getUserAverages(userId: string): Promise<{
    averageDI: number;
    averagePR: number;
    averageCS: number;
  }> {
    const userMetrics = await this.prisma.userMetrics.findUnique({
      where: { userId },
    });

    if (!userMetrics) {
      return { averageDI: 0, averagePR: 0, averageCS: 0 };
    }

    return {
      averageDI: userMetrics.averageDI,
      averagePR: userMetrics.averagePR,
      averageCS: userMetrics.averageCS,
    };
  }

  async calculateTrends(
    attemptId: string,
    windowSize: number = 5
  ): Promise<Record<string, MetricTrend>> {
    const metrics = await this.getSessionMetrics(attemptId);
    
    if (metrics.length < 2) {
      return {
        DI: this.createEmptyTrend('DI'),
        PR: this.createEmptyTrend('PR'),
        CS: this.createEmptyTrend('CS'),
      };
    }

    return {
      DI: this.calculateTrend(metrics, 'dependencyIndex', 'DI', windowSize),
      PR: this.calculateTrend(metrics, 'passRate', 'PR', windowSize),
      CS: this.calculateTrend(metrics, 'checklistScore', 'CS', windowSize),
    };
  }

  private calculateTrend(
    metrics: MetricSnapshot[],
    field: keyof MetricSnapshot,
    metricName: 'DI' | 'PR' | 'CS',
    windowSize: number
  ): MetricTrend {
    const values = metrics.map(m => ({
      timestamp: m.timestamp,
      value: Number(m[field]) || 0,
    }));

    if (values.length < 2) {
      return this.createEmptyTrend(metricName);
    }

    const recent = values.slice(-windowSize);
    const older = values.slice(Math.max(0, values.length - windowSize * 2), -windowSize);
    
    if (older.length === 0) {
      return {
        metric: metricName,
        values,
        trend: 'stable',
        changePercent: 0,
      };
    }

    const recentAvg = recent.reduce((sum, v) => sum + v.value, 0) / recent.length;
    const olderAvg = older.reduce((sum, v) => sum + v.value, 0) / older.length;
    const changePercent = ((recentAvg - olderAvg) / olderAvg) * 100;

    let trend: MetricTrend['trend'];
    if (metricName === 'DI') {
      trend = changePercent < -5 ? 'improving' : changePercent > 5 ? 'declining' : 'stable';
    } else {
      trend = changePercent > 5 ? 'improving' : changePercent < -5 ? 'declining' : 'stable';
    }

    return {
      metric: metricName,
      values,
      trend,
      changePercent: Math.round(changePercent * 100) / 100,
    };
  }

  private createEmptyTrend(metricName: 'DI' | 'PR' | 'CS'): MetricTrend {
    return {
      metric: metricName,
      values: [],
      trend: 'stable',
      changePercent: 0,
    };
  }

  async updateUserAverages(userId: string): Promise<void> {
    try {
      const attempts = await this.prisma.challengeAttempt.findMany({
        where: {
          userId,
          status: 'COMPLETED',
        },
        select: {
          finalDI: true,
          finalPR: true,
          finalCS: true,
        },
      });

      if (attempts.length === 0) return;

      const avgDI = attempts.reduce((sum, a) => sum + (a.finalDI || 0), 0) / attempts.length;
      const avgPR = attempts.reduce((sum, a) => sum + (a.finalPR || 0), 0) / attempts.length;
      const avgCS = attempts.reduce((sum, a) => sum + (a.finalCS || 0), 0) / attempts.length;

      await this.prisma.userMetrics.upsert({
        where: { userId },
        update: {
          averageDI: Math.round(avgDI * 100) / 100,
          averagePR: Math.round(avgPR * 100) / 100,
          averageCS: Math.round(avgCS * 100) / 100,
          updatedAt: new Date(),
        },
        create: {
          userId,
          averageDI: Math.round(avgDI * 100) / 100,
          averagePR: Math.round(avgPR * 100) / 100,
          averageCS: Math.round(avgCS * 100) / 100,
          weeklyTrends: [],
          metricsByCategory: {},
          strongAreas: [],
          weakAreas: [],
        },
      });

      logger.info({ userId, avgDI, avgPR, avgCS }, 'User averages updated');
    } catch (error) {
      logger.error({ error, userId }, 'Failed to update user averages');
    }
  }
}