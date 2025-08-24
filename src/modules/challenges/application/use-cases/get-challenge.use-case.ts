import { IChallengeRepository } from '../../domain/repositories/challenge.repository.interface';
import { ChallengeEntity } from '../../domain/entities/challenge.entity';
import { messages } from '@/shared/constants/messages';
import type { ChallengeAttempt } from '@prisma/client';

interface AttemptSummary {
  id: string;
  attemptNumber: number;
  status: string;
  score: number;
  passed: boolean;
  startedAt: Date;
  completedAt: Date | null;
  duration: number | null;
}

export class GetChallengeUseCase {
  constructor(private readonly repository: IChallengeRepository) {}

  async execute(slugOrId: string, userId?: string) {
    const challenge = await this.repository.findBySlug(slugOrId) ||
                     await this.repository.findById(slugOrId);

    if (!challenge) {
      throw new Error(messages.challenge.notFound);
    }

    const entity = ChallengeEntity.fromPrisma(challenge);
    
    let attemptSummaries: AttemptSummary[] = [];
    
    if (userId) {
      const attempts: ChallengeAttempt[] = await this.repository.getUserAttempts(userId, challenge.id);
      attemptSummaries = attempts.map(attempt => ({
        id: attempt.id,
        attemptNumber: attempt.attemptNumber,
        status: attempt.status,
        score: attempt.score,
        passed: attempt.passed,
        startedAt: attempt.startedAt,
        completedAt: attempt.completedAt,
        duration: attempt.duration,
      }));
    }

    return {
      challenge: entity.toJSON(),
      attempts: attemptSummaries,
    };
  }
}