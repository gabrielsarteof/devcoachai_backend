import type { FastifyRequest, FastifyReply } from 'fastify';
import { IAIProvider } from '../../domain/providers/ai-provider.interface';
import {
  CreateAIInteractionDTO,
  TrackCopyPasteDTO,
  AnalyzeTemporalBehaviorDTO,
  GenerateFeedbackRequestDTO
} from '../../domain/schemas/ai-interaction.schema';
import { AIMessage } from '../../domain/types/ai.types';
import { RateLimiterService } from '../../infrastructure/services/rate-limiter.service';
import { UsageTrackerService } from '../../infrastructure/services/usage-tracker.service';
import { TrackCopyPasteUseCase } from '../../application/use-cases/track-copy-paste.use-case';
import { ValidatePromptUseCase } from '../../application/use-cases/validate-prompt.use-case';
import { AnalyzeTemporalBehaviorUseCase } from '../../application/use-cases/analyze-temporal-behavior.use-case';
import { IEducationalFeedbackService } from '../../domain/services/educational-feedback.service.interface';
import { IChallengeContextService } from '../../domain/services/challenge-context.service.interface';
import { logger } from '@/shared/infrastructure/monitoring/logger';

export class AIProxyController {
  private providers: Map<string, IAIProvider> = new Map();
  private governanceEnabled = process.env.GOVERNANCE_ENABLED === 'true';

  constructor(
    private readonly rateLimiter: RateLimiterService,
    private readonly usageTracker: UsageTrackerService,
    private readonly trackCopyPasteUseCase: TrackCopyPasteUseCase,
    private readonly validatePromptUseCase?: ValidatePromptUseCase,
    private readonly analyzeTemporalBehaviorUseCase?: AnalyzeTemporalBehaviorUseCase,
    private readonly educationalFeedbackService?: IEducationalFeedbackService,
    private readonly challengeContextService?: IChallengeContextService
  ) { }

  registerProvider(name: string, provider: IAIProvider): void {
    this.providers.set(name, provider);

    logger.info({
      operation: 'ai_provider_registered',
      providerName: name,
      supportedModels: provider.models.map(m => m.id),
      totalProviders: this.providers.size,
      governanceEnabled: this.governanceEnabled,
    }, `AI provider '${name}' registered successfully`);
  }

  chat = async (
    request: FastifyRequest<{ Body: CreateAIInteractionDTO }>,
    reply: FastifyReply
  ): Promise<void> => {
    const startTime = Date.now();
    const requestId = crypto.randomUUID();

    try {
      const user = request.user as { id: string; level?: number };
      const {
        provider: providerName,
        messages,
        model,
        challengeId,
        enableGovernance = true,
        attemptId,
        temperature,
        maxTokens,
        stream
      } = request.body;

      logger.info({
        requestId,
        operation: 'ai_chat_request',
        userId: user.id,
        provider: providerName,
        model,
        messageCount: messages.length,
        attemptId,
        challengeId,
        governanceEnabled: this.governanceEnabled && enableGovernance,
        temperature,
        maxTokens,
        stream,
        ipAddress: request.ip,
      }, 'AI chat request received');

      if (this.governanceEnabled && enableGovernance && challengeId && attemptId && this.analyzeTemporalBehaviorUseCase) {
        try {
          const temporalAnalysis = await this.analyzeTemporalBehaviorUseCase.execute({
            userId: user.id,
            attemptId: attemptId,
            currentValidation: {
              challengeId,
              prompt: messages
                .filter((m: AIMessage) => m.role === 'user')
                .map((m: AIMessage) => m.content)
                .join(' '),
            },
            lookbackMinutes: 30
          });

          if (temporalAnalysis?.shouldBlock && temporalAnalysis.overallRisk > 80) {
            logger.warn({
              requestId,
              userId: user.id,
              attemptId,
              challengeId,
              temporalRisk: temporalAnalysis.overallRisk,
              patterns: temporalAnalysis.temporalPatterns,
              gamingDetected: true
            }, 'Gaming behavior detected through temporal analysis');

            let educationalFeedback = null;
            if (this.educationalFeedbackService && challengeId) {
              try {
                let challengeContext = undefined;
                if (this.challengeContextService) {
                  try {
                    challengeContext = await this.challengeContextService.getChallengeContext(challengeId);
                  } catch (contextError) {
                    logger.warn({
                      requestId,
                      challengeId,
                      error: contextError instanceof Error ? contextError.message : 'Unknown error'
                    }, 'Failed to get challenge context for feedback');
                  }
                }

                educationalFeedback = await this.educationalFeedbackService.generateFeedback({
                  validation: {
                    isValid: false,
                    riskScore: temporalAnalysis.overallRisk || 90,
                    classification: 'BLOCKED',
                    reasons: ['Gaming behavior detected through temporal analysis'],
                    suggestedAction: 'BLOCK',
                    confidence: 90
                  },
                  userLevel: user.level || 1,
                  userId: user.id,
                  context: challengeContext
                });
              } catch (feedbackError) {
                logger.error({
                  requestId,
                  error: feedbackError instanceof Error ? feedbackError.message : 'Unknown error',
                  userId: user.id
                }, 'Failed to generate educational feedback');
              }
            }

            return reply.status(403).send({
              error: 'Gaming behavior detected',
              message: 'Multiple attempts to bypass the educational system detected.',
              temporalAnalysis: {
                risk: temporalAnalysis.overallRisk,
                patterns: temporalAnalysis.temporalPatterns
              },
              educationalFeedback
            });
          }

        } catch (temporalError) {
          logger.error({
            requestId,
            error: temporalError instanceof Error ? temporalError.message : 'Unknown error',
            userId: user.id
          }, 'Temporal analysis failed - continuing with normal flow');
        }
      }

      if (this.governanceEnabled && enableGovernance && challengeId && this.validatePromptUseCase) {
        const validationStartTime = Date.now();

        const combinedPrompt = messages
          .filter((m: AIMessage) => m.role === 'user')
          .map((m: AIMessage) => m.content)
          .join(' ');

        const validation = await this.validatePromptUseCase.execute({
          userId: user.id,
          challengeId,
          prompt: combinedPrompt,
          userLevel: user.level,
          attemptId,
        });

        const validationTime = Date.now() - validationStartTime;

        logger.info({
          requestId,
          userId: user.id,
          challengeId,
          classification: validation.classification,
          riskScore: validation.riskScore,
          confidence: validation.confidence,
          validationTime,
          meetsLatencyTarget: validationTime < 50,
        }, 'Prompt validation completed');

        if (validation.suggestedAction === 'BLOCK') {
          logger.warn({
            requestId,
            userId: user.id,
            challengeId,
            provider: providerName,
            classification: validation.classification,
            riskScore: validation.riskScore,
            reasons: validation.reasons,
            blocked: true,
          }, 'AI chat request blocked by governance');

          return reply.status(403).send({
            error: 'Prompt blocked',
            message: 'Your prompt has been blocked due to policy violations.',
            reasons: validation.reasons,
            riskScore: validation.riskScore,
            classification: validation.classification,
            suggestions: this.getSuggestions(validation.reasons),
          });
        }

        if (validation.suggestedAction === 'THROTTLE') {
          await this.applyThrottling(user.id, validation.riskScore);

          logger.info({
            requestId,
            userId: user.id,
            challengeId,
            throttled: true,
            riskScore: validation.riskScore,
          }, 'Additional throttling applied');
        }

        if (validation.suggestedAction === 'REVIEW') {
          logger.warn({
            requestId,
            userId: user.id,
            challengeId,
            classification: validation.classification,
            riskScore: validation.riskScore,
            requiresReview: true,
          }, 'Prompt flagged for review');
        }

        if (validation.classification === 'WARNING') {
          reply.header('X-Governance-Warning', 'true');
          reply.header('X-Risk-Score', validation.riskScore.toString());
        }
      }

      const rateLimit = await this.rateLimiter.checkLimit(user.id, 1000);
      if (!rateLimit.allowed) {
        logger.warn({
          requestId,
          userId: user.id,
          provider: providerName,
          reason: rateLimit.reason,
          resetAt: rateLimit.resetAt,
          rateLimitExceeded: true,
          executionTime: Date.now() - startTime,
        }, 'AI chat request blocked by rate limiter');

        return reply.status(429).send({
          error: 'Rate limit exceeded',
          message: rateLimit.reason,
          resetAt: rateLimit.resetAt,
        });
      }

      const provider = this.providers.get(providerName);
      if (!provider) {
        logger.error({
          requestId,
          userId: user.id,
          provider: providerName,
          availableProviders: Array.from(this.providers.keys()),
          reason: 'provider_not_found',
          executionTime: Date.now() - startTime,
        }, 'AI chat request failed - provider not found');

        return reply.status(400).send({
          error: 'Invalid provider',
          message: `Provider ${providerName} not found`,
        });
      }

      if (!provider.validateModel(model)) {
        logger.warn({
          requestId,
          userId: user.id,
          provider: providerName,
          model,
          supportedModels: provider.models.map(m => m.id),
          reason: 'model_not_supported',
          executionTime: Date.now() - startTime,
        }, 'AI chat request failed - model not supported');

        return reply.status(400).send({
          error: 'Invalid model',
          message: `Model ${model} not supported by ${providerName}`,
        });
      }

      const apiStartTime = Date.now();

      if (stream) {
        logger.info({
          requestId,
          userId: user.id,
          provider: providerName,
          model,
          streamingMode: true,
        }, 'Starting streaming AI chat response');

        reply.raw.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        });

        let totalContent = '';
        let tokenCount = 0;

        try {
          for await (const chunk of provider.stream(messages, {
            model,
            temperature,
            maxTokens,
            stream: true
          })) {
            totalContent += chunk;
            tokenCount++;

            const event = JSON.stringify({ content: chunk });
            reply.raw.write(`data: ${event}\n\n`);
          }

          const responseTokens = provider.countTokens(totalContent);
          const promptTokens = provider.countTokens(messages.map((m: AIMessage) => m.content).join(' '));
          const modelInfo = provider.models.find(m => m.id === model);
          const cost = modelInfo
            ? ((promptTokens / 1000) * modelInfo.inputCost) + ((responseTokens / 1000) * modelInfo.outputCost)
            : 0;

          await this.usageTracker.trackUsage({
            userId: user.id,
            attemptId,
            provider: providerName as any,
            model,
            inputTokens: promptTokens,
            outputTokens: responseTokens,
            cost,
            responseTime: Date.now() - apiStartTime,
          });

          const executionTime = Date.now() - startTime;

          logger.info({
            requestId,
            userId: user.id,
            provider: providerName,
            model,
            streamingMode: true,
            totalContent: totalContent.length,
            chunks: tokenCount,
            promptTokens,
            responseTokens,
            totalTokens: promptTokens + responseTokens,
            cost,
            apiTime: Date.now() - apiStartTime,
            executionTime,
            streamCompleted: true,
            governanceApplied: this.governanceEnabled && enableGovernance && !!challengeId,
          }, 'AI streaming chat completed successfully');

          reply.raw.write('data: [DONE]\n\n');
        } catch (error) {
          const executionTime = Date.now() - startTime;

          logger.error({
            requestId,
            userId: user.id,
            provider: providerName,
            model,
            error: error instanceof Error ? error.message : 'Unknown error',
            streamingMode: true,
            executionTime,
          }, 'AI streaming chat error');

          const errorEvent = JSON.stringify({ error: 'Stream error' });
          reply.raw.write(`data: ${errorEvent}\n\n`);
        } finally {
          reply.raw.end();
        }
      } else {
        const completion = await provider.chat(messages, {
          model,
          temperature,
          maxTokens,
          stream: false
        });

        await this.usageTracker.trackUsage({
          userId: user.id,
          attemptId,
          provider: providerName as any,
          model,
          inputTokens: completion.usage.promptTokens,
          outputTokens: completion.usage.completionTokens,
          cost: completion.cost,
          responseTime: Date.now() - apiStartTime,
        });

        const executionTime = Date.now() - startTime;

        logger.info({
          requestId,
          userId: user.id,
          provider: providerName,
          model,
          messageCount: messages.length,
          promptTokens: completion.usage.promptTokens,
          completionTokens: completion.usage.completionTokens,
          totalTokens: completion.usage.totalTokens,
          cost: completion.cost,
          responseLength: completion.content.length,
          apiTime: Date.now() - apiStartTime,
          executionTime,
          rateLimitRemaining: rateLimit.remaining,
          governanceApplied: this.governanceEnabled && enableGovernance && !!challengeId,
          aiChatCompleted: true,
        }, 'AI chat completed successfully');

        if (completion.cost > 0.10) {
          logger.warn({
            requestId,
            userId: user.id,
            provider: providerName,
            model,
            cost: completion.cost,
            totalTokens: completion.usage.totalTokens,
            highCostInteraction: true,
          }, 'High cost AI interaction detected');
        }

        return reply.send({
          success: true,
          data: completion,
          usage: {
            tokens: completion.usage.totalTokens,
            cost: completion.cost,
            remaining: rateLimit.remaining,
          },
          governance: this.governanceEnabled && enableGovernance && challengeId ? {
            validated: true,
            challengeContext: true,
          } : undefined,
        });
      }
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      logger.error({
        requestId,
        operation: 'ai_chat_error',
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
        executionTime,
      }, 'AI chat request failed');

      if (error instanceof Error) {
        if (error.message.includes('Rate limit')) {
          return reply.status(429).send({
            error: 'Rate limit exceeded',
            message: error.message,
          });
        }
        if (error.message.includes('Invalid API key')) {
          return reply.status(401).send({
            error: 'Authentication failed',
            message: 'Invalid API key for provider',
          });
        }
      }

      return reply.status(500).send({
        error: 'Internal server error',
        message: 'Failed to process AI request',
      });
    }
  };

  private async applyThrottling(userId: string, riskScore: number): Promise<void> {
    const delayMs = Math.min(riskScore * 10, 1000);

    if (delayMs > 0) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }

    if (typeof (this.rateLimiter as any).setThrottle === 'function') {
      await (this.rateLimiter as any).setThrottle(userId, riskScore);
    }

    logger.info({
      userId,
      riskScore,
      delayMs,
      throttleApplied: true
    }, 'Throttling applied to user due to risk detection');
  }

  private getSuggestions(reasons: string[]): string[] {
    const suggestions: string[] = [];

    if (reasons.some(r => r.includes('Direct solution') || r.includes('Solicitação direta'))) {
      suggestions.push(
        'Try asking for guidance or hints instead of the complete solution.',
        'Break down the problem and ask about specific concepts.',
        'Focus on understanding the approach rather than getting the answer.'
      );
    }

    if (reasons.some(r => r.includes('Off-topic') || r.includes('fora do tópico'))) {
      suggestions.push(
        'Keep your questions related to the challenge at hand.',
        'Focus on the technical aspects of the problem.',
        'Review the challenge requirements and ask specific questions.'
      );
    }

    if (reasons.some(r => r.includes('Social engineering') || r.includes('engenharia social'))) {
      suggestions.push(
        'Please use the AI assistant as intended for learning purposes.',
        'Focus on improving your skills through practice.',
        'The system is designed to help you learn, not to provide shortcuts.'
      );
    }

    return suggestions.slice(0, 3);
  }

  trackCopyPaste = async (
    request: FastifyRequest<{ Body: TrackCopyPasteDTO }>,
    reply: FastifyReply
  ): Promise<void> => {
    const startTime = Date.now();
    const requestId = crypto.randomUUID();

    try {
      const user = request.user as { id: string };

      logger.info({
        requestId,
        operation: 'copy_paste_tracking_request',
        userId: user.id,
        attemptId: request.body.attemptId,
        action: request.body.action,
        contentLength: request.body.content.length,
        sourceLines: request.body.sourceLines,
        targetLines: request.body.targetLines,
        fromAI: !!request.body.aiInteractionId,
        ipAddress: request.ip
      }, 'Copy/paste tracking request received');

      await this.trackCopyPasteUseCase.execute(user.id, request.body);

      const executionTime = Date.now() - startTime;

      logger.info({
        requestId,
        userId: user.id,
        attemptId: request.body.attemptId,
        action: request.body.action,
        contentLength: request.body.content.length,
        fromAI: !!request.body.aiInteractionId,
        executionTime,
        copyPasteTracked: true
      }, `${request.body.action} event tracked successfully`);

      return reply.send({
        success: true,
        message: `${request.body.action} event tracked`,
      });
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      logger.error({
        requestId,
        operation: 'copy_paste_tracking_failed',
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
        executionTime
      }, 'Failed to track copy/paste event');

      return reply.status(500).send({
        error: 'Internal server error',
        message: 'Failed to track copy/paste event',
      });
    }
  };

  getUsage = async (
    request: FastifyRequest<{ Querystring: { days?: number } }>,
    reply: FastifyReply
  ): Promise<void> => {
    const startTime = Date.now();
    const requestId = crypto.randomUUID();

    try {
      const user = request.user as { id: string };
      const days = request.query.days || 30;

      logger.debug({
        requestId,
        operation: 'ai_usage_request',
        userId: user.id,
        days,
        ipAddress: request.ip
      }, 'AI usage request received');

      const usage = await this.usageTracker.getUserUsage(user.id, days);
      const quota = await this.rateLimiter.getRemainingQuota(user.id);

      const executionTime = Date.now() - startTime;

      logger.info({
        requestId,
        userId: user.id,
        days,
        usage: {
          totalRequests: usage.total.requests,
          totalTokens: usage.total.tokens,
          totalCost: usage.total.cost,
          providersUsed: Object.keys(usage.byProvider).length
        },
        quota,
        executionTime,
        usageRetrieved: true
      }, 'AI usage retrieved successfully');

      return reply.send({
        usage,
        quota,
      });
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      logger.error({
        requestId,
        operation: 'ai_usage_failed',
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
        executionTime
      }, 'Failed to get AI usage');

      return reply.status(500).send({
        error: 'Internal server error',
        message: 'Failed to retrieve usage data',
      });
    }
    };

  getModels = async (
    _request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> => {
    const startTime = Date.now();
    const requestId = crypto.randomUUID();

    try {
      logger.debug({
        requestId,
        operation: 'ai_models_request',
        providersCount: this.providers.size
      }, 'AI models request received');

      const models: Record<string, any> = {};

      for (const [name, provider] of this.providers) {
        models[name] = provider.models;
      }

      const executionTime = Date.now() - startTime;

      const totalModels = Object.values(models).reduce((sum, providerModels) =>
        sum + (Array.isArray(providerModels) ? providerModels.length : 0), 0
      );

      logger.info({
        requestId,
        providersCount: this.providers.size,
        totalModels,
        providers: Object.keys(models),
        executionTime,
        modelsRetrieved: true
      }, 'AI models retrieved successfully');

      return reply.send({ models });
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      logger.error({
        requestId,
        operation: 'ai_models_failed',
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
        executionTime
      }, 'Failed to get AI models');

      return reply.status(500).send({
        error: 'Internal server error',
        message: 'Failed to retrieve AI models',
      });
    }
  };

  analyzeTemporalBehavior = async (
    request: FastifyRequest<{ Body: AnalyzeTemporalBehaviorDTO }>,
    reply: FastifyReply
  ): Promise<void> => {
    const user = request.user as { id: string };
    const { attemptId, lookbackMinutes } = request.body;

    if (!this.analyzeTemporalBehaviorUseCase) {
      return reply.status(501).send({
        error: 'Not Implemented',
        message: 'Temporal analysis not available',
      });
    }

    const result = await this.analyzeTemporalBehaviorUseCase.execute({
      userId: user.id,
      attemptId,
      lookbackMinutes
    });

    return reply.send(result);
  };

  generateEducationalFeedback = async (
    request: FastifyRequest<{ Body: GenerateFeedbackRequestDTO }>,
    reply: FastifyReply
  ): Promise<void> => {
    const user = request.user as { id: string; level?: number }; 
    const { challengeId, riskScore, reasons, userLevel } = request.body;

    if (!this.educationalFeedbackService) {
      return reply.status(501).send({
        error: 'Not Implemented',
        message: 'Educational feedback not available',
      });
    }

    const result = await this.educationalFeedbackService.generateFeedback({
      validation: {
        isValid: false,
        riskScore,
        classification: riskScore > 70 ? 'BLOCKED' : riskScore > 40 ? 'WARNING' : 'SAFE',
        reasons,
        suggestedAction: riskScore > 70 ? 'BLOCK' : 'THROTTLE',
        confidence: 80
      },
      userLevel: userLevel || user.level || 1, 
      userId: user.id, 
      context: {
        challengeId,
        title: '',
        category: '',
        keywords: [],
        allowedTopics: [],
        forbiddenPatterns: [],
        difficulty: 'MEDIUM',
        targetMetrics: { maxDI: 40, minPR: 70, minCS: 8 }
      }
    });

    return reply.send(result);
  };
}