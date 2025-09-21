import { Redis } from 'ioredis';
import { logger } from '@/shared/infrastructure/monitoring/logger';
import {
    IPromptValidatorService,
    ValidationMetrics,
} from '../../domain/services/prompt-validator.service.interface';
import {
    PromptValidationResult,
    ChallengeContext,
    SemanticValidationConfig,
    EnhancedValidationResult,
    PromptAnalysis,
    ValidationRule,
    PromptIntent,
} from '../../domain/types/governance.types';
import { PromptValidatorService } from './prompt-validator.service';
import { SemanticAnalyzerService } from './semantic-analyzer.service';

interface SemanticAnalysisResult {
    similarity: number;
    embeddings: number[];
    intent: PromptIntent;
    intentConfidence: number;
    intentReasoning: string;
    manipulationScore: number;
    manipulationPatterns: string[];
    contextAlignment: number;
    cached: boolean;
}

export class HybridPromptValidatorService implements IPromptValidatorService {
    private readonly serviceLogger = logger.child({ service: 'HybridValidator' });
    private readonly defaultConfig: SemanticValidationConfig = {
        strictMode: false,
        contextSimilarityThreshold: 0.7,
        offTopicThreshold: 0.3,
        blockDirectSolutions: true,
        allowedDeviationPercentage: 20,
        enableSemanticAnalysis: true,
        borderlineLowerBound: 30,
        borderlineUpperBound: 70,
        semanticSimilarityThreshold: 0.7,
        maxPromptLength: 2000,
        openAIModel: 'gpt-4',
        embeddingModel: 'text-embedding-ada-002',
    };

    constructor(
        private readonly redis: Redis,
        private readonly baseValidator: PromptValidatorService,
        private readonly semanticAnalyzer: SemanticAnalyzerService
    ) { }

    async validatePrompt(
        prompt: string,
        challengeContext: ChallengeContext,
        userLevel: number,
        config?: Partial<SemanticValidationConfig>
    ): Promise<EnhancedValidationResult> {
        const startTime = Date.now();
        const validationId = crypto.randomUUID();
        const mergedConfig = { ...this.defaultConfig, ...config };

        this.serviceLogger.info({
            validationId,
            challengeId: challengeContext.challengeId,
            userLevel,
            promptLength: prompt.length,
            enableSemantic: mergedConfig.enableSemanticAnalysis,
        }, 'Starting hybrid prompt validation');

        try {
            const baseResult = await this.baseValidator.validatePrompt(
                prompt,
                challengeContext,
                userLevel,
                mergedConfig
            );

            const baseTime = Date.now() - startTime;

            this.serviceLogger.debug({
                validationId,
                baseRiskScore: baseResult.riskScore,
                baseClassification: baseResult.classification,
                baseTime,
            }, 'Base validation completed');

            const shouldAnalyze = this.shouldApplySemanticAnalysis(
                baseResult,
                mergedConfig
            );

            if (!shouldAnalyze || !mergedConfig.enableSemanticAnalysis) {
                return this.convertToEnhancedResult(baseResult, baseTime);
            }

            this.serviceLogger.debug({
                validationId,
                reason: 'borderline_case',
                baseScore: baseResult.riskScore,
            }, 'Applying semantic analysis');

            const semanticResult = await this.performSemanticAnalysis(
                prompt,
                challengeContext
            );

            const semanticTime = Date.now() - startTime - baseTime;

            // Step 4: Combine results
            const combinedResult = this.combineResults(
                baseResult,
                semanticResult,
                mergedConfig
            );

            const totalTime = Date.now() - startTime;

            this.serviceLogger.info({
                validationId,
                baseScore: baseResult.riskScore,
                semanticAdjustment: semanticResult.manipulationScore,
                finalScore: combinedResult.hybridScore,
                finalClassification: combinedResult.classification,
                baseTime,
                semanticTime,
                totalTime,
                meetsLatencyTarget: totalTime < 150,
            }, 'Hybrid validation completed');

            await this.storeValidationMetrics(validationId, combinedResult, totalTime);

            return combinedResult;
        } catch (error) {
            const totalTime = Date.now() - startTime;

            this.serviceLogger.error({
                validationId,
                error: error instanceof Error ? error.message : 'Unknown error',
                stack: error instanceof Error ? error.stack : undefined,
                totalTime,
            }, 'Hybrid validation failed');

            return this.convertToEnhancedResult(
                await this.baseValidator.validatePrompt(
                    prompt,
                    challengeContext,
                    userLevel,
                    mergedConfig
                ),
                totalTime
            );
        }
    }

    private shouldApplySemanticAnalysis(
        baseResult: PromptValidationResult,
        config: SemanticValidationConfig
    ): boolean {
        const isBorderline =
            baseResult.riskScore >= config.borderlineLowerBound &&
            baseResult.riskScore <= config.borderlineUpperBound;
        const hasSuspiciousPatterns = baseResult.metadata?.detectedPatterns?.some(
            pattern =>
                pattern.includes('elaborate') ||
                pattern.includes('detail') ||
                pattern.includes('academic')
        );

        const lowConfidence = baseResult.confidence < 60;

        return isBorderline || hasSuspiciousPatterns || lowConfidence;
    }

    private async performSemanticAnalysis(
        prompt: string,
        challengeContext: ChallengeContext
    ): Promise<SemanticAnalysisResult> {
        const [similarity, intent, manipulation] = await Promise.all([
            this.semanticAnalyzer.analyzeSemanticSimilarity(prompt, challengeContext),
            this.semanticAnalyzer.analyzePromptIntent(prompt, challengeContext),
            this.semanticAnalyzer.detectManipulationPatterns(prompt),
        ]);

        return {
            similarity: similarity.similarity,
            embeddings: similarity.embeddings,
            intent: intent.intent,
            intentConfidence: intent.confidence,
            intentReasoning: intent.reasoning,
            manipulationScore: manipulation.score,
            manipulationPatterns: manipulation.patterns,
            contextAlignment: similarity.similarity,
            cached: similarity.cached,
        };
    }

    private combineResults(
        baseResult: PromptValidationResult,
        semanticAnalysis: SemanticAnalysisResult,
        config: SemanticValidationConfig
    ): EnhancedValidationResult {
        let adjustedScore = baseResult.riskScore;
        const additionalReasons: string[] = [];
        const manipulationIndicators: string[] = [];

        const intentAdjustments: Record<PromptIntent, number> = {
            'SOLUTION_SEEKING': 30,
            'GAMING': 40,
            'MANIPULATION': 50,
            'OFF_TOPIC': 20,
            'EDUCATIONAL': -20,
            'CLARIFICATION': -10,
            'DEBUGGING': -15,
            'UNCLEAR': 0,
        };

        const intentAdjustment = intentAdjustments[semanticAnalysis.intent] || 0;
        adjustedScore += intentAdjustment;

        if (intentAdjustment > 0) {
            additionalReasons.push(
                `Intent classified as ${semanticAnalysis.intent}: ${semanticAnalysis.intentReasoning}`
            );
        }

        if (semanticAnalysis.manipulationScore > 30) {
            adjustedScore += semanticAnalysis.manipulationScore * 0.5;
            additionalReasons.push(
                `Manipulation patterns detected (score: ${semanticAnalysis.manipulationScore})`
            );
            manipulationIndicators.push(...semanticAnalysis.manipulationPatterns);
        }

        if (semanticAnalysis.contextAlignment < config.semanticSimilarityThreshold) {
            const alignmentPenalty = (1 - semanticAnalysis.contextAlignment) * 30;
            adjustedScore += alignmentPenalty;
            additionalReasons.push(
                `Low context alignment: ${(semanticAnalysis.contextAlignment * 100).toFixed(1)}%`
            );
        }

        const hybridScore = Math.max(0, Math.min(100, adjustedScore));

        let classification: 'SAFE' | 'WARNING' | 'BLOCKED';
        let suggestedAction: 'ALLOW' | 'THROTTLE' | 'BLOCK' | 'REVIEW';

        if (hybridScore >= 80) {
            classification = 'BLOCKED';
            suggestedAction = 'BLOCK';
        } else if (hybridScore >= 50) {
            classification = 'WARNING';
            suggestedAction = config.strictMode ? 'REVIEW' : 'THROTTLE';
        } else {
            classification = 'SAFE';
            suggestedAction = 'ALLOW';
        }

        if (
            semanticAnalysis.intent === 'MANIPULATION' &&
            semanticAnalysis.intentConfidence > 80
        ) {
            classification = 'BLOCKED';
            suggestedAction = 'BLOCK';
            additionalReasons.push('High-confidence manipulation attempt detected');
        }

        return {
            isValid: classification === 'SAFE',
            riskScore: baseResult.riskScore,
            classification,
            reasons: [...baseResult.reasons, ...additionalReasons],
            suggestedAction,
            confidence: Math.max(baseResult.confidence, semanticAnalysis.intentConfidence || 0),
            metadata: baseResult.metadata,
            semanticAnalysis: {
                similarity: semanticAnalysis.similarity,
                embeddings: semanticAnalysis.embeddings,
                intent: semanticAnalysis.intent,
                manipulationScore: semanticAnalysis.manipulationScore,
                contextAlignment: semanticAnalysis.contextAlignment,
                processingTime: 0,
                cached: semanticAnalysis.cached,
            },
            hybridScore,
            detectedPatterns: [
                ...(baseResult.metadata?.detectedPatterns || []),
                ...semanticAnalysis.manipulationPatterns,
            ],
            manipulationIndicators,
        };
    }

    private convertToEnhancedResult(
        baseResult: PromptValidationResult,
        processingTime: number
    ): EnhancedValidationResult {
        return {
            ...baseResult,
            metadata: {
                ...baseResult.metadata,
                timeTaken: processingTime,
            },
            hybridScore: baseResult.riskScore,
            detectedPatterns: baseResult.metadata?.detectedPatterns || [],
            manipulationIndicators: [],
        };
    }

    private async storeValidationMetrics(
        validationId: string,
        result: EnhancedValidationResult,
        processingTime: number
    ): Promise<void> {
        const metricsKey = `validation_metrics:${new Date().toISOString().split('T')[0]}`;

        const pipeline = this.redis.pipeline();

        pipeline.hincrby(metricsKey, 'total', 1);
        pipeline.hincrby(metricsKey, result.classification.toLowerCase(), 1);

        if (result.semanticAnalysis) {
            pipeline.hincrby(metricsKey, 'semantic_applied', 1);
        }

        pipeline.hincrbyfloat(metricsKey, 'total_processing_time', processingTime);

        if (processingTime > 150) {
            pipeline.hincrby(metricsKey, 'slow_validations', 1);
        }

        pipeline.setex(
            `validation_detail:${validationId}`,
            86400,
            JSON.stringify({
                ...result,
                timestamp: new Date().toISOString(),
                processingTime,
            })
        );

        pipeline.expire(metricsKey, 86400 * 7); 

        await pipeline.exec();
    }

    async updateValidationRules(
        challengeId: string,
        customRules: ValidationRule[]
    ): Promise<void> {
        return this.baseValidator.updateValidationRules(challengeId, customRules);
    }

    async analyzePrompt(prompt: string): Promise<PromptAnalysis> {
        return this.baseValidator.analyzePrompt(prompt);
    }

    async getValidationMetrics(
        challengeId?: string,
        timeRange?: { start: Date; end: Date }
    ): Promise<ValidationMetrics> {
        const baseMetrics = await this.baseValidator.getValidationMetrics(
            challengeId,
            timeRange
        );

        const today = new Date().toISOString().split('T')[0];
        const metricsKey = `validation_metrics:${today}`;
        const hybridMetrics = await this.redis.hgetall(metricsKey);

        const semanticApplicationRate = hybridMetrics.semantic_applied
            ? (parseInt(hybridMetrics.semantic_applied) / parseInt(hybridMetrics.total || '1'))
            : 0;

        const slowValidationRate = hybridMetrics.slow_validations
            ? (parseInt(hybridMetrics.slow_validations) / parseInt(hybridMetrics.total || '1'))
            : 0;

        return {
            ...baseMetrics,
            avgProcessingTime: hybridMetrics.total_processing_time
                ? (parseFloat(hybridMetrics.total_processing_time) / parseInt(hybridMetrics.total || '1'))
                : baseMetrics.avgProcessingTime,
            topBlockedPatterns: [
                ...baseMetrics.topBlockedPatterns,
                { pattern: 'semantic_bypass', count: parseInt(hybridMetrics.semantic_applied || '0') }
            ],
            riskDistribution: {
                ...baseMetrics.riskDistribution,
                semanticApplicationRate: Math.round(semanticApplicationRate * 100),
                slowValidationRate: Math.round(slowValidationRate * 100),
            },
        };
    }

    async clearCache(challengeId?: string): Promise<void> {
        return this.baseValidator.clearCache(challengeId);
    }

    async getHealthMetrics() {
        const semanticHealth = this.semanticAnalyzer.getHealthStatus();
        const today = new Date().toISOString().split('T')[0];
        const metricsKey = `validation_metrics:${today}`;
        const metrics = await this.redis.hgetall(metricsKey);

        return {
            semantic: semanticHealth,
            validation: {
                totalToday: parseInt(metrics.total || '0'),
                blockedToday: parseInt(metrics.blocked || '0'),
                semanticAppliedToday: parseInt(metrics.semantic_applied || '0'),
                avgProcessingTime: metrics.total_processing_time
                    ? Math.round(parseFloat(metrics.total_processing_time) / parseInt(metrics.total || '1'))
                    : 0,
            },
        };
    }
}