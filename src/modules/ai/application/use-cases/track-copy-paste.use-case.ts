import { TrackCopyPasteDTO } from '../../domain/schemas/ai-interaction.schema';
import { CopyPasteDetectorService } from '../../infrastructure/services/copy-paste-detector.service';
import { logger } from '@/shared/infrastructure/monitoring/logger';

export class TrackCopyPasteUseCase {
  constructor(
    private readonly detector: CopyPasteDetectorService
  ) {}

  async execute(userId: string, data: TrackCopyPasteDTO): Promise<void> {
    const startTime = Date.now();
    
    logger.info({
      operation: 'copy_paste_tracking',
      userId,
      attemptId: data.attemptId,
      action: data.action,
      contentLength: data.content.length,
      sourceLines: data.sourceLines,
      targetLines: data.targetLines,
      aiInteractionId: data.aiInteractionId
    }, 'Copy/paste tracking initiated');

    try {
      await this.detector.trackCopyPaste(userId, data);
      
      const executionTime = Date.now() - startTime;
      
      logger.info({
        userId,
        attemptId: data.attemptId,
        action: data.action,
        contentLength: data.content.length,
        fromAI: !!data.aiInteractionId,
        executionTime
      }, 'Copy/paste tracking completed successfully');

      if (data.action === 'copy' && data.aiInteractionId) {
        logger.info({
          userId,
          attemptId: data.attemptId,
          aiInteractionId: data.aiInteractionId,
          sourceLines: data.sourceLines,
          aiCodeCopied: true
        }, 'AI-generated code copied by user');
      }

      if (data.action === 'paste' && data.targetLines && data.targetLines > 50) {
        logger.warn({
          userId,
          attemptId: data.attemptId,
          targetLines: data.targetLines,
          largePaste: true
        }, 'Large code paste detected');
      }
    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : 'Unknown error',
        userId,
        attemptId: data.attemptId,
        action: data.action,
        executionTime: Date.now() - startTime
      }, 'Copy/paste tracking use case failed');
      throw error;
    }
  }
}