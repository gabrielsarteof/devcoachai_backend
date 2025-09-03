import { MetricSnapshot } from '@prisma/client';
import { MetricCalculation } from '../types/metric.types';

export interface IMetricRepository {
  create(data: CreateMetricData): Promise<MetricSnapshot>;
  findByAttempt(attemptId: string): Promise<MetricSnapshot[]>;
  findLatest(attemptId: string): Promise<MetricSnapshot | null>;
  findByUser(userId: string, limit?: number): Promise<MetricSnapshot[]>;
  deleteByAttempt(attemptId: string): Promise<void>;
  createBatch(data: CreateMetricData[]): Promise<MetricSnapshot[]>;
}

export interface CreateMetricData {
  attemptId: string;
  userId: string;
  sessionTime: number;
  dependencyIndex: number;
  passRate: number;
  checklistScore: number;
  codeQuality?: number;
  debugTime?: number;
  aiUsageTime?: number;
  manualCodingTime?: number;
}