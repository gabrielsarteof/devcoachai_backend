import { TrackCopyPasteDTO } from '../../domain/schemas/ai-interaction.schema';
import { CopyPasteDetectorService } from '../../infrastructure/services/copy-paste-detector.service';
import { logger } from '@/shared/infrastructure/monitoring/logger';

export class TrackCopyPasteUseCase {
  constructor(
    private readonly detector: CopyPasteDetectorService
  ) {}

  async execute(userId: string, data: TrackCopyPasteDTO): Promise<void> {
    try {
      await this.detector.trackCopyPaste(userId, data);
    } catch (error) {
      logger.error({ error, userId, data }, 'Failed to track copy/paste');
      throw error;
    }
  }
}