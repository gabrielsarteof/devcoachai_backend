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
    const startTime = Date.now();
    
    logger.info({
      operation: 'track_ai_usage',
      userId: data.userId,
      attemptId: data.attemptId,
      provider: data.provider,
      model: data.model,
      inputTokens: data.inputTokens,
      outputTokens: data.outputTokens,
      totalTokens: data.inputTokens + data.outputTokens,
      cost: data.cost,
      responseTime: data.responseTime
    }, 'Tracking AI usage');

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

      logger.debug({
        operation: 'update_redis_counters',
        keys,
        date: today
      }, 'Updating Redis usage counters');

      const pipeline = this.redis.pipeline();
      
      pipeline.hincrby(keys.userDaily, 'requests', 1);
      pipeline.hincrbyfloat(keys.userDaily, 'tokens', data.inputTokens + data.outputTokens);
      pipeline.hincrbyfloat(keys.userDaily, 'cost', data.cost);
      pipeline.expire(keys.userDaily, 86400 * 7); 
      
      pipeline.hincrby(keys.providerDaily, 'requests', 1);
      pipeline.hincrbyfloat(keys.providerDaily, 'tokens', data.inputTokens + data.outputTokens);
      pipeline.hincrbyfloat(keys.providerDaily, 'cost', data.cost);
      pipeline.expire(keys.providerDaily, 86400 * 7);
      
      pipeline.hincrby(keys.modelDaily, 'requests', 1);
      pipeline.hincrbyfloat(keys.modelDaily, 'tokens', data.inputTokens + data.outputTokens);
      pipeline.hincrbyfloat(keys.modelDaily, 'cost', data.cost);
      pipeline.expire(keys.modelDaily, 86400 * 7);
      
      await pipeline.exec();

      const processingTime = Date.now() - startTime;
      
      logger.info({
        operation: 'track_usage_success',
        userId: data.userId,
        attemptId: data.attemptId,
        provider: data.provider,
        model: data.model,
        totalTokens: data.inputTokens + data.outputTokens,
        cost: data.cost,
        responseTime: data.responseTime,
        processingTime
      }, 'AI usage tracked successfully');

      if (data.cost > 0.10) {
        logger.warn({
          operation: 'high_cost_usage',
          userId: data.userId,
          provider: data.provider,
          model: data.model,
          cost: data.cost,
          totalTokens: data.inputTokens + data.outputTokens,
          highCost: true
        }, 'High cost AI usage detected');
      }

      if (data.inputTokens + data.outputTokens > 10000) {
        logger.warn({
          operation: 'high_token_usage',
          userId: data.userId,
          provider: data.provider,
          model: data.model,
          totalTokens: data.inputTokens + data.outputTokens,
          inputTokens: data.inputTokens,
          outputTokens: data.outputTokens,
          highTokenUsage: true
        }, 'High token usage detected');
      }

      if (data.responseTime > 30000) { 
        logger.warn({
          operation: 'slow_response_time',
          userId: data.userId,
          provider: data.provider,
          model: data.model,
          responseTime: data.responseTime,
          slowResponse: true
        }, 'Slow AI response time detected');
      }
      
    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      logger.error({
        operation: 'track_usage_failed',
        userId: data.userId,
        provider: data.provider,
        model: data.model,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        processingTime
      }, 'Failed to track AI usage');
      
      throw error;
    }
  }

  async getUserUsage(userId: string, days: number = 30): Promise<{
    total: { requests: number; tokens: number; cost: number };
    byProvider: Record<string, { requests: number; tokens: number; cost: number }>;
    daily: Array<{ date: string; requests: number; tokens: number; cost: number }>;
  }> {
    const startTime = Date.now();
    
    logger.info({
      operation: 'get_user_usage',
      userId,
      days
    }, 'Getting user usage statistics');

    try {
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

      const result = {
        total,
        byProvider,
        daily: Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date)),
      };

      const processingTime = Date.now() - startTime;
      
      logger.info({
        operation: 'get_user_usage_success',
        userId,
        days,
        interactionsFound: interactions.length,
        dateRange: { startDate, endDate },
        total: {
          requests: total.requests,
          tokens: total.tokens,
          cost: Math.round(total.cost * 100) / 100
        },
        providers: Object.keys(byProvider),
        dailyDataPoints: result.daily.length,
        averageDailyCost: result.daily.length > 0 ? Math.round((total.cost / result.daily.length) * 100) / 100 : 0,
        processingTime
      }, 'User usage statistics retrieved');

      if (total.cost > 50) {
        logger.warn({
          userId,
          totalCost: total.cost,
          days,
          highSpending: true
        }, 'High AI spending detected for user');
      }

      if (total.tokens > 500000) {
        logger.warn({
          userId,
          totalTokens: total.tokens,
          days,
          highTokenUsage: true
        }, 'High token usage detected for user');
      }

      const topProvider = Object.entries(byProvider).reduce((top, [provider, stats]) => 
        stats.requests > (top.stats?.requests || 0) ? { provider, stats } : top, 
        {} as { provider?: string; stats?: any }
      );

      if (topProvider.provider) {
        logger.info({
          userId,
          topProvider: topProvider.provider,
          providerStats: topProvider.stats,
          providerUsageInsight: true
        }, 'Top AI provider usage identified');
      }

      return result;
      
    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      logger.error({
        operation: 'get_user_usage_failed',
        userId,
        days,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        processingTime
      }, 'Failed to get user usage statistics');
      
      throw error;
    }
  }

  async getProviderUsage(provider: AIProvider, days: number = 30): Promise<{
    total: { requests: number; tokens: number; cost: number };
    byModel: Record<string, { requests: number; tokens: number; cost: number }>;
    daily: Array<{ date: string; requests: number; tokens: number; cost: number }>;
  }> {
    const startTime = Date.now();
    
    logger.info({
      operation: 'get_provider_usage',
      provider,
      days
    }, 'Getting provider usage statistics');

    try {
      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - days * 86400000);

      const interactions = await this.prisma.aIInteraction.findMany({
        where: {
          provider: provider.toUpperCase() as any,
          createdAt: {
            gte: startDate,
            lte: endDate,
          },
        },
        select: {
          model: true,
          inputTokens: true,
          outputTokens: true,
          estimatedCost: true,
          createdAt: true,
        },
      });

      const total = { requests: 0, tokens: 0, cost: 0 };
      const byModel: Record<string, any> = {};
      const dailyMap: Map<string, any> = new Map();

      for (const interaction of interactions) {
        const tokens = interaction.inputTokens + interaction.outputTokens;
        const date = interaction.createdAt.toISOString().split('T')[0];

        total.requests++;
        total.tokens += tokens;
        total.cost += interaction.estimatedCost;

        if (!byModel[interaction.model]) {
          byModel[interaction.model] = { requests: 0, tokens: 0, cost: 0 };
        }
        byModel[interaction.model].requests++;
        byModel[interaction.model].tokens += tokens;
        byModel[interaction.model].cost += interaction.estimatedCost;

        if (!dailyMap.has(date)) {
          dailyMap.set(date, { date, requests: 0, tokens: 0, cost: 0 });
        }
        const daily = dailyMap.get(date);
        daily.requests++;
        daily.tokens += tokens;
        daily.cost += interaction.estimatedCost;
      }

      const result = {
        total,
        byModel,
        daily: Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date)),
      };

      const processingTime = Date.now() - startTime;
      
      logger.info({
        operation: 'get_provider_usage_success',
        provider,
        days,
        interactionsFound: interactions.length,
        dateRange: { startDate, endDate },
        total: {
          requests: total.requests,
          tokens: total.tokens,
          cost: Math.round(total.cost * 100) / 100
        },
        models: Object.keys(byModel),
        dailyDataPoints: result.daily.length,
        averageDailyCost: result.daily.length > 0 ? Math.round((total.cost / result.daily.length) * 100) / 100 : 0,
        processingTime
      }, 'Provider usage statistics retrieved');

      const topModel = Object.entries(byModel).reduce((top, [model, stats]) => 
        stats.requests > (top.stats?.requests || 0) ? { model, stats } : top, 
        {} as { model?: string; stats?: any }
      );

      if (topModel.model) {
        logger.info({
          provider,
          topModel: topModel.model,
          modelStats: topModel.stats,
          modelUsageInsight: true
        }, 'Top model usage identified for provider');
      }

      if (total.cost > 100) {
        logger.info({
          provider,
          totalCost: total.cost,
          days,
          highProviderSpending: true
        }, 'High spending detected for provider');
      }

      return result;
      
    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      logger.error({
        operation: 'get_provider_usage_failed',
        provider,
        days,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        processingTime
      }, 'Failed to get provider usage statistics');
      
      throw error;
    }
  }

  async getSystemUsage(days: number = 30): Promise<{
    total: { requests: number; tokens: number; cost: number };
    byProvider: Record<string, { requests: number; tokens: number; cost: number }>;
    topUsers: Array<{ userId: string; requests: number; tokens: number; cost: number }>;
    daily: Array<{ date: string; requests: number; tokens: number; cost: number }>;
  }> {
    const startTime = Date.now();
    
    logger.info({
      operation: 'get_system_usage',
      days
    }, 'Getting system-wide usage statistics');

    try {
      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - days * 86400000);

      const interactions = await this.prisma.aIInteraction.findMany({
        where: {
          createdAt: {
            gte: startDate,
            lte: endDate,
          },
        },
        select: {
          userId: true,
          provider: true,
          inputTokens: true,
          outputTokens: true,
          estimatedCost: true,
          createdAt: true,
        },
      });

      const total = { requests: 0, tokens: 0, cost: 0 };
      const byProvider: Record<string, any> = {};
      const userStats: Map<string, any> = new Map();
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

        if (!userStats.has(interaction.userId)) {
          userStats.set(interaction.userId, { userId: interaction.userId, requests: 0, tokens: 0, cost: 0 });
        }
        const userStat = userStats.get(interaction.userId);
        userStat.requests++;
        userStat.tokens += tokens;
        userStat.cost += interaction.estimatedCost;
        
        if (!dailyMap.has(date)) {
          dailyMap.set(date, { date, requests: 0, tokens: 0, cost: 0 });
        }
        const daily = dailyMap.get(date);
        daily.requests++;
        daily.tokens += tokens;
        daily.cost += interaction.estimatedCost;
      }

      const topUsers = Array.from(userStats.values())
        .sort((a, b) => b.requests - a.requests)
        .slice(0, 10);

      const result = {
        total,
        byProvider,
        topUsers,
        daily: Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date)),
      };

      const processingTime = Date.now() - startTime;
      
      logger.info({
        operation: 'get_system_usage_success',
        days,
        interactionsFound: interactions.length,
        uniqueUsers: userStats.size,
        dateRange: { startDate, endDate },
        total: {
          requests: total.requests,
          tokens: total.tokens,
          cost: Math.round(total.cost * 100) / 100
        },
        providers: Object.keys(byProvider),
        topUsersCount: topUsers.length,
        dailyDataPoints: result.daily.length,
        averageDailyCost: result.daily.length > 0 ? Math.round((total.cost / result.daily.length) * 100) / 100 : 0,
        processingTime
      }, 'System usage statistics retrieved');

      return result;
      
    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      logger.error({
        operation: 'get_system_usage_failed',
        days,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        processingTime
      }, 'Failed to get system usage statistics');
      
      throw error;
    }
  }
}