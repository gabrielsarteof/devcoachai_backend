export type AIRole = 'system' | 'user' | 'assistant';
export type AIProvider = 'openai' | 'anthropic';

export interface AIMessage {
  role: AIRole;
  content: string;
  name?: string;
  function_call?: any;
}

export interface AICompletion {
  id: string;
  provider: AIProvider;
  model: string;
  content: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  cost: number;
  timestamp: Date;
  requestId?: string;
}

export interface AIProviderConfig {
  model: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  stop?: string[];
  stream?: boolean;
  user?: string;
}

export interface AIModel {
  id: string;
  name: string;
  contextWindow: number;
  inputCost: number; 
  outputCost: number; 
  capabilities: string[];
}

export interface CopyPasteEvent {
  attemptId: string;
  userId: string;
  timestamp: Date;
  action: 'copy' | 'paste';
  content: string;
  sourceLines?: number;
  targetLines?: number;
  aiInteractionId?: string;
}

export interface RateLimitConfig {
  maxRequestsPerMinute: number;
  maxRequestsPerHour: number;
  maxTokensPerDay: number;
  burstLimit: number;
}