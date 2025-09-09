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
    
    logger.info({
      operation: 'ai_provider_registered',
      providerName: name,
      supportedModels: provider.models.map(m => m.id),
      totalProviders: this.providers.size
    }, `AI provider '${name}' registered successfully`);
  }

  chat = async (
    request: FastifyRequest<{ Body: CreateAIInteractionDTO }>,
    reply: FastifyReply
  ): Promise<void> => {
    const startTime = Date.now();
    const requestId = crypto.randomUUID();
    
    try {
      const user = request.user as { id: string };
      const { provider: providerName, messages, model, ...config } = request.body;

      logger.info({
        requestId,
        operation: 'ai_chat_request',
        userId: user.id,
        provider: providerName,
        model,
        messageCount: messages.length,
        attemptId: request.body.attemptId,
        temperature: config.temperature,
        maxTokens: config.maxTokens,
        stream: config.stream,
        ipAddress: request.ip
      }, 'AI chat request received');

      const rateLimit = await this.rateLimiter.checkLimit(user.id, 1000);
      if (!rateLimit.allowed) {
        logger.warn({
          requestId,
          userId: user.id,
          provider: providerName,
          reason: rateLimit.reason,
          resetAt: rateLimit.resetAt,
          rateLimitExceeded: true,
          executionTime: Date.now() - startTime
        }, 'AI chat request blocked by rate limiter');
        
        return reply.status(429).send({
          error: 'Rate limit exceeded',
          message: rateLimit.reason,
          resetAt: rateLimit.resetAt,
        });
      }

      const provider = this.providers.get(providerName);
      if (!provider) {
        logger.error({
          requestId,
          userId: user.id,
          provider: providerName,
          availableProviders: Array.from(this.providers.keys()),
          reason: 'provider_not_found',
          executionTime: Date.now() - startTime
        }, 'AI chat request failed - provider not found');
        
        return reply.status(400).send({
          error: 'Invalid provider',
          message: `Provider ${providerName} not found`,
        });
      }

      if (!provider.validateModel(model)) {
        logger.warn({
          requestId,
          userId: user.id,
          provider: providerName,
          model,
          supportedModels: provider.models.map(m => m.id),
          reason: 'model_not_supported',
          executionTime: Date.now() - startTime
        }, 'AI chat request failed - model not supported');
        
        return reply.status(400).send({
          error: 'Invalid model',
          message: `Model ${model} not supported by ${providerName}`,
        });
      }

      const apiStartTime = Date.now();

      if (config.stream) {
        logger.info({
          requestId,
          userId: user.id,
          provider: providerName,
          model,
          streamingMode: true
        }, 'Starting streaming AI chat response');

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
            responseTime: Date.now() - apiStartTime,
          });

          const executionTime = Date.now() - startTime;
          
          logger.info({
            requestId,
            userId: user.id,
            provider: providerName,
            model,
            streamingMode: true,
            totalContent: totalContent.length,
            chunks: tokenCount,
            promptTokens,
            responseTokens,
            totalTokens: promptTokens + responseTokens,
            cost,
            apiTime: Date.now() - apiStartTime,
            executionTime,
            streamCompleted: true
          }, 'AI streaming chat completed successfully');

          reply.raw.write('data: [DONE]\n\n');
        } catch (error) {
          const executionTime = Date.now() - startTime;
          
          logger.error({
            requestId,
            userId: user.id,
            provider: providerName,
            model,
            error: error instanceof Error ? error.message : 'Unknown error',
            streamingMode: true,
            executionTime
          }, 'AI streaming chat error');
          
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
          responseTime: Date.now() - apiStartTime,
        });

        const executionTime = Date.now() - startTime;
        
        logger.info({
          requestId,
          userId: user.id,
          provider: providerName,
          model,
          messageCount: messages.length,
          promptTokens: completion.usage.promptTokens,
          completionTokens: completion.usage.completionTokens,
          totalTokens: completion.usage.totalTokens,
          cost: completion.cost,
          responseLength: completion.content.length,
          apiTime: Date.now() - apiStartTime,
          executionTime,
          rateLimitRemaining: rateLimit.remaining,
          aiChatCompleted: true
        }, 'AI chat completed successfully');

        if (completion.cost > 0.10) {
          logger.warn({
            requestId,
            userId: user.id,
            provider: providerName,
            model,
            cost: completion.cost,
            totalTokens: completion.usage.totalTokens,
            highCostInteraction: true
          }, 'High cost AI interaction detected');
        }

        if (completion.usage.totalTokens > 4000) {
          logger.warn({
            requestId,
            userId: user.id,
            provider: providerName,
            model,
            totalTokens: completion.usage.totalTokens,
            highTokenUsage: true
          }, 'High token usage detected');
        }

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
      const executionTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      logger.error({
        requestId,
        operation: 'ai_chat_error',
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
        executionTime
      }, 'AI chat request failed');
      
      if (error instanceof Error) {
        if (error.message.includes('Rate limit')) {
          return reply.status(429).send({
            error: 'Rate limit exceeded',
            message: error.message,
          });
        }
        if (error.message.includes('Invalid API key')) {
          logger.error({
            requestId,
            apiKeyError: true,
            securityEvent: true
          }, 'Invalid API key for AI provider');
          
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
    const startTime = Date.now();
    const requestId = crypto.randomUUID();
    
    try {
      const user = request.user as { id: string };
      
      logger.info({
        requestId,
        operation: 'copy_paste_tracking_request',
        userId: user.id,
        attemptId: request.body.attemptId,
        action: request.body.action,
        contentLength: request.body.content.length,
        sourceLines: request.body.sourceLines,
        targetLines: request.body.targetLines,
        fromAI: !!request.body.aiInteractionId,
        ipAddress: request.ip
      }, 'Copy/paste tracking request received');

      await this.trackCopyPasteUseCase.execute(user.id, request.body);
      
      const executionTime = Date.now() - startTime;
      
      logger.info({
        requestId,
        userId: user.id,
        attemptId: request.body.attemptId,
        action: request.body.action,
        contentLength: request.body.content.length,
        fromAI: !!request.body.aiInteractionId,
        executionTime,
        copyPasteTracked: true
      }, `${request.body.action} event tracked successfully`);

      if (request.body.action === 'copy' && request.body.aiInteractionId) {
        logger.info({
          userId: user.id,
          attemptId: request.body.attemptId,
          aiInteractionId: request.body.aiInteractionId,
          sourceLines: request.body.sourceLines,
          aiCodeCopied: true
        }, 'AI-generated code copied by user');
      }

      if (request.body.action === 'paste' && request.body.targetLines && request.body.targetLines > 50) {
        logger.warn({
          userId: user.id,
          attemptId: request.body.attemptId,
          targetLines: request.body.targetLines,
          largePasteEvent: true
        }, 'Large code paste event detected');
      }

      return reply.send({
        success: true,
        message: `${request.body.action} event tracked`,
      });
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      logger.error({
        requestId,
        operation: 'copy_paste_tracking_failed',
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
        executionTime
      }, 'Failed to track copy/paste event');
      
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
    const startTime = Date.now();
    const requestId = crypto.randomUUID();
    
    try {
      const user = request.user as { id: string };
      const days = request.query.days || 30;

      logger.debug({
        requestId,
        operation: 'ai_usage_request',
        userId: user.id,
        days,
        ipAddress: request.ip
      }, 'AI usage request received');

      const usage = await this.usageTracker.getUserUsage(user.id, days);
      const quota = await this.rateLimiter.getRemainingQuota(user.id);
      
      const executionTime = Date.now() - startTime;
      
      logger.info({
        requestId,
        userId: user.id,
        days,
        usage: {
          totalRequests: usage.total.requests,
          totalTokens: usage.total.tokens,
          totalCost: usage.total.cost,
          providersUsed: Object.keys(usage.byProvider).length
        },
        quota,
        executionTime,
        usageRetrieved: true
      }, 'AI usage retrieved successfully');

      return reply.send({
        usage,
        quota,
      });
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      logger.error({
        requestId,
        operation: 'ai_usage_failed',
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
        executionTime
      }, 'Failed to get AI usage');
      
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
    const startTime = Date.now();
    const requestId = crypto.randomUUID();
    
    try {
      logger.debug({
        requestId,
        operation: 'ai_models_request',
        providersCount: this.providers.size
      }, 'AI models request received');

      const models: Record<string, any> = {};
      
      for (const [name, provider] of this.providers) {
        models[name] = provider.models;
      }

      const executionTime = Date.now() - startTime;
      
      const totalModels = Object.values(models).reduce((sum, providerModels) => 
        sum + (Array.isArray(providerModels) ? providerModels.length : 0), 0
      );
      
      logger.info({
        requestId,
        providersCount: this.providers.size,
        totalModels,
        providers: Object.keys(models),
        executionTime,
        modelsRetrieved: true
      }, 'AI models retrieved successfully');

      return reply.send({ models });
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      logger.error({
        requestId,
        operation: 'ai_models_failed',
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
        executionTime
      }, 'Failed to get AI models');
      
      return reply.status(500).send({
        error: 'Internal server error',
        message: 'Failed to retrieve AI models',
      });
    }
  };
}