import type { FastifyInstance, RouteHandlerMethod } from 'fastify';
import { MetricController } from '../controllers/metric.controller';
import { TrackMetricsSchema } from '../../application/use-cases/track-metrics.use-case';
import { StreamMetricsSchema } from '../../application/use-cases/stream-metrics.use-case';

export async function metricRoutes(
  fastify: FastifyInstance,
  controller: MetricController
): Promise<void> {
  fastify.post('/track', {
    preHandler: [fastify.authenticate],
    schema: {
      body: TrackMetricsSchema,
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                metricSnapshot: { type: 'object' },
                calculation: {
                  type: 'object',
                  properties: {
                    dependencyIndex: { type: 'number' },
                    passRate: { type: 'number' },
                    checklistScore: { type: 'number' },
                    timestamp: { type: 'string', format: 'date-time' },
                    sessionTime: { type: 'number' },
                  },
                },
                riskAssessment: {
                  type: 'object',
                  properties: {
                    level: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] },
                    factors: { type: 'array', items: { type: 'string' } },
                    recommendations: { type: 'array', items: { type: 'string' } },
                    score: { type: 'number' },
                  },
                },
                insights: { type: 'array', items: { type: 'string' } },
              },
            },
          },
        },
      },
    },
    handler: controller.trackMetrics as RouteHandlerMethod,
  });

  fastify.get('/session/:attemptId', {
    preHandler: [fastify.authenticate],
    schema: {
      params: {
        type: 'object',
        properties: {
          attemptId: { type: 'string' },
        },
        required: ['attemptId'],
      },
      response: {
        200: {
          type: 'object',
          properties: {
            attempt: { type: 'object' },
            metrics: { type: 'array' },
            trends: { type: 'object' },
            userAverages: {
              type: 'object',
              properties: {
                averageDI: { type: 'number' },
                averagePR: { type: 'number' },
                averageCS: { type: 'number' },
              },
            },
            summary: { type: 'object' },
          },
        },
      },
    },
    handler: controller.getSessionMetrics as RouteHandlerMethod,
  });

  fastify.post('/stream/start', {
    preHandler: [fastify.authenticate],
    schema: {
      body: StreamMetricsSchema,
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
    handler: controller.startStream as RouteHandlerMethod,
  });

  fastify.post('/stream/stop/:attemptId', {
    preHandler: [fastify.authenticate],
    schema: {
      params: {
        type: 'object',
        properties: {
          attemptId: { type: 'string' },
        },
        required: ['attemptId'],
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
    handler: controller.stopStream as RouteHandlerMethod,
  });
}