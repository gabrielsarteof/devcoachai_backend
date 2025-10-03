// tests/modules/ai/challenge-context.service.test.ts

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock do logger para testes
vi.mock('@/shared/infrastructure/monitoring/logger', () => ({
  logger: {
    child: vi.fn().mockReturnThis(),
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));
import { ChallengeContextService } from '@/modules/ai/infrastructure/services/challenge-context.service';
import { IChallengeContextService } from '@/modules/ai/domain/services/challenge-context.service.interface';
import { ChallengeContext } from '@/modules/ai/domain/types/governance.types';

// Mocks das dependências
const mockPrisma = {
  challenge: {
    findUnique: vi.fn(),
  },
};

const mockRedis = {
  get: vi.fn(),
  setex: vi.fn(),
  del: vi.fn(),
  keys: vi.fn(),
};



// Mock da entidade Challenge
vi.mock('@/modules/challenges/domain/entities/challenge.entity', () => ({
  ChallengeEntity: {
    fromPrisma: vi.fn().mockReturnValue({
      toJSON: vi.fn().mockReturnValue({
        targetMetrics: {
          maxDI: 40,
          minPR: 70,
          minCS: 8,
        },
        traps: [
          {
            id: 'trap1',
            type: 'security',
            detectionPattern: 'password.*=.*["\']',
            severity: 'high',
          },
        ],
      }),
    }),
  },
}));

describe('ChallengeContextService', () => {
  let service: IChallengeContextService;
  let challengeContextService: ChallengeContextService;

  beforeEach(() => {
    vi.clearAllMocks();
    challengeContextService = new ChallengeContextService(
      mockPrisma as any,
      mockRedis as any
    );
    service = challengeContextService;
  });

  describe('getChallengeContext', () => {
    it('deve retornar contexto do cache quando disponível', async () => {
      const challengeId = 'test-challenge-id';
      const cachedContext: ChallengeContext = {
        challengeId,
        title: 'Desafio de API REST',
        category: 'BACKEND',
        keywords: ['api', 'rest', 'node', 'express'],
        allowedTopics: ['implementação', 'rotas', 'middleware'],
        forbiddenPatterns: ['DROP\\s+TABLE'],
        difficulty: 'MEDIUM',
        targetMetrics: {
          maxDI: 40,
          minPR: 70,
          minCS: 8,
        },
        learningObjectives: ['criar api rest', 'implementar rotas'],
        techStack: ['node', 'express'],
      };

      mockRedis.get.mockResolvedValue(JSON.stringify(cachedContext));

      const result = await service.getChallengeContext(challengeId);

      expect(result).toEqual(cachedContext);
      expect(mockRedis.get).toHaveBeenCalledWith(`challenge_context:${challengeId}`);
      expect(mockPrisma.challenge.findUnique).not.toHaveBeenCalled();
    });

    it('deve construir contexto do banco quando não há cache', async () => {
      const challengeId = 'test-challenge-id';
      const mockChallenge = {
        id: challengeId,
        title: 'Criar API de Autenticação',
        description: 'Desenvolva uma API segura com JWT',
        instructions: 'Implemente rotas de login e registro com validação',
        category: 'BACKEND',
        difficulty: 'MEDIUM',
        languages: ['node', 'javascript'],
      };

      mockRedis.get.mockResolvedValue(null);
      mockPrisma.challenge.findUnique.mockResolvedValue(mockChallenge);

      const result = await service.getChallengeContext(challengeId);

      expect(result).toMatchObject({
        challengeId,
        title: 'Criar API de Autenticação',
        category: 'BACKEND',
        difficulty: 'MEDIUM',
      });
      expect(result.keywords).toContain('api');
      expect(result.keywords).toContain('autenticação');
      expect(result.allowedTopics).toContain('implementação');
      expect(mockRedis.setex).toHaveBeenCalled();
    });

    it('deve extrair palavras-chave corretamente do texto em português', async () => {
      const challengeId = 'test-challenge-id';
      const mockChallenge = {
        id: challengeId,
        title: 'Sistema de Autenticação JWT',
        description: 'Criar um sistema seguro de autenticação usando JWT e bcrypt',
        instructions: 'Desenvolva endpoints para login, registro e validação de tokens',
        category: 'BACKEND',
        difficulty: 'MEDIUM',
        languages: ['node', 'typescript'],
      };

      mockRedis.get.mockResolvedValue(null);
      mockPrisma.challenge.findUnique.mockResolvedValue(mockChallenge);

      const result = await service.getChallengeContext(challengeId);

      expect(result.keywords).toContain('autenticação');
      expect(result.keywords).toContain('jwt');
      expect(result.keywords).toContain('sistema');
      expect(result.keywords).toContain('endpoints');
      expect(result.keywords).toContain('node');
      expect(result.keywords).toContain('typescript');
    });

    it('deve construir tópicos permitidos baseados na categoria', async () => {
      const challengeId = 'test-challenge-id';
      const mockChallenge = {
        id: challengeId,
        title: 'API GraphQL',
        description: 'Implementar API GraphQL com resolvers',
        instructions: 'Criar schema e resolvers para queries e mutations',
        category: 'BACKEND',
        difficulty: 'HARD',
        languages: ['node'],
      };

      mockRedis.get.mockResolvedValue(null);
      mockPrisma.challenge.findUnique.mockResolvedValue(mockChallenge);

      const result = await service.getChallengeContext(challengeId);

      // Tópicos base do sistema
      expect(result.allowedTopics).toContain('implementação');
      expect(result.allowedTopics).toContain('algoritmo');
      
      // Tópicos específicos de backend
      expect(result.allowedTopics).toContain('design de api');
      expect(result.allowedTopics).toContain('validação');
      
      // Tópicos por dificuldade
      expect(result.allowedTopics).toContain('avançado');
      expect(result.allowedTopics).toContain('complexo');
    });

    it('deve construir padrões proibidos baseados na categoria e armadilhas', async () => {
      const challengeId = 'test-challenge-id';
      const mockChallenge = {
        id: challengeId,
        title: 'Sistema de Login',
        description: 'Sistema seguro de autenticação',
        instructions: 'Implementar login com hash de senha',
        category: 'BACKEND',
        difficulty: 'MEDIUM',
        languages: ['node'],
      };

      mockRedis.get.mockResolvedValue(null);
      mockPrisma.challenge.findUnique.mockResolvedValue(mockChallenge);

      const result = await service.getChallengeContext(challengeId);

      // Padrões de segurança básicos
      expect(result.forbiddenPatterns).toContain('eval\\s*\\(');
      expect(result.forbiddenPatterns).toContain('__proto__');
      
      // Padrões específicos de backend
      expect(result.forbiddenPatterns).toContain('DROP\\s+TABLE');
      expect(result.forbiddenPatterns).toContain('password.*=.*["\']');
      
      // Padrões das armadilhas configuradas
      expect(result.forbiddenPatterns).toContain('password.*=.*["\']');
    });

    it('deve lançar ChallengeNotFoundError quando desafio não existe', async () => {
      const challengeId = 'inexistent-challenge';

      mockRedis.get.mockResolvedValue(null);
      mockPrisma.challenge.findUnique.mockResolvedValue(null);

      await expect(service.getChallengeContext(challengeId)).rejects.toMatchObject({
        name: 'ChallengeNotFoundError',
        code: 'AI_CHALLENGE_NOT_FOUND',
        statusCode: 404,
        message: `Challenge not found: ${challengeId}`,
      });
    });
  });

  describe('buildContextFromChallenge', () => {
    it('deve construir contexto corretamente para desafio frontend', () => {
      const mockChallenge = {
        id: 'frontend-challenge',
        title: 'Componente React Responsivo',
        description: 'Criar componente que adapta a diferentes telas',
        instructions: 'Use hooks e CSS Grid para responsividade',
        category: 'FRONTEND',
        difficulty: 'EASY',
        languages: ['react', 'javascript'],
      };

      const result = challengeContextService.buildContextFromChallenge(mockChallenge);

      expect(result.category).toBe('FRONTEND');
      expect(result.allowedTopics).toContain('componente');
      expect(result.allowedTopics).toContain('design responsivo');
      expect(result.allowedTopics).toContain('básico');
      expect(result.keywords).toContain('react');
      expect(result.keywords).toContain('responsivo');
    });

    it('deve extrair objetivos de aprendizagem do texto de instruções', () => {
      const mockChallenge = {
        id: 'learning-challenge',
        title: 'API de Usuários',
        description: 'Sistema CRUD completo',
        instructions: 'Aprenda como criar endpoints RESTful. Entenda a validação de dados. Implemente autenticação JWT.',
        category: 'BACKEND',
        difficulty: 'MEDIUM',
        languages: ['node'],
      };

      const result = challengeContextService.buildContextFromChallenge(mockChallenge);

      expect(result.learningObjectives).toContain('criar endpoints restful');
      expect(result.learningObjectives).toContain('a validação de dados');
    });
  });

  describe('refreshChallengeContext', () => {
    it('deve limpar cache e reconstruir contexto', async () => {
      const challengeId = 'test-challenge';
      const mockChallenge = {
        id: challengeId,
        title: 'Teste',
        description: 'Descrição teste',
        instructions: 'Instruções teste',
        category: 'BACKEND',
        difficulty: 'EASY',
        languages: ['node'],
      };

      mockRedis.del.mockResolvedValue(1);
      mockRedis.get.mockResolvedValue(null);
      mockPrisma.challenge.findUnique.mockResolvedValue(mockChallenge);

      await service.refreshChallengeContext(challengeId);

      expect(mockRedis.del).toHaveBeenCalledWith(`challenge_context:${challengeId}`);
      expect(mockPrisma.challenge.findUnique).toHaveBeenCalledWith({
        where: { id: challengeId },
      });
    });
  });

  describe('prewarmCache', () => {
    it('deve fazer prewarm de múltiplos desafios', async () => {
      const challengeIds = ['challenge1', 'challenge2'];
      const mockChallenge = {
        id: 'test',
        title: 'Teste',
        description: 'Descrição',
        instructions: 'Instruções',
        category: 'BACKEND',
        difficulty: 'EASY',
        languages: ['node'],
      };

      mockRedis.get.mockResolvedValue(null);
      mockPrisma.challenge.findUnique.mockResolvedValue(mockChallenge);

      await service.prewarmCache(challengeIds);

      expect(mockPrisma.challenge.findUnique).toHaveBeenCalledTimes(2);
      expect(mockRedis.setex).toHaveBeenCalledTimes(2);
    });

    it('deve continuar prewarm mesmo se alguns desafios falharem', async () => {
      const challengeIds = ['valid-challenge', 'invalid-challenge'];
      const mockChallenge = {
        id: 'valid',
        title: 'Válido',
        description: 'Descrição',
        instructions: 'Instruções',
        category: 'BACKEND',
        difficulty: 'EASY',
        languages: ['node'],
      };

      mockRedis.get.mockResolvedValue(null);
      mockPrisma.challenge.findUnique
        .mockResolvedValueOnce(mockChallenge)
        .mockResolvedValueOnce(null);

      await service.prewarmCache(challengeIds);

      expect(mockPrisma.challenge.findUnique).toHaveBeenCalledTimes(2);
      expect(mockRedis.setex).toHaveBeenCalledTimes(1);
    });
  });

  describe('getContextStats', () => {
    it('deve retornar estatísticas do cache', async () => {
      const mockKeys = [
        'challenge_context:challenge1',
        'challenge_context:challenge2',
      ];
      
      const mockContext1 = {
        challengeId: 'challenge1',
        category: 'BACKEND',
        keywords: ['api', 'node'],
        forbiddenPatterns: ['DROP'],
      };
      
      const mockContext2 = {
        challengeId: 'challenge2',
        category: 'FRONTEND',
        keywords: ['react', 'component'],
        forbiddenPatterns: ['innerHTML'],
      };

      mockRedis.keys.mockResolvedValue(mockKeys);
      mockRedis.get
        .mockResolvedValueOnce(JSON.stringify(mockContext1))
        .mockResolvedValueOnce(JSON.stringify(mockContext2));

      const result = await service.getContextStats();

      expect(result.cachedContexts).toBe(2);
      expect(result.avgKeywords).toBe(2);
      expect(result.avgForbiddenPatterns).toBe(1);
      expect(result.mostCommonCategories).toEqual([
        { category: 'BACKEND', count: 1 },
        { category: 'FRONTEND', count: 1 },
      ]);
    });
  });
});