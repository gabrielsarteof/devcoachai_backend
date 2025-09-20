import { PrismaClient } from '@prisma/client';
import { Redis } from 'ioredis';
import { logger } from '@/shared/infrastructure/monitoring/logger';
import {
  IChallengeContextService,
  ContextStats
} from '../../domain/services/prompt-validator.service.interface';
import { ChallengeContext } from '../../domain/types/governance.types';
import { ChallengeEntity } from '@/modules/challenges/domain/entities/challenge.entity';

export class ChallengeContextService implements IChallengeContextService {
  private readonly CACHE_TTL = 3600; 
  private readonly CACHE_PREFIX = 'challenge_context:';
  private cacheHits = 0;
  private cacheMisses = 0;
  private readonly serviceLogger = logger.child({ service: 'ChallengeContext' });

  constructor(
    private readonly prisma: PrismaClient,
    private readonly redis: Redis
  ) {}

  async getChallengeContext(challengeId: string): Promise<ChallengeContext> {
    const startTime = Date.now();
    const cacheKey = `${this.CACHE_PREFIX}${challengeId}`;

    try {
      const cached = await this.redis.get(cacheKey);
      
      if (cached) {
        this.cacheHits++;
        this.serviceLogger.debug({
          challengeId,
          source: 'cache',
          timeTaken: Date.now() - startTime,
        }, 'Challenge context retrieved from cache');
        
        return JSON.parse(cached);
      }

      this.cacheMisses++;

      const challenge = await this.prisma.challenge.findUnique({
        where: { id: challengeId },
      });

      if (!challenge) {
        throw new Error(`Challenge not found: ${challengeId}`);
      }

      const context = this.buildContextFromChallenge(challenge);

      await this.redis.setex(cacheKey, this.CACHE_TTL, JSON.stringify(context));

      this.serviceLogger.info({
        challengeId,
        source: 'database',
        timeTaken: Date.now() - startTime,
        keywordsCount: context.keywords.length,
        topicsCount: context.allowedTopics.length,
      }, 'Challenge context built and cached');

      return context;
    } catch (error) {
      this.serviceLogger.error({
        challengeId,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        timeTaken: Date.now() - startTime,
      }, 'Failed to get challenge context');
      
      throw error;
    }
  }

  buildContextFromChallenge(challenge: any): ChallengeContext {
    try {
      const entity = ChallengeEntity.fromPrisma(challenge);
      const challengeData = entity.toJSON();

      const keywords = this.extractKeywords(
        `${challenge.title} ${challenge.description} ${challenge.instructions}`
      );

      const allowedTopics = this.buildAllowedTopics(
        challenge.category,
        challenge.difficulty
      );

      const techStack = challenge.languages || [];
      keywords.push(...techStack.map((lang: string) => lang.toLowerCase()));

      const learningObjectives = this.extractLearningObjectives(challenge.instructions);

      const forbiddenPatterns = this.buildForbiddenPatterns(
        challenge.category,
        challengeData.traps
      );

      const context: ChallengeContext = {
        challengeId: challenge.id,
        title: challenge.title,
        category: challenge.category,
        keywords: Array.from(new Set(keywords)),
        allowedTopics,
        forbiddenPatterns,
        difficulty: challenge.difficulty,
        targetMetrics: challengeData.targetMetrics,
        learningObjectives,
        techStack,
      };

      this.serviceLogger.debug({
        challengeId: challenge.id,
        keywordsCount: context.keywords.length,
        topicsCount: context.allowedTopics.length,
        forbiddenPatternsCount: context.forbiddenPatterns.length,
        learningObjectivesCount: learningObjectives.length,
      }, 'Challenge context built successfully');

      return context;
    } catch (error) {
      this.serviceLogger.error({
        challengeId: challenge?.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      }, 'Failed to build challenge context');
      
      throw error;
    }
  }

  private extractKeywords(text: string): string[] {
    const technicalTerms = [
      // Conceitos gerais
      'api', 'rest', 'graphql', 'banco de dados', 'sql', 'nosql', 'mongodb', 'postgresql',
      'autenticação', 'autorização', 'jwt', 'oauth', 'segurança', 'criptografia',
      'frontend', 'backend', 'fullstack', 'react', 'vue', 'angular', 'node', 'express',
      'python', 'django', 'flask', 'java', 'spring', 'kotlin', 'go', 'rust',
      'docker', 'kubernetes', 'aws', 'azure', 'gcp', 'devops', 'ci/cd', 'testes',
      'algoritmo', 'estrutura de dados', 'performance', 'otimização', 'cache', 'redis',
      'microserviços', 'serverless', 'nuvem', 'deploy', 'escalabilidade', 'arquitetura',
      'padrão de projeto', 'solid', 'código limpo', 'refatoração', 'debug', 'log',
      'websocket', 'streaming', 'async', 'promise', 'callback', 'evento', 'fila',
      'validação', 'tratamento de erro', 'middleware', 'router', 'controller', 'service',
      'repository', 'entity', 'model', 'schema', 'migration', 'orm', 'query',
      
      // Conceitos em português específicos
      'função', 'classe', 'variável', 'método', 'objeto', 'array', 'lista',
      'loop', 'condição', 'iteração', 'recursão', 'herança', 'polimorfismo',
      'encapsulamento', 'abstração', 'interface', 'implementação', 'instância',
      'compilação', 'interpretação', 'execução', 'sintaxe', 'semântica',
      'biblioteca', 'framework', 'dependência', 'módulo', 'pacote', 'namespace',
    ];

    const lowerText = text.toLowerCase();
    const foundKeywords: string[] = [];

    // Extract technical terms found in the text
    for (const term of technicalTerms) {
      if (lowerText.includes(term)) {
        foundKeywords.push(term);
      }
    }

    const words = lowerText
      .replace(/[^a-záàâãéèêíìîóòôõúùûç0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 3);

    // Stop words em português
    const stopWords = new Set([
      'sobre', 'acima', 'depois', 'novamente', 'contra', 'sendo', 'abaixo',
      'entre', 'poderia', 'durante', 'cada', 'outro', 'deveria', 'existe',
      'estes', 'aqueles', 'através', 'embaixo', 'até', 'onde', 'qual',
      'enquanto', 'seria', 'você', 'dele', 'antes', 'depois', 'desde',
      'para', 'fazer', 'como', 'quando', 'então', 'porque', 'muito',
      'mais', 'menos', 'ainda', 'também', 'sempre', 'nunca', 'aqui',
      'pode', 'deve', 'será', 'está', 'foram', 'isso', 'aquilo',
    ]);

    for (const word of words) {
      if (!stopWords.has(word) && !foundKeywords.includes(word)) {
        foundKeywords.push(word);
      }
    }

    return foundKeywords.slice(0, 50); 
  }

  private buildAllowedTopics(category: string, difficulty: string): string[] {
    const baseTopics = [
      'implementação', 'algoritmo', 'lógica', 'estrutura', 'padrão',
      'boa prática', 'otimização', 'debug', 'testes', 'validação',
      'tratamento de erro', 'caso extremo', 'performance', 'complexidade', 'abordagem',
      'solução', 'método', 'técnica', 'estratégia', 'conceito',
    ];

    const categoryTopics: Record<string, string[]> = {
      BACKEND: [
        'design de api', 'schema de banco', 'autenticação', 'autorização',
        'middleware', 'roteamento', 'validação', 'orm', 'otimização de query',
        'cache', 'gerenciamento de sessão', 'segurança', 'criptografia', 'hash',
      ],
      FRONTEND: [
        'componente', 'gerenciamento de estado', 'renderização', 'manipulação de evento',
        'manipulação do dom', 'estilização', 'design responsivo', 'acessibilidade',
        'experiência do usuário', 'interação', 'animação', 'otimização de performance',
      ],
      FULLSTACK: [
        'integração', 'consumo de api', 'fluxo de dados', 'sincronização de estado',
        'arquitetura full stack', 'deploy', 'configuração de ambiente',
      ],
      DEVOPS: [
        'deploy', 'ci/cd', 'containerização', 'orquestração',
        'monitoramento', 'logs', 'escalabilidade', 'infraestrutura', 'automação',
      ],
      MOBILE: [
        'ui mobile', 'eventos de toque', 'navegação', 'suporte offline',
        'notificações push', 'apis do dispositivo', 'layout responsivo', 'performance',
      ],
      DATA: [
        'processamento de dados', 'etl', 'pipeline de dados', 'analytics', 'visualização',
        'machine learning', 'modelagem de dados', 'otimização de query', 'indexação',
      ],
    };

    const difficultyTopics: Record<string, string[]> = {
      EASY: ['básico', 'simples', 'fundamental', 'introdução', 'iniciante'],
      MEDIUM: ['intermediário', 'prático', 'padrão comum', 'padrão'],
      HARD: ['avançado', 'complexo', 'otimização', 'escalabilidade', 'eficiência'],
      EXPERT: ['expert', 'arquitetura', 'design de sistema', 'distribuído', 'concorrente'],
    };

    return [
      ...baseTopics,
      ...(categoryTopics[category] || []),
      ...(difficultyTopics[difficulty] || []),
    ];
  }

  private extractLearningObjectives(instructions: string): string[] {
    const objectives: string[] = [];
    
    // Padrões para objetivos de aprendizagem em português
    const patterns = [
      /aprenda?\s+(?:como\s+)?(?:a\s+)?([^.]+)/gi,
      /entenda?\s+([^.]+)/gi,
      /domine\s+([^.]+)/gi,
      /pratique\s+([^.]+)/gi,
      /implemente\s+([^.]+)/gi,
      /construa?\s+([^.]+)/gi,
      /crie\s+([^.]+)/gi,
      /desenvolva?\s+([^.]+)/gi,
    ];

    for (const pattern of patterns) {
      const matches = instructions.matchAll(pattern);
      for (const match of matches) {
        if (match[1]) {
          objectives.push(match[1].trim().toLowerCase());
        }
      }
    }

    if (objectives.length === 0) {
      const sentences = instructions
        .split(/[.!?]/)
        .filter(s => s.trim().length > 20)
        .slice(0, 3);
      
      objectives.push(...sentences.map(s => s.trim().toLowerCase()));
    }

    return objectives.slice(0, 5); 
  }

  private buildForbiddenPatterns(category: string, traps: any[]): string[] {
    const basePatterns = [
      'eval\\s*\\(', 
      'exec\\s*\\(',  
      '\\$\\{.*\\}', 
      '<script',     
      'document\\.cookie', 
      'localStorage\\.',   
      '__proto__',    
      'require\\s*\\(.*\\.\\.', 
    ];

    const categoryPatterns: Record<string, string[]> = {
      BACKEND: [
        'DROP\\s+TABLE', 
        'DELETE\\s+FROM\\s+users', 
        '; --',          
        'admin.*true',   
        'password.*=.*["\']', 
      ],
      FRONTEND: [
        'innerHTML\\s*=', 
        'document\\.write',
        'on\\w+\\s*=',    
      ],
      FULLSTACK: [
        'cors.*\\*',      
        'csrf.*disable',  
      ],
    };

    const trapPatterns: string[] = [];
    if (traps && Array.isArray(traps)) {
      for (const trap of traps) {
        if (trap.detectionPattern) {
          trapPatterns.push(trap.detectionPattern);
        }
      }
    }

    return [
      ...basePatterns,
      ...(categoryPatterns[category] || []),
      ...trapPatterns,
    ];
  }

  async refreshChallengeContext(challengeId: string): Promise<void> {
    const startTime = Date.now();
    const cacheKey = `${this.CACHE_PREFIX}${challengeId}`;

    try {
      await this.redis.del(cacheKey);

      await this.getChallengeContext(challengeId);

      this.serviceLogger.info({
        challengeId,
        timeTaken: Date.now() - startTime,
      }, 'Challenge context refreshed');
    } catch (error) {
      this.serviceLogger.error({
        challengeId,
        error: error instanceof Error ? error.message : 'Unknown error',
      }, 'Failed to refresh challenge context');
      
      throw error;
    }
  }

  async prewarmCache(challengeIds: string[]): Promise<void> {
    const startTime = Date.now();
    let success = 0;
    let failed = 0;

    this.serviceLogger.info({
      challengeIds: challengeIds.length,
    }, 'Starting cache prewarm');

    for (const challengeId of challengeIds) {
      try {
        await this.getChallengeContext(challengeId);
        success++;
      } catch (error) {
        failed++;
        this.serviceLogger.warn({
          challengeId,
          error: error instanceof Error ? error.message : 'Unknown error',
        }, 'Failed to prewarm cache for challenge');
      }
    }

    this.serviceLogger.info({
      total: challengeIds.length,
      success,
      failed,
      timeTaken: Date.now() - startTime,
    }, 'Cache prewarm completed');
  }

  async getContextStats(): Promise<ContextStats> {
    const pattern = `${this.CACHE_PREFIX}*`;
    const keys = await this.redis.keys(pattern);
    
    let totalKeywords = 0;
    let totalForbiddenPatterns = 0;
    const categories: Record<string, number> = {};

    for (const key of keys.slice(0, 100)) { 
      try {
        const cached = await this.redis.get(key);
        if (cached) {
          const context: ChallengeContext = JSON.parse(cached);
          totalKeywords += context.keywords.length;
          totalForbiddenPatterns += context.forbiddenPatterns.length;
          
          categories[context.category] = (categories[context.category] || 0) + 1;
        }
      } catch (error) {
      }
    }

    const sampleSize = Math.min(keys.length, 100);
    const cacheHitRate = this.cacheHits + this.cacheMisses > 0
      ? this.cacheHits / (this.cacheHits + this.cacheMisses)
      : 0;

    return {
      cachedContexts: keys.length,
      avgKeywords: sampleSize > 0 ? totalKeywords / sampleSize : 0,
      avgForbiddenPatterns: sampleSize > 0 ? totalForbiddenPatterns / sampleSize : 0,
      mostCommonCategories: Object.entries(categories)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([category, count]) => ({ category, count })),
      cacheHitRate: Math.round(cacheHitRate * 100) / 100,
    };
  }
}