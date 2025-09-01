import type { FastifyInstance, RouteHandlerMethod } from 'fastify';
import { ChallengeController } from '../controllers/challenge.controller';
import { CreateChallengeSchema } from '../../domain/schemas/challenge.schema';
import { SubmitSolutionSchema } from '../../application/use-cases/submit-solution.use-case';
import { AnalyzeCodeSchema } from '../../application/use-cases/analyze-code.use-case';
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

  fastify.post('/submit', {
    preHandler: [fastify.authenticate],
    schema: {
      body: SubmitSolutionSchema,
    },
    handler: controller.submitSolution as RouteHandlerMethod,
  });

  fastify.post('/analyze', {
    preHandler: [fastify.authenticate],
    schema: {
      body: AnalyzeCodeSchema,
    },
    handler: controller.analyzeCode as RouteHandlerMethod,
  });

  fastify.post('/', {
    preHandler: [
      fastify.authenticate,
      fastify.authorize([UserRole.SENIOR, UserRole.TECH_LEAD, UserRole.ARCHITECT]),
    ],
    schema: {
      body: CreateChallengeSchema,
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