import jwt from '@fastify/jwt';
import type { FastifyInstance } from 'fastify';
import { config } from '@/config/env';

export interface TokenPayload {
  sub: string;
  email: string;
  role: string;
  type: 'access' | 'refresh';
  iat?: number;
  exp?: number;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export class JWTService {
  private static instance: JWTService;
  private fastify?: FastifyInstance;

  private constructor() {}

  static getInstance(): JWTService {
    if (!JWTService.instance) {
      JWTService.instance = new JWTService();
    }
    return JWTService.instance;
  }

  async initialize(fastify: FastifyInstance): Promise<void> {
    this.fastify = fastify;
    await fastify.register(jwt, {
      secret: config.JWT_SECRET,
      sign: {
        expiresIn: '15m',
      },
    });
  }

  async generateTokenPair(payload: Omit<TokenPayload, 'type' | 'iat' | 'exp'>): Promise<TokenPair> {
    if (!this.fastify) {
      throw new Error('JWT Service not initialized');
    }

    const accessToken = await this.fastify.jwt.sign(
      { ...payload, type: 'access' },
      { expiresIn: '15m' }
    );

    const refreshToken = await this.fastify.jwt.sign(
      { ...payload, type: 'refresh' },
      { expiresIn: '7d' }
    );

    return { accessToken, refreshToken };
  }

  async verifyToken(token: string): Promise<TokenPayload> {
    if (!this.fastify) {
      throw new Error('JWT Service not initialized');
    }

    try {
      const decoded = await this.fastify.jwt.verify<TokenPayload>(token);
      return decoded;
    } catch (error) {
      throw new Error('Invalid or expired token');
    }
  }

  async refreshTokens(refreshToken: string): Promise<TokenPair> {
    const payload = await this.verifyToken(refreshToken);
    
    if (payload.type !== 'refresh') {
      throw new Error('Invalid token type');
    }

    return this.generateTokenPair({
      sub: payload.sub,
      email: payload.email,
      role: payload.role,
    });
  }
}