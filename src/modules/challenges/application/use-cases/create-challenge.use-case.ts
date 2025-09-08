import { IChallengeRepository } from '../../domain/repositories/challenge.repository.interface';
import { CreateChallengeDTO } from '../../domain/schemas/challenge.schema';
import { logger } from '@/shared/infrastructure/monitoring/logger';

export class CreateChallengeUseCase {
  constructor(private readonly repository: IChallengeRepository) {}

  async execute(data: CreateChallengeDTO) {
    const startTime = Date.now();
    
    logger.info({
      operation: 'challenge_creation',
      slug: data.slug,
      title: data.title,
      difficulty: data.difficulty,
      category: data.category,
      estimatedMinutes: data.estimatedMinutes,
      languages: data.languages,
      testCasesCount: data.testCases.length,
      trapsCount: data.traps.length,
      hintsCount: data.hints.length
    }, 'Challenge creation started');

    try {
      const existing = await this.repository.findBySlug(data.slug);
      if (existing) {
        logger.warn({
          slug: data.slug,
          existingChallengeId: existing.id,
          reason: 'slug_already_exists',
          executionTime: Date.now() - startTime
        }, 'Challenge creation failed - slug already exists');
        throw new Error(`Challenge with slug '${data.slug}' already exists`);
      }

      const totalWeight = data.testCases.reduce((sum, tc) => sum + tc.weight, 0);
      if (Math.abs(totalWeight - 1) > 0.01) {
        logger.warn({
          slug: data.slug,
          totalWeight,
          expectedWeight: 1.0,
          reason: 'invalid_test_case_weights',
          executionTime: Date.now() - startTime
        }, 'Challenge creation failed - test case weights must sum to 1.0');
        throw new Error('Test case weights must sum to 1.0');
      }

      const trapIds = new Set(data.traps.map(t => t.id));
      if (trapIds.size !== data.traps.length) {
        logger.warn({
          slug: data.slug,
          trapsCount: data.traps.length,
          uniqueTrapIds: trapIds.size,
          reason: 'duplicate_trap_ids',
          executionTime: Date.now() - startTime
        }, 'Challenge creation failed - trap IDs must be unique');
        throw new Error('Trap IDs must be unique');
      }

      const challenge = await this.repository.create(data);
      
      const executionTime = Date.now() - startTime;
      
      logger.info({
        challengeId: challenge.id,
        slug: challenge.slug,
        title: challenge.title,
        difficulty: challenge.difficulty,
        category: challenge.category,
        estimatedMinutes: challenge.estimatedMinutes,
        languages: challenge.languages,
        baseXp: challenge.baseXp,
        bonusXp: challenge.bonusXp,
        testCasesCount: data.testCases.length,
        trapsCount: data.traps.length,
        hintsCount: data.hints.length,
        executionTime
      }, 'Challenge created successfully');
      
      return challenge;
    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : 'Unknown error',
        slug: data.slug,
        title: data.title,
        difficulty: data.difficulty,
        category: data.category,
        executionTime: Date.now() - startTime
      }, 'Challenge creation use case failed');
      throw error;
    }
  }
}