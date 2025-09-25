import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
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
import { GetAIModelsUseCase } from '../../application/use-cases/get-ai-models.use-case';
import { GetAIUsageUseCase } from '../../application/use-cases/get-ai-usage.use-case';
import { GetGovernanceMetricsUseCase } from '../../application/use-cases/get-governance-metrics.use-case';
import { GetGovernanceStatsUseCase } from '../../application/use-cases/get-governance-stats.use-case';
import { RefreshChallengeCacheUseCase } from '../../application/use-cases/refresh-challenge-cache.use-case';
import { PrewarmCacheUseCase } from '../../application/use-cases/prewarm-cache.use-case';
import { ClearValidationCacheUseCase } from '../../application/use-cases/clear-validation-cache.use-case';
import { AnalyzePromptUseCase } from '../../application/use-cases/analyze-prompt.use-case';
import { GenerateEducationalFeedbackUseCase } from '../../application/use-cases/generate-educational-feedback.use-case';
import { AIController } from '../../presentation/controllers/ai.controller';
import { AIGovernanceController } from '../../presentation/controllers/ai-governance.controller';
import { aiRoutes } from '../../presentation/routes/ai.routes';
import { AIInteractionRepository } from '../repositories/ai-interaction.repository';
import { ConversationAnalyzerService } from '../services/conversation-analyzer.service';
import { SemanticAnalyzerService } from '../services/semantic-analyzer.service';
import { HybridPromptValidatorService } from '../services/hybrid-prompt-validator.service';
import { TemporalAnalyzerService } from '../services/temporal-analyzer.service';
import { EducationalFeedbackService } from '../services/educational-feedback.service';
import { UsageQuotaService } from '../services/usage-quota.service';
import { RateLimitInfoService } from '../services/rate-limit-info.service';

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

  const usageQuotaService = new UsageQuotaService(usageTracker);
  const rateLimitInfoService = new RateLimitInfoService(rateLimiter);

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

  const getAIModelsUseCase = new GetAIModelsUseCase(providerFactory);
  const getAIUsageUseCase = new GetAIUsageUseCase(
    usageTracker,
    usageQuotaService,
    rateLimitInfoService
  );
  const getGovernanceMetricsUseCase = new GetGovernanceMetricsUseCase(hybridValidator);
  const getGovernanceStatsUseCase = new GetGovernanceStatsUseCase(challengeContextService);
  const refreshChallengeCacheUseCase = new RefreshChallengeCacheUseCase(challengeContextService);
  const prewarmCacheUseCase = new PrewarmCacheUseCase(challengeContextService);
  const clearValidationCacheUseCase = new ClearValidationCacheUseCase(hybridValidator);
  const analyzePromptUseCase = new AnalyzePromptUseCase(hybridValidator);
  const generateEducationalFeedbackUseCase = new GenerateEducationalFeedbackUseCase(educationalFeedback);

  const aiController = new AIController(
    chatWithAIUseCase,
    trackCopyPasteUseCase,
    getAIModelsUseCase,
    getAIUsageUseCase
  );

  const governanceController = new AIGovernanceController(
    validatePromptUseCase,
    analyzeTemporalBehaviorUseCase,
    generateEducationalFeedbackUseCase,
    getGovernanceMetricsUseCase,
    getGovernanceStatsUseCase,
    refreshChallengeCacheUseCase,
    prewarmCacheUseCase,
    clearValidationCacheUseCase,
    analyzePromptUseCase
  );

  const providers: string[] = [];

  // ProviderFactory já registra providers automaticamente baseado em ENV vars
  const availableProviders = providerFactory.getAvailableProviders();
  providers.push(...availableProviders);

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
    await aiRoutes(childInstance, aiController, governanceController);
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