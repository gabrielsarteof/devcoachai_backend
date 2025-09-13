import { logger } from '@/shared/infrastructure/monitoring/logger';
import { Difficulty } from '@/shared/domain/enums';
import { XPCalculationFactors } from '../types/gamification.types';

export class XPCalculatorService {
  private readonly difficultyMultipliers = {
    [Difficulty.EASY]: 1.0,
    [Difficulty.MEDIUM]: 1.5,
    [Difficulty.HARD]: 2.0,
    [Difficulty.EXPERT]: 3.0,
  };

  calculateChallengeXP(params: {
    baseXP: number;
    difficulty: Difficulty;
    metrics: {
      dependencyIndex: number;
      passRate: number;
      checklistScore: number;
    };
    timeSpent: number;
    estimatedTime: number;
    attemptNumber: number;
    streakDays: number;
  }): XPCalculationFactors {
    const startTime = Date.now();
    
    logger.info({
      operation: 'xp_calculation_started',
      params,
    }, 'Calculating XP for challenge completion');

    const difficultyMultiplier = this.difficultyMultipliers[params.difficulty];

    const performanceBonus = this.calculatePerformanceBonus(params.metrics);

    const firstTryBonus = params.attemptNumber === 1 ? 1.25 : 1.0;

    const independenceBonus = params.metrics.dependencyIndex < 30 ? 1.5 :
                              params.metrics.dependencyIndex < 50 ? 1.25 :
                              params.metrics.dependencyIndex < 70 ? 1.0 : 0.75;

    const streakBonus = this.calculateStreakBonus(params.streakDays);

    const result: XPCalculationFactors = {
      baseXP: params.baseXP,
      difficultyMultiplier,
      performanceBonus,
      streakBonus,
      firstTryBonus,
      independenceBonus,
    };

    const finalXP = Math.round(
      params.baseXP * 
      difficultyMultiplier * 
      performanceBonus * 
      firstTryBonus * 
      independenceBonus * 
      streakBonus
    );

    logger.info({
      operation: 'xp_calculation_completed',
      baseXP: params.baseXP,
      finalXP,
      factors: result,
      processingTime: Date.now() - startTime,
    }, 'XP calculation completed');

    return result;
  }

  private calculatePerformanceBonus(metrics: {
    dependencyIndex: number;
    passRate: number;
    checklistScore: number;
  }): number {
    const weightedScore = 
      (100 - metrics.dependencyIndex) * 0.4 + 
      metrics.passRate * 0.4 +
      (metrics.checklistScore * 10) * 0.2; 

    if (weightedScore >= 90) return 1.5;
    if (weightedScore >= 80) return 1.3;
    if (weightedScore >= 70) return 1.15;
    if (weightedScore >= 60) return 1.0;
    return 0.85;
  }

  private calculateStreakBonus(streakDays: number): number {
    if (streakDays >= 30) return 1.5;
    if (streakDays >= 14) return 1.3;
    if (streakDays >= 7) return 1.15;
    if (streakDays >= 3) return 1.05;
    return 1.0;
  }

  calculateDailyGoalXP(params: {
    challengesCompleted: number;
    averageDI: number;
    timeSpent: number; 
  }): number {
    const baseXP = 50;
    const challengeBonus = params.challengesCompleted * 20;
    const independenceBonus = params.averageDI < 40 ? 30 : 0;
    const consistencyBonus = params.timeSpent >= 30 ? 20 : 0;

    return baseXP + challengeBonus + independenceBonus + consistencyBonus;
  }
}