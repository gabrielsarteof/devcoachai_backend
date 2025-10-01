import { IChallengeRepository } from '../../domain/repositories/challenge.repository.interface';
import { Judge0Service } from '../../infrastructure/services/judge0.service';
import { ChallengeEntity } from '../../domain/entities/challenge.entity';
import { PrismaClient } from '@prisma/client';
import { logger } from '@/shared/infrastructure/monitoring/logger';
import { z } from 'zod';
import {
  ChallengeNotFoundError,
  InvalidAttemptError,
  AttemptAlreadyCompletedError,
  LanguageNotSupportedError
} from '../../domain/errors';

export const SubmitSolutionSchema = z.object({
  challengeId: z.string().cuid(),
  attemptId: z.string().cuid(),
  code: z.string().min(1),
  language: z.string(),
});

export type SubmitSolutionDTO = z.infer<typeof SubmitSolutionSchema>;

export class SubmitSolutionUseCase {
  constructor(
    private readonly repository: IChallengeRepository,
    private readonly judge0: Judge0Service,
    private readonly prisma: PrismaClient
  ) {}

  async execute(userId: string, data: SubmitSolutionDTO) {
    const startTime = Date.now();
    
    logger.info({
      operation: 'solution_submission',
      userId,
      challengeId: data.challengeId,
      attemptId: data.attemptId,
      language: data.language,
      codeLength: data.code.length
    }, 'Solution submission started');

    try {
      const challenge = await this.repository.findById(data.challengeId);
      if (!challenge) {
        logger.warn({
          userId,
          challengeId: data.challengeId,
          reason: 'challenge_not_found',
          executionTime: Date.now() - startTime
        }, 'Solution submission failed - challenge not found');
        throw new ChallengeNotFoundError();
      }

      const attempt = await this.prisma.challengeAttempt.findUnique({
        where: { id: data.attemptId },
      });

      if (!attempt || attempt.userId !== userId) {
        logger.warn({
          userId,
          attemptId: data.attemptId,
          reason: 'invalid_attempt_or_unauthorized',
          executionTime: Date.now() - startTime
        }, 'Solution submission failed - invalid attempt');
        throw new InvalidAttemptError();
      }

      if (attempt.status === 'COMPLETED') {
        logger.warn({
          userId,
          attemptId: data.attemptId,
          currentStatus: attempt.status,
          reason: 'attempt_already_completed',
          executionTime: Date.now() - startTime
        }, 'Solution submission failed - attempt already completed');
        throw new AttemptAlreadyCompletedError();
      }

      if (!challenge.languages.includes(data.language)) {
        logger.warn({
          userId,
          challengeId: data.challengeId,
          language: data.language,
          supportedLanguages: challenge.languages,
          reason: 'language_not_supported',
          executionTime: Date.now() - startTime
        }, 'Solution submission failed - language not supported');
        throw new LanguageNotSupportedError(data.language);
      }

      const entity = ChallengeEntity.fromPrisma(challenge);
      const testCases = entity.getTestCases();

      logger.info({
        userId,
        attemptId: data.attemptId,
        testCasesCount: testCases.length,
        operation: 'executing_solution'
      }, 'Executing solution against test cases');
      
      const results = await this.judge0.executeCode(
        data.code,
        data.language,
        testCases.map(tc => ({
          input: tc.input,
          expectedOutput: tc.expectedOutput,
        })),
        challenge.estimatedMinutes > 60 ? 5 : 2
      );

      const testResults = testCases.map((tc, index) => {
        const result = results[index];
        const passed = result.status.id === 3 && 
                      result.stdout?.trim() === tc.expectedOutput.trim();

        return {
          testId: tc.id,
          passed,
          output: result.stdout || result.stderr || result.compile_output || 'No output',
          time: parseFloat(result.time),
          memory: result.memory,
          status: result.status.description,
        };
      });

      const totalWeight = testCases.reduce((sum, tc) => sum + tc.weight, 0);
      const passedWeight = testCases
        .filter((_, i) => testResults[i].passed)
        .reduce((sum, tc) => sum + tc.weight, 0);
      
      const score = Math.round((passedWeight / totalWeight) * 100);
      const passed = score >= 60;

      const updatedAttempt = await this.repository.updateAttempt(data.attemptId, {
        finalCode: data.code,
        testResults,
        score,
        passed,
        status: 'COMPLETED',
        completedAt: new Date(),
        duration: Math.floor((Date.now() - attempt.startedAt.getTime()) / 1000),
      });

      const executionTime = Date.now() - startTime;

      if (passed) {
        const xpAmount = challenge.baseXp + (score >= 90 ? challenge.bonusXp : 0);
        
        await this.prisma.xPTransaction.create({
          data: {
            userId,
            amount: xpAmount,
            reason: `Completed challenge: ${challenge.title}`,
            source: 'CHALLENGE',
            sourceId: challenge.id,
            balanceBefore: 0,
            balanceAfter: xpAmount,
          },
        });

        await this.prisma.user.update({
          where: { id: userId },
          data: {
            totalXp: { increment: xpAmount },
          },
        });

        logger.info({
          userId,
          challengeId: challenge.id,
          attemptId: data.attemptId,
          score,
          xpEarned: xpAmount,
          testsPassed: testResults.filter(t => t.passed).length,
          testsTotal: testResults.length,
          difficulty: challenge.difficulty,
          category: challenge.category,
          executionTime
        }, 'Solution submission successful - challenge completed');
      } else {
        logger.info({
          userId,
          challengeId: challenge.id,
          attemptId: data.attemptId,
          score,
          testsPassed: testResults.filter(t => t.passed).length,
          testsTotal: testResults.length,
          difficulty: challenge.difficulty,
          category: challenge.category,
          executionTime
        }, 'Solution submission completed - challenge not passed');
      }

      return {
        attemptId: updatedAttempt.id,
        passed,
        score,
        testResults,
        xpEarned: passed ? challenge.baseXp : 0,
        feedback: this.generateFeedback(score, testResults),
      };
    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : 'Unknown error',
        userId,
        challengeId: data.challengeId,
        attemptId: data.attemptId,
        language: data.language,
        executionTime: Date.now() - startTime
      }, 'Solution submission use case failed');
      throw error;
    }
  }

  private generateFeedback(score: number, testResults: any[]): string {
    const passedCount = testResults.filter(t => t.passed).length;
    const totalCount = testResults.length;

    if (score === 100) {
      return 'Perfect! All test cases passed. Excellent work!';
    } else if (score >= 80) {
      return `Great job! ${passedCount}/${totalCount} tests passed. Minor improvements needed.`;
    } else if (score >= 60) {
      return `Good effort! ${passedCount}/${totalCount} tests passed. Review the failed cases.`;
    } else {
      return `Keep trying! ${passedCount}/${totalCount} tests passed. Review your approach.`;
    }
  }
}