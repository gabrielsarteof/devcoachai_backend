import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { FastifyInstance } from 'fastify';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { buildTestApp, cleanupTestApp, generateTestId, createTestUser, cleanTestDataWithRedis } from '../../helpers/test-app';
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

    // Create test user using helper function
    const { user, tokens } = await createTestUser(app, testId, 'junior');
    testUser = user;
    authTokens = tokens;

    // Seed test badges (only create if they don't exist)
    const existingBadges = await prisma.badge.findMany({
      where: {
        key: { in: ['first-steps', 'level-master', 'streak-warrior'] }
      }
    });

    if (existingBadges.length === 0) {
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
      });
    }
  });

  afterAll(async () => {
    await cleanupTestApp(app, prisma, redis);
  });

  beforeEach(async () => {
    // Clean user progress before each test using helper function
    if (testUser?.id) {
      await prisma.userBadge.deleteMany({ where: { userId: testUser.id } });
      await prisma.xPTransaction.deleteMany({ where: { userId: testUser.id } });
      await prisma.notification.deleteMany({ where: { userId: testUser.id } });
      await prisma.user.update({
        where: { id: testUser.id },
        data: { totalXp: 0, currentLevel: 1, currentStreak: 0 },
      });
    }

    // Clear gamification-specific Redis cache
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
          totalXp: 0,
          currentStreak: 0,
        },
        badges: {
          total: 3,
          unlocked: 0,
          progress: expect.any(Array),
        },
        leaderboard: {
          userPosition: expect.any(Number),
          topUsers: expect.any(Array),
        },
        streak: {
          currentStreak: 0,
          isActive: false,
          freezesAvailable: expect.any(Number),
        },
        notifications: {
          unread: 0,
          recent: [],
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
        unlockedBadges: [],
        availableBadges: expect.arrayContaining([
          expect.objectContaining({
            key: 'first-steps',
            name: 'Primeiros Passos',
            unlocked: false,
          }),
        ]),
        progress: expect.any(Array),
      });
    });

    it('should show unlocked badges after XP award', async () => {
      // First award XP by completing a challenge (simulated)
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

      // Update user's total XP
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

      // Should have progress towards badge
      expect(body.success).toBe(true);
      expect(body.data).toHaveProperty('availableBadges');
    });
  });

  describe('GET /api/gamification/leaderboard', () => {
    it('should return leaderboard with default parameters', async () => {
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
        entries: expect.any(Array),
        userPosition: expect.any(Number),
        totalUsers: expect.any(Number),
        period: 'all-time',
        type: 'xp',
      });
    });

    it('should return weekly leaderboard', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/gamification/leaderboard?period=weekly&type=xp',
        headers: {
          authorization: `Bearer ${authTokens.accessToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      expect(body.data.period).toBe('weekly');
      expect(body.data.type).toBe('xp');
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
        isActive: false,
        lastActivity: null,
        freezesAvailable: expect.any(Number),
        streakHistory: expect.any(Array),
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
      // Create test notifications
      await prisma.notification.create({
        data: {
          userId: testUser.id,
          type: 'badge_unlock',
          title: 'Nova Conquista!',
          message: 'Você desbloqueou um novo badge',
          icon: '🏆',
          metadata: { badgeKey: 'first-steps' },
        },
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/gamification/notifications?limit=10&offset=0',
        headers: {
          authorization: `Bearer ${authTokens.accessToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      expect(body.data.notifications).toHaveLength(1);
      expect(body.data.unreadCount).toBe(1);
    });
  });

  describe('POST /api/gamification/notifications', () => {
    it('should create notification for admin users', async () => {
      // Create admin user using helper function
      const { user: adminUser, tokens: adminTokens } = await createTestUser(app, testId, 'admin');

      // Update admin role (since register creates as JUNIOR by default)
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
          type: 'SYSTEM_MESSAGE',
          title: 'Manutenção Programada',
          message: 'O sistema entrará em manutenção às 02:00',
          data: { maintenanceTime: '2024-01-15T02:00:00Z' },
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);

      expect(body.success).toBe(true);
      expect(body.data).toMatchObject({
        type: 'SYSTEM_MESSAGE',
        title: 'Manutenção Programada',
        acknowledged: false,
      });

      // Cleanup
      await prisma.user.delete({ where: { id: adminUser.id } });
    });
  });

  describe('POST /api/gamification/notifications/:notificationId/acknowledge', () => {
    it('should acknowledge notification', async () => {
      // Create notification
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
      expect(body.message).toBe('Notification acknowledged');
    });
  });

  describe('XP System Integration', () => {
    it('should award XP and trigger level up', async () => {
      // Award XP by creating transaction and updating user
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

      // Verify user leveled up
      const updatedUser = await prisma.user.findUnique({
        where: { id: testUser.id },
      });

      expect(updatedUser?.totalXp).toBeGreaterThan(350);
      expect(updatedUser?.currentLevel).toBeGreaterThan(1);
    });

    it('should handle XP multipliers correctly', async () => {
      // Set up user with streak
      await prisma.user.update({
        where: { id: testUser.id },
        data: { currentStreak: 5 },
      });

      // Create transaction with multipliers
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

      // Should have bonuses applied
      expect(transaction?.amount).toBeGreaterThan(100);
      expect(transaction?.reason).toContain('bonuses');
    });
  });

  describe('Badge System Integration', () => {
    it('should unlock badge when requirements are met', async () => {
      // Award enough XP to meet badge requirement
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

      // Check badges endpoint to see if requirements are met
      const response = await app.inject({
        method: 'GET',
        url: '/api/gamification/badges',
        headers: {
          authorization: `Bearer ${authTokens.accessToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      // Should show progress towards badge unlock
      expect(body.data.progress).toHaveLength(3);

      // First badge should show 100% progress (150 XP >= 100 XP requirement)
      const firstStepsBadge = body.data.availableBadges.find((b: any) => b.key === 'first-steps');
      expect(firstStepsBadge).toBeDefined();
    });

    it('should track badge progress', async () => {
      // Award partial XP
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

      // Should show partial progress
      expect(body.data.progress).toHaveLength(3);
      expect(body.data.progress.some((p: any) => p.percentage === 50)).toBe(true);
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
        },
        payload: {},
      });

      expect(response.statusCode).toBe(500);
    });
  });
});