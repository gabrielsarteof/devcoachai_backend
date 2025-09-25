import { IEducationalFeedbackService } from '../../domain/services/educational-feedback.service.interface';
import { logger } from '@/shared/infrastructure/monitoring/logger';

export interface GenerateEducationalFeedbackDTO {
  challengeId: string;
  userLevel: number;
  userCode?: string;
  userPrompt?: string;
  performance?: {
    dependencyIndex: number;
    passRate: number;
    checklistScore: number;
  };
}

export class GenerateEducationalFeedbackUseCase {
  constructor(
    private readonly educationalFeedbackService: IEducationalFeedbackService
  ) {}

  async execute(userId: string, data: GenerateEducationalFeedbackDTO) {
    const startTime = Date.now();
    const requestId = crypto.randomUUID();

    logger.info({
      requestId,
      operation: 'generate_educational_feedback',
      userId,
      challengeId: data.challengeId,
      userLevel: data.userLevel,
      hasUserCode: !!data.userCode,
      hasUserPrompt: !!data.userPrompt,
      hasPerformanceData: !!data.performance,
    }, 'Generating educational feedback');

    try {
      const feedback = await this.educationalFeedbackService.generateFeedback({
        userId,
        challengeId: data.challengeId,
        userLevel: data.userLevel,
        userCode: data.userCode,
        userPrompt: data.userPrompt,
        performance: data.performance,
      });

      const executionTime = Date.now() - startTime;

      logger.info({
        requestId,
        userId,
        challengeId: data.challengeId,
        userLevel: data.userLevel,
        feedbackGenerated: !!feedback,
        hasContext: !!feedback.context,
        hasGuidance: !!feedback.guidance,
        hasLearningPath: !!feedback.learningPath,
        executionTime,
      }, 'Educational feedback generated successfully');

      return feedback;
    } catch (error) {
      const executionTime = Date.now() - startTime;

      logger.error({
        requestId,
        userId,
        challengeId: data.challengeId,
        userLevel: data.userLevel,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        executionTime,
      }, 'Failed to generate educational feedback');

      throw error;
    }
  }
}