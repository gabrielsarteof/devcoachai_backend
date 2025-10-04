import { GamificationError } from './gamification.error';

export class BadgeNotFoundError extends GamificationError {
  readonly code = 'GAMIFICATION_BADGE_NOT_FOUND';
  readonly statusCode = 404;

  constructor(message: string = 'Badge not found') {
    super(message);
  }
}