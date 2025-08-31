import { IChallengeRepository } from '../../domain/repositories/challenge.repository.interface';
import { ChallengeEntity } from '../../domain/entities/challenge.entity';
import { messages } from '@/shared/constants/messages';
import { ChallengeAttempt } from '@prisma/client';

export class GetChallengeUseCase {
  constructor(private readonly repository: IChallengeRepository) {}

  async execute(slugOrId: string, userId?: string) {
    const challenge = await this.repository.findBySlug(slugOrId) ||
                     await this.repository.findById(slugOrId);

    if (!challenge) {
      throw new Error(messages.challenge.notFound);
    }

    const entity = ChallengeEntity.fromPrisma(challenge);
    
    let attempts: ChallengeAttempt[] = [];
    if (userId) {
      attempts = await this.repository.getUserAttempts(userId, challenge.id);
    }

    return {
      challenge: entity.toJSON(),
      attempts: attempts.map(a => ({
        id: a.id,
        attemptNumber: a.attemptNumber,
        status: a.status,
        score: a.score,
        passed: a.passed,
        startedAt: a.startedAt,
        completedAt: a.completedAt,
        duration: a.duration,
      })),
    };
  }
}