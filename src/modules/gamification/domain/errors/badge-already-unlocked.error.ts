import { GamificationError } from './gamification.error';

export class BadgeAlreadyUnlockedError extends GamificationError {
  readonly code = 'GAMIFICATION_BADGE_ALREADY_UNLOCKED';
  readonly statusCode = 409;

  constructor(message: string = 'Badge already unlocked') {
    super(message);
  }
}