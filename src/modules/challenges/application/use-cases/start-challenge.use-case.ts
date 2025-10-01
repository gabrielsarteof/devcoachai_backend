import { IChallengeRepository } from '../../domain/repositories/challenge.repository.interface';
import { logger } from '@/shared/infrastructure/monitoring/logger';
import { ChallengeNotFoundError, LanguageNotSupportedError } from '../../domain/errors';

export class StartChallengeUseCase {
  constructor(private readonly repository: IChallengeRepository) {}

  async execute(userId: string, challengeId: string, language: string) {
    const startTime = Date.now();
    
    logger.info({
      operation: 'challenge_start_attempt',
      userId,
      challengeId,
      language
    }, 'Challenge start attempt initiated');

    try {
      const challenge = await this.repository.findById(challengeId);
      if (!challenge) {
        logger.warn({
          userId,
          challengeId,
          reason: 'challenge_not_found',
          executionTime: Date.now() - startTime
        }, 'Challenge start failed - challenge not found');
        throw new ChallengeNotFoundError();
      }

      if (!challenge.languages.includes(language)) {
        logger.warn({
          userId,
          challengeId,
          language,
          supportedLanguages: challenge.languages,
          reason: 'language_not_supported',
          executionTime: Date.now() - startTime
        }, 'Challenge start failed - language not supported');
        throw new LanguageNotSupportedError(language);
      }

      const attempts = await this.repository.getUserAttempts(userId, challengeId);
      const activeAttempt = attempts.find(a => a.status === 'IN_PROGRESS');

      if (activeAttempt) {
        logger.info({
          userId,
          challengeId,
          attemptId: activeAttempt.id,
          sessionId: activeAttempt.sessionId,
          attemptNumber: activeAttempt.attemptNumber,
          resumed: true,
          executionTime: Date.now() - startTime
        }, 'Challenge resumed - existing active attempt found');

        return {
          attemptId: activeAttempt.id,
          sessionId: activeAttempt.sessionId,
          resumed: true,
        };
      }

      const sessionId = crypto.randomUUID();
      const attempt = await this.repository.createAttempt({
        userId,
        challengeId,
        sessionId,
        language,
      });

      logger.info({
        userId,
        challengeId,
        attemptId: attempt.id,
        sessionId,
        language,
        attemptNumber: attempt.attemptNumber,
        difficulty: challenge.difficulty,
        category: challenge.category,
        estimatedMinutes: challenge.estimatedMinutes,
        executionTime: Date.now() - startTime
      }, 'Challenge started successfully');

      return {
        attemptId: attempt.id,
        sessionId,
        resumed: false,
        starterCode: challenge.starterCode || '',
        estimatedMinutes: challenge.estimatedMinutes,
      };
    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : 'Unknown error',
        userId,
        challengeId,
        language,
        executionTime: Date.now() - startTime
      }, 'Challenge start use case failed');
      throw error;
    }
  }
}