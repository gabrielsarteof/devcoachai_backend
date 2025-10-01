import { JWTService } from '../../infrastructure/services/jwt.service';
import { IAuthRepository } from '../../domain/repositories/auth.repository.interface';
import { SessionEntity } from '../../domain/entities/session.entity';
import { TokenInvalidError, TokenExpiredError } from '../../domain/errors';
import { logger } from '@/shared/infrastructure/monitoring/logger';

export class RefreshTokenUseCase {
  constructor(
    private readonly jwtService: JWTService,
    private readonly authRepository: IAuthRepository
  ) {}

  async execute(refreshToken: string, metadata?: { userAgent?: string; ipAddress?: string }) {
    const startTime = Date.now();
    
    logger.info({
      operation: 'token_refresh_attempt',
      ipAddress: metadata?.ipAddress,
      userAgent: metadata?.userAgent
    }, 'Token refresh attempt started');

    try {
      // Verificar se a sessão existe no Redis
      const session = await this.authRepository.findSessionByToken(refreshToken);
      
      if (!session) {
        logger.warn({
          reason: 'session_not_found',
          ipAddress: metadata?.ipAddress,
          executionTime: Date.now() - startTime
        }, 'Token refresh failed - session not found');
        throw new TokenInvalidError();
      }

      // Verificar se a sessão não expirou
      const sessionEntity = new SessionEntity(session);
      
      if (sessionEntity.isExpired()) {
        logger.warn({
          userId: session.userId,
          sessionId: session.id,
          reason: 'session_expired',
          ipAddress: metadata?.ipAddress,
          executionTime: Date.now() - startTime
        }, 'Token refresh failed - session expired');

        await this.authRepository.deleteSession(session.id);
        throw new TokenExpiredError();
      }

      // Verificar se o JWT é válido e do tipo refresh
      const payload = await this.jwtService.verifyToken(refreshToken);
      
      if (payload.type !== 'refresh') {
        logger.warn({
          userId: session.userId,
          tokenType: payload.type,
          reason: 'invalid_token_type',
          ipAddress: metadata?.ipAddress,
          executionTime: Date.now() - startTime
        }, 'Token refresh failed - invalid token type');
        throw new TokenInvalidError();
      }

      // Gerar novos tokens
      const tokens = await this.jwtService.generateTokenPair({
        sub: payload.sub,
        email: payload.email,
        role: payload.role,
      });

      // Invalidar sessão antiga
      await this.authRepository.deleteSession(session.id);

      // Criar nova sessão com novo refresh token
      const newSession = SessionEntity.create({
        userId: session.userId,
        refreshToken: tokens.refreshToken,
        userAgent: metadata?.userAgent || session.userAgent,
        ipAddress: metadata?.ipAddress || session.ipAddress,
      });

      await this.authRepository.createSession(newSession.getProps());

      logger.info({
        userId: session.userId,
        oldSessionId: session.id,
        newSessionId: newSession.getProps().id,
        executionTime: Date.now() - startTime,
        ipAddress: metadata?.ipAddress
      }, 'Token refresh successful');

      return tokens;
    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : 'Unknown error',
        ipAddress: metadata?.ipAddress,
        executionTime: Date.now() - startTime
      }, 'Token refresh use case failed');
      throw error;
    }
  }
}