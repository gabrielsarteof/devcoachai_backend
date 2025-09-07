import { PrismaClient } from '@prisma/client';
import { Redis } from 'ioredis';
import { logger } from '@/shared/infrastructure/monitoring/logger';
import { TrackCopyPasteDTO } from '../../domain/schemas/ai-interaction.schema';

export class CopyPasteDetectorService {
  private readonly SIMILARITY_THRESHOLD = 0.85;
  private readonly TIME_WINDOW = 30000;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly redis: Redis
  ) {}

  async trackCopyPaste(userId: string, data: TrackCopyPasteDTO): Promise<void> {
    try {
      const key = `copypaste:${userId}:${data.attemptId}`;
      const timestamp = Date.now();

      if (data.action === 'copy') {
        await this.redis.setex(
          `${key}:copy:${timestamp}`,
          60, 
          JSON.stringify({
            content: data.content,
            lines: data.sourceLines || this.countLines(data.content),
            timestamp,
            aiInteractionId: data.aiInteractionId,
          })
        );

        if (data.aiInteractionId) {
          await this.prisma.aIInteraction.update({
            where: { id: data.aiInteractionId },
            data: {
              wasCopied: true,
              copyTimestamp: new Date(),
            },
          });
        }

        logger.info({
          userId,
          attemptId: data.attemptId,
          lines: data.sourceLines,
          fromAI: !!data.aiInteractionId,
        }, 'Copy event tracked');

      } else if (data.action === 'paste') {
        const pattern = `${key}:copy:*`;
        const copyKeys = await this.redis.keys(pattern);
        
        let matchFound = false;
        let matchedAIInteractionId: string | null = null;

        for (const copyKey of copyKeys) {
          const copyData = await this.redis.get(copyKey);
          if (!copyData) continue;

          const copy = JSON.parse(copyData);
          const timeDiff = timestamp - copy.timestamp;

          if (timeDiff <= this.TIME_WINDOW) {
            const similarity = this.calculateSimilarity(copy.content, data.content);
            
            if (similarity >= this.SIMILARITY_THRESHOLD) {
              matchFound = true;
              matchedAIInteractionId = copy.aiInteractionId;
              break;
            }
          }
        }

        if (matchFound && matchedAIInteractionId) {
          await this.prisma.aIInteraction.update({
            where: { id: matchedAIInteractionId },
            data: {
              pasteTimestamp: new Date(),
              codeLinesGenerated: data.targetLines || this.countLines(data.content),
            },
          });

          await this.prisma.codeEvent.create({
            data: {
              attemptId: data.attemptId,
              userId,
              type: 'PASTED',
              sessionTime: Math.floor(timestamp / 1000),
              linesAdded: data.targetLines || this.countLines(data.content),
              linesRemoved: 0,
              totalLines: 0, 
              charactersChanged: data.content.length,
              wasFromAI: true,
              aiInteractionId: matchedAIInteractionId,
            },
          });
        }

        logger.info({
          userId,
          attemptId: data.attemptId,
          matchFound,
          fromAI: matchFound,
          lines: data.targetLines,
        }, 'Paste event tracked');
      }

      await this.updateDependencyMetrics(userId, data.attemptId);
    } catch (error) {
      logger.error({ error, userId, data }, 'Failed to track copy/paste');
    }
  }

  async getCopyPasteStats(attemptId: string): Promise<{
    totalCopies: number;
    totalPastes: number;
    aiCopyRate: number;
    avgTimeToAction: number;
  }> {
    const events = await this.prisma.codeEvent.findMany({
      where: {
        attemptId,
        type: { in: ['PASTED'] },
      },
    });

    const aiEvents = events.filter(e => e.wasFromAI);

    return {
      totalCopies: events.length,
      totalPastes: events.length,
      aiCopyRate: events.length > 0 ? (aiEvents.length / events.length) : 0,
      avgTimeToAction: 0, 
    };
  }

  private calculateSimilarity(text1: string, text2: string): number {
    const longer = text1.length > text2.length ? text1 : text2;
    const shorter = text1.length > text2.length ? text2 : text1;
    
    if (longer.length === 0) return 1.0;
    
    const distance = this.levenshteinDistance(longer, shorter);
    return (longer.length - distance) / longer.length;
  }

  private levenshteinDistance(str1: string, str2: string): number {
    const matrix: number[][] = [];
    
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }
    
    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }
    
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    
    return matrix[str2.length][str1.length];
  }

  private countLines(text: string): number {
    return text.split('\n').length;
  }

  private async updateDependencyMetrics(userId: string, attemptId: string): Promise<void> {
    try {
      const interactions = await this.prisma.aIInteraction.findMany({
        where: {
          attemptId,
          wasCopied: true,
        },
        select: {
          codeLinesGenerated: true,
        },
      });

      const totalAILines = interactions.reduce((sum, i) => sum + i.codeLinesGenerated, 0);

      const attempt = await this.prisma.challengeAttempt.findUnique({
        where: { id: attemptId },
        select: { finalCode: true },
      });

      if (attempt?.finalCode) {
        const totalLines = this.countLines(attempt.finalCode);
        const dependencyIndex = totalLines > 0 ? (totalAILines / totalLines) * 100 : 0;

        logger.info({
          attemptId,
          totalAILines,
          totalLines,
          dependencyIndex,
        }, 'Dependency metrics updated');
      }
    } catch (error) {
      logger.error({ error, userId, attemptId }, 'Failed to update dependency metrics');
    }
  }
}