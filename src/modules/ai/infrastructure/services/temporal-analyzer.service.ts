import { Redis } from 'ioredis';
import { PrismaClient } from '@prisma/client';
import { logger } from '@/shared/infrastructure/monitoring/logger';
import { ITemporalAnalyzerService } from '../../domain/services/temporal-analyzer.service.interface';
import { 
  TemporalAnalysisResult, 
  PromptSequencePattern 
} from '../../domain/types/temporal-analysis.types';

export class TemporalAnalyzerService implements ITemporalAnalyzerService {
  private readonly serviceLogger = logger.child({ service: 'TemporalAnalyzer' });
  private readonly CACHE_TTL = 300; 
  private readonly MIN_PROMPTS = 3;
  private readonly RAPID_FIRE_THRESHOLD = 10; 
  private readonly GAMING_CONFIDENCE_THRESHOLD = 70;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly redis: Redis
  ) {}

  async analyzePromptSequence(
    userId: string,
    attemptId: string,
    lookbackMinutes: number = 30
  ): Promise<TemporalAnalysisResult> {
    const startTime = Date.now();
    const cacheKey = `temporal:${userId}:${attemptId}:${lookbackMinutes}`;
    
    this.serviceLogger.info({
      userId,
      attemptId,
      lookbackMinutes,
      operation: 'analyze_prompt_sequence'
    }, 'Starting temporal analysis');

    try {
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        this.serviceLogger.debug({ 
          userId, 
          attemptId,
          cacheHit: true 
        }, 'Temporal analysis cache hit');
        return JSON.parse(cached);
      }

      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - lookbackMinutes * 60 * 1000);
      
      const validationLogs = await this.prisma.validationLog.findMany({
        where: {
          userId,
          attemptId,
          createdAt: {
            gte: startDate,
            lte: endDate
          }
        },
        orderBy: { createdAt: 'asc' }
      });

      if (validationLogs.length < this.MIN_PROMPTS) {
        this.serviceLogger.info({
          userId,
          attemptId,
          promptCount: validationLogs.length,
          minRequired: this.MIN_PROMPTS
        }, 'Insufficient prompts for temporal analysis');
        
        return this.createDefaultAnalysis(userId, attemptId, startDate, endDate, validationLogs.length);
      }

      const patterns = await this.detectPatterns(validationLogs);
      const metrics = this.calculateBehaviorMetrics(validationLogs);
      const overallRisk = this.calculateOverallRisk(patterns, metrics);
      
      const result: TemporalAnalysisResult = {
        userId,
        attemptId,
        windowAnalyzed: {
          start: startDate,
          end: endDate,
          promptCount: validationLogs.length
        },
        detectedPatterns: patterns,
        behaviorMetrics: metrics,
        overallRisk,
        isGamingAttempt: overallRisk >= this.GAMING_CONFIDENCE_THRESHOLD,
        recommendations: this.generateRecommendations(patterns, overallRisk)
      };

      await this.redis.setex(cacheKey, this.CACHE_TTL, JSON.stringify(result));

      const processingTime = Date.now() - startTime;
      this.serviceLogger.info({
        userId,
        attemptId,
        patterns: patterns.map(p => p.pattern),
        overallRisk,
        isGaming: result.isGamingAttempt,
        processingTime
      }, 'Temporal analysis completed');

      return result;
    } catch (error) {
      this.serviceLogger.error({
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        userId,
        attemptId
      }, 'Temporal analysis failed');
      throw error;
    }
  }

  private async detectPatterns(
    logs: Array<{ createdAt: Date; riskScore: number; classification: string; metadata: any }>
  ): Promise<Array<{ pattern: PromptSequencePattern; confidence: number; riskContribution: number; promptIndices: number[] }>> {
    const patterns: Array<{ pattern: PromptSequencePattern; confidence: number; riskContribution: number; promptIndices: number[] }> = [];
    
    const rapidFireIndices: number[] = [];
    for (let i = 1; i < logs.length; i++) {
      const timeDiff = (logs[i].createdAt.getTime() - logs[i-1].createdAt.getTime()) / 1000;
      if (timeDiff < this.RAPID_FIRE_THRESHOLD) {
        rapidFireIndices.push(i-1, i);
      }
    }
    
    if (rapidFireIndices.length > 0) {
      patterns.push({
        pattern: 'rapid_fire',
        confidence: Math.min((rapidFireIndices.length / logs.length) * 100, 100),
        riskContribution: 30,
        promptIndices: [...new Set(rapidFireIndices)]
      });
    }

    let refinementCount = 0;
    const refinementIndices: number[] = [];
    for (let i = 1; i < logs.length; i++) {
      if (logs[i].riskScore > logs[i-1].riskScore) {
        refinementCount++;
        refinementIndices.push(i);
      }
    }
    
    if (refinementCount > logs.length * 0.5) {
      patterns.push({
        pattern: 'iterative_refinement',
        confidence: (refinementCount / logs.length) * 100,
        riskContribution: 40,
        promptIndices: refinementIndices
      });
    }

    const blockedCount = logs.filter(l => l.classification === 'BLOCKED').length;
    if (blockedCount > logs.length * 0.3) {
      patterns.push({
        pattern: 'solution_building',
        confidence: (blockedCount / logs.length) * 100,
        riskContribution: 50,
        promptIndices: logs.map((_, i) => i).filter(i => logs[i].classification === 'BLOCKED')
      });
    }

    return patterns;
  }

  private calculateBehaviorMetrics(logs: any[]): any {
    const timeDiffs: number[] = [];
    for (let i = 1; i < logs.length; i++) {
      timeDiffs.push((logs[i].createdAt.getTime() - logs[i-1].createdAt.getTime()) / 1000);
    }
    
    const avgTime = timeDiffs.length > 0 
      ? timeDiffs.reduce((a, b) => a + b, 0) / timeDiffs.length 
      : 0;

    const riskScores = logs.map(l => l.riskScore);
    let trend: 'increasing' | 'stable' | 'decreasing' | 'erratic' = 'stable';
    
    if (riskScores.length > 2) {
      const firstHalf = riskScores.slice(0, Math.floor(riskScores.length / 2));
      const secondHalf = riskScores.slice(Math.floor(riskScores.length / 2));
      const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
      const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
      
      if (secondAvg > firstAvg + 20) trend = 'increasing';
      else if (secondAvg < firstAvg - 20) trend = 'decreasing';
      else {
        const variance = this.calculateVariance(riskScores);
        if (variance > 400) trend = 'erratic';
      }
    }

    return {
      avgTimeBetweenPrompts: avgTime,
      semanticCoherence: 0.7, 
      complexityProgression: trend,
      dependencyTrend: 'stable'
    };
  }

  private calculateVariance(numbers: number[]): number {
    const mean = numbers.reduce((a, b) => a + b, 0) / numbers.length;
    return numbers.reduce((sum, n) => sum + Math.pow(n - mean, 2), 0) / numbers.length;
  }

  private calculateOverallRisk(patterns: any[], metrics: any): number {
    let risk = 0;
    
    patterns.forEach(p => {
      risk += p.riskContribution * (p.confidence / 100);
    });

    if (metrics.avgTimeBetweenPrompts < 5) risk += 20;
    if (metrics.complexityProgression === 'increasing') risk += 15;
    if (metrics.complexityProgression === 'erratic') risk += 10;

    return Math.min(risk, 100);
  }

  private generateRecommendations(patterns: any[], risk: number): string[] {
    const recommendations: string[] = [];
    
    if (risk > 70) {
      recommendations.push('Alto risco de tentativa de gaming detectado');
    }
    
    if (patterns.some(p => p.pattern === 'rapid_fire')) {
      recommendations.push('Reduza a velocidade e pense mais sobre cada pergunta');
    }
    
    if (patterns.some(p => p.pattern === 'iterative_refinement')) {
      recommendations.push('Tente reformular sua abordagem ao invés de refinar a mesma pergunta');
    }
    
    if (patterns.some(p => p.pattern === 'solution_building')) {
      recommendations.push('Foque em entender conceitos ao invés de obter a solução completa');
    }

    if (recommendations.length === 0 && risk < 30) {
      recommendations.push('Padrão de uso saudável - continue assim!');
    }

    return recommendations;
  }

  private createDefaultAnalysis(
    userId: string, 
    attemptId: string,
    start: Date,
    end: Date,
    promptCount: number
  ): TemporalAnalysisResult {
    return {
      userId,
      attemptId,
      windowAnalyzed: { start, end, promptCount },
      detectedPatterns: [],
      behaviorMetrics: {
        avgTimeBetweenPrompts: 0,
        semanticCoherence: 1,
        complexityProgression: 'stable',
        dependencyTrend: 'stable'
      },
      overallRisk: 0,
      isGamingAttempt: false,
      recommendations: ['Continue interagindo para análise temporal']
    };
  }

  async detectGamingPatterns(
    prompts: Array<{ content: string; timestamp: Date; riskScore: number }>
  ): Promise<{ isGaming: boolean; confidence: number; patterns: string[] }> {
    const patterns: string[] = [];
    let confidence = 0;

    const rapidFire = prompts.filter((p, i) => {
      if (i === 0) return false;
      const timeDiff = (p.timestamp.getTime() - prompts[i-1].timestamp.getTime()) / 1000;
      return timeDiff < this.RAPID_FIRE_THRESHOLD;
    });

    if (rapidFire.length > prompts.length * 0.5) {
      patterns.push('rapid_fire');
      confidence += 30;
    }

    const escalating = prompts.filter((p, i) => {
      if (i === 0) return false;
      return p.riskScore > prompts[i-1].riskScore;
    });

    if (escalating.length > prompts.length * 0.6) {
      patterns.push('escalating_attempts');
      confidence += 40;
    }

    const avgRisk = prompts.reduce((sum, p) => sum + p.riskScore, 0) / prompts.length;
    if (avgRisk > 60) {
      patterns.push('high_risk_average');
      confidence += 30;
    }

    return {
      isGaming: confidence >= this.GAMING_CONFIDENCE_THRESHOLD,
      confidence: Math.min(confidence, 100),
      patterns
    };
  }

  async calculateBehaviorRisk(
    userId: string,
    timeWindow: { start: Date; end: Date }
  ): Promise<number> {
    const logs = await this.prisma.validationLog.findMany({
      where: {
        userId,
        createdAt: {
          gte: timeWindow.start,
          lte: timeWindow.end
        }
      }
    });

    if (logs.length === 0) return 0;

    const blockedRatio = logs.filter(l => l.classification === 'BLOCKED').length / logs.length;
    const avgRiskScore = logs.reduce((sum, l) => sum + l.riskScore, 0) / logs.length;

    return Math.min(blockedRatio * 50 + avgRiskScore * 0.5, 100);
  }
}