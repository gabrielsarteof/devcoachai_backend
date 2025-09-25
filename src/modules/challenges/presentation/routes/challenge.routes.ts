import type { FastifyInstance, RouteHandlerMethod } from 'fastify';
import { ChallengeController } from '../controllers/challenge.controller';
import { UserRole } from '@/shared/domain/enums';

export async function challengeRoutes(
  fastify: FastifyInstance,
  controller: ChallengeController
): Promise<void> {
  fastify.get('/', {
    preHandler: [fastify.optionalAuth],
    schema: {
      querystring: {
        type: 'object',
        properties: {
          difficulty: { type: 'string', enum: ['EASY', 'MEDIUM', 'HARD', 'EXPERT'] },
          category: { type: 'string', enum: ['BACKEND', 'FRONTEND', 'FULLSTACK', 'DEVOPS', 'MOBILE', 'DATA'] },
          languages: { type: 'array', items: { type: 'string' } },
          search: { type: 'string' },
          limit: { type: 'number', minimum: 1, maximum: 100, default: 20 },
          offset: { type: 'number', minimum: 0, default: 0 },
        },
      },
    },
    handler: controller.listChallenges as RouteHandlerMethod,
  });

  fastify.get('/:idOrSlug', {
    preHandler: [fastify.optionalAuth],
    schema: {
      params: {
        type: 'object',
        properties: {
          idOrSlug: { type: 'string' },
        },
        required: ['idOrSlug'],
      },
    },
    handler: controller.getChallenge as RouteHandlerMethod,
  });

  fastify.post('/:id/start', {
    preHandler: [fastify.authenticate],
    schema: {
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' },
        },
        required: ['id'],
      },
      body: {
        type: 'object',
        properties: {
          language: { type: 'string' },
        },
        required: ['language'],
      },
    },
    handler: controller.startChallenge as RouteHandlerMethod,
  });

  // ✅ CORRIGIDO: Schema JSON nativo ao invés de Zod
  fastify.post('/submit', {
    preHandler: [fastify.authenticate],
    schema: {
      body: {
        type: 'object',
        properties: {
          challengeId: { type: 'string' },
          attemptId: { type: 'string' },
          code: { type: 'string', minLength: 1 },
          language: { type: 'string' },
        },
        required: ['challengeId', 'attemptId', 'code', 'language'],
      },
    },
    handler: controller.submitSolution as RouteHandlerMethod,
  });

  // ✅ CORRIGIDO: Schema JSON nativo ao invés de Zod
  fastify.post('/analyze', {
    preHandler: [fastify.authenticate],
    schema: {
      body: {
        type: 'object',
        properties: {
          challengeId: { type: 'string' },
          attemptId: { type: 'string' },
          code: { type: 'string' },
          checkpointTime: { type: 'number', minimum: 0 },
        },
        required: ['challengeId', 'attemptId', 'code', 'checkpointTime'],
      },
    },
    handler: controller.analyzeCode as RouteHandlerMethod,
  });

  // --- Rotas de Admin ---

  // ✅ CORRIGIDO: Schema JSON completo ao invés de Zod
  fastify.post('/', {
    preHandler: [
      fastify.authenticate,
      fastify.authorize([UserRole.SENIOR, UserRole.TECH_LEAD, UserRole.ARCHITECT]),
    ],
    schema: {
      body: {
        type: 'object',
        properties: {
          slug: { 
            type: 'string', 
            pattern: '^[a-z0-9-]+$'
          },
          title: { 
            type: 'string', 
            minLength: 5, 
            maxLength: 100 
          },
          description: { 
            type: 'string', 
            minLength: 20, 
            maxLength: 500 
          },
          difficulty: { 
            type: 'string', 
            enum: ['EASY', 'MEDIUM', 'HARD', 'EXPERT'] 
          },
          category: { 
            type: 'string', 
            enum: ['BACKEND', 'FRONTEND', 'FULLSTACK', 'DEVOPS', 'MOBILE', 'DATA'] 
          },
          estimatedMinutes: { 
            type: 'number', 
            minimum: 5, 
            maximum: 480 
          },
          languages: { 
            type: 'array', 
            items: { type: 'string' },
            minItems: 1 
          },
          instructions: { 
            type: 'string', 
            minLength: 50 
          },
          starterCode: { 
            type: 'string' 
          },
          solution: { 
            type: 'string', 
            minLength: 10 
          },
          testCases: {
            type: 'array',
            minItems: 3,
            items: {
              type: 'object',
              properties: {
                input: { type: 'string' },
                expectedOutput: { type: 'string' },
                weight: { type: 'number', minimum: 0, maximum: 1 },
                description: { type: 'string' },
              },
              required: ['input', 'expectedOutput', 'weight'],
            },
          },
          hints: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                trigger: { type: 'string' },
                message: { type: 'string' },
                cost: { type: 'number', default: 10 },
              },
              required: ['trigger', 'message'],
            },
          },
          traps: {
            type: 'array',
            minItems: 1,
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                type: { type: 'string', enum: ['security', 'performance', 'logic', 'architecture'] },
                buggedCode: { type: 'string' },
                correctCode: { type: 'string' },
                explanation: { type: 'string' },
                detectionPattern: { type: 'string' },
                severity: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
              },
              required: ['id', 'type', 'buggedCode', 'correctCode', 'explanation', 'detectionPattern', 'severity'],
            },
          },
          baseXp: { 
            type: 'number', 
            minimum: 50, 
            maximum: 1000, 
            default: 100 
          },
          bonusXp: { 
            type: 'number', 
            minimum: 0, 
            maximum: 500, 
            default: 50 
          },
          targetMetrics: {
            type: 'object',
            properties: {
              maxDI: { type: 'number', minimum: 0, maximum: 100, default: 40 },
              minPR: { type: 'number', minimum: 0, maximum: 100, default: 70 },
              minCS: { type: 'number', minimum: 0, maximum: 10, default: 8 },
            },
          },
        },
        required: ['slug', 'title', 'description', 'difficulty', 'category', 'estimatedMinutes', 'languages', 'instructions', 'solution', 'testCases', 'traps'],
      },
    },
    handler: controller.createChallenge as RouteHandlerMethod,
  });

  fastify.patch('/:id', {
    preHandler: [
      fastify.authenticate,
      fastify.authorize([UserRole.SENIOR, UserRole.TECH_LEAD, UserRole.ARCHITECT]),
    ],
    schema: {
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' },
        },
        required: ['id'],
      },
      // Para update parcial, todos os campos são opcionais
      body: {
        type: 'object',
        properties: {
          slug: { type: 'string', pattern: '^[a-z0-9-]+$' },
          title: { type: 'string', minLength: 5, maxLength: 100 },
          description: { type: 'string', minLength: 20, maxLength: 500 },
          difficulty: { type: 'string', enum: ['EASY', 'MEDIUM', 'HARD', 'EXPERT'] },
          category: { type: 'string', enum: ['BACKEND', 'FRONTEND', 'FULLSTACK', 'DEVOPS', 'MOBILE', 'DATA'] },
          estimatedMinutes: { type: 'number', minimum: 5, maximum: 480 },
          languages: { type: 'array', items: { type: 'string' }, minItems: 1 },
          instructions: { type: 'string', minLength: 50 },
          starterCode: { type: 'string' },
          solution: { type: 'string', minLength: 10 },
          testCases: {
            type: 'array',
            minItems: 3,
            items: {
              type: 'object',
              properties: {
                input: { type: 'string' },
                expectedOutput: { type: 'string' },
                weight: { type: 'number', minimum: 0, maximum: 1 },
                description: { type: 'string' },
              },
              required: ['input', 'expectedOutput', 'weight'],
            },
          },
          hints: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                trigger: { type: 'string' },
                message: { type: 'string' },
                cost: { type: 'number' },
              },
              required: ['trigger', 'message'],
            },
          },
          traps: {
            type: 'array',
            minItems: 1,
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                type: { type: 'string', enum: ['security', 'performance', 'logic', 'architecture'] },
                buggedCode: { type: 'string' },
                correctCode: { type: 'string' },
                explanation: { type: 'string' },
                detectionPattern: { type: 'string' },
                severity: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
              },
              required: ['id', 'type', 'buggedCode', 'correctCode', 'explanation', 'detectionPattern', 'severity'],
            },
          },
          baseXp: { type: 'number', minimum: 50, maximum: 1000 },
          bonusXp: { type: 'number', minimum: 0, maximum: 500 },
          targetMetrics: {
            type: 'object',
            properties: {
              maxDI: { type: 'number', minimum: 0, maximum: 100 },
              minPR: { type: 'number', minimum: 0, maximum: 100 },
              minCS: { type: 'number', minimum: 0, maximum: 10 },
            },
          },
        },
      },
    },
    handler: controller.updateChallenge as RouteHandlerMethod,
  });

  fastify.delete('/:id', {
    preHandler: [
      fastify.authenticate,
      fastify.authorize([UserRole.TECH_LEAD, UserRole.ARCHITECT]),
    ],
    schema: {
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' },
        },
        required: ['id'],
      },
    },
    handler: controller.deleteChallenge as RouteHandlerMethod,
  });
}