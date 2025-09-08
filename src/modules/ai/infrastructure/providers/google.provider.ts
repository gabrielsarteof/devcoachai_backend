import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import { IAIProvider } from '../../domain/providers/ai-provider.interface';
import { AIMessage, AICompletion, AIProviderConfig, AIModel } from '../../domain/types/ai.types';
import { logger } from '@/shared/infrastructure/monitoring/logger';
import { Redis } from 'ioredis';

export class GoogleProvider implements IAIProvider {
  private client: GoogleGenerativeAI;
  private model: GenerativeModel;
  readonly provider = 'google';
  readonly models: AIModel[] = [
    {
      id: 'gemini-1.5-pro',
      name: 'Gemini 1.5 Pro',
      contextWindow: 1000000,
      inputCost: 0.00125,
      outputCost: 0.005,
      capabilities: ['chat', 'code', 'vision', 'function_calling'],
    },
    {
      id: 'gemini-1.5-flash',
      name: 'Gemini 1.5 Flash',
      contextWindow: 1000000,
      inputCost: 0.00015,
      outputCost: 0.0006,
      capabilities: ['chat', 'code', 'vision'],
    },
    {
      id: 'gemini-2.0-flash-exp',
      name: 'Gemini 2.0 Flash Experimental',
      contextWindow: 1000000,
      inputCost: 0.0, 
      outputCost: 0.0,
      capabilities: ['chat', 'code', 'vision', 'function_calling'],
    },
  ];

  constructor(
    apiKey: string,
    private readonly redis: Redis
  ) {
    this.client = new GoogleGenerativeAI(apiKey);
    this.model = this.client.getGenerativeModel({ model: 'gemini-1.5-pro' });
  }

  async chat(messages: AIMessage[], config?: Partial<AIProviderConfig>): Promise<AICompletion> {
    try {
      const modelName = config?.model || 'gemini-1.5-pro';
      
      const cacheKey = this.generateCacheKey(messages, modelName);
      const cached = await this.redis.get(cacheKey);
      if (cached && !config?.stream) {
        logger.debug({ provider: 'google', model: modelName }, 'Cache hit for AI request');
        return JSON.parse(cached);
      }

      const startTime = Date.now();
      
      this.model = this.client.getGenerativeModel({ 
        model: modelName,
        generationConfig: {
          temperature: config?.temperature ?? 0.7,
          maxOutputTokens: config?.maxTokens ?? 2000,
          topP: config?.topP ?? 1,
          stopSequences: config?.stop,
        },
      });

      const chat = this.model.startChat({
        history: this.convertMessagesToGemini(messages.slice(0, -1)),
      });

      const lastMessage = messages[messages.length - 1];
      const result = await chat.sendMessage(lastMessage.content);
      const response = await result.response;
      
      const responseTime = Date.now() - startTime;
      const modelInfo = this.models.find(m => m.id === modelName);
      
      const promptTokens = result.response.usageMetadata?.promptTokenCount || 0;
      const candidateTokens = result.response.usageMetadata?.candidatesTokenCount || 0;
      
      const completion: AICompletion = {
        id: crypto.randomUUID(),
        provider: 'google',
        model: modelName,
        content: response.text(),
        usage: {
          promptTokens,
          completionTokens: candidateTokens,
          totalTokens: promptTokens + candidateTokens,
        },
        cost: this.calculateCost(promptTokens, candidateTokens, modelInfo),
        timestamp: new Date(),
      };

      if (!config?.stream) {
        await this.redis.setex(cacheKey, 3600, JSON.stringify(completion));
      }

      logger.info({
        provider: 'google',
        model: modelName,
        responseTime,
        tokens: completion.usage.totalTokens,
        cost: completion.cost,
      }, 'Google request completed');

      return completion;
    } catch (error: any) {
      logger.error({
        provider: 'google',
        error: error.message,
      }, 'Google API error');
      
      if (error.message?.includes('quota')) {
        throw new Error('API quota exceeded. Please try again later.');
      } else if (error.message?.includes('API key')) {
        throw new Error('Invalid API key');
      }
      throw error;
    }
  }

  async *stream(messages: AIMessage[], config?: Partial<AIProviderConfig>): AsyncIterable<string> {
    try {
      const modelName = config?.model || 'gemini-1.5-pro';
      
      this.model = this.client.getGenerativeModel({ 
        model: modelName,
        generationConfig: {
          temperature: config?.temperature ?? 0.7,
          maxOutputTokens: config?.maxTokens ?? 2000,
        },
      });

      const chat = this.model.startChat({
        history: this.convertMessagesToGemini(messages.slice(0, -1)),
      });

      const lastMessage = messages[messages.length - 1];
      const result = await chat.sendMessageStream(lastMessage.content);
      
      for await (const chunk of result.stream) {
        const text = chunk.text();
        if (text) {
          yield text;
        }
      }
    } catch (error) {
      logger.error({ error, provider: 'google' }, 'Stream error');
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
    const cacheKey = `usage:google:${startDate.toISOString()}:${endDate.toISOString()}`;
    const cached = await this.redis.get(cacheKey);
    
    if (cached) {
      return JSON.parse(cached);
    }

    return { tokens: 0, cost: 0 };
  }

  private convertMessagesToGemini(messages: AIMessage[]): any[] {
    return messages.map(msg => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }],
    }));
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
    return `ai:google:${hash}`;
  }
}