import { PrismaClient, Challenge, ChallengeAttempt } from '@prisma/client';
import { IChallengeRepository, ChallengeFilters, CreateAttemptData } from '../../domain/repositories/challenge.repository.interface';
import { CreateChallengeDTO } from '../../domain/schemas/challenge.schema';
import { ChallengeEntity } from '../../domain/entities/challenge.entity';
import { logger } from '@/shared/infrastructure/monitoring/logger';

export class ChallengeRepository implements IChallengeRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(data: CreateChallengeDTO): Promise<Challenge> {
    const startTime = Date.now();
    
    logger.info({
      operation: 'create_challenge',
      slug: data.slug,
      title: data.title,
      difficulty: data.difficulty,
      category: data.category,
      estimatedMinutes: data.estimatedMinutes,
      languages: data.languages,
      testCasesCount: data.testCases.length,
      hintsCount: data.hints?.length || 0,
      trapsCount: data.traps.length,
      baseXp: data.baseXp,
      bonusXp: data.bonusXp
    }, 'Creating new challenge');

    try {
      const entity = ChallengeEntity.create(data);
      const prismaData = entity.toPrisma();

      const challenge = await this.prisma.challenge.create({
        data: {
          slug: prismaData.slug,
          title: prismaData.title,
          description: prismaData.description,
          difficulty: prismaData.difficulty,
          category: prismaData.category,
          estimatedMinutes: prismaData.estimatedMinutes,
          languages: prismaData.languages,
          instructions: prismaData.instructions,
          starterCode: prismaData.starterCode,
          solution: prismaData.solution,
          testCases: prismaData.testCases || {},
          hints: prismaData.hints || {},
          traps: prismaData.traps || {},
          targetMetrics: prismaData.targetMetrics || {},
          baseXp: prismaData.baseXp,
          bonusXp: prismaData.bonusXp,
          createdAt: prismaData.createdAt,
          updatedAt: prismaData.updatedAt,
        },
      });

      const processingTime = Date.now() - startTime;
      
      logger.info({
        operation: 'create_challenge_success',
        challengeId: challenge.id,
        slug: challenge.slug,
        title: challenge.title,
        difficulty: challenge.difficulty,
        category: challenge.category,
        estimatedMinutes: challenge.estimatedMinutes,
        baseXp: challenge.baseXp,
        bonusXp: challenge.bonusXp,
        processingTime
      }, 'Challenge created successfully');

      return challenge;
      
    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      logger.error({
        operation: 'create_challenge_failed',
        slug: data.slug,
        title: data.title,
        difficulty: data.difficulty,
        category: data.category,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        processingTime
      }, 'Failed to create challenge');
      
      throw error;
    }
  }

  async findById(id: string): Promise<Challenge | null> {
    const startTime = Date.now();
    
    logger.debug({
      operation: 'find_challenge_by_id',
      challengeId: id
    }, 'Finding challenge by ID');

    try {
      const challenge = await this.prisma.challenge.findUnique({
        where: { id },
      });

      const processingTime = Date.now() - startTime;
      
      if (challenge) {
        logger.debug({
          operation: 'find_challenge_by_id_success',
          challengeId: id,
          slug: challenge.slug,
          title: challenge.title,
          difficulty: challenge.difficulty,
          category: challenge.category,
          processingTime
        }, 'Challenge found by ID');
      } else {
        logger.info({
          operation: 'find_challenge_by_id_not_found',
          challengeId: id,
          processingTime
        }, 'Challenge not found by ID');
      }

      return challenge;
      
    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      logger.error({
        operation: 'find_challenge_by_id_failed',
        challengeId: id,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        processingTime
      }, 'Failed to find challenge by ID');
      
      throw error;
    }
  }

  async findBySlug(slug: string): Promise<Challenge | null> {
    const startTime = Date.now();
    
    logger.debug({
      operation: 'find_challenge_by_slug',
      slug
    }, 'Finding challenge by slug');

    try {
      const challenge = await this.prisma.challenge.findUnique({
        where: { slug },
      });

      const processingTime = Date.now() - startTime;
      
      if (challenge) {
        logger.debug({
          operation: 'find_challenge_by_slug_success',
          challengeId: challenge.id,
          slug: challenge.slug,
          title: challenge.title,
          difficulty: challenge.difficulty,
          category: challenge.category,
          processingTime
        }, 'Challenge found by slug');
      } else {
        logger.info({
          operation: 'find_challenge_by_slug_not_found',
          slug,
          processingTime
        }, 'Challenge not found by slug');
      }

      return challenge;
      
    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      logger.error({
        operation: 'find_challenge_by_slug_failed',
        slug,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        processingTime
      }, 'Failed to find challenge by slug');
      
      throw error;
    }
  }

  async findAll(filters?: ChallengeFilters): Promise<Challenge[]> {
    const startTime = Date.now();
    
    logger.info({
      operation: 'find_all_challenges',
      filters: {
        difficulty: filters?.difficulty,
        category: filters?.category,
        languagesCount: filters?.languages?.length,
        hasSearch: !!filters?.search,
        limit: filters?.limit || 20,
        offset: filters?.offset || 0
      }
    }, 'Finding challenges with filters');

    try {
      const where: any = {};

      if (filters?.difficulty) {
        where.difficulty = filters.difficulty;
      }

      if (filters?.category) {
        where.category = filters.category;
      }

      if (filters?.languages && filters.languages.length > 0) {
        where.languages = {
          hasEvery: filters.languages,
        };
      }

      if (filters?.search) {
        where.OR = [
          { title: { contains: filters.search, mode: 'insensitive' } },
          { description: { contains: filters.search, mode: 'insensitive' } },
        ];
      }

      const challenges = await this.prisma.challenge.findMany({
        where,
        take: filters?.limit || 20,
        skip: filters?.offset || 0,
        orderBy: [
          { difficulty: 'asc' },
          { createdAt: 'desc' },
        ],
      });

      const processingTime = Date.now() - startTime;
      
      logger.info({
        operation: 'find_all_challenges_success',
        challengesFound: challenges.length,
        filters: {
          difficulty: filters?.difficulty,
          category: filters?.category,
          languagesCount: filters?.languages?.length,
          searchQuery: filters?.search,
          limit: filters?.limit || 20,
          offset: filters?.offset || 0
        },
        difficulties: challenges.reduce((acc, c) => {
          acc[c.difficulty] = (acc[c.difficulty] || 0) + 1;
          return acc;
        }, {} as Record<string, number>),
        categories: challenges.reduce((acc, c) => {
          acc[c.category] = (acc[c.category] || 0) + 1;
          return acc;
        }, {} as Record<string, number>),
        processingTime
      }, 'Challenges found successfully');

      return challenges;
      
    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      logger.error({
        operation: 'find_all_challenges_failed',
        filters,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        processingTime
      }, 'Failed to find challenges');
      
      throw error;
    }
  }

  async update(id: string, data: Partial<CreateChallengeDTO>): Promise<Challenge> {
    const startTime = Date.now();
    
    logger.info({
      operation: 'update_challenge',
      challengeId: id,
      fieldsToUpdate: Object.keys(data),
      hasSlugChange: !!data.slug,
      hasTestCasesChange: !!data.testCases,
      hasTrapsChange: !!data.traps,
      hasHintsChange: !!data.hints
    }, 'Updating challenge');

    try {
      const updateData: any = { ...data };

      if (data.testCases) {
        updateData.testCases = JSON.stringify(data.testCases);
        logger.debug({
          challengeId: id,
          testCasesCount: data.testCases.length
        }, 'Updated test cases data');
      }
      
      if (data.hints) {
        updateData.hints = JSON.stringify(data.hints);
        logger.debug({
          challengeId: id,
          hintsCount: data.hints.length
        }, 'Updated hints data');
      }
      
      if (data.traps) {
        updateData.traps = JSON.stringify(data.traps);
        logger.debug({
          challengeId: id,
          trapsCount: data.traps.length
        }, 'Updated traps data');
      }
      
      if (data.targetMetrics) {
        updateData.targetMetrics = JSON.stringify(data.targetMetrics);
        logger.debug({
          challengeId: id,
          targetMetrics: data.targetMetrics
        }, 'Updated target metrics');
      }

      const challenge = await this.prisma.challenge.update({
        where: { id },
        data: {
          ...updateData,
          updatedAt: new Date(),
        },
      });

      const processingTime = Date.now() - startTime;
      
      logger.info({
        operation: 'update_challenge_success',
        challengeId: id,
        slug: challenge.slug,
        title: challenge.title,
        difficulty: challenge.difficulty,
        category: challenge.category,
        fieldsUpdated: Object.keys(data),
        processingTime
      }, 'Challenge updated successfully');

      return challenge;
      
    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      logger.error({
        operation: 'update_challenge_failed',
        challengeId: id,
        fieldsToUpdate: Object.keys(data),
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        processingTime
      }, 'Failed to update challenge');
      
      throw error;
    }
  }

  async delete(id: string): Promise<void> {
    const startTime = Date.now();
    
    logger.warn({
      operation: 'delete_challenge',
      challengeId: id
    }, 'Deleting challenge');

    try {
      const challenge = await this.prisma.challenge.findUnique({
        where: { id },
        select: { slug: true, title: true, difficulty: true, category: true }
      });

      await this.prisma.challenge.delete({
        where: { id },
      });

      const processingTime = Date.now() - startTime;
      
      logger.warn({
        operation: 'delete_challenge_success',
        challengeId: id,
        deletedChallenge: challenge,
        processingTime
      }, 'Challenge deleted successfully');
      
    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      logger.error({
        operation: 'delete_challenge_failed',
        challengeId: id,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        processingTime
      }, 'Failed to delete challenge');
      
      throw error;
    }
  }

  async getUserAttempts(userId: string, challengeId: string): Promise<ChallengeAttempt[]> {
    const startTime = Date.now();
    
    logger.debug({
      operation: 'get_user_attempts',
      userId,
      challengeId
    }, 'Getting user attempts for challenge');

    try {
      const attempts = await this.prisma.challengeAttempt.findMany({
        where: {
          userId,
          challengeId,
        },
        orderBy: {
          startedAt: 'desc',
        },
      });

      const processingTime = Date.now() - startTime;
      
      logger.info({
        operation: 'get_user_attempts_success',
        userId,
        challengeId,
        attemptsFound: attempts.length,
        statusBreakdown: attempts.reduce((acc, a) => {
          acc[a.status] = (acc[a.status] || 0) + 1;
          return acc;
        }, {} as Record<string, number>),
        passedAttempts: attempts.filter(a => a.passed).length,
        processingTime
      }, 'User attempts retrieved successfully');

      return attempts;
      
    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      logger.error({
        operation: 'get_user_attempts_failed',
        userId,
        challengeId,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        processingTime
      }, 'Failed to get user attempts');
      
      throw error;
    }
  }

  async createAttempt(data: CreateAttemptData): Promise<ChallengeAttempt> {
    const startTime = Date.now();
    
    logger.info({
      operation: 'create_attempt',
      userId: data.userId,
      challengeId: data.challengeId,
      sessionId: data.sessionId,
      language: data.language
    }, 'Creating challenge attempt');

    try {
      // Validação de existência do usuário
      const user = await this.prisma.user.findUnique({
        where: { id: data.userId }
      });

      if (!user) {
        throw new Error(`User not found: ${data.userId}`);
      }

      const previousAttempts = await this.getUserAttempts(data.userId, data.challengeId);
      const attemptNumber = previousAttempts.length + 1;

      const attempt = await this.prisma.challengeAttempt.create({
        data: {
          ...data,
          attemptNumber,
          codeSnapshots: [],
          testResults: [],
        },
      });

      const processingTime = Date.now() - startTime;
      
      logger.info({
        operation: 'create_attempt_success',
        attemptId: attempt.id,
        userId: data.userId,
        challengeId: data.challengeId,
        sessionId: data.sessionId,
        language: data.language,
        attemptNumber,
        previousAttempts: previousAttempts.length,
        processingTime
      }, 'Challenge attempt created successfully');

      return attempt;
      
    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      logger.error({
        operation: 'create_attempt_failed',
        userId: data.userId,
        challengeId: data.challengeId,
        sessionId: data.sessionId,
        language: data.language,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        processingTime
      }, 'Failed to create challenge attempt');
      
      throw error;
    }
  }

  async updateAttempt(id: string, data: Partial<ChallengeAttempt>): Promise<ChallengeAttempt> {
    const startTime = Date.now();
    
    logger.info({
      operation: 'update_attempt',
      attemptId: id,
      fieldsToUpdate: Object.keys(data),
      hasCodeSnapshots: !!data.codeSnapshots,
      hasTestResults: !!data.testResults,
      hasScore: data.score !== undefined,
      passed: data.passed
    }, 'Updating challenge attempt');

    try {
      const { id: _, userId: __, challengeId: ___, ...updateData } = data;

      const preparedData: any = {
        ...updateData,
        lastActivity: new Date(),
      };
      
      if (updateData.codeSnapshots !== undefined) {
        preparedData.codeSnapshots = updateData.codeSnapshots || [];
        logger.debug({
          attemptId: id,
          snapshotsCount: Array.isArray(updateData.codeSnapshots) ? updateData.codeSnapshots.length : 0
        }, 'Updated code snapshots');
      }

      if (updateData.testResults !== undefined) {
        preparedData.testResults = updateData.testResults || [];
        logger.debug({
          attemptId: id,
          testResultsCount: Array.isArray(updateData.testResults) ? updateData.testResults.length : 0
        }, 'Updated test results');
      }

      const attempt = await this.prisma.challengeAttempt.update({
        where: { id },
        data: preparedData,
      });

      const processingTime = Date.now() - startTime;
      
      logger.info({
        operation: 'update_attempt_success',
        attemptId: id,
        userId: attempt.userId,
        challengeId: attempt.challengeId,
        status: attempt.status,
        score: attempt.score,
        passed: attempt.passed,
        duration: attempt.duration,
        fieldsUpdated: Object.keys(data),
        processingTime
      }, 'Challenge attempt updated successfully');

      if (attempt.status === 'COMPLETED') {
        logger.info({
          attemptId: id,
          userId: attempt.userId,
          challengeId: attempt.challengeId,
          score: attempt.score,
          passed: attempt.passed,
          duration: attempt.duration,
          attemptCompleted: true
        }, 'CHALLENGE ATTEMPT COMPLETED');
      }

      return attempt;
      
    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      logger.error({
        operation: 'update_attempt_failed',
        attemptId: id,
        fieldsToUpdate: Object.keys(data),
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        processingTime
      }, 'Failed to update challenge attempt');
      
      throw error;
    }
  }
}