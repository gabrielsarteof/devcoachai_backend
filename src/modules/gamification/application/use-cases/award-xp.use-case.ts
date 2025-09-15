import { logger } from '@/shared/infrastructure/monitoring/logger';
import { XPCalculatorService } from '../../domain/services/xp-calculator.service';
import { XPTransactionEntity } from '../../domain/entities/xp-transaction.entity';
import { IXPRepository } from '../../domain/repositories/xp.repository.interface';
import { WebSocketServer } from '@/shared/infrastructure/websocket/socket.server';
import { XPSource, Difficulty } from '@/shared/domain/enums';
import { GamificationEvents } from '../../domain/enums/websocket-events.enum'; // ADICIONAR ESTA LINHA
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
    badgeKey: z.string().optional(),
    badgeName: z.string().optional(),
  }).optional(),
});

export type AwardXPDTO = z.infer<typeof AwardXPSchema>;

export interface AwardXPResult {
  transaction: {
    id: string;
    amount: number;
    reason: string;
    breakdown: any;
  };
  totalXP: number;
  levelUp: {
    leveledUp: boolean;
    oldLevel: number;
    newLevel: number;
    unlockedPerks: string[];
  } | null;
}

export class AwardXPUseCase {
  constructor(
    private readonly xpRepository: IXPRepository,
    private readonly xpCalculator: XPCalculatorService,
    private readonly wsServer?: WebSocketServer
  ) {}

  async execute(data: AwardXPDTO): Promise<AwardXPResult> {
    const startTime = Date.now();
    
    logger.info({
      operation: 'award_xp_started',
      userId: data.userId,
      source: data.source,
      baseAmount: data.baseAmount,
    }, 'Awarding XP to user');

    try {
      const userData = await this.xpRepository.getUserLevelData(data.userId);
      
      const multipliers = this.calculateMultipliers(data, userData);
      
      const xpTransaction = XPTransactionEntity.create({
        userId: data.userId,
        baseAmount: data.baseAmount,
        source: data.source,
        sourceId: data.sourceId,
        reason: this.generateReason(data),
        multipliers,
        metadata: data.metadata,
      });

      const xpAmount = xpTransaction.getAmount();
      const newTotalXP = userData.totalXp + xpAmount;
      
      const newLevel = this.calculateNewLevel(newTotalXP);

      const result = await this.xpRepository.createTransactionWithUserUpdate(
        xpTransaction,
        data.userId,
        newLevel,
        newTotalXP
      );

      // APENAS MUDAR OS NOMES DOS EVENTOS AQUI
      if (this.wsServer) {
        this.wsServer.emitToUser(data.userId, GamificationEvents.XP_AWARDED, {
          transaction: xpTransaction.toJSON(),
          totalXP: newTotalXP,
          levelUp: result.levelUpdate.leveledUp ? result.levelUpdate : null,
          timestamp: new Date() // ADICIONAR timestamp
        });
        
        if (result.levelUpdate.leveledUp) {
          this.wsServer.emitToUser(data.userId, GamificationEvents.LEVEL_UP, {
            ...result.levelUpdate,
            timestamp: new Date() // ADICIONAR timestamp
          });
        }
      }

      const processingTime = Date.now() - startTime;
      
      logger.info({
        operation: 'award_xp_completed',
        userId: data.userId,
        xpAwarded: xpAmount,
        totalXP: newTotalXP,
        levelUp: result.levelUpdate.leveledUp,
        processingTime,
      }, 'XP awarded successfully');

      return {
        transaction: {
          id: result.transactionId,
          amount: xpAmount,
          reason: xpTransaction.toJSON().reason,
          breakdown: xpTransaction.toJSON().breakdown
        },
        totalXP: newTotalXP,
        levelUp: result.levelUpdate.leveledUp ? result.levelUpdate : null
      };
    } catch (error) {
      logger.error({
        operation: 'award_xp_failed',
        userId: data.userId,
        error: error instanceof Error ? error.message : 'Unknown error',
        processingTime: Date.now() - startTime
      }, 'Failed to award XP');
      throw error;
    }
  }
  
  private calculateMultipliers(data: AwardXPDTO, user: { currentStreak: number }) {
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

    return multipliers;
  }

  private generateReason(data: AwardXPDTO): string {
    const reasons: Record<XPSource, string> = {
      [XPSource.CHALLENGE]: 'Desafio completado',
      [XPSource.BADGE]: 'Badge desbloqueado',
      [XPSource.STREAK]: 'Bônus de sequência',
      [XPSource.BONUS]: 'Bônus especial',
      [XPSource.ACHIEVEMENT]: 'Conquista alcançada',
    };

    return reasons[data.source] || 'XP ganho';
  }

  private calculateNewLevel(totalXP: number): number {
    if (totalXP >= 10000) return 10;
    if (totalXP >= 6000) return 9;
    if (totalXP >= 4000) return 8;
    if (totalXP >= 2500) return 7;
    if (totalXP >= 1500) return 6;
    if (totalXP >= 1000) return 5;
    if (totalXP >= 600) return 4;
    if (totalXP >= 300) return 3;
    if (totalXP >= 100) return 2;
    return 1;
  }
}