import { z } from 'zod';
import { StreakManagerService } from '../../domain/services/streak-manager.service';
import { logger } from '@/shared/infrastructure/monitoring/logger';
import { gamificationEvents } from '../../infrastructure/events/gamification-events';

export const UpdateStreakSchema = z.object({
  userId: z.string().cuid(),
  activityData: z.object({
    xpEarned: z.number().min(0),
    timeSpent: z.number().min(0),
    projectsCompleted: z.number().int().min(0),
  }),
});

export type UpdateStreakDTO = z.infer<typeof UpdateStreakSchema>;

export interface UpdateStreakResult {
  currentStreak: number;
  longestStreak: number;
  status: string;
  nextMilestone: number;
  daysUntilMilestone: number;
  freezesAvailable: number;
  willExpireAt: Date;
  lastActivityDate: Date;
  wasUpdated: boolean;
  milestoneReached?: number;
}

export class UpdateStreakUseCase {
  constructor(private readonly streakManager: StreakManagerService) {}

  async execute(input: UpdateStreakDTO): Promise<UpdateStreakResult> {
    const { userId, activityData } = UpdateStreakSchema.parse(input);
    const startTime = Date.now();

    logger.info({
      operation: 'update_streak_usecase_started',
      userId,
      activityData
    }, 'Starting streak update use case');

    try {
      const oldStatus = await this.streakManager.getStreakStatus(userId);
      await this.streakManager.updateStreak(userId, activityData);
      const newStatus = await this.streakManager.getStreakStatus(userId);

      const wasUpdated = newStatus.currentStreak !== oldStatus.currentStreak;
      let milestoneReached: number | undefined;

      if (wasUpdated && newStatus.currentStreak > oldStatus.currentStreak) {
        gamificationEvents.emit('streak.updated', {
          userId,
          currentStreak: newStatus.currentStreak,
          previousStreak: oldStatus.currentStreak,
        });

        const milestones = [3, 7, 14, 30, 60, 100, 365];
        const reachedMilestone = milestones.find(m => 
          m === newStatus.currentStreak && m > oldStatus.currentStreak
        );

        if (reachedMilestone) {
          milestoneReached = reachedMilestone;
          gamificationEvents.emit('streak.milestone', {
            userId,
            milestone: reachedMilestone,
          });
          
          logger.info({
            operation: 'streak_milestone_reached',
            userId,
            milestone: reachedMilestone,
            currentStreak: newStatus.currentStreak
          }, 'Streak milestone reached');
        }
      }

      const result: UpdateStreakResult = {
        ...newStatus,
        wasUpdated,
        milestoneReached,
      };

      logger.info({
        operation: 'update_streak_usecase_completed',
        userId,
        currentStreak: newStatus.currentStreak,
        wasUpdated,
        milestoneReached,
        processingTime: Date.now() - startTime
      }, 'Streak update completed');

      return result;
    } catch (error) {
      logger.error({
        operation: 'update_streak_usecase_failed',
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
        processingTime: Date.now() - startTime
      }, 'Failed to update streak');
      throw error;
    }
  }
}