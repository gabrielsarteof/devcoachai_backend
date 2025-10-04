import { GamificationError } from './gamification.error';

export class InsufficientXPError extends GamificationError {
  readonly code = 'GAMIFICATION_INSUFFICIENT_XP';
  readonly statusCode = 400;

  constructor(message: string = 'Insufficient XP') {
    super(message);
  }
}