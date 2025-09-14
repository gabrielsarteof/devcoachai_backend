import { XPTransactionEntity } from '../entities/xp-transaction.entity';

export interface LevelUpdateResult {
  leveledUp: boolean;
  oldLevel: number;
  newLevel: number;
  unlockedPerks: string[];
}

export interface IXPRepository {
  createTransactionWithUserUpdate(
    transaction: XPTransactionEntity,
    userId: string,
    newLevel: number,
    newTotalXP: number
  ): Promise<{
    transactionId: string;
    levelUpdate: LevelUpdateResult;
  }>;
  
  getUserLevelData(userId: string): Promise<{
    totalXp: number;
    currentLevel: number;
    currentStreak: number;
  }>;
}