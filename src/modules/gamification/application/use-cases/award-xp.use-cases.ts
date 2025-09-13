import { PrismaClient } from '@prisma/client';
import { logger } from '@/shared/infrastructure/monitoring/logger';
import { XPCalculatorService } from '../../domain/services/xp-calculator.service';
import { LevelProgressionService } from '../../domain/services/level-progression.service';
import { XPTransactionEntity } from '../../domain/entities/xp-transaction.entity';
import { WebSocketServer } from '@/shared/infrastructure/websocket/socket.server';
import { XPSource, Difficulty } from '@/shared/domain/enums';
import { z } from 'zod';

export const AwardXPSchema = z.object({
  userId: z.string().cuid(),
  source: z.nativeEnum(XPSource),
  sourceId: z.string().optional(),
  baseAmount: z.number().int().positive(),
  metadata: z.object({
    challengeId: z.string().optional(),
    difficulty: z.nativeEnum(Difficulty).optional(),
    metrics: z.object({
      dependencyIndex: z.number().min(0).max(100),
      passRate: z.number().min(0).max(100),
      checklistScore: z.number().min(0).max(10),
    }).optional(),
    attemptNumber: z.number().int().positive().optional(),
    timeSpent: z.number().int().positive().optional(),
    estimatedTime: z.number().int().positive().optional(),
  }).optional(),
});

export type AwardXPDTO = z.infer<typeof AwardXPSchema>;

export class AwardXPUseCase {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly xpCalculator: XPCalculatorService,
    private readonly levelService: LevelProgressionService,
    private readonly wsServer: WebSocketServer
  ) {}

  async execute(data: AwardXPDTO) {
  const startTime = Date.now();
  
  logger.info({
    operation: 'award_xp_started',
    userId: data.userId,
    source: data.source,
    baseAmount: data.baseAmount,
  }, 'Awarding XP to user');

  const transaction = await this.prisma.$transaction(async (tx) => {
    try {
      const user = await tx.user.findUnique({
        where: { id: data.userId },
        select: {
          id: true,
          totalXp: true,
          currentLevel: true,
          currentStreak: true,
        },
      });

      if (!user) {
        throw new Error('User not found');
      }

      let multipliers = {
        difficulty: 1,
        performance: 1,
        streak: 1,
        independence: 1,
      };

      if (data.source === XPSource.CHALLENGE && data.metadata) {
        const factors = this.xpCalculator.calculateChallengeXP({
          baseXP: data.baseAmount,
          difficulty: data.metadata.difficulty || Difficulty.EASY,
          metrics: data.metadata.metrics || {
            dependencyIndex: 50,
            passRate: 70,
            checklistScore: 7,
          },
          timeSpent: data.metadata.timeSpent || 0,
          estimatedTime: data.metadata.estimatedTime || 0,
          attemptNumber: data.metadata.attemptNumber || 1,
          streakDays: user.currentStreak,
        });

        multipliers = {
          difficulty: factors.difficultyMultiplier,
          performance: factors.performanceBonus,
          streak: factors.streakBonus,
          independence: factors.independenceBonus,
        };
      }

      const xpTransaction = XPTransactionEntity.create({
        userId: data.userId,
        baseAmount: data.baseAmount,
        source: data.source,
        sourceId: data.sourceId,
        reason: this.generateReason(data),
        multipliers,
        metadata: data.metadata,
      });

      const oldXP = user.totalXp;
      const xpAmount = xpTransaction.getAmount();
      const newXP = oldXP + xpAmount;
      
      const levelUpResult = this.levelService.checkLevelUp(oldXP, newXP);

      await tx.xPTransaction.create({
        data: {
          userId: data.userId,
          amount: xpAmount,
          reason: xpTransaction.toJSON().reason,
          source: data.source,
          sourceId: data.sourceId,
          balanceBefore: oldXP,
          balanceAfter: newXP,
        },
      });

      await tx.user.update({
        where: { id: data.userId },
        data: {
          totalXp: newXP,
          currentLevel: levelUpResult.newLevel,
        },
      });

      return {
        transaction: xpTransaction.toJSON(),
        totalXP: newXP,
        levelUp: levelUpResult.leveledUp ? levelUpResult : null,
      };
    } catch (error) {
      logger.error({
        operation: 'award_xp_transaction_failed',
        userId: data.userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      }, 'Transaction failed');
      throw error;
    }
  });

  if (this.wsServer) {
    this.wsServer.emitToUser(data.userId, 'xp:awarded', transaction);
    
    if (transaction.levelUp) {
      this.wsServer.emitToUser(data.userId, 'level:up', transaction.levelUp);
    }
  }

  const processingTime = Date.now() - startTime;
  
  logger.info({
    operation: 'award_xp_completed',
    userId: data.userId,
    xpAwarded: transaction.transaction.amount,
    totalXP: transaction.totalXP,
    levelUp: transaction.levelUp?.leveledUp || false,
    processingTime,
  }, 'XP awarded successfully');

  return transaction;
}

  private generateReason(data: AwardXPDTO): string {
    const reasons: Record<XPSource, string> = {
      [XPSource.CHALLENGE]: `Desafio completado`,
      [XPSource.BADGE]: `Badge desbloqueado`,
      [XPSource.STREAK]: `Bônus de sequência`,
      [XPSource.BONUS]: `Bônus especial`,
      [XPSource.ACHIEVEMENT]: `Conquista alcançada`,
    };

    return reasons[data.source] || 'XP ganho';
  }
}