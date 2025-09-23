import type { FastifyRequest, FastifyReply } from 'fastify';
import { RegisterUseCase } from '../../application/use-cases/register.use-case';
import { LoginUseCase } from '../../application/use-cases/login.use-case';
import { LogoutUseCase } from '../../application/use-cases/logout.use-case';
import { RefreshTokenUseCase } from '../../application/use-cases/refresh-token.use-case';
import { PrismaClient } from '@prisma/client';
import { 
  RegisterSchema,
  LoginSchema,
  RefreshTokenSchema
} from '../../domain/schemas/auth.schema';
import { logger } from '@/shared/infrastructure/monitoring/logger';
import { ZodError } from 'zod';

export class AuthController {
  constructor(
    private readonly registerUseCase: RegisterUseCase,
    private readonly loginUseCase: LoginUseCase,
    private readonly logoutUseCase: LogoutUseCase,
    private readonly refreshTokenUseCase: RefreshTokenUseCase,
    private readonly prisma: PrismaClient
  ) {}

  register = async (
    request: FastifyRequest<{ Body: any }>,
    reply: FastifyReply
  ): Promise<void> => {
    try {
      const validatedData = RegisterSchema.parse(request.body);
      const metadata = {
        userAgent: request.headers['user-agent'],
        ipAddress: request.ip,
      };

      const result = await this.registerUseCase.execute(validatedData, metadata);
      return reply.status(201).send(result);
    } catch (error) {
      // Erros de validação Zod
      if (error instanceof ZodError) {
        return reply.status(400).send({
          error: 'Validation failed',
          message: 'Invalid input data',
          details: error.issues
        });
      }
      
      // Erros de negócio
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      // Email duplicado -> 400
      if (errorMessage.includes('já cadastrado') || errorMessage.includes('already exists')) {
        return reply.status(400).send({
          error: 'Registration failed',
          message: errorMessage,
        });
      }

      // Erro genérico -> 500
      return reply.status(500).send({
        error: 'Internal server error',
        message: 'Failed to register user',
      });
    }
  };

  login = async (
    request: FastifyRequest<{ Body: any }>,
    reply: FastifyReply
  ): Promise<void> => {
    try {
      const validatedData = LoginSchema.parse(request.body);
      const metadata = {
        userAgent: request.headers['user-agent'],
        ipAddress: request.ip,
      };

      const result = await this.loginUseCase.execute(validatedData, metadata);
      return reply.send(result);
    } catch (error) {
      // Erros de validação Zod
      if (error instanceof ZodError) {
        return reply.status(400).send({
          error: 'Validation failed',
          message: 'Invalid input data',
          details: error.issues
        });
      }
      
      // Erros de negócio
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      // Credenciais inválidas -> 401
      if (errorMessage.includes('inválidos') || errorMessage.includes('Invalid')) {
        return reply.status(401).send({
          error: 'Authentication failed',
          message: errorMessage,
        });
      }

      // Erro genérico -> 500
      return reply.status(500).send({
        error: 'Internal server error',
        message: 'Failed to authenticate',
      });
    }
  };

  logout = async (
    request: FastifyRequest<{ Body: any }>,
    reply: FastifyReply
  ): Promise<void> => {
    try {
      const validatedData = RefreshTokenSchema.parse(request.body);
      await this.logoutUseCase.execute(validatedData.refreshToken);
      return reply.status(204).send();
    } catch (error) {
      // Erros de validação Zod
      if (error instanceof ZodError) {
        return reply.status(400).send({
          error: 'Validation failed',
          message: 'Invalid input data',
          details: error.issues
        });
      }
      
      // Erro genérico -> 500
      return reply.status(500).send({
        error: 'Internal server error',
        message: 'Failed to logout',
      });
    }
  };

  refreshToken = async (
    request: FastifyRequest<{ Body: any }>,
    reply: FastifyReply
  ): Promise<void> => {
    try {
      const validatedData = RefreshTokenSchema.parse(request.body);
      const metadata = {
        userAgent: request.headers['user-agent'],
        ipAddress: request.ip,
      };

      const result = await this.refreshTokenUseCase.execute(
        validatedData.refreshToken,
        metadata
      );
      
      return reply.send(result);
    } catch (error) {
      // Erros de validação Zod
      if (error instanceof ZodError) {
        return reply.status(400).send({
          error: 'Validation failed',
          message: 'Invalid input data',
          details: error.issues
        });
      }
      
      // Erros de negócio
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      // Token inválido/expirado -> 401
      if (errorMessage.includes('inválido') || errorMessage.includes('Invalid') || errorMessage.includes('expired')) {
        return reply.status(401).send({
          error: 'Token refresh failed',
          message: errorMessage,
        });
      }

      // Erro genérico -> 500
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

      return reply.send(userProfile);
    } catch (error) {
      return reply.status(500).send({
        error: 'Internal server error',
        message: 'Failed to retrieve user profile',
      });
    }
  };
}