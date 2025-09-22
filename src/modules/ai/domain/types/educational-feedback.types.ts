import { z } from 'zod';

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