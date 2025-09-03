import { z } from 'zod';
import { WebSocketServer } from '@/shared/infrastructure/websocket/socket.server';
import { MetricAggregatorService } from '../../domain/services/metric-aggregator.service';
import { Redis } from 'ioredis';
import { logger } from '@/shared/infrastructure/monitoring/logger';

export const StreamMetricsSchema = z.object({
  attemptId: z.string().cuid(),
  interval: z.number().int().min(1000).max(60000).default(5000),
});

export type StreamMetricsDTO = z.infer<typeof StreamMetricsSchema>;

export class StreamMetricsUseCase {
  private streams: Map<string, NodeJS.Timeout> = new Map();

  constructor(
    private readonly wsServer: WebSocketServer,
    private readonly aggregator: MetricAggregatorService,
    private readonly redis: Redis
  ) {}

  async startStream(userId: string, data: StreamMetricsDTO): Promise<void> {
    const streamKey = `${userId}:${data.attemptId}`;
    
    this.stopStream(userId, data.attemptId);

    logger.info({ userId, attemptId: data.attemptId, interval: data.interval }, 'Starting metrics stream');

    const intervalId = setInterval(async () => {
      try {
        const cacheKey = `metrics:${data.attemptId}:latest`;
        const cached = await this.redis.get(cacheKey);
        
        if (cached) {
          const metrics = JSON.parse(cached);
          
          const trends = await this.aggregator.calculateTrends(data.attemptId, 3);
          
          this.wsServer.emitToAttempt(data.attemptId, 'metrics:stream', {
            metrics,
            trends,
            timestamp: new Date(),
          });
        }
      } catch (error) {
        logger.error({ error, userId, attemptId: data.attemptId }, 'Stream metrics error');
      }
    }, data.interval);

    this.streams.set(streamKey, intervalId);
  }

  stopStream(userId: string, attemptId: string): void {
    const streamKey = `${userId}:${attemptId}`;
    const intervalId = this.streams.get(streamKey);
    
    if (intervalId) {
      clearInterval(intervalId);
      this.streams.delete(streamKey);
      logger.info({ userId, attemptId }, 'Stopped metrics stream');
    }
  }

  stopAllUserStreams(userId: string): void {
    for (const [key, intervalId] of this.streams.entries()) {
      if (key.startsWith(`${userId}:`)) {
        clearInterval(intervalId);
        this.streams.delete(key);
      }
    }
    logger.info({ userId }, 'Stopped all user streams');
  }
}