import type { FastifyInstance, RouteHandlerMethod } from 'fastify';
import { AIProxyController } from '../controllers/ai-proxy.controller';
import { CreateAIInteractionSchema, TrackCopyPasteSchema } from '../../domain/schemas/ai-interaction.schema';

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
    },
    handler: controller.getUsage as RouteHandlerMethod, 
  });

  fastify.get('/models', {
    preHandler: [fastify.authenticate],
    handler: controller.getModels as RouteHandlerMethod, 
  });
}