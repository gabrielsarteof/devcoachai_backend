import type { FastifyRequest, FastifyReply } from 'fastify';
import { ChatWithAIUseCase } from '../../application/use-cases/chat-with-ai.use-case';
import { TrackCopyPasteUseCase } from '../../application/use-cases/track-copy-paste.use-case';
import { GetAIModelsUseCase } from '../../application/use-cases/get-ai-models.use-case';
import { GetAIUsageUseCase, GetAIUsageDTO } from '../../application/use-cases/get-ai-usage.use-case';
import { CreateAIInteractionDTO, TrackCopyPasteDTO } from '../../domain/schemas/ai-interaction.schema';
import { logger } from '@/shared/infrastructure/monitoring/logger';

export class AIController {
  constructor(
    private readonly chatWithAIUseCase: ChatWithAIUseCase,
    private readonly trackCopyPasteUseCase: TrackCopyPasteUseCase,
    private readonly getAIModelsUseCase: GetAIModelsUseCase,
    private readonly getAIUsageUseCase: GetAIUsageUseCase
  ) {}

  chat = async (
    request: FastifyRequest<{ Body: CreateAIInteractionDTO }>,
    reply: FastifyReply
  ): Promise<void> => {
    const startTime = Date.now();
    const requestId = crypto.randomUUID();
    const user = request.user as { id: string; email: string; role: string; level?: number } | undefined;

    if (!user) {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'User not authenticated',
      });
    }

    logger.info({
      requestId,
      operation: 'ai_chat_request',
      userId: user.id,
      provider: request.body.provider,
      model: request.body.model,
      messageCount: request.body.messages.length,
      attemptId: request.body.attemptId,
      challengeId: request.body.challengeId,
      temperature: request.body.temperature,
      maxTokens: request.body.maxTokens,
      stream: request.body.stream,
      ipAddress: request.ip,
    }, 'AI chat request received');

    try {
      const result = await this.chatWithAIUseCase.execute(user.id, request.body);


      const executionTime = Date.now() - startTime;

      logger.info({
        requestId,
        userId: user.id,
        provider: request.body.provider,
        model: request.body.model,
        tokensUsed: result.completion.usage.totalTokens,
        cost: result.completion.cost,
        executionTime,
      }, 'AI chat completed successfully');

      const responseData = {
        success: true,
        data: {
          id: result.completion.id,
          content: result.completion.content,
          usage: result.completion.usage,
          cost: result.completion.cost,
        },
        usage: {
          tokens: result.completion.usage.totalTokens,
          cost: result.completion.cost,
          remaining: result.rateLimit.remaining,
        },
        governance: {
          validated: true,
          challengeContext: !!request.body.challengeId,
        },
      };


      return reply.status(200).send(responseData);
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      // Tratamento de erros com códigos HTTP adequados
      if (errorMessage.includes('Rate limit')) {
        logger.warn({
          requestId,
          userId: user.id,
          provider: request.body.provider,
          error: errorMessage,
          reason: 'rate_limit_exceeded',
          executionTime,
        }, 'AI chat blocked by rate limiter');

        return reply.status(429).send({
          error: 'Too Many Requests',
          message: errorMessage,
        });
      }

      // Erros de API/provedor AI recebem status 500
      if (errorMessage.includes('API Error') || errorMessage.includes('error-model') || errorMessage.includes('not supported by')) {
        logger.warn({
          requestId,
          userId: user.id,
          provider: request.body.provider,
          model: request.body.model,
          error: errorMessage,
          reason: 'provider_api_error',
          executionTime,
        }, 'AI chat failed - provider API error');

        return reply.status(500).send({
          error: 'Internal server error',
          message: 'Provider not available',
        });
      }

      // Provedor inválido ou não disponível recebe status 400
      if (errorMessage.includes('Provider') && errorMessage.includes('not available') || errorMessage.includes('Cannot create custom instance')) {
        logger.warn({
          requestId,
          userId: user.id,
          provider: request.body.provider,
          error: errorMessage,
          reason: 'invalid_provider',
          executionTime,
        }, 'AI chat failed - invalid provider');

        return reply.status(400).send({
          error: 'Invalid provider',
        });
      }

      if (errorMessage.includes('Governance')) {
        logger.warn({
          requestId,
          userId: user.id,
          provider: request.body.provider,
          error: errorMessage,
          reason: 'governance_blocked',
          executionTime,
        }, 'AI chat blocked by governance');

        return reply.status(403).send({
          error: 'Forbidden',
          message: errorMessage,
        });
      }

      logger.error({
        requestId,
        userId: user.id,
        provider: request.body.provider,
        model: request.body.model,
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
        executionTime,
      }, 'AI chat failed');

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
    const user = request.user as { id: string; email: string; role: string } | undefined;

    if (!user) {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'User not authenticated',
      });
    }

    logger.debug({
      requestId,
      operation: 'track_copy_paste',
      userId: user.id,
      attemptId: request.body.attemptId,
      eventType: request.body.action,
      sourceType: 'manual',
      ipAddress: request.ip,
    }, 'Copy paste tracking request received');

    try {
      await this.trackCopyPasteUseCase.execute(user.id, request.body);

      const executionTime = Date.now() - startTime;

      logger.info({
        requestId,
        userId: user.id,
        attemptId: request.body.attemptId,
        eventType: request.body.action,
        executionTime,
      }, 'Copy paste event tracked successfully');

      return reply.status(200).send({
        success: true,
        message: 'Copy paste event tracked successfully',
      });
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      logger.error({
        requestId,
        userId: user.id,
        attemptId: request.body.attemptId,
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
        executionTime,
      }, 'Failed to track copy paste event');

      return reply.status(500).send({
        error: 'Internal server error',
        message: 'Failed to track copy paste event',
      });
    }
  };

  getModels = async (
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> => {
    const startTime = Date.now();
    const requestId = crypto.randomUUID();
    const user = request.user as { id: string; email: string; role: string } | undefined;

    if (!user) {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'User not authenticated',
      });
    }

    logger.debug({
      requestId,
      operation: 'get_ai_models',
      userId: user.id,
    }, 'Get AI models request received');

    try {
      const result = await this.getAIModelsUseCase.execute();

      const executionTime = Date.now() - startTime;

      logger.info({
        requestId,
        userId: user.id,
        providersCount: Object.keys(result.models).length,
        executionTime,
      }, 'AI models retrieved successfully');

      return reply.status(200).send(result);
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      logger.error({
        requestId,
        userId: user.id,
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
        executionTime,
      }, 'Failed to get AI models');

      return reply.status(500).send({
        error: 'Internal server error',
        message: 'Failed to retrieve AI models',
      });
    }
  };

  getUsage = async (
    request: FastifyRequest<{ Querystring: GetAIUsageDTO }>,
    reply: FastifyReply
  ): Promise<void> => {
    const startTime = Date.now();
    const requestId = crypto.randomUUID();
    const user = request.user as { id: string; email: string; role: string } | undefined;

    if (!user) {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'User not authenticated',
      });
    }

    logger.debug({
      requestId,
      operation: 'get_ai_usage',
      userId: user.id,
      days: request.query.days,
    }, 'Get AI usage request received');

    try {
      const result = await this.getAIUsageUseCase.execute(user.id, request.query);

      const executionTime = Date.now() - startTime;

      logger.info({
        requestId,
        userId: user.id,
        days: request.query.days || 30,
        tokensUsed: result.usage.tokens.used,
        requestsTotal: result.usage.requests.total,
        executionTime,
      }, 'AI usage retrieved successfully');

      return reply.status(200).send(result);
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      logger.error({
        requestId,
        userId: user.id,
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
        executionTime,
      }, 'Failed to get AI usage');

      return reply.status(500).send({
        error: 'Internal server error',
        message: 'Failed to retrieve AI usage',
      });
    }
  };
}