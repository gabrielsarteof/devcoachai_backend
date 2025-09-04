import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { FastifyInstance } from 'fastify';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { buildTestApp } from '../../helpers/test-app';

describe('Metrics Integration Tests', () => {
  let app: FastifyInstance;
  let prisma: PrismaClient;
  let redis: Redis;
  let testUser: any;
  let testChallenge: any;
  let testAttempt: any;
  let tokens: { accessToken: string; refreshToken: string };

  beforeAll(async () => {
    ({ app, prisma, redis } = await buildTestApp());
    
    const registerResponse = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: 'metrics.test@example.com',
        password: 'Test@123456',
        name: 'Metrics Test User',
        acceptTerms: true,
      },
    });
    
    const registerBody = JSON.parse(registerResponse.body);
    testUser = registerBody.user;
    tokens = {
      accessToken: registerBody.accessToken,
      refreshToken: registerBody.refreshToken,
    };

    testChallenge = await prisma.challenge.create({
      data: {
        slug: 'test-metrics-challenge',
        title: 'Test Metrics Challenge',
        description: 'Challenge for testing metrics',
        difficulty: 'EASY',
        category: 'BACKEND',
        estimatedMinutes: 30,
        languages: ['javascript'],
        instructions: 'Test instructions',
        solution: 'Test solution',
        testCases: JSON.stringify([
          { id: 'test-1', input: 'input', expectedOutput: 'output', weight: 1 }
        ]),
        hints: JSON.stringify([]),
        traps: JSON.stringify([
          {
            id: 'trap-1',
            type: 'security',
            buggedCode: 'bug',
            correctCode: 'fix',
            explanation: 'explanation',
            detectionPattern: 'pattern',
            severity: 'high',
          }
        ]),
        targetMetrics: JSON.stringify({ maxDI: 40, minPR: 70, minCS: 8 }),
      },
    });

    testAttempt = await prisma.challengeAttempt.create({
      data: {
        userId: testUser.id,
        challengeId: testChallenge.id,
        sessionId: 'test-session',
        language: 'javascript',
        codeSnapshots: [],
        testResults: [],
      },
    });
  });

  afterAll(async () => {
    await prisma.metricSnapshot.deleteMany();
    await prisma.challengeAttempt.deleteMany();
    await prisma.challenge.deleteMany();
    await prisma.user.deleteMany({
      where: { email: { contains: 'metrics.test' } },
    });
    await app.close();
    await prisma.$disconnect();
    redis.disconnect();
  });

  beforeEach(async () => {
    await prisma.metricSnapshot.deleteMany({
      where: { attemptId: testAttempt.id },
    });
    await redis.flushdb();
  });

  describe('POST /metrics/track', () => {
    it('should track metrics successfully', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/metrics/track',
        headers: {
          authorization: `Bearer ${tokens.accessToken}`,
        },
        payload: {
          attemptId: testAttempt.id,
          totalLines: 100,
          linesFromAI: 30,
          linesTyped: 70,
          copyPasteEvents: 2,
          deleteEvents: 5,
          testRuns: 3,
          testsPassed: 2,
          testsTotal: 3,
          checklistItems: [
            { id: 'c1', label: 'Validation', checked: true, weight: 1, category: 'validation' },
            { id: 'c2', label: 'Security', checked: false, weight: 2, category: 'security' },
          ],
          sessionTime: 300,
          aiUsageTime: 50,
          manualCodingTime: 250,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      
      expect(body.success).toBe(true);
      expect(body.data).toHaveProperty('metricSnapshot');
      expect(body.data).toHaveProperty('calculation');
      expect(body.data.calculation.dependencyIndex).toBe(30);
      expect(body.data.calculation.passRate).toBeCloseTo(66.67, 1);
      expect(body.data).toHaveProperty('riskAssessment');
      expect(body.data).toHaveProperty('insights');
    });

    it('should fail with invalid attempt', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/metrics/track',
        headers: {
          authorization: `Bearer ${tokens.accessToken}`,
        },
        payload: {
          attemptId: 'invalid-attempt-id',
          totalLines: 100,
          linesFromAI: 30,
          linesTyped: 70,
          copyPasteEvents: 2,
          deleteEvents: 5,
          testRuns: 3,
          testsPassed: 2,
          testsTotal: 3,
          checklistItems: [],
          sessionTime: 300,
        },
      });

      expect(response.statusCode).toBe(403);
    });
  });

  describe('GET /metrics/session/:attemptId', () => {
    beforeEach(async () => {
      await prisma.metricSnapshot.createMany({
        data: [
          {
            attemptId: testAttempt.id,
            userId: testUser.id,
            sessionTime: 100,
            dependencyIndex: 50,
            passRate: 60,
            checklistScore: 7,
            timestamp: new Date(Date.now() - 1000),
          },
          {
            attemptId: testAttempt.id,
            userId: testUser.id,
            sessionTime: 200,
            dependencyIndex: 40,
            passRate: 70,
            checklistScore: 8,
            timestamp: new Date(),
          },
        ],
      });
    });

    it('should get session metrics successfully', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/metrics/session/${testAttempt.id}`,
        headers: {
          authorization: `Bearer ${tokens.accessToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      
      expect(body).toHaveProperty('attempt');
      expect(body).toHaveProperty('metrics');
      expect(body.metrics).toHaveLength(2);
      expect(body).toHaveProperty('trends');
      expect(body).toHaveProperty('userAverages');
      expect(body).toHaveProperty('summary');
      expect(body.summary.improvement.DI).toBe(10); 
      expect(body.summary.improvement.PR).toBe(10); 
    });

    it('should fail with unauthorized attempt', async () => {
      const otherUser = await prisma.user.create({
        data: {
          email: 'other@example.com',
          password: 'password',
          name: 'Other User',
        },
      });

      const otherAttempt = await prisma.challengeAttempt.create({
        data: {
          userId: otherUser.id,
          challengeId: testChallenge.id,
          sessionId: 'other-session',
          language: 'javascript',
          codeSnapshots: [],
          testResults: [],
        },
      });

      const response = await app.inject({
        method: 'GET',
        url: `/metrics/session/${otherAttempt.id}`,
        headers: {
          authorization: `Bearer ${tokens.accessToken}`,
        },
      });

      expect(response.statusCode).toBe(403);

      await prisma.challengeAttempt.delete({ where: { id: otherAttempt.id } });
      await prisma.user.delete({ where: { id: otherUser.id } });
    });
  });
});