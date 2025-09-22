import { 
  TemporalAnalysisResult 
} from '../types/temporal-analysis.types';

export interface ITemporalAnalyzerService {
  analyzePromptSequence(
    userId: string,
    attemptId: string,
    lookbackMinutes?: number
  ): Promise<TemporalAnalysisResult>;
  
  detectGamingPatterns(
    prompts: Array<{ content: string; timestamp: Date; riskScore: number }>
  ): Promise<{ isGaming: boolean; confidence: number; patterns: string[] }>;
  
  calculateBehaviorRisk(
    userId: string,
    timeWindow: { start: Date; end: Date }
  ): Promise<number>;
}