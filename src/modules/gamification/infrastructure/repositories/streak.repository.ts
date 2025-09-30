import { PrismaClient } from '@prisma/client';
import { StreakEntity } from '../../domain/entities/streak.entity';
import { IStreakRepository } from '../../domain/repositories/streak.repository.interface';
import { logger } from '@/shared/infrastructure/monitoring/logger';
import { randomUUID } from 'crypto';

export class StreakRepository implements IStreakRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findByUserId(userId: string): Promise<StreakEntity | null> {
    const streak = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        currentStreak: true,
      },
    });

    if (!streak) return null;

    const streakData = {
      id: randomUUID(),
      userId,
      currentStreak: streak.currentStreak,
      longestStreak: streak.currentStreak, 
      lastActivityDate: new Date(),
      freezesUsed: 0,
      weekendProtected: true,
      status: 'ACTIVE' as const,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    return StreakEntity.fromPrisma(streakData);
  }

  async save(streak: StreakEntity): Promise<void> {
    const data = streak.toJSON();
    
    await this.prisma.user.update({
      where: { id: data.userId },
      data: {
        currentStreak: data.currentStreak,
      },
    });

    logger.info({
      operation: 'streak_saved',
      userId: data.userId,
      currentStreak: data.currentStreak
    }, 'Streak saved to database');
  }

  async create(streak: StreakEntity): Promise<void> {
    await this.save(streak);
  }

  async findActiveStreaks(): Promise<StreakEntity[]> {
    const users = await this.prisma.user.findMany({
      where: {
        currentStreak: { gt: 0 },
      },
      select: {
        id: true,
        currentStreak: true,
      },
    });

    return users.map(user => {
      const streakData = {
        id: randomUUID(),
        userId: user.id,
        currentStreak: user.currentStreak,
        longestStreak: user.currentStreak,
        lastActivityDate: new Date(),
        freezesUsed: 0,
        weekendProtected: true,
        status: 'ACTIVE' as const,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      return StreakEntity.fromPrisma(streakData);
    });
  }

  async findStreaksAtRisk(hours: number): Promise<StreakEntity[]> {
    const cutoffDate = new Date();
    cutoffDate.setHours(cutoffDate.getHours() - (24 + hours));

    const users = await this.prisma.user.findMany({
      where: {
        currentStreak: { gt: 0 },
        lastLoginAt: { lt: cutoffDate },
      },
      select: {
        id: true,
        currentStreak: true,
        lastLoginAt: true,
      },
    });

    return users.map(user => {
      const streakData = {
        id: randomUUID(),
        userId: user.id,
        currentStreak: user.currentStreak,
        longestStreak: user.currentStreak,
        lastActivityDate: user.lastLoginAt || new Date(),
        freezesUsed: 0,
        weekendProtected: true,
        status: 'AT_RISK' as const,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      return StreakEntity.fromPrisma(streakData);
    });
  }
}