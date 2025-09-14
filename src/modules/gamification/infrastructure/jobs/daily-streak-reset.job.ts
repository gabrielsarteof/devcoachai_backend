import { Job } from 'bullmq';
import { StreakManagerService } from '../../domain/services/streak-manager.service';
import { logger } from '@/shared/infrastructure/monitoring/logger';
import { gamificationEvents } from '../events/gamification-events';

export interface DailyStreakResetJobData {
  timestamp: string;
}

export class DailyStreakResetJob {
  constructor(private readonly streakManager: StreakManagerService) {}

  async process(job: Job<DailyStreakResetJobData>): Promise<void> {
    const startTime = Date.now();
    
    logger.info({
      operation: 'daily_streak_reset_job_started',
      jobId: job.id,
      timestamp: job.data.timestamp
    }, 'Starting daily streak reset job');

    try {
      const result = await this.streakManager.processStreakReset();

      if (result.broken > 0) {
        gamificationEvents.emit('streaks.daily-reset', {
          processed: result.processed,
          broken: result.broken,
          timestamp: new Date(),
        });
      }

      logger.info({
        operation: 'daily_streak_reset_job_completed',
        jobId: job.id,
        processed: result.processed,
        broken: result.broken,
        processingTime: Date.now() - startTime
      }, 'Daily streak reset job completed');

      await job.updateProgress(100);
    } catch (error) {
      logger.error({
        operation: 'daily_streak_reset_job_failed',
        jobId: job.id,
        error: error instanceof Error ? error.message : 'Unknown error',
        processingTime: Date.now() - startTime
      }, 'Daily streak reset job failed');
      throw error;
    }
  }
}