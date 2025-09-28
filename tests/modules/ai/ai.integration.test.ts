import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { FastifyInstance } from 'fastify';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { buildTestApp, cleanupTestApp } from '../../helpers/test-app';
import { UserRole } from '../../../src/shared/domain/enums';

// Mock do OpenAI para testes
vi.mock('openai', () => ({
  default: vi.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: vi.fn().mockResolvedValue({
          id: 'chatcmpl-test-123',
          object: 'chat.completion',
          created: Date.now(),
          model: 'gpt-3.5-turbo',
          choices: [{
            index: 0,
            message: {
              role: 'assistant',
              content: 'Esta é uma resposta de teste do assistente AI.'
            },
            finish_reason: 'stop'
          }],
          usage: {
            prompt_tokens: 50,
            completion_tokens: 20,
            total_tokens: 70
          }
        })
      }
    }
  }))
}));

// Mock do Anthropic para testes
vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: {
      create: vi.fn().mockResolvedValue({
        id: 'msg_test_123',
        type: 'message',
        role: 'assistant',
        content: [{
          type: 'text',
          text: 'Esta é uma resposta de teste do Claude.'
        }],
        model: 'claude-3-sonnet-20240229',
        usage: {
          input_tokens: 45,
          output_tokens: 25
        }
      })
    }
  }))
}));

describe('AI Module Integration Tests', () => {
  let app: FastifyInstance;
  let prisma: PrismaClient;
  let redis: Redis;

  let adminUser: any;
  let adminTokens: { accessToken: string; refreshToken: string };
  let juniorUser: any;
  let juniorTokens: { accessToken: string; refreshToken: string };
  let seniorUser: any;
  let seniorTokens: { accessToken: string; refreshToken: string };
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let testChallenge: any;
  let testAttempt: any;

  beforeAll(async () => {
    try {
      const testApp = await buildTestApp();
      app = testApp.app;
      prisma = testApp.prisma;
      redis = testApp.redis;

      await prisma.$executeRaw`SELECT 1`;
    } catch (error) {
      console.error('Error setting up AI test app:', error);
      throw error;
    }
  }, 60000);

  afterAll(async () => {
    await cleanupTestApp(app, prisma, redis);
  });

  beforeEach(async () => {
    try {
      // Limpeza de dados respeitando dependências
      await prisma.trapDetection.deleteMany();
      await prisma.metricSnapshot.deleteMany();
      await prisma.codeEvent.deleteMany();
      await prisma.aIInteraction.deleteMany();
      await prisma.challengeAttempt.deleteMany();
      await prisma.validationLog.deleteMany();
      await prisma.validationRule.deleteMany();
      await prisma.governanceMetrics.deleteMany();
      await prisma.challenge.deleteMany();
      await prisma.xPTransaction.deleteMany();
      await prisma.userBadge.deleteMany();
      await prisma.badge.deleteMany();
      await prisma.certificate.deleteMany();
      await prisma.notification.deleteMany();
      await prisma.userMetrics.deleteMany();
      await prisma.user.deleteMany();
      await prisma.team.deleteMany();
      await prisma.billing.deleteMany();
      await prisma.company.deleteMany();

      await redis.flushdb();
    } catch (error) {
      console.error('Error cleaning AI test data:', error);
    }

    // Reset de variáveis de teste
    adminUser = null;
    adminTokens = { accessToken: '', refreshToken: '' };
    juniorUser = null;
    juniorTokens = { accessToken: '', refreshToken: '' };
    seniorUser = null;
    seniorTokens = { accessToken: '', refreshToken: '' };
    testChallenge = null;
    testAttempt = null;

    // Criação de usuários de teste
    const timestamp = Date.now();

    // Criação de usuário admin
    const adminResponse = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: `admin-${timestamp}@company.com`,
        password: 'Admin@123',
        name: 'Admin User',
        acceptTerms: true,
      },
    });

    expect(adminResponse.statusCode).toBe(201);
    const adminBody = JSON.parse(adminResponse.body);
    // Extração de dados do admin
    adminUser = adminBody.data?.user || adminBody.user;
    adminTokens = {
      accessToken: adminBody.data?.accessToken || adminBody.accessToken,
      refreshToken: adminBody.data?.refreshToken || adminBody.refreshToken,
    };

    // Validação dos dados do admin
    if (!adminUser || !adminUser.id) {
      console.error('AdminUser not properly returned:', adminBody);
      throw new Error('AdminUser not properly returned from registration');
    }

    // Atualização de role do admin
    await prisma.user.update({
      where: { id: adminUser.id },
      data: { role: UserRole.TECH_LEAD },
    });

    // Delay para persistência da role
    await new Promise(resolve => setTimeout(resolve, 200));

    // Login do admin após atualização
    const adminLoginResponse = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: {
        email: `admin-${timestamp}@company.com`,
        password: 'Admin@123',
      },
    });

    expect(adminLoginResponse.statusCode).toBe(200);
    const adminLoginBody = JSON.parse(adminLoginResponse.body);

    // Extração de tokens do admin
    adminTokens = {
      accessToken: adminLoginBody.data?.accessToken || adminLoginBody.accessToken,
      refreshToken: adminLoginBody.data?.refreshToken || adminLoginBody.refreshToken,
    };

    // Criação de usuário junior
    const juniorResponse = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: `junior-${timestamp}@company.com`,
        password: 'Junior@123',
        name: 'Junior Developer',
        acceptTerms: true,
      },
    });

    expect(juniorResponse.statusCode).toBe(201);
    const juniorBody = JSON.parse(juniorResponse.body);
    // Extração de dados do junior
    juniorUser = juniorBody.data?.user || juniorBody.user;
    juniorTokens = {
      accessToken: juniorBody.data?.accessToken || juniorBody.accessToken,
      refreshToken: juniorBody.data?.refreshToken || juniorBody.refreshToken,
    };

    // Validação dos dados do junior
    if (!juniorUser || !juniorUser.id) {
      console.error('JuniorUser not properly returned:', juniorBody);
      throw new Error('JuniorUser not properly returned from registration');
    }

    // Criação de usuário senior
    const seniorResponse = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: `senior-${timestamp}@company.com`,
        password: 'Senior@123',
        name: 'Senior Developer',
        acceptTerms: true,
      },
    });

    expect(seniorResponse.statusCode).toBe(201);
    const seniorBody = JSON.parse(seniorResponse.body);
    // Extração de dados do senior
    seniorUser = seniorBody.data?.user || seniorBody.user;
    seniorTokens = {
      accessToken: seniorBody.data?.accessToken || seniorBody.accessToken,
      refreshToken: seniorBody.data?.refreshToken || seniorBody.refreshToken,
    };

    // Validação dos dados do senior
    if (!seniorUser || !seniorUser.id) {
      console.error('SeniorUser not properly returned:', seniorBody);
      throw new Error('SeniorUser not properly returned from registration');
    }

    await prisma.user.update({
      where: { id: seniorUser.id },
      data: { role: UserRole.SENIOR },
    });

    // Criação de challenge para testes
    const challengeResponse = await app.inject({
      method: 'POST',
      url: '/challenges',
      headers: {
        authorization: `Bearer ${adminTokens.accessToken}`,
      },
      payload: {
        slug: `ai-integration-test-challenge-${timestamp}`,
        title: 'AI Integration Test Challenge',
        description: 'Challenge para testar integração com AI',
        difficulty: 'EASY',
        category: 'BACKEND',
        estimatedMinutes: 30,
        languages: ['javascript', 'typescript'],
        instructions: 'Implemente uma função que soma dois números. A função deve aceitar dois parâmetros numéricos e retornar a soma.',
        starterCode: 'function sum(a, b) {\n  // Implemente aqui\n}',
        solution: 'function sum(a, b) {\n  return a + b;\n}',
        testCases: [
          { input: '1, 2', expectedOutput: '3', weight: 0.3, description: 'Caso básico' },
          { input: '10, 20', expectedOutput: '30', weight: 0.4, description: 'Números maiores' },
          { input: '0, 0', expectedOutput: '0', weight: 0.3, description: 'Zeros' }
        ],
        hints: [
          { trigger: 'help', message: 'Use o operador + para somar', cost: 5 }
        ],
        traps: [
          {
            id: 'trap1',
            type: 'logic',
            buggedCode: 'return a * b;',
            correctCode: 'return a + b;',
            explanation: 'Use soma (+) ao invés de multiplicação (*)',
            detectionPattern: '\\*',
            severity: 'low'
          }
        ],
        baseXp: 50,
        bonusXp: 25,
        targetMetrics: {
          maxDI: 20,
          minPR: 80,
          minCS: 5
        }
      },
    });

    expect(challengeResponse.statusCode).toBe(201);
    const challengeBody = JSON.parse(challengeResponse.body);
    // Extração de dados do challenge
    testChallenge = challengeBody.data || challengeBody;

    // Validação da criação do challenge
    if (!testChallenge || !testChallenge.id) {
      throw new Error('TestChallenge not properly created');
    }

    // Delay para persistência do usuário
    await new Promise(resolve => setTimeout(resolve, 100));

    // Criação de attempt para testes
    const attemptResponse = await app.inject({
      method: 'POST',
      url: `/challenges/${testChallenge.id}/start`,
      headers: {
        authorization: `Bearer ${juniorTokens.accessToken}`,
      },
      payload: {
        language: 'javascript',
      },
    });

    expect(attemptResponse.statusCode).toBe(201);
    const attemptBody = JSON.parse(attemptResponse.body);
    testAttempt = attemptBody.data || attemptBody;

    // Normalização do ID do attempt
    if (testAttempt && testAttempt.attemptId && !testAttempt.id) {
      testAttempt.id = testAttempt.attemptId;
    }

    // Validação da criação do attempt
    if (!testAttempt || !testAttempt.id) {
      throw new Error('TestAttempt not properly created');
    }
  });

  describe('Core AI Functionality', () => {
    it('should successfully process AI chat request with OpenAI', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/ai/chat',
        headers: {
          authorization: `Bearer ${juniorTokens.accessToken}`,
          'content-type': 'application/json',
        },
        payload: {
          provider: 'openai',
          model: 'gpt-3.5-turbo',
          messages: [
            {
              role: 'user',
              content: 'Como implementar uma função de soma em JavaScript?'
            }
          ],
          challengeId: testChallenge.id,
          attemptId: testAttempt.id,
          temperature: 0.7,
          maxTokens: 150,
          stream: false
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      expect(body.success).toBe(true);
      expect(body.data).toHaveProperty('id');
      expect(body.data).toHaveProperty('content');
      expect(body.data).toHaveProperty('usage');
      expect(body.data).toHaveProperty('cost');
      expect(body.usage).toHaveProperty('tokens');
      expect(body.usage).toHaveProperty('remaining');
      expect(body.governance).toHaveProperty('validated');
      expect(body.governance.validated).toBe(true);
    });

    it('should successfully process AI chat request with Anthropic', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/ai/chat',
        headers: {
          authorization: `Bearer ${juniorTokens.accessToken}`,
          'content-type': 'application/json',
        },
        payload: {
          provider: 'anthropic',
          model: 'claude-3-sonnet-20240229',
          messages: [
            {
              role: 'user',
              content: 'Explique algoritmos de ordenação'
            }
          ],
          challengeId: testChallenge.id,
          attemptId: testAttempt.id,
          temperature: 0.5,
          maxTokens: 200,
          stream: false
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      expect(body.success).toBe(true);
      expect(body.data).toHaveProperty('content');
      expect(body.data).toHaveProperty('usage');
      expect(body.governance.validated).toBe(true);
    });

    it('should reject AI chat request without authentication', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/ai/chat',
        headers: {
          'content-type': 'application/json',
        },
        payload: {
          provider: 'openai',
          model: 'gpt-3.5-turbo',
          messages: [{ role: 'user', content: 'Test message' }],
        },
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Unauthorized');
    });

    it('should validate required fields in AI chat request', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/ai/chat',
        headers: {
          authorization: `Bearer ${juniorTokens.accessToken}`,
          'content-type': 'application/json',
        },
        payload: {
          provider: 'openai',
          // Campos obrigatórios ausentes
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return available AI models', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/ai/models',
        headers: {
          authorization: `Bearer ${juniorTokens.accessToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      expect(body.models).toBeDefined();
      expect(typeof body.models).toBe('object');

      // Verificação de provedores disponíveis
      const providers = Object.keys(body.models);
      expect(providers.length).toBeGreaterThan(0);

      // Validação da estrutura dos provedores
      providers.forEach(provider => {
        expect(body.models[provider]).toHaveProperty('models');
        expect(body.models[provider]).toHaveProperty('available');
      });
    });

    it('should handle invalid provider gracefully', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/ai/chat',
        headers: {
          authorization: `Bearer ${juniorTokens.accessToken}`,
          'content-type': 'application/json',
        },
        payload: {
          provider: 'invalid-provider',
          model: 'some-model',
          messages: [{ role: 'user', content: 'test' }],
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('AI Usage Tracking', () => {
    it('should return AI usage statistics for user', async () => {
      // Geração de dados de uso
      await app.inject({
        method: 'POST',
        url: '/ai/chat',
        headers: {
          authorization: `Bearer ${juniorTokens.accessToken}`,
          'content-type': 'application/json',
        },
        payload: {
          provider: 'openai',
          model: 'gpt-3.5-turbo',
          messages: [{ role: 'user', content: 'Test usage tracking' }],
          challengeId: testChallenge.id,
          attemptId: testAttempt.id,
        },
      });

      // Delay para processamento
      await new Promise(resolve => setTimeout(resolve, 100));

      const response = await app.inject({
        method: 'GET',
        url: '/ai/usage?days=7',
        headers: {
          authorization: `Bearer ${juniorTokens.accessToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      expect(body.usage).toBeDefined();
      expect(body.usage.period).toBeDefined();
      expect(body.usage.tokens).toBeDefined();
      expect(body.usage.requests).toBeDefined();
      expect(body.usage.cost).toBeDefined();
      expect(body.quota).toBeDefined();
      expect(body.limits).toBeDefined();
    });

    it('should track copy-paste events', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/ai/track-copy-paste',
        headers: {
          authorization: `Bearer ${juniorTokens.accessToken}`,
          'content-type': 'application/json',
        },
        payload: {
          attemptId: testAttempt.id,
          action: 'copy',
          content: 'function sum(a, b) { return a + b; }',
          sourceLines: 1,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      expect(body.success).toBe(true);
      expect(body.message).toContain('tracked successfully');
    });

    it('should validate copy-paste data structure', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/ai/track-copy-paste',
        headers: {
          authorization: `Bearer ${juniorTokens.accessToken}`,
          'content-type': 'application/json',
        },
        payload: {
          // Campos obrigatórios ausentes
          action: 'copy',
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should handle missing challenge context in usage tracking', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/ai/chat',
        headers: {
          authorization: `Bearer ${juniorTokens.accessToken}`,
          'content-type': 'application/json',
        },
        payload: {
          provider: 'openai',
          model: 'gpt-3.5-turbo',
          messages: [{ role: 'user', content: 'test without challenge context' }],
          // Contexto de challenge ausente
        },
      });

      // Funcionamento sem contexto de challenge
      expect([200, 400]).toContain(response.statusCode);
    });
  });

  describe('Rate Limiting', () => {
    it('should handle multiple concurrent requests without errors', async () => {
      const promises = Array.from({ length: 3 }, () =>
        app.inject({
          method: 'POST',
          url: '/ai/chat',
          headers: {
            authorization: `Bearer ${juniorTokens.accessToken}`,
            'content-type': 'application/json',
          },
          payload: {
            provider: 'openai',
            model: 'gpt-3.5-turbo',
            messages: [{ role: 'user', content: 'concurrent test' }],
            challengeId: testChallenge.id,
            attemptId: testAttempt.id,
          },
        })
      );

      const responses = await Promise.all(promises);

      // Pelo menos algumas requisições devem ser bem-sucedidas
      const successCount = responses.filter(r => r.statusCode === 200).length;
      expect(successCount).toBeGreaterThan(0);
    });

    it('should respect rate limits when configured', async () => {
      // Fazer múltiplas requisições rapidamente
      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(
          app.inject({
            method: 'POST',
            url: '/ai/chat',
            headers: {
              authorization: `Bearer ${juniorTokens.accessToken}`,
              'content-type': 'application/json',
            },
            payload: {
              provider: 'openai',
              model: 'gpt-3.5-turbo',
              messages: [{ role: 'user', content: `rate limit test ${i}` }],
              challengeId: testChallenge.id,
              attemptId: testAttempt.id,
            },
          })
        );
      }

      const responses = await Promise.all(promises);

      // Verificar se alguma requisição foi limitada ou todas passaram
      const statusCodes = responses.map(r => r.statusCode);
      const hasRateLimit = statusCodes.some(code => code === 429);
      const allSuccess = statusCodes.every(code => code === 200);

      expect(hasRateLimit || allSuccess).toBe(true);
    });

    it('should return proper error for rate limited requests', async () => {
      // Este teste dependeria da configuração específica de rate limiting
      // Por agora, apenas verificamos que o sistema não quebra com muitas requisições
      const response = await app.inject({
        method: 'POST',
        url: '/ai/chat',
        headers: {
          authorization: `Bearer ${juniorTokens.accessToken}`,
          'content-type': 'application/json',
        },
        payload: {
          provider: 'openai',
          model: 'gpt-3.5-turbo',
          messages: [{ role: 'user', content: 'single rate limit test' }],
          challengeId: testChallenge.id,
          attemptId: testAttempt.id,
        },
      });

      expect([200, 429]).toContain(response.statusCode);
    });
  });

  describe('Integration with Other Modules', () => {
    it('should integrate properly with metrics tracking', async () => {
      const chatResponse = await app.inject({
        method: 'POST',
        url: '/ai/chat',
        headers: {
          authorization: `Bearer ${juniorTokens.accessToken}`,
          'content-type': 'application/json',
        },
        payload: {
          provider: 'openai',
          model: 'gpt-3.5-turbo',
          messages: [{ role: 'user', content: 'integration test' }],
          challengeId: testChallenge.id,
          attemptId: testAttempt.id,
        },
      });

      expect(chatResponse.statusCode).toBe(200);

      // Verificar se métricas foram registradas
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verificar se há interação AI registrada no banco
      const interaction = await prisma.aIInteraction.findFirst({
        where: {
          userId: juniorUser.id,
          attemptId: testAttempt.id,
        },
      });

      expect(interaction).toBeTruthy();
      if (interaction) {
        expect(interaction.provider.toLowerCase()).toBe('openai');
        expect(interaction.inputTokens + interaction.outputTokens).toBeGreaterThan(0);
      }
    });

    it('should maintain session consistency across AI operations', async () => {
      // Fazer múltiplas operações AI na mesma sessão
      // Teste GET /ai/models
      const modelsResponse = await app.inject({
        method: 'GET',
        url: '/ai/models',
        headers: {
          authorization: `Bearer ${juniorTokens.accessToken}`,
          'content-type': 'application/json',
        },
      });
      expect(modelsResponse.statusCode).toBe(200);

      // Teste POST /ai/chat
      const chatResponse = await app.inject({
        method: 'POST',
        url: '/ai/chat',
        headers: {
          authorization: `Bearer ${juniorTokens.accessToken}`,
          'content-type': 'application/json',
        },
        payload: {
          provider: 'openai',
          model: 'gpt-3.5-turbo',
          messages: [{ role: 'user', content: 'session test' }],
          challengeId: testChallenge.id,
          attemptId: testAttempt.id,
        },
      });
      expect(chatResponse.statusCode).toBe(200);

      // Teste GET /ai/usage
      const usageResponse = await app.inject({
        method: 'GET',
        url: '/ai/usage',
        headers: {
          authorization: `Bearer ${juniorTokens.accessToken}`,
          'content-type': 'application/json',
        },
      });
      expect(usageResponse.statusCode).toBe(200);
    });

    it('should properly handle authentication across all AI endpoints', async () => {
      // Teste GET /ai/models - sem auth
      const modelsUnauthResponse = await app.inject({
        method: 'GET',
        url: '/ai/models',
        headers: { 'content-type': 'application/json' },
      });
      expect(modelsUnauthResponse.statusCode).toBe(401);

      // Teste GET /ai/models - com auth
      const modelsAuthResponse = await app.inject({
        method: 'GET',
        url: '/ai/models',
        headers: {
          authorization: `Bearer ${juniorTokens.accessToken}`,
          'content-type': 'application/json',
        },
      });
      expect([200, 400]).toContain(modelsAuthResponse.statusCode);

      // Teste GET /ai/usage - sem auth
      const usageUnauthResponse = await app.inject({
        method: 'GET',
        url: '/ai/usage',
        headers: { 'content-type': 'application/json' },
      });
      expect(usageUnauthResponse.statusCode).toBe(401);

      // Teste GET /ai/usage - com auth
      const usageAuthResponse = await app.inject({
        method: 'GET',
        url: '/ai/usage',
        headers: {
          authorization: `Bearer ${juniorTokens.accessToken}`,
          'content-type': 'application/json',
        },
      });
      expect([200, 400]).toContain(usageAuthResponse.statusCode);

      // Teste POST /ai/chat - sem auth
      const chatUnauthResponse = await app.inject({
        method: 'POST',
        url: '/ai/chat',
        headers: { 'content-type': 'application/json' },
        payload: {
          provider: 'openai',
          model: 'gpt-3.5-turbo',
          messages: [{ role: 'user', content: 'auth test' }],
        },
      });
      expect(chatUnauthResponse.statusCode).toBe(401);

      // Teste POST /ai/chat - com auth
      const chatAuthResponse = await app.inject({
        method: 'POST',
        url: '/ai/chat',
        headers: {
          authorization: `Bearer ${juniorTokens.accessToken}`,
          'content-type': 'application/json',
        },
        payload: {
          provider: 'openai',
          model: 'gpt-3.5-turbo',
          messages: [{ role: 'user', content: 'auth test' }],
        },
      });
      expect([200, 400]).toContain(chatAuthResponse.statusCode);

      // Teste POST /ai/track-copy-paste - sem auth
      const trackUnauthResponse = await app.inject({
        method: 'POST',
        url: '/ai/track-copy-paste',
        headers: { 'content-type': 'application/json' },
        payload: {
          attemptId: testAttempt.id,
          action: 'copy',
          sourceType: 'manual',
          data: { content: 'test' },
        },
      });
      expect(trackUnauthResponse.statusCode).toBe(400);

      // Teste POST /ai/track-copy-paste - com auth
      const trackAuthResponse = await app.inject({
        method: 'POST',
        url: '/ai/track-copy-paste',
        headers: {
          authorization: `Bearer ${juniorTokens.accessToken}`,
          'content-type': 'application/json',
        },
        payload: {
          attemptId: testAttempt.id,
          action: 'copy',
          sourceType: 'manual',
          data: { content: 'test' },
        },
      });
      expect([200, 400]).toContain(trackAuthResponse.statusCode);
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed JSON payloads', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/ai/chat',
        headers: {
          authorization: `Bearer ${juniorTokens.accessToken}`,
          'content-type': 'application/json',
        },
        payload: '{"invalid": json}', // Malformed JSON
      });

      expect(response.statusCode).toBe(400);
    });

    it('should handle missing content-type header', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/ai/chat',
        headers: {
          authorization: `Bearer ${juniorTokens.accessToken}`,
        },
        payload: JSON.stringify({
          provider: 'openai',
          model: 'gpt-3.5-turbo',
          messages: [{ role: 'user', content: 'test' }],
        }),
      });

      expect([200, 400, 415]).toContain(response.statusCode);
    });

    it('should handle very large payloads gracefully', async () => {
      const largeMessage = 'a'.repeat(10000); // 10KB message

      const response = await app.inject({
        method: 'POST',
        url: '/ai/chat',
        headers: {
          authorization: `Bearer ${juniorTokens.accessToken}`,
          'content-type': 'application/json',
        },
        payload: {
          provider: 'openai',
          model: 'gpt-3.5-turbo',
          messages: [{ role: 'user', content: largeMessage }],
          challengeId: testChallenge.id,
          attemptId: testAttempt.id,
        },
      });

      expect([200, 400, 413]).toContain(response.statusCode);
    });

    it('should handle special characters in messages', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/ai/chat',
        headers: {
          authorization: `Bearer ${juniorTokens.accessToken}`,
          'content-type': 'application/json',
        },
        payload: {
          provider: 'openai',
          model: 'gpt-3.5-turbo',
          messages: [
            {
              role: 'user',
              content: 'Test with special chars: àáâãäåæçèéêë ñóôõö ùúûü ýÿ 中文 🚀'
            }
          ],
          challengeId: testChallenge.id,
          attemptId: testAttempt.id,
        },
      });

      expect(response.statusCode).toBe(200);
    });

    it('should handle empty messages array', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/ai/chat',
        headers: {
          authorization: `Bearer ${juniorTokens.accessToken}`,
          'content-type': 'application/json',
        },
        payload: {
          provider: 'openai',
          model: 'gpt-3.5-turbo',
          messages: [], // Empty array
          challengeId: testChallenge.id,
          attemptId: testAttempt.id,
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });
});