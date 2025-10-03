// Mocks e utilitários centralizados para testes

import { vi } from 'vitest';

// Fábrica de mock para logger
export const createMockLogger = () => ({
  child: vi.fn().mockReturnThis(),
  info: vi.fn(),
  debug: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  trace: vi.fn(),
  fatal: vi.fn(),
});

// Fábrica de mock para Redis
export const createMockRedis = () => ({
  get: vi.fn(),
  set: vi.fn(),
  setex: vi.fn(),
  del: vi.fn(),
  keys: vi.fn(),
  flushdb: vi.fn(),
  pipeline: vi.fn().mockReturnValue({
    exec: vi.fn().mockResolvedValue([]),
  }),
});

// Fábrica de mock para Prisma
export const createMockPrisma = () => ({
  user: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
  },
  challenge: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
  },
  aIInteraction: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
  },
  challengeAttempt: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
  },
  governanceMetrics: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
  },
  validationLog: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
  },
  validationRule: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
  },
  codeEvent: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    createMany: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
  },
  trapDetection: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
  },
  metricSnapshot: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
  },
  xPTransaction: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
  },
  userBadge: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
  },
  badge: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
  },
  certificate: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
  },
  notification: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
  },
  userMetrics: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
  },
  team: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
  },
  billing: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
  },
  company: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
  },
  $executeRaw: vi.fn(),
  $queryRaw: vi.fn(),
  $transaction: vi.fn(),
});

// Mock padrão do logger para vi.mock
export const MOCK_LOGGER = createMockLogger();

// Utilitário para criar mock de usuário
export const createMockUser = (overrides = {}) => ({
  id: 'test-user-id',
  email: 'test@example.com',
  name: 'Test User',
  role: 'JUNIOR',
  ...overrides,
});

// Utilitário para criar mock de tokens
export const createMockTokens = (overrides = {}) => ({
  accessToken: 'mock-access-token',
  refreshToken: 'mock-refresh-token',
  ...overrides,
});

// Utilitário para criar mock de contexto de desafio
export const createMockChallengeContext = (overrides = {}) => ({
  challengeId: 'test-challenge-id',
  title: 'Test Challenge',
  category: 'BACKEND',
  keywords: ['test', 'challenge'],
  allowedTopics: ['implementation', 'algorithm'],
  forbiddenPatterns: ['DROP\\s+TABLE'],
  difficulty: 'MEDIUM',
  targetMetrics: {
    maxDI: 40,
    minPR: 70,
    minCS: 8,
  },
  learningObjectives: ['understand testing'],
  techStack: ['node'],
  ...overrides,
});

// Mocks para provedores de IA
export const mockOpenAI = () => {
  return vi.mock('openai', () => ({
    default: vi.fn().mockImplementation(() => ({
      chat: {
        completions: {
          create: vi.fn().mockImplementation(async (params) => {
            // Simulação de cenários por modelo
            if (params.model.includes('error')) {
              throw new Error('OpenAI API Error: Model not available');
            }
            if (params.model.includes('timeout')) {
              throw new Error('OpenAI API Error: Request timeout');
            }
            if (params.model.includes('ratelimit')) {
              const error = new Error('Rate limit exceeded') as any;
              error.status = 429;
              throw error;
            }
            return {
              id: 'chatcmpl-provider-test',
              object: 'chat.completion',
              created: Date.now(),
              model: params.model,
              choices: [{
                index: 0,
                message: {
                  role: 'assistant',
                  content: `openai ${params.model} response: Here's a solution for your coding problem.`
                },
                finish_reason: 'stop'
              }],
              usage: {
                prompt_tokens: 50,
                completion_tokens: 30,
                total_tokens: 80
              }
            };
          })
        }
      }
    }))
  }));
};

export const mockAnthropic = () => {
  return vi.mock('@anthropic-ai/sdk', () => ({
    default: vi.fn().mockImplementation(() => ({
      messages: {
        create: vi.fn().mockImplementation(async (params) => {
          if (params.model.includes('error')) {
            throw new Error('Anthropic API Error: Service unavailable');
          }
          if (params.model.includes('ratelimit')) {
            const error = new Error('Rate limit exceeded') as any;
            error.status = 429;
            throw error;
          }
          return {
            id: 'msg_provider_test',
            type: 'message',
            role: 'assistant',
            content: [{
              type: 'text',
              text: `anthropic ${params.model} response: I'll help you understand this programming concept.`
            }],
            model: params.model,
            usage: {
              input_tokens: 45,
              output_tokens: 35
            }
          };
        })
      }
    }))
  }));
};

// Aplica todos os mocks de provedores de IA
export const mockAllAIProviders = () => {
  mockOpenAI();
  mockAnthropic();
};