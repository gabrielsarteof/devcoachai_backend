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
    try {
      const estimatedTokens = this.estimateTokens(data.messages);
      const rateLimit = await this.rateLimiter.checkLimit(userId, estimatedTokens);
      
      if (!rateLimit.allowed) {
        throw new Error(rateLimit.reason || 'Rate limit exceeded');
      }

      const provider = this.providerFactory.create(data.provider);
      
      if (!provider.validateModel(data.model)) {
        throw new Error(`Model ${data.model} not supported by ${data.provider}`);
      }

      const startTime = Date.now();

      const completion = await provider.chat(data.messages, {
        model: data.model,
        temperature: data.temperature,
        maxTokens: data.maxTokens,
      });

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
        responseTime: Date.now() - startTime,
      });

      logger.info({
        userId,
        provider: data.provider,
        model: data.model,
        tokens: completion.usage.totalTokens,
        cost: completion.cost,
      }, 'AI chat completed');

      return {
        interactionId: interaction.id,
        completion,
        rateLimit: {
          remaining: rateLimit.remaining,
          resetAt: rateLimit.resetAt,
        },
      };
    } catch (error) {
      logger.error({ error, userId, data }, 'AI chat failed');
      throw error;
    }
  }

  private estimateTokens(messages: any[]): number {
    const text = messages.map(m => m.content).join(' ');
    return Math.ceil(text.length / 4);
  }

  private countCodeLines(content: string): number {
    const codeBlocks = content.match(/```[\s\S]*?```/g) || [];
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