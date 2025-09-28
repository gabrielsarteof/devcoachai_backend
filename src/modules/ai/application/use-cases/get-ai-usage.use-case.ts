import { IUsageQuotaService } from '../../domain/services/usage-quota.service.interface';
import { IRateLimitInfoService } from '../../domain/services/rate-limit-info.service.interface';
import { UsageTrackerService } from '../../infrastructure/services/usage-tracker.service';
import { logger } from '@/shared/infrastructure/monitoring/logger';

export interface GetAIUsageDTO {
  days?: number;
}

export class GetAIUsageUseCase {
  constructor(
    private readonly usageTracker: UsageTrackerService,
    private readonly usageQuotaService: IUsageQuotaService,
    private readonly rateLimitInfoService: IRateLimitInfoService
  ) {}

  async execute(userId: string, data: GetAIUsageDTO = {}) {
    const startTime = Date.now();
    const requestId = crypto.randomUUID();
    const { days = 30 } = data;

    logger.debug({
      requestId,
      operation: 'get_ai_usage',
      userId,
      days,
    }, 'Retrieving AI usage metrics');

    try {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const [usage, quota, limits] = await Promise.all([
        this.usageTracker.getUserUsage(userId, startDate, endDate),
        this.usageQuotaService.getUserQuota(userId),
        this.rateLimitInfoService.getUserLimits(userId),
      ]);

      const executionTime = Date.now() - startTime;

      logger.info({
        requestId,
        userId,
        days,
        tokensUsed: usage.total.tokens,
        requestsCount: usage.total.requests,
        totalCost: usage.total.cost,
        quotaRemaining: quota.daily.remaining,
        executionTime,
      }, 'AI usage retrieved successfully');

      return {
        usage: {
          period: {
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString(),
            days,
          },
          tokens: {
            used: usage.total.tokens,
            breakdown: usage.byProvider,
          },
          requests: {
            total: usage.total.requests,
            breakdown: usage.byProvider,
          },
          cost: {
            total: usage.total.cost,
            breakdown: usage.byProvider,
          },
        },
        quota: {
          daily: quota.daily,
          monthly: quota.monthly,
          resetAt: quota.resetAt,
        },
        limits: {
          requestsPerMinute: limits.requestsPerMinute,
          requestsPerHour: limits.requestsPerHour,
          tokensPerDay: limits.tokensPerDay,
          resetTimes: limits.resetTimes,
        },
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;

      logger.error({
        requestId,
        userId,
        days,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        executionTime,
      }, 'Failed to get AI usage');

      throw error;
    }
  }
}