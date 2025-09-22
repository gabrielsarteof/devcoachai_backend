import { z } from 'zod';

export const PromptSequencePatternSchema = z.enum([
  'iterative_refinement',    // Usuário refinando prompt gradualmente
  'rapid_fire',              // Múltiplos prompts em sequência rápida
  'solution_building',       // Construindo solução parte por parte
  'context_switching',       // Mudando de contexto para evitar detecção
  'learning_progression'     // Progressão saudável de aprendizado
]);

export const TemporalAnalysisResultSchema = z.object({
  userId: z.string().cuid(),
  attemptId: z.string().cuid(),
  windowAnalyzed: z.object({
    start: z.date(),
    end: z.date(),
    promptCount: z.number().int().positive(),
  }),
  detectedPatterns: z.array(z.object({
    pattern: PromptSequencePatternSchema,
    confidence: z.number().min(0).max(100),
    riskContribution: z.number().min(0).max(100),
    promptIndices: z.array(z.number().int().nonnegative()),
  })),
  behaviorMetrics: z.object({
    avgTimeBetweenPrompts: z.number(), 
    semanticCoherence: z.number().min(0).max(1),
    complexityProgression: z.enum(['increasing', 'stable', 'decreasing', 'erratic']),
    dependencyTrend: z.enum(['improving', 'stable', 'worsening']),
  }),
  overallRisk: z.number().min(0).max(100),
  isGamingAttempt: z.boolean(),
  recommendations: z.array(z.string()),
});

export type PromptSequencePattern = z.infer<typeof PromptSequencePatternSchema>;
export type TemporalAnalysisResult = z.infer<typeof TemporalAnalysisResultSchema>;

export const FeedbackLevelSchema = z.enum(['beginner', 'intermediate', 'advanced']);
export const LearningStyleSchema = z.enum(['visual', 'textual', 'practical', 'conceptual']);

export const EducationalFeedbackSchema = z.object({
  feedbackId: z.string().uuid(),
  userId: z.string().cuid(),
  attemptId: z.string().cuid().optional(),
  level: FeedbackLevelSchema,
  
  context: z.object({
    whatHappened: z.string(),
    whyBlocked: z.string().optional(),
    riskScore: z.number().min(0).max(100),
    classification: z.enum(['SAFE', 'WARNING', 'BLOCKED']),
  }),
  
  guidance: z.object({
    immediateFix: z.array(z.string()),
    betterApproaches: z.array(z.string()),
    conceptsToReview: z.array(z.string()),
    commonMistakes: z.array(z.string()),
  }),
  
  learningPath: z.object({
    currentStage: z.string(),
    nextSteps: z.array(z.string()),
    estimatedProgress: z.number().min(0).max(100),
    suggestedResources: z.array(z.object({
      type: z.enum(['article', 'video', 'exercise', 'documentation']),
      title: z.string(),
      url: z.string().url().optional(),
      relevance: z.number().min(0).max(100),
    })),
  }),
  
  tone: z.enum(['encouraging', 'neutral', 'strict']),
  language: z.enum(['pt', 'en']).default('pt'),
});

export type FeedbackLevel = z.infer<typeof FeedbackLevelSchema>;
export type LearningStyle = z.infer<typeof LearningStyleSchema>;
export type EducationalFeedback = z.infer<typeof EducationalFeedbackSchema>;