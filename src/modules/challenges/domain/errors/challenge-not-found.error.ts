import { ChallengeError } from './challenge.error';

export class ChallengeNotFoundError extends ChallengeError {
  readonly code = 'CHALLENGE_NOT_FOUND';
  readonly statusCode = 404;

  constructor(message: string = 'Challenge not found') {
    super(message);
  }
}
