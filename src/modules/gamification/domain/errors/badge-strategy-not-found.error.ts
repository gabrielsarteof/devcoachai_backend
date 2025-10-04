import { GamificationError } from './gamification.error';

export class BadgeStrategyNotFoundError extends GamificationError {
  readonly code = 'GAMIFICATION_BADGE_STRATEGY_NOT_FOUND';
  readonly statusCode = 500;

  constructor(message: string = 'Badge evaluation strategy not found') {
    super(message);
  }
}