import { IChallengeRepository } from '../../domain/repositories/challenge.repository.interface';
import { CreateChallengeDTO } from '../../domain/schemas/challenge.schema';
import { messages } from '@/shared/constants/messages';
import { logger } from '@/shared/infrastructure/monitoring/logger';

export class UpdateChallengeUseCase {
  constructor(private readonly repository: IChallengeRepository) {}

  async execute(id: string, data: Partial<CreateChallengeDTO>) {
    try {
      const existing = await this.repository.findById(id);
      if (!existing) {
        throw new Error(messages.challenge.notFound);
      }

      if (data.slug && data.slug !== existing.slug) {
        const slugExists = await this.repository.findBySlug(data.slug);
        if (slugExists) {
          throw new Error(`Challenge with slug '${data.slug}' already exists`);
        }
      }

      if (data.testCases) {
        const totalWeight = data.testCases.reduce((sum, tc) => sum + tc.weight, 0);
        if (Math.abs(totalWeight - 1) > 0.01) {
          throw new Error('Test case weights must sum to 1.0');
        }
      }

      const challenge = await this.repository.update(id, data);
      
      logger.info({ challengeId: id }, 'Challenge updated');
      
      return challenge;
    } catch (error) {
      logger.error({ error, id, data }, 'Failed to update challenge');
      throw error;
    }
  }
}