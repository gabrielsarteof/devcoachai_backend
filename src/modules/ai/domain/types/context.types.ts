export interface ContextStats {
  cachedContexts: number;
  avgKeywords: number;
  avgForbiddenPatterns: number;
  mostCommonCategories: Array<{ category: string; count: number }>;
  cacheHitRate: number;
}

export interface ChallengeContext {
  challengeId: string;
  title: string;
  category: string;
  keywords: string[];
  allowedTopics: string[];
  forbiddenPatterns: string[];
  difficulty: string;
  targetMetrics: {
    maxDI: number;
    minPR: number;
    minCS: number;
  };
  learningObjectives?: string[];
  techStack?: string[];
}