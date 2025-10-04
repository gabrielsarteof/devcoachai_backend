import { GamificationError } from './gamification.error';

export class LeaderboardNotAvailableError extends GamificationError {
  readonly code = 'GAMIFICATION_LEADERBOARD_NOT_AVAILABLE';
  readonly statusCode = 503;

  constructor(message: string = 'Leaderboard service not available') {
    super(message);
  }
}