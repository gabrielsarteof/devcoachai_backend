export interface ValidationMetrics {
  totalValidations: number;
  blockedCount: number;
  throttledCount: number;
  allowedCount: number;
  avgRiskScore: number;
  avgConfidence: number;
  avgProcessingTime: number;
  topBlockedPatterns: Array<{ pattern: string; count: number }>;
  riskDistribution: Record<string, number>;
}

export interface ValidationStepResult {
  stepName: string;
  passed: boolean;
  riskContribution: number;
  reason: string | null;
  metadata?: Record<string, any>;
  executionTime?: number;
}