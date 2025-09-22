import { logger } from '@/shared/infrastructure/monitoring/logger';
import { ITemporalAnalyzerService } from '../../domain/services/temporal-analyzer.service.interface';
import { IEducationalFeedbackService } from '../../domain/services/educational-feedback.service.interface';
import { TemporalAnalysisResult } from '../../domain/types/temporal-analysis.types';
import { EducationalFeedback } from '../../domain/types/educational-feedback.types';

export class AnalyzeTemporalBehaviorUseCase {
  private readonly useCaseLogger = logger.child({ useCase: 'AnalyzeTemporalBehavior' });

  constructor(
    private readonly temporalAnalyzer: ITemporalAnalyzerService,
    private readonly feedbackService: IEducationalFeedbackService
  ) { }

  async execute(params: {
    userId: string;
    attemptId: string;
    currentValidation?: any;
    lookbackMinutes?: number;
  }): Promise<{
    temporalAnalysis: TemporalAnalysisResult;
    feedback?: EducationalFeedback;
    shouldBlock: boolean;
    additionalThrottling?: number;
    isGamingAttempt?: boolean;
    overallRisk: number;
    temporalPatterns?: Array<{ pattern: string; confidence: number }>;
  }> {
    const startTime = Date.now();
    const { userId, attemptId, currentValidation, lookbackMinutes = 30 } = params;

    this.useCaseLogger.info({
      userId,
      attemptId,
      lookbackMinutes,
      hasCurrentValidation: !!currentValidation
    }, 'Starting temporal behavior analysis');

    try {
      const temporalAnalysis = await this.temporalAnalyzer.analyzePromptSequence(
        userId,
        attemptId,
        lookbackMinutes
      );

      const shouldBlock = temporalAnalysis.isGamingAttempt && temporalAnalysis.overallRisk > 80;

      let additionalThrottling: number | undefined;
      if (temporalAnalysis.overallRisk > 60) {
        additionalThrottling = Math.min(temporalAnalysis.overallRisk * 10, 5000);
      }

      let feedback: EducationalFeedback | undefined;
      if (currentValidation) {
        const userLevel = await this.getUserLevel(userId);
        feedback = await this.feedbackService.generateFeedback({
          validation: currentValidation,
          userId,
          userLevel
        });

        feedback.userId = userId;
        if (attemptId) {
          feedback.attemptId = attemptId;
        }
      }

      const processingTime = Date.now() - startTime;

      this.useCaseLogger.info({
        userId,
        attemptId,
        isGaming: temporalAnalysis.isGamingAttempt,
        overallRisk: temporalAnalysis.overallRisk,
        shouldBlock,
        additionalThrottling,
        hasFeedback: !!feedback,
        processingTime
      }, 'Temporal behavior analysis completed');

      return {
        temporalAnalysis,
        feedback,
        shouldBlock,
        additionalThrottling,
        isGamingAttempt: temporalAnalysis.isGamingAttempt,
        overallRisk: temporalAnalysis.overallRisk,
        temporalPatterns: temporalAnalysis.detectedPatterns.map(p => ({
          pattern: p.pattern,
          confidence: p.confidence
        }))
      };
    } catch (error) {
      this.useCaseLogger.error({
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        userId,
        attemptId
      }, 'Failed to analyze temporal behavior');

      return {
        temporalAnalysis: {
          userId,
          attemptId,
          windowAnalyzed: {
            start: new Date(Date.now() - lookbackMinutes * 60 * 1000),
            end: new Date(),
            promptCount: 0
          },
          detectedPatterns: [],
          behaviorMetrics: {
            avgTimeBetweenPrompts: 0,
            semanticCoherence: 1,
            complexityProgression: 'stable',
            dependencyTrend: 'stable'
          },
          overallRisk: 0,
          isGamingAttempt: false,
          recommendations: []
        },
        shouldBlock: false,
        overallRisk: 0
      };
    }
  }

  private async getUserLevel(_userId: string): Promise<number> {
    return 1;
  }
}