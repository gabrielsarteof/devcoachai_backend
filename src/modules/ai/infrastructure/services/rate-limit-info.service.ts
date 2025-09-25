import { IRateLimitInfoService, RateLimitInfo } from '../../domain/services/rate-limit-info.service.interface';
import { RateLimiterService } from './rate-limiter.service';
import { logger } from '@/shared/infrastructure/monitoring/logger';

export class RateLimitInfoService implements IRateLimitInfoService {
  constructor(
    private readonly rateLimiter: RateLimiterService
  ) {}

  async getUserLimits(userId: string): Promise<RateLimitInfo> {
    try {
      const limits = await this.rateLimiter.getUserLimits(userId);
      const now = new Date();

      // Calculamos os tempos de reset baseados no horário atual
      const nextMinute = new Date(now);
      nextMinute.setSeconds(0, 0);
      nextMinute.setMinutes(nextMinute.getMinutes() + 1);

      const nextHour = new Date(now);
      nextHour.setMinutes(0, 0, 0);
      nextHour.setHours(nextHour.getHours() + 1);

      const nextDay = new Date(now);
      nextDay.setHours(0, 0, 0, 0);
      nextDay.setDate(nextDay.getDate() + 1);

      return {
        requestsPerMinute: {
          limit: limits.requestsPerMinute || 10,
          used: limits.currentUsage?.requestsThisMinute || 0,
          remaining: Math.max(0, (limits.requestsPerMinute || 10) - (limits.currentUsage?.requestsThisMinute || 0)),
        },
        requestsPerHour: {
          limit: limits.requestsPerHour || 100,
          used: limits.currentUsage?.requestsThisHour || 0,
          remaining: Math.max(0, (limits.requestsPerHour || 100) - (limits.currentUsage?.requestsThisHour || 0)),
        },
        tokensPerDay: {
          limit: limits.tokensPerDay || 10000,
          used: limits.currentUsage?.tokensToday || 0,
          remaining: Math.max(0, (limits.tokensPerDay || 10000) - (limits.currentUsage?.tokensToday || 0)),
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
      const limits = await this.rateLimiter.getUserLimits(userId);

      return {
        requests: limits.currentUsage?.requestsThisHour || 0,
        tokens: limits.currentUsage?.tokensToday || 0,
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