import type { FastifyRequest, FastifyReply } from 'fastify';
import { RegisterUseCase } from '../../application/use-cases/register.use-case';
import { LoginUseCase } from '../../application/use-cases/login.use-case';
import { LogoutUseCase } from '../../application/use-cases/logout.use-case';
import { RefreshTokenUseCase } from '../../application/use-cases/refresh-token.use-case';
import { PrismaClient } from '@prisma/client';
import { 
  RegisterDTO, 
  LoginDTO, 
  RefreshTokenDTO 
} from '../../domain/schemas/auth.schema';
import { logger } from '@/shared/infrastructure/monitoring/logger';

export class AuthController {
  constructor(
    private readonly registerUseCase: RegisterUseCase,
    private readonly loginUseCase: LoginUseCase,
    private readonly logoutUseCase: LogoutUseCase,
    private readonly refreshTokenUseCase: RefreshTokenUseCase,
    private readonly prisma: PrismaClient
  ) {}

  register = async (
    request: FastifyRequest<{ Body: RegisterDTO }>,
    reply: FastifyReply
  ): Promise<void> => {
    try {
      const metadata = {
        userAgent: request.headers['user-agent'],
        ipAddress: request.ip,
      };

      const result = await this.registerUseCase.execute(request.body, metadata);

      logger.info({ userId: result.user.id }, 'User registered successfully');

      return reply.status(201).send(result);
    } catch (error) {
      logger.error({ error }, 'Registration failed');
      
      if (error instanceof Error && error.message.includes('already exists')) {
        return reply.status(400).send({
          error: 'Registration failed',
          message: error.message,
        });
      }

      return reply.status(500).send({
        error: 'Internal server error',
        message: 'Failed to register user',
      });
    }
  };

  login = async (
    request: FastifyRequest<{ Body: LoginDTO }>,
    reply: FastifyReply
  ): Promise<void> => {
    try {
      const metadata = {
        userAgent: request.headers['user-agent'],
        ipAddress: request.ip,
      };

      const result = await this.loginUseCase.execute(request.body, metadata);

      logger.info({ userId: result.user.id }, 'User logged in successfully');

      return reply.send(result);
    } catch (error) {
      logger.error({ error }, 'Login failed');
      
      if (error instanceof Error && error.message.includes('Invalid')) {
        return reply.status(401).send({
          error: 'Authentication failed',
          message: error.message,
        });
      }

      return reply.status(500).send({
        error: 'Internal server error',
        message: 'Failed to authenticate',
      });
    }
  };

  logout = async (
    request: FastifyRequest<{ Body: RefreshTokenDTO }>,
    reply: FastifyReply
  ): Promise<void> => {
    try {
      await this.logoutUseCase.execute(request.body.refreshToken);

      const user = request.user as { id: string; email: string; role: string } | undefined;
      logger.info({ userId: user?.id }, 'User logged out successfully');

      return reply.status(204).send();
    } catch (error) {
      logger.error({ error }, 'Logout failed');
      
      return reply.status(500).send({
        error: 'Internal server error',
        message: 'Failed to logout',
      });
    }
  };

  refreshToken = async (
    request: FastifyRequest<{ Body: RefreshTokenDTO }>,
    reply: FastifyReply
  ): Promise<void> => {
    try {
      const metadata = {
        userAgent: request.headers['user-agent'],
        ipAddress: request.ip,
      };

      const result = await this.refreshTokenUseCase.execute(
        request.body.refreshToken,
        metadata
      );

      logger.info('Token refreshed successfully');

      return reply.send(result);
    } catch (error) {
      logger.error({ error }, 'Token refresh failed');
      
      if (error instanceof Error && 
          (error.message.includes('Invalid') || error.message.includes('expired'))) {
        return reply.status(401).send({
          error: 'Token refresh failed',
          message: error.message,
        });
      }

      return reply.status(500).send({
        error: 'Internal server error',
        message: 'Failed to refresh token',
      });
    }
  };

  getCurrentUser = async (
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> => {
    try {
      const user = request.user as { id: string; email: string; role: string } | undefined;
      
      if (!user) {
        return reply.status(401).send({
          error: 'Unauthorized',
          message: 'User not authenticated',
        });
      }

      const userProfile = await this.prisma.user.findUnique({
        where: { id: user.id },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          currentLevel: true,
          totalXp: true,
          currentStreak: true,
          avatarUrl: true,
          position: true,
          yearsOfExperience: true,
          preferredLanguages: true,
          githubUsername: true,
          companyId: true,
          teamId: true,
          emailVerified: true,
          onboardingCompleted: true,
        },
      });

      if (!userProfile) {
        return reply.status(404).send({
          error: 'User not found',
          message: 'User no longer exists',
        });
      }

      logger.info({ userId: userProfile.id }, 'User profile retrieved');

      return reply.send(userProfile);
    } catch (error) {
      logger.error({ error }, 'Failed to get current user');
      
      return reply.status(500).send({
        error: 'Internal server error',
        message: 'Failed to retrieve user profile',
      });
    }
  };
}