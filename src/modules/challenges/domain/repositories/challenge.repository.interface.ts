import { Challenge, ChallengeAttempt } from '@prisma/client';
import { CreateChallengeDTO } from '../schemas/challenge.schema';

export interface IChallengeRepository {
  create(data: CreateChallengeDTO): Promise<Challenge>;
  findById(id: string): Promise<Challenge | null>;
  findBySlug(slug: string): Promise<Challenge | null>;
  findAll(filters?: ChallengeFilters): Promise<Challenge[]>;
  update(id: string, data: Partial<CreateChallengeDTO>): Promise<Challenge>;
  delete(id: string): Promise<void>;
  getUserAttempts(userId: string, challengeId: string): Promise<ChallengeAttempt[]>;
  createAttempt(data: CreateAttemptData): Promise<ChallengeAttempt>;
  updateAttempt(id: string, data: Partial<ChallengeAttempt>): Promise<ChallengeAttempt>;
}

export interface ChallengeFilters {
  difficulty?: string;
  category?: string;
  languages?: string[];
  search?: string;
  limit?: number;
  offset?: number;
}

export interface CreateAttemptData {
  userId: string;
  challengeId: string;
  sessionId: string;
  language: string;
  attemptNumber?: number;
}