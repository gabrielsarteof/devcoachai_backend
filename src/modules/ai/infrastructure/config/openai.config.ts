import { z } from 'zod';

export const OpenAIConfigSchema = z.object({
  apiKey: z.string().min(1),
  organizationId: z.string().optional(),
  baseURL: z.string().url().optional(),
  defaultModel: z.string().default('gpt-4o'),
  maxRetries: z.number().int().min(0).max(5).default(3),
  timeout: z.number().int().min(1000).default(30000),
});

export type OpenAIConfig = z.infer<typeof OpenAIConfigSchema>;

export const defaultOpenAIConfig: OpenAIConfig = {
  apiKey: process.env.OPENAI_API_KEY || '',
  organizationId: process.env.OPENAI_ORG_ID,
  defaultModel: 'gpt-4o',
  maxRetries: 3,
  timeout: 30000,
};