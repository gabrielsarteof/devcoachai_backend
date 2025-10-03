import { IAIProvider, IAIProviderFactory } from '../../domain/providers/ai-provider.interface';
import { OpenAIProvider } from '../providers/openai.provider';
import { AnthropicProvider } from '../providers/anthropic.provider';
import { Redis } from 'ioredis';
import { logger } from '@/shared/infrastructure/monitoring/logger';
import { InvalidProviderError } from '../../domain/errors/invalid-provider.error';

export class ProviderFactoryService implements IAIProviderFactory {
  private readonly providers: Map<string, () => IAIProvider> = new Map();

  constructor(private readonly redis: Redis) {
    this.registerProviders();
  }

  private registerProviders(): void {
    const startTime = Date.now();
    
    logger.info({
      operation: 'register_ai_providers',
      hasOpenAI: !!process.env.OPENAI_API_KEY,
      hasAnthropic: !!process.env.ANTHROPIC_API_KEY,
      nodeEnv: process.env.NODE_ENV,
      openaiKey: process.env.OPENAI_API_KEY ? 'SET' : 'NOT_SET',
      anthropicKey: process.env.ANTHROPIC_API_KEY ? 'SET' : 'NOT_SET'
    }, 'Registering AI providers');

    try {
      let registeredCount = 0;

      if (process.env.OPENAI_API_KEY) {
        this.providers.set('openai', () => 
          new OpenAIProvider(
            process.env.OPENAI_API_KEY!,
            this.redis,
            process.env.OPENAI_ORG_ID
          )
        );
        registeredCount++;
        
        logger.info({
          operation: 'provider_registered',
          provider: 'openai',
          hasOrgId: !!process.env.OPENAI_ORG_ID
        }, 'OpenAI provider registered');
      } else {
        logger.warn({
          operation: 'provider_not_registered',
          provider: 'openai',
          reason: 'missing_api_key'
        }, 'OpenAI provider not registered - missing API key');
      }

      if (process.env.ANTHROPIC_API_KEY) {
        this.providers.set('anthropic', () =>
          new AnthropicProvider(
            process.env.ANTHROPIC_API_KEY!,
            this.redis
          )
        );
        registeredCount++;

        logger.info({
          operation: 'provider_registered',
          provider: 'anthropic'
        }, 'Anthropic provider registered');
      } else {
        logger.warn({
          operation: 'provider_not_registered',
          provider: 'anthropic',
          reason: 'missing_api_key'
        }, 'Anthropic provider not registered - missing API key');
      }

      const processingTime = Date.now() - startTime;

      logger.info({
        operation: 'register_providers_completed',
        registeredProviders: Array.from(this.providers.keys()),
        registeredCount,
        totalAvailable: 2,
        processingTime
      }, 'AI providers registration completed');

      if (registeredCount === 0) {
        logger.error({
          operation: 'no_providers_registered',
          availableProviders: ['openai', 'anthropic'],
          environmentKeys: {
            openai: !!process.env.OPENAI_API_KEY,
            anthropic: !!process.env.ANTHROPIC_API_KEY
          }
        }, 'No AI providers registered - check environment variables');
      }
      
    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      logger.error({
        operation: 'register_providers_failed',
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        processingTime
      }, 'Failed to register AI providers');
      
      throw error;
    }
  }

  create(provider: string, apiKey?: string): IAIProvider {
    const startTime = Date.now();
    
    logger.info({
      operation: 'create_provider_instance',
      provider,
      hasCustomApiKey: !!apiKey,
      isRegistered: this.providers.has(provider)
    }, 'Creating AI provider instance');

    try {
      if (apiKey) {
        const instance = this.createCustomInstance(provider, apiKey);
        
        const processingTime = Date.now() - startTime;
        
        logger.info({
          operation: 'create_custom_provider_success',
          provider,
          hasCustomApiKey: true,
          processingTime
        }, 'Custom AI provider instance created');
        
        return instance;
      }

      const providerFactory = this.providers.get(provider);
      
      if (!providerFactory) {
        logger.error({
          operation: 'create_provider_failed',
          provider,
          reason: 'provider_not_available',
          availableProviders: this.getAvailableProviders(),
          processingTime: Date.now() - startTime
        }, 'Provider not available');

        throw new InvalidProviderError(`Provider ${provider} not available`);
      }

      const instance = providerFactory();
      
      const processingTime = Date.now() - startTime;
      
      logger.info({
        operation: 'create_provider_success',
        provider,
        hasCustomApiKey: false,
        processingTime
      }, 'AI provider instance created successfully');

      return instance;
      
    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      logger.error({
        operation: 'create_provider_instance_failed',
        provider,
        hasCustomApiKey: !!apiKey,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        processingTime
      }, 'Failed to create AI provider instance');
      
      throw error;
    }
  }

  private createCustomInstance(provider: string, apiKey: string): IAIProvider {
    logger.debug({
      operation: 'create_custom_instance',
      provider,
      hasApiKey: !!apiKey
    }, 'Creating custom provider instance');

    try {
      let instance: IAIProvider;

      switch (provider) {
        case 'openai':
          instance = new OpenAIProvider(apiKey, this.redis);
          break;
        case 'anthropic':
          instance = new AnthropicProvider(apiKey, this.redis);
          break;
        default:
          logger.error({
            operation: 'custom_instance_unsupported',
            provider,
            supportedProviders: ['openai', 'anthropic']
          }, 'Unsupported provider for custom instance');

          throw new InvalidProviderError(`Cannot create custom instance for provider ${provider}`);
      }

      logger.debug({
        operation: 'custom_instance_created',
        provider,
        instanceType: instance.constructor.name
      }, 'Custom provider instance created successfully');

      return instance;
      
    } catch (error) {
      logger.error({
        operation: 'create_custom_instance_failed',
        provider,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      }, 'Failed to create custom provider instance');
      
      throw error;
    }
  }

  getAvailableProviders(): string[] {
    const providers = Array.from(this.providers.keys());
    
    logger.debug({
      operation: 'get_available_providers',
      providers,
      count: providers.length
    }, 'Getting available providers');

    return providers;
  }
}