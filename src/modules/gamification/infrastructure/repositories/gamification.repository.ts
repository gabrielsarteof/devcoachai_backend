import { PrismaClient, XPTransaction, User } from '@prisma/client';
import { IGamificationRepository } from '../../domain/repositories/gamification.repository.interface';
import { XPTransactionEntity } from '../../domain/entities/xp-transaction.entity';
import { logger } from '@/shared/infrastructure/monitoring/logger';

export class GamificationRepository implements IGamificationRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async createXPTransaction(transaction: XPTransactionEntity): Promise<XPTransaction> {
    const startTime = Date.now();
    
    logger.info({
      operation: 'create_xp_transaction',
      userId: transaction.toJSON().userId,
      amount: transaction.getAmount(),
      source: transaction.toJSON().source
    }, 'Creating XP transaction in database');

    try {
      const data = transaction.toJSON();
      const xpTransaction = await this.prisma.xPTransaction.create({
        data: {
          userId: data.userId,
          amount: data.amount,
          reason: data.reason,
          source: data.source,
          sourceId: data.sourceId,
          balanceBefore: data.breakdown.base,
          balanceAfter: data.amount,
        }
      });

      logger.info({
        operation: 'xp_transaction_created',
        transactionId: xpTransaction.id,
        userId: xpTransaction.userId,
        amount: xpTransaction.amount,
        processingTime: Date.now() - startTime
      }, 'XP transaction created successfully');

      return xpTransaction;
    } catch (error) {
      logger.error({
        operation: 'create_xp_transaction_failed',
        error: error instanceof Error ? error.message : 'Unknown error',
        processingTime: Date.now() - startTime
      }, 'Failed to create XP transaction');
      throw error;
    }
  }

  async getXPTransactionsByUser(userId: string, limit: number = 10): Promise<XPTransaction[]> {
    const startTime = Date.now();
    
    logger.debug({
      operation: 'get_user_xp_transactions',
      userId,
      limit
    }, 'Fetching user XP transactions');

    try {
      const transactions = await this.prisma.xPTransaction.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: limit
      });

      logger.debug({
        operation: 'user_xp_transactions_fetched',
        userId,
        count: transactions.length,
        processingTime: Date.now() - startTime
      }, 'User XP transactions fetched');

      return transactions;
    } catch (error) {
      logger.error({
        operation: 'get_user_xp_transactions_failed',
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
        processingTime: Date.now() - startTime
      }, 'Failed to fetch user XP transactions');
      throw error;
    }
  }

  async getUserTotalXP(userId: string): Promise<number> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { totalXp: true }
    });

    return user?.totalXp || 0;
  }

  async updateUserLevel(userId: string, level: number, totalXP: number): Promise<User> {
    const startTime = Date.now();
    
    logger.info({
      operation: 'update_user_level',
      userId,
      newLevel: level,
      totalXP
    }, 'Updating user level');

    try {
      const user = await this.prisma.user.update({
        where: { id: userId },
        data: {
          currentLevel: level,
          totalXp: totalXP
        }
      });

      logger.info({
        operation: 'user_level_updated',
        userId,
        newLevel: level,
        totalXP,
        processingTime: Date.now() - startTime
      }, 'User level updated successfully');

      return user;
    } catch (error) {
      logger.error({
        operation: 'update_user_level_failed',
        userId,
        level,
        totalXP,
        error: error instanceof Error ? error.message : 'Unknown error',
        processingTime: Date.now() - startTime
      }, 'Failed to update user level');
      throw error;
    }
  }

  async getUserLevelData(userId: string): Promise<{ level: number; totalXp: number; currentStreak: number }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        currentLevel: true,
        totalXp: true,
        currentStreak: true
      }
    });

    if (!user) {
      throw new Error('User not found');
    }

    return {
      level: user.currentLevel,
      totalXp: user.totalXp,
      currentStreak: user.currentStreak
    };
  }

  async getTopUsersByXP(limit: number, offset: number = 0): Promise<Array<{
    userId: string;
    name: string;
    totalXp: number;
    level: number;
  }>> {
    const users = await this.prisma.user.findMany({
      select: {
        id: true,
        name: true,
        totalXp: true,
        currentLevel: true
      },
      orderBy: { totalXp: 'desc' },
      take: limit,
      skip: offset
    });

    return users.map(user => ({
      userId: user.id,
      name: user.name,
      totalXp: user.totalXp,
      level: user.currentLevel
    }));
  }
}