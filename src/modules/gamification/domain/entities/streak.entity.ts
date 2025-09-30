import { z } from 'zod';
import { logger } from '@/shared/infrastructure/monitoring/logger';
import { randomUUID } from 'crypto';

export const StreakPropsSchema = z.object({
  id: z.string().cuid(),
  userId: z.string().cuid(),
  currentStreak: z.number().int().min(0),
  longestStreak: z.number().int().min(0),
  lastActivityDate: z.date(),
  freezesUsed: z.number().int().min(0).max(2),
  weekendProtected: z.boolean(),
  status: z.enum(['ACTIVE', 'AT_RISK', 'BROKEN']),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type StreakProps = z.infer<typeof StreakPropsSchema>;

export interface StreakActivityData {
  xpEarned: number;
  timeSpent: number;
  projectsCompleted: number;
}

export interface StreakConfig {
  minXpForStreak: number;
  minTimeForStreak: number;
  graceHours: number;
  freezeLimit: number;
  weekendProtection: boolean;
}

export class StreakEntity {
  private constructor(private readonly props: StreakProps) {}

  static create(data: Omit<StreakProps, 'id' | 'createdAt' | 'updatedAt'>): StreakEntity {
    const props: StreakProps = {
      id: randomUUID(),
      ...data,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    logger.info({
      operation: 'streak_entity_created',
      userId: props.userId,
      currentStreak: props.currentStreak
    }, 'Creating streak entity');

    return new StreakEntity(props);
  }

  static fromPrisma(data: any): StreakEntity {
    return new StreakEntity(data);
  }

  updateActivity(activityData: StreakActivityData, config: StreakConfig): boolean {
    const meetsRequirements = 
      activityData.xpEarned >= config.minXpForStreak &&
      activityData.timeSpent >= config.minTimeForStreak;

    if (!meetsRequirements) {
      return false;
    }

    const today = new Date();
    const lastActivity = this.props.lastActivityDate;
    const daysDiff = this.getDaysDifference(lastActivity, today);

    if (daysDiff === 0) {
      return false;
    }

    if (daysDiff === 1 || (daysDiff <= 3 && config.weekendProtection && this.isWeekendGap(lastActivity, today))) {
      this.props.currentStreak += 1;
      this.props.longestStreak = Math.max(this.props.longestStreak, this.props.currentStreak);
      this.props.status = 'ACTIVE';
    } else {
      this.props.currentStreak = 1;
      this.props.status = 'ACTIVE';
    }

    this.props.lastActivityDate = today;
    this.props.updatedAt = new Date();

    logger.info({
      operation: 'streak_updated',
      userId: this.props.userId,
      currentStreak: this.props.currentStreak,
      longestStreak: this.props.longestStreak
    }, 'Streak updated');

    return true;
  }

  freeze(): boolean {
    if (this.props.freezesUsed >= 2) {
      return false;
    }

    this.props.freezesUsed += 1;
    this.props.status = 'ACTIVE';
    this.props.updatedAt = new Date();

    logger.info({
      operation: 'streak_frozen',
      userId: this.props.userId,
      freezesUsed: this.props.freezesUsed
    }, 'Streak frozen');

    return true;
  }

  markAtRisk(): void {
    this.props.status = 'AT_RISK';
    this.props.updatedAt = new Date();
  }

  markBroken(): void {
    this.props.currentStreak = 0;
    this.props.status = 'BROKEN';
    this.props.updatedAt = new Date();

    logger.info({
      operation: 'streak_broken',
      userId: this.props.userId,
      longestStreak: this.props.longestStreak
    }, 'Streak broken');
  }

  getNextMilestone(): number {
    const milestones = [3, 7, 14, 30, 60, 100, 365];
    return milestones.find(m => m > this.props.currentStreak) || 365;
  }

  getDaysUntilMilestone(): number {
    return this.getNextMilestone() - this.props.currentStreak;
  }

  getFreezesAvailable(): number {
    return 2 - this.props.freezesUsed;
  }

  willExpireAt(config?: StreakConfig): Date {
    const defaultConfig: StreakConfig = {
      minXpForStreak: 5,
      minTimeForStreak: 300,
      graceHours: 4,
      freezeLimit: 2,
      weekendProtection: true,
    };

    const activeConfig = config || defaultConfig;
    const expireDate = new Date(this.props.lastActivityDate);
    expireDate.setDate(expireDate.getDate() + 1);
    expireDate.setHours(activeConfig.graceHours, 0, 0, 0);
    return expireDate;
  }

  private getDaysDifference(date1: Date, date2: Date): number {
    const oneDay = 24 * 60 * 60 * 1000;
    const startDate = new Date(date1.getFullYear(), date1.getMonth(), date1.getDate());
    const endDate = new Date(date2.getFullYear(), date2.getMonth(), date2.getDate());
    return Math.round((endDate.getTime() - startDate.getTime()) / oneDay);
  }

  private isWeekendGap(lastActivity: Date, today: Date): boolean {
    const friday = new Date(lastActivity);
    friday.setDate(friday.getDate() + (5 - friday.getDay()) % 7);
    
    const monday = new Date(today);
    monday.setDate(monday.getDate() - (monday.getDay() - 1) % 7);
    
    return lastActivity <= friday && today >= monday;
  }

  getId(): string {
    return this.props.id;
  }

  getUserId(): string {
    return this.props.userId;
  }

  getCurrentStreak(): number {
    return this.props.currentStreak;
  }

  toJSON(): StreakProps {
    return { ...this.props };
  }
}