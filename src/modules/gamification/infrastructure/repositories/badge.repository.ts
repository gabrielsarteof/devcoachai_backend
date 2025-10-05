import { PrismaClient, Badge as PrismaBadge } from '@prisma/client';
import { BadgeEntity } from '../../domain/entities/badge.entity';
import { IBadgeRepository, BadgeProgress } from '../../domain/repositories/badge.repository.interface';
import { BadgeEvaluationContext } from '../../domain/services/badge-evaluation-strategy';
import { ICacheService } from '../services/cache.service';
import { UserNotFoundError } from '../../domain/errors';
import { logger } from '@/shared/infrastructure/monitoring/logger';

export class BadgeRepository implements IBadgeRepository {
  private readonly CACHE_TTL = 1800; 

  constructor(
    private readonly prisma: PrismaClient,
    private readonly cache: ICacheService
  ) {}

  async findById(badgeId: string): Promise<BadgeEntity | null> {
    const cacheKey = `badge:${badgeId}`;
    const cachedData = await this.cache.get<PrismaBadge>(cacheKey);

    if (cachedData) {
      return BadgeEntity.fromPrisma(cachedData);
    }

    const prismaBadge = await this.prisma.badge.findUnique({
      where: { id: badgeId },
    });

    if (prismaBadge) {
      await this.cache.set(cacheKey, prismaBadge, this.CACHE_TTL);
      return BadgeEntity.fromPrisma(prismaBadge);
    }

    return null;
  }

  async findByKey(key: string): Promise<BadgeEntity | null> {
    const prismaBadge = await this.prisma.badge.findUnique({
      where: { key },
    });
    
    return prismaBadge ? BadgeEntity.fromPrisma(prismaBadge) : null;
  }

  async findAll(): Promise<BadgeEntity[]> {
    const prismaBadges = await this.prisma.badge.findMany({
      where: { visible: true },
      orderBy: { name: 'asc' },
    });

    return prismaBadges.map(badge => BadgeEntity.fromPrisma(badge));
  }

  async findByUserId(userId: string): Promise<BadgeEntity[]> {
    const cacheKey = `user:${userId}:badges`;
    const cachedData = await this.cache.get<Array<{ badge: PrismaBadge; unlockedAt: Date; progress: number }>>(cacheKey);

    if (cachedData) {
      return cachedData.map(ub =>
        BadgeEntity.fromPrisma(ub.badge, {
          unlockedAt: ub.unlockedAt,
          progress: ub.progress,
        })
      );
    }

    const userBadges = await this.prisma.userBadge.findMany({
      where: { userId },
      include: { badge: true },
      orderBy: { unlockedAt: 'desc' },
    });

    const serializedUserBadges = userBadges.map(ub => ({
      badge: ub.badge,
      unlockedAt: ub.unlockedAt,
      progress: ub.progress,
    }));

    await this.cache.set(cacheKey, serializedUserBadges, this.CACHE_TTL);

    return userBadges.map(ub =>
      BadgeEntity.fromPrisma(ub.badge, {
        unlockedAt: ub.unlockedAt,
        progress: ub.progress,
      })
    );
  }

  async unlock(userId: string, badgeId: string): Promise<void> {
    await this.prisma.userBadge.create({
      data: {
        userId,
        badgeId,
        unlockedAt: new Date(),
        progress: 100,
        featured: false,
      },
    });

    await this.cache.del(`user:${userId}:badges`);
    
    logger.info({ userId, badgeId }, 'Badge unlocked in repository');
  }

  async isUnlocked(userId: string, badgeId: string): Promise<boolean> {
    const userBadge = await this.prisma.userBadge.findUnique({
      where: { userId_badgeId: { userId, badgeId } },
    });
    
    return !!userBadge;
  }

  async updateProgress(userId: string, badgeId: string, progress: number): Promise<void> {
    await this.prisma.userBadge.upsert({
      where: { userId_badgeId: { userId, badgeId } },
      update: { progress: Math.min(100, Math.max(0, progress)) },
      create: {
        userId,
        badgeId,
        progress: Math.min(100, Math.max(0, progress)),
        featured: false,
      },
    });

    await this.cache.del(`user:${userId}:badges`);
  }

  async getProgress(userId: string, badgeId: string): Promise<BadgeProgress | null> {
    const userBadge = await this.prisma.userBadge.findUnique({
      where: { userId_badgeId: { userId, badgeId } },
    });

    if (!userBadge) return null;

    return {
      badgeId: userBadge.badgeId,
      userId: userBadge.userId,
      currentValue: userBadge.progress,
      targetValue: 100,
      percentage: userBadge.progress,
      lastUpdated: userBadge.unlockedAt || new Date(),
    };
  }

  async getUserData(userId: string): Promise<BadgeEvaluationContext> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        totalXp: true,
        currentLevel: true,
        currentStreak: true,
      },
    });

    if (!user) {
      throw new UserNotFoundError();
    }

    const challengesCompleted = await this.prisma.challengeAttempt.count({
      where: {
        userId,
        status: 'COMPLETED',
        passed: true,
      },
    });

    const metrics = await this.prisma.userMetrics.findUnique({
      where: { userId },
      select: {
        averageDI: true,
        averagePR: true,
        averageCS: true,
      },
    });

    return {
      userId,
      totalXP: user.totalXp,
      currentLevel: user.currentLevel,
      currentStreak: user.currentStreak,
      challengesCompleted,
      metrics: metrics ? {
        averageDI: metrics.averageDI,
        averagePR: metrics.averagePR,
        averageCS: metrics.averageCS,
      } : undefined,
    };
  }
}