import { PrismaClient, Challenge, ChallengeAttempt, Prisma } from '@prisma/client';
import { IChallengeRepository, ChallengeFilters, CreateAttemptData } from '../../domain/repositories/challenge.repository.interface';
import { CreateChallengeDTO } from '../../domain/schemas/challenge.schema';
import { ChallengeEntity } from '../../domain/entities/challenge.entity';

export class ChallengeRepository implements IChallengeRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(data: CreateChallengeDTO): Promise<Challenge> {
    const entity = ChallengeEntity.create(data);
    const prismaData = entity.toPrisma();
    
    const createData: Prisma.ChallengeCreateInput = {
      ...prismaData,
      testCases: prismaData.testCases as Prisma.InputJsonValue,
      hints: prismaData.hints as Prisma.InputJsonValue,
      traps: prismaData.traps as Prisma.InputJsonValue,
      targetMetrics: prismaData.targetMetrics as Prisma.InputJsonValue,
    };
    
    return await this.prisma.challenge.create({
      data: createData,
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
    const where: Prisma.ChallengeWhereInput = {};

    if (filters?.difficulty) {
      where.difficulty = filters.difficulty as any; 
    }

    if (filters?.category) {
      where.category = filters.category as any; 
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
    const updateData: Prisma.ChallengeUpdateInput = {
      ...data,
      updatedAt: new Date(),
    };
    
    if (data.testCases !== undefined) {
      updateData.testCases = data.testCases as Prisma.InputJsonValue;
    }
    if (data.hints !== undefined) {
      updateData.hints = data.hints as Prisma.InputJsonValue;
    }
    if (data.traps !== undefined) {
      updateData.traps = data.traps as Prisma.InputJsonValue;
    }
    if (data.targetMetrics !== undefined) {
      updateData.targetMetrics = data.targetMetrics as Prisma.InputJsonValue;
    }

    return await this.prisma.challenge.update({
      where: { id },
      data: updateData,
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

    const createData: Prisma.ChallengeAttemptUncheckedCreateInput = {
      ...data,
      attemptNumber,
      codeSnapshots: [],
      testResults: [],
    };

    return await this.prisma.challengeAttempt.create({
      data: createData,
    });
  }

  async updateAttempt(id: string, data: Partial<ChallengeAttempt>): Promise<ChallengeAttempt> {
    const { userId, challengeId, codeSnapshots, testResults, ...cleanData } = data;
    
    const updateData: Prisma.ChallengeAttemptUncheckedUpdateInput = {
      ...cleanData,
      lastActivity: new Date(),
    };

    if (userId !== undefined) {
      updateData.userId = userId;
    }
    if (challengeId !== undefined) {
      updateData.challengeId = challengeId;
    }

    if (codeSnapshots !== undefined) {
      updateData.codeSnapshots = codeSnapshots as Prisma.InputJsonValue;
    }
    if (testResults !== undefined) {
      updateData.testResults = testResults as Prisma.InputJsonValue;
    }

    return await this.prisma.challengeAttempt.update({
      where: { id },
      data: updateData,
    });
  }
}