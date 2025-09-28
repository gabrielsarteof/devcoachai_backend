import type { FastifyInstance, RouteHandlerMethod } from 'fastify';
import { zodToJsonSchema } from 'zod-to-json-schema';
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

  // Endpoint para chat com IA
  fastify.post('/chat', {
    preHandler: [fastify.authenticate],
    schema: {
      body: {
        type: 'object',
        properties: {
          messages: {
            type: 'array',
            minItems: 1,
            items: {
              type: 'object',
              properties: {
                role: { type: 'string' },
                content: { type: 'string' }
              },
              required: ['role', 'content']
            }
          },
          challengeId: { type: 'string' },
          attemptId: { type: 'string' },
          model: { type: 'string' },
          provider: { type: 'string', enum: ['openai', 'anthropic', 'google'] },
          config: {
            type: 'object',
            properties: {
              temperature: { type: 'number', minimum: 0, maximum: 2 },
              maxTokens: { type: 'number', minimum: 1 },
              stream: { type: 'boolean' },
            },
            additionalProperties: false,
          },
        },
        required: ['messages'],
        additionalProperties: false,
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                content: { type: 'string' },
                usage: {
                  type: 'object',
                  properties: {
                    promptTokens: { type: 'number' },
                    completionTokens: { type: 'number' },
                    totalTokens: { type: 'number' }
                  }
                },
                cost: { type: 'number' }
              }
            },
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

  // Endpoint para rastreamento de copy/paste
  fastify.post('/track-copy-paste', {
    preHandler: [fastify.authenticate],
    schema: {
      body: {
        type: 'object',
        properties: {
          attemptId: { type: 'string' },
          action: { type: 'string', enum: ['copy', 'paste'] },
          content: { type: 'string' },
          sourceLines: { type: 'number', minimum: 1 },
          targetLines: { type: 'number', minimum: 1 },
          timestamp: { type: 'number' },
        },
        required: ['attemptId', 'action', 'content'],
        additionalProperties: false,
      },
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
            usage: {
              type: 'object',
              properties: {
                period: {
                  type: 'object',
                  properties: {
                    startDate: { type: 'string' },
                    endDate: { type: 'string' },
                    days: { type: 'number' }
                  }
                },
                tokens: {
                  type: 'object',
                  properties: {
                    used: { type: 'number' },
                    breakdown: { type: 'object' }
                  }
                },
                requests: {
                  type: 'object',
                  properties: {
                    total: { type: 'number' },
                    breakdown: { type: 'object' }
                  }
                },
                cost: {
                  type: 'object',
                  properties: {
                    total: { type: 'number' },
                    breakdown: { type: 'object' }
                  }
                }
              }
            },
            quota: {
              type: 'object',
              properties: {
                daily: {
                  type: 'object',
                  properties: {
                    limit: { type: 'number' },
                    used: { type: 'number' },
                    remaining: { type: 'number' }
                  }
                },
                monthly: {
                  type: 'object',
                  properties: {
                    limit: { type: 'number' },
                    used: { type: 'number' },
                    remaining: { type: 'number' }
                  }
                },
                resetAt: { type: 'string', format: 'date-time' }
              }
            },
            limits: {
              type: 'object',
              properties: {
                requestsPerMinute: {
                  type: 'object',
                  properties: {
                    limit: { type: 'number' },
                    used: { type: 'number' },
                    remaining: { type: 'number' }
                  }
                },
                requestsPerHour: {
                  type: 'object',
                  properties: {
                    limit: { type: 'number' },
                    used: { type: 'number' },
                    remaining: { type: 'number' }
                  }
                },
                tokensPerDay: {
                  type: 'object',
                  properties: {
                    limit: { type: 'number' },
                    used: { type: 'number' },
                    remaining: { type: 'number' }
                  }
                },
                resetTimes: {
                  type: 'object',
                  properties: {
                    minute: { type: 'string', format: 'date-time' },
                    hour: { type: 'string', format: 'date-time' },
                    day: { type: 'string', format: 'date-time' }
                  }
                }
              }
            },
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
            models: {
              type: 'object',
              additionalProperties: {
                type: 'object',
                properties: {
                  models: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        id: { type: 'string' },
                        name: { type: 'string' },
                        contextWindow: { type: 'number' },
                        inputCost: { type: 'number' },
                        outputCost: { type: 'number' },
                        capabilities: {
                          type: 'array',
                          items: { type: 'string' }
                        }
                      }
                    }
                  },
                  available: { type: 'boolean' },
                  error: { type: 'string' }
                }
              }
            },
          },
        },
      },
    },
    handler: aiController.getModels as RouteHandlerMethod,
  });

  // Endpoint de validação de prompt para governança
  fastify.post('/governance/validate', {
    preHandler: [fastify.authenticate],
    schema: {
      body: {
        type: 'object',
        properties: {
          challengeId: { type: 'string' },
          prompt: { type: 'string', minLength: 1, maxLength: 10000 },
          userLevel: { type: 'number', minimum: 1, maximum: 10 },
          attemptId: { type: 'string' },
          config: {
            type: 'object',
            properties: {
              strictMode: { type: 'boolean' },
              contextSimilarityThreshold: { type: 'number', minimum: 0, maximum: 1 },
              offTopicThreshold: { type: 'number', minimum: 0, maximum: 1 },
              blockDirectSolutions: { type: 'boolean' },
              allowedDeviationPercentage: { type: 'number', minimum: 0, maximum: 100 },
              enableSemanticAnalysis: { type: 'boolean' },
            },
            additionalProperties: false,
          },
        },
        required: ['challengeId', 'prompt'],
        additionalProperties: false,
      },
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
            relevanceScore: { type: 'number' },
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


  // Endpoint para análise temporal de comportamento
  fastify.post('/governance/analyze-temporal-behavior', {
    preHandler: [fastify.authenticate],
    schema: {
      body: {
        type: 'object',
        properties: {
          userId: { type: 'string' },
          timeWindow: { type: 'string', default: '1h' },
          analysisType: { type: 'string', default: 'interaction_pattern' },
          lookbackMinutes: { type: 'number', minimum: 1, maximum: 120 },
        },
        required: ['userId'],
        additionalProperties: false,
      },
      response: {
        200: {
          type: 'object',
          properties: {
            analysis: {
              type: 'object',
              properties: {
                patterns: { type: 'array' },
                riskScore: { type: 'number' },
                recommendations: { type: 'array' },
                timeWindow: { type: 'string' },
              },
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
    handler: governanceController.analyzeTemporalBehavior as RouteHandlerMethod,
  });

  // Endpoint para feedback educacional
  fastify.post('/governance/educational-feedback', {
    preHandler: [fastify.authenticate],
    schema: {
      body: {
        type: 'object',
        properties: {
          userId: { type: 'string' },
          challengeId: { type: 'string' },
          violationType: { type: 'string' },
          context: { type: 'object' },
        },
        required: ['userId', 'challengeId', 'violationType'],
      },
      response: {
        200: {
          type: 'object',
          properties: {
            feedback: {
              type: 'object',
              properties: {
                message: { type: 'string' },
                suggestions: { type: 'array' },
                educationalContent: { type: 'object' },
              },
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
    handler: governanceController.generateEducationalFeedback as RouteHandlerMethod,
  });

  // Endpoint alternativo para geração de feedback
  fastify.post('/governance/generate-feedback', {
    preHandler: [fastify.authenticate],
    schema: {
      body: {
        type: 'object',
        properties: {
          challengeId: { type: 'string' },
          riskScore: { type: 'number', minimum: 0, maximum: 100 },
          reasons: { type: 'array', items: { type: 'string' } },
          userLevel: { type: 'number', minimum: 1, maximum: 10 },
          tone: { type: 'string', enum: ['encouraging', 'neutral', 'strict'] },
          context: {
            type: 'object',
            properties: {
              challengeId: { type: 'string' },
              title: { type: 'string' },
              keywords: { type: 'array', items: { type: 'string' } },
              forbiddenPatterns: { type: 'array', items: { type: 'string' } },
              category: { type: 'string' },
              allowedTopics: { type: 'array', items: { type: 'string' } },
              techStack: { type: 'array', items: { type: 'string' } },
              learningObjectives: { type: 'array', items: { type: 'string' } },
            },
            additionalProperties: false,
          },
        },
        required: ['challengeId', 'riskScore', 'reasons'],
        additionalProperties: false,
      },
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
    preHandler: [fastify.authenticate, fastify.authorize(['ARCHITECT', 'TECH_LEAD'])],
    schema: {
      querystring: {
        type: 'object',
        properties: {
          challengeId: { type: 'string' },
          startDate: { type: 'string', format: 'date-time' },
          endDate: { type: 'string', format: 'date-time' },
        },
        additionalProperties: false,
      },
      response: {
        200: {
          type: 'object',
          properties: {
            metrics: {
              type: 'object',
              properties: {
                validationStats: {
                  type: 'object',
                  properties: {
                    totalValidations: { type: 'number' },
                    blockedCount: { type: 'number' },
                    throttledCount: { type: 'number' },
                    allowedCount: { type: 'number' },
                    avgRiskScore: { type: 'number' },
                    avgConfidence: { type: 'number' },
                  },
                },
                blockingStats: {
                  type: 'object',
                  properties: {
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
                performanceMetrics: {
                  type: 'object',
                  properties: {
                    avgProcessingTime: { type: 'number' },
                  },
                },
              },
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
    handler: governanceController.getMetrics as RouteHandlerMethod,
  });

  fastify.get('/governance/stats', {
    preHandler: [fastify.authenticate, fastify.authorize(['ARCHITECT', 'TECH_LEAD'])],
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            stats: {
              type: 'object',
              properties: {
                totalValidations: { type: 'number' },
                blockedAttempts: { type: 'number' },
                successRate: { type: 'number' },
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

  // Endpoints administrativos para gestão de cache
  fastify.post('/governance/refresh-challenge-cache', {
    preHandler: [fastify.authenticate, fastify.authorize(['ARCHITECT', 'TECH_LEAD'])],
    schema: {
      body: {
        type: 'object',
        properties: {
          challengeIds: {
            type: 'array',
            items: { type: 'string' },
            minItems: 1,
          },
        },
        required: ['challengeIds'],
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            refreshedChallenges: { type: 'array' },
          },
        },
      },
    },
    handler: governanceController.refreshCache as RouteHandlerMethod,
  });

  fastify.post('/governance/prewarm-cache', {
    preHandler: [fastify.authenticate, fastify.authorize(['ARCHITECT', 'TECH_LEAD'])],
    schema: {
      body: {
        type: 'object',
        properties: {
          challengeIds: {
            type: 'array',
            items: { type: 'string' },
            minItems: 1,
          },
        },
        required: ['challengeIds'],
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            prewarmedChallenges: { type: 'array' },
          },
        },
      },
    },
    handler: governanceController.prewarmCache as RouteHandlerMethod,
  });

  fastify.post('/governance/clear-validation-cache', {
    preHandler: [fastify.authenticate, fastify.authorize(['ARCHITECT', 'TECH_LEAD'])],
    schema: {
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
    handler: governanceController.clearCache as RouteHandlerMethod,
  });

  // Endpoints de compatibilidade para gestão de cache
  fastify.post('/governance/cache/refresh', {
    preHandler: [fastify.authenticate, fastify.authorize(['ARCHITECT', 'TECH_LEAD'])],
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
    preHandler: [fastify.authenticate, fastify.authorize(['ARCHITECT', 'TECH_LEAD'])],
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
    preHandler: [fastify.authenticate, fastify.authorize(['ARCHITECT', 'TECH_LEAD'])],
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

  // Endpoint para análise de prompt
  fastify.post('/governance/analyze-prompt', {
    preHandler: [fastify.authenticate],
    schema: {
      body: {
        type: 'object',
        properties: {
          prompt: { type: 'string', minLength: 1, maxLength: 10000 },
          challengeId: { type: 'string' },
        },
        required: ['prompt'],
      },
      response: {
        200: {
          type: 'object',
          properties: {
            analysis: {
              type: 'object',
              properties: {
                intent: { type: 'string' },
                complexity: { type: 'string' },
                educationalValue: { type: 'number' },
                riskFactors: { type: 'array' },
              },
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
    handler: governanceController.analyzePrompt as RouteHandlerMethod,
  });

  // Endpoint alternativo para análise de prompt
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