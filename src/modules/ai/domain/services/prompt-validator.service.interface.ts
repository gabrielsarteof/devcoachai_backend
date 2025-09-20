import { 
  PromptValidationResult, 
  ChallengeContext, 
  ValidationConfig, 
  ValidationRule,
  PromptAnalysis 
} from '../types/governance.types';

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

export interface IChallengeContextService {
  getChallengeContext(challengeId: string): Promise<ChallengeContext>;
  
  refreshChallengeContext(challengeId: string): Promise<void>;
  
  buildContextFromChallenge(challenge: any): ChallengeContext;
  
  prewarmCache(challengeIds: string[]): Promise<void>;
  
  getContextStats(): Promise<ContextStats>;
}

export interface ValidationMetrics {
  totalValidations: number;
  blockedCount: number;
  throttledCount: number;
  allowedCount: number;
  avgRiskScore: number;
  avgConfidence: number;
  avgProcessingTime: number;
  topBlockedPatterns: Array<{ pattern: string; count: number }>;
  riskDistribution: Record<string, number>;
}

export interface ContextStats {
  cachedContexts: number;
  avgKeywords: number;
  avgForbiddenPatterns: number;
  mostCommonCategories: Array<{ category: string; count: number }>;
  cacheHitRate: number;
}