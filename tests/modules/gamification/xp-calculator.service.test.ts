import { describe, it, expect, beforeEach, vi } from 'vitest';
import { XPCalculatorService } from '@/modules/gamification/domain/services/xp-calculator.service';
import { Difficulty } from '@/shared/domain/enums';

vi.mock('@/shared/infrastructure/monitoring/logger', () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('XPCalculatorService', () => {
  let xpCalculator: XPCalculatorService;

  beforeEach(() => {
    vi.clearAllMocks();
    xpCalculator = new XPCalculatorService();
  });

  describe('calculateChallengeXP', () => {
    const baseParams = {
      baseXP: 100,
      difficulty: Difficulty.MEDIUM,
      metrics: {
        dependencyIndex: 50,
        passRate: 70,
        checklistScore: 7,
      },
      timeSpent: 1800,
      estimatedTime: 3600,
      attemptNumber: 1,
      streakDays: 0,
    };

    it('should calculate XP with base multipliers', () => {
      const result = xpCalculator.calculateChallengeXP(baseParams);

      expect(result).toMatchObject({
        baseXP: expect.any(Number),
        difficultyMultiplier: expect.any(Number),
        performanceBonus: expect.any(Number),
        streakBonus: expect.any(Number),
        independenceBonus: expect.any(Number),
        firstTryBonus: expect.any(Number),
      });

      expect(result.baseXP).toBeGreaterThan(0);
    });

    it('should apply difficulty multipliers correctly', () => {
      const easyResult = xpCalculator.calculateChallengeXP({
        ...baseParams,
        difficulty: Difficulty.EASY,
      });

      const hardResult = xpCalculator.calculateChallengeXP({
        ...baseParams,
        difficulty: Difficulty.HARD,
      });

      const expertResult = xpCalculator.calculateChallengeXP({
        ...baseParams,
        difficulty: Difficulty.EXPERT,
      });

      expect(easyResult.difficultyMultiplier).toBeLessThan(hardResult.difficultyMultiplier);
      expect(hardResult.difficultyMultiplier).toBeLessThan(expertResult.difficultyMultiplier);
    });

    it('should apply independence bonus for low dependency index', () => {
      const lowDependencyResult = xpCalculator.calculateChallengeXP({
        ...baseParams,
        metrics: {
          dependencyIndex: 10,
          passRate: 70,
          checklistScore: 7,
        },
      });

      const highDependencyResult = xpCalculator.calculateChallengeXP({
        ...baseParams,
        metrics: {
          dependencyIndex: 90,
          passRate: 70,
          checklistScore: 7,
        },
      });

      expect(lowDependencyResult.independenceBonus).toBeGreaterThan(highDependencyResult.independenceBonus);
    });

    it('should apply performance bonus for high metrics', () => {
      const highPerformanceResult = xpCalculator.calculateChallengeXP({
        ...baseParams,
        metrics: {
          dependencyIndex: 20,
          passRate: 95,
          checklistScore: 10,
        },
      });

      const lowPerformanceResult = xpCalculator.calculateChallengeXP({
        ...baseParams,
        metrics: {
          dependencyIndex: 80,
          passRate: 50,
          checklistScore: 5,
        },
      });

      expect(highPerformanceResult.performanceBonus).toBeGreaterThan(lowPerformanceResult.performanceBonus);
    });

    it('should apply streak bonus correctly', () => {
      const noStreakResult = xpCalculator.calculateChallengeXP({
        ...baseParams,
        streakDays: 0,
      });

      const lowStreakResult = xpCalculator.calculateChallengeXP({
        ...baseParams,
        streakDays: 3,
      });

      const highStreakResult = xpCalculator.calculateChallengeXP({
        ...baseParams,
        streakDays: 10,
      });

      expect(noStreakResult.streakBonus).toBe(1);
      expect(lowStreakResult.streakBonus).toBeGreaterThan(1);
      expect(highStreakResult.streakBonus).toBeGreaterThan(lowStreakResult.streakBonus);
    });

    it('should apply first try bonus', () => {
      const firstAttemptResult = xpCalculator.calculateChallengeXP({
        ...baseParams,
        attemptNumber: 1,
      });

      const multipleAttemptsResult = xpCalculator.calculateChallengeXP({
        ...baseParams,
        attemptNumber: 5,
      });

      expect(firstAttemptResult.firstTryBonus).toBeGreaterThan(multipleAttemptsResult.firstTryBonus);
    });

    it('should handle edge cases gracefully', () => {
      const edgeCaseResult = xpCalculator.calculateChallengeXP({
        baseXP: 0,
        difficulty: Difficulty.EASY,
        metrics: {
          dependencyIndex: 0,
          passRate: 100,
          checklistScore: 10,
        },
        timeSpent: 0,
        estimatedTime: 0,
        attemptNumber: 1,
        streakDays: 0,
      });

      expect(edgeCaseResult.baseXP).toBe(0);
      expect(edgeCaseResult.difficultyMultiplier).toBeGreaterThan(0);
    });

    it('should calculate reasonable multipliers', () => {
      const extremeResult = xpCalculator.calculateChallengeXP({
        baseXP: 100,
        difficulty: Difficulty.EXPERT,
        metrics: {
          dependencyIndex: 0,
          passRate: 100,
          checklistScore: 10,
        },
        timeSpent: 1,
        estimatedTime: 10000,
        attemptNumber: 1,
        streakDays: 100,
      });

      expect(extremeResult.streakBonus).toBeLessThanOrEqual(2);
      expect(extremeResult.independenceBonus).toBeLessThanOrEqual(2);
      expect(extremeResult.performanceBonus).toBeLessThanOrEqual(2);
    });
  });

  describe('calculateDailyGoalXP', () => {
    it('should calculate basic daily goal XP', () => {
      const result = xpCalculator.calculateDailyGoalXP({
        challengesCompleted: 2,
        averageDI: 50,
        timeSpent: 45,
      });

      expect(result).toBe(110);
    });

    it('should apply independence bonus for low DI', () => {
      const highIndependenceResult = xpCalculator.calculateDailyGoalXP({
        challengesCompleted: 1,
        averageDI: 30,
        timeSpent: 45,
      });

      const lowIndependenceResult = xpCalculator.calculateDailyGoalXP({
        challengesCompleted: 1,
        averageDI: 60,
        timeSpent: 45,
      });

      expect(highIndependenceResult).toBeGreaterThan(lowIndependenceResult);
    });

    it('should apply consistency bonus for adequate time', () => {
      const consistentResult = xpCalculator.calculateDailyGoalXP({
        challengesCompleted: 1,
        averageDI: 50,
        timeSpent: 35,
      });

      const inconsistentResult = xpCalculator.calculateDailyGoalXP({
        challengesCompleted: 1,
        averageDI: 50,
        timeSpent: 20,
      });

      expect(consistentResult).toBeGreaterThan(inconsistentResult);
    });

    it('should scale with challenges completed', () => {
      const fewChallengesResult = xpCalculator.calculateDailyGoalXP({
        challengesCompleted: 1,
        averageDI: 50,
        timeSpent: 30,
      });

      const manyChallengesResult = xpCalculator.calculateDailyGoalXP({
        challengesCompleted: 5,
        averageDI: 50,
        timeSpent: 30,
      });

      expect(manyChallengesResult).toBeGreaterThan(fewChallengesResult);
      expect(manyChallengesResult - fewChallengesResult).toBe(80);
    });

    it('should handle zero challenges', () => {
      const result = xpCalculator.calculateDailyGoalXP({
        challengesCompleted: 0,
        averageDI: 30,
        timeSpent: 35,
      });

      expect(result).toBe(100);
    });

    it('should handle minimal effort', () => {
      const result = xpCalculator.calculateDailyGoalXP({
        challengesCompleted: 0,
        averageDI: 60,
        timeSpent: 15,
      });

      expect(result).toBe(50);
    });
  });
});