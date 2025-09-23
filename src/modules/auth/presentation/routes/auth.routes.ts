import type { FastifyInstance } from 'fastify';
import { AuthController } from '@/modules/auth/presentation/controllers/auth.controller';
import { RegisterDTO, LoginDTO, RefreshTokenDTO } from '../../domain/schemas/auth.schema';

export async function authRoutes(
  fastify: FastifyInstance,
  controller: AuthController
): Promise<void> {
  fastify.post<{ Body: RegisterDTO }>('/register', controller.register);
  fastify.post<{ Body: LoginDTO }>('/login', controller.login);
  fastify.post<{ Body: RefreshTokenDTO }>('/refresh', controller.refreshToken);
  fastify.post<{ Body: RefreshTokenDTO }>('/logout', {
    preHandler: [fastify.authenticate]
  }, controller.logout);
  fastify.get('/me', {
    preHandler: [fastify.authenticate]
  }, controller.getCurrentUser);
}