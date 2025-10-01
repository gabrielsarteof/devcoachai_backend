import { IChallengeRepository } from '../../domain/repositories/challenge.repository.interface';
import { CreateChallengeDTO } from '../../domain/schemas/challenge.schema';
import { logger } from '@/shared/infrastructure/monitoring/logger';
import {
  ChallengeNotFoundError,
  ChallengeSlugExistsError,
  InvalidTestCaseWeightsError,
  DuplicateTrapIdsError
} from '../../domain/errors';

export class UpdateChallengeUseCase {
  constructor(private readonly repository: IChallengeRepository) {}

  async execute(id: string, data: Partial<CreateChallengeDTO>) {
    const startTime = Date.now();
    
    logger.info({
      operation: 'challenge_update',
      challengeId: id,
      fieldsToUpdate: Object.keys(data),
      hasSlugChange: !!data.slug,
      hasTestCasesChange: !!data.testCases,
      hasTrapsChange: !!data.traps
    }, 'Challenge update started');

    try {
      const existing = await this.repository.findById(id);
      if (!existing) {
        logger.warn({
          challengeId: id,
          reason: 'challenge_not_found',
          executionTime: Date.now() - startTime
        }, 'Challenge update failed - challenge not found');
        throw new ChallengeNotFoundError();
      }

      if (data.slug && data.slug !== existing.slug) {
        const slugExists = await this.repository.findBySlug(data.slug);
        if (slugExists) {
          logger.warn({
            challengeId: id,
            newSlug: data.slug,
            oldSlug: existing.slug,
            conflictingChallengeId: slugExists.id,
            reason: 'slug_already_exists',
            executionTime: Date.now() - startTime
          }, 'Challenge update failed - slug already exists');
          throw new ChallengeSlugExistsError(data.slug);
        }
      }

      if (data.testCases) {
        const totalWeight = data.testCases.reduce((sum, tc) => sum + tc.weight, 0);
        if (Math.abs(totalWeight - 1) > 0.01) {
          logger.warn({
            challengeId: id,
            totalWeight,
            expectedWeight: 1.0,
            testCasesCount: data.testCases.length,
            reason: 'invalid_test_case_weights',
            executionTime: Date.now() - startTime
          }, 'Challenge update failed - test case weights must sum to 1.0');
          throw new InvalidTestCaseWeightsError();
        }
      }

      if (data.traps) {
        const trapIds = new Set(data.traps.map(t => t.id));
        if (trapIds.size !== data.traps.length) {
          logger.warn({
            challengeId: id,
            trapsCount: data.traps.length,
            uniqueTrapIds: trapIds.size,
            reason: 'duplicate_trap_ids',
            executionTime: Date.now() - startTime
          }, 'Challenge update failed - trap IDs must be unique');
          throw new DuplicateTrapIdsError();
        }
      }

      const challenge = await this.repository.update(id, data);
      
      const executionTime = Date.now() - startTime;
      
      logger.info({
        challengeId: id,
        slug: challenge.slug,
        title: challenge.title,
        difficulty: challenge.difficulty,
        category: challenge.category,
        fieldsUpdated: Object.keys(data),
        slugChanged: data.slug ? { from: existing.slug, to: data.slug } : false,
        testCasesUpdated: !!data.testCases,
        trapsUpdated: !!data.traps,
        hintsUpdated: !!data.hints,
        executionTime
      }, 'Challenge updated successfully');
      
      return challenge;
    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : 'Unknown error',
        challengeId: id,
        fieldsToUpdate: Object.keys(data),
        executionTime: Date.now() - startTime
      }, 'Challenge update use case failed');
      throw error;
    }
  }
}