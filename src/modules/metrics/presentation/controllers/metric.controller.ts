import type { FastifyRequest, FastifyReply } from 'fastify';
import { TrackMetricsUseCase, TrackMetricsDTO } from '../../application/use-cases/track-metrics.use-case';
import { GetSessionMetricsUseCase } from '../../application/use-cases/get-session-metrics.use-case';
import { StreamMetricsUseCase, StreamMetricsDTO } from '../../application/use-cases/stream-metrics.use-case';
import { logger } from '@/shared/infrastructure/monitoring/logger';

export class MetricController {
  constructor(
    private readonly trackMetricsUseCase: TrackMetricsUseCase,
    private readonly getSessionMetricsUseCase: GetSessionMetricsUseCase,
    private readonly streamMetricsUseCase: StreamMetricsUseCase
  ) {}

  trackMetrics = async (
    request: FastifyRequest<{ Body: TrackMetricsDTO }>,
    reply: FastifyReply
  ): Promise<void> => {
    try {
      const user = request.user as { id: string };
      const result = await this.trackMetricsUseCase.execute(user.id, request.body);
      
      return reply.send({
        success: true,
        data: result,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to track metrics');
      
      if (error instanceof Error && error.message === 'Invalid attempt') {
        return reply.status(403).send({
          error: 'Forbidden',
          message: 'Invalid attempt or unauthorized',
        });
      }

      return reply.status(500).send({
        error: 'Internal server error',
        message: 'Failed to track metrics',
      });
    }
  };

  getSessionMetrics = async (
    request: FastifyRequest<{ Params: { attemptId: string } }>,
    reply: FastifyReply
  ): Promise<void> => {
    try {
      const user = request.user as { id: string };
      const result = await this.getSessionMetricsUseCase.execute(
        user.id,
        request.params.attemptId
      );
      
      return reply.send(result);
    } catch (error) {
      logger.error({ error }, 'Failed to get session metrics');
      
      if (error instanceof Error && error.message.includes('Invalid attempt')) {
        return reply.status(403).send({
          error: 'Forbidden',
          message: 'Invalid attempt or unauthorized',
        });
      }

      return reply.status(500).send({
        error: 'Internal server error',
        message: 'Failed to retrieve session metrics',
      });
    }
  };

  startStream = async (
    request: FastifyRequest<{ Body: StreamMetricsDTO }>,
    reply: FastifyReply
  ): Promise<void> => {
    try {
      const user = request.user as { id: string };
      await this.streamMetricsUseCase.startStream(user.id, request.body);
      
      return reply.send({
        success: true,
        message: 'Metrics stream started',
      });
    } catch (error) {
      logger.error({ error }, 'Failed to start metrics stream');
      
      return reply.status(500).send({
        error: 'Internal server error',
        message: 'Failed to start metrics stream',
      });
    }
  };

  stopStream = async (
    request: FastifyRequest<{ Params: { attemptId: string } }>,
    reply: FastifyReply
  ): Promise<void> => {
    try {
      const user = request.user as { id: string };
      this.streamMetricsUseCase.stopStream(user.id, request.params.attemptId);
      
      return reply.send({
        success: true,
        message: 'Metrics stream stopped',
      });
    } catch (error) {
      logger.error({ error }, 'Failed to stop metrics stream');
      
      return reply.status(500).send({
        error: 'Internal server error',
        message: 'Failed to stop metrics stream',
      });
    }
  };
}