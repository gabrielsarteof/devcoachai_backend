import { GamificationError } from './gamification.error';

export class InvalidStreakOperationError extends GamificationError {
  readonly code = 'GAMIFICATION_INVALID_STREAK_OPERATION';
  readonly statusCode = 400;

  constructor(message: string = 'Invalid streak operation') {
    super(message);
  }
}