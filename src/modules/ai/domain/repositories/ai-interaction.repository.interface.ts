// src/modules/ai/domain/repositories/ai-interaction.repository.interface.ts
import { AIInteraction } from '@prisma/client';
import { AIProvider } from '../types/ai.types';

export interface IAIInteractionRepository {
  create(data: Omit<AIInteraction, 'id' | 'createdAt'>): Promise<AIInteraction>;
  findById(id: string): Promise<AIInteraction | null>;
  findByUserId(userId: string, limit?: number): Promise<AIInteraction[]>;
  findByAttemptId(attemptId: string): Promise<AIInteraction[]>;
  markAsCopied(id: string): Promise<void>;
  markAsPasted(id: string): Promise<void>;
  getUserStats(userId: string, startDate?: Date, endDate?: Date): Promise<AIUserStats>;
  getProviderStats(provider: AIProvider, startDate: Date, endDate: Date): Promise<AIProviderStats>;
}

export interface AIUserStats {
  totalInteractions: number;
  totalTokensUsed: number;
  totalCost: number;
  averageDependency: number;
  byProvider: Record<string, {
    interactions: number;
    tokens: number;
    cost: number;
  }>;
  copyPasteRate: number;
}

export interface AIProviderStats {
  totalRequests: number;
  totalTokens: number;
  totalCost: number;
  averageResponseTime: number;
  errorRate: number;
  byModel: Record<string, {
    requests: number;
    tokens: number;
    cost: number;
  }>;
}