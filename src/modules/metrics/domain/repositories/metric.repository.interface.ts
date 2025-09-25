import { MetricSnapshot } from '@prisma/client';

export interface IMetricRepository {
  create(data: CreateMetricData): Promise<MetricSnapshot>;
  findByAttempt(attemptId: string): Promise<MetricSnapshot[]>;
  findLatest(attemptId: string): Promise<MetricSnapshot | null>;
  findByUser(userId: string, limit?: number): Promise<MetricSnapshot[]>;
  deleteByAttempt(attemptId: string): Promise<void>;
  createBatch(data: CreateMetricData[]): Promise<MetricSnapshot[]>;
  validateAttemptOwnership(attemptId: string, userId: string): Promise<boolean>;
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