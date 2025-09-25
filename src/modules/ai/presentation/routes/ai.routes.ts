import type { FastifyInstance, RouteHandlerMethod } from 'fastify';
import { AIController } from '../controllers/ai.controller';
import { AIGovernanceController } from '../controllers/ai-governance.controller';
import {
  CreateAIInteractionSchema,
  TrackCopyPasteSchema,
  PromptValidationRequestSchema,
  ValidationMetricsQuerySchema,
  AnalyzeTemporalBehaviorSchema,
  GenerateFeedbackRequestSchema,
} from '../../domain/schemas/ai-interaction.schema';

export async function aiRoutes(
  fastify: FastifyInstance,
  aiController: AIController,
  governanceController: AIGovernanceController,
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
            temporalAnalysis: { type: 'object', nullable: true },
            educationalFeedback: { type: 'object', nullable: true },
          },
        },
      },
    },
    handler: aiController.chat as RouteHandlerMethod,
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
    handler: aiController.trackCopyPaste as RouteHandlerMethod,
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
            limits: { type: 'object' },
          },
        },
      },
    },
    handler: aiController.getUsage as RouteHandlerMethod,
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
    handler: aiController.getModels as RouteHandlerMethod,
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
    handler: governanceController.validatePrompt as RouteHandlerMethod,
  });

  fastify.post('/governance/analyze-temporal', {
    preHandler: [fastify.authenticate],
    schema: {
      body: AnalyzeTemporalBehaviorSchema,
      response: {
        200: {
          type: 'object',
          properties: {
            overallRisk: { type: 'number' },
            isGamingAttempt: { type: 'boolean' },
            temporalPatterns: { type: 'array' },
            behaviorMetrics: { type: 'object' },
            recommendations: { type: 'array' },
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
    handler: governanceController.analyzeTemporalBehavior as RouteHandlerMethod,
  });

  fastify.post('/governance/generate-feedback', {
    preHandler: [fastify.authenticate],
    schema: {
      body: GenerateFeedbackRequestSchema,
      response: {
        200: {
          type: 'object',
          properties: {
            context: { type: 'object' },
            guidance: { type: 'object' },
            learningPath: { type: 'object' },
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
    handler: governanceController.generateEducationalFeedback as RouteHandlerMethod,
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
    handler: governanceController.getMetrics as RouteHandlerMethod,
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
    handler: governanceController.getStats as RouteHandlerMethod,
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
    handler: governanceController.refreshCache as RouteHandlerMethod,
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
    handler: governanceController.prewarmCache as RouteHandlerMethod,
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
    handler: governanceController.clearCache as RouteHandlerMethod,
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
              enum: [
                'educational',
                'solution_seeking',
                'gaming',
                'off_topic',
                'unclear',
              ],
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
    handler: governanceController.analyzePrompt as RouteHandlerMethod,
  });
}