export interface CodeMetrics {
  totalLines: number;
  linesFromAI: number;
  linesTyped: number;
  copyPasteEvents: number;
  deleteEvents: number;
  testRuns: number;
  testsPassed: number;
  testsTotal: number;
  checklistItems: ChecklistItem[];
}

export interface ChecklistItem {
  id: string;
  label: string;
  checked: boolean;
  weight: number;
  category: 'validation' | 'security' | 'testing' | 'documentation';
}

export interface MetricCalculation {
  dependencyIndex: number;
  passRate: number;
  checklistScore: number;
  timestamp: Date;
  sessionTime: number;
}

export interface MetricTrend {
  metric: 'DI' | 'PR' | 'CS';
  values: Array<{
    timestamp: Date;
    value: number;
  }>;
  trend: 'improving' | 'stable' | 'declining';
  changePercent: number;
}

export interface RiskAssessment {
  level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  factors: string[];
  recommendations: string[];
  score: number;
}