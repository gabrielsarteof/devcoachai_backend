import { IAuthRepository } from '../../domain/repositories/auth.repository.interface';

export class LogoutUseCase {
  constructor(private readonly authRepository: IAuthRepository) {}

  async execute(refreshToken: string): Promise<void> {
    const session = await this.authRepository.findSessionByToken(refreshToken);
    
    if (session) {
      await this.authRepository.deleteSession(session.id);
    }
  }
}