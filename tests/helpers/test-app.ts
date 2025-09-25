import Fastify, { FastifyInstance } from 'fastify';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';

// Importe TODOS os plugins que seus módulos dependem
import authPlugin from '../../src/modules/auth/infrastructure/plugin/auth.plugin';
import challengePlugin from '../../src/modules/challenges/infrastructure/plugin/challenge.plugin';

export async function buildTestApp(): Promise<{
  app: FastifyInstance;
  prisma: PrismaClient;
  redis: Redis;
}> {
  const databaseUrl = process.env.DATABASE_TEST_URL || process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_TEST_URL must be set for tests');
  }

  const prisma = new PrismaClient({
    datasources: { db: { url: databaseUrl } },
    log: [],
  });

  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6380';
  const redis = new Redis(redisUrl, {
    retryStrategy: () => null,
    maxRetriesPerRequest: 1,
    lazyConnect: true,
  });

  const app = Fastify({ logger: false });

  try {
    await prisma.$connect();
    await redis.connect();

    await app.register(helmet, { contentSecurityPolicy: false });
    await app.register(cors, { origin: true, credentials: true });

    // Registre os plugins na ordem de dependência correta
    await app.register(authPlugin, { prisma, redis });
    await app.register(challengePlugin, { prisma, redis });

    await app.ready();
    return { app, prisma, redis };
  } catch (error) {
    await app.close().catch(() => {});
    await prisma.$disconnect().catch(() => {});
    redis.disconnect();
    throw error;
  }
}

// O resto do arquivo (cleanupTestApp, cleanTestData) pode permanecer o mesmo
// ...
export async function cleanupTestApp(
  app: FastifyInstance,
  prisma: PrismaClient,
  redis: Redis
): Promise<void> {
  try {
    if (app) {
      await app.close();
    }
  } catch (error) {
    console.error('Error closing app:', error);
  }

  try {
    if (prisma) {
      await prisma.$disconnect();
    }
  } catch (error) {
    console.error('Error disconnecting Prisma:', error);
  }

  try {
    if (redis) {
      redis.disconnect();
    }
  } catch (error) {
    console.error('Error disconnecting Redis:', error);
  }
}

export async function cleanTestData(prisma: PrismaClient): Promise<void> {
  // Lista de tabelas em ordem de dependência reversa
  const deleteOperations = [
    // Primeiro, deletar tabelas que dependem de outras
    prisma.trapDetection.deleteMany(),
    prisma.metricSnapshot.deleteMany(),
    prisma.codeEvent.deleteMany(),
    prisma.aIInteraction.deleteMany(),
    prisma.challengeAttempt.deleteMany(),
    prisma.validationLog.deleteMany(),
    prisma.validationRule.deleteMany(),
    prisma.governanceMetrics.deleteMany(),
    prisma.xPTransaction.deleteMany(),
    prisma.userBadge.deleteMany(),
    prisma.certificate.deleteMany(),
    prisma.notification.deleteMany(),
    prisma.userMetrics.deleteMany(),
    
    // Depois, deletar tabelas principais
    prisma.challenge.deleteMany(),
    prisma.badge.deleteMany(),
    prisma.user.deleteMany(),
    prisma.team.deleteMany(),
    prisma.billing.deleteMany(),
    prisma.company.deleteMany(),
  ];

  // Executar todas as operações em sequência
  for (const operation of deleteOperations) {
    try {
      await operation;
    } catch (error) {
      // Continuar mesmo se alguma tabela não existir
      continue;
    }
  }
}