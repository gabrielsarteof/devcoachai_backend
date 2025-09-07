import { PrismaClient } from '@prisma/client';
import { Redis } from 'ioredis';
import { AIProvider } from '../../domain/types/ai.types';
import { logger } from '@/shared/infrastructure/monitoring/logger';

export class UsageTrackerService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly redis: Redis
  ) {}

  async trackUsage(data: {
    userId: string;
    attemptId?: string;
    provider: AIProvider;
    model: string;
    inputTokens: number;
    outputTokens: number;
    cost: number;
    responseTime: number;
  }): Promise<void> {
    try {
      await this.prisma.aIInteraction.create({
        data: {
          userId: data.userId,
          attemptId: data.attemptId,
          provider: data.provider.toUpperCase() as any,
          model: data.model,
          messages: [],
          responseLength: data.outputTokens * 4, 
          codeLinesGenerated: 0,
          inputTokens: data.inputTokens,
          outputTokens: data.outputTokens,
          estimatedCost: data.cost,
        },
      });

      const today = new Date().toISOString().split('T')[0];
      const keys = {
        userDaily: `usage:${data.userId}:${today}`,
        providerDaily: `usage:${data.provider}:${today}`,
        modelDaily: `usage:${data.provider}:${data.model}:${today}`,
      };

      const pipeline = this.redis.pipeline();
      
      pipeline.hincrby(keys.userDaily, 'requests', 1);
      pipeline.hincrbyfloat(keys.userDaily, 'tokens', data.inputTokens + data.outputTokens);
      pipeline.hincrbyfloat(keys.userDaily, 'cost', data.cost);
      pipeline.expire(keys.userDaily, 86400 * 7); // Keep for 7 days
      
      pipeline.hincrby(keys.providerDaily, 'requests', 1);
      pipeline.hincrbyfloat(keys.providerDaily, 'tokens', data.inputTokens + data.outputTokens);
      pipeline.hincrbyfloat(keys.providerDaily, 'cost', data.cost);
      pipeline.expire(keys.providerDaily, 86400 * 7);
      
      pipeline.hincrby(keys.modelDaily, 'requests', 1);
      pipeline.hincrbyfloat(keys.modelDaily, 'tokens', data.inputTokens + data.outputTokens);
      pipeline.hincrbyfloat(keys.modelDaily, 'cost', data.cost);
      pipeline.expire(keys.modelDaily, 86400 * 7);
      
      await pipeline.exec();

      logger.info({
        userId: data.userId,
        provider: data.provider,
        model: data.model,
        tokens: data.inputTokens + data.outputTokens,
        cost: data.cost,
        responseTime: data.responseTime,
      }, 'AI usage tracked');
    } catch (error) {
      logger.error({ error, data }, 'Failed to track AI usage');
    }
  }

  async getUserUsage(userId: string, days: number = 30): Promise<{
    total: { requests: number; tokens: number; cost: number };
    byProvider: Record<string, { requests: number; tokens: number; cost: number }>;
    daily: Array<{ date: string; requests: number; tokens: number; cost: number }>;
  }> {
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - days * 86400000);

    const interactions = await this.prisma.aIInteraction.findMany({
      where: {
        userId,
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      select: {
        provider: true,
        inputTokens: true,
        outputTokens: true,
        estimatedCost: true,
        createdAt: true,
      },
    });

    const total = { requests: 0, tokens: 0, cost: 0 };
    const byProvider: Record<string, any> = {};
    const dailyMap: Map<string, any> = new Map();

    for (const interaction of interactions) {
      const provider = interaction.provider.toLowerCase();
      const tokens = interaction.inputTokens + interaction.outputTokens;
      const date = interaction.createdAt.toISOString().split('T')[0];

      total.requests++;
      total.tokens += tokens;
      total.cost += interaction.estimatedCost;

      if (!byProvider[provider]) {
        byProvider[provider] = { requests: 0, tokens: 0, cost: 0 };
      }
      byProvider[provider].requests++;
      byProvider[provider].tokens += tokens;
      byProvider[provider].cost += interaction.estimatedCost;

      if (!dailyMap.has(date)) {
        dailyMap.set(date, { date, requests: 0, tokens: 0, cost: 0 });
      }
      const daily = dailyMap.get(date);
      daily.requests++;
      daily.tokens += tokens;
      daily.cost += interaction.estimatedCost;
    }

    return {
      total,
      byProvider,
      daily: Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date)),
    };
  }
}