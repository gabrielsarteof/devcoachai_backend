import { IAuthRepository } from '../../domain/repositories/auth.repository.interface';
import { Session } from '../../domain/entities/session.entity';
import { Redis } from 'ioredis';
import { logger } from '@/shared/infrastructure/monitoring/logger';

export class AuthRepository implements IAuthRepository {
  constructor(
    private readonly redis: Redis
  ) {}

  async createSession(session: Session): Promise<void> {
    const startTime = Date.now();
    
    logger.info({
      operation: 'create_session',
      sessionId: session.id,
      userId: session.userId,
      userAgent: session.userAgent,
      ipAddress: session.ipAddress,
      expiresAt: session.expiresAt
    }, 'Creating user session');

    try {
      const key = `session:${session.refreshToken}`;
      const ttl = Math.floor((session.expiresAt.getTime() - Date.now()) / 1000);
      
      logger.debug({
        operation: 'session_redis_store',
        sessionId: session.id,
        redisKey: key,
        ttlSeconds: ttl
      }, 'Storing session in Redis');
      
      await this.redis.setex(
        key,
        ttl,
        JSON.stringify(session)
      );

      await this.redis.sadd(`user:${session.userId}:sessions`, session.id);

      const processingTime = Date.now() - startTime;
      
      logger.info({
        operation: 'create_session_success',
        sessionId: session.id,
        userId: session.userId,
        ttlSeconds: ttl,
        processingTime
      }, 'Session created successfully');
      
    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      logger.error({
        operation: 'create_session_failed',
        sessionId: session.id,
        userId: session.userId,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        processingTime
      }, 'Failed to create session');
      
      throw error;
    }
  }

  async findSessionByToken(refreshToken: string): Promise<Session | null> {
    const startTime = Date.now();
    
    logger.debug({
      operation: 'find_session_by_token',
      hasToken: !!refreshToken
    }, 'Finding session by refresh token');

    try {
      const key = `session:${refreshToken}`;
      const data = await this.redis.get(key);
      
      if (!data) {
        const processingTime = Date.now() - startTime;
        
        logger.info({
          operation: 'find_session_not_found',
          redisKey: key,
          processingTime
        }, 'Session not found in Redis');
        
        return null;
      }
      
      const session = JSON.parse(data) as Session;
      session.createdAt = new Date(session.createdAt);
      session.expiresAt = new Date(session.expiresAt);
      session.lastActivity = new Date(session.lastActivity);
      
      const processingTime = Date.now() - startTime;
      
      logger.info({
        operation: 'find_session_success',
        sessionId: session.id,
        userId: session.userId,
        isExpired: new Date() > session.expiresAt,
        lastActivity: session.lastActivity,
        processingTime
      }, 'Session found successfully');
      
      return session;
    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      logger.error({
        operation: 'find_session_failed',
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        processingTime
      }, 'Failed to find session by token');
      
      throw error;
    }
  }

  async deleteSession(sessionId: string): Promise<void> {
    const startTime = Date.now();
    
    logger.info({
      operation: 'delete_session',
      sessionId
    }, 'Deleting session');

    try {
      const keys = await this.redis.keys('session:*');
      let deletedSession: Session | null = null;
      
      for (const key of keys) {
        const data = await this.redis.get(key);
        if (data) {
          const session = JSON.parse(data) as Session;
          if (session.id === sessionId) {
            await this.redis.del(key);
            await this.redis.srem(`user:${session.userId}:sessions`, sessionId);
            deletedSession = session;
            
            logger.debug({
              operation: 'session_deleted_from_redis',
              sessionId,
              userId: session.userId,
              redisKey: key
            }, 'Session deleted from Redis');
            
            break;
          }
        }
      }

      const processingTime = Date.now() - startTime;
      
      if (deletedSession) {
        logger.info({
          operation: 'delete_session_success',
          sessionId,
          userId: deletedSession.userId,
          processingTime
        }, 'Session deleted successfully');
      } else {
        logger.warn({
          operation: 'delete_session_not_found',
          sessionId,
          keysChecked: keys.length,
          processingTime
        }, 'Session not found for deletion');
      }
      
    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      logger.error({
        operation: 'delete_session_failed',
        sessionId,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        processingTime
      }, 'Failed to delete session');
      
      throw error;
    }
  }

  async deleteUserSessions(userId: string): Promise<void> {
    const startTime = Date.now();
    
    logger.info({
      operation: 'delete_user_sessions',
      userId
    }, 'Deleting all sessions for user');

    try {
      await this.redis.smembers(`user:${userId}:sessions`);
      const keys = await this.redis.keys('session:*');
      let deletedCount = 0;
      
      for (const key of keys) {
        const data = await this.redis.get(key);
        if (data) {
          const session = JSON.parse(data) as Session;
          if (session.userId === userId) {
            await this.redis.del(key);
            deletedCount++;
          }
        }
      }
      
      await this.redis.del(`user:${userId}:sessions`);

      const processingTime = Date.now() - startTime;
      
      logger.info({
        operation: 'delete_user_sessions_success',
        userId,
        deletedCount,
        keysChecked: keys.length,
        processingTime
      }, 'All user sessions deleted successfully');
      
    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      logger.error({
        operation: 'delete_user_sessions_failed',
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        processingTime
      }, 'Failed to delete user sessions');
      
      throw error;
    }
  }

  async updateSessionActivity(sessionId: string): Promise<void> {
    const startTime = Date.now();
    
    logger.debug({
      operation: 'update_session_activity',
      sessionId
    }, 'Updating session activity');

    try {
      const keys = await this.redis.keys('session:*');
      let updatedSession: Session | null = null;
      
      for (const key of keys) {
        const data = await this.redis.get(key);
        if (data) {
          const session = JSON.parse(data) as Session;
          if (session.id === sessionId) {
            session.lastActivity = new Date();
            const ttl = Math.floor((new Date(session.expiresAt).getTime() - Date.now()) / 1000);
            await this.redis.setex(key, ttl, JSON.stringify(session));
            updatedSession = session;
            
            logger.debug({
              operation: 'session_activity_updated',
              sessionId,
              userId: session.userId,
              lastActivity: session.lastActivity,
              ttlSeconds: ttl
            }, 'Session activity timestamp updated');
            
            break;
          }
        }
      }

      const processingTime = Date.now() - startTime;
      
      if (updatedSession) {
        logger.info({
          operation: 'update_session_activity_success',
          sessionId,
          userId: updatedSession.userId,
          processingTime
        }, 'Session activity updated successfully');
      } else {
        logger.warn({
          operation: 'update_session_activity_not_found',
          sessionId,
          keysChecked: keys.length,
          processingTime
        }, 'Session not found for activity update');
      }
      
    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      logger.error({
        operation: 'update_session_activity_failed',
        sessionId,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        processingTime
      }, 'Failed to update session activity');
      
      throw error;
    }
  }
}