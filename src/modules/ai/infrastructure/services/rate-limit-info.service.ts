import { IRateLimitInfoService, RateLimitInfo } from '../../domain/services/rate-limit-info.service.interface';
import { RateLimiterService } from './rate-limiter.service';
import { logger } from '@/shared/infrastructure/monitoring/logger';

export class RateLimitInfoService implements IRateLimitInfoService {
  constructor(
    private readonly rateLimiter: RateLimiterService
  ) {}

  async getUserLimits(userId: string): Promise<RateLimitInfo> {
    try {
      const quota = await this.rateLimiter.getRemainingQuota(userId);
      const now = new Date();

      // Cálculo dos horários de reset para diferentes períodos
      const nextMinute = new Date(now);
      nextMinute.setSeconds(0, 0);
      nextMinute.setMinutes(nextMinute.getMinutes() + 1);

      const nextHour = new Date(now);
      nextHour.setMinutes(0, 0, 0);
      nextHour.setHours(nextHour.getHours() + 1);

      const nextDay = new Date(now);
      nextDay.setHours(0, 0, 0, 0);
      nextDay.setDate(nextDay.getDate() + 1);

      // Limites padrão do sistema de rate limiting
      const defaultLimits = {
        requestsPerMinute: 20,
        requestsPerHour: 100,
        tokensPerDay: 10000
      };

      return {
        requestsPerMinute: {
          limit: defaultLimits.requestsPerMinute,
          used: Math.max(0, defaultLimits.requestsPerMinute - quota.requests.minute),
          remaining: quota.requests.minute,
        },
        requestsPerHour: {
          limit: defaultLimits.requestsPerHour,
          used: Math.max(0, defaultLimits.requestsPerHour - quota.requests.hour),
          remaining: quota.requests.hour,
        },
        tokensPerDay: {
          limit: defaultLimits.tokensPerDay,
          used: Math.max(0, defaultLimits.tokensPerDay - quota.tokens.daily),
          remaining: quota.tokens.daily,
        },
        resetTimes: {
          minute: nextMinute,
          hour: nextHour,
          day: nextDay,
        },
      };
    } catch (error) {
      logger.error({
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      }, 'Failed to get user rate limits');
      throw error;
    }
  }

  async getCurrentUsage(userId: string): Promise<{ requests: number; tokens: number }> {
    try {
      const quota = await this.rateLimiter.getRemainingQuota(userId);

      // Limites de referência para cálculo de uso atual
      const defaultLimits = {
        requestsPerHour: 100,
        tokensPerDay: 10000
      };

      return {
        requests: Math.max(0, defaultLimits.requestsPerHour - quota.requests.hour),
        tokens: Math.max(0, defaultLimits.tokensPerDay - quota.tokens.daily),
      };
    } catch (error) {
      logger.error({
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      }, 'Failed to get current usage');
      throw error;
    }
  }
}