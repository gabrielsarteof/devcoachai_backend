import { PromptValidationResult, ValidationConfig, ValidationRule, PromptAnalysis } from '../types/governance.types';
import { ChallengeContext } from '../types/context.types';
import { ValidationMetrics } from '../types/validation.types';

export interface IPromptValidatorService {
  validatePrompt(
    prompt: string,
    challengeContext: ChallengeContext,
    userLevel: number,
    config?: ValidationConfig
  ): Promise<PromptValidationResult>;

  updateValidationRules(
    challengeId: string,
    customRules: ValidationRule[]
  ): Promise<void>;
  
  analyzePrompt(prompt: string): Promise<PromptAnalysis>;
  
  getValidationMetrics(
    challengeId?: string,
    timeRange?: { start: Date; end: Date }
  ): Promise<ValidationMetrics>; 
  
  clearCache(challengeId?: string): Promise<void>;
}