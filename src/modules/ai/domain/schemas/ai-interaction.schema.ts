import { z } from 'zod';
import { AIProvider } from '../types/ai.types';

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
});

export type CreateAIInteractionDTO = z.infer<typeof CreateAIInteractionSchema>;

export const TrackCopyPasteSchema = z.object({
  attemptId: z.string().cuid(),
  action: z.enum(['copy', 'paste']),
  content: z.string(),
  sourceLines: z.number().int().min(0).optional(),
  targetLines: z.number().int().min(0).optional(),
  aiInteractionId: z.string().cuid().optional(),
});

export type TrackCopyPasteDTO = z.infer<typeof TrackCopyPasteSchema>;