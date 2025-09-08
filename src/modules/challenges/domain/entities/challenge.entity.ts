import { Challenge as PrismaChallenge } from '@prisma/client';
import { CreateChallengeDTO } from '../schemas/challenge.schema';
import { Trap as TrapType, validateTrap } from '../types/challenge.types';
import { logger } from '@/shared/infrastructure/monitoring/logger';

interface TestCase {
  id: string;
  input: string;
  expectedOutput: string;
  weight: number;
  description?: string;
}

export class ChallengeEntity {
  private constructor(private readonly props: PrismaChallenge) { }

  static create(data: CreateChallengeDTO): ChallengeEntity {
    const startTime = Date.now();
    
    logger.info({
      operation: 'challenge_entity_creation',
      slug: data.slug,
      title: data.title,
      difficulty: data.difficulty,
      category: data.category,
      estimatedMinutes: data.estimatedMinutes,
      languages: data.languages,
      testCasesCount: data.testCases.length,
      hintsCount: data.hints.length,
      trapsCount: data.traps.length,
      baseXp: data.baseXp,
      bonusXp: data.bonusXp,
      instructionsLength: data.instructions.length,
      solutionLength: data.solution.length,
      hasStarterCode: !!data.starterCode
    }, 'Creating challenge entity');

    try {
      const props = {
        id: crypto.randomUUID(),
        ...data,
        testCases: JSON.stringify(data.testCases),
        hints: JSON.stringify(data.hints),
        traps: JSON.stringify(data.traps),
        targetMetrics: JSON.stringify(data.targetMetrics),
        createdAt: new Date(),
        updatedAt: new Date(),
      } as PrismaChallenge;

      const processingTime = Date.now() - startTime;
      
      logger.info({
        operation: 'challenge_entity_creation_success',
        challengeId: props.id,
        slug: data.slug,
        title: data.title,
        difficulty: data.difficulty,
        category: data.category,
        estimatedMinutes: data.estimatedMinutes,
        languages: data.languages,
        baseXp: data.baseXp,
        bonusXp: data.bonusXp,
        targetMetrics: data.targetMetrics,
        processingTime
      }, 'Challenge entity created successfully');

      return new ChallengeEntity(props);
    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      logger.error({
        operation: 'challenge_entity_creation_failed',
        slug: data.slug,
        title: data.title,
        difficulty: data.difficulty,
        category: data.category,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        processingTime
      }, 'Failed to create challenge entity');
      
      throw error;
    }
  }

  static fromPrisma(challenge: PrismaChallenge): ChallengeEntity {
    logger.debug({
      operation: 'challenge_entity_from_prisma',
      challengeId: challenge.id,
      slug: challenge.slug,
      title: challenge.title,
      difficulty: challenge.difficulty,
      category: challenge.category,
      estimatedMinutes: challenge.estimatedMinutes,
      languages: challenge.languages,
      baseXp: challenge.baseXp,
      bonusXp: challenge.bonusXp,
      createdAt: challenge.createdAt,
      updatedAt: challenge.updatedAt
    }, 'Creating challenge entity from Prisma model');

    try {
      const entity = new ChallengeEntity(challenge);
      
      logger.debug({
        challengeId: challenge.id,
        slug: challenge.slug,
        hasTestCases: !!challenge.testCases,
        hasHints: !!challenge.hints,
        hasTraps: !!challenge.traps,
        hasTargetMetrics: !!challenge.targetMetrics
      }, 'Challenge entity created from Prisma successfully');
      
      return entity;
    } catch (error) {
      logger.error({
        operation: 'challenge_entity_from_prisma_failed',
        challengeId: challenge.id,
        slug: challenge.slug,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      }, 'Failed to create challenge entity from Prisma model');
      
      throw error;
    }
  }

  getTraps(): TrapType[] {
    logger.debug({
      operation: 'get_traps',
      challengeId: this.props.id,
      slug: this.props.slug
    }, 'Parsing challenge traps');

    try {
      const trapsData = JSON.parse(this.props.traps as string) as any[];
      const traps = trapsData.map((trap: any) => validateTrap(trap));
      
      logger.info({
        challengeId: this.props.id,
        slug: this.props.slug,
        trapsCount: traps.length,
        trapTypes: traps.map((t: TrapType) => t.type),
        severities: traps.map((t: TrapType) => t.severity)
      }, 'Challenge traps parsed successfully');
      
      return traps;
    } catch (error) {
      logger.error({
        operation: 'get_traps_failed',
        challengeId: this.props.id,
        slug: this.props.slug,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        rawTraps: this.props.traps
      }, 'Failed to parse challenge traps');
      
      throw error;
    }
  }

  getTestCases(): TestCase[] {
    logger.debug({
      operation: 'get_test_cases',
      challengeId: this.props.id,
      slug: this.props.slug
    }, 'Parsing challenge test cases');

    try {
      const testCases = JSON.parse(this.props.testCases as string);
      
      logger.info({
        challengeId: this.props.id,
        slug: this.props.slug,
        testCasesCount: testCases.length,
        totalWeight: testCases.reduce((sum: number, tc: TestCase) => sum + tc.weight, 0)
      }, 'Challenge test cases parsed successfully');
      
      return testCases;
    } catch (error) {
      logger.error({
        operation: 'get_test_cases_failed',
        challengeId: this.props.id,
        slug: this.props.slug,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        rawTestCases: this.props.testCases
      }, 'Failed to parse challenge test cases');
      
      throw error;
    }
  }

  calculateScore(metrics: { di: number; pr: number; cs: number }): number {
    logger.debug({
      operation: 'calculate_score',
      challengeId: this.props.id,
      slug: this.props.slug,
      metrics
    }, 'Calculating challenge score');

    try {
      const target = JSON.parse(this.props.targetMetrics as string);
      
      logger.debug({
        challengeId: this.props.id,
        targetMetrics: target,
        inputMetrics: metrics
      }, 'Using target metrics for score calculation');

      let score = 0;

      // Dependency Index component (lower is better)
      if (metrics.di <= target.maxDI) {
        score += 33.33;
      } else {
        score += Math.max(0, 33.33 * (100 - metrics.di) / (100 - target.maxDI));
      }

      // Pass Rate component (higher is better)
      if (metrics.pr >= target.minPR) {
        score += 33.33;
      } else {
        score += 33.33 * (metrics.pr / target.minPR);
      }

      // Checklist Score component (higher is better)
      if (metrics.cs >= target.minCS) {
        score += 33.34;
      } else {
        score += 33.34 * (metrics.cs / target.minCS);
      }

      const finalScore = Math.round(score);
      
      logger.info({
        challengeId: this.props.id,
        slug: this.props.slug,
        inputMetrics: metrics,
        targetMetrics: target,
        scoreComponents: {
          diScore: metrics.di <= target.maxDI ? 33.33 : Math.max(0, 33.33 * (100 - metrics.di) / (100 - target.maxDI)),
          prScore: metrics.pr >= target.minPR ? 33.33 : 33.33 * (metrics.pr / target.minPR),
          csScore: metrics.cs >= target.minCS ? 33.34 : 33.34 * (metrics.cs / target.minCS)
        },
        finalScore
      }, 'Challenge score calculated');

      return finalScore;
    } catch (error) {
      logger.error({
        operation: 'calculate_score_failed',
        challengeId: this.props.id,
        slug: this.props.slug,
        metrics,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      }, 'Failed to calculate challenge score');
      
      throw error;
    }
  }

  isUnlocked(userLevel: number): boolean {
    const requiredLevels = {
      EASY: 1,
      MEDIUM: 3,
      HARD: 5,
      EXPERT: 8,
    };

    const requiredLevel = requiredLevels[this.props.difficulty];
    const isUnlocked = userLevel >= requiredLevel;
    
    logger.debug({
      operation: 'check_unlock_status',
      challengeId: this.props.id,
      slug: this.props.slug,
      difficulty: this.props.difficulty,
      userLevel,
      requiredLevel,
      isUnlocked
    }, 'Checking if challenge is unlocked for user');

    if (!isUnlocked) {
      logger.info({
        challengeId: this.props.id,
        slug: this.props.slug,
        difficulty: this.props.difficulty,
        userLevel,
        requiredLevel,
        locked: true
      }, 'Challenge is locked for user level');
    }

    return isUnlocked;
  }

  toPrisma(): PrismaChallenge {
    logger.debug({
      operation: 'challenge_to_prisma',
      challengeId: this.props.id,
      slug: this.props.slug,
      difficulty: this.props.difficulty,
      category: this.props.category
    }, 'Converting challenge entity to Prisma model');

    return this.props;
  }

  toJSON() {
    logger.debug({
      operation: 'challenge_to_json',
      challengeId: this.props.id,
      slug: this.props.slug,
      difficulty: this.props.difficulty,
      category: this.props.category
    }, 'Converting challenge entity to JSON');

    try {
      const jsonData = {
        ...this.props,
        testCases: JSON.parse(this.props.testCases as string),
        hints: JSON.parse(this.props.hints as string),
        traps: JSON.parse(this.props.traps as string),
        targetMetrics: JSON.parse(this.props.targetMetrics as string),
      };

      logger.debug({
        challengeId: this.props.id,
        slug: this.props.slug,
        testCasesCount: jsonData.testCases.length,
        hintsCount: jsonData.hints.length,
        trapsCount: jsonData.traps.length,
        hasTargetMetrics: !!jsonData.targetMetrics
      }, 'Challenge entity converted to JSON successfully');

      return jsonData;
    } catch (error) {
      logger.error({
        operation: 'challenge_to_json_failed',
        challengeId: this.props.id,
        slug: this.props.slug,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      }, 'Failed to convert challenge entity to JSON');
      
      throw error;
    }
  }
}