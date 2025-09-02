import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { WebSocketServer } from './socket.server';
import { JWTService } from '@/modules/auth/infrastructure/services/jwt.service';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';

export interface WebSocketPluginOptions {
  prisma: PrismaClient;
  redis: Redis;
}

declare module 'fastify' {
  interface FastifyInstance {
    ws: WebSocketServer;
  }
}

const websocketPlugin: FastifyPluginAsync<WebSocketPluginOptions> = async function(
  fastify: FastifyInstance,
  options: WebSocketPluginOptions
): Promise<void> {
  const jwtService = JWTService.getInstance();
  
  const wsServer = new WebSocketServer(
    fastify.server,
    jwtService,
    options.prisma,
    options.redis
  );

  fastify.decorate('ws', wsServer);
  
  fastify.addHook('onClose', async () => {
    wsServer.getIO().close();
  });

  fastify.log.info('WebSocket plugin registered successfully');
};

export default fp(websocketPlugin, {
  name: 'websocket-plugin',
  dependencies: ['auth-plugin'],
});