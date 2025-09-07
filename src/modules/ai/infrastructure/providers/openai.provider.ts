import OpenAI from 'openai';
import { IAIProvider } from '../../domain/providers/ai-provider.interface';
import { AIMessage, AICompletion, AIProviderConfig, AIModel } from '../../domain/types/ai.types';
import { logger } from '@/shared/infrastructure/monitoring/logger';
import { Redis } from 'ioredis';

export class OpenAIProvider implements IAIProvider {
  private client: OpenAI;
  readonly provider = 'openai';
  readonly models: AIModel[] = [
    {
      id: 'gpt-4o',
      name: 'GPT-4 Optimized',
      contextWindow: 128000,
      inputCost: 0.005,
      outputCost: 0.015,
      capabilities: ['chat', 'code', 'function_calling', 'vision'],
    },
    {
      id: 'gpt-4-turbo',
      name: 'GPT-4 Turbo',
      contextWindow: 128000,
      inputCost: 0.01,
      outputCost: 0.03,
      capabilities: ['chat', 'code', 'function_calling', 'vision'],
    },
    {
      id: 'gpt-3.5-turbo',
      name: 'GPT-3.5 Turbo',
      contextWindow: 16385,
      inputCost: 0.0005,
      outputCost: 0.0015,
      capabilities: ['chat', 'code', 'function_calling'],
    },
  ];

  constructor(
    apiKey: string,
    private readonly redis: Redis,
    organizationId?: string
  ) {
    this.client = new OpenAI({
      apiKey,
      organization: organizationId,
      maxRetries: 3,
      timeout: 30000,
    });
  }

  async chat(messages: AIMessage[], config?: Partial<AIProviderConfig>): Promise<AICompletion> {
    try {
      const model = config?.model || 'gpt-4o';
      
      const cacheKey = this.generateCacheKey(messages, model);
      const cached = await this.redis.get(cacheKey);
      if (cached && !config?.stream) {
        logger.debug({ provider: 'openai', model }, 'Cache hit for AI request');
        return JSON.parse(cached);
      }

      const startTime = Date.now();
      
      const completion = await this.client.chat.completions.create({
        model,
        messages: messages.map(m => ({
          role: m.role as 'system' | 'user' | 'assistant',
          content: m.content,
        })),
        temperature: config?.temperature ?? 0.7,
        max_tokens: config?.maxTokens ?? 2000,
        top_p: config?.topP ?? 1,
        frequency_penalty: config?.frequencyPenalty ?? 0,
        presence_penalty: config?.presencePenalty ?? 0,
        stop: config?.stop,
        user: config?.user,
      });

      const responseTime = Date.now() - startTime;
      const modelInfo = this.models.find(m => m.id === model);
      
      const result: AICompletion = {
        id: completion.id,
        provider: 'openai',
        model,
        content: completion.choices[0]?.message?.content || '',
        usage: {
          promptTokens: completion.usage?.prompt_tokens || 0,
          completionTokens: completion.usage?.completion_tokens || 0,
          totalTokens: completion.usage?.total_tokens || 0,
        },
        cost: this.calculateCost(
          completion.usage?.prompt_tokens || 0,
          completion.usage?.completion_tokens || 0,
          modelInfo
        ),
        timestamp: new Date(),
      };

      if (!config?.stream) {
        await this.redis.setex(cacheKey, 3600, JSON.stringify(result));
      }

      logger.info({
        provider: 'openai',
        model,
        responseTime,
        tokens: result.usage.totalTokens,
        cost: result.cost,
      }, 'OpenAI request completed');

      return result;
    } catch (error) {
      if (error instanceof OpenAI.APIError) {
        logger.error({
          provider: 'openai',
          status: error.status,
          message: error.message,
          code: error.code,
          type: error.type,
        }, 'OpenAI API error');
        
        if (error.status === 429) {
          throw new Error('Rate limit exceeded. Please try again later.');
        } else if (error.status === 401) {
          throw new Error('Invalid API key');
        }
      }
      throw error;
    }
  }

  async *stream(messages: AIMessage[], config?: Partial<AIProviderConfig>): AsyncIterable<string> {
    try {
      const model = config?.model || 'gpt-4o';
      
      const stream = await this.client.chat.completions.create({
        model,
        messages: messages.map(m => ({
          role: m.role as 'system' | 'user' | 'assistant',
          content: m.content,
        })),
        temperature: config?.temperature ?? 0.7,
        max_tokens: config?.maxTokens ?? 2000,
        stream: true,
        user: config?.user,
      });

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content;
        if (content) {
          yield content;
        }
      }
    } catch (error) {
      logger.error({ error, provider: 'openai' }, 'Stream error');
      throw error;
    }
  }

  countTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  validateModel(model: string): boolean {
    return this.models.some(m => m.id === model);
  }

  async getUsage(startDate: Date, endDate: Date): Promise<{ tokens: number; cost: number }> {

    const cacheKey = `usage:openai:${startDate.toISOString()}:${endDate.toISOString()}`;
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
    return `ai:openai:${hash}`;
  }
}