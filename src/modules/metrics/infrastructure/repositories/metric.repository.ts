import { PrismaClient, MetricSnapshot } from '@prisma/client';
import { IMetricRepository, CreateMetricData } from '../../domain/repositories/metric.repository.interface';
import { logger } from '@/shared/infrastructure/monitoring/logger';

export class MetricRepository implements IMetricRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(data: CreateMetricData): Promise<MetricSnapshot> {
    return await this.prisma.metricSnapshot.create({
      data: {
        ...data,
        timestamp: new Date(),
      },
    });
  }

  async findByAttempt(attemptId: string): Promise<MetricSnapshot[]> {
    return await this.prisma.metricSnapshot.findMany({
      where: { attemptId },
      orderBy: { timestamp: 'asc' },
    });
  }

  async findLatest(attemptId: string): Promise<MetricSnapshot | null> {
    return await this.prisma.metricSnapshot.findFirst({
      where: { attemptId },
      orderBy: { timestamp: 'desc' },
    });
  }

  async findByUser(userId: string, limit: number = 100): Promise<MetricSnapshot[]> {
    return await this.prisma.metricSnapshot.findMany({
      where: { userId },
      orderBy: { timestamp: 'desc' },
      take: limit,
    });
  }

  async deleteByAttempt(attemptId: string): Promise<void> {
    await this.prisma.metricSnapshot.deleteMany({
      where: { attemptId },
    });
  }

  async createBatch(data: CreateMetricData[]): Promise<MetricSnapshot[]> {
    const created = await this.prisma.$transaction(
      data.map(item =>
        this.prisma.metricSnapshot.create({
          data: {
            ...item,
            timestamp: new Date(),
          },
        })
      )
    );

    logger.info({ count: created.length }, 'Batch metrics created');
    return created;
  }
}