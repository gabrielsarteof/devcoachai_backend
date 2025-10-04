import { BadgeEntity } from '../entities/badge.entity';
import { IBadgeRepository } from '../repositories/badge.repository.interface';
import { BadgeEvaluationStrategyFactory } from './badge-evaluation-strategy';
import { ICacheService } from '../../infrastructure/services/cache.service';
import { BadgeNotFoundError, BadgeAlreadyUnlockedError } from '../errors';
import { logger } from '@/shared/infrastructure/monitoring/logger';

export interface BadgeEvaluationResult {
  unlocked: BadgeEntity[];
  progress: Map<string, number>;
}

export class BadgeService {
  private readonly strategyFactory = new BadgeEvaluationStrategyFactory();
  private readonly CACHE_TTL = 1800; 

  constructor(
    private readonly repository: IBadgeRepository,
    private readonly cache: ICacheService
  ) {}

  async evaluateBadges(userId: string): Promise<BadgeEvaluationResult> {
    const startTime = Date.now();
    
    logger.info({ userId, operation: 'badge_evaluation_started' }, 'Starting badge evaluation');

    try {
      const context = await this.repository.getUserData(userId);
      const allBadges = await this.getAllBadges();
      const userBadges = await this.repository.findByUserId(userId);
      
      const unlockedBadgeIds = new Set(userBadges.map(b => b.getId()));
      const newlyUnlocked: BadgeEntity[] = [];
      const progressMap = new Map<string, number>();

      for (const badge of allBadges) {
        if (unlockedBadgeIds.has(badge.getId())) {
          continue;
        }

        const requirement = badge.getRequirement();
        const strategy = this.strategyFactory.getStrategy(requirement.getType());

        const evaluation = await strategy.evaluate(requirement.getValue(), context);

        if (evaluation.unlocked) {
          newlyUnlocked.push(badge);
        } else {
          progressMap.set(badge.getId(), evaluation.progress);
        }
      }

      logger.info({
        userId,
        newlyUnlocked: newlyUnlocked.length,
        withProgress: progressMap.size,
        processingTime: Date.now() - startTime
      }, 'Badge evaluation completed');

      return { unlocked: newlyUnlocked, progress: progressMap };
    } catch (error) {
      logger.error({
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
        processingTime: Date.now() - startTime
      }, 'Badge evaluation failed');
      throw error;
    }
  }

  async unlockBadge(userId: string, badgeId: string): Promise<BadgeEntity> {
    const badge = await this.repository.findById(badgeId);
    if (!badge) {
      throw new BadgeNotFoundError();
    }

    const isAlreadyUnlocked = await this.repository.isUnlocked(userId, badgeId);
    if (isAlreadyUnlocked) {
      throw new BadgeAlreadyUnlockedError();
    }

    await this.repository.unlock(userId, badgeId);
    await this.invalidateUserCache(userId);

    logger.info({ userId, badgeId, badgeKey: badge.getKey() }, 'Badge unlocked');
    return badge;
  }

  async getAllBadges(): Promise<BadgeEntity[]> {
    const cacheKey = 'badges:all';

    logger.info({ operation: 'get_all_badges_started', cacheKey }, 'Getting all badges');

    let badges = await this.cache.get<BadgeEntity[]>(cacheKey);

    if (!badges) {
      logger.info({ operation: 'get_all_badges_cache_miss' }, 'Cache miss, fetching from repository');

      badges = await this.repository.findAll();

      logger.info({
        operation: 'get_all_badges_repository_result',
        badgeCount: badges.length,
        badgeIds: badges.map(b => b.getId()).slice(0, 5)
      }, 'Repository returned badges');

      await this.cache.set(cacheKey, badges, this.CACHE_TTL);
    } else {
      logger.info({ operation: 'get_all_badges_cache_hit', badgeCount: badges.length }, 'Cache hit');
    }

    return badges;
  }

  async getUserBadges(userId: string): Promise<BadgeEntity[]> {
    return this.repository.findByUserId(userId);
  }

  private async invalidateUserCache(userId: string): Promise<void> {
    const patterns = [`user:${userId}:badges*`, `badges:*`];
    const allKeys = new Set<string>();

    for (const pattern of patterns) {
      const keys = await this.cache.keys(pattern);
      keys.forEach(key => allKeys.add(key));
    }

    for (const key of allKeys) {
      await this.cache.del(key.replace('gamification:', ''));
    }
  }
}