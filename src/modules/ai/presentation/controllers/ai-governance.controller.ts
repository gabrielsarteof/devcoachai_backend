import type { FastifyRequest, FastifyReply } from 'fastify';
import { ValidatePromptUseCase } from '../../application/use-cases/validate-prompt.use-case';
import { AnalyzeTemporalBehaviorUseCase } from '../../application/use-cases/analyze-temporal-behavior.use-case';
import { GenerateEducationalFeedbackUseCase } from '../../application/use-cases/generate-educational-feedback.use-case';
import { GetGovernanceMetricsUseCase, GetGovernanceMetricsDTO } from '../../application/use-cases/get-governance-metrics.use-case';
import { GetGovernanceStatsUseCase } from '../../application/use-cases/get-governance-stats.use-case';
import { RefreshChallengeCacheUseCase, RefreshChallengeCacheDTO } from '../../application/use-cases/refresh-challenge-cache.use-case';
import { PrewarmCacheUseCase, PrewarmCacheDTO } from '../../application/use-cases/prewarm-cache.use-case';
import { ClearValidationCacheUseCase, ClearValidationCacheDTO } from '../../application/use-cases/clear-validation-cache.use-case';
import { AnalyzePromptUseCase, AnalyzePromptDTO } from '../../application/use-cases/analyze-prompt.use-case';
import {
  PromptValidationRequestDTO,
  AnalyzeTemporalBehaviorDTO,
  GenerateFeedbackRequestDTO
} from '../../domain/schemas/ai-interaction.schema';
import { logger } from '@/shared/infrastructure/monitoring/logger';

export class AIGovernanceController {
  constructor(
    private readonly validatePromptUseCase: ValidatePromptUseCase,
    private readonly analyzeTemporalBehaviorUseCase: AnalyzeTemporalBehaviorUseCase,
    private readonly generateEducationalFeedbackUseCase: GenerateEducationalFeedbackUseCase,
    private readonly getGovernanceMetricsUseCase: GetGovernanceMetricsUseCase,
    private readonly getGovernanceStatsUseCase: GetGovernanceStatsUseCase,
    private readonly refreshChallengeCacheUseCase: RefreshChallengeCacheUseCase,
    private readonly prewarmCacheUseCase: PrewarmCacheUseCase,
    private readonly clearValidationCacheUseCase: ClearValidationCacheUseCase,
    private readonly analyzePromptUseCase: AnalyzePromptUseCase
  ) {}

  validatePrompt = async (
    request: FastifyRequest<{ Body: PromptValidationRequestDTO }>,
    reply: FastifyReply
  ): Promise<void> => {
    const startTime = Date.now();
    const requestId = crypto.randomUUID();
    const user = request.user as { id: string; email: string; role: string; level?: number } | undefined;

    if (!user) {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'User not authenticated',
      });
    }

    logger.info({
      requestId,
      operation: 'validate_prompt',
      userId: user.id,
      challengeId: request.body.challengeId,
      attemptId: request.body.attemptId,
      promptLength: request.body.prompt.length,
      ipAddress: request.ip,
    }, 'Prompt validation request received');

    try {
      const result = await this.validatePromptUseCase.execute({
        userId: user.id,
        challengeId: request.body.challengeId,
        prompt: request.body.prompt,
        userLevel: request.body.userLevel || user.level,
        attemptId: request.body.attemptId,
        config: request.body.config,
      });

      const executionTime = Date.now() - startTime;

      logger.info({
        requestId,
        userId: user.id,
        challengeId: request.body.challengeId,
        isValid: result.isValid,
        riskScore: result.riskScore,
        classification: result.classification,
        confidence: result.confidence,
        relevanceScore: result.relevanceScore,
        executionTime,
      }, 'Prompt validation completed');

      return reply.status(200).send(result);
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      // Tratamento específico para desafios não encontrados
      if (errorMessage.includes('Challenge not found') || errorMessage.includes('not found')) {
        logger.warn({
          requestId,
          userId: user.id,
          challengeId: request.body.challengeId,
          error: errorMessage,
          reason: 'challenge_not_found',
          executionTime,
        }, 'Challenge not found for validation');

        return reply.status(404).send({
          error: 'Not Found',
          message: 'Challenge not found',
        });
      }

      if (errorMessage.includes('not available') || errorMessage.includes('Not Implemented')) {
        logger.warn({
          requestId,
          userId: user.id,
          error: errorMessage,
          reason: 'governance_unavailable',
          executionTime,
        }, 'Governance system not available');

        return reply.status(501).send({
          error: 'Not Implemented',
          message: 'Governance system not available',
        });
      }

      logger.error({
        requestId,
        userId: user.id,
        challengeId: request.body.challengeId,
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
        executionTime,
      }, 'Prompt validation failed');

      return reply.status(500).send({
        error: 'Internal server error',
        message: 'Failed to validate prompt',
      });
    }
  };


  analyzeTemporalBehavior = async (
    request: FastifyRequest<{ Body: AnalyzeTemporalBehaviorDTO }>,
    reply: FastifyReply
  ): Promise<void> => {
    const startTime = Date.now();
    const requestId = crypto.randomUUID();
    const user = request.user as { id: string; email: string; role: string } | undefined;

    if (!user) {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'User not authenticated',
      });
    }

    logger.info({
      requestId,
      operation: 'analyze_temporal_behavior',
      userId: user.id,
      targetUserId: request.body.userId,
      timeWindow: request.body.timeWindow,
      analysisType: request.body.analysisType,
      ipAddress: request.ip,
    }, 'Temporal behavior analysis request received');

    try {
      // Conversão de parâmetros da requisição para o caso de uso
      const timeWindowToMinutes = (timeWindow: string): number => {
        if (timeWindow === '1h') return 60;
        if (timeWindow === '5m') return 5;
        if (timeWindow === '10m') return 10;
        if (timeWindow === '30m') return 30;
        return 30;
      };

      const useCaseParams = {
        userId: request.body.userId,
        attemptId: crypto.randomUUID(),
        lookbackMinutes: timeWindowToMinutes(request.body.timeWindow || '30m')
      };

      const result = await this.analyzeTemporalBehaviorUseCase.execute(useCaseParams);

      const executionTime = Date.now() - startTime;

      logger.info({
        requestId,
        userId: user.id,
        targetUserId: request.body.userId,
        analysisType: request.body.analysisType,
        executionTime,
      }, 'Temporal behavior analysis completed');

      // Mapeamento do resultado para o formato da API
      const response = {
        analysis: {
          patterns: (result.temporalPatterns || []).map((p: any) =>
            p.pattern === 'rapid_fire' ? 'rapid_attempts' : p.pattern
          ),
          riskScore: result.overallRisk || 0,
          recommendations: result.recommendations || [],
          timeWindow: request.body.timeWindow || '1h'
        }
      };

      return reply.status(200).send(response);
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      if (errorMessage.includes('not available') || errorMessage.includes('Not Implemented')) {
        logger.warn({
          requestId,
          userId: user.id,
          error: errorMessage,
          reason: 'temporal_analysis_unavailable',
          executionTime,
        }, 'Temporal analysis not available');

        return reply.status(501).send({
          error: 'Not Implemented',
          message: 'Temporal analysis not available',
        });
      }

      logger.error({
        requestId,
        userId: user.id,
        attemptId: request.body.attemptId,
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
        executionTime,
      }, 'Temporal behavior analysis failed');

      return reply.status(500).send({
        error: 'Internal server error',
        message: 'Failed to analyze temporal behavior',
      });
    }
  };

  generateEducationalFeedback = async (
    request: FastifyRequest<{ Body: GenerateFeedbackRequestDTO }>,
    reply: FastifyReply
  ): Promise<void> => {
    const startTime = Date.now();
    const requestId = crypto.randomUUID();
    const user = request.user as { id: string; email: string; role: string } | undefined;

    if (!user) {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'User not authenticated',
      });
    }

    logger.info({
      requestId,
      operation: 'generate_educational_feedback',
      userId: user.id,
      challengeId: request.body.challengeId,
      userLevel: request.body.userLevel,
      hasUserCode: !!request.body.userCode,
      ipAddress: request.ip,
    }, 'Educational feedback generation request received');

    try {
      const result = await this.generateEducationalFeedbackUseCase.execute(user.id, request.body);

      const executionTime = Date.now() - startTime;

      logger.info({
        requestId,
        userId: user.id,
        challengeId: request.body.challengeId,
        feedbackGenerated: !!result,
        executionTime,
      }, 'Educational feedback generated successfully');

      // Transformação da resposta para o formato esperado
      const response = {
        feedback: {
          message: result.context.whatHappened + (result.context.whyBlocked ? ` ${result.context.whyBlocked}` : ''),
          suggestions: result.guidance.betterApproaches,
          educationalContent: {
            concepts: result.guidance.conceptsToReview,
            nextSteps: result.learningPath.nextSteps,
            resources: result.learningPath.suggestedResources
          }
        }
      };

      return reply.status(200).send(response);
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      if (errorMessage.includes('not available') || errorMessage.includes('Not Implemented')) {
        logger.warn({
          requestId,
          userId: user.id,
          error: errorMessage,
          reason: 'feedback_service_unavailable',
          executionTime,
        }, 'Educational feedback service not available');

        return reply.status(501).send({
          error: 'Not Implemented',
          message: 'Educational feedback service not available',
        });
      }

      logger.error({
        requestId,
        userId: user.id,
        challengeId: request.body.challengeId,
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
        executionTime,
      }, 'Educational feedback generation failed');

      return reply.status(500).send({
        error: 'Internal server error',
        message: 'Failed to generate educational feedback',
      });
    }
  };

  getMetrics = async (
    request: FastifyRequest<{ Querystring: GetGovernanceMetricsDTO }>,
    reply: FastifyReply
  ): Promise<void> => {
    const startTime = Date.now();
    const requestId = crypto.randomUUID();
    const user = request.user as { id: string; email: string; role: string } | undefined;

    if (!user) {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'User not authenticated',
      });
    }

    logger.debug({
      requestId,
      operation: 'get_governance_metrics',
      userId: user.id,
      challengeId: request.query.challengeId,
      hasDateRange: !!(request.query.startDate && request.query.endDate),
    }, 'Governance metrics request received');

    try {
      const result = await this.getGovernanceMetricsUseCase.execute(request.query);

      const executionTime = Date.now() - startTime;

      logger.info({
        requestId,
        userId: user.id,
        challengeId: request.query.challengeId,
        totalValidations: result.totalValidations,
        executionTime,
      }, 'Governance metrics retrieved successfully');

      return reply.status(200).send(result);
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      if (errorMessage.includes('not available') || errorMessage.includes('Not Implemented')) {
        logger.warn({
          requestId,
          userId: user.id,
          error: errorMessage,
          reason: 'metrics_unavailable',
          executionTime,
        }, 'Governance metrics not available');

        return reply.status(501).send({
          error: 'Not Implemented',
          message: 'Governance metrics not available',
        });
      }

      logger.error({
        requestId,
        userId: user.id,
        challengeId: request.query.challengeId,
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
        executionTime,
      }, 'Failed to get governance metrics');

      return reply.status(500).send({
        error: 'Internal server error',
        message: 'Failed to retrieve governance metrics',
      });
    }
  };

  getStats = async (
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> => {
    const startTime = Date.now();
    const requestId = crypto.randomUUID();
    const user = request.user as { id: string; email: string; role: string } | undefined;

    if (!user) {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'User not authenticated',
      });
    }

    logger.debug({
      requestId,
      operation: 'get_governance_stats',
      userId: user.id,
    }, 'Governance stats request received');

    try {
      const result = await this.getGovernanceStatsUseCase.execute();

      const executionTime = Date.now() - startTime;

      logger.info({
        requestId,
        userId: user.id,
        cachedContexts: result.cachedContexts,
        executionTime,
      }, 'Governance stats retrieved successfully');

      return reply.status(200).send(result);
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      if (errorMessage.includes('not available') || errorMessage.includes('Not Implemented')) {
        logger.warn({
          requestId,
          userId: user.id,
          error: errorMessage,
          reason: 'stats_unavailable',
          executionTime,
        }, 'Context statistics not available');

        return reply.status(501).send({
          error: 'Not Implemented',
          message: 'Context statistics not available',
        });
      }

      logger.error({
        requestId,
        userId: user.id,
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
        executionTime,
      }, 'Failed to get governance stats');

      return reply.status(500).send({
        error: 'Internal server error',
        message: 'Failed to retrieve governance stats',
      });
    }
  };

  refreshCache = async (
    request: FastifyRequest<{ Body: RefreshChallengeCacheDTO }>,
    reply: FastifyReply
  ): Promise<void> => {
    const startTime = Date.now();
    const requestId = crypto.randomUUID();
    const user = request.user as { id: string; email: string; role: string } | undefined;

    if (!user) {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'User not authenticated',
      });
    }

    logger.info({
      requestId,
      operation: 'refresh_challenge_cache',
      userId: user.id,
      challengeId: request.body.challengeId,
      ipAddress: request.ip,
    }, 'Cache refresh request received');

    try {
      const result = await this.refreshChallengeCacheUseCase.execute(request.body);

      const executionTime = Date.now() - startTime;

      logger.info({
        requestId,
        userId: user.id,
        challengeId: request.body.challengeId,
        executionTime,
      }, 'Challenge cache refreshed successfully');

      return reply.status(200).send(result);
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      if (errorMessage.includes('not available') || errorMessage.includes('Not Implemented')) {
        logger.warn({
          requestId,
          userId: user.id,
          error: errorMessage,
          reason: 'cache_refresh_unavailable',
          executionTime,
        }, 'Cache refresh not available');

        return reply.status(501).send({
          error: 'Not Implemented',
          message: 'Cache refresh not available',
        });
      }

      logger.error({
        requestId,
        userId: user.id,
        challengeId: request.body.challengeId,
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
        executionTime,
      }, 'Failed to refresh cache');

      return reply.status(500).send({
        error: 'Internal server error',
        message: 'Failed to refresh cache',
      });
    }
  };

  prewarmCache = async (
    request: FastifyRequest<{ Body: PrewarmCacheDTO }>,
    reply: FastifyReply
  ): Promise<void> => {
    const startTime = Date.now();
    const requestId = crypto.randomUUID();
    const user = request.user as { id: string; email: string; role: string } | undefined;

    if (!user) {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'User not authenticated',
      });
    }

    logger.info({
      requestId,
      operation: 'prewarm_cache',
      userId: user.id,
      challengeIdsCount: request.body.challengeIds.length,
      ipAddress: request.ip,
    }, 'Cache prewarm request received');

    try {
      const result = await this.prewarmCacheUseCase.execute(request.body);

      const executionTime = Date.now() - startTime;

      logger.info({
        requestId,
        userId: user.id,
        processed: result.processed,
        executionTime,
      }, 'Cache prewarmed successfully');

      return reply.status(200).send(result);
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      if (errorMessage.includes('not available') || errorMessage.includes('Not Implemented')) {
        logger.warn({
          requestId,
          userId: user.id,
          error: errorMessage,
          reason: 'cache_prewarm_unavailable',
          executionTime,
        }, 'Cache prewarm not available');

        return reply.status(501).send({
          error: 'Not Implemented',
          message: 'Cache prewarm not available',
        });
      }

      logger.error({
        requestId,
        userId: user.id,
        challengeIdsCount: request.body.challengeIds.length,
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
        executionTime,
      }, 'Failed to prewarm cache');

      return reply.status(500).send({
        error: 'Internal server error',
        message: 'Failed to prewarm cache',
      });
    }
  };

  clearCache = async (
    request: FastifyRequest<{ Querystring: ClearValidationCacheDTO }>,
    reply: FastifyReply
  ): Promise<void> => {
    const startTime = Date.now();
    const requestId = crypto.randomUUID();
    const user = request.user as { id: string; email: string; role: string } | undefined;

    if (!user) {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'User not authenticated',
      });
    }

    logger.info({
      requestId,
      operation: 'clear_validation_cache',
      userId: user.id,
      challengeId: request.query.challengeId || 'all',
      ipAddress: request.ip,
    }, 'Cache clear request received');

    try {
      const result = await this.clearValidationCacheUseCase.execute(request.query);

      const executionTime = Date.now() - startTime;

      logger.info({
        requestId,
        userId: user.id,
        challengeId: request.query.challengeId || 'all',
        executionTime,
      }, 'Validation cache cleared successfully');

      return reply.status(200).send(result);
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      if (errorMessage.includes('not available') || errorMessage.includes('Not Implemented')) {
        logger.warn({
          requestId,
          userId: user.id,
          error: errorMessage,
          reason: 'cache_clear_unavailable',
          executionTime,
        }, 'Cache clear not available');

        return reply.status(501).send({
          error: 'Not Implemented',
          message: 'Cache clear not available',
        });
      }

      logger.error({
        requestId,
        userId: user.id,
        challengeId: request.query.challengeId || 'all',
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
        executionTime,
      }, 'Failed to clear cache');

      return reply.status(500).send({
        error: 'Internal server error',
        message: 'Failed to clear cache',
      });
    }
  };

  analyzePrompt = async (
    request: FastifyRequest<{ Body: AnalyzePromptDTO }>,
    reply: FastifyReply
  ): Promise<void> => {
    const startTime = Date.now();
    const requestId = crypto.randomUUID();
    const user = request.user as { id: string; email: string; role: string } | undefined;

    if (!user) {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'User not authenticated',
      });
    }

    logger.debug({
      requestId,
      operation: 'analyze_prompt',
      userId: user.id,
      promptLength: request.body.prompt.length,
    }, 'Prompt analysis request received');

    try {
      const result = await this.analyzePromptUseCase.execute(request.body);

      const executionTime = Date.now() - startTime;

      logger.info({
        requestId,
        userId: user.id,
        promptLength: request.body.prompt.length,
        intent: result.intent,
        complexity: result.complexity,
        executionTime,
      }, 'Prompt analysis completed successfully');

      return reply.status(200).send({
        analysis: {
          intent: result.intent,
          complexity: result.complexity,
          educationalValue: result.educationalValue || 0,
          riskFactors: result.riskFactors || [],
          language: result.language,
          hasCodeRequest: result.hasCodeRequest,
          socialEngineeringScore: result.socialEngineeringScore,
          estimatedTokens: result.estimatedTokens,
          topics: result.topics
        }
      });
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      if (errorMessage.includes('not available') || errorMessage.includes('Not Implemented')) {
        logger.warn({
          requestId,
          userId: user.id,
          error: errorMessage,
          reason: 'prompt_analysis_unavailable',
          executionTime,
        }, 'Prompt analysis not available');

        return reply.status(501).send({
          error: 'Not Implemented',
          message: 'Prompt analysis not available',
        });
      }

      logger.error({
        requestId,
        userId: user.id,
        promptLength: request.body.prompt.length,
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
        executionTime,
      }, 'Prompt analysis failed');

      return reply.status(500).send({
        error: 'Internal server error',
        message: 'Failed to analyze prompt',
      });
    }
  };
}