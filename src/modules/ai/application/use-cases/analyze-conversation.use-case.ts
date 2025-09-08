import { ConversationAnalyzerService } from '../../domain/services/conversation-analyzer.service';
import { IAIInteractionRepository } from '../../domain/repositories/ai-interaction.repository.interface';
import { logger } from '@/shared/infrastructure/monitoring/logger';

export class AnalyzeConversationUseCase {
  constructor(
    private readonly analyzer: ConversationAnalyzerService,
    private readonly repository: IAIInteractionRepository
  ) {}

  async execute(attemptId: string) {
    try {
      const interactions = await this.repository.findByAttemptId(attemptId);
      
      if (interactions.length === 0) {
        return {
          analysis: null,
          message: 'No interactions found for this attempt',
        };
      }

      const allMessages: any[] = [];
      for (const interaction of interactions) {
        const messages = interaction.messages as any[];
        allMessages.push(...messages);
      }

      const analysis = this.analyzer.analyzeConversation(allMessages);

      const totalCopied = interactions.filter(i => i.wasCopied).length;
      const copyRate = interactions.length > 0 ? (totalCopied / interactions.length) : 0;

      const totalCodeLines = interactions.reduce((sum, i) => sum + i.codeLinesGenerated, 0);
      const copiedCodeLines = interactions
        .filter(i => i.wasCopied)
        .reduce((sum, i) => sum + i.codeLinesGenerated, 0);
      
      const dependencyIndex = totalCodeLines > 0 ? (copiedCodeLines / totalCodeLines) * 100 : 0;

      logger.info({
        attemptId,
        interactions: interactions.length,
        analysis,
        copyRate,
        dependencyIndex,
      }, 'Conversation analyzed');

      return {
        analysis,
        metrics: {
          totalInteractions: interactions.length,
          copyRate,
          dependencyIndex,
          totalTokensUsed: interactions.reduce((sum, i) => sum + i.inputTokens + i.outputTokens, 0),
          totalCost: interactions.reduce((sum, i) => sum + i.estimatedCost, 0),
        },
      };
    } catch (error) {
      logger.error({ error, attemptId }, 'Failed to analyze conversation');
      throw error;
    }
  }
}