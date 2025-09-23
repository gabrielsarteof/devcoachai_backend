import Fastify, { FastifyInstance } from 'fastify';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import authPlugin from '../../src/modules/auth/infrastructure/plugin/auth.plugin';

export async function buildTestApp(): Promise<{
  app: FastifyInstance;
  prisma: PrismaClient;
  redis: Redis;
}> {
  // Configurar Prisma para testes - usar a URL correta do ambiente de teste
  const databaseUrl = process.env.DATABASE_TEST_URL || process.env.DATABASE_URL;
  
  if (!databaseUrl) {
    throw new Error('DATABASE_URL or DATABASE_TEST_URL must be set for tests');
  }

  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: databaseUrl,
      },
    },
    log: [], // Desabilitar logs em testes
  });

  // Configurar Redis para testes - usar a URL correta do ambiente
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6380';
  
  const redis = new Redis(redisUrl, {
    retryStrategy: () => null, // Não retry em testes
    maxRetriesPerRequest: 1,
    lazyConnect: true,
  });

  // Construir aplicação Fastify
  const app = Fastify({
    logger: false, // Desabilitar logs em testes
  });

  try {
    // Testar conexões antes de continuar
    await prisma.$connect();
    await redis.connect();

    // Registrar plugins básicos
    await app.register(helmet, {
      contentSecurityPolicy: false,
    });
    
    await app.register(cors, {
      origin: true,
      credentials: true,
    });

    // Registrar plugin de autenticação
    await app.register(authPlugin, {
      prisma,
      redis,
    });

    // Aguardar inicialização completa
    await app.ready();

    return { app, prisma, redis };
  } catch (error) {
    // Cleanup em caso de erro
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

// Função helper para limpar dados de teste - Versão robusta
export async function cleanTestData(prisma: PrismaClient): Promise<void> {
  try {
    // Início com limpeza básica e essencial para evitar conflitos nos testes
    // Primeiro, limpar usuários de teste que é a causa principal dos conflitos
    await prisma.user.deleteMany({
      where: { 
        OR: [
          { email: { contains: 'test' } },
          { email: { contains: '@example.com' } },
          { email: { startsWith: 'test' } }
        ]
      },
    });
    
    // Limpeza opcional de outras tabelas se existirem
    const cleanupOperations = [
      () => prisma.userBadge?.deleteMany({}),
      () => prisma.badge?.deleteMany({}),
      () => prisma.xPTransaction?.deleteMany({}),
      () => prisma.aIInteraction?.deleteMany({}), // CORRIGIDO: nome correto da tabela
      () => prisma.codeEvent?.deleteMany({}),
      () => prisma.metricSnapshot?.deleteMany({}),
      () => prisma.trapDetection?.deleteMany({}),
      () => prisma.validationLog?.deleteMany({}),
      () => prisma.challengeAttempt?.deleteMany({}),
      () => prisma.userMetrics?.deleteMany({}),
      () => prisma.notification?.deleteMany({}),
      () => prisma.certificate?.deleteMany({}),
      () => prisma.challenge?.deleteMany({}),
      () => prisma.validationRule?.deleteMany({}),
      () => prisma.governanceMetrics?.deleteMany({}),
      () => prisma.team?.deleteMany({}),
      () => prisma.billing?.deleteMany({}),
      () => prisma.company?.deleteMany({})
    ];

    // Executar limpezas opcionais sem falhar se a tabela não existir
    for (const operation of cleanupOperations) {
      try {
        await operation();
      } catch (error) {
        // Silenciar erros de tabelas que não existem
        continue;
      }
    }
  } catch (error) {
    console.warn('Error cleaning test data:', error);
    // Em caso de erro, pelo menos tentar limpar usuários de teste
    try {
      await prisma.user.deleteMany({
        where: { 
          email: { contains: 'test' }
        },
      });
    } catch (basicError) {
      console.warn('Even basic user cleanup failed:', basicError);
    }
  }
}