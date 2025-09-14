import { StreakEntity } from '../entities/streak.entity';

export interface IStreakRepository {
  findByUserId(userId: string): Promise<StreakEntity | null>;
  save(streak: StreakEntity): Promise<void>;
  create(streak: StreakEntity): Promise<void>;
  findActiveStreaks(): Promise<StreakEntity[]>;
  findStreaksAtRisk(hours: number): Promise<StreakEntity[]>;
}