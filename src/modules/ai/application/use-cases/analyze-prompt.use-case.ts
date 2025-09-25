import { IPromptValidatorService } from '../../domain/services/prompt-validator.service.interface';
import { logger } from '@/shared/infrastructure/monitoring/logger';

export interface AnalyzePromptDTO {
  prompt: string;
}

export class AnalyzePromptUseCase {
  constructor(
    private readonly promptValidator: IPromptValidatorService
  ) {}

  async execute(data: AnalyzePromptDTO) {
    const startTime = Date.now();
    const requestId = crypto.randomUUID();
    const { prompt } = data;

    logger.debug({
      requestId,
      operation: 'analyze_prompt',
      promptLength: prompt.length,
      promptPreview: prompt.substring(0, 100) + (prompt.length > 100 ? '...' : ''),
    }, 'Analyzing prompt structure and intent');

    try {
      const analysis = await this.promptValidator.analyzePrompt(prompt);

      const executionTime = Date.now() - startTime;

      logger.info({
        requestId,
        promptLength: prompt.length,
        intent: analysis.intent,
        complexity: analysis.complexity,
        language: analysis.language,
        hasCodeRequest: analysis.hasCodeRequest,
        socialEngineeringScore: analysis.socialEngineeringScore,
        estimatedTokens: analysis.estimatedTokens,
        topicsCount: analysis.topics?.length || 0,
        executionTime,
      }, 'Prompt analysis completed successfully');

      return analysis;
    } catch (error) {
      const executionTime = Date.now() - startTime;

      logger.error({
        requestId,
        promptLength: prompt.length,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        executionTime,
      }, 'Failed to analyze prompt');

      throw error;
    }
  }
}