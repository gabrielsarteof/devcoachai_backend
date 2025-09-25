import { IChallengeRepository, ChallengeFilters } from '../../domain/repositories/challenge.repository.interface';
import { PrismaClient } from '@prisma/client';

export class ListChallengesUseCase {
  constructor(
    private readonly repository: IChallengeRepository,
    private readonly prisma: PrismaClient
  ) {}

  async execute(filters?: ChallengeFilters, userId?: string) {
    const challenges = await this.repository.findAll(filters);
    
    let completions: Record<string, boolean> = {};
    if (userId) {
      const attempts = await this.prisma.challengeAttempt.findMany({
        where: {
          userId,
          passed: true,
        },
        select: {
          challengeId: true,
        },
      });
      
      completions = attempts.reduce((acc, a) => {
        acc[a.challengeId] = true;
        return acc;
      }, {} as Record<string, boolean>);
    }

    return challenges.map(challenge => {
      const baseChallenge = {
        id: challenge.id,
        slug: challenge.slug,
        title: challenge.title,
        description: challenge.description,
        difficulty: challenge.difficulty,
        category: challenge.category,
        estimatedMinutes: challenge.estimatedMinutes,
        languages: challenge.languages,
        baseXp: challenge.baseXp,
      };

      // Only add 'completed' field if user is authenticated
      if (userId) {
        return {
          ...baseChallenge,
          completed: completions[challenge.id] || false,
        };
      }

      return baseChallenge;
    });
  }
}