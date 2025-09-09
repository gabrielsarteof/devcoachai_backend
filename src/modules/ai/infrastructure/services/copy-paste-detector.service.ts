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
    const startTime = Date.now();
    
    logger.info({
      operation: 'track_copy_paste',
      userId,
      attemptId: data.attemptId,
      action: data.action,
      contentLength: data.content.length,
      sourceLines: data.sourceLines,
      targetLines: data.targetLines,
      hasAiInteractionId: !!data.aiInteractionId
    }, 'Tracking copy/paste event');

    try {
      const key = `copypaste:${userId}:${data.attemptId}`;
      const timestamp = Date.now();

      if (data.action === 'copy') {
        await this.handleCopyEvent(userId, data, key, timestamp);
      } else if (data.action === 'paste') {
        await this.handlePasteEvent(userId, data, key, timestamp);
      }

      await this.updateDependencyMetrics(userId, data.attemptId);

      const processingTime = Date.now() - startTime;
      
      logger.info({
        operation: 'track_copy_paste_success',
        userId,
        attemptId: data.attemptId,
        action: data.action,
        contentLength: data.content.length,
        fromAI: !!data.aiInteractionId,
        processingTime
      }, 'Copy/paste event tracked successfully');
      
    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      logger.error({
        operation: 'track_copy_paste_failed',
        userId,
        attemptId: data.attemptId,
        action: data.action,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        processingTime
      }, 'Failed to track copy/paste event');
      
      throw error;
    }
  }

  private async handleCopyEvent(
    userId: string,
    data: TrackCopyPasteDTO,
    key: string,
    timestamp: number
  ): Promise<void> {
    logger.debug({
      operation: 'handle_copy_event',
      userId,
      attemptId: data.attemptId,
      contentLength: data.content.length,
      sourceLines: data.sourceLines,
      hasAiInteractionId: !!data.aiInteractionId
    }, 'Handling copy event');

    try {
      const copyData = {
        content: data.content,
        lines: data.sourceLines || this.countLines(data.content),
        timestamp,
        aiInteractionId: data.aiInteractionId,
      };

      await this.redis.setex(
        `${key}:copy:${timestamp}`,
        60, 
        JSON.stringify(copyData)
      );

      if (data.aiInteractionId) {
        await this.prisma.aIInteraction.update({
          where: { id: data.aiInteractionId },
          data: {
            wasCopied: true,
            copyTimestamp: new Date(),
          },
        });

        logger.info({
          operation: 'ai_content_copied',
          userId,
          attemptId: data.attemptId,
          aiInteractionId: data.aiInteractionId,
          lines: copyData.lines,
          contentLength: data.content.length
        }, 'AI-generated content copied by user');
      }

      logger.info({
        operation: 'copy_event_processed',
        userId,
        attemptId: data.attemptId,
        lines: copyData.lines,
        fromAI: !!data.aiInteractionId,
        timestamp
      }, 'Copy event processed and stored');
      
    } catch (error) {
      logger.error({
        operation: 'handle_copy_event_failed',
        userId,
        attemptId: data.attemptId,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      }, 'Failed to handle copy event');
      
      throw error;
    }
  }

  private async handlePasteEvent(
    userId: string,
    data: TrackCopyPasteDTO,
    key: string,
    timestamp: number
  ): Promise<void> {
    logger.debug({
      operation: 'handle_paste_event',
      userId,
      attemptId: data.attemptId,
      contentLength: data.content.length,
      targetLines: data.targetLines
    }, 'Handling paste event');

    try {
      const pattern = `${key}:copy:*`;
      const copyKeys = await this.redis.keys(pattern);
      
      let matchFound = false;
      let matchedAIInteractionId: string | null = null;
      let bestMatch: { similarity: number; timeDiff: number } | null = null;

      logger.debug({
        operation: 'searching_copy_matches',
        userId,
        attemptId: data.attemptId,
        copyKeysFound: copyKeys.length,
        timeWindow: this.TIME_WINDOW,
        similarityThreshold: this.SIMILARITY_THRESHOLD
      }, 'Searching for matching copy events');

      for (const copyKey of copyKeys) {
        const copyData = await this.redis.get(copyKey);
        if (!copyData) continue;

        const copy = JSON.parse(copyData);
        const timeDiff = timestamp - copy.timestamp;

        if (timeDiff <= this.TIME_WINDOW) {
          const similarity = this.calculateSimilarity(copy.content, data.content);
          
          logger.debug({
            operation: 'copy_match_evaluation',
            similarity,
            timeDiff,
            threshold: this.SIMILARITY_THRESHOLD,
            timeWindow: this.TIME_WINDOW,
            hasAiInteraction: !!copy.aiInteractionId
          }, 'Evaluating copy match');
          
          if (similarity >= this.SIMILARITY_THRESHOLD) {
            matchFound = true;
            matchedAIInteractionId = copy.aiInteractionId;
            bestMatch = { similarity, timeDiff };
            break;
          }
        }
      }

      if (matchFound && matchedAIInteractionId) {
        await this.processPasteMatch(userId, data, matchedAIInteractionId, timestamp, bestMatch!);
      }

      const pasteResult = {
        matchFound,
        fromAI: matchFound && !!matchedAIInteractionId,
        lines: data.targetLines || this.countLines(data.content),
        contentLength: data.content.length
      };

      logger.info({
        operation: 'paste_event_processed',
        userId,
        attemptId: data.attemptId,
        ...pasteResult,
        bestMatch
      }, 'Paste event processed');

      if (data.targetLines && data.targetLines > 50) {
        logger.warn({
          operation: 'large_paste_detected',
          userId,
          attemptId: data.attemptId,
          targetLines: data.targetLines,
          contentLength: data.content.length,
          fromAI: pasteResult.fromAI
        }, 'Large code paste detected');
      }
      
    } catch (error) {
      logger.error({
        operation: 'handle_paste_event_failed',
        userId,
        attemptId: data.attemptId,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      }, 'Failed to handle paste event');
      
      throw error;
    }
  }

  private async processPasteMatch(
    userId: string,
    data: TrackCopyPasteDTO,
    aiInteractionId: string,
    timestamp: number,
    match: { similarity: number; timeDiff: number }
  ): Promise<void> {
    logger.info({
      operation: 'process_paste_match',
      userId,
      attemptId: data.attemptId,
      aiInteractionId,
      similarity: match.similarity,
      timeDiffMs: match.timeDiff,
      targetLines: data.targetLines
    }, 'Processing matched paste event');

    try {
      await this.prisma.aIInteraction.update({
        where: { id: aiInteractionId },
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
          aiInteractionId,
        },
      });

      logger.info({
        operation: 'ai_paste_match_recorded',
        userId,
        attemptId: data.attemptId,
        aiInteractionId,
        similarity: match.similarity,
        timeDiffMs: match.timeDiff,
        linesAdded: data.targetLines || this.countLines(data.content)
      }, 'AI paste match recorded successfully');

      if (match.timeDiff < 5000) { 
        logger.warn({
          operation: 'quick_ai_paste',
          userId,
          attemptId: data.attemptId,
          aiInteractionId,
          timeDiffMs: match.timeDiff,
          quickPaste: true
        }, 'Very quick AI copy-paste detected');
      }
      
    } catch (error) {
      logger.error({
        operation: 'process_paste_match_failed',
        userId,
        attemptId: data.attemptId,
        aiInteractionId,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      }, 'Failed to process paste match');
      
      throw error;
    }
  }

  async getCopyPasteStats(attemptId: string): Promise<{
    totalCopies: number;
    totalPastes: number;
    aiCopyRate: number;
    avgTimeToAction: number;
  }> {
    const startTime = Date.now();
    
    logger.debug({
      operation: 'get_copy_paste_stats',
      attemptId
    }, 'Getting copy/paste statistics');

    try {
      const events = await this.prisma.codeEvent.findMany({
        where: {
          attemptId,
          type: { in: ['PASTED'] },
        },
      });

      const aiEvents = events.filter(e => e.wasFromAI);

      const stats = {
        totalCopies: events.length,
        totalPastes: events.length,
        aiCopyRate: events.length > 0 ? (aiEvents.length / events.length) : 0,
        avgTimeToAction: 0, 
      };

      const processingTime = Date.now() - startTime;
      
      logger.info({
        operation: 'get_copy_paste_stats_success',
        attemptId,
        stats,
        totalEvents: events.length,
        aiEvents: aiEvents.length,
        processingTime
      }, 'Copy/paste statistics retrieved');

      if (stats.aiCopyRate > 0.8) {
        logger.warn({
          attemptId,
          aiCopyRate: stats.aiCopyRate,
          totalEvents: events.length,
          highAiDependency: true
        }, 'High AI copy-paste rate detected');
      }

      return stats;
      
    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      logger.error({
        operation: 'get_copy_paste_stats_failed',
        attemptId,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        processingTime
      }, 'Failed to get copy/paste statistics');
      
      throw error;
    }
  }

  private calculateSimilarity(text1: string, text2: string): number {
    logger.debug({
      operation: 'calculate_similarity',
      text1Length: text1.length,
      text2Length: text2.length
    }, 'Calculating text similarity');

    try {
      const longer = text1.length > text2.length ? text1 : text2;
      const shorter = text1.length > text2.length ? text2 : text1;
      
      if (longer.length === 0) {
        logger.debug({
          operation: 'similarity_empty_text',
          result: 1.0
        }, 'Empty text similarity');
        return 1.0;
      }
      
      const distance = this.levenshteinDistance(longer, shorter);
      const similarity = (longer.length - distance) / longer.length;
      
      logger.debug({
        operation: 'similarity_calculated',
        longerLength: longer.length,
        shorterLength: shorter.length,
        editDistance: distance,
        similarity: Math.round(similarity * 10000) / 10000
      }, 'Text similarity calculated');

      return similarity;
      
    } catch (error) {
      logger.error({
        operation: 'calculate_similarity_failed',
        text1Length: text1.length,
        text2Length: text2.length,
        error: error instanceof Error ? error.message : 'Unknown error'
      }, 'Failed to calculate text similarity');
      
      return 0;
    }
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
    const lines = text.split('\n').length;
    
    logger.debug({
      operation: 'count_lines',
      textLength: text.length,
      lines
    }, 'Counting lines in text');
    
    return lines;
  }

  private async updateDependencyMetrics(userId: string, attemptId: string): Promise<void> {
    const startTime = Date.now();
    
    logger.debug({
      operation: 'update_dependency_metrics',
      userId,
      attemptId
    }, 'Updating dependency metrics');

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

        const processingTime = Date.now() - startTime;

        logger.info({
          operation: 'dependency_metrics_updated',
          userId,
          attemptId,
          totalAILines,
          totalLines,
          dependencyIndex: Math.round(dependencyIndex * 100) / 100,
          copiedInteractions: interactions.length,
          processingTime
        }, 'Dependency metrics updated successfully');

        if (dependencyIndex > 80) {
          logger.warn({
            userId,
            attemptId,
            dependencyIndex,
            totalAILines,
            totalLines,
            highDependency: true
          }, 'High AI dependency detected in metrics update');
        }
      } else {
        logger.debug({
          operation: 'dependency_metrics_no_code',
          userId,
          attemptId,
          processingTime: Date.now() - startTime
        }, 'No final code available for dependency calculation');
      }
      
    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      logger.error({
        operation: 'update_dependency_metrics_failed',
        userId,
        attemptId,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        processingTime
      }, 'Failed to update dependency metrics');
    }
  }
}