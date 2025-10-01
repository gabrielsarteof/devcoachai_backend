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
import {
  AuthError,
  UnauthorizedError,
  UserNotFoundError,
  ValidationError
} from '../../domain/errors';
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
      return reply.status(201).send({
        success: true,
        data: result
      });
    } catch (error) {
      if (error instanceof ZodError) {
        const validationError = new ValidationError(error);
        return reply.status(validationError.statusCode).send(validationError.toJSON());
      }

      if (error instanceof AuthError) {
        return reply.status(error.statusCode).send(error.toJSON());
      }

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
      return reply.send({
        success: true,
        data: result
      });
    } catch (error) {
      if (error instanceof ZodError) {
        const validationError = new ValidationError(error);
        return reply.status(validationError.statusCode).send(validationError.toJSON());
      }

      if (error instanceof AuthError) {
        return reply.status(error.statusCode).send(error.toJSON());
      }

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
      if (error instanceof ZodError) {
        const validationError = new ValidationError(error);
        return reply.status(validationError.statusCode).send(validationError.toJSON());
      }

      if (error instanceof AuthError) {
        return reply.status(error.statusCode).send(error.toJSON());
      }

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

      return reply.send({
        success: true,
        data: result
      });
    } catch (error) {
      if (error instanceof ZodError) {
        const validationError = new ValidationError(error);
        return reply.status(validationError.statusCode).send(validationError.toJSON());
      }

      if (error instanceof AuthError) {
        return reply.status(error.statusCode).send(error.toJSON());
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
        throw new UnauthorizedError();
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
        throw new UserNotFoundError();
      }

      return reply.send({
        success: true,
        data: userProfile
      });
    } catch (error) {
      if (error instanceof AuthError) {
        return reply.status(error.statusCode).send(error.toJSON());
      }

      return reply.status(500).send({
        error: 'Internal server error',
        message: 'Failed to retrieve user profile',
      });
    }
  };
}