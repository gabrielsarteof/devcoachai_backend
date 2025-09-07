import { Redis } from 'ioredis';
import { RateLimitConfig } from '../../domain/types/ai.types';
import { logger } from '@/shared/infrastructure/monitoring/logger';

export class RateLimiterService {
  private readonly defaultConfig: RateLimitConfig = {
    maxRequestsPerMinute: 20,
    maxRequestsPerHour: 100,
    maxTokensPerDay: 100000,
    burstLimit: 5,
  };

  constructor(
    private readonly redis: Redis,
    private readonly config?: Partial<RateLimitConfig>
  ) {
    this.config = { ...this.defaultConfig, ...config };
  }

  async checkLimit(userId: string, tokens: number = 0): Promise<{
    allowed: boolean;
    remaining: number;
    resetAt: Date;
    reason?: string;
  }> {
    const now = Date.now();
    const minute = Math.floor(now / 60000);
    const hour = Math.floor(now / 3600000);
    const day = Math.floor(now / 86400000);

    const keys = {
      minute: `ratelimit:${userId}:${minute}`,
      hour: `ratelimit:${userId}:${hour}`,
      day: `ratelimit:tokens:${userId}:${day}`,
      burst: `ratelimit:burst:${userId}`,
    };

    const pipeline = this.redis.pipeline();
    
    pipeline.incr(keys.minute);
    pipeline.expire(keys.minute, 60);
    
    pipeline.incr(keys.hour);
    pipeline.expire(keys.hour, 3600);
    
    pipeline.incrby(keys.day, tokens);
    pipeline.expire(keys.day, 86400);
    
    pipeline.get(keys.burst);
    
    const results = await pipeline.exec();
    
    if (!results) {
      throw new Error('Rate limit check failed');
    }

    const minuteCount = results[0][1] as number;
    const hourCount = results[2][1] as number;
    const dailyTokens = results[4][1] as number;
    const lastBurst = results[6][1] as string | null;

    if (lastBurst) {
      const lastBurstTime = parseInt(lastBurst);
      if (now - lastBurstTime < 1000) { 
        return {
          allowed: false,
          remaining: 0,
          resetAt: new Date(lastBurstTime + 1000),
          reason: 'Burst limit exceeded. Please wait a moment.',
        };
      }
    }

    if (minuteCount > this.config!.maxRequestsPerMinute!) {
      return {
        allowed: false,
        remaining: 0,
        resetAt: new Date((minute + 1) * 60000),
        reason: `Minute limit exceeded. Max ${this.config!.maxRequestsPerMinute} requests per minute.`,
      };
    }

    if (hourCount > this.config!.maxRequestsPerHour!) {
      return {
        allowed: false,
        remaining: 0,
        resetAt: new Date((hour + 1) * 3600000),
        reason: `Hour limit exceeded. Max ${this.config!.maxRequestsPerHour} requests per hour.`,
      };
    }

    if (dailyTokens > this.config!.maxTokensPerDay!) {
      return {
        allowed: false,
        remaining: 0,
        resetAt: new Date((day + 1) * 86400000),
        reason: `Daily token limit exceeded. Max ${this.config!.maxTokensPerDay} tokens per day.`,
      };
    }

    await this.redis.setex(keys.burst, 5, now.toString());

    const remainingMinute = this.config!.maxRequestsPerMinute! - minuteCount;
    const remainingHour = this.config!.maxRequestsPerHour! - hourCount;
    const remainingTokens = this.config!.maxTokensPerDay! - dailyTokens;

    logger.debug({
      userId,
      minuteCount,
      hourCount,
      dailyTokens,
      remaining: Math.min(remainingMinute, remainingHour),
    }, 'Rate limit check passed');

    return {
      allowed: true,
      remaining: Math.min(remainingMinute, remainingHour),
      resetAt: new Date((minute + 1) * 60000),
    };
  }

  async getRemainingQuota(userId: string): Promise<{
    requests: { minute: number; hour: number };
    tokens: { daily: number };
  }> {
    const now = Date.now();
    const minute = Math.floor(now / 60000);
    const hour = Math.floor(now / 3600000);
    const day = Math.floor(now / 86400000);

    const [minuteCount, hourCount, dailyTokens] = await Promise.all([
      this.redis.get(`ratelimit:${userId}:${minute}`),
      this.redis.get(`ratelimit:${userId}:${hour}`),
      this.redis.get(`ratelimit:tokens:${userId}:${day}`),
    ]);

    return {
      requests: {
        minute: this.config!.maxRequestsPerMinute! - (parseInt(minuteCount || '0')),
        hour: this.config!.maxRequestsPerHour! - (parseInt(hourCount || '0')),
      },
      tokens: {
        daily: this.config!.maxTokensPerDay! - (parseInt(dailyTokens || '0')),
      },
    };
  }

  async resetUserLimits(userId: string): Promise<void> {
    const pattern = `ratelimit:*${userId}*`;
    const keys = await this.redis.keys(pattern);
    
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
    
    logger.info({ userId, keysDeleted: keys.length }, 'User rate limits reset');
  }
}