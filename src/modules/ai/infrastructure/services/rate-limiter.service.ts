import { Redis } from 'ioredis';
import { RateLimitConfig } from '../../domain/types/ai.types';
import { logger } from '@/shared/infrastructure/monitoring/logger';

export class RateLimiterService {
  private readonly defaultConfig: RateLimitConfig = {
    maxRequestsPerMinute: parseInt(process.env.AI_MAX_REQUESTS_PER_MINUTE || '20'),
    maxRequestsPerHour: parseInt(process.env.AI_MAX_REQUESTS_PER_HOUR || '100'),
    maxTokensPerDay: parseInt(process.env.AI_MAX_TOKENS_PER_DAY || '100000'),
    burstLimit: parseInt(process.env.AI_BURST_LIMIT || '5'),
  };

  constructor(
    private readonly redis: Redis,
    private readonly config?: Partial<RateLimitConfig>
  ) {
    this.config = { ...this.defaultConfig, ...config };

    logger.info({
      operation: 'rate_limiter_initialized',
      config: this.config
    }, 'Rate limiter service initialized');
  }

  async checkLimit(userId: string, tokens: number = 0): Promise<{
    allowed: boolean;
    remaining: number;
    resetAt: Date;
    reason?: string;
  }> {
    const startTime = Date.now();

    logger.debug({
      operation: 'check_rate_limit',
      userId,
      tokens,
      config: this.config
    }, 'Checking rate limits for user');

    try {
      const now = Date.now();
      const minute = Math.floor(now / 60000);
      const hour = Math.floor(now / 3600000);
      const day = Math.floor(now / 86400000);

      const keys = {
        minute: `ratelimit:${userId}:${minute}`,
        hour: `ratelimit:${userId}:${hour}`,
        day: `ratelimit:tokens:${userId}:${day}`,
      };

      logger.debug({
        operation: 'rate_limit_keys_generated',
        userId,
        keys,
        timeSlots: { minute, hour, day }
      }, 'Generated rate limit keys');

      const pipeline = this.redis.pipeline();

      pipeline.incr(keys.minute);
      pipeline.expire(keys.minute, 60);

      pipeline.incr(keys.hour);
      pipeline.expire(keys.hour, 3600);

      pipeline.incrby(keys.day, tokens);
      pipeline.expire(keys.day, 86400);

      const results = await pipeline.exec();

      if (!results) {
        logger.error({
          operation: 'rate_limit_check_failed',
          userId,
          reason: 'redis_pipeline_failed'
        }, 'Rate limit check failed - Redis pipeline returned null. Blocking request for safety.');

        return {
          allowed: false,
          remaining: 0,
          resetAt: new Date(Date.now() + 60000),
          reason: 'Rate limit check failed due to infrastructure error',
        };
      }

      const minuteCount = results[0][1] as number;
      const hourCount = results[2][1] as number;
      const dailyTokens = results[4][1] as number;

      logger.debug({
        operation: 'rate_limit_counts_retrieved',
        userId,
        counts: {
          minute: minuteCount,
          hour: hourCount,
          dailyTokens: dailyTokens
        },
        limits: this.config
      }, 'Retrieved current rate limit counts');

      if (minuteCount > this.config!.maxRequestsPerMinute!) {
        logger.warn({
          operation: 'minute_limit_exceeded',
          userId,
          minuteCount,
          limit: this.config!.maxRequestsPerMinute,
          resetAt: new Date((minute + 1) * 60000)
        }, 'Minute rate limit exceeded');

        return {
          allowed: false,
          remaining: 0,
          resetAt: new Date((minute + 1) * 60000),
          reason: `Minute limit exceeded. Max ${this.config!.maxRequestsPerMinute} requests per minute.`,
        };
      }

      const isTestEnvironment = process.env.NODE_ENV === 'test';
      const burstLimitEnabled = this.config!.burstLimit! > 0;

      if (burstLimitEnabled) {
        const burstWindow = isTestEnvironment ? 1 : 10;
        const burstKey = `ratelimit:burst:window:${userId}`;

        const pipeline = this.redis.pipeline();
        pipeline.lpush(burstKey, now.toString());
        pipeline.expire(burstKey, burstWindow + 1);

        const cutoffTime = now - (burstWindow * 1000);
        pipeline.lrem(burstKey, 0, cutoffTime.toString());
        pipeline.llen(burstKey);

        const burstResults = await pipeline.exec();

        if (burstResults && burstResults[3] && burstResults[3][1]) {
          const requestsInWindow = burstResults[3][1] as number;

          logger.debug({
            operation: 'burst_limit_check',
            userId,
            requestsInWindow,
            burstLimit: this.config!.burstLimit,
            burstWindow,
            isTestEnvironment
          }, 'Checking burst limit');

          if (requestsInWindow > this.config!.burstLimit!) {
            logger.warn({
              operation: 'burst_limit_exceeded',
              userId,
              requestsInWindow,
              burstLimit: this.config!.burstLimit,
              burstWindow,
              isTestEnvironment
            }, 'Burst limit exceeded');

            return {
              allowed: false,
              remaining: 0,
              resetAt: new Date(now + (burstWindow * 1000)),
              reason: `Burst limit exceeded. Maximum ${this.config!.burstLimit} requests per ${burstWindow} seconds.`,
            };
          }
        }
      }

      if (hourCount > this.config!.maxRequestsPerHour!) {
        logger.warn({
          operation: 'hour_limit_exceeded',
          userId,
          hourCount,
          limit: this.config!.maxRequestsPerHour,
          resetAt: new Date((hour + 1) * 3600000)
        }, 'Hour rate limit exceeded');

        return {
          allowed: false,
          remaining: 0,
          resetAt: new Date((hour + 1) * 3600000),
          reason: `Hour limit exceeded. Max ${this.config!.maxRequestsPerHour} requests per hour.`,
        };
      }

      if (dailyTokens > this.config!.maxTokensPerDay!) {
        logger.warn({
          operation: 'daily_token_limit_exceeded',
          userId,
          dailyTokens,
          limit: this.config!.maxTokensPerDay,
          resetAt: new Date((day + 1) * 86400000)
        }, 'Daily token limit exceeded');

        return {
          allowed: false,
          remaining: 0,
          resetAt: new Date((day + 1) * 86400000),
          reason: `Daily token limit exceeded. Max ${this.config!.maxTokensPerDay} tokens per day.`,
        };
      }


      const remainingMinute = this.config!.maxRequestsPerMinute! - minuteCount;
      const remainingHour = this.config!.maxRequestsPerHour! - hourCount;
      const remainingTokens = this.config!.maxTokensPerDay! - dailyTokens;

      const processingTime = Date.now() - startTime;

      logger.debug({
        operation: 'rate_limit_check_passed',
        userId,
        current: {
          minute: minuteCount,
          hour: hourCount,
          dailyTokens: dailyTokens
        },
        remaining: {
          minute: remainingMinute,
          hour: remainingHour,
          tokens: remainingTokens
        },
        processingTime
      }, 'Rate limit check passed');

      if (remainingMinute <= 2) {
        logger.warn({
          userId,
          remainingMinute,
          limit: this.config!.maxRequestsPerMinute,
          approachingLimit: true
        }, 'User approaching minute rate limit');
      }

      if (remainingHour <= 10) {
        logger.warn({
          userId,
          remainingHour,
          limit: this.config!.maxRequestsPerHour,
          approachingLimit: true
        }, 'User approaching hourly rate limit');
      }

      if (remainingTokens <= 5000) {
        logger.warn({
          userId,
          remainingTokens,
          limit: this.config!.maxTokensPerDay,
          approachingLimit: true
        }, 'User approaching daily token limit');
      }

      return {
        allowed: true,
        remaining: Math.min(remainingMinute, remainingHour),
        resetAt: new Date((minute + 1) * 60000),
      };

    } catch (error) {
      const processingTime = Date.now() - startTime;

      logger.error({
        operation: 'rate_limit_check_error',
        userId,
        tokens,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        processingTime
      }, 'Rate limit check failed');

      throw error;
    }
  }

  async getRemainingQuota(userId: string): Promise<{
    requests: { minute: number; hour: number };
    tokens: { daily: number };
  }> {
    const startTime = Date.now();

    logger.debug({
      operation: 'get_remaining_quota',
      userId
    }, 'Getting remaining quota for user');

    try {
      const now = Date.now();
      const minute = Math.floor(now / 60000);
      const hour = Math.floor(now / 3600000);
      const day = Math.floor(now / 86400000);

      const [minuteCount, hourCount, dailyTokens] = await Promise.all([
        this.redis.get(`ratelimit:${userId}:${minute}`),
        this.redis.get(`ratelimit:${userId}:${hour}`),
        this.redis.get(`ratelimit:tokens:${userId}:${day}`),
      ]);

      const quota = {
        requests: {
          minute: this.config!.maxRequestsPerMinute! - (parseInt(minuteCount || '0')),
          hour: this.config!.maxRequestsPerHour! - (parseInt(hourCount || '0')),
        },
        tokens: {
          daily: this.config!.maxTokensPerDay! - (parseInt(dailyTokens || '0')),
        },
      };

      const processingTime = Date.now() - startTime;

      logger.info({
        operation: 'get_remaining_quota_success',
        userId,
        current: {
          minute: parseInt(minuteCount || '0'),
          hour: parseInt(hourCount || '0'),
          dailyTokens: parseInt(dailyTokens || '0')
        },
        quota,
        limits: this.config,
        processingTime
      }, 'Remaining quota retrieved');

      return quota;

    } catch (error) {
      const processingTime = Date.now() - startTime;

      logger.error({
        operation: 'get_remaining_quota_failed',
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        processingTime
      }, 'Failed to get remaining quota');

      throw error;
    }
  }


  async resetUserLimits(userId: string): Promise<void> {
    const startTime = Date.now();

    logger.warn({
      operation: 'reset_user_limits',
      userId
    }, 'Resetting rate limits for user');

    try {
      const pattern = `ratelimit:*${userId}*`;
      const keys = await this.redis.keys(pattern);

      let deletedCount = 0;
      if (keys.length > 0) {
        deletedCount = await this.redis.del(...keys);
      }

      const processingTime = Date.now() - startTime;

      logger.warn({
        operation: 'reset_user_limits_success',
        userId,
        keysDeleted: deletedCount,
        keysFound: keys.length,
        processingTime
      }, 'User rate limits reset successfully');

    } catch (error) {
      const processingTime = Date.now() - startTime;

      logger.error({
        operation: 'reset_user_limits_failed',
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        processingTime
      }, 'Failed to reset user limits');

      throw error;
    }
  }

    async setThrottle(userId: string, riskScore: number): Promise<void> {
    const key = `throttle:${userId}`;
    const ttl = 300; 

    try {
      await this.redis.setex(key, ttl, riskScore.toString());

      logger.info({
        userId,
        riskScore,
        ttl,
        throttleApplied: true
      }, 'Throttling applied to user');
    } catch (error) {
      logger.error({
        userId,
        riskScore,
        error: error instanceof Error ? error.message : 'Unknown error'
      }, 'Failed to apply throttling');
    }
  }

  async getThrottle(userId: string): Promise<number | null> {
    const key = `throttle:${userId}`;

    try {
      const value = await this.redis.get(key);
      return value ? parseInt(value) : null;
    } catch (error) {
      logger.error({
        userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      }, 'Failed to get throttle status');
      return null;
    }
  }
}