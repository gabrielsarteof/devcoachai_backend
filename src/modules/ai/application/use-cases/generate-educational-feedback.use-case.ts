import { IEducationalFeedbackService } from '../../domain/services/educational-feedback.service.interface';
import { logger } from '@/shared/infrastructure/monitoring/logger';

export interface GenerateEducationalFeedbackDTO {
  challengeId: string;
  userLevel?: number;
  userCode?: string;
  userPrompt?: string;
  violationType?: string;
  context?: {
    originalPrompt?: string;
    detectedPatterns?: string[];
  };
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
      // Simulação para testes: cria validação baseada no tipo de violação
      const mockValidation = {
        isValid: data.violationType ? false : true,
        riskScore: data.violationType === 'prompt_injection' ? 90 : 0.1,
        classification: data.violationType === 'prompt_injection' ? 'BLOCKED' as const : 'SAFE' as const,
        confidence: 0.9,
        reasons: data.violationType === 'prompt_injection' ? ['Tentativa de engenharia social detectada'] : [] as string[],
        suggestedAction: data.violationType === 'prompt_injection' ? 'BLOCK' as const : 'ALLOW' as const,
        metadata: {
          intent: data.violationType === 'prompt_injection' ? 'gaming' : 'educational',
          complexity: 'moderate',
          topics: ['programming'],
          hasCodeRequest: !!data.userCode,
          violationType: data.violationType
        }
      };

      const feedback = await this.educationalFeedbackService.generateFeedback({
        validation: mockValidation,
        userLevel: data.userLevel,
        userId,
        context: {
          challengeId: data.challengeId,
          title: 'Mock Challenge',
          keywords: [],
          allowedTopics: ['programming', 'algorithms', 'data structures'],
          forbiddenPatterns: [],
          category: 'BACKEND',
          difficulty: 'MEDIUM',
          targetMetrics: {
            maxDI: 40,
            minPR: 70,
            minCS: 8
          }
        }
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