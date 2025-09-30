import { BadgeRequirement } from '../value-objects/badge-requirement.vo';

export interface BadgeEvaluationContext {
  userId: string;
  totalXP?: number;
  currentLevel?: number;
  currentStreak?: number;
  challengesCompleted?: number;
  metrics?: {
    averageDI: number;
    averagePR: number;
    averageCS: number;
    lastDI?: number;
    lastPR?: number;
    lastCS?: number;
  };
}

export interface BadgeEvaluationResult {
  unlocked: boolean;
  progress: number;
}

export interface IBadgeEvaluationStrategy {
  evaluate(requirement: BadgeRequirement, context: BadgeEvaluationContext): Promise<BadgeEvaluationResult>;
}

export class XPEvaluationStrategy implements IBadgeEvaluationStrategy {
  async evaluate(requirement: BadgeRequirement, context: BadgeEvaluationContext): Promise<BadgeEvaluationResult> {
    if (requirement.type !== 'xp' || !context.totalXP) {
      return { unlocked: false, progress: 0 };
    }

    const xpRequirement = requirement as Extract<BadgeRequirement, { type: 'xp' }>;
    const progress = Math.min(100, (context.totalXP / xpRequirement.threshold) * 100);
    const unlocked = context.totalXP >= xpRequirement.threshold;

    return { unlocked, progress };
  }
}

export class LevelEvaluationStrategy implements IBadgeEvaluationStrategy {
  async evaluate(requirement: BadgeRequirement, context: BadgeEvaluationContext): Promise<BadgeEvaluationResult> {
    if (requirement.type !== 'level' || !context.currentLevel) {
      return { unlocked: false, progress: 0 };
    }

    const levelRequirement = requirement as Extract<BadgeRequirement, { type: 'level' }>;
    const progress = Math.min(100, (context.currentLevel / levelRequirement.threshold) * 100);
    const unlocked = context.currentLevel >= levelRequirement.threshold;

    return { unlocked, progress };
  }
}

export class ChallengeEvaluationStrategy implements IBadgeEvaluationStrategy {
  async evaluate(requirement: BadgeRequirement, context: BadgeEvaluationContext): Promise<BadgeEvaluationResult> {
    if (requirement.type !== 'challenges' || context.challengesCompleted === undefined) {
      return { unlocked: false, progress: 0 };
    }

    const challengeRequirement = requirement as Extract<BadgeRequirement, { type: 'challenges' }>;
    const threshold = challengeRequirement.challengeCount;
    const progress = Math.min(100, (context.challengesCompleted / threshold) * 100);
    const unlocked = context.challengesCompleted >= threshold;

    return { unlocked, progress };
  }
}

export class StreakEvaluationStrategy implements IBadgeEvaluationStrategy {
  async evaluate(requirement: BadgeRequirement, context: BadgeEvaluationContext): Promise<BadgeEvaluationResult> {
    if (requirement.type !== 'streak' || !context.currentStreak) {
      return { unlocked: false, progress: 0 };
    }

    const threshold = requirement.streakDays;
    const progress = Math.min(100, (context.currentStreak / threshold) * 100);
    const unlocked = context.currentStreak >= threshold;

    return { unlocked, progress };
  }
}

export class MetricsEvaluationStrategy implements IBadgeEvaluationStrategy {
  async evaluate(requirement: BadgeRequirement, context: BadgeEvaluationContext): Promise<BadgeEvaluationResult> {
    if (requirement.type !== 'metrics' || !context.metrics) {
      return { unlocked: false, progress: 0 };
    }

    const { metricType, threshold, comparison } = requirement;
    let value: number;

    switch (metricType) {
      case 'DI':
        value = context.metrics.lastDI || context.metrics.averageDI;
        break;
      case 'PR':
        value = context.metrics.lastPR || context.metrics.averagePR;
        break;
      case 'CS':
        value = context.metrics.lastCS || context.metrics.averageCS;
        break;
      default:
        return { unlocked: false, progress: 0 };
    }

    return this.evaluateComparison(value, threshold, comparison);
  }

  private evaluateComparison(value: number, threshold: number, comparison: 'gte' | 'lte' | 'eq'): BadgeEvaluationResult {
    switch (comparison) {
      case 'gte':
        return {
          unlocked: value >= threshold,
          progress: Math.min(100, (value / threshold) * 100),
        };
      case 'lte':
        return {
          unlocked: value <= threshold,
          progress: value <= threshold ? 100 : Math.max(0, 100 - ((value - threshold) / threshold * 100)),
        };
      case 'eq':
        return {
          unlocked: value === threshold,
          progress: value === threshold ? 100 : 0,
        };
    }
  }
}

export class SpecialEvaluationStrategy implements IBadgeEvaluationStrategy {
  async evaluate(requirement: BadgeRequirement, context: BadgeEvaluationContext): Promise<BadgeEvaluationResult> {
    if (requirement.type !== 'special') {
      return { unlocked: false, progress: 0 };
    }

    switch (requirement.customCondition) {
      case 'first-xp':
        return {
          unlocked: (context.totalXP || 0) > 0,
          progress: (context.totalXP || 0) > 0 ? 100 : 0,
        };
      default:
        return { unlocked: false, progress: 0 };
    }
  }
}

export class BadgeEvaluationStrategyFactory {
  private strategies = new Map<string, IBadgeEvaluationStrategy>([
    ['xp', new XPEvaluationStrategy()],
    ['level', new LevelEvaluationStrategy()],
    ['challenges', new ChallengeEvaluationStrategy()],
    ['streak', new StreakEvaluationStrategy()],
    ['metrics', new MetricsEvaluationStrategy()],
    ['special', new SpecialEvaluationStrategy()],
  ]);

  getStrategy(type: string): IBadgeEvaluationStrategy {
    const strategy = this.strategies.get(type);
    if (!strategy) {
      throw new Error(`Badge evaluation strategy not found: ${type}`);
    }
    return strategy;
  }
}