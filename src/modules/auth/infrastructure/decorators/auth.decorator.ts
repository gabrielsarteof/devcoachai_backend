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
    authenticate: typeof AuthMiddleware.prototype.authenticate;
    authorize: typeof AuthMiddleware.prototype.authorize;
    optionalAuth: typeof AuthMiddleware.prototype.optionalAuth;
  }
}