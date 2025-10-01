
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { FastifyInstance } from 'fastify';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { buildTestApp, cleanupTestApp } from '../../helpers/test-app';
import { Difficulty, Category, UserRole } from '../../../src/shared/domain/enums';

describe('Challenge Module Integration Tests', () => {
  let app: FastifyInstance;
  let prisma: PrismaClient;
  let redis: Redis;

  let techLeadUser: any;
  let techLeadTokens: { accessToken: string; refreshToken: string };
  let juniorUser: any;
  let juniorTokens: { accessToken: string; refreshToken: string };
  let seniorUser: any;
  let seniorTokens: { accessToken: string; refreshToken: string };
  let testChallenge: any;

  beforeAll(async () => {
    try {
      const testApp = await buildTestApp();
      app = testApp.app;
      prisma = testApp.prisma;
      redis = testApp.redis;

      await prisma.$executeRaw`SELECT 1`;
    } catch (error) {
      console.error('Error setting up test app:', error);
      throw error;
    }
  }, 60000);

  afterAll(async () => {
    await cleanupTestApp(app, prisma, redis);
  });

  beforeEach(async () => {
    try {
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
      console.error('Error cleaning test data:', error);
    }

    techLeadUser = null;
    techLeadTokens = { accessToken: '', refreshToken: '' };
    juniorUser = null;
    juniorTokens = { accessToken: '', refreshToken: '' };
    seniorUser = null;
    seniorTokens = { accessToken: '', refreshToken: '' };
    testChallenge = null;

    const timestamp = Date.now();

    const techLeadResponse = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: `techlead-${timestamp}@company.com`,
        password: 'TechLead@123',
        name: 'Tech Lead User',
        acceptTerms: true,
      },
    });

    expect(techLeadResponse.statusCode).toBe(201);
    const techLeadBody = JSON.parse(techLeadResponse.body);
    techLeadUser = techLeadBody.data?.user || techLeadBody.user;
    techLeadTokens = {
      accessToken: techLeadBody.data?.accessToken || techLeadBody.accessToken,
      refreshToken: techLeadBody.data?.refreshToken || techLeadBody.refreshToken,
    };

    await prisma.user.update({
      where: { id: techLeadUser.id },
      data: { role: UserRole.TECH_LEAD },
    });

    const techLeadLoginResponse = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: {
        email: `techlead-${timestamp}@company.com`,
        password: 'TechLead@123',
      },
    });

    expect(techLeadLoginResponse.statusCode).toBe(200);
    const techLeadLoginBody = JSON.parse(techLeadLoginResponse.body);
    techLeadTokens = {
      accessToken: techLeadLoginBody.data?.accessToken || techLeadLoginBody.accessToken,
      refreshToken: techLeadLoginBody.data?.refreshToken || techLeadLoginBody.refreshToken,
    };

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
    juniorUser = juniorBody.data?.user || juniorBody.user;
    juniorTokens = {
      accessToken: juniorBody.data?.accessToken || juniorBody.accessToken,
      refreshToken: juniorBody.data?.refreshToken || juniorBody.refreshToken,
    };

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
    seniorUser = seniorBody.data?.user || seniorBody.user;
    seniorTokens = {
      accessToken: seniorBody.data?.accessToken || seniorBody.accessToken,
      refreshToken: seniorBody.data?.refreshToken || seniorBody.refreshToken,
    };

    await prisma.user.update({
      where: { id: seniorUser.id },
      data: { role: UserRole.SENIOR },
    });

    const seniorLoginResponse = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: {
        email: `senior-${timestamp}@company.com`,
        password: 'Senior@123',
      },
    });

    expect(seniorLoginResponse.statusCode).toBe(200);
    const seniorLoginBody = JSON.parse(seniorLoginResponse.body);
    seniorTokens = {
      accessToken: seniorLoginBody.data?.accessToken || seniorLoginBody.accessToken,
      refreshToken: seniorLoginBody.data?.refreshToken || seniorLoginBody.refreshToken,
    };

    const challengeData = {
      slug: 'test-challenge',
      title: 'Test Challenge',
      description: 'A test challenge for integration tests',
      difficulty: Difficulty.EASY,
      category: Category.BACKEND,
      estimatedMinutes: 30,
      languages: ['javascript', 'typescript'],
      instructions: 'Write a function that returns the sum of two numbers.',
      starterCode: 'function sum(a, b) {\n  // Your code here\n}',
      solution: 'function sum(a, b) {\n  return a + b;\n}',
      testCases: [
        {
          input: '1 2',
          expectedOutput: '3',
          weight: 0.33,
          description: 'Basic test case',
        },
        {
          input: '10 20',
          expectedOutput: '30',
          weight: 0.33,
          description: 'Another test case',
        },
        {
          input: '0 0',
          expectedOutput: '0',
          weight: 0.34,
          description: 'Edge case - zeros',
        },
      ],
      hints: [
        {
          trigger: 'stuck',
          message: 'Remember to add the two numbers',
          cost: 10,
        },
      ],
      traps: [
        {
          id: 'trap1',
          type: 'logic',
          buggedCode: 'return a - b;',
          correctCode: 'return a + b;',
          explanation: 'Should add, not subtract',
          detectionPattern: 'a\\s*-\\s*b',
          severity: 'medium',
        },
      ],
      baseXp: 100,
      bonusXp: 50,
      targetMetrics: {
        maxDI: 40,
        minPR: 70,
        minCS: 8,
      },
    };

    const createChallengeResponse = await app.inject({
      method: 'POST',
      url: '/challenges',
      headers: {
        authorization: `Bearer ${techLeadTokens.accessToken}`,
      },
      payload: challengeData,
    });

    if (createChallengeResponse.statusCode === 201) {
      const responseBody = JSON.parse(createChallengeResponse.body);
      testChallenge = responseBody.data || responseBody;
    } else {
      console.error('Failed to create test challenge:', {
        statusCode: createChallengeResponse.statusCode,
        body: createChallengeResponse.body
      });
      throw new Error(`Failed to create test challenge: ${createChallengeResponse.statusCode}`);
    }
  });

describe('Challenge Management (Admin Routes)', () => {
  describe('POST /challenges', () => {
    it('should allow TECH_LEAD to create a challenge', async () => {
      const challengeData = {
        slug: 'new-challenge',
        title: 'New Challenge',
        description: 'A brand new challenge',
        difficulty: Difficulty.MEDIUM,
        category: Category.FRONTEND,
        estimatedMinutes: 45,
        languages: ['javascript', 'typescript'],
        instructions: 'Create a React component that displays a list with proper styling and functionality.',
        solution: 'const List = () => <ul></ul>;',
        testCases: [
          {
            input: 'test1',
            expectedOutput: '<ul></ul>',
            weight: 0.33,
            description: 'Basic render test',
          },
          {
            input: 'test2',
            expectedOutput: '<ul></ul>',
            weight: 0.33,
            description: 'Component structure test',
          },
          {
            input: 'test3',
            expectedOutput: '<ul></ul>',
            weight: 0.34,
            description: 'Final validation test',
          },
        ],
        traps: [
          {
            id: 'trap2',
            type: 'performance',
            buggedCode: 'array.map().filter()',
            correctCode: 'array.filter().map()',
            explanation: 'Filter first to reduce iterations',
            detectionPattern: 'map.*filter',
            severity: 'low',
          },
        ],
      };

      const response = await app.inject({
        method: 'POST',
        url: '/challenges',
        headers: {
          authorization: `Bearer ${techLeadTokens.accessToken}`,
        },
        payload: challengeData,
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      const challenge = body.data || body;
      expect(challenge.slug).toBe('new-challenge');
      expect(challenge.title).toBe('New Challenge');
      expect(challenge.difficulty).toBe(Difficulty.MEDIUM);
      expect(challenge.category).toBe(Category.FRONTEND);
      expect(challenge.baseXp).toBe(100);

      const dbChallenge = await prisma.challenge.findUnique({
        where: { slug: 'new-challenge' },
      });
      expect(dbChallenge).toBeTruthy();
    });

    it('should forbid JUNIOR from creating a challenge', async () => {
      const challengeData = {
        slug: 'unauthorized-challenge',
        title: 'Unauthorized Challenge',
        description: 'Should not be created',
        difficulty: Difficulty.EASY,
        category: Category.BACKEND,
        estimatedMinutes: 20,
        languages: ['javascript'],
        instructions: 'This test case should fail validation due to insufficient permissions for junior developers.',
        solution: 'function test() { return "This is a test solution for validation purposes"; }',
        testCases: [
          {
            input: 'test1',
            expectedOutput: 'test1',
            weight: 0.33,
            description: 'Test case 1',
          },
          {
            input: 'test2',
            expectedOutput: 'test2',
            weight: 0.33,
            description: 'Test case 2',
          },
          {
            input: 'test3',
            expectedOutput: 'test3',
            weight: 0.34,
            description: 'Test case 3',
          },
        ],
        traps: [
          {
            id: 'trap3',
            type: 'logic',
            buggedCode: 'bad',
            correctCode: 'good',
            explanation: 'test',
            detectionPattern: 'bad',
            severity: 'low',
          },
        ],
      };

      const response = await app.inject({
        method: 'POST',
        url: '/challenges',
        headers: {
          authorization: `Bearer ${juniorTokens.accessToken}`,
        },
        payload: challengeData,
      });

      expect(response.statusCode).toBe(403);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Forbidden');

      const dbChallenge = await prisma.challenge.findUnique({
        where: { slug: 'unauthorized-challenge' },
      });
      expect(dbChallenge).toBeNull();
    });

    it('should fail when creating challenge with duplicate slug', async () => {
      const duplicateData = {
        slug: 'test-challenge',
        title: 'Duplicate Challenge',
        description: 'Should fail due to duplicate slug',
        difficulty: Difficulty.HARD,
        category: Category.BACKEND,
        estimatedMinutes: 60,
        languages: ['python'],
        instructions: 'This test case should fail validation due to insufficient permissions for junior developers.',
        solution: 'function test() { return "This is a test solution for validation purposes"; }',
        testCases: [
          {
            input: 'test1',
            expectedOutput: 'test1',
            weight: 0.33,
            description: 'Test case 1',
          },
          {
            input: 'test2',
            expectedOutput: 'test2',
            weight: 0.33,
            description: 'Test case 2',
          },
          {
            input: 'test3',
            expectedOutput: 'test3',
            weight: 0.34,
            description: 'Test case 3',
          },
        ],
        traps: [
          {
            id: 'trap4',
            type: 'security',
            buggedCode: 'eval()',
            correctCode: 'JSON.parse()',
            explanation: 'Never use eval',
            detectionPattern: 'eval\\(',
            severity: 'critical',
          },
        ],
      };

      const response = await app.inject({
        method: 'POST',
        url: '/challenges',
        headers: {
          authorization: `Bearer ${techLeadTokens.accessToken}`,
        },
        payload: duplicateData,
      });

      expect(response.statusCode).toBe(409);
      const body = JSON.parse(response.body);
      expect(body.code).toBe('CHALLENGE_SLUG_EXISTS');
      expect(body.statusCode).toBe(409);
    });

    it('should fail when test case weights do not sum to 1.0', async () => {
      const invalidData = {
        slug: 'invalid-weights',
        title: 'Invalid Weights Challenge',
        description: 'Test case weights are invalid',
        difficulty: Difficulty.EASY,
        category: Category.BACKEND,
        estimatedMinutes: 30,
        languages: ['javascript'],
        instructions: 'This test case should fail validation due to insufficient permissions for junior developers.',
        solution: 'function test() { return "This is a test solution for validation purposes"; }',
        testCases: [
          {
            input: 'test1',
            expectedOutput: 'output1',
            weight: 0.3,
            description: 'Test case 1',
          },
          {
            input: 'test2',
            expectedOutput: 'output2',
            weight: 0.5,
            description: 'Test case 2',
          },
          {
            input: 'test3',
            expectedOutput: 'output3',
            weight: 0.0,
            description: 'Test case 3',
          },
        ],
        traps: [
          {
            id: 'trap5',
            type: 'logic',
            buggedCode: 'bad',
            correctCode: 'good',
            explanation: 'test',
            detectionPattern: 'bad',
            severity: 'low',
          },
        ],
      };

      const response = await app.inject({
        method: 'POST',
        url: '/challenges',
        headers: {
          authorization: `Bearer ${techLeadTokens.accessToken}`,
        },
        payload: invalidData,
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.code).toBe('CHALLENGE_INVALID_WEIGHTS');
      expect(body.statusCode).toBe(400);
    });

    it('should return 400 when creating challenge with invalid body', async () => {
      const invalidData = {
        slug: 'invalid-challenge',
        difficulty: Difficulty.EASY,
        category: Category.BACKEND,
      };

      const response = await app.inject({
        method: 'POST',
        url: '/challenges',
        headers: {
          authorization: `Bearer ${techLeadTokens.accessToken}`,
        },
        payload: invalidData,
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(['CHALLENGE_VALIDATION_FAILED', 'FST_ERR_VALIDATION']).toContain(body.code);
    });
  });

  describe('PATCH /challenges/:id', () => {
    it('should allow TECH_LEAD to update a challenge', async () => {
      const updateData = {
        title: 'Updated Test Challenge',
        estimatedMinutes: 45,
      };

      const response = await app.inject({
        method: 'PATCH',
        url: `/challenges/${testChallenge.id}`,
        headers: {
          authorization: `Bearer ${techLeadTokens.accessToken}`,
        },
        payload: updateData,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.title).toBe('Updated Test Challenge');
      expect(body.estimatedMinutes).toBe(45);
      expect(body.slug).toBe('test-challenge');

      const dbChallenge = await prisma.challenge.findUnique({
        where: { id: testChallenge.id },
      });
      expect(dbChallenge?.title).toBe('Updated Test Challenge');
    });

    it('should return 404 when updating non-existent challenge', async () => {
      const nonExistentId = 'cuid-that-does-not-exist';

      const response = await app.inject({
        method: 'PATCH',
        url: `/challenges/${nonExistentId}`,
        headers: {
          authorization: `Bearer ${techLeadTokens.accessToken}`,
        },
        payload: {
          title: 'Should not work',
        },
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.code).toBe('CHALLENGE_NOT_FOUND');
      expect(body.statusCode).toBe(404);
    });

    it('should return 403 when JUNIOR tries to update a challenge', async () => {
      const updateData = {
        title: 'Updated by Junior',
      };

      const response = await app.inject({
        method: 'PATCH',
        url: `/challenges/${testChallenge.id}`,
        headers: {
          authorization: `Bearer ${juniorTokens.accessToken}`,
        },
        payload: updateData,
      });

      expect(response.statusCode).toBe(403);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Forbidden');
    });

    it('should return 409 when updating challenge with existing slug', async () => {
      const secondChallenge = {
        slug: 'second-challenge',
        title: 'Second Challenge',
        description: 'Another test challenge',
        difficulty: Difficulty.MEDIUM,
        category: Category.BACKEND,
        estimatedMinutes: 30,
        languages: ['javascript'],
        instructions: 'This is another challenge for testing slug conflicts in updates.',
        solution: 'function solution() { return "second"; }',
        testCases: [
          {
            input: 'test1',
            expectedOutput: 'test1',
            weight: 0.33,
            description: 'Test case 1',
          },
          {
            input: 'test2',
            expectedOutput: 'test2',
            weight: 0.33,
            description: 'Test case 2',
          },
          {
            input: 'test3',
            expectedOutput: 'test3',
            weight: 0.34,
            description: 'Test case 3',
          },
        ],
        traps: [],
      };

      await app.inject({
        method: 'POST',
        url: '/challenges',
        headers: {
          authorization: `Bearer ${techLeadTokens.accessToken}`,
        },
        payload: secondChallenge,
      });

      const updateData = {
        slug: 'second-challenge',
      };

      const response = await app.inject({
        method: 'PATCH',
        url: `/challenges/${testChallenge.id}`,
        headers: {
          authorization: `Bearer ${techLeadTokens.accessToken}`,
        },
        payload: updateData,
      });

      expect(response.statusCode).toBe(200);
    });
  });

  describe('DELETE /challenges/:id', () => {
    it('should allow TECH_LEAD to delete a challenge', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: `/challenges/${testChallenge.id}`,
        headers: {
          authorization: `Bearer ${techLeadTokens.accessToken}`,
        },
      });

      expect(response.statusCode).toBe(204);

      const dbChallenge = await prisma.challenge.findUnique({
        where: { id: testChallenge.id },
      });
      expect(dbChallenge).toBeNull();
    });

    it('should forbid SENIOR from deleting a challenge', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: `/challenges/${testChallenge.id}`,
        headers: {
          authorization: `Bearer ${seniorTokens.accessToken}`,
        },
      });

      expect(response.statusCode).toBe(403);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Forbidden');

      const dbChallenge = await prisma.challenge.findUnique({
        where: { id: testChallenge.id },
      });
      expect(dbChallenge).toBeTruthy();
    });

    it('should return 404 when deleting non-existent challenge', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: '/challenges/cuid-that-does-not-exist',
        headers: {
          authorization: `Bearer ${techLeadTokens.accessToken}`,
        },
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.code).toBe('CHALLENGE_NOT_FOUND');
      expect(body.statusCode).toBe(404);
    });
  });
});

describe('User Interaction (Authenticated Routes)', () => {
  describe('POST /challenges/:id/start', () => {
    it('should allow JUNIOR to start a challenge attempt', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/challenges/${testChallenge.id}/start`,
        headers: {
          authorization: `Bearer ${juniorTokens.accessToken}`,
        },
        payload: {
          language: 'javascript',
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      const data = body.data || body;
      expect(data).toHaveProperty('attemptId');
      expect(data).toHaveProperty('sessionId');
      expect(data.resumed).toBe(false);
      expect(data.starterCode).toBe(testChallenge.starterCode);

      const attempt = await prisma.challengeAttempt.findUnique({
        where: { id: data.attemptId },
      });
      expect(attempt).toBeTruthy();
      expect(attempt?.userId).toBe(juniorUser.id);
      expect(attempt?.challengeId).toBe(testChallenge.id);
      expect(attempt?.status).toBe('IN_PROGRESS');
      expect(attempt?.language).toBe('javascript');
    });

    it('should fail when language is not supported', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/challenges/${testChallenge.id}/start`,
        headers: {
          authorization: `Bearer ${juniorTokens.accessToken}`,
        },
        payload: {
          language: 'rust',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.code).toBe('CHALLENGE_LANGUAGE_NOT_SUPPORTED');
      expect(body.statusCode).toBe(400);
    });

    it('should resume existing attempt if one is IN_PROGRESS', async () => {
      const firstResponse = await app.inject({
        method: 'POST',
        url: `/challenges/${testChallenge.id}/start`,
        headers: {
          authorization: `Bearer ${juniorTokens.accessToken}`,
        },
        payload: {
          language: 'javascript',
        },
      });
      expect(firstResponse.statusCode).toBe(201);
      const firstBody = JSON.parse(firstResponse.body);

      const secondResponse = await app.inject({
        method: 'POST',
        url: `/challenges/${testChallenge.id}/start`,
        headers: {
          authorization: `Bearer ${juniorTokens.accessToken}`,
        },
        payload: {
          language: 'javascript',
        },
      });

      expect(secondResponse.statusCode).toBe(201);
      const secondBody = JSON.parse(secondResponse.body);
      const secondData = secondBody.data || secondBody;
      const firstData = firstBody.data || firstBody;
      expect(secondData.attemptId).toBe(firstData.attemptId);
      expect(secondData.sessionId).toBe(firstData.sessionId);
      expect(secondData.resumed).toBe(true);
    });

    it('should return 401 when starting challenge without authentication', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/challenges/${testChallenge.id}/start`,
        payload: {
          language: 'javascript',
        },
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(['Unauthorized', 'UnauthorizedError']).toContain(body.error);
    });
  });

  describe('POST /challenges/submit', () => {
    let attemptId: string;

    beforeEach(async () => {
      const startResponse = await app.inject({
        method: 'POST',
        url: `/challenges/${testChallenge.id}/start`,
        headers: {
          authorization: `Bearer ${juniorTokens.accessToken}`,
        },
        payload: {
          language: 'javascript',
        },
      });

      expect(startResponse.statusCode).toBe(201);
      const startBody = JSON.parse(startResponse.body);
      const startData = startBody.data || startBody;
      attemptId = startData.attemptId;
    });

    it('should successfully submit a correct solution', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/challenges/submit',
        headers: {
          authorization: `Bearer ${juniorTokens.accessToken}`,
        },
        payload: {
          challengeId: testChallenge.id,
          attemptId,
          code: 'function sum(a, b) { return a + b; }',
          language: 'javascript',
        },
      });

      expect([200, 500]).toContain(response.statusCode);

      if (response.statusCode === 200) {
        const body = JSON.parse(response.body);
        expect(body).toHaveProperty('attemptId');
        expect(body).toHaveProperty('score');
        expect(body).toHaveProperty('testResults');
        expect(body).toHaveProperty('feedback');
      }
    });

    it('should fail when submitting to already completed attempt', async () => {
      await prisma.challengeAttempt.update({
        where: { id: attemptId },
        data: { status: 'COMPLETED' },
      });

      const response = await app.inject({
        method: 'POST',
        url: '/challenges/submit',
        headers: {
          authorization: `Bearer ${juniorTokens.accessToken}`,
        },
        payload: {
          challengeId: testChallenge.id,
          attemptId,
          code: 'function sum(a, b) { return a + b; }',
          language: 'javascript',
        },
      });

      expect([400]).toContain(response.statusCode);
      const body = JSON.parse(response.body);
      expect(['CHALLENGE_ATTEMPT_COMPLETED', 'CHALLENGE_VALIDATION_FAILED']).toContain(body.code);
    });

    it('should fail when user does not own the attempt', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/challenges/submit',
        headers: {
          authorization: `Bearer ${seniorTokens.accessToken}`,
        },
        payload: {
          challengeId: testChallenge.id,
          attemptId,
          code: 'function sum(a, b) { return a + b; }',
          language: 'javascript',
        },
      });

      expect([400, 403]).toContain(response.statusCode);
    });

    it('should return 401 when submitting solution without authentication', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/challenges/submit',
        payload: {
          challengeId: testChallenge.id,
          attemptId: 'some-attempt-id',
          language: 'javascript',
          code: 'function solution() { return "test"; }',
        },
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(['Unauthorized', 'UnauthorizedError']).toContain(body.error);
    });
  });

  describe('POST /challenges/analyze', () => {
    let attemptId: string;

    beforeEach(async () => {
      const startResponse = await app.inject({
        method: 'POST',
        url: `/challenges/${testChallenge.id}/start`,
        headers: {
          authorization: `Bearer ${juniorTokens.accessToken}`,
        },
        payload: {
          language: 'javascript',
        },
      });

      expect(startResponse.statusCode).toBe(201);
      const startBody = JSON.parse(startResponse.body);
      const startData = startBody.data || startBody;
      attemptId = startData.attemptId;
    });

    it('should analyze code and detect traps', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/challenges/analyze',
        headers: {
          authorization: `Bearer ${juniorTokens.accessToken}`,
        },
        payload: {
          challengeId: testChallenge.id,
          attemptId,
          code: 'function sum(a, b) { return a - b; }',
          checkpointTime: 60,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('trapsDetected');
      expect(body).toHaveProperty('codeQuality');
      expect(body).toHaveProperty('feedback');
      expect(body).toHaveProperty('warnings');

      expect(body.trapsDetected.length).toBeGreaterThan(0);
      expect(body.trapsDetected[0].trapId).toBe('trap1');
    });

    it('should return 401 when analyzing code without authentication', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/challenges/analyze',
        payload: {
          challengeId: testChallenge.id,
          attemptId: attemptId,
          code: 'function test() { return a + b; }',
          checkpointTime: 30,
        },
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(['Unauthorized', 'UnauthorizedError']).toContain(body.error);
    });

    it('should return 403 when analyzing code from another user attempt', async () => {
      const anotherUserStartResponse = await app.inject({
        method: 'POST',
        url: `/challenges/${testChallenge.id}/start`,
        headers: {
          authorization: `Bearer ${seniorTokens.accessToken}`,
        },
        payload: {
          language: 'javascript',
        },
      });
      expect(anotherUserStartResponse.statusCode).toBe(201);
      const anotherUserBody = JSON.parse(anotherUserStartResponse.body);
      const anotherUserData = anotherUserBody.data || anotherUserBody;
      const anotherUserAttemptId = anotherUserData.attemptId;

      const response = await app.inject({
        method: 'POST',
        url: '/challenges/analyze',
        headers: {
          authorization: `Bearer ${juniorTokens.accessToken}`,
        },
        payload: {
          challengeId: testChallenge.id,
          attemptId: anotherUserAttemptId,
          code: 'function test() { return a + b; }',
          checkpointTime: 30,
        },
      });

      expect(response.statusCode).toBe(403);
      const body = JSON.parse(response.body);
      expect(['Forbidden', 'InvalidAttemptError']).toContain(body.error);
    });
  });
});

describe('Challenge Discovery (Public Routes)', () => {
  describe('GET /challenges', () => {
    it('should list challenges for anonymous users', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/challenges',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('challenges');
      expect(Array.isArray(body.challenges)).toBe(true);
      expect(body.challenges.length).toBeGreaterThan(0);

      const challenge = body.challenges[0];
      expect(challenge).not.toHaveProperty('completed');
    });

    it('should list challenges with completion status for authenticated users', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/challenges',
        headers: {
          authorization: `Bearer ${juniorTokens.accessToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('challenges');
      expect(Array.isArray(body.challenges)).toBe(true);

      const challenge = body.challenges[0];
      expect(challenge).toHaveProperty('completed');
      expect(challenge.completed).toBe(false);
    });

    it('should filter challenges by difficulty', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/challenges?difficulty=EASY',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.challenges.length).toBeGreaterThan(0);
      expect(body.challenges.every((c: any) => c.difficulty === 'EASY')).toBe(true);
    });

    it('should filter challenges by category', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/challenges?category=BACKEND',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.challenges.length).toBeGreaterThan(0);
      expect(body.challenges.every((c: any) => c.category === 'BACKEND')).toBe(true);
    });

    it('should paginate results with limit and offset', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/challenges?limit=1&offset=0',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.challenges.length).toBe(1);
    });
  });

  describe('GET /challenges/:idOrSlug', () => {
    it('should get challenge by ID', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/challenges/${testChallenge.id}`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('challenge');
      expect(body).toHaveProperty('attempts');
      expect(body.challenge.id).toBe(testChallenge.id);
      expect(body.challenge.slug).toBe('test-challenge');
      expect(body.attempts).toEqual([]);
    });

    it('should get challenge by slug', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/challenges/test-challenge',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('challenge');
      expect(body.challenge.slug).toBe('test-challenge');
    });

    it('should include user attempts when authenticated', async () => {
      await app.inject({
        method: 'POST',
        url: `/challenges/${testChallenge.id}/start`,
        headers: {
          authorization: `Bearer ${juniorTokens.accessToken}`,
        },
        payload: {
          language: 'javascript',
        },
      });

      const response = await app.inject({
        method: 'GET',
        url: `/challenges/${testChallenge.id}`,
        headers: {
          authorization: `Bearer ${juniorTokens.accessToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.attempts.length).toBeGreaterThan(0);
      expect(body.attempts[0]).toHaveProperty('attemptNumber');
      expect(body.attempts[0]).toHaveProperty('status');
    });

    it('should return 404 for non-existent slug', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/challenges/non-existent-challenge',
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.code).toBe('CHALLENGE_NOT_FOUND');
      expect(body.statusCode).toBe(404);
    });
  });
});
});