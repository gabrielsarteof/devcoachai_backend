import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import cookie from '@fastify/cookie';
import type { FastifyRequest } from 'fastify';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { config } from './config/env';
import { logger } from './shared/infrastructure/monitoring/logger';
import authPlugin from './modules/auth/infrastructure/plugin/auth.plugin';

const prisma = new PrismaClient({
  log: config.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
});

const redis = new Redis(config.REDIS_URL, {
  maxRetriesPerRequest: 3,
  retryStrategy: (times) => Math.min(times * 50, 2000),
});

const buildApp = async () => {
  const app = Fastify({
    logger,
    requestIdHeader: 'x-request-id',
    requestIdLogLabel: 'requestId',
    disableRequestLogging: false,
  });

  await app.register(helmet);
  await app.register(cors, {
    origin: config.CORS_ORIGIN,
    credentials: true,
  });
  await app.register(cookie, {
    secret: config.JWT_SECRET,
    parseOptions: {
      httpOnly: true,
      secure: config.NODE_ENV === 'production',
      sameSite: 'lax',
    },
  });

  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
    keyGenerator: function(request: FastifyRequest) {
      const user = request.user as { id?: string } | undefined;
      return user?.id || request.ip;
    },
    allowList: function(request: FastifyRequest) {
      // Nota : aqui é inserido a lógica de exceções de rate limit para rotas ou usuários específicos
      return false;
    },
  });

  await app.register(authPlugin, {
    prisma,
    redis,
  });

  app.get('/health', async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: config.NODE_ENV,
  }));

  const closeGracefully = async (signal: string) => {
    logger.info(`Received signal to terminate: ${signal}`);
    
    await app.close();
    await prisma.$disconnect();
    redis.disconnect();
    
    process.exit(0);
  };

  process.on('SIGINT', () => closeGracefully('SIGINT'));
  process.on('SIGTERM', () => closeGracefully('SIGTERM'));

  return app;
};

const start = async () => {
  try {
    const app = await buildApp();
    
    await app.listen({ 
      port: config.PORT, 
      host: '0.0.0.0' 
    });

    logger.info(`Server listening on http://0.0.0.0:${config.PORT}`);
  } catch (err) {
    logger.error(err);
    process.exit(1);
  }
};

start();