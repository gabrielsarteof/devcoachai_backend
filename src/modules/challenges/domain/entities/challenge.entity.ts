import { Challenge as PrismaChallenge } from '@prisma/client';
import { CreateChallengeDTO } from '../schemas/challenge.schema';

interface TestCase {
  id: string;
  input: string;
  expectedOutput: string;
  weight: number;
  description?: string;
}

interface Trap {
  id: string;
  type: string;
  buggedCode: string;
  correctCode: string;
  explanation: string;
  detectionPattern: string;
  severity: string;
}

export class ChallengeEntity {
  private constructor(private readonly props: PrismaChallenge) { }

  static create(data: CreateChallengeDTO): ChallengeEntity {
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

    return new ChallengeEntity(props);
  }

  static fromPrisma(challenge: PrismaChallenge): ChallengeEntity {
    return new ChallengeEntity(challenge);
  }

  getTraps(): Trap[] {
    return JSON.parse(this.props.traps as string);
  }

  getTestCases(): TestCase[] {
    return JSON.parse(this.props.testCases as string);
  }

  calculateScore(metrics: { di: number; pr: number; cs: number }): number {
    const target = JSON.parse(this.props.targetMetrics as string);

    let score = 0;

    // DI Score (lower is better)
    if (metrics.di <= target.maxDI) {
      score += 33.33;
    } else {
      score += Math.max(0, 33.33 * (100 - metrics.di) / (100 - target.maxDI));
    }

    // PR Score (higher is better)
    if (metrics.pr >= target.minPR) {
      score += 33.33;
    } else {
      score += 33.33 * (metrics.pr / target.minPR);
    }

    // CS Score (higher is better)
    if (metrics.cs >= target.minCS) {
      score += 33.34;
    } else {
      score += 33.34 * (metrics.cs / target.minCS);
    }

    return Math.round(score);
  }

  isUnlocked(userLevel: number): boolean {
    const requiredLevels = {
      EASY: 1,
      MEDIUM: 3,
      HARD: 5,
      EXPERT: 8,
    };

    return userLevel >= requiredLevels[this.props.difficulty];
  }

  toPrisma(): PrismaChallenge {
    return this.props;
  }

  toJSON() {
    return {
      ...this.props,
      testCases: JSON.parse(this.props.testCases as string),
      hints: JSON.parse(this.props.hints as string),
      traps: JSON.parse(this.props.traps as string),
      targetMetrics: JSON.parse(this.props.targetMetrics as string),
    };
  }
}