import type { FastifyRequest, FastifyReply, HookHandlerDoneFunction } from 'fastify';
import { JWTService } from '../services/jwt.service';
import { messages } from '@/shared/constants/messages';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: {
      sub: string;
      email: string;
      role: string;
      type: 'access' | 'refresh';
    };
    user: {
      id: string;
      email: string;
      role: string;
    };
  }
}

export class AuthMiddleware {
  constructor(private readonly jwtService: JWTService) {}

  authenticate = async (
    request: FastifyRequest,
    reply: FastifyReply,
    done: HookHandlerDoneFunction
  ): Promise<void> => {
    try {
      const authHeader = request.headers.authorization;
      
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return reply.status(401).send({
          error: messages.auth.unauthorized,
          message: 'Missing or invalid authorization header',
        });
      }

      const token = authHeader.substring(7);
      const payload = await this.jwtService.verifyToken(token);

      if (payload.type !== 'access') {
        return reply.status(401).send({
          error: messages.auth.tokenInvalid,
          message: 'Invalid token type',
        });
      }

      request.user = {
        id: payload.sub,
        email: payload.email,
        role: payload.role,
      };

      done();
    } catch (error) {
      return reply.status(401).send({
        error: messages.auth.tokenInvalid,
        message: error instanceof Error ? error.message : 'Authentication failed',
      });
    }
  };

  authorize = (roles: string[]) => {
    return async (
      request: FastifyRequest,
      reply: FastifyReply,
      done: HookHandlerDoneFunction
    ): Promise<void> => {
      const user = request.user as { id: string; email: string; role: string } | undefined;
      
      if (!user) {
        return reply.status(401).send({
          error: messages.auth.unauthorized,
          message: 'User not authenticated',
        });
      }

      if (!roles.includes(user.role)) {
        return reply.status(403).send({
          error: messages.general.forbidden,
          message: `Insufficient permissions. Required roles: ${roles.join(', ')}`,
        });
      }

      done();
    };
  };

  optionalAuth = async (
    request: FastifyRequest,
    _reply: FastifyReply,
    done: HookHandlerDoneFunction
  ): Promise<void> => {
    try {
      const authHeader = request.headers.authorization;
      
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        const payload = await this.jwtService.verifyToken(token);

        if (payload.type === 'access') {
          request.user = {
            id: payload.sub,
            email: payload.email,
            role: payload.role,
          };
        }
      }
    } catch {
    }

    done();
  };
}