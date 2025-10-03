import { z } from 'zod';

export const AIMessageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant']),
  content: z.string().min(1),
  name: z.string().optional(),
});

export const CreateAIInteractionSchema = z.object({
  attemptId: z.string().cuid().optional(),
  provider: z.enum(['openai', 'anthropic']),
  model: z.string(),
  messages: z.array(AIMessageSchema).min(1),
  temperature: z.number().min(0).max(2).default(0.7),
  maxTokens: z.number().int().min(1).max(32000).default(2000),
  stream: z.boolean().default(false),
  challengeId: z.string().cuid().optional(),
  enableGovernance: z.boolean().default(true),
});

export type CreateAIInteractionDTO = z.infer<typeof CreateAIInteractionSchema>;
export type AIMessageDTO = z.infer<typeof AIMessageSchema>;

export const TrackCopyPasteSchema = z.object({
  attemptId: z.string().cuid(),
  action: z.enum(['copy', 'paste']),
  content: z.string(),
  sourceLines: z.number().int().min(0).optional(),
  targetLines: z.number().int().min(0).optional(),
  aiInteractionId: z.string().cuid().optional(),
});

export type TrackCopyPasteDTO = z.infer<typeof TrackCopyPasteSchema>;

export const PromptValidationRequestSchema = z.object({
  challengeId: z.string().cuid(),
  prompt: z.string().min(1).max(10000),
  userLevel: z.number().int().min(1).max(10).optional(),
  attemptId: z.string().cuid().optional(),
  config: z.object({
    strictMode: z.boolean().optional(),
    contextSimilarityThreshold: z.number().min(0).max(1).optional(),
    offTopicThreshold: z.number().min(0).max(1).optional(),
    blockDirectSolutions: z.boolean().optional(),
    allowedDeviationPercentage: z.number().min(0).max(100).optional(),
    enableSemanticAnalysis: z.boolean().optional(),
  }).optional(),
});

export type PromptValidationRequestDTO = z.infer<typeof PromptValidationRequestSchema>;

export const ValidationMetricsQuerySchema = z.object({
  challengeId: z.string().cuid().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

export type ValidationMetricsQueryDTO = z.infer<typeof ValidationMetricsQuerySchema>;

export const TemporalAnalysisResultSchema = z.object({
  overallRisk: z.number().min(0).max(100),
  isGamingAttempt: z.boolean(),
  temporalPatterns: z.array(z.object({
    type: z.string(),
    confidence: z.number(),
    metadata: z.record(z.string(), z.unknown()).optional()

  })),
  behaviorMetrics: z.object({
    progressionScore: z.number(),
    complexityProgression: z.number(),
    dependencyTrend: z.number()
  }),
  recommendations: z.array(z.string())
});

export type TemporalAnalysisResultDTO = z.infer<typeof TemporalAnalysisResultSchema>;

export const EducationalFeedbackSchema = z.object({
  context: z.object({
    whatHappened: z.string(),
    whyBlocked: z.string(),
    riskScore: z.number()
  }),
  guidance: z.object({
    immediateFix: z.array(z.string()),
    betterApproaches: z.array(z.string()),
    conceptsToReview: z.array(z.string())
  }),
  learningPath: z.object({
    currentStage: z.string(),
    nextSteps: z.array(z.string()),
    suggestedResources: z.array(z.object({
      title: z.string(),
      url: z.string(),
      relevance: z.number()
    }))
  })
});

export type EducationalFeedbackDTO = z.infer<typeof EducationalFeedbackSchema>;

export const AnalyzeTemporalBehaviorSchema = z.object({
  userId: z.string().cuid(),
  timeWindow: z.string().optional().default('1h'),
  analysisType: z.string().optional().default('interaction_pattern'),
  lookbackMinutes: z.number().int().min(1).max(120).optional(),
});

export type AnalyzeTemporalBehaviorDTO = z.infer<typeof AnalyzeTemporalBehaviorSchema>;

export const GenerateFeedbackRequestSchema = z.object({
  challengeId: z.string().cuid(),
  riskScore: z.number().min(0).max(100),
  reasons: z.array(z.string()),
  userLevel: z.number().int().min(1).max(10).optional(),
  tone: z.enum(['encouraging', 'neutral', 'strict']).optional(),
  context: z.object({
    challengeId: z.string().cuid(),
    title: z.string().optional(),
    keywords: z.array(z.string()).optional(),
    forbiddenPatterns: z.array(z.string()).optional(),
    category: z.string().optional(),
    allowedTopics: z.array(z.string()).optional(),
    techStack: z.array(z.string()).optional(),
    learningObjectives: z.array(z.string()).optional(),
  }).optional(),
});

export type GenerateFeedbackRequestDTO = z.infer<typeof GenerateFeedbackRequestSchema>;