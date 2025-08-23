import { PrismaClient } from '@prisma/client';
import { IAuthRepository } from '../../domain/repositories/auth.repository.interface';
import { Session } from '../../domain/entities/session.entity';
import { Redis } from 'ioredis';

export class AuthRepository implements IAuthRepository {
  constructor(
    private readonly _prisma: PrismaClient,
    private readonly redis: Redis
  ) {}

  async createSession(session: Session): Promise<void> {
    const key = `session:${session.refreshToken}`;
    const ttl = Math.floor((session.expiresAt.getTime() - Date.now()) / 1000);
    
    await this.redis.setex(
      key,
      ttl,
      JSON.stringify(session)
    );

    await this.redis.sadd(`user:${session.userId}:sessions`, session.id);
  }

  async findSessionByToken(refreshToken: string): Promise<Session | null> {
    const key = `session:${refreshToken}`;
    const data = await this.redis.get(key);
    
    if (!data) return null;
    
    const session = JSON.parse(data) as Session;
    session.createdAt = new Date(session.createdAt);
    session.expiresAt = new Date(session.expiresAt);
    session.lastActivity = new Date(session.lastActivity);
    
    return session;
  }

  async deleteSession(sessionId: string): Promise<void> {
    const keys = await this.redis.keys('session:*');
    
    for (const key of keys) {
      const data = await this.redis.get(key);
      if (data) {
        const session = JSON.parse(data) as Session;
        if (session.id === sessionId) {
          await this.redis.del(key);
          await this.redis.srem(`user:${session.userId}:sessions`, sessionId);
          break;
        }
      }
    }
  }

  async deleteUserSessions(userId: string): Promise<void> {
    await this.redis.smembers(`user:${userId}:sessions`);
    const keys = await this.redis.keys('session:*');
    
    for (const key of keys) {
      const data = await this.redis.get(key);
      if (data) {
        const session = JSON.parse(data) as Session;
        if (session.userId === userId) {
          await this.redis.del(key);
        }
      }
    }
    
    await this.redis.del(`user:${userId}:sessions`);
  }

  async updateSessionActivity(sessionId: string): Promise<void> {
    const keys = await this.redis.keys('session:*');
    
    for (const key of keys) {
      const data = await this.redis.get(key);
      if (data) {
        const session = JSON.parse(data) as Session;
        if (session.id === sessionId) {
          session.lastActivity = new Date();
          const ttl = Math.floor((new Date(session.expiresAt).getTime() - Date.now()) / 1000);
          await this.redis.setex(key, ttl, JSON.stringify(session));
          break;
        }
      }
    }
  }
}