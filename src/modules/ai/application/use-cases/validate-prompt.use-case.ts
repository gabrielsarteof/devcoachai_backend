import { Logger } from 'pino';
import { logger as baseLogger } from '@/shared/infrastructure/monitoring/logger';
import { IPromptValidatorService } from '../../domain/services/prompt-validator.service.interface';
import { IChallengeContextService } from '../../domain/services/prompt-validator.service.interface';
import { PromptValidationResult, ValidationConfig } from '../../domain/types/governance.types';
import { PrismaClient, UserRole } from '@prisma/client';

export interface ValidatePromptDTO {
  userId: string;
  challengeId: string;
  prompt: string;
  userLevel?: number;
  attemptId?: string;
  config?: Partial<ValidationConfig>;
}

export class ValidatePromptUseCase {
  private readonly defaultConfig: ValidationConfig = {
    strictMode: false,
    contextSimilarityThreshold: parseFloat(process.env.CONTEXT_SIMILARITY_THRESHOLD || '0.7'),
    offTopicThreshold: parseFloat(process.env.OFF_TOPIC_THRESHOLD || '0.3'),
    blockDirectSolutions: process.env.BLOCK_DIRECT_SOLUTIONS === 'true',
    allowedDeviationPercentage: parseInt(process.env.ALLOWED_DEVIATION_PERCENTAGE || '20'),
    enableSemanticAnalysis: process.env.ENABLE_SEMANTIC_ANALYSIS === 'true',
  };

  private readonly logger: Logger;

  constructor(
    private readonly promptValidator: IPromptValidatorService,
    private readonly challengeContextService: IChallengeContextService,
    private readonly prisma: PrismaClient
  ) {
    this.logger = baseLogger.child({ useCase: 'ValidatePrompt' });
  }

  async execute(data: ValidatePromptDTO): Promise<PromptValidationResult> {
    const startTime = Date.now();
    const validationId = crypto.randomUUID();
    
    this.logger.info({
      validationId,
      userId: data.userId,
      challengeId: data.challengeId,
      attemptId: data.attemptId,
      promptLength: data.prompt.length,
      userLevel: data.userLevel,
      hasCustomConfig: !!data.config,
    }, 'Starting prompt validation use case');

    try {
      let userLevel = data.userLevel;
      if (userLevel === undefined) {
        const user = await this.prisma.user.findUnique({
          where: { id: data.userId },
          select: { 
            id: true,
            role: true,
            yearsOfExperience: true,
          },
        });
        
        userLevel = user ? this.calculateUserLevel(user) : 1;
      }

      // Validação de existência do challenge
      const challengeContext = await this.challengeContextService.getChallengeContext(
        data.challengeId
      );

      if (!challengeContext) {
        throw new Error(`Challenge not found: ${data.challengeId}`);
      }

      const config: ValidationConfig = {
        ...this.defaultConfig,
        ...data.config,
      };
      config.strictMode = this.shouldUseStrictMode(userLevel, challengeContext.difficulty);

      const result = await this.promptValidator.validatePrompt(
        data.prompt,
        challengeContext,
        userLevel,
        config
      );

      result.metadata = {
        ...result.metadata,
        validationId,
      };

      await this.logValidationResult(data, result, validationId);

      if (data.attemptId && result.classification === 'BLOCKED') {
        await this.trackBlockedPrompt(data.attemptId, result);
      }

      if (result.classification === 'BLOCKED' && this.requiresNotification(result)) {
        await this.notifySecurityTeam(data, result);
      }

      const processingTime = Date.now() - startTime;
      
      this.logger.info({
        validationId,
        userId: data.userId,
        challengeId: data.challengeId,
        classification: result.classification,
        riskScore: result.riskScore,
        reasons: result.reasons,
        processingTime,
        meetsLatencyTarget: processingTime < 50,
      }, 'Prompt validation completed');

      return result;
    } catch (error) {
      const processingTime = Date.now() - startTime;

      this.logger.error({
        validationId,
        userId: data.userId,
        challengeId: data.challengeId,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        processingTime,
      }, 'Prompt validation failed');

      // Propaga erros específicos para tratamento adequado no controller
      if (error instanceof Error && error.message.includes('Challenge not found')) {
        throw error;
      }

      const errorResult: PromptValidationResult = {
        isValid: true,
        riskScore: 50,
        classification: 'WARNING',
        reasons: ['Validation system error - proceeding with caution'],
        suggestedAction: 'THROTTLE',
        confidence: 0.3,
        relevanceScore: 0.5,
        metadata: {
          error: true,
          validationId,
          timeTaken: processingTime,
        },
      };

      return errorResult;
    }
  }

  private calculateUserLevel(user: { role: UserRole; yearsOfExperience: number }): number {
    const roleLevels: Record<UserRole, number> = {
      [UserRole.JUNIOR]: 2,
      [UserRole.PLENO]: 4,
      [UserRole.SENIOR]: 6,
      [UserRole.TECH_LEAD]: 8,
      [UserRole.ARCHITECT]: 10,
    };

    const roleLevel = roleLevels[user.role];

    const experienceAdjustment = Math.min(Math.floor(user.yearsOfExperience / 3), 2);
    
    return Math.min(10, Math.max(1, roleLevel + experienceAdjustment - 1));
  }

  private shouldUseStrictMode(userLevel: number, difficulty: string): boolean {
    if (userLevel <= 2 && difficulty === 'EASY') return false;
    
    if (difficulty === 'EXPERT') return true;
    
    if (userLevel >= 3 && difficulty === 'HARD') return true;
    
    return false;
  }

  private async logValidationResult(
    data: ValidatePromptDTO,
    result: PromptValidationResult,
    validationId: string
  ): Promise<void> {
    try {
      await this.prisma.validationLog.create({
        data: {
          id: validationId,
          userId: data.userId,
          challengeId: data.challengeId,
          attemptId: data.attemptId || null,
          promptHash: this.hashPrompt(data.prompt),
          classification: result.classification,
          riskScore: result.riskScore,
          confidence: result.confidence,
          action: result.suggestedAction,
          reasons: result.reasons,
          metadata: result.metadata || {},
        },
      });
      
      this.logger.debug({
        validationId,
        userId: data.userId,
        challengeId: data.challengeId,
        attemptId: data.attemptId,
      }, 'Validation result logged to database');
      
    } catch (error) {
      this.logger.warn({
        validationId,
        error: error instanceof Error ? error.message : 'Unknown error',
      }, 'Failed to log validation result to database');
    }
  }

  private async trackBlockedPrompt(
    attemptId: string,
    result: PromptValidationResult
  ): Promise<void> {
    try {
      const blockedCount = await this.prisma.validationLog.count({
        where: {
          attemptId: attemptId,
          classification: 'BLOCKED',
        },
      });

      this.logger.info({
        attemptId,
        blockedCount,
        lastBlockedReason: result.reasons[0],
        lastRiskScore: result.riskScore,
      }, 'Blocked prompt tracked for attempt');

      
    } catch (error) {
      this.logger.warn({
        attemptId,
        error: error instanceof Error ? error.message : 'Unknown error',
      }, 'Failed to track blocked prompt');
    }
  }

  private hashPrompt(prompt: string): string {
    const crypto = require('crypto');
    return crypto
      .createHash('sha256')
      .update(prompt)
      .digest('hex')
      .substring(0, 16);
  }

  private requiresNotification(result: PromptValidationResult): boolean {
    const highRiskReasons = [
      'Social engineering attempt detected',
      'Multiple policy violations',
      'Malicious pattern detected',
      'Security vulnerability detected',
    ];

    const hasHighRiskPattern = result.reasons.some(reason => 
      highRiskReasons.some(risk => reason.includes(risk))
    );

    const securityThreshold = parseInt(process.env.SECURITY_ALERT_THRESHOLD || '95');
    
    return hasHighRiskPattern || result.riskScore >= securityThreshold;
  }

  private async notifySecurityTeam(
    data: ValidatePromptDTO,
    result: PromptValidationResult
  ): Promise<void> {
    this.logger.warn({
      userId: data.userId,
      challengeId: data.challengeId,
      attemptId: data.attemptId,
      classification: result.classification,
      riskScore: result.riskScore,
      reasons: result.reasons,
      metadata: result.metadata,
      securityAlert: true,
      alertLevel: result.riskScore >= 95 ? 'CRITICAL' : 'HIGH',
    }, 'SECURITY ALERT: High-risk prompt detected');

    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      await this.prisma.governanceMetrics.upsert({
        where: {
          challengeId_date: {
            challengeId: data.challengeId,
            date: today,
          },
        },
        create: {
          challengeId: data.challengeId,
          date: today,
          totalValidations: 1,
          blockedCount: result.classification === 'BLOCKED' ? 1 : 0,
          avgRiskScore: result.riskScore,
          avgConfidence: result.confidence,
        },
        update: {
          totalValidations: { increment: 1 },
          blockedCount: result.classification === 'BLOCKED' 
            ? { increment: 1 } 
            : undefined,
        },
      });
    } catch (error) {
      this.logger.error({
        error: error instanceof Error ? error.message : 'Unknown error',
      }, 'Failed to update governance metrics');
    }

    // Integração com sistema de alertas em produção 
    if (process.env.SENTRY_DSN) {
    }
  }
}