import { z } from 'zod';
import { Difficulty, Category } from '@/shared/domain/enums';

const TestCaseSchema = z.object({
  input: z.string(),
  expectedOutput: z.string(),
  weight: z.number().min(0).max(1),
  description: z.string().optional(),
});

const HintSchema = z.object({
  trigger: z.string(),
  message: z.string(),
  cost: z.number().default(10),
});

const TrapSchema = z.object({
  id: z.string(),
  type: z.enum(['security', 'performance', 'logic', 'architecture']),
  buggedCode: z.string(),
  correctCode: z.string(),
  explanation: z.string(),
  detectionPattern: z.string(),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
});

export const CreateChallengeSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/),
  title: z.string().min(5).max(100),
  description: z.string().min(20).max(500),

  difficulty: z.nativeEnum(Difficulty),
  category: z.nativeEnum(Category),
  estimatedMinutes: z.number().int().min(5).max(480),
  languages: z.array(z.string()).min(1),

  instructions: z.string().min(50),
  starterCode: z.string().optional(),
  solution: z.string().min(10),

  testCases: z.array(TestCaseSchema).min(3),
  hints: z.array(HintSchema).default([]),
  traps: z.array(TrapSchema).min(1),

  baseXp: z.number().int().min(50).max(1000).default(100),
  bonusXp: z.number().int().min(0).max(500).default(50),

  targetMetrics: z.object({
    maxDI: z.number().min(0).max(100).default(40),
    minPR: z.number().min(0).max(100).default(70),
    minCS: z.number().min(0).max(10).default(8),
  }).optional().default({ maxDI: 40, minPR: 70, minCS: 8 }),
});

export type CreateChallengeDTO = z.infer<typeof CreateChallengeSchema>;
