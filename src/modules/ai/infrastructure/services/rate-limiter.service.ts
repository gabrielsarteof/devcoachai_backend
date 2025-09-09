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
        burst: `ratelimit:burst:${userId}`,
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
      
      pipeline.get(keys.burst);
      
      const results = await pipeline.exec();
      
      if (!results) {
        logger.error({
          operation: 'rate_limit_check_failed',
          userId,
          reason: 'redis_pipeline_failed'
        }, 'Rate limit check failed - Redis pipeline returned null');
        
        throw new Error('Rate limit check failed');
      }

      const minuteCount = results[0][1] as number;
      const hourCount = results[2][1] as number;
      const dailyTokens = results[4][1] as number;
      const lastBurst = results[6][1] as string | null;

      logger.debug({
        operation: 'rate_limit_counts_retrieved',
        userId,
        counts: {
          minute: minuteCount,
          hour: hourCount,
          dailyTokens: dailyTokens,
          lastBurst: lastBurst ? parseInt(lastBurst) : null
        },
        limits: this.config
      }, 'Retrieved current rate limit counts');

      if (lastBurst) {
        const lastBurstTime = parseInt(lastBurst);
        const timeSinceBurst = now - lastBurstTime;
        
        if (timeSinceBurst < 1000) { 
          logger.warn({
            operation: 'burst_limit_exceeded',
            userId,
            lastBurstTime,
            timeSinceBurst,
            burstLimit: this.config!.burstLimit
          }, 'Burst limit exceeded');
          
          return {
            allowed: false,
            remaining: 0,
            resetAt: new Date(lastBurstTime + 1000),
            reason: 'Burst limit exceeded. Please wait a moment.',
          };
        }
      }

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

      await this.redis.setex(keys.burst, 5, now.toString());

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
}