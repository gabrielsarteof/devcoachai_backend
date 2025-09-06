import { AIMessage, AICompletion, AIProviderConfig, AIModel } from "../types/ai.types";

export interface IAIProvider {
  readonly provider: string;
  readonly models: AIModel[];
  
  chat(messages: AIMessage[], config?: Partial<AIProviderConfig>): Promise<AICompletion>;
  stream(messages: AIMessage[], config?: Partial<AIProviderConfig>): AsyncIterable<string>;
  countTokens(text: string): number;
  validateModel(model: string): boolean;
  getUsage(startDate: Date, endDate: Date): Promise<{ tokens: number; cost: number }>;
}

export interface IAIProviderFactory {
  create(provider: string, apiKey: string): IAIProvider;
  getAvailableProviders(): string[];
}