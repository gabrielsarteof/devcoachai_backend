import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { WebSocketServer } from '@/shared/infrastructure/websocket/socket.server';
import { MetricRepository } from '../repositories/metric.repository';
import { MetricCalculatorService } from '../../domain/services/metric-calculator.service';
import { MetricAggregatorService } from '../../domain/services/metric-aggregator.service';
import { TrackMetricsUseCase } from '../../application/use-cases/track-metrics.use-case';
import { GetSessionMetricsUseCase } from '../../application/use-cases/get-session-metrics.use-case';
import { StreamMetricsUseCase } from '../../application/use-cases/stream-metrics.use-case';
import { MetricController } from '../../presentation/controllers/metric.controller';
import { metricRoutes } from '../../presentation/routes/metric.routes';

export interface MetricPluginOptions {
  prisma: PrismaClient;
  redis: Redis;
  wsServer: WebSocketServer;
}

const metricPlugin: FastifyPluginAsync<MetricPluginOptions> = async function(
  fastify: FastifyInstance,
  options: MetricPluginOptions
): Promise<void> {
  const repository = new MetricRepository(options.prisma);
  const calculator = new MetricCalculatorService();
  const aggregator = new MetricAggregatorService(options.prisma, options.redis);

  const trackMetricsUseCase = new TrackMetricsUseCase(
    repository,
    calculator,
    options.wsServer
  );

  const getSessionMetricsUseCase = new GetSessionMetricsUseCase(
    repository,
    aggregator,
    options.prisma
  );

  const streamMetricsUseCase = new StreamMetricsUseCase(
    options.wsServer,
    aggregator,
    options.redis
  );

  const controller = new MetricController(
    trackMetricsUseCase,
    getSessionMetricsUseCase,
    streamMetricsUseCase
  );

  await fastify.register(async function metricRoutesPlugin(childInstance) {
    await metricRoutes(childInstance, controller);
  }, {
    prefix: '/metrics'
  });

  fastify.log.info('Metric plugin registered successfully');
};

export default fp(metricPlugin, {
  name: 'metric-plugin',
  dependencies: ['auth-plugin', 'websocket-plugin'],
});