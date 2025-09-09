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
    const startTime = Date.now();
    const requestId = crypto.randomUUID();
    
    logger.info({
      requestId,
      operation: 'user_registration_request',
      email: request.body.email,
      name: request.body.name,
      companyId: request.body.companyId,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent']
    }, 'User registration request received');

    try {
      const metadata = {
        userAgent: request.headers['user-agent'],
        ipAddress: request.ip,
      };

      const result = await this.registerUseCase.execute(request.body, metadata);
      
      const executionTime = Date.now() - startTime;

      logger.info({
        requestId,
        userId: result.user.id,
        email: result.user.email,
        name: result.user.name,
        role: result.user.role,
        companyId: result.user.companyId,
        executionTime,
        ipAddress: request.ip,
        registrationSuccess: true
      }, 'User registered successfully');

      return reply.status(201).send(result);
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      logger.error({
        requestId,
        operation: 'user_registration_failed',
        email: request.body.email,
        name: request.body.name,
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
        executionTime
      }, 'Registration failed');
      
      if (error instanceof Error && error.message.includes('already exists')) {
        logger.warn({
          requestId,
          email: request.body.email,
          ipAddress: request.ip,
          reason: 'email_already_exists',
          securityEvent: true
        }, 'Registration attempt with existing email');
        
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
    const startTime = Date.now();
    const requestId = crypto.randomUUID();
    
    logger.info({
      requestId,
      operation: 'user_login_request',
      email: request.body.email,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent']
    }, 'User login request received');

    try {
      const metadata = {
        userAgent: request.headers['user-agent'],
        ipAddress: request.ip,
      };

      const result = await this.loginUseCase.execute(request.body, metadata);
      
      const executionTime = Date.now() - startTime;

      logger.info({
        requestId,
        userId: result.user.id,
        email: result.user.email,
        role: result.user.role,
        level: result.user.currentLevel,
        executionTime,
        ipAddress: request.ip,
        loginSuccess: true
      }, 'User logged in successfully');

      return reply.send(result);
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      if (error instanceof Error && error.message.includes('Invalid')) {
        logger.warn({
          requestId,
          operation: 'login_authentication_failed',
          email: request.body.email,
          error: errorMessage,
          ipAddress: request.ip,
          userAgent: request.headers['user-agent'],
          executionTime,
          securityEvent: true
        }, 'Login failed - invalid credentials');
        
        return reply.status(401).send({
          error: 'Authentication failed',
          message: error.message,
        });
      }

      logger.error({
        requestId,
        operation: 'login_system_error',
        email: request.body.email,
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
        ipAddress: request.ip,
        executionTime
      }, 'Login failed due to system error');

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
    const startTime = Date.now();
    const requestId = crypto.randomUUID();
    const user = request.user as { id: string; email: string; role: string } | undefined;
    
    logger.info({
      requestId,
      operation: 'user_logout_request',
      userId: user?.id,
      email: user?.email,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent']
    }, 'User logout request received');

    try {
      await this.logoutUseCase.execute(request.body.refreshToken);
      
      const executionTime = Date.now() - startTime;

      logger.info({
        requestId,
        userId: user?.id,
        email: user?.email,
        executionTime,
        ipAddress: request.ip,
        logoutSuccess: true
      }, 'User logged out successfully');

      return reply.status(204).send();
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      logger.error({
        requestId,
        operation: 'logout_failed',
        userId: user?.id,
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
        ipAddress: request.ip,
        executionTime
      }, 'Logout failed');
      
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
    const startTime = Date.now();
    const requestId = crypto.randomUUID();
    
    logger.info({
      requestId,
      operation: 'token_refresh_request',
      ipAddress: request.ip,
      userAgent: request.headers['user-agent']
    }, 'Token refresh request received');

    try {
      const metadata = {
        userAgent: request.headers['user-agent'],
        ipAddress: request.ip,
      };

      const result = await this.refreshTokenUseCase.execute(
        request.body.refreshToken,
        metadata
      );
      
      const executionTime = Date.now() - startTime;

      logger.info({
        requestId,
        executionTime,
        ipAddress: request.ip,
        tokenRefreshSuccess: true
      }, 'Token refreshed successfully');

      return reply.send(result);
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      if (error instanceof Error && 
          (error.message.includes('Invalid') || error.message.includes('expired'))) {
        logger.warn({
          requestId,
          operation: 'token_refresh_invalid',
          error: errorMessage,
          ipAddress: request.ip,
          userAgent: request.headers['user-agent'],
          executionTime,
          securityEvent: true
        }, 'Token refresh failed - invalid or expired token');
        
        return reply.status(401).send({
          error: 'Token refresh failed',
          message: error.message,
        });
      }

      logger.error({
        requestId,
        operation: 'token_refresh_system_error',
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
        ipAddress: request.ip,
        executionTime
      }, 'Token refresh failed due to system error');

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
    const startTime = Date.now();
    const requestId = crypto.randomUUID();
    const user = request.user as { id: string; email: string; role: string } | undefined;
    
    logger.debug({
      requestId,
      operation: 'get_current_user_request',
      userId: user?.id,
      email: user?.email,
      ipAddress: request.ip
    }, 'Get current user request received');

    try {
      if (!user) {
        logger.warn({
          requestId,
          operation: 'get_current_user_unauthorized',
          ipAddress: request.ip,
          reason: 'no_user_in_request',
          executionTime: Date.now() - startTime
        }, 'Get current user failed - no authenticated user');
        
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
        logger.error({
          requestId,
          operation: 'get_current_user_not_found',
          userId: user.id,
          email: user.email,
          executionTime: Date.now() - startTime,
          dataInconsistency: true
        }, 'User profile not found in database despite valid token');
        
        return reply.status(404).send({
          error: 'User not found',
          message: 'User no longer exists',
        });
      }

      const executionTime = Date.now() - startTime;

      logger.info({
        requestId,
        userId: userProfile.id,
        email: userProfile.email,
        role: userProfile.role,
        level: userProfile.currentLevel,
        executionTime,
        profileRetrieved: true
      }, 'User profile retrieved successfully');

      return reply.send(userProfile);
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      logger.error({
        requestId,
        operation: 'get_current_user_system_error',
        userId: user?.id,
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
        executionTime
      }, 'Failed to get current user profile due to system error');
      
      return reply.status(500).send({
        error: 'Internal server error',
        message: 'Failed to retrieve user profile',
      });
    }
  };
}