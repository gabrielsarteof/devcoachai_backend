import { JWTService } from '../../infrastructure/services/jwt.service';
import { IAuthRepository } from '../../domain/repositories/auth.repository.interface';
import { SessionEntity } from '../../domain/entities/session.entity';
import { messages } from '@/shared/constants/messages';

export class RefreshTokenUseCase {
  constructor(
    private readonly jwtService: JWTService,
    private readonly authRepository: IAuthRepository
  ) {}

  async execute(refreshToken: string, metadata?: { userAgent?: string; ipAddress?: string }) {
    const session = await this.authRepository.findSessionByToken(refreshToken);
    
    if (!session) {
      throw new Error(messages.auth.tokenInvalid);
    }

    const sessionEntity = new SessionEntity(session);
    
    if (sessionEntity.isExpired()) {
      await this.authRepository.deleteSession(session.id);
      throw new Error(messages.auth.tokenExpired);
    }

    const payload = await this.jwtService.verifyToken(refreshToken);
    
    if (payload.type !== 'refresh') {
      throw new Error(messages.auth.tokenInvalid);
    }

    const tokens = await this.jwtService.refreshTokens(refreshToken);

    await this.authRepository.deleteSession(session.id);

    const newSession = SessionEntity.create({
      userId: session.userId,
      refreshToken: tokens.refreshToken,
      userAgent: metadata?.userAgent || session.userAgent,
      ipAddress: metadata?.ipAddress || session.ipAddress,
    });

    await this.authRepository.createSession(newSession.getProps());

    return tokens;
  }
}