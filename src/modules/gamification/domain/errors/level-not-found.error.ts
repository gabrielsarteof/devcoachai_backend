import { GamificationError } from './gamification.error';

export class LevelNotFoundError extends GamificationError {
  readonly code = 'GAMIFICATION_LEVEL_NOT_FOUND';
  readonly statusCode = 404;

  constructor(message: string = 'Level not found') {
    super(message);
  }
}