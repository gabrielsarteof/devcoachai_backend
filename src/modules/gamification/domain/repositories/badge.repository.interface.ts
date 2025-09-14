import { BadgeEntity } from '../entities/badge.entity';
import { BadgeEvaluationContext } from '../services/badge-evaluation-strategy';

export interface BadgeProgress {
  badgeId: string;
  userId: string;
  currentValue: number;
  targetValue: number;
  percentage: number;
  lastUpdated: Date;
}

export interface IBadgeRepository {
  findById(badgeId: string): Promise<BadgeEntity | null>;
  findByKey(key: string): Promise<BadgeEntity | null>;
  findAll(): Promise<BadgeEntity[]>;
  findByUserId(userId: string): Promise<BadgeEntity[]>;
  
  unlock(userId: string, badgeId: string): Promise<void>;
  isUnlocked(userId: string, badgeId: string): Promise<boolean>;
  
  updateProgress(userId: string, badgeId: string, progress: number): Promise<void>;
  getProgress(userId: string, badgeId: string): Promise<BadgeProgress | null>;
  
  getUserData(userId: string): Promise<BadgeEvaluationContext>;
}