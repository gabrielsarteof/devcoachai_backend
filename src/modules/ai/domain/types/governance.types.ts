export interface PromptValidationResult {
  isValid: boolean;
  riskScore: number; // 0-100
  classification: 'SAFE' | 'WARNING' | 'BLOCKED';
  reasons: string[];
  suggestedAction: 'ALLOW' | 'THROTTLE' | 'BLOCK' | 'REVIEW';
  confidence: number; // 0-100
  relevanceScore: number; // 0-1, relevância contextual
  metadata?: {
    relevanceScore?: number;
    contextOverlap?: number;
    detectedPatterns?: string[];
    timeTaken?: number;
    validationId?: string;
    stepResults?: Array<{
      step: string;
      passed: boolean;
      risk: number;
    }>;
    error?: boolean;
  };
}

export interface ChallengeContext {
  challengeId: string;
  title: string;
  category: string;
  keywords: string[];
  allowedTopics: string[];
  forbiddenPatterns: string[];
  difficulty: string;
  targetMetrics: {
    maxDI: number;
    minPR: number;
    minCS: number;
  };
  learningObjectives?: string[];
  techStack?: string[];
}

export interface ValidationConfig {
  strictMode: boolean;
  contextSimilarityThreshold: number; 
  offTopicThreshold: number; 
  blockDirectSolutions: boolean;
  allowedDeviationPercentage: number; 
  enableSemanticAnalysis?: boolean;
  customRules?: ValidationRule[];
}

export interface ValidationRule {
  ruleId: string;
  pattern: string | RegExp;
  action: 'BLOCK' | 'WARN' | 'FLAG' | 'LOG';
  weight: number; 
  description: string;
  category?: 'security' | 'gaming' | 'offtopic' | 'solution' | 'social_engineering';
  enabled?: boolean;
}

export interface ValidationStepResult {
  stepName: string;
  passed: boolean;
  riskContribution: number;
  reason: string | null;
  metadata?: Record<string, any>;
  executionTime?: number;
}

export interface PromptAnalysis {
  intent: 'educational' | 'solution_seeking' | 'gaming' | 'off_topic' | 'unclear' | 'learning' | 'guidance';
  topics: string[];
  complexity: 'simple' | 'moderate' | 'complex';
  estimatedTokens: number;
  language: string;
  hasCodeRequest: boolean;
  socialEngineeringScore: number;
  educationalValue?: number;
  riskFactors?: string[];
}

export interface SemanticAnalysisResult {
  similarity: number; 
  embeddings: number[];
  intent: PromptIntent;
  manipulationScore: number; 
  contextAlignment: number; 
  processingTime: number;
  cached: boolean;
}

export type PromptIntent = 
  | 'EDUCATIONAL'      
  | 'SOLUTION_SEEKING' 
  | 'CLARIFICATION'   
  | 'DEBUGGING'        
  | 'GAMING'          
  | 'MANIPULATION'   
  | 'OFF_TOPIC'       
  | 'UNCLEAR';        

export interface EnhancedValidationResult extends PromptValidationResult {
  semanticAnalysis?: SemanticAnalysisResult;
  hybridScore: number;
  detectedPatterns: string[];
  manipulationIndicators: string[];
}

export interface SemanticCacheConfig {
  embeddingTTL: number;      
  intentAnalysisTTL: number; 
  similarityTTL: number;     
}

export interface SemanticValidationConfig extends ValidationConfig {
  enableSemanticAnalysis: boolean;
  borderlineLowerBound: number;  
  borderlineUpperBound: number;  
  semanticSimilarityThreshold: number;
  maxPromptLength: number;     
  openAIModel: string;           
  embeddingModel: string;        
}