import type { FastifyInstance } from 'fastify';
import { AuthController } from '@/modules/auth/presentation/controllers/auth.controller';
import { 
  RegisterSchema, 
  LoginSchema, 
  RefreshTokenSchema 
} from '../../domain/schemas/auth.schema';
import { RefreshTokenDTO } from '../../domain/schemas/auth.schema';

export async function authRoutes(
  fastify: FastifyInstance,
  controller: AuthController
): Promise<void> {
  fastify.post('/register', {
    schema: {
      body: RegisterSchema,
      response: {
        201: {
          type: 'object',
          properties: {
            user: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                email: { type: 'string' },
                name: { type: 'string' },
                role: { type: 'string' },
                currentLevel: { type: 'number' },
                totalXp: { type: 'number' },
              },
            },
            accessToken: { type: 'string' },
            refreshToken: { type: 'string' },
          },
        },
        400: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' },
          },
        },
      },
    },
  }, controller.register);

  fastify.post('/login', {
    schema: {
      body: LoginSchema,
      response: {
        200: {
          type: 'object',
          properties: {
            user: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                email: { type: 'string' },
                name: { type: 'string' },
                role: { type: 'string' },
                currentLevel: { type: 'number' },
                totalXp: { type: 'number' },
              },
            },
            accessToken: { type: 'string' },
            refreshToken: { type: 'string' },
          },
        },
        401: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' },
          },
        },
      },
    },
  }, controller.login);

  fastify.post('/refresh', {
    schema: {
      body: RefreshTokenSchema,
      response: {
        200: {
          type: 'object',
          properties: {
            accessToken: { type: 'string' },
            refreshToken: { type: 'string' },
          },
        },
        401: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' },
          },
        },
      },
    },
  }, controller.refreshToken);

  fastify.post<{ Body: RefreshTokenDTO }>('/logout', {
    preHandler: [fastify.authenticate],
    schema: {
      headers: {
        type: 'object',
        properties: {
          authorization: { type: 'string' },
        },
        required: ['authorization'],
      },
      body: RefreshTokenSchema,
      response: {
        204: {
          type: 'null',
        },
      },
    },
  }, controller.logout);

  fastify.get('/me', {
    preHandler: [fastify.authenticate],
    schema: {
      headers: {
        type: 'object',
        properties: {
          authorization: { type: 'string' },
        },
        required: ['authorization'],
      },
      response: {
        200: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            email: { type: 'string' },
            name: { type: 'string' },
            role: { type: 'string' },
            currentLevel: { type: 'number' },
            totalXp: { type: 'number' },
            currentStreak: { type: 'number' },
            avatarUrl: { type: 'string' },
            position: { type: 'string' },
            yearsOfExperience: { type: 'number' },
            preferredLanguages: {
              type: 'array',
              items: { type: 'string' }
            },
            githubUsername: { type: 'string' },
            companyId: { type: 'string' },
            teamId: { type: 'string' },
            emailVerified: { type: 'boolean' },
            onboardingCompleted: { type: 'boolean' },
          },
        },
      },
    },
  }, controller.getCurrentUser);
}