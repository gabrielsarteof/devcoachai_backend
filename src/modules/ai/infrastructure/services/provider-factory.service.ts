import { IAIProvider, IAIProviderFactory } from '../../domain/providers/ai-provider.interface';
import { OpenAIProvider } from '../providers/openai.provider';
import { AnthropicProvider } from '../providers/anthropic.provider';
import { GoogleProvider } from '../providers/google.provider';
import { Redis } from 'ioredis';
import { logger } from '@/shared/infrastructure/monitoring/logger';

export class ProviderFactoryService implements IAIProviderFactory {
  private readonly providers: Map<string, () => IAIProvider> = new Map();

  constructor(private readonly redis: Redis) {
    this.registerProviders();
  }

  private registerProviders(): void {
    if (process.env.OPENAI_API_KEY) {
      this.providers.set('openai', () => 
        new OpenAIProvider(
          process.env.OPENAI_API_KEY!,
          this.redis,
          process.env.OPENAI_ORG_ID
        )
      );
      logger.info('OpenAI provider registered');
    }

    if (process.env.ANTHROPIC_API_KEY) {
      this.providers.set('anthropic', () =>
        new AnthropicProvider(
          process.env.ANTHROPIC_API_KEY!,
          this.redis
        )
      );
      logger.info('Anthropic provider registered');
    }

    if (process.env.GOOGLE_API_KEY) {
      this.providers.set('google', () =>
        new GoogleProvider(
          process.env.GOOGLE_API_KEY!,
          this.redis
        )
      );
      logger.info('Google provider registered');
    }
  }

  create(provider: string, apiKey?: string): IAIProvider {
    const providerFactory = this.providers.get(provider);
    
    if (!providerFactory) {
      throw new Error(`Provider ${provider} not available`);
    }

    if (apiKey) {
      switch (provider) {
        case 'openai':
          return new OpenAIProvider(apiKey, this.redis);
        case 'anthropic':
          return new AnthropicProvider(apiKey, this.redis);
        case 'google':
          return new GoogleProvider(apiKey, this.redis);
        default:
          throw new Error(`Cannot create custom instance for provider ${provider}`);
      }
    }

    return providerFactory();
  }

  getAvailableProviders(): string[] {
    return Array.from(this.providers.keys());
  }
}