import { describe, it, expect, beforeEach } from 'vitest';
import Redis from 'ioredis';
import { RateLimiterService } from '../../../src/modules/ai/infrastructure/services/rate-limiter.service';

describe('RateLimiterService', () => {
  let redis: Redis;
  let rateLimiter: RateLimiterService;
  const testUserId = 'test-user-123';

  beforeEach(async () => {
    redis = new Redis({
      host: 'localhost',
      port: 6379,
      db: 2, 
    });
    
    await redis.flushdb();
    
    rateLimiter = new RateLimiterService(redis, {
      maxRequestsPerMinute: 10,
      maxRequestsPerHour: 50,
      maxTokensPerDay: 10000,
      burstLimit: 3,
    });
  });

  describe('checkLimit', () => {
    it('should allow requests within limits', async () => {
      const result = await rateLimiter.checkLimit(testUserId, 100);
      
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBeGreaterThan(0);
      expect(result.resetAt).toBeInstanceOf(Date);
    });

    it('should block requests exceeding minute limit', async () => {
      for (let i = 0; i < 10; i++) {
        await rateLimiter.checkLimit(testUserId, 10);
      }
      
      const result = await rateLimiter.checkLimit(testUserId, 10);
      
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
      expect(result.reason).toContain('Minute limit exceeded');
    });

    it('should block requests exceeding daily token limit', async () => {
      const result = await rateLimiter.checkLimit(testUserId, 15000);
      
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Daily token limit exceeded');
    });

    it('should enforce burst limit', async () => {
      const results = [];
      
      for (let i = 0; i < 5; i++) {
        results.push(await rateLimiter.checkLimit(testUserId, 10));
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      
      const blocked = results.filter(r => !r.allowed);
      expect(blocked.length).toBeGreaterThan(0);
      expect(blocked[0].reason).toContain('Burst limit');
    });
  });

  describe('getRemainingQuota', () => {
    it('should return remaining quota', async () => {
      await rateLimiter.checkLimit(testUserId, 100);
      await rateLimiter.checkLimit(testUserId, 200);
      
      const quota = await rateLimiter.getRemainingQuota(testUserId);
      
      expect(quota.requests.minute).toBe(8);
      expect(quota.requests.hour).toBe(48);
      expect(quota.tokens.daily).toBe(9700);
    });
  });

  describe('resetUserLimits', () => {
    it('should reset all user limits', async () => {
      await rateLimiter.checkLimit(testUserId, 100);
      await rateLimiter.checkLimit(testUserId, 200);

      await rateLimiter.resetUserLimits(testUserId);

      const quota = await rateLimiter.getRemainingQuota(testUserId);

      expect(quota.requests.minute).toBe(10);
      expect(quota.requests.hour).toBe(50);
      expect(quota.tokens.daily).toBe(10000);
    });
  });

  describe('infrastructure failure handling', () => {
    it('should fail-safe when Redis pipeline fails', async () => {
      const originalPipeline = redis.pipeline;

      redis.pipeline = (() => {
        const mockPipeline = {
          incr: () => mockPipeline,
          expire: () => mockPipeline,
          incrby: () => mockPipeline,
          exec: async () => null,
        };
        return mockPipeline as any;
      }) as any;

      const result = await rateLimiter.checkLimit(testUserId, 100);

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
      expect(result.reason).toContain('infrastructure error');

      redis.pipeline = originalPipeline;
    });
  });
});