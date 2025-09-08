import { IAuthRepository } from '../../domain/repositories/auth.repository.interface';
import { logger } from '@/shared/infrastructure/monitoring/logger';

export class LogoutUseCase {
  constructor(private readonly authRepository: IAuthRepository) {}

  async execute(refreshToken: string): Promise<void> {
    const startTime = Date.now();
    
    logger.info({
      operation: 'user_logout_attempt'
    }, 'Logout attempt started');

    try {
      const session = await this.authRepository.findSessionByToken(refreshToken);
      
      if (session) {
        logger.info({
          userId: session.userId,
          sessionId: session.id,
          operation: 'session_found'
        }, 'Session found for logout');

        await this.authRepository.deleteSession(session.id);

        logger.info({
          userId: session.userId,
          sessionId: session.id,
          executionTime: Date.now() - startTime
        }, 'Logout successful - session deleted');
      } else {
        logger.warn({
          reason: 'session_not_found',
          executionTime: Date.now() - startTime
        }, 'Logout attempt with invalid session token');
      }
    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : 'Unknown error',
        executionTime: Date.now() - startTime
      }, 'Logout use case failed');
      throw error;
    }
  }
}