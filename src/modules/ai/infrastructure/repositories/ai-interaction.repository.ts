import { PrismaClient, AIInteraction, Prisma } from '@prisma/client';
import { IAIInteractionRepository, AIUserStats, AIProviderStats } from '../../domain/repositories/ai-interaction.repository.interface';
import { AIProvider } from '../../domain/types/ai.types';
import { logger } from '@/shared/infrastructure/monitoring/logger';

export class AIInteractionRepository implements IAIInteractionRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(data: Omit<AIInteraction, 'id' | 'createdAt'>): Promise<AIInteraction> {
    const startTime = Date.now();
    
    try {
      logger.debug({
        userId: data.userId,
        attemptId: data.attemptId,
        provider: data.provider,
        model: data.model,
        inputTokens: data.inputTokens,
        outputTokens: data.outputTokens,
        estimatedCost: data.estimatedCost
      }, 'Creating AI interaction record');

      const interaction = await this.prisma.aIInteraction.create({
        data: {
          id: crypto.randomUUID(),
          userId: data.userId,
          attemptId: data.attemptId,
          challengeId: data.challengeId,
          provider: data.provider,
          model: data.model,
          messages: data.messages as Prisma.InputJsonValue,
          promptComplexity: data.promptComplexity,
          responseLength: data.responseLength,
          codeLinesGenerated: data.codeLinesGenerated,
          wasCopied: data.wasCopied,
          copyTimestamp: data.copyTimestamp,
          pasteTimestamp: data.pasteTimestamp,
          inputTokens: data.inputTokens,
          outputTokens: data.outputTokens,
          estimatedCost: data.estimatedCost,
          createdAt: new Date(),
        },
      });

      const processingTime = Date.now() - startTime;
      
      logger.info({
        interactionId: interaction.id,
        userId: data.userId,
        provider: data.provider,
        model: data.model,
        totalTokens: data.inputTokens + data.outputTokens,
        cost: data.estimatedCost,
        processingTime
      }, 'AI interaction record created successfully');

      return interaction;
    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      logger.error({
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        userId: data.userId,
        provider: data.provider,
        model: data.model,
        processingTime
      }, 'Failed to create AI interaction record');
      
      throw error;
    }
  }

  async findById(id: string): Promise<AIInteraction | null> {
    const startTime = Date.now();
    
    try {
      logger.debug({ interactionId: id }, 'Finding AI interaction by ID');
      
      const interaction = await this.prisma.aIInteraction.findUnique({
        where: { id },
      });

      const processingTime = Date.now() - startTime;
      
      if (interaction) {
        logger.debug({
          interactionId: id,
          found: true,
          processingTime
        }, 'AI interaction found');
      } else {
        logger.warn({
          interactionId: id,
          found: false,
          processingTime
        }, 'AI interaction not found');
      }

      return interaction;
    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      logger.error({
        error: error instanceof Error ? error.message : 'Unknown error',
        interactionId: id,
        processingTime
      }, 'Failed to find AI interaction by ID');
      
      throw error;
    }
  }

  async findByUserId(userId: string, limit: number = 100): Promise<AIInteraction[]> {
    const startTime = Date.now();
    
    try {
      logger.debug({
        userId,
        limit
      }, 'Finding AI interactions by user ID');

      const interactions = await this.prisma.aIInteraction.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: limit,
      });

      const processingTime = Date.now() - startTime;
      
      logger.info({
        userId,
        interactionsFound: interactions.length,
        limit,
        processingTime
      }, 'AI interactions found for user');

      return interactions;
    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      logger.error({
        error: error instanceof Error ? error.message : 'Unknown error',
        userId,
        limit,
        processingTime
      }, 'Failed to find AI interactions by user ID');
      
      throw error;
    }
  }

  async findByAttemptId(attemptId: string): Promise<AIInteraction[]> {
    const startTime = Date.now();
    
    try {
      logger.debug({ attemptId }, 'Finding AI interactions by attempt ID');

      const interactions = await this.prisma.aIInteraction.findMany({
        where: { attemptId },
        orderBy: { createdAt: 'asc' },
      });

      const processingTime = Date.now() - startTime;
      
      logger.info({
        attemptId,
        interactionsFound: interactions.length,
        processingTime
      }, 'AI interactions found for attempt');

      return interactions;
    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      logger.error({
        error: error instanceof Error ? error.message : 'Unknown error',
        attemptId,
        processingTime
      }, 'Failed to find AI interactions by attempt ID');
      
      throw error;
    }
  }

  async markAsCopied(id: string): Promise<void> {
    const startTime = Date.now();
    
    try {
      logger.debug({ interactionId: id }, 'Marking AI interaction as copied');

      await this.prisma.aIInteraction.update({
        where: { id },
        data: {
          wasCopied: true,
          copyTimestamp: new Date(),
        },
      });

      const processingTime = Date.now() - startTime;
      
      logger.info({
        interactionId: id,
        processingTime
      }, 'AI interaction marked as copied');
    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      logger.error({
        error: error instanceof Error ? error.message : 'Unknown error',
        interactionId: id,
        processingTime
      }, 'Failed to mark AI interaction as copied');
      
      throw error;
    }
  }

  async markAsPasted(id: string): Promise<void> {
    const startTime = Date.now();
    
    try {
      logger.debug({ interactionId: id }, 'Marking AI interaction as pasted');

      await this.prisma.aIInteraction.update({
        where: { id },
        data: {
          pasteTimestamp: new Date(),
        },
      });

      const processingTime = Date.now() - startTime;
      
      logger.info({
        interactionId: id,
        processingTime
      }, 'AI interaction marked as pasted');
    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      logger.error({
        error: error instanceof Error ? error.message : 'Unknown error',
        interactionId: id,
        processingTime
      }, 'Failed to mark AI interaction as pasted');
      
      throw error;
    }
  }

  async getUserStats(userId: string, startDate?: Date, endDate?: Date): Promise<AIUserStats> {
    const startTime = Date.now();
    
    try {
      logger.debug({
        userId,
        startDate,
        endDate
      }, 'Calculating user AI stats');

      const whereClause: Prisma.AIInteractionWhereInput = { 
        userId,
        ...(startDate || endDate ? {
          createdAt: {
            ...(startDate && { gte: startDate }),
            ...(endDate && { lte: endDate }),
          }
        } : {})
      };

      const interactions = await this.prisma.aIInteraction.findMany({
        where: whereClause,
        select: {
          provider: true,
          inputTokens: true,
          outputTokens: true,
          estimatedCost: true,
          wasCopied: true,
          codeLinesGenerated: true,
        },
      });

      const stats: AIUserStats = {
        totalInteractions: interactions.length,
        totalTokensUsed: 0,
        totalCost: 0,
        averageDependency: 0,
        byProvider: {},
        copyPasteRate: 0,
      };

      let copiedCount = 0;
      let totalCodeLines = 0;
      let copiedCodeLines = 0;

      for (const interaction of interactions) {
        const provider = interaction.provider.toLowerCase();
        const tokens = interaction.inputTokens + interaction.outputTokens;
        
        stats.totalTokensUsed += tokens;
        stats.totalCost += interaction.estimatedCost;
        
        if (interaction.wasCopied) {
          copiedCount++;
          copiedCodeLines += interaction.codeLinesGenerated;
        }
        totalCodeLines += interaction.codeLinesGenerated;

        if (!stats.byProvider[provider]) {
          stats.byProvider[provider] = {
            interactions: 0,
            tokens: 0,
            cost: 0,
          };
        }
        
        stats.byProvider[provider].interactions++;
        stats.byProvider[provider].tokens += tokens;
        stats.byProvider[provider].cost += interaction.estimatedCost;
      }

      stats.copyPasteRate = interactions.length > 0 ? (copiedCount / interactions.length) : 0;
      stats.averageDependency = totalCodeLines > 0 ? (copiedCodeLines / totalCodeLines) : 0;

      const processingTime = Date.now() - startTime;
      
      logger.info({
        userId,
        stats: {
          totalInteractions: stats.totalInteractions,
          totalTokensUsed: stats.totalTokensUsed,
          totalCost: stats.totalCost,
          averageDependency: stats.averageDependency,
          copyPasteRate: stats.copyPasteRate,
          providers: Object.keys(stats.byProvider)
        },
        dateRange: { startDate, endDate },
        processingTime
      }, 'User AI stats calculated');

      if (stats.averageDependency > 0.8) {
        logger.warn({
          userId,
          averageDependency: stats.averageDependency
        }, 'High AI dependency detected for user');
      }

      if (stats.copyPasteRate > 0.9) {
        logger.warn({
          userId,
          copyPasteRate: stats.copyPasteRate
        }, 'Very high copy-paste rate detected for user');
      }

      return stats;
    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      logger.error({
        error: error instanceof Error ? error.message : 'Unknown error',
        userId,
        startDate,
        endDate,
        processingTime
      }, 'Failed to calculate user AI stats');
      
      throw error;
    }
  }

  async getProviderStats(provider: AIProvider, startDate: Date, endDate: Date): Promise<AIProviderStats> {
    const startTime = Date.now();
    
    try {
      logger.debug({
        provider,
        startDate,
        endDate
      }, 'Calculating provider stats');

      const interactions = await this.prisma.aIInteraction.findMany({
        where: {
          provider: provider.toUpperCase() as any,
          createdAt: {
            gte: startDate,
            lte: endDate,
          },
        },
        select: {
          model: true,
          inputTokens: true,
          outputTokens: true,
          estimatedCost: true,
          createdAt: true,
        },
      });

      const stats: AIProviderStats = {
        totalRequests: interactions.length,
        totalTokens: 0,
        totalCost: 0,
        averageResponseTime: 0,
        errorRate: 0,
        byModel: {},
      };

      for (const interaction of interactions) {
        const tokens = interaction.inputTokens + interaction.outputTokens;
        
        stats.totalTokens += tokens;
        stats.totalCost += interaction.estimatedCost;

        if (!stats.byModel[interaction.model]) {
          stats.byModel[interaction.model] = {
            requests: 0,
            tokens: 0,
            cost: 0,
          };
        }
        
        stats.byModel[interaction.model].requests++;
        stats.byModel[interaction.model].tokens += tokens;
        stats.byModel[interaction.model].cost += interaction.estimatedCost;
      }

      const processingTime = Date.now() - startTime;
      
      logger.info({
        provider,
        stats: {
          totalRequests: stats.totalRequests,
          totalTokens: stats.totalTokens,
          totalCost: stats.totalCost,
          models: Object.keys(stats.byModel)
        },
        dateRange: { startDate, endDate },
        processingTime
      }, 'Provider stats calculated');

      return stats;
    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      logger.error({
        error: error instanceof Error ? error.message : 'Unknown error',
        provider,
        startDate,
        endDate,
        processingTime
      }, 'Failed to calculate provider stats');
      
      throw error;
    }
  }
}