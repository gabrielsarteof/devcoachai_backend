import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  // Server Configuration
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.string().transform(Number).default('3333'),
  
  // Database
  DATABASE_URL: z.string().url(),
  DATABASE_TEST_URL: z.string().url().optional(),
  
  // Redis
  REDIS_URL: z.string().url(),
  
  // Security
  JWT_SECRET: z.string().min(32),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
  
  // AI Providers
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_ORG_ID: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  GOOGLE_API_KEY: z.string().optional(),
  
  // AI Rate Limiting
  AI_MAX_REQUESTS_PER_MINUTE: z.string().transform(Number).default('20'),
  AI_MAX_REQUESTS_PER_HOUR: z.string().transform(Number).default('100'),
  AI_MAX_TOKENS_PER_DAY: z.string().transform(Number).default('100000'),
  AI_BURST_LIMIT: z.string().transform(Number).default('5'),
  
  // Governance Configuration
  GOVERNANCE_ENABLED: z.string().transform(v => v === 'true').default('true'),
  ENABLE_SEMANTIC_ANALYSIS: z.string().transform(v => v === 'true').default('false'),
  
  // Semantic Analysis Settings
  BORDERLINE_LOWER_BOUND: z.string().transform(Number).default('30'),
  BORDERLINE_UPPER_BOUND: z.string().transform(Number).default('70'),
  SEMANTIC_SIMILARITY_THRESHOLD: z.string().transform(Number).default('0.7'),
  MAX_PROMPT_LENGTH: z.string().transform(Number).default('2000'),
  OPENAI_MODEL: z.string().default('gpt-4'),
  EMBEDDING_MODEL: z.string().default('text-embedding-ada-002'),
  
  // Cache Configuration
  EMBEDDING_CACHE_TTL: z.string().transform(Number).default('86400'),
  INTENT_CACHE_TTL: z.string().transform(Number).default('3600'),
  SIMILARITY_CACHE_TTL: z.string().transform(Number).default('21600'),
  
  // Validation Thresholds
  CONTEXT_SIMILARITY_THRESHOLD: z.string().transform(Number).default('0.7'),
  OFF_TOPIC_THRESHOLD: z.string().transform(Number).default('0.3'),
  ALLOWED_DEVIATION_PERCENTAGE: z.string().transform(Number).default('20'),
  BLOCK_DIRECT_SOLUTIONS: z.string().transform(v => v === 'true').default('true'),
  SECURITY_ALERT_THRESHOLD: z.string().transform(Number).default('95'),
  
  // Email Service (se houver)
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.string().transform(Number).optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  EMAIL_FROM: z.string().email().optional(),
  
  // External Services
  SENTRY_DSN: z.string().optional(),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  
  // Storage
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  AWS_REGION: z.string().default('us-east-1'),
  S3_BUCKET: z.string().optional(),
  
  // Feature Flags
  ENABLE_WEBSOCKET: z.string().transform(v => v === 'true').default('true'),
  ENABLE_NOTIFICATIONS: z.string().transform(v => v === 'true').default('true'),
  ENABLE_CERTIFICATES: z.string().transform(v => v === 'true').default('true'),
  
  // Performance
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  PREWARM_CHALLENGES: z.string().optional(), // comma-separated challenge IDs
  
  // OAuth (se implementado)
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
});

export const config = envSchema.parse(process.env);
export type Config = z.infer<typeof envSchema>;