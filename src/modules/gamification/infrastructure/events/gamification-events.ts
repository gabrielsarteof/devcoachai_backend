import { EventEmitter } from 'events';
import { logger } from '@/shared/infrastructure/monitoring/logger';
import { BadgeEventListeners, XPAwardedEvent, ChallengeCompletedEvent, StreakUpdatedEvent } from '../listeners/badge.listeners';
import { BadgeService } from '../../domain/services/badge.service';
import { UnlockBadgeUseCase } from '../../application/use-cases/unlock-badge.use-case';
import { LeaderboardService } from '../../domain/services/leaderboard.service';
import { WebSocketServer } from '@/shared/infrastructure/websocket/socket.server';

class GamificationEventEmitter extends EventEmitter {
  private static instance: GamificationEventEmitter;
  private badgeListeners?: BadgeEventListeners;

  private constructor() {
    super();
    this.setMaxListeners(20);
  }

  static getInstance(): GamificationEventEmitter {
    if (!this.instance) {
      this.instance = new GamificationEventEmitter();
    }
    return this.instance;
  }

  initialize(
    badgeService: BadgeService, 
    unlockBadgeUseCase: UnlockBadgeUseCase,
    leaderboardService: LeaderboardService,
    wsServer?: WebSocketServer
  ): void {
    this.badgeListeners = new BadgeEventListeners(
      badgeService,
      unlockBadgeUseCase,
      leaderboardService,
      wsServer
    );
    
    this.on('xp.awarded', async (event: XPAwardedEvent) => {
      logger.info({
        operation: 'event_xp_awarded',
        userId: event.userId,
        totalXP: event.totalXP
      }, 'XP awarded event received');
      
      await this.badgeListeners?.onXPAwarded(event);
    });

    this.on('level.up', async (event: { userId: string; newLevel: number; totalXP: number; companyId?: string; teamId?: string }) => {
      logger.info({
        operation: 'event_level_up',
        userId: event.userId,
        newLevel: event.newLevel
      }, 'Level up event received');
      
      await this.badgeListeners?.onLevelUp(event);
    });

    this.on('challenge.completed', async (event: ChallengeCompletedEvent) => {
      logger.info({
        operation: 'event_challenge_completed',
        userId: event.userId,
        challengeId: event.challengeId
      }, 'Challenge completed event received');
      
      await this.badgeListeners?.onChallengeCompleted(event);
    });

    this.on('streak.updated', async (event: StreakUpdatedEvent) => {
      logger.info({
        operation: 'event_streak_updated',
        userId: event.userId,
        currentStreak: event.currentStreak
      }, 'Streak updated event received');
      
      await this.badgeListeners?.onStreakUpdated(event);
    });

    this.on('badge.unlocked', async (event: { userId: string; badgeId: string; companyId?: string; teamId?: string }) => {
      logger.info({
        operation: 'event_badge_unlocked',
        userId: event.userId,
        badgeId: event.badgeId
      }, 'Badge unlocked event received');
      
      await this.badgeListeners?.onBadgeUnlocked(event);
    });

    logger.info('Gamification event emitter initialized');
  }

  emitXPAwarded(event: XPAwardedEvent): void {
    this.emit('xp.awarded', event);
  }

  emitLevelUp(event: { userId: string; newLevel: number; totalXP: number; companyId?: string; teamId?: string }): void {
    this.emit('level.up', event);
  }

  emitChallengeCompleted(event: ChallengeCompletedEvent): void {
    this.emit('challenge.completed', event);
  }

  emitStreakUpdated(event: StreakUpdatedEvent): void {
    this.emit('streak.updated', event);
  }

  emitBadgeUnlocked(event: { userId: string; badgeId: string; companyId?: string; teamId?: string }): void {
    this.emit('badge.unlocked', event);
  }
}

export const gamificationEvents = GamificationEventEmitter.getInstance();