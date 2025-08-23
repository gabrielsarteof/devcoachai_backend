import { z } from 'zod';

export const MetricSnapshotSchema = z.object({
  attemptId: z.string().cuid(),
  userId: z.string().cuid(),
  sessionTime: z.number().int().min(0),

  dependencyIndex: z.number().min(0).max(100),
  passRate: z.number().min(0).max(100),
  checklistScore: z.number().min(0).max(10),

  codeQuality: z.number().min(0).max(100).optional(),
  debugTime: z.number().int().min(0).optional(),
  aiUsageTime: z.number().int().min(0).optional(),
  manualCodingTime: z.number().int().min(0).optional(),
});

export type MetricSnapshotDTO = z.infer<typeof MetricSnapshotSchema>;

export const CalculateMetricsSchema = z.object({
  totalLines: z.number().int().min(0),
  linesFromAI: z.number().int().min(0),
  testsTotal: z.number().int().min(1),
  testsPassed: z.number().int().min(0),
  checklistItems: z.array(
    z.object({
      id: z.string(),
      checked: z.boolean(),
      weight: z.number().default(1),
    })
  ),
});

export type CalculateMetricsDTO = z.infer<typeof CalculateMetricsSchema>;
