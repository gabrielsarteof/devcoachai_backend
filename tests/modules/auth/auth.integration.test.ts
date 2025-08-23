import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { FastifyInstance } from 'fastify';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { buildTestApp } from '../../helpers/test-app';

describe('Authentication Integration Tests', () => {
  let app: FastifyInstance;
  let prisma: PrismaClient;
  let redis: Redis;
  let testUser: any;
  let tokens: { accessToken: string; refreshToken: string };

  beforeAll(async () => {
    ({ app, prisma, redis } = await buildTestApp());
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
    redis.disconnect();
  });

  beforeEach(async () => {
    await prisma.user.deleteMany({
      where: { email: { contains: 'test' } },
    });
    await redis.flushdb();
  });

  describe('POST /auth/register', () => {
    it('should register a new user successfully', async () => {
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
      
      expect(body).toHaveProperty('user');
      expect(body).toHaveProperty('accessToken');
      expect(body).toHaveProperty('refreshToken');
      expect(body.user.email).toBe('test@example.com');
      expect(body.user.name).toBe('Test User');
      
      testUser = body.user;
      tokens = {
        accessToken: body.accessToken,
        refreshToken: body.refreshToken,
      };
    });

    it('should fail with invalid email', async () => {
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
    });

    it('should fail if email already exists', async () => {
      await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          email: 'test@example.com',
          password: 'Test@123456',
          name: 'Test User',
          acceptTerms: true,
        },
      });

      const response = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          email: 'test@example.com',
          password: 'Test@123456',
          name: 'Another User',
          acceptTerms: true,
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.message).toContain('already');
    });
  });

  describe('POST /auth/login', () => {
    beforeEach(async () => {
      await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          email: 'test@example.com',
          password: 'Test@123456',
          name: 'Test User',
          acceptTerms: true,
        },
      });
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
      
      expect(body).toHaveProperty('user');
      expect(body).toHaveProperty('accessToken');
      expect(body).toHaveProperty('refreshToken');
      expect(body.user.email).toBe('test@example.com');
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
      expect(body.message).toContain('Invalid');
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
    });
  });

  describe('POST /auth/refresh', () => {
    beforeEach(async () => {
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
      
      const body = JSON.parse(response.body);
      tokens = {
        accessToken: body.accessToken,
        refreshToken: body.refreshToken,
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
      
      expect(body).toHaveProperty('accessToken');
      expect(body).toHaveProperty('refreshToken');
      expect(body.accessToken).not.toBe(tokens.accessToken);
      expect(body.refreshToken).not.toBe(tokens.refreshToken);
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
    });
  });

  describe('GET /auth/me', () => {
    beforeEach(async () => {
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
      
      const body = JSON.parse(response.body);
      testUser = body.user;
      tokens = {
        accessToken: body.accessToken,
        refreshToken: body.refreshToken,
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
      
      expect(body.id).toBe(testUser.id);
      expect(body.email).toBe('test@example.com');
      expect(body.name).toBe('Test User');
    });

    it('should fail without token', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/auth/me',
      });

      expect(response.statusCode).toBe(401);
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
    });
  });

  describe('POST /auth/logout', () => {
    beforeEach(async () => {
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
      
      const body = JSON.parse(response.body);
      tokens = {
        accessToken: body.accessToken,
        refreshToken: body.refreshToken,
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

      const refreshResponse = await app.inject({
        method: 'POST',
        url: '/auth/refresh',
        payload: {
          refreshToken: tokens.refreshToken,
        },
      });

      expect(refreshResponse.statusCode).toBe(401);
    });
  });
});