import { PrismaClient } from '@prisma/client';
import { LoginDTO } from '../../domain/schemas/auth.schema';
import { UserEntity } from '@/modules/users/domain/entities/user.entity';
import { JWTService } from '../../infrastructure/services/jwt.service';
import { IAuthRepository } from '../../domain/repositories/auth.repository.interface';
import { SessionEntity } from '../../domain/entities/session.entity';
import { messages } from '@/shared/constants/messages';

export class LoginUseCase {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly jwtService: JWTService,
    private readonly authRepository: IAuthRepository
  ) {}

  async execute(data: LoginDTO, metadata?: { userAgent?: string; ipAddress?: string }) {
    const user = await this.prisma.user.findUnique({
      where: { email: data.email },
    });

    if (!user) {
      throw new Error(messages.auth.invalidCredentials);
    }

    const userEntity = UserEntity.fromPrisma(user);
    const isValidPassword = await userEntity.verifyPassword(data.password);

    if (!isValidPassword) {
      throw new Error(messages.auth.invalidCredentials);
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
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

    return {
      user: userEntity.toJSON(),
      accessToken,
      refreshToken,
    };
  }
}