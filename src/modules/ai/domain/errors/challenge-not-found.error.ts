import { AIError } from './ai.error';

export class ChallengeNotFoundError extends AIError {
  readonly code = 'AI_CHALLENGE_NOT_FOUND';
  readonly statusCode = 404;

  constructor(challengeId?: string) {
    super(challengeId ? `Challenge not found: ${challengeId}` : 'Challenge not found');
  }
}
