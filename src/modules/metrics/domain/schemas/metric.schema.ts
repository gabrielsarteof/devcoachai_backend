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

export const ChecklistItemSchema = z.object({
  id: z.string(),
  label: z.string(),
  checked: z.boolean(),
  weight: z.number().min(0).default(1),
  category: z.enum(['validation', 'security', 'testing', 'documentation']),
});

export type ChecklistItemDTO = z.infer<typeof ChecklistItemSchema>;

export const TrackMetricsSchema = z.object({
  attemptId: z.string().cuid(),
  totalLines: z.number().int().min(0),
  linesFromAI: z.number().int().min(0),
  linesTyped: z.number().int().min(0),
  copyPasteEvents: z.number().int().min(0),
  deleteEvents: z.number().int().min(0),
  testRuns: z.number().int().min(0),
  testsPassed: z.number().int().min(0),
  testsTotal: z.number().int().min(1),
  checklistItems: z.array(ChecklistItemSchema),
  sessionTime: z.number().int().min(0),
  aiUsageTime: z.number().int().min(0).optional(),
  manualCodingTime: z.number().int().min(0).optional(),
  debugTime: z.number().int().min(0).optional(),
}).refine((data) => data.linesFromAI <= data.totalLines, {
  message: "AI lines cannot exceed total lines",
  path: ["linesFromAI"],
}).refine((data) => data.testsPassed <= data.testsTotal, {
  message: "Passed tests cannot exceed total tests",
  path: ["testsPassed"],
}).refine((data) => {
  if (data.totalLines === 0) {
    return data.linesFromAI === 0;
  }
  return true;
}, {
  message: "AI lines must be zero when total lines is zero",
  path: ["linesFromAI"],
}).refine((data) => {
  const timeBreakdown = (data.aiUsageTime || 0) + (data.manualCodingTime || 0) + (data.debugTime || 0);
  if (data.aiUsageTime !== undefined || data.manualCodingTime !== undefined || data.debugTime !== undefined) {
    return timeBreakdown <= data.sessionTime;
  }
  return true;
}, {
  message: "Time breakdown cannot exceed session time",
  path: ["sessionTime"],
});

export type TrackMetricsDTO = z.infer<typeof TrackMetricsSchema>;

export const StreamMetricsSchema = z.object({
  attemptId: z.string().cuid(),
  interval: z.number().int().min(1000).max(30000).default(5000),
});

export type StreamMetricsDTO = z.infer<typeof StreamMetricsSchema>;

export const AttemptParamsSchema = z.object({
  attemptId: z.string().cuid(),
});

export type AttemptParamsDTO = z.infer<typeof AttemptParamsSchema>;
