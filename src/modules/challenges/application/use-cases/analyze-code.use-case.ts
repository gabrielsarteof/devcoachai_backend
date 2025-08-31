import { IChallengeRepository } from '../../domain/repositories/challenge.repository.interface';
import { TrapDetectorService } from '../../domain/services/trap-detector.service';
import { ChallengeEntity } from '../../domain/entities/challenge.entity';
import { PrismaClient } from '@prisma/client';
import { messages } from '@/shared/constants/messages';
import { logger } from '@/shared/infrastructure/monitoring/logger';
import { z } from 'zod';

export const AnalyzeCodeSchema = z.object({
  challengeId: z.string().cuid(),
  attemptId: z.string().cuid(),
  code: z.string(),
  checkpointTime: z.number().int().min(0),
});

export type AnalyzeCodeDTO = z.infer<typeof AnalyzeCodeSchema>;

export class AnalyzeCodeUseCase {
  constructor(
    private readonly repository: IChallengeRepository,
    private readonly trapDetector: TrapDetectorService,
    private readonly prisma: PrismaClient
  ) {}

  async execute(userId: string, data: AnalyzeCodeDTO) {
    try {
      const attempt = await this.prisma.challengeAttempt.findUnique({
        where: { id: data.attemptId },
      });

      if (!attempt || attempt.userId !== userId) {
        throw new Error('Invalid attempt');
      }

      const challenge = await this.repository.findById(data.challengeId);
      if (!challenge) {
        throw new Error(messages.challenge.notFound);
      }

      const entity = ChallengeEntity.fromPrisma(challenge);
      const traps = entity.getTraps();

      const trapResults = this.trapDetector.detectTraps(data.code, traps);
      const detectedTraps = trapResults.filter(t => t.detected);

      const quality = this.trapDetector.analyzeCodeQuality(data.code);

      for (const trap of detectedTraps) {
        const existing = await this.prisma.trapDetection.findFirst({
          where: {
            attemptId: data.attemptId,
            trapId: trap.trapId,
          },
        });

        if (!existing) {
          await this.prisma.trapDetection.create({
            data: {
              attemptId: data.attemptId,
              trapId: trap.trapId,
              reactionTime: data.checkpointTime,
              fellIntoTrap: true,
              fixedAfterWarning: false,
              learnedFrom: false,
            },
          });

          logger.warn({ 
            userId, 
            attemptId: data.attemptId, 
            trapId: trap.trapId 
          }, 'Trap detected in code');
        }
      }

      const snapshots = attempt.codeSnapshots as any[] || [];
      snapshots.push({
        timestamp: new Date(),
        code: data.code,
        sessionTime: data.checkpointTime,
        trapsDetected: detectedTraps.length,
        qualityScore: quality.securityScore,
      });

      await this.repository.updateAttempt(data.attemptId, {
        codeSnapshots: snapshots,
      });

      const feedback = this.generateFeedback(detectedTraps, quality);

      return {
        trapsDetected: detectedTraps,
        codeQuality: quality,
        feedback,
        warnings: this.generateWarnings(detectedTraps),
      };
    } catch (error) {
      logger.error({ error, data }, 'Code analysis failed');
      throw error;
    }
  }

  private generateFeedback(traps: any[], quality: any): string[] {
    const feedback: string[] = [];

    if (traps.length === 0 && quality.securityScore > 80) {
      feedback.push('Code looks good! No major issues detected.');
    }

    if (traps.length > 0) {
      feedback.push(`Found ${traps.length} potential issue(s) in your code.`);
    }

    if (!quality.hasErrorHandling) {
      feedback.push('Consider adding error handling to make your code more robust.');
    }

    if (!quality.hasInputValidation) {
      feedback.push('Input validation is missing. Always validate user inputs.');
    }

    if (quality.complexityScore > 20) {
      feedback.push('Code complexity is high. Consider refactoring into smaller functions.');
    }

    if (quality.securityScore < 50) {
      feedback.push('Several security concerns detected. Review security best practices.');
    }

    return feedback;
  }

  private generateWarnings(traps: any[]): string[] {
    const criticalTraps = traps.filter(t => t.severity === 'critical');
    const highTraps = traps.filter(t => t.severity === 'high');
    
    const warnings: string[] = [];
    
    if (criticalTraps.length > 0) {
      warnings.push('⚠️ CRITICAL: Security vulnerabilities detected!');
    }
    
    if (highTraps.length > 0) {
      warnings.push('⚠️ HIGH: Important issues that should be fixed.');
    }
    
    return warnings;
  }
}