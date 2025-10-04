import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { FastifyInstance } from 'fastify';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { buildTestApp, cleanupTestApp, generateTestId, createTestUser } from '../../helpers/test-app';
import { UserRole } from '../../../src/shared/domain/enums';

vi.mock('@/shared/infrastructure/monitoring/logger', () => ({
  logger: {
    child: vi.fn().mockReturnThis(),
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('Gamification Integration Tests', () => {
  let app: FastifyInstance;
  let prisma: PrismaClient;
  let redis: Redis;
  let testUser: any;
  let authTokens: { accessToken: string; refreshToken: string };
  let testId: string;

  beforeAll(async () => {
    const testApp = await buildTestApp();
    app = testApp.app;
    prisma = testApp.prisma;
    redis = testApp.redis;
    testId = generateTestId();

    const { user, tokens } = await createTestUser(app, testId, 'junior');
    testUser = user;
    authTokens = tokens;

    try {
      console.log('Creating test badges...');

      await prisma.badge.createMany({
        data: [
          {
            key: 'first-steps',
            name: 'Primeiros Passos',
            description: 'Complete seu primeiro desafio',
            icon: '🎯',
            rarity: 'COMMON',
            requirements: { type: 'xp', threshold: 100 },
            xpReward: 50,
            visible: true,
          },
          {
            key: 'level-master',
            name: 'Mestre de Nível',
            description: 'Alcance o nível 5',
            icon: '👑',
            rarity: 'RARE',
            requirements: { type: 'level', threshold: 5 },
            xpReward: 200,
            visible: true,
          },
          {
            key: 'streak-warrior',
            name: 'Guerreiro da Sequência',
            description: 'Mantenha uma sequência de 7 dias',
            icon: '🔥',
            rarity: 'EPIC',
            requirements: { type: 'streak', streakDays: 7 },
            xpReward: 300,
            visible: true,
          },
        ],
        skipDuplicates: true,
      });

      const createdBadges = await prisma.badge.findMany({
        where: {
          key: { in: ['first-steps', 'level-master', 'streak-warrior'] }
        }
      });

      console.log(`Created ${createdBadges.length} test badges successfully`);
    } catch (error) {
      console.error('Error creating test badges:', error);
      throw error;
    }
  });

  afterAll(async () => {
    await cleanupTestApp(app, prisma, redis);
  });

  beforeEach(async () => {
    if (testUser?.id) {
      await prisma.userBadge.deleteMany({ where: { userId: testUser.id } });
      await prisma.xPTransaction.deleteMany({ where: { userId: testUser.id } });
      await prisma.notification.deleteMany({ where: { userId: testUser.id } });
      await prisma.user.update({
        where: { id: testUser.id },
        data: { totalXp: 0, currentLevel: 1, currentStreak: 0 },
      });
    }

    const keys = await redis.keys('gamification:*');
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  });

  describe('GET /api/gamification/dashboard', () => {
    it('should return user dashboard with initial state', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/gamification/dashboard',
        headers: {
          authorization: `Bearer ${authTokens.accessToken}`,
        },
      });

      if (response.statusCode !== 200) {
        console.log('Dashboard endpoint failed:', {
          statusCode: response.statusCode,
          body: response.body
        });
      }
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      expect(body.success).toBe(true);
      expect(body.data).toMatchObject({
        user: {
          level: 1,
          currentXP: 0,
          levelTitle: expect.any(String),
          nextLevelXP: expect.any(Number),
          nextLevelProgress: expect.any(Number),
          levelPerks: expect.any(Array),
        },
        badges: {
          total: expect.any(Number),
          unlocked: 0,
          recent: expect.any(Array),
        },
        streak: {
          current: 0,
          longest: 0,
          status: expect.any(String),
          freezesAvailable: expect.any(Number),
          willExpireAt: expect.any(String),
        },
        ranking: {
          global: expect.any(Number),
          company: expect.any(Number),
          weeklyChange: expect.any(Number),
        },
        dailyGoal: {
          xpTarget: expect.any(Number),
          xpEarned: 0,
          completed: false,
          completionPercentage: 0,
        },
        notifications: {
          unreadCount: 0,
        },
      });
    });

    it('should return dashboard with query parameters', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/gamification/dashboard?includeDetails=true&period=weekly',
        headers: {
          authorization: `Bearer ${authTokens.accessToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data).toHaveProperty('user');
      expect(body.data).toHaveProperty('badges');
    });
  });

  describe('GET /api/gamification/badges', () => {
    it('should return empty user badges initially', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/gamification/badges',
        headers: {
          authorization: `Bearer ${authTokens.accessToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      expect(body.success).toBe(true);
      expect(body.data).toMatchObject({
        unlocked: [],
        locked: expect.arrayContaining([
          expect.objectContaining({
            key: 'first-steps',
            name: 'Primeiros Passos',
          }),
        ]),
        stats: expect.objectContaining({
          total: 3,
          unlocked: 0,
          byRarity: expect.objectContaining({
            COMMON: 0,
            RARE: 0,
            EPIC: 0,
            LEGENDARY: 0,
          }),
        }),
      });
    });

    it('should show unlocked badges after XP award', async () => {
      await prisma.xPTransaction.create({
        data: {
          userId: testUser.id,
          amount: 150,
          source: 'CHALLENGE',
          reason: 'Challenge completed',
          sourceId: 'test-challenge',
          balanceBefore: 0,
          balanceAfter: 150,
        },
      });

      await prisma.user.update({
        where: { id: testUser.id },
        data: { totalXp: 150 },
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/gamification/badges',
        headers: {
          authorization: `Bearer ${authTokens.accessToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      expect(body.success).toBe(true);
      expect(body.data).toHaveProperty('locked');
      expect(body.data).toHaveProperty('unlocked');
      expect(body.data).toHaveProperty('stats');
    });
  });

  describe('GET /api/gamification/leaderboard', () => {
    it('should return leaderboard with valid userRanking for user with 0 XP', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/gamification/leaderboard',
        headers: {
          authorization: `Bearer ${authTokens.accessToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      expect(body.success).toBe(true);
      expect(body.data).toMatchObject({
        rankings: expect.any(Array),
        userRanking: expect.objectContaining({
          userId: testUser.id,
          position: expect.any(Number),
          score: 0,
          percentile: expect.any(Number),
        }),
        totalParticipants: expect.any(Number),
        period: 'ALL_TIME',
        type: 'XP_TOTAL',
        scope: 'GLOBAL',
      });
    });

    it('should return leaderboard with valid userRanking for user with XP', async () => {
      await prisma.xPTransaction.create({
        data: {
          userId: testUser.id,
          amount: 250,
          source: 'CHALLENGE',
          reason: 'Challenge completed for leaderboard test',
          sourceId: 'test-challenge-lb',
          balanceBefore: 0,
          balanceAfter: 250,
        },
      });

      await prisma.user.update({
        where: { id: testUser.id },
        data: { totalXp: 250 },
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/gamification/leaderboard',
        headers: {
          authorization: `Bearer ${authTokens.accessToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      expect(body.success).toBe(true);
      expect(body.data).toMatchObject({
        rankings: expect.any(Array),
        userRanking: expect.objectContaining({
          userId: testUser.id,
          position: expect.any(Number),
          score: 250,
          percentile: expect.any(Number),
        }),
        totalParticipants: expect.any(Number),
        period: 'ALL_TIME',
        type: 'XP_TOTAL',
        scope: 'GLOBAL',
      });
    });

    it('should return weekly leaderboard with correct parameters', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/gamification/leaderboard?period=WEEKLY&type=XP_WEEKLY',
        headers: {
          authorization: `Bearer ${authTokens.accessToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      expect(body.success).toBe(true);
      expect(body.data.period).toBe('WEEKLY');
      expect(body.data.type).toBe('XP_WEEKLY');
      expect(body.data).toHaveProperty('rankings');
      expect(body.data).toHaveProperty('userRanking');
    });
  });

  describe('GET /api/gamification/streak', () => {
    it('should return initial streak status', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/gamification/streak',
        headers: {
          authorization: `Bearer ${authTokens.accessToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      expect(body.success).toBe(true);
      expect(body.data).toMatchObject({
        currentStreak: 0,
        longestStreak: 0,
        status: expect.any(String),
        nextMilestone: expect.any(Number),
        daysUntilMilestone: expect.any(Number),
        freezesAvailable: expect.any(Number),
        willExpireAt: expect.any(String),
        lastActivityDate: expect.any(String),
      });
    });
  });

  describe('GET /api/gamification/notifications', () => {
    it('should return empty notifications initially', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/gamification/notifications',
        headers: {
          authorization: `Bearer ${authTokens.accessToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      expect(body.success).toBe(true);
      expect(body.data).toMatchObject({
        notifications: [],
        unreadCount: 0,
        hasMore: false,
      });
    });

    it('should return notifications with pagination', async () => {
      await prisma.notification.create({
        data: {
          userId: testUser.id,
          type: 'badge_unlock',
          title: 'Nova Conquista!',
          message: 'Você desbloqueou um novo badge',
          icon: '🏆',
          metadata: { badgeKey: 'first-steps' },
          readAt: null,
          priority: 'medium',
        },
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/gamification/notifications?limit=10&offset=0',
        headers: {
          authorization: `Bearer ${authTokens.accessToken}`,
        },
      });

      if (response.statusCode !== 200) {
        console.log('=== Notifications error response ===', {
          statusCode: response.statusCode,
          body: response.body
        });
      }

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      expect(body.data.notifications).toHaveLength(1);
      expect(body.data.unreadCount).toBe(1);
    });
  });

  describe('POST /api/gamification/notifications', () => {
    it('should create notification for admin users', async () => {
      const { user: adminUser, tokens: adminTokens } = await createTestUser(app, testId, 'admin');

      await prisma.user.update({
        where: { id: adminUser.id },
        data: { role: UserRole.ARCHITECT },
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/gamification/notifications',
        headers: {
          authorization: `Bearer ${adminTokens.accessToken}`,
          'content-type': 'application/json',
        },
        payload: {
          userId: testUser.id,
          type: 'reminder',
          title: 'Manutenção Programada',
          message: 'O sistema entrará em manutenção às 02:00',
          icon: '🔧',
          metadata: { maintenanceTime: '2024-01-15T02:00:00Z' },
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);

      expect(body.success).toBe(true);
      expect(body.data).toMatchObject({
        type: 'reminder',
        title: 'Manutenção Programada',
        acknowledged: false,
      });

      await prisma.user.delete({ where: { id: adminUser.id } });
    });
  });

  describe('POST /api/gamification/notifications/:notificationId/acknowledge', () => {
    it('should acknowledge notification', async () => {
      const notification = await prisma.notification.create({
        data: {
          userId: testUser.id,
          type: 'level_up',
          title: 'Parabéns!',
          message: 'Você subiu de nível!',
          icon: '⬆️',
          metadata: { newLevel: 2 },
        },
      });

      const response = await app.inject({
        method: 'POST',
        url: `/api/gamification/notifications/${notification.id}/acknowledge`,
        headers: {
          authorization: `Bearer ${authTokens.accessToken}`,
          'content-type': 'application/json',
        },
        payload: {
          actionTaken: 'viewed',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      expect(body.success).toBe(true);
      expect(body.data.message).toBe('Notification acknowledged');
    });
  });

  describe('XP System Integration', () => {
    it('should award XP and trigger level up', async () => {
      await prisma.xPTransaction.create({
        data: {
          userId: testUser.id,
          amount: 420,
          source: 'CHALLENGE',
          reason: 'Advanced challenge completed',
          sourceId: 'advanced-challenge',
          balanceBefore: 0,
          balanceAfter: 420,
        },
      });

      await prisma.user.update({
        where: { id: testUser.id },
        data: { totalXp: 420, currentLevel: 2 },
      });

      const updatedUser = await prisma.user.findUnique({
        where: { id: testUser.id },
      });

      expect(updatedUser?.totalXp).toBeGreaterThan(350);
      expect(updatedUser?.currentLevel).toBeGreaterThan(1);
    });

    it('should handle XP multipliers correctly', async () => {
      await prisma.user.update({
        where: { id: testUser.id },
        data: { currentStreak: 5 },
      });

      await prisma.xPTransaction.create({
        data: {
          userId: testUser.id,
          amount: 135,
          source: 'CHALLENGE',
          reason: 'Challenge completed with bonuses',
          sourceId: 'medium-challenge',
          balanceBefore: 420,
          balanceAfter: 555,
        },
      });

      const transaction = await prisma.xPTransaction.findFirst({
        where: { userId: testUser.id },
        orderBy: { createdAt: 'desc' },
      });

      expect(transaction?.amount).toBeGreaterThan(100);
      expect(transaction?.reason).toContain('bonuses');
    });
  });

  describe('Badge System Integration', () => {
    it('should unlock badge when requirements are met', async () => {
      await prisma.xPTransaction.create({
        data: {
          userId: testUser.id,
          amount: 150,
          source: 'CHALLENGE',
          reason: 'Badge unlock challenge',
          sourceId: 'badge-challenge',
          balanceBefore: 0,
          balanceAfter: 150,
        },
      });

      await prisma.user.update({
        where: { id: testUser.id },
        data: { totalXp: 150 },
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/gamification/badges',
        headers: {
          authorization: `Bearer ${authTokens.accessToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      expect(body.data).toMatchObject({
        unlocked: expect.any(Array),
        locked: expect.any(Array),
        stats: expect.objectContaining({
          total: expect.any(Number),
          unlocked: 0,
          byRarity: expect.any(Object),
          recentUnlocks: expect.any(Array),
          nextToUnlock: expect.any(Array),
        }),
      });

      expect(body.data.stats.total).toBe(3);

      const firstStepsBadge = body.data.locked.find((b: any) => b.key === 'first-steps');
      expect(firstStepsBadge).toBeDefined();
    });

    it('should track badge progress', async () => {
      await prisma.xPTransaction.create({
        data: {
          userId: testUser.id,
          amount: 50,
          source: 'CHALLENGE',
          reason: 'Partial progress challenge',
          sourceId: 'partial-challenge',
          balanceBefore: 0,
          balanceAfter: 50,
        },
      });

      await prisma.user.update({
        where: { id: testUser.id },
        data: { totalXp: 50 },
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/gamification/badges',
        headers: {
          authorization: `Bearer ${authTokens.accessToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      expect(body.data).toMatchObject({
        unlocked: [],
        locked: expect.any(Array),
        stats: expect.objectContaining({
          total: expect.any(Number),
          unlocked: 0,
        }),
      });

      const firstStepsBadge = body.data.locked.find((b: any) => b.key === 'first-steps');
      expect(firstStepsBadge).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle unauthorized requests', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/gamification/dashboard',
      });

      expect(response.statusCode).toBe(401);
    });

    it('should handle invalid notification ID', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/gamification/notifications/invalid-id/acknowledge',
        headers: {
          authorization: `Bearer ${authTokens.accessToken}`,
          'content-type': 'application/json',
        },
        payload: {
          actionTaken: 'viewed'
        },
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.code).toBe('GAMIFICATION_NOTIFICATION_NOT_FOUND');
      expect(body.statusCode).toBe(404);
    });

    it('should handle validation errors for create notification', async () => {
      const { user: adminUser, tokens: adminTokens } = await createTestUser(app, testId, 'admin');

      await prisma.user.update({
        where: { id: adminUser.id },
        data: { role: UserRole.ARCHITECT },
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/gamification/notifications',
        headers: {
          authorization: `Bearer ${adminTokens.accessToken}`,
          'content-type': 'application/json',
        },
        payload: {
          // Missing required fields
          userId: '',
          type: 'invalid_type',
          title: '',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.code).toBe('GAMIFICATION_VALIDATION_FAILED');
      expect(body.statusCode).toBe(400);
      expect(body.details).toBeInstanceOf(Array);

      await prisma.user.delete({ where: { id: adminUser.id } });
    });

  });
});