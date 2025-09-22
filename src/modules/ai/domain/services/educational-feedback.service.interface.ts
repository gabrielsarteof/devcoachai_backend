import { EducationalFeedback } from '../types/educational-feedback.types';
import { PromptValidationResult, ChallengeContext } from '../types/governance.types';

export interface IEducationalFeedbackService {
  generateFeedback(params: {
    validation: PromptValidationResult;
    userLevel: number;
    userId: string;
    context?: ChallengeContext;
  }): Promise<EducationalFeedback>;
  
  getProgressInsights(
    userId: string,
    challengeId: string
  ): Promise<{
    strengths: string[];
    improvements: string[];
    nextMilestone: string;
    estimatedTime: number;
  }>;
}