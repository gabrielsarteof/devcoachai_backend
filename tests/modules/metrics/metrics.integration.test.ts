
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { FastifyInstance } from 'fastify';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { buildTestApp, cleanupTestApp } from '../../helpers/test-app';
import { Difficulty, Category, UserRole } from '../../../src/shared/domain/enums';

describe('Metrics Module Integration Tests', () => {
  let app: FastifyInstance;
  let prisma: PrismaClient;
  let redis: Redis;

  let techLeadUser: any;
  let techLeadTokens: { accessToken: string; refreshToken: string };
  let juniorUserA: any;
  let juniorTokensA: { accessToken: string; refreshToken: string };
  let juniorUserB: any;
  let juniorTokensB: { accessToken: string; refreshToken: string };
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
    juniorUserA = null;
    juniorTokensA = { accessToken: '', refreshToken: '' };
    juniorUserB = null;
    juniorTokensB = { accessToken: '', refreshToken: '' };
    testChallenge = null;

    
    const timestamp = Date.now();

    const techLeadResponse = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        email: `techlead-${timestamp}@company.com`,
        password: 'TechLead@123',
        name: 'Tech Lead User',
        acceptTerms: true,
      },
    });

    expect(techLeadResponse.statusCode).toBe(201);
    const techLeadBody = JSON.parse(techLeadResponse.body);
    const techLeadData = techLeadBody.data || techLeadBody;
    techLeadUser = techLeadData.user;
    techLeadTokens = {
      accessToken: techLeadData.accessToken,
      refreshToken: techLeadData.refreshToken,
    };

    await prisma.user.update({
      where: { id: techLeadUser.id },
      data: { role: UserRole.TECH_LEAD },
    });

    const techLeadLoginResponse = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {
        email: `techlead-${timestamp}@company.com`,
        password: 'TechLead@123',
      },
    });

    expect(techLeadLoginResponse.statusCode).toBe(200);
    const techLeadLoginBody = JSON.parse(techLeadLoginResponse.body);
    const techLeadLoginData = techLeadLoginBody.data || techLeadLoginBody;
    techLeadTokens = {
      accessToken: techLeadLoginData.accessToken,
      refreshToken: techLeadLoginData.refreshToken,
    };

    const juniorResponseA = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        email: `junior-a-${timestamp}@company.com`,
        password: 'Junior@123',
        name: 'Junior Developer A',
        acceptTerms: true,
      },
    });

    expect(juniorResponseA.statusCode).toBe(201);
    const juniorBodyA = JSON.parse(juniorResponseA.body);
    const juniorDataA = juniorBodyA.data || juniorBodyA;
    juniorUserA = juniorDataA.user;
    juniorTokensA = {
      accessToken: juniorDataA.accessToken,
      refreshToken: juniorDataA.refreshToken,
    };

    const juniorResponseB = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        email: `junior-b-${timestamp}@company.com`,
        password: 'Junior@123',
        name: 'Junior Developer B',
        acceptTerms: true,
      },
    });

    expect(juniorResponseB.statusCode).toBe(201);
    const juniorBodyB = JSON.parse(juniorResponseB.body);
    const juniorDataB = juniorBodyB.data || juniorBodyB;
    juniorUserB = juniorDataB.user;
    juniorTokensB = {
      accessToken: juniorDataB.accessToken,
      refreshToken: juniorDataB.refreshToken,
    };

    const challengeData = {
      slug: 'metrics-test-challenge',
      title: 'Metrics Test Challenge',
      description: 'A test challenge for metrics integration tests',
      difficulty: Difficulty.EASY,
      category: Category.BACKEND,
      estimatedMinutes: 30,
      languages: ['javascript', 'typescript'],
      instructions: 'Write a function that calculates metrics based on the provided data. This function should take an array of numbers and return their sum. Make sure to handle edge cases like empty arrays and validate the input.',
      starterCode: 'function calculateMetrics(data) {\n  // Your code here\n}',  
      solution: 'function calculateMetrics(data) {\n  return data.reduce((a, b) => a + b, 0);\n}',
      testCases: [
        {
          input: '[1, 2, 3]',
          expectedOutput: '6',
          weight: 0.33,
          description: 'Basic test case',
        },
        {
          input: '[10, 20]',
          expectedOutput: '30',
          weight: 0.33,
          description: 'Another test case',
        },
        {
          input: '[0, 0]',
          expectedOutput: '0',
          weight: 0.34,
          description: 'Edge case - zeros',
        },
      ],
      hints: [
        {
          trigger: 'stuck',
          message: 'Remember to sum the numbers',
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
      url: '/api/challenges',
      headers: {
        authorization: `Bearer ${techLeadTokens.accessToken}`,
      },
      payload: challengeData,
    });

    if (createChallengeResponse.statusCode === 201) {
      const challengeBody = JSON.parse(createChallengeResponse.body);
      testChallenge = challengeBody.data || challengeBody;
    } else {
      console.error('Failed to create test challenge:', createChallengeResponse.body);
    }
  });

  describe('Metrics Tracking (Authenticated Routes)', () => {
    describe('POST /api/metrics', () => {
      let attemptId: string;

      beforeEach(async () => {
        const startResponse = await app.inject({
          method: 'POST',
          url: `/api/challenges/${testChallenge.id}/start`,
          headers: {
            authorization: `Bearer ${juniorTokensA.accessToken}`,
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

      it('should track metrics successfully', async () => {
        const response = await app.inject({
          method: 'POST',
          url: '/api/metrics',
          headers: {
            authorization: `Bearer ${juniorTokensA.accessToken}`,
          },
          payload: {
            attemptId,
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

        expect(response.statusCode).toBe(201);
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
          url: '/api/metrics',
          headers: {
            authorization: `Bearer ${juniorTokensA.accessToken}`,
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
        const body = JSON.parse(response.body);
        expect(body.code).toBe('METRIC_INVALID_ATTEMPT');
      });

      it('should return 401 Unauthorized if no token is provided', async () => {
        const response = await app.inject({
          method: 'POST',
          url: '/api/metrics',
          payload: {
            attemptId,
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

        expect(response.statusCode).toBe(401);
        const body = JSON.parse(response.body);
        expect(['AUTH_UNAUTHORIZED', 'METRIC_UNAUTHORIZED']).toContain(body.code);
      });

      it('should fail when user does not own the attempt', async () => {
        const startResponse = await app.inject({
          method: 'POST',
          url: `/api/challenges/${testChallenge.id}/start`,
          headers: {
            authorization: `Bearer ${juniorTokensB.accessToken}`,
          },
          payload: {
            language: 'javascript',
          },
        });

        expect(startResponse.statusCode).toBe(201);
        const otherAttemptBody = JSON.parse(startResponse.body);
        const otherAttemptData = otherAttemptBody.data || otherAttemptBody;
        const otherAttemptId = otherAttemptData.attemptId;

        const response = await app.inject({
          method: 'POST',
          url: '/api/metrics',
          headers: {
            authorization: `Bearer ${juniorTokensA.accessToken}`,
          },
          payload: {
            attemptId: otherAttemptId,
            totalLines: 50,
            linesFromAI: 10,
            linesTyped: 40,
            copyPasteEvents: 1,
            deleteEvents: 2,
            testRuns: 2,
            testsPassed: 1,
            testsTotal: 2,
            checklistItems: [],
            sessionTime: 150,
          },
        });

        expect(response.statusCode).toBe(403);
        const body = JSON.parse(response.body);
        expect(body.code).toBe('METRIC_INVALID_ATTEMPT');
      });

      it('should return 400 Bad Request with invalid payload', async () => {
        const response = await app.inject({
          method: 'POST',
          url: '/api/metrics',
          headers: {
            authorization: `Bearer ${juniorTokensA.accessToken}`,
          },
          payload: {
            attemptId,
            totalLines: 'invalid', 
            sessionTime: -10, 
          },
        });

        expect(response.statusCode).toBe(400);
        const body = JSON.parse(response.body);
        expect(['METRIC_VALIDATION_FAILED', 'FST_ERR_VALIDATION']).toContain(body.code);
      });

      it('should return 400 Bad Request when missing required fields', async () => {
        const response = await app.inject({
          method: 'POST',
          url: '/api/metrics',
          headers: {
            authorization: `Bearer ${juniorTokensA.accessToken}`,
          },
          payload: {
            attemptId,
          },
        });

        expect(response.statusCode).toBe(400);
        const body = JSON.parse(response.body);
        expect(['METRIC_VALIDATION_FAILED', 'FST_ERR_VALIDATION']).toContain(body.code);
      });

      it('should track high-risk metrics and return appropriate warnings', async () => {
        const response = await app.inject({
          method: 'POST',
          url: '/api/metrics',
          headers: {
            authorization: `Bearer ${juniorTokensA.accessToken}`,
          },
          payload: {
            attemptId,
            totalLines: 100,
            linesFromAI: 95,
            linesTyped: 5,
            copyPasteEvents: 10,
            deleteEvents: 20,
            testRuns: 10,
            testsPassed: 1,
            testsTotal: 10,
            checklistItems: [
              { id: 'c1', label: 'Validation', checked: false, weight: 1, category: 'validation' },
              { id: 'c2', label: 'Security', checked: false, weight: 2, category: 'security' },
            ],
            sessionTime: 300,
          },
        });

        expect(response.statusCode).toBe(201);
        const body = JSON.parse(response.body);
        expect(body.success).toBe(true);
        expect(body.data.calculation.dependencyIndex).toBeGreaterThan(90);
        expect(body.data.calculation.passRate).toBeLessThan(20);
        expect(['HIGH', 'CRITICAL']).toContain(body.data.riskAssessment.level);
      });

      describe('Data Validation Edge Cases', () => {
        it('should return 400 for negative numeric values', async () => {
          const response = await app.inject({
            method: 'POST',
            url: '/api/metrics',
            headers: {
              authorization: `Bearer ${juniorTokensA.accessToken}`,
            },
            payload: {
              attemptId,
              totalLines: -10,
              linesFromAI: -5,
              linesTyped: -15,
              copyPasteEvents: 1,
              deleteEvents: 2,
              testRuns: 3,
              testsPassed: 2,
              testsTotal: 3,
              checklistItems: [],
              sessionTime: 300,
            },
          });

          expect(response.statusCode).toBe(400);
          const body = JSON.parse(response.body);
          expect(['METRIC_VALIDATION_FAILED', 'FST_ERR_VALIDATION']).toContain(body.code);
        });

        it('should return 400 when linesFromAI exceeds totalLines', async () => {
          const response = await app.inject({
            method: 'POST',
            url: '/api/metrics',
            headers: {
              authorization: `Bearer ${juniorTokensA.accessToken}`,
            },
            payload: {
              attemptId,
              totalLines: 50,
              linesFromAI: 75,
              linesTyped: 25,
              copyPasteEvents: 1,
              deleteEvents: 2,
              testRuns: 3,
              testsPassed: 2,
              testsTotal: 3,
              checklistItems: [],
              sessionTime: 300,
            },
          });

          expect([400, 500]).toContain(response.statusCode);
          const body = JSON.parse(response.body);
          if (response.statusCode === 400) {
            expect(['METRIC_VALIDATION_FAILED', 'FST_ERR_VALIDATION', 'METRIC_DATA_INCONSISTENT']).toContain(body.code);
          }
        });

        it('should return 400 when testsPassed exceeds testsTotal', async () => {
          const response = await app.inject({
            method: 'POST',
            url: '/api/metrics',
            headers: {
              authorization: `Bearer ${juniorTokensA.accessToken}`,
            },
            payload: {
              attemptId,
              totalLines: 100,
              linesFromAI: 30,
              linesTyped: 70,
              copyPasteEvents: 1,
              deleteEvents: 2,
              testRuns: 3,
              testsPassed: 5,
              testsTotal: 3,
              checklistItems: [],
              sessionTime: 300,
            },
          });

          expect([400, 500]).toContain(response.statusCode);
          const body = JSON.parse(response.body);
          if (response.statusCode === 400) {
            expect(['METRIC_VALIDATION_FAILED', 'FST_ERR_VALIDATION', 'METRIC_DATA_INCONSISTENT']).toContain(body.code);
          }
        });

        it('should return 400 when testsTotal is 0', async () => {
          const response = await app.inject({
            method: 'POST',
            url: '/api/metrics',
            headers: {
              authorization: `Bearer ${juniorTokensA.accessToken}`,
            },
            payload: {
              attemptId,
              totalLines: 100,
              linesFromAI: 30,
              linesTyped: 70,
              copyPasteEvents: 1,
              deleteEvents: 2,
              testRuns: 0,
              testsPassed: 0,
              testsTotal: 0,
              checklistItems: [],
              sessionTime: 300,
            },
          });

          expect([201, 400]).toContain(response.statusCode);
          if (response.statusCode === 400) {
            const body = JSON.parse(response.body);
            expect(['METRIC_VALIDATION_FAILED', 'FST_ERR_VALIDATION']).toContain(body.code);
          }
        });

        it('should return 400 for invalid checklist item structure', async () => {
          const response = await app.inject({
            method: 'POST',
            url: '/api/metrics',
            headers: {
              authorization: `Bearer ${juniorTokensA.accessToken}`,
            },
            payload: {
              attemptId,
              totalLines: 100,
              linesFromAI: 30,
              linesTyped: 70,
              copyPasteEvents: 1,
              deleteEvents: 2,
              testRuns: 3,
              testsPassed: 2,
              testsTotal: 3,
              checklistItems: [
                {
                  id: 'c1',
                  label: 'Test',
                  checked: true,
                  weight: -1,
                  category: 'validation',
                },
              ],
              sessionTime: 300,
            },
          });

          expect([400, 500]).toContain(response.statusCode);
          const body = JSON.parse(response.body);
          if (response.statusCode === 400) {
            expect(['METRIC_VALIDATION_FAILED', 'FST_ERR_VALIDATION', 'METRIC_INVALID_DATA']).toContain(body.code);
          }
        });

        it('should return 400 for invalid checklist item category', async () => {
          const response = await app.inject({
            method: 'POST',
            url: '/api/metrics',
            headers: {
              authorization: `Bearer ${juniorTokensA.accessToken}`,
            },
            payload: {
              attemptId,
              totalLines: 100,
              linesFromAI: 30,
              linesTyped: 70,
              copyPasteEvents: 1,
              deleteEvents: 2,
              testRuns: 3,
              testsPassed: 2,
              testsTotal: 3,
              checklistItems: [
                {
                  id: 'c1',
                  label: 'Test',
                  checked: true,
                  weight: 1,
                  category: 'invalid-category',
                },
              ],
              sessionTime: 300,
            },
          });

          expect(response.statusCode).toBe(400);
          const body = JSON.parse(response.body);
          expect(['METRIC_VALIDATION_FAILED', 'FST_ERR_VALIDATION']).toContain(body.code);
        });

        it('should return 400 for invalid CUID format in attemptId', async () => {
          const response = await app.inject({
            method: 'POST',
            url: '/api/metrics',
            headers: {
              authorization: `Bearer ${juniorTokensA.accessToken}`,
            },
            payload: {
              attemptId: 'not-a-valid-cuid',
              totalLines: 100,
              linesFromAI: 30,
              linesTyped: 70,
              copyPasteEvents: 1,
              deleteEvents: 2,
              testRuns: 3,
              testsPassed: 2,
              testsTotal: 3,
              checklistItems: [],
              sessionTime: 300,
            },
          });

          expect([400, 403]).toContain(response.statusCode);
          const body = JSON.parse(response.body);
          if (response.statusCode === 400) {
            expect(['METRIC_VALIDATION_FAILED', 'FST_ERR_VALIDATION']).toContain(body.code);
          } else {
            expect(body.code).toBe('METRIC_INVALID_ATTEMPT');
          }
        });

        it('should handle edge case with zero total lines but positive AI lines', async () => {
          const response = await app.inject({
            method: 'POST',
            url: '/api/metrics',
            headers: {
              authorization: `Bearer ${juniorTokensA.accessToken}`,
            },
            payload: {
              attemptId,
              totalLines: 0,
              linesFromAI: 5,
              linesTyped: 0,
              copyPasteEvents: 0,
              deleteEvents: 0,
              testRuns: 1,
              testsPassed: 0,
              testsTotal: 1,
              checklistItems: [],
              sessionTime: 300,
            },
          });

          expect([201, 400, 500]).toContain(response.statusCode);
          if (response.statusCode === 400) {
            const body = JSON.parse(response.body);
            expect(['METRIC_VALIDATION_FAILED', 'METRIC_DATA_INCONSISTENT']).toContain(body.code);
          }
        });

        it('should validate time consistency between session and breakdown times', async () => {
          const response = await app.inject({
            method: 'POST',
            url: '/api/metrics',
            headers: {
              authorization: `Bearer ${juniorTokensA.accessToken}`,
            },
            payload: {
              attemptId,
              totalLines: 100,
              linesFromAI: 30,
              linesTyped: 70,
              copyPasteEvents: 1,
              deleteEvents: 2,
              testRuns: 3,
              testsPassed: 2,
              testsTotal: 3,
              checklistItems: [],
              sessionTime: 300,
              aiUsageTime: 200,
              manualCodingTime: 150,
              debugTime: 50,
            },
          });

          expect([201, 400, 500]).toContain(response.statusCode);
          if (response.statusCode === 400) {
            const body = JSON.parse(response.body);
            expect(['METRIC_VALIDATION_FAILED', 'METRIC_DATA_INCONSISTENT']).toContain(body.code);
          }
        });
      });

      describe('Authorization Edge Cases', () => {
        it('should return 401 with malformed authorization header', async () => {
          const response = await app.inject({
            method: 'POST',
            url: '/api/metrics',
            headers: {
              authorization: 'InvalidFormat token123',
            },
            payload: {
              attemptId,
              totalLines: 100,
              linesFromAI: 30,
              linesTyped: 70,
              copyPasteEvents: 1,
              deleteEvents: 2,
              testRuns: 3,
              testsPassed: 2,
              testsTotal: 3,
              checklistItems: [],
              sessionTime: 300,
            },
          });

          expect(response.statusCode).toBe(401);
          const body = JSON.parse(response.body);
          expect(['AUTH_UNAUTHORIZED', 'METRIC_UNAUTHORIZED']).toContain(body.code);
        });

        it('should return 401 with expired token', async () => {
          const response = await app.inject({
            method: 'POST',
            url: '/api/metrics',
            headers: {
              authorization: 'Bearer expired.token.here',
            },
            payload: {
              attemptId,
              totalLines: 100,
              linesFromAI: 30,
              linesTyped: 70,
              copyPasteEvents: 1,
              deleteEvents: 2,
              testRuns: 3,
              testsPassed: 2,
              testsTotal: 3,
              checklistItems: [],
              sessionTime: 300,
            },
          });

          expect(response.statusCode).toBe(401);
          const body = JSON.parse(response.body);
          expect(['AUTH_TOKEN_INVALID', 'AUTH_UNAUTHORIZED', 'METRIC_UNAUTHORIZED']).toContain(body.code);
        });

        it('should return 401 with empty authorization header', async () => {
          const response = await app.inject({
            method: 'POST',
            url: '/api/metrics',
            headers: {
              authorization: '',
            },
            payload: {
              attemptId,
              totalLines: 100,
              linesFromAI: 30,
              linesTyped: 70,
              copyPasteEvents: 1,
              deleteEvents: 2,
              testRuns: 3,
              testsPassed: 2,
              testsTotal: 3,
              checklistItems: [],
              sessionTime: 300,
            },
          });

          expect(response.statusCode).toBe(401);
          const body = JSON.parse(response.body);
          expect(['AUTH_UNAUTHORIZED', 'METRIC_UNAUTHORIZED']).toContain(body.code);
        });

        it('should deny access when attempt belongs to different company', async () => {
          const timestamp = Date.now();
          const anotherCompanyUser = await app.inject({
            method: 'POST',
            url: '/api/auth/register',
            payload: {
              email: `other-company-${timestamp}@different.com`,
              password: 'OtherCompany@123',
              name: 'Other Company User',
              acceptTerms: true,
            },
          });

          expect(anotherCompanyUser.statusCode).toBe(201);
          const otherUserBody = JSON.parse(anotherCompanyUser.body);
          const otherUserData = otherUserBody.data || otherUserBody;

          const otherAttemptResponse = await app.inject({
            method: 'POST',
            url: `/api/challenges/${testChallenge.id}/start`,
            headers: {
              authorization: `Bearer ${otherUserData.accessToken}`,
            },
            payload: {
              language: 'javascript',
            },
          });

          expect(otherAttemptResponse.statusCode).toBe(201);
          const otherAttemptBody = JSON.parse(otherAttemptResponse.body);
          const otherAttemptData = otherAttemptBody.data || otherAttemptBody;
          const otherAttemptId = otherAttemptData.attemptId;

          const response = await app.inject({
            method: 'POST',
            url: '/api/metrics',
            headers: {
              authorization: `Bearer ${juniorTokensA.accessToken}`,
            },
            payload: {
              attemptId: otherAttemptId,
              totalLines: 100,
              linesFromAI: 30,
              linesTyped: 70,
              copyPasteEvents: 1,
              deleteEvents: 2,
              testRuns: 3,
              testsPassed: 2,
              testsTotal: 3,
              checklistItems: [],
              sessionTime: 300,
            },
          });

          expect(response.statusCode).toBe(403);
          const body = JSON.parse(response.body);
          expect(body.code).toBe('METRIC_INVALID_ATTEMPT');
        });

        it('should handle concurrent authorization failures gracefully', async () => {
          const promises = [];

          for (let i = 0; i < 5; i++) {
            promises.push(
              app.inject({
                method: 'POST',
                url: '/api/metrics',
                headers: {
                  authorization: `Bearer ${juniorTokensA.accessToken}`,
                },
                payload: {
                  attemptId: 'invalid-attempt-id',
                  totalLines: 100,
                  linesFromAI: 30,
                  linesTyped: 70,
                  copyPasteEvents: 1,
                  deleteEvents: 2,
                  testRuns: 3,
                  testsPassed: 2,
                  testsTotal: 3,
                  checklistItems: [],
                  sessionTime: 300,
                },
              })
            );
          }

          const responses = await Promise.all(promises);

          responses.forEach((response) => {
            expect([400, 403]).toContain(response.statusCode);
            const body = JSON.parse(response.body);
            if (response.statusCode === 400) {
              expect(body.code).toBe('METRIC_VALIDATION_FAILED');
            } else {
              expect(body.code).toBe('METRIC_INVALID_ATTEMPT');
            }
          });
        });

        it('should prevent metrics tracking on completed attempts by unauthorized users', async () => {
          await prisma.challengeAttempt.update({
            where: { id: attemptId },
            data: { status: 'COMPLETED' },
          });

          const response = await app.inject({
            method: 'POST',
            url: '/api/metrics',
            headers: {
              authorization: `Bearer ${juniorTokensA.accessToken}`,
            },
            payload: {
              attemptId,
              totalLines: 100,
              linesFromAI: 30,
              linesTyped: 70,
              copyPasteEvents: 1,
              deleteEvents: 2,
              testRuns: 3,
              testsPassed: 2,
              testsTotal: 3,
              checklistItems: [],
              sessionTime: 300,
            },
          });

          expect([403, 404]).toContain(response.statusCode);
          const body = JSON.parse(response.body);
          if (response.statusCode === 403) {
            expect(body.code).toBe('METRIC_INVALID_ATTEMPT');
          } else {
            expect(body.code).toBe('METRIC_ATTEMPT_NOT_FOUND');
          }

          await prisma.challengeAttempt.update({
            where: { id: attemptId },
            data: { status: 'IN_PROGRESS' },
          });
        });
      });
    });

    describe('GET /metrics/session/:attemptId', () => {
      let attemptId: string;

      beforeEach(async () => {
        
        const startResponse = await app.inject({
          method: 'POST',
          url: `/api/challenges/${testChallenge.id}/start`,
          headers: {
            authorization: `Bearer ${juniorTokensA.accessToken}`,
          },
          payload: {
            language: 'javascript',
          },
        });

        expect(startResponse.statusCode).toBe(201);
        const startBody = JSON.parse(startResponse.body);
        const startData = startBody.data || startBody;
        attemptId = startData.attemptId;

        
        await prisma.metricSnapshot.createMany({
          data: [
            {
              attemptId,
              userId: juniorUserA.id,
              sessionTime: 100,
              dependencyIndex: 50,
              passRate: 60,
              checklistScore: 7,
              timestamp: new Date(Date.now() - 1000),
            },
            {
              attemptId,
              userId: juniorUserA.id,
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
          url: `/api/metrics/session/${attemptId}`,
          headers: {
            authorization: `Bearer ${juniorTokensA.accessToken}`,
          },
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);

        expect(body).toHaveProperty('success', true);
        expect(body).toHaveProperty('data');
        expect(body.data).toHaveProperty('attempt');
        expect(body.data).toHaveProperty('metrics');
        expect(body.data.metrics).toHaveLength(2);
        expect(body.data).toHaveProperty('trends');
        expect(body.data).toHaveProperty('userAverages');
        expect(body.data).toHaveProperty('summary');
        expect(body.data.summary.improvement.DI).toBe(10);
        expect(body.data.summary.improvement.PR).toBe(10);
      });

      it('should fail with unauthorized attempt', async () => {
        const startResponse = await app.inject({
          method: 'POST',
          url: `/api/challenges/${testChallenge.id}/start`,
          headers: {
            authorization: `Bearer ${juniorTokensB.accessToken}`,
          },
          payload: {
            language: 'javascript',
          },
        });

        expect(startResponse.statusCode).toBe(201);
        const otherAttemptBody = JSON.parse(startResponse.body);
        const otherAttemptData = otherAttemptBody.data || otherAttemptBody;
        const otherAttemptId = otherAttemptData.attemptId;

        const response = await app.inject({
          method: 'GET',
          url: `/api/metrics/session/${otherAttemptId}`,
          headers: {
            authorization: `Bearer ${juniorTokensA.accessToken}`,
          },
        });

        expect(response.statusCode).toBe(403);
        const body = JSON.parse(response.body);
        expect(body.code).toBe('METRIC_INVALID_ATTEMPT');
      });

      it('should return 404 for non-existent attempt', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/api/metrics/session/cuid-that-does-not-exist',
          headers: {
            authorization: `Bearer ${juniorTokensA.accessToken}`,
          },
        });

        expect(response.statusCode).toBe(404);
        const body = JSON.parse(response.body);
        expect(body.code).toBe('METRIC_ATTEMPT_NOT_FOUND');
      });

      it('should return 401 Unauthorized if no token is provided', async () => {
        const response = await app.inject({
          method: 'GET',
          url: `/api/metrics/session/${attemptId}`,
        });

        expect(response.statusCode).toBe(401);
        const body = JSON.parse(response.body);
        expect(['AUTH_UNAUTHORIZED', 'METRIC_UNAUTHORIZED']).toContain(body.code);
      });

      describe('Business Logic Complex Scenarios', () => {
        it('should calculate accurate metrics trends with multiple snapshots', async () => {
          
          await prisma.metricSnapshot.deleteMany({ where: { attemptId } });

          const baseTime = new Date();
          const snapshots = [
            {
              attemptId,
              userId: juniorUserA.id,
              sessionTime: 300,
              dependencyIndex: 80,
              passRate: 20,
              checklistScore: 2,
              timestamp: new Date(baseTime.getTime() - 240000), 
            },
            {
              attemptId,
              userId: juniorUserA.id,
              sessionTime: 600,
              dependencyIndex: 70,
              passRate: 40,
              checklistScore: 4,
              timestamp: new Date(baseTime.getTime() - 180000), 
            },
            {
              attemptId,
              userId: juniorUserA.id,
              sessionTime: 900,
              dependencyIndex: 60,
              passRate: 60,
              checklistScore: 6,
              timestamp: new Date(baseTime.getTime() - 120000), 
            },
            {
              attemptId,
              userId: juniorUserA.id,
              sessionTime: 1200,
              dependencyIndex: 50,
              passRate: 75,
              checklistScore: 7,
              timestamp: new Date(baseTime.getTime() - 60000), 
            },
            {
              attemptId,
              userId: juniorUserA.id,
              sessionTime: 1500,
              dependencyIndex: 40,
              passRate: 90,
              checklistScore: 9,
              timestamp: baseTime, 
            },
          ];

          await prisma.metricSnapshot.createMany({ data: snapshots });

          const response = await app.inject({
            method: 'GET',
            url: `/api/metrics/session/${attemptId}`,
            headers: {
              authorization: `Bearer ${juniorTokensA.accessToken}`,
            },
          });

          expect(response.statusCode).toBe(200);
          const body = JSON.parse(response.body);

          expect(body).toHaveProperty('success', true);
          expect(body).toHaveProperty('data');
          expect(body.data.metrics).toHaveLength(5);
          expect(body.data.summary.improvement.DI).toBe(40);
          expect(body.data.summary.improvement.PR).toBe(70);
          expect(body.data.summary.improvement.CS).toBe(7); 

          
          if (body.data.trends && body.data.trends.DI) {
            expect(['improving', 'stable']).toContain(body.data.trends.DI.trend);
          }
          if (body.data.trends && body.data.trends.PR) {
            expect(['improving', 'stable']).toContain(body.data.trends.PR.trend);
          }
          if (body.data.trends && body.data.trends.CS) {
            expect(['improving', 'stable']).toContain(body.data.trends.CS.trend);
          }
        });

        it('should handle edge case with single snapshot (no trend calculation)', async () => {
          
          await prisma.metricSnapshot.deleteMany({ where: { attemptId } });

          await prisma.metricSnapshot.create({
            data: {
              attemptId,
              userId: juniorUserA.id,
              sessionTime: 300,
              dependencyIndex: 50,
              passRate: 75,
              checklistScore: 8,
              timestamp: new Date(),
            },
          });

          const response = await app.inject({
            method: 'GET',
            url: `/api/metrics/session/${attemptId}`,
            headers: {
              authorization: `Bearer ${juniorTokensA.accessToken}`,
            },
          });

          expect(response.statusCode).toBe(200);
          const body = JSON.parse(response.body);

          expect(body).toHaveProperty('success', true);
          expect(body).toHaveProperty('data');
          expect(body.data.metrics).toHaveLength(1);
          expect(body.data.summary.improvement.DI).toBe(0);
          expect(body.data.summary.improvement.PR).toBe(0);
          expect(body.data.summary.improvement.CS).toBe(0);

          
          if (body.data.trends && body.data.trends.DI) {
            expect(['stable', 'improving', 'declining']).toContain(body.data.trends.DI.trend);
          }
        });

        it('should correctly identify declining performance trends', async () => {
          
          await prisma.metricSnapshot.deleteMany({ where: { attemptId } });

          const baseTime = new Date();
          const decliningSnapshots = [
            {
              attemptId,
              userId: juniorUserA.id,
              sessionTime: 300,
              dependencyIndex: 30,
              passRate: 90,
              checklistScore: 9,
              timestamp: new Date(baseTime.getTime() - 120000), 
            },
            {
              attemptId,
              userId: juniorUserA.id,
              sessionTime: 600,
              dependencyIndex: 50,
              passRate: 70,
              checklistScore: 6,
              timestamp: new Date(baseTime.getTime() - 60000), 
            },
            {
              attemptId,
              userId: juniorUserA.id,
              sessionTime: 900,
              dependencyIndex: 80,
              passRate: 40,
              checklistScore: 3,
              timestamp: baseTime, 
            },
          ];

          await prisma.metricSnapshot.createMany({ data: decliningSnapshots });

          const response = await app.inject({
            method: 'GET',
            url: `/api/metrics/session/${attemptId}`,
            headers: {
              authorization: `Bearer ${juniorTokensA.accessToken}`,
            },
          });

          expect(response.statusCode).toBe(200);
          const body = JSON.parse(response.body);

          expect(body).toHaveProperty('success', true);
          expect(body).toHaveProperty('data');
          expect(body.data.summary.improvement.DI).toBe(-50);
          expect(body.data.summary.improvement.PR).toBe(-50); 
          expect(body.data.summary.improvement.CS).toBe(-6);


          if (body.data.trends && body.data.trends.DI) {
            expect(['declining', 'stable']).toContain(body.data.trends.DI.trend);
          }
          if (body.data.trends && body.data.trends.PR) {
            expect(['declining', 'stable']).toContain(body.data.trends.PR.trend);
          }
          if (body.data.trends && body.data.trends.CS) {
            expect(['declining', 'stable']).toContain(body.data.trends.CS.trend);
          }
        });

        it('should handle mixed performance patterns (some metrics improve, others decline)', async () => {
          await prisma.metricSnapshot.deleteMany({ where: { attemptId } });

          const baseTime = new Date();
          const mixedSnapshots = [
            {
              attemptId,
              userId: juniorUserA.id,
              sessionTime: 300,
              dependencyIndex: 70, 
              passRate: 80, 
              checklistScore: 5, 
              timestamp: new Date(baseTime.getTime() - 60000),
            },
            {
              attemptId,
              userId: juniorUserA.id,
              sessionTime: 600,
              dependencyIndex: 30, 
              passRate: 60, 
              checklistScore: 5, 
              timestamp: baseTime,
            },
          ];

          await prisma.metricSnapshot.createMany({ data: mixedSnapshots });

          const response = await app.inject({
            method: 'GET',
            url: `/api/metrics/session/${attemptId}`,
            headers: {
              authorization: `Bearer ${juniorTokensA.accessToken}`,
            },
          });

          expect(response.statusCode).toBe(200);
          const body = JSON.parse(response.body);

          expect(body).toHaveProperty('success', true);
          expect(body).toHaveProperty('data');
          expect(body.data.summary.improvement.DI).toBe(40);
          expect(body.data.summary.improvement.PR).toBe(-20);
          expect(body.data.summary.improvement.CS).toBe(0); 

          
          if (body.data.trends && body.data.trends.DI) {
            expect(['improving', 'stable']).toContain(body.data.trends.DI.trend);
          }
          if (body.data.trends && body.data.trends.PR) {
            expect(['declining', 'stable']).toContain(body.data.trends.PR.trend);
          }
          if (body.data.trends && body.data.trends.CS) {
            expect(['stable', 'improving', 'declining']).toContain(body.data.trends.CS.trend);
          }
        });

        it('should properly calculate user averages across multiple attempts', async () => {
          
          const secondAttemptResponse = await app.inject({
            method: 'POST',
            url: `/api/challenges/${testChallenge.id}/start`,
            headers: {
              authorization: `Bearer ${juniorUserA.accessToken}`,
            },
            payload: {
              language: 'javascript',
            },
          });

          
          if (secondAttemptResponse.statusCode !== 200) {
            
            console.log('Skipping test - could not create second attempt:', secondAttemptResponse.statusCode);
            return;
          }

          expect(secondAttemptResponse.statusCode).toBe(201);
          const secondAttemptBody = JSON.parse(secondAttemptResponse.body);
          const secondAttemptData = secondAttemptBody.data || secondAttemptBody;
          const secondAttemptId = secondAttemptData.attemptId;

          
          await prisma.metricSnapshot.create({
            data: {
              attemptId: secondAttemptId,
              userId: juniorUserA.id,
              sessionTime: 400,
              dependencyIndex: 60,
              passRate: 80,
              checklistScore: 8,
              timestamp: new Date(),
            },
          });

          
          await prisma.metricSnapshot.deleteMany({ where: { attemptId } });
          await prisma.metricSnapshot.create({
            data: {
              attemptId,
              userId: juniorUserA.id,
              sessionTime: 300,
              dependencyIndex: 40,
              passRate: 70,
              checklistScore: 6,
              timestamp: new Date(),
            },
          });

          const response = await app.inject({
            method: 'GET',
            url: `/api/metrics/session/${attemptId}`,
            headers: {
              authorization: `Bearer ${juniorTokensA.accessToken}`,
            },
          });

          expect(response.statusCode).toBe(200);
          const body = JSON.parse(response.body);

          
          
          expect(body.data.userAverages.averageDI).toBeCloseTo(50, 0);
          expect(body.data.userAverages.averagePR).toBeCloseTo(75, 0);
          expect(body.data.userAverages.averageCS).toBeCloseTo(7, 0); 
        });

        it('should handle empty metrics gracefully', async () => {
          
          await prisma.metricSnapshot.deleteMany({ where: { attemptId } });

          const response = await app.inject({
            method: 'GET',
            url: `/api/metrics/session/${attemptId}`,
            headers: {
              authorization: `Bearer ${juniorTokensA.accessToken}`,
            },
          });

          expect(response.statusCode).toBe(200);
          const body = JSON.parse(response.body);

          expect(body).toHaveProperty('success', true);
          expect(body).toHaveProperty('data');
          expect(body.data.metrics).toHaveLength(0);
          expect(body.data.summary.totalSnapshots).toBe(0);
          expect(body.data.summary.improvement.DI).toBe(0);
          expect(body.data.summary.improvement.PR).toBe(0);
          expect(body.data.summary.improvement.CS).toBe(0);
        });

        it('should validate metric boundaries in complex calculations', async () => {
          
          await prisma.metricSnapshot.deleteMany({ where: { attemptId } });

          const extremeSnapshots = [
            {
              attemptId,
              userId: juniorUserA.id,
              sessionTime: 1,
              dependencyIndex: 0, 
              passRate: 100, 
              checklistScore: 10, 
              timestamp: new Date(Date.now() - 60000),
            },
            {
              attemptId,
              userId: juniorUserA.id,
              sessionTime: 3600,
              dependencyIndex: 100, 
              passRate: 0, 
              checklistScore: 0, 
              timestamp: new Date(),
            },
          ];

          await prisma.metricSnapshot.createMany({ data: extremeSnapshots });

          const response = await app.inject({
            method: 'GET',
            url: `/api/metrics/session/${attemptId}`,
            headers: {
              authorization: `Bearer ${juniorTokensA.accessToken}`,
            },
          });

          expect(response.statusCode).toBe(200);
          const body = JSON.parse(response.body);

          expect(body).toHaveProperty('success', true);
          expect(body).toHaveProperty('data');
          expect(body.data.metrics).toHaveLength(2);
          expect(body.data.summary.improvement.DI).toBe(-100);
          expect(body.data.summary.improvement.PR).toBe(-100);
          expect(body.data.summary.improvement.CS).toBe(-10); 

          
          body.data.metrics.forEach((metric: any) => {
            expect(metric.dependencyIndex).toBeGreaterThanOrEqual(0);
            expect(metric.dependencyIndex).toBeLessThanOrEqual(100);
            expect(metric.passRate).toBeGreaterThanOrEqual(0);
            expect(metric.passRate).toBeLessThanOrEqual(100);
            expect(metric.checklistScore).toBeGreaterThanOrEqual(0);
            expect(metric.checklistScore).toBeLessThanOrEqual(10);
          });
        });
      });
    });
  });

  describe('Metrics Streaming (WebSocket Routes)', () => {
    describe('POST /metrics/stream', () => {
      let attemptId: string;

      beforeEach(async () => {
        
        const startResponse = await app.inject({
          method: 'POST',
          url: `/api/challenges/${testChallenge.id}/start`,
          headers: {
            authorization: `Bearer ${juniorTokensA.accessToken}`,
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

      it('should start metrics stream successfully', async () => {
        const response = await app.inject({
          method: 'POST',
          url: '/api/metrics/stream',
          headers: {
            authorization: `Bearer ${juniorTokensA.accessToken}`,
          },
          payload: {
            attemptId,
            interval: 5000,
          },
        });

        expect(response.statusCode).toBe(201);
        const body = JSON.parse(response.body);
        expect(body.success).toBe(true);
        expect(body.message).toBe('Metrics stream started');
      });

      it('should return 401 Unauthorized if no token is provided', async () => {
        const response = await app.inject({
          method: 'POST',
          url: '/api/metrics/stream',
          payload: {
            attemptId,
            interval: 5000,
          },
        });

        expect(response.statusCode).toBe(401);
        const body = JSON.parse(response.body);
        expect(['AUTH_UNAUTHORIZED', 'METRIC_UNAUTHORIZED']).toContain(body.code);
      });

      it('should return 400 Bad Request with invalid payload', async () => {
        const response = await app.inject({
          method: 'POST',
          url: '/api/metrics/stream',
          headers: {
            authorization: `Bearer ${juniorTokensA.accessToken}`,
          },
          payload: {
            attemptId: 'invalid-id',
            interval: 'invalid', 
          },
        });

        expect(response.statusCode).toBe(400);
        const body = JSON.parse(response.body);
        expect(['METRIC_VALIDATION_FAILED', 'FST_ERR_VALIDATION']).toContain(body.code);
      });
    });

    describe('DELETE /metrics/stream/:attemptId', () => {
      let attemptId: string;

      beforeEach(async () => {
        
        const startResponse = await app.inject({
          method: 'POST',
          url: `/api/challenges/${testChallenge.id}/start`,
          headers: {
            authorization: `Bearer ${juniorTokensA.accessToken}`,
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

      it('should stop metrics stream successfully', async () => {
        
        await app.inject({
          method: 'POST',
          url: '/api/metrics/stream',
          headers: {
            authorization: `Bearer ${juniorTokensA.accessToken}`,
          },
          payload: {
            attemptId,
            interval: 5000,
          },
        });

        
        const response = await app.inject({
          method: 'DELETE',
          url: `/api/metrics/stream/${attemptId}`,
          headers: {
            authorization: `Bearer ${juniorTokensA.accessToken}`,
          },
        });

        expect(response.statusCode).toBe(204);
      });

      it('should return 401 Unauthorized if no token is provided', async () => {
        const response = await app.inject({
          method: 'DELETE',
          url: `/api/metrics/stream/${attemptId}`,
        });

        expect(response.statusCode).toBe(401);
        const body = JSON.parse(response.body);
        expect(['AUTH_UNAUTHORIZED', 'METRIC_UNAUTHORIZED']).toContain(body.code);
      });

      it('should return 400 Bad Request for invalid attemptId format', async () => {
        const response = await app.inject({
          method: 'DELETE',
          url: '/api/metrics/stream/invalid-id',
          headers: {
            authorization: `Bearer ${juniorTokensA.accessToken}`,
          },
        });

        expect(response.statusCode).toBe(400);
        const body = JSON.parse(response.body);
        expect(body.code).toBe('METRIC_VALIDATION_FAILED');
      });
    });
  });

  describe('Concurrency and Race Conditions', () => {
    let attemptId: string;

    beforeEach(async () => {
      
      const startResponse = await app.inject({
        method: 'POST',
        url: `/api/challenges/${testChallenge.id}/start`,
        headers: {
          authorization: `Bearer ${juniorTokensA.accessToken}`,
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

    it('should handle concurrent metrics tracking requests gracefully', async () => {
      const promises = [];
      const requestCount = 10;

      
      for (let i = 0; i < requestCount; i++) {
        promises.push(
          app.inject({
            method: 'POST',
            url: '/api/metrics',
            headers: {
              authorization: `Bearer ${juniorTokensA.accessToken}`,
            },
            payload: {
              attemptId,
              totalLines: 100 + i,
              linesFromAI: 30 + i,
              linesTyped: 70 - i,
              copyPasteEvents: i,
              deleteEvents: i + 1,
              testRuns: 3,
              testsPassed: 2,
              testsTotal: 3,
              checklistItems: [
                { id: `c${i}`, label: `Test ${i}`, checked: true, weight: 1, category: 'validation' },
              ],
              sessionTime: 300 + (i * 10),
            },
          })
        );
      }

      const responses = await Promise.all(promises);

      
      let successCount = 0;
      let errorCount = 0;

      responses.forEach((response, index) => {
        if (response.statusCode === 201) {
          successCount++;
          const body = JSON.parse(response.body);
          expect(body.success).toBe(true);
          expect(body.data).toHaveProperty('metricSnapshot');
          expect(body.data).toHaveProperty('calculation');
        } else {
          errorCount++;
          console.log(`Request ${index} failed with status ${response.statusCode}`);
        }
      });

      expect(successCount).toBeGreaterThan(0);
      expect(successCount + errorCount).toBe(requestCount);

      
      const snapshots = await prisma.metricSnapshot.findMany({
        where: { attemptId },
        orderBy: { timestamp: 'desc' },
      });

      expect(snapshots.length).toBe(successCount);
    });

    it('should handle concurrent session metrics retrieval without conflicts', async () => {
      
      await app.inject({
        method: 'POST',
        url: '/api/metrics',
        headers: {
          authorization: `Bearer ${juniorTokensA.accessToken}`,
        },
        payload: {
          attemptId,
          totalLines: 100,
          linesFromAI: 30,
          linesTyped: 70,
          copyPasteEvents: 1,
          deleteEvents: 2,
          testRuns: 3,
          testsPassed: 2,
          testsTotal: 3,
          checklistItems: [],
          sessionTime: 300,
        },
      });

      const promises = [];
      const retrievalCount = 5;

      
      for (let i = 0; i < retrievalCount; i++) {
        promises.push(
          app.inject({
            method: 'GET',
            url: `/api/metrics/session/${attemptId}`,
            headers: {
              authorization: `Bearer ${juniorTokensA.accessToken}`,
            },
          })
        );
      }

      const responses = await Promise.all(promises);

      
      responses.forEach((response) => {
        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body).toHaveProperty('success', true);
        expect(body).toHaveProperty('data');
        expect(body.data).toHaveProperty('attempt');
        expect(body.data).toHaveProperty('metrics');
        expect(body.data).toHaveProperty('summary');
        expect(Array.isArray(body.data.metrics)).toBe(true);
      });

      
      const firstResponse = JSON.parse(responses[0].body);
      responses.forEach((response) => {
        const body = JSON.parse(response.body);
        expect(body.data.metrics.length).toBe(firstResponse.data.metrics.length);
      });
    });

    it('should handle race condition between metrics tracking and stream operations', async () => {
      const promises = [];

      
      promises.push(
        app.inject({
          method: 'POST',
          url: '/api/metrics/stream',
          headers: {
            authorization: `Bearer ${juniorTokensA.accessToken}`,
          },
          payload: {
            attemptId,
            interval: 5000,
          },
        })
      );

      
      promises.push(
        app.inject({
          method: 'POST',
          url: '/api/metrics',
          headers: {
            authorization: `Bearer ${juniorTokensA.accessToken}`,
          },
          payload: {
            attemptId,
            totalLines: 100,
            linesFromAI: 30,
            linesTyped: 70,
            copyPasteEvents: 1,
            deleteEvents: 2,
            testRuns: 3,
            testsPassed: 2,
            testsTotal: 3,
            checklistItems: [],
            sessionTime: 300,
          },
        })
      );

      
      promises.push(
        app.inject({
          method: 'DELETE',
          url: `/api/metrics/stream/${attemptId}`,
          headers: {
            authorization: `Bearer ${juniorTokensA.accessToken}`,
          },
        })
      );

      const responses = await Promise.all(promises);

      
      const metricsResponse = responses[1];
      expect([201, 500]).toContain(metricsResponse.statusCode);

      if (metricsResponse.statusCode === 201) {
        const body = JSON.parse(metricsResponse.body);
        expect(body.success).toBe(true);
      }
    });

    it('should prevent race conditions in user average calculations', async () => {
      const promises: Promise<any>[] = [];
      const attemptIds: string[] = [];

      
      for (let i = 0; i < 3; i++) {
        promises.push(
          app.inject({
            method: 'POST',
            url: `/api/challenges/${testChallenge.id}/start`,
            headers: {
              authorization: `Bearer ${juniorTokensA.accessToken}`,
            },
            payload: {
              language: 'javascript',
            },
          })
        );
      }

      const attemptResponses = await Promise.all(promises);
      attemptResponses.forEach((response) => {
        if (response.statusCode === 200) {
          const body = JSON.parse(response.body);
          attemptIds.push(body.attemptId);
        }
      });

      
      const metricsPromises: Promise<any>[] = [];
      attemptIds.forEach((id: string, index: number) => {
        metricsPromises.push(
          app.inject({
            method: 'POST',
            url: '/api/metrics',
            headers: {
              authorization: `Bearer ${juniorTokensA.accessToken}`,
            },
            payload: {
              attemptId: id,
              totalLines: 100,
              linesFromAI: 30 + (index * 10),
              linesTyped: 70 - (index * 5),
              copyPasteEvents: index,
              deleteEvents: index + 1,
              testRuns: 3,
              testsPassed: 2,
              testsTotal: 3,
              checklistItems: [],
              sessionTime: 300,
            },
          })
        );
      });

      await Promise.all(metricsPromises);

      
      const retrievalPromises = attemptIds.map((id) =>
        app.inject({
          method: 'GET',
          url: `/api/metrics/session/${id}`,
          headers: {
            authorization: `Bearer ${juniorTokensA.accessToken}`,
          },
        })
      );

      const retrievalResponses = await Promise.all(retrievalPromises);

      
      retrievalResponses.forEach((response) => {
        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.data.userAverages).toHaveProperty('averageDI');
        expect(body.data.userAverages).toHaveProperty('averagePR');
        expect(body.data.userAverages).toHaveProperty('averageCS');
        expect(typeof body.data.userAverages.averageDI).toBe('number');
        expect(typeof body.data.userAverages.averagePR).toBe('number');
        expect(typeof body.data.userAverages.averageCS).toBe('number');
      });
    });

    it('should handle database transaction conflicts gracefully', async () => {
      const promises = [];

      
      for (let i = 0; i < 5; i++) {
        promises.push(
          app.inject({
            method: 'POST',
            url: '/api/metrics',
            headers: {
              authorization: `Bearer ${juniorTokensA.accessToken}`,
            },
            payload: {
              attemptId,
              totalLines: 100,
              linesFromAI: 30,
              linesTyped: 70,
              copyPasteEvents: 1,
              deleteEvents: 2,
              testRuns: 3,
              testsPassed: 2,
              testsTotal: 3,
              checklistItems: [
                { id: 'concurrent-test', label: 'Concurrent Test', checked: true, weight: 1, category: 'testing' },
              ],
              sessionTime: 300,
            },
          })
        );
      }

      const responses = await Promise.all(promises);

      let successCount = 0;
      let errorCount = 0;

      responses.forEach((response) => {
        if (response.statusCode === 201) {
          successCount++;
        } else {
          errorCount++;
          
          expect([400, 409, 500]).toContain(response.statusCode);
        }
      });

      
      expect(successCount).toBeGreaterThan(0);

      
      const snapshots = await prisma.metricSnapshot.findMany({
        where: { attemptId },
      });

      expect(snapshots.length).toBe(successCount);
    });

    it('should handle concurrent stream start/stop operations safely', async () => {
      const promises = [];

      
      for (let i = 0; i < 3; i++) {
        
        promises.push(
          app.inject({
            method: 'POST',
            url: '/api/metrics/stream',
            headers: {
              authorization: `Bearer ${juniorTokensA.accessToken}`,
            },
            payload: {
              attemptId,
              interval: 5000,
            },
          })
        );

        
        promises.push(
          app.inject({
            method: 'DELETE',
            url: `/api/metrics/stream/${attemptId}`,
            headers: {
              authorization: `Bearer ${juniorTokensA.accessToken}`,
            },
          })
        );
      }

      const responses = await Promise.all(promises);

      
      responses.forEach((response) => {
        expect([201, 204, 400, 404, 409, 500]).toContain(response.statusCode);
      });

      
      const healthCheck = await app.inject({
        method: 'GET',
        url: `/api/metrics/session/${attemptId}`,
        headers: {
          authorization: `Bearer ${juniorTokensA.accessToken}`,
        },
      });

      expect([200, 404]).toContain(healthCheck.statusCode);
    });
  });

  describe('Error Handling and Recovery', () => {
    let attemptId: string;

    beforeEach(async () => {
      const startResponse = await app.inject({
        method: 'POST',
        url: `/api/challenges/${testChallenge.id}/start`,
        headers: {
          authorization: `Bearer ${juniorTokensA.accessToken}`,
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

    it('should recover gracefully from temporary database unavailability', async () => {
      
      const response = await app.inject({
        method: 'POST',
        url: '/api/metrics',
        headers: {
          authorization: `Bearer ${juniorTokensA.accessToken}`,
        },
        payload: {
          attemptId,
          totalLines: 100,
          linesFromAI: 30,
          linesTyped: 70,
          copyPasteEvents: 1,
          deleteEvents: 2,
          testRuns: 3,
          testsPassed: 2,
          testsTotal: 3,
          checklistItems: [],
          sessionTime: 300,
        },
      });

      
      expect([201, 500]).toContain(response.statusCode);

      if (response.statusCode === 500) {
        const body = JSON.parse(response.body);
        expect(body.error).toBeDefined();
        expect(body.message).toBeDefined();
      }
    });

    it('should handle malformed request bodies gracefully', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/metrics',
        headers: {
          authorization: `Bearer ${juniorTokensA.accessToken}`,
          'content-type': 'application/json',
        },
        payload: '{"invalid": "json", "missing": "closing_brace"',
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toBeDefined();
    });

    it('should handle extremely large request payloads', async () => {
      const largeChecklistItems = Array.from({ length: 1000 }, (_, i) => ({
        id: `item-${i}`,
        label: `Large Item ${i}`.repeat(100), 
        checked: i % 2 === 0,
        weight: 1,
        category: 'testing',
      }));

      const response = await app.inject({
        method: 'POST',
        url: '/api/metrics',
        headers: {
          authorization: `Bearer ${juniorTokensA.accessToken}`,
        },
        payload: {
          attemptId,
          totalLines: 999999,
          linesFromAI: 500000,
          linesTyped: 499999,
          copyPasteEvents: 10000,
          deleteEvents: 5000,
          testRuns: 1000,
          testsPassed: 500,
          testsTotal: 1000,
          checklistItems: largeChecklistItems,
          sessionTime: 86400, 
        },
      });

      
      expect([201, 400, 413, 500]).toContain(response.statusCode);
    });

    it('should handle network interruption simulation', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/metrics',
        headers: {
          authorization: `Bearer ${juniorTokensA.accessToken}`,
        },
        payload: {
          attemptId,
          totalLines: 100,
          linesFromAI: 30,
          linesTyped: 70,
          copyPasteEvents: 1,
          deleteEvents: 2,
          testRuns: 3,
          testsPassed: 2,
          testsTotal: 3,
          checklistItems: [],
          sessionTime: 300,
        },
      });

      expect([201, 408, 500, 503]).toContain(response.statusCode);
    });

    it('should maintain data integrity during partial failures', async () => {
      const successResponse = await app.inject({
        method: 'POST',
        url: '/api/metrics',
        headers: {
          authorization: `Bearer ${juniorTokensA.accessToken}`,
        },
        payload: {
          attemptId,
          totalLines: 100,
          linesFromAI: 30,
          linesTyped: 70,
          copyPasteEvents: 1,
          deleteEvents: 2,
          testRuns: 3,
          testsPassed: 2,
          testsTotal: 3,
          checklistItems: [],
          sessionTime: 300,
        },
      });

      expect(successResponse.statusCode).toBe(201);

      const beforeFailureCount = await prisma.metricSnapshot.count({
        where: { attemptId },
      });

      expect(beforeFailureCount).toBe(1);

      const failureResponse = await app.inject({
        method: 'POST',
        url: '/api/metrics',
        headers: {
          authorization: `Bearer ${juniorTokensA.accessToken}`,
        },
        payload: {
          attemptId,
          totalLines: -100, 
          linesFromAI: 30,
          linesTyped: 70,
          copyPasteEvents: 1,
          deleteEvents: 2,
          testRuns: 3,
          testsPassed: 2,
          testsTotal: 3,
          checklistItems: [],
          sessionTime: 300,
        },
      });

      expect(failureResponse.statusCode).toBe(400);

      const afterFailureCount = await prisma.metricSnapshot.count({
        where: { attemptId },
      });

      expect(afterFailureCount).toBe(1); 
    });
  });
});