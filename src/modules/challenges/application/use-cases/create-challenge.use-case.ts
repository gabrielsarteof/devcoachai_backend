import { IChallengeRepository } from '../../domain/repositories/challenge.repository.interface';
import { CreateChallengeDTO } from '../../domain/schemas/challenge.schema';
import { logger } from '@/shared/infrastructure/monitoring/logger';

export class CreateChallengeUseCase {
  constructor(private readonly repository: IChallengeRepository) {}

  async execute(data: CreateChallengeDTO) {
    try {
      // Check if slug already exists
      const existing = await this.repository.findBySlug(data.slug);
      if (existing) {
        throw new Error(`Challenge with slug '${data.slug}' already exists`);
      }

      // Validate test cases weights sum to 1
      const totalWeight = data.testCases.reduce((sum, tc) => sum + tc.weight, 0);
      if (Math.abs(totalWeight - 1) > 0.01) {
        throw new Error('Test case weights must sum to 1.0');
      }

      // Validate traps have unique IDs
      const trapIds = new Set(data.traps.map(t => t.id));
      if (trapIds.size !== data.traps.length) {
        throw new Error('Trap IDs must be unique');
      }

      const challenge = await this.repository.create(data);
      
      logger.info({ challengeId: challenge.id, slug: challenge.slug }, 'Challenge created');
      
      return challenge;
    } catch (error) {
      logger.error({ error, data }, 'Failed to create challenge');
      throw error;
    }
  }
}