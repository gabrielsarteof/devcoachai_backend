import type { FastifyInstance, RouteHandlerMethod } from 'fastify';
import { AIProxyController } from '../controllers/ai-proxy.controller';
import { 
  CreateAIInteractionSchema, 
  TrackCopyPasteSchema,
  PromptValidationRequestSchema,
  ValidationMetricsQuerySchema
} from '../../domain/schemas/ai-interaction.schema';

export async function aiRoutes(
  fastify: FastifyInstance,
  controller: AIProxyController
): Promise<void> {
  
  fastify.post('/chat', {
    preHandler: [fastify.authenticate],
    schema: {
      body: CreateAIInteractionSchema,
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: { type: 'object' },
            usage: {
              type: 'object',
              properties: {
                tokens: { type: 'number' },
                cost: { type: 'number' },
                remaining: { type: 'number' },
              },
            },
            governance: {
              type: 'object',
              properties: {
                validated: { type: 'boolean' },
                challengeContext: { type: 'boolean' },
              },
              nullable: true,
            },
          },
        },
        403: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' },
            reasons: { type: 'array', items: { type: 'string' } },
            riskScore: { type: 'number' },
            classification: { type: 'string' },
            suggestions: { type: 'array', items: { type: 'string' } },
          },
        },
      },
    },
    handler: controller.chat as RouteHandlerMethod,
  });

  fastify.post('/track-copy-paste', {
    preHandler: [fastify.authenticate],
    schema: {
      body: TrackCopyPasteSchema,
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
          },
        },
      },
    },
    handler: controller.trackCopyPaste as RouteHandlerMethod,
  });

  fastify.get('/usage', {
    preHandler: [fastify.authenticate],
    schema: {
      querystring: {
        type: 'object',
        properties: {
          days: { type: 'number', minimum: 1, maximum: 365, default: 30 },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            usage: { type: 'object' },
            quota: { type: 'object' },
          },
        },
      },
    },
    handler: controller.getUsage as RouteHandlerMethod,
  });

  fastify.get('/models', {
    preHandler: [fastify.authenticate],
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            models: { type: 'object' },
          },
        },
      },
    },
    handler: controller.getModels as RouteHandlerMethod,
  });

  fastify.post('/governance/validate', {
    preHandler: [fastify.authenticate],
    schema: {
      body: PromptValidationRequestSchema,
      response: {
        200: {
          type: 'object',
          properties: {
            isValid: { type: 'boolean' },
            riskScore: { type: 'number' },
            classification: { 
              type: 'string',
              enum: ['SAFE', 'WARNING', 'BLOCKED'],
            },
            reasons: { 
              type: 'array',
              items: { type: 'string' },
            },
            suggestedAction: {
              type: 'string',
              enum: ['ALLOW', 'THROTTLE', 'BLOCK', 'REVIEW'],
            },
            confidence: { type: 'number' },
            metadata: { 
              type: 'object',
              nullable: true,
            },
          },
        },
        501: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' },
          },
        },
      },
    },
    handler: async (request, reply) => {
      const user = request.user as { id: string; level?: number };
      const body = request.body as any;
      
      if (!fastify.ai?.validatePrompt) {
        return reply.status(501).send({
          error: 'Not Implemented',
          message: 'Governance system not available',
        });
      }

      const result = await fastify.ai.validatePrompt.execute({
        userId: user.id,
        challengeId: body.challengeId,
        prompt: body.prompt,
        userLevel: body.userLevel || user.level,
        attemptId: body.attemptId,
        config: body.config,
      });

      return reply.send(result);
    },
  });

  fastify.get('/governance/metrics', {
    preHandler: [fastify.authenticate],
    schema: {
      querystring: ValidationMetricsQuerySchema,
      response: {
        200: {
          type: 'object',
          properties: {
            totalValidations: { type: 'number' },
            blockedCount: { type: 'number' },
            throttledCount: { type: 'number' },
            allowedCount: { type: 'number' },
            avgRiskScore: { type: 'number' },
            avgConfidence: { type: 'number' },
            avgProcessingTime: { type: 'number' },
            topBlockedPatterns: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  pattern: { type: 'string' },
                  count: { type: 'number' },
                },
              },
            },
            riskDistribution: { type: 'object' },
          },
        },
        501: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' },
          },
        },
      },
    },
    handler: async (request, reply) => {
      const query = request.query as any;
      
      if (!fastify.ai?.promptValidator) {
        return reply.status(501).send({
          error: 'Not Implemented',
          message: 'Governance metrics not available',
        });
      }

      const timeRange = query.startDate && query.endDate ? {
        start: new Date(query.startDate),
        end: new Date(query.endDate),
      } : undefined;

      const metrics = await fastify.ai.promptValidator.getValidationMetrics(
        query.challengeId,
        timeRange
      );

      return reply.send(metrics);
    },
  });

  fastify.get('/governance/stats', {
    preHandler: [fastify.authenticate],
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            cachedContexts: { type: 'number' },
            avgKeywords: { type: 'number' },
            avgForbiddenPatterns: { type: 'number' },
            mostCommonCategories: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  category: { type: 'string' },
                  count: { type: 'number' },
                },
              },
            },
            cacheHitRate: { type: 'number' },
          },
        },
        501: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' },
          },
        },
      },
    },
    handler: async (_request, reply) => {
      if (!fastify.ai?.challengeContextService) {
        return reply.status(501).send({
          error: 'Not Implemented',
          message: 'Context statistics not available',
        });
      }

      const stats = await fastify.ai.challengeContextService.getContextStats();
      return reply.send(stats);
    },
  });

  fastify.post('/governance/cache/refresh', {
    preHandler: [fastify.authenticate],
    schema: {
      body: {
        type: 'object',
        properties: {
          challengeId: { type: 'string' },
        },
        required: ['challengeId'],
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
          },
        },
        501: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' },
          },
        },
      },
    },
    handler: async (request, reply) => {
      const { challengeId } = request.body as { challengeId: string };
      
      if (!fastify.ai?.challengeContextService) {
        return reply.status(501).send({
          error: 'Not Implemented',
          message: 'Cache refresh not available',
        });
      }

      await fastify.ai.challengeContextService.refreshChallengeContext(challengeId);
      
      return reply.send({
        success: true,
        message: `Context cache refreshed for challenge ${challengeId}`,
      });
    },
  });

  fastify.post('/governance/cache/prewarm', {
    preHandler: [fastify.authenticate],
    schema: {
      body: {
        type: 'object',
        properties: {
          challengeIds: {
            type: 'array',
            items: { type: 'string' },
            minItems: 1,
            maxItems: 50,
          },
        },
        required: ['challengeIds'],
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
            processed: { type: 'number' },
          },
        },
        501: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' },
          },
        },
      },
    },
    handler: async (request, reply) => {
      const { challengeIds } = request.body as { challengeIds: string[] };
      
      if (!fastify.ai?.challengeContextService) {
        return reply.status(501).send({
          error: 'Not Implemented',
          message: 'Cache prewarm not available',
        });
      }

      await fastify.ai.challengeContextService.prewarmCache(challengeIds);
      
      return reply.send({
        success: true,
        message: 'Cache prewarm initiated',
        processed: challengeIds.length,
      });
    },
  });

  fastify.delete('/governance/cache', {
    preHandler: [fastify.authenticate],
    schema: {
      querystring: {
        type: 'object',
        properties: {
          challengeId: { type: 'string' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
          },
        },
        501: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' },
          },
        },
      },
    },
    handler: async (request, reply) => {
      const { challengeId } = request.query as { challengeId?: string };
      
      if (!fastify.ai?.promptValidator) {
        return reply.status(501).send({
          error: 'Not Implemented',
          message: 'Cache clear not available',
        });
      }

      await fastify.ai.promptValidator.clearCache(challengeId);
      
      return reply.send({
        success: true,
        message: challengeId 
          ? `Cache cleared for challenge ${challengeId}`
          : 'All validation cache cleared',
      });
    },
  });

  fastify.post('/governance/analyze', {
    preHandler: [fastify.authenticate],
    schema: {
      body: {
        type: 'object',
        properties: {
          prompt: { type: 'string', minLength: 1, maxLength: 10000 },
        },
        required: ['prompt'],
      },
      response: {
        200: {
          type: 'object',
          properties: {
            intent: {
              type: 'string',
              enum: ['educational', 'solution_seeking', 'gaming', 'off_topic', 'unclear'],
            },
            topics: {
              type: 'array',
              items: { type: 'string' },
            },
            complexity: {
              type: 'string',
              enum: ['simple', 'moderate', 'complex'],
            },
            estimatedTokens: { type: 'number' },
            language: { type: 'string' },
            hasCodeRequest: { type: 'boolean' },
            socialEngineeringScore: { type: 'number' },
          },
        },
        501: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' },
          },
        },
      },
    },
    handler: async (request, reply) => {
      const { prompt } = request.body as { prompt: string };
      
      if (!fastify.ai?.promptValidator) {
        return reply.status(501).send({
          error: 'Not Implemented',
          message: 'Prompt analysis not available',
        });
      }

      const analysis = await fastify.ai.promptValidator.analyzePrompt(prompt);
      return reply.send(analysis);
    },
  });
}