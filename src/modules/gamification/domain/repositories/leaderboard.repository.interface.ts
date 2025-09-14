import { LeaderboardKeyVO } from '../value-objects/leaderboard-key.vo';
import { LeaderboardEntryEntity } from '../entities/leaderboard-entry.entity';

export interface LeaderboardQuery {
  key: LeaderboardKeyVO;
  page: number;
  limit: number;
  includeUser?: string;
}

export interface LeaderboardResult {
  entries: LeaderboardEntryEntity[];
  totalParticipants: number;
  userRanking?: {
    position: number;
    score: number;
    percentile: number;
  };
  lastUpdated: Date;
}

export interface ILeaderboardRepository {
  getLeaderboard(query: LeaderboardQuery): Promise<LeaderboardResult>;
  updateUserScore(key: LeaderboardKeyVO, userId: string, score: number): Promise<void>;
  getUserRanking(key: LeaderboardKeyVO, userId: string): Promise<{
    position: number;
    score: number;
    percentile: number;
  } | null>;
  getTopUsers(key: LeaderboardKeyVO, limit: number): Promise<LeaderboardEntryEntity[]>;
  resetPeriodLeaderboard(key: LeaderboardKeyVO): Promise<void>;
}