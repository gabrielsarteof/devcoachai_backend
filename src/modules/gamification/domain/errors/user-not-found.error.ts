import { GamificationError } from './gamification.error';

export class UserNotFoundError extends GamificationError {
  readonly code = 'GAMIFICATION_USER_NOT_FOUND';
  readonly statusCode = 404;

  constructor(message: string = 'User not found') {
    super(message);
  }
}