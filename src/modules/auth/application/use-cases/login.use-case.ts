import { PrismaClient } from '@prisma/client';
import { LoginDTO } from '../../domain/schemas/auth.schema';
import { UserEntity } from '@/modules/users/domain/entities/user.entity';
import { JWTService } from '../../infrastructure/services/jwt.service';
import { IAuthRepository } from '../../domain/repositories/auth.repository.interface';
import { SessionEntity } from '../../domain/entities/session.entity';
import { messages } from '@/shared/constants/messages';
import { logger } from '@/shared/infrastructure/monitoring/logger';

export class LoginUseCase {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly jwtService: JWTService,
    private readonly authRepository: IAuthRepository
  ) {}

  async execute(data: LoginDTO, metadata?: { userAgent?: string; ipAddress?: string }) {
    const startTime = Date.now();
    
    logger.info({
      operation: 'user_login_attempt',
      email: data.email,
      ipAddress: metadata?.ipAddress,
      userAgent: metadata?.userAgent
    }, 'Login attempt started');

    try {
      const user = await this.prisma.user.findUnique({
        where: { email: data.email },
      });

      if (!user) {
        logger.warn({
          email: data.email,
          ipAddress: metadata?.ipAddress,
          reason: 'user_not_found',
          executionTime: Date.now() - startTime
        }, 'Login failed - user not found');
        throw new Error(messages.auth.invalidCredentials);
      }

      const userEntity = UserEntity.fromPrisma(user);
      const isValidPassword = await userEntity.verifyPassword(data.password);

      if (!isValidPassword) {
        logger.warn({
          userId: user.id,
          email: data.email,
          ipAddress: metadata?.ipAddress,
          reason: 'invalid_password',
          executionTime: Date.now() - startTime
        }, 'Login failed - invalid password');
        throw new Error(messages.auth.invalidCredentials);
      }

      try {
        await this.prisma.user.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() },
        });
      } catch (updateError) {
        // Falha no update não impede o login
        logger.warn({
          userId: user.id,
          email: data.email,
          error: updateError instanceof Error ? updateError.message : 'Unknown update error',
          executionTime: Date.now() - startTime
        }, 'Failed to update lastLoginAt, but login will continue');
      }

      const { accessToken, refreshToken } = await this.jwtService.generateTokenPair({
        sub: user.id,
        email: user.email,
        role: user.role,
      });

      const session = SessionEntity.create({
        userId: user.id,
        refreshToken,
        userAgent: metadata?.userAgent,
        ipAddress: metadata?.ipAddress,
      });

      await this.authRepository.createSession(session.getProps());

      logger.info({
        userId: user.id,
        email: data.email,
        role: user.role,
        executionTime: Date.now() - startTime,
        ipAddress: metadata?.ipAddress
      }, 'Login successful');

      return {
        user: userEntity.toJSON(),
        accessToken,
        refreshToken,
      };
    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : 'Unknown error',
        email: data.email,
        ipAddress: metadata?.ipAddress,
        executionTime: Date.now() - startTime
      }, 'Login use case failed');
      throw error;
    }
  }
}