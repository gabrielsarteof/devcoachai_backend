import Redis from 'ioredis';
import { logger } from '@/shared/infrastructure/monitoring/logger';

export interface ICacheService {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown, ttl?: number): Promise<void>;
  del(key: string): Promise<void>;
  keys(pattern: string): Promise<string[]>;
}

export class RedisCacheService implements ICacheService {
  private readonly prefix = 'gamification';

  constructor(private readonly redis: Redis) {}

  async get<T>(key: string): Promise<T | null> {
    try {
      const fullKey = this.buildKey(key);
      const cached = await this.redis.get(fullKey);
      
      if (cached) {
        logger.debug({ key: fullKey }, 'Cache hit');
        return JSON.parse(cached) as T;
      }
      
      return null;
    } catch (error) {
      logger.error({ key, error }, 'Cache get failed');
      return null;
    }
  }

  async set(key: string, value: unknown, ttl: number = 3600): Promise<void> {
    try {
      const fullKey = this.buildKey(key);
      await this.redis.setex(fullKey, ttl, JSON.stringify(value));
      logger.debug({ key: fullKey, ttl }, 'Cache set');
    } catch (error) {
      logger.error({ key, error }, 'Cache set failed');
    }
  }

  async del(key: string): Promise<void> {
    try {
      const fullKey = this.buildKey(key);
      await this.redis.del(fullKey);
      logger.debug({ key: fullKey }, 'Cache deleted');
    } catch (error) {
      logger.error({ key, error }, 'Cache delete failed');
    }
  }

  async keys(pattern: string): Promise<string[]> {
    try {
      const fullPattern = this.buildKey(pattern);
      return await this.redis.keys(fullPattern);
    } catch (error) {
      logger.error({ pattern, error }, 'Cache keys failed');
      return [];
    }
  }

  private buildKey(key: string): string {
    return `${this.prefix}:${key}`;
  }
}