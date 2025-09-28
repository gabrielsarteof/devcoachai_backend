import Fastify, { FastifyInstance } from 'fastify';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';

// Plugins dos módulos
import authPlugin from '../../src/modules/auth/infrastructure/plugin/auth.plugin';
import challengePlugin from '../../src/modules/challenges/infrastructure/plugin/challenge.plugin';
import websocketPlugin from '../../src/shared/infrastructure/websocket/websocket.plugin';
import metricPlugin from '../../src/modules/metrics/infrastructure/plugin/metric.plugin';
import aiPlugin from '../../src/modules/ai/infrastructure/plugin/ai.plugin';

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

    // Registro de plugins em ordem de dependência
    await app.register(authPlugin, { prisma, redis });
    await app.register(websocketPlugin, { prisma, redis });
    await app.register(challengePlugin, { prisma, redis });
    await app.register(aiPlugin, { prisma, redis });
    await app.register(metricPlugin, { prisma, redis, wsServer: app.ws });

    await app.ready();
    return { app, prisma, redis };
  } catch (error) {
    await app.close().catch(() => {});
    await prisma.$disconnect().catch(() => {});
    redis.disconnect();
    throw error;
  }
}

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
  // Limpeza de dados de teste em ordem de dependência reversa
  try {
    // Tabelas de relação e dependências
    await prisma.trapDetection.deleteMany();
    await prisma.metricSnapshot.deleteMany();
    await prisma.codeEvent.deleteMany();
    await prisma.aIInteraction.deleteMany();
    await prisma.validationLog.deleteMany();
    await prisma.validationRule.deleteMany();
    await prisma.governanceMetrics.deleteMany();

    // Tentativas de desafio
    await prisma.challengeAttempt.deleteMany();

    // Relacionamentos de usuário
    await prisma.xPTransaction.deleteMany();
    await prisma.userBadge.deleteMany();
    await prisma.certificate.deleteMany();
    await prisma.notification.deleteMany();
    await prisma.userMetrics.deleteMany();

    // Desafios
    await prisma.challenge.deleteMany();

    // Badges
    await prisma.badge.deleteMany();

    // Usuários
    await prisma.user.deleteMany();

    // Times e empresas
    await prisma.team.deleteMany();
    await prisma.billing.deleteMany();
    await prisma.company.deleteMany();
  } catch (error) {
    console.error('Error during test data cleanup:', error);
    // Fallback: limpeza via TRUNCATE
    try {
      await prisma.$executeRaw`TRUNCATE TABLE "TrapDetection", "MetricSnapshot", "CodeEvent", "AIInteraction", "ValidationLog", "ValidationRule", "GovernanceMetrics", "ChallengeAttempt", "XPTransaction", "UserBadge", "Certificate", "Notification", "UserMetrics", "Challenge", "Badge", "User", "Team", "Billing", "Company" RESTART IDENTITY CASCADE`;
    } catch (truncateError) {
      console.error('Failed to truncate tables:', truncateError);
    }
  }
}

// Funções auxiliares para isolamento de testes

// Geração de IDs únicos para testes
export function generateTestId(): string {
  return `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// Limpeza de dados com isolamento Redis
export async function cleanTestDataWithRedis(prisma: PrismaClient, redis: Redis, testId?: string): Promise<void> {
  // Limpeza seletiva do Redis por testId
  if (testId) {
    try {
      const keys = await redis.keys(`*${testId}*`);
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    } catch (error) {
      console.warn('Failed to clean Redis test data:', error);
    }
  } else {
    try {
      await redis.flushdb();
    } catch (error) {
      console.warn('Failed to flush Redis:', error);
    }
  }

  // Limpeza padrão do Prisma
  await cleanTestData(prisma);
}

// Criação de usuário de teste com ID único
export async function createTestUser(
  app: FastifyInstance,
  testId: string,
  userType: 'junior' | 'senior' | 'admin' = 'junior',
  role?: string
): Promise<{
  user: any;
  tokens: { accessToken: string; refreshToken: string };
}> {
  const email = `${userType}-${testId}@company.com`;
  const password = `${userType.charAt(0).toUpperCase() + userType.slice(1)}@123`;
  const name = `${userType.charAt(0).toUpperCase() + userType.slice(1)} Developer`;

  const response = await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: {
      email,
      password,
      name,
      acceptTerms: true,
    },
  });

  if (response.statusCode !== 201) {
    throw new Error(`Failed to create ${userType} user: ${response.statusCode} - ${response.body}`);
  }

  const body = JSON.parse(response.body);
  const user = body.data?.user || body.user;
  const tokens = {
    accessToken: body.data?.accessToken || body.accessToken,
    refreshToken: body.data?.refreshToken || body.refreshToken,
  };

  if (!user || !user.id) {
    throw new Error(`${userType} user not properly returned from registration`);
  }

  return { user, tokens };
}