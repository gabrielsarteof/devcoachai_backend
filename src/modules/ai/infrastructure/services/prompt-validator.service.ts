import { Redis } from 'ioredis';
import { logger } from '@/shared/infrastructure/monitoring/logger';
import {IPromptValidatorService,} from '../../domain/services/prompt-validator.service.interface';
import { ValidationMetrics } from '../../domain/types/validation.types';
import {
  PromptValidationResult,
  ChallengeContext,
  ValidationConfig,
  ValidationRule,
  ValidationStepResult,
  PromptAnalysis
} from '../../domain/types/governance.types';

export class PromptValidatorService implements IPromptValidatorService {
  private readonly defaultConfig: ValidationConfig = {
    strictMode: false,
    contextSimilarityThreshold: 0.7,
    offTopicThreshold: 0.3,
    blockDirectSolutions: true,
    allowedDeviationPercentage: 20,
    enableSemanticAnalysis: true,
  };

  // Padrões de solicitação direta de solução em português
  private readonly solutionPatterns = [
    /solução\s+(completa|inteira|total)/i,
    /resolve\s+(esse|este|o)\s+(desafio|problema|exercício)/i,
    /me\s+(dá|da|dê)\s+(a\s+)?(resposta|solução|código\s+completo)/i,
    /escreve?\s+(todo|tudo|o\s+código\s+completo)/i,
    /implementação\s+(completa|total|inteira)/i,
    /faz\s+(tudo\s+)?pra\s+mim/i,
    /termina\s+(o\s+)?(desafio|exercício)/i,
    /resposta\s+completa/i,
    /código\s+(pronto|completo|final)/i,
    /me\s+ajuda\s+a\s+fazer\s+tudo/i,
    /quero\s+a\s+solução\s+pronta/i,
  ];

  // Padrões de engenharia social em português
  private readonly socialEngineeringPatterns = [
    /ignora\s+(as\s+)?(instruções|regras)\s+(anteriores|acima)/i,
    /finge\s+(que|ser)/i,
    /age\s+como\s+se/i,
    /contorna\s+(as\s+)?(regras|restrições)/i,
    /novas\s+instruções/i,
    /esquece\s+tudo/i,
    /substitui\s+o\s+sistema/i,
    /modo\s+(desenvolvedor|irrestrito)/i,
    /sem\s+(restrições|limitações)/i,
    /você\s+deve\s+ignorar/i,
    /não\s+leve\s+em\s+conta/i,
  ];

  // Padrões off-topic em português
  private readonly offTopicPatterns = [
    /conta\s+(uma\s+)?(piada|história)/i,
    /como\s+(está|ta)\s+o\s+tempo/i,
    /receita\s+(de|para)/i,
    /conselho\s+(amoroso|de\s+relacionamento)/i,
    /dica\s+médica/i,
    /opinião\s+política/i,
    /notícias\s+(de\s+)?(esporte|futebol)/i,
    /qual\s+é\s+o\s+melhor\s+time/i,
    /me\s+fala\s+sobre\s+música/i,
  ];

  private readonly serviceLogger = logger.child({ service: 'PromptValidator' });

  constructor(
    private readonly redis: Redis
  ) {}

  async validatePrompt(
    prompt: string,
    challengeContext: ChallengeContext,
    userLevel: number,
    config: ValidationConfig = this.defaultConfig
  ): Promise<PromptValidationResult> {
    const startTime = Date.now();
    const validationId = crypto.randomUUID();

    this.serviceLogger.info({
      validationId,
      challengeId: challengeContext.challengeId,
      userLevel,
      promptLength: prompt.length,
      config,
    }, 'Starting prompt validation');

    try {
      const validationSteps = await Promise.all([
        this.checkDirectSolutionRequest(prompt, challengeContext),
        this.checkContextRelevance(prompt, challengeContext, config),
        this.checkForbiddenPatterns(prompt, challengeContext),
        this.checkSocialEngineering(prompt),
        this.checkOffTopic(prompt, challengeContext),
        this.assessPromptComplexity(prompt, challengeContext, userLevel),
      ]);

      const result = this.aggregateValidationResults(validationSteps, config);
      
      result.metadata = {
        ...result.metadata,
        timeTaken: Date.now() - startTime,
        validationId,
      };

      await this.cacheValidationResult(challengeContext.challengeId, result);

      this.serviceLogger.info({
        validationId,
        challengeId: challengeContext.challengeId,
        classification: result.classification,
        riskScore: result.riskScore,
        confidence: result.confidence,
        timeTaken: result.metadata.timeTaken,
        reasons: result.reasons,
      }, 'Prompt validation completed');

      if (result.classification === 'BLOCKED') {
        this.serviceLogger.warn({
          validationId,
          challengeId: challengeContext.challengeId,
          userLevel,
          blockedReasons: result.reasons,
          detectedPatterns: result.metadata.detectedPatterns,
        }, 'Prompt blocked due to policy violations');
      }

      return result;
    } catch (error) {
      this.serviceLogger.error({
        validationId,
        challengeId: challengeContext.challengeId,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      }, 'Prompt validation failed');

      return {
        isValid: true,
        riskScore: 50,
        classification: 'WARNING',
        reasons: ['Validation error - proceeding with caution'],
        suggestedAction: 'THROTTLE',
        confidence: 30,
        metadata: {
          error: true,
          timeTaken: Date.now() - startTime,
        },
      };
    }
  }

  private async checkDirectSolutionRequest(
    prompt: string,
    _challengeContext: ChallengeContext
  ): Promise<ValidationStepResult> {
    const stepStart = Date.now();
    const detected = this.solutionPatterns.some(pattern => pattern.test(prompt));
    const detectedPatterns: string[] = [];

    if (detected) {
      for (const pattern of this.solutionPatterns) {
        if (pattern.test(prompt)) {
          detectedPatterns.push(pattern.source);
        }
      }
    }

    return {
      stepName: 'direct_solution_check',
      passed: !detected,
      riskContribution: detected ? 80 : 0,
      reason: detected ? 'Solicitação direta de solução detectada' : null,
      metadata: {
        detected,
        patterns: detectedPatterns,
        executionTime: Date.now() - stepStart,
      },
    };
  }

  private async checkContextRelevance(
    prompt: string,
    challengeContext: ChallengeContext,
    config: ValidationConfig
  ): Promise<ValidationStepResult> {
    const stepStart = Date.now();
    
    const promptWords = this.extractKeywords(prompt.toLowerCase());
    const contextWords = new Set([
      ...challengeContext.keywords.map(k => k.toLowerCase()),
      ...challengeContext.allowedTopics.map(t => t.toLowerCase()),
      ...(challengeContext.techStack || []).map(t => t.toLowerCase()),
    ]);

    let matchCount = 0;
    const matchedKeywords: string[] = [];
    
    for (const word of promptWords) {
      for (const contextWord of contextWords) {
        if (this.calculateWordSimilarity(word, contextWord) > 0.8) {
          matchCount++;
          matchedKeywords.push(word);
          break;
        }
      }
    }

    const relevanceScore = contextWords.size > 0 
      ? matchCount / Math.min(promptWords.size, contextWords.size)
      : 0;
    
    const isRelevant = relevanceScore >= config.offTopicThreshold;

    return {
      stepName: 'context_relevance_check',
      passed: isRelevant,
      riskContribution: isRelevant ? 0 : 40,
      reason: isRelevant ? null : `Baixa relevância com o contexto: ${(relevanceScore * 100).toFixed(1)}%`,
      metadata: {
        relevanceScore,
        matchCount,
        matchedKeywords,
        contextKeywords: contextWords.size,
        promptKeywords: promptWords.size,
        executionTime: Date.now() - stepStart,
      },
    };
  }

  private async checkForbiddenPatterns(
    prompt: string,
    challengeContext: ChallengeContext
  ): Promise<ValidationStepResult> {
    const stepStart = Date.now();
    const violations: string[] = [];
    
    for (const pattern of challengeContext.forbiddenPatterns) {
      try {
        const regex = new RegExp(pattern, 'i');
        if (regex.test(prompt)) {
          violations.push(pattern);
        }
      } catch (error) {
        this.serviceLogger.warn({
          pattern,
          error: error instanceof Error ? error.message : 'Invalid regex',
        }, 'Invalid forbidden pattern regex');
      }
    }

    const riskContribution = Math.min(violations.length * 25, 100);

    return {
      stepName: 'forbidden_patterns_check',
      passed: violations.length === 0,
      riskContribution,
      reason: violations.length > 0 
        ? `Padrões proibidos detectados: ${violations.slice(0, 3).join(', ')}` 
        : null,
      metadata: {
        violationsCount: violations.length,
        violations: violations.slice(0, 5),
        executionTime: Date.now() - stepStart,
      },
    };
  }

  private async checkSocialEngineering(prompt: string): Promise<ValidationStepResult> {
    const stepStart = Date.now();
    const detected = this.socialEngineeringPatterns.some(pattern => pattern.test(prompt));
    const detectedPatterns: string[] = [];

    if (detected) {
      for (const pattern of this.socialEngineeringPatterns) {
        if (pattern.test(prompt)) {
          detectedPatterns.push(pattern.source);
        }
      }
    }

    const socialEngineeringScore = detected ? 90 : 0;

    return {
      stepName: 'social_engineering_check',
      passed: !detected,
      riskContribution: socialEngineeringScore,
      reason: detected ? 'Tentativa de engenharia social detectada' : null,
      metadata: {
        detected,
        patterns: detectedPatterns,
        score: socialEngineeringScore,
        executionTime: Date.now() - stepStart,
      },
    };
  }

  private async checkOffTopic(
    prompt: string,
    _challengeContext: ChallengeContext
  ): Promise<ValidationStepResult> {
    const stepStart = Date.now();
    const detected = this.offTopicPatterns.some(pattern => pattern.test(prompt));

    return {
      stepName: 'off_topic_check',
      passed: !detected,
      riskContribution: detected ? 50 : 0,
      reason: detected ? 'Conteúdo fora do tópico detectado' : null,
      metadata: {
        detected,
        executionTime: Date.now() - stepStart,
      },
    };
  }

  private async assessPromptComplexity(
    prompt: string,
    challengeContext: ChallengeContext,
    userLevel: number
  ): Promise<ValidationStepResult> {
    const stepStart = Date.now();
    
    const wordCount = prompt.split(/\s+/).length;
    const sentenceCount = prompt.split(/[.!?]+/).filter(s => s.trim()).length;
    const avgWordsPerSentence = sentenceCount > 0 ? wordCount / sentenceCount : wordCount;
    
    const expectedComplexity = this.getExpectedComplexity(userLevel, challengeContext.difficulty);
    const actualComplexity = this.calculateComplexity(wordCount, avgWordsPerSentence);
    
    const complexityMismatch = Math.abs(expectedComplexity - actualComplexity) > 2;

    return {
      stepName: 'complexity_assessment',
      passed: !complexityMismatch,
      riskContribution: complexityMismatch ? 20 : 0,
      reason: complexityMismatch ? 'Incompatibilidade de complexidade do prompt' : null,
      metadata: {
        wordCount,
        sentenceCount,
        avgWordsPerSentence,
        expectedComplexity,
        actualComplexity,
        executionTime: Date.now() - stepStart,
      },
    };
  }

  private aggregateValidationResults(
    results: ValidationStepResult[],
    config: ValidationConfig
  ): PromptValidationResult {
    const totalRiskScore = results.reduce((sum, result) => sum + result.riskContribution, 0);
    const clampedRiskScore = Math.min(totalRiskScore, 100);
    
    let classification: 'SAFE' | 'WARNING' | 'BLOCKED';
    let suggestedAction: 'ALLOW' | 'THROTTLE' | 'BLOCK' | 'REVIEW';
    
    if (clampedRiskScore >= 80) {
      classification = 'BLOCKED';
      suggestedAction = 'BLOCK';
    } else if (clampedRiskScore >= 50) {
      classification = 'WARNING';
      suggestedAction = config.strictMode ? 'REVIEW' : 'THROTTLE';
    } else {
      classification = 'SAFE';
      suggestedAction = 'ALLOW';
    }

    const reasons = results
      .filter(r => !r.passed && r.reason)
      .map(r => r.reason!);

    const confidence = this.calculateConfidence(results);

    const detectedPatterns: string[] = [];
    for (const result of results) {
      if (result.metadata?.patterns) {
        detectedPatterns.push(...result.metadata.patterns);
      }
    }

    return {
      isValid: classification === 'SAFE',
      riskScore: clampedRiskScore,
      classification,
      reasons,
      suggestedAction,
      confidence,
      metadata: {
        detectedPatterns,
        stepResults: results.map(r => ({
          step: r.stepName,
          passed: r.passed,
          risk: r.riskContribution,
        })),
      },
    };
  }

  private calculateConfidence(results: ValidationStepResult[]): number {
    let confidence = 85;
    
    const checksPerformed = results.length;
    if (checksPerformed < 4) confidence -= 20;
    else if (checksPerformed < 6) confidence -= 10;
    
    const failedChecks = results.filter(r => !r.passed).length;
    const consistencyRatio = failedChecks / checksPerformed;
    
    if (consistencyRatio > 0.7) confidence += 10; 
    else if (consistencyRatio < 0.3 && failedChecks > 0) confidence -= 15; 
    
    return Math.max(0, Math.min(100, confidence));
  }

  private extractKeywords(text: string): Set<string> {
    // Stop words em português
    const stopWords = new Set([
      'o', 'a', 'os', 'as', 'um', 'uma', 'uns', 'umas', 'de', 'do', 'da', 'dos', 'das',
      'para', 'por', 'com', 'sem', 'sob', 'sobre', 'em', 'no', 'na', 'nos', 'nas',
      'que', 'quem', 'qual', 'quais', 'quando', 'onde', 'como', 'por que', 'porque',
      'se', 'mas', 'ou', 'e', 'nem', 'também', 'já', 'ainda', 'só', 'só', 'então',
      'ser', 'estar', 'ter', 'haver', 'fazer', 'dizer', 'ir', 'vir', 'ver', 'dar',
      'saber', 'poder', 'querer', 'dever', 'ficar', 'passar', 'levar', 'trazer',
      'eu', 'tu', 'ele', 'ela', 'nós', 'vós', 'eles', 'elas', 'me', 'te', 'se',
      'nos', 'vos', 'lhe', 'lhes', 'meu', 'minha', 'meus', 'minhas', 'seu', 'sua',
      'seus', 'suas', 'nosso', 'nossa', 'nossos', 'nossas', 'este', 'esta', 'estes',
      'estas', 'esse', 'essa', 'esses', 'essas', 'aquele', 'aquela', 'aqueles', 'aquelas',
    ]);

    const words = text
      .toLowerCase()
      .replace(/[^a-záàâãéèêíìîóòôõúùûç0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2 && !stopWords.has(word));

    return new Set(words);
  }

  private calculateWordSimilarity(word1: string, word2: string): number {
    if (word1 === word2) return 1.0;
    
    const longer = word1.length > word2.length ? word1 : word2;
    const shorter = word1.length > word2.length ? word2 : word1;
    
    if (longer.length === 0) return 1.0;
    
    const distance = this.levenshteinDistance(longer, shorter);
    return (longer.length - distance) / longer.length;
  }

  private levenshteinDistance(str1: string, str2: string): number {
    const matrix: number[][] = [];
    
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }
    
    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }
    
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    
    return matrix[str2.length][str1.length];
  }

  private getExpectedComplexity(userLevel: number, difficulty: string): number {
    const complexityMap: Record<string, Record<string, number>> = {
      'EASY': { base: 2, levelMultiplier: 0.5 },
      'MEDIUM': { base: 4, levelMultiplier: 0.7 },
      'HARD': { base: 6, levelMultiplier: 0.9 },
      'EXPERT': { base: 8, levelMultiplier: 1.0 },
    };

    const config = complexityMap[difficulty] || complexityMap['MEDIUM'];
    return config.base + (userLevel * config.levelMultiplier);
  }

  private calculateComplexity(wordCount: number, avgWordsPerSentence: number): number {
    let score = 0;
    
    if (wordCount < 10) score = 1;
    else if (wordCount < 30) score = 2;
    else if (wordCount < 50) score = 3;
    else if (wordCount < 100) score = 5;
    else if (wordCount < 200) score = 7;
    else score = 9;
    
    if (avgWordsPerSentence > 20) score += 1;
    if (avgWordsPerSentence > 30) score += 1;
    
    return Math.min(10, score);
  }

  private async cacheValidationResult(
    challengeId: string,
    result: PromptValidationResult
  ): Promise<void> {
    try {
      const key = `validation:${challengeId}:${Date.now()}`;
      await this.redis.setex(
        key,
        86400, 
        JSON.stringify({
          ...result,
          timestamp: new Date().toISOString(),
        })
      );

      await this.updateValidationMetrics(challengeId, result);
    } catch (error) {
      this.serviceLogger.error({
        challengeId,
        error: error instanceof Error ? error.message : 'Unknown error',
      }, 'Failed to cache validation result');
    }
  }

  private async updateValidationMetrics(
    challengeId: string,
    result: PromptValidationResult
  ): Promise<void> {
    const metricsKey = `metrics:validation:${challengeId}`;
    const pipeline = this.redis.pipeline();

    pipeline.hincrby(metricsKey, 'total', 1);
    pipeline.hincrby(metricsKey, result.classification.toLowerCase(), 1);
    pipeline.hincrbyfloat(metricsKey, 'totalRiskScore', result.riskScore);
    pipeline.hincrbyfloat(metricsKey, 'totalConfidence', result.confidence);
    
    if (result.metadata?.timeTaken) {
      pipeline.hincrbyfloat(metricsKey, 'totalProcessingTime', result.metadata.timeTaken);
    }

    pipeline.expire(metricsKey, 86400 * 7); 

    await pipeline.exec();
  }

  async updateValidationRules(
    challengeId: string,
    customRules: ValidationRule[]
  ): Promise<void> {
    const key = `rules:${challengeId}`;
    await this.redis.setex(
      key,
      86400 * 7, 
      JSON.stringify(customRules)
    );

    this.serviceLogger.info({
      challengeId,
      rulesCount: customRules.length,
    }, 'Validation rules updated');
  }

  async analyzePrompt(prompt: string): Promise<PromptAnalysis> {
    const words = prompt.split(/\s+/).length;
    const hasCode = /\`\`\`|function|class|const|let|var|if|for|while/.test(prompt);
    
    let intent: PromptAnalysis['intent'] = 'unclear';
    if (this.solutionPatterns.some(p => p.test(prompt))) {
      intent = 'solution_seeking';
    } else if (this.socialEngineeringPatterns.some(p => p.test(prompt))) {
      intent = 'gaming';
    } else if (this.offTopicPatterns.some(p => p.test(prompt))) {
      intent = 'off_topic';
    } else if (hasCode || /ajuda|explica|entender|aprender|como/i.test(prompt)) {
      intent = 'educational';
    }

    let socialEngineeringScore = 0;
    for (const pattern of this.socialEngineeringPatterns) {
      if (pattern.test(prompt)) {
        socialEngineeringScore += 20;
      }
    }
    socialEngineeringScore = Math.min(100, socialEngineeringScore);

    return {
      intent,
      topics: Array.from(this.extractKeywords(prompt)).slice(0, 10),
      complexity: words < 20 ? 'simple' : words < 50 ? 'moderate' : 'complex',
      estimatedTokens: Math.ceil(prompt.length / 4),
      language: 'pt', // português
      hasCodeRequest: hasCode,
      socialEngineeringScore,
    };
  }

  async getValidationMetrics(
    challengeId?: string,
    _timeRange?: { start: Date; end: Date }
  ): Promise<ValidationMetrics> {
    const metricsKey = challengeId 
      ? `metrics:validation:${challengeId}`
      : 'metrics:validation:global';

    const metrics = await this.redis.hgetall(metricsKey);
    
    const total = parseInt(metrics.total || '0');
    const blocked = parseInt(metrics.blocked || '0');
    const warning = parseInt(metrics.warning || '0');
    const safe = parseInt(metrics.safe || '0');

    return {
      totalValidations: total,
      blockedCount: blocked,
      throttledCount: warning,
      allowedCount: safe,
      avgRiskScore: total > 0 ? parseFloat(metrics.totalRiskScore || '0') / total : 0,
      avgConfidence: total > 0 ? parseFloat(metrics.totalConfidence || '0') / total : 0,
      avgProcessingTime: total > 0 ? parseFloat(metrics.totalProcessingTime || '0') / total : 0,
      topBlockedPatterns: [], 
      riskDistribution: {
        low: safe,
        medium: warning,
        high: blocked,
      },
    };
  }

  async clearCache(challengeId?: string): Promise<void> {
    const pattern = challengeId 
      ? `validation:${challengeId}:*`
      : 'validation:*';
    
    const keys = await this.redis.keys(pattern);
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }

    this.serviceLogger.info({
      challengeId,
      keysCleared: keys.length,
    }, 'Validation cache cleared');
  }
}