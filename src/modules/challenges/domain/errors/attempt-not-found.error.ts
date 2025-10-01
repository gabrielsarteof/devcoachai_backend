import { ChallengeError } from './challenge.error';

export class AttemptNotFoundError extends ChallengeError {
  readonly code = 'CHALLENGE_ATTEMPT_NOT_FOUND';
  readonly statusCode = 404;

  constructor(message: string = 'Attempt not found') {
    super(message);
  }
}
