import { Server as SocketServer, Socket } from 'socket.io';
import { Server as HTTPServer } from 'http';
import { logger } from '@/shared/infrastructure/monitoring/logger';
import { JWTService } from '@/modules/auth/infrastructure/services/jwt.service';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';

export interface SocketData {
  userId: string;
  attemptId?: string;
  sessionId?: string;
}

export interface MetricPayload {
  attemptId: string;
  metrics: {
    dependencyIndex: number;
    passRate: number;
    checklistScore: number;
  };
  timestamp: Date;
}

export class WebSocketServer {
  private io: SocketServer;
  private connections: Map<string, Socket> = new Map();
  
  constructor(
    httpServer: HTTPServer,
    private readonly jwtService: JWTService,
    private readonly prisma: PrismaClient,
    private readonly redis: Redis
  ) {
    this.io = new SocketServer(httpServer, {
      cors: {
        origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
        credentials: true,
      },
      transports: ['websocket', 'polling'],
    });

    this.setupMiddleware();
    this.setupEventHandlers();
  }

  private setupMiddleware(): void {
    this.io.use(async (socket, next) => {
      try {
        const token = socket.handshake.auth.token;
        if (!token) {
          return next(new Error('Authentication required'));
        }

        const payload = await this.jwtService.verifyToken(token);
        if (payload.type !== 'access') {
          return next(new Error('Invalid token type'));
        }

        socket.data = {
          userId: payload.sub,
        } as SocketData;

        logger.info({ userId: payload.sub }, 'WebSocket connection authenticated');
        next();
      } catch (error) {
        logger.error({ error }, 'WebSocket authentication failed');
        next(new Error('Authentication failed'));
      }
    });
  }

  private setupEventHandlers(): void {
    this.io.on('connection', (socket: Socket) => {
      const userId = socket.data.userId;
      logger.info({ userId, socketId: socket.id }, 'Client connected');
      
      this.connections.set(userId, socket);
      socket.join(`user:${userId}`);

      socket.on('join:attempt', async (attemptId: string) => {
        try {
          const attempt = await this.prisma.challengeAttempt.findUnique({
            where: { id: attemptId },
          });

          if (!attempt || attempt.userId !== userId) {
            socket.emit('error', { message: 'Invalid attempt' });
            return;
          }

          socket.data.attemptId = attemptId;
          socket.data.sessionId = attempt.sessionId;
          socket.join(`attempt:${attemptId}`);
          
          logger.info({ userId, attemptId }, 'Joined attempt room');
          socket.emit('joined:attempt', { attemptId });
        } catch (error) {
          logger.error({ error, userId, attemptId }, 'Failed to join attempt');
          socket.emit('error', { message: 'Failed to join attempt' });
        }
      });

      socket.on('leave:attempt', (attemptId: string) => {
        socket.leave(`attempt:${attemptId}`);
        delete socket.data.attemptId;
        logger.info({ userId, attemptId }, 'Left attempt room');
      });

      socket.on('disconnect', () => {
        this.connections.delete(userId);
        logger.info({ userId, socketId: socket.id }, 'Client disconnected');
      });

      socket.on('error', (error) => {
        logger.error({ error, userId }, 'Socket error');
      });
    });
  }

  emitToUser(userId: string, event: string, data: any): void {
    this.io.to(`user:${userId}`).emit(event, data);
  }

  emitToAttempt(attemptId: string, event: string, data: any): void {
    this.io.to(`attempt:${attemptId}`).emit(event, data);
  }

  emitMetricUpdate(attemptId: string, metrics: MetricPayload): void {
    this.io.to(`attempt:${attemptId}`).emit('metrics:update', metrics);
    
    const cacheKey = `metrics:${attemptId}:latest`;
    this.redis.setex(cacheKey, 300, JSON.stringify(metrics));
  }

  broadcast(event: string, data: any): void {
    this.io.emit(event, data);
  }

  getConnectedUsers(): string[] {
    return Array.from(this.connections.keys());
  }

  isUserConnected(userId: string): boolean {
    return this.connections.has(userId);
  }

  getIO(): SocketServer {
    return this.io;
  }
}