import { XPTransaction, User } from '@prisma/client';
import { XPTransactionEntity } from '../entities/xp-transaction.entity';

export interface IGamificationRepository {
  createXPTransaction(transaction: XPTransactionEntity): Promise<XPTransaction>;
  getXPTransactionsByUser(userId: string, limit?: number): Promise<XPTransaction[]>;
  getUserTotalXP(userId: string): Promise<number>;
  
  updateUserLevel(userId: string, level: number, totalXP: number): Promise<User>;
  getUserLevelData(userId: string): Promise<{ level: number; totalXp: number; currentStreak: number }>;
  
  // Leaderboard (preparação para fase futura)
  getTopUsersByXP(limit: number, offset?: number): Promise<Array<{
    userId: string;
    name: string;
    totalXp: number;
    level: number;
  }>>;
}