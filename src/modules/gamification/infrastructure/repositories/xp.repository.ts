import { PrismaClient } from '@prisma/client';
import { IXPRepository, LevelUpdateResult } from '../../domain/repositories/xp.repository.interface';
import { XPTransactionEntity } from '../../domain/entities/xp-transaction.entity';
import { LevelProgressionService } from '../../domain/services/level-progression.service';
import { logger } from '@/shared/infrastructure/monitoring/logger';

export class XPRepository implements IXPRepository {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly levelService: LevelProgressionService
  ) {}

  async createTransactionWithUserUpdate(
    transaction: XPTransactionEntity,
    userId: string,
    newLevel: number,
    newTotalXP: number
  ): Promise<{
    transactionId: string;
    levelUpdate: LevelUpdateResult;
  }> {
    const startTime = Date.now();
    const data = transaction.toJSON();

    logger.info({
      operation: 'create_xp_transaction_with_update',
      userId,
      amount: transaction.getAmount(),
      newLevel,
      newTotalXP
    }, 'Creating XP transaction with user update');

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const currentUser = await tx.user.findUnique({
          where: { id: userId },
          select: { totalXp: true, currentLevel: true }
        });

        if (!currentUser) {
          throw new Error('User not found');
        }

        const levelUpdate = this.levelService.checkLevelUp(
          currentUser.totalXp,
          newTotalXP
        );

        const xpTransaction = await tx.xPTransaction.create({
          data: {
            userId,
            amount: data.amount,
            reason: data.reason,
            source: data.source,
            sourceId: data.sourceId,
            balanceBefore: currentUser.totalXp,
            balanceAfter: newTotalXP,
          },
        });

        await tx.user.update({
          where: { id: userId },
          data: {
            totalXp: newTotalXP,
            currentLevel: levelUpdate.newLevel,
          },
        });

        return {
          transactionId: xpTransaction.id,
          levelUpdate,
        };
      });

      logger.info({
        operation: 'xp_transaction_with_update_completed',
        userId,
        transactionId: result.transactionId,
        levelUp: result.levelUpdate.leveledUp,
        processingTime: Date.now() - startTime
      }, 'XP transaction with user update completed');

      return result;
    } catch (error) {
      logger.error({
        operation: 'create_xp_transaction_with_update_failed',
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
        processingTime: Date.now() - startTime
      }, 'Failed to create XP transaction with user update');
      throw error;
    }
  }

  async getUserLevelData(userId: string): Promise<{
    totalXp: number;
    currentLevel: number;
    currentStreak: number;
  }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        totalXp: true,
        currentLevel: true,
        currentStreak: true,
      },
    });

    if (!user) {
      throw new Error('User not found');
    }

    return user;
  }
}