import { CreateAIInteractionDTO } from '../../domain/schemas/ai-interaction.schema';
import { ProviderFactoryService } from '../../infrastructure/services/provider-factory.service';
import { RateLimiterService } from '../../infrastructure/services/rate-limiter.service';
import { UsageTrackerService } from '../../infrastructure/services/usage-tracker.service';
import { PrismaClient } from '@prisma/client';
import { logger } from '@/shared/infrastructure/monitoring/logger';

export class ChatWithAIUseCase {
  constructor(
    private readonly providerFactory: ProviderFactoryService,
    private readonly rateLimiter: RateLimiterService,
    private readonly usageTracker: UsageTrackerService,
    private readonly prisma: PrismaClient
  ) {}

  async execute(userId: string, data: CreateAIInteractionDTO) {
    const startTime = Date.now();
    const requestId = crypto.randomUUID();
    
    logger.info({
      requestId,
      operation: 'ai_chat_request',
      userId,
      attemptId: data.attemptId,
      provider: data.provider,
      model: data.model,
      messageCount: data.messages.length,
      temperature: data.temperature,
      maxTokens: data.maxTokens,
      stream: data.stream
    }, 'AI chat request initiated');

    try {
      const estimatedTokens = this.estimateTokens(data.messages);
      const rateLimit = await this.rateLimiter.checkLimit(userId, estimatedTokens);
      
      if (!rateLimit.allowed) {
        logger.warn({
          requestId,
          userId,
          provider: data.provider,
          estimatedTokens,
          reason: rateLimit.reason || 'Rate limit exceeded',
          resetAt: rateLimit.resetAt,
          executionTime: Date.now() - startTime
        }, 'AI chat request blocked by rate limiter');
        throw new Error(rateLimit.reason || 'Rate limit exceeded');
      }

      const provider = this.providerFactory.create(data.provider);
      
      if (!provider.validateModel(data.model)) {
        logger.warn({
          requestId,
          userId,
          provider: data.provider,
          model: data.model,
          supportedModels: provider.models.map(m => m.id),
          reason: 'model_not_supported',
          executionTime: Date.now() - startTime
        }, 'AI chat request failed - model not supported');
        throw new Error(`Model ${data.model} not supported by ${data.provider}`);
      }

      const completionStartTime = Date.now();

      const completion = await provider.chat(data.messages, {
        model: data.model,
        temperature: data.temperature,
        maxTokens: data.maxTokens,
      });

      const completionTime = Date.now() - completionStartTime;

      const interaction = await this.prisma.aIInteraction.create({
        data: {
          userId,
          attemptId: data.attemptId,
          provider: data.provider.toUpperCase() as any,
          model: data.model,
          messages: data.messages as any,
          responseLength: completion.content.length,
          codeLinesGenerated: this.countCodeLines(completion.content),
          inputTokens: completion.usage.promptTokens,
          outputTokens: completion.usage.completionTokens,
          estimatedCost: completion.cost,
          promptComplexity: this.calculateComplexity(data.messages),
        },
      });

      await this.usageTracker.trackUsage({
        userId,
        attemptId: data.attemptId,
        provider: data.provider as any,
        model: data.model,
        inputTokens: completion.usage.promptTokens,
        outputTokens: completion.usage.completionTokens,
        cost: completion.cost,
        responseTime: completionTime,
      });

      const executionTime = Date.now() - startTime;

      logger.info({
        requestId,
        interactionId: interaction.id,
        userId,
        attemptId: data.attemptId,
        provider: data.provider,
        model: data.model,
        inputTokens: completion.usage.promptTokens,
        outputTokens: completion.usage.completionTokens,
        totalTokens: completion.usage.totalTokens,
        cost: completion.cost,
        responseLength: completion.content.length,
        codeLinesGenerated: this.countCodeLines(completion.content),
        completionTime,
        executionTime,
        rateLimitRemaining: rateLimit.remaining
      }, 'AI chat completed successfully');

      if (completion.cost > 0.10) {
        logger.warn({
          requestId,
          userId,
          provider: data.provider,
          model: data.model,
          cost: completion.cost,
          totalTokens: completion.usage.totalTokens,
          highCost: true
        }, 'High cost AI interaction detected');
      }

      if (completion.usage.totalTokens > 4000) {
        logger.warn({
          requestId,
          userId,
          provider: data.provider,
          model: data.model,
          totalTokens: completion.usage.totalTokens,
          highTokenUsage: true
        }, 'High token usage detected');
      }

      return {
        interactionId: interaction.id,
        completion,
        rateLimit: {
          remaining: rateLimit.remaining,
          resetAt: rateLimit.resetAt,
        },
      };
    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : 'Unknown error',
        requestId,
        userId,
        provider: data.provider,
        model: data.model,
        messageCount: data.messages.length,
        executionTime: Date.now() - startTime
      }, 'AI chat use case failed');
      throw error;
    }
  }

  private estimateTokens(messages: any[]): number {
    const text = messages.map(m => m.content).join(' ');
    return Math.ceil(text.length / 4);
  }

  private countCodeLines(content: string): number {
    const codeBlocks = content.match(/\`\`\`[\s\S]*?\`\`\`/g) || [];
    let lines = 0;
    
    for (const block of codeBlocks) {
      lines += block.split('\n').length - 2;
    }
    
    return lines;
  }

  private calculateComplexity(messages: any[]): string {
    const totalLength = messages.reduce((sum, m) => sum + m.content.length, 0);
    
    if (totalLength < 500) return 'simple';
    if (totalLength < 2000) return 'moderate';
    if (totalLength < 5000) return 'complex';
    return 'very_complex';
  }
}