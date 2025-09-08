import type { FastifyRequest, FastifyReply } from 'fastify';
import { IAIProvider } from '../../domain/providers/ai-provider.interface';
import { CreateAIInteractionDTO } from '../../domain/schemas/ai-interaction.schema';
import { RateLimiterService } from '../../infrastructure/services/rate-limiter.service';
import { UsageTrackerService } from '../../infrastructure/services/usage-tracker.service';
import { TrackCopyPasteUseCase } from '../../application/use-cases/track-copy-paste.use-case';
import { TrackCopyPasteDTO } from '../../domain/schemas/ai-interaction.schema';
import { logger } from '@/shared/infrastructure/monitoring/logger';

export class AIProxyController {
  private providers: Map<string, IAIProvider> = new Map();

  constructor(
    private readonly rateLimiter: RateLimiterService,
    private readonly usageTracker: UsageTrackerService,
    private readonly trackCopyPasteUseCase: TrackCopyPasteUseCase
  ) {}

  registerProvider(name: string, provider: IAIProvider): void {
    this.providers.set(name, provider);
  }

  chat = async (
    request: FastifyRequest<{ Body: CreateAIInteractionDTO }>,
    reply: FastifyReply
  ): Promise<void> => {
    try {
      const user = request.user as { id: string };
      const { provider: providerName, messages, model, ...config } = request.body;

      const rateLimit = await this.rateLimiter.checkLimit(user.id, 1000);
      if (!rateLimit.allowed) {
        return reply.status(429).send({
          error: 'Rate limit exceeded',
          message: rateLimit.reason,
          resetAt: rateLimit.resetAt,
        });
      }

      const provider = this.providers.get(providerName);
      if (!provider) {
        return reply.status(400).send({
          error: 'Invalid provider',
          message: `Provider ${providerName} not found`,
        });
      }

      if (!provider.validateModel(model)) {
        return reply.status(400).send({
          error: 'Invalid model',
          message: `Model ${model} not supported by ${providerName}`,
        });
      }

      const startTime = Date.now();

      if (config.stream) {
        reply.raw.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        });

        let totalContent = '';
        let tokenCount = 0;

        try {
          for await (const chunk of provider.stream(messages, { model, ...config })) {
            totalContent += chunk;
            tokenCount++;
            
            const event = JSON.stringify({ content: chunk });
            reply.raw.write(`data: ${event}\n\n`);
          }
          const responseTokens = provider.countTokens(totalContent);
          const promptTokens = provider.countTokens(messages.map(m => m.content).join(' '));
          const modelInfo = provider.models.find(m => m.id === model);
          const cost = modelInfo 
            ? ((promptTokens / 1000) * modelInfo.inputCost) + ((responseTokens / 1000) * modelInfo.outputCost)
            : 0;

          await this.usageTracker.trackUsage({
            userId: user.id,
            attemptId: request.body.attemptId,
            provider: providerName as any,
            model,
            inputTokens: promptTokens,
            outputTokens: responseTokens,
            cost,
            responseTime: Date.now() - startTime,
          });

          reply.raw.write('data: [DONE]\n\n');
        } catch (error) {
          logger.error({ error }, 'Stream error');
          const errorEvent = JSON.stringify({ error: 'Stream error' });
          reply.raw.write(`data: ${errorEvent}\n\n`);
        } finally {
          reply.raw.end();
        }
      } else {
        const completion = await provider.chat(messages, { model, ...config });

        await this.usageTracker.trackUsage({
          userId: user.id,
          attemptId: request.body.attemptId,
          provider: providerName as any,
          model,
          inputTokens: completion.usage.promptTokens,
          outputTokens: completion.usage.completionTokens,
          cost: completion.cost,
          responseTime: Date.now() - startTime,
        });

        return reply.send({
          success: true,
          data: completion,
          usage: {
            tokens: completion.usage.totalTokens,
            cost: completion.cost,
            remaining: rateLimit.remaining,
          },
        });
      }
    } catch (error) {
      logger.error({ error }, 'AI chat error');
      
      if (error instanceof Error) {
        if (error.message.includes('Rate limit')) {
          return reply.status(429).send({
            error: 'Rate limit exceeded',
            message: error.message,
          });
        }
        if (error.message.includes('Invalid API key')) {
          return reply.status(401).send({
            error: 'Authentication failed',
            message: 'Invalid API key for provider',
          });
        }
      }

      return reply.status(500).send({
        error: 'Internal server error',
        message: 'Failed to process AI request',
      });
    }
  };

  trackCopyPaste = async (
    request: FastifyRequest<{ Body: TrackCopyPasteDTO }>,
    reply: FastifyReply
  ): Promise<void> => {
    try {
      const user = request.user as { id: string };
      
      await this.trackCopyPasteUseCase.execute(user.id, request.body);

      return reply.send({
        success: true,
        message: `${request.body.action} event tracked`,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to track copy/paste');
      
      return reply.status(500).send({
        error: 'Internal server error',
        message: 'Failed to track copy/paste event',
      });
    }
  };

  getUsage = async (
    request: FastifyRequest<{ Querystring: { days?: number } }>,
    reply: FastifyReply
  ): Promise<void> => {
    try {
      const user = request.user as { id: string };
      const days = request.query.days || 30;

      const usage = await this.usageTracker.getUserUsage(user.id, days);
      const quota = await this.rateLimiter.getRemainingQuota(user.id);

      return reply.send({
        usage,
        quota,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to get usage');
      
      return reply.status(500).send({
        error: 'Internal server error',
        message: 'Failed to retrieve usage data',
      });
    }
  };

  getModels = async (
    _request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> => {
    const models: Record<string, any> = {};
    
    for (const [name, provider] of this.providers) {
      models[name] = provider.models;
    }

    return reply.send({ models });
  };
}