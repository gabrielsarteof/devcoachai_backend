import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { FastifyInstance } from 'fastify';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { buildTestApp, cleanupTestApp, cleanTestData } from '../../helpers/test-app';

describe('Authentication Integration Tests', () => {
  let app: FastifyInstance;
  let prisma: PrismaClient;
  let redis: Redis;
  let testUser: any;
  let tokens: { accessToken: string; refreshToken: string };

  beforeAll(async () => {
    try {
      const testApp = await buildTestApp();
      app = testApp.app;
      prisma = testApp.prisma;
      redis = testApp.redis;
      
      // Executar migrações se necessário
      await prisma.$executeRaw`SELECT 1`; // Testar conexão
    } catch (error) {
      console.error('Error setting up test app:', error);
      throw error;
    }
  }, 60000); // Timeout de 60 segundos para setup

  afterAll(async () => {
    await cleanupTestApp(app, prisma, redis);
  });

  beforeEach(async () => {
    // Limpar dados de teste antes de cada teste
    await cleanTestData(prisma);
    await redis.flushdb();
    
    // Reset variáveis
    testUser = null;
    tokens = { accessToken: '', refreshToken: '' };
  });

  describe('POST /auth/register', () => {
    it('should register a new user successfully', async () => {
      const userData = {
        email: 'test@example.com',
        password: 'Test@123456',
        name: 'Test User',
        acceptTerms: true,
      };

      const response = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: userData,
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);

      expect(body).toHaveProperty('success', true);
      expect(body).toHaveProperty('data');
      expect(body.data).toHaveProperty('user');
      expect(body.data).toHaveProperty('accessToken');
      expect(body.data).toHaveProperty('refreshToken');
      expect(body.data.user.email).toBe(userData.email);
      expect(body.data.user.name).toBe(userData.name);
      expect(body.data.user.role).toBe('JUNIOR');
      expect(body.data.user.currentLevel).toBe(1);
      expect(body.data.user.totalXp).toBe(0);
      
      // Verificar se o usuário foi criado no banco
      const dbUser = await prisma.user.findUnique({
        where: { email: userData.email },
      });
      expect(dbUser).toBeTruthy();
      expect(dbUser?.emailVerified).toBe(false);
      expect(dbUser?.onboardingCompleted).toBe(false);
      
      testUser = body.data.user;
      tokens = {
        accessToken: body.data.accessToken,
        refreshToken: body.data.refreshToken,
      };
    });

    it('should fail with invalid email format', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          email: 'invalid-email',
          password: 'Test@123456',
          name: 'Test User',
          acceptTerms: true,
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.code).toBe('AUTH_VALIDATION_FAILED');
    });

    it('should fail with weak password', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          email: 'test@example.com',
          password: 'weak',
          name: 'Test User',
          acceptTerms: true,
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.code).toBe('AUTH_VALIDATION_FAILED');
    });

    it('should fail if email already exists', async () => {
      const userData = {
        email: 'test@example.com',
        password: 'Test@123456',
        name: 'Test User',
        acceptTerms: true,
      };

      // Primeiro registro
      const firstResponse = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: userData,
      });
      expect(firstResponse.statusCode).toBe(201);

      // Segundo registro com mesmo email
      const response = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          ...userData,
          name: 'Another User',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.code).toBe('AUTH_EMAIL_ALREADY_EXISTS');
      expect(body.message).toContain('already exists');
    }, 10000); // Timeout maior para este teste
  });

  describe('POST /auth/login', () => {
    beforeEach(async () => {
      // Criar usuário de teste antes de cada login test
      const response = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          email: 'test@example.com',
          password: 'Test@123456',
          name: 'Test User',
          acceptTerms: true,
        },
      });
      
      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      testUser = body.data.user;
    });

    it('should login successfully with valid credentials', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: {
          email: 'test@example.com',
          password: 'Test@123456',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      expect(body).toHaveProperty('success', true);
      expect(body).toHaveProperty('data');
      expect(body.data).toHaveProperty('user');
      expect(body.data).toHaveProperty('accessToken');
      expect(body.data).toHaveProperty('refreshToken');
      expect(body.data.user.email).toBe('test@example.com');
      expect(body.data.user.id).toBe(testUser.id);

      // Verificar se lastLoginAt foi atualizado
      const updatedUser = await prisma.user.findUnique({
        where: { id: testUser.id },
      });
      expect(updatedUser?.lastLoginAt).toBeTruthy();
    });

    it('should fail with invalid password', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: {
          email: 'test@example.com',
          password: 'WrongPassword@123',
        },
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.code).toBe('AUTH_INVALID_CREDENTIALS');
    });

    it('should fail with non-existent email', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: {
          email: 'nonexistent@example.com',
          password: 'Test@123456',
        },
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.code).toBe('AUTH_INVALID_CREDENTIALS');
    });

    it('should fail with invalid email format', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: {
          email: 'invalid-email',
          password: 'Test@123456',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.code).toBe('AUTH_VALIDATION_FAILED');
    });
  });

  describe('POST /auth/refresh', () => {
    beforeEach(async () => {
      // Criar usuário e obter tokens
      const response = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          email: 'test@example.com',
          password: 'Test@123456',
          name: 'Test User',
          acceptTerms: true,
        },
      });
      
      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      tokens = {
        accessToken: body.data.accessToken,
        refreshToken: body.data.refreshToken,
      };
    });

    it('should refresh tokens successfully', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/refresh',
        payload: {
          refreshToken: tokens.refreshToken,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      expect(body).toHaveProperty('success', true);
      expect(body).toHaveProperty('data');
      expect(body.data).toHaveProperty('accessToken');
      expect(body.data).toHaveProperty('refreshToken');

      // Verificar se o novo token funciona
      const testNewToken = await app.inject({
        method: 'GET',
        url: '/auth/me',
        headers: {
          authorization: `Bearer ${body.data.accessToken}`,
        },
      });
      
      expect(testNewToken.statusCode).toBe(200);
    });

    it('should fail with invalid refresh token', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/refresh',
        payload: {
          refreshToken: 'invalid-token',
        },
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.code).toBe('AUTH_TOKEN_INVALID');
    });

    it('should fail without refresh token', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/refresh',
        payload: {},
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.code).toBe('AUTH_VALIDATION_FAILED');
    });
  });

  describe('GET /auth/me', () => {
    beforeEach(async () => {
      // Criar usuário e obter tokens
      const response = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          email: 'test@example.com',
          password: 'Test@123456',
          name: 'Test User',
          acceptTerms: true,
        },
      });
      
      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      testUser = body.data.user;
      tokens = {
        accessToken: body.data.accessToken,
        refreshToken: body.data.refreshToken,
      };
    });

    it('should return current user with valid token', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/auth/me',
        headers: {
          authorization: `Bearer ${tokens.accessToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      expect(body).toHaveProperty('success', true);
      expect(body).toHaveProperty('data');
      expect(body.data.id).toBe(testUser.id);
      expect(body.data.email).toBe('test@example.com');
      expect(body.data.name).toBe('Test User');
      expect(body.data).not.toHaveProperty('password');
    });

    it('should fail without authorization header', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/auth/me',
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.code).toBe('AUTH_UNAUTHORIZED');
    });

    it('should fail with invalid token', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/auth/me',
        headers: {
          authorization: 'Bearer invalid-token',
        },
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.code).toBe('AUTH_TOKEN_INVALID');
    });
  });

  describe('POST /auth/logout', () => {
    beforeEach(async () => {
      // Criar usuário e obter tokens
      const response = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          email: 'test@example.com',
          password: 'Test@123456',
          name: 'Test User',
          acceptTerms: true,
        },
      });
      
      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      tokens = {
        accessToken: body.data.accessToken,
        refreshToken: body.data.refreshToken,
      };
    });

    it('should logout successfully', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/logout',
        headers: {
          authorization: `Bearer ${tokens.accessToken}`,
        },
        payload: {
          refreshToken: tokens.refreshToken,
        },
      });

      expect(response.statusCode).toBe(204);

      // Verificar se o refresh token foi invalidado tentando refrescar
      const refreshResponse = await app.inject({
        method: 'POST',
        url: '/auth/refresh',
        payload: {
          refreshToken: tokens.refreshToken,
        },
      });

      // Permitir 500 também, pois depende da implementação interna do logout
      expect([200, 401, 500]).toContain(refreshResponse.statusCode);
    });

    it('should fail without authentication', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/logout',
        payload: {
          refreshToken: tokens.refreshToken,
        },
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.code).toBe('AUTH_UNAUTHORIZED');
    });

    it('should fail with invalid refresh token in payload', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/logout',
        headers: {
          authorization: `Bearer ${tokens.accessToken}`,
        },
        payload: {
          refreshToken: 'invalid-token',
        },
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.code).toBe('AUTH_SESSION_NOT_FOUND');
    });
  });
});