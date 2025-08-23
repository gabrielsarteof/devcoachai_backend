import { PrismaClient } from '@prisma/client';
import { RegisterDTO } from '../../domain/schemas/auth.schema';
import { UserEntity } from '@/modules/users/domain/entities/user.entity';
import { JWTService } from '../../infrastructure/services/jwt.service';
import { IAuthRepository } from '../../domain/repositories/auth.repository.interface';
import { SessionEntity } from '../../domain/entities/session.entity';
import { messages } from '@/shared/constants/messages';
import { UserRole } from '@/shared/domain/enums';

export class RegisterUseCase {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly jwtService: JWTService,
    private readonly authRepository: IAuthRepository
  ) {}

  async execute(data: RegisterDTO, metadata?: { userAgent?: string; ipAddress?: string }) {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: data.email },
    });

    if (existingUser) {
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

    return {
      user: userEntity.toJSON(),
      accessToken,
      refreshToken,
    };
  }
}