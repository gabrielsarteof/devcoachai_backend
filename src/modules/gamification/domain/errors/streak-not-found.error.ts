import { GamificationError } from './gamification.error';

export class StreakNotFoundError extends GamificationError {
  readonly code = 'GAMIFICATION_STREAK_NOT_FOUND';
  readonly statusCode = 404;

  constructor(message: string = 'Streak not found') {
    super(message);
  }
}