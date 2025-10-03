import type { FastifyRequest, FastifyReply } from 'fastify';
import { ChatWithAIUseCase } from '../../application/use-cases/chat-with-ai.use-case';
import { TrackCopyPasteUseCase } from '../../application/use-cases/track-copy-paste.use-case';
import { GetAIModelsUseCase } from '../../application/use-cases/get-ai-models.use-case';
import { GetAIUsageUseCase, GetAIUsageDTO } from '../../application/use-cases/get-ai-usage.use-case';
import { CreateAIInteractionDTO, TrackCopyPasteDTO, CreateAIInteractionSchema, TrackCopyPasteSchema } from '../../domain/schemas/ai-interaction.schema';
import { logger } from '@/shared/infrastructure/monitoring/logger';
import { AIError, ValidationError, UnauthorizedError } from '../../domain/errors';
import { ZodError } from 'zod';

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
      const unauthorizedError = new UnauthorizedError();
      return reply.status(unauthorizedError.statusCode).send(unauthorizedError.toJSON());
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
      const validatedData = CreateAIInteractionSchema.parse(request.body);
      const result = await this.chatWithAIUseCase.execute(user.id, validatedData);

      const executionTime = Date.now() - startTime;

      logger.info({
        requestId,
        userId: user.id,
        provider: validatedData.provider,
        model: validatedData.model,
        tokensUsed: result.completion.usage.totalTokens,
        cost: result.completion.cost,
        executionTime,
      }, 'AI chat completed successfully');

      return reply.status(200).send({
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
          challengeContext: !!validatedData.challengeId,
        },
      });
    } catch (error) {
      if (error instanceof ZodError) {
        const validationError = new ValidationError(error);
        return reply.status(validationError.statusCode).send(validationError.toJSON());
      }

      if (error instanceof AIError) {
        return reply.status(error.statusCode).send(error.toJSON());
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
    const user = request.user as { id: string; email: string; role: string } | undefined;

    if (!user) {
      const unauthorizedError = new UnauthorizedError();
      return reply.status(unauthorizedError.statusCode).send(unauthorizedError.toJSON());
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
      const validatedData = TrackCopyPasteSchema.parse(request.body);
      await this.trackCopyPasteUseCase.execute(user.id, validatedData);

      const executionTime = Date.now() - startTime;

      logger.info({
        requestId,
        userId: user.id,
        attemptId: validatedData.attemptId,
        eventType: validatedData.action,
        executionTime,
      }, 'Copy paste event tracked successfully');

      return reply.status(200).send({
        success: true,
        data: {
          message: 'Copy paste event tracked successfully',
        },
      });
    } catch (error) {
      if (error instanceof ZodError) {
        const validationError = new ValidationError(error);
        return reply.status(validationError.statusCode).send(validationError.toJSON());
      }

      if (error instanceof AIError) {
        return reply.status(error.statusCode).send(error.toJSON());
      }

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
      const unauthorizedError = new UnauthorizedError();
      return reply.status(unauthorizedError.statusCode).send(unauthorizedError.toJSON());
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

      return reply.status(200).send({
        success: true,
        data: result,
      });
    } catch (error) {
      if (error instanceof AIError) {
        return reply.status(error.statusCode).send(error.toJSON());
      }

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
      const unauthorizedError = new UnauthorizedError();
      return reply.status(unauthorizedError.statusCode).send(unauthorizedError.toJSON());
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

      return reply.status(200).send({
        success: true,
        data: result,
      });
    } catch (error) {
      if (error instanceof AIError) {
        return reply.status(error.statusCode).send(error.toJSON());
      }

      return reply.status(500).send({
        error: 'Internal server error',
        message: 'Failed to retrieve AI usage',
      });
    }
  };
}