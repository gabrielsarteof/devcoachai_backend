import type { FastifyInstance } from 'fastify';
import { AuthMiddleware } from '../middleware/auth.middleware';

export function registerAuthDecorators(
  fastify: FastifyInstance,
  authMiddleware: AuthMiddleware
): void {
  fastify.decorate('authenticate', authMiddleware.authenticate);
  fastify.decorate('authorize', authMiddleware.authorize);
  fastify.decorate('optionalAuth', authMiddleware.optionalAuth);
}

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    authorize: (roles: string[]) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    optionalAuth: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}