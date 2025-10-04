import type { FastifyInstance, RouteHandlerMethod } from 'fastify';
import { MetricController } from '../controllers/metric.controller';

export async function metricRoutes(
  fastify: FastifyInstance,
  controller: MetricController
): Promise<void> {
  // RESTful route for creating/tracking metrics
  fastify.post('/', {
    preHandler: [fastify.authenticate],
    schema: {
      body: {
        type: 'object',
        properties: {
          attemptId: { type: 'string' },
          totalLines: { type: 'number', minimum: 0 },
          linesFromAI: { type: 'number', minimum: 0 },
          linesTyped: { type: 'number', minimum: 0 },
          copyPasteEvents: { type: 'number', minimum: 0 },
          deleteEvents: { type: 'number', minimum: 0 },
          testRuns: { type: 'number', minimum: 0 },
          testsPassed: { type: 'number', minimum: 0 },
          testsTotal: { type: 'number', minimum: 0 },
          checklistItems: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                label: { type: 'string' },
                checked: { type: 'boolean' },
                weight: { type: 'number', default: 1 },
                category: {
                  type: 'string',
                  enum: ['validation', 'security', 'testing', 'documentation']
                },
              },
              required: ['id', 'label', 'checked', 'category'],
            },
          },
          sessionTime: { type: 'number', minimum: 0 },
          aiUsageTime: { type: 'number', minimum: 0 },
          manualCodingTime: { type: 'number', minimum: 0 },
          debugTime: { type: 'number', minimum: 0 },
        },
        required: [
          'attemptId',
          'totalLines',
          'linesFromAI',
          'linesTyped',
          'copyPasteEvents',
          'deleteEvents',
          'testRuns',
          'testsPassed',
          'testsTotal',
          'checklistItems',
          'sessionTime'
        ],
      },
      response: {
        201: {
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
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                attempt: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    challengeTitle: { type: 'string' },
                    difficulty: { type: 'string' },
                    category: { type: 'string' },
                    status: { type: 'string' },
                    startedAt: { type: ['string', 'null'] },
                  },
                },
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
                summary: {
                  type: 'object',
                  properties: {
                    totalTime: { type: 'number' },
                    totalSnapshots: { type: 'number' },
                    currentDI: { type: 'number' },
                    currentPR: { type: 'number' },
                    currentCS: { type: 'number' },
                    initialDI: { type: 'number' },
                    initialPR: { type: 'number' },
                    initialCS: { type: 'number' },
                    improvement: {
                      type: 'object',
                      properties: {
                        DI: { type: 'number' },
                        PR: { type: 'number' },
                        CS: { type: 'number' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    handler: controller.getSessionMetrics as RouteHandlerMethod,
  });

  // RESTful streaming routes
  fastify.post('/stream', {
    preHandler: [fastify.authenticate],
    schema: {
      body: {
        type: 'object',
        properties: {
          attemptId: { type: 'string' },
          interval: { type: 'number', minimum: 1000, maximum: 30000, default: 5000 },
        },
        required: ['attemptId'],
      },
      response: {
        201: {
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

  fastify.delete('/stream/:attemptId', {
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
        204: {
          type: 'null',
        },
      },
    },
    handler: controller.stopStream as RouteHandlerMethod,
  });
}