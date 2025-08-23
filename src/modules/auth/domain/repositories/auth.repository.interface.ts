import { Session } from '../entities/session.entity';

export interface IAuthRepository {
  createSession(session: Session): Promise<void>;
  findSessionByToken(refreshToken: string): Promise<Session | null>;
  deleteSession(sessionId: string): Promise<void>;
  deleteUserSessions(userId: string): Promise<void>;
  updateSessionActivity(sessionId: string): Promise<void>;
}