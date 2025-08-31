import { PrismaClient, Challenge, ChallengeAttempt } from '@prisma/client';
import { IChallengeRepository, ChallengeFilters, CreateAttemptData } from '../../domain/repositories/challenge.repository.interface';
import { CreateChallengeDTO } from '../../domain/schemas/challenge.schema';
import { ChallengeEntity } from '../../domain/entities/challenge.entity';

export class ChallengeRepository implements IChallengeRepository {
  constructor(private readonly prisma: PrismaClient) { }

  async create(data: CreateChallengeDTO): Promise<Challenge> {
    const entity = ChallengeEntity.create(data);
    const prismaData = entity.toPrisma();

    return await this.prisma.challenge.create({
      data: {
        id: prismaData.id,
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
  }

  async findById(id: string): Promise<Challenge | null> {
    return await this.prisma.challenge.findUnique({
      where: { id },
    });
  }

  async findBySlug(slug: string): Promise<Challenge | null> {
    return await this.prisma.challenge.findUnique({
      where: { slug },
    });
  }

  async findAll(filters?: ChallengeFilters): Promise<Challenge[]> {
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

    return await this.prisma.challenge.findMany({
      where,
      take: filters?.limit || 20,
      skip: filters?.offset || 0,
      orderBy: [
        { difficulty: 'asc' },
        { createdAt: 'desc' },
      ],
    });
  }

  async update(id: string, data: Partial<CreateChallengeDTO>): Promise<Challenge> {
    const updateData: any = { ...data };

    if (data.testCases) {
      updateData.testCases = JSON.stringify(data.testCases);
    }
    if (data.hints) {
      updateData.hints = JSON.stringify(data.hints);
    }
    if (data.traps) {
      updateData.traps = JSON.stringify(data.traps);
    }
    if (data.targetMetrics) {
      updateData.targetMetrics = JSON.stringify(data.targetMetrics);
    }

    return await this.prisma.challenge.update({
      where: { id },
      data: {
        ...updateData,
        updatedAt: new Date(),
      },
    });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.challenge.delete({
      where: { id },
    });
  }

  async getUserAttempts(userId: string, challengeId: string): Promise<ChallengeAttempt[]> {
    return await this.prisma.challengeAttempt.findMany({
      where: {
        userId,
        challengeId,
      },
      orderBy: {
        startedAt: 'desc',
      },
    });
  }

  async createAttempt(data: CreateAttemptData): Promise<ChallengeAttempt> {
    const previousAttempts = await this.getUserAttempts(data.userId, data.challengeId);
    const attemptNumber = previousAttempts.length + 1;

    return await this.prisma.challengeAttempt.create({
      data: {
        ...data,
        attemptNumber,
        codeSnapshots: [],
        testResults: [],
      },
    });
  }

  async updateAttempt(id: string, data: Partial<ChallengeAttempt>): Promise<ChallengeAttempt> {
    const { id: _, userId: __, challengeId: ___, ...updateData } = data;

    const preparedData: any = {
      ...updateData,
      lastActivity: new Date(),
    };
    if (updateData.codeSnapshots !== undefined) {
      preparedData.codeSnapshots = updateData.codeSnapshots || [];
    }

    if (updateData.testResults !== undefined) {
      preparedData.testResults = updateData.testResults || [];
    }

    return await this.prisma.challengeAttempt.update({
      where: { id },
      data: preparedData,
    });
  }
}