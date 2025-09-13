import { LevelProgressionService } from '../../domain/services/level-progression.service';
import { IGamificationRepository } from '../../domain/repositories/gamification.repository.interface';
import { logger } from '@/shared/infrastructure/monitoring/logger';

export class CalculateLevelUseCase {
  constructor(
    private readonly levelService: LevelProgressionService,
    private readonly repository: IGamificationRepository
  ) {}

  async execute(userId: string) {
    const startTime = Date.now();
    
    logger.info({
      operation: 'calculate_level_usecase',
      userId
    }, 'Calculating user level');

    try {
      const userData = await this.repository.getUserLevelData(userId);
      const levelData = this.levelService.calculateLevel(userData.totalXp);
      
      const result = {
        userId,
        currentLevel: levelData.currentLevel,
        nextLevel: levelData.nextLevel,
        currentXP: userData.totalXp,
        progress: levelData.progress,
        xpToNext: levelData.xpToNext,
        currentStreak: userData.currentStreak
      };

      logger.info({
        operation: 'calculate_level_completed',
        userId,
        result,
        processingTime: Date.now() - startTime
      }, 'Level calculation completed');

      return result;
    } catch (error) {
      logger.error({
        operation: 'calculate_level_failed',
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
        processingTime: Date.now() - startTime
      }, 'Failed to calculate level');
      throw error;
    }
  }
}