import { IChallengeRepository } from '../../domain/repositories/challenge.repository.interface';
import { messages } from '@/shared/constants/messages';
import { logger } from '@/shared/infrastructure/monitoring/logger';

export class StartChallengeUseCase {
  constructor(private readonly repository: IChallengeRepository) {}

  async execute(userId: string, challengeId: string, language: string) {
    try {
      const challenge = await this.repository.findById(challengeId);
      if (!challenge) {
        throw new Error(messages.challenge.notFound);
      }

      if (!challenge.languages.includes(language)) {
        throw new Error(`Language ${language} not supported for this challenge`);
      }

      const attempts = await this.repository.getUserAttempts(userId, challengeId);
      const activeAttempt = attempts.find(a => a.status === 'IN_PROGRESS');

      if (activeAttempt) {
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

      logger.info({ userId, challengeId, attemptId: attempt.id }, 'Challenge started');

      return {
        attemptId: attempt.id,
        sessionId,
        resumed: false,
        starterCode: challenge.starterCode || '',
        estimatedMinutes: challenge.estimatedMinutes,
      };
    } catch (error) {
      logger.error({ error, userId, challengeId }, 'Failed to start challenge');
      throw error;
    }
  }
}