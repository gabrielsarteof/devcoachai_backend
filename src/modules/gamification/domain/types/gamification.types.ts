export interface XPCalculationFactors {
  baseXP: number;
  difficultyMultiplier: number;
  performanceBonus: number;
  streakBonus: number;
  firstTryBonus: number;
  independenceBonus: number; 
}

export interface LevelThreshold {
  level: number;
  requiredXP: number;
  title: string;
  perks: string[];
}

export interface BadgeRequirement {
  type: 'challenges' | 'streak' | 'metrics' | 'special';
  threshold: number;
  metricType?: 'DI' | 'PR' | 'CS';
  comparison?: 'gte' | 'lte' | 'eq';
}

export interface StreakData {
  currentStreak: number;
  longestStreak: number;
  lastActivityDate: Date;
  freezesAvailable: number;
  weekendProtectionActive: boolean;
}

export type BadgeRarity = 'COMMON' | 'RARE' | 'EPIC' | 'LEGENDARY';
export type LeaderboardScope = 'GLOBAL' | 'COMPANY' | 'WEEKLY' | 'MONTHLY';

export interface BadgeProgress {
  badgeId: string;
  userId: string;
  currentValue: number;
  targetValue: number;
  percentage: number;
  lastUpdated: Date;
}

export interface BadgeUnlockEvent {
  userId: string;
  badgeId: string;
  badgeKey: string;
  badgeName: string;
  category: string;
  rarity: string;
  xpReward: number;
  timestamp: Date;
}