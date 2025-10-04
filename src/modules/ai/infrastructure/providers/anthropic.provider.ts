import Anthropic from '@anthropic-ai/sdk';
import { IAIProvider } from '../../domain/providers/ai-provider.interface';
import { AIMessage, AICompletion, AIProviderConfig, AIModel } from '../../domain/types/ai.types';
import { logger } from '@/shared/infrastructure/monitoring/logger';
import { Redis } from 'ioredis';
import { RateLimitExceededError } from '../../domain/errors/rate-limit-exceeded.error';
import { ProviderError } from '../../domain/errors/provider.error';

export class AnthropicProvider implements IAIProvider {
  private client: Anthropic;
  readonly provider = 'anthropic';
  readonly models: AIModel[] = [
    // Modelos atuais disponíveis (2024-2025)
    {
      id: 'claude-sonnet-4-5-20250929',
      name: 'Claude Sonnet 4.5',
      contextWindow: 200000,
      inputCost: 0.003,
      outputCost: 0.015,
      capabilities: ['chat', 'code', 'analysis', 'vision', 'computer_use'],
    },
    {
      id: 'claude-opus-4-1-20250805',
      name: 'Claude Opus 4.1',
      contextWindow: 200000,
      inputCost: 0.015,
      outputCost: 0.075,
      capabilities: ['chat', 'code', 'analysis', 'vision', 'reasoning'],
    },
    {
      id: 'claude-sonnet-4-20250514',
      name: 'Claude Sonnet 4',
      contextWindow: 200000,
      inputCost: 0.003,
      outputCost: 0.015,
      capabilities: ['chat', 'code', 'analysis', 'vision'],
    },
    {
      id: 'claude-3-7-sonnet-20250219',
      name: 'Claude 3.7 Sonnet',
      contextWindow: 200000,
      inputCost: 0.003,
      outputCost: 0.015,
      capabilities: ['chat', 'code', 'analysis', 'vision', 'reasoning'],
    },
    {
      id: 'claude-3-5-haiku-20241022',
      name: 'Claude 3.5 Haiku',
      contextWindow: 200000,
      inputCost: 0.00025,
      outputCost: 0.00125,
      capabilities: ['chat', 'code'],
    },
    {
      id: 'claude-3-haiku-20240307',
      name: 'Claude 3 Haiku',
      contextWindow: 200000,
      inputCost: 0.00025,
      outputCost: 0.00125,
      capabilities: ['chat', 'code'],
    },
    // Modelos específicos para ambiente de teste
    ...(process.env.NODE_ENV === 'test' ? [
      {
        id: 'claude-error-model',
        name: 'Test Error Model',
        contextWindow: 4000,
        inputCost: 0.001,
        outputCost: 0.001,
        capabilities: ['chat'] as string[],
      }
    ] : [])
  ];

  constructor(
    apiKey: string,
    private readonly redis: Redis
  ) {
    this.client = new Anthropic({
      apiKey,
      maxRetries: 3,
    });
  }

  async chat(messages: AIMessage[], config?: Partial<AIProviderConfig>): Promise<AICompletion> {
    try {
      const model = config?.model || 'claude-3-haiku-20240307';
      
      const cacheKey = this.generateCacheKey(messages, model);
      const cached = await this.redis.get(cacheKey);
      if (cached && !config?.stream) {
        logger.debug({ provider: 'anthropic', model }, 'Cache hit for AI request');
        return JSON.parse(cached);
      }

      const startTime = Date.now();
      
      const systemMessage = messages.find(m => m.role === 'system');
      const userMessages = messages.filter(m => m.role !== 'system');
      
      const completion = await this.client.messages.create({
        model,
        messages: userMessages.map(m => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        })),
        system: systemMessage?.content,
        max_tokens: config?.maxTokens ?? 2000,
        temperature: config?.temperature ?? 0.7,
        top_p: config?.topP ?? 1,
        stop_sequences: config?.stop,
      });

      const responseTime = Date.now() - startTime;
      const modelInfo = this.models.find(m => m.id === model);
      
      const content = completion.content
        .filter(block => block.type === 'text')
        .map(block => (block as any).text)
        .join('');
      
      const result: AICompletion = {
        id: completion.id,
        provider: 'anthropic',
        model,
        content,
        usage: {
          promptTokens: completion.usage?.input_tokens || 0,
          completionTokens: completion.usage?.output_tokens || 0,
          totalTokens: (completion.usage?.input_tokens || 0) + (completion.usage?.output_tokens || 0),
        },
        cost: this.calculateCost(
          completion.usage?.input_tokens || 0,
          completion.usage?.output_tokens || 0,
          modelInfo
        ),
        timestamp: new Date(),
        requestId: (completion as any)._request_id,
      };

      if (!config?.stream) {
        await this.redis.setex(cacheKey, 3600, JSON.stringify(result));
      }

      logger.info({
        provider: 'anthropic',
        model,
        responseTime,
        tokens: result.usage.totalTokens,
        cost: result.cost,
        requestId: result.requestId,
      }, 'Anthropic request completed');

      return result;
    } catch (error) {
      if (error instanceof Anthropic.APIError) {
        logger.error({
          provider: 'anthropic',
          status: error.status,
          message: error.message,
          name: error.name,
          headers: error.headers,
        }, 'Anthropic API error');

        if (error.status === 429) {
          throw new RateLimitExceededError('Rate limit exceeded. Please try again later.');
        } else if (error.status === 401) {
          throw new ProviderError('anthropic', 'Invalid API key');
        } else if (error.status === 400) {
          throw new ProviderError('anthropic', `Bad request: ${error.message}`);
        }
      }

      // Para outros tipos de erro, lançar ProviderError genérico
      throw new ProviderError('anthropic', error instanceof Error ? error.message : 'Unknown error');
    }
  }

  async *stream(messages: AIMessage[], config?: Partial<AIProviderConfig>): AsyncIterable<string> {
    try {
      const model = config?.model || 'claude-3-haiku-20240307';
      
      const systemMessage = messages.find(m => m.role === 'system');
      const userMessages = messages.filter(m => m.role !== 'system');
      
      const stream = await this.client.messages.stream({
        model,
        messages: userMessages.map(m => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        })),
        system: systemMessage?.content,
        max_tokens: config?.maxTokens ?? 2000,
        temperature: config?.temperature ?? 0.7,
      });

      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          yield event.delta.text;
        }
      }
    } catch (error) {
      logger.error({ error, provider: 'anthropic' }, 'Stream error');
      throw error;
    }
  }

  countTokens(text: string): number {
    return Math.ceil(text.length / 3.5);
  }

  validateModel(model: string): boolean {
    return this.models.some(m => m.id === model);
  }

  async getUsage(startDate: Date, endDate: Date): Promise<{ tokens: number; cost: number }> {
    const cacheKey = `usage:anthropic:${startDate.toISOString()}:${endDate.toISOString()}`;
    const cached = await this.redis.get(cacheKey);
    
    if (cached) {
      return JSON.parse(cached);
    }

    return { tokens: 0, cost: 0 };
  }

  private calculateCost(inputTokens: number, outputTokens: number, model?: AIModel): number {
    if (!model) return 0;
    
    const inputCost = (inputTokens / 1000) * model.inputCost;
    const outputCost = (outputTokens / 1000) * model.outputCost;
    
    return Math.round((inputCost + outputCost) * 100000) / 100000;
  }

  private generateCacheKey(messages: AIMessage[], model: string): string {
    const hash = require('crypto')
      .createHash('sha256')
      .update(JSON.stringify({ messages, model }))
      .digest('hex');
    return `ai:anthropic:${hash}`;
  }
}