import { z } from 'zod';


export const AIMessageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant']),
  content: z.string().min(1),
  name: z.string().optional(),
});

export const CreateAIInteractionSchema = z.object({
  userId: z.string().cuid(),
  attemptId: z.string().cuid().optional(),
  provider: z.enum(['openai', 'anthropic', 'google']),
  model: z.string(),
  messages: z.array(AIMessageSchema),
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