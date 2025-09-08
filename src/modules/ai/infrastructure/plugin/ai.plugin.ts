import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { OpenAIProvider } from '../providers/openai.provider';
import { AnthropicProvider } from '../providers/anthropic.provider';
import { RateLimiterService } from '../services/rate-limiter.service';
import { UsageTrackerService } from '../services/usage-tracker.service';
import { CopyPasteDetectorService } from '../services/copy-paste-detector.service';
import { TrackCopyPasteUseCase } from '../../application/use-cases/track-copy-paste.use-case';
import { AIProxyController } from '../../presentation/controllers/ai-proxy.controller';
import { aiRoutes } from '../../presentation/routes/ai.routes';

export interface AIPluginOptions {
  prisma: PrismaClient;
  redis: Redis;
}

const aiPlugin: FastifyPluginAsync<AIPluginOptions> = async function(
  fastify: FastifyInstance,
  options: AIPluginOptions
): Promise<void> {
  const rateLimiter = new RateLimiterService(options.redis);
  const usageTracker = new UsageTrackerService(options.prisma, options.redis);
  const copyPasteDetector = new CopyPasteDetectorService(options.prisma, options.redis);
  
  const trackCopyPasteUseCase = new TrackCopyPasteUseCase(copyPasteDetector);
  
  const controller = new AIProxyController(
    rateLimiter,
    usageTracker,
    trackCopyPasteUseCase
  );

  if (process.env.OPENAI_API_KEY) {
    const openAIProvider = new OpenAIProvider(
      process.env.OPENAI_API_KEY,
      options.redis,
      process.env.OPENAI_ORG_ID
    );
    controller.registerProvider('openai', openAIProvider);
  }

  if (process.env.ANTHROPIC_API_KEY) {
    const anthropicProvider = new AnthropicProvider(
      process.env.ANTHROPIC_API_KEY,
      options.redis
    );
    controller.registerProvider('anthropic', anthropicProvider);
  }

  await fastify.register(async function aiRoutesPlugin(childInstance) {
    await aiRoutes(childInstance, controller);
  }, {
    prefix: '/ai'
  });

  fastify.log.info('AI plugin registered successfully');
};

export default fp(aiPlugin, {
  name: 'ai-plugin',
  dependencies: ['auth-plugin'],
});