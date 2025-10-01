import { IChallengeRepository } from '../../domain/repositories/challenge.repository.interface';
import { logger } from '@/shared/infrastructure/monitoring/logger';
import { ChallengeNotFoundError } from '../../domain/errors';

export class DeleteChallengeUseCase {
  constructor(private readonly repository: IChallengeRepository) {}

  async execute(id: string) {
    const startTime = Date.now();
    
    logger.info({
      operation: 'challenge_deletion',
      challengeId: id
    }, 'Challenge deletion started');

    try {
      const existing = await this.repository.findById(id);
      if (!existing) {
        logger.warn({
          challengeId: id,
          reason: 'challenge_not_found',
          executionTime: Date.now() - startTime
        }, 'Challenge deletion failed - challenge not found');
        throw new ChallengeNotFoundError();
      }

      logger.warn({
        challengeId: id,
        slug: existing.slug,
        title: existing.title,
        difficulty: existing.difficulty,
        category: existing.category,
        operation: 'challenge_deletion_confirmed'
      }, 'Proceeding with challenge deletion');

      await this.repository.delete(id);
      
      const executionTime = Date.now() - startTime;
      
      logger.info({
        challengeId: id,
        slug: existing.slug,
        title: existing.title,
        difficulty: existing.difficulty,
        category: existing.category,
        executionTime
      }, 'Challenge deleted successfully');
      
    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : 'Unknown error',
        challengeId: id,
        executionTime: Date.now() - startTime
      }, 'Challenge deletion use case failed');
      throw error;
    }
  }
}