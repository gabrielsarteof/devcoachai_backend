import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { OpenAIProvider } from '../providers/openai.provider';
import { AnthropicProvider } from '../providers/anthropic.provider';
import { GoogleProvider } from '../providers/google.provider';
import { ProviderFactoryService } from '../services/provider-factory.service';
import { RateLimiterService } from '../services/rate-limiter.service';
import { UsageTrackerService } from '../services/usage-tracker.service';
import { CopyPasteDetectorService } from '../services/copy-paste-detector.service';
import { PromptValidatorService } from '../services/prompt-validator.service';
import { ChallengeContextService } from '../services/challenge-context.service';
import { ChatWithAIUseCase } from '../../application/use-cases/chat-with-ai.use-case';
import { TrackCopyPasteUseCase } from '../../application/use-cases/track-copy-paste.use-case';
import { AnalyzeConversationUseCase } from '../../application/use-cases/analyze-conversation.use-case';
import { ValidatePromptUseCase } from '../../application/use-cases/validate-prompt.use-case';
import { AnalyzeTemporalBehaviorUseCase } from '../../application/use-cases/analyze-temporal-behavior.use-case';
import { AIProxyController } from '../../presentation/controllers/ai-proxy.controller';
import { aiRoutes } from '../../presentation/routes/ai.routes';
import { AIInteractionRepository } from '../repositories/ai-interaction.repository';
import { ConversationAnalyzerService } from '../services/conversation-analyzer.service';
import { SemanticAnalyzerService } from '../services/semantic-analyzer.service';
import { HybridPromptValidatorService } from '../services/hybrid-prompt-validator.service';
import { TemporalAnalyzerService } from '../services/temporal-analyzer.service';
import { EducationalFeedbackService } from '../services/educational-feedback.service';

export interface AIPluginOptions {
  prisma: PrismaClient;
  redis: Redis;
}

const aiPlugin: FastifyPluginAsync<AIPluginOptions> = async function (
  fastify: FastifyInstance,
  options: AIPluginOptions
): Promise<void> {
  const { prisma, redis } = options;

  const aiInteractionRepository = new AIInteractionRepository(prisma);

  const rateLimiter = new RateLimiterService(redis, {
    maxRequestsPerMinute: parseInt(process.env.AI_MAX_REQUESTS_PER_MINUTE || '20'),
    maxRequestsPerHour: parseInt(process.env.AI_MAX_REQUESTS_PER_HOUR || '100'),
    maxTokensPerDay: parseInt(process.env.AI_MAX_TOKENS_PER_DAY || '100000'),
    burstLimit: parseInt(process.env.AI_BURST_LIMIT || '5'),
  });

  const usageTracker = new UsageTrackerService(prisma, redis);
  const copyPasteDetector = new CopyPasteDetectorService(prisma, redis);

  const promptValidator = new PromptValidatorService(redis);
  const semanticAnalyzer = process.env.ENABLE_SEMANTIC_ANALYSIS === 'true' && process.env.OPENAI_API_KEY
    ? new SemanticAnalyzerService(redis, process.env.OPENAI_API_KEY)
    : null;

  const hybridValidator = semanticAnalyzer
    ? new HybridPromptValidatorService(redis, promptValidator, semanticAnalyzer)
    : promptValidator;

  const challengeContextService = new ChallengeContextService(prisma, redis);

  const providerFactory = new ProviderFactoryService(redis);

  const temporalAnalyzer = new TemporalAnalyzerService(prisma, redis);
  const educationalFeedback = new EducationalFeedbackService(redis);

  const chatWithAIUseCase = new ChatWithAIUseCase(
    providerFactory,
    rateLimiter,
    usageTracker,
    prisma
  );

  const trackCopyPasteUseCase = new TrackCopyPasteUseCase(copyPasteDetector);

  const analyzeConversationUseCase = new AnalyzeConversationUseCase(
    new ConversationAnalyzerService(),
    aiInteractionRepository
  );

  const validatePromptUseCase = new ValidatePromptUseCase(
    hybridValidator,
    challengeContextService,
    prisma
  );

  const analyzeTemporalBehaviorUseCase = new AnalyzeTemporalBehaviorUseCase(
    temporalAnalyzer,
    educationalFeedback
  );

  const controller = new AIProxyController(
    rateLimiter,
    usageTracker,
    trackCopyPasteUseCase,
    validatePromptUseCase,
    analyzeTemporalBehaviorUseCase,
    educationalFeedback,
    challengeContextService
  );

  const providers: string[] = [];

  if (process.env.OPENAI_API_KEY) {
    const openAIProvider = new OpenAIProvider(
      process.env.OPENAI_API_KEY,
      redis,
      process.env.OPENAI_ORG_ID
    );
    controller.registerProvider('openai', openAIProvider);
    providers.push('openai');
  }

  if (process.env.ANTHROPIC_API_KEY) {
    const anthropicProvider = new AnthropicProvider(
      process.env.ANTHROPIC_API_KEY,
      redis
    );
    controller.registerProvider('anthropic', anthropicProvider);
    providers.push('anthropic');
  }

  if (process.env.GOOGLE_API_KEY) {
    const googleProvider = new GoogleProvider(
      process.env.GOOGLE_API_KEY,
      redis
    );
    controller.registerProvider('google', googleProvider);
    providers.push('google');

  }

  fastify.decorate('ai', {
    chatWithAI: chatWithAIUseCase,
    trackCopyPaste: trackCopyPasteUseCase,
    analyzeConversation: analyzeConversationUseCase,
    validatePrompt: validatePromptUseCase,
    promptValidator,
    challengeContextService,
    analyzeTemporalBehavior: analyzeTemporalBehaviorUseCase,
    temporalAnalyzer,
    educationalFeedback,
  });

  await fastify.register(async function aiRoutesPlugin(childInstance) {
    await aiRoutes(childInstance, controller);
  }, {
    prefix: '/ai'
  });

  fastify.get('/ai/health', async (_request, reply) => {
    const governanceEnabled = process.env.GOVERNANCE_ENABLED === 'true';
    const semanticEnabled = process.env.ENABLE_SEMANTIC_ANALYSIS === 'true';
    const stats = await challengeContextService.getContextStats();

    let semanticHealth = null;
    if (semanticEnabled && semanticAnalyzer) {
      semanticHealth = semanticAnalyzer.getHealthStatus();
    }

    let hybridMetrics = null;
    if (hybridValidator instanceof HybridPromptValidatorService) {
      hybridMetrics = await hybridValidator.getHealthMetrics();
    }

    return reply.send({
      status: 'healthy',
      providers,
      governance: {
        enabled: governanceEnabled,
        cachedContexts: stats.cachedContexts,
        cacheHitRate: stats.cacheHitRate,
        semantic: {
          enabled: semanticEnabled,
          health: semanticHealth,
          metrics: hybridMetrics,
        },
      },
      timestamp: new Date().toISOString(),
    });
  });


  if (process.env.PREWARM_CHALLENGES) {
    const challengeIds = process.env.PREWARM_CHALLENGES.split(',');
    fastify.log.info(
      { challengeIds },
      'Prewarming challenge context cache'
    );

    challengeContextService.prewarmCache(challengeIds).catch((error) => {
      fastify.log.error(
        { error: error.message },
        'Failed to prewarm challenge cache'
      );
    });
  }

  fastify.log.info({
    providers,
    governanceEnabled: process.env.GOVERNANCE_ENABLED === 'true',
    rateLimits: {
      maxRequestsPerMinute: parseInt(process.env.AI_MAX_REQUESTS_PER_MINUTE || '20'),
      maxRequestsPerHour: parseInt(process.env.AI_MAX_REQUESTS_PER_HOUR || '100'),
      maxTokensPerDay: parseInt(process.env.AI_MAX_TOKENS_PER_DAY || '100000'),
    },
  }, 'AI plugin registered successfully');
};

declare module 'fastify' {
  interface FastifyInstance {
    ai: {
      chatWithAI: ChatWithAIUseCase;
      trackCopyPaste: TrackCopyPasteUseCase;
      analyzeConversation: AnalyzeConversationUseCase;
      validatePrompt: ValidatePromptUseCase;
      promptValidator: PromptValidatorService;
      challengeContextService: ChallengeContextService;
      analyzeTemporalBehavior: AnalyzeTemporalBehaviorUseCase;
      temporalAnalyzer: TemporalAnalyzerService;
      educationalFeedback: EducationalFeedbackService;
    };
  }
}

export default fp(aiPlugin, {
  name: 'ai-plugin',
  dependencies: ['auth-plugin'],
});