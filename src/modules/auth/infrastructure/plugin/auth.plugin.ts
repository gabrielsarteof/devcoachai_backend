import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { JWTService } from '../services/jwt.service';
import { AuthRepository } from '../repositories/auth.repository';
import { AuthMiddleware } from '../middleware/auth.middleware';
import { RegisterUseCase } from '../../application/use-cases/register.use-case';
import { LoginUseCase } from '../../application/use-cases/login.use-case';
import { LogoutUseCase } from '../../application/use-cases/logout.use-case';
import { RefreshTokenUseCase } from '../../application/use-cases/refresh-token.use-case';
import { AuthController } from '../../presentation/controllers/auth.controller';
import { authRoutes } from '../../presentation/routes/auth.routes';
import { registerAuthDecorators } from '../decorators/auth.decorator';

export interface AuthPluginOptions {
  prisma: PrismaClient;
  redis: Redis;
}

const authPlugin: FastifyPluginAsync<AuthPluginOptions> = async function(
  fastify: FastifyInstance,
  options: AuthPluginOptions
): Promise<void> {
  const jwtService = JWTService.getInstance();
  await jwtService.initialize(fastify);

  const authRepository = new AuthRepository(options.prisma, options.redis);

  const registerUseCase = new RegisterUseCase(
    options.prisma,
    jwtService,
    authRepository
  );

  const loginUseCase = new LoginUseCase(
    options.prisma,
    jwtService,
    authRepository
  );

  const logoutUseCase = new LogoutUseCase(authRepository);

  const refreshTokenUseCase = new RefreshTokenUseCase(
    jwtService,
    authRepository
  );

  const authController = new AuthController(
    registerUseCase,
    loginUseCase,
    logoutUseCase,
    refreshTokenUseCase,
    options.prisma
  );

  const authMiddleware = new AuthMiddleware(jwtService);

  registerAuthDecorators(fastify, authMiddleware);

  await fastify.register(async function authRoutesPlugin(childInstance) {
    await authRoutes(childInstance, authController);
  }, {
    prefix: '/auth'
  });

  fastify.log.info('Auth plugin registered successfully');
};

export default fp(authPlugin, {
  name: 'auth-plugin',
  dependencies: [],
});