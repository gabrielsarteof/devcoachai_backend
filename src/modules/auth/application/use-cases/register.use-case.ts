import { PrismaClient } from '@prisma/client';
import { RegisterDTO } from '../../domain/schemas/auth.schema';
import { UserEntity } from '@/modules/users/domain/entities/user.entity';
import { JWTService } from '../../infrastructure/services/jwt.service';
import { IAuthRepository } from '../../domain/repositories/auth.repository.interface';
import { SessionEntity } from '../../domain/entities/session.entity';
import { messages } from '@/shared/constants/messages';
import { UserRole } from '@/shared/domain/enums';
import { logger } from '@/shared/infrastructure/monitoring/logger';

export class RegisterUseCase {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly jwtService: JWTService,
    private readonly authRepository: IAuthRepository
  ) {}

  async execute(data: RegisterDTO, metadata?: { userAgent?: string; ipAddress?: string }) {
    const startTime = Date.now();
    
    logger.info({
      operation: 'user_registration_attempt',
      email: data.email,
      name: data.name,
      companyId: data.companyId,
      ipAddress: metadata?.ipAddress,
      userAgent: metadata?.userAgent
    }, 'Registration attempt started');

    try {
      const existingUser = await this.prisma.user.findUnique({
        where: { email: data.email },
      });

      if (existingUser) {
        logger.warn({
          email: data.email,
          reason: 'email_already_exists',
          ipAddress: metadata?.ipAddress,
          executionTime: Date.now() - startTime
        }, 'Registration failed - email already exists');
        throw new Error(messages.auth.emailAlreadyExists);
      }

      const userEntity = await UserEntity.createNew({
        email: data.email,
        password: data.password,
        name: data.name,
        role: UserRole.JUNIOR,
        yearsOfExperience: 0,
        preferredLanguages: [],
        companyId: data.companyId,
      });

      const user = await this.prisma.user.create({
        data: {
          ...userEntity.toPrisma(),
          termsAcceptedAt: new Date(),
        },
      });

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
        email: user.email,
        name: user.name,
        role: user.role,
        companyId: user.companyId,
        executionTime: Date.now() - startTime,
        ipAddress: metadata?.ipAddress
      }, 'User registration successful');

      return {
        user: userEntity.toJSON(),
        accessToken,
        refreshToken,
      };
    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : 'Unknown error',
        email: data.email,
        name: data.name,
        ipAddress: metadata?.ipAddress,
        executionTime: Date.now() - startTime
      }, 'Registration use case failed');
      throw error;
    }
  }
}