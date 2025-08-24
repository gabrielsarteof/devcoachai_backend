import { IChallengeRepository } from '../../domain/repositories/challenge.repository.interface';
import { messages } from '@/shared/constants/messages';
import { logger } from '@/shared/infrastructure/monitoring/logger';

export class DeleteChallengeUseCase {
  constructor(private readonly repository: IChallengeRepository) {}

  async execute(id: string) {
    try {
      const existing = await this.repository.findById(id);
      if (!existing) {
        throw new Error(messages.challenge.notFound);
      }

      await this.repository.delete(id);
      
      logger.info({ challengeId: id }, 'Challenge deleted');
    } catch (error) {
      logger.error({ error, id }, 'Failed to delete challenge');
      throw error;
    }
  }
}