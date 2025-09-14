import { BadgeService } from '../../domain/services/badge.service';
import { UnlockBadgeUseCase } from '../../application/use-cases/unlock-badge.use-case';
import { LeaderboardService } from '../../domain/services/leaderboard.service';
import { WebSocketServer } from '@/shared/infrastructure/websocket/socket.server';
import { logger } from '@/shared/infrastructure/monitoring/logger';

export interface XPAwardedEvent {
  userId: string;
  totalXP: number;
  xpAwarded: number;
  companyId?: string;
  teamId?: string;
  levelUp?: { newLevel: number };
}

export interface ChallengeCompletedEvent {
  userId: string;
  challengeId: string;
  companyId?: string;
  teamId?: string;
  metrics: {
    dependencyIndex: number;
    passRate: number;
    checklistScore: number;
  };
}

export interface StreakUpdatedEvent {
  userId: string;
  currentStreak: number;
  companyId?: string;
  teamId?: string;
}

export class BadgeEventListeners {
  constructor(
    private readonly badgeService: BadgeService,
    private readonly unlockBadgeUseCase: UnlockBadgeUseCase,
    private readonly leaderboardService: LeaderboardService,
    private readonly wsServer?: WebSocketServer
  ) {}

  async onXPAwarded(event: XPAwardedEvent): Promise<void> {
    logger.info({
      operation: 'badge_listener_xp_awarded',
      userId: event.userId,
      totalXP: event.totalXP,
      xpAwarded: event.xpAwarded,
      levelUp: event.levelUp
    }, 'Processing XP event for badges and leaderboards');

    try {
      await Promise.all([
        this.evaluateAndUnlockBadges(event.userId),
        this.leaderboardService.updateUserRankings({
          userId: event.userId,
          companyId: event.companyId,
          teamId: event.teamId,
          xpGained: event.xpAwarded,
        })
      ]);
    } catch (error) {
      logger.error({
        operation: 'badge_listener_xp_awarded_failed',
        userId: event.userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      }, 'Failed to process XP awarded event');
    }
  }

  async onChallengeCompleted(event: ChallengeCompletedEvent): Promise<void> {
    logger.info({
      operation: 'badge_listener_challenge_completed',
      userId: event.userId,
      challengeId: event.challengeId,
      metrics: event.metrics
    }, 'Processing challenge completion for badges and leaderboards');

    try {
      await this.evaluateAndUnlockBadges(event.userId);
    } catch (error) {
      logger.error({
        operation: 'badge_listener_challenge_completed_failed',
        userId: event.userId,
        challengeId: event.challengeId,
        error: error instanceof Error ? error.message : 'Unknown error'
      }, 'Failed to process challenge completed event');
    }
  }

  async onLevelUp(event: { userId: string; newLevel: number; totalXP: number; companyId?: string; teamId?: string }): Promise<void> {
    logger.info({
      operation: 'badge_listener_level_up',
      userId: event.userId,
      newLevel: event.newLevel
    }, 'Processing level up for badges');

    try {
      await this.evaluateAndUnlockBadges(event.userId);
    } catch (error) {
      logger.error({
        operation: 'badge_listener_level_up_failed',
        userId: event.userId,
        newLevel: event.newLevel,
        error: error instanceof Error ? error.message : 'Unknown error'
      }, 'Failed to process level up event');
    }
  }

  async onStreakUpdated(event: StreakUpdatedEvent): Promise<void> {
    logger.info({
      operation: 'badge_listener_streak_updated',
      userId: event.userId,
      currentStreak: event.currentStreak
    }, 'Processing streak update for badges and leaderboards');

    try {
      await Promise.all([
        this.evaluateAndUnlockBadges(event.userId),
        this.leaderboardService.updateUserRankings({
          userId: event.userId,
          companyId: event.companyId,
          teamId: event.teamId,
          currentStreak: event.currentStreak,
        })
      ]);
    } catch (error) {
      logger.error({
        operation: 'badge_listener_streak_updated_failed',
        userId: event.userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      }, 'Failed to process streak updated event');
    }
  }

  async onBadgeUnlocked(event: { userId: string; badgeId: string; companyId?: string; teamId?: string }): Promise<void> {
    logger.info({
      operation: 'badge_listener_badge_unlocked',
      userId: event.userId,
      badgeId: event.badgeId
    }, 'Processing badge unlock for leaderboards');

    try {
      await this.leaderboardService.updateUserRankings({
        userId: event.userId,
        companyId: event.companyId,
        teamId: event.teamId,
        badgeUnlocked: true,
      });
    } catch (error) {
      logger.error({
        operation: 'badge_listener_badge_unlocked_failed',
        userId: event.userId,
        badgeId: event.badgeId,
        error: error instanceof Error ? error.message : 'Unknown error'
      }, 'Failed to process badge unlocked event');
    }
  }

  private async evaluateAndUnlockBadges(userId: string): Promise<void> {
    try {
      const evaluation = await this.badgeService.evaluateBadges(userId);
      
      if (evaluation.unlocked.length === 0) {
        return;
      }

      const unlockedBadges = [];
      
      for (const badge of evaluation.unlocked) {
        try {
          const result = await this.unlockBadgeUseCase.execute({
            userId,
            badgeId: badge.getId()
          });
          
          unlockedBadges.push({
            id: badge.getId(),
            key: badge.getKey(),
            name: badge.getName(),
            rarity: badge.toJSON().rarity,
            xpAwarded: result.xpAwarded
          });
        } catch (error) {
          logger.warn({
            userId,
            badgeId: badge.getId(),
            error: error instanceof Error ? error.message : 'Unknown error'
          }, 'Failed to unlock individual badge');
        }
      }

      if (unlockedBadges.length > 0) {
        logger.info({
          userId,
          unlockedCount: unlockedBadges.length,
          badgeKeys: unlockedBadges.map(b => b.key)
        }, 'Badges unlocked from event');

        if (this.wsServer) {
          this.wsServer.emitToUser(userId, 'badges:batch-unlocked', {
            badges: unlockedBadges,
            count: unlockedBadges.length,
            timestamp: new Date()
          });
        }
      }
    } catch (error) {
      logger.error({
        operation: 'evaluate_and_unlock_badges_failed',
        userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      }, 'Failed to evaluate and unlock badges');
    }
  }
}