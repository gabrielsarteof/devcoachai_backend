import Fastify, { FastifyInstance } from 'fastify';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import authPlugin from '../../src/modules/auth/infrastructure/plugin/auth.plugin';

export async function buildTestApp(): Promise<{
  app: FastifyInstance;
  prisma: PrismaClient;
  redis: Redis;
}> {
  const prisma = new PrismaClient({
    datasourceUrl: process.env.DATABASE_TEST_URL || process.env.DATABASE_URL,
  });

  const redis = new Redis({
    host: 'localhost',
    port: 6379,
    db: 1, 
  });

  const app = Fastify({
    logger: false, 
  });

  await app.register(authPlugin, {
    prisma,
    redis,
  });

  await app.ready();

  return { app, prisma, redis };
}