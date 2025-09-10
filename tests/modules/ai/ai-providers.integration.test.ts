import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { FastifyInstance } from 'fastify';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { buildTestApp } from '../../helpers/test-app';

describe('AI Providers Integration Tests', () => {
  let app: FastifyInstance;
  let prisma: PrismaClient;
  let redis: Redis;
  let testUser: any;
  let tokens: { accessToken: string };

  beforeAll(async () => {
    ({ app, prisma, redis } = await buildTestApp());
    
    const registerResponse = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: 'ai.test@example.com',
        password: 'Test@123456',
        name: 'AI Test User',
        acceptTerms: true,
      },
    });
    
    const registerBody = JSON.parse(registerResponse.body);
    testUser = registerBody.user;
    tokens = {
      accessToken: registerBody.accessToken,
    };
  });

  afterAll(async () => {
    await prisma.aIInteraction.deleteMany({
      where: { userId: testUser.id },
    });
    await prisma.user.deleteMany({
      where: { email: 'ai.test@example.com' },
    });
    await redis.flushdb();
    await app.close();
    await prisma.$disconnect();
    redis.disconnect();
  });

  beforeEach(async () => {
    await prisma.aIInteraction.deleteMany({
      where: { userId: testUser.id },
    });
    await redis.flushdb();
  });

  describe('POST /ai/chat', () => {
    it('should process OpenAI chat request', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/ai/chat',
        headers: {
          authorization: `Bearer ${tokens.accessToken}`,
        },
        payload: {
          provider: 'openai',
          model: 'gpt-3.5-turbo',
          messages: [
            { role: 'system', content: 'You are a helpful assistant.' },
            { role: 'user', content: 'Write a hello world function in JavaScript.' },
          ],
          temperature: 0.7,
          maxTokens: 150,
        },
      });

      if (!process.env.OPENAI_API_KEY) {
        expect(response.statusCode).toBe(400);
        return;
      }

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      
      expect(body.success).toBe(true);
      expect(body.data).toHaveProperty('content');
      expect(body.data).toHaveProperty('usage');
      expect(body.data).toHaveProperty('cost');
      expect(body.usage).toHaveProperty('tokens');
      expect(body.usage).toHaveProperty('remaining');
    });

    it('should enforce rate limits', async () => {
      const promises = [];
      for (let i = 0; i < 25; i++) {
        promises.push(
          app.inject({
            method: 'POST',
            url: '/ai/chat',
            headers: {
              authorization: `Bearer ${tokens.accessToken}`,
            },
            payload: {
              provider: 'openai',
              model: 'gpt-3.5-turbo',
              messages: [
                { role: 'user', content: `Test message ${i}` },
              ],
            },
          })
        );
      }

      const responses = await Promise.all(promises);
      
      const rateLimited = responses.filter(r => r.statusCode === 429);
      expect(rateLimited.length).toBeGreaterThan(0);
      
      const limited = JSON.parse(rateLimited[0].body);
      expect(limited.error).toBe('Rate limit exceeded');
      expect(limited).toHaveProperty('resetAt');
    });

    it('should handle invalid provider', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/ai/chat',
        headers: {
          authorization: `Bearer ${tokens.accessToken}`,
        },
        payload: {
          provider: 'invalid-provider',
          model: 'some-model',
          messages: [
            { role: 'user', content: 'Test' },
          ],
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Invalid provider');
    });

    it('should handle invalid model', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/ai/chat',
        headers: {
          authorization: `Bearer ${tokens.accessToken}`,
        },
        payload: {
          provider: 'openai',
          model: 'invalid-model',
          messages: [
            { role: 'user', content: 'Test' },
          ],
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Invalid model');
    });
  });

  describe('POST /ai/track-copy-paste', () => {
    it('should track copy event', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/ai/track-copy-paste',
        headers: {
          authorization: `Bearer ${tokens.accessToken}`,
        },
        payload: {
          attemptId: 'test-attempt-id',
          action: 'copy',
          content: 'function hello() { console.log("Hello"); }',
          sourceLines: 1,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.message).toBe('copy event tracked');
    });

    it('should track paste event', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/ai/track-copy-paste',
        headers: {
          authorization: `Bearer ${tokens.accessToken}`,
        },
        payload: {
          attemptId: 'test-attempt-id',
          action: 'paste',
          content: 'function hello() { console.log("Hello"); }',
          targetLines: 1,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.message).toBe('paste event tracked');
    });
  });

  describe('GET /ai/usage', () => {
    beforeEach(async () => {
      await prisma.aIInteraction.create({
        data: {
          userId: testUser.id,
          provider: 'OPENAI',
          model: 'gpt-3.5-turbo',
          messages: [],
          responseLength: 100,
          codeLinesGenerated: 5,
          inputTokens: 50,
          outputTokens: 100,
          estimatedCost: 0.0001,
        },
      });
    });

    it('should return user usage stats', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/ai/usage?days=30',
        headers: {
          authorization: `Bearer ${tokens.accessToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      
      expect(body).toHaveProperty('usage');
      expect(body).toHaveProperty('quota');
      expect(body.usage).toHaveProperty('total');
      expect(body.usage).toHaveProperty('byProvider');
      expect(body.usage).toHaveProperty('daily');
      expect(body.usage.total.requests).toBeGreaterThan(0);
    });
  });

  describe('GET /ai/models', () => {
    it('should return available models', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/ai/models',
        headers: {
          authorization: `Bearer ${tokens.accessToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      
      expect(body).toHaveProperty('models');
      
      if (process.env.OPENAI_API_KEY) {
        expect(body.models).toHaveProperty('openai');
        expect(Array.isArray(body.models.openai)).toBe(true);
      }
    });
  });
});